"""Voice Cinema 설치판의 아이콘(.ico)과 설치 프로그램 그림(.bmp)을 만든다.

    python desktop/tools/make-icons.py                      # desktop/build/에 icon.ico · installerSidebar.bmp · installerHeader.bmp
    python desktop/tools/make-icons.py --text PS --out <폴더>  # Poster Studio — 같은 규격으로 «PS» 아이콘만(설치 화면 그림은 Voice Cinema 것)
    python desktop/tools/make-icons.py --preview <파일.png>    # 크기별 모습(원래 크기 + 확대)
    --source <카메라 원본 PNG> --font-dir <Pretendard woff2 폴더>  # 이 저장소 밖에서 쓸 때

규칙(10/27 대표님): 노란 InKY 카메라 원본(inky-camera-512.png, D:\\Projects\\_shared\\favicons\\와 같은 파일)을 다시 그리거나 색을
바꾸지 않고 그대로 줄여 쓰고, 오른쪽 아래에 작은 검은 이름표와 흰 두 글자만 더한다. Voice Cinema는 VC, Poster Studio는 PS —
두 앱이 같은 이름표 크기 · 위치 · 글자를 쓰도록 크기마다 값을 아래 BADGES 표 하나로 정한다.
작업표시줄 16 · 20 · 24 · 32px에서는 글꼴을 줄이면 «PS»가 «P8»처럼 뭉개져, 그 크기들은 화소 하나하나를 정한 글자(PIXEL_GLYPHS)를 찍는다.
40px 이상은 Pretendard ExtraBold(저장소 fonts/)로 쓴다. 필요한 것: Python 3 + Pillow + fontTools(+ brotli, woff2 풀기).
"""
import argparse
import io
from functools import lru_cache
from pathlib import Path

from fontTools.ttLib import TTFont
from PIL import Image, ImageDraw, ImageFont

HERE = Path(__file__).resolve().parent
REPO = HERE.parent.parent
SOURCE = HERE / 'inky-camera-512.png'
FONT_DIR = REPO / 'fonts'

BADGE_FILL = (18, 18, 18, 255)   # 이름표 — 거의 검정. 노란 카메라 위에서 가장 또렷하다
INK = (255, 255, 255, 255)       # 글자 — 흰색
APP_BG = (17, 21, 16)            # 웹의 --bg(#111510)
INKY_YELLOW = (255, 229, 0)      # 카메라 몸통 색(원본에서 잰 값)

# 크기 → (이름표 너비, 높이, 모서리 반지름, 글자). 이름표는 아이콘 오른쪽 아래 모서리에 붙는다(x = 크기 − 너비, y = 크기 − 높이).
# 글자가 'pixel5' 등이면 PIXEL_GLYPHS의 화소 글자, 숫자면 Pretendard ExtraBold의 대문자 높이(px).
BADGES = {
    16: (12, 7, 1, 'pixel5'),
    20: (14, 9, 2, 'pixel5'),
    24: (16, 11, 2, 'pixel7'),
    32: (20, 13, 3, 'pixel9'),
    40: (24, 16, 3, 10),
    48: (28, 18, 4, 11),
    64: (36, 22, 5, 14),
    128: (56, 35, 8, 20),
    256: (112, 70, 16, 40),
}
GLYPH_GAP = 1  # 화소 글자 사이 간격(px)

PIXEL_GLYPHS = {
    'pixel5': {  # 대문자 5px, 획 1px
        'V': ['X...X', 'X...X', 'X...X', '.X.X.', '..X..'],
        'C': ['.XXX', 'X...', 'X...', 'X...', '.XXX'],
        'P': ['XXX.', 'X..X', 'XXX.', 'X...', 'X...'],
        'S': ['.XXX', 'X...', '.XX.', '...X', 'XXX.'],
    },
    'pixel7': {  # 대문자 7px, 세로획 2px
        'V': ['XX..XX', 'XX..XX', 'XX..XX', 'XX..XX', '.XXXX.', '.XXXX.', '..XX..'],
        'C': ['.XXXX', 'XX...', 'XX...', 'XX...', 'XX...', 'XX...', '.XXXX'],
        'P': ['XXXX.', 'XX.XX', 'XX.XX', 'XXXX.', 'XX...', 'XX...', 'XX...'],
        'S': ['.XXXX', 'XX...', 'XX...', '.XXX.', '...XX', '...XX', 'XXXX.'],
    },
    'pixel9': {  # 대문자 9px, 획 2px
        'V': ['XX...XX', 'XX...XX', 'XX...XX', 'XX...XX', '.XX.XX.', '.XX.XX.', '.XX.XX.', '..XXX..', '...X...'],
        'C': ['.XXXXX', 'XXXXXX', 'XX....', 'XX....', 'XX....', 'XX....', 'XX....', 'XXXXXX', '.XXXXX'],
        'P': ['XXXXX.', 'XXXXXX', 'XX..XX', 'XX..XX', 'XXXXXX', 'XXXXX.', 'XX....', 'XX....', 'XX....'],
        'S': ['.XXXXX', 'XXXXXX', 'XX....', 'XXXXX.', '.XXXXX', '....XX', '....XX', 'XXXXXX', 'XXXXX.'],
    },
}


@lru_cache
def font_bytes(weight):
    """저장소의 Pretendard woff2를 TTF로 푼다(한글 글꼴이라 몇 초 걸려 한 번만)."""
    tt = TTFont(FONT_DIR / f'Pretendard-{weight}.woff2')
    tt.flavor = None
    buf = io.BytesIO()
    tt.save(buf)
    return buf.getvalue()


def load_font(weight, size):
    return ImageFont.truetype(io.BytesIO(font_bytes(weight)), size)


def cap_font(cap):
    # Pretendard 대문자 높이는 글꼴 크기의 0.71배다
    return load_font('ExtraBold', round(cap / 0.71))


def icon(size, text):
    base = Image.open(SOURCE).convert('RGBA')
    im = base.resize((size, size), Image.LANCZOS)
    width, height, radius, glyph = BADGES[size]
    x0, y0 = size - width, size - height
    draw = ImageDraw.Draw(im)
    if radius == 1:
        # 16px — 네 모서리 화소만 비워 둥글게
        draw.rectangle([x0, y0, size - 1, size - 1], fill=BADGE_FILL)
        for cx, cy in ((x0, y0), (size - 1, y0), (x0, size - 1), (size - 1, size - 1)):
            im.putpixel((cx, cy), base.resize((size, size), Image.LANCZOS).getpixel((cx, cy)))
    else:
        draw.rounded_rectangle([x0, y0, size - 1, size - 1], radius=radius, fill=BADGE_FILL)

    if isinstance(glyph, str):
        glyphs = [PIXEL_GLYPHS[glyph][ch] for ch in text]
        rows = len(glyphs[0])
        text_width = sum(len(g[0]) for g in glyphs) + GLYPH_GAP * (len(glyphs) - 1)
        tx, ty = x0 + (width - text_width) // 2, y0 + (height - rows) // 2
        for g in glyphs:
            for yy, row in enumerate(g):
                for xx, cell in enumerate(row):
                    if cell == 'X':
                        im.putpixel((tx + xx, ty + yy), INK)
            tx += len(g[0]) + GLYPH_GAP
    else:
        font = cap_font(glyph)
        box = draw.textbbox((0, 0), text, font=font, anchor='ls')
        tx = x0 + (width - (box[2] - box[0])) / 2 - box[0]
        ty = y0 + (height - box[1]) / 2
        draw.text((round(tx), round(ty)), text, font=font, fill=INK, anchor='ls')
    return im


def write_ico(path, text):
    images = [icon(size, text) for size in sorted(BADGES)]
    # 크기마다 따로 그린 그림을 그대로 담는다(큰 그림을 줄이지 않는다). BMP 형식이 오래된 도구(NSIS 등)와도 맞는다.
    images[-1].save(path, format='ICO', sizes=[(s, s) for s in sorted(BADGES)], append_images=images[:-1], bitmap_format='bmp')


def centered(draw, y, text, font, fill, width):
    box = draw.textbbox((0, 0), text, font=font, anchor='ls')
    draw.text(((width - (box[2] - box[0])) / 2 - box[0], y), text, font=font, fill=fill, anchor='ls')


def write_sidebar(path, text):
    # 설치 · 제거의 첫 화면과 마지막 화면 왼쪽 그림(164×314, 24비트 BMP)
    w, h = 164, 314
    im = Image.new('RGB', (w, h), APP_BG)
    logo = icon(256, text).resize((112, 112), Image.LANCZOS)
    im.paste(logo, ((w - 112) // 2, 44), logo)
    draw = ImageDraw.Draw(im)
    centered(draw, 186, 'Voice Cinema', load_font('ExtraBold', 21), (255, 255, 255), w)
    centered(draw, 210, '나만의 더빙 극장', load_font('SemiBold', 13), INKY_YELLOW, w)
    centered(draw, 292, '제4회 인천어린이청소년영화제', load_font('Medium', 11), (176, 180, 172), w)
    im.save(path, format='BMP')


def write_header(path, text):
    # 설치 중간 화면 위 띠의 그림(150×57, 24비트 BMP) — 흰 띠 위에 아이콘만
    w, h = 150, 57
    im = Image.new('RGB', (w, h), (255, 255, 255))
    logo = icon(48, text)
    im.paste(logo, (w - 48 - 6, (h - 48) // 2), logo)
    im.save(path, format='BMP')


def write_preview(path, text):
    sizes = sorted(BADGES)
    zoom = {s: max(1, 256 // s) for s in sizes}
    width = sum(s * zoom[s] for s in sizes) + 12 * (len(sizes) + 1)
    sheet = Image.new('RGBA', (width, 256 + 24 + 64 + 36), (240, 240, 240, 255))
    x = 12
    for s in sizes:
        im = icon(s, text)
        sheet.alpha_composite(im.resize((s * zoom[s], s * zoom[s]), Image.NEAREST), (x, 12))
        sheet.alpha_composite(im, (x, 256 + 24))
        x += s * zoom[s] + 12
    sheet.save(path)


def main():
    global SOURCE, FONT_DIR
    parser = argparse.ArgumentParser()
    parser.add_argument('--text', default='VC', help='이름표 두 글자 — Voice Cinema는 VC, Poster Studio는 PS')
    parser.add_argument('--out', default=str(HERE.parent / 'build'))
    parser.add_argument('--preview', help='크기별 모습을 PNG 한 장으로')
    parser.add_argument('--source', default=str(SOURCE), help='노란 InKY 카메라 원본(512px PNG)')
    parser.add_argument('--font-dir', default=str(FONT_DIR), help='Pretendard-*.woff2가 있는 폴더')
    args = parser.parse_args()
    SOURCE, FONT_DIR = Path(args.source), Path(args.font_dir)
    out = Path(args.out)
    out.mkdir(parents=True, exist_ok=True)
    write_ico(out / 'icon.ico', args.text)
    if args.text == 'VC':
        # 설치 화면 그림에는 «Voice Cinema» 이름이 들어간다 — 다른 앱 글자로는 만들지 않는다
        write_sidebar(out / 'installerSidebar.bmp', args.text)
        write_header(out / 'installerHeader.bmp', args.text)
    if args.preview:
        write_preview(args.preview, args.text)


if __name__ == '__main__':
    main()
