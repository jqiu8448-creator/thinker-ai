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
import { isHosted, hostedHeaders } from './hosted';

// 托管模式：扣减一次"提问配额"。每次用户发问只扣 1 次，
// 不论后端为这条问题内部调用了多少次 LLM（如多思想家模式）。
async function consumeHostedQuota() {
  try {
    const resp = await fetch('/api/ask', {
      method: 'POST',
      headers: hostedHeaders(),
      body: JSON.stringify({}),
    });
    if (resp.ok) {
      const data = await resp.json().catch(() => ({}));
      return { ok: true, remaining: data.remaining, limit: data.limit };
    }
    if (resp.status === 429) {
      const data = await resp.json().catch(() => ({}));
      return { ok: false, error: data.error || '今日配额已用完，明日重置' };
    }
    if (resp.status === 503) {
      return { ok: false, error: '后端未配置 LLM API，请联系管理员' };
    }
    return { ok: false, error: `配额检查失败（HTTP ${resp.status}）` };
  } catch (e) {
    return { ok: false, error: '网络异常：' + e.message };
  }
}

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
async function _do_chat(session, { message, thinker, mode, onToken, signal }) {
  // 记录生成前的历史长度，用于失败回滚
  const historyLenBefore = session.history ? session.history.length : 0;
  store.add_message(session, 'user', message);
  // recent_history 已含刚加入的 user message，传给 engine 时去掉最后一条，
  // 由 engine 的 thinker_route 自己 push 当前 message，避免 LLM 上下文重复
  const hist = store.recent_history(session).slice(0, -1);
  let result;
  try {
    if (isMultiMode(mode)) {
      // 多模式：首次用 topic，后续消息也要传入
      const res = await multi_thinker_route({
        lead: thinker,
        mode,
        topic: session.topic || message,
        message,
        history: hist,
        panel: session._panel || null,
        signal,
      });
      // 生成 multi_id 用于分组
      const multi_id = 'multi_' + Date.now();
      for (const r of res.replies || []) {
        store.add_message(session, 'assistant', r.content, r.thinker, {
          multi_id,
          round: r.round || null,
        });
      }
      result = { replies: res.replies || [], panel: res.panel || [], multi_id };
    } else {
      const tokenCb = typeof onToken === 'function' ? onToken : null;
      const reply = await thinker_route(message, thinker, mode, hist, tokenCb, signal);
      store.add_message(session, 'assistant', reply, thinker);
      result = { reply };
    }
  } catch (e) {
    // 生成失败：截断到生成前的长度（完整回滚 user + assistant 消息）
    if (session.history && session.history.length > historyLenBefore) {
      session.history.length = historyLenBefore;
    }
    throw e;
  }
  session.thinker = thinker;
  session.mode = mode;
  session.state = STATES.in_conversation;
  // 多模式：持久化 panel 供后续对话使用
  if (isMultiMode(mode) && result.panel && result.panel.length) {
    session._panel = result.panel;
  } else {
    session._panel = null;
  }
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
      case 'delete_message': {
        const session_id = (data.session_id || '').trim();
        const message_idx = data.message_idx;
        if (!session_id) return finish(fail('缺少会话标识'));
        if (typeof message_idx !== 'number') return finish(fail('缺少消息索引'));
        const session = store.get_or_create_session(session_id);
        if (!session) return finish(fail('未找到该会话'));
        const deleted = store.delete_message(session, message_idx);
        if (!deleted) return finish(fail('消息索引无效'));
        store.save_session(session);
        return finish(ok({ deleted: true }));
      }
      case 'recommend': {
        const topic = (data.topic || '').trim();
        if (!topic) return finish(fail('请提供话题'));
        console.log('[cloud] recommend 开始, topic:', topic);
        const thinkers = await recommend_thinkers(topic);
        console.log('[cloud] recommend 返回:', thinkers);
        return finish(ok({ thinkers }));
      }
      case 'chat': {
        const message = (data.message || '').trim();
        const thinker = data.thinker || '';
        const mode = data.mode || 'duixi';
        const topic = (data.topic || '').trim();
        if (!message) return finish(fail('消息不能为空'));
        if (!thinker) return finish(fail('请指定思想家'));

        // 托管模式：扣减每日提问配额（每人每天 3 题）
        if (isHosted()) {
          const quotaResult = await consumeHostedQuota();
          if (!quotaResult.ok) {
            return finish(fail(quotaResult.error || '今日配额已用完'));
          }
          // 把剩余配额带上，前端可以提示
          const session = store.get_or_create_session(data.sessionId);
          if (topic) session.topic = topic;
          if (Array.isArray(data.panel) && data.panel.length) {
            session._panel = data.panel;
          } else if (data.panel === null) {
            session._panel = null;
          }
          try {
            const result = await _do_chat(session, {
              message,
              thinker,
              mode,
              onToken: data.onToken,
              signal: data.signal,
            });
            return finish(ok({ ...result, thinker, mode, sessionId: session.session_id, quotaRemaining: quotaResult.remaining }));
          } catch (e) {
            return finish(fail(e.message || '对话失败'));
          }
        }

        const session = store.get_or_create_session(data.sessionId);
        if (topic) session.topic = topic;
        // 仅在明确传入 panel 时才覆盖，undefined 时保留已有值
        if (Array.isArray(data.panel) && data.panel.length) {
          session._panel = data.panel;
        } else if (data.panel === null) {
          session._panel = null;
        }
        const result = await _do_chat(session, { message, thinker, mode, onToken: data.onToken, signal: data.signal });
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
    return null;
  }
}

export default callCloud;
