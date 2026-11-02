// 영상 자리 — 어떤 영상 묶음을 트는가(11/2 대표님, 팀장 전달).
// 새 영상(FINAL_7S, src/genres.ts의 NEXT_SCENES)이 아직 완성되지 않아, 처음에 장학사님이 준 Kling 영상의 앞 5초(LEGACY_5S —
// public/clips/legacy5s)로 영상만 임시로 바꿔 보인다. 흐름 · 화면은 그대로이고 «영상은 교체 예정»을 알린다.
//   legacy5s — 임시 5초 영상: 미리보기는 그대로 보이고, «장면 시작» → 3·2·1 → 멘트 → 영상이 처음부터 흐르는 동안 녹음(영상 위 더빙)
//   slides   — 지금 원판(10/17 슬라이드 원판, 5.0초 멈춤) · 새 영상이 들어온 장르는 새 시간표(NEXT_SCENES)
// 켜지는 주소: 이 앱의 Hosting 미리보기 채널(기본 켬 — `?videos=slides`면 지금 원판)과 이 기기 개발 주소(`?videos=legacy5s`일 때만 —
// 기존 E2E는 지금 원판 흐름을 그대로 본다). 정식 주소 · 옛 주소 · Portal에서는 언제나 지금 원판이다(라이브는 바꾸지 않는다).
// 🟠 새 영상이 오면 TEMP_VIDEOS를 null로 바꾼다 — 그 한 줄로 모든 주소에서 임시 영상이 꺼진다. 10초 · 7.0초 멈춤 코드는 그대로 남아 있다.
import { LOCAL_HOSTS, PREVIEW_CHANNEL } from './sceneMode';

export type VideoSet = 'legacy5s' | 'slides';

export const TEMP_VIDEOS: Exclude<VideoSet, 'slides'> | null = 'legacy5s';

export function videoSetOf(location: Pick<Location, 'hostname' | 'search'>, temp: Exclude<VideoSet, 'slides'> | null = TEMP_VIDEOS): VideoSet {
  if (!temp) return 'slides';
  const videos = new URLSearchParams(location.search).get('videos');
  if (LOCAL_HOSTS.includes(location.hostname)) return videos === temp ? temp : 'slides';
  if (PREVIEW_CHANNEL.test(location.hostname)) return videos === 'slides' ? 'slides' : temp;
  return 'slides';
}

export const videoSet: VideoSet = typeof window !== 'undefined' ? videoSetOf(window.location) : 'slides';
