// 장면 더빙 2.0 — 큐 목록(JSON) 하나로 장면 원판의 10초 소리 트랙을 만든다(ffmpeg 필요).
//
//   node tools/build-scene-audio.mjs <큐 목록.json> <내보낼.wav>
//   그 다음 node tools/build-scene.mjs <장르> --parts A.mp4 B.mp4 --audio <내보낼.wav>
//
// 큐 목록: { "genre": "sf", "voice"?: { "from", "to" }, "tracks": [{ "file", "at", "from"?, "dur", "gain"?, "fadeIn"?, "fadeOut"?, "source", "license" }] }
//   voice   목소리 칸(초) — 장면의 정지 시각부터 정지 + 목소리 칸까지(src/genres.ts의 scene과 같아야 한다).
//           빠지면 지금 장면의 5.0~8.5초. 새 장면(7.0초 정지 · 칸 3.0초)은 { "from": 7, "to": 10 }
//   file    소리 파일(큐 목록 파일 기준 상대 경로 또는 절대 경로)   at  장면에서 시작할 초
//   from    파일 안에서 시작할 초(기본 0)                         dur 쓸 길이(초) — at + dur는 10초를 넘을 수 없다
//   gain    dB(기본 0)   fadeIn·fadeOut  초(기본 0)
//   source·license  출처 주소와 라이선스 — 빠지면 만들지 않는다(받은 소리는 출처 기록이 조건이다)
//
// 목소리 칸(기본 5.0~8.5초)은 전체를 −8dB로 낮춘다(storyboards.md §0 «BGM −8dB») — 학생 목소리를 덮지 않게.
// 끝에서 −1dBFS로 피크를 막고 정확히 10.0초로 자른다.
import { readFileSync, existsSync } from 'node:fs';
import { execFileSync } from 'node:child_process';
import { dirname, isAbsolute, resolve } from 'node:path';
import console from 'node:console';
import process from 'node:process';

const SECONDS = 10;
const VOICE = { from: 5, to: 8.5, db: -8, ramp: 0.05 };

const [cuePath, out] = process.argv.slice(2);
if (!cuePath || !out) {
  console.error('사용: node tools/build-scene-audio.mjs <큐 목록.json> <내보낼.wav>');
  process.exit(2);
}
const cue = JSON.parse(readFileSync(cuePath, 'utf8'));
if (!/^[a-z]+$/.test(cue.genre ?? '') || !Array.isArray(cue.tracks) || !cue.tracks.length) throw new Error('genre와 tracks가 필요하다');

const num = (v, fallback) => (v === undefined ? fallback : Number(v));
const span = { from: num(cue.voice?.from, VOICE.from), to: num(cue.voice?.to, VOICE.to) };
if (!(span.from > 0 && span.to > span.from && span.to <= SECONDS)) throw new Error(`${cue.genre}: 목소리 칸 ${span.from}~${span.to}초가 0~${SECONDS}초 안이 아니다`);
const tracks = cue.tracks.map((t, i) => {
  const where = `${cue.genre} 트랙 ${i + 1}(${t.file})`;
  const file = isAbsolute(t.file ?? '') ? t.file : resolve(dirname(cuePath), t.file ?? '');
  if (!existsSync(file)) throw new Error(`${where}: 파일이 없다`);
  if (!t.source || !t.license) throw new Error(`${where}: 출처(source)와 라이선스(license)를 적는다`);
  const at = num(t.at, NaN), from = num(t.from, 0), dur = num(t.dur, NaN);
  const gain = num(t.gain, 0), fadeIn = num(t.fadeIn, 0), fadeOut = num(t.fadeOut, 0);
  if (![at, from, dur, gain, fadeIn, fadeOut].every(Number.isFinite)) throw new Error(`${where}: 숫자가 아닌 값이 있다`);
  if (at < 0 || from < 0 || dur <= 0 || at + dur > SECONDS + 1e-9) throw new Error(`${where}: at ${at} + dur ${dur}이 0~${SECONDS}초 밖이다`);
  if (fadeIn + fadeOut > dur) throw new Error(`${where}: 페이드 합이 길이보다 길다`);
  return { file, at, from, dur, gain, fadeIn, fadeOut };
});

const chains = tracks.map((t, i) => {
  const steps = [
    'aresample=48000', 'aformat=sample_fmts=fltp:channel_layouts=stereo',
    `atrim=start=${t.from}:duration=${t.dur}`, 'asetpts=PTS-STARTPTS', `volume=${t.gain}dB`,
  ];
  if (t.fadeIn) steps.push(`afade=t=in:st=0:d=${t.fadeIn}`);
  if (t.fadeOut) steps.push(`afade=t=out:st=${(t.dur - t.fadeOut).toFixed(3)}:d=${t.fadeOut}`);
  steps.push(`adelay=${Math.round(t.at * 1000)}:all=1`);
  return `[${i}:a]${steps.join(',')}[t${i}]`;
});
// 목소리 칸 낮추기: 칸 시작 직전 50ms 동안 내려가 칸 끝부터 50ms 동안 돌아온다(계단으로 바꾸면 딸깍 소리가 난다)
const k = Math.pow(10, VOICE.db / 20);
const down = `clip((t-${span.from - VOICE.ramp})/${VOICE.ramp},0,1)`;
const up = `clip((t-${span.to})/${VOICE.ramp},0,1)`;
const duck = `volume='1-${(1 - k).toFixed(4)}*${down}*(1-${up})':eval=frame`;
// 섞은 뒤 시각을 샘플 수로 다시 매긴다 — 비트레이트로 길이를 짐작하는 mp3가 섞이면 시각이 비어 낮추기 식이 NaN이 되고,
// volume 필터는 NaN을 0으로 바꿔 그 뒤가 통째로 무음이 된다(10/17 판타지·애니메이션·드라마에서 실제로 겪음).
const mix = `${tracks.map((_, i) => `[t${i}]`).join('')}amix=inputs=${tracks.length}:duration=longest:normalize=0,` +
  `asetpts=N/SR/TB,${duck},apad=whole_dur=${SECONDS},atrim=0:${SECONDS},alimiter=limit=0.89[out]`;

execFileSync('ffmpeg', ['-y', '-v', 'error', ...tracks.flatMap((t) => ['-i', t.file]),
  '-filter_complex', [...chains, mix].join(';'), '-map', '[out]', '-ar', '48000', '-c:a', 'pcm_s16le', out],
{ stdio: ['ignore', 'inherit', 'inherit'] });

const duration = Number(execFileSync('ffprobe', ['-v', 'error', '-show_entries', 'format=duration', '-of', 'csv=p=0', out]).toString());
if (Math.abs(duration - SECONDS) > 0.01) throw new Error(`${cue.genre}: 소리 길이 ${duration}초 — 정확히 ${SECONDS}초여야 한다`);
console.log(`${cue.genre}: 소리 트랙 ${tracks.length}개 → ${duration.toFixed(3)}초 · 목소리 칸 ${span.from}~${span.to}초 −8dB`);
for (const t of cue.tracks) console.log(`  ${t.at}s  ${t.source}  (${t.license})`);
