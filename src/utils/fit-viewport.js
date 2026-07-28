// 响应式适配：让网页在手机与电脑上都好看。
//
// Taro H5 运行时会按窗口宽度设置 html.style.fontSize，桌面端会把 rpx 撑成超宽。
// 本模块在桌面端用 CSS !important 注入 <style> 标签，直接覆盖 Taro 的内联样式。
// 这是最可靠的方式，因为 !important 优先级高于内联 style。

const DESKTOP_BASE = 22; // 桌面端固定根字号(px)
const DESKTOP_MIN_WIDTH = 768;
const STYLE_ID = 'fit-viewport-style';

let styleEl = null;
let observer = null;
let pollTimer = null;

function apply() {
  const docEl = document.documentElement;
  const clientWidth = docEl.clientWidth || window.innerWidth || 375;

  if (clientWidth < DESKTOP_MIN_WIDTH) {
    // 手机/平板：移除 !important 覆盖，沿用 Taro 公式
    removeStyle();
    let x = (40 * clientWidth) / 750;
    if (x >= 40) x = 40;
    else if (x <= 20) x = 20;
    docEl.style.fontSize = x + 'px';
  } else {
    // 桌面：注入 !important CSS 覆盖 Taro 的内联 fontSize
    injectStyle();
    // 同时直接设置内联样式作为双保险
    docEl.style.fontSize = DESKTOP_BASE + 'px';
  }
}

function injectStyle() {
  if (styleEl) return; // 已注入
  styleEl = document.createElement('style');
  styleEl.id = STYLE_ID;
  styleEl.textContent = `html { font-size: ${DESKTOP_BASE}px !important; }`;
  document.head.appendChild(styleEl);

  // 额外保险：MutationObserver 监听 html style 变化
  // 虽然 !important 已经覆盖，但某些极端情况仍需要
  const docEl = document.documentElement;
  if (observer) observer.disconnect();
  observer = new MutationObserver(() => {
    const cur = docEl.style.fontSize;
    const expected = DESKTOP_BASE + 'px';
    if (cur !== expected) {
      docEl.style.fontSize = expected;
    }
  });
  observer.observe(docEl, { attributes: true, attributeFilter: ['style'] });
}

function removeStyle() {
  if (styleEl) {
    styleEl.remove();
    styleEl = null;
  }
  if (observer) {
    observer.disconnect();
    observer = null;
  }
}

export function fitViewport() {
  // 立即执行
  apply();

  // 监听窗口变化
  window.addEventListener('resize', apply);
  window.addEventListener('orientationchange', apply);

  // DOMContentLoaded
  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', apply);
  } else {
    apply();
  }

  // 在关键时机重新执行，覆盖 Taro 运行时的初始化
  requestAnimationFrame(() => apply());
  setTimeout(() => apply(), 0);
  setTimeout(() => apply(), 50);
  setTimeout(() => apply(), 150);
  setTimeout(() => apply(), 300);
  setTimeout(() => apply(), 500);
  setTimeout(() => apply(), 1000);
  setTimeout(() => apply(), 2000);

  // 前 5 秒内每 500ms 轮询一次
  let pollCount = 0;
  if (pollTimer) clearInterval(pollTimer);
  pollTimer = setInterval(() => {
    apply();
    pollCount++;
    if (pollCount >= 10) {
      clearInterval(pollTimer);
      pollTimer = null;
    }
  }, 500);
}