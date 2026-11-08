// 메일 전달 서버 규칙(functions/mail.js) — 검사 · 내용 · Resend 요청 모양 · 오류 처리(2026-11-08).
import { test, expect } from 'vitest';
import { validateMailRequest, buildMailMessage, mailIdempotencyKey, sendViaResend, MAIL_FROM, MAIL_REPLY_TO, MAIL_SUBJECT, RESEND_URL, MAX_ITEMS, NAME_MAX, GENRE_NAMES } from '../mail.js';
import { GENRE_IDS } from '../validate.js';

const BUCKET = 'inky-voice-cinema.firebasestorage.app';
const link = (genre = 'fantasy', random = 'abcdefabcdefabcdef') => `https://storage.googleapis.com/${BUCKET}/dubs/dub_${genre}_1762560000000_${random}.mp4`;
const body = (patch = {}) => ({ to: 'teacher@ice.go.kr', items: [{ name: '민준', url: link() }], ...patch });

test('맞는 요청은 주소를 다듬고, 링크에서 장르 이름을 서버가 정한다', () => {
  const r = validateMailRequest(body({ to: '  teacher@ice.go.kr  ', items: [{ name: ' 민준 ', url: link('hero') }, { name: '별', url: link('dub', '0123456789abcdef01') }] }), BUCKET);
  expect(r).toEqual({
    ok: true,
    to: 'teacher@ice.go.kr',
    items: [
      { name: '민준', url: link('hero'), object: 'dub_hero_1762560000000_abcdefabcdefabcdef.mp4', genre: '히어로' },
      { name: '별', url: link('dub', '0123456789abcdef01'), object: 'dub_dub_1762560000000_0123456789abcdef01.mp4', genre: null },
    ],
  });
});

test('장르 이름표는 서버 장르 목록과 같은 장르를 덮는다', () => {
  expect(Object.keys(GENRE_NAMES).sort()).toEqual([...GENRE_IDS].sort());
});

test.each([
  ['주소 없음', { to: '' }],
  ['주소가 문자열이 아님', { to: ['a@b.kr'] }],
  ['@ 없음', { to: 'teacher' }],
  ['도메인 점 없음', { to: 'teacher@school' }],
  ['한글 주소', { to: '선생님@school.kr' }],
  ['주소 두 개', { to: 'a@b.kr,c@d.kr' }],
  ['이름 붙은 주소', { to: 'X <a@b.kr>' }],
  ['줄바꿈', { to: 'a@b.kr\nBcc: c@d.kr' }],
  ['너무 긴 주소', { to: `${'a'.repeat(250)}@b.kr` }],
])('메일 주소: %s → 거절, 오류 문구에 받은 값을 넣지 않는다', (_, patch) => {
  const r = validateMailRequest(body(patch), BUCKET);
  expect(r).toEqual({ ok: false, error: '메일 주소가 올바르지 않습니다.' });
});

test.each([
  ['목록 없음', { items: undefined }, '영화 목록이 올바르지 않습니다.'],
  ['빈 목록', { items: [] }, '영화 목록이 올바르지 않습니다.'],
  ['너무 많음', { items: Array.from({ length: MAX_ITEMS + 1 }, (_, i) => ({ name: 'a', url: link('sf', i.toString(16).padStart(18, '0')) })) }, '영화 목록이 올바르지 않습니다.'],
  ['빈 이름', { items: [{ name: '  ', url: link() }] }, '이름이 올바르지 않습니다.'],
  ['긴 이름', { items: [{ name: '가'.repeat(NAME_MAX + 1), url: link() }] }, '이름이 올바르지 않습니다.'],
  ['이름에 줄바꿈', { items: [{ name: '민준\n· 가짜 줄', url: link() }] }, '이름이 올바르지 않습니다.'],
  ['다른 버킷', { items: [{ name: '민준', url: link().replace(BUCKET, 'other-bucket') }] }, '영화 링크가 올바르지 않습니다.'],
  ['다른 사이트', { items: [{ name: '민준', url: 'https://evil.example/dub_fantasy_1762560000000_abcdefabcdefabcdef.mp4' }] }, '영화 링크가 올바르지 않습니다.'],
  ['dubs 밖', { items: [{ name: '민준', url: `https://storage.googleapis.com/${BUCKET}/other/dub_fantasy_1762560000000_abcdefabcdefabcdef.mp4` }] }, '영화 링크가 올바르지 않습니다.'],
  ['경로 넘기', { items: [{ name: '민준', url: `https://storage.googleapis.com/${BUCKET}/dubs/../x/dub_fantasy_1762560000000_abcdefabcdefabcdef.mp4` }] }, '영화 링크가 올바르지 않습니다.'],
  ['업로드 이름 모양 아님', { items: [{ name: '민준', url: `https://storage.googleapis.com/${BUCKET}/dubs/movie.mp4` }] }, '영화 링크가 올바르지 않습니다.'],
  ['뒤에 쿼리', { items: [{ name: '민준', url: `${link()}?x=1` }] }, '영화 링크가 올바르지 않습니다.'],
  ['같은 영화 두 번', { items: [{ name: '민준', url: link() }, { name: '서연', url: link() }] }, '같은 영화가 두 번 들어 있습니다.'],
])('영화 목록: %s → 거절', (_, patch, error) => {
  expect(validateMailRequest(body(patch), BUCKET)).toEqual({ ok: false, error });
});

test('메일 내용: 정한 틀 · 받는 사람 하나 · 제목에 아동 이름 없음 · 장르 없는 영화는 이름만', () => {
  const r = validateMailRequest(body({ items: [{ name: '민준', url: link('sports') }, { name: '별', url: link('dub', '0123456789abcdef01') }] }), BUCKET);
  const m = buildMailMessage(r.to, r.items);
  expect(m.from).toBe(MAIL_FROM);
  expect(m.to).toEqual(['teacher@ice.go.kr']);
  expect(m.subject).toBe(MAIL_SUBJECT);
  expect(m.subject).not.toContain('민준');
  expect(m.text).toContain(`· 민준 — 스포츠\n  ${link('sports')}`);
  expect(m.text).toContain(`· 별\n  ${link('dub', '0123456789abcdef01')}`);
  expect(m.text).toContain('2026년 11월 30일까지');
  // 답장은 행사 공용 메일로 간다(11/8 Bumm님) — 본문도 «보내기 전용»이 아니라 답장을 받는다고 적는다
  expect(m.reply_to).toBe(MAIL_REPLY_TO);
  expect(MAIL_REPLY_TO).toBe('edutogether2015@gmail.com');
  expect(m.text).toContain('이 메일에 답장해 주세요');
  expect(m.text).not.toContain('보내기 전용');
  expect(Object.keys(m).sort()).toEqual(['from', 'reply_to', 'subject', 'text', 'to']);
});

test('같은 내용이면 같은 열쇠, 영화가 하나 달라지면 다른 열쇠(256자 안)', () => {
  const r = validateMailRequest(body(), BUCKET);
  const a = mailIdempotencyKey(buildMailMessage(r.to, r.items));
  expect(mailIdempotencyKey(buildMailMessage(r.to, r.items))).toBe(a);
  const r2 = validateMailRequest(body({ items: [{ name: '민준', url: link('sf') }] }), BUCKET);
  expect(mailIdempotencyKey(buildMailMessage(r2.to, r2.items))).not.toBe(a);
  expect(a.length).toBeLessThanOrEqual(256);
  expect(a).not.toContain('teacher');
});

const message = () => { const r = validateMailRequest(body(), BUCKET); return buildMailMessage(r.to, r.items); };
const reply = (status, json) => async () => new Response(json === undefined ? 'not json' : JSON.stringify(json), { status });

test('Resend 요청 모양: POST · Bearer 키 · User-Agent · 같은 메일 열쇠 · 본문은 메일 그대로', async () => {
  const calls = [];
  const r = await sendViaResend({ apiKey: 're_test', message: message(), fetchImpl: async (url, init) => { calls.push({ url, init }); return new Response('{"id":"abc-1"}', { status: 200 }); } });
  expect(r).toEqual({ ok: true, id: 'abc-1' });
  expect(calls).toHaveLength(1);
  const { url, init } = calls[0];
  expect(url).toBe(RESEND_URL);
  expect(init.method).toBe('POST');
  expect(init.headers.Authorization).toBe('Bearer re_test');
  expect(init.headers['Content-Type']).toBe('application/json');
  expect(init.headers['User-Agent']).toMatch(/\S/);
  expect(init.headers['Idempotency-Key']).toBe(mailIdempotencyKey(message()));
  expect(JSON.parse(init.body)).toEqual(message());
  expect(init.signal).toBeInstanceOf(AbortSignal);
});

test.each([
  [429, { name: 'rate_limit_exceeded', message: 'Too many requests' }, { ok: false, status: 429, name: 'rate_limit_exceeded', retry: true }],
  [429, { name: 'daily_quota_exceeded' }, { ok: false, status: 429, name: 'daily_quota_exceeded', retry: true }],
  [500, { name: 'application_error' }, { ok: false, status: 500, name: 'application_error', retry: true }],
  [503, undefined, { ok: false, status: 503, name: 'unknown', retry: true }],
  [409, { name: 'concurrent_idempotent_requests' }, { ok: false, status: 409, name: 'concurrent_idempotent_requests', retry: true }],
  [409, { name: 'invalid_idempotent_request' }, { ok: false, status: 409, name: 'invalid_idempotent_request', retry: false }],
  [403, { name: 'validation_error', message: 'You can only send testing emails to your own email address (teacher@ice.go.kr).' }, { ok: false, status: 403, name: 'validation_error', retry: false }],
  [422, { name: 'invalid_parameter' }, { ok: false, status: 422, name: 'invalid_parameter', retry: false }],
  [200, {}, { ok: false, status: 200, name: 'unknown', retry: false }],
  [400, { name: 'Bad name with teacher@ice.go.kr' }, { ok: false, status: 400, name: 'unknown', retry: false }],
])('Resend 응답 %i → 결과에 오류 이름만, 주소 · 문구는 담지 않는다', async (status, json, expected) => {
  const r = await sendViaResend({ apiKey: 're_test', message: message(), fetchImpl: reply(status, json) });
  expect(r).toEqual(expected);
  expect(JSON.stringify(r)).not.toContain('teacher');
});

test('연결이 안 되거나 시간이 지나면 다시 보낼 실패로 돌려준다', async () => {
  expect(await sendViaResend({ apiKey: 'k', message: message(), fetchImpl: async () => { throw new TypeError('fetch failed'); } }))
    .toEqual({ ok: false, status: 0, name: 'network_error', retry: true });
  const slow = (url, init) => new Promise((_, reject) => init.signal.addEventListener('abort', () => reject(init.signal.reason)));
  expect(await sendViaResend({ apiKey: 'k', message: message(), fetchImpl: slow, timeoutMs: 20 }))
    .toEqual({ ok: false, status: 0, name: 'timeout', retry: true });
});
