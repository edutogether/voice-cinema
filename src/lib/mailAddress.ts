// 메일 입력 칸의 판정 — 화면과 떼어 검사한다. 기준: GOV.UK 메일 주소 패턴(두 번 입력 없음 · 도메인 오타는 경고만 · 최대 254자).
export const MAIL_MAX = 254;
export const NAME_MAX = 40;

export type MailProblem = 'empty' | 'notLatin' | 'format';

export function checkMail(value: string): MailProblem | null {
  const mail = value.trim();
  if (!mail) return 'empty';
  // 한/영 키가 한글에 놓인 채 적는 일이 가장 흔하다 — 고치는 방법을 따로 알린다
  if (/[ㄱ-ㅎㅏ-ㅣ가-힣]/.test(mail)) return 'notLatin';
  if (mail.length > MAIL_MAX || !/^[^\s@]+@[^\s@.]+(\.[^\s@.]+)+$/.test(mail)) return 'format';
  return null;
}

const DOMAIN_TYPOS: Record<string, string> = {
  'gmial.com': 'gmail.com',
  'gamil.com': 'gmail.com',
  'gmai.com': 'gmail.com',
  'gmail.co': 'gmail.com',
  'gmail.con': 'gmail.com',
  'nave.com': 'naver.com',
  'navr.com': 'naver.com',
  'naver.co': 'naver.com',
  'naver.con': 'naver.com',
  'hanmai.net': 'hanmail.net',
  'hanmail.ne': 'hanmail.net',
  'hanmail.com': 'hanmail.net',
  'daum.ne': 'daum.net',
  'daum.com': 'daum.net',
};

/** 흔한 도메인 오타면 고친 도메인을 돌려준다. 막지는 않는다 — 진짜 주소일 수 있다. */
export function suggestDomain(value: string): string | null {
  const domain = value.trim().split('@')[1]?.toLowerCase();
  return (domain && DOMAIN_TYPOS[domain]) || null;
}

export function withDomain(value: string, domain: string): string {
  return `${value.trim().split('@')[0]}@${domain}`;
}

/** 다음 사람이 볼 수 있는 자리(대기 목록)에는 주소를 가려서 보인다: teacher@ice.go.kr → t***@ice.go.kr */
export function maskMail(value: string): string {
  const [local, domain] = value.split('@');
  return `${local.slice(0, 1)}***@${domain}`;
}
