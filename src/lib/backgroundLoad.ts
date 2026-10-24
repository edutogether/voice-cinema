// 뒤에서 받는 것(엔진 31MB · 저장할 때 쓰는 완성용 원판)이 지금 화면에 필요한 영상과 회선을 다투지 않게 한다(2026-10-24 대표님 «와이파이에서 너무 느림»).
// 느린 와이파이(1.6Mbps)에서 장면을 골라 5초 지점까지 가는 데 56초가 걸렸다 — 엔진 7.1MB · reCAPTCHA · 장면 그림을 한꺼번에 받으며 장면 영상이 밀렸다.
//
// - 앞에서 받는 쪽(녹음실 장면 영상)은 holdBackground()로 잡고, 다 받히면(또는 브라우저가 그만 받으면) 놓는다.
// - 뒤에서 받는 쪽은 한 조각 읽을 때마다 backgroundTurn()을 기다린다. 읽지 않고 기다리면 브라우저가 그 연결로 더 받지 않는다 —
//   받기를 끊는 것이 아니라 잠시 쉬는 것이라 받은 데까지는 그대로 남는다.
// - 뒤에서 받기는 화면의 첫 영상이 재생할 만큼 받힌 뒤(canplaythrough)에 시작한다. 영상이 끝내 안 받혀도 정해진 시간 뒤에는 시작한다.
let holds = 0;
let waiters: Array<() => void> = [];

export function holdBackground(): () => void {
  holds++;
  let released = false;
  return () => {
    if (released) return;
    released = true;
    holds--;
    if (holds === 0) {
      const ready = waiters;
      waiters = [];
      ready.forEach((resolve) => resolve());
    }
  };
}

export function backgroundTurn(): Promise<void> {
  return holds === 0 ? Promise.resolve() : new Promise((resolve) => waiters.push(resolve));
}

/** 화면의 영상 하나가 처음으로 재생할 만큼 받혔을 때(또는 fallbackMs 뒤) 풀린다. */
export function afterFirstMediaReady(fallbackMs: number): Promise<void> {
  return new Promise((resolve) => {
    // 미디어 이벤트는 거품이 올라오지 않지만 캡처 단계로는 문서까지 내려온다
    const onReady = (event: Event) => {
      if (event.target instanceof HTMLMediaElement) done();
    };
    const timer = window.setTimeout(done, fallbackMs);
    document.addEventListener('canplaythrough', onReady, true);
    function done() {
      window.clearTimeout(timer);
      document.removeEventListener('canplaythrough', onReady, true);
      resolve();
    }
  });
}

/** 본문을 끝까지 읽되, 앞에서 받는 영상이 있으면 그동안은 읽지 않고 기다린다. */
export async function readInBackground(response: Response, onChunk?: (chunk: Uint8Array) => void): Promise<void> {
  if (!response.body) {
    onChunk?.(new Uint8Array(await response.arrayBuffer()));
    return;
  }
  const reader = response.body.getReader();
  for (;;) {
    await backgroundTurn();
    const { done, value } = await reader.read();
    if (done) return;
    onChunk?.(value);
  }
}
