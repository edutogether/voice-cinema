// 장르 8종(장면 더빙 2.0, 대표님 10/11 확정). 이름·색·장면 이름·상대 대사를 항목 하나에 모아둔다.
//
// 색은 판타지·애니메이션·드라마는 1.0 색 그대로, 히어로·스릴러·스포츠는 빠진 장르(액션·호러·시트콤)의
// 색을 물려받고, SF·뮤지컬만 새 색이다(1안 — app-plan §2-5, 10/11 확정). 색이 빛나던 자리는 터치 기기의
// 격자 카드뿐이었는데 10/17 휴대폰도 캐러셀로 바꾸며 그 격자가 없어져, 지금은 화면 어디에도 쓰이지 않는다
// (10/17 06:40 대표님: 휴대폰도 캐러셀 확정, 장르 색 질문은 끝 — 확정값이라 지우지 않고 둔다). 원작 제목은 앱 화면 어디에도 쓰지 않는다.

import clipVersions, { lengths } from 'virtual:clip-versions';
import { VOICE_WINDOW_SECONDS } from './config';

/** 상대 대사 한 줄과 그 자막이 나와 있는 시각(초). */
export interface Line { text: string; start: number; end: number }

export interface Genre {
  id: string;
  name: string;
  color: string;
  /** 우리 장면 이름 — 카드와 녹음실 제목에 쓴다. */
  summary: string;
  /** 상대 대사 — 앱이 영상 위에 띄우는 넷플릭스식 자막. 영상·완성본에는 굽지 않는다. 시각 순서이고 서로 겹치지 않는다(드라마는 두 줄 — 11/14). */
  lines: Line[];
  /** 아이 대사 구간(초) — 미리보기에서 «당신의 목소리가 들어갈 자리예요 !»가 나오는 자리. 멈춤 시각에서 계산한다(`turn()` — 멈춤 ~ +3.5초). */
  turn: { start: number; end: number };
  /** 원판 길이(초) — 원판 파일에서 읽은 길이(21.0~30.1초). test/scene-clips.test.js가 mp4와 맞대 본다. */
  seconds: number;
  /** 카드 · 녹음실 · 완성 그림의 길이 글 — 완성본은 편마다 21~30초여도 «20초» 하나(11/14 Bumm님 결정, 팀장 전달). */
  label: string;
  /** 녹음실이 멈추는 시각(초) — 목소리가 여기서부터 목소리 칸(3.5초)에 들어간다. 원판은 이 칸의 소리를 −8dB 낮춰 두었다(tools/build-scene.mjs). */
  pause: number;
}

// 11/14 완성본(Bumm님 «폭주기관차 올려» 뒤 여덟 편 모두): 편마다 길이(21.0~30.1초)와 멈춤 시각이 다르다.
// 길이는 숫자로 박지 않고 원판 파일(public/clips/<장르>.mp4)에서 읽는다(tools/clip-versions.js).
// 상대 대사는 편마다 say('대사', 시작, 끝)으로 적는다. 여덟 편의 글 · 시각은 원판 소리에서 다시 쟀다 — 말소리 대역(300~3400Hz) 0.1초 크기 +
// 구간 받아쓰기, 자막은 목소리가 나기 0.1초 전에 뜬다(11/14 Bumm님 «웹앱도 설치판도 대사 타이밍과 글자를 제대로 나오게 맞춰야지 소리랑 다르면 안되지»).
const say = (text: string, start: number, end: number): Line => ({ text, start, end });
// 멈춤은 보통 12.0초, 편마다 다르면 film([...], 13.9)처럼 넘긴다(판타지 v8.5는 13.9초 = 30fps 417번째 프레임 — 11/14 팀장 전달).
const film = (lines: Line[], pause = 12) => ({ lines, pause, label: '20초' });
// 대사 구간은 목소리 칸 그대로다(멈춤 ~ +3.5초, 합성이 쓰는 값과 같다).
const turn = (pause: number) => ({ start: pause, end: pause + VOICE_WINDOW_SECONDS });
const scene = (g: Omit<Genre, 'turn' | 'seconds'>): Genre =>
  ({ ...g, seconds: lengths[`${g.id}.mp4`], turn: turn(g.pause) });

export const GENRES: Genre[] = [
  scene({ id: 'sf', name: 'SF', color: '#3fa7c9', summary: '퍼스트 헬로', ...film([say('이것 봐, 외계인이야 !', 7.5, 8.8)]) }),
  scene({ id: 'fantasy', name: '판타지', color: '#8a63d2', summary: '빛의 결투', ...film([say('감히 나와 겨루겠다고 ?', 5.0, 6.7), say('후회하게 해 주마 !', 7.3, 8.3)], 13.9) }),
  scene({ id: 'animation', name: '애니메이션', color: '#d97b3f', summary: '날아라 미르', ...film([say('준비됐어 ?', 5.9, 6.7), say('하나, 둘…', 7.0, 8.3)]) }),
  scene({ id: 'hero', name: '히어로', color: '#c94f5c', summary: '폭주기관차', ...film([say('네가 멈춰, 지금 !', 4.8, 6.4)]) }),
  scene({ id: 'thriller', name: '스릴러', color: '#2f9e6e', summary: '우리 같이 놀자', ...film([say('여기야~', 2.1, 3.0), say('여기 있어~', 5.0, 5.9), say('우리랑… 같이 놀자.', 9.4, 11.8)]) }),
  scene({ id: 'drama', name: '드라마', color: '#c9a24b', summary: '안녕, 설이', ...film([say('이제 출발해야지~', 0.1, 1.7), say('설이한테 꼭 다시 온다고 인사해 !', 8.9, 11.9)]) }),
  scene({ id: 'sports', name: '스포츠', color: '#3f7fb8', summary: '버저비터', ...film([say('3초 남았어 !', 8.4, 9.4), say('너만 믿을게 !', 9.5, 10.4)], 15) }),
  scene({ id: 'musical', name: '뮤지컬', color: '#c4559e', summary: '선셋 하이웨이', ...film([say('우리 같이 춤추자 !', 8.2, 9.5)]) }),
];

/** 장르 id로 장면 자료를 찾는다 — 녹음실(useDubbing)과 합성(mergeClip)이 멈춤 시각을 여기서 읽는다. */
export const genreById = (id: string): Genre => {
  const g = GENRES.find((x) => x.id === id);
  if (!g) throw new Error(`없는 장르: ${id}`);
  return g;
};
/** 녹음실 · 완성 화면의 길이 글(«10초» · «20초») — 실제 길이를 반올림하지 않는다(완성본은 «20초» 하나, 11/14 Bumm님 결정). */
export const lengthLabel = (g: Genre) => g.label;

/**
 * 장르마다 원판(1920×1080 H.264/AAC, 키프레임 1초 간격 + 멈춤 시각, 길이는 seconds). 녹음실 재생·멈춤이 이 파일을 쓴다.
 */
export const clipUrl = (genreId: string) => clip(`${genreId}.mp4`);
/**
 * 합성용 원판 — 위 원판에 로고 띠(왼쪽 위 InKY Film Festival, 오른쪽 위 인천광역시교육청)를 구운 것이다(10/20 대표님).
 * 합성은 영상을 다시 인코딩하지 않으므로 로고는 여기 미리 구워 둔다. 녹음실은 로고 없는 원판을 튼다 — PC 녹음실은 영상
 * 위아래를 잘라 꽉 채워 위 모서리 로고가 잘린다(tools/build-scene.mjs).
 */
export const finalClipUrl = (genreId: string) => clip(`final/${genreId}.mp4`);
// 선택 화면만 가벼운 사본을 쓴다 — 0초 ~ 멈춤 시각(최고조까지)을 소리 없이 되풀이한다. 해소는 아낀다.
export const previewUrl = (genreId: string) => clip(`previews/${genreId}.mp4`);
export const thumbUrl = (genreId: string) => clip(`thumbs/${genreId}.jpg`);
// 미리보기 영상의 첫 프레임 — 가운데 카드의 영상 포스터다. 카드 그림(멈춤 장면)에서 0초 영상으로 튀지 않게, 가운데로 오는 순간 이 그림을 보이고 그 위에서 영상이 0초부터 이어진다(11/14 Bumm님 «장면 넘어갈 때마다 그림이 잠깐 뜨다 처음부터»).
export const firstUrl = (genreId: string) => clip(`firsts/${genreId}.jpg`);
// 멈춤 화면(10초 장면은 5.0초 `K050`, 완성본은 12.0초). 녹음실 포스터와 메인의 넓은 영상 벽에 쓴다.
export const stillUrl = (genreId: string) => clip(`stills/${genreId}.jpg`);
// 같은 그림의 AVIF(10/24 와이파이 최적화 ⑥, 약 24% 작다) — 화면은 <picture>로 이것을 먼저 쓰고, 못 읽는 기기는 위 JPEG을 쓴다.
// 녹음실 포스터(<video poster>)는 대신 쓸 길이 없어 JPEG 그대로다. 짝은 tools/build-avif.mjs가 만들고 test/scene-images.test.js가 본다.
export const thumbAvifUrl = (genreId: string) => clip(`thumbs/${genreId}.avif`);
export const stillAvifUrl = (genreId: string) => clip(`stills/${genreId}.avif`);

// 주소 뒤에 내용 해시를 붙인다 — 그림·영상을 바꾸면 주소가 바뀌어 브라우저·서비스워커 캐시가 옛 파일을 내지 않는다
// (10/20 미리보기에서 바꾼 장면이 옛 장면과 섞여 보였다. 까닭은 `tools/clip-versions.js`).
function clip(file: string) {
  return `/clips/${file}?v=${clipVersions[file]}`;
}
