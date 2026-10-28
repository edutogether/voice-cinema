// 화면 비교 도구 둘(layout-compare.mjs — 같은 크기로 새로 연 설치판 · 웹, resize-check.mjs — 창 크기를 바꿔 가는 설치판)이 함께 쓰는 부분.
//   - flow: 1~3단계를 같은 순서로 지난다 — 첫 화면 → 녹음실(판타지) → 녹음 뒤 → 완성(QR). 업로드는 가로채 같은 답을 준다(운영 저장소에 쌓지 않는다).
//   - freeze · measure: 시험 마우스를 오른쪽 위 구석으로 옮긴 뒤 움직임(영상 · 흐르는 장면 띠 · 애니메이션)을 세우고 모든 요소의 자리를 적는다.
//   - compare: 두 쪽의 화면 맞춤 값과 요소마다의 자리(getBoundingClientRect)를 견준다.
import { spawn } from 'node:child_process';
import path from 'node:path';
import { installSyntheticMic, recordOnce } from '../../e2e/synthetic-mic.js';

export const UPLOADED = 'https://storage.googleapis.com/inky-voice-cinema.firebasestorage.app/dubs/dub_fantasy_layout_check.mp4';

// 움직임을 세운다 — 다음 단계로 넘어가기 전에 thaw로 다시 움직이게 한다(멈춘 애니메이션이 끝나기를 기다리는 화면이 있다).
// 영상은 첫 장을 받을 때까지(최대 5초) 기다린 뒤 0초로 옮겨 그 장이 그려지기를 기다린다. 전환(transition — 마우스를 치운 뒤 줄어드는 단추 등)은
// 끝 상태로 보내고, 되풀이 애니메이션(흐르는 장면 띠 등)만 0초에 세운다.
export const freeze = async () => {
  window.__frozen = document.getAnimations().filter((a) => !(a instanceof CSSTransition));
  for (const a of document.getAnimations()) { if (a instanceof CSSTransition) { try { a.finish(); } catch { /* 없음 */ } } }
  for (const a of window.__frozen) { try { a.pause(); a.currentTime = 0; } catch { /* 없음 */ } }
  await Promise.all([...document.querySelectorAll('video')].map((v) => new Promise((done) => {
    const settle = () => {
      try { v.pause(); } catch { /* 없음 */ }
      if (v.currentTime === 0 && !v.seeking) { done(); return; }
      v.addEventListener('seeked', () => done(), { once: true });
      v.currentTime = 0;
      setTimeout(done, 3000);
    };
    if (!v.currentSrc || v.readyState >= 2) { settle(); return; }
    v.addEventListener('loadeddata', settle, { once: true });
    setTimeout(settle, 5000);
  })));
  await new Promise((r) => setTimeout(r, 400));
  await new Promise((r) => requestAnimationFrame(() => requestAnimationFrame(r)));
};
export const thaw = () => { for (const a of window.__frozen ?? []) { try { a.play(); } catch { /* 없음 */ } } };

export const measure = () => {
  const root = document.documentElement;
  const cs = getComputedStyle(root);
  const name = (el) => el.tagName.toLowerCase() + (el.id ? `#${el.id}` : '') + (typeof el.className === 'string' && el.className.trim() ? `.${el.className.trim().split(/\s+/).join('.')}` : '');
  // reCAPTCHA(설치판은 정본 주소라 불러온다 — 크기 0의 숨은 칸)와 App Check 칸은 화면에 없는 것이라 뺀다
  const skip = (el) => el.closest('.grecaptcha-badge, [id^="fire_app_check"], [id^="g-recaptcha"]') || /^g-recaptcha/.test(el.id);
  return {
    inner: [innerWidth, innerHeight], client: [root.clientWidth, root.clientHeight], dpr: devicePixelRatio,
    fit: root.dataset.fit ?? null, zoom: document.body.style.zoom, appW: cs.getPropertyValue('--app-w').trim(), appH: cs.getPropertyValue('--app-h').trim(),
    scroll: [root.scrollWidth, root.scrollHeight], visibility: document.visibilityState, hover: matchMedia('(hover: hover) and (pointer: fine)').matches,
    rects: [...document.querySelectorAll('body *')].filter((el) => !skip(el) && !(el.tagName === 'IFRAME' && !el.getBoundingClientRect().width))
      .map((el) => { const r = el.getBoundingClientRect(); return [name(el), +r.x.toFixed(2), +r.y.toFixed(2), +r.width.toFixed(2), +r.height.toFixed(2)]; }),
  };
};

/** 1~3단계를 지나며 화면마다 snap(이름)을 부른다 */
export async function flow(page, snap) {
  // 문서가 다 뜬 뒤에 스플래시가 사라지기를 기다린다 — 문서가 오기 전이면 «스플래시 없음»이 바로 참이 되어 스플래시가 남은 화면을 잰다(10/28 같은 엔진 2560 첫 화면)
  await page.waitForLoadState('load');
  await page.locator('#splash').waitFor({ state: 'detached', timeout: 60000 });
  await page.waitForTimeout(1500);
  await snap('1-home');
  // 녹음실: 자동 넘김을 멈추고(손가락 한 번 누르기) 아래 그림 띠에서 장면을 누른다 — desktop/e2e와 같다
  await installSyntheticMic(page, [{ delay: 0.3, dur: 1.5 }]);
  await page.reload();
  await page.locator('#splash').waitFor({ state: 'detached', timeout: 60000 });
  await page.locator('.scene-carousel').dispatchEvent('pointerdown', { pointerType: 'touch', isPrimary: true });
  await page.getByRole('button', { name: '판타지 미리보기 선택', exact: true }).click();
  await page.waitForFunction(() => document.querySelector('#chipName')?.textContent === '판타지' && document.querySelector('#clip')?.readyState === 4, null, { timeout: 30000 });
  await page.waitForTimeout(1500);
  await snap('2-studio');
  const take = await recordOnce(page);
  if (take.phase !== 'recorded') throw new Error(`녹음 뒤 단계가 ${take.phase}`);
  await page.waitForTimeout(1000);
  await snap('2-recorded');
  await page.locator('button', { hasText: '저장하기' }).click();
  await page.locator('#qrImg').waitFor({ state: 'visible', timeout: 120000 });
  await page.waitForTimeout(1500);
  await snap('3-result');
}

export function compare(a, b) {
  const keys = ['inner', 'client', 'dpr', 'fit', 'zoom', 'appW', 'appH', 'scroll', 'hover'];
  const top = Object.fromEntries(keys.map((k) => [k, JSON.stringify(a[k]) === JSON.stringify(b[k]) ? 'same' : { desktop: a[k], web: b[k] }]));
  let maxDiff = 0; let differing = 0; let nameMismatch = Math.abs(a.rects.length - b.rects.length); const worst = [];
  for (let i = 0; i < Math.min(a.rects.length, b.rects.length); i++) {
    const [na, ...ra] = a.rects[i]; const [nb, ...rb] = b.rects[i];
    if (na !== nb) { nameMismatch++; worst.push(['name', na, nb]); continue; }
    const d = Math.max(...ra.map((v, j) => Math.abs(v - rb[j])));
    if (d > 0) { differing++; worst.push([d, na, ra, rb]); }
    maxDiff = Math.max(maxDiff, d);
  }
  return { top, elements: [a.rects.length, b.rects.length], nameMismatch, differing, maxDiff, worst: worst.slice(0, 10) };
}

/** 설치판의 업로드 요청만 가로챈다(desktop/e2e routeUpload와 같다 — 설치판은 https를 직접 처리해 page.route가 닿지 않는다) */
export async function routeDesktopUpload(app) {
  await app.evaluate(({ session }, url) => {
    const ses = session.fromPartition('persist:voice-cinema');
    const original = ses.fetch.bind(ses);
    const cors = { 'Access-Control-Allow-Origin': 'https://voice.edutogether.kr', Vary: 'Origin' };
    ses.fetch = async (request, options) => {
      if (!request.url.endsWith('/voiceCinema/upload')) return original(request, options);
      if (request.method === 'OPTIONS') return new Response(null, { status: 204, headers: { ...cors, 'Access-Control-Allow-Methods': 'POST', 'Access-Control-Allow-Headers': request.headers.get('access-control-request-headers') ?? '' } });
      await request.text();
      return new Response(JSON.stringify({ ok: true, url }), { status: 200, headers: { ...cors, 'Content-Type': 'application/json' } });
    };
  }, UPLOADED);
}
export const routePageUpload = (page) => page.route('**/voiceCinema/upload', (route) => route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({ ok: true, url: UPLOADED }) }));

/** 로컬 빌드(루트 dist)를 vite preview로 낸다 — 끝나면 kill() */
export async function startPreview(root, port) {
  const server = spawn(process.execPath, [path.join(root, 'node_modules', 'vite', 'bin', 'vite.js'), 'preview', '--port', String(port), '--strictPort', '--host', '127.0.0.1'], { cwd: root, stdio: 'ignore' });
  await new Promise((r) => setTimeout(r, 3000));
  return server;
}

/** 웹(Playwright 크로미움, 창 없음)을 그 크기로 새로 열어 1~3단계를 재고 찍는다 → { 단계: 잰 값 } */
export async function webShots(browser, port, size, pngPath) {
  const shots = {};
  const [w, h] = size.split('x').map(Number);
  const context = await browser.newContext({ viewport: { width: w, height: h }, deviceScaleFactor: 1, permissions: ['microphone'] });
  const page = await context.newPage();
  await routePageUpload(page);
  try {
    await page.goto(`http://127.0.0.1:${port}/`);
    await flow(page, async (name) => {
      await page.mouse.move(w - 2, 2);
      await page.evaluate(freeze);
      shots[name] = await page.evaluate(measure);
      if (pngPath) await page.screenshot({ path: pngPath(name) });
      await page.evaluate(thaw);
    });
  } finally {
    await context.close();
  }
  return shots;
}
