// 시험 서버를 크롬 · fetch가 막지 않는 빈 포트로 띄운다(2026-11-08).
// 포트 0으로 띄우면 운영체제가 빈 포트를 주는데, Windows는 드물게 크롬 · fetch가 막는 포트(«bad port»)를 준다 — 그러면 그 시험은
// 서버와 상관없이 떨어진다(11/8 전체 E2E에서 6668을 받아 `net::ERR_UNSAFE_PORT`). 목록은 WHATWG Fetch 표준의 bad port 목록이다.
export const BAD_PORTS = new Set([
  1, 7, 9, 11, 13, 15, 17, 19, 20, 21, 22, 23, 25, 37, 42, 43, 53, 69, 77, 79, 87, 95, 101, 102, 103, 104, 109, 110, 111, 113, 115, 117, 119, 123, 135,
  137, 139, 143, 161, 179, 389, 427, 465, 512, 513, 514, 515, 526, 530, 531, 532, 540, 548, 554, 556, 563, 587, 601, 636, 989, 990, 993, 995,
  1719, 1720, 1723, 2049, 3659, 4045, 4190, 5060, 5061, 6000, 6566, 6665, 6666, 6667, 6668, 6669, 6679, 6697, 10080,
]);

// 막히지 않는 포트를 받을 때까지 다시 띄운다. 돌려주는 값은 그 포트다.
export async function listenOnSafePort(server, host) {
  for (;;) {
    await new Promise((resolve, reject) => {
      server.once('error', reject);
      server.listen(0, host, () => { server.off('error', reject); resolve(); });
    });
    const { port } = server.address();
    if (!BAD_PORTS.has(port)) return port;
    await new Promise((resolve) => server.close(resolve));
  }
}
