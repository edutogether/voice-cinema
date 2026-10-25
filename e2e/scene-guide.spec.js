// 자유 발화 안내(10/26 대표님) — 새 8편(새 시간표 ?scenes=next)은 상황 안내(크게) → 예시 대사(작게, «예시») → «내 말로 외쳐도 좋아요 !»를 보이고,
// 지금 원판(기본 주소 · 라이브의 5초 장면)에는 아무것도 붙지 않는다. 예시는 정답이 아니다 — 녹음은 무엇을 말했는지 보지 않고 예시와 다른 소리도 저장된다.
import { test, expect } from '@playwright/test';
import { openScene } from './pause-scenes.js';
import { installSyntheticMic, recordOnce } from './synthetic-mic.js';

const GUIDES = [
  ['SF', '첫인사를 건네 봐 !', '안녕 ! 우린 지구에서 왔어 !'],
  ['판타지', '지금이야, 외쳐 !', '그래 ! 내가 이긴다 !'],
  ['애니메이션', '미르에게 용기를 줘 !', '할 수 있어, 미르 ! 날아 !'],
  ['히어로', '기차를 멈춰 주세요 !', '멈춰라 ! 멈춰 !'],
  ['스릴러', '귀신을 물리쳐 !', '싫어 ! 저리 가 !'],
  ['드라마', '설이에게 약속해 줘 !', '설이야 ! 꼭 다시 올게 !'],
  ['스포츠', '승부를 끝내 !', '간다 ! 내가 끝낸다 !'],
  ['뮤지컬', '무대를 열어 !', '자, 다 같이 춤추자 !'],
];
const FREE = '내 말로 외쳐도 좋아요 !';
const IDLE_LIVE = "'장면 시작'을 누르면 장면이 흐르다 5초에 멈춰요. 3·2·1 뒤에 내 목소리로 외쳐 주세요 !";

test.describe.configure({ timeout: 120000 });

/** 안내 세 줄의 위치 · 글씨 크기 · 굵기 */
const layout = (guide) => guide.evaluate((el) => [...el.children].map((c) => {
  const cs = getComputedStyle(c);
  const r = c.getBoundingClientRect();
  return { top: r.top, bottom: r.bottom, size: parseFloat(cs.fontSize), weight: Number(cs.fontWeight), height: r.height };
}));
function expectHierarchy(rows, where) {
  const [situation, example, free] = rows;
  for (const row of rows) expect(row.height, where).toBeGreaterThan(0);
  // 위에서부터 상황 → 예시 → 보조
  expect(situation.bottom, where).toBeLessThanOrEqual(example.top + 1);
  expect(example.bottom, where).toBeLessThanOrEqual(free.top + 1);
  // 상황 안내가 가장 크고 굵다 — 예시는 상황보다 강조하지 않는다
  expect(situation.size, where).toBeGreaterThan(example.size);
  expect(situation.weight, where).toBeGreaterThan(example.weight);
  expect(example.size, where).toBeGreaterThan(free.size);
}

for (const [label, viewport] of [['PC 1440×900', { width: 1440, height: 900 }], ['휴대폰 390×844', { width: 390, height: 844 }], ['태블릿 세로 820×1180', { width: 820, height: 1180 }]]) {
  test(`${label}: 새 시간표는 8장르 모두 준비 화면에 상황 안내 → 예시(«예시») → «내 말로 외쳐도 좋아요 !» 순서와 크기로 보인다`, async ({ page }) => {
    await page.setViewportSize(viewport);
    await page.goto('/?scenes=next');
    await page.locator('#splash').waitFor({ state: 'detached' });
    for (const [name, situation, example] of GUIDES) {
      await openScene(page, name);
      await expect(page.locator('#studio')).toHaveClass(/active/);
      const guide = page.locator('.studio-guide-preview [data-testid="scene-guide"]');
      await expect(guide.getByTestId('scene-situation')).toHaveText(situation);
      await expect(guide.getByTestId('scene-example')).toHaveText(`예시${example}`);
      await expect(guide.getByTestId('scene-example').locator('small')).toHaveText('예시');
      await expect(guide.getByTestId('scene-free')).toHaveText(FREE);
      // «외칠 대사»처럼 정답으로 읽히는 말은 없다
      await expect(page.locator('#studio')).not.toContainText('외칠 대사');
      expectHierarchy(await layout(guide), `${label} ${name}`);
      await page.locator('#studioBackBtn').click();
      await expect(page.locator('#home')).toHaveClass(/active/);
    }
  });
}

test('지금 원판(기본 주소 — 라이브와 같은 5초 장면)은 8장르 모두 새 안내가 없고 준비 안내도 그대로다', async ({ page }) => {
  await page.goto('/');
  await page.locator('#splash').waitFor({ state: 'detached' });
  for (const [name] of GUIDES) {
    await openScene(page, name);
    await expect(page.locator('#studio')).toHaveClass(/active/);
    await expect(page.locator('#hint')).toHaveText(IDLE_LIVE);
    await expect(page.getByTestId('scene-guide')).toHaveCount(0);
    await page.locator('#studioBackBtn').click();
    await expect(page.locator('#home')).toHaveClass(/active/);
  }
});

test('새 시간표: 멈춘 동안(녹음 중)에도 영상 위에 같은 위계로 보이고, 예시와 다른 소리로 외쳐도 정상 녹음이다', async ({ page }) => {
  await page.setViewportSize({ width: 1440, height: 900 });
  // 시험용 마이크는 280Hz 배음 소리 — 예시 대사와 전혀 다른 «말»이다
  await installSyntheticMic(page, [{ delay: 0.3, dur: 1.5 }]);
  await page.goto('/?scenes=next');
  await page.locator('#splash').waitFor({ state: 'detached' });
  await openScene(page, '스포츠');
  await expect(page.locator('#clip')).toHaveJSProperty('readyState', 4, { timeout: 20000 });
  const seen = page.waitForFunction(() => document.querySelector('#shout [data-testid="scene-guide"]'), null, { timeout: 30000, polling: 'raf' });
  const take = recordOnce(page);
  await seen;
  const guide = page.locator('#shout [data-testid="scene-guide"]');
  await expect(guide.getByTestId('scene-situation')).toHaveText('승부를 끝내 !');
  expectHierarchy(await layout(guide), '녹음 중');
  expect(await take).toMatchObject({ phase: 'recorded', check: 'ok' });
});
