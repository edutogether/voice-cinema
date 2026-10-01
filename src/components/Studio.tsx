import { useEffect, useRef, useState } from 'react';
import { studioClipUrl, stillUrl, type Genre } from '../genres';
import { useDubbing } from '../hooks/useDubbing';

import { ActionIcon } from './ActionIcon';
import { ClipTimeline } from './ClipTimeline';
import { StudioEntrance } from './StudioEntrance';
import type { SceneEntrance } from '../lib/sceneEntrance';

interface Props {
  active: boolean;
  genre: Genre;
  onHome: () => void;
  onSave: (blob: Blob, mime: string) => void;
  entrance: SceneEntrance | null;
}

export function Studio({ active, genre, onHome, onSave, entrance }: Props) {
  const videoRef = useRef<HTMLVideoElement>(null);
  const titleRef = useRef<HTMLHeadingElement>(null);
  const replayButtonRef = useRef<HTMLButtonElement>(null);
  const recordButtonRef = useRef<HTMLButtonElement>(null);
  const previousPhaseRef = useRef('idle');
  const [captionTime, setCaptionTime] = useState(0);
  const [captionsEnabled, setCaptionsEnabled] = useState(true);
  const dub = useDubbing(genre.id, videoRef);
  const { phase } = dub;
  const phaseRef = useRef(phase);
  phaseRef.current = phase;
  const recording = phase === 'requesting' || phase === 'countdown' || phase === 'recording';
  const done = phase === 'recorded' || phase === 'replaying';
  // 원본 음성에서 확인된 구간만 표시한다. 참가자가 녹음한 대사의 자막으로 오인하지 않게
  // 다시 듣기·완성본에는 원본 자막을 표시하거나 합성하지 않는다.
  const hasCaptions = genre.id === 'drama';
  const captionVisible = hasCaptions && captionsEnabled && (phase === 'preview' || phase === 'recording') && captionTime >= 2.64 && captionTime < 4.64;

  useEffect(() => {
    if (active) titleRef.current?.focus({ preventScroll: true });
  }, [active]);
  useEffect(() => {
    if (active && phase === 'recorded') replayButtonRef.current?.focus({ preventScroll: true });
    if (active && phase === 'idle' && previousPhaseRef.current !== 'idle') recordButtonRef.current?.focus({ preventScroll: true });
    previousPhaseRef.current = phase;
  }, [active, phase]);

  // 클립을 바꿀 때마다 로드한다. src를 리액트 속성으로 두면 되지만, 장르를 바꿔도
  // 브라우저가 이전 디코드 상태를 들고 있는 경우가 있어 명시적으로 load()를 부른다.
  useEffect(() => {
    const v = videoRef.current;
    if (!v) return;
    // 확대가 끝나면 같은 순간의 720p 프레임을 보여준다. 작은 메인 캡처를 계속 늘려 두지 않는다.
    const showEntryFrame = () => {
      if (entrance?.time !== null && entrance?.time !== undefined && phaseRef.current === 'idle') {
        v.currentTime = Math.max(.001, Math.min(entrance.time, v.duration - .001));
      }
    };
    v.addEventListener('loadedmetadata', showEntryFrame, { once: true });
    v.src = studioClipUrl(genre.id);
    v.muted = true;
    v.currentTime = 0;
    v.load();
    return () => v.removeEventListener('loadedmetadata', showEntryFrame);
  }, [genre.id, entrance]);

  return (
    <section id="studio" className={`view${active ? ' active' : ''}`}>
      <div className="studio-workspace">
        <div className="studio-screen">
          <div className="stage">
            <div className="studio-heading">
              <button className="back" id="studioBackBtn" onClick={onHome}><ActionIcon name="back" /> 장면 바꾸기</button>
              <div className="studio-scene-title">
                <span className="studio-scene-label"><span id="chipName">{genre.name}</span> · 목소리 녹음</span>
                <h1 ref={titleRef} tabIndex={-1}>{genre.summary}</h1>
              </div>
              <span className="studio-brand">Voice <em>Cinema</em></span>
            </div>
            <div className="studio-video-frame">
            <video id="clip" ref={videoRef} poster={entrance?.time != null ? entrance.image : stillUrl(genre.id)} playsInline muted preload="auto" onTimeUpdate={event => setCaptionTime(event.currentTarget.currentTime)} onSeeking={event => setCaptionTime(event.currentTarget.currentTime)} />
            {hasCaptions && !done && <button className="studio-caption-toggle" aria-pressed={captionsEnabled} aria-label="원본 자막" onClick={() => setCaptionsEnabled(value => !value)}>자막 {captionsEnabled ? '켜짐' : '꺼짐'}</button>}
            {captionVisible && <div className="studio-captions"><span lang="en">I wanted to tell you the truth.</span><strong>너에게 진실을 말하고 싶었어.</strong></div>}
            {phase === 'recording' && <div className="recpill show" id="recpill"><span className="d" /> 녹음 중</div>}
            {dub.countdown > 0 && <div className="overlay show" id="overlay"><div className="count" id="count" key={dub.countdown} aria-label={`${dub.countdown}초 뒤 녹음 시작`}>{dub.countdown}<span>곧 내 목소리가 시작돼요</span></div></div>}
            </div>
            <div className="studio-player-dock">
              <div className="studio-timeline">
                <span className="timeline-state">{phase === 'recorded' ? '녹음 완료' : phase === 'requesting' ? '마이크 연결 중' : phase === 'countdown' ? '녹음 준비' : phase === 'recording' ? '녹음 중' : phase === 'replaying' ? '내 목소리 다시 듣기' : '장면 미리보기'}</span>
                <ClipTimeline phase={phase} videoRef={videoRef} />
              </div>
              <div className={`controls${recording ? ' is-recording' : ''}${done ? ' is-recorded' : ''}`}>
                <div className="controls-copy">
                  <h2>{done ? '내 목소리, 마음에 드나요 ?' : phase === 'requesting' ? '마이크를 연결하고 있어요' : phase === 'countdown' ? '잠시 후, 내 목소리로' : phase === 'recording' ? '지금, 나만의 대사를 들려주세요' : '준비됐나요 ?'}</h2>
                  <div className="hint" id="hint" role="status">{dub.hint}</div>
                </div>
                {!done && <div className="record-actions">
                  {!recording && <button className="btn btn-ghost" id="previewBtn" onClick={dub.togglePreview}><ActionIcon name={phase === 'preview' ? 'stop' : 'play'} />{phase === 'preview' ? '미리보기 정지' : '미리 보기'}</button>}
                  <button className="btn btn-rec" id="recBtn" ref={recordButtonRef} disabled={recording} onClick={dub.startRecord}><span className="record-dot" aria-hidden="true" /><span>{phase === 'requesting' ? '마이크 연결 중' : phase === 'countdown' ? '녹음 준비 중' : phase === 'recording' ? '녹음 중' : '녹음 시작'}</span></button>
                </div>}
                {done && <div className="row" id="afterRow">
                  <button className="btn btn-ghost" id="replayBtn" ref={replayButtonRef} onClick={dub.replay}><ActionIcon name="play" /> 다시 듣기</button>
                  <button className="btn btn-ghost" id="resetBtn" onClick={dub.reset}><ActionIcon name="retry" /> 다시 녹음</button>
                  <button className="btn btn-save" id="saveBtn" onClick={() => dub.recordedBlob && onSave(dub.recordedBlob, dub.recordedMime)}>저장하기 <ActionIcon name="arrow" /></button>
                </div>}
              </div>
            </div>
          </div>
        </div>
      </div>
      {active && entrance && <StudioEntrance entry={entrance} />}
    </section>
  );
}
