// /mail을 **진짜 핸들러**로 본다(2026-11-08) — App Check · Storage · Resend만 가짜로 바꾼다.
// 막는 순서(토큰 → App Check → 검사 → 파일 있음 → 키 → 발송), 응답 상태, 그리고 로그에 메일 주소 · 이름 · 키가 남지 않는지.
import { test, expect, vi, beforeAll, afterAll, beforeEach, afterEach } from 'vitest';
import http from 'node:http';

const 있는파일 = vi.hoisted(() => new Set());
vi.mock('firebase-admin/app-check', () => ({
  getAppCheck: () => ({ verifyToken: async (token) => { if (token !== 'good') throw new Error('bad token'); return {}; } }),
}));
vi.mock('firebase-admin/storage', () => ({
  getStorage: () => ({ bucket: () => ({ name: 'test-bucket', file: (name) => ({ exists: async () => [있는파일.has(name)] }) }) }),
}));

const TOKEN = 'ac3231330f737aaf7f90c825f7ddacc9e287b3ac87caf99d';
const KEY = 're_test_key_never_logged';
const MAIL = 'probe-4410@school.example';
const NAME = '탐침이름가나';
const OBJECT = 'dub_musical_1762560000000_abcdefabcdefabcdef.mp4';
const LINK = `https://storage.googleapis.com/test-bucket/dubs/${OBJECT}`;
const realFetch = globalThis.fetch;

let server;
let base;
let resend; // Resend가 돌려줄 응답과 받은 요청
let logs;

beforeAll(async () => {
  process.env.FUNCTIONS_EMULATOR = 'true';
  const { voiceCinema } = await import('../index.js');
  server = http.createServer((req, res) => voiceCinema(req, res));
  await new Promise((resolve) => server.listen(0, '127.0.0.1', resolve));
  base = `http://127.0.0.1:${server.address().port}`;
}, 60000);
afterAll(async () => { await new Promise((resolve) => server.close(resolve)); });

beforeEach(() => {
  있는파일.clear();
  있는파일.add(`dubs/${OBJECT}`);
  process.env.RESEND_API_KEY = KEY;
  resend = { status: 200, json: { id: 'sent-1' }, calls: [] };
  vi.stubGlobal('fetch', async (url, init) => {
    if (url !== 'https://api.resend.com/emails') return realFetch(url, init);
    resend.calls.push({ headers: init.headers, body: JSON.parse(init.body) });
    return new Response(JSON.stringify(resend.json), { status: resend.status });
  });
  logs = [];
  for (const level of ['log', 'warn', 'error']) vi.spyOn(console, level).mockImplementation((...args) => { logs.push(args.map(String).join(' ')); });
});
afterEach(() => { vi.unstubAllGlobals(); vi.restoreAllMocks(); vi.useRealTimers(); });

const send = (payload = { to: MAIL, items: [{ name: NAME, url: LINK }] }, headers = {}) =>
  realFetch(`${base}/mail`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', 'x-booth-token': TOKEN, 'x-firebase-appcheck': 'good', ...headers },
    body: JSON.stringify(payload),
  }).then(async (r) => ({ status: r.status, body: await r.json() }));

function expectCleanLogs() {
  const all = logs.join('\n');
  expect(all, '로그에 메일 주소').not.toContain(MAIL);
  expect(all, '로그에 메일 주소 앞부분').not.toContain('probe-4410');
  expect(all, '로그에 이름').not.toContain(NAME);
  expect(all, '로그에 키').not.toContain(KEY);
}

test('맞는 요청은 Resend로 한 통을 보내고 200 — 보내는 사람 · 받는 사람 · 이름과 링크가 든 본문', async () => {
  const r = await send();
  expect(r).toEqual({ status: 200, body: { ok: true } });
  expect(resend.calls).toHaveLength(1);
  const { headers, body } = resend.calls[0];
  expect(headers.Authorization).toBe(`Bearer ${KEY}`);
  expect(headers['Idempotency-Key']).toMatch(/^vc-mail-[0-9a-f]{64}$/);
  expect(body.to).toEqual([MAIL]);
  expect(body.from).toBe('Voice Cinema <voice-cinema@edutogether.kr>');
  expect(body.subject).not.toContain(NAME);
  expect(body.text).toContain(`· ${NAME} — 뮤지컬\n  ${LINK}`);
  expect(logs.some((l) => l.includes('보냄: 영화 1편 (sent-1)'))).toBe(true);
  expectCleanLogs();
});

test.each([
  ['토큰 없음', { 'x-booth-token': 'wrong' }, 403],
  ['App Check 없음', { 'x-firebase-appcheck': '' }, 401],
  ['App Check 틀림', { 'x-firebase-appcheck': 'bad' }, 401],
])('%s → %i, Resend를 부르지 않는다', async (_, headers, status) => {
  const r = await send(undefined, headers);
  expect(r.status).toBe(status);
  expect(resend.calls).toHaveLength(0);
  expectCleanLogs();
});

test('검사에 걸리는 요청(주소 · 다른 버킷) → 400, Resend를 부르지 않는다', async () => {
  expect((await send({ to: 'not-an-address', items: [{ name: NAME, url: LINK }] })).status).toBe(400);
  expect((await send({ to: MAIL, items: [{ name: NAME, url: LINK.replace('test-bucket', 'other') }] })).status).toBe(400);
  expect(resend.calls).toHaveLength(0);
  expectCleanLogs();
});

test('버킷에 없는 영화 링크 → 400, Resend를 부르지 않는다', async () => {
  있는파일.clear();
  const r = await send();
  expect(r).toEqual({ status: 400, body: { ok: false, error: '영화 링크가 올바르지 않습니다.' } });
  expect(resend.calls).toHaveLength(0);
});

test('발송 키가 없으면 503(설치판이 나중에 다시 보낸다)', async () => {
  delete process.env.RESEND_API_KEY;
  expect((await send()).status).toBe(503);
  expect(resend.calls).toHaveLength(0);
  expect(logs.some((l) => l.includes('발송 키 없음'))).toBe(true);
});

test.each([
  [429, { name: 'daily_quota_exceeded', message: `quota for ${MAIL}` }, 503],
  [500, { name: 'application_error' }, 503],
  [403, { name: 'validation_error', message: `You can only send testing emails to your own email address (${MAIL})` }, 502],
])('Resend %i → 설치판에는 %i, 로그에는 오류 이름만', async (status, json, expected) => {
  resend.status = status;
  resend.json = json;
  const r = await send();
  expect(r.status).toBe(expected);
  expect(r.body.ok).toBe(false);
  expect(JSON.stringify(r.body)).not.toContain(MAIL);
  expect(logs.some((l) => l.includes(`발송 실패: ${status} ${json.name}`))).toBe(true);
  expectCleanLogs();
});

test('보관 기한(2026-12-01 00:00 KST)이 지나면 410, Resend를 부르지 않는다', async () => {
  vi.useFakeTimers({ toFake: ['Date'] });
  vi.setSystemTime(new Date('2026-12-01T00:00:00+09:00'));
  expect((await send()).status).toBe(410);
  expect(resend.calls).toHaveLength(0);
});
