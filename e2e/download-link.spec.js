import { test, expect } from '@playwright/test';

// 첫 화면 오른쪽 위 설치 파일 아이콘(11/7 Bumm님, Poster Studio와 같은 모양). 누르기 전에는 설치 파일을 하나도 받지 않고,
// 휴대폰 · 설치판 안에서는 보이지 않는다.
const HREF = '/download/VoiceCinema-Setup.exe';

test('PC: 방침 링크 바로 왼쪽의 아이콘 하나이고, 누르기 전에는 받지 않으며, 누르면 받는다', async ({ page }) => {
  await page.setViewportSize({ width: 1366, height: 768 });
  const requested = [];
  await page.route(`**${HREF}`, (route) => {
    requested.push(route.request().url());
    return route.fulfill({ status: 200, contentType: 'application/vnd.microsoft.portable-executable', headers: { 'Content-Disposition': 'attachment; filename="Voice Cinema Setup.exe"' }, body: 'MZ' });
  });
  await page.goto('/');
  await page.locator('#splash').waitFor({ state: 'detached' });

  const link = page.locator('.download-link');
  await expect(link).toBeVisible();
  await expect(link).toHaveAttribute('href', HREF);
  await expect(link).toHaveAttribute('download', 'Voice Cinema Setup.exe');
  await expect(link).toHaveAttribute('aria-label', 'Voice Cinema 설치 파일 다운로드');
  await expect(link).not.toHaveAttribute('title', /.*/);
  await expect(link).toHaveText('');

  const icon = await link.boundingBox();
  const privacy = await page.locator('.privacylink').boundingBox();
  expect(Math.abs(privacy.x - (icon.x + icon.width) - 8), '방침 링크와의 간격이 8px이 아니다').toBeLessThan(.5);
  expect(Math.abs((privacy.y + privacy.height / 2) - (icon.y + icon.height / 2)), '방침 글자와 같은 줄이 아니다').toBeLessThan(1);
  const svg = await link.locator('svg').boundingBox();
  expect(Math.abs(svg.width - 13.8), '아이콘 크기가 방침 글자의 1.15배가 아니다').toBeLessThan(.5);

  // 색은 방침 글자와 같고, 마우스를 올려도 커서만 바뀐다
  const look = () => link.evaluate((el) => { const s = getComputedStyle(el); return { color: s.color, line: s.textDecorationLine, cursor: s.cursor }; });
  const before = await look();
  expect(before).toEqual({ color: await page.locator('.privacylink').evaluate((el) => getComputedStyle(el).color), line: 'none', cursor: 'pointer' });
  await link.hover();
  expect(await look()).toEqual(before);

  await page.waitForTimeout(1500);
  expect(requested, '누르기 전에 설치 파일을 받았다').toEqual([]);
  const [download] = await Promise.all([page.waitForEvent('download'), link.click()]);
  expect(download.suggestedFilename()).toBe('Voice Cinema Setup.exe');
  await download.cancel();
});

for (const [name, width, height] of [['세로 휴대폰', 390, 844], ['가로 휴대폰', 844, 340]]) {
  test(`${name}: 아이콘이 보이지 않고 방침 링크는 그대로다`, async ({ browser }) => {
    const page = await browser.newPage({ viewport: { width, height }, hasTouch: true, isMobile: true });
    await page.goto('/');
    await page.locator('#splash').waitFor({ state: 'detached' });
    await expect(page.locator('.download-link')).toBeHidden();
    await expect(page.locator('.privacylink')).toBeVisible();
    await page.close();
  });
}

test('태블릿: 아이콘이 보이고 누르는 칸은 방침 링크를 덮지 않는다', async ({ browser }) => {
  const page = await browser.newPage({ viewport: { width: 1024, height: 768 }, hasTouch: true, isMobile: true });
  await page.goto('/');
  await page.locator('#splash').waitFor({ state: 'detached' });
  const box = await page.locator('.download-link').boundingBox();
  const privacy = await page.locator('.privacylink').boundingBox();
  expect(box.height, '누르는 칸의 높이').toBeGreaterThanOrEqual(40);
  expect(box.x + box.width, '누르는 칸이 방침 링크를 덮는다').toBeLessThanOrEqual(privacy.x);
  await page.close();
});

test('설치판 안에서는 아이콘이 없다', async ({ browser }) => {
  const context = await browser.newContext({ viewport: { width: 1366, height: 768 }, userAgent: 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) voice-cinema/2.0.0 Chrome/146.0.0.0 Electron/44.9.3 Safari/537.36' });
  const page = await context.newPage();
  await page.goto('/');
  await page.locator('#splash').waitFor({ state: 'detached' });
  await expect(page.locator('.download-link')).toHaveCount(0);
  await expect(page.locator('.privacylink')).toBeVisible();
  await context.close();
});

test('서비스워커가 설치 파일을 미리 받거나 캐시하지 않는다', async ({ page }) => {
  const res = await page.request.get('/sw.js');
  const sw = await res.text();
  expect(sw).not.toContain('/download/');
  expect(sw).not.toContain('VoiceCinema-Setup');
});
