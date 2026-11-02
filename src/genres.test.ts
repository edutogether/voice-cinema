import { describe, expect, it } from 'vitest';
import { GENRES, NEXT_SCENES, genresFor, sceneOf } from './genres';

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
describe('임시 영상 — Kling 짝이 있는 다섯 장르 · 장르마다 멘트 · 길이 · 영상 위 녹음', () => {
  const slides = genresFor('slides');
  const legacy = genresFor('legacy5s');
  it('Kling 짝이 있는 다섯만 보이고(SF · 스포츠 · 뮤지컬은 숨김, 11/2 대표님 L1), 이름 · 색 · 순서는 지금 원판과 같다', () => {
    expect(legacy.map((g) => g.id)).toEqual(['fantasy', 'animation', 'hero', 'thriller', 'drama']);
    const kept = slides.filter((g) => legacy.some((l) => l.id === g.id));
    expect(legacy.map(({ id, name, color }) => ({ id, name, color }))).toEqual(kept.map(({ id, name, color }) => ({ id, name, color })));
  });
  it('지금 원판(새 영상이 오면 TEMP_VIDEOS = null로 돌아가는 쪽)은 8장르 그대로다 — 숨긴 장르는 설정 한 줄로 돌아온다', () => {
    expect(slides.map((g) => g.id)).toEqual(['sf', 'fantasy', 'animation', 'hero', 'thriller', 'drama', 'sports', 'musical']);
  });
  it('길이는 장르마다 앞 5초 또는 10초 전체(11/2 대표님 L3) — 판타지 · 애니메이션 · 히어로 5초, 스릴러 · 드라마 10초', () => {
    expect(Object.fromEntries(legacy.map((g) => [g.id, g.scene.length]))).toEqual({ fantasy: 5, animation: 5, hero: 5, thriller: 10, drama: 10 });
  });
  it('모든 장르가 멈춤 없음(0초에 목소리) · 녹음 칸 = 영상 길이 · 멘트 · legacy5s 폴더이고, 모드와 상관없이 그 장면이다', () => {
    for (const genre of legacy) {
      expect(genre.scene).toMatchObject({ pause: 0, voiceWindow: genre.scene.length, assets: 'legacy5s/' });
      expect(genre.scene.line, genre.id).toMatch(/[가-힣]/);
      expect(genre.scene.line, genre.id).not.toMatch(/[^ ][!?]/);   // 느낌표 · 물음표 앞 한 칸(전 앱 규칙)
      expect(genre.scene.guide).toBeUndefined();
      expect(genre.scene.partnerLine).toBeUndefined();
      for (const mode of ['live', 'next', 'final'] as const) expect(sceneOf(genre, mode), `${genre.id} ${mode}`).toBe(genre.scene);
    }
  });
  it('다섯 장르는 1.0 판의 그 영상 제목이다', () => {
    const title = Object.fromEntries(legacy.map((g) => [g.id, g.summary]));
    expect(title).toEqual({
      fantasy: '주문 한마디로 펼치는 마법', animation: '상상 속 친구와 나누는 이야기', hero: '위기의 순간을 뒤집는 한마디',
      thriller: '어둠 속에서 마주친 낯선 소리', drama: '마음 깊이 전하고 싶은 진심',
    });
  });
  it('지금 원판 장르의 시간표 · 새 장면(FINAL_7S)은 그대로 남아 있다', () => {
    for (const genre of slides) {
      expect(genre.scene).toMatchObject({ pause: 5, voiceWindow: 3.5, length: 10 });
      expect(NEXT_SCENES[genre.id]).toMatchObject({ pause: 7, voiceWindow: 3, length: 10 });
    }
  });
});
