// 실사용 흐름 E2E 테스트(2026-08-27 시작, 2026-10-16 장면 더빙 2.0 흐름으로 다시 씀).
// 실제 Chromium(가짜 마이크 장치)으로 홈 화면→장면 시작→5.0초 멈춤→문구·3·2·1→녹음 3초(말이 이어지면 3.5초까지)→이어 재생
// →ffmpeg.wasm 섞기 합성→저장까지 진짜로 돌려서 검증한다. Cloud Functions 업로드만 page.route로 가로채
// (a) 실제 프로덕션 Storage에 테스트 파일이 쌓이지 않게, (b) 네트워크 상태에 결과가 좌우되지 않게 한다.
import { Buffer } from 'node:buffer';
import { test, expect } from '@playwright/test';
import { countdownLog, watchCountdown } from './countdown-watch.js';

const UPLOAD_PATTERN = '**/voiceCinema/upload';
const GENRE_NAMES = ['SF', '판타지', '애니메이션', '히어로', '스릴러', '드라마', '스포츠', '뮤지컬'];
// 장면 5초 + 문구 0.6초 + 3·2·1 0.9초 + 녹음 3~3.5초 + 녹음 확인 + 이어 재생 5초 ≈ 15초. 느린 러너 여유를 둔다.
const TAKE_MS = 40000;

/** mp4의 mvhd 상자에서 길이(초)를 읽는다 — 완성본이 정확히 10.0초인지 본다. */
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
  test('5.0초에서 정확히 멈추고 문구 → 3·2·1 → 녹음 3초(말이 이어지면 3.5초까지) → 5.0초부터 이어 재생한다', async ({ page }) => {
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
    await openStudio(page, '판타지');
    const clip = page.locator('#clip');
    await expect(clip).toHaveJSProperty('paused', true);
    await expect(page.locator('#recBtn')).toHaveText(/장면 시작/);
    await page.locator('#recBtn').click();

    await expect(page.locator('#studio')).toHaveAttribute('data-phase', 'watching');
    await expect.poll(() => clip.evaluate(v => v.currentTime)).toBeGreaterThan(.5);
    // 문구(0.6초)와 3·2·1(0.3초씩)은 짧아서, 나타난 뒤 검사가 글자를 따로 읽으러 가면 그 사이 사라질 수 있다 — 10/31 동시 16개로
    // 100번 돌렸을 때 2번, waitFor 뒤 textContent가 사라진 문구를 기다리다 시간 초과. 페이지 안 기록(countdown-watch.js)으로 본다.
    await expect(page.locator('#recpill')).toBeVisible({ timeout: 15000 });
    const log = await countdownLog(page);
    expect(log.find((e) => e.key === 'cue')?.text).toBe('이제 당신의 차례입니다 !');
    expect(log.find((e) => e.key.endsWith('녹음 시작'))?.text).toContain('지금 바로 당신의 목소리를 들려주세요 !');
    // 멈춘 영상 시각이 5.0초와 한 프레임(1/30초) 안이고, 녹음 중에도 그 정지 화면 그대로다.
    const paused = await clip.evaluate(v => ({ paused: v.paused, time: v.currentTime }));
    expect(paused.paused).toBe(true);
    expect(Math.abs(paused.time - 5)).toBeLessThanOrEqual(1 / 30);
    await expect(page.locator('#studio')).toHaveAttribute('data-phase', 'continuing', { timeout: 6000 });
    const { start, stop } = await page.evaluate(() => window.__recorderTimes);
    const recordMs = stop - start;
    expect(recordMs).toBeGreaterThanOrEqual(3000);
    expect(recordMs).toBeLessThan(4000);
    // 이어 재생은 5.0초부터다.
    await expect.poll(() => clip.evaluate(v => v.currentTime)).toBeGreaterThan(5.2);
    await expect(page.locator('#afterRow')).toBeVisible({ timeout: 10000 });
    // «다시 듣기»는 없다(10/20 대표님). 마우스로 녹음했으면 다음 단추에 초점(빨간 띠)을 남기지 않는다.
    await expect(page.locator('#afterRow button')).toHaveText(['다시 녹음', '저장하기']);
    await expect(page.locator('#saveBtn')).not.toBeFocused();
  });

  test('상대 대사 자막은 1.6초에 나타나 3.4초에 사라지고, 흰 글씨·배경 상자 없음이다', async ({ page }) => {
    await openStudio(page, '드라마');
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
    await expect(caption).toBeVisible({ timeout: 5000 });
    await expect(caption).toHaveText('이제… 아무도 몰라보셔.');
    const style = await caption.evaluate(el => {
      const s = getComputedStyle(el);
      return { color: s.color, background: s.backgroundColor, lines: Math.round(el.getBoundingClientRect().height / parseFloat(s.lineHeight)) };
    });
    expect(style.color).toBe('rgb(255, 255, 255)');
    expect(style.background).toBe('rgba(0, 0, 0, 0)');
    expect(style.lines).toBeLessThanOrEqual(2);
    await expect(caption).toBeHidden({ timeout: 4000 });
    const [shownAt, hiddenAt] = await page.evaluate(() => window.__captionLog);
    // 한 화면 갱신(약 1/30초)만큼의 여유만 둔다.
    expect(shownAt).toBeGreaterThanOrEqual(1.6 - 1 / 30);
    expect(shownAt).toBeLessThan(1.6 + 2 / 30);
    expect(hiddenAt).toBeGreaterThanOrEqual(3.4 - 1 / 30);
    expect(hiddenAt).toBeLessThan(3.4 + 2 / 30);
  });

  test('처음으로 버튼을 누르면 홈으로 돌아간다', async ({ page }) => {
    await openStudio(page, '드라마');
    await expect(page.locator('#studio')).toHaveClass(/active/);
    await page.locator('.back').click();
    await expect(page.locator('#home')).toHaveClass(/active/);
  });
});

test.describe('녹음 → 합성 → 저장 (실사용 흐름)', () => {
  test('정상 흐름: 섞기 합성 결과는 정확히 10.0초이고, 업로드 성공 시 QR이 표시된다', async ({ page }) => {
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
    // «내 영화 열기»는 휴대폰에서만 보인다 — 부스의 노트북에서는 학생이 자기 휴대폰으로 QR을 찍는다.
    await expect(page.locator('#openMovieBtn')).toBeHidden();

    expect(uploaded.filename).toMatch(/^dub_sf_\d+_[0-9a-f]+\.mp4$/);
    const mp4 = Buffer.from(uploaded.dataBase64, 'base64');
    expect(mp4.length).toBeLessThan(20 * 1024 * 1024);
    expect(Math.abs(mp4Duration(mp4) - 10)).toBeLessThanOrEqual(.05);
  });

  test('실패 경로: 클라우드 업로드가 실패하면 기기 저장 버튼으로 폴백한다', async ({ page }) => {
    let callCount = 0;
    await page.route(UPLOAD_PATTERN, (route) => {
      callCount++;
      return route.fulfill({ status: 500, contentType: 'application/json', body: JSON.stringify({ ok: false, error: '저장 중 오류가 발생했습니다.' }) });
    });

    await openStudio(page, '히어로');
    await page.locator('#recBtn').click();
    await expect(page.locator('#afterRow')).toBeVisible({ timeout: TAKE_MS });
    await page.locator('button', { hasText: '저장하기' }).click();

    await expect(page.locator('#done')).toBeVisible({ timeout: 60000 });
    await expect(page.locator('#downloadRow')).toBeVisible();
    await expect(page.locator('#qrbox')).toBeHidden();
    await expect(page.locator('#doneMsg')).toContainText('인터넷이 잠깐 불안해서');
    // 기기에 저장된 영화는 자동 삭제 대상이 아니다 — 선생님께 지워 달라는 한 줄은 남긴다(아이 목소리 보호)
    await expect(page.locator('#savemode')).toContainText('자동으로 지워지지 않아요');
    expect(callCount).toBeGreaterThanOrEqual(2); // 1차 실패 + 재시도

    // #downloadBtn 자체엔 download 속성이 없다 — 클릭 시 JS가 그 순간 <a download>를
    // 만들어 클릭하고 지우는 구조라, 실제로 다운로드가 트리거되는지를 확인해야 한다.
    const [download] = await Promise.all([
      page.waitForEvent('download'),
      page.locator('#downloadBtn').click(),
    ]);
    expect(download.suggestedFilename()).toBe('Voice Cinema_히어로.mp4');
  });

  // mergeClip()은 원판을 불러오지 못하면 예외를 던지고 Result.tsx가 에러 화면(errbox)을 보여준다.
  // 합성은 fetchFile()이 window.fetch()로 로고를 구운 합성용 원판(final/)을 읽으므로
  // fetch만 그 시점에 실패하도록 패치한다(page.route는 <video src> 요청을 가로채지 못한다).
  test('합성 실패 경로: 원판을 불러올 수 없으면 에러 화면이 뜨고 돌아가기로 녹음이 보존된다', async ({ page }) => {
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
    await expect(page.locator('#errbox')).toContainText('영상 합성 중 문제가 생겼어요');
    await expect(page.locator('#done')).toBeHidden();

    await page.locator('#errBackBtn').click();
    await expect(page.locator('#studio')).toHaveClass(/active/);
    await expect(page.locator('#afterRow')).toBeVisible();
  });

  test('다시 녹음을 누르면 초기 상태로 돌아간다', async ({ page }) => {
    await openStudio(page, '스포츠');
    await page.locator('#recBtn').click();
    await expect(page.locator('#afterRow')).toBeVisible({ timeout: TAKE_MS });

    await page.locator('button', { hasText: '다시 녹음' }).click();
    await expect(page.locator('#recBtn')).toBeVisible();
    await expect(page.locator('#afterRow')).toBeHidden();
    await expect(page.locator('#hint')).toContainText("'장면 시작'을 누르면");
    // 마우스로 눌렀으면 «장면 시작»으로 초점을 옮기지 않는다 — 옮기면 빨간 초점 띠가 남는다(10/20, src/lib/inputModality.ts)
    await expect(page.locator('#recBtn')).not.toBeFocused();
    await expect(page.locator('#clip')).toHaveJSProperty('currentTime', 0);
  });
});

// 10/17: 휴대폰에서 직접 체험하면 자기 화면의 QR을 찍을 수 없다 — QR 아래 «내 영화 열기»가 같은 공개 주소를 연다.
test.describe('휴대폰에서 직접 체험', () => {
  test.use({ viewport: { width: 390, height: 664 }, hasTouch: true, isMobile: true });

  test('저장되면 QR 아래 «내 영화 열기» 단추가 보이고 같은 공개 주소를 가리킨다', async ({ page }) => {
    const url = 'https://storage.googleapis.com/fake/dub_phone.mp4';
    await page.route(UPLOAD_PATTERN, (route) => route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({ ok: true, url }) }));
    await openStudio(page, 'SF');
    await page.locator('#recBtn').click();
    await expect(page.locator('#afterRow')).toBeVisible({ timeout: TAKE_MS });
    await page.locator('button', { hasText: '저장하기' }).click();
    await expect(page.locator('#qrbox')).toBeVisible({ timeout: 60000 });
    const open = page.locator('#openMovieBtn');
    await expect(open).toBeVisible();
    await expect(open).toHaveAttribute('href', url);
    await expect(open).toHaveAttribute('target', '_blank');
    await expect(open).toBeInViewport();
  });
});
