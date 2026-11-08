// 서버 예열(2026-11-09 Bumm님 «예열은 세 앱 다 지금부터 걸어 … 14일까지», 팀장 전달) — Poster Studio keepWarm과 같은 방식.
// 행사 주간 9~18시에 5분마다 가벼운 GET /을 불러 voiceCinema 인스턴스 하나를 깨어 있게 둔다. /upload · /mail · /feedback · /kakao가
// 모두 같은 voiceCinema 함수라 이 한 번으로 다 데워진다. 최소 인스턴스(minInstances)는 쓰지 않는다 — 그건 쉬는 동안에도 돈이 든다.
// 예약식(cron)에는 연도가 없어 내년 11월 9~14일에도 깨어난다 — 그래서 끝 시각이 지나면 아무것도 부르지 않는다.
export const KEEP_WARM_SCHEDULE = '*/5 9-18 9-14 11 *';
export const KEEP_WARM_URL = 'https://asia-northeast3-inky-voice-cinema.cloudfunctions.net/voiceCinema/';
export const KEEP_WARM_UNTIL = new Date('2026-11-15T00:00:00+09:00');
const PING_TIMEOUT_MS = 10000;

// 부르기에 실패해도 실행을 실패로 끝내지 않는다 — 다음 5분에 다시 부르고, 실패해도 잃는 것은 예열 한 번뿐이다(Poster Studio와 같음).
export async function keepWarmPing(now = new Date(), fetchImpl = fetch) {
  if (now.getTime() >= KEEP_WARM_UNTIL.getTime()) {
    console.log('[keepWarm] 예열 기간이 끝나 건너뜀');
    return 'skipped';
  }
  try {
    const res = await fetchImpl(KEEP_WARM_URL, { signal: AbortSignal.timeout(PING_TIMEOUT_MS) });
    console.log('[keepWarm] ping', res.status);
    return res.status;
  } catch (err) {
    console.warn('[keepWarm] ping 실패:', err?.name || 'Error');
    return 'failed';
  }
}
