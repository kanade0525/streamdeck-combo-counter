// ヘルパの起動の仕方が OS ごとに正しく切り替わるかの検査。
// 実際に起動はしない（機械が持っていない OS の分も確かめたいため）。
import test from 'node:test';
import assert from 'node:assert/strict';
import { InputSource } from '../com.kanade0525.pulse.sdPlugin/bin/input-source.js';

test('いまの OS 向けの起動の仕方が組み立てられる', () => {
  const c = InputSource.command('/plugin');
  assert.ok(c.command.length > 0);
  assert.ok(Array.isArray(c.args));
});

test('macOS では組み立てた実行ファイルを直に起動する', { skip: process.platform === 'win32' }, () => {
  const c = InputSource.command('/plugin');
  assert.equal(c.command, '/plugin/bin/tap-counter');
  assert.deepEqual(c.args, []);
});
