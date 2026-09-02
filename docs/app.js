"use strict";
import { FFmpeg } from './vendor/ffmpeg/index.js';
import { fetchFile } from './vendor/ffmpeg-util/index.js';
import { pickAudioExtension, buildUploadFilename, pickSupportedMime, shouldRetryUpload } from './logic.js';
import { initializeApp, initializeAppCheck, ReCaptchaEnterpriseProvider, getToken } from './vendor/firebase/firebase-app-check.js';

// @ffmpeg/util의 toBlobURL(progress=true)는 스트림 리더가 도중에 실패하면
// 이미 읽은 Response.body를 다시 arrayBuffer()로 읽으려다
// "body stream already read" 오류를 내는 버그가 있다(실사이트에서 재현 확인됨).
// 그 경로를 피해 직접 fetch+진행률을 구현한다.
async function toBlobURLWithProgress(url, mimeType, onProgress){
  const resp = await fetch(url);
  if (!resp.ok) throw new Error(`엔진 파일 다운로드 실패: ${resp.status} ${url}`);
  const total = parseInt(resp.headers.get('content-length') || '-1', 10);
  const reader = resp.body ? resp.body.getReader() : null;
  if (!reader) {
    const buf = await resp.arrayBuffer();
    return URL.createObjectURL(new Blob([buf], { type: mimeType }));
  }
  const chunks = [];
  let received = 0;
  for(;;){
    const { done, value } = await reader.read();
    if (done) break;
    chunks.push(value);
    received += value.length;
    if (onProgress && total > 0) onProgress(received, total);
  }
  return URL.createObjectURL(new Blob(chunks, { type: mimeType }));
}

// ── 설정 ──
const DUR = 10;
// Firebase 프로젝트 배포 후, 실제 발급된 함수 URL로 아래 한 줄만 바꾸면 된다.
const API_BASE = 'https://asia-northeast3-inky-voice-cinema.cloudfunctions.net/voiceCinema';
// functions/index.js의 BOOTH_TOKEN과 반드시 같은 값이어야 한다. 진짜 비밀이 아니라
// (이 파일 자체가 공개다) URL만 아는 자동화 스크립트의 무차별 업로드를 막는 1차 방어선일 뿐이다.
const BOOTH_TOKEN = 'ac3231330f737aaf7f90c825f7ddacc9e287b3ac87caf99d';
// 종합감사(2026-09-01) D2 반영, 2026-09-02 사이트 키 발급 완료 후 연결.
// apiKey는 Firebase 웹앱 식별용일 뿐 진짜 비밀이 아니다 — 실제 보호는 App Check 토큰 검증이 한다.
const FIREBASE_CONFIG = {
  apiKey: 'AIzaSyC9q2j284NR82lYfO9hwFwdMdwtj2LeFGE',
  authDomain: 'inky-voice-cinema.firebaseapp.com',
  projectId: 'inky-voice-cinema',
  storageBucket: 'inky-voice-cinema.firebasestorage.app',
  messagingSenderId: '710797378638',
  appId: '1:710797378638:web:5d8b0fe73666bb84026f1f',
};
const RECAPTCHA_ENTERPRISE_SITE_KEY = '6LdZY6QtAAAAAAqN9jOJRravmX7C7FuwvJpQ6Gm9';
// 대표 지시(2026-09-03, 라이브 스크린샷 보고 장르 선택 화면 개편) — 이모지 대신
// Lucide 아이콘(lucide-static@1.39.0, ISC 라이선스)의 원본 SVG 마크업을 그대로
// 인라인으로 박아둔다. CSP가 script-src 'self'라 런타임에 CDN에서 아이콘 라이브러리를
// 불러올 수 없어서, 빌드 시점(이 파일 작성 시)에 필요한 아이콘 6개만 직접 벤더링했다.
const GENRE_ICONS = {
  fantasy: '<path d="m21.64 3.64-1.28-1.28a1.21 1.21 0 0 0-1.72 0L2.36 18.64a1.21 1.21 0 0 0 0 1.72l1.28 1.28a1.2 1.2 0 0 0 1.72 0L21.64 5.36a1.2 1.2 0 0 0 0-1.72" /><path d="m14 7 3 3" /><path d="M5 6v4" /><path d="M19 14v4" /><path d="M10 2v2" /><path d="M7 8H3" /><path d="M21 16h-4" /><path d="M11 3H9" />',
  animation: '<path d="M12 22a1 1 0 0 1 0-20 10 9 0 0 1 10 9 5 5 0 0 1-5 5h-2.25a1.75 1.75 0 0 0-1.4 2.8l.3.4a1.75 1.75 0 0 1-1.4 2.8z" /><circle cx="13.5" cy="6.5" r=".5" fill="currentColor" /><circle cx="17.5" cy="10.5" r=".5" fill="currentColor" /><circle cx="6.5" cy="12.5" r=".5" fill="currentColor" /><circle cx="8.5" cy="7.5" r=".5" fill="currentColor" />',
  horror: '<path d="M15 10v1" /><path d="M7.528 20.472a1.6 1.6 0 0 1 2.277 0l1.057 1.056a1.6 1.6 0 0 0 2.276 0l1.057-1.056a1.6 1.6 0 0 1 2.277 0l1.114 1.114a1.4 1.4 0 0 0 2.414-1V10a8 8 0 0 0-16 0v10.586a1.4 1.4 0 0 0 2.414 1z" /><path d="M9 10v1" />',
  action: '<path d="M15.914 4a1.5 1.5 0 0 0-2.474-1.561l-9 9A1.5 1.5 0 0 0 5.5 14h4.002a.5.5 0 0 1 .471.666L8.086 20a1.5 1.5 0 0 0 2.475 1.56l9-9A1.5 1.5 0 0 0 18.5 10h-3.997a.5.5 0 0 1-.472-.667z" />',
  drama: '<path d="M10 11h.01" /><path d="M14 6h.01" /><path d="M18 6h.01" /><path d="M6.5 13.1h.01" /><path d="M22 5c0 9-4 12-6 12s-6-3-6-12c0-2 2-3 6-3s6 1 6 3" /><path d="M17.4 9.9c-.8.8-2 .8-2.8 0" /><path d="M10.1 7.1C9 7.2 7.7 7.7 6 8.6c-3.5 2-4.7 3.9-3.7 5.6 4.5 7.8 9.5 8.4 11.2 7.4.9-.5 1.9-2.1 1.9-4.7" /><path d="M9.1 16.5c.3-1.1 1.4-1.7 2.4-1.4" />',
  sitcom: '<path d="M15 10V9" /><path d="M7.084 14.302a5.12 5.12 0 0 0 9.833 0 .24.24 0 0 0-.235-.302H7.32a.24.24 0 0 0-.235.302" /><path d="M9 10V9" /><circle cx="12" cy="12" r="10" />',
};
// 2026-09-03 대표 지시: 원래 색이 너무 원색이라 "저렴해 보인다"는 피드백 —
// 채도를 낮추고 톤을 깊게 눌러 보석빛(자수정/구리/에메랄드/가넷/앤틱골드/사파이어)
// 느낌으로 업그레이드했다.
const GENRES = [
  { id: 'fantasy',   name: '판타지',     color: '#8a63d2' },
  { id: 'animation', name: '애니메이션', color: '#d97b3f' },
  { id: 'horror',    name: '호러',       color: '#2f9e6e' },
  { id: 'action',    name: '액션',       color: '#c94f5c' },
  { id: 'drama',     name: '드라마',     color: '#c9a24b' },
  { id: 'sitcom',    name: '시트콤',     color: '#3f7fb8' },
];
const GENRE_SUB = {fantasy:'주문을 외쳐봐!', animation:'친구와 대화하기', horror:'으악! 비명 연기', action:'멋진 한마디', drama:'감정을 담아서', sitcom:'웃음 빵! 만담'};
// 마우스 호버가 실제로 되는 입력장치(데스크탑 마우스)에서만 썸네일 호버 재생을 켠다 —
// 터치스크린(행사장 태블릿 등)은 hover 개념 자체가 없어 클립을 미리 받을 이유가 없다.
const SUPPORTS_HOVER_PREVIEW = window.matchMedia && window.matchMedia('(hover: hover) and (pointer: fine)').matches;

let current = null;
let micStream = null, recorder = null, chunks = [], recMime = '', recordedBlob = null, busy = false, previewing = false;
let session = 0;
let recTimer = null;
let saving = false;
let replayAudio = null, replayUrl = null;
let fallbackObjUrl = null; // 감사 발견 반영: 클라우드 업로드 실패 시 폴백 다운로드용 blob URL 회수용

const $ = s => document.querySelector(s);
const show = (id) => { document.querySelectorAll('.view').forEach(v=>v.classList.remove('active')); $('#'+id).classList.add('active'); };

// ── ffmpeg.wasm 지연 로딩 (첫 저장 전에 미리 백그라운드로 준비) ──
let ffmpeg = null, ffmpegLoading = null;
function getFFmpeg(){
  if (ffmpeg) return Promise.resolve(ffmpeg);
  if (ffmpegLoading) return ffmpegLoading;
  const bar = $('#enginebar'), prog = $('#engineProg');
  bar.classList.remove('err');
  bar.classList.add('show');
  prog.textContent = '0%';
  ffmpegLoading = (async () => {
    const inst = new FFmpeg();
    const base = new URL('./vendor/ffmpeg-core/', import.meta.url).href;
    const coreURL = await toBlobURLWithProgress(base + 'ffmpeg-core.js', 'text/javascript');
    const wasmURL = await toBlobURLWithProgress(base + 'ffmpeg-core.wasm', 'application/wasm', (received, total) => {
      prog.textContent = Math.round((received/total)*100) + '%';
    });
    await inst.load({ coreURL, wasmURL });
    ffmpeg = inst;
    bar.classList.remove('show');
    return inst;
  })().catch(e => {
    ffmpegLoading = null;
    prog.textContent = '실패 — 저장 시 다시 시도됩니다';
    bar.classList.add('err');
    console.error('[엔진 준비 실패]', e);
    throw e;
  });
  return ffmpegLoading;
}

// ── Firebase App Check (2026-09-02) — /upload를 BOOTH_TOKEN에 더해 이중으로 보호한다.
// 초기화 실패(네트워크 차단 등)는 조용히 던지게 두고, 호출부(uploadOnce)가 그 실패를
// 그대로 업로드 실패로 처리해 기존 로컬 폴백 경로를 그대로 타게 한다 — 별도 처리 불필요.
let appCheckInstance = null;
function getAppCheckInstance(){
  if (!appCheckInstance) {
    const app = initializeApp(FIREBASE_CONFIG);
    appCheckInstance = initializeAppCheck(app, {
      provider: new ReCaptchaEnterpriseProvider(RECAPTCHA_ENTERPRISE_SITE_KEY),
      isTokenAutoRefreshEnabled: true,
    });
  }
  return appCheckInstance;
}
async function getAppCheckHeaderToken(){
  const result = await getToken(getAppCheckInstance());
  return result.token;
}

// ── 영상(무음 클립) + 녹음 음성 합성 (브라우저 내부, 서버 없이) ──
async function mergeClip(genreId, audioBlob, mime){
  const ff = await getFFmpeg();
  const ext = pickAudioExtension(mime);
  const log = [];
  const onLog = ({ message }) => log.push(message);
  ff.on('log', onLog);
  let ret;
  try{
    await ff.writeFile('v.mp4', await fetchFile(`./clips/${genreId}.mp4`));
    await ff.writeFile('a.' + ext, await fetchFile(audioBlob));
    ret = await ff.exec([
      '-i', 'v.mp4', '-i', 'a.' + ext,
      '-map', '0:v:0', '-map', '1:a:0',
      '-c:v', 'copy',
      '-c:a', 'aac', '-b:a', '160k',
      '-shortest',
      '-movflags', '+faststart',
      'out.mp4',
    ]);
  } finally {
    ff.off('log', onLog);
  }
  // exec()는 실패해도 예외를 던지지 않고 0이 아닌 코드만 반환하므로,
  // 여기서 직접 확인하지 않으면 readFile()에서 "FS error"라는 알아보기 힘든
  // 에러로만 나타나 원인(오디오 디코딩 실패 등)이 감춰진다.
  if (ret !== 0) {
    await Promise.all(['v.mp4', 'a.' + ext, 'out.mp4'].map(f => ff.deleteFile(f).catch(()=>{})));
    throw new Error('영상 합성 실패\n' + log.slice(-8).join('\n'));
  }
  const data = await ff.readFile('out.mp4');
  await Promise.all(['v.mp4', 'a.' + ext, 'out.mp4'].map(f => ff.deleteFile(f).catch(()=>{})));
  return new Blob([data.buffer], { type: 'video/mp4' });
}

// ── Firebase Storage 업로드 (Cloud Functions 경유, 브라우저에서 직접 호출) ──
async function uploadOnce(dataBase64, filename){
  const body = JSON.stringify({ filename, mimeType: 'video/mp4', dataBase64 });
  // App Check 토큰 발급 자체가 실패해도(reCAPTCHA 차단 등) 여기서 미리 포기하지 않고
  // 헤더 없이 그대로 요청을 보낸다 — 실제 보안 판단은 서버(functions/index.js)가
  // 토큰 유무로 하므로, 클라이언트가 먼저 던지든 서버가 401을 주든 최종적으로
  // 겪는 재시도/폴백 결과는 동일하다. 헤더를 붙일 수 있을 때 붙이는 정도로 충분하다.
  let appCheckToken = '';
  try { appCheckToken = await getAppCheckHeaderToken(); }
  catch (e) { console.warn('[App Check 토큰 발급 실패]', e && e.message); }
  const ctrl = new AbortController();
  const timer = setTimeout(() => ctrl.abort(), 60000);
  try {
    const resp = await fetch(`${API_BASE}/upload`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'x-booth-token': BOOTH_TOKEN, 'X-Firebase-AppCheck': appCheckToken },
      body,
      signal: ctrl.signal,
    });
    const text = await resp.text();
    let json;
    try { json = JSON.parse(text); }
    catch (e) { throw new Error('저장 응답 파싱 실패: ' + text.slice(0, 200), { cause: e }); }
    if (!json.ok) throw new Error('영상 저장 실패: ' + (json.error || 'unknown'));
    return json.url;
  } finally {
    clearTimeout(timer);
  }
}

// 감사 발견 반영: 부스 와이파이는 순간적으로 끊기는 일이 흔한데 재시도가 0회면
// 그 한 번의 끊김만으로 영구히 로컬 폴백으로 떨어졌다 — 1회만 재시도한다.
async function uploadToCloud(blob, filename){
  const dataBase64 = await blobToB64(blob);
  try {
    return await uploadOnce(dataBase64, filename);
  } catch (e) {
    if (!shouldRetryUpload(e)) throw e; // 이미 60초 기다렸다면 재시도해도 소용없음
    console.warn('[업로드 1차 실패, 재시도]', e && e.message);
    return await uploadOnce(dataBase64, filename);
  }
}

function makeQR(text){
  const qr = qrcode(0, 'M');
  qr.addData(text);
  qr.make();
  return qr.createDataURL(8, 8);
}

function blobToB64(blob){
  return new Promise((res,rej)=>{
    const fr = new FileReader();
    fr.onload = ()=>res(String(fr.result).split(',')[1]);
    fr.onerror = ()=>rej(new Error('인코딩 실패'));
    fr.readAsDataURL(blob);
  });
}

// ── 초기화 ──
function init(){
  $('#studioFoot').textContent = '약 ' + DUR + '초 동안 녹음돼요';
  renderGrid();
  // CSP(script-src)가 인라인 onclick="" 속성 실행을 막으므로(2026-09-01
  // Firebase Hosting 이전 후 실측으로 발견 — 모든 버튼이 죽어있었다),
  // 여기서 addEventListener로 직접 연결한다.
  $('#studioBackBtn').addEventListener('click', goHome);
  $('#previewBtn').addEventListener('click', togglePreview);
  $('#recBtn').addEventListener('click', startRecord);
  $('#replayBtn').addEventListener('click', replay);
  $('#resetBtn').addEventListener('click', resetRecord);
  $('#saveBtn').addEventListener('click', save);
  $('#doneHomeBtn').addEventListener('click', goHome);
  $('#errBackBtn').addEventListener('click', backToStudio);
  // 첫 더빙 전에 미리 엔진을 준비해 두어 저장 시 대기시간을 줄인다.
  getFFmpeg().catch(e => console.error('[ffmpeg 사전로딩 실패]', e));
  // App Check도 미리 초기화해 저장 시점의 토큰 발급 대기시간을 줄인다.
  try { getAppCheckInstance(); } catch (e) { console.error('[App Check 사전초기화 실패]', e); }
  // 감사 발견 반영: 31MB 엔진 파일을 서비스워커로 캐시해, 재부팅/캐시비움
  // 이후에도 행사장 와이파이로 매번 다시 받지 않게 한다. 실패해도 앱 동작엔
  // 지장 없으므로(HTTP 캐시로 폴백) 조용히 무시한다.
  if ('serviceWorker' in navigator) {
    navigator.serviceWorker.register('./sw.js').catch(e => console.warn('[서비스워커 등록 실패]', e));
  }
}

function iconSvg(genreId){
  return `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">${GENRE_ICONS[genreId]||''}</svg>`;
}

// 2026-09-03 발견 반영: 썸네일 <img>에 loading="lazy"를 걸었더니 실사용
// 브라우저(대표 본인 확인)에서 카드가 까맣게 보이는 문제가 재현됐다 — 이 화면은
// 절대 스크롤되지 않는 단일 뷰포트라, 뷰포트 교차 판정이 최초 페인트 시점(그리드가
// aspect-ratio로 아직 레이아웃을 확정하기 전) 크기로 잘못 계산되면 다시 재평가할
// 스크롤 이벤트 자체가 없어 영영 안 불러와질 수 있다. 썸네일 6장 합쳐 130KB
// 수준이라 지연로딩 이점도 없어, 그냥 즉시 로딩으로 바꿨다.
function renderGrid(){
  const g = $('#grid'); g.innerHTML = '';
  GENRES.forEach(x=>{
    const el = document.createElement('div');
    el.className = 'tile';
    el.style.setProperty('--c', x.color);
    el.innerHTML =
      `<div class="tile-media">
         <img class="thumb" src="./clips/thumbs/${x.id}.jpg" alt="">
         <video class="preview" muted playsinline preload="none"></video>
       </div>
       <div class="tile-tint"></div>
       <div class="tile-scrim"></div>
       <div class="tile-body">
         <div class="ic">${iconSvg(x.id)}</div>
         <div class="gname">${x.name}</div>
         <div class="gsub">${GENRE_SUB[x.id]||''}</div>
       </div>`;
    el.onclick = ()=>openStudio(x);
    if (SUPPORTS_HOVER_PREVIEW) wireTilePreview(el, x.id);
    g.appendChild(el);
  });
}

// 유튜브 썸네일 호버 재생 방식(2026-09-03, 대표 지시) — 평소엔 정지된 첫 프레임
// 이미지만 보여주다가, 마우스를 올리면 그때 영상을 내려받아 소리와 함께 재생한다.
// 6개를 전부 미리 받아두지 않는 이유: 행사장 와이파이로 78MB(6개 클립)를 화면
// 진입 즉시 받으면 첫 화면이 느려진다 — 실제로 마우스가 올라간 것만 그때 받는다.
function wireTilePreview(el, genreId){
  const img = el.querySelector('.thumb');
  const video = el.querySelector('.preview');
  let hoverToken = 0;

  el.addEventListener('mouseenter', () => {
    const myToken = ++hoverToken;
    if (!video.src) video.src = './clips/' + genreId + '.mp4';
    video.currentTime = 0;
    video.muted = false;
    const showVideo = () => { if (myToken === hoverToken) { img.style.opacity = '0'; video.style.opacity = '1'; } };
    video.play().then(showVideo).catch(() => {
      // 브라우저가 소리 있는 자동재생을 막으면(정책상 마우스 호버는 클릭만큼
      // 확실한 사용자 제스처로 안 쳐줄 수 있음) 무음으로라도 재생을 시도한다.
      video.muted = true;
      video.play().then(showVideo).catch(()=>{});
    });
  });
  el.addEventListener('mouseleave', () => {
    hoverToken++;
    video.pause();
    img.style.opacity = '1';
    video.style.opacity = '0';
  });
}

// ── 스튜디오 진입 ──
function openStudio(g){
  current = g;
  $('#chipEmoji').innerHTML = iconSvg(g.id);
  $('#chipEmoji').style.color = g.color;
  $('#chipName').textContent = g.name;
  const v = $('#clip');
  v.src = './clips/' + g.id + '.mp4';
  v.muted = true; v.currentTime = 0; v.load();
  v.onerror = () => {
    try{ if(recorder && recorder.state!=='inactive') recorder.stop(); }catch(e){}
    clearTimeout(recTimer);
    $('#hint').textContent = '⚠ 영상을 재생할 수 없어요 — 운영자에게 알려주세요 (클립 파일 점검 필요)';
  };
  resetRecord();
  show('studio');
}
function goHome(){ session++; stopAll(); show('home'); }
function backToStudio(){ show('studio'); }

function resetRecord(){
  session++;
  clearTimeout(recTimer);
  stopReplayAudio();
  if (fallbackObjUrl) { URL.revokeObjectURL(fallbackObjUrl); fallbackObjUrl = null; }
  recordedBlob = null; chunks = []; busy = false; previewing = false;
  $('#recBtn').style.display = '';
  $('#recBtn').disabled = false;
  const pb = $('#previewBtn'); if(pb){ pb.style.display = ''; pb.textContent = '▶ 미리 보기'; }
  $('#afterRow').style.display = 'none';
  $('#recpill').classList.remove('show');
  $('#progress').classList.remove('show');
  $('#bar').style.width = '0%';
  $('#hint').textContent = '먼저 [미리 보기]로 영상을 확인하고, 준비되면 녹음하세요';
  const v = $('#clip'); if(v){ v.pause(); v.currentTime = 0; v.muted = true; v.ontimeupdate = null; v.onended = null; }
}
function stopAll(){
  previewing = false;
  clearTimeout(recTimer);
  stopReplayAudio();
  try{ if(recorder && recorder.state!=='inactive') recorder.stop(); }catch(e){}
  const v = $('#clip'); if(v){ v.pause(); }
}

function stopReplayAudio(){
  if(replayAudio){ try{ replayAudio.pause(); }catch(e){} replayAudio = null; }
  if(replayUrl){ try{ URL.revokeObjectURL(replayUrl); }catch(e){} replayUrl = null; }
}

// ── 미리 보기 ──
function togglePreview(){
  if(busy) return;
  if(previewing){ stopPreview(); return; }
  const v = $('#clip');
  previewing = true;
  v.muted = false;
  v.currentTime = 0;
  $('#previewBtn').textContent = '⏹ 미리보기 정지';
  $('#hint').textContent = '👀 영상을 보며 어떤 더빙을 할지 생각해 보세요';
  $('#progress').classList.add('show');
  v.ontimeupdate = () => { if(v.duration) $('#bar').style.width = Math.min(100,(v.currentTime/v.duration)*100) + '%'; };
  v.onended = () => stopPreview();
  v.play().catch(()=>{});
}
function stopPreview(){
  const v = $('#clip');
  previewing = false;
  v.pause(); v.currentTime = 0; v.muted = true;
  v.ontimeupdate = null; v.onended = null;
  $('#previewBtn').textContent = '▶ 미리 보기';
  $('#hint').textContent = '준비됐나요? [녹음 시작]을 누르면 3·2·1 후 시작돼요';
  $('#progress').classList.remove('show');
  $('#bar').style.width = '0%';
}

// ── 마이크 권한 ──
async function ensureMic(){
  if(micStream) return true;
  if(!window.isSecureContext){
    $('#hint').innerHTML = '⚠️ 이 페이지는 https 주소여야 마이크가 켜져요';
    return false;
  }
  try{
    micStream = await navigator.mediaDevices.getUserMedia({ audio: { echoCancellation:true, noiseSuppression:true } });
    return true;
  }catch(e){
    $('#hint').textContent = '⚠️ 마이크 사용을 허용해 주세요 (브라우저 권한)';
    return false;
  }
}

// ── 녹음 ──
async function startRecord(){
  if(busy) return;
  if(previewing) stopPreview();
  const mySession = session;
  const ok = await ensureMic();
  if(!ok || mySession !== session) return;
  busy = true;
  recordedBlob = null; chunks = [];
  $('#recBtn').disabled = true;
  $('#previewBtn').style.display = 'none';

  await countdown(3);
  if(mySession !== session){ busy = false; return; }

  const v = $('#clip');
  v.muted = true; v.currentTime = 0;

  try{
    recMime = pickSupportedMime(['audio/webm;codecs=opus','audio/webm','audio/mp4'], m => MediaRecorder.isTypeSupported(m));
    recorder = recMime ? new MediaRecorder(micStream,{mimeType:recMime}) : new MediaRecorder(micStream);
  }catch(e){
    micStream = null;
    busy = false;
    $('#recBtn').disabled = false;
    $('#previewBtn').style.display = '';
    $('#hint').textContent = '⚠ 마이크에 문제가 생겼어요 — 연결 확인 후 다시 눌러 주세요';
    return;
  }
  recorder.ondataavailable = e => { if(e.data && e.data.size) chunks.push(e.data); };
  recorder.onstop = () => {
    clearTimeout(recTimer);
    if(mySession !== session){ chunks = []; return; }
    recordedBlob = new Blob(chunks, { type: (chunks[0] && chunks[0].type) || 'audio/webm' });
    onRecordDone();
  };

  $('#recpill').classList.add('show');
  $('#progress').classList.add('show');
  $('#hint').textContent = '🎙️ 지금 목소리를 연기해 보세요!';

  await v.play().catch(()=>{});
  if(mySession !== session){ v.pause(); busy = false; return; }
  try{
    recorder.start();
  }catch(e){
    micStream = null;
    busy = false;
    $('#recBtn').disabled = false;
    $('#previewBtn').style.display = '';
    $('#hint').textContent = '⚠ 녹음을 시작하지 못했어요 — 다시 눌러 주세요';
    return;
  }

  const limitSec = (isFinite(v.duration) && v.duration > 0 ? v.duration : DUR) + 2;
  clearTimeout(recTimer);
  recTimer = setTimeout(()=>{ try{ if(recorder && recorder.state!=='inactive') recorder.stop(); }catch(e){} }, limitSec * 1000);

  v.ontimeupdate = () => { if(v.duration) $('#bar').style.width = Math.min(100,(v.currentTime/v.duration)*100) + '%'; };
  v.onended = () => { try{ if(recorder.state!=='inactive') recorder.stop(); }catch(e){} };
}

function countdown(n){
  return new Promise(res=>{
    const ov = $('#overlay'), c = $('#count');
    ov.classList.add('show');
    let k = n;
    c.textContent = k;
    c.style.animation = 'none'; void c.offsetWidth; c.style.animation = '';
    const t = setInterval(()=>{
      k--;
      if(k<=0){ clearInterval(t); ov.classList.remove('show'); res(); return; }
      c.textContent = k; c.style.animation='none'; void c.offsetWidth; c.style.animation='';
    },900);
  });
}

function onRecordDone(){
  busy = false;
  clearTimeout(recTimer);
  $('#recpill').classList.remove('show');
  $('#recBtn').style.display = 'none';
  $('#afterRow').style.display = 'flex';
  $('#bar').style.width = '100%';
  $('#hint').textContent = '잘했어요! 다시 듣고, 마음에 들면 저장하세요';
  const v = $('#clip'); v.pause(); v.currentTime = 0;
}

// ── 재생(영상+내 목소리) ──
function replay(){
  if(!recordedBlob) return;
  stopReplayAudio();
  const v = $('#clip');
  v.muted = true; v.currentTime = 0;
  replayUrl = URL.createObjectURL(recordedBlob);
  replayAudio = new Audio(replayUrl);
  v.play().catch(()=>{});
  replayAudio.play().catch(()=>{});
  v.onended = () => stopReplayAudio();
  $('#hint').textContent = '▶ 내 더빙 영화 재생 중…';
}

function showError(title, msg){
  const box = $('#errbox');
  box.innerHTML = '';
  const b = document.createElement('b'); b.textContent = title;
  box.appendChild(b);
  box.appendChild(document.createElement('br'));
  box.appendChild(document.createTextNode(msg));
  box.classList.add('show');
  $('#errRow').style.display = 'flex';
}

// ── 저장 → (브라우저 내부) 합성 → 클라우드 업로드 → QR ──
async function save(){
  if(!recordedBlob || saving){ return; }
  saving = true;
  stopReplayAudio();
  show('result');
  $('#loading').style.display=''; $('#done').style.display='none';
  $('#errbox').classList.remove('show'); $('#errRow').style.display='none';
  $('#loadingTitle').textContent = '영화를 만들고 있어요…';
  $('#loadingSub').textContent = '목소리를 영상에 입히는 중입니다';

  let mergedBlob;
  try{
    mergedBlob = await mergeClip(current.id, recordedBlob, recMime);
  }catch(e){
    $('#loading').style.display='none';
    showError('영상 합성 중 문제가 생겼어요.', String(e && e.message || e) + ' (녹음은 남아 있어요, [돌아가기] 후 다시 저장해 보세요)');
    saving = false;
    return;
  }

  $('#loadingTitle').textContent = '저장하고 있어요…';
  $('#loadingSub').textContent = '완성된 영화를 전달 중입니다';

  let shareUrl = null, saved;
  try{
    // 파일이 makePublic()으로 공개되므로, 파일명을 밀리초 타임스탬프만으로 지으면
    // 행사 중 좁은 시간대를 순차 대입해 다른 학생의 영상 URL을 추측할 수 있다 —
    // 추측 불가능한 무작위 토큰을 덧붙인다(설치판 server.js의 H2 조치와 동일한 목적).
    const token = crypto.getRandomValues(new Uint8Array(6)).reduce((s, b) => s + b.toString(16).padStart(2, '0'), '');
    shareUrl = await uploadToCloud(mergedBlob, buildUploadFilename(current.id, Date.now(), token));
    saved = 'cloud';
  }catch(e){
    console.error('[클라우드 저장 실패]', e.message);
    saved = 'local_fallback';
  }

  $('#loading').style.display='none'; $('#done').style.display='';
  if(saved === 'cloud'){
    $('#qrImg').src = makeQR(shareUrl);
    $('#qrbox').style.display = 'inline-block';
    $('#downloadRow').style.display = 'none';
    $('#doneMsg').textContent = '휴대폰 카메라로 QR을 스캔하면 내 영화를 받을 수 있어요';
    // 감사 발견 반영: 실제 공유범위(링크를 아는 사람은 누구나 볼 수 있음)와
    // 안내 문구가 어긋나 있었다 — 화면에 명시한다.
    $('#savemode').textContent = '클라우드에 저장되었습니다 (이 QR/링크를 아는 사람은 누구나 볼 수 있어요, 11/30까지)';
  }else{
    $('#qrbox').style.display = 'none';
    $('#downloadRow').style.display = 'flex';
    $('#doneMsg').textContent = '인터넷 문제로 자동 전달이 안 됐어요 — 아래 버튼으로 이 기기에 저장하고 운영자에게 알려주세요';
    // 종합감사(2026-09-01) 발견 반영: 이 폴백 사본은 dubs/ 자동삭제(12/1) 대상이
    // 아니라 부스 기기 다운로드 폴더에 그대로 남는다 — 아동 음성이므로 전달 뒤
    // 운영자가 직접 지워야 한다는 걸 화면에 명시한다.
    $('#savemode').textContent = '⚠ 클라우드 업로드 실패 — 이 기기 다운로드 폴더에만 저장됨 (학생에게 전달 후 운영자가 이 파일을 꼭 삭제해 주세요 — 자동삭제 대상 아님)';
    if (fallbackObjUrl) { URL.revokeObjectURL(fallbackObjUrl); } // 감사 발견 반영: 이전 폴백 blob 미회수
    fallbackObjUrl = URL.createObjectURL(mergedBlob);
    $('#downloadBtn').onclick = () => {
      const a = document.createElement('a');
      a.href = fallbackObjUrl; a.download = `잉키보이스시네마_${current.name}.mp4`;
      document.body.appendChild(a); a.click(); a.remove();
    };
  }
  saving = false;
}

init();
