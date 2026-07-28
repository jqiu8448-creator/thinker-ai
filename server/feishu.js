const BASE_URL = 'https://open.feishu.cn/open-apis';

let _tenantToken = null;
let _tokenExpireAt = 0;

async function getTenantToken() {
  const now = Date.now();
  if (_tenantToken && now < _tokenExpireAt - 60000) return _tenantToken;

  const appId = process.env.FEISHU_APP_ID;
  const appSecret = process.env.FEISHU_APP_SECRET;

  const res = await fetch(`${BASE_URL}/auth/v3/tenant_access_token/internal`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ app_id: appId, app_secret: appSecret }),
  });
  const data = await res.json();
  if (data.code !== 0) throw new Error('获取 tenant_token 失败: ' + data.msg);

  _tenantToken = data.tenant_access_token;
  _tokenExpireAt = now + data.expire * 1000;
  return _tenantToken;
}

async function sendText(userId, text) {
  const token = await getTenantToken();
  const res = await fetch(`${BASE_URL}/im/v1/messages?receive_id_type=user_id`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${token}`,
    },
    body: JSON.stringify({
      receive_id: userId,
      msg_type: 'text',
      content: JSON.stringify({ text }),
    }),
  });
  const data = await res.json();
  if (data.code !== 0) console.error('发送消息失败:', data);
  return data;
}

async function sendInteractive(userId, card) {
  const token = await getTenantToken();
  const res = await fetch(`${BASE_URL}/im/v1/messages?receive_id_type=user_id`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${token}`,
    },
    body: JSON.stringify({
      receive_id: userId,
      msg_type: 'interactive',
      content: JSON.stringify(card),
    }),
  });
  const data = await res.json();
  if (data.code !== 0) console.error('发送卡片失败:', data);
  return data;
}

function parseEvent(body) {
  if (body.type === 'url_verification') {
    return { type: 'url_verification', challenge: body.challenge };
  }
  if (body.header && body.header.event_type === 'im.message.receive_v1') {
    const evt = body.event;
    const userId = evt.sender.sender_id.user_id;
    let text = '';
    try {
      const content = JSON.parse(evt.message.content);
      text = content.text || '';
    } catch (e) {}
    return {
      type: 'message',
      userId,
      text: text.trim(),
      messageId: evt.message.message_id,
      chatType: evt.message.chat_type,
    };
  }
  return { type: 'unknown' };
}

module.exports = { sendText, sendInteractive, parseEvent, getTenantToken };
