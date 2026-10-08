"""Make the web sizes of the Higgsfield food photos.

Usage: python3 photos.py <raw_dir> <out_dir> [names...]
Reads <name>.jpg (portrait 4:5, about 1200 x 1500) and writes
  <name>.webp     960 x 1200  hero of the recipe sheet and the Today card
  <name>-m.webp   480 x 600   cookbook grid and shelves
  <name>-s.webp   240 x 240   list thumbnails (centre crop)
and icon.png -> icon.webp (360 x 360). A faint blur before scaling takes the
film grain out of the generated photos, which saves about a fifth of the bytes
without a visible difference on a phone.
"""
import os
import sys

from PIL import Image, ImageFilter

RAW, OUT = sys.argv[1], sys.argv[2]
NAMES = sys.argv[3:] or sorted(os.path.splitext(f)[0] for f in os.listdir(RAW) if f.endswith('.jpg'))
os.makedirs(OUT, exist_ok=True)


def cover(im, w, h, bias=0.5):
    """Scale and crop to w x h; bias moves the crop window vertically (0 top, 1 bottom)."""
    k = max(w / im.width, h / im.height)
    sw, sh = round(im.width * k), round(im.height * k)
    im = im.resize((sw, sh), Image.LANCZOS)
    x = (sw - w) // 2
    y = round((sh - h) * bias)
    return im.crop((x, y, x + w, y + h))


for name in NAMES:
    im = Image.open(os.path.join(RAW, name + '.jpg')).convert('RGB').filter(ImageFilter.GaussianBlur(0.5))
    cover(im, 960, 1200).save(os.path.join(OUT, name + '.webp'), 'WEBP', quality=60, method=6)
    cover(im, 480, 600).save(os.path.join(OUT, name + '-m.webp'), 'WEBP', quality=62, method=6)
    cover(im, 240, 240).save(os.path.join(OUT, name + '-s.webp'), 'WEBP', quality=70, method=6)
    print(name)

icon = os.path.join(RAW, 'icon.png')
if os.path.exists(icon):
    Image.open(icon).convert('RGB').resize((360, 360), Image.LANCZOS).save(os.path.join(OUT, 'icon.webp'), 'WEBP', quality=80, method=6)
    print('icon')
