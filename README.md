# Combo Counter for Stream Deck

> 打った回数ではなく、**途切れなかった回数**を出す。

PC での操作（打鍵・クリック）を数え、**途切れずに続いた回数をコンボとして** Stream Deck の
キーに出します。手が止まると落ちます。

Atom の [activate-power-mode](https://github.com/JoelBesada/activate-power-mode) の
コンボ表示を、**画面の外に出したもの**です。

```
┌──────────────┐
│   MAX 361     │  ← 自己記録。更新中は色が変わり、下地がわずかに持ち上がる
│     47        │  ← 現在のコンボ。1打ごとに少しだけ弾む
│  ▓▓▓▓▓░░░░    │  ← 切れるまでの残り時間
└──────────────┘
```

- 10 / 25 / 50 / 100 / 200 / 400 を越えた瞬間、輪が外へ広がって消えます
- 3秒手が止まると `BREAK` と出て、数字が沈みながら消えます
- **押すと表示が切り替わります**（コンボ → 最高 → 今日の総数 → 毎分の操作数）
- 長押しには何も割り当てていません。触れただけで記録が消える事故を避けるためです

## 何が違うか

power-mode はエディタの中でしか効かず、しかも画面を汚します。粒子と画面揺れが邪魔で、
結局切ってしまう人が多い。

- **エディタの中だけでなく、PC の全作業に効きます。** ターミナルでも、ブラウザでも、資料作成でも
- **画面を汚しません。** 盤面の外に出るので、作業の視界に一切入りません

## 数えるもの・数えないもの

**数えるのは件数だけです。どのキーが押されたかは読み取りませんし、記録もしません。**

入力を拾うヘルパが親プロセスに渡すのは、次の1文字だけです。

| 記号 | 対象 |
| --- | --- |
| `k` | キー押下 |
| `m` | マウスのボタン押下 |

キーコードも、入力された文字も、前面アプリの名前も、一切扱いません。
記録（最高コンボ・今日の操作数）は端末内にのみ保存し、**どこにも送信しません**。
ネットワークには一切つなぎません。

ヘルパの実装は [`src/tap-counter.swift`](src/tap-counter.swift)（macOS）と
[`com.kanade0525.combocounter.sdPlugin/bin/tap-counter.ps1`](com.kanade0525.combocounter.sdPlugin/bin/tap-counter.ps1)（Windows）で、
どちらも数十行です。**全部読んでから入れてください。**

### 数えないもの

- **スクロール。** トラックパッドの2本指スクロールは慣性で毎秒何十件も飛び、打鍵と釣り合わない
- **修飾キー単体**（Shift・Control・Option など）
- **押しっぱなしの自動リピート**（Windows 版のみ。macOS 版は数えます）

## 要るもの

| | macOS | Windows |
| --- | --- | --- |
| OS | 12 以降 | 10 以降 |
| Stream Deck | 6.5 以降 | 6.5 以降 |
| 権限 | **入力監視の許可** | 不要 |
| ビルド | Xcode Command Line Tools（無料） | **不要** |

ボタンだけの機種で動きます。ダイヤルは使いません。

## 入れ方

### できあいのものを使う

[Releases](https://github.com/kanade0525/streamdeck-combo-counter/releases) から
`.streamDeckPlugin` を落として開くと入ります。

ただし macOS では、**署名していないため Gatekeeper に止められます**。
その場合は下の「ソースから入れる」を使ってください（そちらが本筋です）。

### ソースから入れる（macOS 推奨）

```sh
git clone https://github.com/kanade0525/streamdeck-combo-counter.git
cd streamdeck-combo-counter
npm run build          # 入力を数えるヘルパ（Swift）を組み立てる
npm run link           # Stream Deck に見せる
```

Stream Deck を再起動し、右の一覧の **Combo Counter > コンボカウンタ** を
空いているキーに置いてください。

初回は入力監視の許可を求められます。許可した後、もう一度 Stream Deck を再起動してください。
**キーに鍵の絵が出ている時は、そのキーを押すと設定画面が直接開きます。**

手元でビルドしたものには隔離属性が付かないので、署名なしでもそのまま動きます。

## 仕組み

```
ヘルパ（常駐）           … 入力の件数だけを数え、1行ずつ標準出力に流す
  macOS  : Swift + CGEventTap（listenOnly。入力は素通しする）
  Windows: PowerShell + GetAsyncKeyState（フックを張らない）
      ↓ stdout
plugin.js（Node・常駐）  … 集計・コンボ判定・SVG描画・記録
      ↓ WebSocket
Stream Deck
```

- キーの絵は **SVG を `setImage` に直接渡しています**。画像を作る道具は使いません
- ビルドステップはありません。素の ES modules をそのまま読みます
- Windows 版がフックではなく走査なのは、**受け取る側にコンパイラを要求しないため**と、
  ウイルス対策の誤検知を避けるためです

## なぜこの描画レートなのか

**Stream Deck アプリの CPU は、キーに絵を送るレートにほぼ比例します。** 実測値です。

| 送信レート | Stream Deck の CPU |
| --- | --- |
| 平常時（送らない） | 0.6% |
| 30fps | 約6% |
| 60fps | 約12% |
| 120fps | 約26% |

常駐する道具で 12% は選べません。そこで **「絵が変わった時だけ送る」を原則**にしています。
残り時間のバーは20段に量子化してあり、手を止めている間の再描画は3秒で約20回（≒7fps）に
収まります。コンボも演出も無くなれば送信を完全に止め、CPU を平常値へ戻します。
60fps に上げるのは、段が上がった瞬間の 0.45 秒だけです。

なお WebSocket 側は律速になりません。120fps 相当を送り続けても送信バッファは
1通分（681バイト）から増えませんでした。測定の詳細は [MEASUREMENTS.md](MEASUREMENTS.md) に。

## 開発

```sh
npm test               # 検査。依存パッケージ不要
npm run build          # ヘルパを組み直す（macOS）
npm run link           # 開発中のものを Stream Deck に見せる
npm run pack           # 配布用の .streamDeckPlugin を作る
```

配布物は印（`v0.1.0` の形のタグ）を押すと、GitHub Actions が macOS の機械で組み立てて
Release に添えます。

```
com.kanade0525.combocounter.sdPlugin/
  bin/combo-state.js    コンボの状態機械（Stream Deck も描画も知らない。ここが検査の対象）
  bin/draw.js           SVG の組み立て
  bin/input-source.js   ヘルパの起動と監視
  bin/plugin.js         Stream Deck との接続
  bin/tap-counter.ps1   入力を数えるヘルパ（Windows）
src/tap-counter.swift   入力を数えるヘルパ（macOS）
tests/                  検査
```

## 既知の制約

- **Windows 版は実機で検証できていません。** 手元に Windows がないため、
  動かない報告は Issue で歓迎します
- macOS で Secure Input が有効な間（パスワード欄など）は打鍵を拾えません。
  その間コンボが不自然に切れる可能性があります
- 署名していないので、ビルド済みのものを配ると Gatekeeper に止められます

## ライセンス

MIT
