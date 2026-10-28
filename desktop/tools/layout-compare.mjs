// 설치판 화면과 웹(로컬 빌드) 화면을 같은 안쪽 크기로 그려 견준다(기준 15, 10/28). 화면에 창을 띄우지 않는다(기준 12):
//   - 설치판: 앱 코드(main.js) 그대로를 electron으로 띄우되 layout-hook.cjs가 창을 숨기고 안쪽 크기를 맞춘다(앱이 하는 차례 그대로 —
//     작업 영역 크기로 맞춘 뒤 «최대화» 자리에서 그 크기로 넓힌다).
//   - 웹: 같은 dist를 vite preview로 내고 Playwright 크로미움(창 없음)으로 연다. 같은 주소를 설치판과 같은 엔진(Electron 크로미움)으로도 연다
//     (layout-browser.cjs) — 크롬과 Electron은 판이 달라 글자 가장자리 · 영상 해독 화소가 조금 다르다. 같은 엔진과 견주면 설치판 껍데기가 더한 차이만 남는다.
// 1~3단계 차례 · 재는 법 · 견주는 법은 layout-lib.mjs.
// 쓰는 법(desktop/에서): node tools/layout-compare.mjs <결과 폴더> [1366x768 ...]
import { _electron, chromium } from '@playwright/test';
import { mkdirSync, writeFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { compare, flow, freeze, measure, routeDesktopUpload, routePageUpload, startPreview, thaw, webShots } from './layout-lib.mjs';

const HERE = path.dirname(fileURLToPath(import.meta.url));
const DESKTOP = path.join(HERE, '..');
const ROOT = path.join(DESKTOP, '..');
const ELECTRON = path.join(DESKTOP, 'node_modules', 'electron', 'dist', 'electron.exe');
const PORT = 4399;
const out = path.resolve(process.argv[2] ?? 'layout-out');
const sizes = process.argv.slice(3).length ? process.argv.slice(3) : ['1366x768', '1536x864', '1920x1080', '2560x1440', '3840x2160'];
mkdirSync(out, { recursive: true });

/** Electron 창 하나(설치판 또는 같은 엔진 브라우저)로 1~3단계를 재고 찍는다 */
async function electronShots(args, env, size, tag, setup) {
  const shots = {};
  const [w, h] = size.split('x').map(Number);
  const app = await _electron.launch({ executablePath: ELECTRON, args, env: { ...process.env, VC_LAYOUT_SIZE: size, ...env } });
  try {
    const page = await app.firstWindow();
    await setup(app, page);
    await flow(page, async (name) => {
      await page.waitForFunction(([w, h]) => innerWidth === w && innerHeight === h, [w, h], { timeout: 30000 });
      await page.mouse.move(w - 2, 2);
      await page.evaluate(freeze);
      shots[name] = await page.evaluate(measure);
      const png = await app.evaluate(async ({ BrowserWindow }) => (await BrowserWindow.getAllWindows()[0].webContents.capturePage()).toPNG().toString('base64'));
      writeFileSync(path.join(out, `${size}-${name}-${tag}.png`), Buffer.from(png, 'base64'));
      await page.evaluate(thaw);
    });
  } finally {
    await app.close();
  }
  return shots;
}
const desktopRun = (size) => electronShots(
  ['-r', path.join(HERE, 'layout-hook.cjs'), DESKTOP, `--user-data-dir=${path.join(out, `profile-${size}`)}`, '--mute-audio', '--use-fake-device-for-media-stream'],
  {}, size, 'desktop', (app) => routeDesktopUpload(app));
// 같은 엔진(Electron 44 크로미움)을 «그냥 브라우저»로 써서 웹을 연 쪽 — 설치판 껍데기만 뺀 것
const engineRun = (size) => electronShots(
  [path.join(HERE, 'layout-browser.cjs'), `--user-data-dir=${path.join(out, `profile-engine-${size}`)}`, '--mute-audio', '--use-fake-device-for-media-stream'],
  { VC_LAYOUT_URL: `http://127.0.0.1:${PORT}/` }, size, 'engine', (_app, page) => routePageUpload(page));

const server = await startPreview(ROOT, PORT);
const report = {};
try {
  const browser = await chromium.launch({ args: ['--use-fake-device-for-media-stream', '--use-fake-ui-for-media-stream', '--mute-audio'] });
  try {
    for (const size of sizes) {
      const web = await webShots(browser, PORT, size, (name) => path.join(out, `${size}-${name}-web.png`));
      const desktop = await desktopRun(size);
      const engine = await engineRun(size);
      report[size] = {};
      for (const name of Object.keys(web)) {
        report[size][name] = { ...compare(desktop[name], web[name]), engine: compare(desktop[name], engine[name]), desktop: { ...desktop[name], rects: undefined }, web: { ...web[name], rects: undefined } };
        const r = report[size][name];
        console.log(size, name, JSON.stringify({ elements: r.elements, nameMismatch: r.nameMismatch, differing: r.differing, maxDiff: r.maxDiff, top: Object.values(r.top).every((v) => v === 'same') ? 'same' : r.top,
          engine: { differing: r.engine.differing, maxDiff: r.engine.maxDiff, nameMismatch: r.engine.nameMismatch } }));
      }
      const rects = (shots) => Object.fromEntries(Object.entries(shots).map(([k, v]) => [k, v.rects]));
      writeFileSync(path.join(out, `rects-${size}.json`), JSON.stringify({ web: rects(web), desktop: rects(desktop), engine: rects(engine) }));
    }
  } finally {
    await browser.close();
  }
} finally {
  server.kill();
  writeFileSync(path.join(out, 'report.json'), JSON.stringify(report, null, 1));
}
