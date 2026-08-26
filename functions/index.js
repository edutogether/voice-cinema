import { onRequest } from 'firebase-functions/v2/https';
import { onSchedule } from 'firebase-functions/v2/scheduler';
import { initializeApp } from 'firebase-admin/app';
import { getStorage } from 'firebase-admin/storage';
import express from 'express';

initializeApp();

// 감사 발견 반영: 이 파일엔 전역 예외 핸들러가 없었다 — 남겨서 원인 파악을 돕는다.
process.on('uncaughtException', (e) => console.error('[예상 못한 오류]', e));
process.on('unhandledRejection', (e) => console.error('[예상 못한 오류(Promise)]', e));

/* 2026년 12월 1일부터는 이 폴더 안의 영상을 전부 지운다 — "11월 안에만 다운로드 가능" 정책.
   Apps Script 버전의 CUTOFF_DATE/cleanupAfterCutoff와 동일한 개념이며,
   Cloud Scheduler가 대신 매일 정확히 이 함수를 깨워준다(별도 트리거 설치 불필요). */
const CUTOFF_DATE = new Date('2026-12-01T00:00:00+09:00');
const UPLOAD_PREFIX = 'dubs/';

// 정밀감사(2026-08-26) 발견 반영 — 이 엔드포인트는 원래 인증 없이 공개 배포된다
// (익명 QR 전달 흐름 자체가 로그인을 요구할 수 없는 구조). 다만 감사에서
// "누구나 15MB×무제한으로 업로드 가능", "mimeType 무검증으로 임의 콘텐츠 공개 호스팅
// 가능"이 실제로 확인돼, 코드로 세울 수 있는 방어를 여기 추가한다.
// BOOTH_TOKEN은 공개 정적 프론트(docs/app.js)에도 그대로 들어가야 하는 값이라 진짜
// 비밀은 아니다 — URL만 아는 자동화 스크립트의 무차별 시도를 막는 1차 방어선일
// 뿐이고(Secret Manager로 숨길 실익도 없음), 완전한 방어(Firebase App Check 등)는
// 콘솔 설정이 필요해 별도 판단 대상으로 남긴다.
const BOOTH_TOKEN = 'ac3231330f737aaf7f90c825f7ddacc9e287b3ac87caf99d';
const ALLOWED_MIME = new Set(['video/mp4']);
const MAX_DECODED_BYTES = 12 * 1024 * 1024; // 12MB — 15MB 요청 바디 한도보다 여유 있게 낮게 잡음
const MAX_FILENAME_LEN = 120;

// 인스턴스 하나당 최소한의 요청 빈도 제한(재기동되면 초기화되는 메모리 기반이라
// 완벽하진 않지만, maxInstances 제한과 합쳐지면 스크립트 남용의 비용을 실질적으로 올린다).
const RATE_LIMIT_WINDOW_MS = 60 * 1000;
const RATE_LIMIT_MAX = 10;
const requestLog = new Map(); // ip -> timestamps[]
function isRateLimited(ip) {
  const now = Date.now();
  const arr = (requestLog.get(ip) || []).filter((t) => now - t < RATE_LIMIT_WINDOW_MS);
  arr.push(now);
  requestLog.set(ip, arr);
  return arr.length > RATE_LIMIT_MAX;
}

const app = express();
app.use(express.json({ limit: '15mb' }));

app.get('/', (req, res) => res.json({ ok: true, service: 'inky-voice-cinema' }));

app.post('/upload', async (req, res) => {
  try {
    if (isRateLimited(req.ip)) {
      return res.status(429).json({ ok: false, error: '요청이 너무 많습니다. 잠시 후 다시 시도해 주세요.' });
    }
    if (req.get('x-booth-token') !== BOOTH_TOKEN) {
      return res.status(403).json({ ok: false, error: '접근 권한이 없습니다.' });
    }
    const { filename, mimeType, dataBase64 } = req.body || {};
    if (!filename || !dataBase64) {
      return res.status(400).json({ ok: false, error: '파일 데이터가 없습니다.' });
    }
    if (String(filename).length > MAX_FILENAME_LEN) {
      return res.status(400).json({ ok: false, error: '파일명이 너무 깁니다.' });
    }
    if (!ALLOWED_MIME.has(mimeType)) {
      return res.status(400).json({ ok: false, error: '허용되지 않는 파일 형식입니다.' });
    }
    const safeName = String(filename).replace(/[^\w.\-가-힣]/g, '_');
    const buffer = Buffer.from(dataBase64, 'base64');
    if (buffer.length === 0 || buffer.length > MAX_DECODED_BYTES) {
      return res.status(400).json({ ok: false, error: '파일 크기가 올바르지 않습니다.' });
    }
    const bucket = getStorage().bucket();
    const file = bucket.file(UPLOAD_PREFIX + safeName);
    await file.save(buffer, {
      contentType: mimeType,
      resumable: false,
    });
    await file.makePublic();
    res.json({ ok: true, url: file.publicUrl() });
  } catch (err) {
    console.error('[upload]', err?.message || err);
    res.status(500).json({ ok: false, error: '저장 중 오류가 발생했습니다.' });
  }
});

// GitHub Pages(edutogether.github.io)에서만 호출 가능하도록 CORS 제한.
// 로컬 개발 시에는 5500(Live Server)·8080(firebase serve) 포트도 허용.
const ALLOWED_ORIGINS = [
  /^https:\/\/edutogether\.github\.io$/,
  /^http:\/\/localhost:(5500|8080)$/,
  /^http:\/\/127\.0\.0\.1:(5500|8080)$/,
];

export const voiceCinema = onRequest(
  {
    region: 'asia-northeast3',
    memory: '256MiB',
    timeoutSeconds: 60,
    maxInstances: 10,
    cors: ALLOWED_ORIGINS,
  },
  app
);

// 매일 새벽 3시(KST)에 깨어나서, CUTOFF_DATE가 지났으면 업로드된 영상을 전부 지운다.
export const cleanupAfterCutoff = onSchedule(
  { schedule: '0 3 * * *', timeZone: 'Asia/Seoul', region: 'asia-northeast3' },
  async () => {
    if (new Date() < CUTOFF_DATE) return;
    try {
      const bucket = getStorage().bucket();
      const [files] = await bucket.getFiles({ prefix: UPLOAD_PREFIX });
      await Promise.all(files.map((f) => f.delete().catch((e) => console.error('[cleanup]', f.name, e?.message))));
      console.log(`[cleanup] ${files.length}개 파일 삭제 완료`);
    } catch (err) {
      // 감사 발견 반영: bucket()/getFiles() 자체가 던지면 이 스케줄 실행이
      // 처리되지 않은 예외로 끝난다 — 로그로 남겨 다음 날 재시도 전까지 원인을 알 수 있게 한다.
      console.error('[cleanup] 실행 실패', err?.message || err);
    }
  }
);
