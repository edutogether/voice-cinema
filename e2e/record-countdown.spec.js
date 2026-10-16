import { test, expect } from '@playwright/test';

// 5.0초 멈춤 뒤 «이제 당신의 차례입니다 !» → 3·2·1 «지금 바로 당신의 목소리를 들려주세요 !»가 화면 가운데 보이고
// 다른 요소에 가려지지 않는다. 그동안 영상은 5.0초 정지 화면 그대로다. «1»이 사라지는 순간 녹음이 시작된다.
for (const [label, viewport] of [
  ['PC', { width: 1440, height: 900 }],
  ['휴대폰', { width: 390, height: 844 }],
]) {
  test(`${label}: 멈춤 문구와 3·2·1이 화면 가운데 보이고 «1»이 사라지면 녹음한다`, async ({ page }) => {
    await page.setViewportSize(viewport);
    await page.goto('/');
    await page.locator('#splash').waitFor({ state: 'detached' });
    await page.getByRole('button', { name: '판타지 더빙 시작', exact: true }).click();
    await page.locator('#recBtn').click();

    const cue = page.locator('#cue');
    await expect(cue).toHaveText('이제 당신의 차례입니다 !', { timeout: 8000 });
    await expect(cue).toBeInViewport();
    await expect(page.locator('#clip')).toHaveJSProperty('paused', true);

    for (const n of [3, 2, 1]) {
      const count = page.locator('#count');
      await expect(count).toHaveAttribute('aria-label', `${n}초 뒤 녹음 시작`, { timeout: 2500 });
      await expect(count).toContainText('지금 바로 당신의 목소리를 들려주세요 !');
      await expect(count).toBeInViewport();
      const visible = await count.evaluate(el => {
        const r = el.getBoundingClientRect();
        const hit = document.elementFromPoint(r.x + r.width / 2, r.y + r.height / 2);
        return el === hit || el.contains(hit);
      });
      expect(visible).toBe(true);
      await expect(page.locator('#clip')).toHaveJSProperty('paused', true);
    }

    await expect(page.locator('#recpill')).toBeVisible();
    await expect(page.locator('#count')).toHaveCount(0);
    await expect(page.locator('.record-left')).toBeVisible();
    // 녹음 중에도 영상은 5.0초 정지 화면이다.
    expect(await page.locator('#clip').evaluate(v => ({ paused: v.paused, at: Math.round(v.currentTime * 10) / 10 }))).toEqual({ paused: true, at: 5 });
  });
}
