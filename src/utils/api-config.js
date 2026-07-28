// 用户自有 API 配置（开源网页版）
// 首次打开时由「配置页 / 设置页」填写，保存在浏览器本地（Taro 存储 = localStorage）。
// 仅支持 OpenAI 兼容接口：{ baseUrl(含 /v1), apiKey, model }
// 统一复用 store 的 setting 存储，避免配置页与设置页各写各的。
import Taro from '@tarojs/taro';
import * as store from './store';

function normalize(cfg) {
  let baseUrl = (cfg.customBaseUrl || '').trim().replace(/\/+$/, '');
  // 开发环境允许 http://localhost，生产环境强制 https://
  if (baseUrl && baseUrl.startsWith('http://') && !baseUrl.includes('localhost') && !baseUrl.includes('127.0.0.1')) {
    baseUrl = baseUrl.replace('http://', 'https://');
  }
  return {
    baseUrl,
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

// 检查是否需要配置，返回 true=已配置 / false=需要配置
// 不再自动跳转，由页面自行决定如何展示配置入口
export function ensureApiConfig() {
  return hasApiConfig();
}
