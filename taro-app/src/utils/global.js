// 跨端全局状态（替代原生 getApp().globalData + ensureWatermark）
// 普通模块单例：H5 / 小程序同一份内存，无需 getApp()。
import { callCloud } from './cloud';

const state = {
  watermark: undefined, // 用户分享署名（undefined = 尚未拉取）
  thinkers: undefined, // 思想家名单（已按国别排序）
  lastSessionId: '', // 最近一次对话，供首页「继续上次对话」
  pendingMulti: null, // 首页多思想家模式带给会饮页的 { mode, topic }
};

export function getGlobal() {
  return state;
}

// 预取用户分享署名，结果缓存（仅首次），返回 Promise<string>
export function ensureWatermark() {
  if (state.watermark !== undefined) return Promise.resolve(state.watermark);
  return Promise.resolve(callCloud('get_setting'))
    .then((r) => {
      state.watermark = r && r.ok && r.watermark ? r.watermark : '';
      return state.watermark;
    })
    .catch(() => {
      state.watermark = '';
      return '';
    });
}
