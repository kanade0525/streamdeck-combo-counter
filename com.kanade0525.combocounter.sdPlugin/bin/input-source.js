// OS 全体の入力を数える常駐ヘルパ（Swift）を起動し、件数だけを受け取る。
//
// なぜ別プロセスか: OS 全体の入力は Node からは取れない。macOS は CGEventTap、
// Windows は GetAsyncKeyState を使う。どちらも覗くだけで、入力の流れには一切干渉しない。
//
// ヘルパが渡してくるのは k / m の1文字だけで、どのキーが押されたかは含まれない。
// スクロールは数えない（トラックパッドの慣性で毎秒何十件も飛び、打鍵と釣り合わないため）。

import { spawn } from 'node:child_process';
import { chmodSync, statSync } from 'node:fs';
import { join } from 'node:path';
import { platform } from 'node:process';

export class InputSource {
  /**
   * @param {object} opts
   * @param {{command: string, args: string[]}} opts.binary ヘルパの起動の仕方
   * @param {() => void} opts.onInput   入力1件ごとに呼ばれる
   * @param {(granted: boolean) => void} opts.onPermission 権限の有無が分かった時に呼ばれる
   * @param {{info: Function, error: Function}} opts.logger
   */
  constructor({ binary, onInput, onPermission, onBlocked, logger }) {
    this.binary = binary;
    this.onInput = onInput;
    this.onPermission = onPermission;
    this.onBlocked = onBlocked ?? (() => {});
    this.logger = logger;
    this.child = null;
    this.granted = true;
    this.stopped = false;
    // 起動してすぐ落ちた回数。ダウンロードした配布物は隔離属性で実行を止められるため、
    // 起動できないこと自体を利用者に伝える必要がある
    this.instantExits = 0;
    this.sawReady = false;
  }

  /**
   * ヘルパに実行ビットを付け直す。
   *
   * なぜ毎回やるか: 配布物（.streamDeckPlugin）は中身が zip で、
   * 権限が保存されない。組み立て時に chmod しても、入れ直した先では
   * -rw-r--r-- に戻る。そのまま spawn すると EACCES で落ちる。
   * 数バイトの stat で済むので、起動のたびに確かめる。
   */
  #ensureExecutable() {
    if (platform === 'win32') return;   // PowerShell の台本は実行ビットが要らない
    try {
      const mode = statSync(this.binary.command).mode;
      if ((mode & 0o111) === 0o111) return;
      chmodSync(this.binary.command, 0o755);
      this.logger.info('ヘルパに実行ビットを付け直した（配布物では権限が落ちる）');
    } catch (e) {
      this.logger.error(`ヘルパの実行ビットを付けられない: ${e.code ?? ''} ${e.message}`);
    }
  }

  start() {
    if (this.stopped) return;
    this.#ensureExecutable();
    const startedAt = Date.now();
    try {
      this.child = spawn(this.binary.command, this.binary.args, { stdio: ['ignore', 'pipe', 'pipe'] });
    } catch (e) {
      this.logger.error('ヘルパを起動できない', e);
      this.onBlocked();
      return;
    }
    // 起動そのものに失敗した場合（実行権が無い、隔離属性で止められた等）
    this.child.on('error', (e) => {
      this.logger.error(`ヘルパを起動できない: ${e.code ?? ''} ${e.message}`);
      this.onBlocked();
    });

    let buf = '';
    this.child.stdout.on('data', (chunk) => {
      buf += String(chunk);
      const lines = buf.split('\n');
      buf = lines.pop();
      for (const line of lines) {
        if (line === 'k' || line === 'm') this.onInput();
      }
    });

    this.child.stderr.on('data', (chunk) => {
      const text = String(chunk).trim();
      if (text.includes('NOPERM')) {
        this.granted = false;
        this.onPermission(false);
      } else if (text.includes('READY')) {
        this.granted = true;
        this.sawReady = true;
        this.instantExits = 0;
        this.onPermission(true);
      }
      this.logger.info(`ヘルパ: ${text}`);
    });

    this.child.on('exit', (code, signal) => {
      this.child = null;
      if (this.stopped) return;

      // READY を一度も出さずに即死し続けるなら、起動そのものができていない。
      // 配布物をダウンロードで入れた場合、隔離属性で実行を止められるのが典型
      if (!this.sawReady && Date.now() - startedAt < 500) {
        this.instantExits += 1;
        if (this.instantExits >= 3) {
          this.logger.error(
            `ヘルパが起動できない（code=${code} signal=${signal}）。`
            + '配布物をダウンロードで入れた場合、隔離属性で実行が止められている可能性がある',
          );
          this.onBlocked();
          return;   // 無言で回り続けない
        }
      }

      const wait = this.granted ? 2000 : 10000;
      this.logger.info(`ヘルパ終了 code=${code}。${wait}ms後に起動し直す`);
      setTimeout(() => this.start(), wait);
    });
  }

  stop() {
    this.stopped = true;
    this.child?.kill();
  }

  /**
   * ヘルパの起動の仕方を OS ごとに決める。
   * macOS は Swift で組み立てた実行ファイル、Windows は PowerShell の台本をそのまま走らせる
   * （Windows 側はビルドが要らないので、受け取ってすぐ動く）。
   */
  static command(root) {
    if (platform === 'win32') {
      return {
        command: 'powershell.exe',
        args: ['-NoProfile', '-NonInteractive', '-ExecutionPolicy', 'Bypass',
               '-File', join(root, 'bin', 'tap-counter.ps1')],
      };
    }
    return { command: join(root, 'bin', 'tap-counter'), args: [] };
  }
}
