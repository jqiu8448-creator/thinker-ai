// 前端对话引擎（移植自 server/lib/thinker.js + router.js 的相关生成逻辑）
// 纯函数 + llm.generateText，无后端依赖。数据来自打包好的 thinkers.json。
import thinkersData from '@/data/thinkers.json';
import { generateText, generateTextStream, extractJson } from './llm';
import { MODES, MODE_PROMPTS, UNIVERSAL_NAMES, AI_MODEL } from './engine-modes';

const ALL_THINKERS = thinkersData.thinkers || [];
const CATEGORIES = thinkersData.categories || [];

function get_thinker_skill(name) {
  const t = ALL_THINKERS.find((x) => x.name === (name || '').trim());
  return t ? t.skill || '' : '';
}
function get_thinker_detail(name) {
  const t = ALL_THINKERS.find((x) => x.name === (name || '').trim());
  if (!t) return null;
  // 兼容旧字段名：skill 正文同时以 detail 暴露
  return Object.assign({}, t, { detail: t.skill || '' });
}
function list_thinkers() {
  return ALL_THINKERS;
}
function list_categories() {
  return CATEGORIES.map((c) => c.name);
}
function load_topic_table() {
  return CATEGORIES;
}
function build_thinker_list_brief() {
  return CATEGORIES.map((c) => `【${c.name}】${c.thinkers.map((t) => t.name).join('、')}`).join('\n');
}

// ============ 单人对话 ============
// onToken：传入时启用流式，逐段回调增量文本；不传则一次性返回完整文本。
export async function thinker_route(message, thinker_name, mode, history = [], onToken = null, signal = null) {
  const skill_content = get_thinker_skill(thinker_name);
  if (!skill_content) {
    return `抱歉，暂时找不到「${thinker_name}」的人格档案。请确认该思想家已收录。`;
  }
  const modeKey = MODES[mode] ? mode : 'duixi';
  const modeInfo = MODES[modeKey];

  const system_prompt = `你是一位深度对话引导者。现在你要完全代入「${thinker_name}」的第一人称视角进行对话。

## 你的人格档案

${skill_content}

## 对话规则

1. **完全代入角色**：你是${thinker_name}，不是"扮演${thinker_name}的AI"
2. **第一人称叙述**：用"我"说话，引用自己的真实经历和思想
3. **保持角色一致性**：不能跳出角色
4. **不推销不商业化**：纯思想交流
5. **围绕主题**：所有对话围绕用户最初提出的问题展开，不支持闲聊。如果用户试图闲聊，温和地将话题引回最初的问题

## 语气与态度（长辈式陪伴 · 咨询式引导）

你要以一位阅历深厚、和蔼可亲的长辈姿态与用户交谈，同时带着温和心理咨询师般的陪伴感：
- 先接住对方此刻的情绪与处境，再慢慢引导；绝不居高临下，绝不说教、不训诫、不摆大道理
- 多用共情与开放式提问，帮对方自己看清困惑，而不是替他下定论或给标准答案
- 语气温柔、从容、有耐心；可化用自己的真实经历与体悟，但落点始终在理解、陪伴与接纳
- 让每一段话都带着温度，使对方感到被看见、被懂得，离开时心头一暖、有所触动与启发
- 长短随情境，但句句走心；避免空洞口号，避免说教口吻

${MODE_PROMPTS[modeKey](thinker_name)}
`;

  const messages = [{ role: 'system', content: system_prompt }];
  if (history && history.length) {
    for (const msg of history.slice(-8)) {
      messages.push({
        role: msg.role === 'assistant' ? 'assistant' : 'user',
        content: msg.content,
      });
    }
  }
  messages.push({ role: 'user', content: message });

  try {
    if (onToken) {
      return await generateTextStream({
        model: AI_MODEL,
        messages,
        temperature: modeInfo.temperature,
        topP: 0.9,
        maxTokens: modeInfo.maxTokens,
        onToken,
        signal,
      });
    }
    return await generateText({
      model: AI_MODEL,
      messages,
      temperature: modeInfo.temperature,
      topP: 0.9,
      maxTokens: modeInfo.maxTokens,
      signal,
    });
  } catch (e) {
    console.error('[thinker_route] 生成失败:', e);
    throw e;
  }
}

// ============ 推荐思想家 ============
export async function recommend_thinkers(topic) {
  const all_thinkers = list_thinkers();
  try {
    const cat_brief = CATEGORIES.map((cat) => {
      const names = cat.thinkers
        .map((t) => `${t.name}（${t.summary || '无简介'}）`)
        .join('、');
      return `【${cat.name}】${names}`;
    });

    const prompt = `你是一位精准的思想匹配师。用户带着一个具体的问题或困惑来寻求对话，你需要从${all_thinkers.length}位思想家中，挑选出最适合「此刻与用户对话」的 4-5 位思想家。

用户的问题：${topic}

思想家名单（按话题分类）：
${cat_brief.join('\n')}

要求：
1. 仔细理解用户问题背后的真实需求和情感
2. 挑选 4-5 位最匹配的思想家
3. 每位思想家附一句简述（30-60字），需包含：
   - 为什么这位思想家适合回应这个问题
   - 他会以什么角度或方式来解读用户的困惑
4. 语气温暖自然，像一位懂你的朋友在引荐

严格按 JSON 数组格式输出，每个元素为 {"name": "思想家名", "reason": "简述"}。
只输出 JSON，不要其他内容。`;

    const text = await generateText({
      model: AI_MODEL,
      messages: [{ role: 'user', content: prompt }],
      temperature: 0.7,
      topP: 0.9,
    });

    console.log('[recommend_thinkers] LLM 原始返回:', text?.slice(0, 300));

    // 提取 JSON 数组（多重容错）
    let jsonText = text || '';

    // 1. 去除代码围栏
    if (jsonText.includes('```')) {
      const parts = jsonText.split('```');
      if (parts.length >= 2) {
        jsonText = parts[1];
        if (jsonText.startsWith('json')) jsonText = jsonText.slice(4);
        jsonText = jsonText.trim();
      }
    }

    // 2. 截取第一个 [ 到最后一个 ]
    const s = jsonText.indexOf('[');
    const e = jsonText.lastIndexOf(']');
    if (s >= 0 && e > s) jsonText = jsonText.slice(s, e + 1);

    // 3. 清理尾逗号
    jsonText = jsonText.replace(/,(\s*[}\]])/g, '$1');

    // 4. 尝试解析
    let items;
    try {
      items = JSON.parse(jsonText);
    } catch (parseErr) {
      console.error('[recommend_thinkers] JSON 解析失败:', parseErr, '原始文本:', jsonText.slice(0, 200));
      throw new Error('LLM 返回的 JSON 无法解析');
    }

    console.log('[recommend_thinkers] 解析到的思想家:', items);
    const result = [];
    const seen = new Set();
    for (const item of items) {
      const name = (item.name || '').trim();
      const reason = (item.reason || '').trim();
      if (name && !seen.has(name)) {
        // 校验：只接受已收录的思想家
        const matched = all_thinkers.find((t) => t.name === name);
        if (!matched) {
          console.warn('[recommend_thinkers] LLM 返回了未收录的思想家:', name);
          continue;
        }
        // 如果 LLM 没返回 reason 或太短，根据 summary 生成
        const finalReason = reason.length > 10
          ? reason
          : `${matched.name}擅长${matched.summary}，适合回应你此刻的困惑`;
        result.push({ name, reason: finalReason, summary: matched.summary || '' });
        seen.add(name);
      }
    }
    console.log('[recommend_thinkers] 最终结果:', result);
    if (result.length) return result;
  } catch (e) {
    console.error('[recommend] LLM匹配失败，降级到关键词:', e);
  }
  return _fallback_keyword_match(topic, all_thinkers, UNIVERSAL_NAMES);
}

function _fallback_keyword_match(topic, all_thinkers, universal_names) {
  const topic_lower = (topic || '').toLowerCase();
  const keyword_map = {
    爱情: '爱情·感情', 恋爱: '爱情·感情', 感情: '爱情·感情', 婚姻: '爱情·感情',
    失恋: '爱情·感情', 分手: '爱情·感情', 爱: '爱情·感情', 孤独: '爱情·感情',
    人生: '人生哲学·存在意义', 意义: '人生哲学·存在意义', 活着: '人生哲学·存在意义', 自由: '人生哲学·存在意义',
    挫折: '挫折·逆境', 困难: '挫折·逆境', 逆境: '挫折·逆境', 失败: '挫折·逆境', 痛苦: '挫折·逆境', 低谷: '挫折·逆境',
    职场: '职场·升职·创业', 工作: '职场·升职·创业', 创业: '职场·升职·创业', 事业: '职场·升职·创业',
    人际: '人际关系·为人处世', 社交: '人际关系·为人处世', 沟通: '人际关系·为人处世',
    朋友: '友情', 友情: '友情', 知己: '友情',
    家庭: '家庭·教育', 父母: '家庭·教育', 孩子: '家庭·教育', 教育: '学业·教育', 学习: '学业·教育',
    社会: '社会·时代', 时代: '社会·时代',
    死亡: '生死·信仰', 信仰: '生死·信仰',
    心理: '心理·情绪', 焦虑: '心理·情绪', 抑郁: '心理·情绪', 压力: '心理·情绪', 内耗: '心理·情绪',
  };

  // 根据话题类别生成个性化推荐理由
  const reasonTemplates = {
    '爱情·感情': (t) => `你在情感上的困惑，${t.name}会从${t.summary}的角度帮你看见内心的真实渴望`,
    '人生哲学·存在意义': (t) => `关于人生意义的追问，${t.name}会以${t.summary}的智慧为你照亮方向`,
    '挫折·逆境': (t) => `面对挫折与低谷，${t.name}的${t.summary}能给你走出困境的力量`,
    '职场·升职·创业': (t) => `职场上的进退抉择，${t.name}会从${t.summary}的角度帮你找到平衡`,
    '人际关系·为人处世': (t) => `人际相处的难题，${t.name}会以${t.summary}的方式教你从容应对`,
    '友情': (t) => `关于友情的困惑，${t.name}会从${t.summary}的角度帮你理解知己的意义`,
    '家庭·教育': (t) => `家庭与教育的问题，${t.name}会以${t.summary}的视角帮你找到温和的解法`,
    '学业·教育': (t) => `学习与成长中的困惑，${t.name}的${t.summary}能给你启发`,
    '社会·时代': (t) => `面对时代与社会的变迁，${t.name}会以${t.summary}的眼光帮你看清位置`,
    '生死·信仰': (t) => `关于生死与信仰的追问，${t.name}会从${t.summary}的角度给你安顿内心的力量`,
    '心理·情绪': (t) => `心理上的困扰与情绪，${t.name}会以${t.summary}的视角帮你疏解郁结`,
  };

  const matched = [];
  const matched_cats = new Set();
  for (const keyword in keyword_map) {
    if (topic_lower.includes(keyword)) {
      const cat_name = keyword_map[keyword];
      for (const cat of CATEGORIES) {
        if (cat.name === cat_name && !matched_cats.has(cat.name)) {
          matched.push(...cat.thinkers);
          matched_cats.add(cat.name);
        }
      }
    }
  }
  const result = [];
  const seen = new Set();
  for (const t of matched) {
    if (!seen.has(t.name)) {
      seen.add(t.name);
      // 根据匹配到的类别生成个性化理由
      const catName = [...matched_cats][0];
      const genReason = catName ? reasonTemplates[catName] : null;
      const reason = genReason ? genReason(t) : `${t.name}擅长${t.summary}，适合回应你此刻的困惑`;
      result.push({ name: t.name, summary: t.summary, reason });
    }
    if (result.length >= 6) break;
  }
  if (result.length) return result;
  const fallback = list_thinkers().filter((t) => universal_names.includes(t.name)).slice(0, 4);
  return fallback.length
    ? fallback.map((t) => ({ ...t, reason: `${t.name}思想宏阔，擅长从${t.summary}的角度看待你此刻的问题` }))
    : universal_names.slice(0, 4).map((n) => ({ name: n, reason: '思想宏阔，适合与你深谈人生诸般问题' }));
}

// ============ 多思想家阵容 ============
async function _build_panel(lead, topic, maxSize) {
  const panel = [];
  if (lead) panel.push(lead);
  try {
    const recs = await recommend_thinkers(topic);
    for (const r of recs || []) {
      const name = r && r.name;
      if (name && name !== lead && !panel.includes(name)) panel.push(name);
      if (panel.length >= maxSize) break;
    }
  } catch (e) {
    console.error('[panel] 推荐补足失败:', e);
  }
  if (panel.length < maxSize) {
    for (const n of UNIVERSAL_NAMES) {
      if (!panel.includes(n)) panel.push(n);
      if (panel.length >= maxSize) break;
    }
  }
  return panel;
}

async function _oude_route(lead, topic, message, panel, history = []) {
  const members = panel && panel.length ? panel : await _build_panel(lead, topic, 6);
  const replies = [];
  for (const name of members) {
    // 后续对话用 message，首次用 topic
    const prompt = message || topic;
    const content = await thinker_route(prompt, name, 'oude', history);
    replies.push({ thinker: name, content, round: 1 });
  }
  return { replies, panel: members };
}

async function _huiyin_route(lead, topic, message, panel, history = []) {
  const members = panel && panel.length ? panel : await _build_panel(lead, topic, 4);
  const rounds = MODES.huiyin.rounds;
  const replies = [];
  const transcript = [];
  for (let r = 0; r < rounds.length; r++) {
    const limit = rounds[r];
    for (const name of members) {
      const recordText = transcript.length
        ? '\n\n【此前发言记录】\n' + transcript.map((t) => `· ${t.thinker}：${t.content}`).join('\n')
        : '';
      const userMsg =
        `话题：${topic}${message ? `\n用户补充：${message}` : ''}${recordText}\n\n` +
        `请作为${name}，发表你的第${r + 1}轮观点，控制在${limit}字以内。` +
        `可针对他人观点进行反驳或补充，保持辩论张力，但不失风度。`;
      const content = await thinker_route(userMsg, name, 'huiyin', history);
      replies.push({ thinker: name, content, round: r + 1 });
      transcript.push({ thinker: name, content });
    }
  }
  return { replies, panel: members };
}

export async function multi_thinker_route({ lead, mode, topic, message, history, panel, signal }) {
  const subject = (topic || message || '').trim();
  if (mode === 'oude') return await _oude_route(lead, subject, message, panel, history);
  if (mode === 'huiyin') return await _huiyin_route(lead, subject, message, panel, history);
  const reply = await thinker_route(message || topic, lead, mode, history || [], null, signal);
  return { replies: [{ thinker: lead, content: reply, round: 1 }], panel: lead ? [lead] : [] };
}

export async function suggest_panel(topic, mode) {
  const subject = (topic || '').trim();
  if (!subject) return { lead: '', panel: [] };
  const maxSize = mode === 'huiyin' ? 4 : 6;
  const minSize = mode === 'huiyin' ? 4 : 2;

  let recs = [];
  try {
    recs = await recommend_thinkers(subject);
  } catch (e) {
    console.error('[suggest_panel] 推荐失败:', e);
  }
  if (!recs || !recs.length) {
    recs = UNIVERSAL_NAMES.slice(0, minSize).map((n) => ({ name: n, reason: '擅长从多角度思考人生问题', summary: '' }));
  }
  const panel = recs.slice(0, maxSize).map((r) => ({
    name: r.name,
    reason: r.reason || '适合聊聊这个话题',
    summary: r.summary || '',
  }));
  if (panel.length < minSize) {
    for (const n of UNIVERSAL_NAMES) {
      if (!panel.find((p) => p.name === n)) {
        panel.push({ name: n, reason: '擅长从多角度思辨', summary: '' });
      }
      if (panel.length >= minSize) break;
    }
  }
  return { lead: panel.length ? panel[0].name : '', panel };
}

export { list_thinkers, list_categories, load_topic_table, build_thinker_list_brief, get_thinker_detail };
