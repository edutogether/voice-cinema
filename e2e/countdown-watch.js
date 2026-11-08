// 문구 1초 · 3·2·1 1초씩(11/8 Bumm님 — 절정에서 녹음까지 4초, 10/24에는 0.6초 · 0.3초씩). 검사가 화면을 하나씩 기다렸다 읽으면 늦게 잡히므로,
// 페이지 안에서 문구·숫자·«녹음 중»이 나타나는 순간마다 그 시각 · 자리(화면 안·가려지지 않음) · 글자 크기 · 바탕과 영상 상태를 기록해 둔다.
export async function watchCountdown(page) {
  await page.addInitScript(() => {
    const log = [];
    window.__countdown = log;
    // 말할 차례 문구가 사라진 순간과 그때 «녹음 중»이 아직 있었는지(문구는 숫자 하나만큼만 뜨고 녹음은 이어진다, 11/8 Bumm님)
    const ends = [];
    window.__countdownEnds = ends;
    const seen = new Set();
    const note = (key, el) => {
      const r = el.getBoundingClientRect();
      const hit = document.elementFromPoint(r.x + r.width / 2, r.y + r.height / 2);
      const video = document.querySelector('#clip');
      log.push({ key, at: performance.now(), text: el.textContent,
        inViewport: r.top >= 0 && r.left >= 0 && r.bottom <= window.innerHeight && r.right <= window.innerWidth,
        uncovered: el === hit || el.contains(hit), paused: video?.paused, time: video ? Math.round(video.currentTime * 10) / 10 : null,
        size: parseFloat(getComputedStyle(el.querySelector('strong') ?? el).fontSize), background: getComputedStyle(el).backgroundColor });
    };
    new MutationObserver(() => {
      const cue = document.querySelector('#cue');
      const count = document.querySelector('#count');
      const pill = document.querySelector('#recpill');
      const speak = document.querySelector('#speakCue');
      const keys = [cue && 'cue', count && count.getAttribute('aria-label'), pill && 'recording', speak && 'speak'].filter(Boolean);
      for (const key of keys) {
        if (seen.has(key)) continue;
        seen.add(key);
        note(key, { cue, recording: pill, speak }[key] ?? count);
      }
      if (seen.has('speak') && !speak && !seen.has('speak-end')) {
        seen.add('speak-end');
        ends.push({ key: 'speak', at: performance.now(), recording: Boolean(pill) });
      }
      if (!cue && !count && !pill && seen.has('recording')) seen.clear();
    }).observe(document, { subtree: true, childList: true, attributes: true });
  });
}

export const countdownLog = (page) => page.evaluate(() => window.__countdown);
export const countdownEnds = (page) => page.evaluate(() => window.__countdownEnds);
