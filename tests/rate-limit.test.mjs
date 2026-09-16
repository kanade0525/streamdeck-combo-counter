// 送信の関門の検査。毎秒10回の上限は Marketplace の規定なので、
// 目で確かめるのではなく機械で押さえておく。
import test from 'node:test';
import assert from 'node:assert/strict';
import { RateLimiter } from '../com.kanade0525.combocounter.sdPlugin/bin/rate-limit.js';

/** 時計と予約を手で進められる関門を作る */
const make = (minIntervalMs = 100) => {
  let t = 0;
  const sent = [];
  const timers = [];
  const limiter = new RateLimiter({
    minIntervalMs,
    send: (p) => sent.push({ at: t, payload: p }),
    now: () => t,
    schedule: (fn, ms) => { const id = timers.length; timers.push({ at: t + ms, fn, id }); return id; },
    cancel: (id) => { const i = timers.findIndex((x) => x.id === id); if (i >= 0) timers.splice(i, 1); },
  });
  // 時計を進め、期限の来た予約を順に実行する
  const advance = (ms) => {
    const target = t + ms;
    for (;;) {
      const due = timers.filter((x) => x.at <= target).sort((a, b) => a.at - b.at)[0];
      if (!due) break;
      timers.splice(timers.indexOf(due), 1);
      t = due.at;
      due.fn();
    }
    t = target;
  };
  return { limiter, sent, advance, now: () => t };
};

test('最初の1件はすぐ送る', () => {
  const { limiter, sent } = make();
  limiter.request('a');
  assert.deepEqual(sent.map((s) => s.payload), ['a']);
});

test('間隔が空いていなければ、その場では送らない', () => {
  const { limiter, sent, advance } = make(100);
  limiter.request('a');
  advance(30);
  limiter.request('b');
  assert.equal(sent.length, 1, 'まだ1件だけ');
});

test('間隔が空いた時点で、最後の1件が送られる', () => {
  const { limiter, sent, advance } = make(100);
  limiter.request('a');
  advance(30); limiter.request('b');
  advance(30); limiter.request('c');
  advance(60);
  assert.deepEqual(sent.map((s) => s.payload), ['a', 'c'], '途中のbは捨てる');
});

test('打鍵が速くても、毎秒の送信は上限を超えない', () => {
  const { limiter, sent, advance } = make(100);
  // 毎秒50打ちの速さで1秒間ぶつける（現実にはあり得ない速さ）
  for (let i = 0; i < 50; i++) {
    limiter.request(`k${i}`);
    advance(20);
  }
  // 区間は半開で数える。1000ms ちょうどの送信は次の1秒に属する
  const inFirstSecond = sent.filter((s) => s.at < 1000).length;
  assert.ok(inFirstSecond <= 10, `1秒で${inFirstSecond}件。10件以下であること`);
});

test('どの1秒を切り取っても上限を超えない', () => {
  const { limiter, sent, advance } = make(100);
  for (let i = 0; i < 300; i++) {
    limiter.request(`k${i}`);
    advance(10); // 毎秒100件の要求を3秒間
  }
  for (let start = 0; start <= 2000; start += 50) {
    const n = sent.filter((s) => s.at >= start && s.at < start + 1000).length;
    assert.ok(n <= 10, `${start}ms からの1秒で${n}件`);
  }
});

test('最後の1件は必ず画面に出る（打ち終わりが消えない）', () => {
  const { limiter, sent, advance } = make(100);
  limiter.request('a');
  advance(10); limiter.request('b');
  advance(10); limiter.request('最後');
  advance(500); // 手が止まる
  assert.equal(sent.at(-1).payload, '最後');
});

test('間隔を空けて送れば、すべてその場で送られる', () => {
  const { limiter, sent, advance } = make(100);
  for (let i = 0; i < 5; i++) { limiter.request(`x${i}`); advance(150); }
  assert.equal(sent.length, 5);
});

test('終うと予約が残らない', () => {
  const { limiter, sent, advance } = make(100);
  limiter.request('a');
  advance(10); limiter.request('b');
  limiter.dispose();
  advance(500);
  assert.deepEqual(sent.map((s) => s.payload), ['a'], 'bは送られない');
});
