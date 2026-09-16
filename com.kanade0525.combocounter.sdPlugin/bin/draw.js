// キーに出す絵。72×72 の SVG を文字列で組み立てる。
//
// なぜ SVG か: Stream Deck は setImage に SVG をそのまま渡せる（実測で確認済み）。
// 画像を作る道具も依存パッケージも要らず、文字も図形も同じ一枚で描ける。
//
// 透明度に頼らずに色の補間でフェードを作っているのは、このレンダラが opacity を
// どこまで解釈するか未確認のため。確実に効く方法だけで組んである。

import { levelOf } from './combo-state.js';

export const BG = '#14181c';
export const INK = '#e8f0e8';
export const MUTED = '#6b7680';

/** 2色を混ぜる。t=0 で a、t=1 で b */
export const mix = (a, b, t) => {
  const parse = (h) => [1, 3, 5].map((i) => parseInt(h.slice(i, i + 2), 16));
  const [r1, g1, b1] = parse(a);
  const [r2, g2, b2] = parse(b);
  const c = (x, y) =>
    Math.round(x + (y - x) * Math.max(0, Math.min(1, t))).toString(16).padStart(2, '0');
  return `#${c(r1, r2)}${c(g1, g2)}${c(b1, b2)}`;
};

export const MODE_LABEL = ['COMBO', 'BEST', 'TODAY', 'PER MIN'];

/** 桁数に応じて字の大きさを決める。5桁でも 72px に収まるところまで落とす */
const fontFor = (text) =>
  text.length >= 5 ? 19 : text.length === 4 ? 24 : text.length === 3 ? 29 : 35;

/**
 * @param {object} v 描くのに必要な値だけを受け取る（状態そのものは持ち込まない）
 */
export const comboImage = (v) => {
  const lv = levelOf(v.mode === 0 ? (v.broken ? v.brokenValue : v.combo) : 0);

  let value = v.combo;
  if (v.mode === 1) value = v.best;
  else if (v.mode === 2) value = v.todayTotal;
  else if (v.mode === 3) value = v.perMinute;
  else if (v.broken) value = v.brokenValue;

  const text = String(value);
  // 弾み: 打った瞬間に少しだけ膨らませて戻す。戻りを二次で効かせると打鍵に吸い付く
  const pop = v.popT < 1 ? 1 + 0.16 * (1 - v.popT) ** 2 : 1;
  const size = fontFor(text) * pop;

  // 切れた時は、数字を下にずらしながら背景色へ溶かす
  const numberFill = v.broken ? mix(lv.fill, BG, v.breakT * 0.85) : INK;
  const numberY = 40 + size * 0.36 + (v.broken ? v.breakT * 9 : 0);

  // 上段。数字を見れば分かるので COMBO の文字は置かず、空いた分を最高記録に使う。
  // 切れた瞬間だけ同じ場所を BREAK に差し替える（0.7秒だけなので場所を奪い合わない）
  const topText = v.mode === 0 ? (v.broken ? 'BREAK' : `MAX ${v.best}`) : MODE_LABEL[v.mode];
  const topFill = v.mode === 0
    ? (v.broken ? '#5a646e' : v.isRecord ? lv.fill : MUTED)
    : '#8a949e';
  const topWeight = v.isRecord || v.broken ? 700 : 500;

  // 段が上がった瞬間、輪が外へ広がって消える
  const flash = v.flashT < 1
    ? `<circle cx="36" cy="40" r="${(10 + 34 * v.flashT).toFixed(1)}" fill="none"
             stroke="${mix(lv.fill, BG, v.flashT)}" stroke-width="${(4 * (1 - v.flashT)).toFixed(2)}"/>`
    : '';

  // 記録を更新している間は下地をわずかに持ち上げ、盤面で見て分かるようにする
  const ground = v.isRecord && v.mode === 0 ? mix(BG, lv.fill, 0.1) : BG;

  return `<svg xmlns="http://www.w3.org/2000/svg" width="72" height="72" viewBox="0 0 72 72">
  <rect width="72" height="72" rx="10" fill="${ground}"/>
  ${flash}
  <text x="36" y="14" text-anchor="middle" font-family="Helvetica, Arial, sans-serif"
        font-size="9" font-weight="${topWeight}" fill="${topFill}">${topText}</text>
  <text x="36" y="${numberY.toFixed(1)}" text-anchor="middle" font-family="Helvetica, Arial, sans-serif"
        font-size="${size.toFixed(1)}" font-weight="700" fill="${numberFill}">${text}</text>
  <rect x="8" y="58" width="56" height="5" rx="2.5" fill="${lv.dim}"/>
  <rect x="8" y="58" width="${(56 * v.ratio).toFixed(1)}" height="5" rx="2.5" fill="${lv.fill}"/>
</svg>`;
};

// 権限が無い時の画面。押せば解決できることが分かるようにする。
// 文字は英語にしてある（Marketplace の提出要件が英語のため）
export const needsPermissionImage = () => `<svg xmlns="http://www.w3.org/2000/svg" width="72" height="72" viewBox="0 0 72 72">
  <rect width="72" height="72" rx="10" fill="${BG}"/>
  <rect x="26" y="22" width="20" height="15" rx="3" fill="none" stroke="#ffa94d" stroke-width="3"/>
  <path d="M30 22 v-4 a6 6 0 0 1 12 0 v4" fill="none" stroke="#ffa94d" stroke-width="3"/>
  <text x="36" y="50" text-anchor="middle" font-family="Helvetica, Arial, sans-serif"
        font-size="9" font-weight="700" fill="#ffa94d">PERMISSION</text>
  <text x="36" y="62" text-anchor="middle" font-family="Helvetica, Arial, sans-serif"
        font-size="8" fill="${MUTED}">press to open</text>
</svg>`;

export const dataUri = (svg) =>
  `data:image/svg+xml;base64,${Buffer.from(svg).toString('base64')}`;
