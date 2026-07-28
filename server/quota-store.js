// 配额存储：每 IP + clientId 双重识别，按天重置
// 文件持久化在 .data/quota.json，7 天前的数据自动清理
const fs = require('fs');
const path = require('path');

const DATA_DIR = path.join(__dirname, '..', '.data');
const QUOTA_FILE = path.join(DATA_DIR, 'quota.json');

let cache = null;
let saveTimer = null;

function todayKey() {
  const d = new Date();
  // 用本地日期（服务器本地时区，Render 默认 UTC，可在环境变量 TZ 调整）
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
}

function load() {
  if (cache) return cache;
  try {
    cache = JSON.parse(fs.readFileSync(QUOTA_FILE, 'utf-8'));
  } catch (e) {
    cache = {};
  }
  return cache;
}

function save() {
  if (saveTimer) clearTimeout(saveTimer);
  // 防抖：100ms 内的多次写合并
  saveTimer = setTimeout(() => {
    try {
      if (!fs.existsSync(DATA_DIR)) fs.mkdirSync(DATA_DIR, { recursive: true });
      fs.writeFileSync(QUOTA_FILE, JSON.stringify(cache, null, 2));
    } catch (e) {
      console.error('[quota] save error:', e);
    }
  }, 100);
}

function keyOf(ip, clientId) {
  // 主键：clientId（浏览器维度，更准）
  // 辅助：ip（清缓存换浏览器时也能拦一道）
  return `${ip || 'unknown'}|${clientId || 'unknown'}`;
}

function getRemaining(ip, clientId, limit = 3) {
  const data = load();
  const tk = todayKey();
  const dayData = data[tk] || {};
  const key = keyOf(ip, clientId);
  const count = dayData[key] || 0;
  return Math.max(0, limit - count);
}

function consume(ip, clientId, limit = 3) {
  const data = load();
  const tk = todayKey();
  if (!data[tk]) data[tk] = {};
  const key = keyOf(ip, clientId);
  const current = data[tk][key] || 0;
  if (current >= limit) {
    return { ok: false, remaining: 0, limit };
  }
  data[tk][key] = current + 1;
  save();
  return { ok: true, remaining: limit - current - 1, limit };
}

// 自动清理 7 天前的数据，避免文件无限增长
function cleanup() {
  const data = load();
  const today = new Date();
  let changed = false;
  for (const k of Object.keys(data)) {
    const parts = k.split('-').map(Number);
    if (parts.length !== 3 || parts.some(isNaN)) {
      delete data[k];
      changed = true;
      continue;
    }
    const date = new Date(parts[0], parts[1] - 1, parts[2]);
    const diff = (today - date) / (24 * 60 * 60 * 1000);
    if (diff > 7) {
      delete data[k];
      changed = true;
    }
  }
  if (changed) save();
}

// 启动时清理一次
cleanup();

module.exports = { getRemaining, consume, cleanup, todayKey };
