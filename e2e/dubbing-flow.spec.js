// 실사용 흐름 E2E 테스트(2026-08-27 시작, 2026-10-16 장면 더빙 2.0 흐름으로 다시 씀).
// 실제 Chromium(가짜 마이크 장치)으로 홈 화면→장면 시작→5.0초 멈춤→문구·3·2·1→녹음 3초(말이 이어지면 3.5초까지)→이어 재생
// →ffmpeg.wasm 섞기 합성→저장까지 진짜로 돌려서 검증한다. Cloud Functions 업로드만 page.route로 가로채
// (a) 실제 프로덕션 Storage에 테스트 파일이 쌓이지 않게, (b) 네트워크 상태에 결과가 좌우되지 않게 한다.
import { Buffer } from 'node:buffer';
import { test, expect } from '@playwright/test';
import { countdownLog, watchCountdown } from './countdown-watch.js';
import { openScene } from './pause-scenes.js';
import { clipLength, scenePause, TEST_SCENE } from './scene-data.js';

const UPLOAD_PATTERN = '**/voiceCinema/upload';
const GENRE_NAMES = ['SF', '판타지', '애니메이션', '히어로', '스릴러', '드라마', '스포츠', '뮤지컬'];
// 장면(멈춤까지) + 문구 1초 + 3·2·1 3초 + 녹음 3~3.5초 + 녹음 확인 + 이어 재생 — 11/14 완성본은 편마다 21~30초라 한 번에 약 29~38초가 걸린다.
const TAKE_MS = 60000;
// 멈춤 시각은 장르마다 다르다(11/14 완성본 12.0 · 15.0초) — 시험 장면(SF)의 미리보기 길이에서 읽는다(e2e/scene-data.js)
const PAUSE = scenePause(TEST_SCENE.id);

/** mp4의 mvhd 상자에서 길이(초)를 읽는다 — 완성본이 원판 길이 그대로인지 본다. */
function mp4Duration(buffer) {
  const at = buffer.indexOf('mvhd');
  if (at < 0) throw new Error('mvhd 없음');
  const version = buffer[at + 4];
  if (version === 1) return Number(buffer.readBigUInt64BE(at + 28)) / buffer.readUInt32BE(at + 24);
  return buffer.readUInt32BE(at + 20) / buffer.readUInt32BE(at + 16);
}


async function openStudio(page, name) {
  await page.goto('/');
  await page.locator('.tile', { hasText: name }).first().click();
  await expect(page.locator('#chipName')).toHaveText(name);
}

test.describe('홈 화면', () => {
  test('8개 장르 타일이 전부 있고 클릭 가능하다', async ({ page }) => {
    await page.goto('/');
    for (const name of GENRE_NAMES) {
      await expect(page.locator('.tile', { hasText: name }).first()).toBeAttached();
    }
    await expect(page.locator('.chart-heading h1 span')).toHaveText('8');
  });

  // 2026-09-03: 교육청 주최 안내 문구는 개인정보처리방침 별도 페이지(privacy.html)에 있다.
  test('교육청 주최 안내 문구가 개인정보처리방침 페이지에 보인다', async ({ page }) => {
    await page.goto('/');
    const link = page.locator('.privacylink');
    await expect(link).toBeVisible();
    await expect(link).toHaveAttribute('href', './privacy.html');
    await page.goto('/privacy.html');
    await expect(page.locator('body')).toContainText('인천광역시교육청');
  });
});

test.describe('녹음실: 장면 더빙 2.0 흐름', () => {
  test('멈춤 시각에서 정확히 멈추고 문구 → 3·2·1 → 녹음 3초(말이 이어지면 3.5초까지) → 그 자리부터 이어 재생한다', async ({ page }) => {
    // 녹음 길이는 페이지 안에서 녹음기의 start · stop 이벤트로 잰다. Node 쪽에서 «녹음 중»이 보인 때를 잡으면 재시도 간격만큼
    // 늦게 찍혀 실제보다 짧게 잰다 — 10/31 동시 16개로 40번 돌렸을 때 최대 0.53초 늦어 4번이 3초 아래로 나왔다(녹음기 기준은 3.001~3.402초).
    await page.addInitScript(() => {
      const times = (window.__recorderTimes = {});
      const Native = window.MediaRecorder;
      window.MediaRecorder = class extends Native {
        constructor(...args) {
          super(...args);
          this.addEventListener('start', () => { times.start ??= performance.now(); });
          this.addEventListener('stop', () => { times.stop ??= performance.now(); });
        }
      };
    });
    await watchCountdown(page);
    await openStudio(page, TEST_SCENE.name);
    const clip = page.locator('#clip');
    // 들어가면 장면이 바로 흐르고(11/7), 보통은 그 중에 «장면 시작»을 누른다 — 그래도 처음부터 시작한다.
    await expect(page.locator('#studio')).toHaveAttribute('data-phase', 'previewing');
    await expect(page.locator('#recBtn')).toHaveText(/장면 시작/);
    await page.locator('#recBtn').click();

    await expect(page.locator('#studio')).toHaveAttribute('data-phase', 'watching');
    await expect.poll(() => clip.evaluate(v => v.currentTime)).toBeGreaterThan(.5);
    // 문구와 3·2·1(1초씩, 10/31에는 0.6초 · 0.3초씩)은 짧아서, 나타난 뒤 검사가 글자를 따로 읽으러 가면 그 사이 사라질 수 있다 — 10/31 동시 16개로
    // 100번 돌렸을 때 2번, waitFor 뒤 textContent가 사라진 문구를 기다리다 시간 초과. 페이지 안 기록(countdown-watch.js)으로 본다.
    await expect(page.locator('#recpill')).toBeVisible({ timeout: (PAUSE + 10) * 1000 });
    const log = await countdownLog(page);
    expect(log.find((e) => e.key === 'cue')?.text).toBe('이제 당신의 차례입니다 !');
    expect(log.find((e) => e.key.endsWith('녹음 시작'))?.text).toBe('3');
    expect(log.find((e) => e.key === 'speak')?.text).toBe('이제 당신의 목소리를 들려주세요 !');
    // 멈춘 영상 시각이 멈춤 시각과 한 프레임(1/30초) 안이고, 녹음 중에도 그 정지 화면 그대로다.
    const paused = await clip.evaluate(v => ({ paused: v.paused, time: v.currentTime }));
    expect(paused.paused).toBe(true);
    expect(Math.abs(paused.time - PAUSE)).toBeLessThanOrEqual(1 / 30);
    await expect(page.locator('#studio')).toHaveAttribute('data-phase', 'continuing', { timeout: 6000 });
    const { start, stop } = await page.evaluate(() => window.__recorderTimes);
    const recordMs = stop - start;
    expect(recordMs).toBeGreaterThanOrEqual(3000);
    expect(recordMs).toBeLessThan(4000);
    // 이어 재생은 멈춘 자리부터다.
    await expect.poll(() => clip.evaluate(v => v.currentTime)).toBeGreaterThan(PAUSE + .2);
    await expect(page.locator('#afterRow')).toBeVisible({ timeout: (clipLength(TEST_SCENE.id) - PAUSE + 10) * 1000 });
    // «다시 듣기»는 없다(10/20 대표님). 마우스로 녹음했으면 다음 단추에 초점(빨간 띠)을 남기지 않는다.
    await expect(page.locator('#afterRow button')).toHaveText(['다시 녹음', '저장하기']);
    await expect(page.locator('#saveBtn')).not.toBeFocused();
  });

  // 시험 장면(SF)의 상대 대사 — src/genres.ts의 film('…')은 4.5~7.5초 한 줄이다(11/14 완성본, 전에는 10초 장면의 1.6~3.4초를 봤다)
  const LINE = { text: '인사해 봐… 크게 !', start: 4.5, end: 7.5 };
  test('상대 대사 자막은 대사 시각에 나타나 사라지고, 흰 글씨·배경 상자 없음이다', async ({ page }) => {
    await openStudio(page, TEST_SCENE.name);
    // 자막이 붙고 떨어지는 순간의 영상 시각을 페이지 안에서 기록한다 — 바깥에서 폴링하면 그 지연만큼 늦게 잰다.
    // 시각은 화면에 나가는 프레임의 시각(mediaTime)으로 잰다. currentTime은 소리 시계라 프레임보다 수십 ms 늦게 읽혀
    // 제때 붙은 자막도 «일찍 붙었다»로 보인다(10/16 실측 1.556초).
    await page.evaluate(() => {
      const video = document.querySelector('#clip');
      const log = (window.__captionLog = []);
      let frameTime = 0;
      const onFrame = (_, meta) => { frameTime = meta.mediaTime; video.requestVideoFrameCallback(onFrame); };
      video.requestVideoFrameCallback(onFrame);
      new MutationObserver(() => {
        const shown = !!document.querySelector('[data-testid="scene-caption"]');
        if (log.length % 2 === (shown ? 0 : 1)) log.push(frameTime);
      }).observe(document.querySelector('.studio-video-frame'), { childList: true, subtree: true });
    });
    await page.locator('#recBtn').click();
    const caption = page.getByTestId('scene-caption');
    await expect(caption).toBeVisible({ timeout: (LINE.start + 4) * 1000 });
    await expect(caption).toHaveText(LINE.text);
    const style = await caption.evaluate(el => {
      const s = getComputedStyle(el);
      return { color: s.color, background: s.backgroundColor, lines: Math.round(el.getBoundingClientRect().height / parseFloat(s.lineHeight)) };
    });
    expect(style.color).toBe('rgb(255, 255, 255)');
    expect(style.background).toBe('rgba(0, 0, 0, 0)');
    expect(style.lines).toBeLessThanOrEqual(2);
    await expect(caption).toBeHidden({ timeout: (LINE.end - LINE.start + 2) * 1000 });
    const [shownAt, hiddenAt] = await page.evaluate(() => window.__captionLog);
    // 한 화면 갱신(약 1/30초)만큼의 여유만 둔다.
    expect(shownAt).toBeGreaterThanOrEqual(LINE.start - 1 / 30);
    expect(shownAt).toBeLessThan(LINE.start + 2 / 30);
    expect(hiddenAt).toBeGreaterThanOrEqual(LINE.end - 1 / 30);
    expect(hiddenAt).toBeLessThan(LINE.end + 2 / 30);
  });

  test('처음으로 버튼을 누르면 홈으로 돌아간다', async ({ page }) => {
    await openStudio(page, '드라마');
    await expect(page.locator('#studio')).toHaveClass(/active/);
    await page.locator('.back').click();
    await expect(page.locator('#home')).toHaveClass(/active/);
  });
});

test.describe('녹음 → 합성 → 저장 (실사용 흐름)', () => {
  test('정상 흐름: 섞기 합성 결과는 원판 길이이고, 업로드 성공 시 QR이 표시된다', async ({ page }) => {
    let uploaded = null;
    await page.route(UPLOAD_PATTERN, (route) => {
      uploaded = JSON.parse(route.request().postData());
      return route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({ ok: true, url: 'https://storage.googleapis.com/fake/dub_test.mp4' }) });
    });
    const merged = [];
    page.on('request', (r) => { if (r.url().includes('/clips/final/')) merged.push(r.url()); });

    await openStudio(page, 'SF');
    await page.locator('#recBtn').click();
    await expect(page.locator('#afterRow')).toBeVisible({ timeout: TAKE_MS });
    await expect(page.locator('#recBtn')).toBeHidden();

    await page.locator('button', { hasText: '저장하기' }).click();

    // ffmpeg.wasm 실제 합성 → (가로챈) 업로드 → QR 표시까지 실제로 기다린다.
    await expect(page.locator('#done')).toBeVisible({ timeout: 60000 });
    await expect(page.locator('#qrbox')).toBeVisible();
    await expect(page.locator('#qrImg')).toHaveAttribute('src', /^data:image\//);
    // QR 위 두 줄(공개 범위·11/30)과 QR 아래 «내 영화 받기»는 뺐다(10/20 대표님 — 개인정보처리방침에 있다)
    await expect(page.locator('#savemode')).toHaveCount(0);
    await expect(page.locator('#qrbox')).not.toContainText('내 영화 받기');
    // 합성은 로고를 구운 합성용 원판(final/)으로 한다(10/20 대표님 «내려받는 영상에도 로고»)
    expect(merged.some((u) => /\/clips\/final\/sf\.mp4\?v=[0-9a-f]{8}$/.test(u))).toBe(true);
    // 영화 재생 · «내 폰에 저장하기»는 휴대폰에서만 보인다 — 부스의 노트북에서는 학생이 자기 휴대폰으로 QR을 찍는다(11/9 시안).
    await expect(page.locator('#phoneSaveBtn')).toBeHidden();
    await expect(page.locator('#posterPlayBtn')).toBeHidden();

    expect(uploaded.filename).toMatch(/^dub_sf_\d+_[0-9a-f]+\.mp4$/);
    const mp4 = Buffer.from(uploaded.dataBase64, 'base64');
    expect(mp4.length).toBeLessThan(20 * 1024 * 1024);
    expect(Math.abs(mp4Duration(mp4) - clipLength('sf'))).toBeLessThanOrEqual(.05);
  });

  // 11/8 Bumm님 «웹도 끊기면 메일 칸을 띄움» — 연결은 됐다고 나오는데 올리기만 실패해도(부스 KT EGG의 LTE만 끊긴 때) 같은 장애로 보고
  // 담임교사 메일 칸으로 간다(PC · 패드). 보내고 지우는 흐름과 «다시 제작하기»는 e2e/web-mail.spec.js가 본다.
  test('실패 경로: 클라우드 업로드가 실패하면 다시 시도한 뒤 담임교사 메일 칸을 띄운다', async ({ page }) => {
    test.setTimeout(150000); // 히어로는 11/14부터 20.6초 완성본 — 녹음 약 29초 + 합성 + 다시 시도
    let callCount = 0;
    await page.route(UPLOAD_PATTERN, (route) => {
      callCount++;
      return route.fulfill({ status: 500, contentType: 'application/json', body: JSON.stringify({ ok: false, error: '저장 중 오류가 발생했습니다.' }) });
    });

    await openStudio(page, '히어로');
    await page.locator('#recBtn').click();
    await expect(page.locator('#afterRow')).toBeVisible({ timeout: TAKE_MS });
    await page.locator('button', { hasText: '저장하기' }).click();

    await expect(page.locator('#mailHandoff')).toBeVisible({ timeout: 60000 });
    await expect(page.locator('#mailHandoff h2')).toHaveText('네트워크 장애로 QR코드를 만들지 못했어요');
    await expect(page.locator('#mailHandoff #doneMsg')).toHaveText('네트워크가 복구되면 담임 선생님 메일 주소로 영화 링크를 보내드려요.');
    await expect(page.locator('label[for="mailAddress"]')).toHaveText('담임교사 메일주소');
    await expect(page.locator('#mailName')).toBeVisible();
    await expect(page.locator('#retryBtn')).toHaveText('다시 제작하기');
    await expect(page.locator('#qrbox')).toHaveCount(0);
    // «이 기기에 저장»은 휴대폰에서만(11/8 Bumm님)
    await expect(page.locator('#downloadRow')).toHaveCount(0);
    expect(callCount).toBeGreaterThanOrEqual(2); // 1차 실패 + 재시도
  });

  // 메일 대기열을 쓸 수 없는 브라우저(IndexedDB 없음)도 PC · 패드에서는 «이 기기에 저장»을 띄우지 않는다(11/9 — 휴대폰에서만).
  // 장애 화면에 남아 «다시 제작하기»를 기다린다(맡기지 못하는 경우는 e2e/web-mail.spec.js «저장소를 막아…»).
  test('메일 대기열을 쓸 수 없는 PC 브라우저도 «이 기기에 저장» 없이 장애 화면을 띄운다', async ({ page }) => {
    await page.addInitScript(() => Object.defineProperty(window, 'indexedDB', { configurable: true, value: undefined }));
    let callCount = 0;
    await page.route(UPLOAD_PATTERN, (route) => {
      callCount++;
      return route.fulfill({ status: 500, contentType: 'application/json', body: '{"ok":false}' });
    });

    await openStudio(page, 'SF');
    await page.locator('#recBtn').click();
    await expect(page.locator('#afterRow')).toBeVisible({ timeout: TAKE_MS });
    await page.evaluate(() => {
      Object.defineProperty(navigator, 'onLine', { configurable: true, get: () => false });
      window.dispatchEvent(new window.Event('offline'));
    });
    await page.locator('button', { hasText: '저장하기' }).click();

    await expect(page.locator('#mailHandoff')).toBeVisible({ timeout: 60000 });
    await expect(page.locator('#retryBtn')).toBeVisible();
    await expect(page.locator('#downloadRow')).toHaveCount(0);
    expect(callCount).toBe(0);
  });

  // mergeClip()은 원판을 불러오지 못하면 예외를 던지고 Result.tsx가 에러 화면(errbox)을 보여준다.
  // 합성은 fetchFile()이 window.fetch()로 로고를 구운 합성용 원판(final/)을 읽으므로
  // fetch만 그 시점에 실패하도록 패치한다(page.route는 <video src> 요청을 가로채지 못한다).
  test('합성 실패 경로: 원판을 불러올 수 없으면 에러 화면이 뜨고 돌아가기로 녹음이 보존된다', async ({ page }) => {
    test.setTimeout(120000); // 애니메이션은 11/14부터 20.6초 완성본 — 녹음만 약 29초
    await page.addInitScript(() => {
      const originalFetch = window.fetch;
      window.fetch = (input, init) => {
        const url = typeof input === 'string' ? input : input.url;
        if (url.includes('/clips/final/animation.mp4')) {
          return Promise.reject(new Error('시뮬레이션된 네트워크 실패'));
        }
        return originalFetch(input, init);
      };
    });

    await openStudio(page, '애니메이션');
    await page.locator('#recBtn').click();
    await expect(page.locator('#afterRow')).toBeVisible({ timeout: TAKE_MS });

    await page.locator('button', { hasText: '저장하기' }).click();

    await expect(page.locator('#errbox')).toBeVisible({ timeout: 30000 });
    await expect(page.locator('#errbox')).toHaveText("영화를 만드는 중 문제가 생겼어요.녹음은 남아 있어요. '돌아가기'를 누른 뒤 다시 저장해 보세요.");
    await expect(page.locator('#done')).toBeHidden();

    await page.locator('#errBackBtn').click();
    await expect(page.locator('#studio')).toHaveClass(/active/);
    await expect(page.locator('#afterRow')).toBeVisible();
  });

  // 11/7 Bumm님(공식 행사, 아이 · 교사가 읽는 화면) — 합성 명령이 실패하면 FFmpeg 기록 8줄이 화면에 그대로 나왔다. 원문은 콘솔로만 남긴다.
  test('합성 실패 경로: FFmpeg가 실패해도 아이 화면에 오류 원문이 나오지 않고 콘솔에만 남는다', async ({ page }) => {
    test.setTimeout(120000); // 애니메이션은 11/14부터 20.6초 완성본 — 녹음만 약 29초
    const errors = [];
    page.on('console', message => { if (message.type() === 'error') errors.push(message.text()); });
    await page.addInitScript(() => {
      const originalFetch = window.fetch;
      window.fetch = (input, init) => {
        const url = typeof input === 'string' ? input : input.url;
        if (url.includes('/clips/final/animation.mp4')) return Promise.resolve(new Response(new Uint8Array(2048).fill(7), { status: 200, headers: { 'Content-Type': 'video/mp4' } }));
        return originalFetch(input, init);
      };
    });

    await openStudio(page, '애니메이션');
    await page.locator('#recBtn').click();
    await expect(page.locator('#afterRow')).toBeVisible({ timeout: TAKE_MS });
    await page.locator('button', { hasText: '저장하기' }).click();

    await expect(page.locator('#errbox')).toBeVisible({ timeout: 60000 });
    await expect(page.locator('#errbox')).toHaveText("영화를 만드는 중 문제가 생겼어요.녹음은 남아 있어요. '돌아가기'를 누른 뒤 다시 저장해 보세요.");
    expect(await page.locator('#result').innerText(), '오류 원문이 화면에 나온다').not.toMatch(/실패\n|Invalid|moov|ffmpeg|\[mov/i);
    expect(errors.some(text => text.includes('[영상 합성 실패]')), '콘솔에 원문이 남지 않았다').toBe(true);
  });

  test('다시 녹음을 누르면 «장면 시작»을 누른 것처럼 곧바로 처음부터 장면 → 멈춤 → 3·2·1 → 녹음이 다시 돈다', async ({ page }) => {
    test.setTimeout(150000); // 두 번 녹음한다(한 번에 약 31초)
    // 11/8 Bumm님 «지금은 멈춘 화면으로 돌아간다 — 누르면 장면 시작처럼 바로 카운트다운» (그 전에는 준비 화면으로 돌아갔다)
    await watchCountdown(page);
    await openStudio(page, TEST_SCENE.name);
    await page.locator('#recBtn').click();
    await expect(page.locator('#afterRow')).toBeVisible({ timeout: TAKE_MS });
    const firstTake = (await countdownLog(page)).length;

    await page.locator('button', { hasText: '다시 녹음' }).click();
    await expect(page.locator('#afterRow')).toBeHidden();
    await expect(page.locator('#studio')).toHaveAttribute('data-phase', /requesting|watching/);
    await expect(page.locator('#previewBtn')).toHaveCount(0);
    await expect(page.locator('#recBtn')).toBeDisabled();
    // 장면은 처음부터 다시 흐른다
    await expect.poll(() => page.locator('#clip').evaluate(v => !v.paused && v.currentTime > .3 && v.currentTime < 4.5)).toBe(true);
    await expect(page.locator('#recpill')).toBeVisible({ timeout: (PAUSE + 10) * 1000 });
    expect((await countdownLog(page)).slice(firstTake).map((e) => e.key)).toEqual(['cue', '3초 뒤 녹음 시작', '2초 뒤 녹음 시작', '1초 뒤 녹음 시작', 'recording', 'speak']);
    await expect(page.locator('#afterRow')).toBeVisible({ timeout: TAKE_MS });
    // 마우스로 눌렀으면 다음 단추로 초점을 옮기지 않는다 — 옮기면 빨간 초점 띠가 남는다(10/20, src/lib/inputModality.ts)
    await expect(page.locator('#saveBtn')).not.toBeFocused();
  });
});

// 11/14 Bumm님 «폭주기관차 올려» — 완성본은 편마다 길이(21~30초)와 멈춤 시각(12.0 · 15.0초)이 다르다. 멈춤 · 이어 재생 자리와
// 합성 결과 길이를 원판 · 미리보기 파일 길이로 본다(e2e/scene-data.js). 여덟 장르 모두 — 10초 장면이 남아 있으면 그 장면은 5.0초다.
test.describe('장르마다 다른 길이 · 멈춤 시각', () => {
  for (const [id, name] of [['sf', 'SF'], ['fantasy', '판타지'], ['animation', '애니메이션'], ['hero', '히어로'], ['thriller', '스릴러'], ['drama', '드라마'], ['sports', '스포츠'], ['musical', '뮤지컬']]) {
    test(`${name}: 그 장면의 멈춤 시각에서 멈추고 그 자리부터 이어 재생해 원판 끝까지 간다`, async ({ page }) => {
      test.setTimeout(150000);
      const pause = scenePause(id);
      const length = clipLength(id);
      // 아래 그림 띠에서 고른다 — 가운데가 아닌 카드를 바로 누르면 자동 넘김이 그 카드를 데려올 때까지 기다린다(뮤지컬 약 42초)
      await page.goto('/');
      await openScene(page, id);
      await expect(page.locator('#chipName')).toHaveText(name);
      const clip = page.locator('#clip');
      expect(await clip.evaluate(v => v.src)).toMatch(new RegExp(`/clips/${id}\\.mp4\\?v=[0-9a-f]{8}$`));
      await page.locator('#recBtn').click();
      await expect(page.locator('#studio')).toHaveAttribute('data-phase', 'watching');
      // 멈춤 시각 앞에서는 멈추지 않는다(다른 장르의 멈춤 자리를 지나간다) — 일찍 멈췄으면 아래 «멈춘 시각 = 멈춤 시각»이 떨어진다.
      // «재생 중»까지 함께 보면 확인 간격(최대 1초)이 멈춤 전 1초 창을 놓쳐, 이미 제자리에 멈춘 뒤 끝까지 기다린다(11/14 병렬 실행에서 세 장르)
      await expect.poll(() => clip.evaluate((v, t) => v.currentTime > t, pause - 1), { timeout: (pause + 5) * 1000 }).toBe(true);
      await expect(page.locator('#recpill')).toBeVisible({ timeout: 20000 });
      const paused = await clip.evaluate(v => ({ paused: v.paused, time: v.currentTime, length: v.duration }));
      expect(paused.paused).toBe(true);
      expect(Math.abs(paused.time - pause)).toBeLessThanOrEqual(1 / 30);
      expect(Math.abs(paused.length - length)).toBeLessThanOrEqual(.05);
      await expect(page.locator('#studio')).toHaveAttribute('data-phase', 'continuing', { timeout: 6000 });
      await expect.poll(() => clip.evaluate(v => v.currentTime)).toBeGreaterThan(pause + .2);
      await expect(page.locator('#afterRow')).toBeVisible({ timeout: (length - pause + 10) * 1000 });
      expect(await clip.evaluate(v => v.currentTime)).toBeGreaterThan(length - 0.2);
    });
  }

  test('히어로: 합성 결과는 원판 길이(21.0초) · 20MB 아래이고, 업로드되면 QR이 뜬다', async ({ page }) => {
    test.setTimeout(150000);
    let uploaded = null;
    await page.route(UPLOAD_PATTERN, (route) => {
      uploaded = JSON.parse(route.request().postData());
      return route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({ ok: true, url: 'https://storage.googleapis.com/fake/dub_hero.mp4' }) });
    });
    await openStudio(page, '히어로');
    await page.locator('#recBtn').click();
    await expect(page.locator('#afterRow')).toBeVisible({ timeout: 60000 });
    await page.locator('button', { hasText: '저장하기' }).click();
    await expect(page.locator('#qrbox')).toBeVisible({ timeout: 90000 });
    expect(uploaded.filename).toMatch(/^dub_hero_\d+_[0-9a-f]+\.mp4$/);
    const mp4 = Buffer.from(uploaded.dataBase64, 'base64');
    expect(mp4.length).toBeLessThan(20 * 1024 * 1024);
    expect(Math.abs(mp4Duration(mp4) - clipLength('hero'))).toBeLessThanOrEqual(.05);
  });
});

// 휴대폰에서 직접 체험하면 자기 화면의 QR을 찍을 수 없다 — 11/9 시안(Bumm님 «모바일은 QR 말고 저장하기»): QR 대신 그 자리에서 영화를 틀고
// «내 폰에 저장하기»로 이 기기에 둔다. 안드로이드는 내려받기, 아이폰은 공유 창(«비디오 저장»)이다.
const IPHONE_UA = 'Mozilla/5.0 (iPhone; CPU iPhone OS 18_1 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/18.1 Mobile/15E148 Safari/604.1';

async function finishOnPhone(page) {
  const url = 'https://storage.googleapis.com/fake/dub_phone.mp4';
  await page.route(UPLOAD_PATTERN, (route) => route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({ ok: true, url }) }));
  await openStudio(page, 'SF');
  await page.locator('#recBtn').click();
  await expect(page.locator('#afterRow')).toBeVisible({ timeout: TAKE_MS });
  await page.locator('button', { hasText: '저장하기' }).click();
  await expect(page.locator('#phoneSaveBtn')).toBeVisible({ timeout: 60000 });
}

test.describe('휴대폰에서 직접 체험', () => {
  test.use({ viewport: { width: 390, height: 664 }, hasTouch: true, isMobile: true });

  test('저장되면 QR 대신 영화를 그 자리에서 틀고, «내 폰에 저장하기»는 이 기기에 내려받는다(안드로이드)', async ({ page }) => {
    await finishOnPhone(page);
    await expect(page.locator('#qrbox')).toBeHidden();
    await expect(page.locator('#openMovieBtn')).toHaveCount(0);
    await expect(page.locator('#retentionNote')).toHaveText('이 영화는 11월 30일까지 보관돼요');
    await expect(page.locator('#phoneSaveBtn')).toBeInViewport();
    // «다른 더빙하기»는 한 단계 약하게 — 흰 바탕 · 빨간 테두리
    const home = await page.locator('#doneHomeBtn').evaluate((el) => { const s = getComputedStyle(el); return [s.backgroundColor, s.borderTopColor]; });
    expect(home).toEqual(['rgb(255, 255, 255)', 'rgb(229, 35, 32)']);

    await page.locator('#posterPlayBtn').click();
    const movie = page.locator('video.poster-movie');
    await expect(movie).toBeVisible();
    await expect(movie).toHaveAttribute('src', /^blob:/);
    await expect.poll(() => movie.evaluate((v) => v.currentTime)).toBeGreaterThan(0);

    const [download] = await Promise.all([page.waitForEvent('download'), page.locator('#phoneSaveBtn').click()]);
    expect(download.suggestedFilename()).toBe('Voice Cinema_SF.mp4');
  });

  test.describe('아이폰', () => {
    test.use({ userAgent: IPHONE_UA });

    test('«내 폰에 저장하기»는 누른 그 자리에서 공유 창에 mp4 파일을 넘긴다(«비디오 저장»)', async ({ page }) => {
      // 공유 창은 자동화로 띄울 수 없어 넘기는 값만 본다 — 누른 손길이 살아 있을 때 불러야 아이폰이 창을 연다
      await page.addInitScript(() => {
        navigator.canShare = (data) => !!data?.files?.length;
        navigator.share = async (data) => {
          const file = data.files[0];
          window.__shared = { name: file.name, type: file.type, size: file.size, active: navigator.userActivation.isActive };
        };
      });
      await finishOnPhone(page);
      let downloaded = false;
      page.on('download', () => { downloaded = true; });
      await page.locator('#phoneSaveBtn').click();
      await expect.poll(() => page.evaluate(() => window.__shared)).toBeTruthy();
      const shared = await page.evaluate(() => window.__shared);
      expect(shared).toMatchObject({ name: 'Voice Cinema_SF.mp4', type: 'video/mp4', active: true });
      expect(shared.size).toBeGreaterThan(100000);
      expect(downloaded).toBe(false);
    });
  });

  // 와이파이 없이 쓰는 설치판(10/27)과 같은 길 — 인터넷이 아예 없으면 App Check를 20초씩 세 번 기다리지 않고 바로 장애 화면으로 간다.
  // 휴대폰은 메일 칸 대신 이 기기에 저장이다(11/8 Bumm님 «이 기기에 저장은 휴대폰에서만»). 원판은 이미 받아 두었으므로 navigator.onLine만 끈다.
  // 장면은 처음 가운데에 있는 SF로 고른다 — openStudio는 그 카드가 자동 넘김(6초)으로 가운데에 올 때까지 기다리므로, 일곱째인 스포츠는
  // 누르기에만 41초가 걸려 녹음 · 합성까지 60초를 넘겼다(11/8 추적 기록).
  test('인터넷이 없으면 올리지 않고 곧바로 이 기기에 저장으로 가며, «다시 제작하기»는 연결이 돌아오면 QR을 만든다', async ({ page }) => {
    const url = 'https://storage.googleapis.com/fake/dub_retry.mp4';
    let callCount = 0;
    let serverUp = false;
    await page.route(UPLOAD_PATTERN, (route) => {
      callCount++;
      return serverUp
        ? route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({ ok: true, url }) })
        : route.fulfill({ status: 500, contentType: 'application/json', body: '{"ok":false}' });
    });
    const setOnline = (on) => page.evaluate((value) => {
      Object.defineProperty(navigator, 'onLine', { configurable: true, get: () => value });
      window.dispatchEvent(new window.Event(value ? 'online' : 'offline'));
    }, on);

    await openStudio(page, 'SF');
    await page.locator('#recBtn').click();
    await expect(page.locator('#afterRow')).toBeVisible({ timeout: TAKE_MS });
    await setOnline(false);
    await page.locator('button', { hasText: '저장하기' }).click();

    await expect(page.locator('#downloadRow')).toBeVisible({ timeout: 60000 });
    await expect(page.locator('#done h2')).toHaveText('네트워크 장애로 QR코드를 만들지 못했어요');
    await expect(page.locator('#doneMsg')).toHaveText('아래 단추를 눌러 이 기기에 저장해 주세요.');
    await expect(page.locator('#savemode')).toContainText('자동으로 지워지지 않아요');
    await expect(page.locator('#mailHandoff')).toHaveCount(0);
    expect(callCount).toBe(0);
    const [download] = await Promise.all([page.waitForEvent('download'), page.locator('#downloadBtn').click()]);
    expect(download.suggestedFilename()).toBe('Voice Cinema_SF.mp4');

    // 끊긴 채 누르면 올리지 않고 «다시 만드는 중…»을 잠깐 보인 뒤 같은 화면에 남는다
    const retry = page.locator('#retryBtn');
    await retry.click();
    await expect(retry).toHaveText('다시 만드는 중…');
    await expect(retry).toBeDisabled();
    await expect(retry).toHaveText('다시 제작하기');
    await expect(page.locator('#downloadRow')).toBeVisible();
    expect(callCount).toBe(0);

    // 연결이 돌아오면 같은 단추로 QR을 만든다
    serverUp = true;
    await setOnline(true);
    await retry.click();
    await expect(page.locator('#phoneSaveBtn')).toBeVisible({ timeout: 60000 });
    await expect(page.locator('#downloadRow')).toHaveCount(0);
    expect(callCount).toBe(1);
  });
});
