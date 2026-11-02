import { describe, expect, it } from 'vitest';
import { GENRES, LEGACY_SECONDS, NEXT_SCENES, genresFor, sceneOf } from './genres';

// 자유 발화 안내는 새 영상이 들어와 켠 장르에만 붙는다(10/26 대표님 «아직 기존 영상이 사용되는 경우에는 … 신규 대사를 강제 표시하지 않는다»)
describe('장르의 장면 — 새 안내는 새 영상이 들어온 장르에만', () => {
  it('지금 원판 장르: 기본 주소는 5초 장면 그대로, ?scenes=next는 7초 시간표만 빌리고 안내는 없다', () => {
    for (const genre of GENRES) {
      expect(sceneOf(genre, 'live')).toBe(genre.scene);
      expect(sceneOf(genre, 'live').guide).toBeUndefined();
      const next = sceneOf(genre, 'next');
      expect(next).toEqual({ pause: 7, voiceWindow: 3, length: 10 });
      expect(next.guide).toBeUndefined();
    }
  });
  it('새 영상이 들어와 scene을 NEXT_SCENES로 바꾼 장르는 어느 모드에서든 7초 시간표 + 안내가 저절로 붙는다', () => {
    for (const genre of GENRES) {
      const switched = { id: genre.id, scene: NEXT_SCENES[genre.id] };
      for (const mode of ['live', 'next', 'final'] as const) {
        const scene = sceneOf(switched, mode);
        expect(scene.pause, `${genre.id} ${mode}`).toBe(7);
        expect(scene.guide, `${genre.id} ${mode}`).toEqual(NEXT_SCENES[genre.id].guide);
        expect(scene.guide?.situation).toBeTruthy();
        expect(scene.guide?.example).toBeTruthy();
      }
    }
  });
  it('?scenes=final(개발 주소에서 시험용 합성 영상으로 위계를 볼 때)은 모든 장르를 새 영상으로 본다', () => {
    for (const genre of GENRES) expect(sceneOf(genre, 'final')).toBe(NEXT_SCENES[genre.id]);
  });
});

// 임시 5초 영상(LEGACY_5S, 11/2 대표님) — 영상만 바꾸고 장르 · 색 · 순서는 그대로, 새 영상이 오면 설정 한 줄(TEMP_VIDEOS)로 되돌린다
describe('임시 5초 영상 — 장르마다 멘트 · 5초 · 영상 위 녹음', () => {
  const slides = genresFor('slides');
  const legacy = genresFor('legacy5s');
  it('장르 이름 · 색 · 순서는 지금 원판과 같다(8장르)', () => {
    expect(legacy.map(({ id, name, color }) => ({ id, name, color }))).toEqual(slides.map(({ id, name, color }) => ({ id, name, color })));
    expect(legacy).toHaveLength(8);
  });
  it('모든 장르가 5초 · 멈춤 없음(0초에 목소리) · 멘트 · legacy5s 폴더이고, 모드와 상관없이 그 장면이다', () => {
    for (const genre of legacy) {
      expect(genre.scene).toMatchObject({ pause: 0, voiceWindow: LEGACY_SECONDS, length: LEGACY_SECONDS, assets: 'legacy5s/' });
      expect(genre.scene.line, genre.id).toMatch(/[가-힣]/);
      expect(genre.scene.line, genre.id).not.toMatch(/[^ ][!?]/);   // 느낌표 · 물음표 앞 한 칸(전 앱 규칙)
      expect(genre.scene.guide).toBeUndefined();
      expect(genre.scene.partnerLine).toBeUndefined();
      for (const mode of ['live', 'next', 'final'] as const) expect(sceneOf(genre, mode), `${genre.id} ${mode}`).toBe(genre.scene);
    }
  });
  it('Kling 원본과 짝이 있는 다섯 장르는 1.0 판의 그 영상 제목이고, 짝 없는 SF · 스포츠 · 뮤지컬은 지금 제목 그대로다', () => {
    const title = Object.fromEntries(legacy.map((g) => [g.id, g.summary]));
    expect(title).toMatchObject({
      fantasy: '주문 한마디로 펼치는 마법', animation: '상상 속 친구와 나누는 이야기', hero: '위기의 순간을 뒤집는 한마디',
      thriller: '어둠 속에서 마주친 낯선 소리', drama: '마음 깊이 전하고 싶은 진심',
    });
    for (const id of ['sf', 'sports', 'musical']) expect(title[id]).toBe(slides.find((g) => g.id === id)?.summary);
  });
  it('지금 원판 장르의 시간표 · 새 장면(FINAL_7S)은 그대로 남아 있다', () => {
    for (const genre of slides) {
      expect(genre.scene).toMatchObject({ pause: 5, voiceWindow: 3.5, length: 10 });
      expect(NEXT_SCENES[genre.id]).toMatchObject({ pause: 7, voiceWindow: 3, length: 10 });
    }
  });
});
