// 설치 · 제거 창 녹화에서 «…끝났습니다.»가 뜬 순간 막대가 얼마나 찼는지 잰다(10/30 팀장: «끝났습니다»가 막대가 다 차기 전에 뜸 — 제거 75% · 설치 95%).
//   node scripts/verify/recording-bar-end.mjs <녹화.mkv> [...]
// 막대 = 진행 화면 막대 줄(위 31.5~32.5% · 좌우 5~94%)의 초록 화소 비율(그 녹화에서 가장 많이 찬 장 = 100%). 단계 글 = 막대 위 한 줄(위 25.5~29.5% · 왼쪽 2~60%).
// 완료 화면 = 왼쪽 극장 그림이 덮은 장(왼쪽 2~25% · 위 25~60% 평균 밝기 < 100). 완료 화면 앞에서 단계 글이 마지막으로 바뀐 장을 «끝났습니다»로 본다.
// 통과 = 그 장에서 막대가 99.5% 이상 · 100%가 완료 화면 전까지 0.9초 이상 보임. 진행 화면을 못 찾으면 실패(빈 게이트 금지).
import { spawnSync } from 'node:child_process';

const files = process.argv.slice(2);
if (!files.length) { console.error('녹화 파일을 주세요'); process.exit(2); }

function frames(file, crop, w, h, fmt) {
  const r = spawnSync('ffmpeg', ['-v', 'error', '-i', file, '-vf', `crop=${crop},scale=${w}:${h}:flags=area,format=${fmt}`, '-fps_mode', 'passthrough', '-f', 'rawvideo', '-'], { maxBuffer: 1 << 29 });
  const size = w * h * (fmt === 'rgb24' ? 3 : 1);
  const out = [];
  for (let o = 0; o + size <= r.stdout.length; o += size) out.push(r.stdout.subarray(o, o + size));
  return out;
}
function times(file) {
  const r = spawnSync('ffprobe', ['-v', 'error', '-select_streams', 'v:0', '-show_entries', 'frame=pts_time', '-of', 'csv=p=0', file], { encoding: 'utf8', maxBuffer: 1 << 26 });
  return r.stdout.split(/\r?\n/).filter(Boolean).map(Number);
}
const diff = (a, b) => { let s = 0; for (let i = 0; i < a.length; i++) s += Math.abs(a[i] - b[i]); return s / a.length; };

let bad = 0;
for (const file of files) {
  const W = 400;
  const bar = frames(file, 'iw*0.89:ih*0.01:iw*0.05:ih*0.315', W, 1, 'rgb24');
  const label = frames(file, 'iw*0.58:ih*0.04:iw*0.02:ih*0.255', 96, 8, 'gray');
  const side = frames(file, 'iw*0.23:ih*0.35:iw*0.02:ih*0.25', 16, 16, 'gray');
  const ts = times(file);
  const n = Math.min(bar.length, label.length, side.length, ts.length);
  const green = bar.slice(0, n).map((b) => { let c = 0; for (let x = 0; x < W; x++) { const [r, g, bl] = [b[3 * x], b[3 * x + 1], b[3 * x + 2]]; if (g > r + 40 && g > bl + 40) c++; } return c; });
  const full = Math.max(...green);
  const fin = side.slice(0, n).findIndex((s, i) => i > 0 && s.reduce((a, v) => a + v, 0) / s.length < 100 && green.slice(0, i).some((g) => g > 0));
  if (full === 0 || fin < 0) { bad++; console.log(`걸림  ${file} — 진행 화면 막대 · 완료 화면을 못 찾음`); continue; }
  let end = -1;
  for (let i = fin - 1; i > 0; i--) if (diff(label[i], label[i - 1]) > 6) { end = i; break; }
  const pct = (i) => (100 * green[i] / full);
  const firstFull = green.findIndex((g, i) => i <= fin && g >= full * 0.995);
  const holdFrom = (() => { let k = fin - 1; while (k > 0 && green[k - 1] >= full * 0.995) k--; return k; })();
  const hold = ts[fin] - ts[holdFrom];
  const ok = end >= 0 && pct(end) >= 99.5 && hold >= 0.9;
  if (!ok) bad++;
  const at = (i) => `${ts[i].toFixed(3)}초=${i}번`;
  console.log(`${ok ? '통과' : '걸림'}  ${file} — «끝났습니다» ${end >= 0 ? at(end) : '못 찾음'} · 그때 막대 ${end >= 0 ? pct(end).toFixed(1) : '-'}% · 막대 100% ${at(firstFull)} · 100%로 보인 시간 ${hold.toFixed(2)}초(${at(holdFrom)} ~ 완료 화면 ${at(fin)})`);
}
process.exit(bad ? 1 : 0);
