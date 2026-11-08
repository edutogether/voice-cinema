/* 해상도별 화면 맞춤(2026-10-23 대표님 조직 표준 방식을 11/7 Bumm님 «모든 해상도 포스터 고쳤던거 기준으로»에 맞춰 고쳤다).
 *   휴대폰(세로)만 기준 화면(폭 390)에 맞춰 통째로 줄이고 키운다 — 390이 비율 1이다.
 *   PC · 태블릿은 Poster Studio처럼 실제 크기 그대로 쓰고 키우지 않는다(11/7 Bumm님 «640 480 화면으로 해상도 깨진 윈도우마냥 다 커져 있네»).
 *   폭에 따른 배치는 CSS(@container app)가 맡고, 창이 MIN_W보다 좁거나 MIN_H보다 낮을 때만 거기에 맞춰 줄인다.
 *   MIN_H는 한 화면짜리 화면(첫 페이지 · 녹음실 · 완성)이 스크롤 없이 드는 높이이고, MIN_W는 휴대폰 배치로 넘어가지 않는 폭이다.
 *   가로로 눕힌 휴대폰은 맞추지 않는다(비율 1). 크기 구간별 손질은 하지 않는다.
 * 화면 종류(data-fit): 짧은 변이 600 미만인 세로 창과 터치 기기의 가로 창은 휴대폰(phone · none), 나머지 터치 기기는 tablet, 마우스는 pc다.
 * 비율은 body의 zoom으로 건다. 크롬은 zoom 안에서 vw·vh까지 함께 키우므로, CSS는 화면 단위 대신 이 스크립트가 주는
 * «기준 화면 크기»(--app-w·--app-h, px)를 쓴다. 화면 크기를 재는 상자는 html 바로 아래(zoom 밖)에 두어 실제 화면을 잰다.
 * 비율은 창 크기만으로 정하고 세로 스크롤 막대 자리를 미리 뺀다 — 막대가 생기고 사라져도 비율은 그대로이고 --app-w만 따라간다. 화면 폭으로 정하면 막대가 비율을 바꿔
 * 작은 비율 · 오른쪽 빈 띠로 남거나(10/28 설치판 기준 16에서 발견 — 웹에도 있다), 막대가 앱 폭을 760 아래로 끌어내려 휴대폰 배치가 되고 그 배치에서 막대가 사라져
 * 창을 건드리지 않아도 끝없이 오갔다(11/8 설치판 640×640 입력 오류 화면). 막대가 없는 기기(휴대폰 · 헤드리스)에서는 막대 자리가 0이다.
 * 스플래시 배율(--splash-scale, PC · 태블릿 · 설치판): 웹 PC 2560×1305 창의 스플래시를 기준으로, 창 넓이(가로 × 세로)의 비율에 맞춰 줄이고 키운다
 * (11/8 Bumm님 «PC 2560 정도의 비율로, PC · 패드 다른 비율도, 설치판 앱도 맞춰야지»). 넓이로 재는 까닭: 패드를 세로로 돌려도 같은 크기로 보이고,
 * 가로가 긴 PC 창에서는 높이 비율과 거의 같다. 화면 전체 비율(zoom)과 따로다 — CSS가 그것을 되돌린 뒤 이것만 건다.
 * 배율은 넓이 비율의 제곱근(√)과 1(그 전의 고정 크기)의 한가운데다(11/8 Bumm님 «작은 모니터에서 스플래시가 되게 작아졌다. 이전 거랑 지금의 중간 정도로») —
 * 제곱근만 쓰면 작은 창에서 너무 작았다(시험 모니터 1408×713 0.548 → 0.774, 1280×585 0.474 → 0.737, 1920×945 0.737 → 0.868). 2560×1305는 그대로 1이다.
 * 인라인 스크립트를 두지 않는 규칙(CSP) 때문에 별도 파일로 두고, body 첫머리에서 읽어 첫 그림부터 맞춘다. */
(function () {
  var PHONE_W = 390;
  var MIN_W = 768;
  var MIN_H = 640;
  var SPLASH_W = 2560;
  var SPLASH_H = 1305;
  var root = document.documentElement;
  var body = document.body;
  var probe = document.createElement('div');
  probe.setAttribute('aria-hidden', 'true');
  probe.style.cssText = 'position:fixed;left:0;top:0;width:100vw;height:100svh;overflow:scroll;visibility:hidden;pointer-events:none';
  root.appendChild(probe);
  var touch = function () {
    if (matchMedia('(pointer: coarse)').matches) return true;
    return navigator.maxTouchPoints > 0 && !matchMedia('(pointer: fine)').matches;
  };
  var fit = function () {
    var box = probe.getBoundingClientRect();
    var w = box.width || root.clientWidth;
    var h = box.height || window.innerHeight;
    if (!w || !h) return;
    var room = w - (probe.offsetWidth - probe.clientWidth);
    var portrait = h >= w;
    var isTouch = touch();
    var kind = isTouch ? 'tablet' : 'pc';
    if (Math.min(w, h) < 600 && (portrait || isTouch)) kind = portrait ? 'phone' : 'none';
    var z = 1;
    if (kind === 'phone') z = room / PHONE_W;
    else if (kind !== 'none') z = Math.min(1, room / MIN_W, h / MIN_H);
    body.style.zoom = z === 1 ? '' : String(z);
    root.style.setProperty('--fit', String(z));
    root.style.setProperty('--fit-undo', String(1 / z));
    root.style.setProperty('--app-w', root.clientWidth / z + 'px');
    root.style.setProperty('--app-h', h / z + 'px');
    root.style.setProperty('--splash-scale', String((1 + Math.sqrt((w * h) / (SPLASH_W * SPLASH_H))) / 2));
    root.dataset.fit = kind;
  };
  fit();
  window.addEventListener('resize', fit);
  if (window.ResizeObserver) new ResizeObserver(fit).observe(root);
})();
