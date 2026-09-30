import { test, expect } from '@playwright/test';

test('상세 미리보기는 원본 소리를 출력하고 정지하면 멈춘다', async ({ page }) => {
  await page.goto('/');
  await page.locator('#splash').waitFor({ state: 'detached' });
  // 실제 오디오가 있는 원본으로 검사한다. 나머지 다섯 원본은 사실상 무음이다.
  await page.getByRole('button', { name: '드라마 더빙 시작', exact: true }).click();
  await page.locator('#clip').evaluate(video => {
    const context = new window.AudioContext();
    const analyser = context.createAnalyser();
    context.createMediaElementSource(video).connect(analyser);
    // 분석 뒤 출력만 막아 검사 도중 소리가 나지 않게 한다. 제품의 muted는 바꾸지 않는다.
    const output = context.createGain();
    output.gain.value = 0;
    analyser.connect(output).connect(context.destination);
    window.previewAudioProbe = { context, analyser };
  });
  await page.locator('#previewBtn').click();
  await page.evaluate(() => window.previewAudioProbe.context.resume());
  await expect.poll(() => page.locator('#clip').evaluate(video => {
    const { analyser } = window.previewAudioProbe;
    const samples = new Float32Array(analyser.fftSize);
    analyser.getFloatTimeDomainData(samples);
    return !video.muted && video.volume > 0 && !video.paused &&
      samples.some(sample => Math.abs(sample) > .005);
  }), { timeout: 8000, intervals: [100] }).toBe(true);
  await expect.poll(() => page.locator('#clip').evaluate(video => video.currentTime)).toBeGreaterThan(1);
  await expect(page.locator('#clip')).toHaveJSProperty('muted', false);
  await page.locator('#previewBtn').click();
  await expect(page.locator('#clip')).toHaveJSProperty('paused', true);
  await expect(page.locator('#clip')).toHaveJSProperty('muted', true);
  await page.evaluate(() => window.previewAudioProbe.context.close());
});
