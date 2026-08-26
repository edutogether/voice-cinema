import { onRequest } from 'firebase-functions/v2/https';
import { onSchedule } from 'firebase-functions/v2/scheduler';
import { initializeApp } from 'firebase-admin/app';
import { getStorage } from 'firebase-admin/storage';
import express from 'express';

initializeApp();

/* 2026년 12월 1일부터는 이 폴더 안의 영상을 전부 지운다 — "11월 안에만 다운로드 가능" 정책.
   Apps Script 버전의 CUTOFF_DATE/cleanupAfterCutoff와 동일한 개념이며,
   Cloud Scheduler가 대신 매일 정확히 이 함수를 깨워준다(별도 트리거 설치 불필요). */
const CUTOFF_DATE = new Date('2026-12-01T00:00:00+09:00');
const UPLOAD_PREFIX = 'dubs/';

const app = express();
app.use(express.json({ limit: '15mb' }));

app.post('/upload', async (req, res) => {
  try {
    const { filename, mimeType, dataBase64 } = req.body || {};
    if (!filename || !dataBase64) {
      return res.status(400).json({ ok: false, error: '파일 데이터가 없습니다.' });
    }
    const safeName = String(filename).replace(/[^\w.\-가-힣]/g, '_');
    const buffer = Buffer.from(dataBase64, 'base64');
    const bucket = getStorage().bucket();
    const file = bucket.file(UPLOAD_PREFIX + safeName);
    await file.save(buffer, {
      contentType: mimeType || 'video/mp4',
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
    const bucket = getStorage().bucket();
    const [files] = await bucket.getFiles({ prefix: UPLOAD_PREFIX });
    await Promise.all(files.map((f) => f.delete().catch((e) => console.error('[cleanup]', f.name, e?.message))));
    console.log(`[cleanup] ${files.length}개 파일 삭제 완료`);
  }
);
