// コンボの状態機械の検査。時計を差し替えて、時間に依存する判断を機械で確かめる。
import test from 'node:test';
import assert from 'node:assert/strict';
import { ComboState, levelOf } from '../com.kanade0525.pulse.sdPlugin/bin/combo-state.js';

/** 時計を手で進められる状態機械を作る */
const make = (window = 3000) => {
  let t = 1_000_000;
  const s = new ComboState({ window, now: () => t });
  return { s, advance: (ms) => { t += ms; } };
};

test('入力のたびにコンボが増える', () => {
  const { s } = make();
  s.input();
  s.input();
  assert.equal(s.combo, 2);
  assert.equal(s.todayTotal, 2);
});

test('窓の内側で打ち続ければ切れない', () => {
  const { s, advance } = make(3000);
  s.input();
  advance(2999);
  assert.equal(s.tick().broke, false);
  s.input();
  advance(2999);
  assert.equal(s.tick().broke, false);
  assert.equal(s.combo, 2);
});

test('窓を越えると切れ、切れる直前の値が残る', () => {
  const { s, advance } = make(3000);
  s.input();
  s.input();
  s.input();
  advance(3000);
  assert.equal(s.tick().broke, true);
  assert.equal(s.combo, 0);
  assert.equal(s.brokenValue, 3);
});

test('一度切れたら、次の tick で二重に切れない', () => {
  const { s, advance } = make(3000);
  s.input();
  advance(3000);
  assert.equal(s.tick().broke, true);
  assert.equal(s.tick().broke, false);
});

test('最高記録はコンボが切れても残る', () => {
  const { s, advance } = make(3000);
  for (let i = 0; i < 12; i++) s.input();
  advance(3000);
  s.tick();
  assert.equal(s.best, 12);
  assert.equal(s.combo, 0);
});

test('段の境目でだけ段上がりになる', () => {
  const { s } = make();
  const ups = [];
  for (let i = 1; i <= 30; i++) if (s.input().leveledUp) ups.push(i);
  // 10 と 25 が段の境目。1打目は段0のままなので上がらない
  assert.deepEqual(ups, [10, 25]);
});

test('残りの割合は打った直後が1で、窓の終わりで0になる', () => {
  const { s, advance } = make(3000);
  s.input();
  assert.equal(s.remaining(), 1);
  advance(1500);
  assert.equal(s.remaining(), 0.5);
  advance(1500);
  assert.equal(s.remaining(), 0);
});

test('毎分の操作数は60秒より古いものを落とす', () => {
  const { s, advance } = make();
  s.input();
  s.input();
  advance(59_000);
  s.tick();
  assert.equal(s.perMinute, 2);
  advance(2000);
  s.tick();
  assert.equal(s.perMinute, 0);
});

test('保存した記録を戻せる。日付が違えば今日の分は捨てる', () => {
  const { s } = make();
  const today = new Date(1_000_000).toDateString();
  s.load({ best: 99, todayTotal: 500, day: today });
  assert.equal(s.best, 99);
  assert.equal(s.todayTotal, 500);

  const { s: s2 } = make();
  s2.load({ best: 99, todayTotal: 500, day: 'Mon Jan 01 1990' });
  assert.equal(s2.best, 99, '最高記録は日をまたいでも残す');
  assert.equal(s2.todayTotal, 0, '今日の分だけ捨てる');
});

test('段の色は閾値ごとに変わる', () => {
  assert.equal(levelOf(0).at, 0);
  assert.equal(levelOf(9).at, 0);
  assert.equal(levelOf(10).at, 10);
  assert.equal(levelOf(399).at, 200);
  assert.equal(levelOf(10_000).at, 400);
});
