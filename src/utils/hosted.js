// 托管模式识别 + 客户端 ID 管理
// 后端通过 <script>window.__HOSTED__=...</script> 注入标记
// 托管模式下：前端不再自己配 API，统一调后端 /api/*
import Taro from '@tarojs/taro';

const CLIENT_ID_KEY = 'hosted_client_id';

export function isHosted() {
  return typeof window !== 'undefined' && window.__HOSTED__ && window.__HOSTED__.hosted === true;
}

export function getHostedConfig() {
  return isHosted() ? window.__HOSTED__ : null;
}

// 客户端 ID（持久化在 localStorage）：用于配额识别
// 同一浏览器始终用同一个 ID，避免刷新就丢配额
export function getClientId() {
  let id = '';
  try {
    id = Taro.getStorageSync(CLIENT_ID_KEY) || '';
  } catch (e) {}
  if (!id) {
    id = 'c_' + Date.now().toString(36) + Math.random().toString(36).slice(2, 8);
    try {
      Taro.setStorageSync(CLIENT_ID_KEY, id);
    } catch (e) {}
  }
  return id;
}

// 托管模式统一请求头（带 clientId）
export function hostedHeaders(extra = {}) {
  return Object.assign(
    {
      'Content-Type': 'application/json',
      'X-Client-Id': getClientId(),
    },
    extra
  );
}
