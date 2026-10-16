// 장르 8종(장면 더빙 2.0, 대표님 10/11 확정). 이름·색·장면 이름·상대 대사를 항목 하나에 모아둔다.
//
// 색은 홈 카드를 누를 때(터치 기기)·한 장씩 돌 때 빛나는 색이다. 판타지·애니메이션·드라마는
// 1.0 색 그대로, 히어로·스릴러·스포츠는 빠진 장르(액션·호러·시트콤)의 색을 물려받고,
// SF·뮤지컬만 새 색이다(1안 — app-plan §2-5). 원작 제목은 앱 화면 어디에도 쓰지 않는다.

export interface Genre {
  id: string;
  name: string;
  color: string;
  /** 우리 장면 이름 — 카드와 녹음실 제목에 쓴다. */
  summary: string;
  /** 상대 대사 — 앱이 영상 위에 띄우는 넷플릭스식 자막. 영상·완성본에는 굽지 않는다. */
  line: { text: string; start: number; end: number };
}

/**
 * 장르 색을 반투명 rgba 문자열로 바꾼다.
 *
 * CSS에서 `color-mix(in srgb, var(--c) 55%, transparent)`로 쓰던 것을 대신한다.
 * color-mix는 비교적 최신 기능이라 인앱 브라우저(카카오톡 등)의 오래된 WebView가
 * 모르면 **그 선언 전체가 무시된다** — box-shadow 한 줄에 테두리·번짐이 같이
 * 들어 있어서, 누를 때 강조가 통째로 사라진다(2026-09-09 대표 지적:
 * "클릭할 때 효과 퀄리티가 굉장히 떨어짐"). rgba는 어디서나 통한다.
 */
export function withAlpha(hex: string, alpha: number): string {
  const n = parseInt(hex.slice(1), 16);
  return `rgba(${(n >> 16) & 255}, ${(n >> 8) & 255}, ${n & 255}, ${alpha})`;
}

// 상대 대사는 모든 장르가 1.6초에 시작해 3.4초 전에 끝난다(스토리보드 §0).
const line = (text: string) => ({ text, start: 1.6, end: 3.4 });

export const GENRES: Genre[] = [
  { id: 'sf', name: 'SF', color: '#3fa7c9', summary: '물의 행성', line: line('저 산… 움직여 !') },
  { id: 'fantasy', name: '판타지', color: '#8a63d2', summary: '빛의 결투', line: line('나와 겨루겠다고 ?') },
  { id: 'animation', name: '애니메이션', color: '#d97b3f', summary: '멋지게 떨어지기', line: line('장난감은 못 날아 !') },
  { id: 'hero', name: '히어로', color: '#c94f5c', summary: '왼쪽을 봐', line: line('왼쪽을 봐. 우리가 왔어 !') },
  { id: 'thriller', name: '스릴러', color: '#2f9e6e', summary: '주방의 발톱', line: line('쉿… 움직이지 마 !') },
  { id: 'drama', name: '드라마', color: '#c9a24b', summary: '기억의 한마디', line: line('이제… 아무도 몰라보셔.') },
  { id: 'sports', name: '스포츠', color: '#3f7fb8', summary: '마지막 슛', line: line('너한테 맡긴다 !') },
  { id: 'musical', name: '뮤지컬', color: '#c4559e', summary: '라면 습격', line: line('이제 내 무대야 !') },
];

/**
 * 장르마다 10초 원판 한 파일(1920×1080 H.264/AAC, 키프레임 1초 간격 + 5.0초).
 * 녹음실 재생·5.0초 멈춤·최종 합성이 모두 이 한 파일을 쓴다 — 1.0의 녹음실용 사본(`studio/`)은 없앴다.
 */
export const clipUrl = (genreId: string) => `/clips/${genreId}.mp4`;
// 선택 화면만 가벼운 사본을 쓴다 — 0~5.0초(최고조까지)를 소리 없이 되풀이한다. 해소는 아낀다.
export const previewUrl = (genreId: string) => `/clips/previews/${genreId}.mp4`;
export const thumbUrl = (genreId: string) => `/clips/thumbs/${genreId}.jpg`;
// 5.0초 멈춤 화면(`K050`). 녹음실 포스터와 메인의 넓은 영상 벽에 쓴다.
export const stillUrl = (genreId: string) => `/clips/stills/${genreId}.jpg`;
