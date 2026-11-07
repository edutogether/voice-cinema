import { expect } from '@playwright/test';

// 녹음실은 «더빙하기»로 들어가면 장면이 저절로 흐른다(11/7 Bumm님). 준비 화면을 보는 검사는 작은 «미리보기 멈춤»으로 재생을 접고 시작한다.
export async function stopAutoPreview(page) {
  await page.locator('#previewBtn', { hasText: '미리보기 멈춤' }).click();
  await expect(page.locator('#studio')).toHaveAttribute('data-phase', 'idle');
}
