// OS 全体の入力を数える常駐ヘルパ（Swift）を起動し、件数だけを受け取る。
//
// なぜ別プロセスか: OS 全体の入力は Node からは取れない。macOS は CGEventTap、
// Windows は GetAsyncKeyState を使う。どちらも覗くだけで、入力の流れには一切干渉しない。
//
// ヘルパが渡してくるのは k / m の1文字だけで、どのキーが押されたかは含まれない。
// スクロールは数えない（トラックパッドの慣性で毎秒何十件も飛び、打鍵と釣り合わないため）。

import { spawn } from 'node:child_process';
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
  constructor({ binary, onInput, onPermission, logger }) {
    this.binary = binary;
    this.onInput = onInput;
    this.onPermission = onPermission;
    this.logger = logger;
    this.child = null;
    this.granted = true;
    this.stopped = false;
  }

  start() {
    if (this.stopped) return;
    try {
      this.child = spawn(this.binary.command, this.binary.args, { stdio: ['ignore', 'pipe', 'pipe'] });
    } catch (e) {
      this.logger.error('ヘルパを起動できない', e);
      return;
    }

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
        this.onPermission(true);
      }
      this.logger.info(`ヘルパ: ${text}`);
    });

    this.child.on('exit', (code) => {
      this.child = null;
      if (this.stopped) return;
      // 権限待ちの時は間隔を空ける。落ちただけならすぐ戻す
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
