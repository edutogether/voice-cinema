/**
 * 첫 진입 스플래시를 화면에서 걷어낸다.
 *
 * 마크업은 index.html에 정적으로 두고(리액트가 그리면 번들 로드 전까지 빈 화면이
 * 잠깐 보인다), 사라지는 타이밍은 CSS 애니메이션이 잡는다(문서가 그려지는 순간부터
 * 흐르므로 번들 로드 시간에 밀리지 않는다 — 전환 전 인라인 스크립트와 같은 기준).
 * 여기서는 그 애니메이션이 끝나면 노드를 실제로 지우는 일만 한다 —
 * 노드가 남아 있으면 `body:has(#splash)`가 계속 매치돼 배경 그라디언트가 안 돌아온다.
 */
export function installSplash(): void {
  const splash = document.getElementById('splash');
  if (!splash) return;

  const remove = () => splash.remove();
  splash.addEventListener('animationend', (e) => {
    if (e.animationName === 'splashOut') remove();
  });

  // 번들이 늦게 실행돼 애니메이션이 이미 끝났을 수도 있다 — 그 경우 바로 지운다.
  if (splash.getAnimations().every((a) => a.playState === 'finished')) remove();
}
