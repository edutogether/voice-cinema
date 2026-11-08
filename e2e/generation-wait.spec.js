import { test, expect } from '@playwright/test';

// 저장 대기 화면 — Poster Studio의 로딩 화면(영상 12종 · 문구)을 그대로 옮겼다(11/9 Bumm님 «로딩 화면 포스터에서 갖다가 쓰라니까»).
// 정지 그림을 먼저 보이고 영상이 재생되면 영상으로 넘긴다. 소리 없이 한 번만 튼다. 영상 한 편은 끝까지 튼 뒤 다음 장면으로 넘어가고,
// 결과가 영상 한 편 재생 도중에 준비되면 그 편이 끝난 뒤에 결과 화면을 보인다
// (Bumm님 «중간에 자르지말고 하나당 재생시간 지켜서 … 2개하고 3번째꺼 빨리끊지말고 이왕 틀던건 다 고대로 보여주고 결과 보여줘라»).
const UPLOAD_PATTERN = '**/voiceCinema/upload';

async function reachSave(page, gate, afterBoot = async () => {}) {
  await page.route(UPLOAD_PATTERN, async (route) => {
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
    const log = { opened: null, videos: [], qrAt: null };
    window.__wait = log;
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
      if (document.querySelector('#qrbox') && log.qrAt === null) log.qrAt = performance.now();
    }).observe(document.body, { childList: true, subtree: true });
  });
  await page.locator('#saveBtn').click();
}

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
