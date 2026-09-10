// /upload가 **실제로** 레이트리밋을 통과하는지 확인한다.
//
// 왜 따로 있는가: `validate.test.js`는 `createRateLimiter`라는 **순수 함수만** 검사한다.
// 그래서 `/upload` 핸들러가 그 함수를 **부르지 않게** 만들어도 테스트가 전부 통과했다 —
// 2026-09-10에 실제로 확인했다(무력화 후 유닛 57개 전부 초록불, 그런데 요청 70개가
// 전부 403이고 429가 한 번도 안 나왔다). 한도를 강제하는 함수가 있는 것과, 그 함수가
// 실제로 그 자리에서 불리는 것은 다른 문제다.
//
// 부스 와이파이는 NAT로 공인 IP 하나를 같이 쓴다. 이 방어가 조용히 빠지면 스크립트
// 하나가 업로드를 무제한으로 때려도 아무도 모른다.
//
// 토큰 없이 보내므로 한도를 통과한 요청은 BOOTH_TOKEN 검사에서 403으로 멈춘다 —
// Storage에 닿지 않고, 프로덕션에도 아무것도 남지 않는다.
import { test, expect } from 'vitest';
import http from 'node:http';

// functions/index.js의 상수와 같은 값. 다르면 이 테스트가 먼저 이상해지므로
// 여기서 굳이 소스를 읽어오지 않는다 — 읽어오면 "자기가 만든 것과 비교"가 된다.
const 분당한도 = 60;

test('/upload는 분당 한도를 넘기면 429를 돌려준다', async () => {
  process.env.FUNCTIONS_EMULATOR = 'true';
  const { voiceCinema } = await import('../index.js');

  const server = http.createServer((req, res) => voiceCinema(req, res));
  await new Promise((resolve) => server.listen(0, '127.0.0.1', resolve));
  const { port } = server.address();

  const 보내기 = () =>
    fetch(`http://127.0.0.1:${port}/upload`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: '{}',
    });

  try {
    const 코드 = [];
    for (let i = 0; i < 분당한도 + 5; i++) 코드.push((await 보내기()).status);

    // 무엇을 몇 개 봤는지 먼저 말한다 — 0건 통과와 구별되게(§21-1).
    expect(코드).toHaveLength(분당한도 + 5);

    const 한도안 = 코드.slice(0, 분당한도);
    const 한도밖 = 코드.slice(분당한도);

    // 한도 안에서는 429가 나오면 안 된다 — 너무 일찍 막으면 부스가 멈춘다.
    expect(한도안.filter((c) => c === 429), '한도 안인데 막힌 요청이 있다').toEqual([]);
    // 토큰이 없으므로 403이어야 한다 — 여기가 200이면 인증이 뚫린 것이다.
    expect(new Set(한도안)).toEqual(new Set([403]));

    // 한도를 넘으면 전부 429여야 한다. 이 단언이 무너지면 레이트리밋이
    // 코드에 있기만 하고 실제로는 안 불리는 상태다.
    expect(한도밖, '한도를 넘겼는데 막히지 않는다').toEqual(Array(한도밖.length).fill(429));

    const 본문 = await (await 보내기()).json();
    expect(본문.ok).toBe(false);
    expect(본문.error).toContain('요청이 너무 많습니다');
  } finally {
    await new Promise((resolve) => server.close(resolve));
  }
}, 60000);
