// 스플래시가 매번 끝까지 재생되는지 확인한다.
//
// 왜 있는가: 2026-09-09에 두 가지가 잇달아 일어났다.
// (1) 화면을 보는 중에 스플래시가 다시 떴다 — 원인은 새 서비스워커가 제어권을
//     넘겨받을 때 앱이 스스로 새로고침하던 동작이었고, 그것을 없앴다(src/main.tsx).
// (2) 그때 여분의 방어선으로 "한 탭에 한 번만" 층을 얹었는데, #splash가 정적
//     마크업이라 이미 그려진 뒤에 JS가 지우는 바람에 **한 프레임 번쩍이고 사라졌다.**
//     대표가 "눈에 안 보일 정도로 뭐가 스쳐감"으로 발견했다. 그 층은 걷어냈다.
//
// 그래서 지금의 올바른 기대는 "페이지를 열 때마다 끝까지 재생된다"이다.
// 새로고침해도 첫 진입과 같아야 한다 — 어떤 때는 나오고 어떤 때는 번쩍이면
// 사용자에게는 앱이 고장난 것으로 보인다.
import { test, expect } from '@playwright/test';

test.setTimeout(60000);

// 스플래시는 1800ms 유지 → 500ms 페이드 → 2400ms에 소멸한다. 500ms 시점이면
// 아직 충분히 떠 있어야 한다 — 그전에 사라졌다면 "번쩍이고 지나간" 그 증상이다.
const 유지확인_MS = 500;

async function 스플래시가_끝까지_재생되는가(page) {
  await expect(page.locator('#splash')).toBeVisible();
  await page.waitForTimeout(유지확인_MS);
  // 아직 떠 있어야 한다.
  expect(await page.locator('#splash').count(), '스플래시가 너무 빨리 사라졌다').toBe(1);
  // 그리고 제때 사라져야 한다.
  await page.waitForFunction(() => !document.getElementById('splash'), null, { timeout: 20000 });
}

test('페이지를 열 때마다 스플래시가 끝까지 재생된다', async ({ page }) => {
  await page.goto('/');
  await 스플래시가_끝까지_재생되는가(page);
  await expect(page.locator('.tile')).toHaveCount(6);

  // 새로고침해도 첫 진입과 같아야 한다.
  await page.reload();
  await 스플래시가_끝까지_재생되는가(page);
  await expect(page.locator('.tile')).toHaveCount(6);
});
