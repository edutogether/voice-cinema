'use strict';
// Voice Cinema Windows 설치판의 시작점. 화면은 웹과 같은 dist를 그대로 쓰고(bundle.js), 여기서는 창 · 마이크 권한 · 저장만 정한다.
const { app, BrowserWindow, Menu, dialog, session, shell } = require('electron');
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

/** 앱 밖 주소(공개 영상 주소 등)는 기본 브라우저로 연다. */
function openOutside(url) {
  if (/^https?:\/\//.test(url)) shell.openExternal(url);
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
  mainWindow = new BrowserWindow({
    title: APP_NAME,
    width: 1366,
    height: 860,
    minWidth: 800,
    minHeight: 600,
    show: false,
    backgroundColor: '#111510', // 웹의 --bg — 첫 화면이 그려지기 전 흰 화면이 번쩍이지 않게
    webPreferences: { partition: PARTITION, contextIsolation: true, sandbox: true, nodeIntegration: false, spellcheck: false },
  });
  // 창 제목은 앱 이름으로 둔다(웹 탭 제목은 «InKY Voice Cinema»).
  mainWindow.on('page-title-updated', (event) => event.preventDefault());
  mainWindow.once('ready-to-show', () => {
    mainWindow.maximize();
    mainWindow.show();
  });
  mainWindow.on('closed', () => { mainWindow = null; });
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
    // 크롬이라면 «앗, 이런!» 화면과 새로고침 단추가 뜰 자리다 — 설치판은 빈 창으로 남지 않게 다시 연다.
    contents.on('render-process-gone', (_e, details) => {
      if (details.reason !== 'clean-exit') contents.reload();
    });
  });

  app.whenReady().then(() => {
    setUpSession();
    createWindow();
  });
  app.on('window-all-closed', () => app.quit());
}
