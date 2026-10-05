import { useEffect, useRef, useState } from 'react';
import { clipUrl, stillUrl, type Genre } from '../genres';
import { FestivalHeader } from './FestivalHeader';
import { ActionIcon } from './ActionIcon';
import { mergeClip } from '../lib/ffmpeg';
import { downloadBlob, uploadToCloud } from '../lib/upload';
import { buildUploadFilename } from '../logic';
import { makeQR } from '../lib/vendor';

export type RecordingSource = { kind: 'sample' } | { kind: 'recording'; blob: Blob; mime: string };
export type SaveJob = { genre: Genre } & RecordingSource;

type Stage =
  | { kind: 'sample' }
  | { kind: 'merging' }
  | { kind: 'uploading' }
  | { kind: 'cloud'; qr: string }
  | { kind: 'fallback'; blob: Blob }
  | { kind: 'error'; message: string };

interface Props {
  active: boolean;
  job: SaveJob;
  onHome: () => void;
  onBack: () => void;
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
        merged = await mergeClip(job.genre.id, job.blob, job.mime);
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
      setStage({ kind: 'uploading' });

      try {
        // makePublic()으로 공개되는 파일이라 파일명을 타임스탬프만으로 지으면 좁은
        // 시간대를 순차 대입해 다른 학생의 영상 URL을 추측할 수 있다 — 무작위 토큰을 붙인다.
        const token = Array.from(crypto.getRandomValues(new Uint8Array(6)))
          .map((b) => b.toString(16).padStart(2, '0'))
          .join('');
        const url = await uploadToCloud(merged, buildUploadFilename(job.genre.id, Date.now(), token));
        if (!cancelled) setStage({ kind: 'cloud', qr: makeQR(url) });
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
          <img src={stillUrl(job.genre.id)} alt="" />
          <span className="poster-brand">Voice <span>Cinema</span></span>
          <div className="poster-credit"><p>{job.kind === 'sample' ? '녹음 화면 샘플 체험' : '내 목소리로 완성하는 영화'}</p><strong>{job.genre.name}</strong><span>{job.kind === 'sample' ? '다운로드 · 원본 영상' : '목소리 출연 · 나'}</span></div>
        </div>
        <div className="result-details">
        <p className="result-eyebrow">{stage.kind === 'sample' ? '샘플 체험 완료' : stage.kind === 'cloud' ? '내 영화가 완성됐어요' : loading ? '목소리가 영화가 되는 순간' : stage.kind === 'error' ? '녹음 보관 중' : '내 영화 보관하기'}</p>
        {stage.kind === 'sample' && (
          <div id="done">
            <span className="result-symbol"><ActionIcon name="download" /></span>
            <h2 tabIndex={-1}>원본 영상을 받아보세요</h2>
            <p id="doneMsg">샘플 체험이 완료됐어요. 마이크 녹음 없이 진행했으며, 다운로드 파일은 선택한 장면의 원본 영상입니다.</p>
            <div className="row" id="downloadRow">
              <a className="btn btn-lg btn-save" id="downloadBtn" href={clipUrl(job.genre.id)} download={`Voice Cinema_${job.genre.name}_원본.mp4`}><ActionIcon name="download" /> 원본 영상 다운로드</a>
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
                ? '휴대폰 카메라로 QR을 스캔하면 내 영화를 받을 수 있어요'
                : '인터넷 문제로 자동 전달이 안 됐어요 — 아래 버튼으로 이 기기에 저장하고 운영자에게 알려주세요'}
            </p>

            {stage.kind === 'cloud' && (
              <div className="qrbox" id="qrbox">
                <img id="qrImg" src={stage.qr} alt="QR 코드" />
                <span>내 영화 받기</span>
              </div>
            )}

            {stage.kind === 'fallback' && (
              <div className="row" id="downloadRow">
                <button
                  className="btn btn-lg btn-save"
                  id="downloadBtn"
                  onClick={() => {
                    revokeRef.current?.();
                    revokeRef.current = downloadBlob(stage.blob, `잉키보이스시네마_${job.genre.name}.mp4`);
                  }}
                >
                  <ActionIcon name="download" /> 이 기기에 저장
                </button>
              </div>
            )}

            <div className="savemode" id="savemode">
              {stage.kind === 'cloud'
                ? '클라우드에 저장되었습니다 (이 QR/링크를 아는 사람은 누구나 볼 수 있어요, 11/30까지)'
                : '클라우드 업로드 실패 — 위 버튼을 누르면 이 기기 다운로드 폴더에 저장됩니다. 학생에게 전달 후 운영자가 이 파일을 꼭 삭제해 주세요 — 자동삭제 대상이 아닙니다.'}
            </div>
            {stage.kind === 'cloud' && <p className="savemode retention-note">다운로드는 2026년 11월 30일까지만 가능해요 — 그 이후엔 자동으로 삭제됩니다</p>}

            <div className="row result-actions">
              <button className={`btn btn-lg ${stage.kind === 'cloud' ? 'btn-primary' : 'btn-ghost'}`} id="doneHomeBtn" onClick={onHome}>다른 더빙 하기 <ActionIcon name="arrow" /></button>
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
