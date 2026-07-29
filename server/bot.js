const { sendText } = require('./feishu');
const { getSession, setSession, deleteSession } = require('./session-store');
const engine = require('./engine.cjs');

const STATES = {
  IDLE: 'idle',
  WAITING_MODE: 'waiting_mode',
  WAITING_THINKER: 'waiting_thinker',
  IN_CONVERSATION: 'in_conversation',
  WAITING_PANEL_CONFIRM: 'waiting_panel_confirm',
};

// 并发控制：同一用户串行处理，避免历史写入错乱
const userLocks = new Map();

function newSession() {
  return {
    state: STATES.IDLE,
    mode: null,
    thinker: null,
    panel: [],
    topic: '',
    history: [],
    multiReplies: [],
    createdAt: Date.now(),
    lastActiveAt: Date.now(),
  };
}

function touch(session) {
  session.lastActiveAt = Date.now();
  return session;
}

const MODE_MENU = `请选择对话模式（回复数字）：

1️⃣ 对席 — 与一位思想家一对一深度对话
2️⃣ 独白 — 听一位思想家就主题展开长文独白
3️⃣ 偶得 — 多位思想家从不同视角各抒己见
4️⃣ 会饮 — 多位思想家多轮辩论交锋`;

const THINKER_LIST = engine.listThinkers();

async function handleMessage(userId, text) {
  // 并发控制：串行处理同一用户的连续消息
  const prev = userLocks.get(userId) || Promise.resolve();
  const next = prev
    .catch(() => {})
    .then(() => _handleMessage(userId, text))
    .finally(() => {
      if (userLocks.get(userId) === next) userLocks.delete(userId);
    });
  userLocks.set(userId, next);
  return next;
}

async function _handleMessage(userId, text) {
  let session = getSession(userId);

  if (!session || session.state === STATES.IDLE) {
    if (!session) session = newSession();

    if (text.includes('思想家') && (text.includes('打开') || text.includes('启动') || text.includes('开始') || text.includes('你好'))) {
      session.state = STATES.WAITING_MODE;
      setSession(userId, touch(session));
      await sendText(userId, '墨香入室，与古贤共语。\n\n' + MODE_MENU + '\n\n回复「退出」可随时离开。');
      return;
    }

    await sendText(userId, '发送「打开思想家后台」即可开始对话。');
    return;
  }

  if (text === '退出' || text === '离开' || text === '结束') {
    deleteSession(userId);
    await sendText(userId, '墨尽灯暗，再会有期。 🍃');
    return;
  }

  session = touch(session);

  switch (session.state) {
    case STATES.WAITING_MODE:
      await handleModeSelect(userId, session, text);
      break;
    case STATES.WAITING_THINKER:
      await handleThinkerSelect(userId, session, text);
      break;
    case STATES.WAITING_PANEL_CONFIRM:
      await handlePanelConfirm(userId, session, text);
      break;
    case STATES.IN_CONVERSATION:
      await handleConversation(userId, session, text);
      break;
    default:
      await sendText(userId, '若要开始，请发送「打开思想家后台」。');
  }
}

async function handleModeSelect(userId, session, text) {
  const modeMap = {
    '1': 'duixi', '对席': 'duixi', '对席模式': 'duixi',
    '2': 'dubai', '独白': 'dubai', '独白模式': 'dubai',
    '3': 'oude', '偶得': 'oude', '偶得模式': 'oude',
    '4': 'huiyin', '会饮': 'huiyin', '会饮模式': 'huiyin',
  };
  const modeKey = modeMap[text.trim()];
  if (!modeKey) {
    await sendText(userId, '请回复数字 1-4 选择模式，或回复「退出」离开。');
    return;
  }
  session.mode = modeKey;
  const modeNames = { duixi: '对席', dubai: '独白', oude: '偶得', huiyin: '会饮' };

  if (modeKey === 'duixi' || modeKey === 'dubai') {
    session.state = STATES.WAITING_THINKER;
    let rec = [];
    try {
      rec = await engine.recommendThinkers('人生困惑');
    } catch (e) {
      console.error('[bot] recommendThinkers 失败:', e.message);
      rec = THINKER_LIST.slice(0, 8).map((t) => ({ name: t.name, reason: t.category || '思想家' }));
    }
    // 存入 session，供用户数字选择时用
    session.recommendedThinkers = rec.slice(0, 5);
    setSession(userId, session);
    const recList = session.recommendedThinkers.map((t, i) => `${i + 1}. ${t.name} — ${t.reason}`).join('\n');
    await sendText(userId,
      `已选「${modeNames[modeKey]}」模式。\n\n` +
      `请选择一位思想家（回复数字或姓名）：\n\n${recList}\n\n` +
      `也可以直接输入其他思想家姓名。`
    );
  } else {
    session.state = STATES.WAITING_PANEL_CONFIRM;
    setSession(userId, session);
    await sendText(userId,
      `已选「${modeNames[modeKey]}」模式。\n\n` +
      `请告诉我你的话题或困惑，我来为你引荐几位合适的思想家。`
    );
  }
}

async function handleThinkerSelect(userId, session, text) {
  const trimmed = text.trim();
  let thinkerName = null;

  if (/^\d+$/.test(trimmed)) {
    const idx = parseInt(trimmed) - 1;
    const rec = session.recommendedThinkers && session.recommendedThinkers.length
      ? session.recommendedThinkers
      : THINKER_LIST.slice(0, 5);
    if (idx >= 0 && idx < rec.length) thinkerName = rec[idx].name;
  } else {
    const found = THINKER_LIST.find((t) => t.name === trimmed);
    if (found) thinkerName = trimmed;
  }

  if (!thinkerName) {
    await sendText(userId, '未找到这位思想家，请重新输入姓名或数字。');
    return;
  }

  session.thinker = thinkerName;
  session.state = STATES.IN_CONVERSATION;
  session.history = [];
  session.recommendedThinkers = null;
  setSession(userId, session);

  await sendText(userId, `${thinkerName} 已入座。\n\n请说出你的话题或困惑，开始对谈。`);
}

async function handlePanelConfirm(userId, session, text) {
  const topic = text.trim();
  session.topic = topic;

  await sendText(userId, '正在为你引荐思想家，请稍候…');

  let panel;
  try {
    panel = await engine.suggestPanel(topic, session.mode);
  } catch (e) {
    console.error('[bot] suggestPanel 失败:', e.message);
    await sendText(userId, '引荐失败，思想家们此刻忙于清谈，请稍后重试。');
    // 回退到等待主题输入状态
    session.state = STATES.WAITING_PANEL_CONFIRM;
    setSession(userId, session);
    return;
  }
  if (!panel || !panel.length) {
    await sendText(userId, '未能为该话题匹配到合适的思想家，请换一个话题再试。');
    return;
  }
  session.panel = panel;
  session.state = STATES.IN_CONVERSATION;
  session.history = [];
  session.multiReplies = [];
  setSession(userId, session);

  const panelList = panel.map((n, i) => `${i + 1}. ${n}`).join('\n');
  await sendText(userId,
    `今晚的客人已到齐：\n\n${panelList}\n\n` +
    `话题：${topic}\n\n` +
    `请说你的看法，或直接发送「开始」听他们发言。`
  );
}

async function handleConversation(userId, session, text) {
  const mode = session.mode;

  if (mode === 'duixi' || mode === 'dubai') {
    session.history.push({ role: 'user', content: text });
    setSession(userId, session);

    await sendText(userId, `${session.thinker} 正在思考…`);

    let reply;
    try {
      reply = await engine.thinkerRoute(
        text,
        session.thinker,
        mode,
        session.history.slice(0, -1),
      );
    } catch (e) {
      console.error('[bot] thinkerRoute 失败:', e.message);
      // 回滚刚加入的 user 消息
      session.history.pop();
      setSession(userId, session);
      await sendText(userId, `${session.thinker} 正在闭关，请稍后再问。`);
      return;
    }

    session.history.push({ role: 'assistant', content: reply });
    setSession(userId, session);

    await sendText(userId, `【${session.thinker}】\n\n${reply}`);
  } else {
    session.history.push({ role: 'user', content: text });
    setSession(userId, session);

    await sendText(userId, '思想家们正在酝酿观点…');

    let replies = [];
    try {
      const result = await engine.multiThinkerRoute({
        lead: session.panel[0],
        mode: session.mode,
        topic: session.topic,
        message: text,
        history: session.history.slice(0, -1),
        panel: session.panel,
      });
      replies = result.replies || [];
    } catch (e) {
      console.error('[bot] multiThinkerRoute 失败:', e.message);
      session.history.pop();
      setSession(userId, session);
      await sendText(userId, '思想家们今日清谈已毕，请改日再来。');
      return;
    }

    session.multiReplies = (session.multiReplies || []).concat(replies);
    session.history.push({ role: 'assistant', content: replies.map(r => `${r.thinker}：${r.content}`).join('\n\n') });
    setSession(userId, session);

    for (const r of replies) {
      await sendText(userId, `【${r.thinker}】\n\n${r.content}`);
      await sleep(800);
    }
  }
}

function sleep(ms) {
  return new Promise((r) => setTimeout(r, ms));
}

module.exports = { handleMessage, STATES };
