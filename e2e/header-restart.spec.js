import { test, expect } from '@playwright/test';

test.use({ serviceWorkers: 'block' });

for (const width of [1440, 390]) {
  for (const name of ['CGV와 인천광역시교육청 — 처음부터 시작', 'InKY Film Festival — 처음부터 시작']) {
    test(`${width}px ${name}: 진행 상태를 버리고 스플래시부터 시작`, async ({ page }) => {
      await page.setViewportSize({ width, height: 900 });
      await page.goto('/?preview=home-design');
      await page.locator('#splash').waitFor({ state: 'detached' });
      const before = await page.evaluate(() => window.history.state.voiceCinema.pageId);
      await page.getByRole('button', { name: '판타지 더빙 시작', exact: true }).click();
      await expect(page.locator('#studio.active')).toBeVisible();
      await page.goBack();
      await expect(page.locator('#home.active')).toBeVisible();
      await Promise.all([
        page.waitForEvent('load'),
        page.getByRole('button', { name, exact: true }).click(),
      ]);
      await expect(page.locator('#splash')).toBeVisible();
      await page.waitForTimeout(500);
      await expect(page.locator('#splash')).toHaveCount(1);
      await page.locator('#splash').waitFor({ state: 'detached' });
      await expect(page.locator('#home.active')).toBeVisible();
      await expect(page.locator('#studio')).toHaveCount(0);
      await expect(page.locator('#result')).toHaveCount(0);
      const after = await page.evaluate(() => window.history.state.voiceCinema);
      expect(after.pageId).not.toBe(before);
      expect(after.view).toBe('home');
      expect(after.genreId).toBeUndefined();
      // 새 문서의 식별자로 이전 방문 기록의 녹음실 복원도 막는다.
      await page.goForward();
      await expect(page.locator('#home.active')).toBeVisible();
      await expect(page.locator('#studio')).toHaveCount(0);
      await expect(page).toHaveURL(/\?preview=home-design$/);
    });
  }
}
