import { test, expect } from '@playwright/test';
import { pauseScenes } from './pause-scenes.js';

for (const origin of ['중앙 카드', '아래 썸네일']) {
  test(`${origin} 중심에서 실제 플레이어 하나가 비율을 유지하며 확대된다`, async ({ page }) => {
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
    await expect(page.locator('#clip')).toHaveJSProperty('paused', true);
    await expect(page.locator('#clip')).toHaveJSProperty('currentTime', 0);
    await expect(page.locator('#screenPlaybackBtn span')).toBeVisible();
  });
}

test('움직임 줄이기는 즉시 정지 화면을 표시하고 진입 중 뒤로가기도 정리된다', async ({ page }) => {
  await page.emulateMedia({ reducedMotion: 'reduce' });
  await page.goto('/');
  await page.locator('#splash').waitFor({ state: 'detached' });
  await page.getByRole('button', { name: 'SF 더빙 시작', exact: true }).click();
  await expect(page.locator('.studio-video-frame')).toHaveCSS('transform', 'none');
  await expect(page.locator('#clip')).toHaveJSProperty('paused', true);
  await expect(page.locator('#screenPlaybackBtn span')).toBeVisible();
  await page.goBack();
  await page.emulateMedia({ reducedMotion: 'no-preference' });
  await page.getByRole('button', { name: 'SF 더빙 시작', exact: true }).click();
  await page.goBack();
  await expect(page.locator('#home')).toBeVisible();
  await expect(page.locator('#studio')).toHaveCount(0);
});

test('처음엔 대기하고 화면 가운데 버튼은 녹음 없이 장면을 미리 본다(10/20)', async ({ page }) => {
  await page.goto('/');
  await page.locator('#splash').waitFor({ state: 'detached' });
  await page.getByRole('button', { name: 'SF 더빙 시작', exact: true }).click();
  const clip = page.locator('#clip');
  const screen = page.locator('#screenPlaybackBtn');
  await expect(page.locator('.studio-video-frame')).not.toHaveClass(/is-entering/);
  await page.waitForTimeout(600);
  await expect(clip).toHaveJSProperty('currentTime', 0);
  await expect(clip).toHaveJSProperty('paused', true);
  await expect(page.locator('.clip-time')).toHaveText('10:00');
  await expect(screen.locator('span')).toBeVisible();
  await expect(screen.locator('span')).toHaveCSS('border-radius', '50%');
  await expect(screen).toHaveAccessibleName('장면 미리보기');
  await screen.click();
  await expect.poll(() => clip.evaluate(v => !v.paused && !v.muted && v.currentTime > .2)).toBe(true);
  // 미리보기가 시작되면 가운데 버튼은 사라지고, 5.0초에서 멈추지 않고 녹음도 하지 않는다(녹음은 «장면 시작»으로만).
  await expect(screen).toHaveCount(0);
  await expect(page.locator('#studio')).toHaveAttribute('data-phase', 'previewing');
  await expect.poll(() => clip.evaluate(v => v.currentTime), { timeout: 8000 }).toBeGreaterThan(5.5);
  await expect(page.locator('#cue')).toHaveCount(0);
});
