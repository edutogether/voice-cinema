#!/usr/bin/env node
/* 배치 대조(2026-11-07) — viewport-survey.mjs --snapshot이 남긴 전 · 뒤 폴더를 화면마다 맞대어, 자리 · 크기 · 글자가 달라진 요소를 적는다.
   «2560 화면은 그대로»를 말이 아니라 값으로 보이려는 도구다. 흐르는 그림 띠처럼 시간에 따라 움직이는 것은 --ignore로 뺀다.

     node tools/verify/layout-compare.mjs <전 snap 폴더> <뒤 snap 폴더> [--only 낱말,…] [--ignore 정규식] [--tol 0.5] [--show 8]

   달라진 화면이 있으면 종료코드 1, 전부 같으면 0, 대조한 화면이 없으면 2다. */
import fs from 'node:fs';
import path from 'node:path';

const args = process.argv.slice(2);
const opt = (name, def) => { const i = args.indexOf(name); return i >= 0 ? args[i + 1] : def; };
const VALUE_FLAGS = ['--only', '--ignore', '--tol', '--show'];
const [beforeDir, afterDir] = args.filter((a, i) => !a.startsWith('--') && !VALUE_FLAGS.includes(args[i - 1]));
if (!beforeDir || !afterDir) { console.error('사용법: node tools/verify/layout-compare.mjs <전 snap 폴더> <뒤 snap 폴더> [--only 낱말,…] [--ignore 정규식] [--tol 0.5] [--show 8]'); process.exit(2); }
const only = opt('--only', null)?.split(',');
const ignore = opt('--ignore', null) ? new RegExp(opt('--ignore')) : null;
const tol = Number(opt('--tol', '0.5'));
const show = Number(opt('--show', '8'));

const read = (dir, name) => JSON.parse(fs.readFileSync(path.join(dir, name), 'utf8'));
const FIELDS = ['x', 'y', '폭', '높이', '글자', '줄높이', '색', '바탕'];

const names = fs.readdirSync(beforeDir).filter((n) => n.endsWith('.json') && (!only || only.some((w) => n.includes(w))));
let compared = 0, changed = 0;
for (const name of names) {
  if (!fs.existsSync(path.join(afterDir, name))) { console.log(`${name}: 뒤 폴더에 없음`); changed++; continue; }
  const a = read(beforeDir, name), b = read(afterDir, name);
  compared++;
  const keep = (list) => new Map(list.filter((e) => !(ignore && ignore.test(e[0]))).map((e) => [e[0], e]));
  const ma = keep(a.els), mb = keep(b.els);
  const diffs = [];
  for (const [key, ea] of ma) {
    const eb = mb.get(key);
    if (!eb) { diffs.push(`사라짐 ${key}`); continue; }
    const fields = [];
    for (let i = 1; i < ea.length; i++) {
      const same = typeof ea[i] === 'number' ? Math.abs(ea[i] - eb[i]) <= tol : ea[i] === eb[i];
      if (!same) fields.push(`${FIELDS[i - 1]} ${ea[i]}→${eb[i]}`);
    }
    if (fields.length) diffs.push(`${key}: ${fields.join(', ')}`);
  }
  for (const key of mb.keys()) if (!ma.has(key)) diffs.push(`새로 생김 ${key}`);
  if (a.docH !== b.docH) diffs.unshift(`문서 높이 ${a.docH}→${b.docH}`);
  if (diffs.length) {
    changed++;
    console.log(`${name}: 달라진 곳 ${diffs.length}`);
    for (const d of diffs.slice(0, show)) console.log('  ' + d);
  } else console.log(`${name}: 같음 (요소 ${ma.size}개)`);
}
console.log(`대조 ${compared}화면, 달라진 화면 ${changed}`);
process.exit(compared ? (changed ? 1 : 0) : 2);
