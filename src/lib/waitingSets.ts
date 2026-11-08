// 저장 대기 화면의 장면 12세트(그림 · 제목 · 영화 상식) — Poster Studio(src/studio/waitingSets.ts, 2806349)의 승인본을 그대로 옮겼다
// (11/9 Bumm님 «로딩 화면 포스터에서 갖다가 쓰라니까 로딩 영상 12종하고 문구랑 다 그대로 갖다쓰라니까», 팀장 전달). 문구 · 순서 · 줄바꿈을 고치지 않는다.
// 설명 줄의 줄바꿈 기호는 휴대폰에서만 줄을 바꾸는 자리다(Poster Studio 10/20 Bumm님) — PC는 띄어쓰기로 보인다(generation-wait.css).
// 그림은 그 편 대기 영상의 첫 프레임이다(public/waiting-v3, Poster Studio가 인코딩한 파일 그대로 — 정지 그림 → 영상이 튀지 않게).
export interface WaitSet {
  id: number;
  title: string;
  theme: string;
  fact: { title: string; body: string; source: string };
  image: string;
}

export const waitingSets: WaitSet[] = [
  {
    "id": 1,
    "title": "당신의 영화에 색을 입히고 있어요",
    "theme": "빛과 색",
    "fact": {
      "title": "같은 장면도, 빛에 따라 다른 이야기",
      "body": "애니메이션의 조명은 빛의 색과 밝기로 감정을 전해요.",
      "source": "https://www.disneyanimation.com/process/lighting/"
    },
    "image": "/waiting-v3/01.webp"
  },
  {
    "id": 2,
    "title": "AI가 당신의 영화를 그리고 있어요",
    "theme": "이야기의 첫 그림",
    "fact": {
      "title": "영화도 먼저 그림으로 리허설해요",
      "body": "‘스토리보드’는 장면을 만화처럼 그려\n이야기의 흐름을 살펴보는 그림이에요.",
      "source": "https://www.disneyanimation.com/process/story/"
    },
    "image": "/waiting-v3/02.webp"
  },
  {
    "id": 3,
    "title": "오늘의 주인공에게 어울리는 한 장 !",
    "theme": "주인공과 카메라",
    "fact": {
      "title": "애니메이션에도 카메라 감독이 있어요",
      "body": "컴퓨터 속 카메라로 인물의 자리와 화면 구도를 잡아요.",
      "source": "https://www.disneyanimation.com/process/layout/"
    },
    "image": "/waiting-v3/03.webp"
  },
  {
    "id": 4,
    "title": "스크린 밖의 당신을 포스터 안으로",
    "theme": "새로운 주인공",
    "fact": {
      "title": "토이 스토리는 처음부터 특별했어요",
      "body": "1995년, 세계 최초의 장편\n컴퓨터 애니메이션으로 탄생했어요.",
      "source": "https://www.oscars.org/collection-highlights/toy-story"
    },
    "image": "/waiting-v3/04.webp"
  },
  {
    "id": 5,
    "title": "화면 밖에서도 영화는 만들어져요",
    "theme": "소리를 만드는 손",
    "fact": {
      "title": "영화 속 발소리, 나중에 만들기도 해요",
      "body": "화면에 맞춰 걷고 녹음하는 소리 작업을\n‘폴리’라고 해요.",
      "source": "https://www.oscars.org/sites/oscars/files/complete_sound_and_music_activities_guide.pdf"
    },
    "image": "/waiting-v3/05.webp"
  },
  {
    "id": 6,
    "title": "평범한 사진에 영화 같은 상상을",
    "theme": "사진이 움직이는 순간",
    "fact": {
      "title": "찰흙 인형에게 생명을 주는 방법",
      "body": "조금씩 움직이며 찍은 사진을 이으면 ‘스톱모션’이 돼요.",
      "source": "https://www.oscars.org/sites/oscars/files/complete_animation_activities_guide.pdf"
    },
    "image": "/waiting-v3/06.webp"
  },
  {
    "id": 7,
    "title": "당신의 영화에 설렘을 더하고 있어요",
    "theme": "음악이 더하는 감정",
    "fact": {
      "title": "주인공은 가끔, 음악으로 먼저 와요",
      "body": "인물이나 상황을 떠올리게 하는 반복 선율을\n‘라이트모티프’라고 해요.",
      "source": "https://www.liverpoolphil.com/media/232761/leitmotif-work-sheet.pdf"
    },
    "image": "/waiting-v3/07.webp"
  },
  {
    "id": 8,
    "title": "당신의 이야기에 목소리를 더해요",
    "theme": "이야기에 목소리를",
    "fact": {
      "title": "목소리가 바뀌어도, 마법은 이어져요",
      "body": "‘렛 잇 고’ 공식 영상에는 25개 언어의\n엘사 목소리가 이어져요.",
      "source": "https://www.youtube.com/watch?v=f7kw-zurg_M"
    },
    "image": "/waiting-v3/08.webp"
  },
  {
    "id": 9,
    "title": "작은 순간까지 영화처럼 담아볼게요",
    "theme": "작은 순간까지",
    "fact": {
      "title": "공룡의 목소리를 찾아 나선 사람들",
      "body": "〈쥬라기 공원〉의 포효에는\n아기 코끼리의 울음도 숨어 있어요.",
      "source": "https://www.wskg.org/npr-culture/2013-04-13/jurassic-bark-how-sound-design-changed-our-imaginations"
    },
    "image": "/waiting-v3/09.webp"
  },
  {
    "id": 10,
    "title": "큰 장면은 작은 준비에서 시작돼요",
    "theme": "멋진 장면을 위한 준비",
    "fact": {
      "title": "그림에서 맛있는 냄새가 나기까지",
      "body": "〈라따뚜이〉 제작진은 직접 요리를 배우고\n조리 과정을 사진에 담았어요.",
      "source": "https://www.animationartconservation.com/ratatouille.html"
    },
    "image": "/waiting-v3/10.webp"
  },
  {
    "id": 11,
    "title": "작은 움직임에 생기를 더하고 있어요",
    "theme": "움직임에 생기를",
    "fact": {
      "title": "자연스러운 한 걸음에도 모델이 있어요",
      "body": "〈밤비〉 제작진은 진짜 아기 사슴을 관찰하며\n자연스러운 걸음을 그렸어요.",
      "source": "https://d23.com/the-lots-own-animal-kingdom/walt-disney-at-the-disney-studio/"
    },
    "image": "/waiting-v3/11.webp"
  },
  {
    "id": 12,
    "title": "우리의 상상이 한 장에 모이고 있어요",
    "theme": "상상이 모이는 한 장",
    "fact": {
      "title": "125명의 화가가 함께 만든 영화",
      "body": "〈러빙 빈센트〉는 화가 125명이 그린\n유화 약 6만 5천 장을 이은 영화예요.",
      "source": "https://lovingvincent.com/the-movie%2C3%2Cpl.html"
    },
    "image": "/waiting-v3/12.webp"
  }
];
