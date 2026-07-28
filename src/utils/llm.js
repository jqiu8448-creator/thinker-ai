// 前端 LLM 客户端（OpenAI 兼容）
// 浏览器内直连用户自有接口，不依赖任何后端。
// - generateText：非流式，返回完整文本（推荐/多人模式等一次性结果用）。
// - generateTextStream：流式，边收边回调 onToken(delta)，结束时返回完整文本；
//   对不支持流式的接口自动降级为非流式（仍会一次性把全文通过 onToken 给出）。
import { getApiConfig } from './api-config';

/**
 * 调用 chat/completions，返回助手回复文本。
 * @param {object} opts
 * @param {string} [opts.model]   业务层建议的模型（自定义接口下以用户配置为准）
 * @param {Array}  opts.messages  [{role, content}, ...]
 * @param {number} [opts.temperature]
 * @param {number} [opts.topP]
 */
export async function generateText({ model, messages, temperature = 0.7, topP = 0.9, maxTokens, signal }) {
  const cfg = getApiConfig();
  if (!cfg || !cfg.baseUrl || !cfg.apiKey) {
    throw new Error('尚未配置 API（请在设置中填写 Base URL 与 API Key）');
  }
  const usedModel = cfg.model || model || 'gpt-3.5-turbo';

  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(), 60000);
  if (signal) signal.addEventListener('abort', () => controller.abort());

  let resp;
  try {
    resp = await fetch(`${cfg.baseUrl}/chat/completions`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${cfg.apiKey}`,
      },
      body: JSON.stringify({
        model: usedModel,
        messages,
        temperature,
        top_p: topP,
        ...(maxTokens ? { max_tokens: maxTokens } : {}),
      }),
      signal: controller.signal,
    });
  } finally {
    clearTimeout(timeoutId);
  }

  if (!resp.ok) {
    let detail = '';
    try {
      detail = (await resp.text()).slice(0, 300);
    } catch (e) {}
    throw new Error(`API HTTP ${resp.status}：${detail}`);
  }

  const json = await resp.json();
  const text = json?.choices?.[0]?.message?.content;
  if (typeof text !== 'string') {
    throw new Error('API 返回格式异常：' + JSON.stringify(json).slice(0, 200));
  }
  return text;
}

/**
 * 流式生成（OpenAI 兼容 SSE）。
 * 每收到一段增量内容就调用 onToken(delta)，结束时返回拼接后的完整文本。
 * 若接口不支持流式（响应无 body reader 或非 text/event-stream），自动降级为
 * 非流式调用，并一次性把全文通过 onToken 给出，保证调用方逻辑不变。
 * @param {object} opts
 * @param {Array}  opts.messages
 * @param {string} [opts.model]
 * @param {number} [opts.temperature]
 * @param {number} [opts.topP]
 * @param {(delta:string)=>void} [opts.onToken]
 * @param {AbortSignal} [opts.signal]
 */
export async function generateTextStream({ model, messages, temperature = 0.7, topP = 0.9, maxTokens, onToken, signal }) {
  const cfg = getApiConfig();
  if (!cfg || !cfg.baseUrl || !cfg.apiKey) {
    throw new Error('尚未配置 API（请在设置中填写 Base URL 与 API Key）');
  }
  const usedModel = cfg.model || model || 'gpt-3.5-turbo';

  // 流式也需要超时控制，避免连接挂起导致 typing 永久卡死
  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(), 300000); // 流式给 5 分钟，长文生成不会被截断
  if (signal) signal.addEventListener('abort', () => controller.abort());

  const post = (stream) =>
    fetch(`${cfg.baseUrl}/chat/completions`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${cfg.apiKey}`,
      },
      body: JSON.stringify({
        model: usedModel,
        messages,
        temperature,
        top_p: topP,
        ...(maxTokens ? { max_tokens: maxTokens } : {}),
        stream,
      }),
      signal: controller.signal,
    });

  // 非流式兜底（供降级使用）
  const fallbackNonStream = async () => {
    const full = await generateText({ model: usedModel, messages, temperature, topP, maxTokens });
    if (onToken) onToken(full);
    return full;
  };

  let resp;
  try {
    resp = await post(true);
  } catch (e) {
    // 网络层不支持流式（极少数环境），尝试非流式
    return await fallbackNonStream();
  }

  if (!resp.ok) {
    let detail = '';
    try {
      detail = (await resp.text()).slice(0, 300);
    } catch (e) {}
    // 部分网关拒绝 stream 请求，降级为非流式
    return await fallbackNonStream().catch(() => {
      throw new Error(`API HTTP ${resp.status}：${detail}`);
    });
  }

  const contentType = resp.headers && resp.headers.get ? resp.headers.get('content-type') || '' : '';
  if (!resp.body || !resp.body.getReader || !contentType || !/text\/event-stream/.test(contentType)) {
    // 明确非事件流，降级为非流式
    return await fallbackNonStream();
  }

  const reader = resp.body.getReader();
  const decoder = new TextDecoder('utf-8');
  let buffer = '';
  let full = '';

  const consumeLine = (rawLine) => {
    const line = rawLine.trim();
    if (!line || !line.startsWith('data:')) return;
    const payload = line.slice(5).trim();
    if (payload === '[DONE]') return;
    let json;
    try {
      json = JSON.parse(payload);
    } catch (e) {
      return; // 跳过无法解析的片段
    }
    const delta = json?.choices?.[0]?.delta?.content;
    if (delta) {
      full += delta;
      if (onToken) onToken(delta);
    }
  };

  try {
    while (true) {
      const { done, value } = await reader.read();
      if (done) break;
      buffer += decoder.decode(value, { stream: true });
      let idx;
      while ((idx = buffer.indexOf('\n')) >= 0) {
        const line = buffer.slice(0, idx);
        buffer = buffer.slice(idx + 1);
        consumeLine(line);
      }
    }
    // 收尾：处理最后一行（可能无结尾换行）
    if (buffer.trim()) consumeLine(buffer);
  } finally {
    clearTimeout(timeoutId);
  }

  return full;
}

/**
 * 测试 API 连通性（设置页「测试连接」）。
 * @param {{baseUrl,apiKey,model}} [probe] 允许传入未保存的配置预验证
 */
export async function testConnection(probe) {
  const cfg = probe || getApiConfig();
  if (!cfg || !cfg.baseUrl || !cfg.apiKey) {
    throw new Error('请先填写 Base URL 与 API Key');
  }
  const model = cfg.model || 'gpt-3.5-turbo';
  const messages = [
    { role: 'system', content: '你是连接测试助手，只回复 OK 两个字。' },
    { role: 'user', content: 'ping' },
  ];
  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(), 60000);

  let resp;
  try {
    resp = await fetch(`${cfg.baseUrl}/chat/completions`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${cfg.apiKey}`,
      },
      body: JSON.stringify({ model, messages, temperature: 0.1, top_p: 0.1 }),
      signal: controller.signal,
    });
  } finally {
    clearTimeout(timeoutId);
  }
  if (!resp.ok) {
    let detail = '';
    try {
      detail = (await resp.text()).slice(0, 300);
    } catch (e) {}
    throw new Error(`HTTP ${resp.status}：${detail}`);
  }
  const json = await resp.json();
  const text = json?.choices?.[0]?.message?.content;
  if (!text || !text.trim()) throw new Error('接口返回内容为空');
  return `连接成功（模型 ${model}，已收到回复）`;
}

/**
 * 解析 LLM 返回的 JSON，多策略容错（与后端一致）。失败返回 null。
 */
export function extractJson(text) {
  if (typeof text !== 'string') return null;
  let jsonText = text;
  if (jsonText.includes('```')) {
    const parts = jsonText.split('```');
    if (parts.length >= 2) {
      jsonText = parts[1];
      if (jsonText.startsWith('json')) jsonText = jsonText.slice(4);
      jsonText = jsonText.trim();
    }
  }
  const start = jsonText.indexOf('{');
  const end = jsonText.lastIndexOf('}');
  if (start >= 0 && end > start) jsonText = jsonText.slice(start, end + 1);
  jsonText = jsonText.replace(/,(\s*[}\]])/g, '$1');
  try {
    return JSON.parse(jsonText);
  } catch (e) {
    return null;
  }
}
