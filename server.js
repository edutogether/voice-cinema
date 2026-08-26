/**
 * 잉키 보이스 시네마 (INKY Voice Cinema) v1.1
 * 영화제 더빙 놀이 부스용 로컬 서버
 *
 * v1.1 (출시 전 감사 반영)
 *  - C1: 드라이브 업로드 60초 타임아웃 + 실패 시 로컬 QR 자동 폴백(녹음 유실 방지)
 *  - C2: 서버 기동 시 클립 코덱 점검(HEVC 경고)
 *  - H1: 장르 화이트리스트 검증(경로 조작 차단)
 *  - H2: 결과 파일명에 랜덤 토큰(타 학생 녹음 추측 차단)
 *  - H4: config.json BOM 허용 + 오류 시 한국어 안내
 *  - H5: IP 변경 감지 시 https 인증서 자동 재발급, 배너에 모든 IP 표시
 *  - M5: 요청 크기 15MB 제한, 기동 시 임시폴더 청소
 */

const express = require('express');
const fs = require('fs');
const os = require('os');
const path = require('path');
const http = require('http');
const https = require('https');
const crypto = require('crypto');
const { spawn, spawnSync } = require('child_process');
const QRCode = require('qrcode');
const selfsigned = require('selfsigned');

// 감사 발견 반영: 예상 못한 예외로 서버 전체가 조용히 죽는 대신
// 무엇이 문제였는지 남기고 계속 동작을 시도한다(행사 중 서버가 죽으면 복구가 어려움).
process.on('uncaughtException', e => console.error('[예상 못한 오류]', e));
process.on('unhandledRejection', e => console.error('[예상 못한 오류(Promise)]', e));

// ffmpeg 경로 해석: 설치 패키지 우선, 없으면 시스템 PATH(ffmpeg) 폴백
function resolveFfmpeg() {
  try {
    const p = require('ffmpeg-static');
    if (p && fs.existsSync(p)) return p;
  } catch (e) { /* 무시하고 폴백 */ }
  return 'ffmpeg';
}
const ffmpegPath = resolveFfmpeg();

const ROOT = __dirname;

// ── 설정 읽기 (H4: BOM 허용, 오류 시 한국어 안내 후 종료) ──
function loadConfig() {
  const p = path.join(ROOT, 'config.json');
  try {
    const raw = fs.readFileSync(p, 'utf8').replace(/^\uFEFF/, ''); // 메모장 BOM 제거
    return JSON.parse(raw);
  } catch (e) {
    console.error('\n──────────────────────────────────────────────');
    console.error(' [설정 오류] config.json 을 읽지 못했습니다.');
    console.error('  1) config.json 이 server.js 와 같은 폴더에 있는지');
    console.error('  2) 따옴표("), 쉼표(,) 누락 등 형식이 올바른지 확인하세요.');
    console.error('  상세: ' + e.message);
    console.error('──────────────────────────────────────────────\n');
    process.exit(1); // start.bat 이 창을 유지해 메시지를 볼 수 있음
  }
}
const config = loadConfig();
const HTTP_PORT = config.httpPort || 3000;
const HTTPS_PORT = config.httpsPort || 3443;
const DRIVE_TIMEOUT_MS = 60 * 1000;

// 6개 장르 정의 (파일명 = id + .mp4)
const GENRES = [
  { id: 'fantasy',   name: '판타지',     emoji: '🪄', color: '#8b6cff' },
  { id: 'animation', name: '애니메이션', emoji: '🎨', color: '#ff9a3d' },
  { id: 'horror',    name: '호러',       emoji: '👻', color: '#39d59a' },
  { id: 'action',    name: '액션',       emoji: '💥', color: '#ff5470' },
  { id: 'drama',     name: '드라마',     emoji: '🌅', color: '#ffc24d' },
  { id: 'sitcom',    name: '시트콤',     emoji: '😂', color: '#4da6ff' },
];
const GENRE_IDS = new Set(GENRES.map(g => g.id)); // H1: 화이트리스트

const CLIPS_DIR   = path.join(ROOT, 'clips');
const OUTPUTS_DIR = path.join(ROOT, 'outputs');
const TMP_DIR     = path.join(ROOT, 'tmp');
const CERT_DIR    = path.join(ROOT, 'cert');
[OUTPUTS_DIR, TMP_DIR, CERT_DIR].forEach(d => { if (!fs.existsSync(d)) fs.mkdirSync(d, { recursive: true }); });

// M5: 기동 시 임시폴더 청소
try {
  fs.readdirSync(TMP_DIR).forEach(f => { if (f !== '.gitkeep') fs.unlink(path.join(TMP_DIR, f), () => {}); });
} catch (e) { /* 무시 */ }

// H5: 모든 LAN IPv4 수집 (가상 어댑터가 첫 번째로 잡히는 문제 대응)
function getLanIps() {
  const out = [];
  const ifaces = os.networkInterfaces();
  for (const name of Object.keys(ifaces)) {
    for (const i of ifaces[name] || []) {
      if (i.family === 'IPv4' && !i.internal && !out.includes(i.address)) out.push(i.address);
    }
  }
  return out;
}
const LAN_IPS = getLanIps();
const LAN_IP = LAN_IPS[0] || 'localhost';

// ── Express ──────────────────────────────────────────────
const app = express();
app.use(express.json({ limit: '15mb' })); // M5: 10초 더빙 음성엔 충분
app.use(express.static(path.join(ROOT, 'public')));
app.use('/clips',   express.static(CLIPS_DIR));    // 동영상 range 스트리밍 자동 지원
app.use('/outputs', express.static(OUTPUTS_DIR));

app.get('/api/genres', (req, res) => {
  const genres = GENRES.map(g => ({
    ...g,
    ready: fs.existsSync(path.join(CLIPS_DIR, g.id + '.mp4')),
  }));
  res.json({
    filmTitle: config.filmTitle || '잉키 보이스 시네마',
    durationSec: config.clipDurationSec || 10,
    saveMode: (config.appsScriptUrl && config.appsScriptUrl.trim()) ? 'drive' : 'local',
    genres,
  });
});

const MERGE_TIMEOUT_MS = 30 * 1000;

// 영상(무음 클립) + 녹음 음성 합성 → mp4
// 감사 발견 반영: ffmpeg가 멈춰도 프로세스가 무한정 남지 않도록 타임아웃 후 강제 종료한다.
function mergeClip(genreId, audioPath, outPath) {
  return new Promise((resolve, reject) => {
    const videoPath = path.join(CLIPS_DIR, genreId + '.mp4');
    if (!fs.existsSync(videoPath)) return reject(new Error('클립 없음: ' + genreId + '.mp4'));
    const args = [
      '-y',
      '-i', videoPath,            // 0: 영상
      '-i', audioPath,            // 1: 더빙 음성
      '-map', '0:v:0',            // 영상 트랙만
      '-map', '1:a:0',            // 더빙 음성만 (원본 영상 소리는 무시)
      '-c:v', 'libx264', '-preset', 'veryfast', '-pix_fmt', 'yuv420p',
      '-c:a', 'aac', '-b:a', '160k',
      '-shortest',                // 영상 길이에 맞춤
      '-movflags', '+faststart',  // 모바일 즉시 재생
      outPath,
    ];
    const p = spawn(ffmpegPath, args);
    let err = '', settled = false;
    const timer = setTimeout(() => { try{ p.kill('SIGKILL'); }catch(e){} }, MERGE_TIMEOUT_MS);
    const finish = (fn, arg) => { if (settled) return; settled = true; clearTimeout(timer); fn(arg); };
    p.stderr.on('data', d => { err += d.toString(); });
    p.on('error', e => finish(reject, e));
    p.on('close', code => finish(code === 0 ? resolve : reject, code === 0 ? outPath : new Error('영상 합성 실패\n' + err.slice(-600))));
  });
}

// 구글 드라이브 업로드 (Apps Script 웹앱으로 서버-투-서버 POST)
// C1: 타임아웃 추가 — 지연 시 예외를 던져 로컬 폴백으로 전환
async function uploadToDrive(filePath, filename) {
  const url = config.appsScriptUrl.trim();
  const dataBase64 = fs.readFileSync(filePath).toString('base64');
  const body = JSON.stringify({ filename, mimeType: 'video/mp4', dataBase64 });
  const ctrl = new AbortController();
  const timer = setTimeout(() => ctrl.abort(), DRIVE_TIMEOUT_MS);
  try {
    const resp = await fetch(url, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body,
      signal: ctrl.signal,        // 60초 내 응답 없으면 중단
    });
    const text = await resp.text();
    let json;
    try { json = JSON.parse(text); }
    catch (e) { throw new Error('드라이브 응답 파싱 실패: ' + text.slice(0, 200), { cause: e }); }
    if (!json.ok) throw new Error('드라이브 저장 실패: ' + (json.error || 'unknown'));
    return json.url;
  } finally {
    clearTimeout(timer);
  }
}

// 감사 발견 반영: 동시 요청 제한 없이는 같은 와이파이의 누구든 반복 요청으로
// ffmpeg 프로세스를 무제한 만들어 노트북 CPU를 포화시킬 수 있었다.
const MAX_CONCURRENT_MERGE = 2;
let activeMerges = 0;

// 더빙 저장 처리
app.post('/api/dub', async (req, res) => {
  const { genre, audioBase64 } = req.body || {};
  if (!genre || !audioBase64) return res.status(400).json({ ok: false, error: '잘못된 요청' });
  if (!GENRE_IDS.has(genre))  return res.status(400).json({ ok: false, error: '알 수 없는 장르' }); // H1
  if (activeMerges >= MAX_CONCURRENT_MERGE) {
    return res.status(429).json({ ok: false, error: '지금 다른 학생의 영화를 만드는 중이에요 — 잠시 후 다시 눌러 주세요' });
  }

  const ts = Date.now();
  const token = crypto.randomBytes(6).toString('hex'); // H2: 추측 불가 파일명
  const audioPath = path.join(TMP_DIR, `a_${ts}_${token}.webm`);
  const outName = `dub_${genre}_${ts}_${token}.mp4`;
  const outPath = path.join(OUTPUTS_DIR, outName);
  // 배너가 나열하는 LAN IP 중 첫 번째(LAN_IP)가 실제로 접속에 쓰인 IP가 아닐 수 있어
  // (가상 어댑터가 먼저 잡히는 경우), 이 요청이 실제로 도착한 주소(req의 Host 헤더)를 그대로 쓴다.
  const localUrl = `${req.protocol}://${req.get('host') || (LAN_IP + ':' + HTTP_PORT)}/outputs/${outName}`;

  activeMerges++;
  try {
    fs.writeFileSync(audioPath, Buffer.from(audioBase64, 'base64'));
    await mergeClip(genre, audioPath, outPath);

    // C1: 드라이브 실패/지연이 학생 체험을 막지 않도록 로컬 폴백
    let shareUrl = localUrl;
    let saved = 'local';
    if (config.appsScriptUrl && config.appsScriptUrl.trim()) {
      try {
        shareUrl = await uploadToDrive(outPath, outName);
        saved = 'drive';
      } catch (e) {
        console.error('[드라이브 실패 → 로컬 폴백]', e.message);
        saved = 'local_fallback';   // 파일은 outputs 폴더에 안전하게 보존됨
      }
    }
    const qr = await QRCode.toDataURL(shareUrl, { width: 560, margin: 1, color: { dark: '#0c1330', light: '#ffffff' } });
    res.json({ ok: true, url: shareUrl, qr, saved });
  } catch (e) {
    console.error('[dub 오류]', e.message);
    fs.unlink(outPath, () => {}); // 합성 실패로 남았을 수 있는 부분 파일 정리
    res.status(500).json({ ok: false, error: e.message });
  } finally {
    activeMerges--;
    fs.unlink(audioPath, () => {});
  }
});

// ── C2: 기동 시 클립 점검 (존재 + 코덱) ──────────────────
function checkClips() {
  const notes = [];
  for (const g of GENRES) {
    const p = path.join(CLIPS_DIR, g.id + '.mp4');
    if (!fs.existsSync(p)) { notes.push(`   ⚠ ${g.name}(${g.id}.mp4) 없음 → 화면에 "준비중" 표시`); continue; }
    try {
      const r = spawnSync(ffmpegPath, ['-hide_banner', '-i', p], { encoding: 'utf8', timeout: 8000 });
      const info = (r.stderr || '') + (r.stdout || '');
      if (/Video:\s*hevc/i.test(info)) {
        notes.push(`   ✖ ${g.id}.mp4 → HEVC(H.265) 코덱! 브라우저 재생 불가 가능 — H.264로 다시 내보내세요`);
      } else if (/Video:/i.test(info) && !/Video:\s*h264/i.test(info)) {
        notes.push(`   ⚠ ${g.id}.mp4 → H.264가 아닌 코덱 — 재생 문제 가능`);
      }
    } catch (e) { /* 점검 실패는 무시(운영엔 지장 없음) */ }
  }
  if (notes.length) {
    console.log('   [클립 점검]');
    notes.forEach(n => console.log(n));
    console.log('');
  } else {
    console.log('   [클립 점검]  6개 장르 모두 정상 (H.264)\n');
  }
}

// ── 서버 기동 (http + https 동시) ──────────────────────────
function banner() {
  const mode = (config.appsScriptUrl && config.appsScriptUrl.trim())
    ? '구글 드라이브 (실패 시 로컬 자동 대체)'
    : '로컬(같은 와이파이 다운로드)';
  console.log('\n══════════════════════════════════════════════════');
  console.log('   🎬  잉키 보이스 시네마 (INKY Voice Cinema) v1.1');
  console.log('══════════════════════════════════════════════════');
  console.log(`   이 노트북에서 사용  →  http://localhost:${HTTP_PORT}`);
  if (LAN_IPS.length === 0) {
    console.log('   태블릿/폰에서 사용  →  (네트워크 연결 없음)');
  } else {
    console.log(`   태블릿/폰에서 사용  →  https://${LAN_IPS[0]}:${HTTPS_PORT}`);
    for (let i = 1; i < Math.min(LAN_IPS.length, 4); i++) {
      console.log(`                          https://${LAN_IPS[i]}:${HTTPS_PORT}  (위가 안 되면 이 주소)`);
    }
    console.log('      (같은 와이파이 연결 + 보안경고는 "계속/방문" 선택)');
  }
  console.log(`   저장 모드           :  ${mode}`);
  console.log('   종료                :  이 창에서  Ctrl + C');
  console.log('══════════════════════════════════════════════════\n');
  checkClips();
}

// 감사 발견 반영: 포트가 이미 다른 프로그램에 쓰이고 있으면(EADDRINUSE)
// 기존엔 안내 없이 영어 스택트레이스와 함께 죽었다 — 비개발자 운영자가 현장에서
// 원인을 알 수 없었다. 한국어 안내 후 종료하도록 고친다.
function portErrorGuide(port) {
  return (err) => {
    if (err.code === 'EADDRINUSE') {
      console.error(`\n[포트 오류] ${port}번 포트를 다른 프로그램이 이미 쓰고 있습니다.`);
      console.error('  다른 잉키 보이스 시네마 창이 이미 실행 중인지 확인하거나, 컴퓨터를 재시작한 뒤 다시 실행하세요.\n');
      process.exit(1);
    } else {
      console.error('[서버 오류]', err.message);
      process.exit(1);
    }
  };
}

http.createServer(app).on('error', portErrorGuide(HTTP_PORT)).listen(HTTP_PORT, () => banner());

// https: 태블릿 마이크 사용에 필요한 보안 컨텍스트 제공 (자체 서명 인증서)
// H5: IP 구성이 바뀌면(행사장 이동 등) 인증서 자동 재발급
try {
  const keyP = path.join(CERT_DIR, 'key.pem');
  const crtP = path.join(CERT_DIR, 'cert.pem');
  const ipsP = path.join(CERT_DIR, 'ips.txt');
  const ipsNow = LAN_IPS.join(',') || 'localhost';

  let creds = null;
  const reuse = fs.existsSync(keyP) && fs.existsSync(crtP) && fs.existsSync(ipsP)
    && fs.readFileSync(ipsP, 'utf8').trim() === ipsNow;

  if (reuse) {
    creds = { key: fs.readFileSync(keyP), cert: fs.readFileSync(crtP) };
  } else {
    const altNames = [
      { type: 2, value: 'localhost' },
      { type: 7, ip: '127.0.0.1' },
      ...LAN_IPS.map(ip => ({ type: 7, ip })),
    ];
    const pems = selfsigned.generate(
      [{ name: 'commonName', value: LAN_IP }],
      { days: 3650, keySize: 2048, altNames }
    );
    fs.writeFileSync(keyP, pems.private);
    fs.writeFileSync(crtP, pems.cert);
    fs.writeFileSync(ipsP, ipsNow);
    creds = { key: pems.private, cert: pems.cert };
  }
  https.createServer(creds, app).on('error', portErrorGuide(HTTPS_PORT)).listen(HTTPS_PORT);
} catch (e) {
  console.log('⚠️  https 비활성화(노트북 localhost는 정상 동작):', e.message);
}
