/* 해상도별 화면 맞춤(2026-10-23 대표님 조직 표준 방식을 11/7 Bumm님 «모든 해상도 포스터 고쳤던거 기준으로»에 맞춰 고쳤다).
 *   휴대폰(세로)만 기준 화면(폭 390)에 맞춰 통째로 줄이고 키운다 — 390이 비율 1이다.
 *   PC · 태블릿은 Poster Studio처럼 실제 크기 그대로 쓰고 키우지 않는다(11/7 Bumm님 «640 480 화면으로 해상도 깨진 윈도우마냥 다 커져 있네»).
 *   폭에 따른 배치는 CSS(@container app)가 맡고, 창이 MIN_W보다 좁거나 MIN_H보다 낮을 때만 거기에 맞춰 줄인다.
 *   MIN_H는 한 화면짜리 화면(첫 페이지 · 녹음실 · 완성)이 스크롤 없이 드는 높이이고, MIN_W는 휴대폰 배치로 넘어가지 않는 폭이다.
 *   가로로 눕힌 휴대폰은 맞추지 않는다(비율 1). 크기 구간별 손질은 하지 않는다.
 * 화면 종류(data-fit): 짧은 변이 600 미만인 세로 창과 터치 기기의 가로 창은 휴대폰(phone · none), 나머지 터치 기기는 tablet, 마우스는 pc다.
 * 비율은 body의 zoom으로 건다. 크롬은 zoom 안에서 vw·vh까지 함께 키우므로, CSS는 화면 단위 대신 이 스크립트가 주는
 * «기준 화면 크기»(--app-w·--app-h, px)를 쓴다. 화면 크기를 재는 상자는 html 바로 아래(zoom 밖)에 두어 실제 화면을 잰다.
 * 인라인 스크립트를 두지 않는 규칙(CSP) 때문에 별도 파일로 두고, body 첫머리에서 읽어 첫 그림부터 맞춘다. */
(function () {
  var PHONE_W = 390;
  var MIN_W = 768;
  var MIN_H = 640;
  var root = document.documentElement;
  var body = document.body;
  var probe = document.createElement('div');
  probe.setAttribute('aria-hidden', 'true');
  probe.style.cssText = 'position:fixed;left:0;top:0;width:0;height:100svh;visibility:hidden;pointer-events:none';
  root.appendChild(probe);
  var touch = function () {
    if (matchMedia('(pointer: coarse)').matches) return true;
    return navigator.maxTouchPoints > 0 && !matchMedia('(pointer: fine)').matches;
  };
  var fit = function () {
    var w = root.clientWidth;
    var h = probe.getBoundingClientRect().height || window.innerHeight;
    if (!w || !h) return;
    var portrait = h >= w;
    var isTouch = touch();
    var kind = isTouch ? 'tablet' : 'pc';
    if (Math.min(w, h) < 600 && (portrait || isTouch)) kind = portrait ? 'phone' : 'none';
    var z = 1;
    if (kind === 'phone') z = w / PHONE_W;
    else if (kind !== 'none') z = Math.min(1, w / MIN_W, h / MIN_H);
    body.style.zoom = z === 1 ? '' : String(z);
    root.style.setProperty('--fit', String(z));
    root.style.setProperty('--fit-undo', String(1 / z));
    root.style.setProperty('--app-w', w / z + 'px');
    root.style.setProperty('--app-h', h / z + 'px');
    root.dataset.fit = kind;
  };
  fit();
  window.addEventListener('resize', fit);
  // 창을 줄이는 순간에는 앞 크기의 화면이 넘쳐 세로 스크롤 막대가 잠깐 생기고, 그 폭(15px)을 뺀 너비로 비율을 정한다. 막대는 맞춘 뒤 사라지지만
  // 창 크기는 그대로라 resize가 다시 오지 않아, 그 크기를 새로 연 것보다 작은 비율 · 오른쪽 빈 띠로 남았다(10/28 설치판 기준 16에서 발견 — 웹에도 있다).
  // 화면 폭이 바뀌었는데(막대가 사라짐) 넘치는 내용이 없으면 다시 맞춘다. 내용이 정말 넘쳐 막대가 남아 있는 화면에서는 비율을 다시 맞추지 않는다 —
  // 맞출 때마다 막대가 생겼다 사라졌다 하며 되풀이될 수 있어서다. 그때는 화면 폭만 막대를 뺀 값으로 바꾼다. 안 그러면 막대 폭만큼 가로로 넘친다(11/8 설치판 640×640 완성 화면).
  if (window.ResizeObserver) {
    new ResizeObserver(function () {
      if (root.scrollHeight <= root.clientHeight) fit();
      else root.style.setProperty('--app-w', root.clientWidth / parseFloat(root.style.getPropertyValue('--fit')) + 'px');
    }).observe(root);
  }
})();
