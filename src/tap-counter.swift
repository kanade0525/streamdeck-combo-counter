// 入力の件数だけを数えて、1件ごとに1行を標準出力に流す常駐ヘルパ。
//
// 重要: どのキーが押されたかは読み取らないし、記録もしない。
// 出すのは k（キー押下）/ m（マウス押下）/ s（スクロール）の1文字だけ。
//
// なぜ Swift で別プロセスにするか:
//   OS 全体の入力は CGEventTap でしか取れず、Node からは叩けない。
//   タップは listenOnly（覗くだけ）にして、入力の流れには一切干渉しない。

import Foundation
import CoreGraphics

func note(_ s: String) {
  FileHandle.standardError.write((s + "\n").data(using: .utf8)!)
}

// 権限は tapCreate の戻り値では判定できない（権限が無くても成功し、イベントが来ないだけ）。
// 必ず preflight で見る。実測で確認済み。
if !CGPreflightListenEventAccess() {
  note("NOPERM")
  // 要求を出すと、初回はダイアログが出る
  _ = CGRequestListenEventAccess()
  exit(2)
}

let mask: CGEventMask =
  (1 << CGEventType.keyDown.rawValue) |
  (1 << CGEventType.leftMouseDown.rawValue) |
  (1 << CGEventType.rightMouseDown.rawValue)

// タップが無効化された時に張り直すため、参照をグローバルに持つ
var tapRef: CFMachPort?

let callback: CGEventTapCallBack = { _, type, event, _ in
  switch type {
  case .keyDown: print("k")
  case .leftMouseDown, .rightMouseDown: print("m")
  // 長時間動かしていると OS がタップを切ることがある。切られたら張り直す
  case .tapDisabledByTimeout, .tapDisabledByUserInput:
    if let t = tapRef { CGEvent.tapEnable(tap: t, enable: true) }
    note("タップが切られたので張り直した")
  default: break
  }
  fflush(stdout)
  return Unmanaged.passUnretained(event)
}

guard let tap = CGEvent.tapCreate(
  tap: .cgSessionEventTap,
  place: .headInsertEventTap,
  options: .listenOnly,
  eventsOfInterest: mask,
  callback: callback,
  userInfo: nil
) else {
  note("タップを作れなかった")
  exit(1)
}
tapRef = tap

let source = CFMachPortCreateRunLoopSource(kCFAllocatorDefault, tap, 0)
CFRunLoopAddSource(CFRunLoopGetCurrent(), source, .commonModes)
CGEvent.tapEnable(tap: tap, enable: true)
note("READY")
CFRunLoopRun()
