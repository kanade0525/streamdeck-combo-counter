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

const ROOT = join(import.meta.dirname, '..');
const logger = streamDeck.logger;

const TICK = 33;       // 判定の刻み。描画は絵が変わった時だけなので、これがそのまま fps にはならない
const POP_MS = 130;    // 1打ごとの弾み
const FLASH_MS = 450;  // 段が上がった瞬間の演出
const BREAK_MS = 700;  // 切れたことを見せる時間

const state = new ComboState({ window: 3000 });
let mode = 0;          // 0=コンボ 1=最高 2=今日 3=毎分
let permitted = true;

// ---- 描画の制御 ----
//
// 実測で Stream Deck の CPU は送信レートにほぼ比例する（1fps あたり 0.2% 強）。
// そのため「絵が変わった時だけ送る」を原則にし、演出中だけ例外的に毎フレーム描く。
// 手が止まって演出も終われば送信を完全に止め、CPU を平常値へ戻す。

let ticker = null;
let tickerMs = 0;
let lastSignature = '';

const elapsed = (at) => (at ? (Date.now() - at) : Infinity);
const animating = () =>
  elapsed(state.popAt) < POP_MS || elapsed(state.flashAt) < FLASH_MS || elapsed(state.brokenAt) < BREAK_MS;

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
    popT: Math.min(1, elapsed(state.popAt) / POP_MS),
    flashT: Math.min(1, elapsed(state.flashAt) / FLASH_MS),
    ratio: mode === 0 && !broken ? state.remaining() : 0,
    isRecord: state.isRecord,
  };
};

// バーは20段に量子化する。こうすると手を止めている間の再描画が3秒で約20回（≒7fps）に収まる
const signature = () => {
  const v = view();
  const step = Math.ceil(v.ratio * 20);
  return `${mode}:${state.combo}:${state.best}:${state.todayTotal}:${state.perMinute}:${step}`;
};

const paint = (force = false) => {
  if (!permitted) return;
  if (!force && !animating()) {
    const sig = signature();
    if (sig === lastSignature) return;
    lastSignature = sig;
  }
  const image = dataUri(comboImage(view()));
  for (const action of combo.actions) action.setImage(image);
};

const setRate = (ms) => {
  if (ticker && tickerMs === ms) return;
  if (ticker) clearInterval(ticker);
  ticker = setInterval(tick, ms);
  tickerMs = ms;
};

const stopTicker = () => {
  if (ticker) clearInterval(ticker);
  ticker = null;
  tickerMs = 0;
};

function tick() {
  const { broke } = state.tick();
  if (broke) logger.info(`コンボ切れ ${state.brokenValue}`);
  // 段が上がった瞬間だけ 60fps に上げる。実測で約12%だが 0.45 秒なので許容できる
  setRate(elapsed(state.flashAt) < FLASH_MS ? 16 : TICK);
  paint();
  if (state.combo === 0 && !animating() && state.perMinute === 0) {
    stopTicker();
    paint(true);
  }
}

const wake = () => { if (!ticker) setRate(TICK); };

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
  manifestId = 'com.kanade0525.pulse.combo';

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
