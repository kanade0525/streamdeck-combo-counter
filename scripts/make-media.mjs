// Marketplace に出すサムネイルとギャラリー画像を作る。
//
// なぜ生成するか: 画面を手で撮って並べると、直すたびに撮り直しになる。
// プラグイン本体と同じ描画器（bin/draw.js）でキーを描けば、実物と必ず一致し、
// 見た目を変えたときは走らせ直すだけで済む。
//
// SVG から PNG にするのは、手元の Chrome を画面なしで動かして撮る。
// 画像変換の道具を入れずに済み、見えるものがそのまま出る。
//
// 規格: サムネイル・ギャラリーとも 1920×960 PNG。

import { mkdirSync, writeFileSync, rmSync } from 'node:fs';
import { execFileSync } from 'node:child_process';
import { join } from 'node:path';
import { comboImage } from '../com.kanade0525.combocounter.sdPlugin/bin/draw.js';

const OUT = 'media';
const TMP = join(OUT, '.work');
const CHROME = '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome';

const W = 1920, H = 960;
const BG = '#0e1114';
const INK = '#e8f0e8';
const MUTED = '#79838d';

/** キー1枚。実物と同じ描画器を使う */
const key = (v, px = 200) => {
  const svg = comboImage({
    mode: 0, combo: 0, best: 0, todayTotal: 0, perMinute: 0, brokenValue: 0,
    broken: false, breakT: 1, flashT: 1, ratio: 0, isRecord: false, ...v,
  });
  return `<div class="key" style="width:${px}px;height:${px}px">${svg}</div>`;
};

const page = (body, extra = '') => `<!doctype html><meta charset="utf-8">
<style>
  * { margin: 0; padding: 0; box-sizing: border-box; }
  body {
    width: ${W}px; height: ${H}px; background: ${BG}; color: ${INK};
    font-family: -apple-system, "Helvetica Neue", Arial, sans-serif;
    overflow: hidden;
  }
  .key svg { width: 100%; height: 100%; display: block; }
  .key { border-radius: 14%; overflow: hidden; }
  .stage { width: 100%; height: 100%; display: flex; align-items: center; justify-content: center; }
  .inner { width: 1500px; }
  h1 { font-size: 86px; font-weight: 700; letter-spacing: -1.5px; }
  h2 { font-size: 52px; font-weight: 600; letter-spacing: -0.5px; }
  p  { font-size: 30px; color: ${MUTED}; line-height: 1.5; font-weight: 400; }
  .cap { font-size: 24px; color: ${MUTED}; margin-top: 18px; font-weight: 500; }
  .row { display: flex; align-items: center; }
  ${extra}
</style>
${body}`;

// ---- 1. サムネイル ----
const thumbnail = page(`
<div class="stage"><div class="inner row" style="gap:120px">
  <div style="flex-shrink:0">${key({ combo: 128, best: 361, ratio: 0.72 }, 330)}</div>
  <div>
    <h1>Combo Counter</h1>
    <p style="margin-top:30px;font-size:38px;max-width:860px;line-height:1.4">
      Counts your keystrokes and clicks, and shows how many you have made without pausing.
    </p>
  </div>
</div></div>`);

// ---- 2. キーの読み方 ----
const anatomy = page(`
<div class="stage"><div class="inner row" style="gap:150px">
  <div style="flex-shrink:0">${key({ combo: 47, best: 361, ratio: 0.62 }, 360)}</div>
  <div style="display:flex;flex-direction:column;gap:52px">
    <div class="row" style="gap:26px">
      <span class="dot" style="background:#6b7680"></span>
      <div><div style="font-size:38px;font-weight:600">Your best streak</div>
           <div style="font-size:26px;color:${MUTED};margin-top:6px">Turns colored while you are beating it</div></div>
    </div>
    <div class="row" style="gap:26px">
      <span class="dot" style="background:${INK}"></span>
      <div><div style="font-size:38px;font-weight:600">Current combo</div>
           <div style="font-size:26px;color:${MUTED};margin-top:6px">Every keystroke and click adds one</div></div>
    </div>
    <div class="row" style="gap:26px">
      <span class="dot" style="background:#4aa8ff"></span>
      <div><div style="font-size:38px;font-weight:600">Time left</div>
           <div style="font-size:26px;color:${MUTED};margin-top:6px">Three seconds without input and the combo resets</div></div>
    </div>
  </div>
</div></div>`, `.dot { width: 22px; height: 22px; border-radius: 50%; flex-shrink: 0 }`);

// ---- 3. 段の色 ----
const milestones = [
  { combo: 6, best: 88, label: 'start' }, { combo: 14, best: 141, label: '10' },
  { combo: 32, best: 207, label: '25' }, { combo: 68, best: 296, label: '50' },
  { combo: 140, best: 318, label: '100' }, { combo: 260, best: 402, label: '200' },
  { combo: 512, best: 604, label: '400' },
];
const levels = page(`
<div class="stage"><div class="inner">
  <h2>Milestones change the color</h2>
  <p style="margin-top:20px">At 10, 25, 50, 100, 200 and 400 a ring expands and the key changes color.</p>
  <div class="row" style="gap:32px;margin-top:80px;justify-content:space-between">
    ${milestones.map((m) => `<div style="text-align:center">
      ${key({ combo: m.combo, best: m.best, ratio: 0.8 }, 190)}
      <div class="cap">${m.label}</div>
    </div>`).join('')}
  </div>
</div></div>`);

// ---- 4. 押すと切り替わる表示 ----
const modes = [
  { v: { mode: 0, combo: 47, best: 361, ratio: 0.62 }, cap: 'Current combo' },
  { v: { mode: 1, best: 361 }, cap: 'Best streak' },
  { v: { mode: 2, todayTotal: 12480 }, cap: 'Total today' },
  { v: { mode: 3, perMinute: 214 }, cap: 'Actions per minute' },
];
const switching = page(`
<div class="stage"><div class="inner">
  <h2>Press the key to switch</h2>
  <p style="margin-top:20px">Four views on one key. A long press does nothing, so your record is never lost by accident.</p>
  <div class="row" style="gap:80px;margin-top:84px;justify-content:center">
    ${modes.map((m) => `<div style="text-align:center">
      ${key(m.v, 240)}
      <div class="cap">${m.cap}</div>
    </div>`).join('')}
  </div>
</div></div>`);

// ---- 5. 何を数え、何を数えないか ----
const privacy = page(`
<div class="stage"><div class="inner">
  <h2>It counts. It does not read.</h2>
  <div class="row" style="gap:100px;margin-top:64px;align-items:stretch">
    <div style="flex:1">
      <div style="font-size:30px;font-weight:700;color:#57d08a;margin-bottom:26px">WHAT IT SEES</div>
      <p style="font-size:30px;color:${INK}">A key was pressed.<br>A mouse button was pressed.</p>
      <p style="margin-top:22px">That is the entire signal — one character per event.</p>
    </div>
    <div style="width:1px;background:#252b31"></div>
    <div style="flex:1">
      <div style="font-size:30px;font-weight:700;color:#ff5f56;margin-bottom:26px">WHAT IT NEVER SEES</div>
      <p style="font-size:30px;color:${INK}">Which key. What you typed.<br>Which app you are in.</p>
      <p style="margin-top:22px">No network connections at all. The source is public on GitHub.</p>
    </div>
  </div>
</div></div>`);

// ---- 書き出し ----
rmSync(TMP, { recursive: true, force: true });
mkdirSync(TMP, { recursive: true });
mkdirSync(OUT, { recursive: true });

const pages = [
  ['thumbnail', thumbnail],
  ['gallery-1-anatomy', anatomy],
  ['gallery-2-milestones', levels],
  ['gallery-3-switching', switching],
  ['gallery-4-privacy', privacy],
];

for (const [name, html] of pages) {
  const src = join(TMP, `${name}.html`);
  writeFileSync(src, html);
  execFileSync(CHROME, [
    '--headless', '--disable-gpu', '--hide-scrollbars',
    `--screenshot=${join(OUT, `${name}.png`)}`,
    `--window-size=${W},${H}`,
    `--virtual-time-budget=1500`,
    src,
  ], { stdio: 'ignore' });
  console.log(`撮った: ${OUT}/${name}.png`);
}
rmSync(TMP, { recursive: true, force: true });
console.log(`\n${pages.length}枚。すべて ${W}×${H}`);
