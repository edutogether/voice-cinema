# «후회하게 해 주마 !» 목소리 토막만 늦춘다 — 나머지 소리는 그대로.
#   목소리 토막 V = [7.24, 8.15)초 (7.27초에 말이 시작해 8.14초에 끝난다, 앞뒤는 조용한 틈)
#   V를 D초 뒤로 옮긴다. 그 앞 배경음 [6.84, 7.24)(0.40초, 목소리 없음)를 0.40+D초로 늘여(ffmpeg atempo — 같은 소리를 되풀이하지 않고 늘인다)
#   [6.84, 7.24+D)를 채운다 — 배경음 → 숨 고르는 틈 → 목소리의 순서가 그대로다. 이음매 두 곳은 10ms 겹쳐 잇는다.
#   옮긴 V의 끝이 원래 [8.15, 8.15+D) 자리(조용한 틈 + 8.28초부터 효과음 시작)와 겹치는 곳은 둘을 더한다 — 효과음을 지우지 않는다.
# py shift.py <입력 wav> <출력 wav> <D 초>   (cwd = 이 폴더 — 중간 파일 bed-in.wav · bed-out.wav)
import subprocess, sys, wave
import numpy as np

src_p, dst_p, D = sys.argv[1], sys.argv[2], float(sys.argv[3])


def read(p):
    with wave.open(p, 'rb') as w:
        assert w.getframerate() == 48000 and w.getnchannels() == 2 and w.getsampwidth() == 2
        return np.frombuffer(w.readframes(w.getnframes()), dtype=np.int16).reshape(-1, 2).astype(np.float64)


def write(p, a):
    with wave.open(p, 'wb') as w:
        w.setnchannels(2); w.setsampwidth(2); w.setframerate(48000)
        w.writeframes(np.round(a).astype(np.int16).tobytes())


sr = 48000
s = lambda t: int(round(t * sr))
x = read(src_p)
G, A, B, d = s(6.84), s(7.24), s(8.15), s(D)
fade = s(0.01)

write('bed-in.wav', x[G:A])
tempo = (A - G) / (A - G + d)
subprocess.run(['ffmpeg', '-y', '-v', 'error', '-i', 'bed-in.wav', '-af', f'atempo={tempo:.6f}', '-c:a', 'pcm_s16le', 'bed-out.wav'], check=True)
bed = read('bed-out.wav')
need = A - G + d
bed = bed[:need] if len(bed) >= need else np.concatenate([bed, np.repeat(bed[-1:], need - len(bed), axis=0)])

y = x.copy()
up, down = np.linspace(0, 1, fade)[:, None], np.linspace(1, 0, fade)[:, None]
# 앞 이음매: 원래 소리 → 늘인 배경음
seg = bed.copy()
seg[:fade] = x[G:G + fade] * down + bed[:fade] * up
y[G:G + need] = seg
# 옮긴 V — 첫 10ms는 늘인 배경음 끝과 겹쳐 잇고, 끝 10ms는 줄여 원래 소리로 넘긴다(그 자리는 −56dB)
V = x[A:B].copy()
V[:fade] = bed[-fade:] * down + V[:fade] * up
V[-fade:] *= down
y[A + d:B + d] = V
y[B:B + d] += x[B:B + d]  # 원래 [8.15, 8.15+D) 소리(효과음 시작)를 다시 더한다

peak = np.abs(y).max()
assert peak <= 32767, f'넘침 {peak}'
write(dst_p, y)
diff = np.nonzero(np.any(y != x, axis=1))[0]
print(f'atempo {tempo:.6f} · 바뀐 곳 {diff[0] / sr:.4f} ~ {(diff[-1] + 1) / sr:.4f}초 · 최고 {20 * np.log10(peak / 32768):.1f}dBFS')
