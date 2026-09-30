// 메인 카드 전용 360p 사본. 녹음·합성용 원본과 AAC 소리는 그대로 둔다.
// 클립을 교체한 뒤 node tools/create-previews.mjs로 함께 갱신한다(ffmpeg 필요).
import { mkdirSync, statSync } from 'node:fs';
import { execFileSync } from 'node:child_process';
import { fileURLToPath, URL } from 'node:url';
import console from 'node:console';
const root = fileURLToPath(new URL('../', import.meta.url));
mkdirSync(new URL('../public/clips/previews/', import.meta.url), { recursive: true });
for (const id of ['fantasy', 'animation', 'horror', 'action', 'drama', 'sitcom']) {
  const input = `${root}public/clips/${id}.mp4`;
  const output = `${root}public/clips/previews/${id}.mp4`;
  execFileSync('ffmpeg', ['-y', '-v', 'error', '-i', input,
    '-map', '0:v:0', '-map', '0:a:0', '-vf', 'scale=640:360:flags=lanczos',
    '-c:v', 'libx264', '-profile:v', 'main', '-preset', 'slow', '-crf', '27',
    '-maxrate', '500k', '-bufsize', '1000k', '-threads', '2', '-pix_fmt', 'yuv420p',
    '-c:a', 'copy', '-movflags', '+faststart', output]);
  console.log(`${id}: ${statSync(input).size} → ${statSync(output).size}바이트`);
}
