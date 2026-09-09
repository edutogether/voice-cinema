// 새로 배포한 화면이 기기에 바로 반영되는지 확인한다.
//
// 왜 있는가: 2026-09-09에 개인정보처리방침을 새로 만들어 배포했는데, 기기에서는
// 옛 화면이 그대로 나왔다. 원인은 서비스워커의 분기 순서였다 — /privacy.html이
// 프리캐시 목록에 들어 있어서 "캐시 우선" 분기에 먼저 걸렸고, 그 분기는 캐시에
// 항목이 있으면 **네트워크를 아예 보지 않는다.** 그래서 그 기기의 서비스워커가
// 교체되기 전까지 계속 옛 화면이 나왔다. 홈은 경로가 '/'라 프리캐시 목록에 없어
// 네트워크 우선 분기로 가서 바로 반영됐고, 그 차이 때문에 "한 화면만 안 바뀐다"로
// 보였다.
//
// 캐시 이름이 바뀌면 결국 교체되긴 하지만, 그건 "언젠가 고쳐진다"이지 배포가
// 반영됐다는 뜻이 아니다. 행사 직전 급히 문구를 고쳐야 할 때 이 차이는 크다.
import { test, expect } from '@playwright/test';

// 엔진(31MB)까지 받아야 설치가 끝난다.
test.setTimeout(180000);

// 캐시 조회는 비동기라 expect.poll로 확인한다 — page.waitForFunction()은 async
// 콜백이 돌려주는 Promise를 그 자체로 참으로 취급해 즉시 통과한다.
// 서비스워커가 제어권을 잡는 순간 페이지가 이동해 실행 컨텍스트가 사라질 수
// 있는데, 그건 실패가 아니라 "아직 확인할 수 없음"이라 다음 폴링에서 다시 본다.
async function precached(page) {
  try {
    return await page.evaluate(async () => ({
      controlled: !!navigator.serviceWorker.controller,
      hasPrivacy: !!(await caches.match('/privacy.html', { ignoreVary: true })),
    }));
  } catch {
    return { controlled: false, hasPrivacy: false };
  }
}

test('서비스워커가 이미 캐시한 화면이라도 새로 배포한 내용이 바로 보인다', async ({ page, context }) => {
  await page.goto('/');
  await expect
    .poll(() => precached(page), { timeout: 150000, intervals: [500, 1000, 2000] })
    .toEqual({ controlled: true, hasPrivacy: true });

  // 여기서부터 서버가 다른 내용을 돌려준다 = 새 배포가 나간 상황이다.
  // 서비스워커가 보내는 요청도 이 경로로 잡힌다.
  const 새내용 = '새로 배포된 방침 본문';
  await context.route('**/privacy.html', (route) =>
    route.fulfill({
      status: 200,
      contentType: 'text/html; charset=utf-8',
      body: `<!doctype html><html lang="ko"><body>${새내용}</body></html>`,
    })
  );

  await page.goto('/privacy.html');
  // 캐시 우선이면 여기서 옛 내용("인천광역시교육청"이 든 원래 방침)이 나온다.
  await expect(page.locator('body')).toContainText(새내용);

  await context.unroute('**/privacy.html');
});
