// GET /이 지금 배포된 커밋을 알려주는지 진짜 핸들러로 확인한다(2026-10-08).
//
// 매시 도는 배포 대조(.github/workflows/deploy.yml)가 이 값을 master 끝과 비교한다. 값이 빠지면
// 대조는 "확인 안 됨"으로 보고 매시간 다시 배포하게 되고, 값이 엉뚱하면 뒤처진 라이브를 못 알아챈다.
// 배포 잡은 DEPLOY_COMMIT을 functions/.env로 넘긴다.
import { test, expect, beforeAll, afterEach } from 'vitest';
import http from 'node:http';

const SHA = 'f'.repeat(40);

// index.js(firebase-admin·express)를 처음 불러오는 비용은 검사가 아니라 준비 단계에서 치른다. 평소 약 0.7초지만
// 2026-10-08 첫 실행에서 이 파일 전체가 14초 걸리며 두 검사가 모두 실패했다(다음부터 1.3초, 메시지는 못 남겼다).
// 두 검사가 그 불러오기를 기다리며 기본 제한 시간 5초를 넘긴 모양이다 — 그 비용을 검사 안에 두면 디스크·CPU가
// 바쁠 때 검사가 흔들린다. 값은 요청마다 읽으므로 미리 불러와도 된다.
let voiceCinema;
beforeAll(async () => {
  process.env.FUNCTIONS_EMULATOR = 'true';
  ({ voiceCinema } = await import('../index.js'));
}, 60000);

async function 읽기() {
  const server = http.createServer((req, res) => voiceCinema(req, res));
  await new Promise((resolve) => server.listen(0, '127.0.0.1', resolve));
  try {
    const r = await fetch(`http://127.0.0.1:${server.address().port}/`);
    return { status: r.status, body: await r.json() };
  } finally {
    await new Promise((resolve) => server.close(resolve));
  }
}

afterEach(() => { delete process.env.DEPLOY_COMMIT; });

test('배포 잡이 남긴 커밋을 그대로 알려준다', async () => {
  process.env.DEPLOY_COMMIT = SHA;
  const r = await 읽기();
  expect(r.status).toBe(200);
  expect(r.body).toEqual({ ok: true, service: 'inky-voice-cinema', commit: SHA });
});

test('표시가 없는 배포에서는 commit이 null이다 — 지어내지 않는다', async () => {
  const r = await 읽기();
  expect(r.body.ok).toBe(true);
  expect(r.body.commit).toBeNull();
});
