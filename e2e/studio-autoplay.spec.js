import { test, expect } from '@playwright/test';
import { pauseScenes } from './pause-scenes.js';
import { watchCountdown, countdownLog } from './countdown-watch.js';

// 녹음실 자동 재생(11/7 Bumm님 «누르고 들어가면 바로 영상 재생 … 소리도 나오고 … 멈추고 321은 빼고 … 문구만 주고 그냥 쭉 멈춤없이 지나가게 해서 아 ~ 하게»):
// «더빙하기»를 누르면 장면이 처음부터 끝까지 소리와 함께 흐르고, 아이 대사 구간에는 문구만 나온다. 끝나면 준비 화면이다. «장면 시작» 뒤의 녹음은 그대로 멈춤·3·2·1이다.
// 소리는 브라우저가 «누름 안에서 부른 play()»에만 허용하므로(아이폰이 가장 엄격하다) 그 순서를 페이지 안에서 기록해 본다.
const CUE = '당신의 목소리가 들어갈 자리예요 !';

const state = (page) => page.locator('#clip').evaluate((v) => ({ paused: v.paused, muted: v.muted, time: v.currentTime }));
const phase = (page) => page.locator('#studio');

// 재생 호출이 어느 이벤트 안에서 일어났는지, 대사 구간 문구·멈춤·녹음 신호를 프레임마다 남긴다(짧게 있다 사라지는 것은 Node 쪽 확인으로 잡지 못한다).
async function recordFrames(page) {
  await page.addInitScript(() => {
    window.__plays = [];
    const play = window.HTMLMediaElement.prototype.play;
    window.HTMLMediaElement.prototype.play = function () {
      if (this.id === 'clip') window.__plays.push({ event: window.event?.type ?? null, muted: this.muted });
      return play.call(this);
    };
    window.__mic = 0;
    const getUserMedia = navigator.mediaDevices.getUserMedia.bind(navigator.mediaDevices);
    navigator.mediaDevices.getUserMedia = (c) => { window.__mic += 1; return getUserMedia(c); };
    window.__frames = [];
    const tick = () => {
      const v = document.querySelector('#clip');
      if (v && document.querySelector('#studio')?.dataset.phase === 'previewing') {
        const shade = document.querySelector('.studio-pause-shade');
        window.__frames.push({ time: v.currentTime, paused: v.paused, muted: v.muted,
          cue: document.querySelector('.scene-turn-cue')?.textContent ?? null,
          turnOverlay: !!document.querySelector('#overlay, #cue, #count, #recpill'),
          shade: shade ? Number(getComputedStyle(shade).opacity) : 0 });
      }
      requestAnimationFrame(tick);
    };
    requestAnimationFrame(tick);
  });
}

const enter = async (page, name = 'SF') => {
  await page.goto('/');
  await page.locator('#splash').waitFor({ state: 'detached' });
  await page.getByRole('button', { name: `${name} 더빙 시작`, exact: true }).click();
};

test('누르면 그 누름 안에서 소리를 켠 채 재생을 부르고, 멈춤·3·2·1·어두운 막 없이 끝까지 흐른 뒤 준비 화면으로 돌아온다', async ({ page }) => {
  test.setTimeout(45000);
  await recordFrames(page);
  await enter(page);
  await expect(phase(page)).toHaveAttribute('data-phase', 'previewing');
  // 아이폰이 소리를 허용하는 조건 — 누름과 같은 호출, 소리 켠 상태
  expect(await page.evaluate(() => window.__plays)).toEqual([{ event: 'click', muted: false }]);
  await expect(page.locator('.controls h2')).toHaveText('먼저 장면을 한 번 봐요');

  // 소리가 실제로 나는지 — 세션 쪽은 브라우저를 음소거해 두었으므로 스피커가 아니라 영상의 소리 신호를 잰다
  const energy = await page.locator('#clip').evaluate(async (video) => {
    const context = new window.AudioContext();
    await context.resume();
    const analyser = context.createAnalyser();
    context.createMediaElementSource(video).connect(analyser);
    const output = context.createGain();
    output.gain.value = 0;
    analyser.connect(output).connect(context.destination);
    const samples = new Float32Array(analyser.fftSize);
    let peak = 0;
    const end = performance.now() + 2000;
    while (performance.now() < end) {
      analyser.getFloatTimeDomainData(samples);
      for (const sample of samples) peak = Math.max(peak, Math.abs(sample));
      await new Promise((r) => window.setTimeout(r, 50));
    }
    return peak;
  });
  expect(energy).toBeGreaterThan(.005);

  await expect(phase(page)).toHaveAttribute('data-phase', 'idle', { timeout: 15000 });
  const frames = await page.evaluate(() => window.__frames);
  const playing = frames.filter((f) => f.time > 0);
  // 끝까지 흘렀다 — 뒤의 프레임이 10초 근처이고, 처음에서 끝까지 한 번도 멈추지 않았다
  expect(playing.at(-1).time).toBeGreaterThan(9.5);
  expect(playing.filter((f) => f.paused && f.time < 9.5)).toEqual([]);
  expect(playing.every((f) => !f.muted)).toBe(true);
  // 5.0초에서 멈추지 않았다 — 앞뒤 프레임 시각이 끊기지 않는다
  const around = playing.filter((f) => f.time > 4.8 && f.time < 5.5);
  expect(around.length).toBeGreaterThan(5);
  // 3·2·1·문구·녹음 표시·어두운 막이 한 번도 나오지 않았다
  expect(frames.filter((f) => f.turnOverlay)).toEqual([]);
  expect(frames.filter((f) => f.shade > .01)).toEqual([]);
  // 문구는 대사 구간(5.0~8.5초)에만 나온다
  const cued = frames.filter((f) => f.cue);
  expect(cued[0].cue).toBe(CUE);
  expect(cued[0].time).toBeGreaterThan(4.9);
  expect(cued[0].time).toBeLessThan(5.2);
  expect(cued.at(-1).time).toBeLessThan(8.6);
  expect(cued.at(-1).time).toBeGreaterThan(8.2);
  // 마이크를 열지 않았다
  expect(await page.evaluate(() => window.__mic)).toBe(0);

  // 준비 화면: 처음으로 돌아와 소리가 꺼져 있고 문구가 없다
  await expect(page.locator('.controls h2')).toHaveText('준비됐나요 ?');
  expect(await state(page)).toMatchObject({ paused: true, muted: true, time: 0 });
  await expect(page.locator('.scene-turn-cue')).toHaveCount(0);
  await expect(page.locator('#previewBtn')).toHaveText('미리보기');
});

test('화면 가운데 큰 재생 단추는 없고, 주 단추는 «장면 시작» 하나이며 «미리보기»는 그보다 작다', async ({ page }) => {
  await page.setViewportSize({ width: 1366, height: 768 });
  await enter(page);
  await expect(page.locator('#screenPlaybackBtn')).toHaveCount(0);
  await expect(page.locator('.studio-screen-playback')).toHaveCount(0);
  await page.locator('#previewBtn').click();
  await expect(phase(page)).toHaveAttribute('data-phase', 'idle');
  await expect(page.locator('#screenPlaybackBtn')).toHaveCount(0);
  const [small, main] = await Promise.all([page.locator('#previewBtn').boundingBox(), page.locator('#recBtn').boundingBox()]);
  expect(small.height).toBeGreaterThanOrEqual(44);
  expect(small.height).toBeLessThan(main.height);
  expect(small.width).toBeLessThan(main.width);
});

for (const [id, name] of [['sf', 'SF'], ['fantasy', '판타지'], ['animation', '애니메이션'], ['hero', '히어로'], ['thriller', '스릴러'], ['drama', '드라마'], ['sports', '스포츠'], ['musical', '뮤지컬']]) {
  test(`${name}: 대사 구간 문구는 그 장면의 구간에서만 나오고 영상을 멈추지 않는다`, async ({ page }) => {
    await page.goto('/');
    await page.locator('#splash').waitFor({ state: 'detached' });
    await pauseScenes(page);
    await page.locator(`.scene-choice[data-genre="${id}"]`).click();
    await expect(phase(page)).toHaveAttribute('data-phase', 'previewing');
    const clip = page.locator('#clip');
    const cue = page.locator('.scene-turn-cue');
    await expect.poll(async () => (await state(page)).time).toBeGreaterThan(.2);
    await clip.evaluate((v) => { v.currentTime = 4.5; });
    await expect(cue).toHaveCount(0);
    await clip.evaluate((v) => { v.currentTime = 5.1; });
    await expect(cue).toHaveText(CUE);
    expect((await state(page)).paused).toBe(false);
    await clip.evaluate((v) => { v.currentTime = 8.6; });
    await expect(cue).toHaveCount(0);
  });
}

test('재생 중에 «장면 시작»을 누르면 재생을 끊고 처음부터 멈춤·3·2·1·녹음으로 간다', async ({ page }) => {
  test.setTimeout(45000);
  await watchCountdown(page);
  await enter(page);
  await expect.poll(async () => (await state(page)).time).toBeGreaterThan(1);
  await page.locator('#recBtn').click();
  await expect(phase(page)).toHaveAttribute('data-phase', /requesting|watching/);
  await expect(page.locator('#previewBtn')).toHaveCount(0);
  await expect(page.locator('.scene-turn-cue')).toHaveCount(0);
  await expect(phase(page)).toHaveAttribute('data-phase', 'watching');
  expect((await state(page)).time).toBeLessThan(1);
  await expect(page.locator('#recpill')).toBeVisible({ timeout: 12000 });
  const keys = (await countdownLog(page)).map((entry) => entry.key);
  expect(keys[0]).toBe('cue');
  expect(keys.filter((key) => /초 뒤 녹음 시작/.test(key)).length).toBe(3);
  expect(keys.at(-1)).toBe('recording');
  await expect(page.locator('#clip')).toHaveJSProperty('paused', true);
  // 녹음 흐름에는 대사 구간 문구가 나오지 않는다
  await expect(page.locator('.scene-turn-cue')).toHaveCount(0);
});

test('다시 녹음이나 저장 뒤 돌아올 때는 저절로 재생하지 않고, 새로 들어가면 다시 재생한다', async ({ page }) => {
  test.setTimeout(120000);
  await page.route('**/voiceCinema/upload', (route) => route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({ ok: true, url: 'https://storage.googleapis.com/fake/dub_e2e.mp4' }) }));
  await recordFrames(page);
  await enter(page);
  const plays = () => page.evaluate(() => window.__plays.length);
  await page.locator('#recBtn').click();
  await expect(page.locator('#afterRow')).toBeVisible({ timeout: 40000 });

  await page.locator('#resetBtn').click();
  await expect(phase(page)).toHaveAttribute('data-phase', 'idle');
  const afterRetry = await plays();
  await page.waitForTimeout(800);
  expect(await plays()).toBe(afterRetry);
  expect(await state(page)).toMatchObject({ paused: true, muted: true, time: 0 });

  await page.locator('#recBtn').click();
  await expect(page.locator('#afterRow')).toBeVisible({ timeout: 40000 });
  await page.locator('#saveBtn').click();
  await expect(page.locator('#result')).toHaveClass(/active/);
  await page.locator('#result.active .qrbox img').waitFor({ state: 'visible', timeout: 180000 });
  const beforeBack = await plays();
  await page.goBack();
  await expect(page.locator('#studio')).toHaveClass(/active/);
  await page.waitForTimeout(800);
  expect(await plays()).toBe(beforeBack);
  await expect(page.locator('#clip')).toHaveJSProperty('paused', true);

  // 다른 더빙은 새 누름이다 — 다시 처음부터 소리와 함께 흐른다
  await page.locator('.back').click();
  await expect(page.locator('#home')).toHaveClass(/active/);
  await page.getByRole('button', { name: 'SF 더빙 시작', exact: true }).click();
  await expect(phase(page)).toHaveAttribute('data-phase', 'previewing');
  await expect.poll(async () => (await state(page)).time).toBeGreaterThan(.2);
  expect((await state(page)).muted).toBe(false);
});

test('재생 중에 «다른 영화 고르기»로 나가면 소리가 바로 멎고, 뒤로·앞으로 돌아온 녹음실은 저절로 재생하지 않는다', async ({ page }) => {
  await recordFrames(page);
  await enter(page);
  await expect.poll(async () => (await state(page)).time).toBeGreaterThan(.3);
  await page.locator('#clip').evaluate((v) => { window.__previous = v; });
  // 재생이 끝나기(10초)를 기다렸다 눌러도 통과하면 안 된다 — 재생하는 동안 바로 눌려야 한다
  await page.locator('#studioBackBtn').click({ timeout: 3000 });
  await expect(page.locator('#home')).toHaveClass(/active/);
  expect(await page.evaluate(() => window.__previous.paused)).toBe(true);
  const count = await page.evaluate(() => window.__plays.length);
  await page.goForward();
  await expect(page.locator('#studio')).toHaveClass(/active/);
  await expect(phase(page)).toHaveAttribute('data-phase', 'idle');
  await page.waitForTimeout(500);
  expect(await page.evaluate(() => window.__plays.length)).toBe(count);
  await expect(page.locator('#clip')).toHaveJSProperty('paused', true);
});

test('재생 자체를 못 하면 준비 화면에 그렇게 알리고 «장면 시작»을 쓸 수 있다', async ({ page }) => {
  await page.addInitScript(() => {
    window.HTMLMediaElement.prototype.play = function () { return this.id === 'clip' ? Promise.reject(new window.DOMException('막힘', 'NotAllowedError')) : Promise.resolve(); };
  });
  await enter(page);
  await expect(phase(page)).toHaveAttribute('data-phase', 'idle');
  await expect(page.locator('#hint')).toHaveText('영상을 재생하지 못했어요. 미리보기를 다시 눌러 주세요.');
  await expect(page.locator('#soundOnBtn')).toHaveCount(0);
  await expect(page.locator('#recBtn')).toBeEnabled();
});

for (const [width, height] of [[360, 640], [390, 664]]) {
  test(`휴대폰 ${width}×${height}: 재생 중과 준비 화면의 영상·단추 자리가 같고, 안내는 두 줄 안이며 문구는 영상 안에 든다`, async ({ page }) => {
    await page.setViewportSize({ width, height });
    await page.goto('/');
    await page.locator('#splash').waitFor({ state: 'detached' });
    await pauseScenes(page);
    await page.locator('.scene-choice[data-genre="musical"]').click();
    await expect(page.locator('.studio-video-frame')).not.toHaveClass(/is-entering/);
    const places = () => page.evaluate(() => {
      const box = (sel) => { const r = document.querySelector(sel).getBoundingClientRect(); return { x: Math.round(r.x), y: Math.round(r.y), w: Math.round(r.width), h: Math.round(r.height) }; };
      return { frame: box('.studio-video-frame'), rec: box('#recBtn'), hint: box('#hint') };
    });
    const hintLines = () => page.locator('#hint').evaluate((el) => {
      const range = document.createRange();
      range.selectNodeContents(el);
      return new Set([...range.getClientRects()].map((r) => Math.round(r.top))).size;
    });
    const during = await places();
    expect(await hintLines()).toBeLessThanOrEqual(2);
    expect(await page.evaluate(() => document.scrollingElement.scrollHeight - window.innerHeight)).toBe(0);

    await page.locator('#clip').evaluate((v) => { v.currentTime = 5.2; });
    const cue = page.locator('.scene-turn-cue');
    await expect(cue).toHaveText(CUE);
    const inside = await page.evaluate(() => {
      const c = document.querySelector('.scene-turn-cue').getBoundingClientRect();
      const v = document.querySelector('.studio-video-frame').getBoundingClientRect();
      return { left: c.left >= v.left, right: c.right <= v.right, top: c.top >= v.top, bottom: c.bottom <= v.bottom, lines: c.height };
    });
    expect(inside).toMatchObject({ left: true, right: true, top: true, bottom: true });

    await page.locator('#previewBtn').click();
    await expect(phase(page)).toHaveAttribute('data-phase', 'idle');
    expect(await places()).toEqual(during);
  });
}
