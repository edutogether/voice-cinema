import crypto from 'crypto';
import { onRequest } from 'firebase-functions/v2/https';
import { onSchedule } from 'firebase-functions/v2/scheduler';
import { initializeApp } from 'firebase-admin/app';
import { getStorage } from 'firebase-admin/storage';
import { getAppCheck } from 'firebase-admin/app-check';
import express from 'express';
import { validateUploadRequest, createRateLimiter, chunk } from './validate.js';

initializeApp();

// 감사 발견 반영: 이 파일엔 전역 예외 핸들러가 없었다 — 남겨서 원인 파악을 돕는다.
process.on('uncaughtException', (e) => console.error('[예상 못한 오류]', e));
process.on('unhandledRejection', (e) => console.error('[예상 못한 오류(Promise)]', e));

/* 2026년 12월 1일부터는 이 폴더 안의 영상을 전부 지운다 — "11월 안에만 다운로드 가능" 정책.
   Apps Script 버전의 CUTOFF_DATE/cleanupAfterCutoff와 동일한 개념이며,
   Cloud Scheduler가 대신 매일 정확히 이 함수를 깨워준다(별도 트리거 설치 불필요). */
const CUTOFF_DATE = new Date('2026-12-01T00:00:00+09:00');
const UPLOAD_PREFIX = 'dubs/';

// 2026-08-28 발견 반영: 파일 수백~수천 개를 Promise.all 하나로 한꺼번에
// 지우면 인스턴스 메모리(256MiB)를 초과해 죽는다(2000개 실측 스트레스테스트로
// 실제 재현: "Memory limit of 256 MiB exceeded with 275 MiB used"). 이 두 라우트
// (정리용 임시 라우트, 실제 cleanupAfterCutoff)가 전부 같은 패턴이라 공용 함수로
// 묶어 한 번에 100개씩만 처리한다.
const DELETE_BATCH_SIZE = 100;
async function deleteAllInBatches(files, logPrefix) {
  let deleted = 0;
  for (const batch of chunk(files, DELETE_BATCH_SIZE)) {
    await Promise.all(batch.map((f) => f.delete().catch((e) => console.error(logPrefix, f.name, e?.message))));
    deleted += batch.length;
  }
  return deleted;
}

// 정밀감사(2026-08-26) 발견 반영 — 이 엔드포인트는 원래 인증 없이 공개 배포된다
// (익명 QR 전달 흐름 자체가 로그인을 요구할 수 없는 구조). 다만 감사에서
// "누구나 15MB×무제한으로 업로드 가능", "mimeType 무검증으로 임의 콘텐츠 공개 호스팅
// 가능"이 실제로 확인돼, 코드로 세울 수 있는 방어를 여기 추가한다.
// BOOTH_TOKEN은 공개 프론트(src/config.ts)에도 그대로 들어가야 하는 값이라 진짜
// 비밀은 아니다 — URL만 아는 자동화 스크립트의 무차별 시도를 막는 1차 방어선일
// 뿐이고(Secret Manager로 숨길 실익도 없음), 완전한 방어(Firebase App Check 등)는
// 콘솔 설정이 필요해 별도 판단 대상으로 남긴다.
const BOOTH_TOKEN = 'ac3231330f737aaf7f90c825f7ddacc9e287b3ac87caf99d';
// 부스 와이파이는 보통 하나의 공인 IP(NAT)로 나가므로, 여러 학생이 동시에
// 쓰는 태블릿/노트북이 전부 이 카운터 하나를 같이 쓴다 — 기본값(분당 10건)은
// 개별 스크립트 남용을 막기엔 적당하지만, 부스 여러 대가 동시에 정상 사용할
// 때 서로를 막아버리기엔 너무 낮다. 분당 60건(초당 1건 수준)까지 올려도
// 남용 저지 목적은 유지되면서 정상적인 동시 사용은 걸리지 않는다.
const isRateLimited = createRateLimiter({ max: 60 });

const app = express();
// Cloud Run(Functions v2)은 X-Forwarded-For로 실제 클라이언트 IP를 넘겨주는데,
// trust proxy를 켜지 않으면 Express가 그걸 무시하고 내부 프록시 연결 자체의
// 주소를 req.ip로 써서 서로 다른 클라이언트가 전부 같은 값으로 뭉뚱그려진다
// (curl로 X-Forwarded-For를 바꿔가며 실제로 재현·확인함, 2026-08-28).
// 값은 반드시 1(정확히 신뢰 가능한 홉 1개=Cloud Run 자체 프록시)이어야 한다 —
// true로 하면 브라우저는 X-Forwarded-For를 직접 못 건드리지만(금지된 헤더) curl
// 같은 비-브라우저 클라이언트는 그 값을 마음대로 지어낼 수 있어, 오히려 레이트
// 리밋을 완전히 무력화하는 우회로가 된다. 1은 체인의 오른쪽에서 정확히 한 홉만
// 신뢰해 클라이언트가 앞에 가짜 값을 붙여도 무시한다.
app.set('trust proxy', 1);

app.get('/', (req, res) => res.json({ ok: true, service: 'inky-voice-cinema' }));

// 종합감사(2026-09-02) 발견 반영: 예전엔 express.json()이 라우트보다 먼저
// 전역 등록돼 있어, 토큰/App Check/레이트리밋 검사보다 28MB 본문 파싱이
// 먼저 실행됐다 — 인증 안 된 요청도 매번 파싱+base64 디코딩 비용(256MiB
// 인스턴스)을 강제로 치르게 할 수 있었다(보안·비용 이중 문제). 헤더만
// 보는 검사(레이트리밋/BOOTH_TOKEN/App Check)를 먼저 통과한 요청에만
// body를 파싱하도록 순서를 바꿨다.
app.post('/upload', async (req, res, next) => {
  const requestId = crypto.randomBytes(4).toString('hex');
  req.requestId = requestId;
  if (isRateLimited(req.ip)) {
    console.warn(`[upload:${requestId}] 요청 제한 초과`);
    return res.status(429).json({ ok: false, error: '요청이 너무 많습니다. 잠시 후 다시 시도해 주세요.' });
  }
  if (req.get('x-booth-token') !== BOOTH_TOKEN) {
    console.warn(`[upload:${requestId}] 토큰 불일치`);
    return res.status(403).json({ ok: false, error: '접근 권한이 없습니다.' });
  }
  // 2026-09-02, 대표 승인(D2) — Firebase App Check(reCAPTCHA Enterprise)로 BOOTH_TOKEN에
  // 이중 방어를 더한다. BOOTH_TOKEN은 공개값이라 아는 사람은 누구나 쓸 수 있었지만,
  // App Check 토큰은 진짜 브라우저에서 reCAPTCHA를 통과해야만 발급된다.
  const appCheckToken = req.get('x-firebase-appcheck');
  if (!appCheckToken) {
    console.warn(`[upload:${requestId}] App Check 토큰 없음`);
    return res.status(401).json({ ok: false, error: '보안 검증에 실패했습니다.' });
  }
  try {
    await getAppCheck().verifyToken(appCheckToken);
  } catch (e) {
    console.warn(`[upload:${requestId}] App Check 토큰 검증 실패: ${e?.message}`);
    return res.status(401).json({ ok: false, error: '보안 검증에 실패했습니다.' });
  }
  next();
// MAX_DECODED_BYTES(20MB)를 base64로 인코딩하면 약 4/3배(~27MB)가 되므로,
// body 파서 한도는 그보다 넉넉히 잡아야 한다(2026-09-01, 12MB/15mb였을 때
// 실제 클립 교체 후 전 장르 업로드가 이 한도에서 막히는 것을 실측으로 발견).
}, express.json({ limit: '28mb' }), async (req, res) => {
  const requestId = req.requestId;
  try {
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

// 2026-09-01 Firebase Hosting(voice-cinema.web.app)로 이전. GitHub Pages는
// 한동안 병행 운영했으나 2026-09-08 대표 지시로 폐지했다(포털 카드가 이미 Firebase
// 주소를 가리키는 것을 확인한 뒤) — 그래서 edutogether.github.io는 허용 목록에서 뺐다.
// 이제 이 앱의 배포처는 Firebase Hosting 한 곳뿐이다.
// 2026-09-02: Portal이 edutogether.kr/voice-cinema로 리버스 프록시하기로 결정 —
// 프록시는 정적 콘텐츠만 다루고 이 Cloud Functions 도메인은 그대로 직접 호출되므로,
// 브라우저가 보내는 Origin은 edutogether.kr가 된다(팀장 확인, 2026-09-02).
// 로컬 개발 시에는 4321(vite dev·preview) 포트도 허용 — 2026-09-08 리액트 전환으로
// 개발 서버가 5500(Live Server)/8080(firebase serve)에서 이 포트로 바뀌었는데 목록이
// 그대로 남아 있어, 로컬에서 실제 업로드 경로를 시험하면 CORS로 막히고 폴백만
// 확인하게 되는 상태였다.
const ALLOWED_ORIGINS = [
  /^https:\/\/voice-cinema\.web\.app$/,
  /^https:\/\/voice-cinema\.firebaseapp\.com$/,
  /^https:\/\/edutogether\.kr$/,
  /^http:\/\/localhost:4321$/,
  /^http:\/\/127\.0\.0\.1:4321$/,
];

// 2026-09-06, 대표 지시로 60초→110초 — Cloud Run 기반이라 클라이언트의
// AbortController 설정과 무관하게 이 시간이 지나면 서버가 먼저 연결을 끊는다.
// src/config.ts의 UPLOAD_TIMEOUT_MS와 반드시 같은 값으로 맞출 것(그쪽에 산출 근거 있음).
// 종합감사(2026-09-07) 발견 반영 — concurrency를 명시하지 않으면 Functions v2는
// 인스턴스 하나가 요청 80건을 동시에 처리한다(firebase-functions 옵션 문서: "기본값
// 80, CPU >= 1일 때"이고 CPU는 메모리 2GB 이하에서 기본 1). 그런데 이 엔드포인트는
// 요청 하나가 base64 문자열(최대 26.7MB)과 디코딩 버퍼(20MB)를 GCS 저장이 끝날
// 때까지 계속 붙들고 있어, 실측으로 요청 1건당 약 47MB를 유지하고 파싱 순간엔
// 베이스라인 대비 +73MB까지 튄다(node로 동일 크기 본문을 재현해 측정).
// 즉 256MiB 인스턴스에서 최대 크기 요청 4건만 겹쳐도 한도를 넘겨 OOM이 나고,
// 그러면 그 인스턴스에 얹혀 있던 다른 학생들의 요청까지 전부 같이 죽는다.
// 타임아웃을 60→110초로 늘린 뒤(2026-09-06)로는 요청들이 한 인스턴스에 겹쳐
// 머무는 시간도 그만큼 길어져 이 조건이 더 쉽게 성립한다.
// concurrency를 1로 두면 요청 하나가 인스턴스 하나를 통째로 쓰므로(실측 기준
// 47+73+베이스라인 ≈ 180MB로 256MiB 안에 여유 있게 들어옴) 큰 요청 하나가
// 남의 요청까지 끌고 죽는 경로가 사라진다. 전체 동시 처리량은 maxInstances(10)이
// 그대로 결정하는데, 이 값은 2026-08-28 2000건 스트레스테스트에서 10개 병렬
// 워커로 실제 검증된 수치와 정확히 같아 처리량 회귀는 없다.
// 부작용으로 남는 것: 레이트리밋이 인스턴스별 메모리 기반이라 요청이 여러
// 인스턴스로 흩어지면 IP당 실효 한도가 느슨해진다(상한은 이전과 같은 10×60/분).
// 실제 1차 방어선은 App Check(reCAPTCHA Enterprise) 토큰 검증이라 이 완화는 감수한다.
export const voiceCinema = onRequest(
  {
    region: 'asia-northeast3',
    memory: '256MiB',
    timeoutSeconds: 110,
    maxInstances: 10,
    concurrency: 1,
    cors: ALLOWED_ORIGINS,
  },
  app
);

// 매일 새벽 3시(KST)에 깨어나서, CUTOFF_DATE가 지났으면 업로드된 영상을 전부 지운다.
// memory를 512MiB로 올린 것과 배치 삭제 둘 다 2026-08-28 발견 반영 — 행사 당일
// 수천 개가 쌓인 상태에서 한 번에 지우려다 메모리 초과로 이 함수 자체가 죽으면
// 자동삭제가 아예 안 되는(개인정보가 안 지워지는) 심각한 결과로 이어질 수 있었다.
export const cleanupAfterCutoff = onSchedule(
  { schedule: '0 3 * * *', timeZone: 'Asia/Seoul', region: 'asia-northeast3', memory: '512MiB', timeoutSeconds: 300 },
  async () => {
    if (new Date() < CUTOFF_DATE) return;
    try {
      const bucket = getStorage().bucket();
      const [files] = await bucket.getFiles({ prefix: UPLOAD_PREFIX });
      const deleted = await deleteAllInBatches(files, '[cleanup]');
      console.log(`[cleanup] ${deleted}개 파일 삭제 완료`);
    } catch (err) {
      // 감사 발견 반영: bucket()/getFiles() 자체가 던지면 이 스케줄 실행이
      // 처리되지 않은 예외로 끝난다 — 로그로 남겨 다음 날 재시도 전까지 원인을 알 수 있게 한다.
      console.error('[cleanup] 실행 실패', err?.message || err);
    }
  }
);
