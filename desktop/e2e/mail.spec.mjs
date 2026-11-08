// 설치판 메일 전달(11/8) — 빌드한 exe로 끊김 → 입력 → 확인 → 대기 → 복구 → 올리기 → 메일 보내기(/mail) → 삭제를 끝까지 돌린다.
// 끊김은 Windows가 연결 없음을 알리는 것과 같은 상태(navigator.onLine이 거짓)를 흉내 낸다 — 화면의 «인터넷 끊김 시험» 표시는 11/8 Bumm님 지시로 없앴다.
// 흉내 중에도 설치판 안의 파일(화면 · 엔진 · 장면)은 그대로 뜬다(11/8 확인).
// 업로드 · 메일은 앱의 세션에서 답하고, 닿지 않는 프록시로 그 밖의 바깥 요청을 모두 막는다 — 시험에서 운영 저장소 · 메일 서버로 나가는 것이 없다.
import { test, expect, _electron } from '@playwright/test';
import { execFileSync } from 'node:child_process';
import { mkdirSync, readFileSync, readdirSync, writeFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { installSyntheticMic, recordOnce } from '../../e2e/synthetic-mic.js';

const HERE = path.dirname(fileURLToPath(import.meta.url));
const EXE = process.env.VC_DESKTOP_EXE ?? path.join(HERE, '..', 'release', 'win-unpacked', 'Voice Cinema.exe');
const ORIGIN = 'https://voice.edutogether.kr';
const FAKE_URL = 'https://storage.googleapis.com/test/dub.mp4';
// 디스크 · 로그에서 찾을 표시 — 이 시험 말고는 나올 일이 없는 글자
const NAME_A = '별님시험칠칠삼일';
const NAME_B = '달님시험칠칠삼이';
const MAIL = 'probe-7731@example.test';

test.setTimeout(420000);

async function launch(profile) {
  const app = await _electron.launch({
    executablePath: EXE,
    args: [`--user-data-dir=${profile}`, '--mute-audio', '--use-fake-device-for-media-stream', '--proxy-server=http://127.0.0.1:9'],
    env: { ...process.env, VC_TEST_SMALLEST_DISPLAY: '1' },
  });
  const logs = [];
  app.process().stdout?.on('data', (d) => logs.push(String(d)));
  app.process().stderr?.on('data', (d) => logs.push(String(d)));
  await routeUpload(app, { status: 200, body: { ok: true, url: FAKE_URL } });
  const page = await app.firstWindow();
  page.on('console', (m) => logs.push(m.text()));
  await page.locator('#splash').waitFor({ state: 'detached', timeout: 60000 });
  return { app, page, logs };
}

/** 업로드와 메일(/mail)을 앱의 세션에서 답한다(desktop.spec.mjs와 같은 자리). 답은 나중에 바꿀 수 있다. */
async function routeUpload(app, reply) {
  await app.evaluate(({ session }, { reply, origin }) => {
    const ses = session.fromPartition('persist:voice-cinema');
    const original = ses.fetch.bind(ses);
    globalThis.__uploads = [];
    globalThis.__mails = [];
    globalThis.__reply = reply;
    globalThis.__mailReply = { status: 200, body: { ok: true } };
    const cors = { 'Access-Control-Allow-Origin': origin, Vary: 'Origin' };
    ses.fetch = async (request, options) => {
      const kind = ['upload', 'mail'].find((k) => request.url.endsWith(`/voiceCinema/${k}`));
      if (!kind) return original(request, options);
      if (request.method === 'OPTIONS') {
        return new Response(null, { status: 204, headers: { ...cors, 'Access-Control-Allow-Methods': 'POST', 'Access-Control-Allow-Headers': request.headers.get('access-control-request-headers') ?? '' } });
      }
      const text = await request.text();
      const answer = kind === 'upload' ? globalThis.__reply : globalThis.__mailReply;
      (kind === 'upload' ? globalThis.__uploads : globalThis.__mails).push({ text, headers: Object.fromEntries(request.headers) });
      return new Response(JSON.stringify(answer.body), { status: answer.status, headers: { ...cors, 'Content-Type': 'application/json' } });
    };
  }, { reply, origin: ORIGIN });
}
const uploads = (app) => app.evaluate(() => globalThis.__uploads.map(({ text }) => JSON.parse(text)));
/** 앱이 보낸 메일 요청 — 본문과 인증 헤더 */
const mails = (app) => app.evaluate(() => globalThis.__mails.map(({ text, headers }) => ({ ...JSON.parse(text), headers })));
const setReply = (app, reply) => app.evaluate((_e, r) => { globalThis.__reply = r; }, reply);
const setMailReply = (app, reply) => app.evaluate((_e, r) => { globalThis.__mailReply = r; }, reply);

/** 인터넷 끊김 흉내 — navigator.onLine과 online/offline 이벤트가 실제 끊김과 같다 */
const offline = (app, on) => app.context().setOffline(on);

/** 시험용 마이크를 깔고 다시 연 뒤 장면 녹음실로 */
async function openStudio(page, name) {
  await installSyntheticMic(page, [{ delay: 0.3, dur: 1.5 }]);
  await page.reload();
  await page.locator('#splash').waitFor({ state: 'detached', timeout: 60000 });
  await pickScene(page, name);
}
async function pickScene(page, name) {
  await page.locator('.scene-carousel').dispatchEvent('pointerdown', { pointerType: 'touch', isPrimary: true });
  // 그림 띠는 흐르다 멈춘 자리에 따라 그 칸이 화면 밖일 수 있다 — 칸의 자리는 이 시험의 대상이 아니므로 누름 이벤트를 바로 보낸다
  await page.getByRole('button', { name: `${name} 미리보기 선택`, exact: true }).dispatchEvent('click');
  await expect(page.locator('#chipName')).toHaveText(name);
  await expect(page.locator('#clip')).toHaveJSProperty('readyState', 4, { timeout: 20000 });
}
/** 녹음 · 저장해 입력 화면까지(끊겨 있으면 곧바로, 올리지 못하면 세 번 시도한 뒤) */
async function recordToEntry(page, timeout = 90000) {
  // 엔진을 다 받은 뒤 녹음한다(첫 화면의 «N%» 표시는 11/8에 없앴다 — 화면이 직접 받는 자원 기록을 본다)
  await expect.poll(() => page.evaluate(() => window.performance.getEntriesByType('resource').some((e) => e.name.endsWith('/vendor/ffmpeg-core/ffmpeg-core.wasm') && e.responseEnd > 0)), { timeout: 30000 }).toBe(true);
  expect(await recordOnce(page)).toMatchObject({ phase: 'recorded' });
  await page.locator('#saveBtn').click();
  await expect(page.locator('#mailName')).toBeVisible({ timeout });
}
async function queue(page, name, email) {
  await page.locator('#mailName').fill(name);
  await page.locator('#mailAddress').fill(email);
  await page.locator('#mailNextBtn').click();
  await page.locator('#mailSendBtn').click();
  await expect(page.getByRole('heading', { name: '인터넷이 돌아오면 보내 드릴게요' })).toBeVisible();
}
/** 대기 화면에서 «다른 더빙 하기»로 첫 화면에 — 메일 대기 단추는 첫 화면에만 있다 */
async function home(page) {
  await page.locator('#doneHomeBtn').click();
  await expect(page.locator('#home')).toHaveClass(/active/);
}
const queueFiles = (profile) => readdirSync(path.join(profile, 'mail-queue')).sort();

/** 폴더 전체에서 글자를 찾는다(UTF-8 · UTF-16). 열지 못한 파일은 따로 돌려준다 — 못 읽은 것을 «없다»로 세지 않는다. */
function scan(dir, needles) {
  const patterns = needles.flatMap((text) => [Buffer.from(text, 'utf8'), Buffer.from(text, 'utf16le')].map((bytes) => ({ text, bytes })));
  const found = [];
  const unread = [];
  let files = 0;
  const walk = (at) => {
    for (const entry of readdirSync(at, { withFileTypes: true })) {
      const full = path.join(at, entry.name);
      if (entry.isDirectory()) { walk(full); continue; }
      try {
        const data = readFileSync(full);
        files++;
        for (const { text, bytes } of patterns) if (data.includes(bytes)) found.push(`${path.relative(dir, full)}: ${text}`);
      } catch (e) {
        unread.push(`${path.relative(dir, full)} (${e.code})`);
      }
    }
  };
  walk(dir);
  return { found, unread, files };
}

/**
 * 앱 창 안쪽을 운영체제에게 그려 받는다 — 제안 목록은 웹 화면 밖이라 page.screenshot에 나오지 않는다.
 * 화면 복사(CopyFromScreen)를 쓰지 않는다: 그 자리에 떠 있는 다른 창(사람이 쓰는 브라우저)이 앱 대신 찍힌다.
 * PrintWindow는 가려져 있어도 이 창만 그려 준다(desktop/tools/installer-probe.ps1과 같은 방식, 2 = PW_RENDERFULLCONTENT, 1 = 창 안쪽만).
 */
async function captureWindow(app, file) {
  const hwnd = await app.evaluate(({ BrowserWindow }) => BrowserWindow.getAllWindows()[0].getNativeWindowHandle().readBigInt64LE(0).toString());
  const script = `Add-Type -Name W -Namespace Vc -MemberDefinition 'public struct RECT { public int L, T, R, B; }
[System.Runtime.InteropServices.DllImport("user32.dll")] public static extern System.IntPtr SetThreadDpiAwarenessContext(System.IntPtr value);
[System.Runtime.InteropServices.DllImport("user32.dll")] public static extern bool GetClientRect(System.IntPtr h, out RECT r);
[System.Runtime.InteropServices.DllImport("user32.dll")] public static extern bool PrintWindow(System.IntPtr h, System.IntPtr dc, uint flags);'; `
    + `[void][Vc.W]::SetThreadDpiAwarenessContext([System.IntPtr]::new(-4)); `
    + `Add-Type -AssemblyName System.Drawing; `
    + `$h = [System.IntPtr]::new([long]${hwnd}); $r = New-Object Vc.W+RECT; [void][Vc.W]::GetClientRect($h, [ref]$r); `
    + `$b = New-Object System.Drawing.Bitmap ($r.R - $r.L), ($r.B - $r.T); $g = [System.Drawing.Graphics]::FromImage($b); $dc = $g.GetHdc(); `
    + `$ok = [Vc.W]::PrintWindow($h, $dc, 3); $g.ReleaseHdc($dc); $g.Dispose(); if (-not $ok) { throw 'PrintWindow failed' }; `
    + `$b.Save('${file}'); $b.Dispose()`;
  execFileSync('powershell', ['-NoProfile', '-NonInteractive', '-Command', script], { windowsHide: true });
  return file;
}

/**
 * 두 캡처에서 그 칸 바깥의 달라진 화소 수 — 칸 안은 커서 · 초점 테두리 때문에 세지 않는다. 그림을 못 읽으면 0으로 세지 않고 실패한다.
 * 96보다 크게 달라진 화소만 센다. 초점이 옮겨 갈 때 근처 글자의 가장자리가 다시 그려져 어두운 그림 위 글자에서 100개쯤 잡히고(실측 96),
 * 제안 목록은 흰 바탕 위 한 줄만 해도 650개쯤이다(실측 두 줄 1,299) — 그래서 NO_POPUP(300) 아래면 «뜨지 않았다»로 본다.
 */
const NO_POPUP = 300;
async function changedOutside(session, before, after, selector) {
  const box = await session.page.locator(selector).boundingBox();
  const inner = await session.page.evaluate(() => window.innerWidth);
  return session.app.evaluate(({ nativeImage }, { before, after, box, inner }) => {
    const a = nativeImage.createFromPath(before);
    const b = nativeImage.createFromPath(after);
    const { width, height } = a.getSize();
    if (!width || width !== b.getSize().width || height !== b.getSize().height) throw new Error(`캡처 크기가 맞지 않다: ${width}x${height} / ${b.getSize().width}x${b.getSize().height}`);
    const pa = a.toBitmap();
    const pb = b.toBitmap();
    const scale = width / inner;
    const [left, right, top, bottom] = [(box.x - 6) * scale, (box.x + box.width + 6) * scale, (box.y - 6) * scale, (box.y + box.height + 6) * scale];
    let changed = 0;
    for (let y = 0; y < height; y++) {
      for (let x = 0; x < width; x++) {
        if (x >= left && x <= right && y >= top && y <= bottom) continue;
        const i = (y * width + x) * 4;
        if (Math.abs(pa[i] - pb[i]) > 96 || Math.abs(pa[i + 1] - pb[i + 1]) > 96 || Math.abs(pa[i + 2] - pb[i + 2]) > 96) changed++;
      }
    }
    return changed;
  }, { before, after, box, inner });
}

async function sizeWindow(app, page, w, h) {
  await app.evaluate(({ BrowserWindow }, [cw, ch]) => { const win = BrowserWindow.getAllWindows()[0]; win.unmaximize(); win.setContentSize(cw, ch); }, [w, h]);
  // 시험 모니터의 배율 반올림으로 1~2px 다를 수 있다
  await expect.poll(async () => Math.abs(await page.evaluate(() => window.innerWidth) - w)).toBeLessThanOrEqual(4);
}

/**
 * 첫 화면 오른쪽 위 한 줄: 노란 «설치판 · 녹음하고 로컬에 저장» · (기다리는 메일이 있으면) «메일 대기» 단추 · 방침 링크가 차례로 겹치지 않고 같은 높이에 있다.
 * 이 줄 말고는 설치판 표시가 화면 어디에도 없다(11/8 Bumm님 «노란 표시 하나만»).
 */
async function expectHeaderRow(page, chip) {
  await expect(page.locator('#mailBar')).toHaveCount(0);
  await expect(page.locator('.installer-badge')).toHaveText('설치판 · 녹음하고 로컬에 저장');
  await expect(page.locator('#mailQueueChip')).toHaveCount(chip ? 1 : 0);
  // 창 크기를 바꾼 직후에는 화면 맞춤이 한두 프레임 뒤에 자리 잡는다 — 자리 잡은 뒤에도 어긋나면 실패한다
  await expect.poll(() => page.evaluate(() => {
    const row = ['.installer-badge', '#mailQueueChip', '.privacylink'].map((s) => document.querySelector(s)).filter(Boolean).map((el) => el.getBoundingClientRect());
    const problems = [];
    row.forEach((r, i) => {
      if (r.left < 0 || r.right > window.innerWidth) problems.push(`${i} 화면 밖`);
      if (i && r.left < row[i - 1].right + 4) problems.push(`${i} 겹침`);
      if (i && Math.abs((r.top + r.bottom) / 2 - (row[0].top + row[0].bottom) / 2) > 2) problems.push(`${i} 높이 어긋남`);
    });
    return problems;
  }), '첫 화면 머리글 줄').toEqual([]);
}

/** 녹음 · 미리보기 · 저장 화면에는 노란 표시도 메일 대기 단추도 보이지 않는다 — 첫 화면은 숨은 채 문서에 남으므로 개수가 아니라 보이는 것을 센다 */
async function expectNoBadge(page) {
  await expect(page.locator('.installer-badge:visible')).toHaveCount(0);
  await expect(page.locator('#mailQueueChip:visible')).toHaveCount(0);
}

/** 입력 화면이 그 창에 들어가는가: 가로 넘침 없음 · 칸과 단추가 화면 안 · 두 칸과 «다음»은 같은 폭 · 같은 높이의 한 열이고 판 안쪽을 넘지 않는다
 *  (11/8 Bumm님 «디자인 왜 이렇게 개촌스러워졌어» — 그 전에는 이름 칸만 짧고 «다음»이 따로 놀았다) */
async function expectFormFits(page) {
  // 창 크기가 바뀐 뒤 스크롤 막대 · 화면 맞춤이 자리 잡을 때까지 기다린다(그 뒤에도 넘치면 실패)
  await expect.poll(() => page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth), '가로 넘침').toBe(0);
  const m = await page.evaluate(() => {
    const rect = (el) => el.getBoundingClientRect();
    return {
      hscroll: document.documentElement.scrollWidth - document.documentElement.clientWidth,
      inner: [window.innerWidth, window.innerHeight],
      controls: ['#mailName', '#mailAddress', '#mailNextBtn'].map((s) => {
        const r = rect(document.querySelector(s));
        return { s, inside: r.left >= 0 && r.right <= window.innerWidth && r.bottom <= window.innerHeight };
      }),
      boxes: ['#mailName', '#mailAddress', '#mailNextBtn'].map((s) => { const r = rect(document.querySelector(s)); return [r.left, r.width, r.height]; }),
      panel: (() => { const form = document.querySelector('.mail-form'); const style = window.getComputedStyle(form); return rect(form).width * (1 - (parseFloat(style.paddingLeft) + parseFloat(style.paddingRight)) / form.offsetWidth); })(),
    };
  });
  expect(m.hscroll, `가로 넘침 ${m.inner}`).toBe(0);
  for (const c of m.controls) expect(c, `${m.inner}`).toMatchObject({ inside: true });
  const [name, address, next] = m.boxes;
  for (const [label, box] of [['주소 칸', address], ['«다음»', next]]) {
    expect(Math.abs(box[0] - name[0]), `${label}의 왼쪽이 이름 칸과 어긋난다 ${m.inner}`).toBeLessThanOrEqual(1);
    expect(Math.abs(box[1] - name[1]), `${label}의 폭이 이름 칸과 다르다 ${m.inner}`).toBeLessThanOrEqual(1);
    expect(Math.abs(box[2] - name[2]), `${label}의 높이가 이름 칸과 다르다 ${m.inner}`).toBeLessThanOrEqual(1);
  }
  expect(address[1], `칸이 판 안쪽 폭을 넘는다 ${m.inner}`).toBeLessThanOrEqual(m.panel + 1);
}

test('끊김 → 입력 → 확인 → 대기 → 복구 → 올리기 → 메일 보내기 → 기기에서 삭제', async () => {
  const profile = test.info().outputPath('profile');
  const { app, page } = await launch(profile);
  expect(await app.evaluate(({ app: electronApp }) => electronApp.getName())).toBe('Voice Cinema');
  // 첫 화면: 노란 표시 하나, 기다리는 메일이 없으니 메일 대기 단추도 없다
  await page.locator('.scene-carousel').dispatchEvent('pointerdown', { pointerType: 'touch', isPrimary: true });
  for (const [w, h] of [[640, 640], [1000, 640], [1366, 697]]) {
    await sizeWindow(app, page, w, h);
    await expectHeaderRow(page, false);
  }
  await openStudio(page, '판타지');
  await expectNoBadge(page);
  await offline(app, true);
  await recordToEntry(page);
  await expectNoBadge(page);

  // 입력: 칸은 비어 있고, 왜 받는지 한 줄이 있다. 메일 없이 저장하는 단추는 없다(설치판은 메일로 전한다, 11/8 Bumm님)
  await expect(page.locator('#mailName')).toHaveValue('');
  await expect(page.locator('#mailAddress')).toHaveValue('');
  await expect(page.locator('#doneMsg')).toHaveText('인터넷이 돌아오면 인솔 선생님 메일로 영화 링크를 보내요.');
  await expect(page.locator('#mailSaveHereBtn')).toHaveCount(0);
  // 결과 카드 안만 센다 — 머리글 로고 두 개도 «처음부터 시작» 단추다(11/8 화면 수정)
  await expect(page.locator('#result.active .result-details button')).toHaveCount(1);
  await expect(page.locator('#mailAddress')).toHaveAttribute('type', 'email');
  await expect(page.locator('#mailAddress')).toHaveAttribute('autocomplete', 'off');

  // 오류는 고치는 방법까지 알리고 첫 오류 칸으로 간다
  await page.locator('#mailNextBtn').click();
  await expect(page.locator('#mailNameError')).toHaveText('이름을 적어 주세요.');
  await expect(page.locator('#mailAddressError')).toHaveText('메일 주소를 적어 주세요.');
  await expect(page.locator('#mailName')).toBeFocused();
  await expect(page.locator('#mailName')).toHaveAttribute('aria-invalid', 'true');
  await expectFormFits(page);
  await sizeWindow(app, page, 640, 640);
  await expectFormFits(page);
  await sizeWindow(app, page, 1366, 697);
  await expectFormFits(page);
  await page.locator('#mailName').fill(NAME_A);
  await expect(page.locator('#mailNameError')).toHaveCount(0);
  await page.locator('#mailAddress').fill('선생님@school.kr');
  await page.locator('#mailNextBtn').click();
  await expect(page.locator('#mailAddressError')).toHaveText('메일 주소는 영문으로 적어 주세요. 한/영 키를 눌러 바꿔 주세요.');
  await expect(page.locator('#mailAddress')).toBeFocused();
  await page.locator('#mailAddress').fill('teacher');
  await page.locator('#mailNextBtn').click();
  await expect(page.locator('#mailAddressError')).toHaveText('메일 주소 형식이 맞지 않아요. teacher@school.kr처럼 적어 주세요.');

  // 확인: 주소를 다시 보여 주고, 도메인 오타는 경고만 한다(막지 않는다)
  await page.locator('#mailAddress').fill('probe-7731@gmial.com');
  await page.locator('#mailNextBtn').click();
  await expect(page.locator('#mailAddressShown')).toHaveText('probe-7731@gmial.com');
  await expect(page.locator('#mailNameShown')).toHaveText(NAME_A);
  await expect(page.locator('#mailTypo')).toContainText('gmail.com');
  await expect(page.locator('#mailSendBtn')).toBeEnabled();
  await page.locator('#mailTypoFixBtn').click();
  await expect(page.locator('#mailAddressShown')).toHaveText('probe-7731@gmail.com');
  await expect(page.locator('#mailTypo')).toHaveCount(0);
  await page.locator('#mailFixBtn').click();
  await expect(page.locator('#mailAddress')).toHaveValue('probe-7731@gmail.com');
  await expect(page.locator('#mailAddress')).toBeFocused();
  await page.locator('#mailAddress').fill(`  ${MAIL}  `);
  await page.locator('#mailNextBtn').click();
  await expect(page.locator('#mailAddressShown')).toHaveText(MAIL);
  await page.locator('#mailSendBtn').click();

  // 대기: 기기에 암호화해 두고, 끊겨 있으면 올리지 않는다. 목록에는 주소를 가려서 보이고 이름은 보이지 않는다
  await expect(page.getByRole('heading', { name: '인터넷이 돌아오면 보내 드릴게요' })).toBeVisible();
  await expectNoBadge(page);
  await home(page);
  await expect(page.locator('#mailQueueChip')).toHaveText('메일 대기 1건');
  for (const [w, h] of [[640, 640], [1000, 640], [1366, 697]]) {
    await sizeWindow(app, page, w, h);
    await expectHeaderRow(page, true);
  }
  expect(queueFiles(profile)).toHaveLength(3);
  expect(await uploads(app)).toHaveLength(0);
  await page.locator('#mailQueueChip').click();
  await expect(page.locator('#mailQueue')).toContainText('p***@example.test');
  await expect(page.locator('#mailQueue')).not.toContainText(MAIL);
  await expect(page.locator('#mailQueue')).not.toContainText(NAME_A);
  await page.locator('#mailQueue').getByRole('button', { name: '닫기' }).click();

  // 복구 → 올리기 → 메일 보내기 → 지움. 메일 서버에는 받는 주소 · 이름 · 올린 영화 주소만 가고, 업로드와 같은 인증 헤더가 붙는다
  // 첫 화면에서 인터넷이 돌아오면 시작 창이 «보낼 메일 1건»을 보내고 끝을 알린다 — [완료]를 누르면 평소 첫 화면이다
  await offline(app, false);
  const startup = page.locator('#mailStartup');
  await expect(startup).toHaveAttribute('data-phase', 'done', { timeout: 60000 });
  await expect(startup.getByRole('heading')).toHaveText('1건 모두 보냈어요. 이제 꺼도 돼요.');
  await startup.getByRole('button', { name: '완료' }).click();
  await expect(startup).not.toBeVisible();
  await expect(page.locator('#home')).toHaveClass(/active/);
  await expect(page.locator('#mailQueueChip')).toHaveCount(0, { timeout: 60000 });
  const [mail] = await mails(app);
  expect({ to: mail.to, items: mail.items }).toEqual({ to: MAIL, items: [{ name: NAME_A, url: FAKE_URL }] });
  expect(mail.headers['x-booth-token']).toMatch(/^[0-9a-f]{48}$/);
  expect(mail.headers).toHaveProperty('x-firebase-appcheck');
  expect(await mails(app)).toHaveLength(1);
  await expect(page.locator('.mail-sent')).toHaveCount(0);
  const [uploaded] = await uploads(app);
  expect(uploaded.filename).toMatch(/^dub_fantasy_\d+_[0-9a-f]+\.mp4$/);
  expect(Buffer.from(uploaded.dataBase64, 'base64').subarray(4, 8).toString()).toBe('ftyp');
  expect(queueFiles(profile)).toEqual(['queue.key']);
  await expect(page.locator('#mailQueueChip')).toHaveCount(0);
  await app.close();
});

test('다음 사람의 칸은 비어 있고 이전 주소가 제안되지 않으며, 같은 선생님은 한 통으로 묶이고, 껐다 켜도 이어서 보내고, 디스크 · 로그에 이름 · 주소가 없다', async () => {
  const profile = test.info().outputPath('profile');
  const first = await launch(profile);
  await openStudio(first.page, '판타지');
  await offline(first.app, true);
  await recordToEntry(first.page);
  await queue(first.page, NAME_A, MAIL);
  await home(first.page);

  // 다음 사람
  await pickScene(first.page, 'SF');
  await recordToEntry(first.page);
  const address = first.page.locator('#mailAddress');
  await expect(first.page.locator('#mailName')).toHaveValue('');
  await expect(address).toHaveValue('');
  const shot = (name) => captureWindow(first.app, test.info().outputPath(name));
  // 대조군: 제안 목록이 뜨면 이 캡처에 찍히고 화소로 잡힌다는 것을 먼저 확인한다 — 못 찍은 것을 «없다»로 세지 않게
  await first.page.evaluate(() => {
    const input = document.createElement('input');
    input.id = 'probeInput';
    input.setAttribute('list', 'probeList');
    input.style.cssText = 'position:fixed;left:40px;top:40px;z-index:99;width:300px';
    const list = document.createElement('datalist');
    list.id = 'probeList';
    list.innerHTML = '<option value="control-popup-1"><option value="control-popup-2">';
    document.body.append(input, list);
    document.activeElement?.blur();
  });
  const controlBefore = await shot('대조군-누르기-전.png');
  await first.page.locator('#probeInput').click();
  await first.page.keyboard.press('ArrowDown');
  await first.page.waitForTimeout(700);
  expect(await changedOutside(first, controlBefore, await shot('대조군-제안목록.png'), '#probeInput')).toBeGreaterThan(1000);
  await first.page.evaluate(() => { document.getElementById('probeInput').remove(); document.getElementById('probeList').remove(); document.activeElement?.blur(); });
  await first.page.waitForTimeout(500);
  // 누르기 전과 견준다 — 빈 칸을 누르기만 해도 뜨는 제안까지 잡는다
  for (const [selector, typed, label] of [['#mailAddress', 'p', '주소'], ['#mailName', NAME_A[0], '이름']]) {
    const field = first.page.locator(selector);
    const blank = await shot(`다음사람-${label}-누르기-전.png`);
    await field.click();
    await first.page.keyboard.press('ArrowDown');
    await first.page.waitForTimeout(700);
    expect(await changedOutside(first, blank, await shot(`다음사람-${label}-빈칸-아래키.png`), selector)).toBeLessThan(NO_POPUP);
    await expect(field).toHaveValue('');
    await first.page.keyboard.type(typed);
    await first.page.keyboard.press('ArrowDown');
    await first.page.waitForTimeout(700);
    expect(await changedOutside(first, blank, await shot(`다음사람-${label}-첫글자-아래키.png`), selector)).toBeLessThan(NO_POPUP);
    await expect(field).toHaveValue(typed);
    await field.clear();
    await first.page.evaluate(() => document.activeElement?.blur());
    await first.page.waitForTimeout(300);
  }
  await queue(first.page, NAME_B, MAIL.toUpperCase());
  await home(first.page);
  await expect(first.page.locator('#mailQueueChip')).toHaveText('메일 대기 2건');
  // 브라우저 저장소에도 남지 않는다
  expect(await first.page.evaluate(() => JSON.stringify([{ ...window.localStorage }, { ...window.sessionStorage }, window.history.state]))).not.toMatch(/probe|별님|달님/i);
  await first.app.close();

  // 대기 중인 디스크: 이름 · 주소가 어디에도 없고, 영상도 평문이 아니다
  const needles = [NAME_A, NAME_B, MAIL, MAIL.toUpperCase()];
  const waiting = scan(profile, needles);
  expect(waiting.found).toEqual([]);
  expect(waiting.unread).toEqual([]);
  expect(waiting.files).toBeGreaterThan(10);
  for (const file of queueFiles(profile).filter((f) => f.endsWith('.video'))) {
    expect(readFileSync(path.join(profile, 'mail-queue', file)).subarray(0, 64).includes(Buffer.from('ftyp'))).toBe(false);
  }

  // 다시 켜면 시작 창이 «보낼 메일 2건»을 이어서 보내고 한 통으로 묶는다
  const second = await launch(profile);
  await expect(second.page.locator('#mailStartup')).toHaveAttribute('data-phase', 'done', { timeout: 90000 });
  await expect(second.page.locator('#mailStartup').getByRole('heading')).toHaveText('2건 모두 보냈어요. 이제 꺼도 돼요.');
  await expect.poll(() => mails(second.app), { timeout: 90000 }).toHaveLength(1);
  const [mail] = await mails(second.app);
  expect(mail.to.toLowerCase()).toBe(MAIL);
  expect(mail.items.map((item) => item.name).sort()).toEqual([NAME_A, NAME_B].sort());
  await expect.poll(() => queueFiles(profile), { timeout: 30000 }).toEqual(['queue.key']);
  expect(await mails(second.app)).toHaveLength(1);
  expect(await uploads(second.app)).toHaveLength(2);
  expect(queueFiles(profile)).toEqual(['queue.key']);
  await second.app.close();

  const after = scan(profile, needles);
  expect(after.found).toEqual([]);
  expect(after.unread).toEqual([]);
  expect([...first.logs, ...second.logs].join('\n')).not.toMatch(/probe-7731|별님시험|달님시험/i);
});

test('인터넷이 있어도 올리지 못하면 메일 화면으로 가고, 대기에 남고, «보내지 못함»은 다시 보낼 수 있고, 운영자가 지우면 영상까지 사라진다', async () => {
  const profile = test.info().outputPath('profile');
  const { app, page } = await launch(profile);
  await setReply(app, { status: 500, body: { ok: false } });
  await openStudio(page, '판타지');
  // 처음 + 다시 2번(MAX_UPLOAD_ATTEMPTS) 올리지 못하면 이 기기에 저장이 아니라 메일 화면이다
  await recordToEntry(page, 200000);
  expect(await uploads(app)).toHaveLength(3);
  await queue(page, NAME_A, MAIL);
  // 대기에 넣자마자 다시 올려 보고, 처음 + 다시 2번까지 실패한 뒤 대기로 남고 다음 시도 시각이 뒤로 밀린다
  await expect.poll(() => page.evaluate(async () => (await window.vcDesktop.mail.list())[0].attempts), { timeout: 150000 }).toBe(1);
  const [item] = await page.evaluate(() => window.vcDesktop.mail.list());
  expect(item.nextAt).toBeGreaterThan(Date.now());
  expect(await mails(app)).toHaveLength(0);
  expect(queueFiles(profile)).toHaveLength(3);

  // 다시 켜면(여기서는 다시 열기) 시작 창이 «보내지 못함»까지 처음부터 다시 보낸다(11/8 Bumm님 — 켜 두면 다 나가게). 이번에는 올리기는 되고 메일 서버가 실패한다
  await page.evaluate((id) => window.vcDesktop.mail.update(id, { failed: true }), item.id);
  await setReply(app, { status: 200, body: { ok: true, url: FAKE_URL } });
  await setMailReply(app, { status: 503, body: { ok: false } });
  await page.reload();
  await page.locator('#splash').waitFor({ state: 'detached', timeout: 60000 });
  const startup = page.locator('#mailStartup');
  await expect(startup).toHaveAttribute('data-phase', 'partial', { timeout: 60000 });
  await expect(startup.getByRole('heading')).toHaveText('1건을 못 보냈어요');
  // 메일 서버가 실패하면 지우지 않고 대기에 남는다. 올린 영화 주소는 기억해 두어 다음에는 다시 올리지 않는다
  expect(await mails(app)).toHaveLength(1);
  await expect.poll(() => page.evaluate(async () => (await window.vcDesktop.mail.list())[0]), { timeout: 30000 }).toMatchObject({ attempts: 1, failed: false, url: FAKE_URL });
  expect(queueFiles(profile)).toHaveLength(3);
  const uploadedOnce = (await uploads(app)).length;
  // [다시 보내기] — 이번에는 메일 서버가 받는다. 끝을 알리고 [완료]를 누르면 평소 첫 화면이다
  await setMailReply(app, { status: 200, body: { ok: true } });
  await startup.getByRole('button', { name: '다시 보내기' }).click();
  await expect(startup).toHaveAttribute('data-phase', 'done', { timeout: 60000 });
  await expect(startup.getByRole('heading')).toHaveText('1건 모두 보냈어요. 이제 꺼도 돼요.');
  expect(await mails(app)).toHaveLength(2);
  expect((await uploads(app)).length, '메일만 다시 보내고 영화는 다시 올리지 않는다').toBe(uploadedOnce);
  expect(queueFiles(profile)).toEqual(['queue.key']);
  await startup.getByRole('button', { name: '완료' }).click();
  await expect(startup).not.toBeVisible();
  await expect(page.locator('#mailQueueChip')).toHaveCount(0);

  // 켜 둔 채 여러 번(8번) 실패하면 «보내지 못함»으로 빠져 자동으로는 보내지 않고, 첫 화면 단추의 목록에서 운영자가 다시 보낸다
  await offline(app, true);
  await pickScene(page, 'SF');
  await recordToEntry(page);
  await queue(page, NAME_B, MAIL);
  await home(page);
  await setMailReply(app, { status: 503, body: { ok: false } });
  await offline(app, false);
  await expect(startup).toHaveAttribute('data-phase', 'partial', { timeout: 60000 });
  await expect(startup.getByRole('heading')).toHaveText('1건을 못 보냈어요');
  // [나중에]를 누르면 창만 닫히고 남은 건은 대기에 그대로다
  await startup.getByRole('button', { name: '나중에' }).click();
  await expect(startup).not.toBeVisible();
  await expect(page.locator('#mailQueueChip')).toHaveText('메일 대기 1건');
  const uploadedTwice = (await uploads(app)).length;
  // 여덟 번째 실패를 기다리는 대신 일곱 번 실패한 상태로 두고 다음 차례(15초마다)가 여덟 번째로 실패하게 한다
  await page.evaluate(async () => { const [waiting] = await window.vcDesktop.mail.list(); await window.vcDesktop.mail.update(waiting.id, { attempts: 7, nextAt: 0 }); });
  await expect(page.locator('#mailQueueChip')).toHaveText('보내지 못함 1건', { timeout: 60000 });
  await expect(startup).not.toBeVisible();
  await page.locator('.scene-carousel').dispatchEvent('pointerdown', { pointerType: 'touch', isPrimary: true });
  for (const [w, h] of [[640, 640], [1000, 640], [1366, 697]]) {
    await sizeWindow(app, page, w, h);
    await expectHeaderRow(page, true);
  }
  await setMailReply(app, { status: 200, body: { ok: true } });
  const mailsBefore = (await mails(app)).length;
  await page.locator('#mailQueueChip').click();
  await expect(page.locator('#mailQueue')).toContainText('보내지 못했어요');
  await page.locator('#mailQueue').getByRole('button', { name: '다시 보내기' }).click();
  await page.locator('#mailQueue').getByRole('button', { name: '닫기' }).click();
  await expect(page.locator('#mailQueueChip')).toHaveCount(0, { timeout: 60000 });
  expect(await mails(app)).toHaveLength(mailsBefore + 1);
  const mailCount = mailsBefore + 1;
  expect((await uploads(app)).length, '메일만 다시 보내고 영화는 다시 올리지 않는다').toBe(uploadedTwice);
  expect(queueFiles(profile)).toEqual(['queue.key']);

  // 지우기는 두 번 눌러야 하고, 영상 · 정보가 함께 사라진다
  await offline(app, true);
  await pickScene(page, 'SF');
  await recordToEntry(page);
  await queue(page, NAME_B, MAIL);
  const before = (await uploads(app)).length;
  expect(queueFiles(profile)).toHaveLength(3);
  await home(page);
  await page.locator('#mailQueueChip').click();
  await page.locator('#mailQueue').getByRole('button', { name: '지우기' }).click();
  expect(queueFiles(profile)).toHaveLength(3);
  await page.locator('#mailQueue').getByRole('button', { name: '영화도 함께 지워져요. 지울까요 ?' }).click();
  await expect(page.locator('#mailQueue')).toContainText('기다리는 메일이 없어요.');
  await expect.poll(() => queueFiles(profile)).toEqual(['queue.key']);
  expect((await uploads(app)).length).toBe(before);
  expect(await mails(app)).toHaveLength(mailCount);
  await app.close();
});

test('대기열을 열 수 없으면(키 손상) 메일 화면 없이 지금까지처럼 이 기기에 저장으로 간다', async () => {
  const profile = test.info().outputPath('profile');
  mkdirSync(path.join(profile, 'mail-queue'), { recursive: true });
  writeFileSync(path.join(profile, 'mail-queue', 'queue.key'), 'not-a-sealed-key');
  const { app, page } = await launch(profile);
  expect(await page.evaluate(() => typeof window.vcDesktop)).toBe('undefined');
  await expect(page.locator('.installer-badge')).toHaveText('설치판 · 녹음하고 로컬에 저장');
  await expect(page.locator('#mailQueueChip')).toHaveCount(0);
  await setReply(app, { status: 500, body: { ok: false } });
  await openStudio(page, '판타지');
  // 대기열이 없으면 시작 창도 없다
  await expect(page.locator('#mailStartup')).toHaveCount(0);
  expect(await recordOnce(page)).toMatchObject({ phase: 'recorded' });
  await page.locator('#saveBtn').click();
  await expect(page.locator('#downloadRow')).toBeVisible({ timeout: 200000 });
  await expect(page.locator('#mailName')).toHaveCount(0);
  await app.close();
});
