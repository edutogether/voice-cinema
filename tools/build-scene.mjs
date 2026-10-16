// 장면 더빙 2.0 — 장르 하나의 앱 자산을 만든다(ffmpeg 필요). 1.0의 create-previews·create-studio-clips를 대신한다.
//
//   node tools/build-scene.mjs <장르> --parts <A토막.mp4> <B토막.mp4> [--audio <소리.wav>]
//     진짜 원판: Higgsfield 두 토막(0~5.0초, 5.0~10.0초)을 이어 정확히 10.0초로 만들고 소리 트랙을 입힌다.
//   node tools/build-scene.mjs <장르> --slides <그림 폴더> [--audio <소리.wav>]
//     시험용 원판: 그린 키프레임(vc2_<장르>_K###.png)을 그 시각에 맞춰 넘기는 10초 슬라이드. 앱 개발·시사 준비용.
//
// 만드는 것(app-plan §2-5): public/clips/<장르>.mp4(1920×1080 H.264/AAC, 30fps, 키프레임 1초 간격 — 5.0초 포함,
// 글자·자막 없음), previews/<장르>.mp4(0~5.0초 무음, 640×360 — 최고조까지만, 해소는 아낀다),
// thumbs/<장르>.jpg(640×360)와 stills/<장르>.jpg(1280×720) — 둘 다 5.0초 멈춤 화면.
import { mkdirSync, readdirSync, statSync, writeFileSync, rmSync, mkdtempSync } from 'node:fs';
import { execFileSync } from 'node:child_process';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import { fileURLToPath, URL } from 'node:url';
import console from 'node:console';
import process from 'node:process';

const SECONDS = 10;
const PAUSE = 5;
const root = fileURLToPath(new URL('../', import.meta.url));
const clips = join(root, 'public', 'clips');
const [genre, mode, ...rest] = process.argv.slice(2);
if (!/^[a-z]+$/.test(genre ?? '') || !['--parts', '--slides'].includes(mode)) {
  console.error('사용: node tools/build-scene.mjs <장르> --parts A.mp4 B.mp4 [--audio 소리.wav] | --slides <그림 폴더> [--audio 소리.wav]');
  process.exit(2);
}
const audioAt = rest.indexOf('--audio');
const audio = audioAt >= 0 ? rest[audioAt + 1] : null;
const inputs = audioAt >= 0 ? rest.slice(0, audioAt) : rest;
const ff = (args) => execFileSync('ffmpeg', ['-y', '-v', 'error', ...args], { stdio: ['ignore', 'inherit', 'inherit'] });
const work = mkdtempSync(join(tmpdir(), `vc2-${genre}-`));
const picture = join(work, 'picture.mp4');

// 3:2 그림·영상을 16:9로 — 가로를 1920에 맞추고 위아래를 같은 만큼 자른다(위아래 각 약 8%, 그림 규칙 1).
const FIT = 'scale=1920:-2:flags=lanczos,crop=1920:1080,setsar=1,fps=30,format=yuv420p';

if (mode === '--parts') {
  if (inputs.length !== 2) throw new Error('--parts에는 A토막과 B토막 두 파일');
  // 각 토막을 정확히 5.0초로 맞춰 잇는다. 앞 토막의 끝 그림 = 뒤 토막의 첫 그림이라 이음매는 멈춤 자리다.
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
const main = join(clips, `${genre}.mp4`);
// 키프레임 1초 간격(-g 30, 장면 전환으로 끼어드는 키프레임 없음) + 5.0초를 명시 — 5.0초 멈춤 탐색이 정확하고 빠르다.
ff(['-i', picture, '-i', sound, '-map', '0:v:0', '-map', '1:a:0', '-t', String(SECONDS),
  '-c:v', 'libx264', '-profile:v', 'high', '-preset', 'slow', '-crf', '20', '-maxrate', '8M', '-bufsize', '16M',
  '-g', '30', '-keyint_min', '30', '-sc_threshold', '0', '-force_key_frames', `0,${PAUSE}`, '-pix_fmt', 'yuv420p',
  '-af', `apad,atrim=0:${SECONDS}`, '-c:a', 'aac', '-b:a', '160k', '-ar', '48000', '-movflags', '+faststart', main]);
ff(['-i', main, '-t', String(PAUSE), '-an', '-vf', 'scale=640:360:flags=lanczos', '-c:v', 'libx264', '-profile:v', 'main',
  '-preset', 'slow', '-crf', '27', '-maxrate', '500k', '-bufsize', '1000k', '-pix_fmt', 'yuv420p', '-movflags', '+faststart',
  join(clips, 'previews', `${genre}.mp4`)]);
ff(['-ss', String(PAUSE), '-i', main, '-frames:v', '1', '-vf', 'scale=1280:720:flags=lanczos', '-q:v', '3', join(clips, 'stills', `${genre}.jpg`)]);
ff(['-ss', String(PAUSE), '-i', main, '-frames:v', '1', '-vf', 'scale=640:360:flags=lanczos', '-q:v', '4', join(clips, 'thumbs', `${genre}.jpg`)]);

const duration = Number(execFileSync('ffprobe', ['-v', 'error', '-show_entries', 'format=duration', '-of', 'csv=p=0', main]).toString());
rmSync(work, { recursive: true, force: true });
if (Math.abs(duration - SECONDS) > 0.05) throw new Error(`${genre}: 길이 ${duration}초 — 정확히 ${SECONDS}초여야 한다`);
console.log(`${genre}: ${(statSync(main).size / 1e6).toFixed(1)}MB, ${duration.toFixed(3)}초`);
