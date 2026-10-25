// 새 8편 시간표(30fps 210번째 프레임 7.000초 정지)는 영상이 들어오기 전까지 쓰지 않는다(src/genres.ts의 NEXT_SCENES).
// 모드는 셋이다(src/genres.ts의 sceneOf):
//   live  — 장르에 적힌 장면 그대로(라이브 · 기본 주소). 새 영상이 들어와 켠 장르는 여기서도 새 시간표 + 자유 발화 안내다
//   next  — `?scenes=next`: 새 시간표만 빌려 옛 영상을 7초에 세운다. 옛 영상과 맞지 않는 새 안내는 붙이지 않는다(10/26 대표님)
//   final — `?scenes=final`: 모든 장르를 새 영상이 들어온 것으로 본다 — 시험용 합성 영상(e2e/fixtures/scene-next)으로 안내 위계를 확인할 때만
// `next`가 켜지는 주소는 둘뿐이다 — 이 기기 개발 주소(localhost 등)와 이 앱의 Hosting 미리보기 채널(`voice-cinema--<채널>-<해시>.web.app`).
// `final`은 개발 주소에서만 켜진다 — 미리보기 채널은 대표님이 직접 여는 주소라, 옛 영상 위에 새 안내가 뜨면 안 된다.
// 정식 주소 · 옛 주소 · Portal(edutogether.kr)에서는 무엇을 붙여도 live다 — 허용 목록 밖은 전부 live라서다.
// 미리보기 채널 규칙은 앞뒤를 묶고 점을 이스케이프한다(CORS 허용 출처와 같은 이유 — 접미사 위조·아무 문자 한 개). 업로드 실패 안내의
// isPreviewChannel(src/logic.ts)은 다른 사이트의 채널까지 넓게 알아보는 것이라 이 문으로 쓰지 않는다.
const LOCAL_HOSTS = ['localhost', '127.0.0.1', '[::1]'];
const PREVIEW_CHANNEL = /^voice-cinema--[a-z0-9-]+\.web\.app$/;

export type SceneMode = 'live' | 'next' | 'final';

export function sceneModeOf(location: Pick<Location, 'hostname' | 'search'>): SceneMode {
  const scenes = new URLSearchParams(location.search).get('scenes');
  const local = LOCAL_HOSTS.includes(location.hostname);
  if (scenes === 'final' && local) return 'final';
  if (scenes === 'next' && (local || PREVIEW_CHANNEL.test(location.hostname))) return 'next';
  return 'live';
}

export const sceneMode: SceneMode = typeof window !== 'undefined' ? sceneModeOf(window.location) : 'live';
