import { describe, expect, it } from 'vitest';
import { isLocalRecordingSample } from './sampleMode';

describe('로컬 녹음 화면 체험 범위', () => {
  it('루프백 주소의 디자인 시안에서만 켠다', () => {
    for (const hostname of ['localhost', '127.0.0.1', '[::1]']) {
      expect(isLocalRecordingSample({ hostname, search: '?preview=home-design' })).toBe(true);
      expect(isLocalRecordingSample({ hostname, search: '' })).toBe(false);
    }
  });
  it('라이브·외부 주소는 시안 쿼리가 있어도 실제 녹음이다', () => {
    for (const hostname of ['voice.edutogether.kr', 'voice-cinema.web.app', 'localhost.example.com', '192.168.1.10']) {
      expect(isLocalRecordingSample({ hostname, search: '?preview=home-design' })).toBe(false);
    }
  });
});
