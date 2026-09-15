# Windows 用の、入力の件数だけを数える常駐ヘルパ。
#
# 重要: どのキーが押されたかは出力しない。出すのは k（キー押下）/ m（マウス押下）の1文字だけ。
#
# なぜこの方式か:
#   低レベルフック（SetWindowsHookEx）を張らず、GetAsyncKeyState を一定間隔で見る。
#   - 受け取る側にコンパイラも .NET SDK も要らない（Windows に入っているもので動く）
#   - フックを張らないので、ウイルス対策に誤検知されにくい
#   - 管理者権限が要らない
#
#   代償として、キーの押しっぱなしによる自動リピートは数えない。
#   コンボの数え方としてはむしろ素直なので、これでよいと判断した。

$ErrorActionPreference = 'Stop'

Add-Type -Namespace ComboCounter -Name Native -MemberDefinition @'
[DllImport("user32.dll")]
public static extern short GetAsyncKeyState(int vKey);
'@

# マウスのボタン
$mouse = @(0x01, 0x02, 0x04, 0x05, 0x06)
# 単体では「打った」と数えない修飾キー（macOS 版の keyDown と数え方を揃えるため）
$modifiers = @(0x10, 0x11, 0x12, 0x14, 0x5B, 0x5C, 0xA0, 0xA1, 0xA2, 0xA3, 0xA4, 0xA5)

$watch = @()
for ($vk = 0x01; $vk -le 0xFE; $vk++) {
  if ($modifiers -contains $vk) { continue }
  $watch += $vk
}

$down = @{}
foreach ($vk in $watch) { $down[$vk] = $false }

[Console]::Error.WriteLine('READY')

while ($true) {
  foreach ($vk in $watch) {
    $isDown = ([ComboCounter.Native]::GetAsyncKeyState($vk) -band 0x8000) -ne 0
    if ($isDown -and -not $down[$vk]) {
      if ($mouse -contains $vk) { [Console]::Out.Write("m`n") } else { [Console]::Out.Write("k`n") }
      [Console]::Out.Flush()
    }
    $down[$vk] = $isDown
  }
  Start-Sleep -Milliseconds 15
}
