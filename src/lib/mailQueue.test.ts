import { describe, expect, it } from 'vitest';
import { afterFailure, batchStatus, dueGroups, MAX_ATTEMPTS, retryDelay, type MailItem } from './mailQueue';

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
});

describe('batchStatus — 설치판 시작 창 한 묶음', () => {
  it('목록에서 사라진 건은 보낸 것, 다음 차례를 기다리거나 «보내지 못함»이면 못 보낸 것, 나머지는 아직 보내 보지 않은 것이다', () => {
    const items = [
      item({ id: 'b', nextAt: 0, url: undefined }),
      item({ id: 'c', nextAt: 0 }),
      item({ id: 'd', nextAt: 31_000, url: undefined }),
      item({ id: 'e', failed: true }),
      item({ id: 'x' }), // 묶음 밖(창을 띄운 뒤에 생긴 건)은 세지 않는다
    ];
    expect(batchStatus(['a', 'b', 'c', 'd', 'e'], items)).toEqual({ total: 5, sent: 1, uploaded: 2, failed: 2, pending: 2 });
  });
  it('다 보내면 남은 것도 못 보낸 것도 없다', () => {
    expect(batchStatus(['a', 'b'], [item({ id: 'x' })])).toEqual({ total: 2, sent: 2, uploaded: 0, failed: 0, pending: 0 });
  });
});
