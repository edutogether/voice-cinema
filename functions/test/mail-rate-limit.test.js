// /mail의 분당 한도를 **진짜 핸들러**로 본다(2026-11-08). 한도는 모듈 안 상태라 이 파일에서만 센다.
// 인증을 통과한 요청만 세고(분당 20), 인증 전 요청은 업로드와 같은 넉넉한 상한(분당 600)만 쓴다 — 메일 몫을 쓰지 않는다.
import { test, expect, vi } from 'vitest';
import http from 'node:http';

vi.mock('firebase-admin/app-check', () => ({
  getAppCheck: () => ({ verifyToken: async (token) => { if (token !== 'good') throw new Error('bad token'); return {}; } }),
}));
vi.mock('firebase-admin/storage', () => ({ getStorage: () => ({ bucket: () => ({ name: 'test-bucket', file: () => ({ exists: async () => [false] }) }) }) }));

const TOKEN = 'ac3231330f737aaf7f90c825f7ddacc9e287b3ac87caf99d';

test('인증 전 요청이 와도 메일은 분당 20번까지 받고, 21번째부터 429', async () => {
  process.env.FUNCTIONS_EMULATOR = 'true';
  vi.spyOn(console, 'warn').mockImplementation(() => {});
  const { voiceCinema } = await import('../index.js');
  const server = http.createServer((req, res) => voiceCinema(req, res));
  await new Promise((resolve) => server.listen(0, '127.0.0.1', resolve));
  const send = (appCheck) => fetch(`http://127.0.0.1:${server.address().port}/mail`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', 'x-booth-token': TOKEN, 'x-firebase-appcheck': appCheck },
    body: JSON.stringify({ to: 'x', items: [] }),
  }).then((r) => r.status);
  try {
    for (let i = 0; i < 30; i++) expect(await send('bad')).toBe(401);
    const statuses = [];
    for (let i = 0; i < 22; i++) statuses.push(await send('good'));
    expect(statuses).toEqual([...Array(20).fill(400), 429, 429]);
  } finally { await new Promise((resolve) => server.close(resolve)); }
}, 60000);
