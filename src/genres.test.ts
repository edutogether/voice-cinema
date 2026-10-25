import { describe, expect, it } from 'vitest';
import { GENRES, NEXT_SCENES, sceneOf } from './genres';

// 자유 발화 안내는 새 영상이 들어와 켠 장르에만 붙는다(10/26 대표님 «아직 기존 영상이 사용되는 경우에는 … 신규 대사를 강제 표시하지 않는다»)
describe('장르의 장면 — 새 안내는 새 영상이 들어온 장르에만', () => {
  it('지금 원판 장르: 기본 주소는 5초 장면 그대로, ?scenes=next는 7초 시간표만 빌리고 안내는 없다', () => {
    for (const genre of GENRES) {
      expect(sceneOf(genre, 'live')).toBe(genre.scene);
      expect(sceneOf(genre, 'live').guide).toBeUndefined();
      const next = sceneOf(genre, 'next');
      expect(next).toEqual({ pause: 7, voiceWindow: 3 });
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
