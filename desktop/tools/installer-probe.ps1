# Voice Cinema 설치기 · 제거기 확인 도구(2026-10-28). 사람이 누르듯 화면을 넘기며:
#   - 화면마다 창을 원본 해상도로 찍고(보이는 창 테두리 안의 실제 화면), 보이는 글을 모두 적는다.
#   - 안내문이 칸 안에 드는지 잰다 — 줄마다 굴림(창 글꼴)으로 폭을 재 칸보다 넓으면(= 낱말 중간에서 끊길 수 있으면) 문제로 적고,
#     한 줄에 두 문장 · «(을)를» 같은 조사 표기 · 글자 그대로 찍힌 «\n»도 찾는다.
#   - 진행 화면은 0.05초마다 막대(보이는 것 · 숨은 것) · 안내 상자(보이는지 · 줄 수 · 줄 내용) · 막대 위 글줄을 읽어 trace.jsonl에 남긴다.
#   - -Record면 그 창만 초당 30장으로 녹화한다(ffmpeg gfxcapture — Windows 창 캡처라 겹친 다른 창 · 뒤 화면은 찍히지 않는다, 무손실 ffv1).
#   - 시험 창은 작은 모니터(가장 작은 화면 — 사람이 쓰는 큰 모니터 말고, 기준 12)에만 띄운다: 설치 · 제거 · 묻는 창 · 앱 창이 만들어지는 순간
#     (보이기 전) 그 모니터 가운데로 옮긴다. 옮긴 창은 probe.log에 적는다.
#   - 0.1초마다 보이는 최상위 창을 살펴 새로 뜨고 사라진 창을 windows.jsonl에 적는다(기준 11). 명령 창(PowerShell · cmd · 터미널)이 하나라도
#     새로 보이면 probe.log 끝에 «명령 창 N개»로 알린다. 남의 창은 제목을 적지 않는다(종류 · 프로그램 이름만).
#   - 묻는 창: -OnRunning(«켜져 있습니다») · -OnInstalled(«이미 설치되어 있습니다»)에 ok · cancel을 주면 찍은 뒤 그 단추를 누른다.
#     -AfterCancel이면 «취소» 뒤 그 화면에 남았는지 찍고 설치 · 제거 창의 «취소»로 끝낸다. 주지 않으면 찍기만 하고 사람이 판단하게 둔다.
# 쓰는 법(저장소 desktop/에서):
#   설치(나만):        powershell -File tools/installer-probe.ps1 -Kind install -Exe "release\Voice Cinema Setup.exe" -Mode me -Out <폴더> -Record
#   설치(모든 사용자): 설치 파일은 평소 권한으로 띄우고(«모든 사용자»를 고르면 설치기가 관리자 권한으로 다시 뜬다), 이 도구는 관리자 권한으로 붙인다 —
#                      관리자 권한 창에는 평소 권한 프로그램이 보내는 메시지가 막힌다(Windows UIPI).
#                      Start-Process "release\Voice Cinema Setup.exe"; Start-Process powershell -Verb RunAs -ArgumentList '-File tools/installer-probe.ps1 -Kind install -Mode all -Attach -Out <폴더> -Record'
#   제거:              -Kind uninstall — 등록(«설치된 앱» · 제어판 «프로그램 추가/제거»가 실행하는 UninstallString)을 그대로 실행한다. -Scope me|all로 고른다.
#                      «모든 사용자» 설치는 제거기도 관리자 권한으로 다시 뜬다 — UninstallString을 평소 권한으로 실행하고 이 도구는 -Attach로 관리자 권한에서 붙인다.
# 녹화는 설치 · 제거 창 자리만 찍고, 이 도구가 창을 닫거나(«마침») 관리자 권한으로 넘기는(«모든 사용자»로 «다음») 단추를 누르기 전에 멈춘다.
param(
  [Parameter(Mandatory = $true)][ValidateSet('install', 'uninstall')][string]$Kind,
  [string]$Exe = '',
  [ValidateSet('me', 'all')][string]$Mode = 'me',
  [ValidateSet('me', 'all')][string]$Scope = 'me',
  [string]$Dir = '',
  [Parameter(Mandatory = $true)][string]$Out,
  [switch]$Record,
  [switch]$NoRun,
  [switch]$Attach,   # 아무것도 띄우지 않고 이미 뜬(뜰) 창에 붙는다 — 설치 · 제거기를 평소 권한으로 띄우고 이 도구는 관리자 권한으로 붙일 때
  [ValidateSet('', 'ok', 'cancel')][string]$OnRunning = '',
  [ValidateSet('', 'ok', 'cancel')][string]$OnInstalled = '',
  [switch]$AfterCancel,
  [string]$StartApp = '',   # 설치 · 제거기를 띄우기 전에 이 앱을 켜 둔다(기준 9 시험)
  [switch]$RevealDir,       # 위치 화면에서 줄인 경로(«…»)를 눌러 전체 경로가 되는지 찍고 적는다
  [int]$Minutes = 8
)
# 시험 창을 둘 모니터: 가장 작은 화면(이 PC는 아래 1760×990 · 125% — 위 두 큰 모니터는 사람이 쓴다). 바꿀 때는 여기만 고친다.
$TestScreen = 'smallest'
$ErrorActionPreference = 'Continue'
New-Item -ItemType Directory -Force $Out | Out-Null
$log = Join-Path $Out 'probe.log'
function Say([string]$s) { $s | Tee-Object -FilePath $log -Append | Out-Host }
Add-Type -AssemblyName System.Drawing
Add-Type -TypeDefinition @'
using System; using System.Text; using System.Collections.Generic; using System.Runtime.InteropServices;
public class Ctl { public IntPtr H; public int Id; public string Cls; public string Text; public bool Visible; public bool Enabled; public int W; public int Hgt; public int X; public int Y; public int Style; }
public static class W {
  public delegate bool EnumProc(IntPtr h, IntPtr l);
  [DllImport("user32.dll")] public static extern bool EnumWindows(EnumProc cb, IntPtr l);
  [DllImport("user32.dll")] public static extern bool EnumChildWindows(IntPtr p, EnumProc cb, IntPtr l);
  [DllImport("user32.dll", CharSet = CharSet.Unicode)] public static extern int GetClassName(IntPtr h, StringBuilder sb, int max);
  [DllImport("user32.dll", CharSet = CharSet.Unicode)] static extern IntPtr SendMessage(IntPtr h, int m, IntPtr w, StringBuilder l);
  [DllImport("user32.dll", CharSet = CharSet.Unicode, EntryPoint = "SendMessageW")] public static extern IntPtr SendText(IntPtr h, int m, IntPtr w, string l);
  [DllImport("user32.dll")] public static extern IntPtr SendMessage(IntPtr h, int m, IntPtr w, IntPtr l);
  [DllImport("user32.dll")] public static extern bool PostMessage(IntPtr h, int m, IntPtr w, IntPtr l);
  [DllImport("user32.dll")] public static extern bool IsWindowVisible(IntPtr h);
  [DllImport("user32.dll")] public static extern bool ShowWindow(IntPtr h, int cmd);
  [DllImport("user32.dll")] public static extern bool IsWindow(IntPtr h);
  [DllImport("user32.dll")] static extern bool IsWindowEnabled(IntPtr h);
  [DllImport("user32.dll")] public static extern int GetDlgCtrlID(IntPtr h);
  [DllImport("user32.dll")] public static extern IntPtr GetParent(IntPtr h);
  [DllImport("user32.dll")] public static extern int GetWindowLong(IntPtr h, int i);
  [DllImport("user32.dll")] public static extern uint GetWindowThreadProcessId(IntPtr h, out uint pid);
  [DllImport("user32.dll")] public static extern bool SetProcessDPIAware();
  [DllImport("user32.dll")] public static extern bool SetWindowPos(IntPtr h, IntPtr after, int x, int y, int cx, int cy, uint flags);
  [DllImport("user32.dll")] public static extern bool GetWindowRect(IntPtr h, out RECT r);
  [DllImport("user32.dll")] public static extern bool GetClientRect(IntPtr h, out RECT r);
  [DllImport("user32.dll")] public static extern bool ClientToScreen(IntPtr h, ref POINT p);
  [DllImport("user32.dll")] static extern bool RedrawWindow(IntPtr h, IntPtr r, IntPtr rgn, uint flags);
  // 창을 다시 그리게 한다(RDW_INVALIDATE | RDW_ALLCHILDREN | RDW_UPDATENOW | RDW_FRAME) — 창 캡처가 새 장을 받게
  public static void Redraw(IntPtr h) { if (h != IntPtr.Zero && IsWindow(h)) RedrawWindow(h, IntPtr.Zero, IntPtr.Zero, 0x0581); }
  [DllImport("user32.dll")] static extern uint GetDpiForWindow(IntPtr h);
  [DllImport("user32.dll")] static extern IntPtr MonitorFromWindow(IntPtr h, uint flags);
  [DllImport("shcore.dll")] static extern int GetDpiForMonitor(IntPtr m, int type, out uint x, out uint y);
  // 화면 화소 ÷ 창이 스스로 그리는 화소 — 배율을 모르는 창(NSIS)을 125% 모니터에 두면 Windows가 1.25배로 늘려 보인다. PrintWindow는 늘리기 전 크기로 그린다.
  public static double Stretch(IntPtr h) { uint x, y; GetDpiForMonitor(MonitorFromWindow(h, 2), 0, out x, out y); uint w = GetDpiForWindow(h); return w == 0 ? 1.0 : (double)x / w; }
  [StructLayout(LayoutKind.Sequential)] public struct POINT { public int X, Y; }
  // 창 안쪽(제목줄 · 테두리 뺀 곳)의 화면 좌표 — 창 캡처(gfxcapture)는 이 안쪽만 찍는다(10/28 확인: 725×450 창 → 723×416 장)
  public static RECT Client(IntPtr h) { RECT c; GetClientRect(h, out c); var p = new POINT(); ClientToScreen(h, ref p); return new RECT { L = p.X, T = p.Y, R = p.X + c.R, B = p.Y + c.B }; }
  [DllImport("user32.dll")] public static extern bool PrintWindow(IntPtr h, IntPtr hdc, uint flags);
  [DllImport("dwmapi.dll")] static extern int DwmGetWindowAttribute(IntPtr h, int attr, out RECT r, int size);
  // 눈에 보이는 창 테두리 — GetWindowRect는 Windows 10/11의 보이지 않는 크기 조절 테두리(양옆 · 아래 7px쯤)까지 넣어 뒤 창이 비친다
  public static RECT Visible(IntPtr h) { RECT r; if (DwmGetWindowAttribute(h, 9, out r, 16) != 0) GetWindowRect(h, out r); return r; }
  [DllImport("gdi32.dll", CharSet = CharSet.Unicode)] public static extern IntPtr CreateFontW(int h, int w, int e, int o, int weight, uint i, uint u, uint s, uint cs, uint op, uint cp, uint q, uint pf, string face);
  [DllImport("gdi32.dll")] public static extern IntPtr SelectObject(IntPtr dc, IntPtr o);
  [DllImport("gdi32.dll")] public static extern bool DeleteObject(IntPtr o);
  [DllImport("gdi32.dll", CharSet = CharSet.Unicode)] public static extern bool GetTextExtentPoint32W(IntPtr dc, string s, int n, out SIZE sz);
  [DllImport("user32.dll")] public static extern IntPtr GetDC(IntPtr h);
  [DllImport("user32.dll")] public static extern int ReleaseDC(IntPtr h, IntPtr dc);
  [DllImport("kernel32.dll")] public static extern IntPtr OpenProcess(uint access, bool inherit, uint pid);
  [DllImport("kernel32.dll")] public static extern IntPtr VirtualAllocEx(IntPtr p, IntPtr a, uint size, uint type, uint prot);
  [DllImport("kernel32.dll")] public static extern bool VirtualFreeEx(IntPtr p, IntPtr a, uint size, uint type);
  [DllImport("kernel32.dll")] public static extern bool WriteProcessMemory(IntPtr p, IntPtr a, byte[] b, int n, out IntPtr w);
  [DllImport("kernel32.dll")] public static extern bool ReadProcessMemory(IntPtr p, IntPtr a, byte[] b, int n, out IntPtr r);
  [DllImport("kernel32.dll")] public static extern bool CloseHandle(IntPtr h);
  [StructLayout(LayoutKind.Sequential)] public struct RECT { public int L, T, R, B; }
  [StructLayout(LayoutKind.Sequential)] public struct SIZE { public int cx, cy; }
  public static string Cls(IntPtr h) { var sb = new StringBuilder(64); GetClassName(h, sb, 64); return sb.ToString(); }
  public static string Text(IntPtr h) { var sb = new StringBuilder(4096); SendMessage(h, 0x000D, (IntPtr)4096, sb); return sb.ToString(); }
  // 이 도구가 닫거나(«마침») 관리자 권한으로 넘기는(«모든 사용자»로 «다음») 단추를 누른 창 — 다시 보지 않는다(숨은 채 남아 있어도 찍지 않게)
  public static HashSet<IntPtr> closed = new HashSet<IntPtr>();
  public static bool Present(IntPtr h) { return !closed.Contains(h) && IsWindowVisible(h); }
  // 단추 누르기: 창이 활성이 아니면 BM_CLICK이 무시된다(10/28 제거기 «마침»이 한 번 무시됨) — 부모 창에 그 단추 명령(WM_COMMAND)을 보낸다
  public static void Press(IntPtr button) { PostMessage(GetParent(button), 0x0111, (IntPtr)GetDlgCtrlID(button), button); }
  public static List<IntPtr> Wizards(string prefix) {
    var list = new List<IntPtr>();
    EnumWindows((h, l) => {
      if (!Present(h) || Cls(h) != "#32770") return true;
      var t = Text(h); if (!t.StartsWith(prefix)) return true;
      bool inner = false; EnumChildWindows(h, (c, x) => { if (Cls(c) == "#32770") { inner = true; return false; } return true; }, IntPtr.Zero);
      if (inner) list.Add(h); return true; }, IntPtr.Zero);
    return list;
  }
  public static List<IntPtr> Boxes(string prefix) {
    var list = new List<IntPtr>();
    EnumWindows((h, l) => {
      if (!IsWindowVisible(h) || Cls(h) != "#32770") return true;
      var t = Text(h); if (!t.StartsWith(prefix)) return true;
      bool inner = false; EnumChildWindows(h, (c, x) => { if (Cls(c) == "#32770") { inner = true; return false; } return true; }, IntPtr.Zero);
      if (!inner) list.Add(h); return true; }, IntPtr.Zero);
    return list;
  }
  public static List<Ctl> Children(IntPtr parent) {
    var list = new List<Ctl>();
    EnumChildWindows(parent, (h, l) => { RECT r; GetWindowRect(h, out r); RECT c; GetClientRect(h, out c);
      list.Add(new Ctl { H = h, Id = GetDlgCtrlID(h), Cls = Cls(h), Text = Text(h), Visible = IsWindowVisible(h), Enabled = IsWindowEnabled(h), W = c.R - c.L, Hgt = c.B - c.T, X = r.L, Y = r.T, Style = GetWindowLong(h, -16) }); return true; }, IntPtr.Zero);
    return list;
  }
  public static int Measure(string s, int height, int weight) {
    IntPtr dc = GetDC(IntPtr.Zero);
    IntPtr f = CreateFontW(height, 0, 0, 0, weight, 0, 0, 0, 129, 0, 0, 0, 0, "굴림");
    IntPtr old = SelectObject(dc, f); SIZE sz; GetTextExtentPoint32W(dc, s, s.Length, out sz); SelectObject(dc, old); DeleteObject(f); ReleaseDC(IntPtr.Zero, dc);
    return sz.cx;
  }
  // 32비트 NSIS 프로세스의 목록(SysListView32)에서 줄 하나를 읽는다 — LVITEMW(32비트 배치)와 글 버퍼를 그 프로세스 안에 만들고 LVM_GETITEMTEXTW
  public static string ListItem(IntPtr list, int index) {
    uint pid; GetWindowThreadProcessId(list, out pid);
    IntPtr p = OpenProcess(0x0008 | 0x0010 | 0x0020, false, pid);
    if (p == IntPtr.Zero) return null;
    IntPtr mem = VirtualAllocEx(p, IntPtr.Zero, 4096, 0x1000, 0x04);
    try {
      int textAt = 256; var item = new byte[60];
      BitConverter.GetBytes(0x0001).CopyTo(item, 0);              // mask = LVIF_TEXT
      BitConverter.GetBytes(index).CopyTo(item, 4);
      BitConverter.GetBytes((int)((long)mem + textAt)).CopyTo(item, 20); // pszText
      BitConverter.GetBytes(1024).CopyTo(item, 24);               // cchTextMax
      IntPtr n; WriteProcessMemory(p, mem, item, item.Length, out n);
      int len = (int)SendMessage(list, 0x1073, (IntPtr)index, mem);
      var buf = new byte[len * 2]; ReadProcessMemory(p, (IntPtr)((long)mem + textAt), buf, buf.Length, out n);
      return Encoding.Unicode.GetString(buf);
    } finally { VirtualFreeEx(p, mem, 0, 0x8000); CloseHandle(p); }
  }
  // 모니터마다 배율이 달라(위 100% · 아래 125%) 실제 화소 좌표로 다룬다 — 스레드마다 «모니터별 배율 인식(v2)»으로 둔다
  [DllImport("user32.dll")] public static extern IntPtr SetThreadDpiAwarenessContext(IntPtr c);
  public static void PerMonitor() { SetThreadDpiAwarenessContext((IntPtr)(-4)); }
  static Dictionary<uint, string> names = new Dictionary<uint, string>();
  public static string ProcName(uint pid) {
    lock (names) {
      string n; if (names.TryGetValue(pid, out n)) return n;
      try { n = System.Diagnostics.Process.GetProcessById((int)pid).ProcessName; } catch { n = "?"; }
      names[pid] = n; return n;
    }
  }
}

// 시험 창을 작은 모니터로: 창이 만들어지거나 보이는 순간(Windows 이벤트) 그 모니터 가운데로 옮긴다
public static class Place {
  public delegate void WinEventProc(IntPtr hook, uint ev, IntPtr h, int obj, int child, uint thread, uint time);
  delegate bool MonProc(IntPtr m, IntPtr dc, IntPtr r, IntPtr d);
  [DllImport("user32.dll")] static extern IntPtr SetWinEventHook(uint min, uint max, IntPtr mod, WinEventProc cb, uint pid, uint tid, uint flags);
  [DllImport("user32.dll")] static extern int GetMessage(out MSG m, IntPtr h, uint a, uint b);
  [DllImport("user32.dll")] static extern IntPtr GetAncestor(IntPtr h, uint f);
  [DllImport("user32.dll")] static extern bool EnumDisplayMonitors(IntPtr dc, IntPtr clip, MonProc cb, IntPtr d);
  [DllImport("user32.dll", CharSet = CharSet.Unicode)] static extern bool GetMonitorInfo(IntPtr m, ref MONITORINFOEX mi);
  [DllImport("user32.dll")] static extern bool IsZoomed(IntPtr h);
  [StructLayout(LayoutKind.Sequential)] public struct MSG { public IntPtr h; public uint msg; public IntPtr w; public IntPtr l; public uint time; public int x; public int y; }
  [StructLayout(LayoutKind.Sequential, CharSet = CharSet.Unicode)] public struct MONITORINFOEX { public int cb; public W.RECT mon; public W.RECT work; public uint flags; [MarshalAs(UnmanagedType.ByValTStr, SizeConst = 32)] public string name; }
  public static W.RECT Work, Mon; public static string Monitor = "";
  public static List<string> Violations = new List<string>();
  public static volatile bool Aborted;
  public static HashSet<string> Procs = new HashSet<string>(StringComparer.OrdinalIgnoreCase) { "Voice Cinema Setup", "Voice Cinema", "Un_A", "Un_B", "Uninstall Voice Cinema", "old-uninstaller" };
  public static List<string> Moved = new List<string>();
  static WinEventProc keep;
  public static string Pick() {
    W.PerMonitor();
    long best = long.MaxValue;
    EnumDisplayMonitors(IntPtr.Zero, IntPtr.Zero, (m, dc, r, d) => {
      var mi = new MONITORINFOEX(); mi.cb = Marshal.SizeOf(typeof(MONITORINFOEX)); GetMonitorInfo(m, ref mi);
      long area = (long)(mi.mon.R - mi.mon.L) * (mi.mon.B - mi.mon.T);
      if (area < best) { best = area; Work = mi.work; Mon = mi.mon; Monitor = string.Format("{0} {1},{2} {3}x{4} 작업 영역 {5}x{6}", mi.name, mi.mon.L, mi.mon.T, mi.mon.R - mi.mon.L, mi.mon.B - mi.mon.T, mi.work.R - mi.work.L, mi.work.B - mi.work.T); }
      return true; }, IntPtr.Zero);
    return Monitor;
  }
  public static void Start() {
    var t = new System.Threading.Thread(() => {
      W.PerMonitor();
      keep = OnEvent;
      SetWinEventHook(0x8000, 0x8002, IntPtr.Zero, keep, 0, 0, 0x0002);   // 만들어짐 ~ 보임, 이 도구의 창은 빼고
      MSG m; while (GetMessage(out m, IntPtr.Zero, 0, 0) > 0) { }
    });
    t.IsBackground = true; t.Start();
  }
  static void OnEvent(IntPtr hook, uint ev, IntPtr h, int obj, int child, uint thread, uint time) {
    if (obj != 0 || child != 0 || h == IntPtr.Zero || GetAncestor(h, 2) != h) return;
    uint pid; W.GetWindowThreadProcessId(h, out pid);
    string name = W.ProcName(pid);
    if (!Procs.Contains(name)) return;
    string cls = W.Cls(h); int style = W.GetWindowLong(h, -16);
    // 설치 · 제거 창과 묻는 창(#32770), 앱의 테두리 있는 창(제목줄 있는 Chrome 창)만 — 앱의 숨은 보조 창은 건드리지 않는다
    if (cls != "#32770" && !(cls == "Chrome_WidgetWin_1" && (style & 0x00C00000) == 0x00C00000)) return;
    W.RECT r; W.GetWindowRect(h, out r);
    // 보이는 순간 이미 다른 모니터에 있었으면(= 큰 모니터에 그려졌으면) 적고, 그 순간 창을 숨기고 그 프로그램을 끝내 시험을 멈춘다 — 기준 12 위반
    // (10/28 팀장 지시: 잡은 순간 바로 중단하고 창을 닫는다. 끝내는 것은 시험이 띄운 설치기 · 제거기 · 앱뿐 — Procs)
    if (ev == 0x8002) {
      W.RECT v = W.Visible(h);
      if (v.L < Mon.L || v.T < Mon.T || v.R > Mon.R || v.B > Mon.B) {
        W.ShowWindow(h, 0);
        try { System.Diagnostics.Process.GetProcessById((int)pid).Kill(); } catch { }
        Aborted = true;
        lock (Moved) Violations.Add(string.Format("{0:HH:mm:ss.fff} {1} {2} «{3}» 보인 자리 {4},{5} {6}x{7} — 숨기고 끝냄", DateTime.Now, name, cls, W.Text(h), v.L, v.T, v.R - v.L, v.B - v.T));
        return;
      }
    }
    if (IsZoomed(h)) return;
    if (r.L >= Work.L && r.T >= Work.T && r.R <= Work.R && r.B <= Work.B) return;
    int w = r.R - r.L, hh = r.B - r.T;
    int x = Work.L + Math.Max(0, ((Work.R - Work.L) - w) / 2), y = Work.T + Math.Max(0, ((Work.B - Work.T) - hh) / 2);
    bool visible = W.IsWindowVisible(h);
    W.SetWindowPos(h, IntPtr.Zero, x, y, 0, 0, 0x0015);
    // 앱 창은 그 모니터에서 최대화된다(main.js) — 옮기면 배율(125%)만큼 커지므로, 옮긴 뒤 작업 영역 크기로 줄여 둔다(최대화가 넓히기만 하게)
    if (cls == "Chrome_WidgetWin_1") {
      W.RECT m; W.GetWindowRect(h, out m);
      if (m.R - m.L > Work.R - Work.L || m.B - m.T > Work.B - Work.T)
        W.SetWindowPos(h, IntPtr.Zero, Work.L, Work.T, Work.R - Work.L, Work.B - Work.T, 0x0014);
    }
    lock (Moved) Moved.Add(string.Format("{0:HH:mm:ss.fff} {1} {2} «{3}» {4},{5} → {6},{7}{8}", DateTime.Now, name, cls, W.Text(h), r.L, r.T, x, y, visible ? " ⚠ 옮기기 전에 이미 보였다" : ""));
  }
}

// 보이는 최상위 창 기록(0.1초마다) — 새로 보인 창 · 사라진 창만 적는다. 명령 창은 따로 센다.
public static class Watch {
  static System.Threading.Timer timer; static HashSet<IntPtr> prev; static System.IO.StreamWriter w; static System.Diagnostics.Stopwatch sw;
  public static List<string> Consoles = new List<string>();
  public static int Shown;
  static readonly HashSet<string> consoleCls = new HashSet<string> { "ConsoleWindowClass", "CASCADIA_HOSTING_WINDOW_CLASS", "PseudoConsoleWindow" };
  static readonly HashSet<string> consoleProc = new HashSet<string>(StringComparer.OrdinalIgnoreCase) { "powershell", "pwsh", "cmd", "conhost", "OpenConsole", "WindowsTerminal" };
  public static void Start(string path) {
    w = new System.IO.StreamWriter(path, false, new UTF8Encoding(false)); w.AutoFlush = true;
    sw = System.Diagnostics.Stopwatch.StartNew();
    timer = new System.Threading.Timer(Tick, null, 0, 100);
  }
  static void Tick(object o) {
    lock (w) {
      W.PerMonitor();
      var now = new HashSet<IntPtr>();
      W.EnumWindows((h, l) => { if (W.IsWindowVisible(h)) now.Add(h); return true; }, IntPtr.Zero);
      double t = Math.Round(sw.Elapsed.TotalSeconds, 2);
      if (prev == null) { w.WriteLine("{{\"t\":{0},\"ev\":\"start\",\"visible\":{1}}}", t, now.Count); prev = now; return; }
      foreach (var h in now) {
        if (prev.Contains(h)) continue;
        uint pid; W.GetWindowThreadProcessId(h, out pid); string proc = W.ProcName(pid); string cls = W.Cls(h);
        bool console = consoleCls.Contains(cls) || consoleProc.Contains(proc);
        bool ours = Place.Procs.Contains(proc);
        W.RECT r = W.Visible(h);
        string title = (ours || console) ? W.Text(h).Replace("\\", "\\\\").Replace("\"", "\\\"") : "";
        // 제목 없는 우리 창(작은 알림 창 등)은 안의 글자로 무엇인지 적는다
        if (ours && title.Length == 0) {
          var parts = new List<string>();
          W.EnumChildWindows(h, (c, x) => { var s = W.Text(c); if (s.Length > 0) parts.Add(s); return true; }, IntPtr.Zero);
          title = "pid " + pid + ": " + string.Join(" | ", parts).Replace("\\", "\\\\").Replace("\"", "\\\"").Replace("\r", " ").Replace("\n", " ");
        }
        w.WriteLine("{{\"t\":{0},\"ev\":\"show\",\"hwnd\":{1},\"proc\":\"{2}\",\"cls\":\"{3}\",\"title\":\"{4}\",\"rect\":[{5},{6},{7},{8}],\"console\":{9}}}",
          t, (long)h, proc, cls, title, r.L, r.T, r.R - r.L, r.B - r.T, console ? "true" : "false");
        Shown++;
        if (console) Consoles.Add(string.Format("{0}s {1} {2} «{3}»", t, proc, cls, title));
      }
      foreach (var h in prev) if (!now.Contains(h)) w.WriteLine("{{\"t\":{0},\"ev\":\"hide\",\"hwnd\":{1}}}", t, (long)h);
      prev = now;
    }
  }
  public static void Stop() { if (timer != null) { timer.Dispose(); lock (w) { w.Close(); } } }
}
'@
[W]::PerMonitor()
Say "시험 창 자리: $([Place]::Pick())"
[Place]::Start()
[Watch]::Start((Join-Path $Out 'windows.jsonl'))
$prefix = if ($Kind -eq 'install') { 'Voice Cinema 설치' } else { 'Voice Cinema 제거' }
$elevated = ([Security.Principal.WindowsPrincipal][Security.Principal.WindowsIdentity]::GetCurrent()).IsInRole([Security.Principal.WindowsBuiltInRole]::Administrator)
Say "== $Kind mode=$Mode scope=$Scope dir=[$Dir] elevated=$elevated onRunning=[$OnRunning] onInstalled=[$OnInstalled] afterCancel=$AfterCancel $(Get-Date -Format 'HH:mm:ss.fff')"

# 앱을 먼저 켜 둔다(기준 9) — 창이 뜨고(작은 모니터로 옮겨진다) 첫 화면이 다 그려질 때까지 기다린다
if ($StartApp) {
  Start-Process -FilePath $StartApp | Out-Null
  for ($i = 0; $i -lt 60 -and -not (Get-Process -Name 'Voice Cinema' -ErrorAction SilentlyContinue | Where-Object { $_.MainWindowHandle -ne 0 }); $i++) { Start-Sleep -Milliseconds 500 }
  Start-Sleep -Seconds 5
  Say "app started: $(@(Get-Process -Name 'Voice Cinema' -ErrorAction SilentlyContinue).Count) processes"
}

if ($Kind -eq 'install' -and $Exe -and -not $Attach) { Start-Process -FilePath $Exe | Out-Null; Say "start $Exe" }
if ($Kind -eq 'uninstall' -and -not $Attach) {
  $root = if ($Scope -eq 'all') { 'HKLM:' } else { 'HKCU:' }
  $key = Get-ChildItem "$root\Software\Microsoft\Windows\CurrentVersion\Uninstall" | Where-Object { (Get-ItemProperty $_.PSPath).DisplayName -eq 'Voice Cinema' } | Select-Object -First 1
  if (-not $key) { Say 'FAIL: 등록에 Voice Cinema가 없다'; exit 1 }
  $us = (Get-ItemProperty $key.PSPath).UninstallString
  Say "UninstallString($root): $us"
  if ($us -match '^"([^"]+)"\s*(.*)$') { Start-Process -FilePath $Matches[1] -ArgumentList $Matches[2] | Out-Null } else { Say 'FAIL: UninstallString 모양'; exit 1 }
}

# 그 창만 찍는다 — 화면 복사(CopyFromScreen)는 그 자리에 떠 있는 다른 «항상 위» 창까지 찍었다(10/28: 작은 모니터 위의 다른 창이 찍혔다).
# PrintWindow에 PW_RENDERFULLCONTENT(2)를 주면 Windows가 화면에 합성한 그대로(투명 바탕 글 칸 포함) 그 창만 그려 준다. 보이는 테두리 안만 남긴다.
# 배율을 모르는 창(NSIS 설치 창 · 묻는 창)은 그 창이 그리는 원래 크기(100%)로 찍힌다 — 125% 모니터에서 Windows가 늘려 보이는 것보다 1.25배 작다.
function Capture([IntPtr]$h, [string]$name) {
  Start-Sleep -Milliseconds 150
  $s = [W]::Stretch($h)
  $wr = New-Object W+RECT; [W]::GetWindowRect($h, [ref]$wr) | Out-Null
  $r = [W]::Visible($h)
  $full = New-Object System.Drawing.Bitmap ([int][math]::Round(($wr.R - $wr.L) / $s)), ([int][math]::Round(($wr.B - $wr.T) / $s))
  $g = [System.Drawing.Graphics]::FromImage($full)
  $dc = $g.GetHdc(); [W]::PrintWindow($h, $dc, 2) | Out-Null; $g.ReleaseHdc($dc); $g.Dispose()
  $cx = [int][math]::Round(($r.L - $wr.L) / $s); $cy = [int][math]::Round(($r.T - $wr.T) / $s)
  $cw = [math]::Min([int][math]::Round(($r.R - $r.L) / $s), $full.Width - $cx); $ch = [math]::Min([int][math]::Round(($r.B - $r.T) / $s), $full.Height - $cy)
  $crop = New-Object System.Drawing.Rectangle $cx, $cy, $cw, $ch
  $bmp = $full.Clone($crop, $full.PixelFormat)
  $bmp.Save((Join-Path $Out $name), [System.Drawing.Imaging.ImageFormat]::Png); $bmp.Dispose(); $full.Dispose()
}
# 안내문 검사: 줄마다 폭(굴림, 창과 같은 크기)을 재 칸 폭과 견준다. 단추(라디오 · 확인란)는 앞의 동그라미 · 네모 몫(18px)을 뺀다.
$issues = New-Object System.Collections.ArrayList
function CheckTexts([string]$page, $ctls, [bool]$wide, [bool]$box = $false) {
  $titleY = ($ctls | Where-Object { $_.Visible -and $_.Cls -eq 'Static' -and $_.Text -and $_.W -gt 150 } | Sort-Object Y | Select-Object -First 1).Y
  foreach ($c in $ctls) {
    if (-not $c.Visible -or -not $c.Text -or $c.Cls -notin @('Static', 'Button')) { continue }
    if ($c.Cls -eq 'Button' -and (($c.Style -band 0xF) -notin @(2, 3, 4, 5, 9))) { continue }   # 누름 단추는 칸 폭을 재지 않는다
    $bold = ($c.Id -eq 1037) -or ($wide -and $c.Y -eq $titleY)
    $height = if ($wide -and $c.Y -eq $titleY) { -16 } else { -12 }
    $avail = $c.W - $(if ($c.Cls -eq 'Button') { 18 } else { 0 })
    $lines = $c.Text -split "`r`n"
    foreach ($line in $lines) {
      # 묻는 창은 Windows가 글에 맞춰 창 크기를 정한다(글꼴도 굴림이 아니다) — 폭은 재지 않는다
      if (-not $box) {
        $w = [W]::Measure($line, $height, $(if ($bold) { 700 } else { 400 }))
        if ($w -gt $avail) { [void]$issues.Add("[$page] 칸 넘침 ${w}px > ${avail}px (id $($c.Id)): $line") }
      }
      if (([regex]::Matches($line, '[.?!](\s|$)')).Count -gt 1) { [void]$issues.Add("[$page] 한 줄 두 문장 (id $($c.Id)): $line") }
    }
    if ($c.Text -match '\(을\)|\(를\)|이\(가\)|\(이\)|\(와\)|\\n') { [void]$issues.Add("[$page] 조사 표기 · \n 글자 (id $($c.Id)): $($c.Text -replace "`r`n", ' / ')") }
    if ($c.Text -match '주시기 바랍니다|성공적으로|하였습니다|하십시오|됨(\.|$)') { [void]$issues.Add("[$page] 번역투 (id $($c.Id)): $($c.Text -replace "`r`n", ' / ')") }
    # 설치 창 안내문(굴림)은 줄 사이에 빈 줄이 있어야 글자가 맞닿지 않는다 — 묻는 창은 Windows 글꼴이라 보지 않는다
    if (-not $box -and $c.Cls -eq 'Static') { for ($i = 1; $i -lt $lines.Count; $i++) { if ($lines[$i] -and $lines[$i - 1]) { [void]$issues.Add("[$page] 줄 사이 빈 줄 없음 (id $($c.Id)): $($lines[$i - 1]) / $($lines[$i])") } } }
  }
}

# 녹화는 설치 · 제거 창만 찍는다(gfxcapture — Windows 창 캡처: 겹친 다른 창이나 뒤 화면은 들어오지 않는다). 창이 사라지면 바로 멈춘다.
# «모든 사용자»처럼 창이 사라졌다 다시 뜨면 다음 조각(screen-2.mkv)으로 잇는다. gfxcapture가 시작하지 못하면 그 창 자리를 찍는 gdigrab으로 한다
# (그때는 창을 맨 위에 둔다).
$ff = $null; $recRect = $null; $segment = 0; $segments = @()
# ffmpeg의 표준 출력도 이 도구가 받는다 — 물려주면 ffmpeg가 남았을 때 이 도구를 부른 쪽이 그 통로가 닫히기를 기다리며 멈춘다(10/28 14회차)
$script:ffAll = @()
function StartFfmpeg([string]$ffArgs) {
  $psi = New-Object System.Diagnostics.ProcessStartInfo('ffmpeg', $ffArgs)
  $psi.UseShellExecute = $false; $psi.RedirectStandardInput = $true; $psi.RedirectStandardOutput = $true; $psi.RedirectStandardError = $true; $psi.CreateNoWindow = $true
  $p = [System.Diagnostics.Process]::Start($psi)
  $script:ffErr = $p.StandardError.ReadToEndAsync()
  [void]$p.StandardOutput.ReadToEndAsync()
  $script:ffAll += $p
  return $p
}
function StartRecord([IntPtr]$h) {
  if (-not $Record -or $script:ff) { return }
  $r = [W]::Visible($h)
  $w = $r.R - $r.L; $hh = $r.B - $r.T; if ($w % 2) { $w-- }; if ($hh % 2) { $hh-- }
  $script:recRect = @{ x = $r.L; y = $r.T; w = $w; h = $hh }
  $script:segment++
  $file = if ($script:segment -eq 1) { 'screen.mkv' } else { "screen-$($script:segment).mkv" }
  $path = Join-Path $Out $file
  $script:recHwnd = $h
  $how = 'gfxcapture'
  $script:ff = StartFfmpeg ('-y -loglevel error -f lavfi -i "gfxcapture=hwnd={0}:capture_cursor=0:max_framerate=30,hwdownload,format=bgra" -fps_mode cfr -r 30 -c:v ffv1 "{1}"' -f [long]$h, $path)
  Start-Sleep -Milliseconds 700
  if ($script:ff.HasExited) {
    Say "  gfxcapture 시작 실패: $($script:ffErr.Result.Trim())"
    $how = 'gdigrab'
    [W]::SetWindowPos($h, [IntPtr](-1), 0, 0, 0, 0, 0x53) | Out-Null
    $script:ff = StartFfmpeg ('-y -loglevel error -f gdigrab -framerate 30 -offset_x {0} -offset_y {1} -video_size {2}x{3} -i desktop -c:v ffv1 "{4}"' -f $r.L, $r.T, $w, $hh, $path)
  }
  $cr = [W]::Client($h)
  $script:segments += @{ file = $file; start = Get-Date; gone = $null; x = $r.L; y = $r.T; w = $w; h = $hh; how = $how; cx = $cr.L; cy = $cr.T; cw = $cr.R - $cr.L; ch = $cr.B - $cr.T }
  if (-not $script:recStart) { $script:recStart = Get-Date }
  Say "record start $file ($how) rect $($r.L),$($r.T) ${w}x${hh} at $([math]::Round(((Get-Date) - $script:recStart).TotalSeconds, 3))s"
}
function StopRecord {
  if (-not $script:ff) { return }
  $script:segments[-1].gone = Get-Date
  if (-not $script:ff.HasExited) {
    try { $script:ff.StandardInput.Write('q'); $script:ff.StandardInput.Close() } catch { }
    # 창 캡처는 창이 바뀔 때만 새 장을 받는다 — 화면이 멈춰 있으면 ffmpeg가 «q»를 읽을 차례가 오지 않는다(10/28 14회차: 창이 닫힌 뒤에도 끝나지 않았다).
    # 창을 다시 그리게 해 새 장을 보내고, 그래도 5초 안에 끝나지 않으면 끝낸다(무손실 녹화라 그때까지 쓴 장은 남는다 — 뒤에서 길이를 다시 맞춘다).
    for ($i = 0; $i -lt 10 -and -not $script:ff.HasExited; $i++) { [W]::Redraw($script:recHwnd); $script:ff.WaitForExit(500) | Out-Null }
    if (-not $script:ff.HasExited) { $script:ff.Kill(); $script:ff.WaitForExit(5000) | Out-Null; Say "  record: 5초 안에 끝나지 않아 끝냄" }
  }
  Say "record stop exit=$($script:ff.ExitCode)"; $script:ff = $null
}
# 멈추라는 신호가 닿기까지 찍힌 몇 장(창이 사라진 뒤의 화면)을 잘라 낸다 — 조각마다 «창이 사라진 때»까지만 남긴다
function TrimSegments {
  foreach ($s in $script:segments) {
    if (-not $s.gone) { continue }
    $keep = [math]::Max(0, ($s.gone - $s.start).TotalSeconds - 0.1)
    $src = Join-Path $Out $s.file; $tmp = Join-Path $Out ('trim-' + $s.file)
    & ffmpeg -v error -y -i $src -t ([string]::Format([Globalization.CultureInfo]::InvariantCulture, '{0:0.000}', $keep)) -c copy $tmp
    Move-Item -Force $tmp $src
    Say "trim $($s.file) to $([math]::Round($keep, 3))s"
  }
  # 창 캡처(gfxcapture)의 한 장 크기로 화면 좌표의 원점을 맞춘다 — 한 장이 창 안쪽 크기면 안쪽 원점(제목줄 아래), 아니면 보이는 테두리 원점
  foreach ($s in $script:segments) {
    if ($s.how -ne 'gfxcapture') { continue }
    $size = (& ffprobe -v error -select_streams v:0 -show_entries stream=width,height -of csv=p=0 (Join-Path $Out $s.file)) -split ','
    if ($size.Count -lt 2) { continue }
    $fw = [int]$size[0]; $fh = [int]$size[1]
    if ([math]::Abs($fw - $s.cw) -le 2 -and [math]::Abs($fh - $s.ch) -le 2) { $s.x = $s.cx; $s.y = $s.cy }
    $s.w = $fw; $s.h = $fh
    Say "frame $($s.file) ${fw}x${fh} (안쪽 $($s.cw)x$($s.ch)) → origin $($s.x),$($s.y)"
  }
}

$trace = Join-Path $Out 'trace.jsonl'
$step = 0; $lastSig = ''; $seen = $false; $goneSince = $null; $listSeen = 0
$until = (Get-Date).AddMinutes($Minutes)
$t0 = Get-Date
while ((Get-Date) -lt $until) {
  if ([Place]::Aborted) { Say '⚠ 작은 모니터 밖에 창이 보여 시험을 멈췄다(그 창은 숨기고 끝냈다)'; break }
  # 묻는 창: 찍고 적는다. -OnRunning · -OnInstalled를 받은 창은 그 단추를 누르고, 끝내는 중(-AfterCancel)에 뜬 창은 «예»를 누른다.
  # 그 밖의 창은 그대로 둔다 — 사람이 판단할 일
  # 묻는 창의 제목은 설치기 · 제거기 창 제목과 다를 수 있다(«Voice Cinema 설치» · «Voice Cinema») — 앱 이름으로 찾는다
  foreach ($b in [W]::Boxes('Voice Cinema')) {
    if ($script:answered -contains $b) { continue }
    $bctls = [W]::Children($b)
    $bt = ($bctls | Where-Object { $_.Text } | ForEach-Object { $_.Text }) -join ' | '
    if (-not $bt) { continue }   # 글이 없는 창(닫히는 중인 창 등)은 묻는 창이 아니다
    if ($bt -ne $script:lastBox) {
      $script:lastBox = $bt; $step++
      Start-Sleep -Milliseconds 300
      Capture $b ("{0:D2}-message.png" -f $step); Say "--- message: $bt"
      CheckTexts ("{0:D2}-message.png" -f $step) @($bctls | Where-Object { $_.Cls -eq 'Static' }) $false $true
    }
    $answer = if ($bt -match '켜져 있습니다') { $OnRunning } elseif ($bt -match '이미 설치되어') { $OnInstalled } elseif ($script:quitting) { 'yes' } else { '' }
    if ($answer) {
      $id = @{ ok = 1; cancel = 2; yes = 6 }[$answer]
      $btn = $bctls | Where-Object { $_.Cls -eq 'Button' -and $_.Id -eq $id } | Select-Object -First 1
      if ($btn) {
        [W]::Press($btn.H); $script:answered += $b; Say "  answer: $answer ($($btn.Text))"
        if ($answer -eq 'cancel') { $script:cancelledAt = Get-Date }
      }
    }
  }
  # «취소»를 누른 뒤: 1초 뒤 그 화면에 남았는지 찍고(-AfterCancel) 설치 · 제거 창의 «취소»로 끝낸다
  if ($script:cancelledAt -and $AfterCancel -and -not $script:quitting -and ((Get-Date) - $script:cancelledAt).TotalSeconds -gt 1) {
    $cw = [W]::Wizards($prefix) | Select-Object -First 1
    if ($cw) {
      $step++; Capture $cw ("{0:D2}-after-cancel.png" -f $step)
      $texts = ([W]::Children($cw) | Where-Object { $_.Visible -and $_.Text -and $_.Cls -in 'Static', 'Button' } | ForEach-Object { $_.Text -replace "`r?`n", ' / ' }) -join ' | '
      Say "--- after cancel (same page?): $texts"
      $quit = [W]::Children($cw) | Where-Object { $_.Cls -eq 'Button' -and $_.Id -eq 2 -and $_.Visible } | Select-Object -First 1
      $script:quitting = $true
      StopRecord; [void][W]::closed.Add($cw)
      if ($quit) { Say "  quit: $($quit.Text)"; [W]::Press($quit.H) }
    }
  }
  # 닫으려고 누른 창이 3초 뒤에도 그대로 보이면(누르기가 무시되면) 한 번 더 누른다
  if ($script:pressed -and ((Get-Date) - $script:pressed.at).TotalSeconds -gt 3 -and [W]::IsWindowVisible($script:pressed.win)) {
    Say "  press again: $([W]::Text($script:pressed.button))"; [W]::Press($script:pressed.button); $script:pressed.at = Get-Date
  }
  $wins = [W]::Wizards($prefix)
  if ($wins.Count -eq 0) {
    if ($seen) {
      StopRecord
      if (-not $goneSince) { $goneSince = Get-Date } elseif (((Get-Date) - $goneSince).TotalSeconds -gt 6) { Say 'wizard closed'; break }
    }
    Start-Sleep -Milliseconds 20; continue
  }
  $goneSince = $null; $seen = $true
  $h = $wins[0]
  StartRecord $h
  $outer = [W]::Children($h)
  $inner = $outer | Where-Object { $_.Cls -eq '#32770' -and $_.Visible } | Select-Object -First 1
  $innerCtls = if ($inner) { [W]::Children($inner.H) } else { @() }
  $bars = @($innerCtls | Where-Object { $_.Cls -eq 'msctls_progress32' })
  $list = $innerCtls | Where-Object { $_.Cls -eq 'SysListView32' } | Select-Object -First 1
  if ($bars.Count -gt 0) {
    # 진행 화면 — 0.05초마다 기록
    $rec = [ordered]@{ t = [math]::Round(((Get-Date) - $t0).TotalSeconds, 3) }
    $rec.bars = @($bars | ForEach-Object { [ordered]@{ id = $_.Id; visible = $_.Visible; pos = [int][W]::SendMessage($_.H, 0x0408, [IntPtr]::Zero, [IntPtr]::Zero); max = [int][W]::SendMessage($_.H, 0x0407, [IntPtr]::Zero, [IntPtr]::Zero); x = $_.X; y = $_.Y; w = $_.W; h = $_.Hgt } })
    $st = $innerCtls | Where-Object { $_.Id -eq 1006 } | Select-Object -First 1
    $rec.status = if ($st) { $st.Text } else { $null }
    $rec.statusVisible = if ($st) { $st.Visible } else { $false }
    $rec.header = (($outer | Where-Object { $_.Id -in 1037, 1038 } | ForEach-Object { $_.Text }) -join ' / ')
    $rec.window = (([W]::Text($h)))
    if ($list) {
      $rec.list = [ordered]@{ visible = $list.Visible; x = $list.X; y = $list.Y; w = $list.W; h = $list.Hgt; count = [int][W]::SendMessage($list.H, 0x1004, [IntPtr]::Zero, [IntPtr]::Zero) }
      $new = @(); for ($i = $listSeen; $i -lt $rec.list.count; $i++) { $new += [W]::ListItem($list.H, $i) }
      if ($new.Count) { $rec.newLines = $new; $listSeen = $rec.list.count }
      # 상자 줄은 «설치: / 삭제: 경로» 아니면 한국어 문장(마침표 · …로 끝남)뿐이어야 한다(기준 14)
      foreach ($line in $new) { if ($line -notmatch '^(설치|삭제): \S' -and $line -notmatch '^[^\x00-\x7F].*[가-힣].*(\.|…)$') { [void]$issues.Add("[진행 상자] 문장도 파일 줄도 아님: $line") } }
    }
    $rec.recT = if ($script:recStart) { [math]::Round(((Get-Date) - $script:recStart).TotalSeconds, 3) } else { $null }
    ($rec | ConvertTo-Json -Compress -Depth 5) | Add-Content -Path $trace -Encoding UTF8
  }
  $kids = @($outer + $innerCtls) | Where-Object { $_.Visible }
  $next = $outer | Where-Object { $_.Visible -and $_.Enabled -and $_.Cls -eq 'Button' -and $_.Id -eq 1 } | Select-Object -First 1
  $sig = ($kids | Where-Object { $_.Cls -ne 'msctls_progress32' -and $_.Cls -ne 'SysListView32' -and $_.Id -ne 1006 } | ForEach-Object { "$($_.Cls):$($_.Id):$($_.Text):$($_.Enabled)" }) -join '|'
  # 진행 화면에서는 누르지 않는다(끝나면 완료 화면으로 저절로 넘어간다)
  if (($sig -eq $lastSig) -or (-not $next) -or ($bars.Count -gt 0)) { Start-Sleep -Milliseconds 50; continue }
  Start-Sleep -Milliseconds 400   # 화면이 다 그려지게
  $step++; $lastSig = $sig
  $wide = [bool]($innerCtls | Where-Object { $_.Visible -and $_.Cls -eq 'Static' -and $_.W -ge 180 -and $_.Hgt -ge 280 })
  $name = "{0:D2}-page.png" -f $step
  Capture $h $name
  Say "--- step $step [$([W]::Text($h))] $name"
  foreach ($k in $kids) { if ($k.Text -and $k.Cls -ne '#32770') { "  {0}#{1}{2} [{3}x{4}]: {5}" -f $k.Cls, $k.Id, $(if ($k.Enabled) { '' } else { '(꺼짐)' }), $k.W, $k.Hgt, ($k.Text -replace "`r?`n", ' / ') | Tee-Object -FilePath $log -Append | Out-Host } }
  CheckTexts $name ($innerCtls + ($outer | Where-Object { $_.Id -in 1037, 1038 })) $wide
  foreach ($k in ($innerCtls | Where-Object { $_.Cls -eq 'Button' -and $_.Visible })) {
    $checked = [int][W]::SendMessage($k.H, 0x00F0, [IntPtr]::Zero, [IntPtr]::Zero) -eq 1
    if ($checked) { Say "  checked: $($k.Text)" }
    if ($Kind -eq 'install' -and $k.Text -match '^모든 사용자' -and $Mode -eq 'all' -and -not $checked) { [W]::SendMessage($k.H, 0x00F5, [IntPtr]::Zero, [IntPtr]::Zero) | Out-Null; Say "  pick: $($k.Text)" }
    if ($Kind -eq 'install' -and $k.Text -match '^나만' -and $Mode -eq 'me' -and -not $checked) { [W]::SendMessage($k.H, 0x00F5, [IntPtr]::Zero, [IntPtr]::Zero) | Out-Null; Say "  pick: $($k.Text)" }
    if ($k.Text -match '실행하기' -and $NoRun -and $checked) { [W]::SendMessage($k.H, 0x00F5, [IntPtr]::Zero, [IntPtr]::Zero) | Out-Null; Say "  uncheck: $($k.Text)" }
  }
  if ($Dir) { foreach ($e in ($innerCtls | Where-Object { $_.Cls -eq 'Edit' -and $_.Visible })) { [W]::SendText($e.H, 0x000C, [IntPtr]::Zero, $Dir) | Out-Null; Say "  dir: $([W]::Text($e.H))" } }
  # 위치 화면의 줄인 경로 칸(«…»가 든 글 칸)을 눌러 사라지고 폴더 칸의 전체 경로가 보이는지 찍는다
  if ($RevealDir -and ($innerCtls | Where-Object { $_.Cls -eq 'Edit' -and $_.Visible })) {
    $short = $innerCtls | Where-Object { $_.Cls -eq 'Static' -and $_.Visible -and $_.Text -match '…' } | Select-Object -First 1
    if ($short) {
      Say "  dir short: $($short.Text)"
      [W]::PostMessage($short.H, 0x0201, [IntPtr]1, [IntPtr]0x00050005) | Out-Null   # WM_LBUTTONDOWN (5,5)
      [W]::PostMessage($short.H, 0x0202, [IntPtr]::Zero, [IntPtr]0x00050005) | Out-Null   # WM_LBUTTONUP
      Start-Sleep -Milliseconds 600
      Capture $h ("{0:D2}-dir-reveal.png" -f $step)
      $edit = $innerCtls | Where-Object { $_.Cls -eq 'Edit' } | Select-Object -First 1
      Say "  dir reveal: 줄인 칸 보임=$([W]::IsWindowVisible($short.H)) · 폴더 칸=$([W]::Text($edit.H))"
    } else { Say "  dir short: (없음 — 칸에 다 든다)" }
  }
  # 설치 완료 화면: «실행하기» 상자를 창 전체에서 다시 찾아 -NoRun이면 끄고 꺼졌는지 확인한다 — 화면이 바뀌는 순간 안쪽 화면을 잘못 잡아 상자를 못 보고
  # «마침»을 누른 일이 있다(10/28 08회차 — 앱이 떴다). 2초 안에 못 찾으면 알린다.
  if ($Kind -eq 'install' -and $next.Text -match '마침') {
    $run = $null
    for ($i = 0; $i -lt 10 -and -not $run; $i++) { $run = [W]::Children($h) | Where-Object { $_.Cls -eq 'Button' -and $_.Text -match '실행하기' } | Select-Object -First 1; if (-not $run) { Start-Sleep -Milliseconds 200 } }
    if (-not $run) { [void]$issues.Add("[$name] «실행하기» 상자를 찾지 못했다") }
    elseif ($NoRun) {
      # 누르기(BM_CLICK)는 창이 활성이 아니면 무시될 수 있어, 그래도 켜져 있으면 상태를 직접 끈다(BM_SETCHECK — 완료 화면은 떠날 때 상태만 읽는다)
      for ($i = 0; $i -lt 5 -and [int][W]::SendMessage($run.H, 0x00F0, [IntPtr]::Zero, [IntPtr]::Zero) -eq 1; $i++) { [W]::SendMessage($run.H, $(if ($i -lt 2) { 0x00F5 } else { 0x00F1 }), [IntPtr]::Zero, [IntPtr]::Zero) | Out-Null; Start-Sleep -Milliseconds 100 }
      Say "  실행하기 상태: $(if ([int][W]::SendMessage($run.H, 0x00F0, [IntPtr]::Zero, [IntPtr]::Zero) -eq 1) { '켜짐(끄지 못함)' } else { '꺼짐' })"
    } else { Say "  실행하기 상태: $(if ([int][W]::SendMessage($run.H, 0x00F0, [IntPtr]::Zero, [IntPtr]::Zero) -eq 1) { '켜짐' } else { '꺼짐' })" }
  }
  Start-Sleep -Milliseconds 300
  Say "  click: $($next.Text)"
  # «마침»을 누르면 창이 닫히며 흐려진다(뒤 창이 비친다). «모든 사용자»로 «다음»을 누르면 이 창은 숨고 관리자 권한 창이 새로 뜬다.
  # 둘 다 그 전에 녹화를 끝내고, 이 창은 다시 보지 않는다(새 창이 뜨면 다음 조각으로 녹화한다).
  # «모든 사용자» 설치: 설치 범위 화면에서 «다음»을 누르면 이 창이 숨고 관리자 권한 창이 새로 뜬다(평소 권한 창은 숨은 채 기다린다).
  # 제거기는 화면을 띄우기 전에 관리자 권한으로 다시 뜨므로 이런 일이 없다.
  $allUsersNext = ($Kind -eq 'install') -and ($Mode -eq 'all') -and [bool]($innerCtls | Where-Object { $_.Text -match '^모든 사용자' -and $_.Visible })
  if ($next.Text -match '마침|닫음' -or $allUsersNext) { StopRecord; [void][W]::closed.Add($h); $script:pressed = @{ win = $h; button = $next.H; at = Get-Date } }
  [W]::Press($next.H)
  Start-Sleep -Milliseconds 300
}
StopRecord
TrimSegments
if ($segments.Count) {
  ConvertTo-Json -Compress -InputObject @($segments | ForEach-Object { [ordered]@{ file = $_.file; x = $_.x; y = $_.y; w = $_.w; h = $_.h } }) | Set-Content (Join-Path $Out 'segments.json') -Encoding UTF8
}
Say "== 안내문 검사: $($issues.Count)건"
$issues | ForEach-Object { Say "  $_" }
[Watch]::Stop()
Say "== 시험 창 옮김: $([Place]::Moved.Count)건 · 작은 모니터 밖에서 보인 창: $([Place]::Violations.Count)건"
[Place]::Moved | ForEach-Object { Say "  $_" }
[Place]::Violations | ForEach-Object { Say "  ⚠ 밖에서 보임: $_" }
Say "== 창 감시(0.1초): 새로 보인 창 $([Watch]::Shown)개 · 명령 창 $([Watch]::Consoles.Count)개"
[Watch]::Consoles | ForEach-Object { Say "  명령 창: $_" }
Say "== done $(Get-Date -Format 'HH:mm:ss.fff')"
# 이 도구가 띄운 ffmpeg가 남아 있으면 끝낸다(남으면 다음 시험의 녹화 · 파일과 섞인다)
foreach ($p in $script:ffAll) { if (-not $p.HasExited) { $p.Kill(); Say "  남은 ffmpeg 끝냄: $($p.Id)" } }
'done' | Set-Content (Join-Path $Out 'DONE') -Encoding UTF8
