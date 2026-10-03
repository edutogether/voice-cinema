import { useEffect, useRef, useState } from 'react';
import { Home } from './components/Home';
import { Result, type SaveJob } from './components/Result';
import { Studio } from './components/Studio';
import { GENRES, type Genre } from './genres';
import { loadEngine } from './lib/ffmpeg';
import { installServiceWorker } from './lib/sw';
import { initAppCheck } from './lib/upload';
import { captureSceneEntrance, type SceneEntrance } from './lib/sceneEntrance';
import { isLocalRecordingSample } from './lib/sampleMode';

type View = 'home' | 'studio' | 'result';

interface ScreenHistory {
  pageId: string;
  view: View;
  depth: number;
  genreId?: string;
  studioKey?: number;
}

function readScreenHistory(): ScreenHistory | null {
  const entry = window.history.state?.voiceCinema;
  if (!entry || typeof entry.pageId !== 'string' || !['home', 'studio', 'result'].includes(entry.view)
    || !Number.isSafeInteger(entry.depth) || entry.depth < 0) return null;
  return entry as ScreenHistory;
}

function writeScreenHistory(entry: ScreenHistory, replace = false): void {
  // 쿼리·주소와 다른 코드의 history.state 값은 유지한다. 녹음 Blob은 기록에 저장하지 않는다.
  const state = { ...window.history.state, voiceCinema: entry };
  if (replace) window.history.replaceState(state, '');
  else window.history.pushState(state, '');
}

export function App() {
  const sampleMode = isLocalRecordingSample(window.location);
  const wrapRef = useRef<HTMLDivElement>(null);
  const lastGenreRef = useRef<string | null>(null);
  const pageIdRef = useRef(Array.from(crypto.getRandomValues(new Uint32Array(4))).join('-'));
  const studioSequenceRef = useRef(0);
  const navigatingRef = useRef(false);
  const [view, setView] = useState<View>('home');
  const [genre, setGenre] = useState<Genre | null>(null);
  // 스튜디오에 들어갈 때마다 증가시켜 컴포넌트를 새로 마운트한다 — 같은 장르를
  // 다시 골랐을 때 이전 녹음이 살아남는 걸 구조적으로 막는다(리셋을 손으로
  // 호출하는 대신 마운트 경계가 보장한다).
  const [studioKey, setStudioKey] = useState(0);
  const [entrance, setEntrance] = useState<SceneEntrance | null>(null);
  const [job, setJob] = useState<SaveJob | null>(null);
  const [enginePercent, setEnginePercent] = useState(0);
  const [engineLoading, setEngineLoading] = useState(true);
  const [engineFailed, setEngineFailed] = useState(false);
  // 새 버전이 준비됐는지. 저절로 새로고침하지 않고 사람이 누를 때만 한다 —
  // 부스에서 아이가 녹음·합성 중에 화면이 다시 시작되면 작업이 통째로 날아간다.
  const [updateReady, setUpdateReady] = useState(false);

  useEffect(() => {
    // 새로고침 뒤에는 이전 참가자의 녹음·결과를 복구하지 않는다.
    writeScreenHistory({ pageId: pageIdRef.current, view: 'home', depth: 0 }, true);
  }, []);

  useEffect(() => {
    const onPopState = () => {
      setEntrance(null);
      navigatingRef.current = false;
      const entry = readScreenHistory();
      const selectedGenre = GENRES.find(g => g.id === entry?.genreId);
      setJob(null);
      if (!entry || entry.pageId !== pageIdRef.current || entry.view === 'home' || !selectedGenre
        || !Number.isSafeInteger(entry.studioKey)) {
        setGenre(null);
        setView('home');
        if (!entry || entry.pageId !== pageIdRef.current) {
          writeScreenHistory({ pageId: pageIdRef.current, view: 'home', depth: 0 }, true);
        }
        return;
      }
      lastGenreRef.current = selectedGenre.id;
      setGenre(selectedGenre);
      setStudioKey(entry.studioKey!);
      setView('studio');
      // 결과 화면 재방문으로 합성·업로드를 다시 실행하지 않는다. 녹음실에서 직접 저장해야 한다.
      if (entry.view === 'result') writeScreenHistory({ ...entry, view: 'studio' }, true);
    };
    window.addEventListener('popstate', onPopState);
    return () => window.removeEventListener('popstate', onPopState);
  }, []);

  useEffect(() => {
    if (view === 'home' && lastGenreRef.current) {
      wrapRef.current?.querySelector<HTMLButtonElement>(`[data-genre="${lastGenreRef.current}"]`)?.focus();
    }
  }, [view]);

  // 화면이 실제로 붙었다고 알린다 — 스플래시가 이 신호를 기다렸다가 걷힌다
  // (src/styles/splash.css의 로드 게이트). 시간은 CSS가 재고 여기서는 조건만 준다.
  useEffect(() => {
    document.body.classList.add('app-ready');
  }, []);

  useEffect(() => {
    installServiceWorker(() => setUpdateReady(true));
  }, []);

  // 첫 더빙 전에 엔진(31MB)과 App Check를 미리 준비해 저장 시 대기시간을 줄인다.
  useEffect(() => {
    if (sampleMode) {
      setEngineLoading(false);
      return;
    }
    loadEngine((percent) => setEnginePercent(percent))
      .then(() => setEngineLoading(false))
      .catch((e) => {
        console.error('[엔진 준비 실패]', e);
        setEngineFailed(true);
      });
    initAppCheck().catch((e) => console.error('[App Check 사전초기화 실패]', e));
  }, [sampleMode]);

  const openStudio = (g: Genre, source?: HTMLElement) => {
    if (navigatingRef.current) return;
    setEntrance(captureSceneEntrance(source));
    const key = ++studioSequenceRef.current;
    writeScreenHistory({ pageId: pageIdRef.current, view: 'studio', depth: 1, genreId: g.id, studioKey: key });
    lastGenreRef.current = g.id;
    setGenre(g);
    setStudioKey(key);
    setView('studio');
  };

  // 홈으로 나갈 때는 스튜디오를 화면에서 숨기는 것으로 끝내지 않고 아예 내린다.
  // `.view`는 숨길 때 display:none일 뿐이라 그 안의 <video>·재생 중인 오디오는
  // 계속 소리를 낸다 — 미리보기나 [다시 듣기] 도중에 [처음으로]를 누르면 홈
  // 화면에서 앞 사람의 영상·목소리가 끝까지 들렸다(실측 확인). 마운트를 끊으면
  // useDubbing의 정리(reset·재생 중단)가 한 곳에서 확실히 돌아 그 경로가 사라진다.
  const goHome = () => {
    if (navigatingRef.current) return;
    const entry = readScreenHistory();
    if (entry?.pageId === pageIdRef.current && entry.depth > 0) {
      navigatingRef.current = true;
      window.history.go(-entry.depth);
      return;
    }
    writeScreenHistory({ pageId: pageIdRef.current, view: 'home', depth: 0 }, true);
    setJob(null);
    setGenre(null);
    setView('home');
  };

  return (
    <div className="wrap" ref={wrapRef}>
      <Home
        active={view === 'home'}
        enginePercent={enginePercent}
        engineLoading={engineLoading}
        engineFailed={engineFailed}
        onSelect={openStudio}
      />
      {genre && (
        <Studio
          key={studioKey}
          entrance={entrance}
          active={view === 'studio'}
          genre={genre}
          sampleMode={sampleMode}
          onHome={goHome}
          onSave={(recording) => {
            const entry = readScreenHistory();
            writeScreenHistory({ pageId: pageIdRef.current, view: 'result', depth: (entry?.depth ?? 1) + 1, genreId: genre.id, studioKey });
            setJob({ genre, ...recording });
            setView('result');
          }}
        />
      )}
      {/* 홈에 있을 때만 알린다 — 녹음·합성·저장 중에는 화면에 끼어들지 않는다.
          누르는 순간에만 새로고침하므로 하던 작업이 날아갈 일이 없다. */}
      {updateReady && view === 'home' && (
        <button className="update-nudge" type="button" onClick={() => window.location.reload()}>
          새 버전이 있어요 <b>새로고침</b>
        </button>
      )}
      {job && (
        <Result
          active={view === 'result'}
          job={job}
          onHome={goHome}
          onBack={() => {
            if (navigatingRef.current) return;
            navigatingRef.current = true;
            window.history.back();
          }}
        />
      )}
    </div>
  );
}
