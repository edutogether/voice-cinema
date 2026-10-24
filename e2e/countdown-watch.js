// 3·2·1은 숫자 하나가 0.3초다(10/24 대표님 — 절정에서 녹음까지 1.5초). 검사가 숫자를 하나씩 기다리면 놓치므로,
// 페이지 안에서 문구·숫자·«녹음 중»이 나타나는 순간마다 그 자리(화면 안·가려지지 않음)와 영상 상태를 기록해 둔다.
export async function watchCountdown(page) {
  await page.addInitScript(() => {
    const log = [];
    window.__countdown = log;
    const seen = new Set();
    const note = (key, el) => {
      const r = el.getBoundingClientRect();
      const hit = document.elementFromPoint(r.x + r.width / 2, r.y + r.height / 2);
      const video = document.querySelector('#clip');
      log.push({ key, at: performance.now(), text: el.textContent,
        inViewport: r.top >= 0 && r.left >= 0 && r.bottom <= window.innerHeight && r.right <= window.innerWidth,
        uncovered: el === hit || el.contains(hit), paused: video?.paused, time: video ? Math.round(video.currentTime * 10) / 10 : null });
    };
    new MutationObserver(() => {
      const cue = document.querySelector('#cue');
      const count = document.querySelector('#count');
      const pill = document.querySelector('#recpill');
      const keys = [cue && 'cue', count && count.getAttribute('aria-label'), pill && 'recording'].filter(Boolean);
      for (const key of keys) {
        if (seen.has(key)) continue;
        seen.add(key);
        note(key, key === 'cue' ? cue : key === 'recording' ? pill : count);
      }
      if (!cue && !count && !pill && seen.has('recording')) seen.clear();
    }).observe(document, { subtree: true, childList: true, attributes: true });
  });
}

export const countdownLog = (page) => page.evaluate(() => window.__countdown);
