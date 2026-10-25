// 새 8편 시간표(30fps 202번째 프레임 정지)는 영상이 들어오기 전까지 쓰지 않는다(src/genres.ts의 NEXT_SCENES).
// `?scenes=next`로 열 때 그 시간표로 트는 주소는 둘뿐이다 — 이 기기 개발 주소(localhost 등, 시험 e2e/scene-next.spec.js)와
// 이 앱의 Hosting 미리보기 채널(`voice-cinema--<채널>-<해시>.web.app`, 10/25 대표님 실기기 확인용).
// 정식 주소 · 옛 주소 · Portal(edutogether.kr)에서는 무엇을 붙여도 지금 시간표다 — 허용 목록 밖은 전부 지금 시간표라서다.
// 미리보기 채널 규칙은 앞뒤를 묶고 점을 이스케이프한다(CORS 허용 출처와 같은 이유 — 접미사 위조·아무 문자 한 개). 업로드 실패 안내의
// isPreviewChannel(src/logic.ts)은 다른 사이트의 채널까지 넓게 알아보는 것이라 이 문으로 쓰지 않는다.
const LOCAL_HOSTS = ['localhost', '127.0.0.1', '[::1]'];
const PREVIEW_CHANNEL = /^voice-cinema--[a-z0-9-]+\.web\.app$/;

export function isNextScenes(location: Pick<Location, 'hostname' | 'search'>): boolean {
  return (LOCAL_HOSTS.includes(location.hostname) || PREVIEW_CHANNEL.test(location.hostname))
    && new URLSearchParams(location.search).get('scenes') === 'next';
}

export const nextScenesOn = typeof window !== 'undefined' && isNextScenes(window.location);
