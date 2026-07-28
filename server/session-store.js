const fs = require('fs');
const path = require('path');

const DATA_DIR = path.join(__dirname, '..', '.data');
const SESSIONS_FILE = path.join(DATA_DIR, 'feishu-sessions.json');

function ensureDir() {
  if (!fs.existsSync(DATA_DIR)) fs.mkdirSync(DATA_DIR, { recursive: true });
}

function loadAll() {
  ensureDir();
  if (!fs.existsSync(SESSIONS_FILE)) return {};
  try {
    return JSON.parse(fs.readFileSync(SESSIONS_FILE, 'utf-8'));
  } catch (e) {
    return {};
  }
}

function saveAll(sessions) {
  ensureDir();
  fs.writeFileSync(SESSIONS_FILE, JSON.stringify(sessions, null, 2), 'utf-8');
}

function getSession(userId) {
  const all = loadAll();
  return all[userId] || null;
}

function setSession(userId, session) {
  const all = loadAll();
  all[userId] = session;
  saveAll(all);
}

function deleteSession(userId) {
  const all = loadAll();
  delete all[userId];
  saveAll(all);
}

module.exports = { getSession, setSession, deleteSession };
