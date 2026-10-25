import { test, expect } from '@playwright/test';

// 녹음실 배치(10/25 대표님 녹음실 재구성 — «16:9 영상이 가장 크고 중요한 영역, PC는 극장처럼 넓고 몰입감 있게»):
// 영상은 16:9 전체 구도를 자르지 않는다(contain). 가로 화면은 영상이 화면을 채우고(어두운 극장) 머리줄 · 조작부가 그 위에 얹히며,
// 세로 화면은 머리줄 → 영상 → 안내 칸 → 단추가 위에서부터 붙는다. 어느 화면이든 가로 넘침이 없고 «장면 시작»을 누를 수 있다.
// 전에는 가로 화면이 영상을 덮어 채워(cover) 1366×768에서 위아래 약 30%가 잘렸다.
for (const [width, height] of [[1440, 900], [1920, 1080], [1366, 768], [390, 844], [360, 640], [844, 390]]) {
  test(`녹음 화면 ${width}×${height}: 16:9 영상이 자르지 않고 가장 크게 보이고 주요 버튼에 접근한다`, async ({ page }) => {
    await page.setViewportSize({ width, height });
    await page.goto('/');
    await page.locator('#splash').waitFor({ state: 'detached' });
    await page.getByRole('button', { name: '히어로 더빙 시작', exact: true }).click();
    // 화면 진입 애니메이션의 소수점 이동이 끝난 최종 배치를 비교한다.
    await expect(page.locator('.studio-video-frame')).not.toHaveClass(/is-entering/);
    await expect(page.locator('.controls h2')).toHaveText('준비됐나요 ?');
    await expect(page.locator('#hint')).toContainText("'장면 시작'을 누르면 장면이 흐르다 5초에 멈춰요");
    const layout = await page.evaluate(() => {
      const r = (el) => el.getBoundingClientRect();
      const header = r(document.querySelector('.studio-heading'));
      const frame = r(document.querySelector('.studio-video-frame'));
      const video = document.querySelector('#clip');
      // 틀 안에서 16:9 영상이 실제로 그려지는 상자(contain)
      const scale = Math.min(frame.width / 16, frame.height / 9);
      const shown = { width: scale * 16, height: scale * 9 };
      shown.left = frame.left + (frame.width - shown.width) / 2;
      shown.top = frame.top + (frame.height - shown.height) / 2;
      return {
        background: getComputedStyle(document.querySelector('#studio')).backgroundColor,
        videoFit: getComputedStyle(video).objectFit,
        // 영상이 차지하는 면적 비율(화면 대비)
        share: (shown.width * shown.height) / (window.innerWidth * window.innerHeight),
        inView: shown.left >= -1 && shown.top >= -1 && shown.left + shown.width <= window.innerWidth + 1 && shown.top + shown.height <= window.innerHeight + 1,
        stacked: header.bottom <= frame.top + 1,
        overflow: document.documentElement.scrollWidth > window.innerWidth,
      };
    });
    // 어두운 극장
    expect(layout.background).toBe('rgb(11, 11, 13)');
    expect(layout.videoFit).toBe('contain');
    expect(layout.inView).toBe(true);
    expect(layout.overflow).toBe(false);
    if (width > height) {
      // 가로 화면: 영상이 화면을 채운다(머리줄은 그 위에 얹힌다) — 16:9에 가까운 화면에서 90% 넘게
      expect(layout.share).toBeGreaterThan(width / height > 1.7 && width / height < 1.8 ? 0.95 : 0.7);
    } else {
      // 세로 화면: 머리줄 아래에 붙는다
      expect(layout.stacked).toBe(true);
    }
    await page.locator('#recBtn').scrollIntoViewIfNeeded();
    await expect(page.locator('#recBtn')).toBeInViewport();
    await expect(page.locator('#recBtn')).toBeEnabled();
  });
}
