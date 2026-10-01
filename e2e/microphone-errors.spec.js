import { test, expect } from '@playwright/test';

for (const [name, reason, hint] of [
  ['NotAllowedError', 'denied', '마이크 접근이 차단'],
  ['NotFoundError', 'missing', '연결된 마이크를 찾지'],
  ['NotReadableError', 'busy', '마이크를 열지'],
]) {
  test(`${name}: 실제 마이크 실패 원인을 표시하고 다시 누르면 녹음한다`, async ({ page }) => {
    await page.addInitScript(errorName => {
      const request = navigator.mediaDevices.getUserMedia.bind(navigator.mediaDevices);
      let failed = false;
      navigator.mediaDevices.getUserMedia = constraints => {
        if (!failed) {
          failed = true;
          return Promise.reject(new window.DOMException('검사 중 재현한 마이크 오류', errorName));
        }
        return request(constraints);
      };
    }, name);
    await page.goto('/');
    await page.locator('#splash').waitFor({ state: 'detached' });
    await page.getByRole('button', { name: '판타지 더빙 시작', exact: true }).click();
    await page.locator('#recBtn').click();
    await expect(page.locator('#hint')).toHaveAttribute('data-mic-error', reason);
    await expect(page.locator('#hint')).toContainText(hint);
    await expect(page.locator('#recBtn')).toBeEnabled();
    await page.locator('#recBtn').click();
    await expect(page.locator('#count')).toHaveAttribute('aria-label', '3초 뒤 녹음 시작');
    await expect(page.locator('#recpill')).toBeVisible({ timeout: 5000 });
    await expect(page.locator('#afterRow')).toBeVisible({ timeout: 15000 });
  });
}

test('녹음 API가 없는 브라우저를 권한 거부로 오인하지 않는다', async ({ page }) => {
  await page.addInitScript(() => { window.MediaRecorder = undefined; });
  await page.goto('/');
  await page.locator('#splash').waitFor({ state: 'detached' });
  await page.getByRole('button', { name: '판타지 더빙 시작', exact: true }).click();
  await page.locator('#recBtn').click();
  await expect(page.locator('#hint')).toHaveAttribute('data-mic-error', 'unsupported');
  await expect(page.locator('#hint')).toContainText('Chrome 또는 Safari');
  await expect(page.locator('#recBtn')).toBeEnabled();
});

test('연결이 끊긴 마이크는 다시 얻어 다음 참가자가 녹음한다', async ({ page }) => {
  await page.addInitScript(() => {
    const request = navigator.mediaDevices.getUserMedia.bind(navigator.mediaDevices);
    window.micRequests = 0;
    navigator.mediaDevices.getUserMedia = async constraints => {
      window.micRequests++;
      const stream = await request(constraints);
      window.testMic = stream;
      return stream;
    };
  });
  await page.goto('/');
  await page.locator('#splash').waitFor({ state: 'detached' });
  await page.getByRole('button', { name: '판타지 더빙 시작', exact: true }).click();
  await page.locator('#recBtn').click();
  await expect(page.locator('#afterRow')).toBeVisible({ timeout: 20000 });
  await page.evaluate(() => window.testMic.getTracks().forEach(track => track.stop()));
  await page.locator('#resetBtn').click();
  await page.locator('#recBtn').click();
  await expect(page.locator('#recpill')).toBeVisible({ timeout: 5000 });
  expect(await page.evaluate(() => window.micRequests)).toBe(2);
  await expect(page.locator('#afterRow')).toBeVisible({ timeout: 15000 });
});
