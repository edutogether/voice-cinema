// 녹음·합성 품질(10/24 대표님 지시, 10/25 말끝 감지) — 시험용 마이크로 아이가 말하는 때와 길이를 정해 놓고, 녹음 길이·판정·미리 듣기·완성본을 잰다.
//   녹음: 말이 끝나고 0.6초(첫 말이 0.8초보다 짧으면 0.9초) 조용하면 바로 끝난다. 말 시작 뒤 3초(발화 상한)에도 이어지면 거기서 멈추고
//         «말끝이 잘렸을 수 있어요». 신호 뒤 2.5초 안에 말이 시작되지 않으면 무음으로 멈춘다.
//   무음·녹음기 오류·마이크 뽑힘은 저장으로 넘어가지 않고 준비 화면으로 돌아간다. 속삭임은 무음으로 버리지 않는다.
//   합성: 영화에는 말 시작 0.12초 앞부터 끝 0.15초 뒤까지만 들어가 정지 시각(5.0초)에 놓인다 — 말하기 전 기다림은 버리고 첫소리는 지킨다.
//         목소리는 8.5초를 넘지 않으며, 원판 소리는 목소리 칸 밖에서 그대로다.
import { Buffer } from 'node:buffer';
import { test, expect } from '@playwright/test';
import { installSyntheticMic, previews, rawTake, recordOnce, takes } from './synthetic-mic.js';
import { LIVE_SCENE, duration, leadRange, originalClip, placement, tracks, voiceInMovie } from './movie-check.js';

test.describe.configure({ timeout: 240000 });

async function openSf(page) {
  await page.goto('/');
  await page.locator('#splash').waitFor({ state: 'detached' });
  await page.getByRole('button', { name: 'SF 더빙 시작', exact: true }).click();
  await expect(page.locator('#clip')).toHaveJSProperty('readyState', 4, { timeout: 20000 });
}

async function captureUpload(page) {
  const uploads = [];
  await page.route('**/voiceCinema/upload', (route) => {
    uploads.push(JSON.parse(route.request().postData()));
    return route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({ ok: true, url: 'https://storage.googleapis.com/fake/voice.mp4' }) });
  });
  return uploads;
}

async function saveAndGetMovie(page, uploads) {
  await page.locator('#saveBtn').click();
  await expect(page.locator('#qrbox')).toBeVisible({ timeout: 90000 });
  return uploads.at(-1).dataBase64;
}

/**
 * 미리 듣기: 영상이 정지 시각을 내보내는 순간에 맞춰 틀었고, 말소리가 영상 시간으로 정지 시각 + 0.12초 안팎에 들린다.
 * 다듬은 목소리(구간을 잘라 둔 파일)든, 엔진이 아직이라 처리 전 녹음의 같은 구간을 트는 경우든 같은 자리다.
 */
function heardAt(preview) {
  return preview.videoTime + (preview.onset - preview.offset);
}
function expectPreviewInSync(preview, raw, pause = LIVE_SCENE.pause) {
  expect(preview.videoTime).toBeGreaterThanOrEqual(pause - 0.01);
  expect(preview.videoTime).toBeLessThan(pause + 0.1);
  const lead = heardAt(preview) - pause;
  const range = leadRange(raw);
  expect(lead, `미리 듣기 말소리 자리 ${JSON.stringify({ preview, raw })}`).toBeGreaterThanOrEqual(range.min - 0.01);
  expect(lead).toBeLessThanOrEqual(range.max + 0.01);
}

/** 앱이 녹음기를 멈추기로 한 때(녹음기 start()를 부른 때부터 초) — 말끝 + 0.6초, 발화 상한(말 시작 + 3초)을 넘지 않는다. 부하로 늦을 수는 있어도 이를 수는 없다 */
function expectStop(take, { speechStart, speechEnd, hang = 0.6 }) {
  const expected = Math.min(speechEnd + hang, speechStart + 3);
  expect(take.stopAt, `멈춘 때 ${JSON.stringify(take)} — 기대 ${expected}`).toBeGreaterThanOrEqual(expected - 0.02);
  expect(take.stopAt).toBeLessThan(expected + 0.35);
}

test('발화 1·1.5·2·2.7초 — 말이 끝나고 0.6초 뒤 바로 멈추고(2.7초는 발화 상한에서), 다시 녹음을 거듭해도 매번 새 녹음', async ({ page }) => {
  const plans = [{ delay: 0.3, dur: 1 }, { delay: 0.3, dur: 1.5 }, { delay: 0.3, dur: 2 }, { delay: 0.3, dur: 2.7 }];
  await installSyntheticMic(page, plans);
  await openSf(page);
  const results = [];
  for (const [i, plan] of plans.entries()) {
    const r = await recordOnce(page);
    const take = (await takes(page))[i];
    const preview = (await previews(page)).at(-1);
    // 기준은 녹음 파일에 실제로 담긴 말소리 자리다 — 시험이 예약한 때는 부하에 따라 녹음 시작과 수십 ms 어긋난다
    const raw = await rawTake(page, i);
    results.push({ plan, ...r, raw, preview, stopAt: take.stopAt });
    expect(r.phase, `${i + 1}번째 녹음은 저장할 수 있어야 한다 — ${JSON.stringify({ ...r, take })}`).toBe('recorded');
    expect(r.check).toBe('ok');
    // 말끝 0.6초 뒤에 멈춘다 — 발화 상한(말 시작 + 3초)을 넘지 않는다(2.7초 발화는 상한에서)
    expectStop(take, { speechStart: plan.delay, speechEnd: plan.delay + plan.dur });
    expectPreviewInSync(preview, raw);
    await page.locator('#resetBtn').click();
    await expect(page.locator('#studio')).toHaveAttribute('data-phase', 'idle');
  }
  console.log(JSON.stringify(results.map((r) => ({ plannedEnd: +(r.plan.delay + r.plan.dur).toFixed(2), stopAt: r.stopAt, speechEnd: +r.raw.end.toFixed(3), recorded: +r.raw.seconds.toFixed(3), rawStart: +r.raw.start.toFixed(3), heardAt: +heardAt(r.preview).toFixed(3), offset: +r.preview.offset.toFixed(3) }))));
});

test('«셋 !» 뒤 0.7초 쉬고 이어 말해도 쉬는 동안 끝나지 않고 둘 다 담긴다', async ({ page }) => {
  // 녹음기가 켜진 뒤 0.3초에 «셋 !»(0.35초), 1.35초부터 1.4초 «날아라, 미르 !»
  await installSyntheticMic(page, [{ delay: 0.3, dur: 0.35, more: [{ delay: 1.35, dur: 1.4 }] }]);
  await openSf(page);
  const r = await recordOnce(page);
  expect(r).toMatchObject({ phase: 'recorded', check: 'ok' });
  const raw = await rawTake(page, 0);
  expect(raw.end, `두 번째 말까지 담겼다 ${JSON.stringify(raw)}`).toBeGreaterThan(2.6);
  // 두 번째 말이 끝난 뒤(1.35 + 1.4초) 0.6초에 멈춘다 — 쉬는 동안(0.65~1.35초)에는 멈추지 않았다
  expectStop((await takes(page))[0], { speechStart: 0.3, speechEnd: 1.35 + 1.4 });
});

test('말 시작 뒤 3초에도 말이 이어지면 거기서 멈추고 «말끝이 잘렸을 수 있어요» — 들어 보고 저장하거나 다시 녹음할 수 있다', async ({ page }) => {
  await installSyntheticMic(page, [{ delay: 0.2, dur: 4 }]);
  await openSf(page);
  const r = await recordOnce(page);
  expect(r).toMatchObject({ phase: 'recorded', check: 'cut' });
  expect(r.hint).toContain('말끝이 잘렸을 수 있어요');
  expectStop((await takes(page))[0], { speechStart: 0.2, speechEnd: 0.2 + 4 });
  await expect(page.locator('#afterRow button')).toHaveText([/다시 녹음/, /저장하기/]);
});

test('신호(«지금 외쳐요 !»)보다 먼저 말하면 «앞부분이 빠졌을 수 있어요», 늦게(2초) 말해도 기다렸다가 담고 앞의 기다림은 버린다', async ({ page }) => {
  await installSyntheticMic(page, [{ early: true, dur: 2 }, { delay: 2, dur: 1.5 }]);
  await openSf(page);
  expect(await recordOnce(page)).toMatchObject({ phase: 'recorded', check: 'early' });
  await page.locator('#resetBtn').click();
  const late = await recordOnce(page);
  expect(late).toMatchObject({ phase: 'recorded', check: 'ok' });
  const raw = await rawTake(page, 1);
  expect(raw.start).toBeGreaterThan(1.7);
  expectStop((await takes(page))[1], { speechStart: 2, speechEnd: 2 + 1.5 });
  // 2초를 기다린 녹음이어도 미리 듣기 말소리는 정지 시각 + 0.12초 안팎에 들린다
  expectPreviewInSync((await previews(page)).at(-1), raw);
});

// 안내 글 칸은 두 줄 몫이다 — 알림 문구가 넘치면 휴대폰에서 영상·단추가 움직인다(e2e/studio-phone-fill.spec.js의 규칙)
// 알림마다 새 페이지에서 본다 — 한 페이지에서 시험용 마이크 계획을 잇달아 바꾸면 병렬 부하에서 다른 계획의 소리가 담긴 적이 있다(앱은 받은 소리대로 판정했다)
for (const [expected, plan] of [['cut', { delay: 0.2, dur: 4 }], ['quiet', { delay: 0.3, dur: 1.5, amp: 0.006 }], ['early', { early: true, dur: 2 }]]) {
  test(`휴대폰 360×640: «${expected}» 알림도 안내 칸 두 줄 안이라 영상·단추가 움직이지 않는다`, async ({ page }) => {
    await page.setViewportSize({ width: 360, height: 640 });
    await installSyntheticMic(page, [plan]);
    await openSf(page);
    const layout = () => page.evaluate(() => ({
      frame: Math.round(document.querySelector('.studio-video-frame').getBoundingClientRect().top),
      hint: Math.round(document.querySelector('#hint').getBoundingClientRect().height),
      lineHeight: parseFloat(getComputedStyle(document.querySelector('#hint')).lineHeight),
    }));
    await expect(page.locator('.studio-video-frame')).not.toHaveClass(/is-entering/);
    const idle = await layout();
    expect(await recordOnce(page)).toMatchObject({ phase: 'recorded', check: expected });
    const now = await layout();
    expect(now.hint).toBeLessThanOrEqual(Math.ceil(now.lineHeight * 2) + 1);
    expect(now.frame).toBe(idle.frame);
  });
}

test('완전 무음은 저장으로 넘어가지 않고 준비 화면에서 다시 녹음하게 한다 — 소리를 하나도 못 읽으면 판단하지 않고 기다림 + 상한(5.5초)까지 녹음한 뒤 판정', async ({ page }) => {
  await installSyntheticMic(page, [{ silent: true }, { delay: 0.3, dur: 1.5 }]);
  await openSf(page);
  const r = await recordOnce(page);
  expect(r).toMatchObject({ phase: 'idle', check: 'silent' });
  expect(r.hint).toContain('목소리가 들리지 않았어요');
  await expect(page.locator('#afterRow')).toHaveCount(0);
  await expect(page.locator('#recBtn')).toBeEnabled();
  expect((await takes(page))[0].seconds).toBeGreaterThan(5.4);
  expect(await recordOnce(page)).toMatchObject({ phase: 'recorded', check: 'ok' });
});

test('배경 소리만 흐르고 신호 뒤 2.5초가 지나도록 말하지 않으면 2.5초에 멈추고 다시 녹음하게 한다', async ({ page }) => {
  // 배경 소리(−68dBFS)는 마이크를 열 때 정해진다 — 이 페이지의 녹음은 모두 같은 마이크 연결을 쓴다. 말은 2.9초에야 시작한다
  await installSyntheticMic(page, [{ delay: 2.9, dur: 1.5, noise: 0.0005 }, { delay: 0.3, dur: 1.5 }]);
  await openSf(page);
  const r = await recordOnce(page);
  expect(r).toMatchObject({ phase: 'idle', check: 'silent' });
  expect(r.hint).toContain('목소리가 들리지 않았어요');
  const late = (await takes(page))[0];
  expect(late.seconds).toBeGreaterThan(2.45);
  expect(late.seconds).toBeLessThan(2.85);
  expect(await recordOnce(page)).toMatchObject({ phase: 'recorded', check: 'ok' });
});

test('아주 작은 목소리(−40dBFS 안팎)는 무음으로 버리지 않고 정해진 만큼 키워 들려준다', async ({ page }) => {
  await installSyntheticMic(page, [{ delay: 0.3, dur: 1.5, amp: 0.015 }]);
  await openSf(page);
  const r = await recordOnce(page);
  expect(r.phase).toBe('recorded');
  expect(['ok', 'quiet']).toContain(r.check);
  // 다듬은 목소리는 녹음보다 크다(+12dB 안쪽 보정)
  const preview = (await previews(page)).at(-1);
  const raw = await rawTake(page, 0);
  console.log(JSON.stringify({ raw, preview }));
  // +12dB(×3.98)가 상한이다. 피크는 90Hz 고역 필터가 배음의 위상을 옮겨 이 흉내 소리에서 1.3dB 더 오른다(평균 크기는 그대로, 엔진에서 확인)
  expect(preview.peak).toBeGreaterThan(raw.peak * 2);
  expect(preview.peak).toBeLessThan(raw.peak * 3.98 * 1.17);
});

test('주변 소음(−44dBFS) 속 발화도 소음을 말로 보지 않고, 말이 끝나면 0.6초 뒤 멈춘다', async ({ page }) => {
  await installSyntheticMic(page, [{ delay: 0.3, dur: 1.5, noise: 0.006 }]);
  await openSf(page);
  expect(await recordOnce(page)).toMatchObject({ phase: 'recorded', check: 'ok' });
  expectStop((await takes(page))[0], { speechStart: 0.3, speechEnd: 0.3 + 1.5 });
});

test('녹음 중 마이크가 뽑히면 성공처럼 보이지 않고 준비 화면으로, 다시 누르면 마이크를 새로 연결해 녹음한다', async ({ page }) => {
  // 두 번째 뽑힘은 끊김 이벤트가 오지 않는 기기 흉내 — 녹음이 끝날 때 마이크 상태로 알아챈다
  await installSyntheticMic(page, [{ delay: 0.3, dur: 2, unplug: 1.2 }, { delay: 0.3, dur: 1.5 }, { delay: 0.3, dur: 2, unplug: 1.2, unplugQuiet: true }, { delay: 0.3, dur: 1.5 }]);
  await openSf(page);
  for (const round of [1, 2]) {
    const r = await recordOnce(page);
    expect(r.phase, `${round}번째 뽑힘`).toBe('idle');
    expect(r.hint).toContain('마이크에 문제가 생겼어요');
    await expect(page.locator('#afterRow')).toHaveCount(0);
    expect(await recordOnce(page)).toMatchObject({ phase: 'recorded', check: 'ok' });
    // 뽑힌 뒤에는 마이크를 새로 연결한다(정상 녹음 뒤 다음 녹음은 연결을 그대로 쓴다): 1회차 2번, 2회차 3번
    expect(await page.evaluate(() => window.__mic.requests)).toBe(round + 1);
    await page.locator('#resetBtn').click();
  }
});

test('녹음기가 오류를 내면 그 녹음을 쓰지 않고 준비 화면으로 돌아간다', async ({ page }) => {
  await installSyntheticMic(page, [{ delay: 0.3, dur: 2, error: 1 }, { delay: 0.3, dur: 1.5 }]);
  await openSf(page);
  const r = await recordOnce(page);
  expect(r.phase).toBe('idle');
  expect(r.hint).toContain('녹음을 시작하지 못했어요');
  expect(await recordOnce(page)).toMatchObject({ phase: 'recorded', check: 'ok' });
});

// 사파리의 mp4 녹음처럼 브라우저가 자기 녹음을 풀지 못하는 판이 있다 — 그래도 녹음을 버리지 않고 엔진으로 풀어 검사한다
test('브라우저가 녹음 파일을 풀지 못해도 엔진으로 풀어 검사하고 정상 녹음으로 이어 간다', async ({ page }) => {
  await installSyntheticMic(page, [{ delay: 0.3, dur: 1.5 }]);
  await page.addInitScript(() => {
    const decode = window.BaseAudioContext.prototype.decodeAudioData;
    window.__nativeDecode = decode;
    window.__refusedDecodes = 0;
    window.BaseAudioContext.prototype.decodeAudioData = function (bytes, ...rest) {
      // 웹엠(1A 45 DF A3)만 거절한다 — WAV(엔진이 푼 것)는 그대로 푼다
      if (new Uint8Array(bytes, 0, 4).join() === '26,69,223,163') {
        window.__refusedDecodes++;
        return Promise.reject(new window.DOMException('이 형식은 풀 수 없음', 'EncodingError'));
      }
      return decode.call(this, bytes, ...rest);
    };
  });
  await openSf(page);
  expect(await recordOnce(page)).toMatchObject({ phase: 'recorded', check: 'ok' });
  expect(await page.evaluate(() => window.__refusedDecodes)).toBeGreaterThan(0);
  // 녹음 파일의 말소리 자리를 재려면 막아 둔 디코더를 되돌린다(앱의 검사는 위에서 이미 끝났다)
  await page.evaluate(() => { window.BaseAudioContext.prototype.decodeAudioData = window.__nativeDecode; });
  expectPreviewInSync((await previews(page)).at(-1), await rawTake(page, 0));
});

test('녹음 중 화면이 가려지면(다른 앱·탭) 반쪽 녹음을 저장하지 않고 거둔 뒤 안내한다', async ({ page }) => {
  await installSyntheticMic(page, [{ delay: 0.3, dur: 2 }, { delay: 0.3, dur: 1.5 }]);
  await openSf(page);
  await page.locator('#recBtn').click();
  await expect(page.locator('#recpill')).toBeVisible({ timeout: 12000 });
  await page.evaluate(() => {
    Object.defineProperty(document, 'hidden', { configurable: true, get: () => true });
    document.dispatchEvent(new window.Event('visibilitychange'));
  });
  await expect(page.locator('#studio')).toHaveAttribute('data-phase', 'idle');
  await expect(page.locator('#hint')).toContainText('화면을 벗어나서 녹음을 멈췄어요');
  expect((await takes(page))[0].state).toBe('inactive');
  await expect(page.locator('#afterRow')).toHaveCount(0);
  await page.evaluate(() => { delete document.hidden; });
  expect(await recordOnce(page)).toMatchObject({ phase: 'recorded', check: 'ok' });
});

test('«장면 시작»을 연달아 눌러도 녹음은 하나다', async ({ page }) => {
  await installSyntheticMic(page, [{ delay: 0.3, dur: 1.5 }]);
  await openSf(page);
  for (let i = 0; i < 5; i++) await page.locator('#recBtn').click({ force: true, noWaitAfter: true }).catch(() => {});
  await expect(page.locator('#afterRow')).toBeVisible({ timeout: 40000 });
  expect((await takes(page)).length).toBe(1);
});

/** 완성본 공통 검사: 10초 · 영상은 원판 그대로(표본 크기가 하나도 다르지 않다 — 화면의 막·글씨가 구워지지 않았다) · 소리 AAC 48kHz 2채널 */
function expectMovieFile(movie, reference) {
  const bytes = Buffer.from(movie, 'base64');
  expect(Math.abs(duration(bytes) - 10)).toBeLessThanOrEqual(0.01);
  const [out, ref] = [tracks(bytes), tracks(reference)];
  const video = out.find((t) => t.handler === 'vide');
  expect(video.codec).toBe('avc1');
  expect(video.sizes).toEqual(ref.find((t) => t.handler === 'vide').sizes);
  expect(out.find((t) => t.handler === 'soun').audio).toEqual({ codec: 'mp4a', channels: 2, sampleRate: 48000 });
}

test('완성본: 목소리는 5.0초 + 0.12초 안팎에 앞·끝을 잃지 않고 들어가 8.5초를 넘지 않으며, 원판 소리는 칸 밖에서 그대로다 · 미리 듣기와 같은 소리·같은 자리', async ({ page }) => {
  const uploads = await captureUpload(page);
  await installSyntheticMic(page, [{ delay: 0.3, dur: 2.7, f0: 300 }]);
  await openSf(page);
  expect(await recordOnce(page)).toMatchObject({ phase: 'recorded', check: 'ok' });
  const preview = (await previews(page)).at(-1);
  const raw = await rawTake(page, 0);
  const movie = await saveAndGetMovie(page, uploads);
  const v = await voiceInMovie(page, movie, 'sf');
  const at = placement(v, raw);
  console.log(JSON.stringify({ raw, preview, movie: v, at }));
  // 말소리는 정지 시각 + 0.12초 안팎 — 앞 여백 0.12초만 남기고 녹음 안의 기다림(0.3초)은 버렸다
  expect(at.lead).toBeGreaterThanOrEqual(leadRange(raw).min);
  expect(at.lead).toBeLessThanOrEqual(leadRange(raw).max);
  // 첫소리·끝소리를 하나도 잃지 않았다(녹음 안 말소리 길이 = 영화 안 말소리 길이)
  expect(Math.abs(at.lost), '말소리 길이').toBeLessThan(0.03);
  // 미리 듣기와 같은 자리에서 들린다
  expect(Math.abs(heardAt(preview) - v.voiceStart)).toBeLessThan(0.02);
  expect(v.voiceEnd).toBeLessThanOrEqual(8.5);
  // 원판 소리는 목소리 칸 밖에서 손대지 않았다(빼면 코덱 차이만 남는다) — 감쇠를 두 번 하지 않는다
  expect(v.outsideVoice).toBeLessThan(0.003);
  // 미리 듣기와 같은 크기(섞은 뒤 리미터가 거의 일하지 않는다)
  expect(Math.abs(20 * Math.log10(v.voicePeak / preview.peak))).toBeLessThan(1);
  expect(v.peak).toBeLessThan(0.92);
  expectMovieFile(movie, originalClip('sf'));
});

// 2026-10-25: 미리 듣기 목소리를 «화면에 나간 첫 그림의 시각»(프레임 콜백)에 맞춰 틀었더니, 그 순간 원판 소리의 시계(currentTime)와 8~21ms 달라
// 미리 듣기가 완성본과 그만큼 어긋났다(위 «완성본 …» 검사의 0.02초를 가끔 넘음). 다듬은 목소리는 구간을 잘라 둔 파일이라 시작 위치 = 영상이 정지 시각을 지나 간 만큼이다.
test('미리 듣기는 원판 소리의 시계(영상 currentTime)에 맞춰 튼다 — 화면 그림 시각이 아니라 · 완성본과 같은 자리', async ({ page }) => {
  const uploads = await captureUpload(page);
  await installSyntheticMic(page, [{ delay: 0.3, dur: 1.5, f0: 300 }]);
  // 엔진을 다 받아 둔 뒤 녹음한다 — 미리 듣기가 다듬은 목소리(처음부터 트는 파일)가 되게
  const engine = page.waitForResponse(/ffmpeg-core\.wasm/).then((r) => r.finished());
  await page.goto('/');
  await page.locator('#splash').waitFor({ state: 'detached' });
  await engine;
  await expect(page.locator('#enginebar')).not.toHaveClass(/show/, { timeout: 30000 });
  await page.getByRole('button', { name: 'SF 더빙 시작', exact: true }).click();
  await expect(page.locator('#clip')).toHaveJSProperty('readyState', 4, { timeout: 20000 });
  const starts = [];
  for (let n = 0; n < 3; n++) {
    if (n) {
      await page.locator('#resetBtn').click();
      await expect(page.locator('#studio')).toHaveAttribute('data-phase', 'idle');
    }
    expect(await recordOnce(page)).toMatchObject({ phase: 'recorded', check: 'ok' });
    const preview = (await previews(page)).at(-1);
    starts.push({ offset: preview.offset, soundtrack: +(preview.videoTime - LIVE_SCENE.pause).toFixed(6) });
    expect(Math.abs(preview.offset - (preview.videoTime - LIVE_SCENE.pause)), JSON.stringify(preview)).toBeLessThan(0.002);
  }
  const preview = (await previews(page)).at(-1);
  const movie = await saveAndGetMovie(page, uploads);
  const v = await voiceInMovie(page, movie, 'sf');
  console.log(JSON.stringify({ starts, heardAt: heardAt(preview), movieVoiceStart: v.voiceStart }));
  expect(Math.abs(heardAt(preview) - v.voiceStart)).toBeLessThan(0.02);
});

test('완성본: 신호 뒤 1.6초에 말해도 그 기다림은 영화에 들어가지 않는다 — 말소리는 정지 시각 + 0.12초 안팎', async ({ page }) => {
  const uploads = await captureUpload(page);
  await installSyntheticMic(page, [{ delay: 1.6, dur: 1.5, f0: 300 }]);
  await openSf(page);
  expect(await recordOnce(page)).toMatchObject({ phase: 'recorded', check: 'ok' });
  const raw = await rawTake(page, 0);
  const v = await voiceInMovie(page, await saveAndGetMovie(page, uploads), 'sf');
  const at = placement(v, raw);
  console.log(JSON.stringify({ raw, movie: v, at }));
  expect(raw.start).toBeGreaterThan(1.3);
  expect(at.lead).toBeGreaterThanOrEqual(leadRange(raw).min);
  expect(at.lead).toBeLessThanOrEqual(leadRange(raw).max);
  expect(Math.abs(at.lost)).toBeLessThan(0.03);
});

test('완성본: 찢어질 만큼 크게 외쳐도 완성본은 −0.7dBFS를 넘지 않는다', async ({ page }) => {
  const uploads = await captureUpload(page);
  await installSyntheticMic(page, [{ delay: 0.2, dur: 2.6, amp: 1.6 }]);
  await openSf(page);
  expect(await recordOnce(page)).toMatchObject({ phase: 'recorded', check: 'ok' });
  const v = await voiceInMovie(page, await saveAndGetMovie(page, uploads), 'sf');
  console.log(JSON.stringify(v));
  expect(v.peak).toBeLessThan(0.92);
  expect(v.voiceEnd).toBeLessThanOrEqual(8.5);
});

test('다시 녹음을 거듭한 뒤 저장하면 마지막 녹음의 목소리만 들어간다', async ({ page }) => {
  const uploads = await captureUpload(page);
  const freqs = [220, 330, 495];
  await installSyntheticMic(page, freqs.map((f0) => ({ delay: 0.3, dur: 1.5, f0 })));
  await openSf(page);
  for (const [i] of freqs.entries()) {
    expect(await recordOnce(page)).toMatchObject({ phase: 'recorded' });
    if (i < freqs.length - 1) await page.locator('#resetBtn').click();
  }
  const v = await voiceInMovie(page, await saveAndGetMovie(page, uploads), 'sf', freqs);
  console.log(JSON.stringify(v.tones));
  expect(v.tones[2]).toBeGreaterThan(20 * v.tones[0]);
  expect(v.tones[2]).toBeGreaterThan(20 * v.tones[1]);
});
