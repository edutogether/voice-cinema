import { test, expect } from '@playwright/test';
import { createHash } from 'node:crypto';
import { readFileSync } from 'node:fs';
import { URL } from 'node:url';

// 그림·영상 주소에는 내용 해시가 붙는다(10/20) — clips/**는 이름이 그대로라, 해시가 없으면 장면을 바꿔 배포해도
// 이미 본 기기는 하루 캐시·서비스워커 캐시의 옛 그림을 계속 낸다(미리보기에서 옛 장면과 새 장면이 섞여 보였다).
// 해시가 실제 파일 내용과 맞는지까지 본다 — 파일을 바꾸면 주소도 바뀐다는 뜻이다.
const versionOf = (pathname) => createHash('sha256').update(readFileSync(`public${pathname}`)).digest('hex').slice(0, 8);

function expectVersioned(urls) {
  expect(urls.length).toBeGreaterThan(0);
  for (const raw of urls) {
    const url = new URL(raw, 'http://localhost');
    expect(url.searchParams.get('v'), url.pathname).toBe(versionOf(url.pathname));
  }
}

test('카드 미리보기·그림 띠·녹음실 원판·포스터 주소에 그 파일의 내용 해시가 붙는다', async ({ page }) => {
  const requested = [];
  page.on('request', (r) => { if (r.url().includes('/clips/')) requested.push(r.url()); });
  await page.goto('/');
  await page.locator('#splash').waitFor({ state: 'detached' });
  await expect(page.locator('.tile video[src]')).toHaveCount(1);
  const home = await page.$$eval('img[src*="/clips/"], video[src*="/clips/"]', (els) => els.map((e) => e.getAttribute('src')));
  expect(home.some((u) => u.includes('/clips/previews/'))).toBe(true);
  expect(home.some((u) => u.includes('/clips/thumbs/'))).toBe(true);
  expectVersioned([...home, ...requested]);

  await page.locator('.tile').first().click();
  const clip = page.locator('#clip');
  await expect(clip).toHaveAttribute('src', /\/clips\/sf\.mp4\?v=/);
  expectVersioned([await clip.getAttribute('src'), await clip.getAttribute('poster')]);
});
