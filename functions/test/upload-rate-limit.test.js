// /upload가 **실제로** 레이트리밋을 통과하는지 확인한다.
//
// 왜 따로 있는가: `validate.test.js`는 `createRateLimiter`라는 **순수 함수만** 검사한다.
// 그래서 `/upload` 핸들러가 그 함수를 **부르지 않게** 만들어도 유닛이 전부 통과했다 —
// 2026-09-10에 실제로 확인했다. 한도를 강제하는 함수가 있는 것과, 그 함수가 실제로 그
// 자리에서 불리는 것은 다른 문제다.
//
// 2026-10-05부터 한도가 둘이다. 인증 전 요청은 분당 600의 상한만, 인증을 통과한 업로드는
// 분당 60을 따로 센다 — 인증 전 요청이 학생 업로드 몫을 쓰지 않아야 한다. 두 가지를 다
// 진짜 핸들러로 본다. 클라이언트 IP는 X-Forwarded-For로 테스트마다 다르게 준다
// (trust proxy 1이라 마지막 한 홉을 req.ip로 쓴다).
//
// 인증 통과는 App Check 검증만 가짜로 바꿔 만든다. 본문이 '{}'라 검증 단계에서 400으로
// 멈추므로 Storage에는 닿지 않는다.
import { test, expect, vi } from 'vitest';
import http from 'node:http';

vi.mock('firebase-admin/app-check', () => ({
  getAppCheck: () => ({ verifyToken: async (t) => { if (t !== 'pass') throw new Error('거부'); return {}; } }),
}));

// functions/index.js의 상수와 같은 값. 소스를 읽어오면 "자기가 만든 것과 비교"가 된다.
const 인증전상한 = 600;
const 업로드한도 = 60;
const TOKEN = 'ac3231330f737aaf7f90c825f7ddacc9e287b3ac87caf99d';

async function 서버() {
  process.env.FUNCTIONS_EMULATOR = 'true';
  const { voiceCinema } = await import('../index.js');
  const server = http.createServer((req, res) => voiceCinema(req, res));
  await new Promise((resolve) => server.listen(0, '127.0.0.1', resolve));
  const 보내기 = (ip, 인증) =>
    fetch(`http://127.0.0.1:${server.address().port}/upload`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'X-Forwarded-For': ip,
        ...(인증 ? { 'x-booth-token': TOKEN, 'x-firebase-appcheck': 'pass' } : {}),
      },
      body: '{}',
    }).then(async (r) => { await r.arrayBuffer(); return r.status; });
  return { 보내기, 닫기: () => new Promise((resolve) => server.close(resolve)) };
}

test('인증 전 요청은 분당 상한을 넘기면 429', async () => {
  const { 보내기, 닫기 } = await 서버();
  try {
    const 코드 = [];
    for (let i = 0; i < 인증전상한 + 5; i++) 코드.push(await 보내기('10.0.0.1', false));
    expect(코드).toHaveLength(인증전상한 + 5); // 0건 통과와 구별되게(§21-1)
    expect(new Set(코드.slice(0, 인증전상한))).toEqual(new Set([403])); // 토큰 없음 — 200이면 인증이 뚫린 것
    expect(코드.slice(인증전상한), '상한을 넘겼는데 막히지 않는다').toEqual(Array(5).fill(429));
  } finally { await 닫기(); }
}, 60000);

test('인증 전 요청은 학생 업로드 한도를 쓰지 않고, 인증된 업로드는 분당 60에서 막힌다', async () => {
  const { 보내기, 닫기 } = await 서버();
  try {
    // 같은 공인 IP에서 인증 없는 요청이 먼저 100번 와도
    for (let i = 0; i < 100; i++) expect(await 보내기('10.0.0.2', false)).toBe(403);
    // 인증된 업로드 몫 60은 그대로 남아 있어야 한다
    const 코드 = [];
    for (let i = 0; i < 업로드한도 + 5; i++) 코드.push(await 보내기('10.0.0.2', true));
    expect(코드).toHaveLength(업로드한도 + 5);
    expect(new Set(코드.slice(0, 업로드한도)), '인증 전 요청이 업로드 몫을 썼다').toEqual(new Set([400])); // 본문 검증까지 감
    expect(코드.slice(업로드한도), '업로드 한도를 넘겼는데 막히지 않는다').toEqual(Array(5).fill(429));
  } finally { await 닫기(); }
}, 60000);
