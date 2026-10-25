import { describe, expect, it } from 'vitest';
import { sceneModeOf } from './sceneMode';

// 새 시간표가 켜지는 문 — 라이브 주소에서는 어떤 쿼리로도 열리지 않아야 한다(10/25 팀장 «라이브와 분리되어 있다는 증거»)
const NEXT = ['?scenes=next', '?x=1&scenes=next', '?scenes=next&scenes=live'];
const FINAL = ['?scenes=final', '?x=1&scenes=final'];
const NOT_NEXT = ['', '?scenes=NEXT', '?scenes=next1', '?Scenes=next', '?scenes=live&scenes=next', '#scenes=next', '?scenes=%20next', '?scenes=FINAL', '#scenes=final'];
const LOCAL = ['localhost', '127.0.0.1', '[::1]'];
const PREVIEW = ['voice-cinema--vc2-ux-ab12cd34.web.app', 'voice-cinema--vc2-pob2jj8b.web.app'];

describe('새 장면 시간표가 켜지는 주소', () => {
  it('개발 주소와 이 앱의 미리보기 채널에서 ?scenes=next일 때만 새 시간표(next)', () => {
    for (const hostname of [...LOCAL, ...PREVIEW]) {
      for (const search of NEXT) expect(sceneModeOf({ hostname, search }), `${hostname}${search}`).toBe('next');
      for (const search of NOT_NEXT) expect(sceneModeOf({ hostname, search }), `${hostname}${search}`).toBe('live');
    }
  });
  it('?scenes=final(새 영상이 들어온 것으로 봄 — 안내 위계 시험)은 개발 주소에서만 — 대표님이 여는 미리보기 채널에서는 지금 시간표', () => {
    for (const hostname of LOCAL) for (const search of FINAL) expect(sceneModeOf({ hostname, search }), `${hostname}${search}`).toBe('final');
    for (const hostname of PREVIEW) for (const search of FINAL) expect(sceneModeOf({ hostname, search }), `${hostname}${search}`).toBe('live');
  });
  it('정식 주소 · 옛 주소 · Portal과 비슷하게 꾸민 주소에서는 무엇을 붙여도 지금 시간표다', () => {
    const hosts = [
      'voice.edutogether.kr', 'voice-cinema.web.app', 'voice-cinema.firebaseapp.com', 'edutogether.kr', 'www.edutogether.kr',
      // 다른 사이트의 채널 · 접미사 위조 · 점 대신 다른 글자 · 대문자 · 앞에 붙임
      'other--vc2-ux-ab12cd34.web.app', 'voice-cinema--vc2.web.app.attacker.com', 'voice-cinema--vc2xweb.app', 'voice-cinema--vc2.webXapp',
      'x.voice-cinema--vc2.web.app', 'voice-cinema--.web.app', 'voice-cinema--vc2.firebaseapp.com', 'localhost.attacker.com', '192.168.0.10',
    ];
    for (const hostname of hosts) {
      for (const search of [...NEXT, ...FINAL, ...NOT_NEXT]) expect(sceneModeOf({ hostname, search }), `${hostname}${search}`).toBe('live');
    }
  });
});
