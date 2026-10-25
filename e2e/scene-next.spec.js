// 새 장면(30fps 210번째 프레임 7.000초 정지 · 목소리 칸 3.000초 · 자유 발화 안내) — 대표님이 만드실 새 영상이 오기 전에 시간표가 맞게 도는지 본다(10/25, 정지는 10/26 대표님 FINAL 7.0S).
// 원판 대신 시험용 합성 영상(tools/make-test-scene.mjs → e2e/fixtures/scene-next, 위 1/4에 프레임 번호를 2진수로 새김)을 넘기고,
// 새 시간표는 개발 주소와 미리보기 채널의 ?scenes=next에서만 켜진다(src/lib/sceneMode.ts — 라이브 주소에서는 켜지지 않는다).
//   정지: 정확히 프레임 210(7.000초) 그림에 선다 · 막 22% · 멈춘 순간부터 안내(상황 · 예시 · 보조) · 숫자에도 안내 · 녹음기가 켜진 뒤 «지금 외쳐요 !»
//   예시는 정답이 아니다 — 시험용 마이크의 소리(예시와 전혀 다른 «말»)도 정상으로 녹음 · 합성 · 저장된다(10/26 대표님 자유 발화)
//   완성본: 10초 · 영상은 합성용 원판 그대로(막·글씨가 구워지지 않는다) · 말소리는 정지 + 0.12초 안팎(말이 길면 정지 시각) · 10초 안에서 끝난다
//   3초: 1.0 · 2.5 · 2.9초는 그대로, 정확히 3.0초는 말끝까지 10.0초 안(«들어 보고 정함»), 3초를 넘어 이어지면 저장하지 않고 다시 녹음
import { Buffer } from 'node:buffer';
import { test, expect } from '@playwright/test';
import { installSyntheticMic, previews, rawTake, recordOnce, takes } from './synthetic-mic.js';
import { duration, leadRange, placement, tracks, voiceInMovie } from './movie-check.js';
import { countdownLog, phaseLog, watchCountdown } from './countdown-watch.js';
import { fixture, serve } from './scene-fixture.js';

const PAUSE_FRAME = 210;
const SCENE = { pause: PAUSE_FRAME / 30, window: 10 - PAUSE_FRAME / 30 };
// 발화 상한: 실제로 말할 수 있는 시간 3.000초(칸이 그보다 짧으면 칸) — src/lib/voiceCheck.ts의 maxSpeechFor
const MAX_SPEECH = Math.min(3, SCENE.window);
const GUIDE = { situation: '첫인사를 건네 봐 !', example: '예시안녕 ! 우린 지구에서 왔어 !', free: '내 말로 외쳐도 좋아요 !' };

// 서비스워커가 원판을 가로채면 아래 바꿔치기가 닿지 않는다
test.use({ serviceWorkers: 'block' });
test.describe.configure({ timeout: 240000 });

/**
 * 시험용 새 장면을 SF 원판 자리에 넘겨 녹음실을 연다. query: `?scenes=next`(새 시간표 — 옛 영상 자리라 새 안내 없음)이나
 * `?scenes=final`(개발 주소만 — 새 영상이 들어온 장면으로 보고 자유 발화 안내까지, 10/26)
 */
async function openNextSf(page, plans, query = '?scenes=next') {
  await page.route(/\/clips\/sf\.mp4(\?|$)/, serve('clip.mp4'));
  await page.route(/\/clips\/final\/sf\.mp4(\?|$)/, serve('final.mp4'));
  const uploads = [];
  await page.route('**/voiceCinema/upload', (route) => {
    uploads.push(JSON.parse(route.request().postData()));
    return route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({ ok: true, url: 'https://storage.googleapis.com/fake/scene-next.mp4' }) });
  });
  await installSyntheticMic(page, plans);
  await watchCountdown(page);
  // 부스처럼 엔진을 다 받아 둔 뒤에 녹음한다 — 말을 마친 뒤 다듬기(엔진)까지 포함한 시간을 잰다
  const engine = page.waitForResponse(/ffmpeg-core\.wasm/).then((r) => r.finished());
  await page.goto(`/${query}`);
  await page.locator('#splash').waitFor({ state: 'detached' });
  await engine;
  await expect(page.locator('#enginebar')).not.toHaveClass(/show/, { timeout: 30000 });
  await page.getByRole('button', { name: 'SF 더빙 시작', exact: true }).click();
  await expect(page.locator('#clip')).toHaveJSProperty('readyState', 4, { timeout: 20000 });
  return uploads;
}

/** 영상 요소가 지금 내보내는 그림의 프레임 번호(위 1/4의 2진수 칸)와 아래 회색 */
const frameOf = (page, selector = '#clip') => page.evaluate((selector) => {
  const v = document.querySelector(selector);
  const c = document.createElement('canvas');
  c.width = 160;
  c.height = 90;
  const g = c.getContext('2d');
  g.drawImage(v, 0, 0, 160, 90);
  const row = g.getImageData(0, 11, 160, 1).data;
  let n = 0;
  for (let bit = 0; bit < 10; bit++) if (row[(bit * 16 + 8) * 4] > 128) n += 2 ** bit;
  return { n, gray: g.getImageData(120, 50, 1, 1).data[0], time: v.currentTime, paused: v.paused };
}, selector);

test('프레임 210(7.000초) 그림에 정확히 서고, 막 22%·자유 발화 안내·«지금 외쳐요 !» 뒤 말을 마치면 그 자리부터 이어지며 완성본에는 막이 없다', async ({ page }) => {
  // 새 영상이 들어온 장면(?scenes=final)으로 본다 — 안내는 새 영상에만 붙는다(옛 영상 위 ?scenes=next에는 없다, e2e/scene-guide.spec.js)
  const uploads = await openNextSf(page, [{ delay: 0.3, dur: 1.8, f0: 300 }], '?scenes=final');
  // 정지 전: 새 장면에는 상대 대사 자막이 없다
  const reference = await frameOf(page);
  await page.locator('#recBtn').click();
  await expect.poll(() => page.locator('#clip').evaluate((v) => v.currentTime), { timeout: 10000 }).toBeGreaterThan(2);
  await expect(page.locator('[data-testid="scene-caption"]')).toHaveCount(0);

  // 정지: 숫자가 도는 동안 영상은 정확히 프레임 210(7.000초)에 서 있다
  await expect(page.locator('#studio')).toHaveAttribute('data-phase', 'countdown', { timeout: 15000 });
  const still = await frameOf(page);
  console.log(JSON.stringify({ reference, still }));
  expect(still).toMatchObject({ n: PAUSE_FRAME, paused: true });
  expect(still.time).toBeCloseTo(SCENE.pause, 3);

  // 녹음이 끝나 녹음 뒤 화면으로 돌아올 때까지(«장면 시작»은 위에서 눌렀다)
  await page.waitForFunction(() => window.__mic.takes[0]?.stoppedAt && document.querySelector('#studio')?.dataset.phase === 'recorded', null, { timeout: 40000 });
  const r = { phase: 'recorded', check: await page.locator('#hint').getAttribute('data-take-check') };
  const log = await countdownLog(page);
  expect(log.map((e) => e.key)).toEqual(['cue', '3초 뒤 녹음 시작', '2초 뒤 녹음 시작', '1초 뒤 녹음 시작', 'recording']);
  expect(log[0].text).toContain('이제 당신의 차례입니다 !');
  for (const entry of log) {
    expect(entry, entry.key).toMatchObject({ paused: true, time: Math.round(SCENE.pause * 10) / 10, inViewport: true, ...GUIDE });
  }
  for (const entry of log.slice(1, 4)) expect(entry.ready, entry.key).toContain(GUIDE.situation);
  for (const entry of log.slice(1)) expect(entry.shade, entry.key).toBeCloseTo(0.22, 2);
  expect(log[4].shout).toBe('지금 외쳐요 !');

  expect(r.phase).toBe('recorded');
  expect(r.check).toBe('ok');
  // 말을 마친 뒤 장면이 이어지기까지: 말끝 기다림(0.6초) + 녹음 검사·다듬기
  const phases = await phaseLog(page);
  const when = (p) => phases.find((x) => x.phase === p)?.at;
  const timing = { recordingMs: Math.round(when('checking') - when('recording')), checkingMs: Math.round(when('continuing') - when('checking')) };
  console.log(JSON.stringify({ phases: phases.map((x) => x.phase), timing }));
  expect(timing.checkingMs).toBeLessThan(2600);
  // 미리 듣기: 영상이 정지 그림을 내보내는 순간에 틀고, 말소리는 정지 + 0.12초 안팎에 들린다
  const preview = (await previews(page)).at(-1);
  const raw = await rawTake(page, 0);
  const range = leadRange(raw);
  expect(preview.videoTime).toBeGreaterThanOrEqual(SCENE.pause - 0.01);
  const heard = preview.videoTime + preview.onset - preview.offset - SCENE.pause;
  expect(heard, JSON.stringify({ preview, raw })).toBeGreaterThanOrEqual(range.min - 0.01);
  expect(heard).toBeLessThanOrEqual(range.max + 0.01);
  await expect(page.locator('.studio-hold-shade')).toHaveCSS('opacity', '0');

  // 완성본
  await page.locator('#saveBtn').click();
  await expect(page.locator('#qrbox')).toBeVisible({ timeout: 90000 });
  const movie = uploads.at(-1).dataBase64;
  const v = await voiceInMovie(page, movie, 'sf', [], SCENE);
  const at = placement(v, raw, SCENE);
  console.log(JSON.stringify({ raw, preview, movie: v, at }));
  expect(at.lead).toBeGreaterThanOrEqual(range.min);
  expect(at.lead).toBeLessThanOrEqual(range.max);
  expect(Math.abs(at.lost)).toBeLessThan(0.03);
  expect(v.voiceEnd).toBeLessThanOrEqual(10);
  expect(v.outsideVoice).toBeLessThan(0.003);
  const bytes = Buffer.from(movie, 'base64');
  expect(Math.abs(duration(bytes) - 10)).toBeLessThanOrEqual(0.001); // 10.000초 — 10초를 넘지 않는다(10/26, 전에는 소리 트랙이 10.005초)
  const out = tracks(bytes);
  expect(out.find((t) => t.handler === 'vide').codec).toBe('avc1');
  expect(out.find((t) => t.handler === 'vide').sizes).toEqual(tracks(fixture('final.mp4')).find((t) => t.handler === 'vide').sizes);
  expect(out.find((t) => t.handler === 'soun').audio).toEqual({ codec: 'mp4a', channels: 2, sampleRate: 48000 });
  // 완성본 7.5초 그림: 프레임 225, 회색은 원판 그대로(막 22%가 구워졌다면 약 101)
  await page.evaluate(async (b64) => {
    const v = document.createElement('video');
    v.id = 'movieCheck';
    v.muted = true;
    v.src = window.URL.createObjectURL(new window.Blob([Uint8Array.from(window.atob(b64), (c) => c.charCodeAt(0))], { type: 'video/mp4' }));
    document.body.append(v);
    await new Promise((resolve) => v.addEventListener('loadeddata', resolve, { once: true }));
    v.currentTime = 7.5 + 1 / 60;
    await new Promise((resolve) => v.addEventListener('seeked', resolve, { once: true }));
  }, movie);
  const baked = await frameOf(page, '#movieCheck');
  console.log(JSON.stringify({ baked }));
  expect(baked.n).toBe(225);
  expect(Math.abs(baked.gray - reference.gray)).toBeLessThanOrEqual(3);
});

test('새 장면: 말이 3초를 넘어 이어지면 말 시작 뒤 3.08초 남짓에 멈추고 저장하지 않는다 — 다시 녹음', async ({ page }) => {
  await openNextSf(page, [{ delay: 0.2, dur: 4 }]);
  const r = await recordOnce(page);
  expect(r).toMatchObject({ phase: 'idle', check: 'cut' });
  expect(r.hint).toContain('말이 3초를 넘어 끝이 잘렸어요');
  const raw = await rawTake(page, 0);
  // 앱이 멈추기로 한 때: 말 시작(예약 0.2초) + 발화 상한 3.000초 + 측정 여유 0.08초
  const { stopAt } = (await takes(page))[0];
  expect(MAX_SPEECH).toBe(3);
  expect(stopAt, JSON.stringify(raw)).toBeGreaterThanOrEqual(0.2 + MAX_SPEECH + 0.08 - 0.02);
  expect(stopAt).toBeLessThan(0.2 + MAX_SPEECH + 0.08 + 0.35);
  await expect(page.locator('#saveBtn')).toHaveCount(0);
  await expect(page.locator('#clip')).toHaveJSProperty('paused', true);
});

// 3초 경계(10/26 대표님 «1.0 · 1.8 · 2.5 · 2.9초와 3초 경계를 시험») — 1.8초는 위 첫 시험이 본다. 잰 값은 로그(JSON)로 남긴다.
for (const [dur, check] of [[1, 'ok'], [2.5, 'ok'], [2.9, 'ok'], [3, 'edge']]) {
  test(`새 장면 ${dur}초 발화: 말끝 0.6초 뒤에 멈추고 «${check}», 완성본에 마지막 말소리까지 10.0초 안에 다 들어간다`, async ({ page }) => {
    const uploads = await openNextSf(page, [{ delay: 0.3, dur }]);
    const r = await recordOnce(page);
    expect(r, JSON.stringify(r)).toMatchObject({ phase: 'recorded', check });
    const { stopAt } = (await takes(page))[0];
    expect(stopAt).toBeGreaterThanOrEqual(0.3 + dur + 0.6 - 0.02);
    expect(stopAt).toBeLessThan(0.3 + dur + 0.6 + 0.35);
    const raw = await rawTake(page, 0);
    const preview = (await previews(page)).at(-1);
    const heard = preview.videoTime + preview.onset - preview.offset - SCENE.pause;
    await page.locator('#saveBtn').click();
    await expect(page.locator('#qrbox')).toBeVisible({ timeout: 90000 });
    const movie = uploads.at(-1).dataBase64;
    const v = await voiceInMovie(page, movie, 'sf', [], SCENE);
    const at = placement(v, raw, SCENE);
    console.log(JSON.stringify({ dur, check: r.check, stopAt, speech: +(raw.end - raw.start).toFixed(3), previewLead: +heard.toFixed(3),
      lead: at.lead, lost: at.lost, voiceEnd: v.voiceEnd, movieSeconds: duration(Buffer.from(movie, 'base64')) }));
    // 말소리는 정지 시각 + 0.12초 안팎(말이 길면 정지 시각 — 정확히 3초면 칸 경계만큼 앞), 미리 듣기와 완성본이 같은 자리
    expect(at.lead).toBeGreaterThanOrEqual(-0.045);
    expect(at.lead).toBeLessThanOrEqual(leadRange(raw).max);
    expect(Math.abs(heard - at.lead), JSON.stringify({ preview, raw, at })).toBeLessThan(0.02);
    // 마지막 말소리를 잃지 않았고(앞·끝을 잃었으면 lost가 커진다) 10.0초 안에서 끝난다
    expect(Math.abs(at.lost)).toBeLessThan(0.03);
    expect(v.voiceEnd).toBeLessThanOrEqual(10);
    expect(v.outsideVoice).toBeLessThan(0.003);
    expect(Math.abs(duration(Buffer.from(movie, 'base64')) - 10)).toBeLessThanOrEqual(0.001);
    // 소리 트랙 자체가 10.000초(480,000표본)여야 한다 — 파일 머리(mvhd)는 영상 트랙을 따라 10.000초여도, 목소리가 원판 끝 21ms 안에서 끝나면
    // 엔진의 섞기가 소리를 목소리 끝에서 끊어 9.995~9.999초가 됐다(10/26 미리보기 3.0초 녹음)
    expect(v.seconds, '완성본 소리 트랙 길이').toBe(10);
  });
}
