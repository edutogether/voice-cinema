import { describe, expect, it } from 'vitest';
import { afterFailure, buildMail, dueGroups, MAX_ATTEMPTS, retryDelay, type MailItem } from './mailQueue';

const item = (over: Partial<MailItem>): MailItem => ({
  id: 'a', name: '민수', email: 'teacher@ice.go.kr', genreId: 'fantasy', genreName: '판타지', createdAt: 1, attempts: 0, nextAt: 0, failed: false, url: 'https://example.test/a.mp4', ...over,
});

describe('다시 보내는 간격', () => {
  it('30초에서 두 배씩 늘어 5분에서 멈춘다', () => {
    expect([1, 2, 3, 4, 5, 6, 7].map(retryDelay)).toEqual([30_000, 60_000, 120_000, 240_000, 300_000, 300_000, 300_000]);
  });
  it(`${MAX_ATTEMPTS}번 실패하면 «보내지 못함»으로 뺀다`, () => {
    expect(afterFailure({ attempts: MAX_ATTEMPTS - 2 }, 1000)).toEqual({ attempts: MAX_ATTEMPTS - 1, nextAt: 1000 + 300_000, failed: false });
    expect(afterFailure({ attempts: MAX_ATTEMPTS - 1 }, 1000).failed).toBe(true);
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

describe('buildMail', () => {
  const mail = buildMail([item({ name: '민수' }), item({ name: '별님', genreName: 'SF', url: 'https://example.test/b.mp4' })]);
  it('받는 사람은 한 명이고 건마다 이름 · 장르 · 링크가 있다', () => {
    expect(mail.to).toBe('teacher@ice.go.kr');
    expect(mail.body).toContain('· 민수 — 판타지\n  https://example.test/a.mp4');
    expect(mail.body).toContain('· 별님 — SF\n  https://example.test/b.mp4');
  });
  it('제목에 아동 이름이 없다', () => {
    expect(mail.subject).not.toContain('민수');
    expect(mail.subject).not.toContain('별님');
  });
  it('받을 수 있는 기한을 알린다', () => {
    expect(mail.body).toContain('2026년 11월 30일까지');
  });
});
