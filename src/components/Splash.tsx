import { useEffect, useState } from 'react';

const VISIBLE_MS = 1800;
const FADE_MS = 600;

/**
 * 첫 진입 스플래시. 예전엔 index.html의 인라인 <script>가 setTimeout으로 DOM에서
 * 지웠는데, 그 인라인 스크립트 때문에 CSP에 해시를 박아야 했다.
 */
export function Splash() {
  const [hiding, setHiding] = useState(false);
  const [gone, setGone] = useState(false);

  useEffect(() => {
    const hide = setTimeout(() => setHiding(true), VISIBLE_MS);
    const remove = setTimeout(() => setGone(true), VISIBLE_MS + FADE_MS);
    return () => {
      clearTimeout(hide);
      clearTimeout(remove);
    };
  }, []);

  if (gone) return null;
  return (
    <div id="splash" className={hiding ? 'hide' : undefined}>
      <div className="logo">🎬</div>
      <div className="name">
        InKY <span className="gold">Voice Cinema</span>
      </div>
      <div className="stagline">무성영화에 내 목소리를 더빙해 완성하는 나만의 영화</div>
      <span className="sbar">
        <i />
      </span>
    </div>
  );
}
