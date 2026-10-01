import { test, expect } from '@playwright/test';

async function openPreview(page, name = '드라마') {
  await page.goto('/');
  await page.locator('#splash').waitFor({ state: 'detached' });
  await page.getByRole('button', { name: '장면 흐름 일시정지', exact: true }).click();
  await page.locator('.scene-choice').filter({ hasText: name }).first().click();
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
    await expect.poll(() => page.locator('#clip').evaluate(v => !v.paused && !v.muted)).toBe(true);
  }
  await expect(page.locator('.studio-captions')).toContainText('너에게 진실을 말하고 싶었어.');
  await expect.poll(() => page.locator('#clip').evaluate(v => v.currentTime)).toBeGreaterThan(3.3);
});

for (const [genre, name] of [['fantasy', '판타지'], ['animation', '애니메이션'], ['horror', '호러'], ['action', '액션'], ['drama', '드라마'], ['sitcom', '시트콤']]) {
test(`${name}: 클릭·드래그로 앞뒤 탐색하고 선택 지점부터 재생한다`, async ({ page }) => {
  await openPreview(page, name);
  expect(await page.locator('#clip').evaluate(v => v.currentSrc)).toContain(`/clips/studio/${genre}.mp4`);
  const track = page.locator('#progress');
  const rect = await track.boundingBox();
  const y = rect.y + rect.height / 2;
  await track.click({ position: { x: rect.width * .6, y: rect.height / 2 } });
  await expect.poll(() => page.locator('#clip').evaluate(v => !v.paused && !v.muted && v.currentTime >= 6 && v.currentTime < 7)).toBe(true);
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
  await expect(page.locator('#previewBtn')).toContainText('계속 재생');
  await page.mouse.move(rect.x + rect.width * .4, y);
  await page.mouse.up();
  await expect.poll(() => page.locator('#clip').evaluate(v => !v.paused && v.currentTime > 4 && v.currentTime < 5)).toBe(true);
});

test(`${name}: 연속 드래그 중에도 실제 디코드 영상이 계속 갱신된다`, async ({ page }) => {
  await openPreview(page, name);
  const rect = await page.locator('#progress').boundingBox();
  await page.mouse.move(rect.x + rect.width * .1, rect.y + 12);
  await page.mouse.down();
  await expect(page.locator('.studio-scrub-frame')).toBeVisible();
  await page.evaluate(() => {
    window.decodedFrames = [];
    window.scrubPixels = [];
    const video = document.querySelector('#clip');
    const sample = (now, metadata) => {
      window.decodedFrames.push({ now, time: metadata.mediaTime });
      video.requestVideoFrameCallback(sample);
    };
    video.requestVideoFrameCallback(sample);
    const visibleFrame = document.querySelector('.studio-scrub-frame');
    const probe = document.createElement('canvas');
    probe.width = 32; probe.height = 18;
    const context = probe.getContext('2d', { willReadFrequently: true });
    const pixels = () => {
      if (visibleFrame.hidden || !visibleFrame.isConnected) return;
      context.drawImage(visibleFrame, 0, 0, 32, 18);
      const values = context.getImageData(0, 0, 32, 18).data;
      window.scrubPixels.push(values.reduce((hash, value) => (Math.imul(hash, 31) + value) | 0, 0));
      requestAnimationFrame(pixels);
    };
    pixels();
  });
  for (let i = 0; i < 80; i++) {
    const fraction = .1 + .8 * (i < 40 ? i / 40 : (80 - i) / 40);
    await page.mouse.move(rect.x + rect.width * fraction, rect.y + 12);
    await page.waitForTimeout(16);
  }
  const frames = await page.evaluate(() => window.decodedFrames);
  // currentTime 값만 바뀌는 가짜 통과를 막고 실제 표시 프레임을 센다.
  expect(frames.length).toBeGreaterThan(20);
  const gaps = frames.slice(1).map((frame, i) => frame.now - frames[i].now);
  expect(Math.max(...gaps)).toBeLessThan(500);
  expect(frames.some((frame, i) => i > 0 && frame.time < frames[i - 1].time)).toBe(true);
  // 손을 놓기 전, 화면 위에 표시한 캔버스의 실제 픽셀도 계속 달라야 한다.
  expect(await page.evaluate(() => new Set(window.scrubPixels).size)).toBeGreaterThan(20);
  await page.mouse.up();
  await expect.poll(() => page.locator('#clip').evaluate(v => !v.paused)).toBe(true);
  await expect(page.locator('.studio-scrub-frame')).toBeHidden();
});
}

test('영상 화면 클릭으로 시작·일시정지·같은 지점에서 재개하고 자막 버튼은 재생에 간섭하지 않는다', async ({ page }) => {
  await page.goto('/');
  await page.locator('#splash').waitFor({ state: 'detached' });
  await page.getByRole('button', { name: '장면 흐름 일시정지', exact: true }).click();
  await page.locator('.scene-choice').filter({ hasText: '드라마' }).first().click();
  const screen = page.locator('#screenPlaybackBtn');
  await expect(screen.locator('span')).toBeVisible();
  await screen.click();
  await expect.poll(() => page.locator('#clip').evaluate(v => !v.paused && !v.muted && v.currentTime > .2)).toBe(true);
  await screen.click();
  await expect(screen).toHaveAttribute('aria-label', '미리보기 계속 재생');
  const paused = await page.locator('#clip').evaluate(v => v.currentTime);
  await page.waitForTimeout(250);
  expect(await page.locator('#clip').evaluate(v => v.currentTime)).toBe(paused);
  await page.getByRole('button', { name: '원본 자막', exact: true }).click();
  expect(await page.locator('#clip').evaluate(v => v.paused)).toBe(true);
  await screen.press('Space');
  await expect.poll(() => page.locator('#clip').evaluate(v => !v.paused && v.currentTime)).toBeGreaterThan(paused);
  await page.locator('#recBtn').click();
  await expect(screen).toHaveCount(0);
  await expect(page.locator('#count')).toBeVisible();
  await page.locator('#studioBackBtn').click();
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
