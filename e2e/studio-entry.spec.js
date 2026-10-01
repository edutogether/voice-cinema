import { test, expect } from '@playwright/test';

// 실제 네트워크 지연을 재현한다. 서비스워커의 클립 캐시 응답은 경로 가로채기를 우회한다.
test.use({ serviceWorkers: 'block' });

for (const [genre, name] of [['fantasy', '판타지'], ['animation', '애니메이션'], ['horror', '호러'], ['action', '액션'], ['drama', '드라마'], ['sitcom', '시트콤']]) {
  test(`${name}: 원본 로딩 전 첫 화면부터 최종 크기와 위치로 표시한다`, async ({ page }) => {
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
    await page.evaluate(() => {
      window.entryFrames = [];
      const observer = new MutationObserver(() => {
        const studio = document.querySelector('#studio.active');
        if (!studio) return;
        observer.disconnect();
        const started = performance.now();
        const sample = () => {
          const video = studio.querySelector('#clip');
          const rect = video.getBoundingClientRect();
          const style = getComputedStyle(studio);
          window.entryFrames.push({
            x: rect.x, y: rect.y, width: rect.width, height: rect.height,
            opacity: style.opacity, transform: style.transform,
          });
          if (performance.now() - started < 500) requestAnimationFrame(sample);
        };
        sample();
      });
      observer.observe(document.body, { childList: true, subtree: true });
    });
    try {
      await page.locator('.scene-choice').filter({ hasText: name }).first().click();
      await expect.poll(() => page.evaluate(() => window.entryFrames.length)).toBeGreaterThan(10);
      expect(await page.locator('#clip').evaluate(video => video.readyState)).toBe(0);
      const frames = await page.evaluate(() => window.entryFrames);
      const first = frames[0];
      expect(first.x).toBe(0);
      expect(first.width).toBe(1920);
      for (const frame of frames) {
        expect(frame).toEqual({ ...first, opacity: '1', transform: 'none' });
      }
      releaseVideo();
      await expect.poll(() => page.locator('#clip').evaluate(video => video.readyState)).toBeGreaterThanOrEqual(2);
      const loaded = await page.locator('#clip').boundingBox();
      expect(loaded).toEqual({ x: first.x, y: first.y, width: first.width, height: first.height });
      await page.locator('#previewBtn').click();
      await expect.poll(() => page.locator('#clip').evaluate(video => !video.paused && !video.muted)).toBe(true);
    } finally {
      releaseVideo();
    }
  });
}
