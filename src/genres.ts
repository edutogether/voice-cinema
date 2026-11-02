// 장르 8종(장면 더빙 2.0, 대표님 10/11 확정). 이름·색·장면 이름·상대 대사를 항목 하나에 모아둔다.
//
// 색은 판타지·애니메이션·드라마는 1.0 색 그대로, 히어로·스릴러·스포츠는 빠진 장르(액션·호러·시트콤)의
// 색을 물려받고, SF·뮤지컬만 새 색이다(1안 — app-plan §2-5, 10/11 확정). 색이 빛나던 자리는 터치 기기의
// 격자 카드뿐이었는데 10/17 휴대폰도 캐러셀로 바꾸며 그 격자가 없어져, 지금은 화면 어디에도 쓰이지 않는다
// (10/17 06:40 대표님: 휴대폰도 캐러셀 확정, 장르 색 질문은 끝 — 확정값이라 지우지 않고 둔다). 원작 제목은 앱 화면 어디에도 쓰지 않는다.

import clipVersions from 'virtual:clip-versions';
import { CLIP_SECONDS, PAUSE_SECONDS, VOICE_WINDOW_SECONDS } from './config';
import { sceneMode, type SceneMode } from './lib/sceneMode';
import { videoSet, type VideoSet } from './lib/videoSet';

/**
 * 장면 하나의 시간표 — 영상마다 다르다. 영상을 바꾸면 이 값도 함께 바꾸고 `node tools/check-scene.mjs <장르> <정지 초> <목소리 칸 초> --cue <큐 목록>`으로
 * 영상과 맞는지 확인한다(10.000초, 정지 시각의 키프레임, 두 원판의 소리, 소리 트랙을 만든 큐 목록의 목소리 칸).
 */
/**
 * 자유 발화 안내(10/26 대표님) — 화면의 대사는 따라 읽는 정답이 아니라 예시다. 아이는 자기 말로 외치고, 말이 안 떠오르는 아이만 예시를 본다.
 * 위계: 상황 안내(크게) → 예시 대사(작게, «예시» 표시) → «내 말로 외쳐도 좋아요 !»(src/components/SceneGuide.tsx). 느낌표 앞은 한 칸 띈다.
 */
export interface SceneGuide {
  /** 상황 안내 — 크고 선명하게 */
  situation: string;
  /** 예시 대사 — 작게, 상황 안내보다 강조하지 않는다 */
  example: string;
}

export interface Scene {
  /** 앱이 영상을 멈추는 시각(초) — 영상의 키프레임이어야 정확히 그 그림에 선다 */
  pause: number;
  /** 아이 목소리가 들어가는 칸(초) — pause부터 이만큼, 원판 소리를 −8dB 낮춰 둔 자리. pause + voiceWindow ≤ 10 */
  voiceWindow: number;
  /** 새 장면(FINAL_7S)의 자유 발화 안내 — 없으면(지금 원판) 안내 문구만 보인다. 예시는 정답이 아니다(무엇을 말해도 녹음 · 저장된다) */
  guide?: SceneGuide;
  /** 상대 대사 — 앱이 영상 위에 띄우는 넷플릭스식 자막. 영상·완성본에는 굽지 않는다 */
  partnerLine?: { text: string; start: number; end: number };
  /** 영상 길이(초) — 지금 원판 · 새 장면 10, 임시 5초 영상 5. 진행 막대 · 완성본 길이가 이 값을 쓴다 */
  length: number;
  /**
   * 임시 5초 영상(LEGACY_5S, 11/2 대표님)의 멘트 — 있으면 정지 없이 영상 위에서 녹음한다: «장면 시작» → 3·2·1 → 멘트 → 영상이 처음부터
   * 흐르는 동안 녹음(인물의 입에 맞춰 더빙) → 이어 보기. 그때 pause는 0(목소리를 영상 0초에 놓는다)이고 voiceWindow는 영상 길이다.
   */
  line?: string;
  /** 영상 파일 폴더(public/clips 아래, 끝에 «/») — 임시 5초 영상은 'legacy5s/', 지금 원판은 없음 */
  assets?: string;
}

export interface Genre {
  id: string;
  name: string;
  color: string;
  /** 우리 장면 이름 — 카드와 녹음실 제목에 쓴다. */
  summary: string;
  /** 이 장르 원판의 시간표 — 지금 원판은 live(…), 새 영상이 들어오면 NEXT_SCENES.<장르>(그러면 자유 발화 안내까지 저절로 붙는다) */
  scene: Scene;
}

/** 임시 5초 영상(LEGACY_5S)일 때 이 장르에 쓰는 것 — 제목(없으면 지금 제목)과 아이 멘트(src/lib/videoSet.ts) */
interface Legacy5s {
  summary?: string;
  line: string;
}

// 지금 원판(2.0): 모든 장르가 5.0초에 멈추고, 상대 대사는 1.6초에 시작해 3.4초 전에 끝난다(스토리보드 §0). 아이 대사는 화면에 없다
// (예시 외침은 부스 도우미가 말로 안내할 때 참고하는 것).
const live = (partner: string): Scene => ({
  pause: PAUSE_SECONDS, voiceWindow: VOICE_WINDOW_SECONDS, length: CLIP_SECONDS, partnerLine: { text: partner, start: 1.6, end: 3.4 },
});

/**
 * 임시 5초 영상(LEGACY_5S, 11/2 대표님 «새 영상이 아직 완성되지 않았으니 처음에 장학사님이 준 Kling 영상으로 영상만 바꿔 놔라»).
 * 원본은 1.0 판의 Kling 클립 여섯(9/1 `29cdeeb`, 백업 _media/originals/2026-10-01 — 10초짜리이고 Kling 5초 생성 두 토막을 이은 것)이다.
 * 그 앞 5.000초(첫 토막 — 인물이 화면을 보고 말하는 장면)를 쓴다(tools/build-scene.mjs --legacy). 짝은 기록대로(1.0 장르의 색을 물려받은 것 —
 * 위 머리말): 판타지 · 애니메이션 · 드라마는 같은 장르, 히어로 ← 액션, 스릴러 ← 호러. 제목은 1.0 판의 그 영상 제목이다.
 * SF · 스포츠 · 뮤지컬은 짝이 되는 Kling 영상이 없다(스포츠가 색을 물려받은 시트콤은 거실 장면이라 «마지막 슛»과 맞지 않는다) —
 * 지금 원판의 앞 5초로 같은 흐름을 쓰고, 멘트는 스토리보드의 예시 외침이다(_docs/intents/2026-10-11-scene-homage/storyboards.md).
 * 원판 소리는 쓰지 않는다(Kling 원본은 소리가 없다 — 완성본은 영상 + 아이 목소리).
 */
export const LEGACY_SECONDS = 5;
const legacyScene = (line: string): Scene => ({ pause: 0, voiceWindow: LEGACY_SECONDS, length: LEGACY_SECONDS, line, assets: 'legacy5s/' });

/**
 * 새 8편(대표님이 만드는 영상, 10/25 지시)의 시간표 — **준비만 해 두고 아직 쓰지 않는다.** 새 영상이 들어오면 그 장르의 `scene`을
 * 이 값으로 바꾼다 — `scene: NEXT_SCENES.sf`(그래서 GENRES보다 위에 둔다). 그 한 줄로 7초 시간표와 자유 발화 안내가 함께 켜진다(sceneOf).
 * 영상마다 정지 시각을 맞춰 고친다.
 * 정지는 30fps 210번째 프레임(7.000초) — 10/26 대표님 FINAL 7.0S(10/25의 202번째 프레임 6.7333초는 버렸다). 남은 영상 3.000초가
 * 목소리 칸이고 실제로 말할 수 있는 시간도 3.000초다(src/lib/voiceCheck.ts의 maxSpeechFor — 앞 여백은 정지 시각 앞에 놓는다).
 * 상대 대사 자막(시각·글)은 영상이 오면 정한다. 화면에는 상황 안내와 예시 대사를 보인다(자유 발화, 10/26 대표님 — 예시는 정답이 아니다).
 * 느낌표·물음표 앞에는 한 칸을 띄운다(전 앱 규칙).
 */
const NEXT_PAUSE = 210 / 30;
const next = (situation: string, example: string): Scene => ({ pause: NEXT_PAUSE, voiceWindow: 10 - NEXT_PAUSE, length: CLIP_SECONDS, guide: { situation, example } });
export const NEXT_SCENES: Record<string, Scene> = {
  sf: next('첫인사를 건네 봐 !', '안녕 ! 우린 지구에서 왔어 !'),
  fantasy: next('지금이야, 외쳐 !', '그래 ! 내가 이긴다 !'),
  animation: next('미르에게 용기를 줘 !', '할 수 있어, 미르 ! 날아 !'),
  hero: next('기차를 멈춰 주세요 !', '멈춰라 ! 멈춰 !'),
  thriller: next('귀신을 물리쳐 !', '싫어 ! 저리 가 !'),
  drama: next('설이에게 약속해 줘 !', '설이야 ! 꼭 다시 올게 !'),
  sports: next('승부를 끝내 !', '간다 ! 내가 끝낸다 !'),
  musical: next('무대를 열어 !', '자, 다 같이 춤추자 !'),
};

// 장르마다 지금 원판과 임시 5초 영상(legacy5s)일 때 쓸 것을 함께 적어 둔다 — 영상 자리(src/lib/videoSet.ts)가 고른다.
const GENRE_LIST: (Genre & { legacy5s: Legacy5s })[] = [
  { id: 'sf', name: 'SF', color: '#3fa7c9', summary: '물의 행성', scene: live('저 산… 움직여 !'),
    legacy5s: { line: '엔진 점화 ! 출발 !' } },
  { id: 'fantasy', name: '판타지', color: '#8a63d2', summary: '빛의 결투', scene: live('나와 겨루겠다고 ?'),
    legacy5s: { summary: '주문 한마디로 펼치는 마법', line: '빛이여, 나에게 힘을 줘 !' } },
  { id: 'animation', name: '애니메이션', color: '#d97b3f', summary: '멋지게 떨어지기', scene: live('장난감은 못 날아 !'),
    legacy5s: { summary: '상상 속 친구와 나누는 이야기', line: '안녕 ! 나랑 같이 놀자 !' } },
  { id: 'hero', name: '히어로', color: '#c94f5c', summary: '왼쪽을 봐', scene: live('왼쪽을 봐. 우리가 왔어 !'),
    legacy5s: { summary: '위기의 순간을 뒤집는 한마디', line: '포기하지 마 ! 우리가 막아 낸다 !' } },
  { id: 'thriller', name: '스릴러', color: '#2f9e6e', summary: '레이저 금고', scene: live('레이저 바뀐다, 천천히 !'),
    legacy5s: { summary: '어둠 속에서 마주친 낯선 소리', line: '거기… 누구 있어요 ?' } },
  { id: 'drama', name: '드라마', color: '#c9a24b', summary: '기억의 한마디', scene: live('이제… 아무도 몰라보셔.'),
    legacy5s: { summary: '마음 깊이 전하고 싶은 진심', line: '고마워. 너는 내 진짜 친구야.' } },
  { id: 'sports', name: '스포츠', color: '#3f7fb8', summary: '마지막 슛', scene: live('너한테 맡긴다 !'),
    legacy5s: { line: '마지막 한 골, 들어가라 !' } },
  { id: 'musical', name: '뮤지컬', color: '#c4559e', summary: '서커스 첫 무대', scene: live('쇼는 계속되어야 해 !'),
    legacy5s: { line: '신사 숙녀 여러분, 쇼 타임 !' } },
];

/** 영상 자리에 맞춘 장르 — legacy5s면 제목 · 장면을 임시 5초 영상 것으로 바꾼다(색 · 이름 · 순서는 그대로) */
export function genresFor(set: VideoSet): Genre[] {
  return GENRE_LIST.map(({ legacy5s, ...genre }) => (set === 'legacy5s'
    ? { ...genre, summary: legacy5s.summary ?? genre.summary, scene: legacyScene(legacy5s.line) }
    : genre));
}

export const GENRES: Genre[] = genresFor(videoSet);

/**
 * 이 장르를 어떤 장면으로 트는가(모드는 src/lib/sceneMode.ts).
 *   새 영상이 들어와 켠 장르(`scene`이 NEXT_SCENES의 그 장면) — 어느 모드든 새 시간표 + 자유 발화 안내
 *   live — 장르에 적힌 장면 그대로 · final — 모든 장르를 새 영상이 들어온 것으로(시험용 합성 영상으로 안내 위계를 볼 때, 개발 주소만)
 *   next — 새 시간표만 빌린다. 아직 옛 영상인 장르에는 그 영상의 상황과 맞지 않는 새 안내를 띄우지 않는다
 *          (10/26 대표님 «아직 기존 영상이 사용되는 경우에는 … 신규 대사를 강제 표시하지 않는다») — 멈춘 동안은 «지금 바로 당신의 목소리를 들려주세요 !»
 */
export function sceneOf(genre: Pick<Genre, 'id' | 'scene'>, mode: SceneMode): Scene {
  // 임시 5초 영상은 모드와 상관없이 그 흐름이다 — 5초 영상을 7초에 세울 수 없다(옛 원판에 새 시간표를 빌리려면 ?videos=slides&scenes=next)
  if (genre.scene.line) return genre.scene;
  const next = NEXT_SCENES[genre.id];
  if (mode === 'final' || genre.scene === next) return next;
  if (mode === 'live') return genre.scene;
  return { pause: next.pause, voiceWindow: next.voiceWindow, length: next.length };
}

export const sceneFor = (genre: Genre): Scene => sceneOf(genre, sceneMode);

/** 그 장르의 영상 폴더(public/clips 아래) — 임시 5초 영상이면 'legacy5s/'(장면의 assets) */
const assetsOf = (genreId: string) => GENRES.find((genre) => genre.id === genreId)?.scene.assets ?? '';

/**
 * 장르마다 10초 원판(1920×1080 H.264/AAC, 키프레임 1초 간격 + 5.0초). 녹음실 재생·5.0초 멈춤이 이 파일을 쓴다.
 * 임시 5초 영상이면 legacy5s/ 아래 같은 이름들이다(5.000초, 소리 없음 — tools/build-scene.mjs --legacy).
 */
export const clipUrl = (genreId: string) => clip(`${genreId}.mp4`, genreId);
/**
 * 합성용 원판 — 위 원판에 로고 띠(왼쪽 위 InKY Film Festival, 오른쪽 위 인천광역시교육청)를 구운 것이다(10/20 대표님).
 * 합성은 영상을 다시 인코딩하지 않으므로 로고는 여기 미리 구워 둔다. 녹음실은 로고 없는 원판을 튼다 — PC 녹음실은 영상
 * 위아래를 잘라 꽉 채워 위 모서리 로고가 잘린다(tools/build-scene.mjs).
 */
export const finalClipUrl = (genreId: string) => clip(`final/${genreId}.mp4`, genreId);
// 선택 화면만 가벼운 사본을 쓴다 — 0~5.0초(최고조까지)를 소리 없이 되풀이한다. 해소는 아낀다. 임시 5초 영상은 5초 전체다.
export const previewUrl = (genreId: string) => clip(`previews/${genreId}.mp4`, genreId);
export const thumbUrl = (genreId: string) => clip(`thumbs/${genreId}.jpg`, genreId);
// 5.0초 멈춤 화면(`K050`). 녹음실 포스터와 메인의 넓은 영상 벽에 쓴다. 임시 5초 영상은 첫 화면(녹음이 시작되는 그림)이다.
export const stillUrl = (genreId: string) => clip(`stills/${genreId}.jpg`, genreId);
// 같은 그림의 AVIF(10/24 와이파이 최적화 ⑥, 약 24% 작다) — 화면은 <picture>로 이것을 먼저 쓰고, 못 읽는 기기는 위 JPEG을 쓴다.
// 녹음실 포스터(<video poster>)는 대신 쓸 길이 없어 JPEG 그대로다. 짝은 tools/build-avif.mjs가 만들고 test/scene-images.test.js가 본다.
export const thumbAvifUrl = (genreId: string) => clip(`thumbs/${genreId}.avif`, genreId);
export const stillAvifUrl = (genreId: string) => clip(`stills/${genreId}.avif`, genreId);

// 주소 뒤에 내용 해시를 붙인다 — 그림·영상을 바꾸면 주소가 바뀌어 브라우저·서비스워커 캐시가 옛 파일을 내지 않는다
// (10/20 미리보기에서 바꾼 장면이 옛 장면과 섞여 보였다. 까닭은 `tools/clip-versions.js`).
function clip(file: string, genreId: string) {
  const path = `${assetsOf(genreId)}${file}`;
  return `/clips/${path}?v=${clipVersions[path]}`;
}
