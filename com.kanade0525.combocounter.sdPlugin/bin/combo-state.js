// コンボの状態機械。Stream Deck も描画も知らないので、Node から直接 import してテストできる。
//
// なぜ切り離すか: 「いつコンボが切れるか」「いつ段が上がるか」は、この道具の心臓部で、
// 目で確かめるのが最も難しい部分だから。ここだけは機械で確かめられる形にしておく。

/** 段の閾値と色。色だけでおおよその段が分かるようにしている */
export const LEVELS = [
  { at: 0, fill: '#57d08a', dim: '#2a3f33' },
  { at: 10, fill: '#4fd0c0', dim: '#243f3d' },
  { at: 25, fill: '#4aa8ff', dim: '#1f3247' },
  { at: 50, fill: '#9b7bff', dim: '#2c2741' },
  { at: 100, fill: '#ff8fbf', dim: '#42283a' },
  { at: 200, fill: '#ffa94d', dim: '#42321f' },
  { at: 400, fill: '#ff5f56', dim: '#42221f' },
];

export const levelOf = (n) => LEVELS.reduce((acc, l) => (n >= l.at ? l : acc), LEVELS[0]);

export class ComboState {
  /**
   * @param {object} opts
   * @param {number} opts.window   これだけ入力が無ければコンボが切れる（ミリ秒）
   * @param {() => number} opts.now 時刻の供給元。テストで差し替える
   */
  constructor({ window = 3000, now = () => Date.now() } = {}) {
    this.window = window;
    this.now = now;
    this.combo = 0;
    this.best = 0;
    this.todayTotal = 0;
    this.day = new Date(this.now()).toDateString();
    this.lastInputAt = 0;
    this.popAt = 0;    // 直近の1打。弾みの演出に使う
    this.flashAt = 0;  // 直近の段上がり。輪が広がる演出に使う
    this.brokenAt = 0;
    this.brokenValue = 0;
    this.recent = [];  // 直近60秒の時刻。毎分の操作数に使う
  }

  /** 保存してあった記録を戻す。日付が変わっていれば今日の分は捨てる */
  load({ best = 0, todayTotal = 0, day = '' } = {}) {
    this.best = Number(best) || 0;
    if (day === new Date(this.now()).toDateString()) this.todayTotal = Number(todayTotal) || 0;
  }

  snapshot() {
    return { best: this.best, todayTotal: this.todayTotal, day: this.day };
  }

  /** 入力を1件受け取る。段が上がったかどうかを返す */
  input() {
    const t = this.now();
    const today = new Date(t).toDateString();
    if (today !== this.day) {
      this.day = today;
      this.todayTotal = 0;
    }
    const before = this.combo;
    this.combo += 1;
    this.todayTotal += 1;
    this.lastInputAt = t;
    this.popAt = t;
    this.brokenAt = 0;
    this.recent.push(t);
    if (this.combo > this.best) this.best = this.combo;

    const leveledUp = levelOf(this.combo) !== levelOf(before);
    if (leveledUp) this.flashAt = t;
    return { leveledUp };
  }

  /** 時間の経過を進める。コンボが切れたかどうかを返す */
  tick() {
    const t = this.now();
    let broke = false;
    if (this.combo > 0 && t - this.lastInputAt >= this.window) {
      this.brokenValue = this.combo;
      this.brokenAt = t;
      this.combo = 0;
      broke = true;
    }
    this.recent = this.recent.filter((x) => t - x < 60000);
    return { broke };
  }

  /** コンボが生きている間、切れるまでの残りの割合（1→0） */
  remaining() {
    if (this.combo === 0) return 0;
    return Math.max(0, 1 - (this.now() - this.lastInputAt) / this.window);
  }

  /** いま自己記録を更新し続けているか */
  get isRecord() {
    return this.combo > 0 && this.combo >= this.best;
  }

  get perMinute() {
    return this.recent.length;
  }
}
