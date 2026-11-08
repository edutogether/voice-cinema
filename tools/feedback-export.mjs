#!/usr/bin/env node
/* 현장 의견(Firestore `feedback`) 내보내기 · 지우기 — 2026-11-08 Bumm님 «Poster Studio와 똑같이»(Poster Studio scripts/ops/feedback-export.mjs와 같은 모양).
   _docs/intents/2026-11-08-field-feedback · app.md «현장 의견 보내기».

   내보내기: node tools/feedback-export.mjs export <결과 폴더>
     → <결과 폴더>/feedback-<시각>.csv(엑셀용 BOM · 받은 시각 순) · feedback-<시각>.json(문서 번호 포함 · 지우기의 입력)
   지우기:   node tools/feedback-export.mjs delete <내보낸 json> --confirm
     → 그 json에 적힌 문서만 지운다. 내보낸 뒤에 들어온 의견은 남는다(다시 내보내면 나온다).
   지우지 않아도 받은 지 90일이 지난 의견은 예약 함수 feedbackMaintenance가 매일 새벽 4시(한국 시간)에 지운다.

   권한: 이 컴퓨터의 Google 기본 자격(ADC). 프로젝트 소유 계정으로 `gcloud auth application-default login`을 먼저 한다.
   프로젝트는 inky-voice-cinema로 고정이다(GOOGLE_CLOUD_PROJECT보다 우선). 녹음한 목소리 · 영화는 이 컬렉션에 없다.
   🔴 결과 폴더를 저장소 안에 두지 않는다 — 이름과 의견이 들어 있다. */
import fs from 'node:fs';
import path from 'node:path';
import console from 'node:console';
import process from 'node:process';
import { createRequire } from 'node:module';
import { fileURLToPath, URL } from 'node:url';

const PROJECT = 'inky-voice-cinema';
const COLLECTION = 'feedback';
const BATCH = 400;
const COLUMNS = [
  ['받은 시각(한국)', (d) => kst(d.createdAt)],
  ['이름', (d) => d.name],
  ['의견', (d) => d.text],
  ['판 번호', (d) => d.version],
  ['화면 크기', (d) => d.screen],
  ['기기', (d) => d.device],
  ['단계', (d) => d.step],
  ['문서 번호', (d) => d.id],
];

function toDate(v) {
  if (v instanceof Date) return v;
  if (v && typeof v.toDate === 'function') return v.toDate();
  return null;
}
function kst(v) {
  const d = toDate(v);
  if (!d) return '';
  return new Date(d.getTime() + 9 * 3600_000).toISOString().replace('T', ' ').slice(0, 19);
}
// 엑셀이 =, +, -, @로 시작하는 칸을 수식으로 읽지 않게 앞에 '를 붙이고, 모든 칸을 따옴표로 감싼다
function cell(v) {
  let s = v == null ? '' : String(v);
  if (/^[=+\-@\t\r]/.test(s)) s = `'${s}`;
  return `"${s.replace(/"/g, '""')}"`;
}
export function toCsv(rows) {
  const lines = [COLUMNS.map(([h]) => cell(h)).join(',')];
  for (const r of rows) lines.push(COLUMNS.map(([, get]) => cell(get(r))).join(','));
  return '﻿' + lines.join('\r\n') + '\r\n';
}

export async function exportFeedback(db, outDir, now = new Date()) {
  const snap = await db.collection(COLLECTION).orderBy('createdAt').get();
  const rows = snap.docs.map((doc) => ({ id: doc.id, ...doc.data() }));
  const stamp = kst(now).replace(/[-: ]/g, '').slice(0, 12);
  fs.mkdirSync(outDir, { recursive: true });
  const csvPath = path.join(outDir, `feedback-${stamp}.csv`);
  const jsonPath = path.join(outDir, `feedback-${stamp}.json`);
  if (fs.existsSync(csvPath) || fs.existsSync(jsonPath)) throw new Error(`이미 있는 파일을 덮지 않는다: ${jsonPath}`);
  fs.writeFileSync(csvPath, toCsv(rows));
  const json = rows.map((r) => ({ ...r, createdAt: toDate(r.createdAt)?.toISOString() ?? null }));
  fs.writeFileSync(jsonPath, JSON.stringify({ project: PROJECT, collection: COLLECTION, exportedAt: now.toISOString(), count: rows.length, rows: json }, null, 2) + '\n');
  return { count: rows.length, csvPath, jsonPath };
}

export async function deleteExported(db, jsonPath) {
  const data = JSON.parse(fs.readFileSync(jsonPath, 'utf8'));
  if (data.project !== PROJECT || data.collection !== COLLECTION || !Array.isArray(data.rows) || data.rows.length !== data.count) {
    throw new Error('내보내기 도구가 만든 json이 아니다(프로젝트 · 컬렉션 · 건수가 맞지 않음)');
  }
  const ids = data.rows.map((r) => r.id);
  if (!ids.every((id) => typeof id === 'string' && /^[A-Za-z0-9]{1,64}$/.test(id))) throw new Error('문서 번호 모양이 이상하다');
  let deleted = 0;
  for (let i = 0; i < ids.length; i += BATCH) {
    const batch = db.batch();
    for (const id of ids.slice(i, i + BATCH)) batch.delete(db.collection(COLLECTION).doc(id));
    await batch.commit();
    deleted += Math.min(BATCH, ids.length - i);
  }
  return { deleted };
}

// firebase-admin은 functions 패키지의 것을 쓴다(루트에 따로 넣지 않는다)
async function openDb() {
  const require = createRequire(new URL('../functions/package.json', import.meta.url));
  const { initializeApp } = require('firebase-admin/app');
  const { getFirestore } = require('firebase-admin/firestore');
  return getFirestore(initializeApp({ projectId: PROJECT }));
}

async function main(argv) {
  const [cmd, target, flag] = argv;
  if (cmd === 'export' && target) {
    const r = await exportFeedback(await openDb(), path.resolve(target));
    console.log(`내보냄 ${r.count}건\n${r.csvPath}\n${r.jsonPath}`);
    return 0;
  }
  if (cmd === 'delete' && target && flag === '--confirm') {
    const r = await deleteExported(await openDb(), path.resolve(target));
    console.log(`지움 ${r.deleted}건`);
    return 0;
  }
  console.error('쓰는 법: export <결과 폴더> | delete <내보낸 json> --confirm');
  return 1;
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  main(process.argv.slice(2)).then((code) => { process.exitCode = code; }, (err) => { console.error(err.message); process.exitCode = 1; });
}
