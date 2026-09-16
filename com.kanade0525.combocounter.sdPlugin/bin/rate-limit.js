// 送信の間隔を守らせる関門。
//
// なぜ要るか: Marketplace の規定で、キーの絵の更新は毎秒10回を超えてはならない。
// 打鍵は毎秒10回を軽く超えるので、絵を「打鍵のたびに送る」ことはできない。
//
// かといって打鍵を間引くと、最後の1打が絵に出ないまま止まることがある。
// そこで、送れない間に来た要求は捨てずに「最新の1件だけ」を覚えておき、
// 間隔が空いた時点で送る（後追いの送信）。こうすると、
//   ・毎秒の送信回数は必ず上限以下
//   ・画面はいつも最新の状態に落ち着く
// の両方が成り立つ。

export class RateLimiter {
  /**
   * @param {object} opts
   * @param {number} opts.minIntervalMs 送信と送信の最小間隔
   * @param {(payload: any) => void} opts.send 実際に送る処理
   * @param {() => number} [opts.now] 時計。テストで差し替える
   * @param {(fn: () => void, ms: number) => any} [opts.schedule] 後追いの予約
   * @param {(id: any) => void} [opts.cancel]
   */
  constructor({ minIntervalMs, send, now = () => Date.now(), schedule = setTimeout, cancel = clearTimeout }) {
    this.minIntervalMs = minIntervalMs;
    this.send = send;
    this.now = now;
    this.schedule = schedule;
    this.cancel = cancel;
    this.lastSentAt = -Infinity;
    this.pending = null;   // まだ送れていない最新の要求
    this.timer = null;
  }

  /** 送りたいものを渡す。間隔が空いていれば即送り、空いていなければ後で送る */
  request(payload) {
    const wait = this.minIntervalMs - (this.now() - this.lastSentAt);
    if (wait <= 0) {
      this.#emit(payload);
      return;
    }
    // 送れない間の要求は上書きしていく。古い絵を順番に送っても意味が無い
    this.pending = payload;
    if (!this.timer) {
      this.timer = this.schedule(() => {
        this.timer = null;
        const next = this.pending;
        this.pending = null;
        if (next !== null) this.#emit(next);
      }, wait);
    }
  }

  #emit(payload) {
    this.lastSentAt = this.now();
    this.send(payload);
  }

  /** 予約を捨てる。プラグインを終う時に使う */
  dispose() {
    if (this.timer) this.cancel(this.timer);
    this.timer = null;
    this.pending = null;
  }
}
