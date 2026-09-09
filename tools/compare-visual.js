// 전환 전(태그 워크트리)과 전환 후(빌드 산출물)의 화면을 기계적으로 비교한다.
//
// "체감까지 동일"을 눈대중이 아니라 숫자로 증명하기 위한 도구다. 각 화면의 주요
// 요소마다 위치·크기와 computed style(색·폰트·여백·모서리·그림자·전환/애니메이션
// 타이밍 등)을 뽑아 두 쪽을 대조한다.
//
// 사용법: node tools/compare-visual.js <옛주소> <새주소>
//
// 주의: 2026-09-09 대표 지시로 홈 화면의 제목·부제목·개인정보처리방침 크기와 위치를
// 의도적으로 바꿨다. 그래서 전환 전 태그와 대조하면 .brand h1 / .tagline-top /
// .privacylink / .grid에서 차이가 나는 게 정상이다 — 회귀가 아니다.
import { chromium } from '@playwright/test';

const OLD_URL = process.argv[2] || 'http://localhost:4322';
const NEW_URL = process.argv[3] || 'http://localhost:4321';

// 비교할 CSS 속성. 레이아웃·색·타이포뿐 아니라 애니메이션/전환 타이밍까지 본다 —
// 체감이 달라지는 건 대개 여기다.
const PROPS = [
  'display', 'position', 'width', 'height', 'margin', 'padding',
  'color', 'background-color', 'background-image', 'border', 'border-radius',
  'box-shadow', 'opacity', 'font-family', 'font-size', 'font-weight',
  'line-height', 'letter-spacing', 'text-align', 'text-decoration-line',
  'flex-direction', 'align-items', 'justify-content', 'gap',
  'grid-template-columns', 'grid-template-rows', 'aspect-ratio',
  'transition-property', 'transition-duration', 'transition-timing-function',
  'animation-name', 'animation-duration', 'animation-timing-function',
  'animation-iteration-count', 'object-fit', 'mix-blend-mode', 'z-index',
  'overflow-x', 'overflow-y', 'transform',
];

const SCREENS = [
  {
    name: '홈',
    prepare: async () => {},
    selectors: [
      'body', '.wrap', '#home', '.brand', '.brand h1', '.brand h1 .gold', '.tagline-top',
      '.grid', '.tile', '.tile-media', '.tile-media .thumb', '.tile-media .preview',
      '.tile-tint', '.tile-scrim', '.tile-body', '.tile-body .gname-row', '.tile-body .ic',
      '.tile-body .ic svg', '.tile-body .gname', '.tile-body .gsub', '.privacylink', '.enginebar', '.enginebar b',
    ],
  },
  {
    name: '스튜디오(초기)',
    prepare: async (page) => {
      await page.locator('.tile', { hasText: '판타지' }).click();
      await page.waitForTimeout(400);
    },
    selectors: [
      '#studio', '.topbar', '.back', '.chip', '.chip .e', '.chip .e svg', '#chipName',
      '.stage', '.stage video', '.progress', '.progress > i', '.controls', '.hint',
      '#previewBtn', '#recBtn', '#recBtn .ic', '.footer',
    ],
  },
  {
    name: '스튜디오(녹음 완료)',
    prepare: async (page) => {
      await page.locator('.tile', { hasText: '판타지' }).click();
      await page.waitForTimeout(300);
      await page.locator('#recBtn').click();
      // 카운트다운 3초 + 클립 10초가 끝나 버튼 묶음이 나타날 때까지 기다린다.
      await page.locator('#afterRow').waitFor({ state: 'visible', timeout: 30000 });
    },
    selectors: [
      '#afterRow', '#afterRow button:nth-child(1)', '#afterRow button:nth-child(2)',
      '#afterRow button:nth-child(3)', '.hint', '.progress', '.controls', '.stage',
    ],
  },
  {
    name: '홈(모바일)',
    viewport: { width: 375, height: 812 },
    prepare: async () => {},
    selectors: [
      'body', '.wrap', '#home', '.brand', '.brand h1', '.tagline-top',
      '.grid', '.tile', '.tile-body', '.tile-body .gname', '.tile-body .gsub', '.privacylink',
    ],
  },
  {
    name: '스튜디오(미리보기 중)',
    prepare: async (page) => {
      await page.locator('.tile', { hasText: '판타지' }).click();
      await page.waitForTimeout(300);
      await page.locator('#previewBtn').click();
      await page.waitForTimeout(600);
    },
    selectors: ['.progress', '.progress > i', '.hint', '#previewBtn'],
  },
];

async function captureWithSelectors(browser, baseURL) {
  const out = {};
  for (const screen of SCREENS) {
    const page = await browser.newPage({
      viewport: screen.viewport ?? { width: 1440, height: 900 },
      permissions: ['microphone'],
    });
    await page.addInitScript((sels) => {
      window.__SELECTORS__ = sels;
      // 엔진 배너가 한 번이라도 켜졌는지 처음부터 지켜본다 — 나중에 확인하면
      // 이미 켜졌다 꺼진 뒤라 "아직 안 켜진 상태"와 구분할 수 없다.
      window.__barShown = false;
      setInterval(() => {
        if (document.querySelector('.enginebar')?.classList.contains('show')) window.__barShown = true;
      }, 16);
    }, screen.selectors);
    await page.goto(baseURL, { waitUntil: 'load' });
    // 고정 시간으로 기다리면 두 쪽의 로딩 속도 차이가 그대로 차이로 잡힌다.
    // 스플래시가 사라지고 엔진 준비가 끝난 "정착 상태"에서 비교한다.
    // (스플래시가 사라지는 시점 자체는 tools/compare-visual.js가 아니라 별도 실측으로 확인한다.)
    await page.waitForFunction(() => !document.getElementById('splash'), null, { timeout: 30000 });
    // 배너가 "켜졌다가 꺼질 때"까지 기다린다 — 꺼진 것만 보면 아직 켜지기 전
    // 순간을 정착 상태로 오해해 초기값(0%)을 잡는다.
    await page.waitForFunction(
      () => window.__barShown && !document.querySelector('.enginebar')?.classList.contains('show'),
      null,
      { timeout: 180000 }
    );
    await screen.prepare(page);
    out[screen.name] = await page.evaluate((props) => {
      const data = {};
      for (const sel of window.__SELECTORS__) {
        const el = document.querySelector(sel);
        if (!el) { data[sel] = null; continue; }
        const cs = getComputedStyle(el);
        const box = el.getBoundingClientRect();
        const entry = {
          // 문서 절대좌표로 본다 — 뷰포트 기준이면 스크롤 위치만 달라도 차이로 잡힌다.
          box: [
            Math.round(box.x + window.scrollX),
            Math.round(box.y + window.scrollY),
            Math.round(box.width),
            Math.round(box.height),
          ],
          // 컨테이너의 textContent는 자식들을 이어붙인 것이라 마크업 방식만 달라도
          // 차이가 난다(숨겨진 요소 포함). 실제로 보이는 글자는 잎 요소에서 비교한다.
          isLeaf: el.children.length === 0,
          // 마크업 방식이 달라 공백만 다른 건 화면 차이가 아니다 — 공백을 정규화해 비교한다.
          text: el.children.length === 0 ? (el.textContent || '').replace(/\s+/g, ' ').trim().slice(0, 80) : '(컨테이너)',
        };
        for (const p of props) entry[p] = cs.getPropertyValue(p);
        data[sel] = entry;
      }
      return data;
    }, PROPS);
    await page.close();
  }
  return out;
}

// 녹음 상태까지 비교하려면 마이크가 필요하다 — E2E와 같은 내장 가짜 장치를 쓴다.
const browser = await chromium.launch({
  args: ['--use-fake-device-for-media-stream', '--use-fake-ui-for-media-stream'],
});
const before = await captureWithSelectors(browser, OLD_URL);
const after = await captureWithSelectors(browser, NEW_URL);
await browser.close();

let diffs = 0;
for (const screen of Object.keys(before)) {
  for (const sel of Object.keys(before[screen])) {
    const a = before[screen][sel];
    const b = after[screen][sel];
    if (a === null && b === null) continue;
    if (a === null || b === null) {
      console.log(`[${screen}] ${sel}: ${a === null ? '전환 전에 없음' : '전환 후에 없음'}`);
      diffs++;
      continue;
    }
    for (const key of Object.keys(a)) {
      // 진행바 폭은 영상 재생 위치라 표본 시점마다 달라진다 — 값이 아니라 존재만 본다.
      if (sel === '.progress > i' && (key === 'width' || key === 'box')) continue;
      const av = JSON.stringify(a[key]);
      const bv = JSON.stringify(b[key]);
      if (av !== bv) {
        console.log(`[${screen}] ${sel} · ${key}\n    전: ${av}\n    후: ${bv}`);
        diffs++;
      }
    }
  }
}
console.log(diffs === 0 ? '\n차이 없음 — 두 화면의 계산된 스타일과 위치가 완전히 동일합니다.' : `\n차이 ${diffs}건`);
