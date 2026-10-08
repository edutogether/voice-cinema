// 라이브 배포 커밋 읽기(tools/live-commit.js)를 고정한다(2026-10-08).
// "표시 없음"(다시 배포)과 "라이브를 못 봄"(멈춤)을 섞으면 안 된다 — 서버가 잠깐 흔들릴 때마다
// 다시 배포하거나, 반대로 옛 배포를 "확인됨"으로 넘기게 된다.
import { test, expect, describe } from 'vitest';
import { spawn } from 'node:child_process';
import http from 'node:http';
import process from 'node:process';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { commitFromResponse, readLiveCommit } from '../tools/live-commit.js';

const SHA = 'd'.repeat(40);

describe('commitFromResponse', () => {
  test('200이고 commit이 40자리 커밋이면 그 값', () => {
    expect(commitFromResponse(200, JSON.stringify({ ok: true, commit: SHA }))).toBe(SHA);
  });
  test('표시가 없으면 빈 값 — 404, commit 없음·null, 형식이 다름, JSON이 아님', () => {
    expect(commitFromResponse(404, 'Not Found')).toBe('');
    expect(commitFromResponse(200, JSON.stringify({ ok: true }))).toBe('');
    expect(commitFromResponse(200, JSON.stringify({ ok: true, commit: null }))).toBe('');
    expect(commitFromResponse(200, JSON.stringify({ commit: 'abc1234' }))).toBe('');
    expect(commitFromResponse(200, '<!doctype html>')).toBe('');
  });
  test('그 밖의 응답은 "표시 없음"이 아니라 예외', () => {
    expect(() => commitFromResponse(503, '')).toThrow('503');
    expect(() => commitFromResponse(403, '')).toThrow('403');
  });
});

describe('readLiveCommit', () => {
  const 응답 = (status, body) => ({ status, text: async () => body });
  test('서버가 잠깐 흔들리면 다시 묻는다', async () => {
    const 차례 = [응답(503, ''), 응답(200, JSON.stringify({ commit: SHA }))];
    let 횟수 = 0;
    const r = await readLiveCommit('https://x/', { waitMs: 0, fetchImpl: async () => 차례[횟수++] });
    expect(r).toBe(SHA);
    expect(횟수).toBe(2);
  });
  test('끝내 못 읽으면 예외 — "표시 없음"으로 세지 않는다', async () => {
    let 횟수 = 0;
    const 실패 = async () => { 횟수++; throw new Error('연결 실패'); };
    await expect(readLiveCommit('https://x/', { attempts: 3, waitMs: 0, fetchImpl: 실패 })).rejects.toThrow('3번 시도');
    expect(횟수).toBe(3);
  });
  test('404는 다시 묻지 않고 바로 "표시 없음"', async () => {
    let 횟수 = 0;
    const r = await readLiveCommit('https://x/', { waitMs: 0, fetchImpl: async () => { 횟수++; return 응답(404, ''); } });
    expect(r).toBe('');
    expect(횟수).toBe(1);
  });
});

// 워크플로가 부르는 방식 그대로 — 표준출력에는 커밋(또는 빈 줄)만 나와야 $(...)로 받을 수 있다.
test('명령으로 실행하면 표준출력에 커밋만 쓴다', async () => {
  const server = http.createServer((req, res) => {
    if (req.url === '/version.json') { res.setHeader('content-type', 'application/json'); res.end(JSON.stringify({ commit: SHA })); return; }
    res.statusCode = 404; res.end('Not Found');
  });
  await new Promise((resolve) => server.listen(0, '127.0.0.1', resolve));
  const script = path.join(path.dirname(fileURLToPath(import.meta.url)), '..', 'tools', 'live-commit.js');
  const 실행 = (url) => new Promise((resolve) => {
    const p = spawn(process.execPath, [script, url]);
    let out = '';
    p.stdout.on('data', (d) => { out += d; });
    p.on('close', (code) => resolve({ code, out }));
  });
  try {
    const base = `http://127.0.0.1:${server.address().port}`;
    expect(await 실행(`${base}/version.json`)).toEqual({ code: 0, out: `${SHA}\n` });
    expect(await 실행(`${base}/없음`)).toEqual({ code: 0, out: '\n' });
  } finally {
    await new Promise((resolve) => server.close(resolve));
  }
});
