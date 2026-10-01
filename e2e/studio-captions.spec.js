import { test, expect } from '@playwright/test';

test('드라마 원본 자막은 해당 대사 구간에만 보이고 끄거나 다시 녹음한 목소리를 들을 때 숨는다', async ({ page }) => {
  await page.goto('/');
  await page.locator('#splash').waitFor({ state: 'detached' });
  await page.getByRole('button', { name: '드라마 더빙 시작', exact: true }).click();
  await page.locator('#previewBtn').click();
  await page.locator('#clip').evaluate(video => { video.pause(); video.currentTime = 3; });
  await expect(page.locator('.studio-captions')).toContainText('I wanted to tell you the truth.');
  await expect(page.locator('.studio-captions')).toContainText('너에게 진실을 말하고 싶었어.');
  await page.getByRole('button', { name: '원본 자막' }).click();
  await expect(page.locator('.studio-captions')).toHaveCount(0);
  await page.getByRole('button', { name: '원본 자막' }).click();
  await expect(page.locator('.studio-captions')).toBeVisible();
  await page.locator('#clip').evaluate(video => { video.currentTime = 5; });
  await expect(page.locator('.studio-captions')).toHaveCount(0);
  await page.locator('#recBtn').click();
  await expect(page.locator('.studio-captions')).toBeVisible({ timeout: 10000 });
  await expect(page.locator('#afterRow')).toBeVisible({ timeout: 15000 });
  await page.locator('#replayBtn').click();
  await page.locator('#clip').evaluate(video => { video.currentTime = 3; });
  await expect(page.locator('.studio-captions')).toHaveCount(0);
  await expect(page.getByRole('button', { name: '원본 자막' })).toHaveCount(0);
});
