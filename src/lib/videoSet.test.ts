import { describe, expect, it } from 'vitest';
import { videoSetOf } from './videoSet';

// 임시 5초 영상(LEGACY_5S)은 미리보기 채널에서 기본으로 켜지고, 정식 주소에서는 무엇을 붙여도 켜지지 않는다(11/2 — 라이브는 바꾸지 않는다)
describe('영상 자리 — 임시 5초 영상이 켜지는 주소', () => {
  const at = (hostname: string, search = '') => videoSetOf({ hostname, search });
  it('미리보기 채널은 기본으로 임시 영상, ?videos=slides면 지금 원판', () => {
    expect(at('voice-cinema--vc2-ux-ab12cd34.web.app')).toBe('legacy5s');
    expect(at('voice-cinema--vc2-ux-ab12cd34.web.app', '?videos=slides')).toBe('slides');
  });
  it('개발 주소는 ?videos=legacy5s일 때만 — 기존 E2E는 지금 원판 흐름을 그대로 본다', () => {
    for (const host of ['localhost', '127.0.0.1', '[::1]']) {
      expect(at(host)).toBe('slides');
      expect(at(host, '?videos=legacy5s')).toBe('legacy5s');
    }
  });
  it('정식 주소 · 옛 주소 · Portal · 다른 사이트의 채널은 언제나 지금 원판', () => {
    for (const host of ['voice.edutogether.kr', 'voice-cinema.web.app', 'voice-cinema.firebaseapp.com', 'edutogether.kr', 'poster-studio--x-1.web.app', 'voice-cinema--x.web.app.evil.com']) {
      expect(at(host)).toBe('slides');
      expect(at(host, '?videos=legacy5s')).toBe('slides');
    }
  });
  it('새 영상이 오면 TEMP_VIDEOS를 null로 — 모든 주소에서 꺼진다', () => {
    expect(videoSetOf({ hostname: 'voice-cinema--vc2-ux-ab12cd34.web.app', search: '' }, null)).toBe('slides');
    expect(videoSetOf({ hostname: 'localhost', search: '?videos=legacy5s' }, null)).toBe('slides');
  });
});
