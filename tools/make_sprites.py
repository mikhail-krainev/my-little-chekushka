#!/usr/bin/env python3
"""Cuts the reference picture (green screen) into mascot parts and pixelates them.

usage: python3 tools/make_sprites.py reference.png Sources/Mellstroy/Resources
Part rectangles are in reference pixels and must match Sources/Mellstroy/MascotSprites.swift.
"""
import sys
import numpy as np
from PIL import Image

FACTOR = 3                      # reference pixels per art pixel ("small pixelation")
PALETTE_COLORS = 56

# name: (x0, y0, x1, y1, keep(x, y) over reference coordinates)
PARTS = {
    "body":     (117, 135, 360, 525, lambda x, y: not (350 <= y <= 515 and (x < 168 or x > 314))),
    "armL_up":  (120, 353, 171, 446, lambda x, y: x < 168),
    "armL_low": (120, 440, 171, 512, lambda x, y: x < 168),
    "armR_up":  (312, 353, 363, 446, lambda x, y: x > 320),
    "armR_low": (312, 440, 363, 512, lambda x, y: x > 320),
    "legL":     (162, 513, 231, 585, lambda x, y: True),
    "legR":     (255, 513, 330, 585, lambda x, y: True),
}


def key(path):
    im = np.array(Image.open(path).convert("RGB")).astype(float)
    r, g, b = im[..., 0], im[..., 1], im[..., 2]
    alpha = np.clip(1 - ((g - np.maximum(r, b)) - 30) / 110, 0, 1)
    g = np.minimum(g, np.maximum(r, b) + 6)             # despill the green fringe
    return np.dstack([r, g, b]), alpha


def pixelate(rgb, alpha, rect, keep):
    x0, y0, x1, y1 = rect
    h, w = y1 - y0, x1 - x0
    assert h % FACTOR == 0 and w % FACTOR == 0, (rect, "size must be a multiple of FACTOR")
    a = np.zeros((h, w))
    c = np.zeros((h, w, 3))
    for y in range(h):
        for x in range(w):
            sx, sy = x0 + x, y0 + y
            if 0 <= sy < alpha.shape[0] and 0 <= sx < alpha.shape[1] and keep(sx, sy):
                a[y, x] = alpha[sy, sx]
                c[y, x] = rgb[sy, sx]
    ah, aw = h // FACTOR, w // FACTOR
    a4 = a.reshape(ah, FACTOR, aw, FACTOR)
    c5 = (c * a[..., None]).reshape(ah, FACTOR, aw, FACTOR, 3)
    wsum = a4.sum(axis=(1, 3))
    color = c5.sum(axis=(1, 3)) / np.maximum(wsum[..., None], 1e-6)
    mask = wsum / (FACTOR * FACTOR) > 0.5
    return color.astype("uint8"), mask


def largest_component(mask):
    """Keeps the biggest 8-connected blob: drops slivers of the bottle edge that the cut picks up next to an arm."""
    h, w = mask.shape
    seen = np.zeros_like(mask, dtype=bool)
    best = []
    for sy in range(h):
        for sx in range(w):
            if not mask[sy, sx] or seen[sy, sx]:
                continue
            blob, stack = [], [(sy, sx)]
            seen[sy, sx] = True
            while stack:
                y, x = stack.pop()
                blob.append((y, x))
                for dy in (-1, 0, 1):
                    for dx in (-1, 0, 1):
                        ny, nx = y + dy, x + dx
                        if 0 <= ny < h and 0 <= nx < w and mask[ny, nx] and not seen[ny, nx]:
                            seen[ny, nx] = True
                            stack.append((ny, nx))
            if len(blob) > len(best):
                best = blob
    out = np.zeros_like(mask)
    for y, x in best:
        out[y, x] = True
    return out


def main(ref, out_dir):
    rgb, alpha = key(ref)
    cut = {name: pixelate(rgb, alpha, p[:4], p[4]) for name, p in PARTS.items()}
    for name in cut:
        if name.startswith("arm"):
            color, mask = cut[name]
            cut[name] = (color, largest_component(mask))
    # one shared palette keeps all parts consistent
    pixels = np.concatenate([c[m] for c, m in cut.values()])
    side = int(np.ceil(np.sqrt(len(pixels))))
    montage = np.zeros((side * side, 3), "uint8"); montage[: len(pixels)] = pixels
    pal = Image.fromarray(montage.reshape(side, side, 3)).quantize(colors=PALETTE_COLORS, method=Image.Quantize.MEDIANCUT, dither=Image.Dither.NONE)
    for name, (color, mask) in cut.items():
        q = Image.fromarray(color).quantize(palette=pal, dither=Image.Dither.NONE).convert("RGB")
        out = np.dstack([np.array(q), (mask * 255).astype("uint8")])
        Image.fromarray(out, "RGBA").save(f"{out_dir}/{name}.png")
        print(name, out.shape[1], "x", out.shape[0])
    # skin tone for eyelids / mouth overlays
    print("skin", np.median(rgb[258:272, 245:275].reshape(-1, 3), axis=0).astype(int))


if __name__ == "__main__":
    main(sys.argv[1], sys.argv[2])
