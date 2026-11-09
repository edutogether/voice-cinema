import { useEffect, useRef, useState } from 'react';
import { finalClipUrl, stillUrl, stillAvifUrl, type Genre } from '../genres';
import { FestivalHeader } from './FestivalHeader';
import { ActionIcon } from './ActionIcon';
import { MailHandoff } from './MailHandoff';
import { GenerationWait, type SceneEnd } from './GenerationWait';
import { mergeClip, processVoice } from '../lib/ffmpeg';
import { downloadBlob, uploadToCloud } from '../lib/upload';
import { buildUploadFilename, isPreviewChannel } from '../logic';
import { makeQR } from '../lib/vendor';
import { isOnline } from '../lib/mailDelivery';
import { IN_INSTALLER } from '../lib/installer';
import { MAIL_PURGE_AT } from '../config';
import type { Recording } from '../hooks/useDubbing';

export type RecordingSource = { kind: 'sample' } | ({ kind: 'recording' } & Recording);
export type SaveJob = { genre: Genre } & RecordingSource;

type Stage =
  | { kind: 'sample' }
  | { kind: 'merging' }
  | { kind: 'uploading' }
  | { kind: 'cloud'; qr: string; url: string; blob: Blob }
  | { kind: 'fallback'; blob: Blob }
  | { kind: 'mail'; blob: Blob }
  | { kind: 'error' };

interface Props {
  active: boolean;
  job: SaveJob;
  onHome: () => void;
  onBack: () => void;
}

// 녹음실에서 미리 다듬어 둔 목소리를 쓴다 — 아이가 미리 들은 것과 같은 소리다. 없거나 실패했으면 같은 처리를 여기서 한다.
async function voiceFor(recording: Recording): Promise<Blob> {
  if (recording.voice) {
    try {
      return await recording.voice;
    } catch {
      // 아래에서 다시 다듬는다
    }
  }
  return processVoice(recording.take, recording.mime, recording.plan);
}

// 휴대폰(public/fit.js의 data-fit phone · none)만 이 기기에 저장한다 — PC · 패드 · 설치판은 메일 칸(11/8 Bumm님, 팀장 전달).
// 화면을 돌릴 수 있어 올리지 못한 그때 잰다.
const onPhone = () => !IN_INSTALLER && ['phone', 'none'].includes(document.documentElement.dataset.fit ?? '');
const PREVIEW = isPreviewChannel(window.location.hostname);
// «다시 제작하기»가 연결이 없어 올리기를 건너뛸 때도 «다시 만드는 중…»을 이만큼은 보인다 — 누른 것이 받아들여졌다는 표시
const RETRY_MIN_MS = 800;
// 서버의 영화가 남아 있는 마지막 날 — 자동 삭제(2026-12-01 00:00 KST, functions의 CUTOFF_DATE와 같은 MAIL_PURGE_AT)의 전날
const LAST_DAY = new Intl.DateTimeFormat('ko-KR', { timeZone: 'Asia/Seoul', month: 'long', day: 'numeric' }).format(new Date(MAIL_PURGE_AT - 1));
// 아이폰 · 아이팟(데스크톱 사이트로 보이는 아이패드 포함) — «내 폰에 저장하기»는 공유 창(«비디오 저장»)으로 사진 앱에 넣는다
const IOS = /iP(hone|od|ad)/.test(navigator.userAgent) || (navigator.platform === 'MacIntel' && navigator.maxTouchPoints > 1);

/** 완성본을 올리고 공개 주소를 돌려준다. 못 올리면 null(이유는 콘솔에만). */
async function uploadMovie(blob: Blob, genreId: string): Promise<string | null> {
  try {
    // makePublic()으로 공개되는 파일이라 파일명을 타임스탬프만으로 지으면 좁은
    // 시간대를 순차 대입해 다른 학생의 영상 URL을 추측할 수 있다 — 무작위 토큰을 붙인다.
    const token = Array.from(crypto.getRandomValues(new Uint8Array(6)))
      .map((b) => b.toString(16).padStart(2, '0'))
      .join('');
    return await uploadToCloud(blob, buildUploadFilename(genreId, Date.now(), token));
  } catch (e) {
    console.error('[클라우드 저장 실패]', e instanceof Error ? e.message : e);
    return null;
  }
}

export function Result({ active, job, onHome, onBack }: Props) {
  const [stage, setStage] = useState<Stage>({ kind: job.kind === 'sample' ? 'sample' : 'merging' });
  const [retrying, setRetrying] = useState(false);
  const revokeRef = useRef<(() => void) | null>(null);
  const cardRef = useRef<HTMLDivElement>(null);
  // 지금 이 화면이 맡은 작업 — 다시 제작하기가 끝났을 때 그사이 다른 작업으로 바뀌었으면 화면을 건드리지 않는다
  const jobRef = useRef(job);
  jobRef.current = job;
  // 대기 화면이 걸어 두는 «대기 장면 두 편이 끝나고, 재생 중인 대기 영상도 끝날 때까지 기다리기» — 결과(QR · 메일 칸 · 이 기기에 저장 · 오류)는 그 뒤에 보인다(GenerationWait.tsx)
  const sceneEndRef = useRef<SceneEnd | null>(null);

  useEffect(() => {
    if (active) cardRef.current?.querySelector('h2')?.focus({ preventScroll: true });
  }, [active, stage.kind]);

  useEffect(() => {
    setRetrying(false);
    if (job.kind === 'sample') {
      setStage({ kind: 'sample' });
      return;
    }
    let cancelled = false;
    // 대기 화면에서 결과로 넘어갈 때는 대기 영상 두 편을 다 보이고, 그 뒤 재생 중인 편도 끝까지 보인다
    // (11/9 Bumm님 «2개는 로딩영상이 재생되게 해 그게 최소» · «이왕 틀던건 다 고대로 보여주고 결과 보여줘라», 팀장 전달)
    const finish = async (next: Stage) => {
      await sceneEndRef.current?.();
      if (!cancelled) setStage(next);
    };
    void (async () => {
      let merged: Blob;
      try {
        merged = await mergeClip(job.genre.id, await voiceFor(job));
      } catch (e) {
        // 오류 원문(FFmpeg 기록)은 아이 화면에 보이지 않고 개발자 콘솔에만 남긴다
        console.error('[영상 합성 실패]', e instanceof Error ? e.message : e);
        if (!cancelled) await finish({ kind: 'error' });
        return;
      }
      if (cancelled) return;
      // 올리지 못했을 때(네트워크 장애): PC · 패드 · 설치판은 담임교사 메일 칸, 휴대폰은 이 기기에 저장(11/8 Bumm님, 팀장 전달).
      // 미리보기 주소는 서버가 받지 않아(허용 출처 밖) 맡겨 두어도 영영 보내지지 않는다 — 이 기기에 저장으로 간다.
      const cannotUpload = () => finish(PREVIEW || onPhone() ? { kind: 'fallback', blob: merged } : { kind: 'mail', blob: merged });
      // 인터넷이 아예 없으면 올리지 않는다 — App Check 대기(20초)를 세 번 대기 화면으로 보내지 않고
      // 바로 장애 화면으로 간다(10/27 설치판, 오프라인일 때는 정직하게 안내).
      if (!isOnline()) {
        await cannotUpload();
        return;
      }
      setStage({ kind: 'uploading' });
      const url = await uploadMovie(merged, job.genre.id);
      if (cancelled) return;
      if (url) await finish({ kind: 'cloud', qr: makeQR(url), url, blob: merged });
      else await cannotUpload();
    })();
    return () => {
      cancelled = true;
    };
  }, [job]);

  // 폴백 다운로드용 blob URL은 화면을 벗어날 때 반드시 회수한다.
  useEffect(() => () => revokeRef.current?.(), []);

  // «다시 제작하기»: QR 만들기를 다시 해 본다(11/8 Bumm님). 되면 QR 화면, 안 되면 지금 화면 그대로(적던 칸도 그대로).
  // 연결이 없다고 기기가 알리면 올리기는 건너뛴다 — App Check 대기로 오래 붙잡지 않는다.
  const retry = async (blob: Blob) => {
    const forJob = job;
    setRetrying(true);
    const [url] = await Promise.all([
      isOnline() ? uploadMovie(blob, forJob.genre.id) : Promise.resolve(null),
      new Promise((done) => setTimeout(done, RETRY_MIN_MS)),
    ]);
    if (jobRef.current !== forJob) return;
    setRetrying(false);
    if (url) setStage({ kind: 'cloud', qr: makeQR(url), url, blob });
  };

  // 휴대폰 완성 화면(11/9 시안): 포스터를 누르면 그 자리에서 완성 영화를 튼다 — 이 기기에서 만든 파일이라 다시 받지 않는다
  const [movieSrc, setMovieSrc] = useState<string | null>(null);
  const [playingMovie, setPlayingMovie] = useState(false);
  const cloudBlob = stage.kind === 'cloud' && !IN_INSTALLER ? stage.blob : null;
  useEffect(() => {
    setPlayingMovie(false);
    if (!cloudBlob) {
      setMovieSrc(null);
      return;
    }
    const src = URL.createObjectURL(cloudBlob);
    setMovieSrc(src);
    return () => URL.revokeObjectURL(src);
  }, [cloudBlob]);

  // «내 폰에 저장하기»: 아이폰은 공유 창(«비디오 저장»이 사진 앱에 넣는다), 그 밖(안드로이드)은 내려받기.
  // 공유는 누름과 같은 호출에서 불러야 한다(아이폰은 사용자 동작 안에서만 연다) — 그 앞에 await를 두지 않는다.
  const saveToPhone = (blob: Blob) => {
    const name = `Voice Cinema_${job.genre.name}.mp4`;
    const download = () => {
      revokeRef.current?.();
      revokeRef.current = downloadBlob(blob, name);
    };
    if (IOS && typeof navigator.canShare === 'function') {
      const file = new File([blob], name, { type: 'video/mp4' });
      if (navigator.canShare({ files: [file] })) {
        navigator.share({ files: [file] }).catch((e: unknown) => {
          if (e instanceof DOMException && e.name === 'AbortError') return;
          console.error('[공유 실패]', e instanceof Error ? e.message : e);
          download();
        });
        return;
      }
    }
    download();
  };

  const loading = stage.kind === 'merging' || stage.kind === 'uploading';

  return (
    <section id="result" className={`view${active ? ' active' : ''}`}>
      <FestivalHeader step={3} />
      <div className={`result-card result-${stage.kind}`} ref={cardRef}>
        <div className="result-poster">
          <picture className="pic"><source type="image/avif" srcSet={stillAvifUrl(job.genre.id)} /><img src={stillUrl(job.genre.id)} alt="" /></picture>
          {/* 왼쪽 위 InKY Film Festival, 오른쪽 위 인천광역시교육청 — 바탕 없이 로고만(11/8 Bumm님, 교육청 엠블럼은 공식 색 · 글자는 흰색). 내려받는 영상에도 같은 자리에 구워져 있다(흰 띠 위 공식 색, 10/20 대표님, tools/build-video-logos.mjs) */}
          <span className="poster-logo poster-logo-inky" aria-hidden="true"><span className="festival-symbol"><img src="/brands/inky.png" alt="" /></span><span><strong>InKY</strong> Film Festival</span></span>
          <span className="poster-logo poster-logo-education" aria-hidden="true"><img src="/brands/education-on-dark.svg" alt="" width="102" height="27" /></span>
          <div className="poster-credit"><p>{job.kind === 'sample' ? '녹음 화면 샘플 체험' : '내 목소리로 완성하는 영화'}</p><strong>{job.genre.summary}</strong><span>{job.kind === 'sample' ? '다운로드 · 원본 영상' : job.genre.name}</span></div>
          {/* 휴대폰에서만(result.css): 포스터를 누르면 그 자리에서 완성 영화가 흐른다(11/9 시안) */}
          {movieSrc && (playingMovie
            ? <video className="poster-movie" src={movieSrc} autoPlay playsInline controls />
            : <button type="button" className="poster-play" id="posterPlayBtn" aria-label={`완성한 영화 «${job.genre.summary}» 보기`} onClick={() => setPlayingMovie(true)}>
              <span aria-hidden="true"><ActionIcon name="play" /></span>
            </button>)}
        </div>
        <div className="result-details">
        <p className="result-eyebrow">{stage.kind === 'sample' ? '샘플 체험 완료' : stage.kind === 'cloud' ? '내 영화가 완성됐어요' : loading ? '목소리가 영화가 되는 순간' : stage.kind === 'error' ? '녹음 보관 중' : '내 영화 보관하기'}</p>
        {stage.kind === 'sample' && (
          <div id="done">
            <span className="result-symbol"><ActionIcon name="download" /></span>
            <h2 tabIndex={-1}>원본 영상을 받아보세요</h2>
            <p id="doneMsg">샘플 체험이 완료됐어요. 마이크 녹음 없이 진행했으며, 다운로드 파일은 선택한 장면의 원본 영상입니다.</p>
            <div className="row" id="downloadRow">
              <a className="btn btn-lg btn-save" id="downloadBtn" href={finalClipUrl(job.genre.id)} download={`Voice Cinema_${job.genre.name}_원본.mp4`}><ActionIcon name="download" /> 원본 영상 다운로드</a>
            </div>
            <p className="savemode">목소리 합성·클라우드 저장은 실행하지 않습니다.</p>
            <div className="row result-actions">
              <button className="btn btn-lg btn-ghost" id="sampleBackBtn" onClick={onBack}><ActionIcon name="back" /> 녹음 화면으로</button>
              <button className="btn btn-lg btn-save" id="doneHomeBtn" onClick={onHome}><ActionIcon name="clapperboard" /> 다른 더빙하기</button>
            </div>
          </div>
        )}
        {/* 합치고 올리는 동안은 Poster Studio와 같은 대기 화면(흰 전체 화면 · 대기 영상 · 장면 제목 · 영화 상식, 11/9 Bumm님). 이 화면을 떠나 있으면(뒤로 가기) 띄우지 않는다 */}
        {active && loading && <GenerationWait sceneEndRef={sceneEndRef} />}

        {(stage.kind === 'cloud' || stage.kind === 'fallback') && (
          <div id="done">
            <span className={`result-symbol${stage.kind === 'fallback' ? ' warning' : ''}`}><ActionIcon name={stage.kind === 'cloud' ? 'check' : 'download'} /></span>
            <h2 tabIndex={-1}>{stage.kind === 'cloud' ? '세상에 하나뿐인, 내 영화.' : PREVIEW ? '영화를 이 기기에 저장해 주세요' : '네트워크 장애로 QR코드를 만들지 못했어요'}</h2>
            <p id="doneMsg">
              {stage.kind === 'cloud'
                ? <>
                  <span className="for-qr">QR을 찍으면 내 영화를 받을 수 있어요</span>
                  {!IN_INSTALLER && <span className="for-phone">영화를 눌러 보고, 내 폰에 저장해요</span>}
                </>
                : PREVIEW
                  ? '미리보기 주소에서는 QR을 만들 수 없어요 — 서버 저장은 실제 주소(voice.edutogether.kr)에서만 돼요. 아래 단추로 이 기기에 저장해 확인해 주세요.'
                  : '아래 단추를 눌러 이 기기에 저장해 주세요.'}
            </p>

            {/* 휴대폰은 자기 화면의 QR을 찍을 수 없다 — QR 대신 «내 폰에 저장하기»와 보관 기한 한 줄(휴대폰에서만, result.css). 10/17의 «내 영화 열기»는
                포스터를 눌러 그 자리에서 보는 것으로 바꿔 뺐다(11/9 시안). PC · 패드 · 설치판은 QR 그대로 */}
            {stage.kind === 'cloud' && (
              <div className="qrbox" id="qrbox">
                <img id="qrImg" src={stage.qr} alt="내 영화 QR 코드" />
              </div>
            )}
            {stage.kind === 'cloud' && !IN_INSTALLER && (
              <div className="phone-save" id="phoneSaveRow">
                <button className="btn btn-lg btn-save" id="phoneSaveBtn" type="button" onClick={() => saveToPhone(stage.blob)}><ActionIcon name="download" /> 내 폰에 저장하기</button>
                <p className="retention-note" id="retentionNote">이 영화는 {LAST_DAY}까지 보관돼요</p>
              </div>
            )}

            {stage.kind === 'fallback' && (
              <div className="row" id="downloadRow">
                <button
                  className="btn btn-lg btn-save"
                  id="downloadBtn"
                  onClick={() => {
                    revokeRef.current?.();
                    revokeRef.current = downloadBlob(stage.blob, `Voice Cinema_${job.genre.name}.mp4`);
                  }}
                >
                  <ActionIcon name="download" /> 이 기기에 저장
                </button>
                {/* 장애 화면의 «다시 제작하기» — 메일 칸(PC · 패드)과 같은 단추. 미리보기 주소는 늘 막히므로 두지 않는다 */}
                {!PREVIEW && (
                  <button className="btn btn-lg btn-ghost" id="retryBtn" disabled={retrying} onClick={() => { void retry(stage.blob); }}>
                    <ActionIcon name="retry" /> {retrying ? '다시 만드는 중…' : '다시 제작하기'}
                  </button>
                )}
              </div>
            )}

            {/* 클라우드 저장 뒤의 공개 범위·11/30 안내 두 줄은 10/20 대표님 지시로 뺐다(개인정보처리방침에 있다). 기기 저장 안내는 남긴다 —
                자동삭제 대상이 아니라 아이 목소리가 부스 기기에 남는다. 문구는 아이·선생님이 읽기 쉽게(10/20), 자세한 절차는 운영자 설명서 5·6장 */}
            {stage.kind === 'fallback' && (
              <div className="savemode" id="savemode">선생님께: 이 기기에 저장된 영화는 자동으로 지워지지 않아요. 학생에게 전달한 뒤 꼭 지워 주세요.</div>
            )}

            <div className="row result-actions">
              {/* «다른 더빙하기»는 모든 끝 화면에서 빨간 주 단추 — 메일 칸 «다음»과 같은 크기(11/9 Bumm님 «다른 더빙하기 버튼 제대로 다시만들고 빨간걸로», result.css) */}
              <button className="btn btn-lg btn-save" id="doneHomeBtn" onClick={onHome}><ActionIcon name="clapperboard" /> 다른 더빙하기</button>
            </div>
          </div>
        )}

        {stage.kind === 'mail' && (
          <MailHandoff genre={job.genre} blob={stage.blob} retrying={retrying} onRetry={() => { void retry(stage.blob); }} onHome={onHome} />
        )}

        {stage.kind === 'error' && (
          <>
            <span className="result-symbol warning"><ActionIcon name="warning" /></span>
            <h2 tabIndex={-1}>녹음이 남아 있어요</h2>
            <div className="errbox show" id="errbox">
              <b>영화를 만드는 중 문제가 생겼어요.</b>
              <br />
              녹음은 남아 있어요. '돌아가기'를 누른 뒤 다시 저장해 보세요.
            </div>
            <div className="row" id="errRow">
              <button className="btn btn-lg btn-ghost" id="errBackBtn" onClick={onBack}><ActionIcon name="back" /> 돌아가기</button>
            </div>
          </>
        )}
        </div>
      </div>
      <p className="workflow-footer">제4회 인천어린이청소년영화제</p>
    </section>
  );
}
