import { useEffect, useRef, useState } from 'react';
import { studioClipUrl, stillUrl, type Genre } from '../genres';
import { useDubbing } from '../hooks/useDubbing';

import { ActionIcon } from './ActionIcon';
import { ClipTimeline } from './ClipTimeline';
import { StudioEntrance } from './StudioEntrance';
import type { SceneEntrance } from '../lib/sceneEntrance';
import type { RecordingSource } from './Result';

interface Props {
  active: boolean;
  genre: Genre;
  onHome: () => void;
  onSave: (recording: RecordingSource) => void;
  sampleMode: boolean;
  entrance: SceneEntrance | null;
}

export function Studio({ active, genre, onHome, onSave, entrance, sampleMode }: Props) {
  const videoRef = useRef<HTMLVideoElement>(null);
  const scrubCanvasRef = useRef<HTMLCanvasElement>(null);
  const [previewPaused, setPreviewPaused] = useState(true);
  const [previewEnded, setPreviewEnded] = useState(false);
  const [buffering, setBuffering] = useState(false);
  const titleRef = useRef<HTMLHeadingElement>(null);
  const replayButtonRef = useRef<HTMLButtonElement>(null);
  const recordButtonRef = useRef<HTMLButtonElement>(null);
  const previousPhaseRef = useRef('idle');
  const [captionTime, setCaptionTime] = useState(0);
  const [captionsEnabled, setCaptionsEnabled] = useState(true);
  const dub = useDubbing(genre.id, videoRef, sampleMode);
  const { phase } = dub;
  const recording = phase === 'requesting' || phase === 'countdown' || phase === 'recording';
  const done = phase === 'recorded' || phase === 'replaying';
  const sampleTimelineLabel = sampleMode ? ({ recorded: '샘플 체험 완료', recording: '샘플 녹음 진행 중', replaying: '원본 소리 다시 듣기', countdown: '샘플 체험 준비' } as Partial<Record<typeof phase, string>>)[phase] : undefined;
  const canTogglePlayback = phase === 'idle' || phase === 'ready' || phase === 'preview';
  const showPausedScreen = canTogglePlayback && previewPaused;
  const playbackLabel = phase !== 'preview' ? '미리보기 재생' : previewEnded ? '미리보기 다시 재생' : previewPaused ? '미리보기 계속 재생' : '미리보기 일시정지';
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
    // 진입은 첫 장면에서 대기한다. 재생·녹음은 사용자가 누를 때만 시작한다.
    v.src = studioClipUrl(genre.id);
    v.load();
    v.pause();
    v.currentTime = 0;
    v.muted = true;
  }, [genre.id]);

  return (
    <section id="studio" className={`view${active ? ' active' : ''}`}>
      <div className="studio-workspace">
        <div className="studio-screen">
          <div className="stage">
            <div className="studio-heading">
              <button className="back" id="studioBackBtn" onClick={onHome}><ActionIcon name="back" /> 장면 바꾸기</button>
              <div className="studio-scene-title">
                <span className="studio-scene-label"><span id="chipName">{genre.name}</span> · {sampleMode ? '녹음 샘플 체험' : '목소리 녹음'}</span>
                <h1 ref={titleRef} tabIndex={-1}>{genre.summary}</h1>
              </div>
              <span className="studio-brand"><img src="/icons/studio-microphone.png" width="34" height="34" alt="" /><span>Voice <em>Cinema</em></span></span>
            </div>
            <div className={`studio-video-frame${showPausedScreen ? ' is-paused' : ''}`}>
            <video id="clip" ref={videoRef} poster={stillUrl(genre.id)} playsInline muted preload="auto" onPlay={() => { setPreviewPaused(false); setPreviewEnded(false); }} onEnded={() => { setPreviewEnded(true); setPreviewPaused(true); }} onWaiting={() => setBuffering(true)} onPlaying={() => setBuffering(false)} onError={() => setBuffering(false)} onPause={() => setPreviewPaused(true)} onTimeUpdate={event => setCaptionTime(event.currentTarget.currentTime)} onSeeking={event => setCaptionTime(event.currentTarget.currentTime)} />
            <canvas className="studio-scrub-frame" ref={scrubCanvasRef} hidden aria-hidden="true" />
            <div className="studio-pause-shade" aria-hidden="true" />
            <div className="studio-pause-title" aria-hidden="true">
              <small>{previewEnded ? '미리보기 완료' : phase === 'preview' ? '일시정지' : '장면 미리보기'}</small>
              <strong>{genre.summary}</strong>
              <p>{genre.name}<span>10초</span></p>
            </div>
            {canTogglePlayback && <button type="button" className="studio-screen-playback" id="screenPlaybackBtn"
              aria-label={playbackLabel}
              onClick={dub.togglePreview}>
              {previewPaused && <span aria-hidden="true"><ActionIcon name="play" /></span>}
            </button>}
            {phase === 'preview' && !previewPaused && buffering && <div className="studio-buffering" role="status">영상을 불러오고 있어요</div>}
            {hasCaptions && !done && <button className="studio-caption-toggle" aria-pressed={captionsEnabled} aria-label="원본 자막" onClick={() => setCaptionsEnabled(value => !value)}>자막 {captionsEnabled ? '켜짐' : '꺼짐'}</button>}
            {captionVisible && <div className="studio-captions"><span lang="en">I wanted to tell you the truth.</span><strong>너에게 진실을 말하고 싶었어.</strong></div>}
            {phase === 'recording' && <div className="recpill show" id="recpill"><span className="d" /> {sampleMode ? '샘플 녹음 진행 중' : '녹음 중'}</div>}
            {dub.countdown > 0 && <div className="overlay show" id="overlay"><div className="count" id="count" key={dub.countdown} aria-label={`${dub.countdown}초 뒤 녹음 시작`}>{dub.countdown}<span>{sampleMode ? '곧 샘플 체험이 시작돼요' : '곧 내 목소리가 시작돼요'}</span></div></div>}
            </div>
            <div className="studio-player-dock">
              <div className="studio-timeline">
                <span className="timeline-state">{sampleTimelineLabel ?? (phase === 'recorded' ? '녹음 완료' : phase === 'requesting' ? '마이크 연결 중' : phase === 'countdown' ? '녹음 준비' : phase === 'recording' ? '녹음 중' : phase === 'replaying' ? '내 목소리 다시 듣기' : '장면 미리보기')}</span>
                <ClipTimeline phase={phase} videoRef={videoRef} scrubCanvasRef={scrubCanvasRef} />
              </div>
              <div className={`controls${recording ? ' is-recording' : ''}${done ? ' is-recorded' : ''}`}>
                <div className="controls-copy">
                  <h2>{sampleMode && done ? '샘플 체험을 마쳤어요' : sampleMode && phase === 'recording' ? '10초 동안 녹음 화면을 체험해 보세요' : sampleMode && phase === 'countdown' ? '잠시 후, 샘플 체험 시작' : done ? '내 목소리, 마음에 드나요 ?' : phase === 'requesting' ? '마이크를 연결하고 있어요' : phase === 'countdown' ? '잠시 후, 내 목소리로' : phase === 'recording' ? '지금, 나만의 대사를 들려주세요' : '준비됐나요 ?'}</h2>
                  <div className="hint" id="hint" role="status" data-mic-error={dub.micError ?? undefined}>{dub.hint}</div>
                </div>
                {!done && <div className="record-actions">
                  {!recording && <button className="btn btn-ghost" id="previewBtn" onClick={dub.togglePreview}><ActionIcon name={phase === 'preview' && !previewPaused ? 'pause' : 'play'} />{phase !== 'preview' ? '미리 보기' : previewEnded ? '다시 재생' : previewPaused ? '계속 재생' : '일시정지'}</button>}
                  <button className="btn btn-rec" id="recBtn" ref={recordButtonRef} disabled={recording} onClick={dub.startRecord}><span className="record-dot" aria-hidden="true" /><span>{phase === 'requesting' ? '마이크 연결 중' : phase === 'countdown' ? '녹음 준비 중' : phase === 'recording' ? '녹음 중' : '녹음 시작'}</span></button>
                </div>}
                {done && <div className="row" id="afterRow">
                  <button className="btn btn-ghost" id="replayBtn" ref={replayButtonRef} onClick={dub.replay}><ActionIcon name="play" /> 다시 듣기</button>
                  <button className="btn btn-ghost" id="resetBtn" onClick={dub.reset}><ActionIcon name="retry" /> 다시 녹음</button>
                  <button className="btn btn-save" id="saveBtn" onClick={() => { if (sampleMode) onSave({ kind: 'sample' }); else if (dub.recordedBlob) onSave({ kind: 'recording', blob: dub.recordedBlob, mime: dub.recordedMime }); }}>{sampleMode ? '다운로드' : '저장하기'} <ActionIcon name="arrow" /></button>
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
