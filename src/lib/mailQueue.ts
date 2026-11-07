// 메일 대기열의 규칙(화면 · 저장과 떼어 검사한다) — 언제 다시 보내고, 무엇을 한 통으로 묶고, 메일에 무엇을 적는가.
export interface MailItem {
  id: string;
  name: string;
  email: string;
  genreId: string;
  genreName: string;
  createdAt: number;
  url?: string;
  attempts: number;
  nextAt: number;
  failed: boolean;
}

const FIRST_RETRY_MS = 30_000;
const LONGEST_RETRY_MS = 300_000;
export const MAX_ATTEMPTS = 8;

/** n번째 실패 뒤 기다리는 시간: 30초에서 두 배씩 5분까지. */
export function retryDelay(attempts: number): number {
  return Math.min(FIRST_RETRY_MS * 2 ** (attempts - 1), LONGEST_RETRY_MS);
}

export function afterFailure(item: Pick<MailItem, 'attempts'>, now: number): Pick<MailItem, 'attempts' | 'nextAt' | 'failed'> {
  const attempts = item.attempts + 1;
  return { attempts, nextAt: now + retryDelay(attempts), failed: attempts >= MAX_ATTEMPTS };
}

/** 지금 보낼 차례인 건을 교사별로 묶는다 — 한 교사에게는 한 통만 간다. */
export function dueGroups(items: MailItem[], now: number): MailItem[][] {
  const groups = new Map<string, MailItem[]>();
  for (const item of items) {
    if (item.failed || item.nextAt > now) continue;
    const key = item.email.trim().toLowerCase();
    groups.set(key, [...(groups.get(key) ?? []), item]);
  }
  return [...groups.values()];
}

export interface MailMessage {
  to: string;
  subject: string;
  body: string;
}

/** 제목에는 아동 이름을 넣지 않는다. 링크는 QR과 같은 주소이고 2026-12-01 00:00에 서버가 지운다. */
export function buildMail(group: MailItem[]): MailMessage {
  const lines = group.map((item) => `· ${item.name} — ${item.genreName}\n  ${item.url}`);
  return {
    to: group[0].email.trim(),
    subject: '[제4회 인천어린이청소년영화제] Voice Cinema 완성 영화 안내',
    body: [
      '선생님, 안녕하세요.',
      '제4회 인천어린이청소년영화제 Voice Cinema 부스에서 학생들이 만든 영화를 보내 드립니다.',
      '',
      ...lines,
      '',
      '아래 내용을 확인해 주세요.',
      '· 링크는 2026년 11월 30일까지 열리고, 그 뒤에는 자동으로 지워집니다.',
      '· 링크를 아는 사람은 누구나 볼 수 있으니 해당 학생에게만 전해 주세요.',
      '· 이 메일은 보내기 전용입니다.',
    ].join('\n'),
  };
}
