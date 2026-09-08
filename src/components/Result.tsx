import { useEffect, useRef, useState } from 'react';
import type { Genre } from '../genres';
import { mergeClip } from '../lib/ffmpeg';
import { downloadBlob, uploadToCloud } from '../lib/upload';
import { buildUploadFilename } from '../logic';
import { makeQR } from '../lib/vendor';

export interface SaveJob {
  genre: Genre;
  blob: Blob;
  mime: string;
}

type Stage =
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
  const [stage, setStage] = useState<Stage>({ kind: 'merging' });
  const revokeRef = useRef<(() => void) | null>(null);

  useEffect(() => {
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
      <div className="result-card">
        {loading && (
          <div id="loading">
            <div className="spinner" />
            <h2>{stage.kind === 'merging' ? '영화를 만들고 있어요…' : '저장하고 있어요…'}</h2>
            <p>{stage.kind === 'merging' ? '목소리를 영상에 입히는 중입니다' : '완성된 영화를 전달 중입니다'}</p>
          </div>
        )}

        {(stage.kind === 'cloud' || stage.kind === 'fallback') && (
          <div id="done">
            <h2>🎉 <span className="gold">완성!</span></h2>
            <p id="doneMsg">
              {stage.kind === 'cloud'
                ? '휴대폰 카메라로 QR을 스캔하면 내 영화를 받을 수 있어요'
                : '인터넷 문제로 자동 전달이 안 됐어요 — 아래 버튼으로 이 기기에 저장하고 운영자에게 알려주세요'}
            </p>

            {stage.kind === 'cloud' && (
              <div className="qrbox" id="qrbox">
                <img id="qrImg" src={stage.qr} alt="QR 코드" />
              </div>
            )}

            {stage.kind === 'fallback' && (
              <div className="row" id="downloadRow" style={{ marginTop: 10 }}>
                <button
                  className="btn btn-lg btn-save"
                  id="downloadBtn"
                  onClick={() => {
                    revokeRef.current?.();
                    revokeRef.current = downloadBlob(stage.blob, `잉키보이스시네마_${job.genre.name}.mp4`);
                  }}
                >
                  📥 이 기기에 저장
                </button>
              </div>
            )}

            <div className="savemode" id="savemode">
              {stage.kind === 'cloud'
                ? '클라우드에 저장되었습니다 (이 QR/링크를 아는 사람은 누구나 볼 수 있어요, 11/30까지)'
                : '⚠ 클라우드 업로드 실패 — 이 기기 다운로드 폴더에만 저장됨 (학생에게 전달 후 운영자가 이 파일을 꼭 삭제해 주세요 — 자동삭제 대상 아님)'}
            </div>
            <p className="savemode" style={{ marginTop: 4 }}>
              ⏰ 다운로드는 2026년 11월 30일까지만 가능해요 — 그 이후엔 자동으로 삭제됩니다
            </p>

            <div className="row" style={{ marginTop: 26 }}>
              <button className="btn btn-lg btn-gold" onClick={onHome}>🎬 다른 더빙 하기</button>
            </div>
          </div>
        )}

        {stage.kind === 'error' && (
          <>
            <div className="errbox show">
              <b>영상 합성 중 문제가 생겼어요.</b>
              <br />
              {stage.message}
            </div>
            <div className="row">
              <button className="btn btn-lg btn-ghost" onClick={onBack}>← 돌아가기</button>
            </div>
          </>
        )}
      </div>
    </section>
  );
}
