import { describe, expect, it } from 'vitest';
import { checkMail, maskMail, suggestDomain, withDomain } from './mailAddress';

describe('checkMail', () => {
  it.each(['teacher@ice.go.kr', 'a.b+c@school.es.kr', ' teacher@naver.com '])('%s는 통과한다', (mail) => {
    expect(checkMail(mail)).toBeNull();
  });
  it('비었으면 empty', () => {
    expect(checkMail('   ')).toBe('empty');
  });
  it.each(['ㅅㄷㅁ촏ㄱ@ㅜㅁㅍㄷㄱ.채ㅡ', '선생님@ice.go.kr'])('%s는 한/영 키 안내', (mail) => {
    expect(checkMail(mail)).toBe('notLatin');
  });
  it.each(['teacher', 'teacher@', '@ice.go.kr', 'teacher@ice', 'a b@ice.go.kr', 'a@@ice.go.kr', 'teacher@ice..kr', `${'a'.repeat(250)}@ice.go.kr`, 'josé@school.kr', 'a"b@school.kr', 'X <a@school.kr>', 'a@school.kr,b@school.kr'])('%s는 형식 오류', (mail) => {
    expect(checkMail(mail)).toBe('format');
  });
});

describe('suggestDomain', () => {
  it('흔한 오타는 고친 도메인을 돌려준다', () => {
    expect(suggestDomain('t@gmial.com')).toBe('gmail.com');
    expect(suggestDomain('t@NAVER.CO')).toBe('naver.com');
  });
  it('맞는 도메인과 모르는 도메인은 건드리지 않는다', () => {
    expect(suggestDomain('t@gmail.com')).toBeNull();
    expect(suggestDomain('t@ice.go.kr')).toBeNull();
    expect(suggestDomain('t')).toBeNull();
  });
  it('앞부분은 그대로 두고 도메인만 바꾼다', () => {
    expect(withDomain(' t.kim@gmial.com', 'gmail.com')).toBe('t.kim@gmail.com');
  });
});

describe('maskMail', () => {
  it('첫 글자와 도메인만 보인다', () => {
    expect(maskMail('teacher@ice.go.kr')).toBe('t***@ice.go.kr');
  });
});
