#!/usr/bin/env python3
"""Fit a source infographic into LinkedIn dimensions without cropping headers."""

from __future__ import annotations

import sys
from pathlib import Path

from PIL import Image

BG = (11, 18, 32)  # #0B1220


def fit_no_crop(src: Image.Image, tw: int, th: int) -> Image.Image:
    w, h = src.size
    scale = min(tw / w, th / h)
    nw, nh = round(w * scale), round(h * scale)
    resized = src.resize((nw, nh), Image.Resampling.LANCZOS)
    canvas = Image.new("RGB", (tw, th), BG)
    canvas.paste(resized, ((tw - nw) // 2, (th - nh) // 2))
    return canvas


def main() -> None:
    if len(sys.argv) < 3:
        raise SystemExit("Usage: build-linkedin-post-image.py <source.png> <basename>")

    src_path = Path(sys.argv[1])
    basename = sys.argv[2]
    out_dir = Path(__file__).resolve().parents[1] / "public" / "marketing"
    out_dir.mkdir(parents=True, exist_ok=True)

    src = Image.open(src_path).convert("RGB")
    sizes = [(1200, 627), (1080, 1350)]
    for w, h in sizes:
        out = out_dir / f"{basename}-{w}x{h}.png"
        fit_no_crop(src, w, h).save(out, format="PNG", optimize=True)
        print(f"Wrote {out} ({w}x{h})")


if __name__ == "__main__":
    main()
