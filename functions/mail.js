// 설치판 메일 전달의 서버 쪽 규칙 — Firebase/Express에 의존하지 않아 배포 없이 시험한다(validate.js와 같은 방식).
// 인터넷이 끊겨 QR을 만들지 못한 영화를, 인터넷이 돌아온 뒤 인솔 선생님 메일로 보낸다(2026-11-08 Bumm님).
// 🔴 메일 주소 · 이름을 로그에 넣지 않는다 — 이 파일의 함수는 그 값을 담은 오류 문구를 만들지 않는다.
import crypto from 'crypto';
import { GENRE_IDS } from './validate.js';

export const MAIL_FROM = 'Voice Cinema <voice-cinema@edutogether.kr>';
export const MAIL_SUBJECT = '[제4회 인천어린이청소년영화제] Voice Cinema 완성 영화 안내';
// 화면 입력 칸과 같은 값이다(src/lib/mailAddress.ts — 계약 시험이 대조한다)
export const MAIL_MAX = 254;
export const NAME_MAX = 40;
// 한 선생님에게 한 통으로 묶는 영화 수의 상한 — 부스 하루에 한 학교가 이보다 많이 올 일이 없다
export const MAX_ITEMS = 30;
export const RESEND_URL = 'https://api.resend.com/emails';
const RESEND_TIMEOUT_MS = 15000;

// 메일에 적는 장르 이름 — src/genres.ts의 name과 같아야 한다(계약 시험이 대조한다)
export const GENRE_NAMES = {
  sf: 'SF', fantasy: '판타지', animation: '애니메이션', hero: '히어로',
  thriller: '스릴러', drama: '드라마', sports: '스포츠', musical: '뮤지컬',
};

// 업로드가 정한 저장 이름만 받는다(buildServerFilename: dub_<장르>_<시각>_<난수 18자>.mp4)
const OBJECT_NAME = /^dub_([a-z]+)_\d{13}_[0-9a-f]{18}\.mp4$/;
// 화면 입력 칸과 같은 모양 검사 + 영문만(한/영 오타는 화면이 먼저 막는다). 주소 하나만 받는다 — 쉼표 · 꺾쇠 · 공백이 들어갈 수 없다
export const MAIL_PATTERN = /^[A-Za-z0-9.!#$%&'*+/=?^_`{|}~-]+@[A-Za-z0-9-]+(\.[A-Za-z0-9-]+)+$/;
// 줄바꿈 · 제어 문자는 이름에 넣지 않는다(메일 본문의 줄을 지어낼 수 없게)
const CONTROL = /[\p{Cc}\u2028\u2029]/u;

/**
 * 요청 본문 { to, items: [{ name, url }] }을 검사한다. 링크는 이 버킷의 dubs/ 아래 업로드 이름이어야 한다.
 * 성공 { ok: true, to, items: [{ name, url, object, genre }] }, 실패 { ok: false, error } — 오류 문구에 받은 값을 넣지 않는다.
 */
export function validateMailRequest(body, bucketName) {
  const { to, items } = body || {};
  const mail = typeof to === 'string' ? to.trim() : '';
  if (!mail || mail.length > MAIL_MAX || !MAIL_PATTERN.test(mail)) return { ok: false, error: '메일 주소가 올바르지 않습니다.' };
  if (!Array.isArray(items) || items.length === 0 || items.length > MAX_ITEMS) return { ok: false, error: '영화 목록이 올바르지 않습니다.' };
  const prefix = `https://storage.googleapis.com/${bucketName}/dubs/`;
  const seen = new Set();
  const checked = [];
  for (const item of items) {
    const name = typeof item?.name === 'string' ? item.name.trim() : '';
    if (!name || name.length > NAME_MAX || CONTROL.test(name)) return { ok: false, error: '이름이 올바르지 않습니다.' };
    const url = typeof item?.url === 'string' ? item.url : '';
    const object = url.startsWith(prefix) ? url.slice(prefix.length) : '';
    const m = OBJECT_NAME.exec(object);
    if (!m) return { ok: false, error: '영화 링크가 올바르지 않습니다.' };
    if (seen.has(object)) return { ok: false, error: '같은 영화가 두 번 들어 있습니다.' };
    seen.add(object);
    checked.push({ name, url, object, genre: GENRE_IDS.has(m[1]) ? GENRE_NAMES[m[1]] : null });
  }
  return { ok: true, to: mail, items: checked };
}

/** 메일 내용은 서버가 정한 틀로만 만든다. 제목에는 아동 이름을 넣지 않는다. 링크는 QR과 같은 주소이고 2026-12-01 00:00에 서버가 지운다. */
export function buildMailMessage(to, items) {
  const lines = items.map((item) => `· ${item.name}${item.genre ? ` — ${item.genre}` : ''}\n  ${item.url}`);
  return {
    from: MAIL_FROM,
    to: [to],
    subject: MAIL_SUBJECT,
    text: [
      '선생님, 안녕하세요.',
      '제4회 인천어린이청소년영화제 Voice Cinema 부스에서 학생들이 만든 영화를 보내 드립니다.',
      '',
      ...lines,
      '',
      '아래 내용을 확인해 주세요.',
      '· 링크는 2026년 11월 30일까지 열리고, 그 뒤에는 자동으로 지워집니다.',
      '· 링크를 아는 사람은 누구나 볼 수 있으니 해당 학생에게만 전해 주세요.',
      '· 이 메일은 보내기 전용입니다.',
    ].join('\n'),
  };
}

/**
 * 같은 메일을 다시 보내도 한 통만 가게 하는 열쇠(Resend는 24시간 기억한다).
 * 서버가 보냈는데 응답이 설치판에 닿지 않아 다시 보내는 경우를 막는다. 내용이 같으면 열쇠도 같다 — 다르면 Resend가 409로 거절한다.
 */
export function mailIdempotencyKey(message) {
  return 'vc-mail-' + crypto.createHash('sha256').update(JSON.stringify([message.to, message.subject, message.text])).digest('hex');
}

/**
 * Resend로 한 통을 보낸다. 성공 { ok: true, id }, 실패 { ok: false, status, name, retry }.
 * name은 Resend의 오류 이름(validation_error 등)만 담는다 — 오류 문구(message)에는 받는 주소가 들어갈 수 있어 읽지 않는다.
 */
export async function sendViaResend({ apiKey, message, fetchImpl = fetch, timeoutMs = RESEND_TIMEOUT_MS }) {
  let resp;
  try {
    resp = await fetchImpl(RESEND_URL, {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${apiKey}`,
        'Content-Type': 'application/json',
        // Resend는 User-Agent가 없으면 403으로 거절한다(API 문서 «User-Agent»)
        'User-Agent': 'voice-cinema-functions/1.0',
        'Idempotency-Key': mailIdempotencyKey(message),
      },
      body: JSON.stringify(message),
      signal: AbortSignal.timeout(timeoutMs),
    });
  } catch (e) {
    return { ok: false, status: 0, name: e?.name === 'TimeoutError' ? 'timeout' : 'network_error', retry: true };
  }
  let json = null;
  try { json = await resp.json(); } catch { /* 본문이 JSON이 아니면 이름 없이 상태만 본다 */ }
  if (resp.ok && typeof json?.id === 'string') return { ok: true, id: json.id };
  const name = typeof json?.name === 'string' && /^[a-z_]{1,64}$/.test(json.name) ? json.name : 'unknown';
  // 다시 보내 볼 만한 것: 한도(429) · Resend 쪽 오류(5xx) · 같은 열쇠가 아직 처리 중(409 concurrent) · 잠깐 잠김(409 resource_locked)
  const retry = resp.status === 429 || resp.status >= 500 || name === 'concurrent_idempotent_requests' || name === 'resource_locked';
  return { ok: false, status: resp.status, name, retry };
}
