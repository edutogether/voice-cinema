// 현장 의견 받기의 순수 규칙(2026-11-08, Poster Studio와 같은 여섯 칸) — 검사 · 닫힘 시각 · 카카오 글 · 90일 정리 · 매일 정리.
import { test, expect, vi, afterEach } from 'vitest';
import {
  validateFeedback,
  isFeedbackClosed,
  feedbackMemo,
  cleanupOldFeedback,
  dailyMaintenance,
  FEEDBACK_CLOSE_AT,
  FEEDBACK_TTL_MS,
  NAME_MAX,
  TEXT_MAX,
} from '../feedback.js';

afterEach(() => vi.restoreAllMocks());

const 맞는것 = () => ({ name: '김선생', text: '녹음 단추가 잘 안 보여요.', version: 'main-BFrkAMTb.js', screen: '2560x1305@1', device: 'pc', step: 1 });

test('맞는 여섯 칸이면 저장할 값을 돌려준다', () => {
  expect(validateFeedback(맞는것())).toEqual(맞는것());
});

test('칸이 하나라도 빠지거나 더 있으면 거절한다(사진 · 영화 · 웹/설치판 칸은 받지 않는다)', () => {
  const 빠짐 = 맞는것();
  delete 빠짐.step;
  expect(validateFeedback(빠짐)).toBeNull();
  expect(validateFeedback({ ...맞는것(), app: 'web' })).toBeNull();
  expect(validateFeedback({ ...맞는것(), url: 'https://x' })).toBeNull();
  for (const v of [null, undefined, 'x', 3, [], [맞는것()]]) expect(validateFeedback(v)).toBeNull();
});

test('이름: 비면 거절, 40자까지(이모지 하나 = 1자), 제어 문자 · 서식 문자는 공백으로 접는다', () => {
  expect(validateFeedback({ ...맞는것(), name: '  \n ' })).toBeNull();
  expect(validateFeedback({ ...맞는것(), name: '가'.repeat(NAME_MAX) })?.name).toHaveLength(NAME_MAX);
  expect(validateFeedback({ ...맞는것(), name: '가'.repeat(NAME_MAX + 1) })).toBeNull();
  expect(validateFeedback({ ...맞는것(), name: '😀'.repeat(NAME_MAX) })).not.toBeNull();
  expect(validateFeedback({ ...맞는것(), name: '김\u0000선​생\n님' })?.name).toBe('김 선 생 님');
  expect(NAME_MAX).toBe(40);
});

test('의견: 비면 거절, 500자까지, 줄바꿈은 남기고 빈 줄은 두 줄까지', () => {
  expect(validateFeedback({ ...맞는것(), text: ' \n\t ' })).toBeNull();
  expect(validateFeedback({ ...맞는것(), text: '가'.repeat(TEXT_MAX) })).not.toBeNull();
  expect(validateFeedback({ ...맞는것(), text: '가'.repeat(TEXT_MAX + 1) })).toBeNull();
  expect(validateFeedback({ ...맞는것(), text: '첫 줄\r\n\n\n\n\n둘째\u0007 줄' })?.text).toBe('첫 줄\n\n\n둘째 줄');
  expect(TEXT_MAX).toBe(500);
});

test('판 번호 · 화면 크기 · 기기 · 단계는 정해진 모양만 받는다', () => {
  expect(validateFeedback({ ...맞는것(), version: 'unknown' })).not.toBeNull();
  expect(validateFeedback({ ...맞는것(), version: '<script>' })).toBeNull();
  expect(validateFeedback({ ...맞는것(), version: 'a'.repeat(81) })).toBeNull();
  expect(validateFeedback({ ...맞는것(), screen: '390x844@3' })).not.toBeNull();
  expect(validateFeedback({ ...맞는것(), screen: '1280x587@1.5' })).not.toBeNull();
  expect(validateFeedback({ ...맞는것(), screen: '390x844' })).toBeNull();
  for (const device of ['pc', 'tablet', 'phone', 'none', 'unknown']) expect(validateFeedback({ ...맞는것(), device })).not.toBeNull();
  expect(validateFeedback({ ...맞는것(), device: 'installer' })).toBeNull();
  for (const step of [1, 2, 3]) expect(validateFeedback({ ...맞는것(), step })).not.toBeNull();
  for (const step of [0, 4, 1.5, '1']) expect(validateFeedback({ ...맞는것(), step })).toBeNull();
  expect(validateFeedback({ ...맞는것(), name: 7 })).toBeNull();
});

test('닫힘: 한국 시간 2026-11-14 00:00부터 받지 않는다(1초 전까지는 받는다)', () => {
  expect(FEEDBACK_CLOSE_AT.getTime()).toBe(Date.parse('2026-11-14T00:00:00+09:00'));
  expect(isFeedbackClosed(Date.parse('2026-11-13T23:59:59+09:00'))).toBe(false);
  expect(isFeedbackClosed(Date.parse('2026-11-14T00:00:00+09:00'))).toBe(true);
});

test('카카오 글: 첫머리가 «[Voice Cinema 의견] 이름»이고 판 · 화면 · 기기 · 단계가 끝줄에 붙는다', () => {
  expect(feedbackMemo(맞는것())).toBe('[Voice Cinema 의견] 김선생\n녹음 단추가 잘 안 보여요.\n— 판 main-BFrkAMTb.js · 2560x1305@1 · pc · 1단계');
});

// Firestore와 같은 모양(collection/where/limit/get/batch)의 가짜 — createdAt 기준으로 고른다
function 가짜db(문서들) {
  const 남은 = new Map(문서들.map((d, i) => [`d${i}`, d]));
  const 지운요청 = [];
  return {
    남은,
    지운요청,
    collection(이름) {
      expect(이름).toBe('feedback');
      return {
        where(필드, 연산, 값) {
          expect([필드, 연산]).toEqual(['createdAt', '<']);
          return {
            limit: (n) => ({
              get: async () => {
                const docs = [...남은].filter(([, d]) => d.createdAt < 값).slice(0, n).map(([id]) => ({ ref: id }));
                return { empty: docs.length === 0, size: docs.length, docs };
              },
            }),
          };
        },
      };
    },
    batch() {
      const 이번 = [];
      return { delete: (ref) => 이번.push(ref), commit: async () => { 지운요청.push(이번.length); 이번.forEach((id) => 남은.delete(id)); } };
    },
  };
}

test('90일 정리: 받은 지 90일이 지난 것만 지우고, 500건씩 나눠 지운다', async () => {
  const now = Date.parse('2027-02-12T04:00:00+09:00');
  const 오래된 = Array.from({ length: 1203 }, () => ({ createdAt: new Date(now - FEEDBACK_TTL_MS - 1) }));
  const 새것 = [{ createdAt: new Date(now - FEEDBACK_TTL_MS + 1000) }, { createdAt: new Date(now) }];
  const db = 가짜db([...오래된, ...새것]);
  expect(await cleanupOldFeedback(db, now)).toBe(1203);
  expect(db.지운요청).toEqual([500, 500, 203]);
  expect([...db.남은.values()]).toEqual(새것);
  expect(FEEDBACK_TTL_MS).toBe(90 * 24 * 60 * 60 * 1000);
});

test('매일 정리: 두 일이 서로 막지 않고, 하나라도 실패하면 실행이 실패로 끝난다', async () => {
  vi.spyOn(console, 'log').mockImplementation(() => {});
  vi.spyOn(console, 'error').mockImplementation(() => {});
  const 불림 = [];
  const 됨 = (이름, 값) => async () => { 불림.push(이름); return 값; };
  const 안됨 = (이름) => async () => { 불림.push(이름); throw new Error('거부'); };

  await expect(dailyMaintenance({ feedback: 됨('정리', 3), kakao: 됨('카카오', { userId: '1' }) })).resolves.toBeUndefined();
  await expect(dailyMaintenance({ feedback: 됨('정리', 0), kakao: 됨('카카오', null) })).resolves.toBeUndefined();
  await expect(dailyMaintenance({ feedback: 안됨('정리'), kakao: 됨('카카오', null) })).rejects.toThrow('의견 정리 실패');
  await expect(dailyMaintenance({ feedback: 됨('정리', 0), kakao: 안됨('카카오') })).rejects.toThrow('카카오 토큰 갱신 실패');
  expect(불림).toEqual(['정리', '카카오', '정리', '카카오', '정리', '카카오', '정리', '카카오']);
});
