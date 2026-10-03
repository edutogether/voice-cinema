// 로컬 산출물에 여섯 독립 참가자를 겹쳐 실제 녹음·WASM 합성을 검사한다.
import { chromium, expect } from '@playwright/test';
import assert from 'node:assert/strict';
import { Buffer } from 'node:buffer';
import { performance } from 'node:perf_hooks';
import { mkdirSync, writeFileSync } from 'node:fs';

const baseURL = process.argv[2] || 'http://127.0.0.1:4322';
assert(['localhost', '127.0.0.1', '[::1]'].includes(new URL(baseURL).hostname), '로컬 서버에만 실행한다');
const names = ['판타지', '애니메이션', '호러', '액션', '드라마', '시트콤'];
const browser = await chromium.launch({ args: ['--use-fake-device-for-media-stream', '--use-fake-ui-for-media-stream'] });
const started = performance.now();
try {
  const results = await Promise.all(names.map(async (name, index) => {
    const context = await browser.newContext({ viewport: { width: 1366, height: 768 },
      permissions: ['microphone'], serviceWorkers: 'block', reducedMotion: 'reduce' });
    const page = await context.newPage();
    const errors = [];
    let uploads = 0;
    page.on('pageerror', error => errors.push(error.message));
    await page.route('**/voiceCinema/upload', async route => {
      const payload = route.request().postDataJSON();
      const mp4 = Buffer.from(payload.dataBase64, 'base64');
      assert(mp4.length > 1024 && mp4.length <= 20 * 1024 * 1024);
      assert.equal(mp4.toString('ascii', 4, 8), 'ftyp');
      uploads++;
      await route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({ ok: true, url: `https://example.org/release-${index}.mp4` }) });
    });
    try {
      await page.goto(baseURL);
      await page.locator('#splash').waitFor({ state: 'detached' });
      for (let round = 0; round < 6; round++) {
        const scene = names[(index + round) % names.length];
        await page.getByRole('button', { name: `${scene} 미리보기 선택`, exact: true }).focus();
        await page.keyboard.press('Enter');
        await expect(page.locator('#chipName')).toHaveText(scene);
        await page.locator('#previewBtn').click();
        await expect.poll(() => page.locator('#clip').evaluate(v => v.currentTime), { timeout: 10000 }).toBeGreaterThan(.1);
        await page.locator('#studioBackBtn').click();
        await expect(page.locator('#home')).toHaveClass(/active/);
        await expect(page.locator('#studio')).toHaveCount(0);
      }
      await page.getByRole('button', { name: `${name} 미리보기 선택`, exact: true }).focus();
      await page.keyboard.press('Enter');
      await page.locator('#recBtn').click();
      await expect(page.locator('#afterRow')).toBeVisible({ timeout: 30000 });
      await page.locator('#saveBtn').click();
      await expect(page.locator('#qrbox')).toBeVisible({ timeout: 60000 });
      assert.equal(uploads, 1);
      assert.deepEqual(errors, []);
      return { genre: name, navigationCycles: 6, recordings: 1, mergedUploads: uploads, pageErrors: errors.length };
    } finally { await context.close(); }
  }));
  const report = { concurrentParticipants: 6, elapsedSeconds: Math.round((performance.now() - started) / 1000), results };
  mkdirSync('tmp', { recursive: true });
  writeFileSync('tmp/release-browser-stress.json', JSON.stringify(report, null, 2));
  console.log(JSON.stringify(report, null, 2));
} finally { await browser.close(); }
