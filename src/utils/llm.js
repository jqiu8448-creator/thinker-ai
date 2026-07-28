// 前端 LLM 客户端（OpenAI 兼容）
// 浏览器内直连用户自有接口，不依赖任何后端。
// - generateText：非流式，返回完整文本（推荐/多人模式等一次性结果用）。
// - generateTextStream：流式，边收边回调 onToken(delta)，结束时返回完整文本；
//   对不支持流式的接口自动降级为非流式（仍会一次性把全文通过 onToken 给出）。
//
// 托管模式（window.__HOSTED__.hosted === true）下，所有请求走后端 /api/chat，
// API key 由后端持有，前端不接触。
import { getApiConfig } from './api-config';
import { isHosted, hostedHeaders } from './hosted';

/**
 * 调用 chat/completions，返回助手回复文本。
 * @param {object} opts
 * @param {string} [opts.model]   业务层建议的模型（自定义接口下以用户配置为准）
 * @param {Array}  opts.messages  [{role, content}, ...]
 * @param {number} [opts.temperature]
 * @param {number} [opts.topP]
 */
export async function generateText({ model, messages, temperature = 0.7, topP = 0.9, maxTokens, signal }) {
  if (isHosted()) {
    return await generateTextHosted({ messages, temperature, topP, maxTokens, signal });
  }
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
  if (isHosted()) {
    return await generateTextStreamHosted({ messages, temperature, topP, maxTokens, onToken, signal });
  }
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
  // 托管模式：后端已配置好 API，前端不需要测试
  if (isHosted()) {
    const cfg = (typeof window !== 'undefined' && window.__HOSTED__) || {};
    if (cfg.llmConfigured === false) {
      throw new Error('后端未配置 LLM API，请联系管理员');
    }
    return `托管模式已就绪（模型 ${cfg.model || 'unknown'}）`;
  }
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
 * API 压力测试：模拟对席模式（最长模式）的完整回复，统计 token 数、速度、首 token 延迟。
 * 用对席模式真实的 system prompt + maxTokens=6000，看完整跑下来实际消耗多少 token。
 * @param {{baseUrl, apiKey, model, onProgress, signal}} opts
 * @returns {Promise<{tokens: number, timeMs: number, firstTokenMs: number, text: string, complete: boolean, mode: string, maxTokens: number}>}
 */
export async function stressTest({ baseUrl, apiKey, model, onProgress, signal }) {
  // 模拟对席模式（最长模式）的真实场景
  const MODE_MAX_TOKENS = 6000;
  const startTs = Date.now();
  let firstTokenMs = -1;
  let totalTokens = 0;
  let fullText = '';
  let finished = false;

  // 对席模式真实的 system prompt（王阳明）
  const thinkerName = '王阳明';
  const modePrompt = `## 当前模式：对席（单人深度对话）

你正在以${thinkerName}的身份，与用户进行一对一的深度对话。

### 核心定位

你是一位富有阅历与智慧的长者，同时也是一位温和的心理陪伴者。
你不是在"讲述自己的人生"，而是在"用自己的经历与思想，回应用户此刻的困惑"。

### 对话原则

1. **角色代入**：你完全代入${thinkerName}的人格与经历。用"我"说话，引用你的真实经历、著作中的体悟，但落点始终在理解用户。

2. **心理咨询式引导**：
   - 先接住对方的情绪与处境，用共情语句开场
   - 用开放式提问引导对方表达内心："你觉得...？""在那一刻，你内心真正渴望的是什么？"
   - 不急于给答案，而是帮对方自己看清问题
   - 温柔、从容、有耐心，让对方感到被看见、被懂得

3. **回应方式**：
   - 首次回复：800-1200字，结合你的经历与思想，深度回应用户的困惑，并以提问引导
   - 后续回复：2-4句精准回应 + 1个开放式提问，持续引导对话深入
   - 不说教、不训诫、不摆大道理

4. **围绕主题**：所有对话围绕用户最初提出的问题展开，不支持闲聊。如果用户试图闲聊，温和地将话题引回最初的问题。`;

  const thinkerSkill = '明代心学集大成者，提出"致良知""知行合一"。龙场悟道，从贬谪中觉醒内心力量。历经宦海沉浮，平定宸濠之乱，深知世事艰难与内心光明的辩证。';

  const messages = [
    {
      role: 'system',
      content: `${thinkerSkill}\n\n${modePrompt}`,
    },
    {
      role: 'user',
      content: '最近工作压力很大，常常感到自己只是在完成任务，却找不到意义。年轻时那种热情好像消失了，每天都很疲惫，却又停不下来。我该怎么办？',
    },
  ];

  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(), 180000); // 长文给 3 分钟
  if (signal) signal.addEventListener('abort', () => controller.abort());

  let resp;
  try {
    resp = await fetch(`${baseUrl}/chat/completions`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${apiKey}`,
      },
      body: JSON.stringify({
        model: model || 'gpt-3.5-turbo',
        messages,
        temperature: 0.8,
        max_tokens: MODE_MAX_TOKENS,
        stream: true,
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
    throw new Error(`HTTP ${resp.status}：${detail}`);
  }

  const contentType = resp.headers && resp.headers.get ? resp.headers.get('content-type') || '' : '';
  if (!resp.body || !resp.body.getReader || !/text\/event-stream/.test(contentType)) {
    // 非流式，降级
    const json = await resp.json();
    const text = json?.choices?.[0]?.message?.content || '';
    fullText = text;
    totalTokens = approxTokenCount(text);
    firstTokenMs = Date.now() - startTs;
    finished = true;
    return {
      tokens: totalTokens,
      timeMs: Date.now() - startTs,
      firstTokenMs,
      text: fullText,
      complete: finished,
      mode: '对席（最长模式）',
      maxTokens: MODE_MAX_TOKENS,
    };
  }

  const reader = resp.body.getReader();
  const decoder = new TextDecoder('utf-8');
  let buffer = '';

  const consumeLine = (rawLine) => {
    const line = rawLine.trim();
    if (!line || !line.startsWith('data:')) return;
    const payload = line.slice(5).trim();
    if (payload === '[DONE]') {
      finished = true;
      return;
    }
    let json;
    try {
      json = JSON.parse(payload);
    } catch (e) {
      return;
    }
    const delta = json?.choices?.[0]?.delta?.content;
    if (delta) {
      if (firstTokenMs < 0) firstTokenMs = Date.now() - startTs;
      fullText += delta;
      totalTokens = approxTokenCount(fullText);
      if (onProgress) {
        onProgress({
          tokens: totalTokens,
          timeMs: Date.now() - startTs,
          firstTokenMs,
          text: fullText,
          done: false,
        });
      }
    }
    const finishReason = json?.choices?.[0]?.finish_reason;
    if (finishReason && finishReason !== 'null') {
      // stop=正常结束, length=达到 max_tokens 截断
      finished = finishReason === 'stop';
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
    if (buffer.trim()) consumeLine(buffer);
  } finally {
    clearTimeout(timeoutId);
  }

  return {
    tokens: totalTokens,
    timeMs: Date.now() - startTs,
    firstTokenMs,
    text: fullText,
    complete: finished,
    mode: '对席（最长模式）',
    maxTokens: MODE_MAX_TOKENS,
  };
}

/**
 * 粗略估算 token 数（中文按 1 字 ≈ 1.3 tokens，英文按 1 词 ≈ 1.3 tokens）
 * 不精确，但用于测试展示足够了
 */
function approxTokenCount(text) {
  if (!text) return 0;
  let cn = 0;
  let en = 0;
  let other = 0;
  for (const ch of text) {
    if (/[\u4e00-\u9fa5]/.test(ch)) {
      cn++;
    } else if (/[a-zA-Z]/.test(ch)) {
      en++;
    } else if (ch.trim()) {
      other++;
    }
  }
  const enWords = Math.max(1, Math.round(en / 5));
  return Math.round(cn * 1.3 + enWords * 1.3 + other * 0.5);
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

// ============ 托管模式实现 ============

// SSE 解析通用逻辑（与后端 streamChat 配合）
// /api/chat 始终返回 text/event-stream，前端读取并合并增量
async function readSSEStream(resp, onToken) {
  const contentType = resp.headers && resp.headers.get ? resp.headers.get('content-type') || '' : '';
  const isStream = /text\/event-stream/.test(contentType);

  if (!isStream || !resp.body || !resp.body.getReader) {
    const text = await resp.text();
    if (onToken && text) onToken(text);
    return text;
  }
  const reader = resp.body.getReader();
  const decoder = new TextDecoder('utf-8');
  let buffer = '';
  let full = '';

  const consumeLine = (rawLine) => {
    const line = rawLine.trim();
    if (!line || !line.startsWith('data:')) return;
    const payload = line.slice(5).trim();
    if (payload === '[DONE]' || payload === '') return;
    if (payload.startsWith('[ERROR]')) {
      throw new Error(payload.slice(7).trim() || '后端流式错误');
    }
    let json;
    try {
      json = JSON.parse(payload);
    } catch (e) {
      return;
    }
    const delta = json?.choices?.[0]?.delta?.content || json?.choices?.[0]?.message?.content || '';
    if (delta) {
      full += delta;
      if (onToken) onToken(delta);
    }
  };

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
  if (buffer.trim()) consumeLine(buffer);
  return full;
}

// 托管模式：非流式调用（等价于读完全部 SSE 后返回完整文本）
async function generateTextHosted({ messages, temperature, topP, maxTokens, signal }) {
  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(), 120000);
  if (signal) signal.addEventListener('abort', () => controller.abort());

  let resp;
  try {
    resp = await fetch('/api/chat', {
      method: 'POST',
      headers: hostedHeaders(),
      body: JSON.stringify({ messages, temperature, topP, maxTokens }),
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
    throw new Error(`后端 HTTP ${resp.status}：${detail}`);
  }

  return await readSSEStream(resp, null);
}

// 托管模式：流式调用
async function generateTextStreamHosted({ messages, temperature, topP, maxTokens, onToken, signal }) {
  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(), 300000); // 流式 5 分钟
  if (signal) signal.addEventListener('abort', () => controller.abort());

  let resp;
  try {
    resp = await fetch('/api/chat', {
      method: 'POST',
      headers: hostedHeaders(),
      body: JSON.stringify({ messages, temperature, topP, maxTokens }),
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
    throw new Error(`后端 HTTP ${resp.status}：${detail}`);
  }

  return await readSSEStream(resp, onToken);
}
