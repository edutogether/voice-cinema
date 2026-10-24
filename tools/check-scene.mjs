// 장면 원판 확인 — 영상을 바꾼 뒤 앱의 장면 시간표(src/genres.ts의 scene)와 맞는지 본다(ffmpeg·ffprobe 필요).
//
//   node tools/check-scene.mjs <장르> <정지 초> <목소리 칸 초> [--cue <큐 목록.json>] [--dir <원판 폴더 — 기본 public/clips>]
//   예) 지금 장면: node tools/check-scene.mjs sf 5 3.5      새 장면: node tools/check-scene.mjs sf 7 3 --cue <sf 큐 목록.json>
//
// 하나라도 어긋나면 실패로 끝난다:
//   원판(<장르>.mp4)·합성용 원판(final/<장르>.mp4) 둘 다 10.000초(±0.02) · H.264 1920×1080 30fps · AAC 48kHz 2채널
//   정지 시각에 키프레임이 있다(없으면 멈춘 그림이 앞 키프레임 쪽으로 어긋날 수 있다)
//   두 파일의 소리가 같다(합성용은 로고만 얹었다 — 미리 듣기와 완성본이 같은 원판 소리여야 한다)
//   정지 + 목소리 칸 ≤ 10초
//   --cue를 주면: 소리 트랙을 만든 큐 목록의 목소리 칸(voice, 빠지면 5.0~8.5초)이 정지 ~ 정지 + 칸과 같다
// 알려 주기만 하는 것: 목소리 칸의 원판 소리와 칸 앞 1초의 크기. 섞인 소리로는 칸을 가릴 수 없다 — 지금 원판 8개를 재 보니 장면 소리가
// 칸 경계에서 −14~+17dB 오르내렸다(10/25). 그래서 칸은 큐 목록으로 대조한다.
import { execFileSync } from 'node:child_process';
import { existsSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { fileURLToPath, URL } from 'node:url';
import console from 'node:console';
import process from 'node:process';

const SECONDS = 10;
const args = process.argv.slice(2);
const option = (name) => {
  const at = args.indexOf(name);
  return at < 0 ? null : args.splice(at, 2)[1];
};
const cuePath = option('--cue');
const dirArg = option('--dir');
const [genre, pauseArg, windowArg] = args;
const pause = Number(pauseArg);
const window = Number(windowArg);
if (!/^[a-z]+$/.test(genre ?? '') || !(pause > 0) || !(window > 0)) {
  console.error('사용: node tools/check-scene.mjs <장르> <정지 초> <목소리 칸 초> [--cue <큐 목록.json>] [--dir <원판 폴더>]');
  process.exit(2);
}
const dir = dirArg ?? join(fileURLToPath(new URL('../', import.meta.url)), 'public', 'clips');
const files = { 원판: join(dir, `${genre}.mp4`), 합성용: join(dir, 'final', `${genre}.mp4`) };
const problems = [];
const fail = (msg) => problems.push(msg);

const probe = (file, args) => execFileSync('ffprobe', ['-v', 'error', ...args, file]).toString().trim();
const pcm = (file) => execFileSync('ffmpeg', ['-v', 'error', '-i', file, '-map', '0:a:0', '-f', 'f32le', '-ac', '1', '-ar', '48000', '-'], { maxBuffer: 64 << 20 });
const samples = (buf) => new Float32Array(buf.buffer, buf.byteOffset, buf.byteLength / 4);
const rmsDb = (data, from, to) => {
  let sum = 0;
  const a = Math.round(from * 48000), b = Math.min(data.length, Math.round(to * 48000));
  for (let i = a; i < b; i++) sum += data[i] * data[i];
  return b > a ? 20 * Math.log10(Math.sqrt(sum / (b - a)) || 1e-9) : -Infinity;
};

if (pause + window > SECONDS + 1e-9) fail(`정지 ${pause}초 + 목소리 칸 ${window}초가 ${SECONDS}초를 넘는다`);
if (cuePath) {
  const voice = JSON.parse(readFileSync(cuePath, 'utf8')).voice ?? { from: 5, to: 8.5 };
  if (Math.abs(voice.from - pause) > 1e-9 || Math.abs(voice.to - (pause + window)) > 1e-9) {
    fail(`큐 목록의 목소리 칸 ${voice.from}~${voice.to}초가 시간표 ${pause}~${pause + window}초와 다르다 — 소리 트랙을 다시 만든다`);
  }
}
const audio = {};
for (const [name, file] of Object.entries(files)) {
  if (!existsSync(file)) {
    fail(`${name} ${file}이 없다`);
    continue;
  }
  const duration = Number(probe(file, ['-show_entries', 'format=duration', '-of', 'csv=p=0']));
  if (Math.abs(duration - SECONDS) > 0.02) fail(`${name}: 길이 ${duration}초 — ${SECONDS}.000초여야 한다`);
  const [codec, width, height, rate] = probe(file, ['-select_streams', 'v:0', '-show_entries', 'stream=codec_name,width,height,r_frame_rate', '-of', 'csv=p=0']).split(',');
  if (codec !== 'h264') fail(`${name}: 영상 ${codec} — H.264여야 한다(H.265는 브라우저에서 검게 나온다)`);
  if (`${width}x${height}` !== '1920x1080') fail(`${name}: ${width}×${height} — 1920×1080이어야 한다`);
  if (rate !== '30/1') fail(`${name}: ${rate}fps — 30fps여야 한다`);
  const [acodec, arate, channels] = probe(file, ['-select_streams', 'a:0', '-show_entries', 'stream=codec_name,sample_rate,channels', '-of', 'csv=p=0']).split(',');
  if (acodec !== 'aac' || arate !== '48000' || channels !== '2') fail(`${name}: 소리 ${acodec} ${arate}Hz ${channels}채널 — AAC 48kHz 2채널이어야 한다(합성은 원판 소리에 목소리를 섞는다)`);
  const keys = probe(file, ['-select_streams', 'v:0', '-skip_frame', 'nokey', '-show_entries', 'frame=pts_time', '-of', 'csv=p=0']).split(/\s+/).map(Number);
  if (!keys.some((t) => Math.abs(t - pause) < 1 / 60)) fail(`${name}: ${pause}초에 키프레임이 없다(있는 곳: ${keys.join(', ')}) — build-scene.mjs --pause ${pause}로 만든다`);
  audio[name] = samples(pcm(file));
}
if (audio.원판 && audio.합성용) {
  const [a, b] = [audio.원판, audio.합성용];
  let diff = Math.abs(a.length - b.length) > 48 ? Infinity : 0;
  for (let i = 0; i < Math.min(a.length, b.length) && diff < Infinity; i++) diff = Math.max(diff, Math.abs(a[i] - b[i]));
  if (diff > 1e-3) fail(`원판과 합성용 원판의 소리가 다르다(최대 차이 ${diff}) — 같은 소리 트랙으로 만든다`);
  const before = rmsDb(a, Math.max(0, pause - 1), pause);
  const inside = rmsDb(a, pause, pause + window);
  console.log(`${genre}: 칸 앞 1초 ${before.toFixed(1)}dBFS · 목소리 칸 ${inside.toFixed(1)}dBFS(참고 — 칸은 큐 목록으로 대조한다)`);
}
if (problems.length) {
  for (const p of problems) console.error(`✗ ${p}`);
  process.exit(1);
}
console.log(`${genre}: 정지 ${pause}초 · 목소리 칸 ${window}초 — 원판과 맞다${cuePath ? '(큐 목록 대조함)' : ' · 목소리 칸은 대조하지 않음(--cue 없음)'}`);
