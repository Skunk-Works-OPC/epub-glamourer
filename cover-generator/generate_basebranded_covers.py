#!/usr/bin/env python3

from __future__ import annotations

from dataclasses import dataclass
from pathlib import Path
from typing import Optional

from PIL import Image, ImageDraw, ImageEnhance, ImageFilter, ImageFont, ImageOps


ROOT = Path(__file__).resolve().parent
BOOKS_DIR = ROOT / "gutenberg_html_books"
BRAND_DIR = ROOT / "brand"
OUTPUT_NAME = "proposed-cover.jpg"

CANVAS_W = 1600
CANVAS_H = 2560

NAVY = "#16384B"
CREAM = "#F3E8D1"
GOLD = "#B89556"
INK = "#153246"
WHITE = "#FDF9F0"
GREEN = "#69C85A"

TITLE_FONT = "/System/Library/Fonts/Supplemental/Georgia Bold.ttf"
BODY_FONT = "/System/Library/Fonts/Supplemental/Georgia.ttf"

SOURCE_OVERRIDES = {
    "20916-the-arabian-nights-their-best-known-tales-by-wiggin-smith-and-parrish": "images/illus01.jpg",
}

NO_ART_FOLDERS = {
    "1874-the-railway-children-by-e-nesbit",
    "20265-anne-of-the-island-by-l-m-montgomery",
    "25545-children-s-literature-by-charles-madison-curry-and-erle-elsworth-clippinger",
}

THEME_COLORS = {
    "1874-the-railway-children-by-e-nesbit": ("#F5E8D0", "#5A6B53"),
    "20265-anne-of-the-island-by-l-m-montgomery": ("#F7E4DB", "#5B7F6C"),
    "25545-children-s-literature-by-charles-madison-curry-and-erle-elsworth-clippinger": ("#EFE2C6", "#6A4A3C"),
}


@dataclass
class BookMeta:
    folder: Path
    title: str
    author: str
    source_image: Optional[Path]


def find_book_dirs() -> list[Path]:
    return sorted(path for path in BOOKS_DIR.iterdir() if path.is_dir())


def split_title_author(raw: str) -> tuple[str, str]:
    if " by " in raw:
        title, author = raw.rsplit(" by ", 1)
        return title.strip(), author.strip()
    return raw.strip(), ""


def image_area(path: Path) -> int:
    try:
        with Image.open(path) as img:
            return img.width * img.height
    except Exception:
        return 0


def find_source_image(folder: Path) -> Optional[Path]:
    preferred = [
        folder / "generated-cover-art.png",
        folder / "generated-cover-art.jpg",
        folder / "original-cover.png",
        folder / "images" / "cover.jpg",
        folder / "images" / "imgcover.jpg",
        folder / "original-cover.jpg",
    ]
    for candidate in preferred:
        if candidate.exists():
            return candidate

    if folder.name in NO_ART_FOLDERS:
        return None

    override = SOURCE_OVERRIDES.get(folder.name)
    if override:
        return folder / override

    image_files = sorted(
        p
        for p in folder.rglob("*")
        if p.suffix.lower() in {".jpg", ".jpeg", ".png"} and p.name != OUTPUT_NAME
    )
    if image_files:
        return max(image_files, key=image_area)
    raise FileNotFoundError(f"No usable image found in {folder}")


def load_books() -> list[BookMeta]:
    books: list[BookMeta] = []
    for folder in find_book_dirs():
        title_file = folder / "title.txt"
        raw = title_file.read_text(encoding="utf-8").strip()
        title, author = split_title_author(raw)
        books.append(BookMeta(folder=folder, title=title, author=author, source_image=find_source_image(folder)))
    return books


def open_image(path: Path) -> Image.Image:
    with Image.open(path) as img:
        return img.convert("RGB")


def open_image_rgba(path: Path) -> Image.Image:
    with Image.open(path) as img:
        return img.convert("RGBA")


def fit_cover(img: Image.Image, size: tuple[int, int], centering: tuple[float, float] = (0.5, 0.35)) -> Image.Image:
    return ImageOps.fit(img, size, method=Image.Resampling.LANCZOS, centering=centering)


def contain_height(img: Image.Image, target_h: int, max_w: int) -> Image.Image:
    ratio = min(max_w / img.width, target_h / img.height)
    new_size = (max(1, int(img.width * ratio)), max(1, int(img.height * ratio)))
    return img.resize(new_size, Image.Resampling.LANCZOS)


def load_font(path: str, size: int) -> ImageFont.FreeTypeFont:
    return ImageFont.truetype(path, size=size)


def wrap_lines(draw: ImageDraw.ImageDraw, text: str, font: ImageFont.FreeTypeFont, max_width: int) -> list[str]:
    words = text.split()
    lines: list[str] = []
    current = ""
    for word in words:
        candidate = word if not current else f"{current} {word}"
        if draw.textlength(candidate, font=font) <= max_width:
            current = candidate
        else:
            if current:
                lines.append(current)
            current = word
    if current:
        lines.append(current)
    return lines


def fit_title_lines(
    draw: ImageDraw.ImageDraw, title: str, max_width: int
) -> tuple[ImageFont.FreeTypeFont, list[str]]:
    size = title_font_size(title)
    while size >= 88:
        font = load_font(TITLE_FONT, size)
        lines = wrap_lines(draw, title.upper(), font, max_width)
        if lines and max(draw.textlength(line, font=font) for line in lines) <= max_width and len(lines) <= 4:
            return font, lines
        size -= 8
    font = load_font(TITLE_FONT, 88)
    return font, wrap_lines(draw, title.upper(), font, max_width)


def title_font_size(title: str) -> int:
    length = len(title)
    if length <= 18:
        return 176
    if length <= 28:
        return 152
    if length <= 40:
        return 132
    return 116


def fit_single_line_font(
    draw: ImageDraw.ImageDraw,
    text: str,
    font_path: str,
    start_size: int,
    min_size: int,
    max_width: int,
) -> ImageFont.FreeTypeFont:
    size = start_size
    while size >= min_size:
        font = load_font(font_path, size)
        bbox = draw.textbbox((0, 0), text, font=font)
        width = bbox[2] - bbox[0]
        if width <= max_width:
            return font
        size -= 4
    return load_font(font_path, min_size)


def add_banner(canvas: Image.Image, banner_path: Path) -> None:
    banner = open_image_rgba(banner_path)
    target_w = 240
    scale = target_w / banner.width
    target_h = int(banner.height * scale)
    banner = banner.resize((target_w, target_h), Image.Resampling.LANCZOS)
    x = CANVAS_W - banner.width - 48
    y = 0
    canvas.alpha_composite(banner, (x, y))


def add_texture(canvas: Image.Image) -> None:
    grain = Image.effect_noise((CANVAS_W, CANVAS_H), 12).convert("L")
    grain = ImageEnhance.Contrast(grain).enhance(1.3)
    grain = ImageOps.colorize(grain, black="#E5D8BA", white="#FFF9EC").convert("RGBA")
    grain.putalpha(45)
    canvas.alpha_composite(grain)


def add_top_title_band(canvas: Image.Image) -> None:
    band_h = 840
    band = canvas.crop((0, 0, CANVAS_W, band_h)).filter(ImageFilter.GaussianBlur(18))
    band = ImageEnhance.Color(band).enhance(0.45)
    band = ImageEnhance.Brightness(band).enhance(1.16)
    band = band.convert("RGBA")

    cream = Image.new("RGBA", (CANVAS_W, band_h), (248, 241, 227, 0))
    cream_draw = ImageDraw.Draw(cream, "RGBA")
    for y in range(band_h):
        alpha = int(182 * max(0, 1 - (y / band_h) ** 1.8))
        cream_draw.line((0, y, CANVAS_W, y), fill=(248, 241, 227, alpha), width=1)
    band.alpha_composite(cream)

    feather = Image.new("L", (CANVAS_W, band_h), 0)
    fd = ImageDraw.Draw(feather)
    fd.rectangle((0, 0, CANVAS_W, band_h - 180), fill=255)
    for i in range(180):
        alpha = int(255 * (1 - i / 180))
        fd.line((0, band_h - 180 + i, CANVAS_W, band_h - 180 + i), fill=alpha, width=1)
    band.putalpha(feather)
    canvas.alpha_composite(band, (0, 0))


def add_background_plate(canvas: Image.Image, art: Image.Image) -> None:
    bg = fit_cover(art, (CANVAS_W, CANVAS_H), centering=(0.5, 0.56))
    bg = ImageEnhance.Color(bg).enhance(0.98)
    bg = ImageEnhance.Brightness(bg).enhance(1.01)
    canvas.alpha_composite(bg.convert("RGBA"))
    add_top_title_band(canvas)


def add_typographic_background(canvas: Image.Image, folder_name: str, title: str) -> None:
    base_hex, accent_hex = THEME_COLORS.get(folder_name, (CREAM, "#5A6B53"))
    base = Image.new("RGBA", (CANVAS_W, CANVAS_H), ImageColor(base_hex) + (255,))

    gradient = Image.new("RGBA", (CANVAS_W, CANVAS_H), (0, 0, 0, 0))
    gd = ImageDraw.Draw(gradient, "RGBA")
    gd.rectangle((0, 0, CANVAS_W, CANVAS_H), fill=ImageColor(base_hex) + (255,))
    gd.rectangle((0, 1480, CANVAS_W, CANVAS_H), fill=ImageColor(accent_hex) + (235,))
    base.alpha_composite(gradient)

    motif = Image.new("RGBA", (CANVAS_W, CANVAS_H), (0, 0, 0, 0))
    md = ImageDraw.Draw(motif, "RGBA")
    initial = title[0].upper()
    initial_font = load_font(TITLE_FONT, 980)
    md.text((220, 1280), initial, font=initial_font, fill=ImageColor(CREAM) + (80,))
    md.line((90, 1850, CANVAS_W - 90, 1850), fill=ImageColor(CREAM) + (120,), width=8)
    md.line((90, 2050, CANVAS_W - 220, 2050), fill=ImageColor(CREAM) + (120,), width=8)
    md.line((90, 2250, CANVAS_W - 90, 2250), fill=ImageColor(CREAM) + (120,), width=8)

    base.alpha_composite(motif)
    canvas.alpha_composite(base)


def ImageColor(hex_color: str) -> tuple[int, int, int]:
    hex_color = hex_color.lstrip("#")
    return tuple(int(hex_color[i : i + 2], 16) for i in (0, 2, 4))


def add_title_block(canvas: Image.Image, title: str, author: str) -> None:
    draw = ImageDraw.Draw(canvas)

    text_left = 140
    text_right = 1105
    max_width = text_right - text_left

    title_font, lines = fit_title_lines(draw, title, max_width)

    y = 210
    for idx, line in enumerate(lines):
        bbox = draw.textbbox((0, 0), line, font=title_font)
        line_w = bbox[2] - bbox[0]
        line_h = bbox[3] - bbox[1]
        fill = GOLD if idx == 0 else INK
        x = text_left + (max_width - line_w) // 2
        for ox, oy, alpha in [(0, 3, 80), (0, 1, 36)]:
            draw.text((x + ox, y + oy), line, font=title_font, fill=(255, 252, 246, alpha))
        draw.text((x, y), line, font=title_font, fill=fill)
        y += line_h + 16

    ornament_y = y + 42
    line_w = int(max_width * 0.34)
    line_x1 = text_left + (max_width - line_w) // 2
    line_x2 = line_x1 + line_w
    draw.line((line_x1, ornament_y, line_x2, ornament_y), fill=GREEN, width=5)

    author_text = author.upper()
    author_font = fit_single_line_font(draw, author_text, BODY_FONT, 58, 34, max_width)
    bbox = draw.textbbox((0, 0), author_text, font=author_font)
    author_w = bbox[2] - bbox[0]
    author_x = text_left + (max_width - author_w) // 2
    draw.text((author_x, ornament_y + 58), author_text, font=author_font, fill=INK)


def build_cover(book: BookMeta) -> None:
    banner_path = BRAND_DIR / "NavyBanner.png"

    canvas = Image.new("RGBA", (CANVAS_W, CANVAS_H), WHITE)
    if book.source_image:
        art = open_image(book.source_image)
        add_background_plate(canvas, art)
    else:
        add_typographic_background(canvas, book.folder.name, book.title)

    add_texture(canvas)
    add_banner(canvas, banner_path)
    add_title_block(canvas, book.title, book.author)

    out_path = book.folder / OUTPUT_NAME
    canvas.convert("RGB").save(out_path, quality=92, subsampling=0)
    print(f"Wrote {out_path}")


def main() -> None:
    books = load_books()
    for book in books:
        build_cover(book)


if __name__ == "__main__":
    main()
