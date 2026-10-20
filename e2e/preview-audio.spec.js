import { test, expect } from '@playwright/test';

// 장면 더빙 2.0의 소리: 장면은 원판 소리(상대 대사·BGM·효과음)와 함께 재생되고, 녹음 중에는 영상이 5.0초에
// 멈춰 스피커가 조용하다(스피커 소리가 마이크로 들어가 겹치지 않게). 이어 재생은 원판 소리가 다시 난다.
// 녹음 전 «미리보기»도 원판 소리와 함께 재생한다(10/20 대표님).
test('미리보기와 장면은 원판 소리를 내고, 녹음 중에는 조용하며, 이어 재생에서 원판 소리가 다시 난다', async ({ page }) => {
  await page.goto('/');
  await page.locator('#splash').waitFor({ state: 'detached' });
  await page.getByRole('button', { name: '드라마 더빙 시작', exact: true }).click();
  await page.locator('#clip').evaluate(video => {
    const context = new window.AudioContext();
    const analyser = context.createAnalyser();
    context.createMediaElementSource(video).connect(analyser);
    // 분석 뒤 출력만 막아 검사 도중 소리가 나지 않게 한다. 제품의 muted는 바꾸지 않는다.
    const output = context.createGain();
    output.gain.value = 0;
    analyser.connect(output).connect(context.destination);
    window.probe = { context, analyser };
  });
  const sounding = () => page.locator('#clip').evaluate(video => {
    const samples = new Float32Array(window.probe.analyser.fftSize);
    window.probe.analyser.getFloatTimeDomainData(samples);
    return !video.muted && !video.paused && samples.some(sample => Math.abs(sample) > .005);
  });
  await page.evaluate(() => window.probe.context.resume());
  await page.locator('#previewBtn').click();
  await expect.poll(sounding, { timeout: 8000, intervals: [100] }).toBe(true);
  await page.locator('#recBtn').click();
  await expect.poll(sounding, { timeout: 8000, intervals: [100] }).toBe(true);

  await expect(page.locator('#recpill')).toBeVisible({ timeout: 12000 });
  await expect(page.locator('#clip')).toHaveJSProperty('paused', true);
  expect(await sounding()).toBe(false);

  await expect(page.locator('#studio')).toHaveAttribute('data-phase', 'continuing', { timeout: 6000 });
  await expect.poll(sounding, { timeout: 5000, intervals: [100] }).toBe(true);
  await expect(page.locator('#afterRow')).toBeVisible({ timeout: 10000 });
  await page.evaluate(() => window.probe.context.close());
});
