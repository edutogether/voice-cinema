import { test, expect } from '@playwright/test';

// 녹음실 미리보기(10/20 대표님): «장면 시작» 옆 «녹음 없이 미리보기»를 누르면 녹음·합성 없이 장면 영상을
// 소리와 함께 처음부터 보여 주고, 끝나거나 멈추면 «준비됐나요 ?»로 돌아간다. 위 가운데는 장르 이름만(«목소리 녹음» 뺌).
// 10/25 녹음실 재구성: 영상 전체를 덮던 가운데 재생 단추는 없앴다 — 영상을 누르면 녹음 없이 끝까지 흘러 대표님이 «중간에 멈추지도 않는다»고 보셨다.
test.use({ viewport: { width: 1440, height: 900 } });

const clip = (page) => page.locator('#clip');
const state = (page) => clip(page).evaluate((v) => ({ paused: v.paused, muted: v.muted, time: v.currentTime }));

test.beforeEach(async ({ page }) => {
  // 미리보기는 마이크를 열지 않는다 — 마이크 요청을 센다
  await page.addInitScript(() => {
    window.micRequests = 0;
    const original = navigator.mediaDevices.getUserMedia.bind(navigator.mediaDevices);
    navigator.mediaDevices.getUserMedia = (constraints) => { window.micRequests += 1; return original(constraints); };
  });
  await page.goto('/');
  await page.locator('#splash').waitFor({ state: 'detached' });
  await page.getByRole('button', { name: 'SF 더빙 시작', exact: true }).click();
  await expect(page.locator('#studio')).toHaveClass(/active/);
});

test('위 가운데는 장르 이름만이고, «녹음 없이 미리보기»는 마이크 없이 소리와 함께 처음부터 재생하며 멈추면 준비 상태로 돌아간다', async ({ page }) => {
  await expect(page.locator('.studio-scene-label')).toHaveText('SF');
  await expect(page.locator('#screenPlaybackBtn')).toHaveCount(0);
  const preview = page.locator('#previewBtn');
  await expect(preview).toHaveText('녹음 없이 미리보기');
  await preview.click();
  await expect(page.locator('#studio')).toHaveAttribute('data-phase', 'previewing');
  await expect(preview).toHaveText('미리보기 멈춤');
  await expect.poll(async () => (await state(page)).time).toBeGreaterThan(.5);
  expect(await state(page)).toMatchObject({ paused: false, muted: false });
  await preview.click();
  await expect(page.locator('#studio')).toHaveAttribute('data-phase', 'idle');
  await expect(page.locator('.controls h2')).toHaveText('준비됐나요 ?');
  expect(await state(page)).toMatchObject({ paused: true, time: 0 });
  expect(await page.evaluate(() => window.micRequests)).toBe(0);
});

test('미리보기를 끝까지 보면 준비 상태로 돌아가고, 영상을 눌러도 녹음 없는 재생이 시작되지 않는다', async ({ page }) => {
  await page.locator('.studio-video-frame').click({ position: { x: 200, y: 200 } });
  await expect(page.locator('#studio')).toHaveAttribute('data-phase', 'idle');
  expect((await state(page)).paused).toBe(true);
  await page.locator('#previewBtn').click();
  await expect(page.locator('#studio')).toHaveAttribute('data-phase', 'previewing');
  // 10초를 다 기다리지 않고 끝 근처로 넘긴다 — 끝(ended)에서 돌아가는지만 본다
  await expect.poll(async () => (await state(page)).time).toBeGreaterThan(.2);
  await clip(page).evaluate((v) => { v.currentTime = v.duration - .3; });
  await expect(page.locator('#studio')).toHaveAttribute('data-phase', 'idle', { timeout: 5000 });
  await expect(page.locator('.controls h2')).toHaveText('준비됐나요 ?');
  expect(await page.evaluate(() => window.micRequests)).toBe(0);
});

test('미리보기 중에 «장면 시작»을 누르면 미리보기를 접고 바로 녹음 흐름을 시작한다', async ({ page }) => {
  await page.locator('#previewBtn').click();
  await expect.poll(async () => (await state(page)).time).toBeGreaterThan(1);
  await page.locator('#recBtn').click();
  await expect(page.locator('#studio')).toHaveAttribute('data-phase', /requesting|watching/);
  await expect(page.locator('#previewBtn')).toHaveCount(0);
  // 장면은 처음부터 다시 흐른다
  await expect(page.locator('#studio')).toHaveAttribute('data-phase', 'watching');
  expect((await state(page)).time).toBeLessThan(1);
  await page.locator('#cue').waitFor({ timeout: 10000 });
});

test('키보드로 녹음하면 녹음이 끝난 뒤 «저장하기»로 초점이 간다(«다시 듣기»는 없다)', async ({ page }) => {
  await page.locator('#recBtn').focus();
  await page.keyboard.press('Enter');
  await expect(page.locator('#afterRow')).toBeVisible({ timeout: 40000 });
  await expect(page.locator('#afterRow button')).toHaveText(['다시 녹음', '저장하기']);
  await expect(page.locator('#saveBtn')).toBeFocused();
});
