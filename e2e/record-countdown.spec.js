import { test, expect } from '@playwright/test';

// 미리보기 중 켜져 있던 녹음 버튼을 눌러도 상태 검사가 요청을 무시했던 결함.
// 숫자가 DOM에 생기는 것뿐 아니라 화면 안에서 다른 요소에 가려지지 않는지 확인한다.
for (const [label, viewport] of [
  ['PC', { width: 1440, height: 900 }],
  ['휴대폰', { width: 390, height: 844 }],
]) {
  test(`${label}: 미리보기 도중 녹음 시작을 눌러도 3·2·1이 화면 가운데 보인 뒤 녹음한다`, async ({ page }) => {
    await page.setViewportSize(viewport);
    await page.goto('/');
    await page.locator('#splash').waitFor({ state: 'detached' });
    await page.getByRole('button', { name: '판타지 더빙 시작', exact: true }).click();
    await expect.poll(() => page.locator('#clip').evaluate(v => v.paused)).toBe(false);
    await page.locator('#recBtn').click();

    for (const n of [3, 2, 1]) {
      const count = page.locator('#count');
      await expect(count).toHaveAttribute('aria-label', `${n}초 뒤 녹음 시작`, { timeout: 1800 });
      await expect(count).toBeInViewport();
      await expect(count).toBeVisible();
      const visible = await count.evaluate(el => {
        const r = el.getBoundingClientRect();
        const hit = document.elementFromPoint(r.x + r.width / 2, r.y + r.height / 2);
        return el === hit || el.contains(hit);
      });
      expect(visible).toBe(true);
    await expect.poll(() => page.locator('#clip').evaluate(v => v.paused)).toBe(true);
    }

    await expect(page.locator('#recpill')).toBeVisible();
    await expect(page.locator('#count')).toHaveCount(0);
    await expect.poll(() => page.locator('#clip').evaluate(v => v.paused)).toBe(false);
  });
}
