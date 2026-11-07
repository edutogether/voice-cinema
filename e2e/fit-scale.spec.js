import { test, expect } from '@playwright/test';
import { pauseScenes } from './pause-scenes.js';

// 해상도별 화면 맞춤(public/fit.js, 11/7 Bumm님 «2560 화면을 기준으로 모든 해상도를 그것처럼», Poster Studio 방식): 세로 휴대폰은 폭 390에 맞춰 줄이고 키운다.
// PC · 태블릿은 실제 크기 그대로 쓰고 키우지 않으며, 폭 768 · 높이 640 아래에서만 그만큼 줄여 한 화면짜리 화면이 스크롤 없이 다 든다.
// 옛 방식은 1280×587 · 1366×635 창에서 첫 페이지 · 녹음실이 640px로 넘쳤다(옛 빌드 조사 12건).
const cases = [
  // [폭, 높이, 터치, 화면 종류, 그리는 폭, 그리는 높이]
  [2560, 1440, false, 'pc', 2560, 1440],
  [1920, 1080, false, 'pc', 1920, 1080],
  [1366, 768, false, 'pc', 1366, 768],
  [1280, 587, false, 'pc', 1396, 640],
  [1366, 1024, true, 'tablet', 1366, 1024],
  [1024, 1366, true, 'tablet', 1024, 1366],
  [768, 1024, true, 'tablet', 768, 1024],
  [390, 844, true, 'phone', 390, 844],
  [360, 640, true, 'phone', 390, 693],
];

for (const [width, height, touch, kind, layoutW, layoutH] of cases) {
  test(`${width}×${height}${touch ? ' 터치' : ''}: ${kind} 규칙으로 맞추고, 첫 페이지 · 녹음실이 가로 · 세로로 넘치지 않는다`, async ({ browser }) => {
    test.setTimeout(60000);
    const page = await browser.newPage({ viewport: { width, height }, hasTouch: touch, isMobile: touch });
    await page.goto('/');
    await page.locator('#splash').waitFor({ state: 'detached' });
    const fit = await page.evaluate(() => {
      const root = document.documentElement, s = getComputedStyle(root);
      return { kind: root.dataset.fit, k: parseFloat(s.getPropertyValue('--fit')), w: parseFloat(s.getPropertyValue('--app-w')), h: parseFloat(s.getPropertyValue('--app-h')), zoom: document.body.style.zoom };
    });
    expect(fit.kind).toBe(kind);
    expect(Math.round(fit.w)).toBe(layoutW);
    expect(Math.abs(fit.h - layoutH)).toBeLessThanOrEqual(1);
    // 그리는 폭과 창 폭이 같으면 아무것도 바꾸지 않는다
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

test('마우스로 쓰는 좁은 창(세로)은 휴대폰 규칙(폭 390)을 쓴다', async ({ browser }) => {
  const page = await browser.newPage({ viewport: { width: 390, height: 844 } });
  await page.goto('/');
  await page.locator('#splash').waitFor({ state: 'detached' });
  expect(await page.evaluate(() => [document.documentElement.dataset.fit, document.body.style.zoom])).toEqual(['phone', '']);
  await page.close();
});

// PC 웹(11/7 Bumm님 «640 480 화면으로 해상도 깨진 윈도우마냥 다 커져 있네» · «위아래로 잘려 있어» · «포스터랑 똑같이 맞춰»).
// 창 크기는 흔한 화면 · Windows 배율에서 크롬 탭 · 주소창 · 작업 표시줄(135)을 뺀 실제 값이다.
for (const [width, height] of [[1280, 585], [1366, 633], [1536, 729], [1707, 825], [1920, 945], [2048, 1017], [2560, 1305], [3840, 2025]]) {
  test(`PC ${width}×${height}: 키우지 않고, 스플래시는 Poster Studio와 같고, 가운데 영상과 그림 띠는 16:9 그대로다`, async ({ browser }) => {
    const page = await browser.newPage({ viewport: { width, height } });
    await page.goto('/');
    await page.locator('#splash .logo img').waitFor();
    // Poster Studio PC 스플래시를 잰 값: 아이콘 72 · 이름 높이 45 · 로딩바 190 · 교육청 로고 190. 작은 창에서도 줄이지 않는다.
    const splash = await page.evaluate(async () => {
      await Promise.all(document.querySelector('#splash .logo').getAnimations().map(animation => animation.finished));
      const size = (selector) => { const r = document.querySelector(selector).getBoundingClientRect(); return [Math.round(r.width), Math.round(r.height)]; };
      return { logo: size('#splash .logo img'), nameHeight: size('#splash .name')[1], bar: size('#splash .sbar')[0], education: size('#splash .splash-education')[0] };
    });
    expect(splash).toEqual({ logo: [72, 72], nameHeight: 45, bar: 190, education: 190 });

    await page.locator('#splash').waitFor({ state: 'detached' });
    await pauseScenes(page);
    const fit = await page.evaluate(() => parseFloat(getComputedStyle(document.documentElement).getPropertyValue('--fit')));
    expect(fit).toBeCloseTo(Math.min(1, width / 768, height / 640), 3);
    const header = await page.locator('.festival-header').boundingBox();
    expect(header.height, '머리글이 화면 크기를 따라 커졌다').toBeLessThanOrEqual(81);

    const media = await page.locator('.scene-shell.is-current .tile-media').boundingBox();
    expect(Math.abs(media.width * 9 / 16 - media.height), '가운데 영상 칸이 영화 비율이 아니다(cover가 잘라 낸다)').toBeLessThan(1.5);
    const thumb = await page.locator('.scene-choice img').first().boundingBox();
    expect(Math.abs(thumb.width * 9 / 16 - thumb.height), '그림 띠가 영화 비율이 아니다').toBeLessThan(1.5);

    // 왼쪽 안내와 오른쪽 그림 띠의 구분선은 같은 높이, 영화제 두 줄은 안내 글 아래에 겹치지 않는다
    const guide = await page.locator('.chart-guide').boundingBox();
    const line = await page.locator('.scene-navigation').boundingBox();
    expect(Math.abs(guide.y - line.y), '두 구분선이 어긋난다').toBeLessThanOrEqual(1);
    const guideText = await page.locator('.chart-guide p').boundingBox();
    const footer = await page.locator('#home .cinema-footer').boundingBox();
    expect(footer.y, '영화제 두 줄이 안내 글과 겹친다').toBeGreaterThanOrEqual(guideText.y + guideText.height);

    expect(await page.evaluate(() => ({ x: document.documentElement.scrollWidth - window.innerWidth, y: document.documentElement.scrollHeight - window.innerHeight }))).toEqual({ x: 0, y: 0 });
    await page.close();
  });
}

test('창 크기가 바뀌면 다시 맞춘다 — 2560에서 1280×587로 줄이면 그리는 폭이 2560에서 1396이 된다', async ({ browser }) => {
  const page = await browser.newPage({ viewport: { width: 2560, height: 1440 } });
  await page.goto('/');
  await page.locator('#splash').waitFor({ state: 'detached' });
  await page.setViewportSize({ width: 1280, height: 587 });
  await expect.poll(() => page.evaluate(() => Math.round(parseFloat(getComputedStyle(document.documentElement).getPropertyValue('--app-w'))))).toBe(1396);
  expect(await page.evaluate(() => document.documentElement.scrollHeight - window.innerHeight)).toBe(0);
  await page.close();
});

// 창을 줄이는 순간 앞 크기의 화면이 넘쳐 세로 스크롤 막대가 잠깐 생기고, fit.js가 그 폭을 뺀 너비로 비율을 정한 채 남던 결함
// (10/28 설치판에서 발견 — 웹에도 있다). 폭이 비율을 정하는 창이어야 막대 폭이 비율에 드러난다(740×800이면 막대가 있을 때 0.944, 없을 때 0.9635). Playwright 헤드리스는 기본으로
// 스크롤 막대를 숨겨(--hide-scrollbars) 이 모양이 드러나지 않는다 — 이 검사만 막대를 켠 브라우저를 따로 띄운다.
test('스크롤 막대가 있는 창을 줄여도 비율이 같은 크기로 새로 연 화면과 같다 — 740×900에서 740×800', async ({ playwright }) => {
  const { baseURL } = test.info().project.use;
  const browser = await playwright.chromium.launch({ ignoreDefaultArgs: ['--hide-scrollbars'] });
  const zoom = (page) => page.evaluate(() => document.body.style.zoom);
  const appH = (page) => page.evaluate(() => parseFloat(getComputedStyle(document.documentElement).getPropertyValue('--app-h')));
  try {
    const fresh = await browser.newPage({ viewport: { width: 740, height: 800 } });
    await fresh.goto(`${baseURL}/`);
    await fresh.locator('#splash').waitFor({ state: 'detached' });
    const expected = await zoom(fresh);
    await fresh.close();

    const page = await browser.newPage({ viewport: { width: 740, height: 900 } });
    await page.goto(`${baseURL}/`);
    await page.locator('#splash').waitFor({ state: 'detached' });
    const before = await appH(page);
    await page.setViewportSize({ width: 740, height: 800 });
    // 줄인 뒤 첫 맞춤(기준 화면 높이가 바뀜)을 기다린 다음, 막대가 사라진 뒤의 비율을 본다
    await expect.poll(() => appH(page)).not.toBe(before);
    await expect.poll(() => zoom(page)).toBe(expected);
    expect(await page.evaluate(() => document.documentElement.clientWidth)).toBe(740);
  } finally {
    await browser.close();
  }
});
