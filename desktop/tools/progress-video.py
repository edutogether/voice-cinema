"""설치 · 제거 진행 화면 녹화(installer-probe.ps1 -Record)를 화면 그대로 재어, 막대와 안내 상자가 실제로 어떻게 보였는지 적는다(2026-10-28).

    py -3 desktop/tools/progress-video.py <installer-probe 결과 폴더>

재는 것(초당 30장 모두):
  - 막대: 막대 칸 왼쪽 끝부터 이어서 초록으로 찬 폭의 비율. 앞 장보다 줄어든 장(뒤로 감), 막대가 멈춰 있던 가장 긴 시간, 100%가 보인 시간.
    0.5초 넘게 선 구간을 모두 적고(stallsOver05), 그동안 막대 위 문장이 기다림 단계 문장(WAIT_STAGES)뿐이었던 구간은 따로 적는다(waitStageStalls —
    10/28 팀장 판정 기준: «막대가 0.5초 넘게 서 있는 구간 0, 대기 단계 문장이 떠 있는 구간 제외»).
  - 상자: 진행 화면 동안 안내 상자 자리가 비었다가(흰 칸) 다시 차는 장(깜빡임).
  - 창: 앞 장과도 뒤 장과도 크게 다른 한 장(번쩍임 — 화면 전환 사이에 끼인 빈 장 · 반쯤 그린 장). 상자 · 막대 자리는 빼고 잰다 —
    상자는 줄이 늘 때 부드럽게 스크롤해 중간 장이 앞뒤와 달라 보이고(같은 모양 줄이라 한 줄 밀린 장끼리는 같아 보인다), 막대는 미끄러지듯 찬다.
막대 · 상자 자리는 probe가 남긴 trace.jsonl(화면 좌표)로, 녹화 자리는 segments.json(조각마다)으로 찾는다. 진행 화면이 든 조각을 잰다.
필요한 것: Python 3 + numpy, ffmpeg.
"""
import json
import subprocess
import sys
from pathlib import Path

import numpy as np

FPS = 30.0


def frames(video, w, h):
    proc = subprocess.Popen(['ffmpeg', '-v', 'error', '-i', str(video), '-f', 'rawvideo', '-pix_fmt', 'rgb24', '-'], stdout=subprocess.PIPE)
    size = w * h * 3
    while True:
        buf = proc.stdout.read(size)
        if len(buf) < size:
            break
        yield np.frombuffer(buf, np.uint8).reshape(h, w, 3)
    proc.wait()


def measure(video, rect, bar, lst):
    """한 조각을 재어 장마다 (막대 찬 비율, 상자 글자 비율, 앞 장과의 차이)를 돌려준다."""
    bx, by = bar['x'] - rect['x'] + 2, bar['y'] - rect['y'] + 2
    bw, bh = bar['w'] - 4, bar['h'] - 4
    lx, ly = lst['x'] - rect['x'] + 2, lst['y'] - rect['y'] + 2
    lw, lh = lst['w'] - 4, lst['h'] - 4
    fills, ink, diffs, track, prev = [], [], [], [], None
    for f in frames(video, rect['w'], rect['h']):
        strip = f[by + bh // 2, bx:bx + bw].astype(int)
        green = (strip[:, 1] > strip[:, 0] + 40) & (strip[:, 1] > strip[:, 2] + 40)
        # 왼쪽 끝부터 이어진 초록만 막대로 센다(완료 화면 그림 속 초록 점을 막대로 세지 않게)
        run = int(np.argmin(green)) if not green.all() else bw
        fills.append(run / bw)
        # 막대 자리에 막대(초록 + 바탕 (230,230,230))가 보이는 장 — 진행 화면이 실제로 뜬 때를 녹화에서 찾는다. 창 바탕은 (240,240,240)이라 가른다.
        grey = (np.abs(strip[:, 0] - strip[:, 1]) < 6) & (np.abs(strip[:, 1] - strip[:, 2]) < 6) & (strip[:, 0] >= 220) & (strip[:, 0] <= 236)
        track.append(bool((green | grey).mean() > 0.9))
        box = f[ly:ly + lh, lx:lx + lw]
        ink.append(float((box.min(axis=2) < 160).mean()))
        g = f.astype(np.int16).copy()
        g[max(0, ly - 2):ly + lh + 2, max(0, lx - 2):lx + lw + 2] = 0
        g[max(0, by - 2):by + bh + 2, max(0, bx - 2):bx + bw + 2] = 0
        diffs.append(None if prev is None else float(np.abs(g - prev).mean()))
        prev = g
    return np.array(fills), np.array(ink), diffs, bw, track


def record_offset(folder, segment):
    """그 녹화 조각이 녹화 시작 뒤 몇 초에 시작했는지(probe.log «record start <조각> … at <초>s») — 모르면 None"""
    log = folder / 'probe.log'
    if not log.exists():
        return None
    raw = log.read_bytes()
    text = raw.decode('utf-16') if raw[:2] in (b'\xff\xfe', b'\xfe\xff') else raw.decode('utf-8-sig', errors='replace')
    for line in text.splitlines():
        if line.startswith(f'record start {segment} ') and ' at ' in line:
            return float(line.rsplit(' at ', 1)[1].rstrip('s'))
    return None


def page_start_frame(folder, rows, segment):
    """진행 화면에 첫 줄(단계 문장)이 적힌 때를 그 녹화 조각의 장 번호로 — 모르면 None.
    화면이 막 뜬 첫 장은 상자가 비어 있는 것이 맞다 — 그 장을 앞 화면(글이 있는 첫 화면)과 이어 보면 «상자 깜빡임»으로 잘못 센다(10/28 제거 7회차)."""
    first = next((r.get('recT') for r in rows if r.get('recT') is not None and (r.get('list') or {}).get('count', 0) > 0), None)
    offset = record_offset(folder, segment)
    if first is None or offset is None:
        return None
    return int(round((first - offset) * FPS))


# 기다림을 알리는 단계 문장 — 이 문장이 떠 있는 동안 막대가 서 있는 것은 «멈춤»으로 세지 않는다(10/28 팀장 판정 기준)
WAIT_STAGES = ('설치한 파일을 확인하는 중입니다 …', '관리자 허락을 기다리는 중입니다 …')


def status_at(rows, t):
    """그 시각(trace의 recT) 막대 위 단계 문장 — 그 시각보다 앞선 마지막 기록"""
    status = None
    for r in rows:
        if r.get('recT') is None:
            continue
        if r['recT'] > t:
            break
        status = r.get('status')
    return status


def main():
    folder = Path(sys.argv[1])
    rows = [json.loads(line) for line in (folder / 'trace.jsonl').read_text(encoding='utf-8-sig').splitlines() if line.strip()]
    segments = json.loads((folder / 'segments.json').read_text(encoding='utf-8-sig'))
    bar = next(b for r in rows for b in r['bars'] if b['visible'])
    lst = next(r['list'] for r in rows if r.get('list'))
    best = None
    for seg in segments:
        fills, ink, diffs, bw, track = measure(folder / seg['file'], seg, bar, lst)
        if best is None or (fills > 0).sum() > (best[1] > 0).sum():
            best = (seg['file'], fills, ink, diffs, bw, track)
    name, fills, ink_all, diffs, bw, track = best
    shown = np.where(fills > 0)[0]
    start, end = (int(shown[0]), int(shown[-1])) if len(shown) else (0, len(fills) - 1)
    # 진행 화면은 막대가 처음 움직인 때가 아니라 화면이 뜬 때부터 잰다 — 그래야 막대가 0에 머문 채 줄만 흐르는 동안도 «멈춤»으로 잡힌다
    # (10/28: 예전 판을 지우는 3~4초 동안 막대가 0이었는데, 막대가 처음 움직인 때부터 재 놓쳤다). 화면이 뜬 때는 녹화에서 막대(회색 바탕)가 처음
    # 보인 장이다 — trace 시각으로 셈하면 녹화 첫 장이 늦게 오는 만큼 앞 화면(막대 없음)까지 «막대 0»으로 셌다(10/28 제거 07회차: 앞 화면 0.4초).
    page = start
    while page > 0 and track[page - 1]:
        page -= 1
    if not track[page]:
        page = page_start_frame(folder, rows, name)
    if page is not None and 0 <= page < start:
        start = page
    # 장 → trace 시각: 진행 화면이 뜬 장을 trace의 첫 기록(막대가 생긴 때)에 맞춘다
    first_rec = next((r['recT'] for r in rows if r.get('recT') is not None and r.get('bars')), None)
    frame_time = (lambda f: first_rec + (f - start) / FPS) if first_rec is not None else None
    seg = fills[start:end + 1]
    back = [(start + i, round(float(seg[i - 1]), 3), round(float(seg[i]), 3)) for i in range(1, len(seg)) if seg[i] < seg[i - 1] - 1.5 / bw]
    longest, run, at = 0, 0, start
    runs = []   # 막대가 선 구간(장 번호 시작, 길이)
    for i in range(1, len(seg)):
        if abs(seg[i] - seg[i - 1]) < 0.5 / bw and seg[i] < 0.999:
            run += 1
            if run > longest:
                longest, at = run, start + i - run
        else:
            if run:
                runs.append((start + i - run, run))
            run = 0
    if run:
        runs.append((start + len(seg) - run, run))
    # 0.5초 넘게 선 구간 — 그동안 기다림 단계 문장이 떠 있던 장은 빼고, 나머지가 0.5초를 넘으면 «멈춤»이다
    stalls = []
    for a, n in runs:
        if n / FPS <= 0.5:
            continue
        per = [status_at(rows, frame_time(f)) if frame_time else None for f in range(a, a + n + 1)]
        other = sum(1 for s in per if s not in WAIT_STAGES)
        stalls.append({'at': round(a / FPS, 2), 'seconds': round(n / FPS, 2), 'fill': round(float(fills[a]), 3),
                       'status': sorted({s for s in per if s}), 'secondsOutsideWait': round(other / FPS, 2),
                       'waitStage': other / FPS <= 0.5})
    ink = ink_all[start:end + 1]
    # 상자만 비었다 다시 찬 장 — 창의 나머지도 앞 장과 크게 다르면(화면이 바뀌는 첫 장: 새 진행 화면의 상자는 처음에 비어 있다) 깜빡임이 아니다
    blank_flash = [start + i for i in range(1, len(ink) - 1) if ink[i] < 0.002 and ink[i - 1] > 0.002 and ink[i + 1] > 0.002
                   and not (diffs[start + i] and diffs[start + i] > 3)]
    flashes = [i for i in range(1, len(diffs) - 1) if diffs[i] and diffs[i + 1] and diffs[i] > 3 and diffs[i + 1] > 3]
    full_from = next((start + i for i in range(len(seg)) if seg[i] >= 0.995), None)
    out = {
        'segment': name, 'frames': len(fills), 'progressFrames': [start, end], 'progressSeconds': round((end - start + 1) / FPS, 2),
        'barBackStepCount': len(back), 'barBackSteps': back[:20],
        'longestStallSeconds': round(longest / FPS, 2), 'longestStallAt': round(at / FPS, 2), 'longestStallFill': round(float(fills[at]), 3),
        'stallsOver05': [s for s in stalls if not s['waitStage']], 'waitStageStalls': [s for s in stalls if s['waitStage']],
        'fullAtSecond': None if full_from is None else round(full_from / FPS, 2),
        'fullHeldSeconds': None if full_from is None else round((end - full_from + 1) / FPS, 2),
        'listBlankFlashes': blank_flash, 'windowFlashes': flashes,
        'listInkFirstProgressFrame': round(float(ink[0]), 4) if len(ink) else None,
    }
    (folder / 'video-check.json').write_text(json.dumps(out, ensure_ascii=False, indent=1), encoding='utf-8')
    (folder / 'bar-curve.json').write_text(json.dumps([round(float(x), 3) for x in fills[start:end + 1:3]]), encoding='utf-8')
    print(json.dumps(out, ensure_ascii=False))


if __name__ == '__main__':
    main()
