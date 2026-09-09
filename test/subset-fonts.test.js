// 폰트 서브셋이 글자를 빠뜨리지 않는지 지킨다.
//
// 왜 있는가: 처음에는 빌드 산출물만 훑어 글자를 모았는데, 번들러가 한글을
// 유니코드 이스케이프(역슬래시 u 다음 네 자리)로 내보내는 바람에 **140자가 빠졌다**(2026-09-09 실측,
// fontTools로 서브셋 cmap을 직접 읽어 확인). 그대로 배포됐으면 그 글자들이
// 화면에서 두부(□)로 나왔을 것이다.
import { test, expect, describe } from 'vitest';
import { unescapeUnicode } from '../tools/subset-fonts.js';

describe('unescapeUnicode — 번들러가 감춘 글자를 되살린다', () => {
  test('역슬래시 u 네 자리 형태를 실제 글자로 되돌린다', () => {
    expect(unescapeUnicode('\uac00\ub098')).toBe('가나');
  });

  test('중괄호 형태도 되돌린다', () => {
    expect(unescapeUnicode('\u{ac00}')).toBe('가');
  });

  test('이미 실제 글자인 것은 그대로 둔다', () => {
    expect(unescapeUnicode('판타지')).toBe('판타지');
  });

  test('이스케이프가 아닌 문자열은 건드리지 않는다', () => {
    expect(unescapeUnicode('url(#u123)')).toBe('url(#u123)');
  });
});
