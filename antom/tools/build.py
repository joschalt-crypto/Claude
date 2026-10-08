"""Build index.html (the artifact) and Antom.html (a single file for any browser) from src/.

Usage: python3 tools/build.py [raw_dir]

The page is published as one file. Medium (540 x 675) and small (200 x 200)
versions of every photo are embedded as base64 WebP, so the pictures show in
every view of the artifact without fetching anything. Only the large heroes
(img/<name>.webp, 960 x 1200) are loaded as published files on top, to make
them sharper where that works.

The embedded sizes are made from the photos in img/ - or, sharper, from the
original Higgsfield JPEGs in raw_dir (<name>.jpg) when given.

Antom.html is the same page as a complete document that needs nothing else: the
Fraunces font and SortableJS are inlined, the large photo files are skipped, and
without window.claude the page keeps its plan in the browser (localStorage).
"""
import base64
import io
import json
import os
import re
import sys

from PIL import Image, ImageFilter

APP = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
SRC = os.path.join(APP, 'src')
IMG = os.path.join(APP, 'img')
VENDOR = os.path.join(APP, 'test', 'vendor')
RAW = sys.argv[1] if len(sys.argv) > 1 else None

PARTS = ['01-style.html', '02-body.html', '03-head.js', '@photos', '05-recipes.js', '06-model.js',
         '07-state.js', '08-render.js', '09-sheets.js', '10-features.js', '11-events.js']
NO_SMALL = {'ob-tisch', 'ob-einkauf', 'scan-card'}


def cover(im, w, h):
    k = max(w / im.width, h / im.height)
    im = im.resize((round(im.width * k), round(im.height * k)), Image.LANCZOS)
    x, y = (im.width - w) // 2, (im.height - h) // 2
    return im.crop((x, y, x + w, y + h))


def webp64(im, q):
    buf = io.BytesIO()
    im.save(buf, 'WEBP', quality=q, method=6)
    return base64.b64encode(buf.getvalue()).decode('ascii')


def source(name):
    if RAW and os.path.exists(os.path.join(RAW, name + '.jpg')):
        return Image.open(os.path.join(RAW, name + '.jpg')).convert('RGB').filter(ImageFilter.GaussianBlur(0.6))
    return Image.open(os.path.join(IMG, name + '.webp')).convert('RGB')


def photos_js():
    names = sorted(f[:-5] for f in os.listdir(IMG) if f.endswith('.webp') and not f.endswith(('-m.webp', '-s.webp')))
    out = {}
    for name in names:
        if name == 'icon':
            out[name] = {'m': webp64(Image.open(os.path.join(IMG, 'icon.webp')).convert('RGB').resize((180, 180), Image.LANCZOS), 82)}
            continue
        im = source(name)
        entry = {'m': webp64(cover(im, 540, 675), 54)}
        if name not in NO_SMALL:
            entry['s'] = webp64(cover(im, 200, 200), 62)
        out[name] = entry
    body = json.dumps(out, separators=(',', ':'))
    return ('\n/* ---------- photos: embedded WebP (540x675 and 200x200), built by tools/build.py ---------- */\n'
            f'const PHOTOS = {body};\n')


def b64file(path):
    with open(path, 'rb') as f:
        return base64.b64encode(f.read()).decode('ascii')


def png64(im):
    buf = io.BytesIO()
    im.save(buf, 'PNG', optimize=True)
    return base64.b64encode(buf.getvalue()).decode('ascii')


def standalone(page):
    """The artifact page as a complete document for any browser, without network."""
    title = '<title>Antom</title>\n'
    fonts = re.compile(r'<link rel="(?:preconnect|stylesheet)" href="https://fonts\.(?:googleapis|gstatic)\.com[^"]*"[^>]*>\n')
    sortable_tag = '<script src="https://cdn.jsdelivr.net/npm/sortablejs@1.15.6/Sortable.min.js"></script>'
    assert page.startswith(title) and len(fonts.findall(page)) == 3 and page.count(sortable_tag) == 1
    page = fonts.sub('', page[len(title):])
    with open(os.path.join(VENDOR, 'Sortable.min.js'), encoding='utf-8') as f:
        page = page.replace(sortable_tag, '<script>' + f.read().strip() + '</script>')
    icon = Image.open(os.path.join(IMG, 'icon.webp')).convert('RGB')
    head = (
        '<!doctype html>\n<html lang="de">\n<head>\n<meta charset="utf-8">\n'
        '<meta name="viewport" content="width=device-width, initial-scale=1, viewport-fit=cover">\n'
        '<meta name="theme-color" content="#1f3fd1">\n'
        '<meta name="apple-mobile-web-app-capable" content="yes">\n<meta name="mobile-web-app-capable" content="yes">\n'
        '<meta name="apple-mobile-web-app-title" content="Antom">\n'
        + title +
        f'<link rel="icon" type="image/png" href="data:image/png;base64,{png64(icon.resize((64, 64), Image.LANCZOS))}">\n'
        f'<link rel="apple-touch-icon" href="data:image/png;base64,{png64(icon.resize((180, 180), Image.LANCZOS))}">\n'
        '<style>[hidden]{display:none!important}'
        '@font-face{font-family:"Fraunces";font-style:normal;font-weight:100 900;font-display:swap;'
        f'src:url(data:font/woff2;base64,{b64file(os.path.join(VENDOR, "fonts", "fraunces-latin-full-normal.woff2"))}) format("woff2")}}</style>\n'
        '<script>window.ANTOM_STANDALONE = true;</script>\n'
        '</head>\n<body>\n'
    )
    return head + page + '\n</body>\n</html>\n'


def write(name, text):
    with open(os.path.join(APP, name), 'w', encoding='utf-8') as f:
        f.write(text)
    print(f'{name}: {len(text.encode("utf-8")) / 1024:.0f} KiB')


def main():
    html = []
    for part in PARTS:
        if part == '@photos':
            html.append(photos_js())
        else:
            with open(os.path.join(SRC, part), encoding='utf-8') as f:
                html.append(f.read())
    page = ''.join(html)
    write('index.html', page)
    write('Antom.html', standalone(page))


if __name__ == '__main__':
    main()
