// 현장 의견 받기의 서버 쪽 규칙(2026-11-08 Bumm님 «Poster Studio와 똑같이», 팀장 전달 — _docs/intents/2026-11-08-field-feedback).
// Firebase/Express에 의존하지 않아 배포 없이 시험한다(validate.js · mail.js와 같은 방식). 저장 · 카카오 알림은 kakao.js와 index.js가 한다.
// 첫 화면 «의견 보내기»가 여섯 칸만 보낸다 — 이름 · 의견 · 판 번호 · 화면 크기 · 기기 · 단계. 녹음한 목소리 · 영화는 받지 않는다.
// 🔴 이름 · 의견 글을 로그에 넣지 않는다 — 이 파일의 함수는 그 값을 담은 오류 문구를 만들지 않는다.

// 이 시각부터 받지 않는다 — 화면(src/config.ts의 같은 이름)도 이 시각에 링크와 창을 내린다. 계약 시험이 두 값을 대조한다
export const FEEDBACK_CLOSE_AT = new Date('2026-11-14T00:00:00+09:00');
export const NAME_MAX = 40;
export const TEXT_MAX = 500;
// 받은 지 90일이 지난 의견은 매일 04시 작업이 지운다(Poster Studio와 같다 — 받기를 마치면 내보내 넘긴 뒤 먼저 지우고, 이것은 잊었을 때의 안전장치다)
export const FEEDBACK_TTL_MS = 90 * 24 * 60 * 60 * 1000;
export const FEEDBACK_COLLECTION = 'feedback';
// 서버는 의견을 받은 순간부터 이 안에 답한다 — 카카오는 남은 시간만 쓴다. 화면은 응답을 15초 기다리므로(src/lib/feedback.ts) 그보다 짧아야 한다:
// 길면 서버는 저장했는데 화면은 «보낼 수 없어요»가 되고, 다시 누르면 같은 의견이 두 번 저장 · 알림된다(Poster Studio 11/8 종합감사).
// «이 값 + 5초 ≤ 화면 대기»는 test/contract.test.js가 두 파일을 읽어 고정한다
export const FEEDBACK_REPLY_BUDGET_MS = 10000;

const FIELDS = ['name', 'text', 'version', 'screen', 'device', 'step'];
// 화면 맞춤 갈래(public/fit.js의 data-fit) — 읽지 못하면 unknown
const DEVICES = ['pc', 'tablet', 'phone', 'none', 'unknown'];

// 글자 수는 코드 포인트로 센다(이모지 하나 = 1)
export const charCount = (s) => [...s].length;
// 이름: 제어 문자 · 서식 문자를 지우고 공백을 하나로
function cleanLine(value) {
  return String(value).normalize('NFC').replace(/[\p{Cc}\p{Cf}]/gu, ' ').replace(/\s+/g, ' ').trim();
}
// 의견: 줄바꿈만 남기고 제어 문자 · 서식 문자를 지운다. 빈 줄은 두 줄까지
function cleanText(value) {
  return String(value)
    .normalize('NFC')
    .replace(/\r\n?/g, '\n')
    .replace(/[^\P{Cc}\n]|\p{Cf}/gu, '')
    .replace(/\n{4,}/g, '\n\n\n')
    .trim();
}

export function isFeedbackClosed(now) {
  return now >= FEEDBACK_CLOSE_AT.getTime();
}

/**
 * 요청 본문을 검사한다. 정확히 여섯 칸이어야 하고(그 밖의 칸이 오면 거절), 모양이 다르면 거절한다.
 * 맞으면 저장할 값, 아니면 null(어느 칸이 틀렸는지는 돌려주지 않는다 — 로그에 값이 실리지 않게).
 */
export function validateFeedback(body) {
  if (!body || typeof body !== 'object' || Array.isArray(body)) return null;
  const keys = Object.keys(body);
  if (keys.length !== FIELDS.length || !FIELDS.every((k) => Object.hasOwn(body, k))) return null;
  const { name, text, version, screen, device, step } = body;
  if (![name, text, version, screen, device].every((v) => typeof v === 'string') || !Number.isInteger(step)) return null;
  const value = { name: cleanLine(name), text: cleanText(text), version, screen, device, step };
  if (!value.name || charCount(value.name) > NAME_MAX) return null;
  if (!value.text || charCount(value.text) > TEXT_MAX) return null;
  // 화면 번들 파일 이름(main-XXXX.js) — 어느 판에서 쓴 의견인지
  if (!/^[A-Za-z0-9._-]{1,80}$/.test(version)) return null;
  // 창 크기와 화소 배율(2560x1305@1.5)
  if (!/^\d{2,5}x\d{2,5}@\d{1,2}(\.\d{1,3})?$/.test(screen)) return null;
  if (!DEVICES.includes(device)) return null;
  if (step < 1 || step > 3) return null;
  return value;
}

/** 카카오톡 «나에게 보내기» 글 — 첫머리가 앱 이름이다(Poster Studio는 «[Poster Studio 의견]»). 200자를 넘으면 kakao.js가 줄인다(저장은 원문 그대로) */
export function feedbackMemo(v) {
  return `[Voice Cinema 의견] ${v.name}\n${v.text}\n— 판 ${v.version} · ${v.screen} · ${v.device} · ${v.step}단계`;
}

/** 받은 지 90일이 지난 의견을 500건씩 지운다. 지운 수를 돌려준다(db는 Firestore — 시험은 같은 모양의 가짜를 넣는다) */
export async function cleanupOldFeedback(db, now = Date.now()) {
  const cutoff = new Date(now - FEEDBACK_TTL_MS);
  let deleted = 0;
  for (;;) {
    const snap = await db.collection(FEEDBACK_COLLECTION).where('createdAt', '<', cutoff).limit(500).get();
    if (snap.empty) break;
    const batch = db.batch();
    snap.docs.forEach((doc) => batch.delete(doc.ref));
    await batch.commit();
    deleted += snap.size;
    if (snap.size < 500) break;
  }
  return deleted;
}

/**
 * 매일 04시(한국 시간) 정리 — 두 일은 서로 막지 않는다(하나가 실패해도 나머지는 돈다, Poster Studio 11/8 종합감사).
 * jobs.feedback: 90일 지난 의견 지우기 · jobs.kakao: 카카오 토큰 갱신(연결 전이면 null).
 * 하나라도 실패하면 실행을 실패로 끝낸다 — 성공으로 보이면 아무도 모른다(cleanupAfterCutoff와 같은 규칙, 2026-10-05).
 */
export async function dailyMaintenance(jobs) {
  const failed = [];
  try {
    const deleted = await jobs.feedback();
    console.log(`[feedback] 90일 지난 의견 ${deleted}건 삭제`);
  } catch (err) {
    failed.push('의견 정리');
    console.error('[feedback] 정리 실패:', err?.message || err);
  }
  try {
    const owner = await jobs.kakao();
    console.log(`[kakao] 토큰 갱신 ${owner ? '완료' : '— 아직 연결 전'}`);
  } catch (err) {
    failed.push('카카오 토큰 갱신');
    console.error('[kakao] 토큰 갱신 실패:', err?.message || err);
  }
  if (failed.length) throw new Error(`${failed.join(' · ')} 실패`);
}
