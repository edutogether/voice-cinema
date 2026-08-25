"use strict";
import { FFmpeg } from './vendor/ffmpeg/index.js';
import { fetchFile } from './vendor/ffmpeg-util/index.js';

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

// ── 설정 (server.js/config.json과 동일한 값) ──
const FILM_TITLE = '잉키 보이스 시네마';
const DUR = 10;
const APPS_SCRIPT_URL = 'https://script.google.com/macros/s/AKfycbzT6dFfMryj1Nl872IaXC3Kv7mK8aHm-wBEoR6dfc023RlIee3nvCPf1gc5wX50MIn6-Q/exec';
const GENRES = [
  { id: 'fantasy',   name: '판타지',     emoji: '🪄', color: '#8b6cff' },
  { id: 'animation', name: '애니메이션', emoji: '🎨', color: '#ff9a3d' },
  { id: 'horror',    name: '호러',       emoji: '👻', color: '#39d59a' },
  { id: 'action',    name: '액션',       emoji: '💥', color: '#ff5470' },
  { id: 'drama',     name: '드라마',     emoji: '🌅', color: '#ffc24d' },
  { id: 'sitcom',    name: '시트콤',     emoji: '😂', color: '#4da6ff' },
];
const GENRE_SUB = {fantasy:'주문을 외쳐봐!', animation:'친구와 대화하기', horror:'으악! 비명 연기', action:'멋진 한마디', drama:'감정을 담아서', sitcom:'웃음 빵! 만담'};

let current = null;
let micStream = null, recorder = null, chunks = [], recMime = '', recordedBlob = null, busy = false, previewing = false;
let session = 0;
let recTimer = null;
let saving = false;
let replayAudio = null, replayUrl = null;

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

// ── 영상(무음 클립) + 녹음 음성 합성 (브라우저 내부, 서버 없이) ──
async function mergeClip(genreId, audioBlob, mime){
  const ff = await getFFmpeg();
  const ext = /mp4/.test(mime) ? 'm4a' : 'webm';
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

// ── 구글 드라이브 업로드 (Apps Script, 브라우저에서 직접 호출) ──
async function uploadToDrive(blob, filename){
  const dataBase64 = await blobToB64(blob);
  const body = JSON.stringify({ filename, mimeType: 'video/mp4', dataBase64 });
  const ctrl = new AbortController();
  const timer = setTimeout(() => ctrl.abort(), 60000);
  try {
    // text/plain: Apps Script엔 doOptions가 없어 프리플라이트가 막히므로,
    // 프리플라이트를 유발하지 않는 단순 요청(text/plain)으로 보낸다.
    const resp = await fetch(APPS_SCRIPT_URL, {
      method: 'POST',
      headers: { 'Content-Type': 'text/plain;charset=utf-8' },
      body,
      signal: ctrl.signal,
    });
    const text = await resp.text();
    let json;
    try { json = JSON.parse(text); }
    catch (e) { throw new Error('드라이브 응답 파싱 실패: ' + text.slice(0, 200)); }
    if (!json.ok) throw new Error('드라이브 저장 실패: ' + (json.error || 'unknown'));
    return json.url;
  } finally {
    clearTimeout(timer);
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
  // 첫 더빙 전에 미리 엔진을 준비해 두어 저장 시 대기시간을 줄인다.
  getFFmpeg().catch(e => console.error('[ffmpeg 사전로딩 실패]', e));
}

function renderGrid(){
  const g = $('#grid'); g.innerHTML = '';
  GENRES.forEach(x=>{
    const el = document.createElement('div');
    el.className = 'tile';
    el.style.setProperty('--c', x.color);
    el.innerHTML =
      `<div class="emoji">${x.emoji}</div>
       <div class="gname">${x.name}</div>
       <div class="gsub">${GENRE_SUB[x.id]||''}</div>`;
    el.onclick = ()=>openStudio(x);
    g.appendChild(el);
  });
}

// ── 스튜디오 진입 ──
function openStudio(g){
  current = g;
  $('#chipEmoji').textContent = g.emoji;
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
    let mime = '';
    ['audio/webm;codecs=opus','audio/webm','audio/mp4'].some(m=>{ if(MediaRecorder.isTypeSupported(m)){mime=m; return true;} return false; });
    recMime = mime;
    recorder = mime ? new MediaRecorder(micStream,{mimeType:mime}) : new MediaRecorder(micStream);
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

// ── 저장 → (브라우저 내부) 합성 → 드라이브 업로드 → QR ──
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

  let shareUrl = null, saved = 'local_fallback';
  try{
    shareUrl = await uploadToDrive(mergedBlob, `dub_${current.id}_${Date.now()}.mp4`);
    saved = 'drive';
  }catch(e){
    console.error('[드라이브 실패]', e.message);
    saved = 'local_fallback';
  }

  $('#loading').style.display='none'; $('#done').style.display='';
  if(saved === 'drive'){
    $('#qrImg').src = makeQR(shareUrl);
    $('#qrbox').style.display = 'inline-block';
    $('#downloadRow').style.display = 'none';
    $('#doneMsg').textContent = '휴대폰 카메라로 QR을 스캔하면 내 영화를 받을 수 있어요';
    $('#savemode').textContent = '구글 드라이브에 저장되었습니다';
  }else{
    $('#qrbox').style.display = 'none';
    $('#downloadRow').style.display = 'flex';
    $('#doneMsg').textContent = '인터넷 문제로 자동 전달이 안 됐어요 — 아래 버튼으로 이 기기에 저장하고 운영자에게 알려주세요';
    $('#savemode').textContent = '⚠ 드라이브 업로드 실패 — 이 기기에만 저장됨';
    const objUrl = URL.createObjectURL(mergedBlob);
    $('#downloadBtn').onclick = () => {
      const a = document.createElement('a');
      a.href = objUrl; a.download = `잉키보이스시네마_${current.name}.mp4`;
      document.body.appendChild(a); a.click(); a.remove();
    };
  }
  saving = false;
}

window.goHome = goHome;
window.backToStudio = backToStudio;
window.togglePreview = togglePreview;
window.startRecord = startRecord;
window.replay = replay;
window.resetRecord = resetRecord;
window.save = save;

init();
