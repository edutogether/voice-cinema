/* 해상도별 화면 맞춤(2026-10-23 대표님 — 조직 표준 방식): 화면 종류마다 «기준 화면» 하나를 두고, 실제 화면에 맞춰 통째로 비율을 바꾼다.
 *   PC 1366 · 태블릿 가로 1024 · 태블릿 세로 768 · 휴대폰(세로) 390 — 기준 폭과 같은 화면에서는 아무것도 바꾸지 않는다(비율 1).
 *   기준은 흔한 작은 화면 쪽으로 잡았다 — 큰 화면은 같은 모습을 키워 보이고, 작은 화면에서 글자가 기준보다 크게 줄지 않는다.
 *   PC·태블릿은 높이도 맞춘다 — 한 화면짜리 화면(첫 페이지·녹음실·완성)이 다 드는 높이(MIN_H)보다 낮은 창에서는 그 높이에 맞춰 더 줄인다.
 *   가로로 눕힌 휴대폰은 맞추지 않는다(비율 1). 크기 구간별 손질은 하지 않는다.
 * 화면 종류: 터치 기기이거나, 마우스라도 창이 세로이거나 좁으면(1024 미만) 짧은 변으로 휴대폰(600 미만)·태블릿을 가른다. 나머지는 PC다.
 * 비율은 body의 zoom으로 건다. 크롬은 zoom 안에서 vw·vh까지 함께 키우므로, CSS는 화면 단위 대신 이 스크립트가 주는
 * «기준 화면 크기»(--app-w·--app-h, px)를 쓴다. 화면 크기를 재는 상자는 html 바로 아래(zoom 밖)에 두어 실제 화면을 잰다.
 * 인라인 스크립트를 두지 않는 규칙(CSP) 때문에 별도 파일로 두고, body 첫머리에서 읽어 첫 그림부터 맞춘다. */
(function () {
  var MIN_H = 720;
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
    var base = 1366;
    if (touch() || portrait || w < 1024) {
      if (Math.min(w, h) >= 600) base = portrait ? 768 : 1024;
      else base = portrait ? 390 : 0;
    }
    var z = base ? w / base : 1;
    if (base && base !== 390) z = Math.min(z, h / MIN_H);
    body.style.zoom = z === 1 ? '' : String(z);
    root.style.setProperty('--fit', String(z));
    root.style.setProperty('--app-w', w / z + 'px');
    root.style.setProperty('--app-h', h / z + 'px');
    root.dataset.fit = base ? String(base) : 'none';
  };
  fit();
  window.addEventListener('resize', fit);
})();
