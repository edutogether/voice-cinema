// 기준 16(10/28) — 창 크기를 바꿔도 설치판 화면이 그 순간의 안쪽 크기로 새로 연 화면과 똑같은지 본다.
//   - 빌드한 설치판(release/win-unpacked)을 아래 작은 모니터에 띄운다(시험 전용 환경 변수 VC_TEST_SMALLEST_DISPLAY — main.js가 처음부터
//     가장 작은 모니터에 창을 만든다. 큰 모니터에는 한순간도 띄우지 않는다).
//   - 1~3단계마다 창을 차례로 바꾼다: 최대화 → 원래 크기 → 넓고 높게 → 같은 폭에서 높이만 줄이기(폭으로 맞추는 창 — 비율이 어긋나던 자리) →
//     최소 크기 → 중간 → 최대화 → 원래 크기. 바꿀 때마다 모든 요소의 자리를 재고(«바꾼 뒤»), 같은 창을 그 크기 그대로 새로 불러와 그 단계까지
//     다시 간 화면(«새로 연»)과 견준다. 새로 연 쪽을 같은 창 · 같은 크기로 잡는 까닭: 이 모니터는 125%라 최대화한 안쪽 높이가 721.6처럼
//     소수인데, 다른 브라우저 창은 정수 크기로만 맞출 수 있다. 크롬 웹과 같은지는 layout-compare.mjs(기준 15)가 따로 본다.
//   - 첫 화면에서는 창을 10px씩 끌어 줄였다 늘리는 모습을 창 캡처로 녹화하고(gfxcapture), 한 걸음마다 화면 맞춤 비율을 그 크기의 값과 견준다.
//   - 배율이 다른 모니터(100%)로 옮기는 것은 창을 숨긴 채 한다(큰 모니터에 시험 창을 띄우지 않는다) — 옮긴 뒤 · 돌아온 뒤 비율과 안쪽 크기를
//     재고, 아래 모니터에서 다시 보이게 한 뒤 새로 연 화면과 견준다.
// 쓰는 법(desktop/에서, 먼저 npm run dist 또는 electron-builder로 release/win-unpacked를 만든다): node tools/resize-check.mjs <결과 폴더>
import { _electron } from '@playwright/test';
import { spawn } from 'node:child_process';
import { mkdirSync, writeFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { installSyntheticMic, recordOnce } from '../../e2e/synthetic-mic.js';
import { compare, freeze, measure, routeDesktopUpload, thaw } from './layout-lib.mjs';

const HERE = path.dirname(fileURLToPath(import.meta.url));
const DESKTOP = path.join(HERE, '..');
const EXE = process.env.VC_DESKTOP_EXE ?? path.join(DESKTOP, 'release', 'win-unpacked', 'Voice Cinema.exe');
const out = path.resolve(process.argv[2] ?? 'resize-out');
mkdirSync(out, { recursive: true });
// 'max' = 최대화, 'restore' = 최대화 풀기(그 전 크기로), 그 밖은 창 안쪽 크기(CSS px)
const STEPS = ['max', 'restore', '1100x700', '1100x620', '1040x540', '1250x660', 'max', 'restore'];
const STAGES = ['1-home', '2-studio', '2-recorded', '3-result'];

const app = await _electron.launch({
  executablePath: EXE,
  args: [`--user-data-dir=${path.join(out, 'profile')}`, '--mute-audio', '--use-fake-device-for-media-stream'],
  env: { ...process.env, VC_TEST_SMALLEST_DISPLAY: '1' },
});
const report = { steps: {}, drag: [], monitors: [] };
const win = (fn, arg) => app.evaluate(({ BrowserWindow }, [src, a]) => new Function('w', 'a', src)(BrowserWindow.getAllWindows()[0], a), [fn, arg]);
// 화면 맞춤(public/fit.js)이 지금 크기에서 정할 비율 — fit.js와 같은 셈(폭 = html 폭, 높이 = 100svh 상자). PC(폭 1024 이상 · 가로) 기준 1366 × 720.
const sizeNow = () => {
  const probe = document.createElement('div');
  probe.style.cssText = 'position:fixed;left:0;top:0;width:0;height:100svh;visibility:hidden';
  document.documentElement.appendChild(probe);
  const h = probe.getBoundingClientRect().height;
  probe.remove();
  const w = document.documentElement.clientWidth;
  // 비율은 fit.js가 그대로 적어 두는 --fit으로 읽는다 — body.style.zoom 글자는 유효숫자 6자리로 잘려(1.0022223 → «1.00222») 같은 값도 어긋나 보인다
  const zoom = Number(getComputedStyle(document.documentElement).getPropertyValue('--fit').trim() || '1');
  const want = Math.min(w / 1366, h / 720);
  return { w, h, inner: [innerWidth, innerHeight], zoom: +zoom.toFixed(6), want: +want.toFixed(6), fits: Math.abs(zoom - want) < 1e-6 };
};
let failures = 0;
try {
  await routeDesktopUpload(app);
  const page = await app.firstWindow();
  await page.waitForFunction(() => document.visibilityState === 'visible', null, { timeout: 60000 });
  await installSyntheticMic(page, [{ delay: 0.3, dur: 1.5 }]);

  // 그 단계로 간다 — 늘 새로 불러온 화면에서 시작한다(창 크기는 그대로). 첫 화면은 자동 넘김을 멈춘다(손가락 한 번 누르기 — desktop/e2e와 같다):
  // 그대로 두면 6초마다 가운데 장면이 바뀌어, 오래 걸린 «바꾼 뒤»와 막 연 «새로 연»의 요소가 달라진다.
  async function enter(stage) {
    await page.reload();
    await page.locator('#splash').waitFor({ state: 'detached', timeout: 60000 });
    await page.locator('.scene-carousel').dispatchEvent('pointerdown', { pointerType: 'touch', isPrimary: true });
    if (stage === '1-home') { await page.waitForTimeout(1500); return; }
    await page.getByRole('button', { name: '판타지 미리보기 선택', exact: true }).click();
    await page.waitForFunction(() => document.querySelector('#chipName')?.textContent === '판타지' && document.querySelector('#clip')?.readyState === 4, null, { timeout: 30000 });
    await page.waitForTimeout(1500);
    if (stage === '2-studio') return;
    const take = await recordOnce(page);
    if (take.phase !== 'recorded') throw new Error(`녹음 뒤 단계가 ${take.phase}`);
    await page.waitForTimeout(1000);
    if (stage === '2-recorded') return;
    await page.locator('button', { hasText: '저장하기' }).click();
    await page.locator('#qrImg').waitFor({ state: 'visible', timeout: 120000 });
    await page.waitForTimeout(1500);
  }
  async function snap(name) {
    const { w } = await page.evaluate(sizeNow);
    await page.mouse.move(w - 2, 2);
    await page.evaluate(freeze);
    const m = await page.evaluate(measure);
    const size = await page.evaluate(sizeNow);
    const png = await app.evaluate(async ({ BrowserWindow }) => (await BrowserWindow.getAllWindows()[0].webContents.capturePage()).toPNG().toString('base64'));
    writeFileSync(path.join(out, `${name}.png`), Buffer.from(png, 'base64'));
    await page.evaluate(thaw);
    return { m, size };
  }
  async function setStep(step) {
    if (step === 'max') await win('w.maximize()');
    else if (step === 'restore') await win('if (w.isMaximized()) w.unmaximize()');
    else { const [cw, ch] = step.split('x').map(Number); await win('if (w.isMaximized()) w.unmaximize(); w.setContentSize(a[0], a[1])', [cw, ch]); }
    await page.waitForTimeout(900);
  }
  // «바꾼 뒤»와 «새로 연»을 견준다 — 요소 자리 · 화면 맞춤 값이 모두 같아야 한다
  function judge(list, label, resized, fresh) {
    const c = compare(resized.m, fresh.m);
    const sameSize = resized.size.w === fresh.size.w && resized.size.h === fresh.size.h;
    const ok = sameSize && c.differing === 0 && c.nameMismatch === 0 && resized.m.zoom === fresh.m.zoom && resized.size.fits;
    if (!ok) failures++;
    list.push({ label, ok, size: resized.size, freshSize: fresh.size, zoom: resized.m.zoom || '1', freshZoom: fresh.m.zoom || '1', elements: c.elements, differing: c.differing, nameMismatch: c.nameMismatch, maxDiff: c.maxDiff, worst: c.worst });
    console.log(label, ok ? 'OK' : 'DIFF', JSON.stringify({ size: `${resized.size.w}x${resized.size.h}`, zoom: resized.m.zoom || '1', fresh: fresh.m.zoom || '1', want: resized.size.want, differing: c.differing, nameMismatch: c.nameMismatch, maxDiff: c.maxDiff }));
  }

  for (const stage of STAGES) {
    const list = (report.steps[stage] = []);
    await enter(stage);
    for (const [i, step] of STEPS.entries()) {
      await setStep(step);
      const resized = await snap(`${stage}-${i}-${step}-resized`);
      await enter(stage);
      const fresh = await snap(`${stage}-${i}-${step}-fresh`);
      judge(list, `${stage} ${i} ${step}`, resized, fresh);
    }
  }

  // 끌어서 바꾸기(첫 화면): 1390×700 → 1040×540 → 1390×700을 10px씩(0.03초 간격) — 창 캡처로 녹화하며 걸음마다 비율을 잰다
  await enter('1-home');
  await setStep('restore');
  await win('w.setContentSize(1390, 700)');
  await page.waitForTimeout(800);
  const hwnd = await app.evaluate(({ BrowserWindow }) => BrowserWindow.getAllWindows()[0].getNativeWindowHandle().readBigUInt64LE(0).toString());
  const ff = spawn('ffmpeg', ['-y', '-loglevel', 'error', '-f', 'lavfi', '-i', `gfxcapture=hwnd=${hwnd}:capture_cursor=0:max_framerate=30,hwdownload,format=bgra`, '-fps_mode', 'cfr', '-r', '30', '-c:v', 'ffv1', path.join(out, 'drag.mkv')], { stdio: ['pipe', 'ignore', 'ignore'], windowsHide: true });
  await page.waitForTimeout(1200);
  const path1 = [];
  for (let k = 0; k <= 35; k++) path1.push([1390 - k * 10, 700 - Math.round(k * 160 / 35)]);
  for (const [cw, ch] of [...path1, ...path1.slice().reverse()]) {
    await win('w.setContentSize(a[0], a[1])', [cw, ch]);
    await page.waitForTimeout(30);
    report.drag.push(await page.evaluate(sizeNow));
  }
  await page.waitForTimeout(1000);
  const dragResized = await snap('drag-settled-resized');
  ff.stdin.write('q'); ff.stdin.end();
  await new Promise((r) => { ff.on('exit', r); setTimeout(() => { ff.kill(); r(); }, 8000); });
  await enter('1-home');
  const dragFresh = await snap('drag-settled-fresh');
  report.dragSettled = [];
  judge(report.dragSettled, 'drag settled', dragResized, dragFresh);
  report.dragStepsWithStaleZoom = report.drag.filter((s) => !s.fits).length;

  // 배율이 다른 모니터로 옮기기 — 창을 숨긴 채(큰 모니터에 시험 창을 띄우지 않는다)
  await app.evaluate(({ BrowserWindow }) => { const w = BrowserWindow.getAllWindows()[0]; w.webContents.setBackgroundThrottling(false); if (w.isMaximized()) w.unmaximize(); w.hide(); });
  await page.waitForTimeout(800);
  const displays = await app.evaluate(({ screen }) => screen.getAllDisplays().map((d) => ({ id: d.id, scale: d.scaleFactor, work: d.workArea })));
  const small = [...displays].sort((a, b) => a.work.width * a.work.height - b.work.width * b.work.height)[0];
  const other = displays.find((d) => d.scale !== small.scale) ?? displays.find((d) => d.id !== small.id);
  for (const d of [other, small]) {
    const visible = await app.evaluate(({ BrowserWindow }, d) => { const w = BrowserWindow.getAllWindows()[0]; w.setBounds({ x: d.work.x + 40, y: d.work.y + 40, width: 1250, height: 700 }); return w.isVisible(); }, d);
    await page.waitForTimeout(1500);
    const s = await page.evaluate(sizeNow);
    report.monitors.push({ display: d.id, scale: d.scale, visible, dpr: await page.evaluate(() => devicePixelRatio), ...s });
    console.log('monitor(hidden)', d.scale, JSON.stringify(report.monitors.at(-1)));
  }
  // 아래 모니터에서 다시 보이게 한 뒤(원래 크기 → 최대화) 새로 연 화면과 견준다. 배율이 다른 모니터에서 옮겨 온 창은 크기가 그 배율만큼 커져
  // 있을 수 있어(main.js 주석) 같은 모니터 안에서 자리 · 크기를 한 번 더 준 뒤 보인다 — 아래 모니터 밖으로 삐져나오지 않게.
  report.afterMove = [];
  await app.evaluate(({ BrowserWindow }, d) => { const w = BrowserWindow.getAllWindows()[0]; w.setBounds({ x: d.work.x + 40, y: d.work.y + 40, width: 1250, height: 700 }); }, small);
  await page.waitForTimeout(800);
  report.monitors.push({ note: 'same-monitor bounds again', ...(await page.evaluate(sizeNow)), bounds: await win('return w.getBounds()') });
  await app.evaluate(({ BrowserWindow }) => BrowserWindow.getAllWindows()[0].showInactive());
  await page.waitForTimeout(1200);
  const shownResized = await snap('after-move-shown-resized');
  await enter('1-home');
  judge(report.afterMove, 'after move shown', shownResized, await snap('after-move-shown-fresh'));
  await setStep('max');
  const maxResized = await snap('after-move-max-resized');
  await enter('1-home');
  judge(report.afterMove, 'after move max', maxResized, await snap('after-move-max-fresh'));
} finally {
  report.failures = failures;
  writeFileSync(path.join(out, 'report.json'), JSON.stringify(report, null, 1));
  console.log('failures', failures);
  await app.close().catch(() => {});
}
