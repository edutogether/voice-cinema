// 설치기 빌드(makensis) 때 실제 앱 7z에서 «푸는 순서 · 크기» 표를 만든다 — 설치기가 푼 바이트로 «설치: …» 줄을 적을 때 쓴다(installer.nsh vcExtract*,
// install-files.nsh). Poster Studio 설치판(desktop/build/ps-7z-list.mjs)과 같은 표다(11/2 대표님 «똑같이»).
//   node vc-7z-list.mjs <app-64.7z> <표 파일>      (makensis가 install-files.nsh의 !system으로 부른다 — 실패하면 빌드가 멈춘다)
// 7za는 electron-builder가 이미 받아 둔 것(%LOCALAPPDATA%\electron-builder\Cache\7zip@…\…\bin\7za.exe)을 쓴다 — 새로 받지 않는다.
// 표 한 줄 = «끝 KB 크기 KB 상대 경로»(빈칸으로 가름, 앞 0 없음 — NSIS는 0으로 시작하는 수를 8진수로 읽는다) — 7z 목록 순서(= 고체 압축을 푸는 순서) 그대로,
// 폴더는 뺀다. 파일 목록 · 크기는 손으로 적지 않는다(앱 내용이 바뀌어도 다시 빌드하면 맞다). KB = 1000바이트(올림) — 설치기가 Nsis7z의 바이트 수에서
// 끝 세 자리를 떼어 견준다. 올림이라 줄은 그 파일이 다 풀린 뒤에만 나온다. 2GB가 넘는 내용도 NSIS 32비트 정수로 셈한다. 대상이 0개면 실패한다(빈 표로 빌드되지 않게).
import { spawnSync } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';

const [archive, out] = process.argv.slice(2);
if (!archive || !out) { console.error('사용: node vc-7z-list.mjs <app.7z> <표 파일>'); process.exit(2); }
if (!fs.existsSync(archive)) { console.error(`7z가 없다: ${archive}`); process.exit(1); }

// electron-builder 캐시의 7za(판이 여럿이면 가장 새것)
function find7za() {
  const cache = path.join(process.env.LOCALAPPDATA ?? '', 'electron-builder', 'Cache');
  const found = [];
  for (const d of fs.existsSync(cache) ? fs.readdirSync(cache) : []) {
    if (!d.startsWith('7zip@')) continue;
    for (const sub of fs.readdirSync(path.join(cache, d))) {
      const exe = path.join(cache, d, sub, 'bin', '7za.exe');
      if (fs.existsSync(exe)) found.push({ exe, mtime: fs.statSync(exe).mtimeMs });
    }
  }
  found.sort((a, b) => b.mtime - a.mtime);
  return found[0]?.exe;
}
const seven = find7za();
if (!seven) { console.error('electron-builder 캐시에 7za.exe가 없다 — 설치판을 electron-builder로 한 번 빌드하면 받아진다'); process.exit(1); }

const r = spawnSync(seven, ['l', '-slt', '-ba', archive], { encoding: 'utf8', maxBuffer: 1 << 26 });
if (r.status !== 0) { console.error(`7za 목록 실패(${r.status}): ${r.stderr}`); process.exit(1); }
const items = [];
let cur = {};
for (const line of `${r.stdout}\n`.split(/\r?\n/)) {
  if (line.trim() === '') { if (cur.Path !== undefined) items.push(cur); cur = {}; continue; }
  const k = line.indexOf(' = ');
  if (k > 0) cur[line.slice(0, k)] = line.slice(k + 3);
}
const files = items.filter((it) => !(it.Attributes ?? '').includes('D') && it.Folder !== '+');
if (!files.length) { console.error('7z 안에 파일이 하나도 없다'); process.exit(1); }
let endKb = 0;
const rows = files.map((it) => {
  const kb = Math.ceil(Number(it.Size) / 1000);
  endKb += kb;
  return `${endKb} ${kb} ${it.Path.replace(/\//g, '\\')}`;
});
// NSIS FileRead는 줄 끝(\r\n)까지 읽는다. 한국어 경로도 있을 수 있어 UTF-16LE(BOM)으로 적는다 — FileReadUTF16LE로 읽는다
fs.writeFileSync(out, Buffer.concat([Buffer.from([0xff, 0xfe]), Buffer.from(rows.join('\r\n') + '\r\n', 'utf16le')]));
console.log(`표 ${files.length}줄 · 합 ${Math.round(endKb / 1024)}MB → ${out}`);
