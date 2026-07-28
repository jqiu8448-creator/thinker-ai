require('dotenv').config();
const express = require('express');
const bodyParser = require('body-parser');
const { parseEvent } = require('./feishu');
const { handleMessage } = require('./bot');

const app = express();
const PORT = process.env.PORT || 3000;

app.use(bodyParser.json({ limit: '1mb' }));

app.get('/', (req, res) => {
  res.json({ status: 'ok', name: '思想家AI 飞书机器人' });
});

app.post('/feishu/webhook', async (req, res) => {
  try {
    const evt = parseEvent(req.body);

    if (evt.type === 'url_verification') {
      res.json({ challenge: evt.challenge });
      return;
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

app.listen(PORT, () => {
  console.log(`思想家AI 飞书机器人已启动: http://localhost:${PORT}`);
  console.log(`飞书事件回调地址: http://<你的域名>/feishu/webhook`);
});
