// 시험용 마이크 — 페이지 안에서 만든 «아이 목소리 흉내»(280Hz 배음 + 음절 떨림)를 마이크처럼 넘긴다.
// 녹음기가 켜지는 순간을 기준으로 정해진 때에 정해진 길이만큼 말하게 해서, 녹음 길이·무음·잘림·합성 위치를 시간 단위로 잰다.
// 제품 코드에는 아무것도 넣지 않는다 — getUserMedia·MediaRecorder·AudioBufferSourceNode를 이 페이지에서만 감싼다.
//
// 녹음 하나의 계획(takes 배열의 n번째가 n번째 녹음):
//   { delay: 녹음기 켜짐 뒤 몇 초에 말하기 시작, dur: 말하는 길이, amp: 크기(1 = 0dBFS, 넘으면 찢어진 소리), f0: 목소리 높이(Hz),
//     noise: 배경 소음 크기, early: true면 «1»이 나올 때 미리 말하기 시작, unplug: 녹음기 켜짐 뒤 몇 초에 마이크를 뽑음,
//     error: 녹음기 켜짐 뒤 몇 초에 녹음기 오류, silent: true면 아무 소리도 안 냄,
//     more: [{ delay, dur }] 같은 녹음 안에서 이어 말하는 말소리(«셋 ! … 날아라, 미르 !»), delay는 녹음기 켜짐 기준 }
export async function installSyntheticMic(page, takes) {
  await page.addInitScript((plans) => {
    const RATE = 48000;
    const ctx = new window.AudioContext({ sampleRate: RATE });
    const startSource = window.AudioBufferSourceNode.prototype.start;
    const mic = { ctx, plans, takes: [], requests: 0, previews: [], dest: null, noise: null };
    window.__mic = mic;
    // 사용자 동작 없이 만든 오디오 장치는 멈춰 있다 — 그러면 녹음기에 소리가 안 들어가 크롬이 start 이벤트를 내지 않는다. 첫 클릭에 깨운다.
    document.addEventListener('pointerdown', () => ctx.resume(), { capture: true });
    const voiceBuffer = ({ dur = 1.5, amp = 0.3, f0 = 280 }) => {
      const buffer = ctx.createBuffer(1, Math.ceil((dur + 0.01) * RATE), RATE);
      const data = buffer.getChannelData(0);
      for (let i = 0; i < Math.round(dur * RATE); i++) {
        const t = i / RATE;
        const syllable = 0.55 + 0.45 * Math.sin(2 * Math.PI * 4 * t);
        const s = amp * syllable * (Math.sin(2 * Math.PI * f0 * t) + 0.5 * Math.sin(2 * Math.PI * 2 * f0 * t) + 0.25 * Math.sin(2 * Math.PI * 3 * f0 * t)) / 1.75;
        data[i] = Math.max(-1, Math.min(1, s));
      }
      return buffer;
    };
    const speak = (plan, when) => {
      if (plan.silent) return;
      const source = ctx.createBufferSource();
      source.buffer = voiceBuffer(plan);
      source.connect(mic.dest);
      startSource.call(source, when);
    };
    const current = () => plans[Math.min(mic.takes.length, plans.length - 1)];
    navigator.mediaDevices.getUserMedia = async () => {
      mic.requests++;
      await ctx.resume();
      mic.dest = ctx.createMediaStreamDestination();
      // 아무것도 이어지지 않은 출구는 소리 틀을 내보내지 않는 수가 있다 — 실제 마이크처럼 늘 (조용한) 소리가 흐르게 한다.
      const hum = ctx.createConstantSource();
      hum.offset.value = 0;
      hum.connect(mic.dest);
      hum.start();
      mic.ctxState = () => ctx.state;
      const plan = current();
      if (plan.noise) {
        const buffer = ctx.createBuffer(1, RATE, RATE);
        const data = buffer.getChannelData(0);
        for (let i = 0; i < data.length; i++) data[i] = plan.noise * (Math.random() * 2 - 1) * Math.SQRT2;
        mic.noise = ctx.createBufferSource();
        mic.noise.buffer = buffer;
        mic.noise.loop = true;
        mic.noise.connect(mic.dest);
        startSource.call(mic.noise);
      }
      return mic.dest.stream;
    };
    // «1»이 나오는 순간 — 신호보다 먼저 말하는 아이
    new MutationObserver(() => {
      const count = document.querySelector('#count');
      const plan = current();
      if (plan?.early && count?.getAttribute('aria-label') === '1초 뒤 녹음 시작' && !mic.earlySpoken) {
        mic.earlySpoken = true;
        speak(plan, ctx.currentTime);
      }
    }).observe(document, { subtree: true, childList: true, attributes: true });
    const start = window.MediaRecorder.prototype.start;
    window.MediaRecorder.prototype.start = function (...args) {
      const plan = current();
      const take = { plan, calledAt: performance.now(), recorder: this };
      mic.takes.push(take);
      mic.earlySpoken = false;
      // 녹음 파일은 start()를 부른 순간부터 담긴다(크롬은 첫 소리 조각이 나온 뒤에야 start 이벤트를 낸다 — 약 50ms 뒤)
      if (!plan.early) speak(plan, ctx.currentTime + (plan.delay ?? 0.3));
      for (const extra of plan.more ?? []) speak({ ...plan, ...extra }, ctx.currentTime + extra.delay);
      this.addEventListener('start', () => {
        take.startedAt = performance.now();
        // 장치가 빠지면 트랙이 끝나고 ended 이벤트가 온다. 페이지에서 stop()을 부르면 이벤트가 오지 않으므로(표준) 직접 낸다.
        // unplugQuiet면 이벤트 없이 끊기기만 한다 — 이벤트가 오지 않는 기기 흉내.
        if (plan.unplug) window.setTimeout(() => mic.dest.stream.getAudioTracks().forEach((track) => {
          track.stop();
          if (!plan.unplugQuiet) track.dispatchEvent(new window.Event('ended'));
        }), plan.unplug * 1000);
        if (plan.error) window.setTimeout(() => this.dispatchEvent(new window.Event('error')), plan.error * 1000);
      });
      this.addEventListener('stop', () => { take.stoppedAt = performance.now(); });
      take.chunks = [];
      this.addEventListener('dataavailable', (e) => { if (e.data?.size) take.chunks.push(e.data); });
      this.addEventListener('error', (e) => { take.error = e.error?.name || e.type; });
      const stop = this.stop;
      this.stop = function (...a) { take.stopStack = new Error().stack; take.stopCalledAt ??= performance.now(); return stop.apply(this, a); };
      return start.apply(this, args);
    };
    // 미리 듣기 — 앱이 다듬은 목소리를 언제·어디서부터 트는지, 그 소리가 어디서 시작하는지 기록한다
    window.AudioBufferSourceNode.prototype.start = function (when = 0, offset = 0, ...rest) {
      const video = document.querySelector('#clip');
      const data = this.buffer.getChannelData(0);
      const win = Math.round(this.buffer.sampleRate * 0.005);
      let onset = -1;
      let peak = 0;
      for (let at = 0; at + win <= data.length; at += win) {
        let sum = 0;
        for (let i = at; i < at + win; i++) { sum += data[i] * data[i]; peak = Math.max(peak, Math.abs(data[i])); }
        if (onset < 0 && Math.sqrt(sum / win) >= 0.01) onset = at / this.buffer.sampleRate;
      }
      mic.previews.push({ when, offset, videoTime: video?.currentTime ?? -1, onset, peak, duration: this.buffer.duration });
      return startSource.call(this, when, offset, ...rest);
    };
  }, takes);
}

/** 지금까지의 녹음 기록(녹음기가 켜져 있던 시간 등) */
export const takes = (page) => page.evaluate(() => window.__mic.takes.map((t) => ({
  seconds: t.startedAt && t.stoppedAt ? (t.stoppedAt - t.startedAt) / 1000 : null, state: t.recorder.state, error: t.error ?? null,
  track: t.recorder.stream.getAudioTracks().map((x) => `${x.readyState}${x.muted ? ' muted' : ''}`).join(), stopStack: t.stopStack,
  micContext: window.__mic.ctx.state, startDelay: t.startedAt ? +(t.startedAt - t.calledAt).toFixed(1) : null,
  // 앱이 멈추기로 한 때 — 녹음기 start()를 부른 때부터(시험용 말소리도 그때부터 예약한다)
  stopAt: t.stopCalledAt ? +((t.stopCalledAt - t.calledAt) / 1000).toFixed(3) : null,
})));
export const previews = (page) => page.evaluate(() => window.__mic.previews);

/** n번째 녹음 파일(녹음기가 낸 그대로)을 풀어 길이·피크를 잰다 — 앱이 다듬기 전의 소리 */
export const rawTake = (page, n) => page.evaluate(async (n) => {
  const take = window.__mic.takes[n];
  const blob = new window.Blob(take.chunks, { type: take.chunks[0]?.type });
  const audio = await new window.OfflineAudioContext(1, 48000, 48000).decodeAudioData(await blob.arrayBuffer());
  let peak = 0;
  for (let c = 0; c < audio.numberOfChannels; c++) for (const v of audio.getChannelData(c)) peak = Math.max(peak, Math.abs(v));
  // 녹음 안 말소리의 시작·끝(5ms 창 RMS가 피크의 1/30을 넘는 첫·끝 자리) — 시험이 예약한 때가 아니라 실제로 담긴 자리
  const data = audio.getChannelData(0);
  const win = Math.round(audio.sampleRate * 0.005);
  let start = -1, end = -1;
  for (let at = 0; at + win <= data.length; at += win) {
    let sum = 0;
    for (let i = at; i < at + win; i++) sum += data[i] * data[i];
    if (Math.sqrt(sum / win) >= peak / 30) { if (start < 0) start = at; end = at + win; }
  }
  // 말소리 구간의 평균 크기(RMS) — 앱의 «작게 담김» 문턱(−45dBFS = 0.0056)과 견준다
  let sum = 0, count = 0;
  for (let i = start; i >= 0 && i < end; i++) { sum += data[i] * data[i]; count++; }
  return { seconds: audio.duration, channels: audio.numberOfChannels, peak, start: start / audio.sampleRate, end: end / audio.sampleRate,
    speechRms: count ? Math.sqrt(sum / count) : 0 };
}, n);

/** 녹음 하나를 끝까지: «장면 시작» → 녹음 뒤 화면(저장 가능) 또는 준비 화면(다시 녹음)으로 돌아올 때까지 */
export async function recordOnce(page) {
  const before = await page.evaluate(() => window.__mic.takes.length);
  await page.locator('#recBtn').click();
  await page.waitForFunction((n) => {
    const studio = document.querySelector('#studio');
    return window.__mic.takes.length > n && window.__mic.takes[n].stoppedAt && ['recorded', 'idle'].includes(studio?.dataset.phase);
  }, before, { timeout: 40000 });
  const phase = await page.locator('#studio').getAttribute('data-phase');
  return { phase, check: await page.locator('#hint').getAttribute('data-take-check'), hint: await page.locator('#hint').textContent() };
}
