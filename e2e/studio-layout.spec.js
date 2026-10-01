import { test, expect } from '@playwright/test';

for (const [width, height] of [[1440, 900], [1920, 1080], [1366, 768], [390, 844], [360, 640], [844, 390]]) {
  test(`녹음 화면 ${width}×${height}: 흰 조작부와 영상이 겹치지 않고 주요 버튼에 접근한다`, async ({ page }) => {
    await page.setViewportSize({ width, height });
    await page.goto('/');
    await page.locator('#splash').waitFor({ state: 'detached' });
    await page.getByRole('button', { name: '액션 더빙 시작', exact: true }).click();
    // 화면 진입 애니메이션의 소수점 이동이 끝난 최종 배치를 비교한다.
    await page.locator('#studio').evaluate(el => Promise.all(el.getAnimations().map(animation => animation.finished)));
    await expect(page.locator('.controls h2')).toHaveText('준비됐나요 ?');
    await expect(page.locator('#hint')).toHaveText("'녹음 시작'을 누르면 잠시 후 녹음이 시작돼요 !");
    const layout = await page.evaluate(() => {
      const header = document.querySelector('.studio-heading');
      const frame = document.querySelector('.studio-video-frame');
      const dock = document.querySelector('.studio-player-dock');
      return {
        backgrounds: [header, dock].map(el => getComputedStyle(el).backgroundColor),
        noOverlap: header.getBoundingClientRect().bottom <= frame.getBoundingClientRect().top && frame.getBoundingClientRect().bottom <= dock.getBoundingClientRect().top,
        videoFit: getComputedStyle(document.querySelector('#clip')).objectFit,
        overflow: document.documentElement.scrollWidth > window.innerWidth,
      };
    });
    expect(layout.backgrounds).toEqual(['rgb(255, 255, 255)', 'rgb(255, 255, 255)']);
    expect(layout.noOverlap).toBe(true);
    // 가로 화면은 여백 없이 채우고 세로 휴대폰은 전체 구도를 유지한다(Bumm님 요청).
    expect(layout.videoFit).toBe(width > height ? 'cover' : 'contain');
    expect(layout.overflow).toBe(false);
    await page.locator('#recBtn').scrollIntoViewIfNeeded();
    await expect(page.locator('#recBtn')).toBeInViewport();
    await expect(page.locator('#recBtn')).toBeEnabled();
  });
}
