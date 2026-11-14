import { test, expect } from '@playwright/test';
import { openScene } from './pause-scenes.js';
import { clipLength, scenePause, sceneLines, TEST_SCENE } from './scene-data.js';

// 장면 더빙 2.0 상대 대사 자막(app-plan §2-3): 넷플릭스식 — 영상 안 아래 가운데, 영상 폭 80% 안, 두 줄 이내,
// 영상 높이의 약 5%(최소 14px). 멈춤 뒤 문구·카운트다운·녹음 중에는 없고, 미리보기 · 장면 · 다시 녹음의 대사 시각에 나온다(10/20 «다시 듣기» 없앰).
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

test('자막은 미리보기 · 장면 · 다시 녹음의 대사 시각에 나오고, 멈춘 뒤 문구·카운트다운·녹음 중에는 없다', async ({ page }) => {
  test.setTimeout(150000); // 한 번 녹음하고(약 31초) 다시 녹음을 시작한다
  // 시험 장면(SF, 통과본)의 첫 대사 · 멈춤 · 길이는 src/genres.ts · 파일에서 온다
  const LINE = sceneLines(TEST_SCENE.id)[0];
  const PAUSE = scenePause(TEST_SCENE.id);
  await page.goto('/');
  await page.locator('#splash').waitFor({ state: 'detached' });
  await page.locator(`.scene-choice[data-genre="${TEST_SCENE.id}"]`).focus();
  await page.keyboard.press('Enter');
  const caption = page.getByTestId('scene-caption');
  // 들어가면 흐르는 미리보기(11/7)에서도 나온다
  await expect(caption).toHaveText(LINE.text, { timeout: (LINE.start + 4) * 1000 });
  await page.locator('#recBtn').click();
  await expect(caption).toHaveText(LINE.text, { timeout: (LINE.start + 4) * 1000 });
  // 문구 1초 · 숫자 1초씩(11/8) — 페이지 안에서 매 화면 확인하는 waitFor로 기다린다
  await page.locator('#cue').waitFor({ timeout: (PAUSE - LINE.start + 5) * 1000 });
  await expect(caption).toHaveCount(0);
  await page.locator('#count').waitFor({ timeout: 3000 });
  await expect(caption).toHaveCount(0);
  await expect(page.locator('#recpill')).toBeVisible({ timeout: 8000 });
  await expect(caption).toHaveCount(0);
  await expect(page.locator('#afterRow')).toBeVisible({ timeout: (clipLength(TEST_SCENE.id) - PAUSE + 12) * 1000 });
  // «다시 녹음»은 처음부터 다시 흐르므로(11/8) 자막도 다시 나온다
  await page.locator('#resetBtn').click();
  await expect(caption).toHaveText(LINE.text, { timeout: (LINE.start + 4) * 1000 });
});

// 11/14 드라마 v7은 대사가 두 줄이다(Bumm님 지시, 팀장 전달) — 아빠(화면 밖) · 할머니. 시각은 src/genres.ts에서 읽는다.
// 줄이 바뀌고 사라지는 순간의 영상 시각을 페이지 안에서 기록한다(화면에 나간 프레임 시각 — dubbing-flow의 자막 시험과 같은 방식).
const DRAMA = sceneLines('drama');
test('드라마 완성본: 아빠 · 할머니 대사가 제 시각에 나오고 그 사이에는 자막이 없다', async ({ page }) => {
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
  const last = DRAMA.at(-1);
  await expect(caption).toHaveText(last.text, { timeout: (last.start + 4) * 1000 });
  await expect(caption).toHaveCount(0, { timeout: (last.end - last.start + 2) * 1000 });
  const log = await page.evaluate(() => window.__captionLog);
  expect(DRAMA).toHaveLength(2);
  expect(log.map((x) => x.text)).toEqual(DRAMA.flatMap((line) => [line.text, null]));
  // 한 화면 갱신(약 1/30초)만큼의 여유만 둔다.
  DRAMA.flatMap((line) => [line.start, line.end]).forEach((at, i) => {
    expect(log[i].t).toBeGreaterThanOrEqual(at - 1 / 30);
    expect(log[i].t).toBeLessThan(at + 2 / 30);
  });
});
