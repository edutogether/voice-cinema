import { test, expect } from '@playwright/test';
import { createHash } from 'node:crypto';
import { readFile } from 'node:fs/promises';

test.use({ serviceWorkers: 'block' });

async function openSample(page) {
  await page.addInitScript(() => {
    window.sampleMicRequests = 0;
    navigator.mediaDevices.getUserMedia = () => {
      window.sampleMicRequests++;
      return Promise.reject(new window.DOMException('샘플 검사에서는 마이크 차단', 'NotAllowedError'));
    };
    window.MediaRecorder = undefined;
  });
  await page.goto('/?preview=home-design');
  await page.locator('#splash').waitFor({ state: 'detached' });
  await page.getByRole('button', { name: '판타지 더빙 시작', exact: true }).click();
}

test('마이크 없이 장면·5.0초 멈춤·321·3.5초·이어 재생·원본 다운로드를 체험한다', async ({ page }) => {
  const externalRequests = [];
  page.on('request', request => {
    if (/cloudfunctions|firebaseappcheck|ffmpeg-core/.test(request.url())) externalRequests.push(request.url());
  });
  await openSample(page);
  await expect(page.locator('#hint')).toContainText('샘플 체험 · 마이크 녹음 없음');
  await page.locator('#recBtn').click();
  await expect(page.locator('#cue')).toBeVisible({ timeout: 10000 });
  for (const n of [3, 2, 1]) await expect(page.locator('#count')).toHaveAttribute('aria-label', `${n}초 뒤 녹음 시작`);
  await expect(page.locator('#recpill')).toContainText('샘플 녹음 체험 중');
  await expect(page.locator('#recBtn')).toBeDisabled();
  await expect(page.locator('#afterRow')).toBeVisible({ timeout: 15000 });
  await page.locator('#replayBtn').click();
  await expect.poll(() => page.locator('#clip').evaluate(v => !v.paused && !v.muted && v.currentTime > 0)).toBe(true);
  await page.locator('#resetBtn').click();
  await expect(page.locator('#afterRow')).toHaveCount(0);
  await expect.poll(() => page.locator('#clip').evaluate(v => v.paused && v.currentTime === 0)).toBe(true);
  await page.locator('#recBtn').click();
  await expect(page.locator('#afterRow')).toBeVisible({ timeout: 25000 });
  await page.locator('#saveBtn').click();
  await expect(page.locator('#result.active')).toContainText('원본 영상을 받아보세요');
  await expect(page.locator('#qrbox')).toHaveCount(0);
  const downloadEvent = page.waitForEvent('download');
  await page.locator('#downloadBtn').click();
  const download = await downloadEvent;
  expect(download.suggestedFilename()).toBe('Voice Cinema_판타지_원본.mp4');
  const digest = bytes => createHash('sha256').update(bytes).digest('hex');
  expect(digest(await readFile(await download.path()))).toBe(digest(await readFile('public/clips/fantasy.mp4')));
  await page.locator('#sampleBackBtn').click();
  await expect(page.locator('#studio.active #afterRow')).toBeVisible();
  expect(await page.evaluate(() => window.sampleMicRequests)).toBe(0);
  expect(externalRequests).toEqual([]);
});

test('카운트다운 도중 뒤로가면 남은 체험이 취소된다', async ({ page }) => {
  await openSample(page);
  await page.locator('#recBtn').click();
  await expect(page.locator('#count')).toBeVisible({ timeout: 10000 });
  await page.goBack();
  await expect(page.locator('#home.active')).toBeVisible();
  await page.getByRole('button', { name: '스릴러 더빙 시작', exact: true }).click();
  await page.waitForTimeout(4000);
  await expect(page.locator('#recBtn')).toBeEnabled();
  await expect(page.locator('#count')).toHaveCount(0);
  await expect(page.locator('#afterRow')).toHaveCount(0);
  await expect.poll(() => page.locator('#clip').evaluate(v => v.paused && v.currentTime === 0)).toBe(true);
  expect(await page.evaluate(() => window.sampleMicRequests)).toBe(0);
});
