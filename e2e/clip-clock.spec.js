import { test, expect } from '@playwright/test';
import { openScene } from './pause-scenes.js';
import { installSyntheticMic } from './synthetic-mic.js';

test('대기는 전체 길이, 장면·이어 재생·미리보기는 영상 시계를 표시하고 5.0초 멈춤에서는 05:00에 선다', async ({ page }) => {
  // 저장할 수 있는 녹음 — 크롬 내장 가짜 마이크의 «삐»는 3초를 넘어 이어지는 말로 보여 다시 녹음이 된다(10/26)
  await installSyntheticMic(page, [{ delay: 0.3, dur: 1.5 }]);
  await page.goto('/');
  await page.locator('#splash').waitFor({ state: 'detached' });
  await openScene(page, '판타지');
  const clock = page.locator('.clip-time');
  await expect(clock).toHaveText('10:00');
  await page.locator('#recBtn').click();
  await expect.poll(() => page.locator('#clip').evaluate(v => v.currentTime)).toBeGreaterThan(0);
  await expect(clock).toHaveText(/^\d{2}:\d{2} \/ 10:00$/);
  // 문구는 0.6초뿐이라(10/24) 멈춤 단계(문구·카운트다운·녹음)에 들어선 것을 기다린다
  await expect(page.locator('#studio')).toHaveAttribute('data-phase', /^(cue|countdown|recording)$/, { timeout: 10000 });
  await expect(clock).toHaveText('05:00 / 10:00');
  await expect.poll(() => page.locator('#bar').evaluate(bar => new window.DOMMatrixReadOnly(getComputedStyle(bar).transform).a)).toBeCloseTo(.5, 2);
  await expect(page.locator('#recpill')).toBeVisible({ timeout: 6000 });
  await expect(clock).toHaveText('05:00 / 10:00');
  await expect(page.locator('#studio')).toHaveAttribute('data-phase', 'continuing', { timeout: 6000 });
  await expect.poll(async () => (await clock.textContent()) !== '05:00 / 10:00').toBe(true);
  await expect(page.locator('#afterRow')).toBeVisible({ timeout: 10000 });
  await expect(clock).toHaveText('10:00 / 10:00');
  await expect(page.locator('#progress')).toHaveAttribute('aria-valuenow', '100');
  await expect(page.locator('#bar')).toHaveCSS('transform', 'matrix(1, 0, 0, 1, 0, 0)');
  await page.locator('#resetBtn').click();
  await expect(clock).toHaveText('10:00');
  // 미리보기는 처음(00:00)부터 영상 시계를 보여 준다(10/20 «다시 듣기» 대신)
  await page.locator('#previewBtn').click();
  await expect.poll(async () => (await clock.textContent()).startsWith('00:')).toBe(true);
  await expect.poll(() => page.locator('#clip').evaluate(v => v.currentTime)).toBeGreaterThan(.3);
});

for (const [width, height] of [[1440, 900], [390, 844]]) {
  test(`${width}×${height}: 진행 막대가 프레임을 따라 움직이고 정지한 영상보다 앞서가지 않는다`, async ({ page }) => {
    await page.setViewportSize({ width, height });
    await page.goto('/');
    await page.locator('#splash').waitFor({ state: 'detached' });
    await openScene(page, '판타지');
    await page.locator('#recBtn').click();
    await expect.poll(() => page.locator('#clip').evaluate(video => video.currentTime)).toBeGreaterThan(.5);
    // 막대는 앱이 프레임마다 읽은 영상 시계(currentTime)다. 그 값은 «이 검사가 앞 프레임에 읽은 시계»와 «지금 읽은 시계» 사이에 있어야 한다 —
    // 앱의 읽기는 늘 그 둘 사이에 일어나기 때문이다(프레임 안 순서가 어느 쪽이든). 예전에는 막대와 지금 시계의 차이를 0.1초로 쟀는데,
    // 시계 자체가 한 프레임 안에서 크게 건너뛸 수 있어(12개 병렬 부하 실측: 막대를 쓴 뒤 0ms·1프레임인데 차이 0.072초 — 쓴 값과 바로 뒤에
    // 읽은 시계가 이미 0.0718초 달랐다) 막대가 아니라 시계의 건너뜀을 쟀다(10/23·10/24 흔들림 0.12~0.168초). 평소 두 프레임 사이는 0.017초라
    // 이 검사가 예전 0.1초보다 엄격하다. 막대가 0.25초마다 오는 timeupdate를 따르면 앞 프레임 시계보다 뒤처져 실패한다.
    const sample = await page.evaluate(() => new Promise(resolve => {
      const video = document.querySelector('#clip');
      const bar = document.querySelector('#bar');
      const start = performance.now();
      let frames = 0, changes = 0, previous = -1, before = -1, outside = 0, worst = 0, widest = 0;
      const read = now => {
        const fraction = new window.DOMMatrixReadOnly(getComputedStyle(bar).transform).a;
        const shown = fraction * video.duration;
        const clock = video.currentTime;
        frames++;
        if (Math.abs(fraction - previous) > .00001) changes++;
        previous = fraction;
        if (before >= 0) {
          const miss = Math.max(before - shown, shown - clock, 0);
          if (miss > .002) outside++;
          worst = Math.max(worst, miss);
          widest = Math.max(widest, clock - before);
        }
        before = clock;
        if (now - start < 1800) requestAnimationFrame(read);
        else resolve({ frames, changes, outside, worst, widest });
      };
      requestAnimationFrame(read);
    }));
    // 0.25초 단위 점프가 되살아나면 대부분의 프레임에서 값이 같아져 실패한다.
    expect(sample.changes / sample.frames).toBeGreaterThan(.5);
    expect(sample.outside, JSON.stringify(sample)).toBe(0);
    // 5.0초 멈춤 동안 막대는 움직이지 않는다.
    await expect(page.locator('#studio')).toHaveAttribute('data-phase', /^(cue|countdown|recording)$/, { timeout: 8000 });
    const read = () => page.locator('#bar').evaluate(bar => getComputedStyle(bar).transform);
    const paused = await read();
    await page.waitForTimeout(300);
    expect(await read()).toBe(paused);
  });
}
