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
 * 홈에서 장면 하나를 골라 그 녹음실로 들어간다(검사 준비). 자동 넘김을 먼저 멈추고(pauseScenes), 아래 바로가기에 초점을 줘 그 장면을
 * 가운데로 부른 뒤 가운데 장면을 누른다.
 * 왜(10/26): 가운데가 아닌 장면은 낭독에서 감춰져(aria-hidden) `getByRole('… 더빙 시작')`이 자동 넘김이 그 장면을 데려올 때까지 기다리고,
 * 누르는 사이 다음 넘김(가운데 미리보기 재생 6초 뒤)이 오면 옮겨 간 카드를 60초 동안 계속 누르거나(e2e/recording-sample.spec.js) 다른 카드를
 * 눌렀다(e2e/gallery-reveal.spec.js) — 기계가 바쁠 때만 흔들린 원인이다. 고른 뒤 7초 늦게 누르는 흉내로 옛 순서는 매번 다른 녹음실이 열렸다.
 */
export async function openScene(page, name) {
  await pauseScenes(page);
  const choice = page.getByRole('button', { name: `${name} 미리보기 선택`, exact: true });
  await choice.focus();
  await expect(choice).toHaveAttribute('aria-pressed', 'true');
  await expect(page.locator('.scene-shell.is-current .tile')).toHaveAttribute('aria-label', `${name} 더빙 시작`);
  await page.getByRole('button', { name: `${name} 더빙 시작`, exact: true }).click();
}
