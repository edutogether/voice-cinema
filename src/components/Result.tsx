import { useEffect, useRef, useState } from 'react';
import { finalClipUrl, stillUrl, stillAvifUrl, type Genre } from '../genres';
import { FestivalHeader } from './FestivalHeader';
import { ActionIcon } from './ActionIcon';
import { mergeClip, processVoice } from '../lib/ffmpeg';
import { downloadBlob, uploadToCloud } from '../lib/upload';
import { buildUploadFilename, isPreviewChannel } from '../logic';
import { makeQR } from '../lib/vendor';
import type { Recording } from '../hooks/useDubbing';

export type RecordingSource = { kind: 'sample' } | ({ kind: 'recording' } & Recording);
export type SaveJob = { genre: Genre } & RecordingSource;

type Stage =
  | { kind: 'sample' }
  | { kind: 'merging' }
  | { kind: 'uploading' }
  | { kind: 'cloud'; qr: string; url: string }
  | { kind: 'fallback'; blob: Blob; offline?: boolean }
  | { kind: 'error'; message: string };

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

export function Result({ active, job, onHome, onBack }: Props) {
  const [stage, setStage] = useState<Stage>({ kind: job.kind === 'sample' ? 'sample' : 'merging' });
  const revokeRef = useRef<(() => void) | null>(null);
  const cardRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (active) cardRef.current?.querySelector('h2')?.focus({ preventScroll: true });
  }, [active, stage.kind]);

  useEffect(() => {
    if (job.kind === 'sample') {
      setStage({ kind: 'sample' });
      return;
    }
    let cancelled = false;
    void (async () => {
      let merged: Blob;
      try {
        merged = await mergeClip(job.genre.id, await voiceFor(job));
      } catch (e) {
        if (!cancelled) {
          setStage({
            kind: 'error',
            message: `${e instanceof Error ? e.message : String(e)} (녹음은 남아 있어요, [돌아가기] 후 다시 저장해 보세요)`,
          });
        }
        return;
      }
      if (cancelled) return;
      // 인터넷이 아예 없으면(와이파이 없이 쓰는 설치판 등) 올리지 않는다 — App Check 대기(20초)를 세 번 «저장하고 있어요»로 보내지 않고
      // 바로 이 기기에 저장으로 간다(10/27 설치판, 오프라인일 때는 정직하게 안내).
      if (!navigator.onLine) {
        setStage({ kind: 'fallback', blob: merged, offline: true });
        return;
      }
      setStage({ kind: 'uploading' });

      try {
        // makePublic()으로 공개되는 파일이라 파일명을 타임스탬프만으로 지으면 좁은
        // 시간대를 순차 대입해 다른 학생의 영상 URL을 추측할 수 있다 — 무작위 토큰을 붙인다.
        const token = Array.from(crypto.getRandomValues(new Uint8Array(6)))
          .map((b) => b.toString(16).padStart(2, '0'))
          .join('');
        const url = await uploadToCloud(merged, buildUploadFilename(job.genre.id, Date.now(), token));
        if (!cancelled) setStage({ kind: 'cloud', qr: makeQR(url), url });
      } catch (e) {
        console.error('[클라우드 저장 실패]', e instanceof Error ? e.message : e);
        if (!cancelled) setStage({ kind: 'fallback', blob: merged });
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [job]);

  // 폴백 다운로드용 blob URL은 화면을 벗어날 때 반드시 회수한다.
  useEffect(() => () => revokeRef.current?.(), []);

  const loading = stage.kind === 'merging' || stage.kind === 'uploading';

  return (
    <section id="result" className={`view${active ? ' active' : ''}`}>
      <FestivalHeader step={3} />
      <div className={`result-card result-${stage.kind}`} ref={cardRef}>
        <div className="result-poster">
          <picture className="pic"><source type="image/avif" srcSet={stillAvifUrl(job.genre.id)} /><img src={stillUrl(job.genre.id)} alt="" /></picture>
          {/* 왼쪽 위 InKY Film Festival, 오른쪽 위 인천광역시교육청 — 내려받는 영상에도 같은 자리에 같은 모양으로 구워져 있다(10/20 대표님, tools/build-video-logos.mjs) */}
          <span className="poster-logo poster-logo-inky" aria-hidden="true"><span className="festival-symbol"><img src="/brands/inky.png" alt="" /></span><span><strong>InKY</strong> Film Festival</span></span>
          <span className="poster-logo poster-logo-education" aria-hidden="true"><img src="/brands/education.png" alt="" width="199" height="52" /></span>
          <div className="poster-credit"><p>{job.kind === 'sample' ? '녹음 화면 샘플 체험' : '내 목소리로 완성하는 영화'}</p><strong>{job.genre.summary}</strong><span>{job.kind === 'sample' ? '다운로드 · 원본 영상' : job.genre.name}</span></div>
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
              <button className="btn btn-lg btn-ghost" id="doneHomeBtn" onClick={onHome}>다른 더빙 하기 <ActionIcon name="arrow" /></button>
            </div>
          </div>
        )}
        {loading && (
          <div id="loading" role="status" aria-busy="true">
            <div className="spinner" aria-hidden="true" />
            <h2 id="loadingTitle" tabIndex={-1}>{stage.kind === 'merging' ? '영화를 만들고 있어요' : '내 영화를 저장하고 있어요'}</h2>
            <p id="loadingSub">{stage.kind === 'merging' ? '목소리를 영상에 입히는 중입니다' : '완성된 영화를 전달 중입니다'}</p>
            <ol className="save-steps" aria-label="저장 진행">
              <li aria-current={stage.kind === 'merging' ? 'step' : undefined}><span>{stage.kind === 'uploading' ? <ActionIcon name="check" /> : '1'}</span> 영상과 목소리 합치기</li>
              <li aria-current={stage.kind === 'uploading' ? 'step' : undefined}><span>2</span> 저장하고 QR 만들기</li>
            </ol>
            <p className="result-wait-note">완료될 때까지 이 화면을 열어두세요.</p>
          </div>
        )}

        {(stage.kind === 'cloud' || stage.kind === 'fallback') && (
          <div id="done">
            <span className={`result-symbol${stage.kind === 'fallback' ? ' warning' : ''}`}><ActionIcon name={stage.kind === 'cloud' ? 'check' : 'download'} /></span>
            <h2 tabIndex={-1}>{stage.kind === 'cloud' ? '세상에 하나뿐인, 내 영화.' : '영화를 이 기기에 저장해 주세요'}</h2>
            <p id="doneMsg">
              {stage.kind === 'cloud'
                ? 'QR을 찍으면 내 영화를 받을 수 있어요'
                : stage.offline
                  ? '인터넷에 연결되어 있지 않아 QR을 만들 수 없어요. 아래 단추를 눌러 이 기기에 저장한 뒤 선생님께 알려 주세요.'
                  : isPreviewChannel(window.location.hostname)
                    ? '미리보기 주소에서는 QR을 만들 수 없어요 — 서버 저장은 실제 주소(voice.edutogether.kr)에서만 돼요. 아래 단추로 이 기기에 저장해 확인해 주세요.'
                    : '인터넷이 잠깐 불안해서 QR을 만들지 못했어요. 아래 단추를 눌러 이 기기에 저장한 뒤 선생님께 알려 주세요.'}
            </p>

            {/* 휴대폰에서 직접 체험하면 자기 화면의 QR을 찍을 수 없다 — 같은 공개 주소를 바로 여는 단추(휴대폰에서만 보임, result.css). 휴대폰 한 화면에 들어오게 QR보다 위에 둔다. 10/17 팀장 임시 진행, 대표님 일요일 확인 */}
            {stage.kind === 'cloud' && (
              <a className="btn btn-lg btn-save open-movie" id="openMovieBtn" href={stage.url} target="_blank" rel="noopener"><ActionIcon name="play" /> 내 영화 열기</a>
            )}
            {stage.kind === 'cloud' && (
              <div className="qrbox" id="qrbox">
                <img id="qrImg" src={stage.qr} alt="내 영화 QR 코드" />
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
              </div>
            )}

            {/* 클라우드 저장 뒤의 공개 범위·11/30 안내 두 줄은 10/20 대표님 지시로 뺐다(개인정보처리방침에 있다). 기기 저장 안내는 남긴다 —
                자동삭제 대상이 아니라 아이 목소리가 부스 기기에 남는다. 문구는 아이·선생님이 읽기 쉽게(10/20), 자세한 절차는 운영자 설명서 5·6장 */}
            {stage.kind === 'fallback' && (
              <div className="savemode" id="savemode">선생님께: 이 기기에 저장된 영화는 자동으로 지워지지 않아요. 학생에게 전달한 뒤 꼭 지워 주세요.</div>
            )}

            <div className="row result-actions">
              {/* «다른 더빙 하기»는 보조 단추(흰 바탕·테두리, 좁게) — 주 단추는 «내 영화 열기»·«이 기기에 저장»이다(10/21 팀장 검수) */}
              <button className="btn btn-lg btn-ghost" id="doneHomeBtn" onClick={onHome}><ActionIcon name="clapperboard" /> 다른 더빙 하기</button>
            </div>
          </div>
        )}

        {stage.kind === 'error' && (
          <>
            <span className="result-symbol warning"><ActionIcon name="warning" /></span>
            <h2 tabIndex={-1}>녹음이 남아 있어요</h2>
            <div className="errbox show" id="errbox">
              <b>영상 합성 중 문제가 생겼어요.</b>
              <br />
              {stage.message}
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
