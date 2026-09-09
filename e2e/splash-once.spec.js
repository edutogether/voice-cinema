// 화면이 뜬 뒤에는 스플래시가 다시 나타나지 않는다.
//
// 왜 있는가: 2026-09-09에 대표가 라이브를 보다가, 이미 화면을 다 본 뒤 가만히
// 있는데 스플래시가 잠깐 다시 떴다 사라지는 것을 발견했다. 원인은 새 서비스워커가
// 제어권을 넘겨받을 때 앱이 스스로 새로고침하던 동작이었다. 새로고침이 일어나면
// 정적 마크업인 #splash가 처음부터 다시 재생된다.
//
// 부스에서 이게 아이가 녹음하는 중에 일어나면 작업이 통째로 날아간다. 그래서
// 자동 새로고침 자체를 없앴고(src/main.tsx), 어떤 이유로 새로고침이 일어나더라도
// 스플래시는 그 탭에서 한 번만 보이게 했다(src/lib/splash.ts).
//
// 이 테스트는 뒤쪽 방어선을 고정한다 — 새로고침이라는, 스플래시가 다시 뜰 수 있는
// 가장 흔한 경로를 실제로 만들어 확인한다.
import { test, expect } from '@playwright/test';

test.setTimeout(60000);

test('한 번 본 뒤에는 새로고침해도 스플래시가 다시 뜨지 않는다', async ({ page }) => {
  await page.goto('/');

  // 첫 진입에서는 정상적으로 보였다가 사라져야 한다 — 여기서 아예 안 보이면
  // 이 테스트가 "원래 없는 것"을 확인하는 빈 게이트가 된다.
  expect(await page.locator('#splash').count()).toBe(1);
  await page.waitForFunction(() => !document.getElementById('splash'), null, { timeout: 20000 });

  // 같은 탭에서 새로고침한다(서비스워커 교체로 일어나던 것과 같은 상황).
  await page.reload();

  // 첫 페인트 시점에 이미 없어야 한다. 잠깐 보였다가 사라지는 것도 사용자에게는
  // "앱이 혼자 다시 시작했다"로 보이므로 통과가 아니다.
  expect(await page.locator('#splash').count()).toBe(0);
  await expect(page.locator('.tile')).toHaveCount(6);
});
