// アイコンPNGを生成する。画像ファイルをリポジトリにバイナリで置きたくないのと、
// 依存パッケージを入れずに済ませるため、node:zlib だけで PNG を組み立てる。
// 中身は置き換え前提の仮アイコン（暗い角丸 + 中央の丸）。
import { deflateSync } from 'node:zlib';
import { writeFileSync } from 'node:fs';

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

// px(x, y, size) が [r,g,b,a] を返す
const png = (size, px) => {
  const raw = Buffer.alloc(size * (size * 4 + 1));
  let p = 0;
  for (let y = 0; y < size; y++) {
    raw[p++] = 0; // フィルタ種別 none
    for (let x = 0; x < size; x++) {
      const [r, g, b, a] = px(x, y, size);
      raw[p++] = r; raw[p++] = g; raw[p++] = b; raw[p++] = a;
    }
  }
  const ihdr = Buffer.alloc(13);
  ihdr.writeUInt32BE(size, 0);
  ihdr.writeUInt32BE(size, 4);
  ihdr[8] = 8;  // 8bit
  ihdr[9] = 6;  // RGBA
  return Buffer.concat([
    Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]),
    chunk('IHDR', ihdr),
    chunk('IDAT', deflateSync(raw, { level: 9 })),
    chunk('IEND', Buffer.alloc(0)),
  ]);
};

const paint = (x, y, size) => {
  const c = (size - 1) / 2;
  const r = size * 0.30;
  const d = Math.hypot(x - c, y - c);
  if (d <= r) return [0x57, 0xd0, 0x8a, 255];           // 中央の丸
  if (x < size * 0.06 || y < size * 0.06 ||
      x > size * 0.94 || y > size * 0.94) return [0, 0, 0, 0]; // 縁は透明
  return [0x14, 0x18, 0x1c, 255];                        // 背景
};

const out = 'com.kanade0525.pulse.sdPlugin/imgs';
for (const [name, size] of [
  ['plugin', 72], ['plugin@2x', 144],
  ['category', 28], ['category@2x', 56],
  ['action', 20], ['action@2x', 40],
  ['key', 72], ['key@2x', 144],
]) {
  writeFileSync(`${out}/${name}.png`, png(size, paint));
}
console.log('アイコンを生成しました');
