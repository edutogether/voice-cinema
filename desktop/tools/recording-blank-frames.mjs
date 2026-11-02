// 설치 · 제거 창 녹화(installer-screen-record.ps1의 screen-NN.mkv)에서 화면이 넘어갈 때 덜 그려진 프레임을 센다(10/28 Bumm님 «깜빡임 0», 팀장 판정: 화면이 넘어갈 때 빈 프레임 0 ·
// 진행 화면 모든 장에서 머리 글 · 그림이 보임 · 10/30 «끝났습니다»/«닫음» 장).
//   node scripts/verify/recording-blank-frames.mjs <녹화.mkv> [...] [--json <결과.json>]
// 빈 화면 = 몸통 띠(위 25%부터 높이 40% · 좌우 15px 안쪽 — 머리 선 아래 화면 글 · 칸 · 그림 자리)에 어두운 화소가 하나도 없는 프레임(가장 어두운 밝기 > 150).
//   ⚠ 예전에는 위 17%부터 봤다 — 띠에 머리 그림 아랫부분이 들어가 위치 → 진행의 몸통 빈 장을 0으로 셌다(10/28 14d2583 04 프레임 145 · 09 프레임 146, 10/30에 고침).
// 머리 빈 = 머리 띠(위 7.5~15.5% · 왼쪽 2~70% — 제목 · 부제 자리)에 어두운 화소가 없거나, 머리가 있는 화면인데 오른쪽 위 그림 칸(위 7~19% · 오른쪽 86~98%)에 어두운 화소가 없는 프레임.
//   첫 화면 · 완료 화면(왼쪽 극장 그림이 창을 덮음 — 왼쪽 2~25% · 위 25~60%의 평균 밝기 < 100)은 그림 칸을 보지 않는다(그 화면에는 머리가 없다).
// 단추 줄 빈 = 아래 단추 줄 띠(위 90.5%부터 높이 6% · 좌우 15px 안쪽)가 한 가지 밝기뿐인 프레임(가장 밝은 − 가장 어두운 < 20 — 단추 테두리 · 글이 없다, 10/28 03 프레임 102).
// 가운데 단추 잠깐 = 가운데 단추(«다음 >» · «설치» · «마침» 자리)의 모양이 1~2장만 나타났다가 앞뒤와 다른 모양으로 넘어간 프레임(10/28 «닫음» — 04 프레임 281 · 09 프레임 280).
//   창이 닫히며 사라지는 동안(제목 줄이 첫 장과 달라진 뒤)은 세지 않는다.
// 하나라도 있으면 종료코드 1. 프레임을 하나도 못 읽으면 실패(빈 게이트 금지).
// ⚠ 띠 밖(창 테두리 등)은 보지 않는다 — 숫자와 함께 프레임을 눈으로 본다(10/28 실험 C: 띠 밖 머리만 빠진 판을 0으로 셌다 → 머리 띠를 더함).
import { spawnSync } from 'node:child_process';
import fs from 'node:fs';

const args = process.argv.slice(2);
const ji = args.indexOf('--json');
const jsonOut = ji >= 0 ? args.splice(ji, 2)[1] : null;
if (!args.length) { console.error('녹화 파일을 주세요'); process.exit(2); }

// 띠 하나의 프레임별 밝기 통계(YMIN · YMAX · YAVG)
function stats(file, crop) {
  const r = spawnSync('ffmpeg', ['-v', 'error', '-i', file, '-vf', `crop=${crop},signalstats,metadata=print:file=-`, '-f', 'null', '-'], { encoding: 'utf8', maxBuffer: 1 << 28 });
  const out = [];
  let cur = null;
  for (const line of r.stdout.split(/\r?\n/)) {
    const m = line.match(/pts_time:([\d.]+)/);
    if (m) { cur = { t: Number(m[1]) }; out.push(cur); continue; }
    const s = line.match(/lavfi\.signalstats\.(YMIN|YMAX|YAVG)=([\d.]+)/);
    if (s && cur) cur[s[1].toLowerCase()] = Number(s[2]);
  }
  return out;
}
// 띠 하나를 작은 회색 그림(W×H)으로 프레임마다 읽는다
function thumbs(file, crop, w, h) {
  const r = spawnSync('ffmpeg', ['-v', 'error', '-i', file, '-vf', `crop=${crop},scale=${w}:${h}:flags=area,format=gray`, '-fps_mode', 'passthrough', '-f', 'rawvideo', '-'], { maxBuffer: 1 << 28 });
  const size = w * h;
  const out = [];
  for (let o = 0; o + size <= r.stdout.length; o += size) out.push(r.stdout.subarray(o, o + size));
  return out;
}
const diff = (a, b) => { let s = 0; for (let i = 0; i < a.length; i++) s += Math.abs(a[i] - b[i]); return s / a.length; };

const results = [];
let bad = 0;
for (const file of args) {
  const mid = stats(file, 'iw-30:ih*0.40:15:ih*0.25');
  const head = stats(file, 'iw*0.68:ih*0.08:iw*0.02:ih*0.075');
  const art = stats(file, 'iw*0.12:ih*0.12:iw*0.86:ih*0.07');
  const side = stats(file, 'iw*0.23:ih*0.35:iw*0.02:ih*0.25');
  const row = stats(file, 'iw-30:ih*0.06:15:ih*0.905');
  const btn = thumbs(file, 'iw*0.09:ih*0.035:iw*0.682:ih*0.918', 48, 10);   // 가운데 단추의 글자 칸
  const title = thumbs(file, 'iw*0.5:ih*0.05:iw*0.05:0', 64, 6);
  const n = Math.min(mid.length, head.length, art.length, side.length, row.length, btn.length, title.length);
  const blanks = [], headless = [], rowBlank = [], flash = [];
  for (let i = 0; i < n; i++) {
    const t = { t: mid[i].t, n: i };   // 시각(초)과 프레임 번호(0부터 — 녹화 장 간격이 조금씩 흔들려 «번호 ÷ 30»과 다를 수 있다)
    if (mid[i].ymin > 150) blanks.push(t);
    const fullPage = side[i].yavg < 100;
    if (head[i].ymin > 150 || (!fullPage && art[i].ymin > 150)) headless.push(t);
    if (row[i].ymax - row[i].ymin < 20) rowBlank.push(t);
  }
  // 가운데 단추: 모양이 같은 프레임끼리 묶어(앞 장과 평균 차 4 이하) 1~2장짜리 묶음이 앞뒤 묶음과 모두 다르면 «잠깐»
  const groups = [];
  for (let i = 0; i < n; i++) {
    if (diff(title[i], title[0]) > 6) break;   // 창이 닫히며 사라지는 중
    const g = groups[groups.length - 1];
    if (g && diff(btn[i], btn[g.last]) <= 4) g.last = i;
    else groups.push({ first: i, last: i });
  }
  for (let k = 1; k + 1 < groups.length; k++) {
    const g = groups[k];
    if (g.last - g.first + 1 <= 2 && diff(btn[g.first], btn[groups[k - 1].last]) > 8 && diff(btn[g.first], btn[groups[k + 1].first]) > 8) {
      for (let i = g.first; i <= g.last; i++) flash.push({ t: mid[i].t, n: i });
    }
  }
  if (!n) bad++;
  bad += blanks.length + headless.length + rowBlank.length + flash.length;
  results.push({ file, frames: n, blank: blanks.length, blankAt: blanks, headless: headless.length, headlessAt: headless, buttonRowBlank: rowBlank.length, buttonRowBlankAt: rowBlank, buttonFlash: flash.length, buttonFlashAt: flash });
  const one = (x) => `${x.t.toFixed(3)}초=${x.n}번`;
  const at = (a) => (a.length > 8 ? a.slice(0, 8).map(one).join(' ') + ' …' : a.map(one).join(' '));
  const part = (name, a) => `${name} ${a.length}장${a.length ? ' (' + at(a) + ')' : ''}`;
  const ok = n && !blanks.length && !headless.length && !rowBlank.length && !flash.length;
  console.log(`${ok ? '통과' : '걸림'}  ${file} — 프레임 ${n}장 · ${part('빈 화면', blanks)} · ${part('머리 빈', headless)} · ${part('단추 줄 빈', rowBlank)} · ${part('가운데 단추 잠깐', flash)}${n ? '' : ' · 프레임을 읽지 못함'}`);
}
if (jsonOut) fs.writeFileSync(jsonOut, JSON.stringify(results, null, 1));
process.exit(bad ? 1 : 0);
