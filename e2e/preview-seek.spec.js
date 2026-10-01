import { test, expect } from '@playwright/test';

async function openPreview(page) {
  await page.goto('/');
  await page.locator('#splash').waitFor({ state: 'detached' });
  await page.getByRole('button', { name: '장면 흐름 일시정지', exact: true }).click();
  await page.locator('.scene-choice').filter({ hasText: '드라마' }).first().click();
  await page.locator('#previewBtn').click();
  await expect.poll(() => page.locator('#clip').evaluate(v => v.currentTime)).toBeGreaterThan(0);
}

test('진행바 클릭으로 앞뒤 이동하고 해당 지점부터 소리·자막을 재생한다', async ({ page }) => {
  await openPreview(page);
  const track = page.getByRole('slider', { name: '미리보기 위치' });
  const rect = await track.boundingBox();
  for (const fraction of [.7, .3]) {
    await track.click({ position: { x: rect.width * fraction, y: 12 } });
    await expect.poll(() => page.locator('#clip').evaluate((v, f) => Math.abs(v.currentTime - v.duration * f), fraction)).toBeLessThan(.35);
    expect(await page.locator('#clip').evaluate(v => !v.paused && !v.muted)).toBe(true);
  }
  await expect(page.locator('.studio-captions')).toContainText('너에게 진실을 말하고 싶었어.');
  await expect.poll(() => page.locator('#clip').evaluate(v => v.currentTime)).toBeGreaterThan(3.3);
});

test('잡아끄는 동안 프레임·시간이 앞뒤로 따라오고 놓으면 그 위치에서 재생한다', async ({ page }) => {
  await openPreview(page);
  const track = page.locator('#progress');
  const rect = await track.boundingBox();
  const y = rect.y + rect.height / 2;
  await page.mouse.move(rect.x + rect.width * .3, y);
  await page.mouse.down();
  for (const fraction of [.8, .2, .5]) {
    await page.mouse.move(rect.x + rect.width * fraction, y, { steps: 12 });
    await expect.poll(() => page.locator('#clip').evaluate((v, f) => !v.seeking && Math.abs(v.currentTime - v.duration * f) < .02, fraction)).toBe(true);
    expect(await page.locator('#clip').evaluate(v => v.paused)).toBe(true);
    await expect.poll(() => track.getAttribute('aria-valuenow')).toBe(String(fraction * 100));
  }
  // 캡처한 포인터가 막대 밖으로 나가도 경계에 고정되고 처음으로 초기화되지 않는다.
  await page.mouse.move(rect.x + rect.width + 20, y + 30);
  await expect.poll(() => page.locator('#clip').evaluate(v => v.currentTime)).toBeGreaterThan(9.9);
  await expect(page.locator('#previewBtn')).toContainText('미리보기 정지');
  await page.mouse.move(rect.x + rect.width * .4, y);
  await page.mouse.up();
  await expect.poll(() => page.locator('#clip').evaluate(v => !v.paused && v.currentTime > 4 && v.currentTime < 5)).toBe(true);
});

test('키보드 탐색을 지원하고 녹음 시작 뒤에는 진행바로 녹음 위치를 바꾸지 않는다', async ({ page }) => {
  await openPreview(page);
  const track = page.getByRole('slider', { name: '미리보기 위치' });
  await track.focus();
  await track.press('Home');
  await track.press('ArrowRight');
  await expect.poll(() => page.locator('#clip').evaluate(v => v.currentTime)).toBeGreaterThanOrEqual(.5);
  expect(await page.locator('#clip').evaluate(v => v.currentTime)).toBeLessThan(1);
  await page.locator('#recBtn').click();
  await expect(page.locator('#progress')).toHaveAttribute('role', 'progressbar');
  await expect(page.locator('#count')).toBeVisible();
  await page.locator('#progress').click();
  expect(await page.locator('#clip').evaluate(v => v.currentTime)).toBe(0);
  await expect(page.locator('#recpill')).toBeVisible();
  await page.locator('#progress').click();
  expect(await page.locator('#clip').evaluate(v => v.currentTime)).toBeLessThan(2);
  await page.locator('#studioBackBtn').click();
});

test.describe('휴대폰 터치', () => {
  test.use({ viewport: { width: 390, height: 844 }, hasTouch: true });
  test('진행바를 잡아 앞뒤로 탐색하고 놓으면 재생한다', async ({ page, context }) => {
  await page.goto('/');
  await page.locator('#splash').waitFor({ state: 'detached' });
  await page.getByRole('button', { name: '드라마 더빙 시작', exact: true }).tap();
  await page.locator('#previewBtn').tap();
  await expect.poll(() => page.locator('#clip').evaluate(v => v.currentTime)).toBeGreaterThan(0);
  const rect = await page.locator('#progress').boundingBox();
  const session = await context.newCDPSession(page);
  const touch = (fraction) => [{ x: rect.x + rect.width * fraction, y: rect.y + rect.height / 2 }];
  await session.send('Input.dispatchTouchEvent', { type: 'touchStart', touchPoints: touch(.3) });
  for (const fraction of [.7, .2]) {
    await session.send('Input.dispatchTouchEvent', { type: 'touchMove', touchPoints: touch(fraction) });
    await expect.poll(() => page.locator('#clip').evaluate((v, f) => !v.seeking && Math.abs(v.currentTime - v.duration * f) < .02, fraction)).toBe(true);
  }
  await session.send('Input.dispatchTouchEvent', { type: 'touchEnd', touchPoints: [] });
  await expect.poll(() => page.locator('#clip').evaluate(v => !v.paused && !v.muted)).toBe(true);
  });
});
