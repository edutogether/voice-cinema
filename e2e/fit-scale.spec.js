import { test, expect } from '@playwright/test';
import { pauseScenes } from './pause-scenes.js';

// 해상도별 화면 맞춤(10/23 대표님 — 조직 표준 방식, public/fit.js): 화면 종류마다 기준 화면 하나(PC 1366 · 태블릿 가로 1024 · 세로 768 · 휴대폰 390)를
// 통째로 줄이고 키운다. PC · 태블릿은 높이 720보다 낮은 창에서 높이에 맞춰 더 줄여, 한 화면짜리 화면이 스크롤 없이 다 든다.
// 옛 방식은 1280×587 · 1366×635 창에서 첫 페이지 · 녹음실이 640px로 넘쳤다(옛 빌드 조사 12건).
const cases = [
  // [폭, 높이, 터치, 기준 화면 종류, 기준 화면 폭, 기준 화면 높이]
  [2560, 1440, false, '1366', 1366, 768],
  [1920, 1080, false, '1366', 1366, 768],
  [1366, 768, false, '1366', 1366, 768],
  [1280, 587, false, '1366', 1570, 720],
  [1366, 1024, true, '1024', 1024, 768],
  [1024, 1366, true, '768', 768, 1025],
  [390, 844, true, '390', 390, 844],
  [360, 640, true, '390', 390, 693],
];

for (const [width, height, touch, base, layoutW, layoutH] of cases) {
  test(`${width}×${height}${touch ? ' 터치' : ''}: 기준 화면 ${base}을 통째로 맞추고, 첫 페이지 · 녹음실이 가로 · 세로로 넘치지 않는다`, async ({ browser }) => {
    test.setTimeout(60000);
    const page = await browser.newPage({ viewport: { width, height }, hasTouch: touch, isMobile: touch });
    await page.goto('/');
    await page.locator('#splash').waitFor({ state: 'detached' });
    const fit = await page.evaluate(() => {
      const root = document.documentElement, s = getComputedStyle(root);
      return { base: root.dataset.fit, k: parseFloat(s.getPropertyValue('--fit')), w: parseFloat(s.getPropertyValue('--app-w')), h: parseFloat(s.getPropertyValue('--app-h')), zoom: document.body.style.zoom };
    });
    expect(fit.base).toBe(base);
    expect(Math.round(fit.w)).toBe(layoutW);
    expect(Math.abs(fit.h - layoutH)).toBeLessThanOrEqual(1);
    // 기준 폭과 같은 화면은 아무것도 바꾸지 않는다
    if (width === layoutW) expect(fit.zoom).toBe('');
    const overflow = () => page.evaluate(() => ({ x: document.documentElement.scrollWidth - window.innerWidth, y: document.documentElement.scrollHeight - window.innerHeight }));
    expect(await overflow()).toEqual({ x: 0, y: 0 });
    await pauseScenes(page);
    await page.locator('.scene-shell.is-current .tile').dispatchEvent('click');
    await expect(page.locator('#studio')).toHaveClass(/active/);
    await expect(page.locator('.studio-video-frame')).not.toHaveClass(/is-entering/);
    expect(await overflow()).toEqual({ x: 0, y: 0 });
    // 세로 화면 녹음실은 영상이 폭에 맞춘 16:9 그대로다 — 세로 태블릿도 회색 띠가 없다(10/23, 전에는 영상 틀이 남는 높이를 다 차지했다)
    if (height > width) {
      const frame = await page.locator('.studio-video-frame').boundingBox();
      expect(Math.abs(frame.width - width)).toBeLessThanOrEqual(1);
      expect(Math.abs(frame.height - width * 9 / 16)).toBeLessThanOrEqual(1);
    }
    await page.close();
  });
}

test('마우스로 쓰는 좁은 창(세로)은 PC 기준으로 줄이지 않고 휴대폰 기준(390)을 쓴다 — PC 기준이면 글자가 3분의 1로 줄어든다', async ({ browser }) => {
  const page = await browser.newPage({ viewport: { width: 390, height: 844 } });
  await page.goto('/');
  await page.locator('#splash').waitFor({ state: 'detached' });
  expect(await page.evaluate(() => [document.documentElement.dataset.fit, document.body.style.zoom])).toEqual(['390', '']);
  await page.close();
});

test('창 크기가 바뀌면 다시 맞춘다 — 2560에서 1280×587로 줄이면 기준 화면이 1366×768에서 1570×720이 된다', async ({ browser }) => {
  const page = await browser.newPage({ viewport: { width: 2560, height: 1440 } });
  await page.goto('/');
  await page.locator('#splash').waitFor({ state: 'detached' });
  await page.setViewportSize({ width: 1280, height: 587 });
  await expect.poll(() => page.evaluate(() => Math.round(parseFloat(getComputedStyle(document.documentElement).getPropertyValue('--app-w'))))).toBe(1570);
  expect(await page.evaluate(() => document.documentElement.scrollHeight - window.innerHeight)).toBe(0);
  await page.close();
});
