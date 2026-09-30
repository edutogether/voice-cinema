import { test, expect } from '@playwright/test';

test('대기는 전체 길이, 재생·녹음은 영상 시계의 초와 100분의 1초를 표시한다', async ({ page }) => {
  await page.goto('/');
  await page.locator('#splash').waitFor({ state: 'detached' });
  await page.getByRole('button', { name: '판타지 더빙 시작', exact: true }).click();
  const clock = page.locator('.clip-time');
  await expect(clock).toHaveText('10:00');
  await page.locator('#previewBtn').click();
  await expect(clock).toHaveText(/^\d{2}:\d{2} \/ 10:00$/);
  await page.locator('#clip').evaluate(video => { video.pause(); video.currentTime = 3.45; });
  await expect(clock).toHaveText('03:45 / 10:00');
  await page.waitForTimeout(300);
  await expect(clock).toHaveText('03:45 / 10:00');
  await page.locator('#previewBtn').click();
  await expect(clock).toHaveText('10:00');
  await page.locator('#recBtn').click();
  await expect(page.locator('#count')).toBeVisible();
  await expect(clock).toHaveText('00:00 / 10:00');
  await expect(page.locator('#recpill')).toBeVisible();
  await expect.poll(async () => (await clock.textContent()) !== '00:00 / 10:00').toBe(true);
  await expect(clock).toHaveText(/^\d{2}:\d{2} \/ 10:00$/);
  await expect(page.locator('#afterRow')).toBeVisible({ timeout: 15000 });
  await expect(clock).toHaveText('10:00 / 10:00');
  await page.locator('#replayBtn').click();
  await expect.poll(async () => (await clock.textContent()).startsWith('00:')).toBe(true);
  await page.locator('#resetBtn').click();
  await expect(clock).toHaveText('10:00');
});
