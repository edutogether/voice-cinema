// 앱이 끝내 화면에 붙지 못했을 때(예: 렌더 도중 예외) 스플래시에 갇히지 않게 하는
// 안전판. 실측상 번들이 실행되면 30~70ms 안에 화면이 붙으므로, 이 시간이 지나도록
// 신호가 없다는 건 정상 로딩이 아니라 실패라는 뜻이다.
const SAFETY_MS = 8000;

/**
 * 첫 진입 스플래시를 화면에서 걷어낸다.
 *
 * 마크업은 index.html에 정적으로 두고(리액트가 그리면 번들 로드 전까지 빈 화면이
 * 잠깐 보인다), 사라지는 타이밍은 CSS 애니메이션이 잡는다(문서가 그려지는 순간부터
 * 흐르므로 번들 로드 시간에 밀리지 않는다). 앱이 화면에 붙을 때까지 소멸을 멈춰
 * 세우는 것도 CSS가 하고(`body:not(.app-ready) #splash`), 앱은 클래스 하나로
 * "붙었다"는 조건만 알려준다 — 즉 시간은 CSS가 재고 JS는 조건만 본다.
 *
 * 여기서 하는 일은 두 가지뿐이다.
 * 1) 애니메이션이 끝나면 노드를 실제로 지운다 — 남아 있으면 `body:has(#splash)`가
 *    계속 매치돼 배경 그라디언트가 안 돌아온다.
 * 2) 앱이 끝내 안 붙는 경우를 대비한 안전판.
 */
export function installSplash(): void {
  const splash = document.getElementById('splash');
  if (!splash) return;

  const remove = () => splash.remove();
  splash.addEventListener('animationend', (e) => {
    if (e.animationName === 'splashOut') remove();
  });

  // 번들이 늦게 실행돼 애니메이션이 이미 끝났을 수도 있다 — 그 경우 바로 지운다.
  if (splash.getAnimations().every((a) => a.playState === 'finished')) {
    remove();
    return;
  }

  setTimeout(() => {
    if (!splash.isConnected) return;
    console.warn('[스플래시] 앱이 제때 화면에 붙지 않아 안전판으로 걷어냅니다');
    document.body.classList.add('app-ready');
  }, SAFETY_MS);
}
