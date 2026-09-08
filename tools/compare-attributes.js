// 화면에 보이지 않는 값들을 전환 전/후로 대조한다.
//
// computed style·좌표 대조(tools/compare-visual.js)는 "보이는 것"만 본다. alt,
// aria-*, title, meta, href, lang, 그리고 <video>의 preload/playsinline/muted 같은
// 속성은 그 대조를 통과해도 조용히 바뀔 수 있는데, 마지막 둘은 재생 동작 자체를
// 좌우한다. 여기서 그 사각지대를 문자열로 직접 비교한다.
//
// 사용법: node tools/compare-attributes.js <옛주소> <새주소>
import { chromium } from '@playwright/test';

const OLD_URL = process.argv[2] || 'http://localhost:4322';
const NEW_URL = process.argv[3] || 'http://localhost:4321';

const SCREENS = [
  { name: '홈', prepare: async () => {} },
  {
    name: '스튜디오',
    prepare: async (page) => {
      await page.locator('.tile', { hasText: '판타지' }).click();
      await page.waitForTimeout(500);
    },
  },
  {
    name: '결과(폴백)',
    prepare: async (page) => {
      await page.route('**/voiceCinema/upload', (route) =>
        route.fulfill({ status: 500, contentType: 'application/json', body: '{"ok":false}' })
      );
      await page.locator('.tile', { hasText: '판타지' }).click();
      await page.locator('#recBtn').click();
      await page.locator('#afterRow').waitFor({ state: 'visible', timeout: 40000 });
      await page.locator('button', { hasText: '저장하기' }).click();
      await page.locator('#done').waitFor({ state: 'visible', timeout: 60000 });
    },
  },
];

// 화면에 안 보이지만 동작·접근성·SEO에 영향을 주는 것들.
//
// 요소를 문서 순서(index)로 짝지으면 안 된다 — 전환 전 DOM은 모든 화면의 요소를
// 숨긴 채 함께 들고 있고, 전환 후는 지금 화면 것만 그린다. 그래서 순서가 밀려
// 엉뚱한 것끼리 비교된다. **지금 보이는 요소만**, 그리고 id·경로·글자 같은
// 안정적인 키로 짝짓는다.
function collect() {
  const out = {};
  const norm = (s) => (s === null || s === undefined ? null : String(s).replace(/\s+/g, ' ').trim());
  const visible = (el) => el.getClientRects().length > 0;
  const key = (el) => el.id || el.getAttribute('class') || el.tagName.toLowerCase();

  out['html[lang]'] = document.documentElement.getAttribute('lang');
  out['title'] = norm(document.title);

  for (const m of document.querySelectorAll('meta')) {
    const k = m.getAttribute('name') || m.getAttribute('property') || m.getAttribute('http-equiv') || (m.hasAttribute('charset') ? 'charset' : '?');
    out[`meta[${k}]`] = m.getAttribute('content') ?? m.getAttribute('charset');
  }

  for (const el of document.querySelectorAll('img')) {
    if (!visible(el)) continue;
    const k = `img[${new URL(el.getAttribute('src') || '', location.href).pathname}]`;
    out[`${k}.alt`] = el.getAttribute('alt');
    out[`${k}.loading`] = el.getAttribute('loading');
    out[`${k}.decoding`] = el.getAttribute('decoding');
  }

  // <video>는 속성이 재생 동작을 좌우한다. muted는 리액트가 속성이 아니라
  // 프로퍼티로 넣으므로 둘 다 본다 — 실제 동작을 결정하는 건 프로퍼티다.
  for (const el of document.querySelectorAll('video')) {
    if (!visible(el)) continue;
    const k = `video[${key(el)}]`;
    for (const a of ['preload', 'autoplay', 'loop', 'controls', 'crossorigin', 'poster']) {
      out[`${k}.${a}`] = el.hasAttribute(a) ? el.getAttribute(a) || '(있음)' : null;
    }
    out[`${k}:muted`] = el.muted;
    out[`${k}:playsInline`] = el.playsInline;
    out[`${k}:hasSrc`] = !!el.getAttribute('src');
  }

  for (const el of document.querySelectorAll('a')) {
    if (!visible(el)) continue;
    const k = `a[${el.getAttribute('href')}]`;
    out[`${k}.target`] = el.getAttribute('target');
    out[`${k}.rel`] = el.getAttribute('rel');
    out[`${k}.text`] = norm(el.textContent);
  }

  for (const el of document.querySelectorAll('button')) {
    if (!visible(el)) continue;
    const k = `button[${norm(el.textContent)}]`;
    out[`${k}.disabled`] = el.disabled;
    out[`${k}.type`] = el.getAttribute('type');
    out[`${k}.id`] = el.id || null;
  }

  // 접근성 속성은 순서와 무관하게 "집합"으로 비교한다.
  const a11y = [];
  for (const el of document.querySelectorAll('*')) {
    if (!visible(el) && el.tagName !== 'META') continue;
    const attrs = [...el.attributes]
      .filter((a) => a.name.startsWith('aria-') || ['role', 'title', 'alt', 'lang'].includes(a.name))
      .map((a) => `${a.name}=${a.value}`)
      .sort();
    if (attrs.length) a11y.push(`${el.tagName.toLowerCase()} ${attrs.join(' ')}`);
  }
  out['a11y(집합)'] = a11y.sort();

  // 화면에 보이는 요소들의 id 집합. id는 눈에 안 보이지만 테스트·자동화·앵커가
  // 붙잡는 손잡이라, 조용히 사라지면 나중에 엉뚱한 곳에서 깨진다.
  out['id(집합)'] = [...document.querySelectorAll('[id]')].filter(visible).map((el) => el.id).sort();

  return out;
}

async function capture(browser, baseURL) {
  const out = {};
  for (const screen of SCREENS) {
    const page = await browser.newPage({ viewport: { width: 1440, height: 900 }, permissions: ['microphone'] });
    await page.goto(baseURL, { waitUntil: 'load' });
    await page.waitForFunction(() => !document.getElementById('splash'), null, { timeout: 30000 });
    await screen.prepare(page);
    out[screen.name] = await page.evaluate(collect);
    await page.close();
  }
  return out;
}

const browser = await chromium.launch({
  args: ['--use-fake-device-for-media-stream', '--use-fake-ui-for-media-stream'],
});
const before = await capture(browser, OLD_URL);
const after = await capture(browser, NEW_URL);
await browser.close();

let diffs = 0;
let checked = 0;
for (const screen of Object.keys(before)) {
  const keys = [...new Set([...Object.keys(before[screen]), ...Object.keys(after[screen])])].sort();
  for (const key of keys) {
    checked++;
    const a = JSON.stringify(before[screen][key] ?? null);
    const b = JSON.stringify(after[screen][key] ?? null);
    if (a !== b) {
      console.log(`[${screen}] ${key}\n    전: ${a}\n    후: ${b}`);
      diffs++;
    }
  }
}
console.log(`\n대조 ${checked}개 · 차이 ${diffs}건`);
