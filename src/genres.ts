// 장르 6종. 이름·색·부제·아이콘이 예전엔 4개의 별도 객체로 흩어져 있어
// 하나를 고칠 때 네 곳을 맞춰야 했다 — 항목 하나에 모아둔다.
//
// 아이콘은 Lucide(lucide-static@1.39.0, ISC)의 원본 SVG path를 인라인으로 벤더링했다.
// CSP가 script-src 'self'라 런타임에 CDN에서 아이콘 라이브러리를 불러올 수 없다.
//
// 색은 2026-09-03 대표 지시로 원색 대신 보석톤(자수정/구리/에메랄드/가넷/앤틱골드/사파이어).
// 부제는 같은 날 5차 지시로 한 문장 느낌으로 다시 썼다 — 느낌표 앞에는 항상 한 칸(전 앱 공통 규칙).

export interface Genre {
  id: string;
  name: string;
  color: string;
  sub: string;
  icon: string;
}

export const GENRES: Genre[] = [
  {
    id: 'fantasy',
    name: '판타지',
    color: '#8a63d2',
    sub: '마법 지팡이를 들고, 주문 한 줄로 세상을 뒤바꿔보세요 !',
    icon: '<path d="m21.64 3.64-1.28-1.28a1.21 1.21 0 0 0-1.72 0L2.36 18.64a1.21 1.21 0 0 0 0 1.72l1.28 1.28a1.2 1.2 0 0 0 1.72 0L21.64 5.36a1.2 1.2 0 0 0 0-1.72" /><path d="m14 7 3 3" /><path d="M5 6v4" /><path d="M19 14v4" /><path d="M10 2v2" /><path d="M7 8H3" /><path d="M21 16h-4" /><path d="M11 3H9" />',
  },
  {
    id: 'animation',
    name: '애니메이션',
    color: '#d97b3f',
    sub: '친구가 되어, 마음을 담은 목소리로 대화를 나눠보세요 !',
    icon: '<path d="M12 22a1 1 0 0 1 0-20 10 9 0 0 1 10 9 5 5 0 0 1-5 5h-2.25a1.75 1.75 0 0 0-1.4 2.8l.3.4a1.75 1.75 0 0 1-1.4 2.8z" /><circle cx="13.5" cy="6.5" r=".5" fill="currentColor" /><circle cx="17.5" cy="10.5" r=".5" fill="currentColor" /><circle cx="6.5" cy="12.5" r=".5" fill="currentColor" /><circle cx="8.5" cy="7.5" r=".5" fill="currentColor" />',
  },
  {
    id: 'horror',
    name: '호러',
    color: '#2f9e6e',
    sub: '어둠 속 발소리, 온몸이 서늘해지는 비명을 질러보세요 !',
    icon: '<path d="M15 10v1" /><path d="M7.528 20.472a1.6 1.6 0 0 1 2.277 0l1.057 1.056a1.6 1.6 0 0 0 2.276 0l1.057-1.056a1.6 1.6 0 0 1 2.277 0l1.114 1.114a1.4 1.4 0 0 0 2.414-1V10a8 8 0 0 0-16 0v10.586a1.4 1.4 0 0 0 2.414 1z" /><path d="M9 10v1" />',
  },
  {
    id: 'action',
    name: '액션',
    color: '#c94f5c',
    sub: '위기의 순간, 가장 멋진 한마디로 상황을 뒤집어보세요 !',
    icon: '<path d="M15.914 4a1.5 1.5 0 0 0-2.474-1.561l-9 9A1.5 1.5 0 0 0 5.5 14h4.002a.5.5 0 0 1 .471.666L8.086 20a1.5 1.5 0 0 0 2.475 1.56l9-9A1.5 1.5 0 0 0 18.5 10h-3.997a.5.5 0 0 1-.472-.667z" />',
  },
  {
    id: 'drama',
    name: '드라마',
    color: '#c9a24b',
    sub: '말하지 못했던 진심을, 떨리는 목소리에 담아보세요 !',
    icon: '<path d="M10 11h.01" /><path d="M14 6h.01" /><path d="M18 6h.01" /><path d="M6.5 13.1h.01" /><path d="M22 5c0 9-4 12-6 12s-6-3-6-12c0-2 2-3 6-3s6 1 6 3" /><path d="M17.4 9.9c-.8.8-2 .8-2.8 0" /><path d="M10.1 7.1C9 7.2 7.7 7.7 6 8.6c-3.5 2-4.7 3.9-3.7 5.6 4.5 7.8 9.5 8.4 11.2 7.4.9-.5 1.9-2.1 1.9-4.7" /><path d="M9.1 16.5c.3-1.1 1.4-1.7 2.4-1.4" />',
  },
  {
    id: 'sitcom',
    name: '시트콤',
    color: '#3f7fb8',
    sub: '빵 터지는 타이밍, 웃음 가득한 만담을 펼쳐보세요 !',
    icon: '<path d="M15 10V9" /><path d="M7.084 14.302a5.12 5.12 0 0 0 9.833 0 .24.24 0 0 0-.235-.302H7.32a.24.24 0 0 0-.235.302" /><path d="M9 10V9" /><circle cx="12" cy="12" r="10" />',
  },
];

export const clipUrl = (genreId: string) => `/clips/${genreId}.mp4`;
export const thumbUrl = (genreId: string) => `/clips/thumbs/${genreId}.jpg`;
