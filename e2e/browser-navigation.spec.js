import { test, expect } from '@playwright/test';

async function openHome(page) {
  await page.route('**/sw.js', route => route.abort());
  // 실제 녹음·합성·업로드 이력을 검사하므로 로컬 체험 쿼리를 사용하지 않는다.
  await page.goto('/');
  await page.locator('#splash').waitFor({ state: 'detached' });
}

async function openStudio(page) {
  await page.getByRole('button', { name: '판타지 더빙 시작', exact: true }).click();
  await expect(page.locator('#studio')).toHaveClass(/active/);
}

test('브라우저 뒤로가기는 재생을 멈추고 홈으로, 앞으로가기는 새 녹음실로 이동한다', async ({ page }) => {
  await openHome(page);
  await openStudio(page);
  await page.locator('#previewBtn').click();
  await expect.poll(() => page.locator('#clip').evaluate(v => v.currentTime)).toBeGreaterThan(.1);
  await page.locator('#clip').evaluate(v => { window.previousClip = v; });
  await page.goBack();
  await expect(page.locator('#home')).toHaveClass(/active/);
  await expect(page.locator('#studio')).toHaveCount(0);
  expect(await page.evaluate(() => window.previousClip.paused)).toBe(true);
  await expect(page).toHaveURL(/\/$/);
  await page.goForward();
  await expect(page.locator('#studio')).toHaveClass(/active/);
  await expect(page.locator('#recBtn')).toBeVisible();
  await expect(page.locator('#afterRow')).toBeHidden();
  await expect(page.locator('#clip')).toHaveJSProperty('paused', true);
  await expect(page.locator('#screenPlaybackBtn span')).toBeVisible();
});

test('앱의 장면 바꾸기도 같은 기록으로 돌아가며 홈에서는 이전 웹페이지로 나갈 수 있다', async ({ page }) => {
  await page.goto('/privacy.html');
  await openHome(page);
  const length = await page.evaluate(() => window.history.length);
  for (let i = 0; i < 3; i++) {
    await openStudio(page);
    await page.locator('.back').click();
    await expect(page.locator('#home')).toHaveClass(/active/);
    expect(await page.evaluate(() => window.history.length)).toBe(length + 1);
  }
  await page.goBack();
  await expect(page).toHaveURL(/privacy\.html$/);
});

test('녹음 중 뒤로가면 녹음을 중단하고 이전 목소리를 앞으로가기로 복구하지 않는다', async ({ page }) => {
  await page.addInitScript(() => {
    const start = window.MediaRecorder.prototype.start;
    window.MediaRecorder.prototype.start = function (...args) {
      window.lastRecorder = this;
      return start.apply(this, args);
    };
  });
  await openHome(page);
  await openStudio(page);
  await page.locator('#recBtn').click();
  await expect(page.locator('.recpill')).toBeVisible({ timeout: 10000 });
  await page.goBack();
  await expect(page.locator('#home')).toHaveClass(/active/);
  expect(await page.evaluate(() => window.lastRecorder.state)).toBe('inactive');
  await page.goForward();
  await expect(page.locator('#recBtn')).toBeVisible();
  await expect(page.locator('#afterRow')).toBeHidden();
});

test('결과에서 뒤로가면 녹음이 남고 앞으로가기로 중복 저장하지 않는다', async ({ page }) => {
  let uploads = 0;
  await page.route('**/voiceCinema/upload', route => {
    uploads++;
    return route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({ ok: true, url: 'https://storage.googleapis.com/fake/navigation.mp4' }) });
  });
  await openHome(page);
  await openStudio(page);
  await page.locator('#recBtn').click();
  await expect(page.locator('#afterRow')).toBeVisible({ timeout: 20000 });
  await page.locator('#saveBtn').click();
  await expect(page.locator('#done')).toBeVisible({ timeout: 30000 });
  expect(uploads).toBe(1);
  await page.goBack();
  await expect(page.locator('#studio')).toHaveClass(/active/);
  await expect(page.locator('#afterRow')).toBeVisible();
  await page.goForward();
  await expect(page.locator('#studio')).toHaveClass(/active/);
  await expect(page.locator('#afterRow')).toBeVisible();
  await expect(page.locator('#result')).toHaveCount(0);
  expect(uploads).toBe(1);
  await page.locator('.back').click();
  await expect(page.locator('#home')).toHaveClass(/active/);
  await page.goForward();
  await expect(page.locator('#recBtn')).toBeVisible();
  await expect(page.locator('#afterRow')).toBeHidden();
});

test('녹음실에서 새로고침하면 새 참가자용 홈으로 시작한다', async ({ page }) => {
  await openHome(page);
  await openStudio(page);
  await page.reload();
  await page.locator('#splash').waitFor({ state: 'detached' });
  await expect(page.locator('#home')).toHaveClass(/active/);
  await expect(page.locator('#studio')).toHaveCount(0);
  await openStudio(page);
  await page.goBack();
  await expect(page.locator('#home')).toHaveClass(/active/);
});
