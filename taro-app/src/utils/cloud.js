// 统一后端调用封装（开源网页版 · 纯前端）
// 不再请求任何后端：对话引擎与存储都在浏览器内完成。
// 契约与原 server/index.js 的 main() 一致，页面代码无需改动。
//   callCloud(action, data) -> Promise<{ ok, ... } | null>
import Taro from '@tarojs/taro';
import {
  list_thinkers,
  list_categories,
  get_thinker_detail,
  recommend_thinkers,
  multi_thinker_route,
  suggest_panel,
  thinker_route,
} from './engine';
import * as store from './store';
import { testConnection } from './llm';
import { STATES } from './engine-modes';

function ok(data) {
  return Object.assign({ ok: true }, data);
}
function fail(msg) {
  return { ok: false, error: msg };
}

function isMultiMode(mode) {
  return mode === 'oude' || mode === 'huiyin';
}

// 统一对话生成（移植自 server/lib/main.js 的 _do_chat）
async function _do_chat(session, { message, thinker, mode }) {
  store.add_message(session, 'user', message);
  let result;
  if (isMultiMode(mode)) {
    const topic = session.topic || message;
    const res = await multi_thinker_route({
      lead: thinker,
      mode,
      topic,
      message,
      history: store.recent_history(session),
      panel: session._panel || null,
    });
    for (const r of res.replies || []) {
      store.add_message(session, 'assistant', r.content, r.thinker);
    }
    result = { replies: res.replies || [], panel: res.panel || [] };
  } else {
    const onToken = typeof data.onToken === 'function' ? data.onToken : null;
    const reply = await thinker_route(message, thinker, mode, store.recent_history(session), onToken);
    store.add_message(session, 'assistant', reply, thinker);
    result = { reply };
  }
  session.thinker = thinker;
  session.mode = mode;
  session.state = STATES.in_conversation;
  session._panel = null;
  await store.save_session(session);
  return result;
}

export async function callCloud(action, data = {}, opts = {}) {
  const { loading = false, loadingText = '加载中…' } = opts;
  if (loading) Taro.showLoading({ title: loadingText, mask: true });

  const finish = (res) => {
    if (loading) Taro.hideLoading();
    return res;
  };

  try {
    switch (action) {
      case 'thinkers': {
        return finish(ok({ thinkers: list_thinkers() }));
      }
      case 'categories': {
        return finish(ok({ categories: list_categories() }));
      }
      case 'thinker_detail': {
        const name = (data.name || '').trim();
        if (!name) return finish(fail('请指定思想家'));
        const detail = get_thinker_detail(name);
        if (!detail) return finish(fail(`未找到「${name}」的档案`));
        return finish(ok(detail));
      }
      case 'history': {
        const setting = store.get_setting();
        return finish(ok({ sessions: store.list_sessions(setting.retention), retention: setting.retention }));
      }
      case 'get_setting': {
        return finish(ok(store.get_setting()));
      }
      case 'set_setting': {
        const patch = {};
        if (typeof data.retention === 'number') patch.retention = data.retention;
        if (typeof data.watermark === 'string') patch.watermark = data.watermark.slice(0, 20).trim();
        if (data.aiProvider === 'custom' || data.aiProvider === 'cloudbase') patch.aiProvider = data.aiProvider;
        if (typeof data.customBaseUrl === 'string') patch.customBaseUrl = data.customBaseUrl.trim();
        if (typeof data.customApiKey === 'string') patch.customApiKey = data.customApiKey.trim();
        if (typeof data.customModel === 'string') patch.customModel = data.customModel.trim();
        return finish(ok(store.set_setting(patch)));
      }
      case 'tag_session': {
        const session_id = (data.session_id || '').trim();
        if (!session_id) return finish(fail('缺少会话标识'));
        const patch = {};
        if (Array.isArray(data.tags)) patch.tags = data.tags;
        if (typeof data.favorite === 'boolean') patch.favorite = data.favorite;
        const r = store.tag_session(session_id, patch);
        if (!r) return finish(fail('未找到该会话'));
        return finish(ok({ session: r }));
      }
      case 'get_session': {
        const session_id = (data.session_id || '').trim();
        if (!session_id) return finish(fail('缺少会话标识'));
        const s = store.get_session(session_id);
        if (!s) return finish(fail('未找到该会话'));
        return finish(ok(s));
      }
      case 'recommend': {
        const topic = (data.topic || '').trim();
        if (!topic) return finish(fail('请提供话题'));
        const thinkers = await recommend_thinkers(topic);
        return finish(ok({ thinkers }));
      }
      case 'chat': {
        const message = (data.message || '').trim();
        const thinker = data.thinker || '';
        const mode = data.mode || 'duixi';
        const topic = (data.topic || '').trim();
        if (!message) return finish(fail('消息不能为空'));
        if (!thinker) return finish(fail('请指定思想家'));
        const session = store.get_or_create_session(data.sessionId);
        if (topic) session.topic = topic;
        session._panel = Array.isArray(data.panel) && data.panel.length ? data.panel : null;
        const result = await _do_chat(session, { message, thinker, mode });
        return finish(ok({ ...result, thinker, mode, sessionId: session.session_id }));
      }
      case 'suggest_panel': {
        const topic = (data.topic || '').trim();
        const mode = data.mode === 'huiyin' ? 'huiyin' : 'oude';
        if (!topic) return finish(fail('请提供话题'));
        const panelData = await suggest_panel(topic, mode);
        return finish(ok(panelData));
      }
      case 'test_ai': {
        const probe = {
          baseUrl: typeof data.customBaseUrl === 'string' ? data.customBaseUrl.trim() : '',
          apiKey: typeof data.customApiKey === 'string' ? data.customApiKey.trim() : '',
          model: typeof data.customModel === 'string' ? data.customModel.trim() : '',
        };
        try {
          const detail = await testConnection(probe);
          return finish(ok({ provider: 'custom', detail }));
        } catch (e) {
          return finish(ok({ provider: 'custom', ok: false, error: e.message }));
        }
      }
      default:
        return finish(fail(`未知 action: ${action}`));
    }
  } catch (e) {
    console.error('[callCloud]', action, '失败:', e);
    if (loading) Taro.hideLoading();
    Taro.showToast({ title: '出错了：' + (e.message || '未知错误'), icon: 'none', duration: 2500 });
    return null;
  }
}

export default callCloud;
