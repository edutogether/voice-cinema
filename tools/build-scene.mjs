// 장면 더빙 2.0 — 장르 하나의 앱 자산을 만든다(ffmpeg 필요). 1.0의 create-previews·create-studio-clips를 대신한다.
//
//   node tools/build-scene.mjs <장르> --parts <A토막.mp4> <B토막.mp4> [--audio <소리.wav>] [--pause <초>]
//     진짜 원판: 두 토막(0~정지, 정지~10.0초)을 이어 정확히 10.0초로 만들고 소리 트랙을 입힌다.
//   --pause  장면이 멈추는 시각(기본 5 — 지금 장면). 새 장면은 7 — src/genres.ts의 scene.pause와 같아야 하고,
//            소리 트랙도 같은 칸으로 만든다(build-scene-audio.mjs의 voice). 다 만든 뒤 node tools/check-scene.mjs로 확인한다.
//   node tools/build-scene.mjs <장르> --slides <그림 폴더> [--audio <소리.wav>]
//     시험용 원판: 그린 키프레임(vc2_<장르>_K###.png)을 그 시각에 맞춰 넘기는 10초 슬라이드. 앱 개발·시사 준비용.
//
// 만드는 것(app-plan §2-5): public/clips/<장르>.mp4(1920×1080 H.264/AAC, 30fps, 키프레임 1초 간격 — 정지 시각 포함,
// 자막 없음), previews/<장르>.mp4(0~정지 무음, 1280×720 — 최고조까지만, 해소는 아낀다),
// thumbs/<장르>.jpg(640×360)와 stills/<장르>.jpg(1280×720) — 둘 다 정지 화면. 같은 그림의 AVIF도 옆에 만든다(tools/build-avif.mjs, 10/24).
// 내려받는 영상에는 로고 띠(tools/video-logos.png — 왼쪽 위 InKY Film Festival, 오른쪽 위 인천광역시교육청)가 들어간다(10/20 대표님).
// 합성은 영상을 다시 인코딩하지 않으므로(-c:v copy) 로고를 구운 합성용 원판 final/<장르>.mp4를 따로 만든다 — 녹음실은 로고 없는
// <장르>.mp4를 튼다. PC 녹음실은 영상을 위아래로 잘라 꽉 채우므로(원판 기준 위 83~166px) 위 모서리 로고가 잘려 흰 조각만 남는다.
// 미리보기·정지·썸네일도 로고 없는 그림에서 만든다 — 완성 화면 그림은 같은 로고를 화면에서 얹는다(Result.tsx).
// 미리보기는 PC 가운데 카드(약 650px, 화면 배율 2면 1300px)와 휴대폰 카드(폭 94%, 3배면 약 1100px)에 크게 보인다 —
// 10/19까지의 640×360·약 350kbps는 원화와 SSIM 0.86으로 눈에 띄게 뭉개졌다(10/20 대표님 «화질이 많이 열화»).
import { existsSync, mkdirSync, readdirSync, statSync, writeFileSync, rmSync, mkdtempSync } from 'node:fs';
import { execFileSync } from 'node:child_process';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import { fileURLToPath, URL } from 'node:url';
import console from 'node:console';
import process from 'node:process';
import { buildAvif } from './build-avif.mjs';

const SECONDS = 10;
const LIVE_PAUSE = 5;
const root = fileURLToPath(new URL('../', import.meta.url));
const clips = join(root, 'public', 'clips');
const logos = join(root, 'tools', 'video-logos.png');
const [genre, mode, ...rest] = process.argv.slice(2);
if (!/^[a-z]+$/.test(genre ?? '') || !['--parts', '--slides'].includes(mode)) {
  console.error('사용: node tools/build-scene.mjs <장르> --parts A.mp4 B.mp4 [--audio 소리.wav] [--pause 초] | --slides <그림 폴더> [--audio 소리.wav] [--pause 초]');
  process.exit(2);
}
if (!existsSync(logos)) throw new Error('로고 띠(tools/video-logos.png)가 없다 — node tools/build-video-logos.mjs');
// --audio·--pause는 값 하나씩을 받는다 — 나머지가 입력 파일이다
const option = (name) => {
  const at = rest.indexOf(name);
  if (at < 0) return null;
  const [, value] = rest.splice(at, 2);
  if (value === undefined) throw new Error(`${name} 뒤에 값이 없다`);
  return value;
};
const audio = option('--audio');
const pauseArg = option('--pause');
const PAUSE = pauseArg === null ? LIVE_PAUSE : Number(pauseArg);
if (!(PAUSE > 0 && PAUSE < SECONDS)) throw new Error(`--pause ${pauseArg}: 0~${SECONDS}초 사이여야 한다`);
const inputs = rest;
const ff = (args) => execFileSync('ffmpeg', ['-y', '-v', 'error', ...args], { stdio: ['ignore', 'inherit', 'inherit'] });
const work = mkdtempSync(join(tmpdir(), `vc2-${genre}-`));
const picture = join(work, 'picture.mp4');

// 3:2 그림·영상을 16:9로 — 가로를 1920에 맞추고 위아래를 같은 만큼 자른다(위아래 각 약 8%, 그림 규칙 1).
const FIT = 'scale=1920:-2:flags=lanczos,crop=1920:1080,setsar=1,fps=30,format=yuv420p';

if (mode === '--parts') {
  if (inputs.length !== 2) throw new Error('--parts에는 A토막과 B토막 두 파일');
  // 앞 토막은 정지 시각까지, 뒤 토막은 나머지로 맞춰 잇는다. 앞 토막의 끝 그림 = 뒤 토막의 첫 그림이라 이음매는 멈춤 자리다.
  ff(['-i', inputs[0], '-i', inputs[1], '-filter_complex',
    `[0:v]${FIT},trim=0:${PAUSE},setpts=PTS-STARTPTS[a];[1:v]${FIT},trim=0:${SECONDS - PAUSE},setpts=PTS-STARTPTS[b];[a][b]concat=n=2:v=1:a=0[v]`,
    '-map', '[v]', '-c:v', 'libx264', '-crf', '12', '-preset', 'fast', picture]);
} else {
  // concat 목록 안의 경로는 목록 파일 기준으로 풀리므로 절대 경로로 바꿔 둔다.
  const dir = resolve(inputs[0]);
  // K050 → 5.0초. 시각 순서대로 다음 키프레임까지 보여 준다. 키프레임이 아직 없으면 기준 그림(R1)으로 채운다.
  const keys = readdirSync(dir).map((f) => /^vc2_[a-z]+_K(\d{3})\.png$/.exec(f)).filter(Boolean)
    .map((m) => ({ file: join(dir, m[0]), at: Number(m[1]) / 10 })).sort((a, b) => a.at - b.at);
  if (!keys.length || keys[0].at > 0) keys.unshift({ file: join(dir, `vc2_${genre}_R1.png`), at: 0 });
  const list = keys.map((k, i) => `file '${k.file.replaceAll('\\', '/')}'\nduration ${((keys[i + 1]?.at ?? SECONDS) - k.at).toFixed(3)}`).join('\n');
  writeFileSync(join(work, 'slides.txt'), `${list}\nfile '${keys.at(-1).file.replaceAll('\\', '/')}'\n`);
  ff(['-f', 'concat', '-safe', '0', '-i', join(work, 'slides.txt'), '-vf', FIT, '-t', String(SECONDS),
    '-c:v', 'libx264', '-crf', '12', '-preset', 'fast', picture]);
}

// 소리 트랙: 받은 것이 없으면 시험용 소리(낮은 울림 + 8.5초 «빠밤» 두 화음)를 만든다 — 합성(섞기)이 늘 원판 소리를 갖도록.
const sound = audio ?? join(work, 'placeholder.wav');
if (!audio) {
  const chord = (at, hz) => `sine=f=${hz}:d=0.6,afade=t=out:st=0.2:d=0.4,volume=1.2,adelay=${at * 1000}:all=1`;
  ff(['-f', 'lavfi', '-i', `sine=f=110:d=${SECONDS},volume=0.8`, '-f', 'lavfi', '-i', chord(8.5, 523.25),
    '-f', 'lavfi', '-i', chord(8.5, 659.25), '-f', 'lavfi', '-i', chord(8.85, 783.99),
    '-filter_complex', '[0][1][2][3]amix=inputs=4:duration=first:normalize=0,aformat=sample_rates=48000:channel_layouts=stereo',
    '-t', String(SECONDS), sound]);
}

mkdirSync(join(clips, 'previews'), { recursive: true });
mkdirSync(join(clips, 'thumbs'), { recursive: true });
mkdirSync(join(clips, 'stills'), { recursive: true });
mkdirSync(join(clips, 'final'), { recursive: true });
const main = join(clips, `${genre}.mp4`);
const final = join(clips, 'final', `${genre}.mp4`);
// 키프레임 1초 간격(-g 30, 장면 전환으로 끼어드는 키프레임 없음) + 정지 시각을 명시 — 멈춤 탐색이 정확하고 빠르다.
const encode = (video, out) => ff(['-i', picture, '-i', sound, ...video, '-map', '1:a:0', '-t', String(SECONDS),
  '-c:v', 'libx264', '-profile:v', 'high', '-preset', 'slow', '-crf', '20', '-maxrate', '8M', '-bufsize', '16M',
  '-g', '30', '-keyint_min', '30', '-sc_threshold', '0', '-force_key_frames', `0,${PAUSE}`, '-pix_fmt', 'yuv420p',
  '-af', `apad,atrim=0:${SECONDS}`, '-c:a', 'aac', '-b:a', '160k', '-ar', '48000', '-movflags', '+faststart', out]);
encode(['-map', '0:v:0'], main);
encode(['-i', logos, '-filter_complex', '[0:v][2:v]overlay=0:0,format=yuv420p[v]', '-map', '[v]'], final);
ff(['-i', picture, '-t', String(PAUSE), '-an', '-vf', 'scale=1280:720:flags=lanczos', '-c:v', 'libx264', '-profile:v', 'high',
  '-preset', 'slow', '-crf', '20', '-maxrate', '3M', '-bufsize', '6M', '-pix_fmt', 'yuv420p', '-movflags', '+faststart',
  join(clips, 'previews', `${genre}.mp4`)]);
ff(['-ss', String(PAUSE), '-i', picture, '-frames:v', '1', '-vf', 'scale=1280:720:flags=lanczos', '-q:v', '2', join(clips, 'stills', `${genre}.jpg`)]);
ff(['-ss', String(PAUSE), '-i', picture, '-frames:v', '1', '-vf', 'scale=640:360:flags=lanczos', '-q:v', '2', join(clips, 'thumbs', `${genre}.jpg`)]);
buildAvif([genre]);

rmSync(work, { recursive: true, force: true });
const duration = (file) => Number(execFileSync('ffprobe', ['-v', 'error', '-show_entries', 'format=duration', '-of', 'csv=p=0', file]).toString());
for (const file of [main, final]) {
  if (Math.abs(duration(file) - SECONDS) > 0.05) throw new Error(`${file}: 길이 ${duration(file)}초 — 정확히 ${SECONDS}초여야 한다`);
}
const mb = (file) => (statSync(file).size / 1e6).toFixed(2);
console.log(`${genre}: 정지 ${PAUSE}초 · 원판 ${mb(main)}MB · 합성용(로고) ${mb(final)}MB · 미리보기 ${mb(join(clips, 'previews', `${genre}.mp4`))}MB`);
