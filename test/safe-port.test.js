// 시험 서버 포트 고르기(tools/safe-port.mjs). 11/8 전체 E2E에서 Windows가 포트 0에 6668을 주어 크롬이 `net::ERR_UNSAFE_PORT`로 막았다.
import { test, expect } from 'vitest';
import http from 'node:http';
import { BAD_PORTS, listenOnSafePort } from '../tools/safe-port.mjs';

test('막히는 포트를 받으면 닫고 다시 띄워 막히지 않는 포트를 돌려준다', async () => {
  const given = [6668, 10080, 50123];
  let closed = 0;
  const server = {
    port: 0,
    once() {},
    off() {},
    listen(_port, _host, done) { this.port = given.shift(); done(); },
    address() { return { port: this.port }; },
    close(done) { closed += 1; done(); },
  };
  expect(await listenOnSafePort(server, '127.0.0.1')).toBe(50123);
  expect(closed).toBe(2);
});

test('진짜 서버도 막히지 않는 포트로 뜬다', async () => {
  const server = http.createServer((_req, res) => res.end('ok'));
  try {
    const port = await listenOnSafePort(server, '127.0.0.1');
    expect(BAD_PORTS.has(port)).toBe(false);
    expect(server.address().port).toBe(port);
    expect(await (await globalThis.fetch(`http://127.0.0.1:${port}/`)).text()).toBe('ok');
  } finally {
    await new Promise((resolve) => server.close(resolve));
  }
});

test('목록은 크롬 · fetch가 막는 포트다', () => {
  expect(BAD_PORTS.has(6668)).toBe(true);
  expect(BAD_PORTS.has(10080)).toBe(true);
  expect(BAD_PORTS.has(4321)).toBe(false);
});
