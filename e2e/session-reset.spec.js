// 녹음 세션 초기화 회귀 테스트.
//
// 왜 있는가: 옛 구조에서는 "이전 녹음 세션 결과를 버린다"를 goHome()/openStudio()가
// 손으로 호출하는 리셋에 의존했다. 그걸 빠뜨리면 홈에 나갔다 같은 장르로 다시
// 들어왔을 때 이전 녹음이 그대로 살아남아, 다른 학생이 앞 사람의 목소리를
// 저장하게 된다 — 눈에 잘 안 띄면서 사용자가 바로 겪는 종류의 회귀다.
// 리액트 전환에서는 스튜디오 진입마다 컴포넌트를 새로 마운트해 구조적으로 막았고,
// 그게 실제로 지켜지는지 여기서 확인한다.
import { test, expect } from '@playwright/test';

test('홈에 나갔다 같은 장르로 다시 들어오면 이전 녹음이 남아있지 않다', async ({ page }) => {
  await page.goto('/');
  await page.locator('.tile', { hasText: '드라마' }).click();

  // 한 번 끝까지 녹음한다.
  await page.locator('#recBtn').click();
  await expect(page.locator('#afterRow')).toBeVisible({ timeout: 20000 });

  // 홈으로 나갔다가 같은 장르로 다시 들어온다.
  await page.locator('.back').click();
  await expect(page.locator('#home')).toHaveClass(/active/);
  await page.locator('.tile', { hasText: '드라마' }).click();
  await expect(page.locator('#studio')).toHaveClass(/active/);

  // 이전 녹음이 버려져 처음 상태여야 한다.
  await expect(page.locator('#recBtn')).toBeVisible();
  await expect(page.locator('#afterRow')).toBeHidden();
  await expect(page.locator('#hint')).toContainText('미리 보기');
});

test('녹음 도중 홈으로 나가면 그 녹음 결과가 화면에 반영되지 않는다', async ({ page }) => {
  await page.goto('/');
  await page.locator('.tile', { hasText: '호러' }).click();
  await page.locator('#recBtn').click();

  // 카운트다운이 끝나고 녹음이 시작된 뒤에 나간다.
  await expect(page.locator('.recpill')).toBeVisible({ timeout: 15000 });
  await page.locator('.back').click();
  await expect(page.locator('#home')).toHaveClass(/active/);

  // 원래 녹음이 끝났을 시간(10초 + 여유)을 지나도 결과 화면으로 넘어가면 안 된다.
  await page.waitForTimeout(14000);
  await expect(page.locator('#home')).toHaveClass(/active/);

  // 다시 들어가도 처음 상태다.
  await page.locator('.tile', { hasText: '호러' }).click();
  await expect(page.locator('#recBtn')).toBeVisible();
  await expect(page.locator('#afterRow')).toBeHidden();
});
