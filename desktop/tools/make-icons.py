"""Voice Cinema 설치판의 아이콘(.ico)과 설치 · 제거 화면 그림(.bmp)을 만든다.

    py -3 desktop/tools/make-icons.py                    # desktop/build/에 icon.ico · installer-art/ · installerHeader.bmp · installerSidebar.bmp
    py -3 desktop/tools/make-icons.py --preview <폴더>   # 크기별 아이콘과 배율별 설치 화면 그림을 PNG로도 남긴다

아이콘(10/27 Bumm님 «보이스 시네마도 원래 마이크 있잖아 그걸로 하자», 팀장 전달): 웹이 쓰는 마이크 그림 public/icons/studio-microphone.png
(160×160)를 다시 그리거나 고치지 않는다. 크기마다 원본에서 다시 표본을 뜬다(Lanczos, 알파를 곱한 값으로 — 투명한 가장자리에 검은 테가 끼지
않게). 16~128은 줄이고, 원본보다 큰 256만 같은 보간으로 키운다. 글자 · 이름표는 넣지 않는다.

설치 화면 그림(10/28 Bumm님 «Poster Studio 설치판과 똑같이», 팀장 전달) — 글자는 넣지 않는다:
  - 왼쪽 그림(설치 · 제거의 첫 화면과 완료 화면, 넷 다 같은 그림): Voice Cinema 대표 그림 public/og.jpg(포털 카드 · 공유 카드와 같은 그림)를
    마이크가 가운데 오게 세로로 잘라 쓴다.
  - 머리 로고(설치 · 제거의 가운데 화면 오른쪽 위): 흰 바탕 오른쪽에 마이크.
그림 칸 크기는 한글 Windows 글꼴과 화면 배율로 정해진다 — 100%에서 머리 로고 175×53, 왼쪽 그림 191×290(desktop/tools/installer-probe.ps1로 잼).
electron-builder가 넣는 그림 한 장은 칸에 맞게 비율 없이 늘어나므로, 배율 100~300%마다 칸 크기 그대로 그려 두고 설치기가 칸 폭을 재서
가장 가까운 판을 고른다(desktop/build/installer.nsh). 필요한 것: Python 3 + Pillow.
"""
import argparse
import io
import struct
from pathlib import Path

from PIL import Image

HERE = Path(__file__).resolve().parent
REPO = HERE.parent.parent
MIC = REPO / 'public' / 'icons' / 'studio-microphone.png'
COVER = REPO / 'public' / 'og.jpg'
OUT = HERE.parent / 'build'

ICON_SIZES = [16, 20, 24, 32, 40, 48, 64, 128, 256]
SCALES = [100, 125, 150, 175, 200, 225, 250, 300]
HEADER = (175, 53)
SIDEBAR = (191, 290)
COVER_MIC_X = 386  # og.jpg(1200×630)에서 마이크 머리 가운데의 가로 위치 — 잘라 낸 그림의 가운데가 여기 온다


def resample(im, size):
    """RGBA 그림을 size(가로, 세로)로 Lanczos 보간 — 알파를 곱한 값(RGBa)으로 계산해 투명한 곳의 색이 가장자리로 번지지 않게."""
    return im.convert('RGBa').resize(size, Image.LANCZOS).convert('RGBA')


def mic(size):
    return resample(Image.open(MIC).convert('RGBA'), (size, size))


def dib(im):
    """ICO 안의 32비트 BGRA 비트맵 항목(BITMAPINFOHEADER + 아래에서 위로 쌓은 화소 + 모두 0인 AND 마스크 = 알파를 따른다).
    작은 크기는 PNG보다 오래된 프로그램(설치기 NSIS 포함)이 확실히 읽는다. 256만 PNG로 넣는다(Windows 규약)."""
    s = im.width
    header = struct.pack('<IiiHHIIiiII', 40, s, s * 2, 1, 32, 0, s * s * 4, 0, 0, 0, 0)
    r, g, b, a = im.split()
    rows = Image.merge('RGBA', (b, g, r, a)).tobytes()
    pixels = b''.join(rows[(s - 1 - y) * s * 4:(s - y) * s * 4] for y in range(s))
    mask = bytes(((s + 31) // 32) * 4 * s)
    return header + pixels + mask


def write_ico(path, icons):
    entries = []
    for im in icons:
        if im.width >= 256:
            buf = io.BytesIO()
            im.save(buf, format='PNG')
            entries.append(buf.getvalue())
        else:
            entries.append(dib(im))
    head = struct.pack('<HHH', 0, 1, len(icons))
    offset = 6 + 16 * len(icons)
    for im, data in zip(icons, entries):
        side = 0 if im.width >= 256 else im.width
        head += struct.pack('<BBBBHHII', side, side, 0, 0, 1, 32, len(data), offset)
        offset += len(data)
    path.write_bytes(head + b''.join(entries))


def at(base, pct):
    return round(base[0] * pct / 100), round(base[1] * pct / 100)


def header(w, h):
    # 흰 바탕 오른쪽에 마이크(원본 정사각 그대로 — 원본의 투명 여백까지). 위아래 4px · 오른쪽 8px 여백(100% 기준)
    s = h / HEADER[1]
    im = Image.new('RGBA', (w, h), (255, 255, 255, 255))
    margin = round(4 * s)
    side = h - 2 * margin
    im.alpha_composite(mic(side), (w - side - round(8 * s), margin))
    return im.convert('RGB')


def sidebar(w, h):
    # og.jpg 높이를 그대로 쓰고, 칸 비율에 맞는 너비를 마이크가 가운데 오게 잘라 낸 뒤 칸 크기로 맞춘다
    cover = Image.open(COVER).convert('RGB')
    crop_w = round(cover.height * w / h)
    x0 = min(max(COVER_MIC_X - crop_w // 2, 0), cover.width - crop_w)
    return cover.crop((x0, 0, x0 + crop_w, cover.height)).resize((w, h), Image.LANCZOS)


def main():
    parser = argparse.ArgumentParser()
    parser.add_argument('--out', default=str(OUT))
    parser.add_argument('--preview', help='크기별 아이콘 · 배율별 그림을 PNG로 남길 폴더')
    args = parser.parse_args()
    out = Path(args.out)
    art = out / 'installer-art'
    art.mkdir(parents=True, exist_ok=True)

    icons = [mic(s) for s in ICON_SIZES]
    write_ico(out / 'icon.ico', icons)
    headers = {pct: header(*at(HEADER, pct)) for pct in SCALES}
    sidebars = {pct: sidebar(*at(SIDEBAR, pct)) for pct in SCALES}
    for pct in SCALES:
        headers[pct].save(art / f'header-{pct}.bmp', format='BMP')
        sidebars[pct].save(art / f'sidebar-{pct}.bmp', format='BMP')
    # electron-builder 설정의 기본 그림(설치기에 늘 들어가는 것)은 100% 판이다. 설치기는 칸에 맞는 판으로 바꿔 끼운다.
    headers[100].save(out / 'installerHeader.bmp', format='BMP')
    sidebars[100].save(out / 'installerSidebar.bmp', format='BMP')
    print('만듦:', out / 'icon.ico', '(' + ' · '.join(map(str, ICON_SIZES)) + ')', '· installer-art/header · sidebar(' + ' · '.join(map(str, SCALES)) + '%)')

    if args.preview:
        pre = Path(args.preview)
        pre.mkdir(parents=True, exist_ok=True)
        for im in icons:
            im.save(pre / f'icon-{im.width}.png')
        for pct in SCALES:
            headers[pct].save(pre / f'header-{pct}.png')
            sidebars[pct].save(pre / f'sidebar-{pct}.png')


if __name__ == '__main__':
    main()
