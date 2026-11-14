import { test, expect } from '@playwright/test';
import { stopAutoPreview } from './stop-auto-preview.js';
import { clipLength, clockText, scenePause, TEST_SCENE } from './scene-data.js';

// 시험 장면(SF)의 길이 · 멈춤 시각은 파일에서 읽는다(11/14 완성본 — 편마다 다르다). 시간 글은 «초:100분의 1초»(앱과 같은 모양).
const LENGTH = clipLength(TEST_SCENE.id);
const PAUSE = scenePause(TEST_SCENE.id);
const TOTAL = clockText(LENGTH);
const AT_PAUSE = `${clockText(PAUSE)} / ${TOTAL}`;
const RUNNING = new RegExp(`^\\d{2}:\\d{2} / ${TOTAL}$`);
// 미리보기는 목소리 칸 끝(멈춤 + 3.5초)에 멈추므로 시계의 끝도 그 시각이다(11/14 Bumm님 «아래 빨간색 진행바가 영상 끝나는거에 안맞네»)
const PREVIEW_RUNNING = new RegExp(`^\\d{2}:\\d{2} / ${clockText(PAUSE + 3.5)}$`);
const enter = (page) => page.getByRole('button', { name: `${TEST_SCENE.name} 더빙 시작`, exact: true }).click();

test('대기는 전체 길이, 장면·이어 재생·미리보기·다시 녹음은 영상 시계를 표시하고 멈춤에서는 멈춤 시각에 선다', async ({ page }) => {
  test.setTimeout(150000); // 두 번 녹음한다(한 번에 약 31초)
  await page.goto('/');
  await page.locator('#splash').waitFor({ state: 'detached' });
  await enter(page);
  const clock = page.locator('.clip-time');
  // 들어가면 장면이 바로 흐르므로(11/7) 영상 시계부터 보이고, 멈추면 대기의 전체 길이로 돌아온다.
  await expect(clock).toHaveText(PREVIEW_RUNNING);
  await stopAutoPreview(page);
  await expect(clock).toHaveText(TOTAL);
  await page.locator('#recBtn').click();
  await expect.poll(() => page.locator('#clip').evaluate(v => v.currentTime)).toBeGreaterThan(0);
  await expect(clock).toHaveText(RUNNING);
  // 멈춤 단계(문구·카운트다운·녹음)에 들어선 것을 기다린다
  await expect(page.locator('#studio')).toHaveAttribute('data-phase', /^(cue|countdown|recording)$/, { timeout: (PAUSE + 5) * 1000 });
  await expect(clock).toHaveText(AT_PAUSE);
  await expect.poll(() => page.locator('#bar').evaluate(bar => new window.DOMMatrixReadOnly(getComputedStyle(bar).transform).a)).toBeCloseTo(PAUSE / LENGTH, 2);
  await expect(page.locator('#recpill')).toBeVisible({ timeout: 9000 });
  await expect(clock).toHaveText(AT_PAUSE);
  await expect(page.locator('#studio')).toHaveAttribute('data-phase', 'continuing', { timeout: 6000 });
  await expect.poll(async () => (await clock.textContent()) !== AT_PAUSE).toBe(true);
  await expect(page.locator('#afterRow')).toBeVisible({ timeout: (LENGTH - PAUSE + 10) * 1000 });
  await expect(clock).toHaveText(`${TOTAL} / ${TOTAL}`);
  await expect(page.locator('#progress')).toHaveAttribute('aria-valuenow', '100');
  await expect(page.locator('#bar')).toHaveCSS('transform', 'matrix(1, 0, 0, 1, 0, 0)');
  // «다시 녹음»은 «장면 시작»처럼 곧바로 처음(00:00)부터 장면을 다시 틀고 영상 시계를 보여 준다(11/8 Bumm님)
  await page.locator('#resetBtn').click();
  await expect.poll(async () => (await clock.textContent()).startsWith('00:')).toBe(true);
  await expect.poll(() => page.locator('#clip').evaluate(v => v.currentTime)).toBeGreaterThan(.3);
  await expect(clock).toHaveText(RUNNING);
});

for (const [width, height] of [[1440, 900], [390, 844]]) {
  test(`${width}×${height}: 진행 막대가 프레임을 따라 움직이고 정지한 영상보다 앞서가지 않는다`, async ({ page }) => {
    await page.setViewportSize({ width, height });
    await page.goto('/');
    await page.locator('#splash').waitFor({ state: 'detached' });
    await enter(page);
    await page.locator('#recBtn').click();
    await expect.poll(() => page.locator('#clip').evaluate(video => video.currentTime)).toBeGreaterThan(.5);
    const sample = await page.evaluate(() => new Promise(resolve => {
      const video = document.querySelector('#clip');
      const bar = document.querySelector('#bar');
      const start = performance.now();
      let frames = 0, changes = 0, previous = -1, maxLag = 0;
      const read = now => {
        const fraction = new window.DOMMatrixReadOnly(getComputedStyle(bar).transform).a;
        frames++;
        if (Math.abs(fraction - previous) > .00001) changes++;
        previous = fraction;
        maxLag = Math.max(maxLag, Math.abs(fraction * video.duration - video.currentTime));
        if (now - start < 1800) requestAnimationFrame(read);
        else resolve({ frames, changes, maxLag });
      };
      requestAnimationFrame(read);
    }));
    // 0.25초 단위 점프가 되살아나면 대부분의 프레임에서 값이 같아져 실패한다.
    expect(sample.changes / sample.frames).toBeGreaterThan(.5);
    expect(sample.maxLag).toBeLessThan(.1);
    // 멈춤 동안 막대는 움직이지 않는다.
    await expect(page.locator('#studio')).toHaveAttribute('data-phase', /^(cue|countdown|recording)$/, { timeout: (PAUSE + 5) * 1000 });
    const read = () => page.locator('#bar').evaluate(bar => getComputedStyle(bar).transform);
    const paused = await read();
    await page.waitForTimeout(300);
    expect(await read()).toBe(paused);
  });
}
