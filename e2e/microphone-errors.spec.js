import { test, expect } from '@playwright/test';
import { clipLength, scenePause, TEST_SCENE } from './scene-data.js';

// 시험 장면(SF, 첫 카드)은 11/14부터 완성본이다 — 멈춤까지 · 이어 재생 시간을 파일 길이에서 잡는다
const enter = (page) => page.getByRole('button', { name: `${TEST_SCENE.name} 더빙 시작`, exact: true }).click();
const TO_RECORDING_MS = (scenePause(TEST_SCENE.id) + 12) * 1000;
const AFTER_RECORDING_MS = (clipLength(TEST_SCENE.id) - scenePause(TEST_SCENE.id) + 12) * 1000;

for (const [name, reason, hint] of [
  ['NotAllowedError', 'denied', '마이크를 쓸 수 없게 막혀'],
  ['NotFoundError', 'missing', '연결된 마이크를 찾지'],
  ['NotReadableError', 'busy', '마이크를 쓰지 못했어요'],
]) {
  test(`${name}: 실제 마이크 실패 원인을 표시하고 다시 누르면 녹음한다`, async ({ page }) => {
    await page.addInitScript(errorName => {
      const request = navigator.mediaDevices.getUserMedia.bind(navigator.mediaDevices);
      let failed = false;
      navigator.mediaDevices.getUserMedia = constraints => {
        if (!failed) {
          failed = true;
          return Promise.reject(new window.DOMException('검사 중 재현한 마이크 오류', errorName));
        }
        return request(constraints);
      };
    }, name);
    await page.goto('/');
    await page.locator('#splash').waitFor({ state: 'detached' });
    await enter(page);
    await page.locator('#recBtn').click();
    await expect(page.locator('#hint')).toHaveAttribute('data-mic-error', reason);
    await expect(page.locator('#hint')).toContainText(hint);
    await expect(page.locator('#recBtn')).toBeEnabled();
    await page.locator('#recBtn').click();
    // 3·2·1은 e2e/record-countdown.spec.js가 따로 본다 — 여기서는 녹음이 실제로 시작되는지만
    await expect(page.locator('#recpill')).toBeVisible({ timeout: TO_RECORDING_MS });
    await expect(page.locator('#afterRow')).toBeVisible({ timeout: AFTER_RECORDING_MS });
  });
}

test('녹음 API가 없는 브라우저를 권한 거부로 오인하지 않는다', async ({ page }) => {
  await page.addInitScript(() => { window.MediaRecorder = undefined; });
  await page.goto('/');
  await page.locator('#splash').waitFor({ state: 'detached' });
  await enter(page);
  await page.locator('#recBtn').click();
  await expect(page.locator('#hint')).toHaveAttribute('data-mic-error', 'unsupported');
  await expect(page.locator('#hint')).toContainText('크롬이나 사파리');
  await expect(page.locator('#recBtn')).toBeEnabled();
});

test('연결이 끊긴 마이크는 다시 얻어 다음 참가자가 녹음한다', async ({ page }) => {
  test.setTimeout(150000); // 두 번 녹음한다(한 번에 약 31초)
  await page.addInitScript(() => {
    const request = navigator.mediaDevices.getUserMedia.bind(navigator.mediaDevices);
    window.micRequests = 0;
    navigator.mediaDevices.getUserMedia = async constraints => {
      window.micRequests++;
      const stream = await request(constraints);
      window.testMic = stream;
      return stream;
    };
  });
  await page.goto('/');
  await page.locator('#splash').waitFor({ state: 'detached' });
  await enter(page);
  await page.locator('#recBtn').click();
  await expect(page.locator('#afterRow')).toBeVisible({ timeout: TO_RECORDING_MS + AFTER_RECORDING_MS });
  await page.evaluate(() => window.testMic.getTracks().forEach(track => track.stop()));
  // «다시 녹음»은 곧바로 다음 녹음을 시작한다(11/8) — 끊긴 마이크를 버리고 새로 얻는다
  await page.locator('#resetBtn').click();
  await expect(page.locator('#recpill')).toBeVisible({ timeout: TO_RECORDING_MS });
  expect(await page.evaluate(() => window.micRequests)).toBe(2);
  await expect(page.locator('#afterRow')).toBeVisible({ timeout: AFTER_RECORDING_MS });
});
