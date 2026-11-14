import { test, expect } from '@playwright/test';
import { stopAutoPreview } from './stop-auto-preview.js';

for (const [width, height] of [[1440, 900], [1920, 1080], [1366, 768], [390, 844], [360, 640], [844, 390]]) {
  test(`녹음 화면 ${width}×${height}: 흰 조작부와 영상이 겹치지 않고 주요 버튼에 접근한다`, async ({ page }) => {
    await page.setViewportSize({ width, height });
    await page.goto('/');
    await page.locator('#splash').waitFor({ state: 'detached' });
    await page.getByRole('button', { name: '히어로 더빙 시작', exact: true }).click();
    // 화면 진입 애니메이션의 소수점 이동이 끝난 최종 배치를 비교한다.
    await expect(page.locator('.studio-video-frame')).not.toHaveClass(/is-entering/);
    await stopAutoPreview(page);
    await expect(page.locator('.controls h2')).toHaveText('준비됐나요 ?');
    await expect(page.locator('#hint')).toContainText("'장면 시작'을 누르면");
    const layout = await page.evaluate(() => {
      const header = document.querySelector('.studio-heading');
      const frame = document.querySelector('.studio-video-frame');
      const dock = document.querySelector('.studio-player-dock');
      // 키 큰 세로 휴대폰(11/9 시안)은 조작부 상자를 풀어(display:contents) 막대 · 안내 · 단추를 따로 펼친다 — 맨 위인 진행 막대 줄로 잰다
      const dockTop = (getComputedStyle(dock).display === 'contents' ? document.querySelector('.studio-timeline') : dock).getBoundingClientRect().top;
      return {
        backgrounds: [header, dock].map(el => getComputedStyle(el).backgroundColor),
        noOverlap: header.getBoundingClientRect().bottom <= frame.getBoundingClientRect().top && frame.getBoundingClientRect().bottom <= dockTop,
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
