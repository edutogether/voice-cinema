// 오프라인 부팅 회귀 테스트.
//
// 왜 있는가: 2026-09-07 감사에서 서비스워커 캐시 목록에 App Check 번들이 빠져
// **인터넷이 끊긴 상태에서 탭을 새로 열면 앱이 통째로 안 뜨는** 상태였던 것이
// 발견됐다. 행사장에서 이게 터지면 부스가 멈춘다. 리액트 전환으로 캐시 목록은
// 빌드가 자동 생성하게 바뀌었지만, "정말 오프라인에서 뜨는가"는 그것과 별개라
// 여기서 매번 실제로 확인한다.
import { test, expect } from '@playwright/test';

// 엔진(31MB)까지 받아야 설치가 끝나므로 기본 타임아웃보다 넉넉히 잡는다.
test.setTimeout(180000);

// 앱이 부팅하려면 반드시 캐시에 있어야 하는 것들. App Check 번들은 2026-09-07에
// 실제로 이 목록에서 빠져 오프라인 부팅이 죽었던 파일이라 반드시 확인한다.
const REQUIRED = [
  '/index.html',
  '/privacy.html',
  '/vendor/firebase/firebase-app-check.js',
  '/vendor/ffmpeg/index.js',
  '/vendor/ffmpeg-core/ffmpeg-core.wasm',
  '/vendor/qrcode.js',
];

// 참고: page.waitForFunction()은 async 콜백이 돌려주는 Promise를 그 자체로 참으로
// 취급해 조건과 무관하게 즉시 통과한다(이 테스트를 만들며 실제로 겪음).
// 캐시 조회는 비동기라 expect.poll()로 확인해야 한다.
async function cacheState(page) {
  // 서비스워커가 제어권을 잡는 순간 앱이 스스로 한 번 새로고침하므로, 확인 중에
  // 페이지가 이동해 실행 컨텍스트가 사라질 수 있다(CI에서 실제로 겪음).
  // 그건 실패가 아니라 "아직 확인할 수 없음"이므로 다음 폴링에서 다시 본다.
  try {
    return await page.evaluate(async (required) => {
      const missing = [];
      for (const url of required) {
        // ignoreVary는 서비스워커가 실제로 캐시를 찾을 때 쓰는 것과 같은 조건이다.
        // 이 서버는 정적 파일에 Vary: Origin을 붙이는데, 그러면 저장할 때와 찾을 때의
        // 요청 헤더가 달라 캐시에 있는데도 못 찾는 일이 생긴다(이 전환 중 실측).
        if (!(await caches.match(url, { ignoreVary: true }))) missing.push(url);
      }
      return { controlled: !!navigator.serviceWorker.controller, missing };
    }, REQUIRED);
  } catch {
    return { controlled: false, missing: ['(페이지 이동 중이라 확인 못 함)'] };
  }
}

test('인터넷이 끊긴 상태에서 탭을 새로 열어도 앱이 정상 부팅된다', async ({ page, context }) => {
  await page.goto('/');

  // 서비스워커가 이 탭의 제어권을 잡고, 부팅에 필요한 파일이 전부 캐시에 들어올
  // 때까지 기다린다. 둘 다 봐야 한다 — cache.addAll()은 진행 중에도 일부만 먼저
  // 보이고, 제어권만 보면 캐시가 아직 덜 찼을 수 있다.
  await expect
    .poll(() => cacheState(page), { timeout: 150000, intervals: [500, 1000, 2000] })
    .toEqual({ controlled: true, missing: [] });

  // 제어권을 처음 잡는 순간 앱이 스스로 한 번 새로고침한다(새 배포를 즉시 반영하기
  // 위한 동작). 그 이동이 끝난 뒤에 확인해야 하므로 여기서 한 번 더 명시적으로 연다.
  await page.goto('/');

  // 진짜로 인터넷을 끊고 탭을 새로 연다.
  await context.setOffline(true);
  await page.reload();

  await expect(page.locator('.tile')).toHaveCount(6);
  await expect(page.locator('.tile', { hasText: '판타지' })).toBeVisible();

  // 개인정보처리방침도 오프라인에서 열려야 한다(고지 가용성).
  await page.goto('/privacy.html');
  await expect(page.locator('body')).toContainText('인천광역시교육청');

  await context.setOffline(false);
});
