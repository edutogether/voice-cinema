import { test, expect } from '@playwright/test';

for (const [이름, 키] of [['엔터', 'Enter'], ['스페이스', 'Space']]) {
  test(`키보드 탭과 ${이름} 키로 장면을 선택해 더빙 화면에 들어간다`, async ({ page }) => {
    await page.goto('/');
    await page.locator('#splash').waitFor({ state: 'detached' });
    await page.keyboard.press('Tab');
    await expect(page.getByRole('link', { name: '개인정보처리방침 (새 탭)' })).toBeFocused();
    await page.keyboard.press('Tab');
    const 첫장면 = page.getByRole('button', { name: '판타지 더빙 시작', exact: true });
    await expect(첫장면).toBeFocused();
    await page.keyboard.press(키);
    await expect(page.locator('#studio')).toHaveClass(/active/);
    await expect(page.locator('#chipName')).toHaveText('판타지');
  });
}
