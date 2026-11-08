#!/usr/bin/env node
// 설치판 시작 창 «보낼 메일 N건이 있어요»(11/8 Bumm님)의 상태별 캡처 — 숨긴 창(큰 모니터로 넘어가지 않는다)에서 창의 실제 화소로 찍는다.
//   node tools/mail-startup-captures.mjs <설치판 exe> <결과 폴더> [가로x세로@배율]
// 업로드 · 메일은 앱의 세션에서 답하고 바깥 요청은 닿지 않는 프록시로 막는다(mail-captures.mjs와 같다) — 운영 저장소 · 메일 서버로 나가는 것이 없다.
// 대기열은 다리(window.vcDesktop.mail)로 바로 채운다 — 녹음부터 대기까지의 흐름은 desktop/e2e/mail.spec.mjs가 본다. 받는 주소는 보기용 글자다.
import { _electron } from '@playwright/test';
import fs from 'node:fs/promises';
import path from 'node:path';

const [exe, outArg, sizeArg = '2560x1369@1'] = process.argv.slice(2);
if (!exe || !outArg) throw new Error('사용법: node tools/mail-startup-captures.mjs <설치판 exe> <결과 폴더> [가로x세로@배율]');
const [, w, h, scale = '1'] = /^(\d+)x(\d+)(?:@([\d.]+))?$/.exec(sizeArg);
const tag = `${w}x${h}${scale === '1' ? '' : `@${scale}`}`;
const out = path.resolve(outArg, tag);
const delay = (ms) => new Promise((done) => setTimeout(done, ms));
const MOVIE_URL = 'https://storage.googleapis.com/inky-voice-cinema.firebasestorage.app/dubs/dub_animation_sample.mp4';
const TEACHER_A = 'teacher-a@example.test';
const TEACHER_B = 'teacher-b@example.test';

async function launch(profile) {
  const app = await _electron.launch({
    executablePath: path.resolve(exe),
    args: [`--user-data-dir=${profile}`, '--mute-audio', '--proxy-server=http://127.0.0.1:9'],
    env: { ...process.env, VC_TEST_WINDOW: 'hidden' },
  });
  // 업로드는 늘 받는다. 메일은 __holdTo 주소면 __release()를 부를 때까지 붙잡고, __failTo 주소면 503으로 답한다
  await app.evaluate(({ session }, url) => {
    const ses = session.fromPartition('persist:voice-cinema');
    const original = ses.fetch.bind(ses);
    const cors = { 'Access-Control-Allow-Origin': 'https://voice.edutogether.kr', Vary: 'Origin' };
    globalThis.__holdTo = null;
    globalThis.__failTo = null;
    globalThis.__release = null;
    ses.fetch = async (request, options) => {
      const kind = ['upload', 'mail'].find((k) => request.url.endsWith(`/voiceCinema/${k}`));
      if (!kind) return original(request, options);
      if (request.method === 'OPTIONS') return new Response(null, { status: 204, headers: { ...cors, 'Access-Control-Allow-Methods': 'POST', 'Access-Control-Allow-Headers': request.headers.get('access-control-request-headers') ?? '*' } });
      const text = await request.text();
      const json = (status, body) => new Response(JSON.stringify(body), { status, headers: { ...cors, 'Content-Type': 'application/json' } });
      if (kind === 'upload') return json(200, { ok: true, url });
      const { to } = JSON.parse(text);
      if (to === globalThis.__holdTo) await new Promise((done) => { globalThis.__release = done; });
      return to === globalThis.__failTo ? json(503, { ok: false }) : json(200, { ok: true });
    };
  }, MOVIE_URL);
  const page = await app.firstWindow();
  await app.evaluate(({ BrowserWindow }, [cw, ch]) => { BrowserWindow.getAllWindows()[0].setContentSize(cw, ch); }, [Number(w), Number(h)]);
  const cdp = await page.context().newCDPSession(page);
  await cdp.send('Emulation.setDeviceMetricsOverride', { width: 0, height: 0, deviceScaleFactor: Number(scale), mobile: false });
  return { app, page };
}

/** 끊긴 채 선생님 두 분 몫을 하나씩 대기열에 넣고 다시 연다(켤 때와 같은 시작 창) */
async function queueTwoAndRestart(app, page) {
  await app.context().setOffline(true);
  await page.reload();
  await page.locator('#splash').waitFor({ state: 'detached', timeout: 90000 });
  await page.evaluate(async ([a, b]) => {
    const bytes = new Uint8Array(64).buffer;
    await window.vcDesktop.mail.add({ name: '별님', email: a, genreId: 'fantasy', genreName: '판타지' }, bytes);
    await window.vcDesktop.mail.add({ name: '달님', email: b, genreId: 'sf', genreName: 'SF' }, bytes);
  }, [TEACHER_A, TEACHER_B]);
  await page.reload();
  await page.locator('#splash').waitFor({ state: 'detached', timeout: 90000 });
}

const shooter = (app, page) => async (name) => {
  // 숨긴 창은 그리기가 드물어 한 번으로는 직전 화면이 찍힐 때가 있다 — 막대가 움직이는 동안(.3초)도 지나게 기다린다
  for (let i = 0; i < 2; i++) {
    await app.evaluate(({ BrowserWindow }) => { BrowserWindow.getAllWindows()[0].webContents.invalidate(); });
    await delay(1000);
  }
  const png = await app.evaluate(async ({ BrowserWindow }) => (await BrowserWindow.getAllWindows()[0].webContents.capturePage(undefined, { stayHidden: true, stayAwake: true })).toPNG().toString('base64'));
  await fs.writeFile(path.join(out, `${name}.png`), Buffer.from(png, 'base64'));
  const text = await page.locator('#mailStartup').evaluate((el) => (el.open ? el.innerText.replace(/\s+/g, ' ').trim() : '(닫힘)'));
  console.log(`${tag} ${name}: ${text}`);
};

await fs.mkdir(out, { recursive: true });

// 1) 끊김 → 보내는 중 → 다 보냄 → [완료]
{
  const { app, page } = await launch(path.join(out, 'profile-1'));
  const shot = shooter(app, page);
  const startup = page.locator('#mailStartup');
  await queueTwoAndRestart(app, page);
  await page.locator('#mailStartup[data-phase="offline"]').waitFor({ timeout: 30000 });
  await shot('1-끊김-보낼-메일-2건');
  await app.evaluate((_e, to) => { globalThis.__holdTo = to; }, TEACHER_B);
  await app.context().setOffline(false);
  await page.locator('#mailStartup[data-phase="sending"] [role="status"]', { hasText: '1 / 2건' }).waitFor({ timeout: 90000 });
  for (let i = 0; i < 60 && !(await app.evaluate(() => !!globalThis.__release)); i++) await delay(500);
  await shot('2-보내는-중-1-of-2');
  await app.evaluate(() => { globalThis.__holdTo = null; globalThis.__release?.(); });
  await page.locator('#mailStartup[data-phase="done"]').waitFor({ timeout: 60000 });
  await shot('3-다-보냄-이제-꺼도-돼요');
  await startup.getByRole('button', { name: '완료' }).click();
  await startup.waitFor({ state: 'hidden' });
  await shot('4-완료-누른-뒤-첫-화면');
  await app.close();
}

// 2) 한 분 몫은 보내고 한 분 몫은 못 보냄
{
  const { app, page } = await launch(path.join(out, 'profile-2'));
  const shot = shooter(app, page);
  const startup = page.locator('#mailStartup');
  await queueTwoAndRestart(app, page);
  await app.evaluate((_e, to) => { globalThis.__failTo = to; }, TEACHER_B);
  await app.context().setOffline(false);
  await page.locator('#mailStartup[data-phase="partial"]').waitFor({ timeout: 90000 });
  await shot('5-일부-못-보냄');
  await app.close();
}
