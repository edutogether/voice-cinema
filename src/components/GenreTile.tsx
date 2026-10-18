import { useEffect, useRef } from 'react';
import { previewUrl, thumbUrl, stillUrl, type Genre } from '../genres';
import { ActionIcon } from './ActionIcon';

// 재생이 멈췄는지 되돌아보는 간격. loop만으로는 실제 기기에서 계속 돈다는 보장이
// 없다 — 절전 모드, 동시 디코드 한도, 백그라운드 전환 등으로 브라우저가 임의로
// 멈추면 카드가 마지막 프레임에 굳는다(2026-09-09 대표가 실제 폰에서 발견).
// 원인을 하나씩 막는 대신 "멈춰 있으면 다시 튼다"로 한 곳에서 처리한다.
const WATCH_MS = 2000;

interface Props {
  genre: Genre;
  sceneNumber: number;
  /** 입체 목록의 주변 카드는 재생·탭 이동 없이 가운데로 고르는 역할이다. */
  previewOnly?: boolean;
  /** 이 카드가 지금 재생돼야 하는지. PC·휴대폰 모두 선택된 가운데 장면만 재생한다. */
  playing: boolean;
  onSelect: (genre: Genre, source?: HTMLElement) => void;
}

export function GenreTile({ genre, sceneNumber, previewOnly = false, playing, onSelect }: Props) {
  const videoRef = useRef<HTMLVideoElement>(null);
  const releaseTimer = useRef<number | undefined>(undefined);
  // 선택 순간 재생한다. 장면 변경·탭 숨김·녹음실 진입 시 이전 요청까지 무효화한다.
  useEffect(() => {
    if (!playing) return;
    const v = videoRef.current;
    if (!v) return;
    let cancelled = false;
    window.clearTimeout(releaseTimer.current);
    // 짧게 왕복하면 마지막 프레임에서 이어 재생한다. 매번 첫 프레임으로 튀지 않는다.
    if (!v.getAttribute('src')) v.src = previewUrl(genre.id);
    // 홈에서는 조작 없이도 시작해야 하므로 음소거한다 — 소리가 있으면 브라우저가 자동재생을 막는다.
    // 원본 소리는 녹음실 미리보기에서 듣는다.
    v.muted = true;
    v.loop = true;
    const start = () => v.play().then(() => {
      if (!cancelled) v.classList.add('playing');
    }).catch(() => {});
    start();
    // loop를 걸어도 실제 기기에서는 브라우저가 임의로 멈출 수 있다. 멈춰 있으면 다시 튼다.
    // 이 효과가 끝나면(장면이 바뀌면) 감시도 함께 끝나므로, 떠난 카드를 되살리지 않는다.
    const watch = window.setInterval(() => {
      if (v.paused && v.isConnected) start();
    }, WATCH_MS);
    return () => {
      cancelled = true;
      window.clearInterval(watch);
      v.pause();
      v.classList.remove('playing');
      // 140ms 페이드 동안 정지한 마지막 프레임을 보존한 뒤 디코더를 해제한다.
      releaseTimer.current = window.setTimeout(() => {
        v.removeAttribute('src');
        v.load();
      }, 160);
    };
  }, [playing, genre.id]);
  useEffect(() => {
    const v = videoRef.current;
    return () => {
      window.clearTimeout(releaseTimer.current);
      v?.pause();
      v?.removeAttribute('src');
      v?.load();
    };
  }, []);

  return (
    <button
      type="button"
      tabIndex={previewOnly ? -1 : 0}
      data-genre={genre.id}
      className="tile"
      aria-label={`${genre.name} 더빙 시작`}
      onClick={event => onSelect(genre, event.currentTarget)}
    >
      <span className="tile-media" aria-hidden="true">
        <span className="tile-visual">
          <img className="thumb" src={thumbUrl(genre.id)} srcSet={`${thumbUrl(genre.id)} 320w, ${stillUrl(genre.id)} 1280w`} sizes="(min-width: 1000px) 33vw, 50vw" alt="" />
          <video className="preview" ref={videoRef} muted playsInline preload="none" />
        </span>
        <span className="tile-number">{String(sceneNumber).padStart(2, '0')}</span>
        {/* 휴대폰 폭에서만 보인다 — 장르 배지와 장면 이름을 그림 오른쪽 아래에 얹고 아래 이름 줄을 접는다(10/19 대표님, home.css) */}
        <span className="tile-tag"><b>{genre.name}</b>{genre.summary}</span>
        <span className="tile-preview-label"><svg viewBox="0 0 24 24" fill="currentColor"><path d="m8 5 11 7-11 7z" /></svg> 미리보기 재생 중</span>
      </span>
      <span className="tile-body">
        <span className="tile-copy">
          <span className="gname">{genre.name}<span className="tile-length">10초</span></span>
          <span className="gsub">{genre.summary}</span>
        </span>
        <span className="tile-enter" aria-hidden="true"><span className="tile-enter-icon"><ActionIcon name="mic" /></span>더빙하기 <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8"><path d="M5 12h14m-6-6 6 6-6 6" /></svg></span>
      </span>
    </button>
  );
}
