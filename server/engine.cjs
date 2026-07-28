const path = require('path');
const fs = require('fs');

const thinkersData = JSON.parse(
  fs.readFileSync(path.join(__dirname, '..', 'src', 'data', 'thinkers.json'), 'utf-8')
);

const { MODES, MODE_PROMPTS, UNIVERSAL_NAMES } = require('./engine-modes.cjs');

const API_CONFIG = {
  baseUrl: process.env.LLM_BASE_URL || 'https://api.openai.com/v1',
  apiKey: process.env.LLM_API_KEY || '',
  model: process.env.LLM_MODEL || 'gpt-4o-mini',
};

async function generateText({ model, messages, temperature = 0.7, topP = 0.9, maxTokens, signal }) {
  const url = API_CONFIG.baseUrl.replace(/\/$/, '') + '/chat/completions';
  const res = await fetch(url, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${API_CONFIG.apiKey}`,
    },
    body: JSON.stringify({
      model: model || API_CONFIG.model,
      messages,
      temperature,
      top_p: topP,
      max_tokens: maxTokens,
      stream: false,
    }),
    signal,
  });
  if (!res.ok) {
    const text = await res.text();
    throw new Error(`LLM 请求失败: ${res.status} ${text}`);
  }
  const data = await res.json();
  return data.choices?.[0]?.message?.content || '';
}

async function generateTextStream({ model, messages, temperature = 0.7, topP = 0.9, maxTokens, onToken, signal }) {
  const url = API_CONFIG.baseUrl.replace(/\/$/, '') + '/chat/completions';
  const res = await fetch(url, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${API_CONFIG.apiKey}`,
    },
    body: JSON.stringify({
      model: model || API_CONFIG.model,
      messages,
      temperature,
      top_p: topP,
      max_tokens: maxTokens,
      stream: true,
    }),
    signal,
  });
  if (!res.ok) {
    const text = await res.text();
    throw new Error(`LLM 请求失败: ${res.status} ${text}`);
  }
  const reader = res.body.getReader();
  const decoder = new TextDecoder();
  let buffer = '';
  let fullText = '';
  while (true) {
    const { done, value } = await reader.read();
    if (done) break;
    buffer += decoder.decode(value, { stream: true });
    const lines = buffer.split('\n');
    buffer = lines.pop() || '';
    for (const line of lines) {
      const trimmed = line.trim();
      if (!trimmed || !trimmed.startsWith('data:')) continue;
      const dataStr = trimmed.slice(5).trim();
      if (dataStr === '[DONE]') continue;
      try {
        const data = JSON.parse(dataStr);
        const delta = data.choices?.[0]?.delta?.content || '';
        if (delta) {
          fullText += delta;
          if (onToken) onToken(delta);
        }
      } catch (e) {}
    }
  }
  return fullText;
}

function extractJson(text) {
  const match = text.match(/\{[\s\S]*\}/);
  if (!match) return null;
  try {
    return JSON.parse(match[0]);
  } catch (e) {
    return null;
  }
}

function getThinker(name) {
  const t = thinkersData.thinkers.find((x) => x.name === name);
  if (!t) return null;
  return {
    name: t.name,
    skill: t.skill,
    quote: t.quote,
    quoteSrc: t.quoteSrc,
    tagline: t.tagline,
  };
}

function listThinkers() {
  return thinkersData.thinkers.map((t) => ({ name: t.name, summary: t.summary }));
}

async function recommendThinkers(topic) {
  const prompt = `你是一位智慧引荐人。请根据话题，从以下思想家中推荐4位最适合的：

${listThinkers().map((t) => `- ${t.name}：${t.summary}`).join('\n')}

话题：${topic}

请返回 JSON 格式：
{
  "thinkers": [
    {"name": "姓名", "reason": "推荐理由"}
  ]
}

只返回 JSON，不要其他文字。`;

  const text = await generateText({
    messages: [
      { role: 'system', content: '你是智慧引荐人，推荐最适合的思想家。' },
      { role: 'user', content: prompt },
    ],
    temperature: 0.7,
  });
  const parsed = extractJson(text);
  if (parsed && parsed.thinkers) return parsed.thinkers;
  return listThinkers().slice(0, 4).map((t) => ({ name: t.name, reason: t.summary }));
}

async function thinkerRoute(message, thinkerName, mode, history = [], onToken = null, signal = null) {
  const thinker = getThinker(thinkerName);
  if (!thinker) throw new Error('找不到思想家: ' + thinkerName);

  const modePrompt = MODE_PROMPTS[mode] || MODE_PROMPTS.duixi;
  const systemPrompt = `${thinker.skill}\n\n${modePrompt}`;

  const msgs = [
    { role: 'system', content: systemPrompt },
    ...history.map((h) => ({
      role: h.role === 'user' ? 'user' : 'assistant',
      content: h.content,
    })),
    { role: 'user', content: message },
  ];

  if (onToken) {
    return await generateTextStream({ messages: msgs, onToken, signal });
  }
  return await generateText({ messages: msgs, signal });
}

async function suggestPanel(topic, mode) {
  const prompt = `话题：${topic}
模式：${mode === 'oude' ? '偶得（多视角各抒己见）' : '会饮（多轮辩论交锋）'}

从以下思想家中推荐3位：
${listThinkers().map((t) => `- ${t.name}`).join('\n')}

返回 JSON：
{"panel": ["姓名1", "姓名2", "姓名3"]}

只返回 JSON。`;

  const text = await generateText({
    messages: [
      { role: 'system', content: '你是思想晚宴的策划人。' },
      { role: 'user', content: prompt },
    ],
    temperature: 0.7,
  });
  const parsed = extractJson(text);
  if (parsed && parsed.panel && Array.isArray(parsed.panel)) return parsed.panel;
  return ['王阳明', '庄子', '尼采'];
}

async function multiThinkerRoute({ lead, mode, topic, message, history, panel, signal }) {
  const replies = [];
  const isHuiyin = mode === 'huiyin';
  const rounds = isHuiyin ? 2 : 1;

  for (let r = 0; r < rounds; r++) {
    for (let i = 0; i < panel.length; i++) {
      const thinkerName = panel[i];
      const thinker = getThinker(thinkerName);
      if (!thinker) continue;

      const transcript = replies
        .map((rp) => `${rp.thinker}：${rp.content}`)
        .join('\n\n');

      let userPrompt;
      if (isHuiyin) {
        userPrompt = `【话题】${topic}\n【讨论记录】\n${transcript}\n【当前发言】${thinkerName}，请针对前面的发言发表你的看法，表达你的观点，也可以反驳别人。\n\n用户：${message}`;
      } else {
        userPrompt = `【话题】${topic}\n【用户提问】${message}\n请从你的视角谈谈看法。`;
      }

      const content = await thinkerRoute(userPrompt, thinkerName, mode, [], null, signal);
      replies.push({
        thinker: thinkerName,
        content,
        round: r + 1,
        quote: thinker.quote,
      });
    }
  }

  return { replies, panel };
}

module.exports = {
  recommendThinkers,
  thinkerRoute,
  multiThinkerRoute,
  suggestPanel,
  listThinkers,
  getThinker,
  generateText,
  MODES,
};
