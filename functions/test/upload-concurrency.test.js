import { test, expect } from 'vitest';
import http from 'node:http';

test('동시 업로드 2000건에서 인증과 분당 제한을 우회하지 못한다', async () => {
  process.env.FUNCTIONS_EMULATOR = 'true';
  const { voiceCinema } = await import('../index.js');
  const server = http.createServer((req, res) => voiceCinema(req, res));
  await new Promise(resolve => server.listen(0, '127.0.0.1', resolve));
  const url = `http://127.0.0.1:${server.address().port}/upload`;
  const statuses = [];
  let next = 0;
  try {
    // 같은 부스 IP에서 20개 연결을 겹친다. 인증 전 거부되어 Storage에는 접근하지 않는다.
    await Promise.all(Array.from({ length: 20 }, async () => {
      while (next++ < 2000) {
        const response = await fetch(url, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: '{}' });
        statuses.push(response.status);
        await response.arrayBuffer();
      }
    }));
    expect(statuses).toHaveLength(2000);
    expect(statuses.filter(code => code === 403)).toHaveLength(60);
    expect(statuses.filter(code => code === 429)).toHaveLength(1940);
    expect(statuses.some(code => code >= 500 || code === 200)).toBe(false);
  } finally { await new Promise(resolve => server.close(resolve)); }
}, 30000);
