import { test, expect } from '@playwright/test';
import { pauseScenes } from './pause-scenes.js';

// 움직임 줄이기 신호가 있어도 똑같이 확대된다(11/11 Bumm님, 팀장 전달 — 전에는 신호가 있으면 확대 없이 바로 바꿨다)
for (const reducedMotion of ['reduce', 'no-preference']) for (const origin of ['중앙 카드', '아래 썸네일']) {
  test(`움직임 줄이기 ${reducedMotion}: ${origin} 중심에서 실제 플레이어 하나가 비율을 유지하며 확대된다`, async ({ page }) => {
    await page.emulateMedia({ reducedMotion });
    await page.setViewportSize({ width: 1440, height: 900 });
    await page.goto('/');
    await page.locator('#splash').waitFor({ state: 'detached' });
    await pauseScenes(page);
    const button = origin === '중앙 카드' ? page.locator('.scene-shell.is-current .tile') : page.locator('.scene-choice').filter({ hasText: '드라마' }).first();
    const media = button.locator(origin === '중앙 카드' ? '.tile-media' : 'img');
    const source = await media.boundingBox();
    await button.click();
    const frame = page.locator('.studio-video-frame');
    const start = await frame.evaluate(el => {
      const animation = el.getAnimations()[0];
      animation.pause(); animation.currentTime = 0;
      const rect = el.getBoundingClientRect();
      return { x: rect.x, y: rect.y, width: rect.width, height: rect.height };
    });
    expect(Math.abs(start.x + start.width / 2 - source.x - source.width / 2)).toBeLessThan(2);
    expect(Math.abs(start.y + start.height / 2 - source.y - source.height / 2)).toBeLessThan(2);
    expect(start.width).toBeLessThanOrEqual(source.width + 1);
    expect(start.height).toBeLessThanOrEqual(source.height + 1);
    const samples = await frame.evaluate(el => [0, 60, 120, 180, 240, 300, 360].map(time => {
      el.getAnimations()[0].currentTime = time;
      const style = getComputedStyle(el);
      const matrix = new window.DOMMatrixReadOnly(style.transform);
      return { x: matrix.a, y: matrix.d, clip: style.clipPath, opacity: style.opacity };
    }));
    for (const sample of samples) {
      expect(sample.x).toBeCloseTo(sample.y, 5);
      expect(sample.clip).toBe('none');
      expect(sample.opacity).toBe('1');
    }
    expect(samples[3].x).toBeGreaterThan(samples[0].x);
    expect(samples[3].x).toBeLessThan(1);
    await frame.evaluate(el => el.getAnimations()[0].finish());
    await expect(frame).not.toHaveClass(/is-entering/);
    await expect(frame).toHaveCSS('transform', 'none');
    await expect(page.locator('.studio-entrance')).toHaveCount(0);
    await expect(page.locator('#studio')).toHaveAttribute('data-phase', 'previewing');
  });
}

for (const reducedMotion of ['reduce', 'no-preference']) {
  test(`움직임 줄이기 ${reducedMotion}: 확대하는 도중에 뒤로 가도 정리된다`, async ({ page }) => {
    await page.emulateMedia({ reducedMotion });
    await page.goto('/');
    await page.locator('#splash').waitFor({ state: 'detached' });
    await page.getByRole('button', { name: 'SF 더빙 시작', exact: true }).click();
    await expect(page.locator('.studio-video-frame')).toHaveClass(/is-entering/);
    await page.goBack();
    await expect(page.locator('#home')).toBeVisible();
    await expect(page.locator('#studio')).toHaveCount(0);
  });
}
