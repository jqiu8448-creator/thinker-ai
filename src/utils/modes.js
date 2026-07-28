// 对话模式与时间格式化的统一工具

// 对话模式 -> 中文名
export const MODE_NAME = {
  duixi: '对席',
  dubai: '独白',
  oude: '偶得',
  huiyin: '会饮',
};

// 根据模式 key 返回中文名（未知时回退为「对席」）
export function modeName(mode) {
  return MODE_NAME[mode] || '对席';
}

// 时间格式化（相对时间 + 日期回退）
export function fmtTime(iso) {
  if (!iso) return '';
  try {
    const d = new Date(iso);
    if (isNaN(d.getTime())) return '';
    const diff = (Date.now() - d.getTime()) / 1000;
    if (diff < 60) return '刚刚';
    if (diff < 3600) return Math.floor(diff / 60) + ' 分钟前';
    if (diff < 86400) return Math.floor(diff / 3600) + ' 小时前';
    if (diff < 86400 * 7) return Math.floor(diff / 86400) + ' 天前';
    const now = new Date();
    if (d.getFullYear() === now.getFullYear()) {
      return `${d.getMonth() + 1}/${d.getDate()}`;
    }
    return `${d.getFullYear()}/${d.getMonth() + 1}/${d.getDate()}`;
  } catch (e) {
    return '';
  }
}
