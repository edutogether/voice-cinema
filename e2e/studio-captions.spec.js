import { test, expect } from '@playwright/test';
import { openScene } from './pause-scenes.js';

// 장면 더빙 2.0 상대 대사 자막(app-plan §2-3): 넷플릭스식 — 영상 안 아래 가운데, 영상 폭 80% 안, 두 줄 이내,
// 영상 높이의 약 5%(최소 14px). 멈춤 뒤 문구·카운트다운·녹음 중에는 없고, 미리보기 · 장면 · 다시 녹음의 1.6~3.4초에 나온다(10/20 «다시 듣기» 없앰).
// 가장 긴 대사는 11/14 드라마 완성본 «안녕, 설이»의 할머니 대사다(한글 13자, 5.3초에 나온다)
const LONGEST = ['드라마', '설이한테 꼭 다시 온다고 인사해 !'];

for (const [width, height] of [[1440, 900], [390, 844], [360, 640], [844, 390]]) {
  test(`${width}×${height}: 가장 긴 대사도 영상 안에 두 줄 이내로, 폭 80% 안에 놓인다`, async ({ page }) => {
    await page.setViewportSize({ width, height });
    await page.goto('/');
    await page.locator('#splash').waitFor({ state: 'detached' });
    await page.getByRole('button', { name: `${LONGEST[0]} 더빙 시작`, exact: true }).click();
    await page.locator('#recBtn').click();
    const caption = page.getByTestId('scene-caption');
    await expect(caption).toHaveText(LONGEST[1], { timeout: 9000 });
    const box = await page.evaluate(() => {
      const video = document.querySelector('#clip');
      const v = video.getBoundingClientRect();
      // 세로 휴대폰은 영상이 16:9로 가운데 놓인다(contain) — 실제 그림이 그려지는 칸을 계산한다.
      const contain = getComputedStyle(video).objectFit === 'contain';
      const pictureHeight = contain ? Math.min(v.height, v.width * 9 / 16) : v.height;
      const pictureWidth = contain ? pictureHeight * 16 / 9 : v.width;
      const top = v.top + (v.height - pictureHeight) / 2;
      const el = document.querySelector('[data-testid="scene-caption"]');
      const c = el.getBoundingClientRect();
      const s = getComputedStyle(el);
      return {
        fontSize: parseFloat(s.fontSize), lines: Math.round(c.height / parseFloat(s.lineHeight)),
        widthRatio: c.width / pictureWidth, inside: c.top >= top && c.bottom <= top + pictureHeight,
        bottomGap: (top + pictureHeight - c.bottom) / pictureHeight,
      };
    });
    expect(box.fontSize).toBeGreaterThanOrEqual(14);
    expect(box.lines).toBeLessThanOrEqual(2);
    expect(box.widthRatio).toBeLessThanOrEqual(.81);
    expect(box.inside).toBe(true);
    expect(box.bottomGap).toBeGreaterThan(.03);
    expect(box.bottomGap).toBeLessThan(.2);
  });
}

test('자막은 미리보기 · 장면 · 다시 녹음의 1.6~3.4초에 나오고, 멈춘 뒤 문구·카운트다운·녹음 중에는 없다', async ({ page }) => {
  test.setTimeout(120000); // 두 번 녹음한다(한 번에 약 18초)
  await page.goto('/');
  await page.locator('#splash').waitFor({ state: 'detached' });
  // 10초 장면(1.6초 자막)으로 — SF는 11/14부터 완성본이라 판타지를 아래 그림 띠에서 키보드로 고른다
  await page.locator('.scene-choice[data-genre="fantasy"]').focus();
  await page.keyboard.press('Enter');
  const caption = page.getByTestId('scene-caption');
  // 들어가면 흐르는 미리보기(11/7)에서도 나온다
  await expect(caption).toHaveText('나와 겨루겠다고 ?', { timeout: 6000 });
  await page.locator('#recBtn').click();
  await expect(caption).toHaveText('나와 겨루겠다고 ?', { timeout: 6000 });
  // 문구 1초 · 숫자 1초씩(11/8) — 페이지 안에서 매 화면 확인하는 waitFor로 기다린다
  await page.locator('#cue').waitFor({ timeout: 8000 });
  await expect(caption).toHaveCount(0);
  await page.locator('#count').waitFor({ timeout: 3000 });
  await expect(caption).toHaveCount(0);
  await expect(page.locator('#recpill')).toBeVisible({ timeout: 8000 });
  await expect(caption).toHaveCount(0);
  await expect(page.locator('#afterRow')).toBeVisible({ timeout: 15000 });
  // «다시 녹음»은 처음부터 다시 흐르므로(11/8) 자막도 다시 나온다
  await page.locator('#resetBtn').click();
  await expect(caption).toHaveText('나와 겨루겠다고 ?', { timeout: 6000 });
});

// 11/14 드라마 v7은 대사가 두 줄이다(Bumm님 지시, 팀장 전달) — 아빠(화면 밖) 0.1~1.7초, 할머니 5.3~7.6초.
// 줄이 바뀌고 사라지는 순간의 영상 시각을 페이지 안에서 기록한다(화면에 나간 프레임 시각 — dubbing-flow의 1.6~3.4초 시험과 같은 방식).
test('드라마 완성본: 아빠 대사가 0.1~1.7초, 할머니 대사가 5.3~7.6초에 나오고 그 사이에는 자막이 없다', async ({ page }) => {
  await page.goto('/');
  // 들어가면 미리보기가 0초부터 곧바로 흐르므로 기록은 들어가기 전에 건다
  await page.evaluate(() => {
    const log = (window.__captionLog = []);
    let frameTime = 0;
    let hooked = null;
    let last = null;
    const onFrame = (_, meta) => { frameTime = meta.mediaTime; hooked.requestVideoFrameCallback(onFrame); };
    new MutationObserver(() => {
      const video = document.querySelector('#clip');
      if (video && video !== hooked) { hooked = video; frameTime = 0; video.requestVideoFrameCallback(onFrame); }
      const el = document.querySelector('[data-testid="scene-caption"]');
      const text = el ? el.textContent : null;
      if (text !== last) { last = text; log.push({ text, t: frameTime }); }
    }).observe(document.body, { childList: true, subtree: true, characterData: true });
  });
  await openScene(page, 'drama');
  const caption = page.getByTestId('scene-caption');
  await expect(caption).toHaveText('설이한테 꼭 다시 온다고 인사해 !', { timeout: 9000 });
  await expect(caption).toHaveCount(0, { timeout: 4000 });
  const log = await page.evaluate(() => window.__captionLog);
  expect(log.map((x) => x.text)).toEqual(['이제 출발해야지~', null, '설이한테 꼭 다시 온다고 인사해 !', null]);
  // 한 화면 갱신(약 1/30초)만큼의 여유만 둔다.
  [0.1, 1.7, 5.3, 7.6].forEach((at, i) => {
    expect(log[i].t).toBeGreaterThanOrEqual(at - 1 / 30);
    expect(log[i].t).toBeLessThan(at + 2 / 30);
  });
});
