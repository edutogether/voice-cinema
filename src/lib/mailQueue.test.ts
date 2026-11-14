import { describe, expect, it } from 'vitest';
import { afterFailure, dueGroups, MAIL_BATCH, MAX_ATTEMPTS, retryDelay, type MailItem } from './mailQueue';

const item = (over: Partial<MailItem>): MailItem => ({
  id: 'a', name: '민수', email: 'teacher@ice.go.kr', genreId: 'fantasy', genreName: '판타지', createdAt: 1, attempts: 0, nextAt: 0, failed: false, url: 'https://example.test/a.mp4', ...over,
});

describe('다시 보내는 간격', () => {
  it('30초에서 두 배씩 늘어 5분에서 멈춘다', () => {
    expect([1, 2, 3, 4, 5, 6, 7].map(retryDelay)).toEqual([30_000, 60_000, 120_000, 240_000, 300_000, 300_000, 300_000]);
  });
  it(`서버가 ${MAX_ATTEMPTS}번 거절(4xx)하면 «보내지 못함»으로 뺀다`, () => {
    expect(afterFailure({ attempts: MAX_ATTEMPTS - 2, rejections: MAX_ATTEMPTS - 2 }, 1000, true)).toEqual({ attempts: MAX_ATTEMPTS - 1, rejections: MAX_ATTEMPTS - 1, nextAt: 1000 + 300_000, failed: false });
    expect(afterFailure({ attempts: MAX_ATTEMPTS - 1, rejections: MAX_ATTEMPTS - 1 }, 1000, true).failed).toBe(true);
  });
  it('연결 실패 · 시간 초과 · 5xx는 몇 번이든 «보내지 못함»이 되지 않고 5분마다 다시 보낸다', () => {
    expect(afterFailure({ attempts: 100 }, 1000, false)).toEqual({ attempts: 101, rejections: 0, nextAt: 1000 + 300_000, failed: false });
  });
  it('거절 횟수만 센다 — 연결 실패가 앞에 몇 번 있었어도 첫 거절에서 빼지 않는다', () => {
    expect(afterFailure({ attempts: 20, rejections: 0 }, 1000, true)).toMatchObject({ rejections: 1, failed: false });
    expect(afterFailure({ attempts: 20, rejections: MAX_ATTEMPTS - 1 }, 1000, true).failed).toBe(true);
  });
});

describe('dueGroups', () => {
  it('같은 교사는 대소문자 · 공백이 달라도 한 묶음이고, 다른 교사는 따로다', () => {
    const groups = dueGroups([item({ id: 'a' }), item({ id: 'b', email: ' Teacher@ICE.go.kr' }), item({ id: 'c', email: 'other@naver.com' })], 10);
    expect(groups.map((g) => g.map((i) => i.id))).toEqual([['a', 'b'], ['c']]);
  });
  it('기다리는 중이거나 «보내지 못함»인 건은 뺀다', () => {
    const groups = dueGroups([item({ id: 'a', nextAt: 11 }), item({ id: 'b', failed: true }), item({ id: 'c', nextAt: 10 })], 10);
    expect(groups.map((g) => g.map((i) => i.id))).toEqual([['c']]);
  });
  it(`한 교사에게 ${MAIL_BATCH}편을 넘으면 ${MAIL_BATCH}편씩 나눠 보낸다(서버는 한 통에 ${MAIL_BATCH}편까지 받는다)`, () => {
    const many = Array.from({ length: MAIL_BATCH * 2 + 1 }, (_, n) => item({ id: `m${n}` }));
    const groups = dueGroups([...many, item({ id: 'x', email: 'other@naver.com' })], 10);
    expect(groups.map((g) => g.length)).toEqual([MAIL_BATCH, MAIL_BATCH, 1, 1]);
    expect(groups.slice(0, 3).flat().map((i) => i.id)).toEqual(many.map((i) => i.id));
  });
});
