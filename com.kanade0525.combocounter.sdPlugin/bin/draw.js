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
  const size = fontFor(text);

  // 切れた時は、数字を段の色から背景色へ落とす。
  // 位置を動かす演出はやめた（コマ数が足りず、揺れて見えるだけになる）
  const BREAK_STEPS = [0.15, 0.45, 0.75];
  const bi = Math.min(Math.floor(v.breakT * BREAK_STEPS.length), BREAK_STEPS.length - 1);
  const numberFill = v.broken ? mix(lv.fill, BG, BREAK_STEPS[bi]) : INK;
  const numberY = 40 + size * 0.36;

  // 上段。数字を見れば分かるので COMBO の文字は置かず、空いた分を最高記録に使う。
  // 切れた瞬間だけ同じ場所を BREAK に差し替える（0.7秒だけなので場所を奪い合わない）
  const topText = v.mode === 0 ? (v.broken ? 'BREAK' : `MAX ${v.best}`) : MODE_LABEL[v.mode];
  const topFill = v.mode === 0
    ? (v.broken ? '#5a646e' : v.isRecord ? lv.fill : MUTED)
    : '#8a949e';
  const topWeight = v.isRecord || v.broken ? 700 : 500;

  // 段が上がった瞬間の輪。毎秒10コマが上限なので、滑らかに広げるのではなく
  // 4段の決まった大きさを順に出す。コマ送りだと分かる形にした方が、
  // 中途半端に滑らかなものより「決まった」感じが出る
  const FLASH_FRAMES = [
    { r: 14, w: 4.0, t: 0.00 },
    { r: 24, w: 3.0, t: 0.30 },
    { r: 34, w: 2.0, t: 0.60 },
    { r: 44, w: 1.5, t: 0.85 },
  ];
  const fi = Math.floor(v.flashT * FLASH_FRAMES.length);
  const f = v.flashT < 1 ? FLASH_FRAMES[Math.min(fi, FLASH_FRAMES.length - 1)] : null;
  const flash = f
    ? `<circle cx="36" cy="40" r="${f.r}" fill="none"
             stroke="${mix(lv.fill, BG, f.t)}" stroke-width="${f.w}"/>`
    : '';

  // 残り時間のバーはコンボ表示の時だけ置く。
  // 他の表示（最高・今日・毎分）では時間の意味が無いので、枠だけ残すと嘘になる
  const bar = v.mode === 0
    ? `<rect x="8" y="58" width="56" height="5" rx="2.5" fill="${lv.dim}"/>
  <rect x="8" y="58" width="${(56 * v.ratio).toFixed(1)}" height="5" rx="2.5" fill="${lv.fill}"/>`
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
  ${bar}
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

/**
 * ヘルパが起動できない時。
 * 配布物をダウンロードで入れると、署名していないため macOS が実行を止める。
 * 何も出さずに 0 のまま止まると原因が分からないので、起動できていないことを出す。
 */
export const helperBlockedImage = () => `<svg xmlns="http://www.w3.org/2000/svg" width="72" height="72" viewBox="0 0 72 72">
  <rect width="72" height="72" rx="10" fill="${BG}"/>
  <circle cx="36" cy="27" r="11" fill="none" stroke="#ff5f56" stroke-width="3"/>
  <line x1="28" y1="35" x2="44" y2="19" stroke="#ff5f56" stroke-width="3"/>
  <text x="36" y="52" text-anchor="middle" font-family="Helvetica, Arial, sans-serif"
        font-size="9" font-weight="700" fill="#ff5f56">BLOCKED</text>
  <text x="36" y="63" text-anchor="middle" font-family="Helvetica, Arial, sans-serif"
        font-size="7.5" fill="${MUTED}">press for help</text>
</svg>`;

export const dataUri = (svg) =>
  `data:image/svg+xml;base64,${Buffer.from(svg).toString('base64')}`;
