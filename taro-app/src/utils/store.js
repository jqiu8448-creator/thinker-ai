// 前端本地存储（替代 server/lib/session.js + db.js）
// 全部存于浏览器 localStorage（Taro 存储），单用户、无后端。
// 数据结构：
//   sessions: [{ session_id, thinker, mode, topic, state, history:[{role,content,thinker}],
//               recommendations, _panel, updated_at, favorite, tags }]
//   setting:  { retention, watermark, aiProvider, customBaseUrl, customApiKey, customModel }
import Taro from '@tarojs/taro';
import { STATES } from './engine-modes';

const K_SESSIONS = 'sessions';
const K_SETTING = 'setting';

function read(key, fallback) {
  try {
    const v = Taro.getStorageSync(key);
    return v === '' || v === undefined || v === null ? fallback : v;
  } catch (e) {
    return fallback;
  }
}
function write(key, val) {
  try {
    Taro.setStorageSync(key, val);
  } catch (e) {}
}

export function get_setting() {
  const s = read(K_SETTING, {});
  return Object.assign(
    { retention: 100, watermark: '', aiProvider: 'custom', customBaseUrl: '', customApiKey: '', customModel: '' },
    s
  );
}

export function set_setting(patch) {
  const cur = get_setting();
  const next = Object.assign({}, cur, patch);
  if (typeof next.retention === 'number') {
    next.retention = Math.max(1, Math.min(500, Math.floor(next.retention)));
  }
  write(K_SETTING, next);
  // 保留数量调低时，立即裁剪最旧会话
  pruneSessions(next.retention);
  return next;
}

function loadSessions() {
  return read(K_SESSIONS, []);
}
function saveSessions(list) {
  write(K_SESSIONS, list);
}

function genId() {
  return 's_' + Date.now().toString(36) + Math.random().toString(36).slice(2, 8);
}

export function get_or_create_session(sessionId) {
  const list = loadSessions();
  if (sessionId) {
    const found = list.find((s) => s.session_id === sessionId);
    if (found) return found;
  }
  const session = {
    session_id: sessionId || genId(),
    thinker: '',
    mode: 'duixi',
    topic: '',
    state: STATES.idle,
    history: [],
    recommendations: [],
    _panel: null,
    updated_at: new Date().toISOString(),
    favorite: false,
    tags: [],
  };
  list.unshift(session);
  saveSessions(list);
  return session;
}

export function save_session(session) {
  session.updated_at = new Date().toISOString();
  const list = loadSessions();
  const idx = list.findIndex((s) => s.session_id === session.session_id);
  if (idx >= 0) list[idx] = session;
  else list.unshift(session);
  saveSessions(list);
  pruneSessions(get_setting().retention);
}

export function add_message(session, role, content, thinker) {
  session.history.push({ role, content, thinker: thinker || '' });
}

export function recent_history(session) {
  return (session.history || []).slice(-8);
}

export function list_sessions(retention) {
  const list = loadSessions();
  const keep = retention || get_setting().retention || 100;
  return list
    .slice()
    .sort((a, b) => String(b.updated_at).localeCompare(String(a.updated_at)))
    .slice(0, keep)
    .map((s) => ({
      session_id: s.session_id,
      thinker: s.thinker || '',
      mode: s.mode || 'duixi',
      topic: s.topic || '',
      turns: (s.history || []).length,
      preview: (s.history || []).filter((m) => m.role === 'user')[0]?.content || '',
      updated_at: s.updated_at,
      favorite: !!s.favorite,
      tags: s.tags || [],
    }));
}

export function get_session(sessionId) {
  const list = loadSessions();
  const s = list.find((x) => x.session_id === sessionId);
  if (!s) return null;
  return {
    session_id: s.session_id,
    thinker: s.thinker || '',
    mode: s.mode || 'duixi',
    topic: s.topic || '',
    history: (s.history || []).map((m) => ({
      role: m.role,
      content: m.content,
      thinker: m.thinker || '',
    })),
  };
}

export function tag_session(sessionId, patch) {
  const list = loadSessions();
  const s = list.find((x) => x.session_id === sessionId);
  if (!s) return null;
  if (Array.isArray(patch.tags)) s.tags = patch.tags;
  if (typeof patch.favorite === 'boolean') s.favorite = patch.favorite;
  s.updated_at = new Date().toISOString();
  saveSessions(list);
  return s;
}

function pruneSessions(retention) {
  const list = loadSessions();
  if (list.length <= retention) return;
  const sorted = list
    .slice()
    .sort((a, b) => String(b.updated_at).localeCompare(String(a.updated_at)));
  const kept = sorted.slice(0, retention);
  saveSessions(kept);
}

export function _resetContext(session) {
  session.state = STATES.idle;
  session.topic = '';
  session.thinker = '';
  session.recommendations = [];
  session.history = [];
  session._panel = null;
}
