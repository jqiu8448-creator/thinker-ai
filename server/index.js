// 思想家AI 托管后端
// 同时支持：网页托管 + LLM 代理 + 配额管理 + 飞书机器人
require('dotenv').config();
const express = require('express');
const bodyParser = require('body-parser');
const path = require('path');
const fs = require('fs');

const { parseEvent } = require('./feishu');
const { handleMessage } = require('./bot');
const { streamChat, isConfigured, getModel } = require('./llm-proxy');
const quota = require('./quota-store');

const app = express();
const PORT = process.env.PORT || 3000;
const DAILY_LIMIT = parseInt(process.env.DAILY_LIMIT || '3', 10);
// Taro H5 构建产物在 dist/（见 config/index.js 的 outputRoot）
const STATIC_DIR = path.join(__dirname, '..', 'dist');

app.use(bodyParser.json({ limit: '1mb' }));
// 信任 Render 反向代理，让 req.ip 拿到真实访客 IP
app.set('trust proxy', true);

function getClientIp(req) {
  return (req.headers['x-forwarded-for'] || req.socket.remoteAddress || '')
    .split(',')[0]
    .trim();
}
function getClientId(req) {
  return (req.headers['x-client-id'] || (req.body && req.body.clientId) || '')
    .toString()
    .trim();
}

// ============ 托管 API ============

// 托管配置（前端启动时调一次）
app.get('/api/hosted-config', (req, res) => {
  res.json({
    hosted: true,
    dailyLimit: DAILY_LIMIT,
    llmConfigured: isConfigured(),
    model: getModel(),
  });
});

// 查询当前剩余配额
app.get('/api/quota', (req, res) => {
  const ip = getClientIp(req);
  const clientId = getClientId(req) || 'unknown';
  const remaining = quota.getRemaining(ip, clientId, DAILY_LIMIT);
  res.json({ ok: true, remaining, limit: DAILY_LIMIT });
});

// 检查并扣减配额（每次发起对话前调一次）
app.post('/api/ask', (req, res) => {
  const ip = getClientIp(req);
  const clientId = getClientId(req) || 'unknown';

  if (!isConfigured()) {
    return res.status(503).json({ ok: false, error: '后端未配置 LLM API' });
  }

  const result = quota.consume(ip, clientId, DAILY_LIMIT);
  if (!result.ok) {
    return res.status(429).json({
      ok: false,
      error: `今日配额已用完（每人每天 ${DAILY_LIMIT} 题），明日重置`,
      remaining: 0,
      limit: DAILY_LIMIT,
    });
  }
  res.json({ ok: true, ...result });
});

// LLM 流式代理（已扣过配额才调）
app.post('/api/chat', async (req, res) => {
  try {
    const { messages, temperature, topP, maxTokens } = req.body || {};
    if (!Array.isArray(messages) || !messages.length) {
      return res.status(400).json({ ok: false, error: '参数错误：messages 为空' });
    }
    await streamChat({ messages, temperature, topP, maxTokens }, res);
  } catch (e) {
    console.error('[/api/chat] error:', e);
    if (!res.headersSent) {
      res.status(500).json({ ok: false, error: e.message });
    } else if (!res.writableEnded) {
      try {
        res.write(`data: [ERROR] ${e.message}\n\n`);
      } catch (_) {}
      res.end();
    }
  }
});

// 健康检查（UptimeRobot 保活用）
app.get('/health', (req, res) => {
  res.json({ status: 'ok', uptime: process.uptime(), hosted: true, llm: isConfigured() });
});

// ============ 飞书 webhook（保留原有功能） ============
app.post('/feishu/webhook', async (req, res) => {
  try {
    const evt = parseEvent(req.body);

    if (evt.type === 'url_verification') {
      return res.json({ challenge: evt.challenge });
    }

    res.status(200).json({ code: 0, msg: 'ok' });

    if (evt.type === 'message' && evt.chatType === 'p2p') {
      handleMessage(evt.userId, evt.text).catch((err) => {
        console.error('处理消息失败:', err);
      });
    }
  } catch (e) {
    console.error('webhook error:', e);
    res.status(500).json({ code: 500, msg: 'error' });
  }
});

// ============ 静态文件服务（H5 前端） ============
app.use(
  express.static(STATIC_DIR, {
    index: false, // index.html 单独处理，注入托管标记
    maxAge: '1h',
  })
);

// SPA fallback：未匹配的路由返回注入标记的 index.html
app.get('*', (req, res, next) => {
  // 跳过 API 路径
  if (
    req.path.startsWith('/api/') ||
    req.path.startsWith('/feishu/') ||
    req.path === '/health'
  ) {
    return res.status(404).json({ ok: false, error: 'Not found' });
  }
  const indexPath = path.join(STATIC_DIR, 'index.html');
  if (!fs.existsSync(indexPath)) {
    return res
      .status(404)
      .send('前端未构建，请先运行 npm run build:h5');
  }
  let html = fs.readFileSync(indexPath, 'utf-8');
  // 注入托管标记，让前端识别"已托管"状态
  const injected = `window.__HOSTED__=${JSON.stringify({
    hosted: true,
    dailyLimit: DAILY_LIMIT,
    llmConfigured: isConfigured(),
    model: getModel(),
  })};`;
  if (html.includes('</head>')) {
    html = html.replace('</head>', `<script>${injected}</script></head>`);
  } else {
    html = `<script>${injected}</script>` + html;
  }
  res.type('html').send(html);
});

app.listen(PORT, () => {
  console.log(`思想家AI 已启动: http://localhost:${PORT}`);
  console.log(`- 托管模式: ${isConfigured() ? '已配置 LLM' : '未配置 LLM（请设置环境变量）'}`);
  console.log(`- 每日配额: ${DAILY_LIMIT} 题/人`);
  console.log(`- 飞书 webhook: /feishu/webhook`);
});
