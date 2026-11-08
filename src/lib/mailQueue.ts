// 메일 대기열의 규칙(화면 · 저장과 떼어 검사한다) — 언제 다시 보내고, 무엇을 한 통으로 묶는가. 메일에 무엇을 적는지는 서버(functions/mail.js)가 정한다.
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
