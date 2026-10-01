// 녹음실 탐색용 720p 사본. 원본과 AAC 오디오는 보존하고 합성에는 계속 원본을 쓴다.
import { mkdirSync, statSync } from 'node:fs';
import { execFileSync } from 'node:child_process';
import { fileURLToPath, URL } from 'node:url';
import console from 'node:console';
const root = fileURLToPath(new URL('../', import.meta.url));
mkdirSync(new URL('../public/clips/studio/', import.meta.url), { recursive: true });
for (const id of ['fantasy', 'animation', 'horror', 'action', 'drama', 'sitcom']) {
  const input = `${root}public/clips/${id}.mp4`;
  const output = `${root}public/clips/studio/${id}.mp4`;
  execFileSync('ffmpeg', ['-y', '-v', 'error', '-i', input,
    '-map', '0:v:0', '-map', '0:a:0', '-c:v', 'libx264', '-profile:v', 'main',
    '-preset', 'slow', '-crf', '20', '-g', '6', '-keyint_min', '6', '-sc_threshold', '0',
    '-bf', '0', '-threads', '2', '-pix_fmt', 'yuv420p', '-c:a', 'copy',
    '-movflags', '+faststart', output]);
  console.log(`${id}: ${statSync(input).size} → ${statSync(output).size}바이트`);
}
