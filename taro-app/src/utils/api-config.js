// 用户自有 API 配置（开源网页版）
// 首次打开时由「配置页 / 设置页」填写，保存在浏览器本地（Taro 存储 = localStorage）。
// 仅支持 OpenAI 兼容接口：{ baseUrl(含 /v1), apiKey, model }
// 统一复用 store 的 setting 存储，避免配置页与设置页各写各的。
import Taro from '@tarojs/taro';
import * as store from './store';

function normalize(cfg) {
  return {
    baseUrl: (cfg.customBaseUrl || '').trim().replace(/\/+$/, ''),
    apiKey: (cfg.customApiKey || '').trim(),
    model: (cfg.customModel || '').trim(),
  };
}

export function getApiConfig() {
  return normalize(store.get_setting());
}

export function setApiConfig(cfg) {
  const next = normalize({
    customBaseUrl: (cfg.baseUrl || '').trim().replace(/\/+$/, ''),
    customApiKey: (cfg.apiKey || '').trim(),
    customModel: (cfg.model || '').trim(),
  });
  store.set_setting({
    aiProvider: 'custom',
    customBaseUrl: next.baseUrl,
    customApiKey: next.apiKey,
    customModel: next.model,
  });
  return next;
}

// 是否已完成首次 API 配置（baseUrl + apiKey 缺一不可）
export function hasApiConfig() {
  const c = getApiConfig();
  return !!(c.baseUrl && c.apiKey);
}

// 无配置时把页面重定向到首次配置页（setup）
export function ensureApiConfig() {
  if (!hasApiConfig()) {
    try {
      Taro.reLaunch({ url: '/pages/setup/index' });
    } catch (e) {}
    return false;
  }
  return true;
}
