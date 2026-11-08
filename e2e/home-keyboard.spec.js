import { test, expect } from '@playwright/test';

for (const [이름, 키] of [['엔터', 'Enter'], ['스페이스', 'Space']]) {
  test(`키보드 탭과 ${이름} 키로 장면을 선택해 더빙 화면에 들어간다`, async ({ page }) => {
    await page.goto('/');
    await page.locator('#splash').waitFor({ state: 'detached' });
    // 헤더 양쪽 브랜드가 "처음부터 시작" 버튼이 되어(2026-10-05 승인) 그 둘을 먼저 지난다.
    // 순서를 한 칸씩 확인한다 — 건너뛰면 탭 순서가 어긋나도 모른다.
    await page.keyboard.press('Tab');
    await expect(page.getByRole('button', { name: 'CGV와 인천광역시교육청 — 처음부터 시작' })).toBeFocused();
    await page.keyboard.press('Tab');
    await expect(page.getByRole('button', { name: 'InKY Film Festival — 처음부터 시작' })).toBeFocused();
    // «의견 보내기»는 2026-11-14 00:00(한국 시간)에 사라진다(e2e/feedback.spec.js) — 그 전에만 그 칸을 지난다
    if (Date.now() < Date.parse('2026-11-14T00:00:00+09:00')) {
      await page.keyboard.press('Tab');
      await expect(page.getByRole('button', { name: '의견 보내기' })).toBeFocused();
    }
    await page.keyboard.press('Tab');
    await expect(page.getByRole('link', { name: 'Voice Cinema 설치 파일 다운로드' })).toBeFocused();
    await page.keyboard.press('Tab');
    await expect(page.getByRole('link', { name: '개인정보처리방침 (새 탭)' })).toBeFocused();
    await page.keyboard.press('Tab');
    const 첫장면 = page.getByRole('button', { name: 'SF 더빙 시작', exact: true });
    await expect(첫장면).toBeFocused();
    await page.keyboard.press(키);
    await expect(page.locator('#studio')).toHaveClass(/active/);
    await expect(page.locator('#chipName')).toHaveText('SF');
  });
}
