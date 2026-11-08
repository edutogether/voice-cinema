// 메일 대기열의 규칙(화면 · 저장과 떼어 검사한다) — 언제 다시 보내고, 무엇을 한 통으로 묶는가. 메일에 무엇을 적는지는 서버(functions/mail.js)가 정한다.
export interface MailItem {
  id: string;
  name: string;
  email: string;
  genreId: string;
  genreName: string;
  createdAt: number;
  url?: string;
  /** 실패한 횟수(다시 보내는 간격을 정한다) */
  attempts: number;
  /** 그중 서버가 4xx로 거절한 횟수 — 이것만 MAX_ATTEMPTS에서 «보내지 못함»이 된다(없으면 0) */
  rejections?: number;
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

/**
 * 실패 하나를 센다. 서버가 4xx로 거절한 것(rejected)만 MAX_ATTEMPTS번째에 «보내지 못함»으로 빼고,
 * 연결 실패 · 시간 초과 · 5xx는 창이 열려 있는 동안 5분마다 계속 다시 보낸다(11/8 팀장 결정 —
 * 와이파이는 살아 있고 바깥 회선만 끊기면 «인터넷이 돌아옴» 알림이 오지 않아, 횟수로 멈추면 회선이 돌아와도 보내지 않았다).
 */
export function afterFailure(item: Pick<MailItem, 'attempts' | 'rejections'>, now: number, rejected: boolean): Pick<MailItem, 'attempts' | 'rejections' | 'nextAt' | 'failed'> {
  const attempts = item.attempts + 1;
  const rejections = (item.rejections ?? 0) + (rejected ? 1 : 0);
  return { attempts, rejections, nextAt: now + retryDelay(attempts), failed: rejections >= MAX_ATTEMPTS };
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
