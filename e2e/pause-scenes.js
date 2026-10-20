import { expect } from '@playwright/test';

/**
 * 장면 자동 넘김과 아래 그림 띠 흐름을 멈춘다(검사 준비). 멈춤 단추는 10/20 대표님 지시로 없앴고, 사람이 멈추는 길은
 * 가운데 장면에 마우스 올리기·키보드·손가락으로 한 번 밀거나 누르기(10/19 V-h)다 — 검사는 그중 손가락 누르기(터치
 * pointerdown)를 그대로 쓴다.
 */
export async function pauseScenes(page) {
  await page.locator('.scene-carousel').dispatchEvent('pointerdown', { pointerType: 'touch', isPrimary: true });
  await expect(page.locator('.scene-choices')).toHaveAttribute('data-paused', 'true');
}
