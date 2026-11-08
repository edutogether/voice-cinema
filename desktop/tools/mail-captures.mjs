#!/usr/bin/env node
// 설치판 메일 전달의 단계별 캡처 — 숨긴 창(큰 모니터로 넘어가지 않는다)에서 실제 흐름을 지나며 창의 실제 화소로 찍는다.
//   node tools/mail-captures.mjs <설치판 exe> <결과 폴더> [가로x세로@배율,…]
// 업로드 · 메일은 앱의 세션에서 답하고 바깥 요청은 닿지 않는 프록시로 막는다 — 운영 저장소에 아무것도 올라가지 않고 메일은 어디로도 가지 않는다. 받는 주소는 보기용 글자다.
// 인터넷 끊김은 Windows가 연결 없음을 알리는 것과 같은 상태(navigator.onLine 거짓)로 흉내 낸다 — 화면에는 시험용 단추가 없다(11/8).
import { _electron } from '@playwright/test';
import fs from 'node:fs/promises';
import path from 'node:path';

const [exe, outArg, sizesArg = '2560x1369@1,1366x697@2,640x640@2'] = process.argv.slice(2);
if (!exe || !outArg) throw new Error('사용법: node tools/mail-captures.mjs <설치판 exe> <결과 폴더> [가로x세로@배율,…]');
const out = path.resolve(outArg);
const delay = (ms) => new Promise((done) => setTimeout(done, ms));
const NAME = '별님';
const MOVIE_URL = 'https://storage.googleapis.com/inky-voice-cinema.firebasestorage.app/dubs/dub_animation_sample.mp4';

async function shoot({ w, h, scale }) {
  const tag = `${w}x${h}${scale === 1 ? '' : `@${scale}`}`;
  const dir = path.join(out, tag);
  await fs.mkdir(dir, { recursive: true });
  const app = await _electron.launch({
    executablePath: path.resolve(exe),
    args: [`--user-data-dir=${path.join(out, 'profile', tag)}`, '--mute-audio', '--use-fake-device-for-media-stream', '--use-fake-ui-for-media-stream', '--proxy-server=http://127.0.0.1:9'],
    env: { ...process.env, VC_TEST_WINDOW: 'hidden' },
  });
  await app.evaluate(({ session }, url) => {
    const ses = session.fromPartition('persist:voice-cinema');
    const original = ses.fetch.bind(ses);
    const cors = { 'Access-Control-Allow-Origin': 'https://voice.edutogether.kr', Vary: 'Origin' };
    ses.fetch = async (request, options) => {
      const kind = ['upload', 'mail'].find((k) => request.url.endsWith(`/voiceCinema/${k}`));
      if (!kind) return original(request, options);
      if (request.method === 'OPTIONS') return new Response(null, { status: 204, headers: { ...cors, 'Access-Control-Allow-Methods': 'POST', 'Access-Control-Allow-Headers': request.headers.get('access-control-request-headers') ?? '*' } });
      await request.text();
      return new Response(JSON.stringify(kind === 'upload' ? { ok: true, url } : { ok: true }), { status: 200, headers: { ...cors, 'Content-Type': 'application/json' } });
    };
  }, MOVIE_URL);
  const page = await app.firstWindow();
  const offline = (on) => app.context().setOffline(on);
  await app.evaluate(({ BrowserWindow }, [cw, ch]) => { BrowserWindow.getAllWindows()[0].setContentSize(cw, ch); }, [w, h]);
  const cdp = await page.context().newCDPSession(page);
  await cdp.send('Emulation.setDeviceMetricsOverride', { width: 0, height: 0, deviceScaleFactor: scale, mobile: false });
  await page.reload();
  await page.locator('#splash').waitFor({ state: 'detached', timeout: 90000 });

  const shot = async (name) => {
    // 숨긴 창은 그리기가 드물어 한 번으로는 직전 화면이 찍힐 때가 있다
    for (let i = 0; i < 2; i++) {
      await app.evaluate(({ BrowserWindow }) => { BrowserWindow.getAllWindows()[0].webContents.invalidate(); });
      await delay(1000);
    }
    const png = await app.evaluate(async ({ BrowserWindow }) => (await BrowserWindow.getAllWindows()[0].webContents.capturePage(undefined, { stayHidden: true, stayAwake: true })).toPNG().toString('base64'));
    await fs.writeFile(path.join(dir, `${name}.png`), Buffer.from(png, 'base64'));
    const m = await page.evaluate(() => ({ w: innerWidth, h: innerHeight, docW: document.documentElement.scrollWidth, docH: document.documentElement.scrollHeight }));
    console.log(`${tag} ${name}: 창 ${m.w}x${m.h}, 문서 ${m.docW}x${m.docH}`);
  };
  const phase = (p) => page.locator(`#studio.active[data-phase="${p}"]`).waitFor({ timeout: 60000 });
  const seek = (t) => page.evaluate((s) => { document.getElementById('clip').currentTime = s; }, t);
  const recordToEntry = async (atStudio) => {
    await page.locator('.scene-carousel').dispatchEvent('pointerdown', { pointerType: 'touch', isPrimary: true });
    await page.locator('.scene-shell.is-current .tile').click();
    await phase('previewing');
    await seek(9.75);
    await phase('idle');
    await atStudio?.();
    await page.locator('#recBtn').click();
    await phase('watching');
    await delay(250);
    await seek(4.4);
    await phase('continuing');
    await seek(9.7);
    await page.locator('#afterRow').waitFor({ timeout: 30000 });
    await page.locator('#saveBtn').click();
    await page.locator('#mailName').waitFor({ timeout: 180000 });
  };

  await offline(true);
  await shot('01-메인-설치판-표시');
  await recordToEntry(() => shot('01-녹음실-표시-없음'));
  await shot('02-입력-빈칸');
  await page.locator('#mailNextBtn').click();
  await shot('03-입력-오류');
  await page.locator('#mailName').fill(NAME);
  await page.locator('#mailAddress').fill('선생님@school.kr');
  await page.locator('#mailNextBtn').click();
  await shot('04-입력-한글-주소');
  await page.locator('#mailAddress').fill('teacher@gmial.com');
  await page.locator('#mailNextBtn').click();
  await page.locator('#mailTypo').waitFor();
  await shot('05-확인-도메인-오타');
  await page.locator('#mailTypoFixBtn').click();
  await page.locator('#mailTypo').waitFor({ state: 'detached' });
  await shot('06-확인');
  await page.locator('#mailSendBtn').click();
  await page.getByRole('heading', { name: '네트워크가 복구되면 보내 드릴게요' }).waitFor();
  await shot('07-대기');
  await page.locator('#doneHomeBtn').click();
  await page.locator('#home.active').waitFor();
  await page.locator('.scene-carousel').dispatchEvent('pointerdown', { pointerType: 'touch', isPrimary: true });
  await delay(800);
  await shot('08-메인-메일-대기');
  await page.locator('#mailQueueChip').click();
  await shot('09-대기-목록');
  await page.locator('#mailQueue').getByRole('button', { name: '닫기' }).click();
  await offline(false);
  await page.locator('#mailQueueChip').waitFor({ state: 'detached', timeout: 90000 });
  await shot('10-보낸-뒤-메인-대기-없음');
  await offline(true);
  await recordToEntry();
  await shot('11-다음-사람-빈칸');
  await page.locator('#mailName').fill('달님');
  await page.locator('#mailAddress').fill('teacher@example.com');
  await page.locator('#mailNextBtn').click();
  await page.locator('#mailSendBtn').click();
  await page.getByRole('heading', { name: '네트워크가 복구되면 보내 드릴게요' }).waitFor();
  // «보내지 못함» 목록은 여덟 번 실패해야 생긴다 — 그 상태를 직접 만들어 보이는 모양만 찍는다
  await page.evaluate(async () => { const [item] = await window.vcDesktop.mail.list(); await window.vcDesktop.mail.update(item.id, { attempts: 8, failed: true }); });
  await page.reload();
  await page.locator('#splash').waitFor({ state: 'detached', timeout: 90000 });
  await page.locator('#mailQueueChip').click();
  await shot('12-보내지-못함-목록');
  await page.locator('#mailQueue').getByRole('button', { name: '지우기' }).click();
  await page.locator('#mailQueue').getByRole('button', { name: '영화도 함께 지워져요. 지울까요 ?' }).waitFor();
  await shot('13-지우기-확인');
  await page.locator('#mailQueue').getByRole('button', { name: '영화도 함께 지워져요. 지울까요 ?' }).click();
  await delay(300);
  await app.close();
}

for (const item of sizesArg.split(',')) {
  const [, w, h, scale = '1'] = /^(\d+)x(\d+)(?:@([\d.]+))?$/.exec(item);
  await shoot({ w: Number(w), h: Number(h), scale: Number(scale) });
}
