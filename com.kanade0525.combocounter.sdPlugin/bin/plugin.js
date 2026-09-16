// Stream Deck との接続。公式SDK（@elgato/streamdeck）に乗せている。
//
// なぜ公式SDKか: 配布するとき、プラグインは Stream Deck 同梱の Node 20 で動く。
// この Node には標準の WebSocket が無い（実測で確認済み）ので、自前で繋ぐには
// WebSocket クライアントを持ち込む必要がある。公式SDKはそこを含めて面倒を見る。
//
// ビルドステップは入れていない。SDKは素の ES modules のまま読み込む。

import { exec } from 'node:child_process';
import { join } from 'node:path';
import streamDeck, { SingletonAction } from '@elgato/streamdeck';

import { ComboState } from './combo-state.js';
import { comboImage, dataUri, needsPermissionImage, MODE_LABEL } from './draw.js';
import { InputSource } from './input-source.js';
import { RateLimiter } from './rate-limit.js';

const ROOT = join(import.meta.dirname, '..');
const logger = streamDeck.logger;

// Marketplace の規定で、キーの絵の更新は毎秒10回を超えてはならない。
// 打鍵は毎秒10回を軽く超えるので、送信そのものに関門を置いて守らせる。
const MIN_INTERVAL = 100;  // 送信と送信の最小間隔。毎秒10回の上限そのもの
const TICK = 100;          // 判定の刻み。関門と同じにしておけば無駄打ちが出ない
const FLASH_MS = 400;      // 段が上がった瞬間の演出。4コマ
const BREAK_MS = 600;      // 切れたことを見せる時間。6コマ

const state = new ComboState({ window: 3000 });
let mode = 0;          // 0=コンボ 1=最高 2=今日 3=毎分
let permitted = true;

// ---- 描画の制御 ----
//
// 二段構えにしてある。
//   1. 絵が変わった時だけ描く（同じ絵を送り直さない）
//   2. それでも毎秒10回を超えないよう、送信に関門を通す
//
// 1 だけでは足りない。打鍵のたびに数字が変わるので、速く打てば絵は毎秒10回以上変わる。
// 2 の関門は、送れない間の要求を捨てずに最新の1件だけ覚えておき、間隔が空いたら送る。
// だから速く打っても、最後に打った数字は必ず画面に出る。
//
// 実測では Stream Deck の CPU は送信レートにほぼ比例し、10fps なら約2%で収まる。

let ticker = null;
let lastSignature = '';

const elapsed = (at) => (at ? (Date.now() - at) : Infinity);
const animating = () =>
  elapsed(state.flashAt) < FLASH_MS || elapsed(state.brokenAt) < BREAK_MS;

const view = () => {
  const broken = elapsed(state.brokenAt) < BREAK_MS;
  return {
    mode,
    combo: state.combo,
    best: state.best,
    todayTotal: state.todayTotal,
    perMinute: state.perMinute,
    brokenValue: state.brokenValue,
    broken,
    breakT: broken ? elapsed(state.brokenAt) / BREAK_MS : 1,
    flashT: Math.min(1, elapsed(state.flashAt) / FLASH_MS),
    ratio: mode === 0 && !broken ? state.remaining() : 0,
    isRecord: state.isRecord,
  };
};

// 絵が変わったかどうかの判定。バーは20段に、演出はコマ番号に量子化してあるので、
// 見た目が同じなら同じ文字列になる
const signature = () => {
  const v = view();
  const step = Math.ceil(v.ratio * 20);
  const flashFrame = v.flashT < 1 ? Math.floor(v.flashT * 4) : -1;
  const breakFrame = v.broken ? Math.floor(v.breakT * 3) : -1;
  return `${mode}:${state.combo}:${state.best}:${state.todayTotal}:${state.perMinute}`
       + `:${step}:${flashFrame}:${breakFrame}`;
};

// 送信の時刻を直近1秒だけ覚えておき、規定（毎秒10回）を超えたら警告を残す。
// 関門がある以上ここに来ることは無いはずで、来たら関門が壊れている。
// 超えない限り何も書かないので、本番に置いたままにできる。
const RATE_LIMIT_PER_SEC = 10;
const sentAt = [];
const noteSend = (t) => {
  sentAt.push(t);
  while (sentAt.length && t - sentAt[0] >= 1000) sentAt.shift();
  if (sentAt.length > RATE_LIMIT_PER_SEC) {
    logger.warn(`送信が規定を超えた: 直近1秒で${sentAt.length}件`);
  }
};

// 送信の関門。毎秒10回を超えさせない
const limiter = new RateLimiter({
  minIntervalMs: MIN_INTERVAL,
  send: (image) => {
    for (const action of combo.actions) action.setImage(image);

  },
});

const paint = (force = false) => {
  if (!permitted) return;
  const sig = signature();
  if (!force && sig === lastSignature) return;
  lastSignature = sig;
  limiter.request(dataUri(comboImage(view())));
};

const stopTicker = () => {
  if (ticker) clearInterval(ticker);
  ticker = null;
};

function tick() {
  const { broke } = state.tick();
  if (broke) logger.info(`コンボ切れ ${state.brokenValue}`);
  paint();
  // コンボも演出も直近の操作も無いなら、動かす理由が無い。止めて CPU を平常値へ戻す
  if (state.combo === 0 && !animating() && state.perMinute === 0) {
    stopTicker();
    paint(true);
  }
}

const wake = () => { if (!ticker) ticker = setInterval(tick, TICK); };

// ---- 記録の保存。打鍵のたびに書かず、5秒に1回まとめる ----
let saveTimer = null;
const saveSoon = () => {
  if (saveTimer) return;
  saveTimer = setTimeout(async () => {
    saveTimer = null;
    try { await streamDeck.settings.setGlobalSettings(state.snapshot()); }
    catch (e) { logger.error('記録を保存できなかった', e); }
  }, 5000);
};

// ---- 入力ヘルパ ----
const source = new InputSource({
  binary: InputSource.command(ROOT),
  logger,
  onInput: () => {
    state.input();
    wake();
    paint();
    saveSoon();
  },
  onPermission: (granted) => {
    permitted = granted;
    if (granted) paint(true);
    else for (const action of combo.actions) action.setImage(dataUri(needsPermissionImage()));
  },
});

// ---- アクション ----
class ComboAction extends SingletonAction {
  // デコレータは manifestId を持つサブクラスを返すだけなので、素のJSではこう書けばよい
  manifestId = 'com.kanade0525.combocounter.combo';

  onWillAppear(ev) {
    ev.action.setTitle('');
    if (!permitted) ev.action.setImage(dataUri(needsPermissionImage()));
    else ev.action.setImage(dataUri(comboImage(view())));
  }

  onKeyUp() {
    // 権限が無い時は、押せば解決できるようにシステム設定を直接開く
    if (!permitted) {
      exec('open "x-apple.systempreferences:com.apple.preference.security?Privacy_ListenEvent"');
      return;
    }
    // 短押しで表示を切替える。長押しには何も割り当てない（触れただけで記録が消える事故を避ける）
    mode = (mode + 1) % MODE_LABEL.length;
    wake();
    paint(true);
  }
}

const combo = new ComboAction();
streamDeck.actions.registerAction(combo);

await streamDeck.connect();
logger.info('接続した');

try {
  state.load(await streamDeck.settings.getGlobalSettings());
  paint(true);
} catch (e) {
  logger.error('記録を読めなかった', e);
}

source.start();
