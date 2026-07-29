import { useState, useEffect, useRef, useCallback } from 'react';
import { View, Text, Button, Textarea } from '@tarojs/components';
import Taro, { useRouter, useDidShow, useDidHide } from '@tarojs/taro';
import { callCloud } from '@/utils/cloud';
import { getGlobal, applyFontScaleToDom } from '@/utils/global';
import { ensureApiConfig } from '@/utils/api-config';
import { isHosted } from '@/utils/hosted';
import { modeName, fmtTime } from '@/utils/modes';
import Tabbar from '@/components/tabbar';
import './index.scss';

const THINKING_WORDS = [
  '先贤沉吟中…',
  '正在凝神思索…',
  '斟字酌句，稍候…',
  '翻阅典籍，寻章摘句…',
];

const RECOMMENDING_WORDS = '正为您延请先贤…';

const STORAGE_KEY = 'thinker_ai_state';
const HISTORY_KEY = 'thinker_ai_history';

// 跨端存储：H5 用 localStorage，小程序用 Taro.storage
function getStorage(key) {
  try {
    if (typeof Taro !== 'undefined' && Taro.getStorageSync) {
      const v = Taro.getStorageSync(key);
      return v || null;
    }
  } catch (e) {}
  try {
    return JSON.parse(localStorage.getItem(key));
  } catch (e) {}
  return null;
}

function setStorage(key, value) {
  try {
    if (typeof Taro !== 'undefined' && Taro.setStorageSync) {
      Taro.setStorageSync(key, value);
      return;
    }
  } catch (e) {}
  try {
    localStorage.setItem(key, JSON.stringify(value));
  } catch (e) {}
}

function removeStorage(key) {
  try {
    if (typeof Taro !== 'undefined' && Taro.removeStorageSync) {
      Taro.removeStorageSync(key);
      return;
    }
  } catch (e) {}
  try {
    localStorage.removeItem(key);
  } catch (e) {}
}

function loadGlobalState() {
  const g = getGlobal();
  if (g.currentSession) return g.currentSession;
  const data = getStorage(STORAGE_KEY);
  if (data) {
    g.currentSession = data;
    return data;
  }
  return null;
}

function saveGlobalState(state) {
  const g = getGlobal();
  g.currentSession = state;
  setStorage(STORAGE_KEY, state);
}

function clearGlobalState() {
  const g = getGlobal();
  g.currentSession = null;
  removeStorage(STORAGE_KEY);
}

function loadHistoryList() {
  return getStorage(HISTORY_KEY) || [];
}

function saveHistoryList(list) {
  setStorage(HISTORY_KEY, list);
}

function addToHistory(sessionInfo) {
  const list = loadHistoryList();
  const idx = list.findIndex((h) => h.sessionId === sessionInfo.sessionId);
  if (idx >= 0) {
    list[idx] = { ...list[idx], ...sessionInfo };
  } else {
    list.unshift(sessionInfo);
  }
  if (list.length > 50) list.length = 50;
  saveHistoryList(list);
  return list;
}

export default function Huiyin() {
  const router = useRouter();
  const params = router.params || {};

  const [thinker, setThinker] = useState('');
  const [mode, setMode] = useState('duixi');
  const [modeNameState, setModeName] = useState('对席');
  const [topic, setTopic] = useState('');
  const [messages, setMessages] = useState([]);
  const [inputValue, setInputValue] = useState('');
  const [sessionId, setSessionId] = useState('');
  const [typing, setTyping] = useState(false);
  const [welcome, setWelcome] = useState(true);
  const [scrollTarget, setScrollTarget] = useState('');
  const [recommending, setRecommending] = useState(false);
  const [thinkingWord, setThinkingWord] = useState(THINKING_WORDS[0]);
  const [historyList, setHistoryList] = useState([]);
  const [historyOpen, setHistoryOpen] = useState(true);

  const seqRef = useRef(0);
  const initRef = useRef(false);
  // 用 ref 镜像最新状态，避免闭包陈旧
  const messagesRef = useRef(messages);
  const thinkerRef = useRef(thinker);
  const modeRef = useRef(mode);
  const topicRef = useRef(topic);
  const sessionIdRef = useRef(sessionId);
  const welcomeRef = useRef(welcome);
  const typingRef = useRef(typing);
  const panelRef = useRef(null); // 多人模式完整阵容
  const chatAreaRef = useRef(null);
  const abortControllerRef = useRef(null); // 用于取消 LLM 请求
  const userCancelledRef = useRef(false); // 标记用户是否主动取消

  useEffect(() => { messagesRef.current = messages; }, [messages]);
  useEffect(() => { thinkerRef.current = thinker; }, [thinker]);
  useEffect(() => { modeRef.current = mode; }, [mode]);
  useEffect(() => { topicRef.current = topic; }, [topic]);
  useEffect(() => { sessionIdRef.current = sessionId; }, [sessionId]);
  useEffect(() => { welcomeRef.current = welcome; }, [welcome] );
  useEffect(() => { typingRef.current = typing; }, [typing]);

  // 应用字号档位到根元素
  useEffect(() => { applyFontScaleToDom(); }, []);

  const addMsg = (role, content, th) => {
    const id = seqRef.current++;
    setMessages((prev) => prev.concat([{ id, role, content, thinker: th }]));
    setWelcome(false);
    setScrollTarget('msg-' + id);
  };

  const deleteMsg = (id) => {
    Taro.showModal({
      title: '确认删除',
      content: '确定要删除这条消息吗？',
      confirmText: '删除',
      confirmColor: '#b5342e',
      cancelText: '取消',
    }).then((res) => {
      if (!res.confirm) return;

      // 找到被删除消息在数组中的索引
      const idx = messagesRef.current.findIndex((m) => m.id === id);
      if (idx < 0) return;

      // 前端删除
      setMessages((prev) => prev.filter((m) => m.id !== id));

      // 同步删除服务端历史
      const sid = sessionIdRef.current;
      if (sid) {
        callCloud('delete_message', { session_id: sid, message_idx: idx }).catch((e) => {
          console.error('[deleteMsg] 同步服务端失败:', e);
        });
      }

      setTimeout(() => persistState(), 0);
    });
  };

  // 取消思考
  const cancelThinking = () => {
    userCancelledRef.current = true;
    if (abortControllerRef.current) {
      abortControllerRef.current.abort();
      abortControllerRef.current = null;
    }
    setTyping(false);
    // 移除正在生成的空消息（已有内容的保留）
    setMessages((prev) => prev.filter((m) => !m.streaming || m.content));
    Taro.showToast({ title: '已取消', icon: 'none' });
  };

  const addMultiMsg = (replies, m) => {
    const id = seqRef.current++;
    setMessages((prev) => prev.concat([{ id, role: 'multi', replies, mode: m }]));
    setWelcome(false);
    setScrollTarget('msg-' + id);
  };

  const renderReply = (r) => {
    if (r.replies && r.replies.length) addMultiMsg(r.replies, r.mode);
    else if (r.reply) addMsg('assistant', r.reply, r.thinker);
    else addMsg('system', (r && r.error) || '思想家未能作答，请再试一次');
  };

  const appendStream = (id, delta) => {
    setMessages((prev) =>
      prev.map((m) => (m.id === id ? { ...m, content: (m.content || '') + delta } : m))
    );
  };
  const finalizeStream = (id, content) => {
    setMessages((prev) =>
      prev.map((m) => (m.id === id ? { ...m, content: content || m.content, streaming: false } : m))
    );
  };

  // 使用 ref 读取最新状态，避免闭包陈旧
  const persistState = useCallback((overrides = {}) => {
    const curMessages = overrides.messages || messagesRef.current;
    const curThinker = overrides.thinker !== undefined ? overrides.thinker : thinkerRef.current;
    const curMode = overrides.mode !== undefined ? overrides.mode : modeRef.current;
    const curTopic = overrides.topic !== undefined ? overrides.topic : topicRef.current;
    const curSessionId = overrides.sessionId !== undefined ? overrides.sessionId : sessionIdRef.current;
    const curWelcome = overrides.welcome !== undefined ? overrides.welcome : welcomeRef.current;
    const curPanel = overrides.panel !== undefined ? overrides.panel : panelRef.current;

    const state = {
      thinker: curThinker,
      mode: curMode,
      topic: curTopic,
      messages: curMessages,
      sessionId: curSessionId,
      seq: seqRef.current,
      welcome: curWelcome,
      panel: curPanel,
      updatedAt: Date.now(),
    };
    saveGlobalState(state);

    if (curSessionId && curMessages.length > 0) {
      const firstUserMsg = curMessages.find((m) => m.role === 'user');
      const preview = firstUserMsg?.content?.slice(0, 40) || curTopic;
      addToHistory({
        sessionId: curSessionId,
        thinker: curThinker,
        mode: curMode,
        topic: curTopic,
        preview,
        updatedAt: Date.now(),
      });
      setHistoryList(loadHistoryList());
    }
  }, []);

  // 初次加载：优先从 URL 参数（新对话/历史），其次从全局状态恢复
  useEffect(() => {
    if (initRef.current) return;
    initRef.current = true;

    if (typeof window !== 'undefined') window.scrollTo(0, 0);

    setHistoryList(loadHistoryList());

    const sid = decodeURIComponent(params.sessionId || '');
    const t = decodeURIComponent(params.topic || '');
    const th = decodeURIComponent(params.thinker || '');
    const m = params.mode || 'duixi';
    const thinkersParam = decodeURIComponent(params.thinkers || '');

    // 如果有明确的 URL 参数（新会话或特定历史），走 URL 流程
    if (sid || t || th || thinkersParam) {
      clearGlobalState();

      if (sid) {
        setSessionId(sid);
        getGlobal().lastSessionId = sid;
        Taro.setNavigationBarTitle({ title: '历史对话' });
        callCloud('get_session', { session_id: sid }).then((r) => {
          if (!r || !r.ok) {
            addMsg('system', (r && r.error) || '未能读取该对话');
            return;
          }
          const modeVal = r.mode || 'duixi';
          setThinker(r.thinker || '');
          setMode(modeVal);
          setModeName(modeName(modeVal));
          setTopic(r.topic || '');
          Taro.setNavigationBarTitle({ title: r.thinker || '历史对话' });
          (r.history || []).forEach((msg) => {
            const role =
              msg.role === 'user' ? 'user' : msg.thinker ? 'assistant' : 'system';
            addMsg(role, msg.content, msg.thinker);
          });
        }).catch(() => {
          addMsg('system', '读取历史对话失败');
        });
        return;
      }

      if (!isHosted() && !ensureApiConfig()) {
        setMode(m);
        setModeName(modeName(m));
        setWelcome(false);
        addMsg('system', '尚未配置 AI 接口，请先到「设置」中填写 Base URL 与 API Key');
        return;
      }
      setMode(m);
      setModeName(modeName(m));
      // 直接计算实际思想家名称，避免依赖尚未更新的 state
      const thinkersList = thinkersParam
        ? thinkersParam.split(',').map((s) => s.trim()).filter(Boolean)
        : [];
      const actualThinker = thinkersList[0] || th;
      setThinker(actualThinker);
      setTopic(t);
      // 多人模式：保留完整阵容传给 cloud，避免丢失
      if (thinkersList.length > 1 && (m === 'oude' || m === 'huiyin')) {
        panelRef.current = thinkersList;
      }
      Taro.setNavigationBarTitle({ title: actualThinker || '思想家AI' });
      if (t && actualThinker) callChatWithThinker(t, actualThinker, m, t);
      return;
    }

    // 没有 URL 参数，尝试从全局状态恢复
    const saved = loadGlobalState();
    if (saved && saved.messages && saved.messages.length > 0) {
      setThinker(saved.thinker || '');
      setMode(saved.mode || 'duixi');
      setModeName(modeName(saved.mode || 'duixi'));
      setTopic(saved.topic || '');
      setSessionId(saved.sessionId || '');
      setMessages(saved.messages);
      setWelcome(saved.welcome !== false);
      seqRef.current = saved.seq || saved.messages.length;
      // 恢复 panel 阵容
      if (saved.panel && saved.panel.length) {
        panelRef.current = saved.panel;
      }
      if (saved.sessionId) {
        getGlobal().lastSessionId = saved.sessionId;
      }
      Taro.setNavigationBarTitle({ title: saved.thinker || '思想家AI' });
    } else {
      // 完全空状态
      setMode(m);
      setModeName(modeName(m));
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // 离开页面时保存状态
  useDidHide(() => {
    if (messagesRef.current.length > 0) {
      persistState();
    }
  });

  // 页面重新显示时，如果消息为空则尝试恢复
  useDidShow(() => {
    if (initRef.current && messagesRef.current.length === 0 && !typingRef.current) {
      const saved = loadGlobalState();
      if (saved && saved.messages && saved.messages.length > 0) {
        setThinker(saved.thinker || '');
        setMode(saved.mode || 'duixi');
        setModeName(modeName(saved.mode || 'duixi'));
        setTopic(saved.topic || '');
        setSessionId(saved.sessionId || '');
        setMessages(saved.messages);
        setWelcome(saved.welcome !== false);
        seqRef.current = saved.seq || saved.messages.length;
        // 恢复 panel 阵容
        if (saved.panel && saved.panel.length) {
          panelRef.current = saved.panel;
        }
        if (saved.sessionId) {
          getGlobal().lastSessionId = saved.sessionId;
        }
        Taro.setNavigationBarTitle({ title: saved.thinker || '思想家AI' });
      }
    }
    // 重新应用字号档位
    applyFontScaleToDom();
  });

  // 滚动到目标消息（用 useEffect 替代 ref 回调，避免每次渲染都执行）
  useEffect(() => {
    if (scrollTarget && chatAreaRef.current) {
      const target = chatAreaRef.current.querySelector('#' + scrollTarget);
      if (target) target.scrollIntoView({ behavior: 'smooth' });
    }
  }, [scrollTarget]);

  // 思考中随机轮换文案
  useEffect(() => {
    if (!typing) return;
    let i = 0;
    setThinkingWord(THINKING_WORDS[0]);
    const timer = setInterval(() => {
      i = (i + 1) % THINKING_WORDS.length;
      setThinkingWord(THINKING_WORDS[i]);
    }, 2500);
    return () => clearInterval(timer);
  }, [typing]);

  const onInput = (e) => setInputValue(e.detail.value);

  const callChat = (text) => {
    addMsg('user', text);
    setTyping(true);

    // 创建 AbortController 用于取消请求
    const controller = new AbortController();
    abortControllerRef.current = controller;

    const streamMode = modeRef.current !== 'oude' && modeRef.current !== 'huiyin';
    let streamId = null;
    const onToken = streamMode
      ? (delta) => {
          if (streamId != null) appendStream(streamId, delta);
        }
      : null;

    if (streamMode) {
      streamId = seqRef.current++;
      setMessages((prev) => prev.concat([{ id: streamId, role: 'assistant', content: '', thinker: thinkerRef.current, streaming: true }]));
      setWelcome(false);
      setScrollTarget('msg-' + streamId);
    }

    callCloud('chat', {
      message: text,
      thinker: thinkerRef.current,
      mode: modeRef.current,
      topic: topicRef.current,
      sessionId: sessionIdRef.current,
      panel: panelRef.current || undefined,
      onToken,
      signal: controller.signal,
    }).then((r) => {
      abortControllerRef.current = null;
      setTyping(false);
      // 用户主动取消：不显示错误
      if (userCancelledRef.current) {
        userCancelledRef.current = false;
        return;
      }
      if (!r) {
        // callCloud 内部 catch 返回 null：保留已有流式内容
        if (streamId != null) {
          const existing = messagesRef.current.find((m) => m.id === streamId);
          if (existing && existing.content && existing.content.trim()) {
            finalizeStream(streamId, existing.content);
          } else {
            finalizeStream(streamId, '（连接中断，请重新提问）');
          }
        } else {
          addMsg('system', '请求失败，请稍后再试');
        }
        return;
      }
      if (!r.ok) {
        if (streamId != null) {
          finalizeStream(streamId, r.error || '请求失败，请稍后再试');
        } else {
          addMsg('system', r.error || '请求失败，请稍后再试');
        }
        return;
      }
      setSessionId(r.sessionId);
      getGlobal().lastSessionId = r.sessionId;
      if (streamMode) {
        finalizeStream(streamId, r.reply);
      } else {
        renderReply(r);
      }
      // 延迟一帧再 persist，确保 messagesRef 已更新
      setTimeout(() => persistState({ sessionId: r.sessionId }), 0);
    }).catch((err) => {
      abortControllerRef.current = null;
      setTyping(false);
      // 用户主动取消：不显示错误（cancelThinking 已处理 UI）
      if (userCancelledRef.current) {
        userCancelledRef.current = false;
        return;
      }
      // 流式中断：保留已生成的内容，不替换为"失败"
      if (streamId != null) {
        const existing = messagesRef.current.find((m) => m.id === streamId);
        if (existing && existing.content && existing.content.trim()) {
          // 已有内容，保留并标记完成
          finalizeStream(streamId, existing.content);
        } else {
          // 完全没收到内容，显示失败提示
          finalizeStream(streamId, '（连接中断，请重新提问）');
        }
      } else {
        addMsg('system', '请求失败，请稍后再试');
      }
    });
  };

  const callChatWithThinker = (text, thinkerName, modeStr, topicOverride) => {
    addMsg('user', text);
    setTyping(true);

    // 创建 AbortController 用于取消请求
    const controller = new AbortController();
    abortControllerRef.current = controller;

    const streamMode = modeStr !== 'oude' && modeStr !== 'huiyin';
    let streamId = null;
    const onToken = streamMode
      ? (delta) => {
          if (streamId != null) appendStream(streamId, delta);
        }
      : null;

    if (streamMode) {
      streamId = seqRef.current++;
      setMessages((prev) => prev.concat([{ id: streamId, role: 'assistant', content: '', thinker: thinkerName, streaming: true }]));
      setWelcome(false);
      setScrollTarget('msg-' + streamId);
    }

    callCloud('chat', {
      message: text,
      thinker: thinkerName,
      mode: modeStr,
      topic: topicOverride !== undefined ? topicOverride : topicRef.current,
      sessionId: sessionIdRef.current,
      panel: panelRef.current || undefined,
      onToken,
      signal: controller.signal,
    }).then((r) => {
      abortControllerRef.current = null;
      setTyping(false);
      // 用户主动取消：不显示错误
      if (userCancelledRef.current) {
        userCancelledRef.current = false;
        return;
      }
      if (!r) {
        // callCloud 内部 catch 返回 null：保留已有流式内容
        if (streamId != null) {
          const existing = messagesRef.current.find((m) => m.id === streamId);
          if (existing && existing.content && existing.content.trim()) {
            finalizeStream(streamId, existing.content);
          } else {
            finalizeStream(streamId, '（连接中断，请重新提问）');
          }
        } else {
          addMsg('system', '请求失败，请稍后再试');
        }
        return;
      }
      if (!r.ok) {
        if (streamId != null) {
          finalizeStream(streamId, r.error || '请求失败，请稍后再试');
        } else {
          addMsg('system', r.error || '请求失败，请稍后再试');
        }
        return;
      }
      setSessionId(r.sessionId);
      getGlobal().lastSessionId = r.sessionId;
      if (streamMode) {
        finalizeStream(streamId, r.reply);
      } else {
        renderReply(r);
      }
      setTimeout(() => persistState({ sessionId: r.sessionId, thinker: thinkerName, mode: modeStr }), 0);
    }).catch((err) => {
      abortControllerRef.current = null;
      setTyping(false);
      // 用户主动取消：不显示错误
      if (userCancelledRef.current) {
        userCancelledRef.current = false;
        return;
      }
      // 流式中断：保留已生成的内容
      if (streamId != null) {
        const existing = messagesRef.current.find((m) => m.id === streamId);
        if (existing && existing.content && existing.content.trim()) {
          finalizeStream(streamId, existing.content);
        } else {
          finalizeStream(streamId, '（连接中断，请重新提问）');
        }
      } else {
        addMsg('system', '请求失败，请稍后再试');
      }
    });
  };

  const onSend = () => {
    const text = (inputValue || '').trim();
    if (!text || typing) return;
    setInputValue('');
    callChat(text);
  };

  const onBack = () => {
    if (messagesRef.current.length > 0) persistState();
    const pages = Taro.getCurrentPages ? Taro.getCurrentPages() : [];
    if (pages.length > 1) Taro.navigateBack();
    else Taro.reLaunch({ url: '/pages/home/index' });
  };

  // 聚合历史消息：将同一 multi_id 的多条消息合并为 multi 对象
  const aggregateHistory = (history, mode) => {
    const result = [];
    const multiMap = new Map();

    for (const msg of history || []) {
      // user 消息直接添加
      if (msg.role === 'user') {
        result.push({ ...msg, role: 'user' });
        continue;
      }

      // 有 multi_id 的消息按 multi_id 分组
      if (msg.multi_id) {
        if (!multiMap.has(msg.multi_id)) {
          multiMap.set(msg.multi_id, { role: 'multi', mode, replies: [] });
        }
        multiMap.get(msg.multi_id).replies.push({
          thinker: msg.thinker || '',
          content: msg.content,
          round: msg.round || null,
        });
        continue;
      }

      // 普通 assistant 消息直接添加
      result.push({ ...msg, role: 'assistant' });
    }

    // 将 multi 消息插入到对应位置（按第一个 reply 在 history 中的位置）
    for (const [multi_id, multiMsg] of multiMap) {
      // 找到第一条 multi 消息在 history 中的索引
      const firstIdx = history.findIndex((m) => m.multi_id === multi_id);
      // 计算在 result 中的位置（减去已插入的 user 消息数）
      let insertIdx = firstIdx;
      result.splice(insertIdx, 0, multiMsg);
    }

    return result;
  };

  const loadHistorySession = (sid) => {
    if (!sid) return;
    clearGlobalState();
    setMessages([]);
    setWelcome(true);
    setSessionId(sid);
    seqRef.current = 0;
    panelRef.current = null;
    getGlobal().lastSessionId = sid;
    Taro.setNavigationBarTitle({ title: '历史对话' });
    callCloud('get_session', { session_id: sid }).then((r) => {
      if (!r || !r.ok) {
        addMsg('system', (r && r.error) || '未能读取该对话');
        return;
      }
      const modeVal = r.mode || 'duixi';
      setThinker(r.thinker || '');
      setMode(modeVal);
      setModeName(modeName(modeVal));
      setTopic(r.topic || '');
      // 恢复 panel 阵容
      if (r._panel && r._panel.length) {
        panelRef.current = r._panel;
      }
      Taro.setNavigationBarTitle({ title: r.thinker || '历史对话' });
      // 聚合历史消息
      const aggregated = aggregateHistory(r.history || [], modeVal);
      for (const msg of aggregated) {
        if (msg.role === 'user') {
          addMsg('user', msg.content, '');
        } else if (msg.role === 'multi') {
          addMultiMsg(msg.replies, modeVal);
        } else if (msg.role === 'assistant') {
          addMsg('assistant', msg.content, msg.thinker);
        } else {
          addMsg('system', msg.content, '');
        }
      }
    }).catch(() => {
      addMsg('system', '读取历史对话失败');
    });
  };

  const toggleHistoryFav = (sid) => {
    const list = historyList.map((h) =>
      h.sessionId === sid ? { ...h, favorite: !h.favorite } : h
    );
    setHistoryList(list);
    saveHistoryList(list);
  };

  const shareHistorySession = (h) => {
    const lines = [
      `${h.thinker || '思想家'} · ${modeName(h.mode)}`,
      h.topic ? `话题：${h.topic}` : '',
      h.preview || '',
      '— 思想家AI',
    ].filter(Boolean).join('\n');
    Taro.setClipboardData({
      data: lines,
      success: () => Taro.showToast({ title: '已复制对话摘要', icon: 'none' }),
    });
  };

  const startNewChat = () => {
    clearGlobalState();
    setMessages([]);
    setWelcome(true);
    setThinker('');
    setTopic('');
    setSessionId('');
    setMode('duixi');
    setModeName(modeName('duixi'));
    setTyping(false);
    setRecommending(false);
    seqRef.current = 0;
    panelRef.current = null;
  };

  return (
    <View className="container">
      <Tabbar current="huiyin" />

      {/* 桌面端：左侧历史侧边栏 */}
      <View className={`sidebar ${historyOpen ? 'open' : 'closed'}`}>
        <View className="sidebar-head">
          <View className="sidebar-title-wrap">
            <View className="sidebar-seal kai">录</View>
            <View className="sidebar-title kai">清谈录</View>
          </View>
          <View className="new-chat-btn" onClick={startNewChat}>
            <Text className="new-icon">+</Text>
            <Text>新对话</Text>
          </View>
        </View>
        <View className="sidebar-divider">
          <View className="divider-line" />
        </View>
        <View className="sidebar-list">
          {historyList.length === 0 ? (
            <View className="history-empty">
              <View className="empty-ink-dot" />
              <Text className="empty-text kai">展卷伊始，静候清谈</Text>
            </View>
          ) : (
            historyList.map((h, idx) => (
              <View
                key={h.sessionId}
                className={`history-item ${h.sessionId === sessionId ? 'active' : ''}`}
                onClick={() => loadHistorySession(h.sessionId)}
              >
                <View className="history-idx">{idx + 1}</View>
                <View className="history-body">
                  <View className="history-title kai">
                    {h.thinker || '思想家'} · {modeName(h.mode)}
                  </View>
                  <View className="history-preview">{h.preview || h.topic || '无主题'}</View>
                  <View className="history-time">{fmtTime(h.updatedAt)}</View>
                </View>
                <View className="history-actions" onClick={(e) => e.stopPropagation()}>
                  <View
                    className="history-act-btn fav-btn"
                    onClick={(e) => {
                      e.stopPropagation();
                      toggleHistoryFav(h.sessionId);
                    }}
                  >
                    {h.favorite ? '★' : '☆'}
                  </View>
                  <View
                    className="history-act-btn share-btn"
                    onClick={(e) => {
                      e.stopPropagation();
                      shareHistorySession(h);
                    }}
                  >
                    <Text className="share-icon">⇗</Text>
                  </View>
                </View>
              </View>
            ))
          )}
        </View>
      </View>

      {/* 主对话区 */}
      <View className="chat-main">
        {/* 移动端轻量标题（与思想家/设置页 .hint 风格统一） */}
        <View className="chat-top kai">
          {thinker || '清谈'} · {modeNameState}
        </View>

        {/* 桌面端清谈头部 */}
        <View className="chat-header">
          <View className="ch-left">
            {thinker && (
              <View className="ch-avatar kai">{thinker.charAt(0)}</View>
            )}
            <View className="ch-info">
              <View className="ch-name kai">{thinker || '清谈'}</View>
              <View className="ch-meta">
                <View className="ch-mode-tag">{modeNameState}</View>
                {topic && <View className="ch-topic">{topic}</View>}
              </View>
            </View>
          </View>
          <View className="ch-right">
            <View className="ch-new" onClick={startNewChat}>新对话</View>
          </View>
        </View>

        <View
          className="chat-area"
          ref={chatAreaRef}
        >
          {recommending && (
            <View className="recommending">
              <View className="r-ink-ripple">
                <View className="r-ripple-dot" />
                <View className="r-ripple-ring" />
                <View className="r-ripple-ring r-ripple-ring-2" />
              </View>
              <View className="r-text kai">{RECOMMENDING_WORDS}</View>
            </View>
          )}

          {welcome && (
            <View className="welcome">
              <View className="w-seal-wrap">
                <View className="w-seal-bg" />
                <View className="w-seal kai">{thinker ? thinker.charAt(0) : '思'}</View>
              </View>
              <View className="w-title kai">{thinker || '思想家'}</View>
              <View className="w-ornament">
                <View className="w-orn-line" />
                <View className="w-orn-diamond" />
                <View className="w-orn-line" />
              </View>
              <View className="w-desc kai">
                {thinker
                  ? `与${thinker}${modeNameState}，说出你的话题或困惑`
                  : '说出你的话题或困惑，为你延请先贤'}
              </View>
              <View className="w-hints">
                <View className="w-hint kai">人生的意义</View>
                <View className="w-hint-dot">·</View>
                <View className="w-hint kai">如何面对逆境</View>
                <View className="w-hint-dot">·</View>
                <View className="w-hint kai">何为自由</View>
              </View>
            </View>
          )}

          {messages.map((item) => {
            if (item.role === 'user') {
              return (
                <View
                  key={item.id}
                  id={'msg-' + item.id}
                  className="msg user"
                >
                  <View className="msg-bubble">
                    <View className="msg-stripe" />
                    <View className="msg-inner">{item.content}</View>
                  </View>
                  <View className="msg-delete" onClick={() => deleteMsg(item.id)}>×</View>
                </View>
              );
            }
            if (item.role === 'assistant') {
              return (
                <View
                  key={item.id}
                  id={'msg-' + item.id}
                  className="msg assistant"
                >
                  <View className="msg-head">
                    {item.thinker && (
                      <View className="thinker-avatar-sm kai">{item.thinker.charAt(0)}</View>
                    )}
                    {item.thinker && <View className="thinker-label kai">{item.thinker}</View>}
                  </View>
                  <View className="msg-bubble">
                    <Text className="content" userSelect>
                      {item.content}
                      {item.streaming && <Text className="stream-cursor">▍</Text>}
                    </Text>
                  </View>
                  <View className="msg-delete" onClick={() => deleteMsg(item.id)}>×</View>
                </View>
              );
            }
            if (item.role === 'multi') {
              return (
                <View
                  key={item.id}
                  id={'msg-' + item.id}
                  className="msg multi"
                >
                  <View className="multi-head kai">
                    <View className="multi-head-seal">
                      {item.mode === 'huiyin' ? '饮' : '得'}
                    </View>
                    {item.mode === 'huiyin' ? '会饮 · 思想交锋' : '偶得 · 多视角'}
                  </View>
                  <View className="multi-body">
                    {(item.replies || []).map((rp, i) => (
                      <View key={i} className="bubble">
                        <View className="b-head">
                          <View className="b-avatar kai">{rp.thinker.charAt(0)}</View>
                          <View className="b-name kai">
                            {rp.thinker}
                            {rp.round && <Text className="round-tag">第{rp.round}轮</Text>}
                          </View>
                        </View>
                        <Text className="content" userSelect>
                          {rp.content}
                        </Text>
                      </View>
                    ))}
                  </View>
                  <View className="msg-delete" onClick={() => deleteMsg(item.id)}>×</View>
                </View>
              );
            }
            return (
              <View
                key={item.id}
                id={'msg-' + item.id}
                className="msg system"
              >
                <View className="sys-dot" />
                {item.content}
                <View className="msg-delete" onClick={() => deleteMsg(item.id)}>×</View>
              </View>
            );
          })}

          {typing && !messages.some((m) => m.streaming && m.content) && (
            <View className="thinking kai">
              <View className="thinking-ink">
                <View className="ink-drop" />
                <View className="ink-ring ink-ring-1" />
                <View className="ink-ring ink-ring-2" />
              </View>
              <View className="thinking-body">
                <Text className="thinking-text">{thinkingWord}</Text>
                <Text className="thinking-cancel" onClick={cancelThinking}>取消</Text>
              </View>
            </View>
          )}
        </View>

        <View className="input-area">
          <View className="input-box">
            <Textarea
              className="input-field"
              value={inputValue}
              placeholder=""
              placeholderClass="ph"
              onInput={onInput}
              onConfirm={onSend}
              maxlength={-1}
              autoHeight
              autoHeightMaxRows={4}
              adjustPosition={false}
              style={{ resize: 'none', border: 'none', outline: 'none', background: 'transparent', boxShadow: 'none', textAlign: 'center' }}
            />
            <View className={`send-btn ${typing ? 'disabled' : ''}`} onClick={onSend}>
              <Text className="send-text">{typing ? '思考中' : '送出'}</Text>
            </View>
          </View>
        </View>
      </View>
    </View>
  );
}
