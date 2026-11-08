// /feedback · /kakao/start · /kakao/callback을 **진짜 핸들러**로 본다(2026-11-08, Poster Studio와 같은 구조) — App Check · Firestore · 카카오만 가짜로 바꾼다.
// 막는 순서(닫힘 → 토큰 → App Check → 한도 → 형식 → 검사 → 저장 → 카카오), 응답 상태, 카카오 토큰 다루기,
// 그리고 로그에 이름 · 의견 글 · 토큰 · 앱 키가 남지 않는지.
import { test, expect, vi, beforeAll, afterAll, beforeEach, afterEach } from 'vitest';
import http from 'node:http';
import crypto from 'node:crypto';

const 저장소 = vi.hoisted(() => ({ docs: new Map(), 저장실패: false, 번호: 0 }));
vi.mock('firebase-admin/app-check', () => ({
  getAppCheck: () => ({ verifyToken: async (token) => { if (token !== 'good') throw new Error('bad token'); return {}; } }),
}));
vi.mock('firebase-admin/firestore', () => {
  const ref = (col, id) => {
    const key = `${col}/${id}`;
    return {
      key,
      get: async () => { const d = 저장소.docs.get(key); return { exists: d !== undefined, data: () => structuredClone(d) }; },
      set: async (data, opt) => { 저장소.docs.set(key, opt?.merge ? { ...(저장소.docs.get(key) || {}), ...data } : { ...data }); },
    };
  };
  const db = {
    collection: (col) => ({
      doc: (id) => ref(col, id),
      add: async (data) => {
        if (저장소.저장실패) throw new Error('저장 거부');
        const id = `fb${++저장소.번호}`;
        저장소.docs.set(`${col}/${id}`, { ...data });
        return { id };
      },
      where: (field, op, value) => ({
        limit: (n) => ({
          get: async () => {
            const docs = [...저장소.docs].filter(([k, d]) => k.startsWith(`${col}/`) && op === '<' && d[field] < value).slice(0, n).map(([k]) => ({ ref: { key: k } }));
            return { empty: docs.length === 0, size: docs.length, docs };
          },
        }),
      }),
    }),
    batch: () => {
      const 지울것 = [];
      return { delete: (r) => 지울것.push(r.key), commit: async () => 지울것.forEach((k) => 저장소.docs.delete(k)) };
    },
    runTransaction: async (fn) => fn({ get: (r) => r.get(), delete: (r) => { 저장소.docs.delete(r.key); } }),
  };
  return { getFirestore: () => db };
});

const BOOTH = 'ac3231330f737aaf7f90c825f7ddacc9e287b3ac87caf99d';
const REST_KEY = 'kakao-rest-key-never-logged';
const SECRET = 'kakao-secret-never-logged';
const OLD_ACCESS = 'access-old-never-logged';
const NEW_ACCESS = 'access-new-never-logged';
const REFRESH = 'refresh-never-logged';
const NAME = '탐침선생가나';
const TEXT = '탐침의견다라마 녹음 단추가 잘 안 보여요.';
const TOKEN_URL = 'https://kauth.kakao.com/oauth/token';
const SEND_URL = 'https://kapi.kakao.com/v2/api/talk/memo/default/send';
const ME_URL = 'https://kapi.kakao.com/v2/user/me';
const realFetch = globalThis.fetch;
const 기준 = Date.parse('2026-11-10T14:00:00+09:00');

let server;
let base;
let feedbackMaintenance;
let 카카오; // 카카오가 돌려줄 응답과 받은 요청
let logs;
let 분 = 0;

beforeAll(async () => {
  process.env.FUNCTIONS_EMULATOR = 'true';
  const index = await import('../index.js');
  const { voiceCinema } = index;
  ({ feedbackMaintenance } = index);
  server = http.createServer((req, res) => voiceCinema(req, res));
  await new Promise((resolve) => server.listen(0, '127.0.0.1', resolve));
  base = `http://127.0.0.1:${server.address().port}`;
}, 60000);
afterAll(async () => { await new Promise((resolve) => server.close(resolve)); });

beforeEach(() => {
  // 의견 한도(분당 10)가 앞 시험의 요청을 세지 않게 시험마다 시계를 2분씩 옮긴다
  vi.useFakeTimers({ toFake: ['Date'] });
  분 += 2;
  vi.setSystemTime(기준 + 분 * 60000);
  저장소.docs.clear();
  저장소.저장실패 = false;
  process.env.KAKAO_REST_API_KEY = REST_KEY;
  process.env.KAKAO_CLIENT_SECRET = SECRET;
  카카오 = { token: { status: 200, json: { access_token: NEW_ACCESS, expires_in: 21599 } }, send: [], me: { id: 777 }, calls: [] };
  vi.stubGlobal('fetch', async (url, init = {}) => {
    if (![TOKEN_URL, SEND_URL, ME_URL].includes(url)) return realFetch(url, init);
    카카오.calls.push({ url, auth: init.headers?.authorization, body: init.body ? Object.fromEntries(new URLSearchParams(init.body)) : null });
    const 답 = (status, json) => new Response(JSON.stringify(json), { status });
    if (url === TOKEN_URL) return 답(카카오.token.status, 카카오.token.json);
    if (url === ME_URL) return 답(200, 카카오.me);
    const status = 카카오.send.shift() ?? 200;
    return 답(status, status === 200 ? { result_code: 0 } : { code: -401, msg: `secret ${OLD_ACCESS}` });
  });
  logs = [];
  for (const level of ['log', 'warn', 'error']) vi.spyOn(console, level).mockImplementation((...args) => { logs.push(args.map(String).join(' ')); });
});
afterEach(() => { vi.unstubAllGlobals(); vi.restoreAllMocks(); vi.useRealTimers(); });

const 연결됨 = (fields = {}) =>
  저장소.docs.set('kakaoAuth/owner', {
    userId: '777',
    accessToken: OLD_ACCESS,
    accessExpiresAt: Date.now() + 3600_000,
    refreshToken: REFRESH,
    refreshExpiresAt: Date.now() + 50 * 86400_000,
    ...fields,
  });
const 의견들 = () => [...저장소.docs].filter(([k]) => k.startsWith('feedback/')).map(([, v]) => v);
const 맞는본문 = () => ({ name: NAME, text: TEXT, version: 'main-BFrkAMTb.js', screen: '2560x1305@1', device: 'pc', step: 1 });

const send = (payload = 맞는본문(), headers = {}, raw) =>
  realFetch(`${base}/feedback`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', 'x-booth-token': BOOTH, 'x-firebase-appcheck': 'good', ...headers },
    body: raw ?? JSON.stringify(payload),
  }).then(async (r) => ({ status: r.status, body: await r.json().catch(() => null) }));

function expectCleanLogs() {
  const all = logs.join('\n');
  for (const [이름, 값] of [['이름', NAME], ['의견', '탐침의견'], ['앱 키', REST_KEY], ['비밀', SECRET], ['옛 토큰', OLD_ACCESS], ['새 토큰', NEW_ACCESS], ['리프레시 토큰', REFRESH]]) {
    expect(all, `로그에 ${이름}`).not.toContain(값);
  }
}

test('맞는 의견은 Firestore feedback에 저장하고 카카오 «나에게 보내기»로 알린 뒤 200', async () => {
  연결됨();
  const r = await send();
  expect(r).toEqual({ status: 200, body: { ok: true } });
  expect(의견들()).toEqual([{ ...맞는본문(), createdAt: new Date(Date.now()) }]);
  expect(카카오.calls.map((c) => c.url)).toEqual([SEND_URL]);
  expect(카카오.calls[0].auth).toBe(`Bearer ${OLD_ACCESS}`);
  const 틀 = JSON.parse(카카오.calls[0].body.template_object);
  expect(틀.object_type).toBe('text');
  expect(틀.text).toBe(`[Voice Cinema 의견] ${NAME}\n${TEXT}\n— 판 main-BFrkAMTb.js · 2560x1305@1 · pc · 1단계`);
  expect(틀.link).toEqual({ web_url: 'https://voice.edutogether.kr', mobile_web_url: 'https://voice.edutogether.kr' });
  expect(logs.some((l) => /저장 fb\d+ · 알림 보냄/.test(l))).toBe(true);
  expectCleanLogs();
});

test('카카오 글은 200자를 넘으면 199자 + «…»로 줄여 보낸다(저장은 원문 그대로)', async () => {
  연결됨();
  const 긴글 = '가'.repeat(500);
  expect((await send({ ...맞는본문(), text: 긴글 })).status).toBe(200);
  expect(의견들()[0].text).toBe(긴글);
  const 보낸글 = JSON.parse(카카오.calls[0].body.template_object).text;
  expect([...보낸글]).toHaveLength(200);
  expect(보낸글.endsWith('…')).toBe(true);
});

test('아직 카카오를 연결하기 전이면 저장만 하고 200(카카오를 부르지 않는다)', async () => {
  const r = await send();
  expect(r.status).toBe(200);
  expect(의견들()).toHaveLength(1);
  expect(카카오.calls).toEqual([]);
  expect(logs.some((l) => /저장 fb\d+ · 알림 못 보냄/.test(l))).toBe(true);
});

test('카카오가 실패해도 저장은 남고 200 — 로그에는 상태와 오류 코드만', async () => {
  연결됨();
  카카오.send = [500];
  const r = await send();
  expect(r.status).toBe(200);
  expect(의견들()).toHaveLength(1);
  expect(logs.some((l) => l.includes('카카오 알림 실패(저장은 됨)') && l.includes('HTTP 500 · -401'))).toBe(true);
  expectCleanLogs();
});

test('토큰이 곧 끝나면 먼저 새로 받아 저장하고 보낸다', async () => {
  연결됨({ accessExpiresAt: Date.now() + 30_000 });
  expect((await send()).status).toBe(200);
  expect(카카오.calls.map((c) => c.url)).toEqual([TOKEN_URL, SEND_URL]);
  expect(카카오.calls[0].body).toEqual({ grant_type: 'refresh_token', client_id: REST_KEY, refresh_token: REFRESH, client_secret: SECRET });
  expect(카카오.calls[1].auth).toBe(`Bearer ${NEW_ACCESS}`);
  const owner = 저장소.docs.get('kakaoAuth/owner');
  expect(owner.accessToken).toBe(NEW_ACCESS);
  expect(owner.accessExpiresAt).toBe(Date.now() + 21599 * 1000);
  expect(owner.refreshToken, '리프레시 토큰이 새로 오지 않으면 예전 값을 둔다').toBe(REFRESH);
  expectCleanLogs();
});

test('보내다 401이면 한 번만 토큰을 새로 받아 다시 보낸다', async () => {
  연결됨();
  카카오.send = [401, 200];
  expect((await send()).status).toBe(200);
  expect(카카오.calls.map((c) => c.url)).toEqual([SEND_URL, TOKEN_URL, SEND_URL]);
  expect(카카오.calls[2].auth).toBe(`Bearer ${NEW_ACCESS}`);
  카카오.calls = [];
  카카오.send = [401, 401];
  expect((await send()).status, '두 번째 401은 알림만 실패 — 저장은 됨').toBe(200);
  expect(카카오.calls.map((c) => c.url)).toEqual([SEND_URL, TOKEN_URL, SEND_URL]);
  expectCleanLogs();
});

test('저장이 실패하면 503이고 카카오를 부르지 않는다', async () => {
  연결됨();
  저장소.저장실패 = true;
  const r = await send();
  expect(r).toEqual({ status: 503, body: { ok: false, error: '지금은 보낼 수 없어요. 잠시 뒤에 다시 해 주세요.', code: 'feedback_store' } });
  expect(카카오.calls).toEqual([]);
  expectCleanLogs();
});

test('형식이 틀리면 저장 · 알림 없이 400 — 칸이 더 있거나, 이름이 비거나, JSON이 아니면 415', async () => {
  연결됨();
  expect((await send({ ...맞는본문(), app: 'web' })).status).toBe(400);
  expect((await send({ ...맞는본문(), name: '  ' })).status).toBe(400);
  expect((await send(null, { 'Content-Type': 'text/plain' }, 'name=x')).status).toBe(415);
  expect(의견들()).toEqual([]);
  expect(카카오.calls).toEqual([]);
  expectCleanLogs();
});

test('토큰이 틀리면 403, App Check가 없거나 틀리면 401 — 저장하지 않는다', async () => {
  expect((await send(맞는본문(), { 'x-booth-token': 'nope' })).status).toBe(403);
  expect((await send(맞는본문(), { 'x-firebase-appcheck': '' })).status).toBe(401);
  expect((await send(맞는본문(), { 'x-firebase-appcheck': 'bad' })).status).toBe(401);
  expect(의견들()).toEqual([]);
});

test('한 IP에서 분당 10건까지 받고 11번째부터 429', async () => {
  const statuses = [];
  for (let i = 0; i < 12; i++) statuses.push((await send({ ...맞는본문(), text: `의견 ${i}` })).status);
  expect(statuses).toEqual([...Array(10).fill(200), 429, 429]);
  expect(의견들()).toHaveLength(10);
});

// ── 카카오 연결 ──
const 열기 = (path) => realFetch(`${base}${path}`, { redirect: 'manual' }).then(async (r) => ({ status: r.status, location: r.headers.get('location'), html: await r.text() }));

async function 연결시작() {
  const r = await 열기('/kakao/start');
  expect(r.status).toBe(302);
  const 갈곳 = new URL(r.location);
  expect(갈곳.origin + 갈곳.pathname).toBe('https://kauth.kakao.com/oauth/authorize');
  return 갈곳.searchParams;
}

test('/kakao/start: 카카오 로그인으로 보내고, state는 해시만 10분 동안 둔다', async () => {
  const q = await 연결시작();
  expect(q.get('client_id')).toBe(REST_KEY);
  expect(q.get('redirect_uri')).toBe('https://asia-northeast3-inky-voice-cinema.cloudfunctions.net/voiceCinema/kakao/callback');
  expect(q.get('response_type')).toBe('code');
  expect(q.get('scope')).toBe('talk_message');
  const state = q.get('state');
  expect(state).toMatch(/^[0-9a-f]{32}$/);
  const pending = 저장소.docs.get('kakaoAuth/pending');
  expect(pending).toEqual({ stateHash: crypto.createHash('sha256').update(state).digest('hex'), expiresAt: Date.now() + 600_000 });
  expect(JSON.stringify(pending)).not.toContain(state);
});

test('/kakao/start: 앱 키가 없으면 503 안내', async () => {
  delete process.env.KAKAO_CLIENT_SECRET;
  const r = await 열기('/kakao/start');
  expect(r.status).toBe(503);
  expect(r.html).toContain('카카오 앱 키가 아직 없어요');
});

test('/kakao/callback: 맞는 state면 토큰을 받아 처음 계정에 묶고 시험 메시지를 보낸다 — state는 한 번만 쓴다', async () => {
  카카오.token.json = { access_token: NEW_ACCESS, expires_in: 21599, refresh_token: REFRESH, refresh_token_expires_in: 5183999 };
  const state = (await 연결시작()).get('state');
  const r = await 열기(`/kakao/callback?code=abc&state=${state}`);
  expect(r.status).toBe(200);
  expect(r.html).toContain('카카오톡 알림 연결 완료');
  expect(카카오.calls.map((c) => c.url)).toEqual([TOKEN_URL, ME_URL, SEND_URL]);
  expect(카카오.calls[0].body).toEqual({
    grant_type: 'authorization_code',
    client_id: REST_KEY,
    redirect_uri: 'https://asia-northeast3-inky-voice-cinema.cloudfunctions.net/voiceCinema/kakao/callback',
    code: 'abc',
    client_secret: SECRET,
  });
  expect(JSON.parse(카카오.calls[2].body.template_object).text).toContain('Voice Cinema 의견 알림이 연결됐어요');
  expect(저장소.docs.get('kakaoAuth/owner')).toMatchObject({ userId: '777', accessToken: NEW_ACCESS, refreshToken: REFRESH, refreshExpiresAt: Date.now() + 5183999 * 1000 });
  expect(저장소.docs.has('kakaoAuth/pending')).toBe(false);
  const 다시 = await 열기(`/kakao/callback?code=abc&state=${state}`);
  expect(다시.status).toBe(400);
  expect(다시.html).toContain('연결 시간이 지났어요');
  expectCleanLogs();
});

test('/kakao/callback: 틀린 state · 10분 지난 state · 모양이 다른 주소 · 동의 취소는 400', async () => {
  await 연결시작();
  expect((await 열기(`/kakao/callback?code=abc&state=${'0'.repeat(32)}`)).status).toBe(400);
  const state = (await 연결시작()).get('state');
  vi.setSystemTime(Date.now() + 600_001);
  expect((await 열기(`/kakao/callback?code=abc&state=${state}`)).status).toBe(400);
  expect((await 열기('/kakao/callback?code=abc&state=<script>')).status).toBe(400);
  expect((await 열기('/kakao/callback?error=access_denied')).status).toBe(400);
  expect(카카오.calls).toEqual([]);
  expect(저장소.docs.has('kakaoAuth/owner')).toBe(false);
});

// ── 매일 04시 정리(진짜 예약 함수) ──
test('매일 정리: 받은 지 90일 지난 의견만 지우고 카카오 토큰을 새로 받는다', async () => {
  연결됨();
  const 지금 = Date.now();
  저장소.docs.set('feedback/old', { ...맞는본문(), createdAt: new Date(지금 - 90 * 86400_000 - 1) });
  저장소.docs.set('feedback/new', { ...맞는본문(), createdAt: new Date(지금 - 89 * 86400_000) });
  await expect(feedbackMaintenance.run({})).resolves.toBeUndefined();
  expect([...저장소.docs.keys()].filter((k) => k.startsWith('feedback/'))).toEqual(['feedback/new']);
  expect(카카오.calls.map((c) => c.url)).toEqual([TOKEN_URL]);
  expect(저장소.docs.get('kakaoAuth/owner').accessToken).toBe(NEW_ACCESS);
  expectCleanLogs();
});

test('매일 정리: 카카오 갱신이 실패해도 의견 정리는 하고, 실행은 실패로 끝난다 · 연결 전이면 갱신 없이 성공', async () => {
  연결됨();
  저장소.docs.set('feedback/old', { ...맞는본문(), createdAt: new Date(Date.now() - 91 * 86400_000) });
  카카오.token.status = 401;
  await expect(feedbackMaintenance.run({})).rejects.toThrow('카카오 토큰 갱신 실패');
  expect(저장소.docs.has('feedback/old')).toBe(false);
  저장소.docs.delete('kakaoAuth/owner');
  카카오.calls = [];
  await expect(feedbackMaintenance.run({})).resolves.toBeUndefined();
  expect(카카오.calls).toEqual([]);
  expectCleanLogs();
});

test('/kakao/callback: 이미 다른 계정이 연결돼 있으면 덮어쓰지 않고 403', async () => {
  연결됨({ userId: '111' });
  const state = (await 연결시작()).get('state');
  const r = await 열기(`/kakao/callback?code=abc&state=${state}`);
  expect(r.status).toBe(403);
  expect(저장소.docs.get('kakaoAuth/owner').userId).toBe('111');
  expect(저장소.docs.get('kakaoAuth/owner').accessToken).toBe(OLD_ACCESS);
});

// 맨 끝에 둔다 — 시계를 11/13 밤으로 옮겨 보낸 요청이 한도 기록에 «미래 시각»으로 남아, 뒤 시험(11/10)의 1분 안에 같이 세어진다
test('한국 시간 2026-11-14 00:00부터는 문 검사 전에 410 — 저장 · 알림 없이(1초 전까지는 받는다)', async () => {
  vi.setSystemTime(Date.parse('2026-11-13T23:59:59+09:00'));
  연결됨();
  expect((await send()).status).toBe(200);
  vi.setSystemTime(Date.parse('2026-11-14T00:00:00+09:00'));
  const r = await send(맞는본문(), { 'x-booth-token': '', 'x-firebase-appcheck': '' });
  expect(r).toEqual({ status: 410, body: { ok: false, error: '의견은 이제 받지 않아요.', code: 'feedback_closed' } });
  expect(의견들()).toHaveLength(1);
  expect(카카오.calls.map((c) => c.url)).toEqual([SEND_URL]);
});
