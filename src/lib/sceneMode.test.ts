import { describe, expect, it } from 'vitest';
import { isNextScenes } from './sceneMode';

// 새 시간표가 켜지는 문 — 라이브 주소에서는 어떤 쿼리로도 열리지 않아야 한다(10/25 팀장 «라이브와 분리되어 있다는 증거»)
const NEXT = ['?scenes=next', '?x=1&scenes=next', '?scenes=next&scenes=live'];
const NOT_NEXT = ['', '?scenes=NEXT', '?scenes=next1', '?Scenes=next', '?scenes=live&scenes=next', '#scenes=next', '?scenes=%20next'];

describe('새 장면 시간표가 켜지는 주소', () => {
  it('개발 주소와 이 앱의 미리보기 채널에서 ?scenes=next일 때만 켠다', () => {
    for (const hostname of ['localhost', '127.0.0.1', '[::1]', 'voice-cinema--vc2-ux-ab12cd34.web.app', 'voice-cinema--vc2-pob2jj8b.web.app']) {
      for (const search of NEXT) expect(isNextScenes({ hostname, search }), `${hostname}${search}`).toBe(true);
      for (const search of NOT_NEXT) expect(isNextScenes({ hostname, search }), `${hostname}${search}`).toBe(false);
    }
  });
  it('정식 주소 · 옛 주소 · Portal과 비슷하게 꾸민 주소에서는 무엇을 붙여도 지금 시간표다', () => {
    const hosts = [
      'voice.edutogether.kr', 'voice-cinema.web.app', 'voice-cinema.firebaseapp.com', 'edutogether.kr', 'www.edutogether.kr',
      // 다른 사이트의 채널 · 접미사 위조 · 점 대신 다른 글자 · 대문자 · 앞에 붙임
      'other--vc2-ux-ab12cd34.web.app', 'voice-cinema--vc2.web.app.attacker.com', 'voice-cinema--vc2xweb.app', 'voice-cinema--vc2.webXapp',
      'x.voice-cinema--vc2.web.app', 'voice-cinema--.web.app', 'voice-cinema--vc2.firebaseapp.com', 'localhost.attacker.com', '192.168.0.10',
    ];
    for (const hostname of hosts) {
      for (const search of [...NEXT, ...NOT_NEXT]) expect(isNextScenes({ hostname, search }), `${hostname}${search}`).toBe(false);
    }
  });
});
