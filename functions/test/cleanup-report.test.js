// 자동삭제가 일부 실패하면 그 실행이 **실패로 끝나는지** 진짜 예약 함수로 본다(2026-10-05).
// 예전에는 실패한 삭제까지 "삭제 완료"로 세고 성공으로 끝났다.
import { test, expect, vi, beforeEach, afterEach } from 'vitest';

const 파일들 = vi.hoisted(() => ({ list: [] }));
vi.mock('firebase-admin/storage', () => ({
  getStorage: () => ({ bucket: () => ({ getFiles: async () => [파일들.list] }) }),
}));

const 파일 = (ok) => ({ name: ok ? 'dubs/ok.mp4' : 'dubs/bad.mp4', delete: () => (ok ? Promise.resolve() : Promise.reject(new Error('거부'))) });

beforeEach(() => { vi.useFakeTimers({ toFake: ['Date'] }); vi.setSystemTime(new Date('2026-12-01T00:00:05+09:00')); });
afterEach(() => vi.useRealTimers());

test('하나라도 못 지우면 실행이 실패로 끝난다', async () => {
  process.env.FUNCTIONS_EMULATOR = 'true';
  const { cleanupAfterCutoff } = await import('../index.js');
  파일들.list = [파일(true), 파일(false), 파일(true)];
  await expect(cleanupAfterCutoff.run({})).rejects.toThrow('1개 삭제 실패');
});

test('전부 지우면 성공으로 끝난다', async () => {
  const { cleanupAfterCutoff } = await import('../index.js');
  파일들.list = [파일(true), 파일(true)];
  await expect(cleanupAfterCutoff.run({})).resolves.toBeUndefined();
});

test('기한 전에는 아무것도 지우지 않는다', async () => {
  vi.setSystemTime(new Date('2026-11-30T23:59:59+09:00'));
  const { cleanupAfterCutoff } = await import('../index.js');
  let 불림 = 0;
  파일들.list = [{ name: 'dubs/x.mp4', delete: async () => { 불림++; } }];
  await cleanupAfterCutoff.run({});
  expect(불림).toBe(0);
});
