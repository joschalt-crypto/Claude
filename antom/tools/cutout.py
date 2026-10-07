"""Cut the watercolor plates out of their white paper.

Usage: python3 cutout.py <raw_dir> <out_dir> [names...]
Reads <name>.jpg (the Higgsfield illustrations, about 960 px, white background)
and writes <name>.webp (640 px) and <name>-s.webp (360 px) with transparency,
cropped to a square around the plate - the files in ../img.
"""
import os
import sys

import numpy as np
from PIL import Image, ImageFilter
from scipy import ndimage

RAW, OUT = sys.argv[1], sys.argv[2]
NAMES = sys.argv[3:] or sorted(os.path.splitext(f)[0] for f in os.listdir(RAW) if f.endswith('.jpg'))
os.makedirs(OUT, exist_ok=True)


def cut(path):
    im = Image.open(path).convert('RGB')
    a = np.asarray(im).astype(np.int16)
    lo = a.min(axis=2)
    hi = a.max(axis=2)
    sat = hi - lo
    # paper and its pale wash shadows: bright and nearly grey
    paper = (lo > 206) & (sat < 26)
    barrier = ~paper
    # seal hairline gaps in the inked rims before flooding from the edges
    sealed = ndimage.binary_dilation(barrier, iterations=3)
    free = ~sealed
    lab, _ = ndimage.label(free)
    border = np.unique(np.concatenate([lab[0, :], lab[-1, :], lab[:, 0], lab[:, -1]]))
    outside = np.isin(lab, border[border > 0])
    # give back the band the sealing took, but only through paper pixels
    for _ in range(4):
        outside = outside | (ndimage.binary_dilation(outside) & paper)
    fg = ~outside
    # drop specks of stray wash far from the subject
    lab2, n = ndimage.label(fg)
    if n > 1:
        sizes = ndimage.sum(fg, lab2, range(1, n + 1))
        keep = np.zeros(n + 1, bool)
        keep[1:] = sizes >= max(400, sizes.max() * 0.004)
        fg = keep[lab2]
    fg = ndimage.binary_fill_holes(fg)
    alpha = Image.fromarray((fg * 255).astype(np.uint8)).filter(ImageFilter.GaussianBlur(1.1))
    al = np.asarray(alpha).astype(np.float32) / 255.0
    rgb = a.astype(np.float32)
    # un-mix the white paper from soft edge pixels
    safe = np.clip(al, 0.05, 1.0)[..., None]
    rgb = np.where(al[..., None] < 0.999, (rgb - (1 - safe) * 255.0) / safe, rgb)
    rgb = np.clip(rgb, 0, 255)
    out = np.dstack([rgb, al * 255.0]).astype(np.uint8)
    img = Image.fromarray(out, 'RGBA')
    ys, xs = np.nonzero(fg)
    x0, x1, y0, y1 = xs.min(), xs.max(), ys.min(), ys.max()
    w, h = x1 - x0 + 1, y1 - y0 + 1
    side = int(max(w, h) * 1.04)
    canvas = Image.new('RGBA', (side, side), (0, 0, 0, 0))
    canvas.paste(img.crop((x0, y0, x1 + 1, y1 + 1)), ((side - w) // 2, (side - h) // 2))
    return canvas


for name in NAMES:
    canvas = cut(os.path.join(RAW, name + '.jpg'))
    for size, suffix in ((640, ''), (360, '-s')):
        canvas.resize((size, size), Image.LANCZOS).save(os.path.join(OUT, name + suffix + '.webp'), 'WEBP', quality=78, method=6)
    print(name)
