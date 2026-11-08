import { test, expect } from '@playwright/test';

// 첫 화면에는 엔진 받기 표시와 새 버전 알림이 없다(2026-11-08 Bumm님 — 오른쪽 위 «영상 저장 준비 중… N%»와 오른쪽 아래 «새 버전이 있어요 · 새로고침»을 뺐다).
// 엔진(31MB)은 뒤에서 조용히 미리 받고(App.tsx), 받지 못하면 저장할 때 다시 받는다. 새 판은 다음에 열 때 적용된다(src/lib/sw.ts).
// 머리글 오른쪽 위 줄에는 정한 것만 있다 — 웹 PC는 설치 파일 아이콘 · 개인정보처리방침, 휴대폰은 설치 아이콘이 숨는다.

const ENGINE_WASM = '**/vendor/ffmpeg-core/ffmpeg-core.wasm';

for (const [name, options, row] of [
  ['PC 1440×900', { viewport: { width: 1440, height: 900 } }, ['download-link', 'privacylink']],
  ['세로 휴대폰 390×844', { viewport: { width: 390, height: 844 }, hasTouch: true, isMobile: true }, ['privacylink']],
]) {
  test(`${name}: 엔진을 받는 동안에도, 받지 못해도 첫 화면에 받기 표시가 없고 머리글 줄에는 정한 것만 있다`, async ({ browser }) => {
    for (const failed of [false, true]) {
      // 서비스워커는 막는다 — 엔진 요청을 가로채려면 페이지가 직접 받아야 한다
      const context = await browser.newContext({ ...options, serviceWorkers: 'block' });
      let asked = false;
      // 받는 중: 답하지 않고 붙잡아 둔다 · 받지 못함: 끊는다
      await context.route(ENGINE_WASM, (route) => { asked = true; return failed ? route.abort() : undefined; });
      const page = await context.newPage();
      const engineFailed = failed ? page.waitForEvent('console', { predicate: (m) => m.text().includes('[엔진 준비 실패]'), timeout: 60000 }) : null;
      await page.goto('/');
      await page.locator('#splash').waitFor({ state: 'detached' });
      await expect.poll(() => asked, { message: '엔진 받기가 시작되지 않았다 — 이 검사가 빈 검사가 됐다', timeout: 30000 }).toBe(true);
      if (engineFailed) await engineFailed;
      await page.waitForTimeout(500);

      const home = page.locator('#home');
      await expect(home.getByText(/준비 중|저장할 때 다시|\d+\s*%/), `받기 표시가 보인다(${failed ? '받지 못함' : '받는 중'})`).toHaveCount(0);
      await expect(page.locator('.enginebar, #enginebar, #engineProg')).toHaveCount(0);
      await expect(home.locator('[role="status"]')).toHaveCount(0);
      const shown = await page.locator('.header-links > *').evaluateAll((els) => els.filter((el) => el.getClientRects().length).map((el) => el.className));
      expect(shown, '머리글 오른쪽 위 줄').toEqual(row);
      await context.close();
    }
  });
}

// 새 판의 서비스워커가 이 탭을 맡는 순간(controllerchange)을 흉내 낸다 — 서비스워커가 무엇을 물어도 «새 판 있음»으로 답하게 하고 그 이벤트를 낸다.
// 11/8 전 코드는 이때 오른쪽 아래에 «새 버전이 있어요 · 새로고침»을 띄웠다(답이 없어도 3초 뒤에 띄웠다).
test('새 판의 서비스워커가 이 탭을 맡아도 «새 버전» 알림이 뜨지 않고, 저절로 새로고침하지도 않는다', async ({ page }) => {
  await page.setViewportSize({ width: 1440, height: 900 });
  await page.goto('/');
  await page.locator('#splash').waitFor({ state: 'detached' });
  await page.waitForFunction(() => !!navigator.serviceWorker.controller, null, { timeout: 30000 });
  await page.evaluate(() => {
    window.__같은문서 = true;
    const controller = navigator.serviceWorker.controller;
    controller.postMessage = (_data, ports) => ports?.[0]?.postMessage({ type: 'APP_VERSION_STATUS', updateAvailable: true });
    navigator.serviceWorker.dispatchEvent(new window.Event('controllerchange'));
  });
  await page.waitForTimeout(3500);
  await expect(page.getByText(/새 버전|새로고침/)).toHaveCount(0);
  expect(await page.evaluate(() => window.__같은문서 === true), '저절로 새로고침했다').toBe(true);
});
