import { useEffect, useState } from 'react';
import { Home } from './components/Home';
import { Result, type SaveJob } from './components/Result';
import { Splash } from './components/Splash';
import { Studio } from './components/Studio';
import type { Genre } from './genres';
import { loadEngine } from './lib/ffmpeg';
import { initAppCheck } from './lib/upload';

type View = 'home' | 'studio' | 'result';

export function App() {
  const [view, setView] = useState<View>('home');
  const [genre, setGenre] = useState<Genre | null>(null);
  // 스튜디오에 들어갈 때마다 증가시켜 컴포넌트를 새로 마운트한다 — 같은 장르를
  // 다시 골랐을 때 이전 녹음이 살아남는 걸 구조적으로 막는다(리셋을 손으로
  // 호출하는 대신 마운트 경계가 보장한다).
  const [studioKey, setStudioKey] = useState(0);
  const [job, setJob] = useState<SaveJob | null>(null);
  const [engineProgress, setEngineProgress] = useState<number | null>(0);
  const [engineFailed, setEngineFailed] = useState(false);

  // 첫 더빙 전에 엔진(31MB)과 App Check를 미리 준비해 저장 시 대기시간을 줄인다.
  useEffect(() => {
    loadEngine((percent) => setEngineProgress(percent))
      .then(() => setEngineProgress(null))
      .catch((e) => {
        console.error('[엔진 준비 실패]', e);
        setEngineFailed(true);
      });
    initAppCheck().catch((e) => console.error('[App Check 사전초기화 실패]', e));
  }, []);

  const openStudio = (g: Genre) => {
    setGenre(g);
    setStudioKey((k) => k + 1);
    setView('studio');
  };

  const goHome = () => {
    setJob(null);
    setView('home');
  };

  return (
    <>
      <Splash />
      <div className="wrap">
        <Home
          active={view === 'home'}
          engineProgress={engineProgress}
          engineFailed={engineFailed}
          onSelect={openStudio}
        />
        {genre && (
          <Studio
            key={studioKey}
            active={view === 'studio'}
            genre={genre}
            onHome={goHome}
            onSave={(blob, mime) => {
              setJob({ genre, blob, mime });
              setView('result');
            }}
          />
        )}
        {job && (
          <Result
            active={view === 'result'}
            job={job}
            onHome={goHome}
            onBack={() => {
              setJob(null);
              setView('studio');
            }}
          />
        )}
      </div>
    </>
  );
}
