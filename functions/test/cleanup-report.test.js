// 자동삭제가 일부 실패하면 그 실행이 **실패로 끝나는지** 진짜 예약 함수로 본다(2026-10-05).
// 예전에는 실패한 삭제까지 "삭제 완료"로 세고 성공으로 끝났다.
import { test, expect, vi, beforeAll, beforeEach, afterEach } from 'vitest';

const 파일들 = vi.hoisted(() => ({ list: [] }));
vi.mock('firebase-admin/storage', () => ({
  getStorage: () => ({ bucket: () => ({ getFiles: async () => [파일들.list] }) }),
}));

const 파일 = (ok) => ({ name: ok ? 'dubs/ok.mp4' : 'dubs/bad.mp4', delete: () => (ok ? Promise.resolve() : Promise.reject(new Error('거부'))) });

// index.js(firebase-admin·express)를 처음 불러오는 비용은 검사가 아니라 준비 단계에서 치른다(2026-10-09). 첫 검사가 그
// 비용을 기본 제한 시간 5초 안에서 혼자 치르다가, 다른 검사 파일이 병렬로 CPU를 쓰는 동안 넘겨 흔들렸다 —
// "Test timed out in 5000ms"로 확인했다(app.md 흔들린 검사 기록). 기한 판정은 실행할 때의 Date를 읽으므로 미리 불러와도 된다.
let cleanupAfterCutoff;
beforeAll(async () => {
  process.env.FUNCTIONS_EMULATOR = 'true';
  ({ cleanupAfterCutoff } = await import('../index.js'));
}, 60000);

beforeEach(() => { vi.useFakeTimers({ toFake: ['Date'] }); vi.setSystemTime(new Date('2026-12-01T00:00:05+09:00')); });
afterEach(() => vi.useRealTimers());

test('하나라도 못 지우면 실행이 실패로 끝난다', async () => {
  파일들.list = [파일(true), 파일(false), 파일(true)];
  await expect(cleanupAfterCutoff.run({})).rejects.toThrow('1개 삭제 실패');
});

test('전부 지우면 성공으로 끝난다', async () => {
  파일들.list = [파일(true), 파일(true)];
  await expect(cleanupAfterCutoff.run({})).resolves.toBeUndefined();
});

test('기한 전에는 아무것도 지우지 않는다', async () => {
  vi.setSystemTime(new Date('2026-11-30T23:59:59+09:00'));
  let 불림 = 0;
  파일들.list = [{ name: 'dubs/x.mp4', delete: async () => { 불림++; } }];
  await cleanupAfterCutoff.run({});
  expect(불림).toBe(0);
});
