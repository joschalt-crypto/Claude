import sys, numpy as np, cv2
from PIL import Image, ImageFilter
from scipy import ndimage as ndi
S = sys.argv[1]
A = np.array(Image.open(f'{S}/assets/cut_pooh_all.png').convert('RGBA'))
A[1045:, :175, 3] = 0  # drop the 100-years badge

def sprite(name, x0, y0, x1, y1, scale=2.0, border=9, min_area=400):
    s = A[y0:y1, x0:x1].copy()
    a = s[..., 3].astype(np.float32)
    a[a < 60] = 0
    lab, n = ndi.label(a > 128)
    sizes = ndi.sum(np.ones_like(a), lab, range(1, n + 1))
    keep = np.isin(lab, [i + 1 for i, sz in enumerate(sizes) if sz >= min_area])
    keep = ndi.binary_dilation(keep, iterations=2)
    a = a * keep
    s[..., 3] = a.astype(np.uint8)
    h, w = s.shape[:2]
    pad = border + 6
    big = cv2.resize(s, (int(w * scale), int(h * scale)), interpolation=cv2.INTER_LANCZOS4)
    big = np.pad(big, ((pad, pad), (pad, pad), (0, 0)))
    rgb = big[..., :3].astype(np.float32); al = big[..., 3].astype(np.float32) / 255
    # gentle unsharp on colour
    blur = cv2.GaussianBlur(rgb, (0, 0), 1.6)
    rgb = np.clip(rgb + 0.6 * (rgb - blur), 0, 255)
    m = (al > 0.5).astype(np.uint8)
    k = cv2.getStructuringElement(cv2.MORPH_ELLIPSE, (2 * border + 1, 2 * border + 1))
    outer = cv2.dilate(m, k)
    outer = ndi.binary_fill_holes(outer).astype(np.float32)
    outer = cv2.GaussianBlur(outer, (0, 0), 1.0)
    paper = np.array([251, 247, 238], np.float32)
    out_rgb = rgb * al[..., None] + paper * (1 - al[..., None])
    out = np.dstack([out_rgb, np.clip(np.maximum(outer, al), 0, 1) * 255]).astype(np.uint8)
    Image.fromarray(out).save(f'{S}/scene/img/{name}.png')
    print(name, out.shape)

sprite('pooh', 488, 212, 680, 702)
sprite('hive', 738, 290, 848, 414, scale=2.2, border=8)
sprite('friends_l', 55, 712, 548, 1132)
sprite('friends_r', 552, 800, 930, 1152)

def crop(name, x0, y0, x1, y1, w=640):
    im = Image.open(f'{S}/assets/src/{name}.jpg').convert('RGB').crop((x0, y0, x1, y1))
    im = im.resize((w, int(w * (y1 - y0) / (x1 - x0))), Image.LANCZOS)
    im.save(f'{S}/scene/img/foto_{name}.jpg', quality=92); print(name, im.size)
crop('spaghetti', 470, 180, 1170, 1055)
crop('vovo', 0, 120, 1080, 1470)
crop('mae', 440, 0, 1160, 900)
