import { test, expect } from '@playwright/test';
import fs from 'node:fs';
import http from 'node:http';
import path from 'node:path';
import { listenOnSafePort } from '../tools/safe-port.mjs';

// 부스 기기를 미리 열어 엔진(31MB)을 받아 두어도, 화면 배포 한 번이면 두 번째로 열 때 다시 받았다(2026-11-07 라이브 82f4846에서 잼).
// 엔진이 화면 캐시에 함께 들어 있어, 새 서비스워커가 옛 캐시를 지울 때 엔진까지 지워졌기 때문이다. 엔진을 따로 캐시한 뒤 네 길을 고정한다.
// 같은 주소에서 빌드를 바꿔 끼워야 하므로 이 파일만 작은 서버를 직접 띄운다. 엔진을 회선으로 받은 횟수는 서버에서 센다.

const DIST = path.resolve('dist');
const WASM = '/vendor/ffmpeg-core/ffmpeg-core.wasm';
const CORE = '/vendor/ffmpeg-core/ffmpeg-core.js';
const TYPES = { '.html': 'text/html', '.js': 'text/javascript', '.css': 'text/css', '.json': 'application/json', '.png': 'image/png', '.jpg': 'image/jpeg', '.avif': 'image/avif', '.svg': 'image/svg+xml', '.woff2': 'font/woff2', '.mp4': 'video/mp4', '.wasm': 'application/wasm' };

async function startServer(t) {
  const state = { sw: fs.readFileSync(path.join(DIST, 'sw.js'), 'utf8'), wasm: fs.readFileSync(path.join(DIST, WASM)), wasmHits: 0 };
  const server = http.createServer((req, res) => {
    const pathname = decodeURIComponent(new URL(req.url, 'http://localhost').pathname);
    const send = (body, type) => { res.writeHead(200, { 'Content-Type': type, 'Cache-Control': 'no-cache' }); res.end(body); };
    if (pathname === '/sw.js') return send(state.sw, 'text/javascript');
    if (pathname === WASM) { state.wasmHits += 1; return send(state.wasm, 'application/wasm'); }
    const file = path.join(DIST, pathname === '/' ? 'index.html' : pathname);
    if (!file.startsWith(DIST) || !fs.existsSync(file) || fs.statSync(file).isDirectory()) { res.writeHead(404); return res.end(); }
    return send(fs.readFileSync(file), TYPES[path.extname(file)] || 'application/octet-stream');
  });
  const port = await listenOnSafePort(server, 'localhost');
  t.teardown = () => new Promise((resolve) => { server.closeAllConnections(); server.close(resolve); });
  return { state, origin: `http://localhost:${port}` };
}

const appCache = (sw) => /'voice-cinema-' \+ "([0-9a-f]+|[^"]+)"/.exec(sw)[1];
const screenDeploy = (sw) => sw.replace(/'voice-cinema-' \+ "[^"]+"/, `'voice-cinema-' + "${appCache(sw)}b"`);
const engineDeploy = (sw, wasmHash) => screenDeploy(sw)
  .replace(/("\/vendor\/ffmpeg-core\/ffmpeg-core\.wasm": )"[0-9a-f]+"/, `$1"${wasmHash}"`)
  .replace(/'voice-cinema-engine-' \+ "[^"]+"/, `'voice-cinema-engine-' + "다른엔진"`);

// 앱이 엔진 받기를 끝낼 때까지(서비스워커가 내주든 회선으로 받든). 첫 화면 영상이 받힌 뒤에 시작한다.
const engineFetched = (page) => expect.poll(() => page.evaluate((url) => performance.getEntriesByName(new URL(url, location.href).href).some((e) => e.responseEnd > 0), WASM), { timeout: 60000, intervals: [200] }).toBe(true);

// 이 캐시 이름이 자리 잡고(새 서비스워커가 옛 캐시를 정리할 때까지) 서비스워커가 이 탭을 맡을 때까지
async function newWorkerActive(page, name) {
  await expect.poll(() => page.evaluate(async () => ({ names: await caches.keys(), controlled: !!navigator.serviceWorker.controller })).catch(() => ({ names: [], controlled: false })), { timeout: 60000, intervals: [200] })
    .toEqual(expect.objectContaining({ controlled: true, names: expect.arrayContaining([`voice-cinema-${name}`]) }));
  try {
    await expect.poll(() => page.evaluate(async (keep) => (await caches.keys()).filter((n) => n !== keep && !n.startsWith('voice-cinema-engine-')).length, `voice-cinema-${name}`), { timeout: 60000, intervals: [200] }).toBe(0);
  } catch (error) {
    // 옛 캐시가 끝내 남으면 무엇이 남았는지(캐시마다 항목 수 · 서비스워커 상태)를 실패에 붙인다 — 11/8 이 파일을 12개씩 겹쳐 돌린 약 150번 중 한 번
    // 옛 화면 캐시가 통째로 남았는데, 그때는 서비스워커 상태를 남기지 않아 원인을 확인하지 못했다(`.claude/rules/app.md` 흔들린 검사 기록).
    const left = await page.evaluate(async () => {
      const registration = await navigator.serviceWorker.getRegistration();
      const names = await caches.keys();
      return {
        caches: Object.fromEntries(await Promise.all(names.map(async (n) => [n, (await (await caches.open(n)).keys()).length]))),
        installing: registration?.installing?.state ?? null, waiting: registration?.waiting?.state ?? null, active: registration?.active?.state ?? null,
      };
    }).catch((reason) => String(reason));
    throw new Error(`옛 캐시가 지워지지 않았다: ${JSON.stringify(left)}`, { cause: error });
  }
}

const cachedWasmSize = (page) => page.evaluate(async (url) => { const hit = await caches.match(url, { ignoreVary: true }); return hit ? (await hit.arrayBuffer()).byteLength : 0; }, WASM);

// 서비스워커가 없는 상태에서 옛 판 캐시를 만들어 둔다. 앱 문서가 아닌 주소에서 만들어야 서비스워커가 등록되지 않는다.
async function seedOldCache(page, origin, wasmBody) {
  await page.goto(`${origin}/fit.js`);
  await page.evaluate(async ({ wasm, core, body }) => {
    const cache = await caches.open('voice-cinema-옛판');
    await cache.put(wasm, new Response(body === null ? await (await fetch(wasm)).blob() : body, { headers: { 'content-type': 'application/wasm' } }));
    await cache.put(core, await fetch(core));
  }, { wasm: WASM, core: CORE, body: wasmBody });
}

test.describe('엔진 캐시 — 화면 배포에서 부스 기기가 엔진을 다시 받지 않는다', () => {
  test.setTimeout(180000);
  const t = {};
  test.beforeEach(async ({ context }) => { await context.route(/recaptcha|gstatic|firebaseappcheck/, (route) => route.abort()); });
  test.afterEach(async () => { await t.teardown?.(); });

  test('① 엔진이 화면 캐시에 있던 옛 판에서 넘어와도 회선으로 받지 않고, 인터넷을 끊어도 뜬다', async ({ page, context }) => {
    const { state, origin } = await startServer(t);
    await seedOldCache(page, origin, null);
    state.wasmHits = 0;

    await page.goto(`${origin}/`);
    await newWorkerActive(page, appCache(state.sw));
    await engineFetched(page);
    expect(state.wasmHits, '첫 번째로 열 때 엔진을 회선으로 받은 횟수').toBe(0);

    await page.goto(`${origin}/`);
    await engineFetched(page);
    expect(state.wasmHits, '두 번째로 열 때 엔진을 회선으로 받은 횟수').toBe(0);
    expect(await cachedWasmSize(page)).toBe(state.wasm.length);

    await context.setOffline(true);
    await page.reload();
    await expect(page.locator('.tile')).toHaveCount(8);
    expect(await cachedWasmSize(page)).toBe(state.wasm.length);
    await context.setOffline(false);
  });

  test('② 화면만 바뀐 배포에서는 엔진을 다시 받지 않는다', async ({ page }) => {
    const { state, origin } = await startServer(t);
    await page.goto(`${origin}/`);
    await newWorkerActive(page, appCache(state.sw));
    await engineFetched(page);
    await expect.poll(() => cachedWasmSize(page), { timeout: 30000 }).toBe(state.wasm.length);
    expect(state.wasmHits, '첫 방문').toBe(1);

    state.sw = screenDeploy(state.sw);
    await page.goto(`${origin}/`);
    await newWorkerActive(page, appCache(state.sw));
    await page.goto(`${origin}/`);
    await engineFetched(page);
    expect(state.wasmHits, '화면 배포 뒤 엔진을 회선으로 받은 횟수').toBe(1);
    expect(await cachedWasmSize(page)).toBe(state.wasm.length);
  });

  test('③ 엔진이 바뀐 배포에서는 옛 엔진을 지우고 새 엔진을 받는다', async ({ page }) => {
    const { state, origin } = await startServer(t);
    await page.goto(`${origin}/`);
    await newWorkerActive(page, appCache(state.sw));
    await engineFetched(page);
    await expect.poll(() => cachedWasmSize(page), { timeout: 30000 }).toBe(state.wasm.length);
    const oldSize = state.wasm.length;

    state.wasm = Buffer.concat([state.wasm, Buffer.alloc(1024)]);
    state.sw = engineDeploy(state.sw, '0000000000000000');
    // 새 서비스워커는 앱 화면이 아닌 주소에서 받는다 — 앱 화면이 떠 있으면 그 화면이 새 엔진을 받기 시작한 직후 다음 이동에 끊길 수 있고,
    // 다 받지 못한 엔진은 캐시에 들지 않아 다음 화면이 한 번 더 받는다(11/8 겹쳐 돌린 시험에서 24번에 1~2번 — 받은 때와 단계를 기록해 확인). 끊긴 받기를 다시 받는 것은 맞는 동작이다.
    await page.goto(`${origin}/fit.js`);
    await page.evaluate(() => navigator.serviceWorker.getRegistration().then((registration) => registration.update()));
    await newWorkerActive(page, appCache(state.sw));
    await page.goto(`${origin}/`);
    await engineFetched(page);
    await expect.poll(() => cachedWasmSize(page), { timeout: 30000 }).toBe(oldSize + 1024);
    expect(state.wasmHits, '새 엔진을 회선으로 받았다').toBe(2);
  });

  test('④ 옛 캐시의 엔진 내용이 다르면 옮기지 않고 회선으로 받는다', async ({ page }) => {
    const { state, origin } = await startServer(t);
    await seedOldCache(page, origin, 'broken-engine');
    state.wasmHits = 0;
    await page.goto(`${origin}/`);
    await newWorkerActive(page, appCache(state.sw));
    await engineFetched(page);
    await expect.poll(() => cachedWasmSize(page), { timeout: 30000 }).toBe(state.wasm.length);
    expect(state.wasmHits).toBe(1);
  });

  test('④ 옮기다 실패해도 서비스워커는 설치되고 엔진을 회선으로 받는다', async ({ page }) => {
    const { state, origin } = await startServer(t);
    await seedOldCache(page, origin, null);
    state.wasmHits = 0;
    state.sw = `SubtleCrypto.prototype.digest = () => Promise.reject(new Error('시험으로 넣은 실패'));\n${state.sw}`;
    await page.goto(`${origin}/`);
    await newWorkerActive(page, appCache(state.sw));
    await engineFetched(page);
    await expect.poll(() => cachedWasmSize(page), { timeout: 30000 }).toBe(state.wasm.length);
    expect(state.wasmHits).toBe(1);
  });
});
