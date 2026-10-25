// 시험용 새 장면(tools/make-test-scene.mjs → e2e/fixtures/scene-next — 30fps 210번째 프레임 7.000초 정지, 위 1/4에 프레임 번호, 회색 128)을
// 원판 자리에 넘긴다. 새 8편 영상이 아직 없어서, 새 영상이 들어온 장면(시간표 · 자유 발화 안내)은 이 합성 영상으로 확인한다.
import { readFileSync } from 'node:fs';

export const fixture = (name) => readFileSync(`e2e/fixtures/scene-next/${name}`);

/** Hosting처럼 구간 요청(Range)에 206으로 답한다 — 통째로만 주면 브라우저가 정지 시각으로 찾아가지 못하고 0초로 돌아간다 */
export const serve = (name) => (route) => {
  const body = fixture(name);
  const headers = { 'content-type': 'video/mp4', 'accept-ranges': 'bytes' };
  const range = /bytes=(\d*)-(\d*)/.exec(route.request().headers().range ?? '');
  if (!range) return route.fulfill({ status: 200, body, headers });
  const start = range[1] ? Number(range[1]) : 0;
  const end = range[2] ? Math.min(Number(range[2]), body.length - 1) : body.length - 1;
  return route.fulfill({ status: 206, body: body.subarray(start, end + 1), headers: { ...headers, 'content-range': `bytes ${start}-${end}/${body.length}` } });
};

/**
 * 장르(기본 8장르 전부)의 녹음실 원판 · 합성용 원판을 시험용 새 장면으로 바꿔 낸다. 홈 카드 미리보기(clips/previews/)는 그대로다.
 * 서비스워커가 원판을 가로채면 바꿔치기가 닿지 않으므로 그 검사는 `serviceWorkers: 'block'`으로 연다.
 */
export async function routeSceneFixture(page, genres = ['sf', 'fantasy', 'animation', 'hero', 'thriller', 'drama', 'sports', 'musical']) {
  for (const id of genres) {
    await page.route(new RegExp(`/clips/${id}\\.mp4(\\?|$)`), serve('clip.mp4'));
    await page.route(new RegExp(`/clips/final/${id}\\.mp4(\\?|$)`), serve('final.mp4'));
  }
}
