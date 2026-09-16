// アイコンPNGを生成する。
//
// なぜ生成するか: 画像編集の道具も依存パッケージも持ち込まずに、同じ図形を
// 全サイズで作りたいため。node:zlib だけで PNG を組み立て、形は距離関数で描く。
// 4×4 の多重標本で縁をならしているので、20px でも輪郭が潰れない。
//
// 図柄はコンボが積み上がる山形（シェブロン）の三連。色は段の色（緑→青→桃）と揃えてある。

import { deflateSync } from 'node:zlib';
import { writeFileSync, mkdirSync } from 'node:fs';

// ---- PNG の組み立て ----
const crcTable = Array.from({ length: 256 }, (_, n) => {
  let c = n;
  for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
  return c >>> 0;
});
const crc32 = (buf) => {
  let c = 0xffffffff;
  for (const b of buf) c = crcTable[(c ^ b) & 0xff] ^ (c >>> 8);
  return (c ^ 0xffffffff) >>> 0;
};
const chunk = (type, data) => {
  const len = Buffer.alloc(4);
  len.writeUInt32BE(data.length);
  const body = Buffer.concat([Buffer.from(type, 'ascii'), data]);
  const crc = Buffer.alloc(4);
  crc.writeUInt32BE(crc32(body));
  return Buffer.concat([len, body, crc]);
};
const png = (size, sample, height = size) => {
  const raw = Buffer.alloc(height * (size * 4 + 1));
  let p = 0;
  for (let y = 0; y < height; y++) {
    raw[p++] = 0;
    for (let x = 0; x < size; x++) {
      const [r, g, b, a] = sample(x, y);
      raw[p++] = r; raw[p++] = g; raw[p++] = b; raw[p++] = a;
    }
  }
  const ihdr = Buffer.alloc(13);
  ihdr.writeUInt32BE(size, 0);
  ihdr.writeUInt32BE(height, 4);
  ihdr[8] = 8;
  ihdr[9] = 6;
  return Buffer.concat([
    Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]),
    chunk('IHDR', ihdr),
    chunk('IDAT', deflateSync(raw, { level: 9 })),
    chunk('IEND', Buffer.alloc(0)),
  ]);
};

// ---- 形（すべて 0..1 の座標で書き、最後に大きさを掛ける）----
const segDist = (px, py, x1, y1, x2, y2) => {
  const dx = x2 - x1, dy = y2 - y1;
  const t = Math.max(0, Math.min(1, ((px - x1) * dx + (py - y1) * dy) / (dx * dx + dy * dy)));
  return Math.hypot(px - (x1 + t * dx), py - (y1 + t * dy));
};

/** 山形。中心 cx・下端 cy・半幅 hw・高さ h・太さ t */
const chevron = (px, py, cx, cy, hw, h, t) =>
  Math.min(
    segDist(px, py, cx - hw, cy, cx, cy - h),
    segDist(px, py, cx, cy - h, cx + hw, cy),
  ) <= t / 2;

const roundedRect = (px, py, r) => {
  const x = Math.min(px, 1 - px), y = Math.min(py, 1 - py);
  if (x >= r || y >= r) return px >= 0 && px <= 1 && py >= 0 && py <= 1;
  return Math.hypot(r - x, r - y) <= r;
};

// 下から上へ。段が上がるほど明るい色になる（本体の段の色と揃えてある）
const CHEVRONS = [
  { cy: 0.76, color: [0x57, 0xd0, 0x8a] },
  { cy: 0.58, color: [0x4a, 0xa8, 0xff] },
  { cy: 0.40, color: [0xff, 0x8f, 0xbf] },
];
const HW = 0.24, H = 0.13, T = 0.085;

/**
 * @param {boolean} opts.plate 暗い角丸の下地を敷くか（キーやプラグインの絵）
 * @param {number[]|null} opts.ink 単色で描く時の色。null なら段の色を使う
 */
const make = (size, { plate, ink, height }) => (x, y) => {
  const imgH = height ?? size;
  const S = 4; // 多重標本。縁をならす
  let r = 0, g = 0, b = 0, a = 0;
  for (let sy = 0; sy < S; sy++) {
    for (let sx = 0; sx < S; sx++) {
      // 縦長の絵では、図柄を正方形として中央に置く（縦に引き伸ばさない）
      const side = Math.min(size, imgH);
      const px = (x + (sx + 0.5) / S - (size - side) / 2) / side;
      const py = (y + (sy + 0.5) / S - (imgH - side) / 2) / side;
      let c = null;
      for (const ch of CHEVRONS) {
        if (chevron(px, py, 0.5, ch.cy, HW, H, T)) { c = ink ?? ch.color; break; }
      }
      if (!c && plate && roundedRect(px, py, 0.14)) c = [0x14, 0x18, 0x1c];
      if (c) { r += c[0]; g += c[1]; b += c[2]; a += 255; }
    }
  }
  const n = S * S;
  return a === 0 ? [0, 0, 0, 0] : [Math.round(r / (a / 255)), Math.round(g / (a / 255)), Math.round(b / (a / 255)), Math.round(a / n)];
};

const out = 'com.kanade0525.combocounter.sdPlugin/imgs';
mkdirSync(out, { recursive: true });

const files = [
  // キーに最初から出る絵。下地あり・段の色
  ['key', 72, { plate: true, ink: null }],
  ['key@2x', 144, { plate: true, ink: null }],
  // プラグインの顔。Marketplace の規定は 256×256 と、高DPI用の 512×512
  ['plugin', 256, { plate: true, ink: null }],
  ['plugin@2x', 512, { plate: true, ink: null }],
  // 一覧に並ぶ小さい絵。背景は透明・白単色（明るい地でも暗い地でも読める）
  ['action', 20, { plate: false, ink: [0xff, 0xff, 0xff] }],
  ['action@2x', 40, { plate: false, ink: [0xff, 0xff, 0xff] }],
  ['category', 28, { plate: false, ink: [0xff, 0xff, 0xff] }],
  ['category@2x', 56, { plate: false, ink: [0xff, 0xff, 0xff] }],
];
for (const [name, size, opts] of files) {
  const h = opts.height ?? size;
  writeFileSync(`${out}/${name}.png`, png(size, make(size, opts), h));
}
console.log(`アイコンを${files.length}枚つくった`);
