import { GENRES, type Genre } from '../genres';
import { GenreTile } from './GenreTile';

interface Props {
  active: boolean;
  engineProgress: number | null;
  engineFailed: boolean;
  onSelect: (genre: Genre) => void;
}

export function Home({ active, engineProgress, engineFailed, onSelect }: Props) {
  return (
    <section id="home" className={`view${active ? ' active' : ''}`}>
      <div className="brand">
        <h1>
          InKY <span className="gold">Voice Cinema</span>
        </h1>
        <p className="tagline-top">상상을 현실로 — 내 목소리로 완성하는 영화</p>
      </div>

      {(engineProgress !== null || engineFailed) && (
        <div className={`enginebar show${engineFailed ? ' err' : ''}`}>
          {engineFailed ? (
            <>엔진 준비 실패 — <b>저장 시 다시 시도됩니다</b></>
          ) : (
            <>엔진 준비 중… <b>{engineProgress}%</b></>
          )}
        </div>
      )}

      <div className="grid">
        {GENRES.map((genre) => (
          <GenreTile key={genre.id} genre={genre} onSelect={onSelect} />
        ))}
      </div>

      <a className="privacylink" href="./privacy.html" target="_blank" rel="noopener">
        개인정보처리방침
      </a>
    </section>
  );
}
