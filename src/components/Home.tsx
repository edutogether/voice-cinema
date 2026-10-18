import { GENRES, type Genre } from '../genres';
import { SUPPORTS_HOVER } from '../lib/pointer';
import { FestivalHeader } from './FestivalHeader';
import { SceneCarousel } from './SceneCarousel';

interface Props {
  active: boolean;
  enginePercent: number;
  engineLoading: boolean;
  engineFailed: boolean;
  onSelect: (genre: Genre, source?: HTMLElement) => void;
}

// 휴대폰·태블릿(터치)도 PC와 같은 2.0 캐러셀을 쓴다 — 옛 격자(여덟 장 동시 재생)는 없앴다(10/17 대표님,
// «보는 중에 왜 옛날식으로 허접하게 화면이 바뀌냐»). 휴대폰 폭에서는 왼쪽 안내가 제목 위로 올라온다(home.css) —
// 그때 줄바꿈(<br>)을 지우므로 줄 끝마다 띄어쓰기를 둔다(PC에서는 줄 끝 공백이라 보이지 않는다).
export function Home({ active, enginePercent, engineLoading, engineFailed, onSelect }: Props) {
  return (
    <section id="home" className={`view${active ? ' active' : ''}`}>
      <FestivalHeader />

      <div className="chart-layout">
        <aside className="chart-aside" aria-label="Voice Cinema 체험 안내">
          <p className="chart-app"><strong>Voice <em>Cinema</em></strong><span>CGV 인천 · 인천광역시교육청 주최</span></p>
          <div className="chart-invitation">
            <img src="/icons/studio-microphone.png" alt="" width="160" height="160" />
            <p className="chart-label">나만의 더빙 극장</p>
            <h2>내 목소리로 <br />완성하는 <br /><em>10초의 영화.</em></h2>
            <p>마법사도, 히어로도. <br />오늘은 내가 주인공이에요.</p>
          </div>
          <div className="chart-guide">
            <strong>목소리만 준비하세요.</strong>
            <p>마음에 드는 장면에 내 목소리를 입히고, <br />AI가 만든 나만의 영화 장면을 가져가세요.</p>
          </div>
        </aside>
        <div className="chart-main">
          <div className="chart-heading">
            {/* 휴대폰 폭에서는 제목 자리에 «내 목소리로 완성하는 10초의 영화.»를 두고 아래 설명 줄은 접는다(10/19 대표님, home.css) */}
            <div><p className="chart-eyebrow">오늘, 내가 출연할 영화</p><h1><b className="chart-title"><em>더빙</em>할 영화 고르기</b> <span>{GENRES.length}</span><b className="chart-title chart-title-phone">내 목소리로 완성하는 <em>10초의 영화.</em></b></h1></div>
            {!SUPPORTS_HOVER && <p>옆으로 넘겨 고르고, 가운데 장면을 누르면 녹음실로 들어가요.</p>}
          </div>

          {/* 준비 상태가 장면 선택을 가로막지 않게 같은 배너에서 진행률만 갱신한다. */}
          <div
            id="enginebar"
            role="status"
            className={`enginebar${engineLoading || engineFailed ? ' show' : ''}${engineFailed ? ' err' : ''}`}
          >
            영상 저장 준비 중… <b id="engineProg">{engineFailed ? '저장할 때 다시 시도할게요' : `${enginePercent}%`}</b>
          </div>

          <SceneCarousel active={active} onSelect={onSelect} />
        </div>
      </div>

      <footer className="cinema-footer">
        <p>제4회 인천어린이청소년영화제<br /><time dateTime="2026-11-14">2026. 11. 14. (토) · CGV 인천</time></p>
      </footer>
    </section>
  );
}
