/* global process, console */
// tools/build-scene.mjs --film 의 소리 길을 그대로 되풀이한다 — 완성본 소리 → 목소리 칸 −8dB → film.wav, 그리고 같은 설정의 AAC(대조용 same.m4a).
// node prep.mjs <완성본 mp4> <멈춤 초>   (cwd = 이 폴더)
import { execFileSync } from 'node:child_process';
const [filmIn, pauseArg] = process.argv.slice(2);
const PAUSE = Number(pauseArg);
const ff = (args) => execFileSync('ffmpeg', ['-y', '-v', 'error', ...args], { stdio: ['ignore', 'inherit', 'inherit'] });
const duration = (file) => Number(execFileSync('ffprobe', ['-v', 'error', '-show_entries', 'format=duration', '-of', 'csv=p=0', file]).toString());
const SECONDS = Math.round(duration(filmIn) * 30) / 30;
const k = Math.pow(10, -8 / 20), ramp = 0.05, to = PAUSE + 3.5;
const duck = `volume='1-${(1 - k).toFixed(4)}*clip((t-${PAUSE - ramp})/${ramp},0,1)*(1-clip((t-${to})/${ramp},0,1))':eval=frame`;
ff(['-i', filmIn, '-vn', '-af', `aresample=48000,aformat=sample_fmts=fltp:channel_layouts=stereo,asetpts=N/SR/TB,${duck},apad=whole_dur=${SECONDS},atrim=0:${SECONDS}`,
  '-ar', '48000', '-c:a', 'pcm_s16le', 'film.wav']);
ff(['-i', 'film.wav', '-t', String(SECONDS), '-af', `apad,atrim=0:${SECONDS}`, '-c:a', 'aac', '-b:a', '160k', '-ar', '48000', 'same.m4a']);
console.log('SECONDS', String(SECONDS));
