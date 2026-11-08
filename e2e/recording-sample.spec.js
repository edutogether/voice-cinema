import { test, expect } from '@playwright/test';
import { createHash } from 'node:crypto';
import { readFile } from 'node:fs/promises';
import { countdownLog, watchCountdown } from './countdown-watch.js';
import { stopAutoPreview } from './stop-auto-preview.js';

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

test('마이크 없이 장면·5.0초 멈춤·321·3초·이어 재생·원본 다운로드를 체험한다', async ({ page }) => {
  test.setTimeout(120000); // 두 번 녹음한다(한 번에 약 18초)
  const externalRequests = [];
  page.on('request', request => {
    if (/cloudfunctions|firebaseappcheck|ffmpeg-core/.test(request.url())) externalRequests.push(request.url());
  });
  await watchCountdown(page);
  await openSample(page);
  await expect(page.locator('#hint')).toContainText('샘플 체험 · 마이크 녹음 없음');
  await page.locator('#recBtn').click();
  await page.locator('#cue').waitFor({ timeout: 10000 });
  await expect(page.locator('#recpill')).toContainText('샘플 녹음 체험 중');
  // 3·2·1 다음 «녹음 중»과 «이제 당신의 목소리를 들려주세요 !»가 함께 뜬다(11/8 Bumm님) — 샘플 체험도 같다
  expect((await countdownLog(page)).map((e) => e.key)).toEqual(['cue', '3초 뒤 녹음 시작', '2초 뒤 녹음 시작', '1초 뒤 녹음 시작', 'recording', 'speak']);
  await expect(page.locator('#recBtn')).toBeDisabled();
  await expect(page.locator('#afterRow')).toBeVisible({ timeout: 15000 });
  // «다시 듣기»는 없다(10/20 대표님) — 녹음 뒤에는 «다시 녹음»·«저장하기»만
  await expect(page.locator('#replayBtn')).toHaveCount(0);
  // «다시 녹음»은 «장면 시작»처럼 곧바로 처음부터 다시 체험한다(11/8 Bumm님)
  await page.locator('#resetBtn').click();
  await expect(page.locator('#afterRow')).toHaveCount(0);
  await expect(page.locator('#studio')).toHaveAttribute('data-phase', /requesting|watching/);
  await expect(page.locator('#afterRow')).toBeVisible({ timeout: 25000 });
  await page.locator('#saveBtn').click();
  await expect(page.locator('#result.active')).toContainText('원본 영상을 받아보세요');
  await expect(page.locator('#qrbox')).toHaveCount(0);
  const downloadEvent = page.waitForEvent('download');
  await page.locator('#downloadBtn').click();
  const download = await downloadEvent;
  expect(download.suggestedFilename()).toBe('Voice Cinema_판타지_원본.mp4');
  const digest = bytes => createHash('sha256').update(bytes).digest('hex');
  expect(digest(await readFile(await download.path()))).toBe(digest(await readFile('public/clips/final/fantasy.mp4')));
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
  // 아래 그림 띠에서 키보드로 고른다 — 가운데 장면(«스릴러 더빙 시작»)이 올 때까지 자동 넘김을 기다리면, 멈춰 둔 시험 커서 밑으로 그림 띠가 흘러
  // 장면이 바뀌며 스릴러를 건너뛰기도 했다(11/8, 커서 자리가 «장면 시작» 단추 폭에 따라 달라진다)
  await page.getByRole('button', { name: '스릴러 미리보기 선택', exact: true }).press('Enter');
  await expect(page.locator('#studio.active #chipName')).toHaveText('스릴러');
  await page.waitForTimeout(4000);
  await expect(page.locator('#recBtn')).toBeEnabled();
  await expect(page.locator('#count')).toHaveCount(0);
  await expect(page.locator('#afterRow')).toHaveCount(0);
  // 새로 들어가면 장면은 흐르지만(11/7) 앞의 체험은 이어지지 않는다. 미리보기를 멈추면 처음 자리다.
  await expect(page.locator('#studio')).toHaveAttribute('data-phase', 'previewing');
  await stopAutoPreview(page);
  await expect.poll(() => page.locator('#clip').evaluate(v => v.paused && v.currentTime === 0)).toBe(true);
  expect(await page.evaluate(() => window.sampleMicRequests)).toBe(0);
});
