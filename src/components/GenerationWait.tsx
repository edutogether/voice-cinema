import { useEffect, useRef, useState } from 'react';
import { waitingSets } from '../lib/waitingSets';
import { approvedWaitingVideo, prefetchWaitingVideo } from '../lib/waitingVideo';
import { WaitingArtwork } from './WaitingArtwork';

// 저장 대기 화면(영상과 목소리를 합치고 올리는 동안) — Poster Studio의 로딩 화면(src/studio/GenerationWait.tsx, 2806349)을 그대로 옮겼다
// (11/9 Bumm님 «로딩 화면 포스터에서 갖다가 쓰라니까 로딩 영상 12종하고 문구랑 다 그대로 갖다쓰라니까», 팀장 전달).
// 흰 전체 화면 위에 대기 영상 · 장면 제목 · 빨간 점 셋 · 영화 상식. 장면은 8초가 지나고 그 장면 영상이 끝나면 넘어가고(아래 untilVideoEnds),
// 결과는 장면 두 편이 끝난 뒤에 보인다(MIN_SCENES),
// 순서는 열 때마다 섞는다(바로 앞에 처음이던 장면은 처음에 두지 않는다).
// Voice Cinema에 없는 것은 옮기지 않았다: 조판 받기 차례(waitingNetwork의 afterWaitingVideos), 숨겨 둔 «기다린 시간», 샘플 장면 수 제한.

const OPENING_KEY = 'voice-cinema-wait-opening';
/** 한 장면(그림 · 제목 · 상식 한 세트)이 머무는 시간 */
export const SCENE_MS = 8_000;
/** 결과 화면 전에 끝까지 보이는 대기 장면 수의 하한 — 시간이 아니라 «끝난 편 수»로 센다
 *  (11/9 Bumm님 «보이스 기본 8.4초니까 2개는 로딩영상이 재생되게 해 그게 최소», 팀장 전달). */
export const MIN_SCENES = 2;
/** 결과가 준비됐을 때 부른다 — 장면 두 편이 끝나고, 그 뒤 재생 중인 대기 영상도 끝날 때까지 기다린다(아래 sceneEndRef). */
export type SceneEnd = () => Promise<void>;

// 12편 모두 그대로 쓴다 — 2번 «AI가 당신의 영화를 그리고 있어요»도 뺄지 여쭸고, Bumm님 지시 «로딩 영상 12종하고 문구랑 다 그대로»대로 12편이다
// (11/9 팀장 결정 전달 — «포스터 안으로» 문구도 그대로 둔 것과 기준을 하나로 맞춘다).
/** 대기 화면이 쓰는 정지 그림 — 앱이 미리 받아 둔다(App.tsx · warmWaitingStills) */
export const WAIT_STILLS = waitingSets.map((set) => set.image);
let lastOpeningId = -1;

/* 자리마다 균등한 32비트 난수 열쇠를 하나씩 뽑아 그 크기 순서로 늘어놓는다 — 나누거나 곱해 범위를 줄이지 않아 치우침이 없다(Poster Studio와 같다). */
function shuffled(length: number) {
  const keys = crypto.getRandomValues(new Uint32Array(length));
  return Array.from({ length }, (_, i) => i).sort((a, b) => (keys[a] < keys[b] ? -1 : keys[a] > keys[b] ? 1 : 0));
}

export function createWaitSequence() {
  let previous = lastOpeningId;
  try { previous = Number(sessionStorage.getItem(OPENING_KEY) ?? previous); } catch { /* 저장소가 막히면 메모리 기록을 쓴다 */ }
  const sequence = shuffled(waitingSets.length).map((index) => waitingSets[index]);
  if (sequence[0].id === previous) [sequence[0], sequence[1]] = [sequence[1], sequence[0]];
  lastOpeningId = sequence[0].id;
  try { sessionStorage.setItem(OPENING_KEY, String(lastOpeningId)); } catch { /* 이 탭 안에서는 메모리 기록을 쓴다 */ }
  return sequence;
}

/* 재생 중인 대기 영상이 끝날 때까지 기다린다 — 보이기 시작한 영상이 없으면(정지 그림 · 움직임 줄이기 · 아직 받는 중 · 이미 끝나 마지막 프레임에 머묾) 바로 끝난다.
   영상이 실패해 떼어 내지면(emptied) 그때 끝난다. 한도는 남은 길이 + 0.3초(«ended»가 오지 않는 경우), 많아야 9초(Poster Studio sceneEnd와 같은 값). */
function untilVideoEnds(root: HTMLElement | null) {
  return new Promise<void>((resolve) => {
    const v = root?.querySelector<HTMLVideoElement>('video[data-active="true"]');
    if (!v || v.paused || v.ended) { resolve(); return; }
    const left = Math.max(0, ((Number.isFinite(v.duration) ? v.duration : SCENE_MS / 1000) - v.currentTime) * 1000);
    const done = () => { v.removeEventListener('ended', done); v.removeEventListener('emptied', done); window.clearTimeout(timer); resolve(); };
    const timer = window.setTimeout(done, Math.min(left + 300, 9_000));
    v.addEventListener('ended', done);
    v.addEventListener('emptied', done);
  });
}

/* 장면은 8초가 지나고 그 장면 영상이 끝난 뒤에 넘어간다 — 대기 영상은 8초짜리라 조금만 늦게 시작해도 8초 간격이 꼬리를 잘랐다
   (11/9 Bumm님 «중간에 자르지말고 하나당 재생시간 지켜서», Poster Studio는 8초 간격 그대로다).
   sceneEndRef: 결과가 준비되면 Result가 부른다 — 장면이 MIN_SCENES편 끝나기 전이면 그 편이 끝날 때까지 장면을 이어 틀고, 그 뒤면 재생 중인 영상을
   끝까지 틀고 결과를 보인다(Bumm님 «2개하고 3번째꺼 빨리끊지말고 이왕 틀던건 다 고대로 보여주고 결과 보여줘라», Poster Studio 10/20과 같은 규칙).
   한 편은 영상이 끝났을 때 끝난다 — 영상이 늦게 뜨거나 멈칫하면 그만큼 뒤로 밀린다. 영상을 못 받아 정지 그림으로 남은 장면은 8초가 지나면 한 편으로 센다
   (인터넷이 끊긴 부스에서도 결과가 뜬다). 결과를 기다리는 동안은 다음 장면으로 넘기지 않는다 — 끝나자마자 결과로 넘어간다. */
export function GenerationWait({ sceneEndRef }: { sceneEndRef: { current: SceneEnd | null } }) {
  const dialog = useRef<HTMLDialogElement>(null);
  const heading = useRef<HTMLHeadingElement>(null);
  const [reduced, setReduced] = useState(() => window.matchMedia?.('(prefers-reduced-motion: reduce)').matches ?? false);
  const [scenes] = useState(createWaitSequence);
  const [sceneIndex, setSceneIndex] = useState(0);
  const holdRef = useRef(false);
  // 끝난 장면 수와, 장면이 모자라 결과가 기다리는 중이면 그 결과를 풀어 줄 함수
  const doneRef = useRef(0);
  const readyRef = useRef<(() => void) | null>(null);
  // 로딩 화면은 멈추는 화면이 아니다 — 자동 넘김은 «움직임 줄이기» 설정에서만 멈춘다(Poster Studio 10/6 Bumm님 결정 118)
  const still = reduced;
  const scene = scenes[sceneIndex];

  useEffect(() => {
    const element = dialog.current!;
    const previousOverflow = document.documentElement.style.overflow;
    document.documentElement.style.overflow = 'hidden';
    if (typeof element.showModal === 'function') element.showModal();
    else element.setAttribute('open', '');
    heading.current?.focus();
    const media = window.matchMedia?.('(prefers-reduced-motion: reduce)');
    const update = () => setReduced(media?.matches ?? false);
    media?.addEventListener?.('change', update);
    return () => {
      document.documentElement.style.overflow = previousOverflow;
      media?.removeEventListener?.('change', update);
      if (element.open && typeof element.close === 'function') element.close();
    };
  }, []);

  useEffect(() => {
    if (still) return;
    let cancelled = false;
    const timer = window.setTimeout(() => {
      void untilVideoEnds(dialog.current).then(() => {
        if (cancelled || holdRef.current) return;
        doneRef.current += 1;
        const ready = readyRef.current;
        if (ready && doneRef.current >= MIN_SCENES) {
          holdRef.current = true;
          readyRef.current = null;
          ready();
          return;
        }
        setSceneIndex((value) => (value + 1) % scenes.length);
      });
    }, SCENE_MS);
    return () => { cancelled = true; window.clearTimeout(timer); };
  }, [still, sceneIndex, scenes.length]);

  useEffect(() => {
    // 움직임 줄이기는 장면이 넘어가지 않는다 — 기다리던 결과가 있으면 바로 보인다
    if (still && readyRef.current) { const ready = readyRef.current; readyRef.current = null; ready(); }
    sceneEndRef.current = () => {
      if (still) return Promise.resolve();
      if (doneRef.current < MIN_SCENES) return new Promise<void>((resolve) => { readyRef.current = resolve; });
      holdRef.current = true;
      return untilVideoEnds(dialog.current);
    };
    return () => { sceneEndRef.current = null; };
  }, [sceneEndRef, still]);
  // 대기 화면을 떠나면(뒤로 가기) 기다리던 결과를 풀어 준다 — 돌아왔을 때 결과가 보인다(영상이 떼어 질 때 풀리던 untilVideoEnds와 같다)
  useEffect(() => () => { const ready = readyRef.current; readyRef.current = null; ready?.(); }, []);

  // 다음 장면의 정지 그림은 장면이 바뀌자마자 보여야 하므로 장면 시작에 받아 둔다
  useEffect(() => {
    const next = new Image();
    next.src = scenes[(sceneIndex + 1) % scenes.length].image;
  }, [sceneIndex, scenes]);

  // 다음 장면 영상은 지금 장면 영상을 다 받은 뒤에 받는다 — 그사이 장면이 넘어갔으면 받지 않는다(넘어간 장면이 제 영상을 받은 뒤 그다음을 받는다)
  const alive = useRef(true);
  useEffect(() => { alive.current = true; return () => { alive.current = false; }; }, []);
  const current = useRef(sceneIndex);
  useEffect(() => { current.current = sceneIndex; }, [sceneIndex]);
  const onSceneLoaded = () => {
    const at = sceneIndex;
    const video = reduced ? undefined : approvedWaitingVideo(scenes[(at + 1) % scenes.length].id);
    if (video && alive.current && current.current === at) void prefetchWaitingVideo(video);
  };

  return (
    <dialog ref={dialog} id="loading" className="generation-wait" data-paused={still} data-scene={sceneIndex} data-set-id={scene.id} aria-labelledby="generationTitle" onCancel={(event) => event.preventDefault()}>
      <div className="generation-content">
        <div className="generation-film waiting-art-frame" data-art={scene.id}>
          <WaitingArtwork key={scene.id} image={scene.image} theme={scene.theme} video={approvedWaitingVideo(scene.id)} paused={still} reduced={reduced} onLoaded={onSceneLoaded} />
        </div>
        <h1 ref={heading} tabIndex={-1} id="generationTitle" className="generation-copy-stack">
          {scenes.map(({ id, title }, index) => <span key={id} className="generation-copy" data-active={index === sceneIndex} aria-hidden={index !== sceneIndex}>{title}</span>)}
        </h1>
        <div className="generation-dots" aria-hidden="true">
          {[0, 1, 2].map((index) => <i key={index} />)}
        </div>
        <section className="movie-fact" aria-label="영화 속 작은 이야기">
          <div className="generation-copy-stack movie-fact-titles">
            {scenes.map(({ fact: { title } }, index) => <h2 key={title} data-active={index === sceneIndex} aria-hidden={index !== sceneIndex}>{title}</h2>)}
          </div>
          <div className="generation-copy-stack movie-fact-bodies">
            {scenes.map(({ fact: { body } }, index) => <p key={body} data-active={index === sceneIndex} aria-hidden={index !== sceneIndex}>{body}</p>)}
          </div>
        </section>
      </div>
    </dialog>
  );
}
