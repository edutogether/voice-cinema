import { test, expect } from '@playwright/test';
import { pauseScenes } from './pause-scenes.js';

test.use({ serviceWorkers: 'block' });

const GENRES = [['sf', 'SF'], ['fantasy', '판타지'], ['animation', '애니메이션'], ['hero', '히어로'], ['thriller', '스릴러'], ['drama', '드라마'], ['sports', '스포츠'], ['musical', '뮤지컬']];

for (const [genre, name] of GENRES) {
  test(`${name}: 들어가면 바로 재생을 시작하고, 늦게 받혀도 크기가 바뀌지 않으며 받히는 대로 소리와 함께 흐른다`, async ({ page }) => {
    await page.setViewportSize({ width: 1920, height: 1080 });
    let releaseVideo;
    const videoGate = new Promise(resolve => { releaseVideo = resolve; });
    // 2.0은 녹음실 재생·멈춤·합성을 원판 한 파일로 한다(1.0의 studio/ 사본 없음).
    await page.route(new RegExp(`/clips/${genre}\\.mp4\\?v=[0-9a-f]{8}$`), async route => {
      await videoGate;
      await route.continue();
    });
    await page.goto('/');
    await page.locator('#splash').waitFor({ state: 'detached' });
    await pauseScenes(page);
    // 카드에서 녹음실로 커지는 동안(메인 화면처럼 보이는 때)에는 «영상을 불러오고 있어요»를 띄우지 않는다(11/9 Bumm님 «메인화면에선 띄우지말고»)
    await page.evaluate(() => {
      window.__bufferDuringEntrance = false;
      new MutationObserver(() => {
        if (document.querySelector('.studio-video-frame.is-entering .studio-buffering')) window.__bufferDuringEntrance = true;
      }).observe(document.body, { childList: true, subtree: true, attributes: true, attributeFilter: ['class'] });
    });
    try {
      await page.locator('.scene-choice').filter({ hasText: name }).first().click();
      await expect(page.locator('.studio-video-frame')).not.toHaveClass(/is-entering/);
      expect(await page.evaluate(() => window.__bufferDuringEntrance), '커지는 동안 받는 중 표시가 떴다').toBe(false);
      const clip = page.locator('#clip');
      const before = await clip.boundingBox();
      expect(before.x).toBe(0);
      expect(before.width).toBe(1920);
      expect(await clip.evaluate(video => video.readyState)).toBe(0);
      await expect(page.locator('#studio')).toHaveAttribute('data-phase', 'previewing');
      await expect(clip).toHaveJSProperty('muted', false);
      // 녹음실이 다 열린 뒤 받는 동안에는 얼마나 받았는지 퍼센트로 보인다(11/9 Bumm님 «영상 골라서 누른 화면에서는 … 퍼센트까지»)
      await expect(page.locator('.studio-buffering')).toHaveText(/^영상을 불러오고 있어요 \d{1,3}%$/);
      releaseVideo();
      await expect.poll(() => clip.evaluate(video => video.readyState)).toBeGreaterThanOrEqual(2);
      await expect.poll(() => clip.evaluate(video => !video.paused && !video.muted && video.currentTime > 0)).toBe(true);
      await expect(page.locator('.studio-buffering')).toHaveCount(0);
      expect(await clip.boundingBox()).toEqual(before);
    } finally {
      releaseVideo();
    }
  });
}
