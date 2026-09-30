import { test, expect } from '@playwright/test';

// 흐르는 카드의 정지를 기다리는 locator.hover/click 대신 사용자가 보는 현재 위치를 가리킨다.
async function pointChoice(page, name, area = '사진', click = false) {
  const point = await page.locator('.scene-choice-card').evaluateAll((cards, { name, area }) => {
    const bounds = document.querySelector('.scene-choices').getBoundingClientRect();
    const card = cards.find(card => {
      const r = card.getBoundingClientRect();
      return card.getAttribute('aria-label') === `${name} 미리보기 선택` && r.left >= bounds.left && r.right <= bounds.right;
    });
    if (!card) return null;
    const rect = card.getBoundingClientRect();
    const image = card.querySelector('img').getBoundingClientRect();
    const label = card.querySelector('span').getBoundingClientRect();
    return { x: rect.x + rect.width / 2, y: area === '글씨' ? label.y + label.height / 2 : area === '빈 영역' ? image.bottom + 4 : image.y + image.height / 2 };
  }, { name, area });
  expect(point, `${name} 선택지가 온전히 보여야 한다`).not.toBeNull();
  await page.mouse.move(point.x, point.y);
  if (click) await page.mouse.click(point.x, point.y);
}


test('PC: 여섯 바로가기로 고른 중앙 장면에서 각각 더빙을 시작한다', async ({ page }) => {
  await page.setViewportSize({ width: 1366, height: 768 });
  await page.goto('/');
  await page.locator('#splash').waitFor({ state: 'detached' });
  for (const name of ['판타지', '애니메이션', '호러', '액션', '드라마', '시트콤']) {
    await pointChoice(page, name);
    const tile = page.getByRole('button', { name: `${name} 더빙 시작`, exact: true });
    await expect(tile.locator('.gname')).toBeInViewport({ ratio: 1 });
    // 강제 클릭 없이 실제로 누를 수 있어야 한다. 이웃 카드의 겹침이 가리면 실패한다.
    await tile.locator('.tile-enter').click();
    await expect(page.locator('#chipName')).toHaveText(name);
    await page.locator('#studioBackBtn').click();
  }
});

test('PC: 설명은 항상 보이고 호버해도 영상 위치와 크기가 변하지 않는다', async ({ page }) => {
  await page.setViewportSize({ width: 1440, height: 900 });
  await page.goto('/');
  await page.locator('#splash').waitFor({ state: 'detached' });
  const tile = page.getByRole('button', { name: '판타지 더빙 시작', exact: true });
  const media = tile.locator('.tile-media');
  const body = tile.locator('.tile-body');
  await expect(body).toBeVisible();
  const before = await media.boundingBox();
  await tile.hover();
  await expect.poll(() => tile.locator('video').evaluate(v => v.currentTime)).toBeGreaterThan(.1);
  const mediaBox = await media.boundingBox();
  const bodyBox = await body.boundingBox();
  // Bumm님이 채택한 무비차트 방향: 영상·설명 자리는 고정하고 재생만 바꾼다.
  for (const key of ['x', 'y', 'width', 'height']) expect(mediaBox[key]).toBeCloseTo(before[key], 0);
  expect(mediaBox.y + mediaBox.height).toBeLessThanOrEqual(bodyBox.y + 1);
  await tile.locator('.tile-enter').click();
  await expect(page.locator('#chipName')).toHaveText('판타지');
});

test('PC: 화살표 키로 마지막 장면을 고른 뒤 녹음실에서 돌아와도 선택을 유지한다', async ({ page }) => {
  await page.setViewportSize({ width: 1440, height: 900 });
  await page.goto('/');
  await page.locator('#splash').waitFor({ state: 'detached' });
  await page.keyboard.press('Tab');
  await expect(page.getByRole('link', { name: '개인정보처리방침 (새 탭)' })).toBeFocused();
  await page.keyboard.press('Tab');
  const first = page.getByRole('button', { name: '판타지 더빙 시작', exact: true });
  await expect(first).toBeFocused();
  await expect(first.locator('.tile-body')).toHaveCSS('opacity', '1');
  await page.keyboard.press('ArrowLeft');
  await expect(page.getByRole('button', { name: '시트콤 미리보기 선택' })).toBeFocused();
  const last = page.getByRole('button', { name: '시트콤 더빙 시작', exact: true });
  await last.focus();
  await page.keyboard.press('Enter');
  await expect(page.locator('#chipName')).toHaveText('시트콤');
  await page.locator('#studioBackBtn').click();
  await expect(last).toBeFocused();
  await expect(last).toBeInViewport({ ratio: .9 });
});

test('PC: 다음·이전·드래그로 넘기며 이전 장면의 재생 자원을 놓는다', async ({ page }) => {
  await page.goto('/');
  await page.locator('#splash').waitFor({ state: 'detached' });
  const first = page.getByRole('button', { name: '판타지 더빙 시작', exact: true });
  await first.hover();
  await expect.poll(() => first.locator('video').evaluate(v => v.currentTime)).toBeGreaterThan(.1);
  await page.getByRole('button', { name: '다음 장면', exact: true }).click();
  await expect(page.getByRole('button', { name: '애니메이션 미리보기 선택' })).toHaveAttribute('aria-pressed', 'true');
  await expect(page.locator('[data-genre="fantasy"] video')).not.toHaveAttribute('src');
  await page.getByRole('button', { name: '이전 장면', exact: true }).click();
  await expect(page.getByRole('button', { name: '판타지 미리보기 선택' })).toHaveAttribute('aria-pressed', 'true');
  // 이동 중인 카드 좌표 대신 정착한 중앙 이미지에서 드래그를 시작한다.
  await expect(page.locator('.scene-stage')).toHaveAttribute('data-moving', 'false');
  const box = await first.boundingBox();
  await page.mouse.move(box.x + box.width * .65, box.y + 70);
  await page.mouse.down();
  await page.mouse.move(box.x + box.width * .35, box.y + 70, { steps: 6 });
  await page.mouse.up();
  await expect(page.getByRole('button', { name: '애니메이션 미리보기 선택' })).toHaveAttribute('aria-pressed', 'true');
  await expect(page.locator('#home')).toHaveClass(/active/);
});


test('PC: 영상 위는 선택을 유지하고 흰 화살표 영역에 진입할 때만 한 칸 이동한다', async ({ page }) => {
  await page.setViewportSize({ width: 1440, height: 900 });
  await page.goto('/');
  await page.locator('#splash').waitFor({ state: 'detached' });
  // 겹친 카드의 중심은 중앙 카드에 가려져 있다. 실제로 노출된 오른쪽 영상 위에 올린다.
  const point = await page.evaluate(() => {
    const stage = document.querySelector('.scene-stage').getBoundingClientRect();
    const y = stage.y + stage.height / 3;
    for (let x = stage.right - 2; x > stage.left; x -= 4) {
      if (document.elementFromPoint(x, y)?.closest('.scene-shell')?.dataset.index === '1') return { x, y };
    }
    return null;
  });
  expect(point, '오른쪽 장면이 가려져 호버할 수 없다').not.toBeNull();
  await page.mouse.move(point.x, point.y);
  await expect(page.locator('.scene-shell.is-current')).toHaveAttribute('data-index', '0');
  const arrow = page.getByRole('button', { name: '다음 장면', exact: true });
  await expect(arrow).toHaveCSS('background-color', 'rgba(0, 0, 0, 0)');
  await expect(arrow).toHaveCSS('color', 'rgb(255, 255, 255)');
  await arrow.hover();
  const choice = page.getByRole('button', { name: '애니메이션 미리보기 선택' });
  const video = page.locator('[data-genre="animation"] video');
  await expect(choice).toHaveAttribute('aria-pressed', 'true');
  await expect.poll(() => video.evaluate(v => v.currentTime)).toBeGreaterThan(.1);
  const before = await video.evaluate(v => v.currentTime);
  await page.waitForTimeout(700);
  await expect(choice).toHaveAttribute('aria-pressed', 'true');
  expect(await video.evaluate(v => v.currentTime)).toBeGreaterThan(before);
  await expect(page.locator('.tile video[src]')).toHaveCount(1);
  await arrow.click();
  await expect(choice).toHaveAttribute('aria-pressed', 'true');
  const hit = await arrow.boundingBox();
  // 투명 원 바깥의 사각 모서리에는 반응하지 않는다.
  await page.mouse.move(hit.x + 1, hit.y + 1);
  await expect(choice).toHaveAttribute('aria-pressed', 'true');
  await arrow.hover();
  await expect(page.locator('.scene-shell.is-current')).toHaveAttribute('data-index', '2');
});

test('PC: 썸네일 호버 즉시 재생을 요청하고 빠르게 훑은 뒤 마지막 선택만 재생한다', async ({ page }) => {
  await page.addInitScript(() => {
    window.__previewTiming = [];
    let entered = 0;
    document.addEventListener('pointerover', event => {
      if (event.target.closest?.('.scene-choice')) entered = performance.now();
    }, true);
    const original = window.HTMLMediaElement.prototype.play;
    window.HTMLMediaElement.prototype.play = function () {
      if (this.closest('.tile') && entered) window.__previewTiming.push(performance.now() - entered);
      return original.call(this);
    };
  });
  await page.goto('/');
  await page.locator('#splash').waitFor({ state: 'detached' });
  for (const name of ['애니메이션', '호러', '액션', '드라마', '시트콤']) {
    await pointChoice(page, name);
    await expect(page.getByRole('button', { name: `${name} 미리보기 선택` })).toHaveAttribute('aria-pressed', 'true');
  }
  const video = page.locator('[data-genre="sitcom"] video');
  await expect.poll(() => video.evaluate(v => v.currentTime)).toBeGreaterThan(.1);
  const timing = await page.evaluate(() => window.__previewTiming);
  expect(timing.length).toBeGreaterThanOrEqual(5);
  // 기존 280ms 대기를 제거했다. 다운로드 완료 시간과 재생 요청 시점은 구분한다.
  expect(timing[0]).toBeLessThan(200);
  await expect(page.locator('.tile video[src]')).toHaveCount(1);
  await expect(page.locator('.tile video[src]')).toHaveAttribute('src', '/clips/previews/sitcom.mp4');
  await page.getByRole('button', { name: '시트콤 더빙 시작', exact: true }).click();
  await expect(page.locator('#studio')).toHaveClass(/active/);
  await expect(page.locator('.tile video[src]')).toHaveCount(0);
  expect(await page.locator('.tile video').evaluateAll(videos => videos.every(v => v.paused))).toBe(true);
});


// 버튼 모양의 "더빙하기"뿐 아니라, 활성 장면 전체가 같은 진입 대상이어야 한다.
for (const area of ['사진', '제목', '소개', '빈 영역', '아래 사진', '아래 글씨', '아래 빈 영역']) {
  test(`PC: 호버로 위아래 선택을 맞추고 ${area} 클릭으로 같은 녹음실에 들어간다`, async ({ page }) => {
    await page.goto('/');
    await page.locator('#splash').waitFor({ state: 'detached' });
    const names = ['판타지', '애니메이션', '호러', '액션', '드라마', '시트콤'];
    for (const [index, name] of names.entries()) {
      const choice = page.getByRole('button', { name: `${name} 미리보기 선택`, exact: true });
      await pointChoice(page, name);
      await expect(choice).toHaveAttribute('aria-pressed', 'true');
      await expect(page.locator('.scene-choice[aria-pressed="true"]')).toHaveCount(1);
      const shell = page.locator('.scene-shell.is-current');
      await expect(shell).toHaveAttribute('data-index', String(index));
      const tile = shell.locator('.tile');
      await expect(tile.locator('.gname')).toContainText(name);
      if (area === '사진') await tile.locator('.tile-media').click();
      if (area === '제목') await tile.locator('.gname').click();
      if (area === '소개') await tile.locator('.gsub').click();
      if (area === '빈 영역') await tile.locator('.tile-body').click({ position: { x: 8, y: 5 } });
      if (area.startsWith('아래 ')) await pointChoice(page, name, area.slice(3), true);
      await expect(page.locator('#studio')).toHaveClass(/active/);
      await expect(page.locator('#chipName')).toHaveText(name);
      await expect(page.locator('.tile video[src]')).toHaveCount(0);
      await page.locator('#studioBackBtn').click();
    }
  });
}

test('PC: 아래 썸네일을 키보드로 고르면 위아래가 맞춰지고 엔터로 진입한다', async ({ page }) => {
  await page.goto('/');
  await page.locator('#splash').waitFor({ state: 'detached' });
  const choice = page.getByRole('button', { name: '드라마 미리보기 선택' });
  await choice.focus();
  await expect(choice).toHaveAttribute('aria-pressed', 'true');
  await expect(page.locator('.scene-shell.is-current .gname')).toContainText('드라마');
  await page.keyboard.press('Enter');
  await expect(page.locator('#chipName')).toHaveText('드라마');
});


test('PC: 순환 카드는 보이지 않는 뒤편에서 이동하고 연속 호버 뒤 마지막 장면에 안착한다', async ({ page }) => {
  await page.goto('/');
  await page.locator('#splash').waitFor({ state: 'detached' });
  await page.evaluate(() => {
    window.__motion = { frames: [], done: false };
    const sample = () => {
      window.__motion.frames.push([...document.querySelectorAll('.scene-shell')].map(shell => {
        const style = getComputedStyle(shell);
        return { x: new window.DOMMatrix(style.transform).m41, opacity: Number(style.opacity), width: shell.offsetWidth };
      }));
      if (!window.__motion.done) requestAnimationFrame(sample);
    };
    requestAnimationFrame(sample);
  });
  await pointChoice(page, '애니메이션');
  await expect(page.locator('.scene-stage')).toHaveAttribute('data-moving', 'true');
  await expect(page.locator('.scene-stage')).toHaveAttribute('data-moving', 'false');
  const frames = await page.evaluate(() => { window.__motion.done = true; return window.__motion.frames; });
  expect(frames.length).toBeGreaterThan(10);
  let recycled = 0;
  for (let frame = 1; frame < frames.length; frame++) {
    frames[frame].forEach((card, index) => {
      const before = frames[frame - 1][index];
      if (Math.abs(card.x - before.x) > card.width) {
        recycled++;
        expect(before.opacity).toBeLessThan(.1);
        expect(card.opacity).toBeLessThan(.1);
      }
    });
  }
  expect(recycled, '순환 경계를 실제로 관찰해야 한다').toBeGreaterThan(0);
  for (const name of ['드라마', '판타지', '액션', '시트콤']) {
    await pointChoice(page, name);
  }
  await expect(page.locator('.scene-stage')).toHaveAttribute('data-moving', 'false');
  await expect(page.locator('.scene-shell.is-current')).toHaveAttribute('data-index', '5');
  const center = await page.locator('.scene-shell.is-current').boundingBox();
  const stage = await page.locator('.scene-stage').boundingBox();
  expect(center.x + center.width / 2).toBeCloseTo(stage.x + stage.width / 2, 0);
  await expect(page.locator('.scene-choice[aria-pressed="true"]')).toHaveAttribute('aria-label', '시트콤 미리보기 선택');
});

test('PC: 움직임 줄이기 설정에서는 입체 전환 없이 즉시 고른다', async ({ page }) => {
  await page.emulateMedia({ reducedMotion: 'reduce' });
  await page.goto('/');
  await page.locator('#splash').waitFor({ state: 'detached' });
  await page.getByRole('button', { name: '드라마 미리보기 선택' }).hover();
  await expect(page.locator('.scene-stage')).toHaveAttribute('data-moving', 'false');
  await expect(page.locator('.scene-shell.is-current')).toHaveAttribute('data-index', '4');
  await expect(page.locator('.scene-shell.is-current .tile-body')).toHaveCSS('transition-duration', '0s');
});


test('PC: 썸네일에서 이동 중인 중앙으로 마우스를 옮겨도 선택이 되돌아가지 않는다', async ({ page }) => {
  await page.goto('/');
  await page.locator('#splash').waitFor({ state: 'detached' });
  const stage = await page.locator('.scene-stage').boundingBox();
  const choice = page.getByRole('button', { name: '액션 미리보기 선택' });
  await pointChoice(page, '액션');
  await page.mouse.move(stage.x + stage.width / 2, stage.y + stage.height / 3);
  await expect(choice).toHaveAttribute('aria-pressed', 'true');
  await expect(page.locator('.scene-stage')).toHaveAttribute('data-moving', 'false');
  await expect(page.locator('.scene-shell.is-current')).toHaveAttribute('data-index', '3');
});
