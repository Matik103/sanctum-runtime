#!/usr/bin/env python3
"""Build LinkedIn company cover at exact 1584x396 — all elements scaled to fit, no crop."""

from __future__ import annotations

from pathlib import Path

from PIL import Image, ImageDraw, ImageFilter, ImageFont

ROOT = Path(__file__).resolve().parents[1]
FONT_DIR = ROOT / "scripts" / ".cache" / "fonts"
OUT = ROOT / "public" / "marketing" / "sanctum-linkedin-cover-1584x396.png"
GRAPHIC = ROOT / "public" / "marketing" / "sanctum-linkedin-cover-left-graphic.png"

W, H = 1584, 396
BG = (7, 11, 20)
WHITE = (249, 250, 251)
LIGHT = (226, 232, 240)
BLUE = (79, 124, 255)
MUTED = (156, 163, 175)
GRID = (12, 18, 32)


def key_dark_background(img: Image.Image) -> Image.Image:
    """Make near-black / navy backdrop transparent so the shield sits on the canvas."""
    rgba = img.convert("RGBA")
    pixels = rgba.load()
    w, h = rgba.size
    for y in range(h):
        for x in range(w):
            r, g, b, a = pixels[x, y]
            if r < 28 and g < 32 and b < 48:
                pixels[x, y] = (r, g, b, 0)
    return rgba


def trim_to_content(img: Image.Image, threshold: int = 18) -> Image.Image:
    """Crop to non-background pixels so scaling uses the full shield, not empty margins."""
    rgba = img.convert("RGBA")
    alpha = rgba.split()[-1]
    bbox = alpha.getbbox()
    if bbox:
        return rgba.crop(bbox)

    rgb = rgba.convert("RGB")
    pixels = rgb.load()
    w, h = rgb.size
    min_x, min_y, max_x, max_y = w, h, 0, 0
    for y in range(h):
        for x in range(w):
            r, g, b = pixels[x, y]
            if r > threshold or g > threshold or b > threshold:
                min_x = min(min_x, x)
                min_y = min(min_y, y)
                max_x = max(max_x, x)
                max_y = max(max_y, y)
    if max_x <= min_x or max_y <= min_y:
        return rgba
    pad = 8
    return rgba.crop(
        (
            max(0, min_x - pad),
            max(0, min_y - pad),
            min(w, max_x + pad),
            min(h, max_y + pad),
        )
    )


def draw_grid(canvas: Image.Image) -> None:
    draw = ImageDraw.Draw(canvas)
    for x in range(0, W, 48):
        draw.line([(x, 0), (x, H)], fill=GRID, width=1)
    for y in range(0, H, 48):
        draw.line([(0, y), (W, y)], fill=GRID, width=1)


def add_glow(canvas: Image.Image) -> Image.Image:
    glow = Image.new("RGBA", (W, H), (0, 0, 0, 0))
    gdraw = ImageDraw.Draw(glow)
    for i in range(100, 0, -2):
        alpha = int(2 + (100 - i) * 0.18)
        gdraw.ellipse([40 - i, H // 2 - i, 400 + i, H // 2 + i], fill=(79, 124, 255, alpha))
    glow = glow.filter(ImageFilter.GaussianBlur(16))
    return Image.alpha_composite(canvas.convert("RGBA"), glow).convert("RGB")


def fit_graphic(graphic: Image.Image) -> tuple[Image.Image, tuple[int, int]]:
    pad_top = 32
    pad_bottom = 32
    pad_left = 56
    pad_right = 24
    max_w = 560
    max_h = H - pad_top - pad_bottom
    gw, gh = graphic.size
    scale = min(max_w / gw, max_h / gh)
    size = (max(1, int(gw * scale)), max(1, int(gh * scale)))
    resized = graphic.resize(size, Image.Resampling.LANCZOS)
    x = pad_left
    y = (H - size[1]) // 2
    return resized, (x, y)


def draw_text_block(draw: ImageDraw.ImageDraw) -> None:
    font_bold_44 = ImageFont.truetype(FONT_DIR / "SpaceGrotesk-Bold.ttf", 44)
    font_bold_28 = ImageFont.truetype(FONT_DIR / "SpaceGrotesk-Bold.ttf", 28)
    font_bold_20 = ImageFont.truetype(FONT_DIR / "SpaceGrotesk-Bold.ttf", 20)
    font_bold_16 = ImageFont.truetype(FONT_DIR / "SpaceGrotesk-Bold.ttf", 16)
    font_url = ImageFont.truetype(FONT_DIR / "Inter-Regular.ttf", 11)

    lines = [
        ("Sanctum Runtime", font_bold_44, WHITE),
        ("RUNTIME TRUST INFRASTRUCTURE", font_bold_28, WHITE),
        ("FOR AUTONOMOUS AI", font_bold_20, LIGHT),
        ("Observe · Verify · Gate", font_bold_16, BLUE),
        ("www.sanctumruntime.com", font_url, MUTED),
    ]
    gaps = [4, 6, 8, 10, 0]

    heights = []
    for text, font, _ in lines:
        bbox = draw.textbbox((0, 0), text, font=font)
        heights.append(bbox[3] - bbox[1])

    total_h = sum(heights) + sum(gaps)
    right_margin = 84
    text_right = W - right_margin
    y = (H - total_h) // 2

    for (text, font, color), gap in zip(lines, gaps):
        bbox = draw.textbbox((0, 0), text, font=font)
        tw = bbox[2] - bbox[0]
        th = bbox[3] - bbox[1]
        draw.text((text_right - tw, y), text, font=font, fill=color)
        y += th + gap


def main() -> None:
    if not GRAPHIC.exists():
        raise SystemExit(f"Missing graphic: {GRAPHIC}")

    canvas = Image.new("RGB", (W, H), BG)
    draw_grid(canvas)
    canvas = add_glow(canvas)

    graphic = key_dark_background(trim_to_content(Image.open(GRAPHIC)))
    graphic, (gx, gy) = fit_graphic(graphic)
    canvas.paste(graphic, (gx, gy), graphic)

    draw = ImageDraw.Draw(canvas)
    draw_text_block(draw)

    OUT.parent.mkdir(parents=True, exist_ok=True)
    canvas.save(OUT, format="PNG", optimize=True)
    print(f"Wrote {OUT} ({W}x{H})")
    print(f"Graphic placed at ({gx}, {gy}) size {graphic.size}")


if __name__ == "__main__":
    main()
