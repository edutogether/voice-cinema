import crypto from 'crypto';
import { onRequest } from 'firebase-functions/v2/https';
import { onSchedule } from 'firebase-functions/v2/scheduler';
import { initializeApp } from 'firebase-admin/app';
import { getStorage } from 'firebase-admin/storage';
import express from 'express';
import { validateUploadRequest, createRateLimiter } from './validate.js';

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
const isRateLimited = createRateLimiter();

const app = express();
app.use(express.json({ limit: '15mb' }));

app.get('/', (req, res) => res.json({ ok: true, service: 'inky-voice-cinema' }));

app.post('/upload', async (req, res) => {
  // 감사 발견 반영: 업로드마다 짧은 식별자를 남겨, "QR이 안 나와요" 문의가 왔을 때
  // 로그에서 그 건을 시간순 나열이 아니라 requestId로 바로 찾을 수 있게 한다.
  const requestId = crypto.randomBytes(4).toString('hex');
  try {
    if (isRateLimited(req.ip)) {
      console.warn(`[upload:${requestId}] 요청 제한 초과`);
      return res.status(429).json({ ok: false, error: '요청이 너무 많습니다. 잠시 후 다시 시도해 주세요.' });
    }
    if (req.get('x-booth-token') !== BOOTH_TOKEN) {
      console.warn(`[upload:${requestId}] 토큰 불일치`);
      return res.status(403).json({ ok: false, error: '접근 권한이 없습니다.' });
    }
    const check = validateUploadRequest(req.body);
    if (!check.ok) {
      console.warn(`[upload:${requestId}] 검증 실패: ${check.error}`);
      return res.status(check.status).json({ ok: false, error: check.error });
    }
    const bucket = getStorage().bucket();
    const file = bucket.file(UPLOAD_PREFIX + check.safeName);
    await file.save(check.buffer, {
      contentType: req.body.mimeType,
      resumable: false,
    });
    await file.makePublic();
    console.log(`[upload:${requestId}] 성공: ${check.safeName} (${check.buffer.length}바이트)`);
    res.json({ ok: true, url: file.publicUrl() });
  } catch (err) {
    console.error(`[upload:${requestId}] 오류`, err?.message || err);
    res.status(500).json({ ok: false, error: '저장 중 오류가 발생했습니다.', requestId });
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
