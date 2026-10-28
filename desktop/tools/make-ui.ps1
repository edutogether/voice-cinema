# 설치기 화면 묶음 desktop/nsis/vc-ui.exe를 만든다(10/28) — NSIS 기본 화면 묶음(Contrib\UIs\modern.exe)에서 «확인 중» 대화 상자(111번, IDD_VERIFY)만
# 글 없는 0×0 상자로 바꾼 것이다. installer.nsh가 ChangeUI IDD_VERIFY로 이 상자만 바꿔 끼운다.
# 왜: 그 상자는 영어다 — NSIS는 큰 설치 파일을 확인할 때 «verifying installer: N%», UAC 플러그인은 «모든 사용자»로 관리자 권한 설치기를 띄우는 동안
#     «Please wait while Setup is loading...»(제목 없음)을 주 모니터 가운데에 1초쯤 띄웠다(기준 14 — 화면에는 한국어 문장만). 확인은 그대로 하고 창만 보이지 않게 한다.
# 쓰는 법(desktop/에서): powershell -File tools/make-ui.ps1 [NSIS의 modern.exe 경로] — 기본은 electron-builder가 받아 둔 NSIS 3.0.4.1
param([string]$Source = "$env:LOCALAPPDATA\electron-builder\Cache\nsis-3.0.4.1\nsis-3.0.4.1-1mx3n\Contrib\UIs\modern.exe")
$ErrorActionPreference = 'Stop'
$out = Join-Path $PSScriptRoot '..\nsis\vc-ui.exe'
Copy-Item -LiteralPath $Source -Destination $out -Force
Add-Type -TypeDefinition @'
using System; using System.Runtime.InteropServices;
public static class UiRes {
  [DllImport("kernel32.dll", CharSet = CharSet.Unicode, SetLastError = true)] static extern IntPtr BeginUpdateResource(string f, bool deleteExisting);
  [DllImport("kernel32.dll", SetLastError = true)] static extern bool UpdateResource(IntPtr h, IntPtr type, IntPtr name, ushort lang, byte[] data, uint size);
  [DllImport("kernel32.dll", SetLastError = true)] static extern bool EndUpdateResource(IntPtr h, bool discard);
  // DLGTEMPLATE: 스타일 WS_POPUP, 확장 스타일 WS_EX_TOOLWINDOW(작업 표시줄 단추 없음), 칸 1개, 위치 · 크기 0, 메뉴 · 클래스 · 제목 없음 (24바이트로 맞춤)
  // + DLGITEMTEMPLATE: 글 칸 IDC_STR(1030 — NSIS가 이 칸을 찾는다), 크기 0, 글 없음
  public static void Replace(string file, int id, ushort lang) {
    var t = new byte[50];
    BitConverter.GetBytes(0x80000000u).CopyTo(t, 0);
    BitConverter.GetBytes(0x00000080u).CopyTo(t, 4);
    BitConverter.GetBytes((ushort)1).CopyTo(t, 8);
    BitConverter.GetBytes(0x40000000u).CopyTo(t, 24);       // WS_CHILD | SS_LEFT
    BitConverter.GetBytes((ushort)1030).CopyTo(t, 40);       // 칸 번호
    BitConverter.GetBytes((ushort)0xFFFF).CopyTo(t, 42);     // 클래스: 미리 정한 것
    BitConverter.GetBytes((ushort)0x0082).CopyTo(t, 44);     // Static
    var h = BeginUpdateResource(file, false);
    if (h == IntPtr.Zero) throw new Exception("BeginUpdateResource " + Marshal.GetLastWin32Error());
    if (!UpdateResource(h, (IntPtr)5, (IntPtr)id, lang, t, (uint)t.Length)) throw new Exception("UpdateResource " + Marshal.GetLastWin32Error());
    if (!EndUpdateResource(h, false)) throw new Exception("EndUpdateResource " + Marshal.GetLastWin32Error());
  }
}
'@
[UiRes]::Replace((Resolve-Path $out).Path, 111, 1033)
"made $out ($((Get-Item $out).Length) bytes, SHA-256 $((Get-FileHash $out).Hash))"
