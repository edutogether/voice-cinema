/* 현장 의견 내보내기 · 지우기 도구(tools/feedback-export.mjs, 2026-11-08 Bumm님 «Poster Studio와 똑같이»).
   내보낸 json에 적힌 문서만 지우는지 · 엑셀이 수식으로 읽지 않는지 · 다른 json으로는 지우지 않는지를 가짜 Firestore로 고정한다. */
import { test, expect } from 'vitest';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { exportFeedback, deleteExported, toCsv } from '../tools/feedback-export.mjs';

function fakeDb(docs) {
  const store = new Map(docs.map((d) => [d.id, d]));
  const deleted = [];
  const commits = [];
  const ts = (iso) => ({ toDate: () => new Date(iso) });
  return {
    deleted,
    commits,
    store,
    collection(name) {
      expect(name).toBe('feedback');
      return {
        orderBy(field) {
          expect(field).toBe('createdAt');
          return {
            async get() {
              const list = [...store.values()].sort((a, b) => a.createdAt.localeCompare(b.createdAt));
              return { docs: list.map(({ id, createdAt, ...rest }) => ({ id, data: () => ({ ...rest, createdAt: ts(createdAt) }) })) };
            },
          };
        },
        doc: (id) => ({ id }),
      };
    },
    batch() {
      const ops = [];
      return {
        delete: (ref) => ops.push(ref.id),
        async commit() { commits.push(ops.length); for (const id of ops) { store.delete(id); deleted.push(id); } },
      };
    },
  };
}

const row = (id, createdAt, extra = {}) => ({ id, createdAt, name: '김선생', text: '의견', version: 'main-abc.js', screen: '1280x587@1.5', device: 'pc', step: 1, ...extra });
const tmp = () => fs.mkdtempSync(path.join(os.tmpdir(), 'vc-fb-export-'));

test('내보내기: 받은 시각 순 · 한국 시각 · 엑셀용 BOM · 문서 번호가 든 json', async () => {
  const db = fakeDb([row('b2', '2026-11-10T03:00:00.000Z'), row('a1', '2026-11-10T01:30:00.000Z', { text: '줄\n바꿈 "따옴표"' })]);
  const out = tmp();
  const r = await exportFeedback(db, out, new Date('2026-11-20T00:00:00Z'));
  expect(r.count).toBe(2);
  const csv = fs.readFileSync(r.csvPath, 'utf8');
  expect(csv.startsWith('﻿"받은 시각(한국)","이름","의견","판 번호","화면 크기","기기","단계","문서 번호"')).toBe(true);
  const lines = csv.slice(1).split('\r\n');
  expect(lines[1]).toBe('"2026-11-10 10:30:00","김선생","줄\n바꿈 ""따옴표""","main-abc.js","1280x587@1.5","pc","1","a1"');
  expect(lines[2].startsWith('"2026-11-10 12:00:00"')).toBe(true);
  const json = JSON.parse(fs.readFileSync(r.jsonPath, 'utf8'));
  expect(json).toMatchObject({ project: 'inky-voice-cinema', collection: 'feedback', count: 2 });
  expect(json.rows.map((x) => x.id)).toEqual(['a1', 'b2']);
  expect(json.rows[0].createdAt).toBe('2026-11-10T01:30:00.000Z');
  expect(db.deleted).toEqual([]);
  // 같은 시각에 다시 내보내도 덮지 않는다
  await expect(exportFeedback(db, out, new Date('2026-11-20T00:00:00Z'))).rejects.toThrow('덮지 않는다');
});

test('CSV: =, +, -, @로 시작하는 칸은 글자로(엑셀 수식 막기)', () => {
  const csv = toCsv([row('x', '2026-11-10T00:00:00Z', { name: '=HYPERLINK("a")', text: '+1', version: '-v', screen: '@s' })]);
  expect(csv).toContain(`"'=HYPERLINK(""a"")","'+1","'-v","'@s"`);
});

test('지우기: 내보낸 json에 적힌 문서만 · 그 뒤에 들어온 의견은 남는다', async () => {
  const db = fakeDb([row('a1', '2026-11-10T01:00:00Z'), row('b2', '2026-11-10T02:00:00Z')]);
  const r = await exportFeedback(db, tmp(), new Date('2026-11-20T00:00:00Z'));
  db.store.set('c3', row('c3', '2026-11-20T01:00:00Z'));
  expect(await deleteExported(db, r.jsonPath)).toEqual({ deleted: 2 });
  expect(db.deleted).toEqual(['a1', 'b2']);
  expect([...db.store.keys()]).toEqual(['c3']);
});

test('지우기: 400건씩 나누어 지운다(Firestore 한 묶음의 한도 500 아래)', async () => {
  const db = fakeDb(Array.from({ length: 801 }, (_, i) => row(`d${String(i).padStart(4, '0')}`, `2026-11-10T01:${String(i % 60).padStart(2, '0')}:00Z`)));
  const r = await exportFeedback(db, tmp(), new Date('2026-11-20T00:00:00Z'));
  expect(await deleteExported(db, r.jsonPath)).toEqual({ deleted: 801 });
  expect(db.commits).toEqual([400, 400, 1]);
  expect(db.store.size).toBe(0);
});

test('지우기: 내보내기 도구가 만든 json이 아니면 하나도 지우지 않는다', async () => {
  const db = fakeDb([row('a1', '2026-11-10T01:00:00Z')]);
  const dir = tmp();
  const bad = [
    { project: 'inky-poster-studio', collection: 'feedback', count: 1, rows: [{ id: 'a1' }] },
    { project: 'inky-voice-cinema', collection: 'kakaoAuth', count: 1, rows: [{ id: 'a1' }] },
    { project: 'inky-voice-cinema', collection: 'feedback', count: 2, rows: [{ id: 'a1' }] },
    { project: 'inky-voice-cinema', collection: 'feedback', count: 1, rows: [{ id: '../x' }] },
  ];
  for (const [i, data] of bad.entries()) {
    const p = path.join(dir, `bad-${i}.json`);
    fs.writeFileSync(p, JSON.stringify(data));
    await expect(deleteExported(db, p)).rejects.toThrow();
  }
  expect(db.deleted).toEqual([]);
});
