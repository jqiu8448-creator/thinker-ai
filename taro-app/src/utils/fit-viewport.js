// 响应式适配：让网页在手机与电脑上都好看。
//
// Taro 在 index.html 注入的运行时脚本会按「整个窗口宽度」设置根字号
// （html font-size = 40 * min(宽,高) / 750），导致 750rpx 在电脑上等于整窗宽，
// 字号被成倍放大、所有 % / rpx 容器被拉成超宽——这是"网页在电脑上很丑"的根因。
//
// 处理策略：
//  - 手机 / 平板竖屏（< 768px）：沿用 Taro 原逻辑（按窗口宽缩放），保持小程序体验。
//  - 电脑端（≥ 768px）：根字号固定为网页舒适值（DESKTOP_BASE），让正文约 16~17px、
//    标题约 30px，与列宽解耦；列宽由 CSS 的 #app max-width 控制（见 app.scss）。
//  并在 load / resize / orientationchange 时覆盖 Taro 在整窗下的重设。

const DESKTOP_BASE = 22; // 桌面端固定根字号(px)：30rpx≈16.5px 正文、56rpx≈30px 标题
const DESKTOP_MIN_WIDTH = 768;

function apply() {
  const docEl = document.documentElement;
  const clientWidth = docEl.clientWidth || window.innerWidth || 375;
  if (clientWidth < DESKTOP_MIN_WIDTH) {
    // 手机/平板：沿用 Taro 公式（1rem = 40rpx）
    let x = (40 * clientWidth) / 750;
    if (x >= 40) x = 40;
    else if (x <= 20) x = 20;
    docEl.style.fontSize = x + 'px';
  } else {
    // 桌面：固定根字号，呈现正常网页字号
    docEl.style.fontSize = DESKTOP_BASE + 'px';
  }
}

export function fitViewport() {
  apply();
  window.addEventListener('resize', apply);
  window.addEventListener('orientationchange', apply);
  window.addEventListener('load', apply);
}
