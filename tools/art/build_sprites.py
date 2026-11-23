#!/usr/bin/env python3
"""Story 4.11: builds the stage-object sprite atlas from the raw Meshy images.

Usage:  python3 -I tools/art/build_sprites.py <raw_dir> [out_dir]

<raw_dir> holds the raw text-to-image outputs named in `prompts.json` (they are NOT in git: they
are large, and the game only needs the small cut-outs). `out_dir` defaults to
apps/client/public/assets/atlases. Writes `objects.png` + `objects.json` (Phaser "JSON hash"
atlas, frames named category_name_variant, <= 2048 px a side).

What it does per source (all strictly top-down, true colours: the game darkens / lights them):
  * magenta-keyed objects (sandbags, barricade): the #FF00FF background is keyed out with a soft
    edge and the magenta spill removed, the object is cropped to its silhouette and resized to its
    exact footprint at the frame's density (no baked shadow: the game casts it by height).
  * black-keyed VFX (flames, smoke): a 2 x 2 sheet is split into four frames; alpha comes from
    brightness (flames: max channel; smoke: luminance, colour flattened to light grey so the game
    can tint it).
"""
import json
import os
import sys

from PIL import Image, ImageEnhance, ImageFilter

HERE = os.path.dirname(os.path.abspath(__file__))
ROOT = os.path.dirname(os.path.dirname(HERE))
PAD = 2  # empty px around each frame (atlasLayout.ATLAS_PADDING_PX)
MAX_PX = 2048


def key_magenta(img):
    """Soft chroma key on pure magenta; returns RGBA with spill removed."""
    img = img.convert("RGB")
    w, h = img.size
    src = img.load()
    out = Image.new("RGBA", (w, h))
    dst = out.load()
    for y in range(h):
        for x in range(w):
            r, g, b = src[x, y]
            # magenta-ness: how much R and B exceed G
            m = min(r, b) - g
            if m > 90:
                a = 0
            elif m > 40:
                a = int(255 * (90 - m) / 50)
            else:
                a = 255
            if a > 0 and m > 0:  # despill: pull R and B down toward G
                r = min(r, g + max(0, int((r - g) * 0.35)))
                b = min(b, g + max(0, int((b - g) * 0.35)))
            dst[x, y] = (r, g, b, a)
    return out


def crop_alpha(img, thr=24):
    a = img.getchannel("A").point(lambda v: 255 if v > thr else 0)
    box = a.getbbox()
    return img.crop(box) if box else img


def grade(img, mul):
    r, g, b, a = img.split()
    r = r.point(lambda v: min(255, int(v * mul[0])))
    g = g.point(lambda v: min(255, int(v * mul[1])))
    b = b.point(lambda v: min(255, int(v * mul[2])))
    return Image.merge("RGBA", (r, g, b, a))


def erode_alpha(img):
    """Shrink the alpha by one px (kills the last keyed fringe after resizing)."""
    a = img.getchannel("A").filter(ImageFilter.MinFilter(3))
    img.putalpha(a)
    return img


def quadrants(img):
    w, h = img.size
    return [img.crop((qx * w // 2, qy * h // 2, (qx + 1) * w // 2, (qy + 1) * h // 2)) for qy in (0, 1) for qx in (0, 1)]


def vfx_alpha(img, mode, gain, floor):
    """Black-background VFX -> RGBA (alpha from brightness)."""
    img = img.convert("RGB")
    w, h = img.size
    src = img.load()
    out = Image.new("RGBA", (w, h))
    dst = out.load()
    for y in range(h):
        for x in range(w):
            r, g, b = src[x, y]
            v = max(r, g, b) if mode == "flame" else int(0.299 * r + 0.587 * g + 0.114 * b)
            a = 0 if v < floor else min(255, int((v - floor) * gain))
            if mode == "flame":
                k = 255 / max(1, max(r, g, b))  # unpremultiply: full-strength colour, alpha carries the fade
                dst[x, y] = (min(255, int(r * k)), min(255, int(g * k)), min(255, int(b * k)), a)
            else:
                dst[x, y] = (232, 232, 236, a)
    return out


def fit_square(img, side):
    """Crop to the visible part, then centre it in a square `side` px (aspect kept)."""
    img = crop_alpha(img, 8)
    w, h = img.size
    k = side / max(w, h)
    img = img.resize((max(1, round(w * k)), max(1, round(h * k))), Image.LANCZOS)
    sq = Image.new("RGBA", (side, side), (0, 0, 0, 0))
    sq.paste(img, ((side - img.size[0]) // 2, (side - img.size[1]) // 2))
    return sq


def build(raw_dir, out_dir):
    spec = json.load(open(os.path.join(HERE, "prompts.json")))
    frames = {}
    for s in spec["sprites"]:
        src = Image.open(os.path.join(raw_dir, s["raw"]))
        if s["key"] == "magenta":
            img = crop_alpha(key_magenta(src))
            if "cropX" in s:  # keep a horizontal slice of the silhouette (fewer, thicker stakes)
                w0, h0 = img.size
                img = crop_alpha(img.crop((int(w0 * s["cropX"][0]), 0, int(w0 * s["cropX"][1]), h0)))
            img = img.resize((s["w"], s["h"]), Image.LANCZOS)
            img = erode_alpha(img) if s.get("erode") else img
            if "grade" in s:
                img = grade(img, s["grade"])
            if "saturation" in s:
                a = img.getchannel("A")
                img = ImageEnhance.Color(img.convert("RGB")).enhance(s["saturation"]).convert("RGBA")
                img.putalpha(a)
            frames[s["frame"]] = img
        else:
            for i, q in enumerate(quadrants(src)):
                img = vfx_alpha(q, s["key"], s["gain"], s["floor"])
                frames[s["frames"][i]] = fit_square(img, s["side"])
    # shelf pack (tallest first), like atlasLayout.packAtlas
    order = sorted(frames.items(), key=lambda kv: (-kv[1].size[1], -kv[1].size[0], kv[0]))
    x = y = PAD
    row = 0
    width = 0
    placed = {}
    for name, img in order:
        w, h = img.size
        if x + w + PAD > 512 and x > PAD:  # 512 px wide sheet
            x = PAD
            y += row + PAD
            row = 0
        placed[name] = (x, y, w, h)
        x += w + PAD
        row = max(row, h)
        width = max(width, x)
    height = y + row + PAD
    width = (width + 3) // 4 * 4
    height = (height + 3) // 4 * 4
    assert width <= MAX_PX and height <= MAX_PX
    sheet = Image.new("RGBA", (width, height), (0, 0, 0, 0))
    for name, (fx, fy, w, h) in placed.items():
        sheet.paste(frames[name], (fx, fy))
    # Story 4.11 review fix: how far each flame's solid core (alpha > 50 %) reaches from its centre, as a
    # fraction of the frame width, at any rotation (radial). The game insets the ring flames by it.
    core = 0.0
    for name, img in frames.items():
        if not name.startswith("fx_flame_"):
            continue
        w, h = img.size
        a = img.getchannel("A").load()
        for yy in range(h):
            for xx in range(w):
                if a[xx, yy] > 127:
                    core = max(core, ((xx + 0.5 - w / 2) ** 2 + (yy + 0.5 - h / 2) ** 2) ** 0.5 / w)
    os.makedirs(out_dir, exist_ok=True)
    sheet.save(os.path.join(out_dir, "objects.png"), optimize=True)
    meta = {
        "frames": {
            n: {"frame": {"x": fx, "y": fy, "w": w, "h": h}, "rotated": False, "trimmed": False,
                "spriteSourceSize": {"x": 0, "y": 0, "w": w, "h": h}, "sourceSize": {"w": w, "h": h}}
            for n, (fx, fy, w, h) in sorted(placed.items())
        },
        "meta": {"app": "tools/art/build_sprites.py", "image": "objects.png", "format": "RGBA8888",
                 "size": {"w": width, "h": height}, "scale": "1",
                 "coreFrac": round(core + 0.0005, 3)},
    }
    with open(os.path.join(out_dir, "objects.json"), "w") as f:
        json.dump(meta, f, indent=1)
        f.write("\n")
    print(f"objects.png {width}x{height}, {len(placed)} frames")


if __name__ == "__main__":
    if len(sys.argv) < 2:
        sys.exit(__doc__)
    build(sys.argv[1], sys.argv[2] if len(sys.argv) > 2 else os.path.join(ROOT, "apps/client/public/assets/atlases"))
