// 장르 8종(장면 더빙 2.0, 대표님 10/11 확정). 이름·색·장면 이름·상대 대사를 항목 하나에 모아둔다.
//
// 색은 판타지·애니메이션·드라마는 1.0 색 그대로, 히어로·스릴러·스포츠는 빠진 장르(액션·호러·시트콤)의
// 색을 물려받고, SF·뮤지컬만 새 색이다(1안 — app-plan §2-5, 10/11 확정). 색이 빛나던 자리는 터치 기기의
// 격자 카드뿐이었는데 10/17 휴대폰도 캐러셀로 바꾸며 그 격자가 없어져, 지금은 화면 어디에도 쓰이지 않는다
// (10/17 06:40 대표님: 휴대폰도 캐러셀 확정, 장르 색 질문은 끝 — 확정값이라 지우지 않고 둔다). 원작 제목은 앱 화면 어디에도 쓰지 않는다.

import clipVersions from 'virtual:clip-versions';

export interface Genre {
  id: string;
  name: string;
  color: string;
  /** 우리 장면 이름 — 카드와 녹음실 제목에 쓴다. */
  summary: string;
  /** 상대 대사 — 앱이 영상 위에 띄우는 넷플릭스식 자막. 영상·완성본에는 굽지 않는다. */
  line: { text: string; start: number; end: number };
}

// 상대 대사는 모든 장르가 1.6초에 시작해 3.4초 전에 끝난다(스토리보드 §0).
const line = (text: string) => ({ text, start: 1.6, end: 3.4 });

export const GENRES: Genre[] = [
  { id: 'sf', name: 'SF', color: '#3fa7c9', summary: '물의 행성', line: line('저 산… 움직여 !') },
  { id: 'fantasy', name: '판타지', color: '#8a63d2', summary: '빛의 결투', line: line('나와 겨루겠다고 ?') },
  { id: 'animation', name: '애니메이션', color: '#d97b3f', summary: '멋지게 떨어지기', line: line('장난감은 못 날아 !') },
  { id: 'hero', name: '히어로', color: '#c94f5c', summary: '왼쪽을 봐', line: line('왼쪽을 봐. 우리가 왔어 !') },
  { id: 'thriller', name: '스릴러', color: '#2f9e6e', summary: '레이저 금고', line: line('레이저 바뀐다, 천천히 !') },
  { id: 'drama', name: '드라마', color: '#c9a24b', summary: '기억의 한마디', line: line('이제… 아무도 몰라보셔.') },
  { id: 'sports', name: '스포츠', color: '#3f7fb8', summary: '마지막 슛', line: line('너한테 맡긴다 !') },
  { id: 'musical', name: '뮤지컬', color: '#c4559e', summary: '서커스 첫 무대', line: line('쇼는 계속되어야 해 !') },
];

/**
 * 장르마다 10초 원판(1920×1080 H.264/AAC, 키프레임 1초 간격 + 5.0초). 녹음실 재생·5.0초 멈춤이 이 파일을 쓴다.
 */
export const clipUrl = (genreId: string) => clip(`${genreId}.mp4`);
/**
 * 합성용 원판 — 위 원판에 로고 띠(왼쪽 위 InKY Film Festival, 오른쪽 위 인천광역시교육청)를 구운 것이다(10/20 대표님).
 * 합성은 영상을 다시 인코딩하지 않으므로 로고는 여기 미리 구워 둔다. 녹음실은 로고 없는 원판을 튼다 — PC 녹음실은 영상
 * 위아래를 잘라 꽉 채워 위 모서리 로고가 잘린다(tools/build-scene.mjs).
 */
export const finalClipUrl = (genreId: string) => clip(`final/${genreId}.mp4`);
// 선택 화면만 가벼운 사본을 쓴다 — 0~5.0초(최고조까지)를 소리 없이 되풀이한다. 해소는 아낀다.
export const previewUrl = (genreId: string) => clip(`previews/${genreId}.mp4`);
export const thumbUrl = (genreId: string) => clip(`thumbs/${genreId}.jpg`);
// 5.0초 멈춤 화면(`K050`). 녹음실 포스터와 메인의 넓은 영상 벽에 쓴다.
export const stillUrl = (genreId: string) => clip(`stills/${genreId}.jpg`);

// 주소 뒤에 내용 해시를 붙인다 — 그림·영상을 바꾸면 주소가 바뀌어 브라우저·서비스워커 캐시가 옛 파일을 내지 않는다
// (10/20 미리보기에서 바꾼 장면이 옛 장면과 섞여 보였다. 까닭은 `tools/clip-versions.js`).
function clip(file: string) {
  return `/clips/${file}?v=${clipVersions[file]}`;
}
