// 跨端全局状态（替代原生 getApp().globalData + ensureWatermark）
// 普通模块单例：H5 / 小程序同一份内存，无需 getApp()。
import Taro from '@tarojs/taro';
import { callCloud } from './cloud';

const FONT_KEY = 'thinker_ai_font_scale';
// 对话字号档位（rpx）：偏小 / 默认 / 偏大 / 较大
// 最大档仍受气泡 max-width: 88% 约束，自动换行不会破坏布局
export const FONT_SCALES = [
  { key: 'sm', label: '偏小', size: 30 },
  { key: 'md', label: '默认', size: 36 },
  { key: 'lg', label: '偏大', size: 42 },
  { key: 'xl', label: '较大', size: 46 },
];

function loadFontScale() {
  try {
    if (typeof Taro !== 'undefined' && Taro.getStorageSync) {
      const v = Taro.getStorageSync(FONT_KEY);
      if (v && FONT_SCALES.some((s) => s.key === v)) return v;
    }
  } catch (e) {}
  try {
    const v = localStorage.getItem(FONT_KEY);
    if (v && FONT_SCALES.some((s) => s.key === v)) return v;
  } catch (e) {}
  return 'md';
}

const state = {
  watermark: undefined, // 用户分享署名（undefined = 尚未拉取）
  thinkers: undefined, // 思想家名单（已按国别排序）
  lastSessionId: '', // 最近一次对话，供首页「继续上次对话」
  pendingMulti: null, // 首页多思想家模式带给会饮页的 { mode, topic }
  fontScale: loadFontScale(), // 对话字号档位：sm/md/lg/xl
};

export function getFontScale() {
  return state.fontScale;
}

export function setFontScale(key) {
  if (!FONT_SCALES.some((s) => s.key === key)) return;
  state.fontScale = key;
  try {
    if (typeof Taro !== 'undefined' && Taro.setStorageSync) {
      Taro.setStorageSync(FONT_KEY, key);
      return;
    }
  } catch (e) {}
  try {
    localStorage.setItem(FONT_KEY, key);
  } catch (e) {}
}

// 将字号档位应用到根元素（H5），便于 CSS 用 .chat-font-xxx 覆盖
export function applyFontScaleToDom() {
  if (typeof document === 'undefined') return;
  const root = document.documentElement;
  FONT_SCALES.forEach((s) => root.classList.remove('chat-font-' + s.key));
  root.classList.add('chat-font-' + state.fontScale);
}

export function getGlobal() {
  return state;
}

// 预取用户分享署名，结果缓存，返回 Promise<string>
export function ensureWatermark() {
  if (state.watermark !== undefined) return Promise.resolve(state.watermark);
  return callCloud('get_setting')
    .then((r) => {
      state.watermark = r && r.ok && r.watermark ? r.watermark : '';
      return state.watermark;
    })
    .catch(() => {
      state.watermark = '';
      return '';
    });
}

// 清除水印缓存（设置页修改水印后调用）
export function invalidateWatermark() {
  state.watermark = undefined;
}
