import { test, expect } from '@playwright/test';

test.use({ serviceWorkers: 'block' });

for (const [genre, name] of [['fantasy', '판타지'], ['animation', '애니메이션'], ['horror', '호러'], ['action', '액션'], ['drama', '드라마'], ['sitcom', '시트콤']]) {
  test(`${name}: 확대 후 정지 상태로 대기하고 늦게 로딩되어도 크기·재생 상태가 바뀌지 않는다`, async ({ page }) => {
    await page.setViewportSize({ width: 1920, height: 1080 });
    let releaseVideo;
    const videoGate = new Promise(resolve => { releaseVideo = resolve; });
    await page.route(`**/clips/studio/${genre}.mp4`, async route => {
      await videoGate;
      await route.continue();
    });
    await page.goto('/');
    await page.locator('#splash').waitFor({ state: 'detached' });
    await page.getByRole('button', { name: '장면 흐름 일시정지', exact: true }).click();
    try {
      await page.locator('.scene-choice').filter({ hasText: name }).first().click();
      await expect(page.locator('.studio-video-frame')).not.toHaveClass(/is-entering/);
      const clip = page.locator('#clip');
      const before = await clip.boundingBox();
      expect(before.x).toBe(0);
      expect(before.width).toBe(1920);
      expect(await clip.evaluate(video => video.readyState)).toBe(0);
      await expect(clip).toHaveJSProperty('paused', true);
      await expect(page.locator('#screenPlaybackBtn span')).toBeVisible();
      releaseVideo();
      await expect.poll(() => clip.evaluate(video => video.readyState)).toBeGreaterThanOrEqual(2);
      await page.waitForTimeout(300);
      expect(await clip.boundingBox()).toEqual(before);
      await expect(clip).toHaveJSProperty('paused', true);
      await expect(clip).toHaveJSProperty('currentTime', 0);
      await page.locator('#screenPlaybackBtn').click();
      await expect.poll(() => clip.evaluate(video => !video.paused && !video.muted && video.currentTime > 0)).toBe(true);
    } finally {
      releaseVideo();
    }
  });
}
