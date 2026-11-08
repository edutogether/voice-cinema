// 행사 주간 서버 예열(2026-11-09) — 언제 부르고 언제 멈추는지, 실패해도 실행이 죽지 않는지, 실제로 배포되는 예약이 그 값인지 본다.
import { test, expect, beforeAll, vi, afterEach } from 'vitest';
import { keepWarmPing, KEEP_WARM_SCHEDULE, KEEP_WARM_URL, KEEP_WARM_UNTIL } from '../keepWarm.js';

afterEach(() => vi.restoreAllMocks());

const at = (iso) => new Date(iso);

test('행사 주간에는 GET /을 한 번 부르고 상태를 남긴다', async () => {
  const log = vi.spyOn(console, 'log').mockImplementation(() => {});
  const fetchImpl = vi.fn(async () => ({ status: 200 }));
  expect(await keepWarmPing(at('2026-11-14T18:55:00+09:00'), fetchImpl)).toBe(200);
  expect(fetchImpl).toHaveBeenCalledTimes(1);
  expect(fetchImpl.mock.calls[0][0]).toBe(KEEP_WARM_URL);
  expect(fetchImpl.mock.calls[0][1].signal).toBeInstanceOf(AbortSignal);
  expect(log).toHaveBeenCalledWith('[keepWarm] ping', 200);
});

test('11/15 00:00(KST)부터는 깨어나도 아무것도 부르지 않는다 — 1초 전에는 부른다', async () => {
  vi.spyOn(console, 'log').mockImplementation(() => {});
  const fetchImpl = vi.fn(async () => ({ status: 200 }));
  expect(await keepWarmPing(at('2026-11-14T23:59:59+09:00'), fetchImpl)).toBe(200);
  expect(await keepWarmPing(KEEP_WARM_UNTIL, fetchImpl)).toBe('skipped');
  expect(await keepWarmPing(at('2027-11-09T09:00:00+09:00'), fetchImpl)).toBe('skipped');
  expect(fetchImpl).toHaveBeenCalledTimes(1);
});

test('부르기가 실패해도 실행을 실패로 끝내지 않는다', async () => {
  const warn = vi.spyOn(console, 'warn').mockImplementation(() => {});
  const fetchImpl = vi.fn(async () => { throw Object.assign(new Error('x'), { name: 'TimeoutError' }); });
  expect(await keepWarmPing(at('2026-11-10T10:00:00+09:00'), fetchImpl)).toBe('failed');
  expect(warn).toHaveBeenCalledWith('[keepWarm] ping 실패:', 'TimeoutError');
});

test('부르는 주소는 이 프로젝트의 voiceCinema 함수 GET /이다 — 인증 없이 가벼운 자리', () => {
  expect(KEEP_WARM_URL).toBe('https://asia-northeast3-inky-voice-cinema.cloudfunctions.net/voiceCinema/');
});

// index.js(firebase-admin·express)를 불러오는 비용은 준비 단계에서 치른다(health-commit.test.js와 같은 이유).
let keepWarm, voiceCinema;
beforeAll(async () => {
  process.env.FUNCTIONS_EMULATOR = 'true';
  ({ keepWarm, voiceCinema } = await import('../index.js'));
}, 60000);

test('배포되는 예약은 11/9~11/14 9~18시(서울) 5분마다다', () => {
  expect(KEEP_WARM_SCHEDULE).toBe('*/5 9-18 9-14 11 *');
  expect(keepWarm.__endpoint.scheduleTrigger.schedule).toBe(KEEP_WARM_SCHEDULE);
  expect(keepWarm.__endpoint.scheduleTrigger.timeZone).toBe('Asia/Seoul');
  expect(keepWarm.__endpoint.region).toEqual(['asia-northeast3']);
});

test('예열은 최소 인스턴스 없이 한다 — 쉬는 동안에도 돈이 드는 길이다', () => {
  // 값을 주지 않으면 firebase-functions는 숫자가 아닌 «기본값으로 되돌림» 표시를 둔다(배포하면 0)
  for (const fn of [voiceCinema, keepWarm]) expect(typeof fn.__endpoint.minInstances).not.toBe('number');
});
