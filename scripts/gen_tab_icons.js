// 生成 4 个 tab 图标（普通态 + 选中态），墨色暗调古风配色
// 纯 Node 实现 PNG(RGBA) 编码，无需第三方库
const fs = require("fs");
const zlib = require("zlib");
const path = require("path");

const W = 81, H = 81;

function makeCanvas() {
  return Buffer.alloc(W * H * 4); // 全透明
}

function setPx(img, x, y, c) {
  x = Math.round(x); y = Math.round(y);
  if (x < 0 || y < 0 || x >= W || y >= H) return;
  const i = (y * W + x) * 4;
  img[i] = c[0]; img[i + 1] = c[1]; img[i + 2] = c[2]; img[i + 3] = 255;
}

function fillCircle(img, cx, cy, r, c) {
  for (let y = Math.floor(cy - r); y <= cy + r; y++)
    for (let x = Math.floor(cx - r); x <= cx + r; x++) {
      const dx = x - cx, dy = y - cy;
      if (dx * dx + dy * dy <= r * r) setPx(img, x, y, c);
    }
}

function ring(img, cx, cy, r, thick, c) {
  const t = thick / 2;
  for (let y = Math.floor(cy - r - t); y <= cy + r + t; y++)
    for (let x = Math.floor(cx - r - t); x <= cx + r + t; x++) {
      const dx = x - cx, dy = y - cy;
      const d = Math.sqrt(dx * dx + dy * dy);
      if (Math.abs(d - r) <= t) setPx(img, x, y, c);
    }
}

function line(img, x0, y0, x1, y1, thick, c) {
  x0 = Math.round(x0); y0 = Math.round(y0); x1 = Math.round(x1); y1 = Math.round(y1);
  const dx = Math.abs(x1 - x0), dy = Math.abs(y1 - y0);
  const sx = x0 < x1 ? 1 : -1, sy = y0 < y1 ? 1 : -1;
  let err = dx - dy, x = x0, y = y0;
  const t = Math.max(1, thick / 2);
  while (true) {
    for (let oy = -Math.floor(t); oy <= Math.ceil(t); oy++)
      for (let ox = -Math.floor(t); ox <= Math.ceil(t); ox++)
        setPx(img, x + ox, y + oy, c);
    if (x === x1 && y === y1) break;
    const e2 = 2 * err;
    if (e2 > -dy) { err -= dy; x += sx; }
    if (e2 < dx) { err += dx; y += sy; }
  }
}

function rect(img, cx, cy, hw, hh, c) {
  for (let y = Math.round(cy - hh); y <= cy + hh; y++)
    for (let x = Math.round(cx - hw); x <= cx + hw; x++)
      setPx(img, x, y, c);
}

function roundRectOutline(img, x, y, w, h, r, thick, c) {
  // 简化：四条直边 + 四角弧
  const x1 = x, y1 = y, x2 = x + w, y2 = y + h;
  line(img, x1 + r, y1, x2 - r, y1, thick, c);
  line(img, x1 + r, y2, x2 - r, y2, thick, c);
  line(img, x1, y1 + r, x1, y2 - r, thick, c);
  line(img, x2, y1 + r, x2, y2 - r, thick, c);
  ring(img, x1 + r, y1 + r, r, thick, c);
  ring(img, x2 - r, y1 + r, r, thick, c);
  ring(img, x1 + r, y2 - r, r, thick, c);
  ring(img, x2 - r, y2 - r, r, thick, c);
}

// ===== 图标绘制 =====
function drawDui(img, c) { // 对偶：一对相交的圆（双）
  ring(img, 30, 40, 15, 4, c);
  ring(img, 51, 40, 15, 4, c);
}
function drawHui(img, c) { // 会饮：酒樽/杯
  // 杯身（上宽下窄梯形）+ 底座
  const topY = 20, botY = 50, topHW = 16, botHW = 9;
  for (let y = topY; y <= botY; y++) {
    const f = (y - topY) / (botY - topY);
    const hw = topHW + (botHW - topHW) * f;
    line(img, 40 - hw, y, 40 + hw, y, 4, c);
  }
  // 两侧斜壁
  line(img, 40 - topHW, topY, 40 - botHW, botY, 4, c);
  line(img, 40 + topHW, topY, 40 + botHW, botY, 4, c);
  // 杯口
  line(img, 40 - topHW - 3, topY, 40 + topHW + 3, topY, 4, c);
  // 底座
  line(img, 28, 56, 52, 56, 5, c);
  line(img, 40, botY, 40, 56, 4, c);
}
function drawThink(img, c) { // 思想家：头像 + 肩
  fillCircle(img, 40, 30, 15, c);     // 头（实心）
  // 肩：开口朝下的大弧
  ring(img, 40, 64, 22, 4, c);
  // 把头部以下、肩弧以内的区域镂空成透明（仅留轮廓感）
  // 这里头是实心，肩是弧，整体已可辨认
}
function drawSet(img, c) { // 设置：齿轮
  const cx = 40, cy = 40;
  // 8 齿
  for (let k = 0; k < 8; k++) {
    const a = (k * Math.PI) / 4;
    const tx = cx + Math.cos(a) * 24;
    const ty = cy + Math.sin(a) * 24;
    rect(img, tx, ty, 4, 4, c);
  }
  fillCircle(img, cx, cy, 19, c);  // 齿身
  // 中心镂空
  fillCircle(img, cx, cy, 7, [0, 0, 0]); // 透明：用 alpha=0 覆盖
  // 用透明覆盖中心
  for (let y = Math.floor(cy - 7); y <= cy + 7; y++)
    for (let x = Math.floor(cx - 7); x <= cx + 7; x++) {
      const dx = x - cx, dy = y - cy;
      if (dx * dx + dy * dy <= 7 * 7) {
        const i = (y * W + x) * 4;
        img[i + 3] = 0;
      }
    }
}

// ===== PNG 编码 =====
const CRC_TABLE = (() => {
  const t = new Uint32Array(256);
  for (let n = 0; n < 256; n++) {
    let c = n;
    for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
    t[n] = c >>> 0;
  }
  return t;
})();
function crc32(buf) {
  let c = 0xffffffff;
  for (let i = 0; i < buf.length; i++) c = CRC_TABLE[(c ^ buf[i]) & 0xff] ^ (c >>> 8);
  return (c ^ 0xffffffff) >>> 0;
}
function chunk(type, data) {
  const len = Buffer.alloc(4); len.writeUInt32BE(data.length, 0);
  const t = Buffer.from(type, "ascii");
  const crc = Buffer.alloc(4); crc.writeUInt32BE(crc32(Buffer.concat([t, data])), 0);
  return Buffer.concat([len, t, data, crc]);
}
function encodePNG(img) {
  const sig = Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]);
  const ihdr = Buffer.alloc(13);
  ihdr.writeUInt32BE(W, 0); ihdr.writeUInt32BE(H, 4);
  ihdr[8] = 8; ihdr[9] = 6; ihdr[10] = 0; ihdr[11] = 0; ihdr[12] = 0;
  // 每行前缀 filter 0
  const raw = Buffer.alloc((W * 4 + 1) * H);
  for (let y = 0; y < H; y++) {
    raw[y * (W * 4 + 1)] = 0;
    img.copy(raw, y * (W * 4 + 1) + 1, y * W * 4, y * W * 4 + W * 4);
  }
  const idat = zlib.deflateSync(raw);
  return Buffer.concat([sig, chunk("IHDR", ihdr), chunk("IDAT", idat), chunk("IEND", Buffer.alloc(0))]);
}

const NORMAL = [168, 152, 120];   // #a89878
const SELECTED = [200, 164, 92];  // #c8a45c

const icons = [
  { name: "dui", draw: drawDui },
  { name: "hui", draw: drawHui },
  { name: "think", draw: drawThink },
  { name: "set", draw: drawSet },
];

for (const ic of icons) {
  for (const [suffix, col] of [["", NORMAL], ["_on", SELECTED]]) {
    const img = makeCanvas();
    ic.draw(img, col);
    const png = encodePNG(img);
    const file = path.join(__dirname, "..", "miniprogram", "images", "tabbar", `tab_${ic.name}${suffix}.png`);
    fs.writeFileSync(file, png);
    console.log("wrote", file, png.length, "bytes");
  }
}
