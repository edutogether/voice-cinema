'use strict';
// Voice Cinema Windows 설치판의 시작점. 화면은 웹과 같은 dist를 그대로 쓰고(bundle.js), 여기서는 창 · 마이크 권한 · 저장만 정한다.
const { app, BrowserWindow, Menu, dialog, screen, session, shell } = require('electron');
const fs = require('node:fs');
const path = require('node:path');
const { ORIGIN, isBundleUrl, hostingHeaders, serveBundle } = require('./bundle');
const { uniqueSavePath } = require('./save-path');

const APP_ID = 'kr.edutogether.voicecinema';
const APP_NAME = 'Voice Cinema';
// 설치판은 resources/web(웹 산출물)과 resources/firebase.json(보안 헤더)을 싣는다(electron-builder.yml). 개발 실행은 저장소의 것을 쓴다.
const RESOURCES = app.isPackaged ? process.resourcesPath : path.join(__dirname, '..');
const WEB_ROOT = path.resolve(RESOURCES, app.isPackaged ? 'web' : 'dist');
const HEADERS = hostingHeaders(JSON.parse(fs.readFileSync(path.join(RESOURCES, 'firebase.json'), 'utf8')));
const PARTITION = 'persist:voice-cinema';

let mainWindow = null;

/** 앱 밖 주소(공개 영상 주소 등)는 기본 브라우저로 연다 — https만(바깥 링크는 https만 쓴다는 org 보안 기준, 11/2 종합감사). */
function openOutside(url) {
  if (/^https:\/\//.test(url)) shell.openExternal(url);
}

function setUpSession() {
  const ses = session.fromPartition(PARTITION);
  // 정본 주소는 설치판 안의 파일로, 그 밖(reCAPTCHA · 업로드 서버)은 그대로 인터넷으로.
  ses.protocol.handle('https', (request) =>
    isBundleUrl(request.url) ? serveBundle(request, WEB_ROOT, HEADERS) : ses.fetch(request, { bypassCustomProtocolHandlers: true }));

  // 이 앱이 쓰는 권한은 마이크 하나뿐이다. 카메라 · 위치 · 알림 등은 모두 거절한다.
  ses.setPermissionRequestHandler((_contents, permission, callback, details) => {
    callback(permission === 'media' && isBundleUrl(details.requestingUrl) && (details.mediaTypes ?? []).every((type) => type === 'audio'));
  });
  // requestingOrigin은 끝에 «/»가 붙어 온다(https://voice.edutogether.kr/) — 주소 비교로 본다
  ses.setPermissionCheckHandler((_contents, permission, requestingOrigin, details) =>
    permission === 'media' && isBundleUrl(requestingOrigin) && details.mediaType !== 'video');

  ses.on('will-download', (_event, item, contents) => {
    const target = uniqueSavePath(app.getPath('downloads'), item.getFilename(), fs.existsSync);
    item.setSavePath(target);
    // 크롬은 받은 파일을 화면 위에 띄워 알려 준다 — 설치판에는 그 표시가 없어, 눌러도 아무 일 없는 것처럼 보이지 않게 알린다.
    item.once('done', (_e, state) => {
      const parent = BrowserWindow.fromWebContents(contents) ?? mainWindow;
      if (state === 'completed') {
        dialog.showMessageBox(parent, {
          type: 'info', title: APP_NAME, message: '이 기기의 다운로드 폴더에 저장했어요.', detail: target,
          buttons: ['확인', '폴더 열기'], defaultId: 0, cancelId: 0, noLink: true,
        }).then(({ response }) => { if (response === 1) shell.showItemInFolder(target); });
      } else {
        dialog.showMessageBox(parent, { type: 'warning', title: APP_NAME, message: '저장하지 못했어요. 다시 눌러 주세요.', buttons: ['확인'], noLink: true });
      }
    });
  });
}

function createWindow() {
  // 시험 전용 VC_TEST_SMALLEST_DISPLAY=1(desktop/e2e · tools의 검사만 넣는다): 처음부터 가장 작은 모니터에 창을 만든다 — 사람이 쓰는 큰 모니터에
  // 시험 창이 한순간도 뜨지 않게(10/28 기준 12). 빌드한 앱은 Node의 «-r» 사전 로드를 무시해 바깥에서 자리를 옮길 수 없었다. 만든 뒤 다른 배율의
  // 모니터로 옮기면 크기가 그 배율만큼 한 번 더 커져(1408×744 → 1760×931) 만들 때부터 그 모니터 좌표를 준다.
  // 시험 전용 VC_TEST_WINDOW=hidden(tools/verify/viewport-survey.mjs만 넣는다): 창을 보이지 않은 채 크기만 바꾼다 — 재는 크기(최대 3840×2160)가
  // 시험 모니터보다 커서, 보이면 큰 모니터까지 넘어간다. 숨겨도 그리기가 멈추지 않게 배경 늦춤을 끈다.
  const testHidden = process.env.VC_TEST_WINDOW === 'hidden';
  const testDisplay = process.env.VC_TEST_SMALLEST_DISPLAY === '1'
    ? screen.getAllDisplays().sort((a, b) => a.size.width * a.size.height - b.size.width * b.size.height)[0]
    : null;
  mainWindow = new BrowserWindow({
    ...(testDisplay && { x: testDisplay.workArea.x, y: testDisplay.workArea.y }),
    title: APP_NAME,
    width: 1366,
    height: 860,
    // 창 안쪽 최소 크기: 현장 노트북(1366×768) 화면 반쪽에 붙여도 들어가게(안쪽 약 667×700 — 11/2 Poster Studio 종합감사 🟠, 예전 1040×540은
    // 반 화면에 안 들어갔다). public/fit.js는 PC 창을 실제 크기로 두고 폭 768 · 높이 640 아래에서만 통째로 줄인다(11/7) — 640×640이면 0.83배이고,
    // 짧은 변이 600보다 작은 세로 창은 휴대폰 화면으로 바뀌므로 그 아래로 내려가지 않게 둔다.
    useContentSize: true,
    minWidth: 640,
    minHeight: 640,
    show: false,
    backgroundColor: '#ffffff', // 첫 화면(스플래시)의 바탕 — 화면이 그려지기 전에 다른 색이 번쩍이지 않게
    webPreferences: { partition: PARTITION, contextIsolation: true, sandbox: true, nodeIntegration: false, spellcheck: false, ...(testHidden && { backgroundThrottling: false }) },
  });
  // 창 제목은 앱 이름으로 둔다(웹 탭 제목은 «InKY Voice Cinema»).
  mainWindow.on('page-title-updated', (event) => event.preventDefault());
  mainWindow.on('closed', () => { mainWindow = null; });
  // 숨긴 창을 그 모니터의 작업 영역 크기로 맞춘 뒤 화면을 불러오고, 첫 그림이 끝나면 최대화해 띄운다.
  // 예전에는 1366×860으로 먼저 그린 뒤 최대화했다. 세로가 줄어드는 화면(1366×768 등)에서는 바뀌는 도중에 잠깐 생긴 세로 스크롤 막대 폭만큼
  // 화면 맞춤(public/fit.js)이 비율을 작게 잡은 채 남아, 웹과 달리 화면 양옆에 흰 띠가 생겼다(10/28 기준 15, desktop/tools/layout-compare.mjs).
  // 작업 영역 크기 창의 안쪽은 최대화한 창보다 테두리 · 제목줄만큼 작아, 최대화하면 넓어지기만 한다 — 넓어질 때는 그 막대가 생기지 않는다.
  // 첫 그림 전까지는 창이 보이지 않는다(그사이 창을 다른 모니터로 옮기면 거기서 최대화된다).
  mainWindow.setBounds((testDisplay ?? screen.getDisplayMatching(mainWindow.getBounds())).workArea);
  mainWindow.once('ready-to-show', () => {
    if (testHidden) return;
    // 시험 전용: 숨긴 창의 실제 자리가 그 모니터 안인지 본 뒤에만 보인다 — 아니면 보이지 않은 채 끝낸다(10/28 팀장 지시).
    if (testDisplay) {
      const b = mainWindow.getBounds();
      const d = testDisplay.bounds;
      if (b.x < d.x || b.y < d.y || b.x + b.width > d.x + d.width || b.y + b.height > d.y + d.height) {
        console.error(`VC_TEST_SMALLEST_DISPLAY: 창 자리 ${JSON.stringify(b)}가 시험 모니터 ${JSON.stringify(d)} 밖이라 띄우지 않고 끝낸다`);
        app.exit(3);
        return;
      }
    }
    mainWindow.maximize();
    mainWindow.show();
  });
  mainWindow.loadURL(`${ORIGIN}/`);
}

if (!app.requestSingleInstanceLock()) {
  app.quit();
} else {
  app.setAppUserModelId(APP_ID);
  // 메뉴 막대를 없앤다 — 부스에서 새로고침 · 개발자 도구 단축키가 눌리지 않게.
  Menu.setApplicationMenu(null);

  app.on('second-instance', () => {
    if (!mainWindow) return;
    if (mainWindow.isMinimized()) mainWindow.restore();
    mainWindow.focus();
  });

  app.on('web-contents-created', (_event, contents) => {
    // 같은 주소의 새 창(개인정보처리방침)은 앱 안에서, 그 밖은 기본 브라우저로.
    contents.setWindowOpenHandler(({ url }) => {
      if (isBundleUrl(url)) return { action: 'allow' };
      openOutside(url);
      return { action: 'deny' };
    });
    contents.on('will-navigate', (event, url) => {
      if (isBundleUrl(url)) return;
      event.preventDefault();
      openOutside(url);
    });
    // 크롬이라면 «앗, 이런!» 화면과 새로고침 단추가 뜰 자리다 — 설치판은 빈 창으로 남지 않게 다시 연다. 다만 화면이 뜨자마자 또 죽는
    // 경우(메모리 부족 · 그래픽 드라이버)에 끝없이 다시 열며 노트북을 붙잡지 않게, 1분 안에 세 번까지만 다시 연다(11/2 종합감사)
    const crashes = [];
    contents.on('render-process-gone', (_e, details) => {
      if (details.reason === 'clean-exit') return;
      const now = Date.now();
      crashes.push(now);
      while (crashes.length && now - crashes[0] > 60_000) crashes.shift();
      if (crashes.length <= 3) contents.reload();
    });
  });

  app.whenReady().then(() => {
    setUpSession();
    createWindow();
  });
  app.on('window-all-closed', () => app.quit());
}
