// 저장 대기 화면의 대기 영상 — Poster Studio(src/studio/waitingVideo.ts · waitingNetwork.ts, 2806349)의 규칙 그대로다.
// 파일(public/waiting-v3)과 목록(waiting-videos.json)은 Poster Studio가 인코딩한 승인본 waiting-v3를 바이트 그대로 옮겼다(11/9 Bumm님, 팀장 전달).
import manifest from './waiting-videos.json';

interface WaitingVideoEntry { id: number; status: string; src: string | null; sha256: string | null; bytes: number; still: string; stillSha256: string }

/** 검수된 파일만 연결한다 — 승인되지 않은 항목은 주소조차 요청하지 않는다. 파일 이름에 내용 해시 앞 12자리가 있어야 한다(바꾸면 이름도 바뀌어 옛 캐시에 갇히지 않는다). */
export function approvedWaitingVideo(id: number): string | undefined {
  const item = (manifest as WaitingVideoEntry[]).find((entry) => entry.id === id);
  if (!item || item.status !== 'approved' || !item.src || !item.sha256) return;
  const name = String(id).padStart(2, '0');
  return item.src === `/waiting-v3/${name}-${item.sha256.slice(0, 12)}.mp4` && /^[a-f0-9]{64}$/.test(item.sha256) ? item.src : undefined;
}

const prefetched = new Map<string, Promise<void>>();

/** 다음 장면 영상을 미리 받아 브라우저 캐시에 둔다 — 장면이 바뀌면 <video>가 그 캐시에서 읽는다.
 *  같은 주소는 한 번만 받는다. 못 받아도 던지지 않고, 다음에 다시 받을 수 있게 기억에서 지운다. */
export function prefetchWaitingVideo(src: string): Promise<void> {
  let job = prefetched.get(src);
  if (!job) {
    job = fetch(src)
      .then((res) => { if (!res.ok) throw new Error(`대기 영상 미리 받기 ${res.status}`); return res.arrayBuffer(); })
      .then(() => undefined, () => { prefetched.delete(src); });
    prefetched.set(src, job);
  }
  return job;
}

/** 대기 화면에 쓰는 정지 그림을 한 장씩 미리 받는다(Voice Cinema, 2026-11-09) — 서비스워커가 캐시에 두어(tools/sw-template.js),
 *  부스의 인터넷이 끊긴 뒤 저장해도 대기 화면에 그림이 보인다(영상은 못 받으면 정지 그림으로 남는다 — WaitingArtwork).
 *  앱이 엔진을 받은 뒤에 부른다(App.tsx). 못 받은 그림은 건너뛴다 — 다음에 열 때 다시 받는다. */
export async function warmWaitingStills(stills: readonly string[]): Promise<void> {
  for (const still of stills) {
    try { await (await fetch(still)).arrayBuffer(); } catch { /* 다음에 다시 받는다 */ }
  }
}
