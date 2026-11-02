# 확인 도구(PowerShell 스크립트)를 창 없이 돌린다 — 관리자 권한(기본) 또는 그대로(-NoElevate). Poster Studio 설치판 확인 도구(scripts/verify/run-hidden.ps1)와 같다(11/2).
#   powershell -File tools/run-hidden.ps1 -Script <스크립트.ps1> -ArgsLine "<인자 — 경로는 작은따옴표>" -Log <기록 파일> [-NoWait] [-NoElevate]
# 이 PC는 기본 콘솔이 Windows 터미널이라, Start-Process -WindowStyle Hidden · 숨김 요청(SW_HIDE)으로 띄운 콘솔도 터미널 창으로 보인다
# (10/28 Poster Studio 실측 — 위치 지정도 무시하고 위 모니터 왼쪽 위에 떴다). 그래서 창 없는 작은 실행 파일(WinExe)을 띄우고, 그것이 powershell을
# CREATE_NO_WINDOW로 돌린다 — 콘솔 창이 아예 만들어지지 않는다. 실행 파일은 처음 부를 때 %TEMP%\vc-verify\에 만든다(소스는 아래).
# 기록은 «*>»로 모든 출력을 <기록 파일>에 남긴다. 기다리면 «exit <종료코드>»를 돌려주고, -NoWait면 프로세스를 돌려준다.
param(
  [Parameter(Mandatory = $true)][string]$Script,
  [string]$ArgsLine = '',
  [Parameter(Mandatory = $true)][string]$Log,
  [switch]$NoWait,
  [switch]$NoElevate
)
$src = @"
using System; using System.Diagnostics;
static class HiddenRunner {
  static int Main() {
    // 이 실행 파일 뒤의 명령줄을 그대로 powershell에 넘긴다(따옴표를 다시 쪼개지 않게)
    string cl = Environment.CommandLine; int i;
    if (cl.StartsWith("\"")) i = cl.IndexOf('"', 1) + 1; else { i = cl.IndexOf(' '); if (i < 0) i = cl.Length; }
    var psi = new ProcessStartInfo(Environment.ExpandEnvironmentVariables(@"%SystemRoot%\System32\WindowsPowerShell\v1.0\powershell.exe"), cl.Substring(i).TrimStart());
    psi.UseShellExecute = false;
    psi.CreateNoWindow = true;   // CREATE_NO_WINDOW — 콘솔 창을 만들지 않는다(기본 콘솔이 터미널이어도)
    using (var p = Process.Start(psi)) { p.WaitForExit(); return p.ExitCode; }
  }
}
"@
$hash = [BitConverter]::ToString([Security.Cryptography.SHA256]::Create().ComputeHash([Text.Encoding]::UTF8.GetBytes($src))).Replace('-', '').Substring(0, 12)
$dir = Join-Path $env:TEMP 'vc-verify'
$exe = Join-Path $dir "hidden-runner-$hash.exe"
if (-not (Test-Path $exe)) {
  New-Item -ItemType Directory -Force $dir | Out-Null
  Add-Type -TypeDefinition $src -OutputAssembly $exe -OutputType WindowsApplication
}
$cmd = "-NoProfile -ExecutionPolicy Bypass -Command `"& '$Script' $ArgsLine *> '$Log'; exit `$LASTEXITCODE`""   # -Command만으로는 스크립트의 종료코드가 아니라 0/1이 나간다
$sp = @{ FilePath = $exe; ArgumentList = $cmd; PassThru = $true }
if (-not $NoElevate) { $sp.Verb = 'RunAs' }
$p = Start-Process @sp
if ($NoWait) { return $p }
$p.WaitForExit()
"exit $($p.ExitCode)"
