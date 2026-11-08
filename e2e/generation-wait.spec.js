import { test, expect } from '@playwright/test';

// 저장 대기 화면 — Poster Studio의 로딩 화면(영상 12종 · 문구)을 그대로 옮겼다(11/9 Bumm님 «로딩 화면 포스터에서 갖다가 쓰라니까»).
// 정지 그림을 먼저 보이고 영상이 재생되면 영상으로 넘긴다. 소리 없이 한 번만 튼다. 영상 한 편은 끝까지 튼 뒤 다음 장면으로 넘어가고,
// 결과가 영상 한 편 재생 도중에 준비되면 그 편이 끝난 뒤에 결과 화면을 보인다
// (Bumm님 «중간에 자르지말고 하나당 재생시간 지켜서 … 2개하고 3번째꺼 빨리끊지말고 이왕 틀던건 다 고대로 보여주고 결과 보여줘라»).
const UPLOAD_PATTERN = '**/voiceCinema/upload';

async function reachSave(page, gate, afterBoot = async () => {}) {
  await page.route(UPLOAD_PATTERN, async (route) => {
    // 합성이 끝나 올리기를 시작한 때(페이지 시계)
    await page.evaluate(() => { if (window.__wait && window.__wait.uploadAt === null) window.__wait.uploadAt = performance.now(); }).catch(() => {});
    await gate;
    await route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({ ok: true, url: 'https://storage.googleapis.com/fake/dub_wait.mp4' }) });
  });
  await page.goto('/');
  await page.locator('#splash').waitFor({ state: 'detached' });
  await afterBoot();
  await page.locator('.tile', { hasText: 'SF' }).first().click();
  await page.locator('#recBtn').click();
  await expect(page.locator('#afterRow')).toBeVisible({ timeout: 40000 });
  // 대기 화면이 뜨는 순간과 영상마다 «보이기 시작 · 끝남 · 떼어 냄», 결과 화면이 뜬 때를 페이지 안에서 적는다(Node 쪽 확인은 늦게 잡힌다)
  await page.evaluate(() => {
    const log = { opened: null, videos: [], qrAt: null, saveAt: null, uploadAt: null, scenes: [] };
    window.__wait = log;
    document.addEventListener('click', (event) => {
      if (event.target?.closest?.('#saveBtn') && log.saveAt === null) log.saveAt = performance.now();
    }, true);
    const watched = new WeakSet();
    const watch = (v) => {
      if (watched.has(v)) return;
      watched.add(v);
      const entry = { shownAt: null, endedAt: null };
      log.videos.push(entry);
      new MutationObserver(() => { if (v.dataset.active === 'true' && entry.shownAt === null) entry.shownAt = performance.now(); })
        .observe(v, { attributes: true, attributeFilter: ['data-active'] });
      v.addEventListener('ended', () => { entry.endedAt = performance.now(); });
    };
    new MutationObserver(() => {
      const dialog = document.querySelector('#loading');
      if (dialog && !log.opened) {
        log.opened = {
          still: dialog.querySelector('img.generation-robot-still')?.dataset.active,
          video: dialog.querySelector('video.generation-robot-video')?.dataset.active ?? null,
        };
      }
      dialog?.querySelectorAll('video.generation-robot-video').forEach(watch);
      const scene = dialog?.dataset.scene;
      if (scene !== undefined && log.scenes.at(-1)?.scene !== scene) log.scenes.push({ scene, at: performance.now() });
      if (document.querySelector('#qrbox') && log.qrAt === null) log.qrAt = performance.now();
    }).observe(document.body, { childList: true, subtree: true, attributes: true, attributeFilter: ['data-scene'] });
  });
  await page.locator('#saveBtn').click();
}

// 결과 화면 전에 대기 장면 두 편은 끝까지 본다(11/9 Bumm님 «보이스 기본 8.4초니까 2개는 로딩영상이 재생되게 해 그게 최소», 팀장 전달).
// 합성 · 올리기가 1초도 안 걸려도(이 시험은 올리기를 곧바로 답한다) 결과는 둘째 영상이 끝난 뒤에 뜨고, 셋째 편은 시작하지 않는다.
test('빠른 합성 · 올리기에서도 결과는 대기 영상 두 편이 끝난 뒤에 — 셋째 편은 시작하지 않는다', async ({ page }, testInfo) => {
  test.setTimeout(150000);
  await page.setViewportSize({ width: 1440, height: 900 });
  await reachSave(page, Promise.resolve());
  await expect(page.locator('#loading')).toBeVisible();
  await expect(page.locator('#qrbox')).toBeVisible({ timeout: 60000 });
  const log = await page.evaluate(() => window.__wait);
  const shown = log.videos.filter((entry) => entry.shownAt !== null);
  expect(shown.length, '대기 영상은 두 편만 보였다').toBe(2);
  for (const [index, entry] of shown.entries()) expect(entry.endedAt, `${index + 1}번째 영상을 끝까지 틀었다`).not.toBeNull();
  expect(log.scenes.map((entry) => entry.scene), '장면은 0 → 1까지만').toEqual(['0', '1']);
  expect(shown[1].shownAt, '둘째 영상은 첫 영상이 끝난 뒤에 시작했다').toBeGreaterThanOrEqual(shown[0].endedAt);
  expect(log.uploadAt, '합성은 첫 영상이 끝나기 전에 끝났다').toBeLessThan(shown[0].endedAt);
  expect(log.qrAt, '결과 화면은 둘째 영상이 끝난 뒤에').toBeGreaterThanOrEqual(shown[1].endedAt);
  expect(log.qrAt - shown[1].endedAt, '끝나면 곧바로 결과를 보인다').toBeLessThan(1500);
  const s = (ms) => Math.round(ms) / 1000;
  const numbers = {
    합성: s(log.uploadAt - log.saveAt),
    첫영상시작: s(shown[0].shownAt - log.saveAt),
    첫영상끝: s(shown[0].endedAt - log.saveAt),
    둘째영상시작: s(shown[1].shownAt - log.saveAt),
    둘째영상끝: s(shown[1].endedAt - log.saveAt),
    결과: s(log.qrAt - log.saveAt),
    둘째끝에서결과까지: s(log.qrAt - shown[1].endedAt),
  };
  await testInfo.attach('wait-timing.json', { body: JSON.stringify(numbers), contentType: 'application/json' });
  console.log('[대기 화면 시각, 저장 누른 때부터 초]', JSON.stringify(numbers));
});

// 두 편은 시간이 아니라 «영상이 끝났는가»로 센다 — 대기 영상이 늦게 오면 결과도 그만큼 뒤로 밀린다(팀장 전달 «2편 하한은 영상이 화면에 실제로 뜬 때부터»).
test('대기 영상이 늦게 뜨면 결과도 그만큼 늦게 — 두 편이 화면에서 끝까지 돈 뒤에', async ({ page }) => {
  test.setTimeout(150000);
  await page.setViewportSize({ width: 1440, height: 900 });
  // 대기 영상 응답을 2.5초씩 늦춘다(정지 그림으로 바꾸는 4초 정체 한도 안)
  await page.route('**/waiting-v3/*.mp4', async (route) => {
    await page.waitForTimeout(2_500);
    await route.continue();
  });
  await reachSave(page, Promise.resolve());
  await expect(page.locator('#qrbox')).toBeVisible({ timeout: 60000 });
  const log = await page.evaluate(() => window.__wait);
  const shown = log.videos.filter((entry) => entry.shownAt !== null);
  expect(shown.length, '대기 영상은 두 편만 보였다').toBe(2);
  expect(shown[0].shownAt - log.saveAt, '첫 영상은 늦게 떴다').toBeGreaterThan(2_400);
  for (const [index, entry] of shown.entries()) expect(entry.endedAt, `${index + 1}번째 영상을 끝까지 틀었다`).not.toBeNull();
  expect(log.qrAt, '결과 화면은 둘째 영상이 끝난 뒤에').toBeGreaterThanOrEqual(shown[1].endedAt);
  expect(log.qrAt - shown[0].shownAt, '첫 영상이 뜬 때부터 두 편(16초) 넘게').toBeGreaterThan(15_900);
  console.log('[늦게 뜬 대기 영상, 저장 누른 때부터 초]', JSON.stringify({
    첫영상시작: Math.round(shown[0].shownAt - log.saveAt) / 1000,
    둘째영상시작: Math.round(shown[1].shownAt - log.saveAt) / 1000,
    결과: Math.round(log.qrAt - log.saveAt) / 1000,
  }));
});

test('정지 그림 → 영상(소리 없이 한 번) · 영상 두 편을 끝까지 튼 뒤 셋째 편 도중에 준비된 결과는 그 편이 끝난 뒤에', async ({ page }) => {
  test.setTimeout(150000);
  await page.setViewportSize({ width: 1440, height: 900 });
  let release;
  const gate = new Promise((resolve) => { release = resolve; });
  await reachSave(page, gate);

  const wait = page.locator('#loading');
  await expect(wait).toBeVisible();
  // 대기 화면은 흰 전체 화면이고 제목 · 영화 상식이 보인다
  expect(await wait.evaluate((el) => getComputedStyle(el).backgroundColor)).toBe('rgb(255, 255, 255)');
  await expect(wait.locator('#generationTitle [data-active="true"]')).not.toBeEmpty();
  await expect(wait.locator('.movie-fact h2[data-active="true"]')).not.toBeEmpty();
  // 12편 모두 돈다 — 2번 «AI가 당신의 영화를 그리고 있어요»도 그대로(11/9 Bumm님 «로딩 영상 12종하고 문구랑 다 그대로», 팀장 결정 전달)
  await expect(wait.locator('#generationTitle .generation-copy')).toHaveCount(12);
  await expect(wait.locator('#generationTitle')).toContainText('AI가 당신의 영화를 그리고 있어요');
  const opened = await page.evaluate(() => window.__wait.opened);
  expect(opened, '처음에는 정지 그림이 보이고 영상은 아직 숨어 있다').toEqual({ still: 'true', video: 'false' });

  const video = wait.locator('video.generation-robot-video[data-active="true"]');
  await expect(video).toHaveCount(1, { timeout: 10000 });
  expect(await video.evaluate((v) => ({ muted: v.muted, loop: v.loop }))).toEqual({ muted: true, loop: false });
  // 영상이 보이면 정지 그림은 숨는다
  await expect(wait.locator('img.generation-robot-still')).toHaveAttribute('data-active', 'false');

  // 셋째 장면 영상이 1초 넘게 돈 때 결과를 준비시킨다
  await expect(wait).toHaveAttribute('data-scene', '2', { timeout: 30000 });
  await expect.poll(() => page.evaluate(() => document.querySelector('#loading video[data-active="true"]')?.currentTime ?? 0), { timeout: 10000 }).toBeGreaterThan(1);
  const left = await page.evaluate(() => {
    const v = document.querySelector('#loading video[data-active="true"]');
    return v.duration - v.currentTime;
  });
  expect(left, '결과가 영상 도중에 준비됐다').toBeGreaterThan(1);
  release();
  await expect(page.locator('#qrbox')).toBeVisible({ timeout: 30000 });

  const log = await page.evaluate(() => window.__wait);
  const shown = log.videos.filter((entry) => entry.shownAt !== null);
  expect(shown.length, '영상 세 편이 보였다').toBeGreaterThanOrEqual(3);
  for (const [index, entry] of shown.slice(0, 3).entries()) {
    expect(entry.endedAt, `${index + 1}번째 영상을 끝까지 틀었다`).not.toBeNull();
  }
  const third = shown[2];
  expect(log.qrAt, '결과 화면은 셋째 영상이 끝난 뒤에').toBeGreaterThanOrEqual(third.endedAt);
  expect(log.qrAt - third.endedAt, '끝나면 곧바로 결과를 보인다').toBeLessThan(1500);
  console.log('[느린 올리기, 저장 누른 때부터 초]', JSON.stringify({
    셋째영상시작: Math.round(third.shownAt - log.saveAt) / 1000,
    셋째영상끝: Math.round(third.endedAt - log.saveAt) / 1000,
    결과: Math.round(log.qrAt - log.saveAt) / 1000,
    셋째영상길이: Math.round(third.endedAt - third.shownAt) / 1000,
  }));
});

// 부스의 인터넷이 끊긴 뒤에 저장해도(영상과 목소리 합치기는 기기 안에서 돈다) 대기 화면에 그림이 보여야 한다 — 그림을 못 받으면 깨진 그림이 된다.
// 앱은 엔진을 받은 뒤 정지 그림 열두 장을 미리 받고, 서비스워커가 캐시에 둔다(src/lib/waitingVideo.ts · tools/sw-template.js).
test('대기 화면의 그림 주소에 닿지 못해도 미리 받아 둔 정지 그림이 보인다', async ({ page, context }) => {
  test.setTimeout(180000);
  await page.setViewportSize({ width: 1440, height: 900 });
  let release;
  const gate = new Promise((resolve) => { release = resolve; });
  await reachSave(page, gate, async () => {
    const stills = await expect.poll(() => page.evaluate(async () => {
      let cached = 0;
      for (let i = 1; i <= 12; i += 1) if (await caches.match(`/waiting-v3/${String(i).padStart(2, '0')}.webp`, { ignoreVary: true })) cached += 1;
      return { controlled: Boolean(navigator.serviceWorker.controller), cached };
    }).catch(() => ({ controlled: false, cached: -1 })), { timeout: 150000, intervals: [500, 1000, 2000] });
    await stills.toEqual({ controlled: true, cached: 12 });
    // 그 뒤로 대기 화면의 그림 · 영상 주소는 망에 닿지 못한다(인터넷이 끊긴 것과 같다)
    await context.route('**/waiting-v3/**', (route) => route.abort('internetdisconnected'));
  });
  const wait = page.locator('#loading');
  await expect(wait).toBeVisible();
  const still = wait.locator('img.generation-robot-still[data-active="true"]');
  for (const scene of ['0', '1']) {
    await expect(wait).toHaveAttribute('data-scene', scene, { timeout: 20000 });
    await expect.poll(() => still.evaluate((img) => img.complete && img.naturalWidth), { timeout: 10000 }).toBe(704);
  }
  release();
  await expect(page.locator('#qrbox')).toBeVisible({ timeout: 30000 });
});

test('움직임 줄이기: 영상 없이 정지 그림만, 결과는 준비되면 곧바로', async ({ page }) => {
  test.setTimeout(120000);
  await page.emulateMedia({ reducedMotion: 'reduce' });
  await page.setViewportSize({ width: 390, height: 664 });
  let release;
  const gate = new Promise((resolve) => { release = resolve; });
  await reachSave(page, gate);
  const wait = page.locator('#loading');
  await expect(wait).toBeVisible();
  await expect(wait.locator('img.generation-robot-still')).toHaveAttribute('data-active', 'true');
  await page.waitForTimeout(1500);
  await expect(wait.locator('video')).toHaveCount(0);
  await page.evaluate(() => { window.__releaseAt = performance.now(); });
  release();
  await expect(page.locator('#qrbox')).toBeVisible({ timeout: 30000 });
  const gap = await page.evaluate(() => (window.__wait.qrAt ?? performance.now()) - window.__releaseAt);
  expect(gap, '기다릴 영상이 없으면 곧바로').toBeLessThan(3000);
});
