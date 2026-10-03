// CI 배포 뒤 현재 로컬 산출물과 운영 파일을 대조하고 실제 운영 헤더 아래 녹음을 확인한다.
import { chromium, expect } from '@playwright/test';
import assert from 'node:assert/strict';
import { readFileSync, writeFileSync, mkdirSync } from 'node:fs';
import { createHash } from 'node:crypto';
import { Buffer } from 'node:buffer';

const origin = 'https://voice.edutogether.kr';
mkdirSync('tmp', { recursive: true });
const home = await globalThis.fetch(`${origin}/`, { cache: 'no-store' });
assert.equal(home.status, 200);
assert.match(home.headers.get('permissions-policy') || '', /microphone=\(self\)/);
const html = await home.text();
const localHtml = readFileSync('dist/index.html', 'utf8');
const bundles = [...localHtml.matchAll(/(?:src|href)="(\/assets\/[^" ]+\.(?:js|css))"/g)].map(match => match[1]);
assert(bundles.length >= 2);
const hashes = {};
for (const path of [...bundles, '/sw.js']) {
  if (path !== '/sw.js') assert(html.includes(path), `운영 HTML이 현재 번들을 가리켜야 한다: ${path}`);
  const response = await globalThis.fetch(`${origin}${path}`, { cache: 'no-store' });
  assert.equal(response.status, 200);
  const deployed = Buffer.from(await response.arrayBuffer());
  const local = readFileSync(`dist${path}`);
  assert(deployed.equals(local), `운영 파일과 빌드 파일이 다르다: ${path}`);
  hashes[path] = createHash('sha256').update(deployed).digest('hex');
}
const health = await globalThis.fetch('https://asia-northeast3-inky-voice-cinema.cloudfunctions.net/voiceCinema/');
assert.equal(health.status, 200);
assert.equal((await health.json()).ok, true);
const browser = await chromium.launch({ args: ['--use-fake-device-for-media-stream', '--use-fake-ui-for-media-stream'] });
try {
  const context = await browser.newContext({ viewport: { width: 1440, height: 900 }, permissions: ['microphone'] });
  const page = await context.newPage();
  let uploads = 0;
  await page.route('**/voiceCinema/upload', route => { uploads++; return route.abort(); });
  await page.goto(`${origin}/?preview=home-design`);
  await page.locator('#splash').waitFor({ state: 'detached', timeout: 30000 });
  await expect(page.locator('.scene-choice')).toHaveCount(6);
  await expect(page.locator('.scene-shell.is-current video')).toHaveJSProperty('muted', true);
  await page.screenshot({ path: 'tmp/release-live-home.png' });
  await page.getByRole('button', { name: '드라마 미리보기 선택', exact: true }).focus();
  await page.keyboard.press('Enter');
  await expect(page.locator('.studio-scene-label')).toContainText('목소리 녹음');
  await expect(page.locator('#hint')).not.toContainText('샘플');
  await expect(page.locator('#clip')).toHaveJSProperty('paused', true);
  await page.locator('#previewBtn').click();
  await expect(page.locator('#clip')).toHaveJSProperty('muted', false);
  await expect.poll(() => page.locator('#clip').evaluate(v => v.currentTime), { timeout: 10000 }).toBeGreaterThan(.2);
  await page.locator('#recBtn').click();
  await expect(page.locator('#afterRow')).toBeVisible({ timeout: 30000 });
  await page.locator('#replayBtn').click();
  await expect.poll(() => page.locator('#clip').evaluate(v => v.currentTime)).toBeGreaterThan(.2);
  await page.locator('#studioBackBtn').click();
  await expect(page.locator('#home')).toHaveClass(/active/);
  assert.equal(uploads, 0);
  const result = { origin, hashes, health: true, productionSampleMode: false, actualMediaRecorder: true, uploads };
  mkdirSync('tmp', { recursive: true });
  writeFileSync('tmp/release-live.json', JSON.stringify(result, null, 2));
  console.log(JSON.stringify(result, null, 2));
  await context.close();
} finally { await browser.close(); }
