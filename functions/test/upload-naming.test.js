// 업로드 저장 이름을 서버가 정하는지, 이미 있는 객체에 쓰지 않는지를 **진짜 핸들러**로 본다
// (2026-10-05, 보안 지적 대응). Storage와 App Check만 가짜로 바꾼다.
import { test, expect, vi } from 'vitest';
import http from 'node:http';

const 저장 = vi.hoisted(() => []);
vi.mock('firebase-admin/app-check', () => ({ getAppCheck: () => ({ verifyToken: async () => ({}) }) }));
vi.mock('firebase-admin/storage', () => ({
  getStorage: () => ({
    bucket: () => ({
      file: (name) => ({
        save: async (buffer, opts) => { 저장.push({ name, opts, bytes: buffer.length }); },
        makePublic: async () => {},
        publicUrl: () => `https://storage.example/${name}`,
      }),
    }),
  }),
}));

const TOKEN = 'ac3231330f737aaf7f90c825f7ddacc9e287b3ac87caf99d';
const MP4 = Buffer.concat([Buffer.from([0, 0, 0, 32]), Buffer.from('ftypisom'), Buffer.alloc(64)]).toString('base64');
const 클라이언트이름 = 'dub_fantasy_1700000000000_abcdefabcdef.mp4';

test('같은 이름으로 두 번 올려도 서버가 각각 새 이름을 정하고, 덮어쓰지 않게 저장한다', async () => {
  process.env.FUNCTIONS_EMULATOR = 'true';
  const { voiceCinema } = await import('../index.js');
  const server = http.createServer((req, res) => voiceCinema(req, res));
  await new Promise((resolve) => server.listen(0, '127.0.0.1', resolve));
  const 올리기 = () =>
    fetch(`http://127.0.0.1:${server.address().port}/upload`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'x-booth-token': TOKEN, 'x-firebase-appcheck': 'x' },
      body: JSON.stringify({ filename: 클라이언트이름, mimeType: 'video/mp4', dataBase64: MP4 }),
    }).then((r) => r.json());
  try {
    const 첫번째 = await 올리기();
    const 두번째 = await 올리기();
    expect(첫번째.ok && 두번째.ok).toBe(true);
    expect(저장).toHaveLength(2);
    const [a, b] = 저장.map((s) => s.name);
    expect(a).not.toBe(b);
    for (const s of 저장) {
      expect(s.name).not.toBe('dubs/' + 클라이언트이름);
      expect(s.name).toMatch(/^dubs\/dub_fantasy_\d+_[0-9a-f]{18}\.mp4$/);
      expect(s.opts.preconditionOpts, '이미 있는 객체에 쓰지 않는 조건이 빠졌다').toEqual({ ifGenerationMatch: 0 });
    }
    // 학생에게 가는 주소(QR)는 서버가 정한 이름을 가리킨다
    expect(첫번째.url).toBe(`https://storage.example/${a}`);
  } finally { await new Promise((resolve) => server.close(resolve)); }
}, 30000);
