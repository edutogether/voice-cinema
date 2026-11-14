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

/**
 * 아래 그림 띠에서 장면을 골라 녹음실로 들어간다. 가운데가 아닌 카드의 «… 더빙 시작»을 바로 누르면 Playwright가 자동 넘김(6초마다)이
 * 그 카드를 가운데로 데려올 때까지 기다린다 — 일곱째 카드(스포츠)면 약 36초다(11/14 preview-audio · session-reset이 60초 한도를 넘은 원인).
 */
export async function openScene(page, id) {
  await page.locator('#splash').waitFor({ state: 'detached' });
  await pauseScenes(page);
  await page.locator(`.scene-choice[data-genre="${id}"]`).click();
  await expect(page.locator('#studio')).toHaveClass(/active/);
}
