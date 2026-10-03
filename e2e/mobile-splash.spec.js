import { test, expect, devices } from '@playwright/test';

// 기기 글꼴에 따라 마이크가 달라지지 않도록 모바일에서도 공통 PNG를 확인한다.
// WebKit 실기기 검증이 아니라 Chromium의 화면·UA·터치 환경 대조다.
for (const name of ['Pixel 7', 'iPhone 13']) {
  test(`${name}: 스플래시 마이크는 이모지가 아닌 공통 이미지다`, async ({ browser, baseURL }) => {
    const context = await browser.newContext({ ...devices[name], baseURL, serviceWorkers: 'block' });
    const page = await context.newPage();
    try {
      // 무거운 앱 번들 전에도 정적 스플래시가 완성되어 있어야 한다.
      await page.route('**/assets/*.js', route => route.abort());
      await page.goto('/');
      const logo = page.locator('#splash .logo');
      const image = logo.locator('img');
      await expect(image).toBeVisible();
      await expect(image).toHaveAttribute('src', '/icons/studio-microphone.png');
      await expect(logo).toHaveText('');
      await expect.poll(() => image.evaluate(img => img.complete && img.naturalWidth)).toBe(160);
      // 등장 애니메이션의 순간 배율이 아니라 최종 CSS 표시 크기를 확인한다.
      const size = await image.evaluate(img => ({ width: parseFloat(getComputedStyle(img).width), height: parseFloat(getComputedStyle(img).height) }));
      expect(size.width).toBeGreaterThanOrEqual(48);
      expect(size.width).toBeLessThanOrEqual(72);
      expect(size.height).toBe(size.width);
      expect(await image.evaluate(img => getComputedStyle(img).filter)).toBe('none');
    } finally {
      await context.close();
    }
  });
}
