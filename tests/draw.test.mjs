// 描画の検査。絵の見た目は機械で判断できないので、
// 「壊れた SVG を出さない」「値が絵に反映される」の2点だけを押さえる。
import test from 'node:test';
import assert from 'node:assert/strict';
import { comboImage, needsPermissionImage, mix } from '../com.kanade0525.combocounter.sdPlugin/bin/draw.js';

const base = {
  mode: 0, combo: 7, best: 42, todayTotal: 1234, perMinute: 60, brokenValue: 0,
  broken: false, breakT: 1, popT: 1, flashT: 1, ratio: 0.5, isRecord: false,
};

const wellFormed = (svg) => {
  assert.match(svg, /^<svg [^>]*>/, 'svg で始まる');
  assert.match(svg, /<\/svg>$/, 'svg で終わる');
  const open = (svg.match(/<(rect|text|circle|path)\b/g) ?? []).length;
  assert.ok(open > 0, '中身がある');
  assert.ok(!svg.includes('NaN'), 'NaN が混じらない');
  assert.ok(!svg.includes('undefined'), 'undefined が混じらない');
};

test('通常の描画が壊れていない', () => {
  wellFormed(comboImage(base));
});

test('コンボの数字が絵に出る', () => {
  assert.match(comboImage({ ...base, combo: 123 }), />123</);
});

test('最高記録が上段に出る', () => {
  assert.match(comboImage({ ...base, best: 361 }), />MAX 361</);
});

test('切れた時は BREAK と、切れる直前の値を出す', () => {
  const svg = comboImage({ ...base, broken: true, breakT: 0.2, brokenValue: 88, combo: 0 });
  assert.match(svg, />BREAK</);
  assert.match(svg, />88</);
});

test('表示の切替で出る数字が変わる', () => {
  assert.match(comboImage({ ...base, mode: 1 }), />42</);
  assert.match(comboImage({ ...base, mode: 2 }), />1234</);
  assert.match(comboImage({ ...base, mode: 3 }), />60</);
});

test('どの桁数でも壊れない', () => {
  for (const combo of [0, 9, 99, 999, 9999, 99999, 123456]) {
    wellFormed(comboImage({ ...base, combo }));
  }
});

test('演出の途中のどの時点でも壊れない', () => {
  for (const t of [0, 0.01, 0.5, 0.99, 1]) {
    wellFormed(comboImage({ ...base, popT: t, flashT: t, breakT: t, broken: true, ratio: t }));
  }
});

test('権限が無い時の画面が壊れていない', () => {
  wellFormed(needsPermissionImage());
});

test('色の補間が両端と中間で正しい', () => {
  assert.equal(mix('#000000', '#ffffff', 0), '#000000');
  assert.equal(mix('#000000', '#ffffff', 1), '#ffffff');
  assert.equal(mix('#000000', '#ffffff', 0.5), '#808080');
  assert.equal(mix('#000000', '#ffffff', -5), '#000000', '範囲外は丸める');
});
