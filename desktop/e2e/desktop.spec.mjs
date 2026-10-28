// Windows 설치판(10/27) — 빌드한 exe를 그대로 띄워, 웹과 같은 화면이 설치판 안의 파일로 뜨는지와 설치판만의 처리(마이크 권한 · 저장 ·
// 바깥 주소 · 인터넷 없음)를 본다. 업로드는 routeUpload로 가로챈다(운영 저장소에 시험 파일을 쌓지 않는다). 자동화로 띄운 창은
// App Check가 거절하므로(웹의 헤드리스와 같다) 실제 업로드는 여기서 보지 않는다 — 사람이 연 설치판은 App Check를 통과한다(10/27 확인).
import { test, expect, _electron } from '@playwright/test';
import { readFileSync, readdirSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { installSyntheticMic, recordOnce } from '../../e2e/synthetic-mic.js';

const HERE = path.dirname(fileURLToPath(import.meta.url));
const EXE = process.env.VC_DESKTOP_EXE ?? path.join(HERE, '..', 'release', 'win-unpacked', 'Voice Cinema.exe');
const ORIGIN = 'https://voice.edutogether.kr';
const OFFLINE_MSG = '인터넷에 연결되어 있지 않아 QR을 만들 수 없어요. 아래 단추를 눌러 이 기기에 저장한 뒤 선생님께 알려 주세요.';

/** mp4의 mvhd 상자에서 길이(초)를 읽는다. */
function mp4Duration(buffer) {
  const at = buffer.indexOf('mvhd');
  const version = buffer[at + 4];
  if (version === 1) return Number(buffer.readBigUInt64BE(at + 28)) / buffer.readUInt32BE(at + 24);
  return buffer.readUInt32BE(at + 20) / buffer.readUInt32BE(at + 16);
}

/** 검사마다 새 프로필로 띄운다(가짜 마이크 장치 · 소리 끔). 창은 가장 작은 모니터에 뜬다(시험 전용 VC_TEST_SMALLEST_DISPLAY — main.js). */
async function launch(args = []) {
  const app = await _electron.launch({
    executablePath: EXE,
    args: [`--user-data-dir=${test.info().outputPath('profile')}`, '--mute-audio', '--use-fake-device-for-media-stream', ...args],
    env: { ...process.env, VC_TEST_SMALLEST_DISPLAY: '1' },
  });
  const page = await app.firstWindow();
  await page.locator('#splash').waitFor({ state: 'detached', timeout: 60000 });
  return { app, page };
}

/**
 * 업로드 서버로 가는 요청을 가로챈다. 설치판은 https를 직접 처리하므로(main.js) page.route가 닿지 않는다 — 처리기가 바깥 요청을 넘기는
 * ses.fetch를 바꿔 끼운다. reply: { status, body } 또는 'fail'(연결 실패). 브라우저가 먼저 묻는 CORS 사전 요청(OPTIONS)에는 서버처럼 답한다.
 */
async function routeUpload(app, reply) {
  await app.evaluate(({ session }, { reply, origin }) => {
    const ses = session.fromPartition('persist:voice-cinema');
    const original = ses.fetch.bind(ses);
    globalThis.__uploads = [];
    const cors = { 'Access-Control-Allow-Origin': origin, Vary: 'Origin' };
    ses.fetch = async (request, options) => {
      if (!request.url.endsWith('/voiceCinema/upload')) return original(request, options);
      if (request.method === 'OPTIONS') {
        return new Response(null, { status: 204, headers: { ...cors, 'Access-Control-Allow-Methods': 'POST', 'Access-Control-Allow-Headers': request.headers.get('access-control-request-headers') ?? '' } });
      }
      globalThis.__uploads.push(await request.text());
      if (reply === 'fail') throw new TypeError('시험: 연결 실패');
      return new Response(JSON.stringify(reply.body), { status: reply.status, headers: { ...cors, 'Content-Type': 'application/json' } });
    };
  }, { reply, origin: ORIGIN });
}
const uploads = (app) => app.evaluate(() => globalThis.__uploads.map((text) => JSON.parse(text)));

/** 시험용 마이크(제품 코드에는 아무것도 넣지 않는다)를 깔고 다시 연 뒤 장면 녹음실로 */
async function openStudio(page, name) {
  await installSyntheticMic(page, [{ delay: 0.3, dur: 1.5 }]);
  await page.reload();
  await page.locator('#splash').waitFor({ state: 'detached', timeout: 60000 });
  // 자동 넘김을 멈추고(손가락 한 번 누르기 — e2e/pause-scenes.js) 아래 그림 띠에서 그 장면을 누르면 녹음실로 들어간다
  await page.locator('.scene-carousel').dispatchEvent('pointerdown', { pointerType: 'touch', isPrimary: true });
  await page.getByRole('button', { name: `${name} 미리보기 선택`, exact: true }).click();
  await expect(page.locator('#chipName')).toHaveText(name);
  await expect(page.locator('#clip')).toHaveJSProperty('readyState', 4, { timeout: 20000 });
}

/** 저장 알림 창은 사람이 닫아야 하는 창이라 검사에서는 내용만 받아 둔다(main.js가 부르는 dialog를 바꿔 끼운다). */
async function captureDialogs(app, downloads) {
  await app.evaluate(({ app: electronApp, dialog }, dir) => {
    electronApp.setPath('downloads', dir);
    globalThis.__dialogs = [];
    dialog.showMessageBox = async (_parent, options) => { globalThis.__dialogs.push(options); return { response: 0 }; };
  }, downloads);
}

test('설치판 안의 화면이 정본 주소 · 앱 이름 창으로 뜨고, 서비스워커 없이 엔진을 곧바로 준비한다', async () => {
  const { app, page } = await launch();
  expect(page.url()).toBe(`${ORIGIN}/`);
  expect(await app.evaluate(({ BrowserWindow }) => BrowserWindow.getAllWindows()[0].getTitle())).toBe('Voice Cinema');
  await expect(page.locator('.tile')).toHaveCount(8);
  // 글꼴 · 그림은 설치판 안의 것(Pretendard · 장면 그림)
  expect(await page.evaluate(async () => { await document.fonts.ready; return [...document.fonts].filter((f) => f.status === 'loaded' && f.family === 'Pretendard').length; })).toBeGreaterThan(0);
  expect(await page.locator('.tile img.thumb').first().evaluate((img) => img.complete && img.naturalWidth > 0)).toBe(true);
  // 엔진(31MB)은 서비스워커를 기다리지 않고 받는다 — 전에는 20초 동안 «0%»였다(10/27)
  await expect(page.locator('#engineProg')).toHaveText('100%', { timeout: 15000 });
  expect(await page.evaluate(async () => (await navigator.serviceWorker.getRegistrations()).length)).toBe(0);
  await app.close();
});

test('마이크만 허락하고 카메라는 거절한다', async () => {
  const { app, page } = await launch();
  const result = await page.evaluate(async () => {
    const open = async (constraints) => {
      try {
        const stream = await navigator.mediaDevices.getUserMedia(constraints);
        stream.getTracks().forEach((t) => t.stop());
        return 'ok';
      } catch (e) {
        return e.name;
      }
    };
    return {
      audio: await open({ audio: true }),
      video: await open({ video: true }),
      microphone: (await navigator.permissions.query({ name: 'microphone' })).state,
      camera: (await navigator.permissions.query({ name: 'camera' })).state,
    };
  });
  expect(result).toEqual({ audio: 'ok', video: 'NotAllowedError', microphone: 'granted', camera: 'denied' });
  await app.close();
});

test('녹음 → 합성 → 업로드가 되면 QR이 뜨고, 올린 것은 10초 영화다', async () => {
  const { app, page } = await launch();
  await routeUpload(app, { status: 200, body: { ok: true, url: 'https://storage.googleapis.com/test/dub.mp4' } });
  await openStudio(page, '판타지');
  expect(await recordOnce(page)).toMatchObject({ phase: 'recorded' });
  await page.locator('button', { hasText: '저장하기' }).click();
  await expect(page.locator('#qrImg')).toBeVisible({ timeout: 90000 });
  const [uploaded] = await uploads(app);
  expect(uploaded.filename).toMatch(/^dub_fantasy_\d+_[0-9a-f]+\.mp4$/);
  expect(Math.abs(mp4Duration(Buffer.from(uploaded.dataBase64, 'base64')) - 10)).toBeLessThanOrEqual(0.05);
  await app.close();
});

test('업로드가 안 되면 «이 기기에 저장»이 다운로드 폴더에 10초 영화를 두고, 저장했다고 알린다(같은 이름은 덮어쓰지 않는다)', async () => {
  const { app, page } = await launch();
  const downloads = test.info().outputPath('downloads');
  await captureDialogs(app, downloads);
  await routeUpload(app, { status: 500, body: { ok: false } });
  await openStudio(page, '히어로');
  expect(await recordOnce(page)).toMatchObject({ phase: 'recorded' });
  await page.locator('button', { hasText: '저장하기' }).click();
  await expect(page.locator('#downloadRow')).toBeVisible({ timeout: 90000 });
  expect(await uploads(app)).toHaveLength(3); // 처음 + 다시 2번(MAX_UPLOAD_ATTEMPTS)
  await page.locator('#downloadBtn').click();
  await expect.poll(() => app.evaluate(() => globalThis.__dialogs.length), { timeout: 30000 }).toBe(1);
  await page.locator('#downloadBtn').click();
  await expect.poll(() => app.evaluate(() => globalThis.__dialogs.length), { timeout: 30000 }).toBe(2);
  expect(readdirSync(downloads).sort()).toEqual(['Voice Cinema_히어로 (1).mp4', 'Voice Cinema_히어로.mp4']);
  const movie = readFileSync(path.join(downloads, 'Voice Cinema_히어로.mp4'));
  expect(Math.abs(mp4Duration(movie) - 10)).toBeLessThanOrEqual(0.05);
  const [first] = await app.evaluate(() => globalThis.__dialogs);
  expect(first).toMatchObject({ message: '이 기기의 다운로드 폴더에 저장했어요.', detail: path.join(downloads, 'Voice Cinema_히어로.mp4') });
  await app.close();
});

test('인터넷이 없어도 첫 화면 · 녹음 · 합성이 되고, 올리지 않고 곧바로 이 기기에 저장으로 간다', async () => {
  // 닿지 않는 프록시로 바깥 요청을 모두 막는다(reCAPTCHA · 업로드 서버 · 옛 주소). 설치판 안의 파일은 영향을 받지 않는다.
  const { app, page } = await launch(['--proxy-server=http://127.0.0.1:9']);
  const downloads = test.info().outputPath('downloads');
  await captureDialogs(app, downloads);
  await routeUpload(app, 'fail');
  await openStudio(page, '스포츠');
  expect(await page.evaluate(() => fetch('https://voice-cinema.web.app/').then(() => 'online', (e) => e.name))).toBe('TypeError');
  await expect(page.locator('#engineProg')).toHaveText('100%', { timeout: 15000 });
  expect(await recordOnce(page)).toMatchObject({ phase: 'recorded' });
  // Windows가 연결 없음을 알리는 것과 같은 상태(navigator.onLine === false)
  await page.evaluate(() => {
    Object.defineProperty(navigator, 'onLine', { configurable: true, get: () => false });
    window.dispatchEvent(new Event('offline'));
  });
  await page.locator('button', { hasText: '저장하기' }).click();
  await expect(page.locator('#doneMsg')).toHaveText(OFFLINE_MSG, { timeout: 90000 });
  await page.locator('#downloadBtn').click();
  await expect.poll(() => app.evaluate(() => globalThis.__dialogs.length), { timeout: 30000 }).toBe(1);
  expect(Math.abs(mp4Duration(readFileSync(path.join(downloads, 'Voice Cinema_스포츠.mp4'))) - 10)).toBeLessThanOrEqual(0.05);
  expect(await uploads(app)).toHaveLength(0);
  await app.close();
});

test('개인정보처리방침은 앱 안의 새 창으로 열고, 바깥 주소는 기본 브라우저로 넘긴다', async () => {
  const { app, page } = await launch();
  await app.evaluate(({ shell }) => {
    globalThis.__opened = [];
    shell.openExternal = async (url) => { globalThis.__opened.push(url); };
  });
  const [privacy] = await Promise.all([app.waitForEvent('window'), page.locator('.privacylink').click()]);
  await privacy.waitForLoadState();
  expect(privacy.url()).toBe(`${ORIGIN}/privacy.html`);
  await expect(privacy.locator('body')).toContainText('인천광역시교육청');
  await page.evaluate(() => window.open('https://example.com/outside', '_blank'));
  await expect.poll(() => app.evaluate(() => globalThis.__opened)).toEqual(['https://example.com/outside']);
  expect(app.windows()).toHaveLength(2);
  await app.close();
});
