// Firebase/Express에 의존하지 않는 순수 로직만 모아둔다 — 이래야 배포 없이
// 유닛테스트로 검증할 수 있다(2026-08-27, 테스트 인프라 투자 승인 반영).
// index.js의 /upload 핸들러가 이 함수들을 그대로 쓴다.

export const ALLOWED_MIME = new Set(['video/mp4']);
// 2026-09-01, 실제 Kling AI 클립 6종 교체 후 실측: -c:v copy로 합성한 완성 영상이
// 12.8~13.0MB로 나와 기존 12MB 한도를 전부 초과했다(모든 장르 업로드가 실패할 뻔함,
// 실제 파이프라인으로 재현·확인). 실측치에 넉넉한 여유를 두고 20MB로 올린다.
export const MAX_DECODED_BYTES = 20 * 1024 * 1024; // 20MB
export const MAX_FILENAME_LEN = 120;

// 파일명에서 경로 조작(../ 등)과 GCS 키에 부적절한 문자를 제거한다.
export function sanitizeFilename(filename) {
  return String(filename).replace(/[^\w.\-가-힣]/g, '_');
}

// req.body를 검사해 저장 가능한 상태인지 판단한다.
// 성공 시 { ok: true, safeName, buffer }, 실패 시 { ok: false, status, error }를 반환한다.
export function validateUploadRequest(body) {
  const { filename, mimeType, dataBase64 } = body || {};

  if (!filename || !dataBase64) {
    return { ok: false, status: 400, error: '파일 데이터가 없습니다.' };
  }
  if (String(filename).length > MAX_FILENAME_LEN) {
    return { ok: false, status: 400, error: '파일명이 너무 깁니다.' };
  }
  if (!ALLOWED_MIME.has(mimeType)) {
    return { ok: false, status: 400, error: '허용되지 않는 파일 형식입니다.' };
  }

  const safeName = sanitizeFilename(filename);
  let buffer;
  try {
    buffer = Buffer.from(dataBase64, 'base64');
  } catch (e) {
    return { ok: false, status: 400, error: '파일 크기가 올바르지 않습니다.' };
  }
  if (buffer.length === 0 || buffer.length > MAX_DECODED_BYTES) {
    return { ok: false, status: 400, error: '파일 크기가 올바르지 않습니다.' };
  }

  return { ok: true, safeName, buffer };
}

// 배열을 size개씩 묶는다 — 대량 삭제를 한 번에 Promise.all로 몰아넣으면
// 메모리를 초과할 수 있어(2026-08-28, 2000개 실측 스트레스테스트 중 실제로
// "Memory limit of 256 MiB exceeded" 발생 확인) 이걸로 나눠 처리한다.
export function chunk(array, size) {
  const out = [];
  for (let i = 0; i < array.length; i += size) out.push(array.slice(i, i + size));
  return out;
}

// 인스턴스 하나당 최소한의 요청 빈도 제한(재기동되면 초기화되는 메모리 기반이라
// 완벽하진 않지만, maxInstances 제한과 합쳐지면 스크립트 남용의 비용을 실질적으로 올린다).
export function createRateLimiter({ windowMs = 60 * 1000, max = 10 } = {}) {
  const requestLog = new Map(); // ip -> timestamps[]
  return function isRateLimited(ip) {
    const now = Date.now();
    const arr = (requestLog.get(ip) || []).filter((t) => now - t < windowMs);
    arr.push(now);
    requestLog.set(ip, arr);
    return arr.length > max;
  };
}
