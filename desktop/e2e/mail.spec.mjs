// 메일 시험판(11/8) — 빌드한 exe로 끊김 → 입력 → 확인 → 대기 → 복구 → «보낸 것으로 처리» → 삭제를 끝까지 돌린다.
// 업로드는 앱의 세션에서 답하고, 닿지 않는 프록시로 그 밖의 바깥 요청을 모두 막는다 — 시험에서 운영 저장소로 나가는 것이 없다.
import { test, expect, _electron } from '@playwright/test';
import { execFileSync } from 'node:child_process';
import { existsSync, mkdirSync, readFileSync, readdirSync, statSync, writeFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { installSyntheticMic, recordOnce } from '../../e2e/synthetic-mic.js';

const HERE = path.dirname(fileURLToPath(import.meta.url));
const EXE = process.env.VC_DESKTOP_EXE ?? path.join(HERE, '..', 'release', 'win-unpacked', 'Voice Cinema Mail Trial.exe');
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

/** 업로드를 앱의 세션에서 답한다(desktop.spec.mjs와 같은 자리). reply를 나중에 바꿀 수 있다. */
async function routeUpload(app, reply) {
  await app.evaluate(({ session }, { reply, origin }) => {
    const ses = session.fromPartition('persist:voice-cinema');
    const original = ses.fetch.bind(ses);
    globalThis.__uploads = [];
    globalThis.__reply = reply;
    const cors = { 'Access-Control-Allow-Origin': origin, Vary: 'Origin' };
    ses.fetch = async (request, options) => {
      if (!request.url.endsWith('/voiceCinema/upload')) return original(request, options);
      if (request.method === 'OPTIONS') {
        return new Response(null, { status: 204, headers: { ...cors, 'Access-Control-Allow-Methods': 'POST', 'Access-Control-Allow-Headers': request.headers.get('access-control-request-headers') ?? '' } });
      }
      globalThis.__uploads.push(await request.text());
      return new Response(JSON.stringify(globalThis.__reply.body), { status: globalThis.__reply.status, headers: { ...cors, 'Content-Type': 'application/json' } });
    };
  }, { reply, origin: ORIGIN });
}
const uploads = (app) => app.evaluate(() => globalThis.__uploads.map((text) => JSON.parse(text)));
const setReply = (app, reply) => app.evaluate((_e, r) => { globalThis.__reply = r; }, reply);

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
/** 끊긴 상태로 녹음 · 저장해 입력 화면까지 */
async function recordToEntry(page) {
  await expect(page.locator('#engineProg')).toHaveText('100%', { timeout: 30000 });
  expect(await recordOnce(page)).toMatchObject({ phase: 'recorded' });
  await page.locator('#saveBtn').click();
  await expect(page.locator('#mailName')).toBeVisible({ timeout: 90000 });
}
async function queue(page, name, email) {
  await page.locator('#mailName').fill(name);
  await page.locator('#mailAddress').fill(email);
  await page.locator('#mailNextBtn').click();
  await page.locator('#mailSendBtn').click();
  await expect(page.getByRole('heading', { name: '인터넷이 돌아오면 보내 드릴게요' })).toBeVisible();
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

/** 입력 화면이 그 창에 들어가는가: 가로 넘침 없음 · 단추가 화면 안 · 시험판 표시가 단추를 가리지 않음 */
/** 시험판 표시가 지금 화면의 글 · 단추 · 칸을 가리지 않는다. */
async function expectBarClear(page) {
  // 창 크기를 바꾼 직후에는 화면 맞춤이 한두 프레임 뒤에 자리 잡는다 — 자리 잡은 뒤에도 가리면 실패한다
  await expect.poll(() => page.evaluate(() => {
    const bar = document.getElementById('mailBar').getBoundingClientRect();
    const list = document.querySelectorAll('#home.active h1, #home.active h2, #home.active button, #home.active a, #result.active h2, #result.active p, #result.active button, #result.active input, #result.active label, .poster-logo, .festival-header *, .privacylink');
    return [...list].filter((el) => {
      if (el.closest('#mailBar')) return false;
      const r = el.getBoundingClientRect();
      return r.width > 0 && r.height > 0 && r.left < bar.right && r.right > bar.left && r.top < bar.bottom && r.bottom > bar.top;
    }).map((el) => el.id || el.className || el.tagName);
  }), '시험판 표시가 가리는 것').toEqual([]);
}

async function expectFormFits(page) {
  // 창 크기가 바뀐 뒤 스크롤 막대 · 화면 맞춤이 자리 잡을 때까지 기다린다(그 뒤에도 넘치면 실패)
  await expect.poll(() => page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth), '가로 넘침').toBe(0);
  const m = await page.evaluate(() => {
    const rect = (el) => el.getBoundingClientRect();
    const bar = rect(document.querySelector('#mailBar'));
    return {
      hscroll: document.documentElement.scrollWidth - document.documentElement.clientWidth,
      inner: [window.innerWidth, window.innerHeight],
      controls: ['#mailName', '#mailAddress', '#mailNextBtn', '#mailSaveHereBtn'].map((s) => {
        const r = rect(document.querySelector(s));
        return { s, inside: r.left >= 0 && r.right <= window.innerWidth && r.bottom <= window.innerHeight, underBar: r.left < bar.right && r.right > bar.left && r.top < bar.bottom && r.bottom > bar.top };
      }),
    };
  });
  expect(m.hscroll, `가로 넘침 ${m.inner}`).toBe(0);
  for (const c of m.controls) expect(c, `${m.inner}`).toMatchObject({ inside: true, underBar: false });
}

test('끊김 → 입력 → 확인 → 대기 → 복구 → 보낸 것으로 처리 → 기기에서 삭제', async () => {
  const profile = test.info().outputPath('profile');
  const { app, page } = await launch(profile);
  await expect(page.locator('#mailBar')).toContainText('실제 메일을 보내지 않습니다');
  expect(await app.evaluate(({ app: electronApp }) => electronApp.getName())).toBe('Voice Cinema Mail Trial');
  await expect(page.locator('#mailQueueChip')).toHaveCount(0);
  // 시험판 표시는 메인 화면의 글 · 단추를 가리지 않는다
  await page.locator('.scene-carousel').dispatchEvent('pointerdown', { pointerType: 'touch', isPrimary: true });
  for (const [w, h] of [[640, 640], [1000, 640], [1366, 697]]) {
    await sizeWindow(app, page, w, h);
    await expectBarClear(page);
  }
  await openStudio(page, '판타지');
  await page.locator('#mailOfflineToggle').check();
  await recordToEntry(page);

  // 입력: 칸은 비어 있고, 왜 받는지 한 줄이 있다
  await expect(page.locator('#mailName')).toHaveValue('');
  await expect(page.locator('#mailAddress')).toHaveValue('');
  await expect(page.locator('#doneMsg')).toHaveText('선생님이 적어 주세요. 인터넷이 돌아오면 인솔 선생님 메일로 영화 링크를 보내요.');
  await expect(page.locator('#mailAddress')).toHaveAttribute('type', 'email');
  await expect(page.locator('#mailAddress')).toHaveAttribute('autocomplete', 'off');

  // 오류는 고치는 방법까지 알리고 첫 오류 칸으로 간다
  await page.locator('#mailNextBtn').click();
  await expect(page.locator('#mailNameError')).toHaveText('이름 또는 별명을 적어 주세요.');
  await expect(page.locator('#mailAddressError')).toHaveText('메일 주소를 적어 주세요.');
  await expect(page.locator('#mailName')).toBeFocused();
  await expect(page.locator('#mailName')).toHaveAttribute('aria-invalid', 'true');
  await expectFormFits(page);
  await expectBarClear(page);
  await sizeWindow(app, page, 640, 640);
  await expectFormFits(page);
  await expectBarClear(page);
  await sizeWindow(app, page, 1366, 697);
  await expectFormFits(page);
  await expectBarClear(page);
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
  await expect(page.locator('#mailQueueChip')).toHaveText('메일 대기 1건');
  for (const [w, h] of [[640, 640], [1000, 640], [1366, 697]]) {
    await sizeWindow(app, page, w, h);
    await expectBarClear(page);
  }
  expect(queueFiles(profile)).toHaveLength(3);
  expect(await uploads(app)).toHaveLength(0);
  await page.locator('#mailQueueChip').click();
  await expect(page.locator('#mailQueue')).toContainText('p***@example.test');
  await expect(page.locator('#mailQueue')).not.toContainText(MAIL);
  await expect(page.locator('#mailQueue')).not.toContainText(NAME_A);
  await page.locator('#mailQueue').getByRole('button', { name: '닫기' }).click();

  // 복구 → 올리기 → 보낸 것으로 처리 → 지움
  await page.locator('#mailOfflineToggle').uncheck();
  const sent = page.locator('.mail-sent');
  await expect(sent).toBeVisible({ timeout: 60000 });
  await expect(sent).toContainText('보낸 것으로 처리했어요');
  await expect(sent).toContainText('시험판이라 실제 메일은 가지 않았어요');
  await expect(sent).toContainText(MAIL);
  await expect(sent).toContainText('[제4회 인천어린이청소년영화제] Voice Cinema 완성 영화 안내');
  await expect(sent).toContainText(`· ${NAME_A} — 판타지`);
  await expect(sent.getByRole('link', { name: FAKE_URL })).toBeVisible();
  await expect(sent.locator('.mail-sent-done')).toHaveText('영화 1편을 이 기기에서 지웠어요. 남은 대기 0건');
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
  await first.page.locator('#mailOfflineToggle').check();
  await recordToEntry(first.page);
  await queue(first.page, NAME_A, MAIL);
  await first.page.locator('#doneHomeBtn').click();
  await expect(first.page.locator('#home')).toHaveClass(/active/);

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

  // 다시 켜면 이어서 보내고 한 통으로 묶는다
  const second = await launch(profile);
  const sent = second.page.locator('.mail-sent');
  await expect(sent).toBeVisible({ timeout: 90000 });
  await expect(sent).toHaveCount(1);
  await expect(sent).toContainText(`· ${NAME_A} — 판타지`);
  await expect(sent).toContainText(`· ${NAME_B} — SF`);
  await expect(sent.locator('.mail-sent-done')).toHaveText('영화 2편을 이 기기에서 지웠어요. 남은 대기 0건');
  expect(await uploads(second.app)).toHaveLength(2);
  expect(queueFiles(profile)).toEqual(['queue.key']);
  await second.app.close();

  const after = scan(profile, needles);
  expect(after.found).toEqual([]);
  expect(after.unread).toEqual([]);
  expect([...first.logs, ...second.logs].join('\n')).not.toMatch(/probe-7731|별님시험|달님시험/i);
});

test('올리지 못하면 대기에 남고, «보내지 못함»은 다시 보낼 수 있고, 운영자가 지우면 영상까지 사라진다', async () => {
  const profile = test.info().outputPath('profile');
  const { app, page } = await launch(profile);
  await setReply(app, { status: 500, body: { ok: false } });
  await openStudio(page, '판타지');
  await page.locator('#mailOfflineToggle').check();
  await recordToEntry(page);
  await queue(page, NAME_A, MAIL);
  await page.locator('#mailOfflineToggle').uncheck();
  // 처음 + 다시 2번까지 실패한 뒤 대기로 남고 다음 시도 시각이 뒤로 밀린다
  await expect.poll(() => page.evaluate(async () => (await window.vcDesktop.mail.list())[0].attempts), { timeout: 150000 }).toBe(1);
  const [item] = await page.evaluate(() => window.vcDesktop.mail.list());
  expect(item.nextAt).toBeGreaterThan(Date.now());
  await expect(page.locator('.mail-sent')).toHaveCount(0);
  expect(queueFiles(profile)).toHaveLength(3);

  // 여러 번 실패해 빠진 건: 자동으로는 보내지 않고 운영자가 다시 보낸다
  await page.evaluate((id) => window.vcDesktop.mail.update(id, { failed: true }), item.id);
  await setReply(app, { status: 200, body: { ok: true, url: FAKE_URL } });
  await page.reload();
  await page.locator('#splash').waitFor({ state: 'detached', timeout: 60000 });
  await expect(page.locator('#mailQueueChip')).toHaveText('보내지 못함 1건');
  await page.locator('.scene-carousel').dispatchEvent('pointerdown', { pointerType: 'touch', isPrimary: true });
  for (const [w, h] of [[640, 640], [1000, 640], [1366, 697]]) {
    await sizeWindow(app, page, w, h);
    await expectBarClear(page);
  }
  await page.locator('#mailQueueChip').click();
  await expect(page.locator('#mailQueue')).toContainText('보내지 못했어요');
  await page.locator('#mailQueue').getByRole('button', { name: '다시 보내기' }).click();
  await page.locator('#mailQueue').getByRole('button', { name: '닫기' }).click();
  await expect(page.locator('.mail-sent')).toBeVisible({ timeout: 60000 });
  await page.locator('.mail-sent').getByRole('button', { name: '닫기' }).click();

  // 지우기는 두 번 눌러야 하고, 영상 · 정보가 함께 사라진다
  await page.locator('#mailOfflineToggle').check();
  await pickScene(page, 'SF');
  await recordToEntry(page);
  await queue(page, NAME_B, MAIL);
  const before = (await uploads(app)).length;
  expect(queueFiles(profile)).toHaveLength(3);
  await page.locator('#mailQueueChip').click();
  await page.locator('#mailQueue').getByRole('button', { name: '지우기' }).click();
  expect(queueFiles(profile)).toHaveLength(3);
  await page.locator('#mailQueue').getByRole('button', { name: '영화도 함께 지워져요. 지울까요 ?' }).click();
  await expect(page.locator('#mailQueue')).toContainText('기다리는 메일이 없어요.');
  await expect.poll(() => queueFiles(profile)).toEqual(['queue.key']);
  expect((await uploads(app)).length).toBe(before);
  await app.close();
});

test('대기열을 열 수 없으면(키 손상) 메일 화면 없이 지금까지처럼 이 기기에 저장으로 간다', async () => {
  const profile = test.info().outputPath('profile');
  mkdirSync(path.join(profile, 'mail-queue'), { recursive: true });
  writeFileSync(path.join(profile, 'mail-queue', 'queue.key'), 'not-a-sealed-key');
  const { app, page } = await launch(profile);
  expect(await page.evaluate(() => typeof window.vcDesktop)).toBe('undefined');
  await expect(page.locator('#mailBar')).toHaveCount(0);
  await setReply(app, { status: 500, body: { ok: false } });
  await openStudio(page, '판타지');
  await expect(page.locator('#engineProg')).toHaveText('100%', { timeout: 30000 });
  expect(await recordOnce(page)).toMatchObject({ phase: 'recorded' });
  await page.locator('#saveBtn').click();
  await expect(page.locator('#downloadRow')).toBeVisible({ timeout: 200000 });
  await expect(page.locator('#mailName')).toHaveCount(0);
  await app.close();
});

test('«메일 없이 이 기기에 저장»을 고를 수 있다 — 아무것도 대기열에 남지 않는다', async () => {
  const profile = test.info().outputPath('profile');
  const { page, app } = await launch(profile);
  await openStudio(page, '판타지');
  await page.locator('#mailOfflineToggle').check();
  await recordToEntry(page);
  await page.locator('#mailName').fill(NAME_A);
  await page.locator('#mailSaveHereBtn').click();
  await expect(page.locator('#downloadBtn')).toBeVisible();
  await expect(page.locator('#savemode')).toContainText('학생에게 전달한 뒤 꼭 지워 주세요');
  expect(existsSync(path.join(profile, 'mail-queue', 'queue.key'))).toBe(true);
  expect(queueFiles(profile)).toEqual(['queue.key']);
  expect(statSync(path.join(profile, 'mail-queue', 'queue.key')).size).toBeGreaterThan(0);
  await app.close();
});
