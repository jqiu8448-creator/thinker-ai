// 前端 LLM 客户端（OpenAI 兼容）
// 浏览器内直连用户自有接口，不依赖任何后端。
// 与 server/lib/llm.js 的 generateViaOpenAI 行为一致（非流式，返回完整文本）。
import { getApiConfig } from './api-config';

/**
 * 调用 chat/completions，返回助手回复文本。
 * @param {object} opts
 * @param {string} [opts.model]   业务层建议的模型（自定义接口下以用户配置为准）
 * @param {Array}  opts.messages  [{role, content}, ...]
 * @param {number} [opts.temperature]
 * @param {number} [opts.topP]
 */
export async function generateText({ model, messages, temperature = 0.7, topP = 0.9 }) {
  const cfg = getApiConfig();
  if (!cfg || !cfg.baseUrl || !cfg.apiKey) {
    throw new Error('尚未配置 API（请在设置中填写 Base URL 与 API Key）');
  }
  const usedModel = cfg.model || model || 'gpt-3.5-turbo';

  const resp = await fetch(`${cfg.baseUrl}/chat/completions`, {
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
    }),
  });

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
  const resp = await fetch(`${cfg.baseUrl}/chat/completions`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${cfg.apiKey}`,
    },
    body: JSON.stringify({ model, messages, temperature: 0.1, top_p: 0.1 }),
  });
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
