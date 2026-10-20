import { test, expect } from '@playwright/test';

// 카카오톡 안 브라우저로 열리면 바깥 브라우저로 넘긴다(10/20 대표님 — 카톡 안에서는 녹음 마이크·영상 저장이 막힐 수 있다).
// 진짜 카카오톡은 여기서 못 띄우므로 UA만 흉내 낸다 — 이동 주소가 맞는지·한 번만 시도하는지·안내가 맞는지를 고정하고,
// 바깥 브라우저가 실제로 열리는지는 실기기에서 본다.
const UA = {
  iphone: 'Mozilla/5.0 (iPhone; CPU iPhone OS 18_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Mobile/15E148 KAKAOTALK 10.9.0',
  galaxy: 'Mozilla/5.0 (Linux; Android 14; SM-S921N Build/UP1A.231005.007; wv) AppleWebKit/537.36 (KHTML, like Gecko) Version/4.0 Chrome/129.0.6668.100 Mobile Safari/537.36;KAKAOTALK 2410960',
  safari: 'Mozilla/5.0 (iPhone; CPU iPhone OS 18_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/18.0 Mobile/15E148 Safari/604.1',
  chrome: 'Mozilla/5.0 (Linux; Android 14; SM-S921N) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/129.0.0.0 Mobile Safari/537.36',
};
const isExternal = (url) => url.startsWith('kakaotalk://');

for (const [name, ua, hint] of [['아이폰', UA.iphone, '화면 위 가운데 주소'], ['갤럭시', UA.galaxy, '화면 아래 오른쪽 메뉴']]) {
  test.describe(`카카오톡 안(${name})`, () => {
    test.use({ userAgent: ua, viewport: { width: 390, height: 664 }, isMobile: true, hasTouch: true });

    test('«브라우저로 여는 중…»을 보인 뒤 바깥 브라우저 열기 주소로 한 번 이동하고, 안 열리면 손으로 여는 길을 안내한다', async ({ page }) => {
      const tried = [];
      page.on('request', (r) => { if (isExternal(r.url())) tried.push(r.url()); });
      await page.goto('/');
      await expect(page.locator('#kakao-escape-title')).toHaveText('브라우저로 여는 중…');
      await expect.poll(() => tried.length).toBe(1);
      expect(tried[0]).toBe(`kakaotalk://web/openExternal?url=${encodeURIComponent(page.url())}`);
      await expect(page.locator('#kakao-escape-title')).toHaveText('바깥 브라우저에서 열어 주세요', { timeout: 4000 });
      await expect(page.locator('.kakao-escape-hint')).toContainText(hint);
      await expect(page.locator('.kakao-escape-open')).toHaveAttribute('href', tried[0]);
      await expect(page.locator('.kakao-escape-open')).toBeFocused();
    });

    test('다시 열려도(새로고침) 자동 이동을 되풀이하지 않고 안내만 보이며, «여기서 계속하기»로 앱을 쓸 수 있다', async ({ page }) => {
      const tried = [];
      page.on('request', (r) => { if (isExternal(r.url())) tried.push(r.url()); });
      await page.goto('/');
      await expect.poll(() => tried.length).toBe(1);
      await page.reload();
      await expect(page.locator('#kakao-escape-title')).toHaveText('바깥 브라우저에서 열어 주세요');
      await page.waitForTimeout(2500);
      expect(tried).toHaveLength(1);
      await page.locator('.kakao-escape-stay').click();
      await expect(page.locator('#kakao-escape')).toHaveCount(0);
      await page.locator('#splash').waitFor({ state: 'detached' });
      await expect(page.getByRole('button', { name: 'SF 더빙 시작', exact: true })).toBeVisible();
    });
  });
}

for (const [name, ua] of [['아이폰 사파리', UA.safari], ['갤럭시 크롬', UA.chrome]]) {
  test.describe(name, () => {
    test.use({ userAgent: ua, viewport: { width: 390, height: 664 }, isMobile: true, hasTouch: true });
    test('카카오톡이 아니면 안내도 이동도 없다', async ({ page }) => {
      const tried = [];
      page.on('request', (r) => { if (isExternal(r.url())) tried.push(r.url()); });
      await page.goto('/');
      await page.locator('#splash').waitFor({ state: 'detached' });
      await page.waitForTimeout(1000);
      await expect(page.locator('#kakao-escape')).toHaveCount(0);
      expect(tried).toHaveLength(0);
    });
  });
}
