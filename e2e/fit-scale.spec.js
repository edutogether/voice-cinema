import { test, expect } from '@playwright/test';
import { pauseScenes } from './pause-scenes.js';

// 스플래시 배율 — 고정 크기(1)와 넓이 비율의 제곱근의 한가운데(11/8 Bumm님 «이전 거랑 지금의 중간 정도로», public/fit.js)
const splashScale = (width, height) => (1 + Math.sqrt((width * height) / (2560 * 1305))) / 2;
// 스플래시의 보이는 크기(등장 애니메이션이 끝난 뒤)와 스플래시 배율.
// 이름은 줄 높이가 아니라 화면에 그려지는 글자 크기(글꼴 크기 × 실제 배율)로 잰다 — 줄 높이(line-height normal)는 글꼴 크기마다
// 글꼴의 위 · 아래 높이를 따로 반올림해 배율과 1~2px 어긋난다(3840×2025에서 58px, 비례값 56.8px)
const splashSize = (page) => page.evaluate(async () => {
  await Promise.all(document.querySelector('#splash .logo').getAnimations().map(animation => animation.finished));
  const size = (selector) => { const r = document.querySelector(selector).getBoundingClientRect(); return [Math.round(r.width), Math.round(r.height)]; };
  const name = document.querySelector('#splash .name');
  return { scale: parseFloat(getComputedStyle(document.documentElement).getPropertyValue('--splash-scale')), logo: size('#splash .logo img'), nameFont: parseFloat(getComputedStyle(name).fontSize) * name.currentCSSZoom, bar: size('#splash .sbar')[0], education: size('#splash .splash-education')[0] };
});

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

// PC 웹(11/7 Bumm님 «640 480 화면으로 해상도 깨진 윈도우마냥 다 커져 있네» · «위아래로 잘려 있어» · «포스터랑 똑같이 맞춰», 스플래시는 11/8 «PC 2560 정도의 비율로»).
// 창 크기는 흔한 화면 · Windows 배율에서 크롬 탭 · 주소창 · 작업 표시줄(135)을 뺀 실제 값이다.
for (const [width, height] of [[1280, 585], [1366, 633], [1536, 729], [1707, 825], [1920, 945], [2048, 1017], [2560, 1305], [3840, 2025]]) {
  test(`PC ${width}×${height}: 키우지 않고, 스플래시는 2560×1305 기준 비율이고, 가운데 영상과 그림 띠는 16:9 그대로다`, async ({ browser }) => {
    const page = await browser.newPage({ viewport: { width, height } });
    await page.goto('/');
    await page.locator('#splash .logo img').waitFor();
    // 스플래시는 웹 PC 2560×1305 창의 크기(Poster Studio PC와 같은 아이콘 72 · 이름 글자 38 · 로딩바 190 · 교육청 로고 190)를 창 넓이 비율로 줄이고 키운다
    // (11/8 Bumm님 «PC 2560 정도의 비율로») — 고정 크기였을 때는 작은 창(설치판 1280×587)에서 화면의 두 배 남짓을 차지했다
    const splash = await splashSize(page);
    const k = splashScale(width, height);
    expect(splash.scale).toBeCloseTo(k, 3);
    for (const [label, got, base] of [['아이콘 폭', splash.logo[0], 72], ['아이콘 높이', splash.logo[1], 72], ['이름 글자', splash.nameFont, 38], ['로딩바', splash.bar, 190], ['교육청 로고', splash.education, 190]]) {
      expect(Math.abs(got - base * k), `${label}: ${got}, 기대 ${(base * k).toFixed(1)}`).toBeLessThanOrEqual(1);
    }

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

// 패드도 2560×1305 기준 비율이다(11/8 Bumm님 «PC · 패드 다른 비율도») — 창 넓이로 재므로 같은 패드를 가로 · 세로로 돌려도 스플래시 크기가 같다
for (const [width, height] of [[1280, 800], [800, 1280], [1024, 768], [768, 1024]]) {
  test(`패드 ${width}×${height}: 스플래시는 2560×1305 기준 비율이다`, async ({ browser }) => {
    const page = await browser.newPage({ viewport: { width, height }, hasTouch: true, isMobile: true });
    await page.goto('/');
    await page.locator('#splash .logo img').waitFor();
    expect(await page.evaluate(() => document.documentElement.dataset.fit)).toBe('tablet');
    const splash = await splashSize(page);
    const k = splashScale(width, height);
    for (const [label, got, base] of [['아이콘', splash.logo[0], 72], ['이름 글자', splash.nameFont, 38], ['로딩바', splash.bar, 190], ['교육청 로고', splash.education, 190]]) {
      expect(Math.abs(got - base * k), `${label}: ${got}, 기대 ${(base * k).toFixed(1)}`).toBeLessThanOrEqual(1);
    }
    await page.close();
  });
}

// 설치판은 창이 열린 뒤 작업 영역 크기로 커진다(desktop/main.js) — 스플래시가 떠 있는 동안 창 크기가 바뀌어도 새 크기의 비율을 따른다
test('스플래시가 떠 있는 동안 창 크기가 바뀌면 스플래시도 새 비율로 맞춘다 — 1366×860에서 1280×587', async ({ browser }) => {
  const page = await browser.newPage({ viewport: { width: 1366, height: 860 } });
  await page.goto('/');
  await page.locator('#splash .logo img').waitFor();
  await page.setViewportSize({ width: 1280, height: 587 });
  const k = splashScale(1280, 587);
  await expect.poll(async () => (await splashSize(page)).bar).toBe(Math.round(190 * k));
  await page.close();
});

// 창을 줄이는 순간 앞 크기의 화면이 넘쳐 세로 스크롤 막대가 잠깐 생기고, fit.js가 그 폭을 뺀 너비로 비율을 정한 채 남던 결함
// (10/28 설치판에서 발견 — 웹에도 있다). 폭이 비율을 정하는 창이어야 막대 폭이 비율에 드러난다(740×800이면 막대가 있을 때 0.944, 없을 때 0.9635). Playwright 헤드리스는 기본으로
// 스크롤 막대를 숨겨(--hide-scrollbars) 이 모양이 드러나지 않는다 — 이 검사만 막대를 켠 브라우저를 따로 띄운다.
test('내용이 넘쳐 세로 스크롤 막대가 생겨도 가로로 넘치지 않는다 — 640×640', async ({ playwright }) => {
  const { baseURL } = test.info().project.use;
  const browser = await playwright.chromium.launch({ ignoreDefaultArgs: ['--hide-scrollbars'] });
  try {
    const page = await browser.newPage({ viewport: { width: 640, height: 640 } });
    await page.goto(`${baseURL}/`);
    await page.locator('#splash').waitFor({ state: 'detached' });
    const state = () => page.evaluate(() => {
      const d = document.documentElement;
      const appW = parseFloat(getComputedStyle(d).getPropertyValue('--app-w'));
      return { over: d.scrollWidth - d.clientWidth, clientW: d.clientWidth, appW, drawn: Math.round(appW * parseFloat(d.style.getPropertyValue('--fit'))) };
    });
    await page.evaluate(() => { const tall = document.createElement('div'); tall.id = 'tall'; tall.style.height = '2000px'; document.querySelector('.wrap').append(tall); });
    await expect.poll(async () => (await state()).clientW).toBeLessThan(640);
    await expect.poll(async () => (await state()).over, '막대 폭만큼 가로로 넘친다').toBe(0);
    await expect.poll(async () => (await state()).appW, '막대 때문에 휴대폰 배치로 내려가면 안 된다').toBeCloseTo(768, 1);
    // 내용이 줄어 막대가 사라져도 오른쪽에 빈 띠가 남지 않는다
    await page.evaluate(() => document.querySelector('#tall').remove());
    await expect.poll(async () => (await state()).clientW).toBe(640);
    await expect.poll(async () => (await state()).drawn, '오른쪽 빈 띠').toBe(640);
    expect((await state()).over).toBe(0);
  } finally {
    await browser.close();
  }
});

// 640×640에서 막대(15px) 자리를 빼지 않고 비율을 정하면 막대가 생길 때 앱 폭이 750이 되어 휴대폰 배치(760 이하)로 바뀐다. 그 배치에서는 내용이 들어가 막대가 사라지고, 사라지면 다시 넘쳐,
// 창을 건드리지 않아도 비율 · 앱 폭이 끝없이 오갔다(11/8 설치판 640×640 입력 오류 화면에서 발견 — 웹 공용 코드다). 큰 창에서 줄이는 경로는 그 순간 잠깐 생기는 막대까지 겹친다.
for (const from of [null, { width: 1366, height: 697 }]) {
  test(`막대가 생기면 배치가 바뀌어 내용이 들어가는 화면에서도 비율 · 앱 폭이 오가지 않는다 — ${from ? `${from.width}×${from.height}에서 줄인 ` : ''}640×640`, async ({ playwright }) => {
    const { baseURL } = test.info().project.use;
    const browser = await playwright.chromium.launch({ ignoreDefaultArgs: ['--hide-scrollbars'] });
    try {
      const page = await browser.newPage({ viewport: from ?? { width: 640, height: 640 } });
      await page.goto(`${baseURL}/`);
      await page.locator('#splash').waitFor({ state: 'detached' });
      await page.evaluate(() => {
        const app = document.querySelector('#root');
        for (const child of app.children) child.style.display = 'none';
        const style = document.createElement('style');
        style.textContent = '#tall { height:10px; } @container app (min-width:761px) { #tall { height:776px; } }';
        document.head.append(style);
        const tall = document.createElement('div');
        tall.id = 'tall';
        app.append(tall);
      });
      await page.setViewportSize({ width: 640, height: 640 });
      await expect.poll(() => page.evaluate(() => window.innerWidth)).toBe(640);
      const seen = await page.evaluate(async () => {
        const read = () => `${document.body.style.zoom} ${document.documentElement.style.getPropertyValue('--app-w')}`;
        await new Promise((done) => window.setTimeout(done, 500));
        const states = new Set();
        const end = performance.now() + 1500;
        while (performance.now() < end) {
          states.add(read());
          await new Promise((done) => requestAnimationFrame(done));
        }
        return [...states];
      });
      expect(seen, '창을 건드리지 않았는데 비율 · 앱 폭이 오간다').toHaveLength(1);
      const state = await page.evaluate(() => {
        const d = document.documentElement;
        const appW = parseFloat(d.style.getPropertyValue('--app-w'));
        return { over: d.scrollWidth - d.clientWidth, drawn: appW * parseFloat(d.style.getPropertyValue('--fit')), clientW: d.clientWidth, appW };
      });
      expect(state.over, '가로 넘침').toBe(0);
      expect(state.drawn, '오른쪽 빈 띠').toBeCloseTo(state.clientW, 0);
      expect(state.appW, '휴대폰 배치로 내려가면 안 된다').toBeGreaterThan(760);
    } finally {
      await browser.close();
    }
  });
}

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
