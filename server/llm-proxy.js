// LLM 流式代理：从环境变量读 API key，转发前端请求并流式返回
// 前端不再直接调 LLM，避免 API key 泄露
require('dotenv').config();

const LLM_BASE_URL = (process.env.LLM_BASE_URL || '').trim().replace(/\/+$/, '');
const LLM_API_KEY = (process.env.LLM_API_KEY || '').trim();
const LLM_MODEL = (process.env.LLM_MODEL || 'gpt-3.5-turbo').trim();

function isConfigured() {
  return !!(LLM_BASE_URL && LLM_API_KEY);
}

/**
 * 流式调用 LLM 并把 SSE 透传给 Express response。
 * 失败时调用 next(err)，由调用方统一处理。
 *
 * @param {object} opts { messages, temperature, topP, maxTokens }
 * @param {import('express').Response} res  Express Response（已开启流式写入）
 */
async function streamChat({ messages, temperature = 0.7, topP = 0.9, maxTokens }, res) {
  if (!isConfigured()) {
    throw new Error('后端未配置 LLM_API_KEY / LLM_BASE_URL，请在环境变量中设置');
  }

  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(), 300000); // 流式最长 5 分钟
  // 客户端断开时取消上游请求，避免无意义占用配额
  res.on('close', () => {
    if (!res.writableEnded) controller.abort();
  });

  let resp;
  try {
    resp = await fetch(`${LLM_BASE_URL}/chat/completions`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${LLM_API_KEY}`,
      },
      body: JSON.stringify({
        model: LLM_MODEL,
        messages,
        temperature,
        top_p: topP,
        ...(maxTokens ? { max_tokens: maxTokens } : {}),
        stream: true,
      }),
      signal: controller.signal,
    });
  } catch (e) {
    clearTimeout(timeoutId);
    throw new Error(`LLM 连接失败: ${e.message}`);
  }

  if (!resp.ok) {
    clearTimeout(timeoutId);
    let detail = '';
    try {
      detail = (await resp.text()).slice(0, 300);
    } catch (e) {}
    throw new Error(`LLM HTTP ${resp.status}: ${detail}`);
  }

  // 流式头
  res.setHeader('Content-Type', 'text/event-stream; charset=utf-8');
  res.setHeader('Cache-Control', 'no-cache, no-transform');
  res.setHeader('Connection', 'keep-alive');
  // 禁用反向代理缓冲，保证流式输出
  res.setHeader('X-Accel-Buffering', 'no');

  const reader = resp.body.getReader();
  const decoder = new TextDecoder('utf-8');

  try {
    while (true) {
      const { done, value } = await reader.read();
      if (done) break;
      const chunk = decoder.decode(value, { stream: true });
      if (!res.write(chunk)) {
        // backpressure：等 drain
        await new Promise((r) => res.once('drain', r));
      }
    }
  } catch (e) {
    // 客户端断开 / 上游中断：吞掉错误，避免污染日志
    if (!res.writableEnded) {
      try {
        res.write(`data: [DONE]\n\n`);
      } catch (_) {}
    }
  } finally {
    clearTimeout(timeoutId);
    if (!res.writableEnded) res.end();
  }
}

module.exports = { streamChat, isConfigured, getModel: () => LLM_MODEL };
