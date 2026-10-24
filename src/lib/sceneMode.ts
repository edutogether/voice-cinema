// 새 8편 시간표(약 7.0초 정지)는 영상이 들어오기 전까지 쓰지 않는다(src/genres.ts의 NEXT_SCENES).
// 이 기기 개발 주소(localhost 등)에서 `?scenes=next`로 열 때만 그 시간표로 튼다 — 시험(e2e/scene-next.spec.js)과 영상 교체 전 확인용.
// 라이브 주소에서는 무엇을 붙여도 지금 시간표 그대로다.
export function isLocalNextScenes(location: Pick<Location, 'hostname' | 'search'>): boolean {
  return ['localhost', '127.0.0.1', '[::1]'].includes(location.hostname)
    && new URLSearchParams(location.search).get('scenes') === 'next';
}

export const nextScenesOn = typeof window !== 'undefined' && isLocalNextScenes(window.location);
