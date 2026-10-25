// 새 장면(30fps 210번째 프레임 7.000초 정지 · 목소리 칸 3.000초 — src/genres.ts의 NEXT_PAUSE) 시험용 원판을 만든다(ffmpeg 필요) — 원본 영상을 복사하지 않은 합성 영상이다(10/25 팀장 조건 4).
//
//   node tools/make-test-scene.mjs [내보낼 폴더 — 기본 e2e/fixtures/scene-next]
//
// 만드는 것: clip.mp4(녹음실 원판 자리)와 final.mp4(합성용 원판 자리 — 로고 대신 왼쪽 아래 흰 네모). 둘 다 앱 원판과 같은 규격이다
// (1920×1080 H.264 High 30fps, 키프레임 1초 간격 + 정지 프레임, AAC 48kHz 2채널, 10.000초). tools/check-scene.mjs로 확인된다.
//   그림: 위 1/4에 프레임 번호를 10칸 2진수로 새긴다(칸 하나가 한 자리 — 흰색 1, 검은색 0). 나머지는 회색 128 —
//         완성본에서 멈춘 동안의 막(22%)이 구워졌다면 이 회색이 어두워진다.
//   소리: 220Hz 사인파(−26dBFS 안팎 — sine의 기본 진폭 1/8 × 0.6), 목소리 칸(정지~10.0초)은 build-scene-audio.mjs처럼 50ms 동안 −8dB로 낮춘다.
import { execFileSync } from 'node:child_process';
import { mkdirSync } from 'node:fs';
import { join } from 'node:path';
import { fileURLToPath, URL } from 'node:url';
import console from 'node:console';
import process from 'node:process';

const SECONDS = 10;
const PAUSE_FRAME = 210;
const PAUSE = PAUSE_FRAME / 30;
const root = fileURLToPath(new URL('../', import.meta.url));
const out = process.argv[2] ?? join(root, 'e2e', 'fixtures', 'scene-next');
mkdirSync(out, { recursive: true });

// 160×90에서 칸을 그리고 이웃 화소로 키운다(1920×1080에서 화소마다 식을 풀면 느리다). 칸 하나 = 192×270 화소.
const bits = "if(lt(Y,H/4),if(mod(floor(N/pow(2,floor(X/(W/10)))),2),235,16),128)";
const picture = `color=c=black:s=160x90:r=30:d=${SECONDS},geq=lum='${bits}':cb=128:cr=128,scale=1920:1080:flags=neighbor,format=yuv420p`;
const k = Math.pow(10, -8 / 20);
const bed = `sine=f=220:d=${SECONDS}:sample_rate=48000,volume=0.6,volume='1-${(1 - k).toFixed(4)}*clip((t-${PAUSE - 0.05})/0.05,0,1)':eval=frame,aformat=channel_layouts=stereo`;
const encode = (video, file) => execFileSync('ffmpeg', ['-y', '-v', 'error', '-f', 'lavfi', '-i', picture, '-f', 'lavfi', '-i', bed,
  ...video, '-map', '1:a:0', '-t', String(SECONDS),
  '-c:v', 'libx264', '-profile:v', 'high', '-preset', 'medium', '-crf', '20',
  '-g', '30', '-keyint_min', '30', '-sc_threshold', '0', '-force_key_frames', `0,${PAUSE.toFixed(6)}`, '-pix_fmt', 'yuv420p',
  '-c:a', 'aac', '-b:a', '160k', '-ar', '48000', '-movflags', '+faststart', join(out, file)], { stdio: ['ignore', 'inherit', 'inherit'] });
encode(['-map', '0:v:0'], 'clip.mp4');
encode(['-filter_complex', '[0:v]drawbox=x=60:y=900:w=300:h=120:color=white:t=fill[v]', '-map', '[v]'], 'final.mp4');
console.log(`시험용 새 장면(정지 프레임 ${PAUSE_FRAME} = ${PAUSE.toFixed(4)}초) → ${out}`);
