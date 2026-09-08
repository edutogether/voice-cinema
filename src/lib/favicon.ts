// 탭 파비콘을 캔버스로 그린다(별도 이미지 파일 없이 이모지 하나로).
// 탭이 가려지면 회색으로 바꿔 "지금 보고 있는 탭"을 구분하기 쉽게 한다.
//
// 예전엔 index.html의 인라인 <script>였는데, CSP가 인라인 스크립트를 해시로만
// 허용해 내용이 바뀔 때마다 firebase.json의 해시를 다시 계산해 넣어야 했다.
// 모듈로 옮겨 그 유지보수 자체를 없앴다.

function draw(gray: boolean): string {
  const size = 64;
  const canvas = document.createElement('canvas');
  canvas.width = canvas.height = size;
  const ctx = canvas.getContext('2d');
  if (!ctx) return '';
  ctx.font = `${size * 0.8}px sans-serif`;
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  ctx.fillText('🎙️', size / 2, size / 2 + 2);
  if (gray) {
    const img = ctx.getImageData(0, 0, size, size);
    const d = img.data;
    for (let i = 0; i < d.length; i += 4) {
      d[i] = d[i + 1] = d[i + 2] = d[i] * 0.3 + d[i + 1] * 0.59 + d[i + 2] * 0.11;
    }
    ctx.putImageData(img, 0, 0);
  }
  return canvas.toDataURL('image/png');
}

export function installFavicon(): void {
  const cache: Record<'color' | 'gray', string> = { color: '', gray: '' };

  const apply = (gray: boolean) => {
    const key = gray ? 'gray' : 'color';
    const href = (cache[key] ||= draw(gray));
    if (!href) return;
    // href만 바꾸면 크롬이 백그라운드 탭에서 파비콘을 다시 그리지 않는 경우가 있어,
    // 링크 엘리먼트 자체를 매번 새로 만들어 교체한다(대표 테스트로 재현·확인, 2026-08-31).
    document.querySelectorAll('link[rel~="icon"]').forEach((el) => el.remove());
    const link = document.createElement('link');
    link.rel = 'icon';
    link.href = href;
    document.head.appendChild(link);
  };

  const sync = () => apply(document.hidden);
  sync();
  document.addEventListener('visibilitychange', sync);
  window.addEventListener('blur', () => apply(true));
  window.addEventListener('focus', sync);
}
