// 3·2·1은 숫자 하나가 0.3초다(10/24 대표님 — 절정에서 녹음까지 1.5초). 검사가 숫자를 하나씩 기다리면 놓치므로,
// 페이지 안에서 문구·숫자·«녹음 중»이 나타나는 순간마다 그 자리(화면 안·가려지지 않음)와 영상 상태를 기록해 둔다.
// 함께 적는 것: 정지 동안 막의 어두움(0.18초 전환 중이면 그 사이 값), 아이 대사, «지금 외쳐요 !» 문구.
export async function watchCountdown(page) {
  await page.addInitScript(() => {
    const log = [];
    window.__countdown = log;
    // 녹음실 단계(data-phase)가 바뀐 순간들 — 말을 마친 뒤 장면이 이어지기까지의 시간을 잰다
    const phases = [];
    window.__phases = phases;
    const seen = new Set();
    const note = (key, el) => {
      const r = el.getBoundingClientRect();
      const hit = document.elementFromPoint(r.x + r.width / 2, r.y + r.height / 2);
      const video = document.querySelector('#clip');
      const shade = document.querySelector('.studio-hold-shade');
      log.push({ key, at: performance.now(), text: el.textContent,
        shade: shade ? Number(getComputedStyle(shade).getPropertyValue('opacity')) : null,
        line: document.querySelector('[data-testid="child-line"]')?.textContent ?? null,
        shout: document.querySelector('#shout strong')?.textContent ?? null,
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
      const phase = document.querySelector('#studio')?.dataset.phase;
      if (phase && phases.at(-1)?.phase !== phase) phases.push({ phase, at: performance.now() });
    }).observe(document, { subtree: true, childList: true, attributes: true });
  });
}

export const countdownLog = (page) => page.evaluate(() => window.__countdown);
export const phaseLog = (page) => page.evaluate(() => window.__phases);
