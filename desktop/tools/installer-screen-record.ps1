# 설치 · 제거 창 자리의 «실제 화면»(사람 눈에 보이는 합성 화면 — ffmpeg gdigrab)을 초당 30장으로 녹화한다(11/2 — Poster Studio 설치판 녹화와 같은 방법,
# 그쪽 scripts/verify/installer-screen-record.ps1). 판정은 recording-blank-frames.mjs(넘김 빈 장) · recording-bar-end.mjs(«끝났습니다» 장의 막대)가 한다 —
# 둘 다 Poster Studio 것을 그대로 가져왔다(판정 기준이 같아야 18차 결과와 견줄 수 있다).
#   사용: run-hidden.ps1 -Script tools/installer-screen-record.ps1 -ArgsLine "-Out '<폴더>' -Seconds 240 -Title 'Voice Cinema 설치'" -Log <기록> -NoWait
#         → 그다음 installer-probe.ps1 -NoShots로 설치 · 제거를 넘긴다. «모든 사용자»(관리자 권한 창)는 이 스크립트도 관리자 권한으로 돌린다(맨 위로 올리기).
# Poster Studio 것과 다른 점 하나: 창을 옮기지 않는다 — Voice Cinema는 installer-probe.ps1이 창이 만들어지는 순간 가장 작은 모니터(아래 검사 모니터)로
# 옮긴다. 녹화 전에 창이 그 모니터에 있는지만 보고, 아니면 찍지 않고 적는다(위 큰 모니터 두 대는 Bumm님이 쓰신다).
#   창이 보이는 동안만 그 창 자리를 찍는다 — 화면을 넘길 때 설치기가 바깥 창 그리기를 잠깐 멈추면(WM_SETREDRAW — 그동안 «보이지 않음»으로 읽힌다)
#   그 사이도 이어서 찍고, 0.7초 넘게 안 보일 때만 멈춘다. 같은 제목의 창이 다시 보이면 새 토막(screen-NN.mkv)으로 잇는다. 창이 15초 동안 다시 안 뜨면 끝낸다.
#   맨 위로 올려(HWND_TOPMOST · 키보드 초점은 빼앗지 않음) 다른 창이 그 자리를 가리지 않게 하고, 녹화가 끝나면 푼다.
#   창 자리는 모니터별 DPI 좌표(실제 화소)로 읽는다 — 그래야 ffmpeg가 그 자리를 찍는다(125% 모니터). 녹화는 화면에 보이는 그대로(125%로 늘어난 창)다.
param([Parameter(Mandatory = $true)][string]$Out, [int]$Seconds = 60, [string]$Title = 'Voice Cinema 설치')
$ErrorActionPreference = 'Stop'
New-Item -ItemType Directory -Force $Out | Out-Null
Add-Type @"
using System; using System.Runtime.InteropServices; using System.Text;
public static class FW {
  [DllImport("user32.dll")] static extern IntPtr SetThreadDpiAwarenessContext(IntPtr c);
  [DllImport("user32.dll")] public static extern bool GetWindowRect(IntPtr h, out RECT r);
  // 실제 화소 좌표(모니터별 DPI)로 읽은 창 자리 — ffmpeg gdigrab의 좌표와 같다
  public static RECT Physical(IntPtr h) { IntPtr old = SetThreadDpiAwarenessContext((IntPtr)(-4)); RECT r; GetWindowRect(h, out r); SetThreadDpiAwarenessContext(old); return r; }
  [DllImport("user32.dll")] public static extern bool IsWindowVisible(IntPtr h);
  [DllImport("user32.dll")] public static extern bool IsWindow(IntPtr h);
  [DllImport("user32.dll")] public static extern bool SetWindowPos(IntPtr h, IntPtr after, int x, int y, int cx, int cy, uint flags);
  [DllImport("user32.dll", CharSet = CharSet.Unicode)] public static extern int GetWindowText(IntPtr h, StringBuilder s, int n);
  public delegate bool EnumProc(IntPtr h, IntPtr l);
  [DllImport("user32.dll")] public static extern bool EnumWindows(EnumProc f, IntPtr l);
  public struct RECT { public int L, T, R, B; }
  public static IntPtr Find(string title) { IntPtr f = IntPtr.Zero; EnumWindows((h, l) => { var s = new StringBuilder(256); GetWindowText(h, s, 256); RECT r; GetWindowRect(h, out r); if (IsWindowVisible(h) && s.ToString().StartsWith(title) && r.R - r.L > 300) { f = h; return false; } return true; }, IntPtr.Zero); return f; }
  // 가장 작은 모니터(검사 모니터 — installer-probe.ps1과 같은 고르기)에 창이 있는가
  delegate bool MonProc(IntPtr m, IntPtr dc, IntPtr r, IntPtr d);
  [DllImport("user32.dll")] static extern bool EnumDisplayMonitors(IntPtr dc, IntPtr clip, MonProc cb, IntPtr d);
  [StructLayout(LayoutKind.Sequential)] struct MI { public int cb; public RECT m; public RECT w; public int f; }
  [DllImport("user32.dll")] static extern bool GetMonitorInfo(IntPtr m, ref MI mi);
  [DllImport("user32.dll")] static extern IntPtr MonitorFromWindow(IntPtr h, uint flags);
  public static bool OnSmallest(IntPtr h) {
    IntPtr old = SetThreadDpiAwarenessContext((IntPtr)(-4));
    IntPtr best = IntPtr.Zero; long area = long.MaxValue;
    EnumDisplayMonitors(IntPtr.Zero, IntPtr.Zero, (m, dc, r, d) => { var mi = new MI(); mi.cb = Marshal.SizeOf(mi); GetMonitorInfo(m, ref mi); long a = (long)(mi.m.R - mi.m.L) * (mi.m.B - mi.m.T); if (a < area) { area = a; best = m; } return true; }, IntPtr.Zero);
    bool on = best != IntPtr.Zero && MonitorFromWindow(h, 2) == best;
    SetThreadDpiAwarenessContext(old);
    return on;
  }
}
"@
$h = [IntPtr]::Zero
for ($i = 0; $i -lt 1200 -and $h -eq [IntPtr]::Zero; $i++) { Start-Sleep -Milliseconds 50; $h = [FW]::Find($Title) }
if ($h -eq [IntPtr]::Zero) { 'no window' | Set-Content "$Out\watch.txt"; exit 1 }
"start $((Get-Date).ToString('HH:mm:ss.fff'))" | Set-Content "$Out\watch.txt" -Encoding UTF8
$deadline = (Get-Date).AddSeconds($Seconds)
$part = 0
while ($h -ne [IntPtr]::Zero -and (Get-Date) -lt $deadline) {
  $part++
  Start-Sleep -Milliseconds 150   # 옮긴 자리에 다시 그려지기를
  if (-not [FW]::OnSmallest($h)) {
    "part $part 검사 모니터 밖 — 찍지 않음 $((Get-Date).ToString('HH:mm:ss.fff'))" | Add-Content "$Out\watch.txt" -Encoding UTF8
    exit 2
  }
  # HWND_TOPMOST(-1) · NOSIZE(1)|NOMOVE(2)|NOACTIVATE(0x10)|SHOWWINDOW(0x40)
  $topmost = [FW]::SetWindowPos($h, [IntPtr](-1), 0, 0, 0, 0, 0x53)
  $r = [FW]::Physical($h)
  $w = $r.R - $r.L; $hh = $r.B - $r.T
  if ($w % 2) { $w-- }; if ($hh % 2) { $hh-- }
  $file = "$Out\screen-{0:00}.mkv" -f $part
  "part $part rect $($r.L),$($r.T) ${w}x${hh} 검사 모니터 True topmost $topmost start $((Get-Date).ToString('HH:mm:ss.fff'))" | Add-Content "$Out\watch.txt" -Encoding UTF8
  $left = [int][Math]::Max(1, ($deadline - (Get-Date)).TotalSeconds)
  $psi = New-Object System.Diagnostics.ProcessStartInfo('ffmpeg', ('-y -loglevel error -f gdigrab -framerate 30 -offset_x {0} -offset_y {1} -video_size {2}x{3} -i desktop -t {4} -c:v ffv1 "{5}"' -f $r.L, $r.T, $w, $hh, $left, $file))
  $psi.UseShellExecute = $false; $psi.RedirectStandardInput = $true; $psi.CreateNoWindow = $true
  $ff = [System.Diagnostics.Process]::Start($psi)
  $hiddenSince = $null
  while (-not $ff.HasExited -and [FW]::IsWindow($h)) {
    if ([FW]::IsWindowVisible($h)) { $hiddenSince = $null }
    elseif ($null -eq $hiddenSince) { $hiddenSince = Get-Date }
    elseif (((Get-Date) - $hiddenSince).TotalMilliseconds -ge 700) { break }
    Start-Sleep -Milliseconds 50
  }
  if (-not $ff.HasExited) { $ff.StandardInput.Write('q'); $ff.StandardInput.Close(); $ff.WaitForExit(10000) | Out-Null }
  "part $part stop $((Get-Date).ToString('HH:mm:ss.fff')) ffmpeg exit $($ff.ExitCode) · 창이 닫힘 $(-not [FW]::IsWindow($h))" | Add-Content "$Out\watch.txt" -Encoding UTF8
  # 녹화가 끝나면 맨 위를 푼다(창이 남아 있으면 — HWND_NOTOPMOST(-2), NOSIZE|NOMOVE|NOACTIVATE)
  [FW]::SetWindowPos($h, [IntPtr](-2), 0, 0, 0, 0, 0x13) | Out-Null
  $prev = $h; $h = [IntPtr]::Zero
  for ($i = 0; $i -lt 300 -and $h -eq [IntPtr]::Zero -and (Get-Date) -lt $deadline; $i++) {
    Start-Sleep -Milliseconds 50
    $c = [FW]::Find($Title)
    if ($c -ne [IntPtr]::Zero -and ($c -ne $prev -or [FW]::IsWindowVisible($c))) { $h = $c }
  }
}
