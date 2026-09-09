import { GENRES, type Genre } from '../genres';
import { GenreTile } from './GenreTile';

interface Props {
  active: boolean;
  enginePercent: number;
  engineLoading: boolean;
  engineFailed: boolean;
  onSelect: (genre: Genre) => void;
}

export function Home({ active, enginePercent, engineLoading, engineFailed, onSelect }: Props) {
  return (
    <section id="home" className={`view${active ? ' active' : ''}`}>
      <div className="brand">
        <h1>
          InKY <span className="gold">Voice Cinema</span>
        </h1>
        <p className="tagline-top">상상을 현실로 — 내 목소리로 완성하는 영화</p>
      </div>

      {/* 배너는 항상 DOM에 두고 `.show`로만 여닫는다(전환 전과 동일).
          문구도 그대로 — 앞의 "엔진 준비 중…"은 고정이고 굵은 부분만 바뀐다. */}
      <div
        id="enginebar"
        className={`enginebar${engineLoading || engineFailed ? ' show' : ''}${engineFailed ? ' err' : ''}`}
      >
        엔진 준비 중… <b id="engineProg">{engineFailed ? '실패 — 저장 시 다시 시도됩니다' : `${enginePercent}%`}</b>
      </div>

      <div className="grid" id="grid">
        {GENRES.map((genre, i) => (
          <GenreTile key={genre.id} genre={genre} index={i} viewActive={active} onSelect={onSelect} />
        ))}
      </div>

      <a className="privacylink" href="./privacy.html" target="_blank" rel="noopener">
        개인정보처리방침
      </a>
    </section>
  );
}
