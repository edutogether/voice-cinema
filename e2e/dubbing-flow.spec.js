// 실사용 흐름 E2E 테스트(2026-08-27, 테스트 커버리지 완성도 향상).
// 실제 Chromium(가짜 마이크 장치)으로 홈 화면→녹음→ffmpeg.wasm 합성→저장까지
// 진짜로 돌려서 검증한다. Cloud Functions 업로드만 page.route로 가로채
// (a) 실제 프로덕션 Storage에 테스트 파일이 쌓이지 않게, (b) 네트워크 상태에
// 테스트 결과가 좌우되지 않게 한다 — 그 앞단(마이크 권한, 카운트다운, 녹음,
// ffmpeg 합성, 파일명 생성)은 전부 실제 코드 그대로 실행된다.
import { test, expect } from '@playwright/test';

const UPLOAD_PATTERN = '**/voiceCinema/upload';

test.describe('홈 화면', () => {
  test('6개 장르 타일이 전부 보이고 클릭 가능하다', async ({ page }) => {
    await page.goto('/');
    const tiles = page.locator('.tile');
    await expect(tiles).toHaveCount(6);
    for (const name of ['판타지', '애니메이션', '호러', '액션', '드라마', '시트콤']) {
      await expect(page.locator('.tile', { hasText: name })).toBeVisible();
    }
  });

  test('교육청 주최 안내 문구가 보인다 (2026-08-27 대표 확인 반영)', async ({ page }) => {
    await page.goto('/');
    await expect(page.locator('.privacy')).toContainText('인천광역시교육청');
  });
});

test.describe('스튜디오: 미리보기', () => {
  test('미리 보기를 누르면 영상이 재생되고 안내 문구가 바뀐다', async ({ page }) => {
    await page.goto('/');
    await page.locator('.tile', { hasText: '판타지' }).click();
    await expect(page.locator('#chipName')).toHaveText('판타지');

    const previewBtn = page.locator('#previewBtn');
    await previewBtn.click();
    await expect(previewBtn).toHaveText('⏹ 미리보기 정지');
    await expect(page.locator('#hint')).toContainText('생각해 보세요');

    // 정지도 정상 동작해야 한다.
    await previewBtn.click();
    await expect(previewBtn).toHaveText('▶ 미리 보기');
  });

  test('처음으로 버튼을 누르면 홈으로 돌아간다', async ({ page }) => {
    await page.goto('/');
    await page.locator('.tile', { hasText: '드라마' }).click();
    await expect(page.locator('#studio')).toHaveClass(/active/);
    await page.locator('.back').click();
    await expect(page.locator('#home')).toHaveClass(/active/);
  });
});

test.describe('녹음 → 합성 → 저장 (실사용 흐름)', () => {
  test('정상 흐름: 녹음 후 저장하면 클라우드 업로드 성공 시 QR이 표시된다', async ({ page }) => {
    await page.route(UPLOAD_PATTERN, (route) =>
      route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({ ok: true, url: 'https://storage.googleapis.com/fake/dub_test.mp4' }) })
    );

    await page.goto('/');
    await page.locator('.tile', { hasText: '판타지' }).click();
    await page.locator('#recBtn').click();

    // 3·2·1 카운트다운 + 10초 녹음이 끝나 afterRow(다시 듣기/다시 녹음/저장하기)가 뜰 때까지 기다린다.
    await expect(page.locator('#afterRow')).toBeVisible({ timeout: 20000 });
    await expect(page.locator('#recBtn')).toBeHidden();

    await page.locator('button', { hasText: '저장하기' }).click();

    // ffmpeg.wasm 실제 합성 → (가로챈) 업로드 → QR 표시까지 실제로 기다린다.
    await expect(page.locator('#done')).toBeVisible({ timeout: 30000 });
    await expect(page.locator('#qrbox')).toBeVisible();
    await expect(page.locator('#qrImg')).toHaveAttribute('src', /^data:image\//);
    await expect(page.locator('#downloadRow')).toBeHidden();
    await expect(page.locator('#savemode')).toContainText('누구나 볼 수 있어요');
  });

  test('실패 경로: 클라우드 업로드가 실패하면 기기 저장 버튼으로 폴백한다', async ({ page }) => {
    await page.route(UPLOAD_PATTERN, (route) =>
      route.fulfill({ status: 500, contentType: 'application/json', body: JSON.stringify({ ok: false, error: '저장 중 오류가 발생했습니다.' }) })
    );

    await page.goto('/');
    await page.locator('.tile', { hasText: '액션' }).click();
    await page.locator('#recBtn').click();
    await expect(page.locator('#afterRow')).toBeVisible({ timeout: 20000 });

    await page.locator('button', { hasText: '저장하기' }).click();

    await expect(page.locator('#done')).toBeVisible({ timeout: 30000 });
    await expect(page.locator('#downloadRow')).toBeVisible();
    await expect(page.locator('#qrbox')).toBeHidden();
    await expect(page.locator('#doneMsg')).toContainText('인터넷 문제');

    // #downloadBtn 자체엔 download 속성이 없다 — 클릭 시 JS가 그 순간 <a download>를
    // 만들어 클릭하고 지우는 구조라, 실제로 다운로드가 트리거되는지를 확인해야 한다.
    const [download] = await Promise.all([
      page.waitForEvent('download'),
      page.locator('#downloadBtn').click(),
    ]);
    expect(download.suggestedFilename()).toContain('잉키보이스시네마');
  });

  test('업로드가 두 번 다 실패해도(재시도 포함) 폴백으로 정상 종료된다', async ({ page }) => {
    // shouldRetryUpload()가 1회 재시도하므로, 두 번 다 실패시켜 재시도 이후에도
    // 화면이 멈추지 않고 폴백으로 끝나는지 확인한다.
    let callCount = 0;
    await page.route(UPLOAD_PATTERN, (route) => {
      callCount++;
      return route.fulfill({ status: 500, contentType: 'application/json', body: JSON.stringify({ ok: false, error: 'boom' }) });
    });

    await page.goto('/');
    await page.locator('.tile', { hasText: '호러' }).click();
    await page.locator('#recBtn').click();
    await expect(page.locator('#afterRow')).toBeVisible({ timeout: 20000 });
    await page.locator('button', { hasText: '저장하기' }).click();

    await expect(page.locator('#done')).toBeVisible({ timeout: 30000 });
    await expect(page.locator('#downloadRow')).toBeVisible();
    expect(callCount).toBeGreaterThanOrEqual(2); // 1차 실패 + 재시도 1회
  });

  test('다시 녹음을 누르면 초기 상태로 돌아가 다시 저장할 수 있다', async ({ page }) => {
    await page.goto('/');
    await page.locator('.tile', { hasText: '시트콤' }).click();
    await page.locator('#recBtn').click();
    await expect(page.locator('#afterRow')).toBeVisible({ timeout: 20000 });

    await page.locator('button', { hasText: '다시 녹음' }).click();
    await expect(page.locator('#recBtn')).toBeVisible();
    await expect(page.locator('#afterRow')).toBeHidden();
    await expect(page.locator('#hint')).toContainText('미리 보기');
  });
});
