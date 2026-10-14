"""Regenerates every brand asset from the source logo. Usage: python3 scripts_extract_logo.py <logo.jpg>"""
import sys
from PIL import Image, ImageFilter
import numpy as np
SRC = sys.argv[1] if len(sys.argv) > 1 else 'logo-source.jpg'
a = np.array(Image.open(SRC).convert('RGB')).astype(float)
cx, cy, r = 557, 817, 449          # badge circle in the supplied artwork
Y, X = np.mgrid[:a.shape[0], :a.shape[1]]
a[((X-cx)**2 + (Y-cy)**2) > (r-25)**2] = [1., 4., 30.]
OUT = 'assets/'
def bounds(y0, y1):
    m = a[y0:y1].max(2) > 60; xs = np.where(m.any(0))[0]; ys = np.where(m.any(1))[0] + y0
    return xs.min(), ys.min(), xs.max(), ys.max()
def extract(box, pad=14):
    x0, y0, x1, y1 = box; c = a[y0-pad:y1+pad, x0-pad:x1+pad]
    bg = np.median(np.concatenate([c[0], c[-1], c[:, 0], c[:, -1]]), 0)
    al = np.clip((np.abs(c-bg).max(2) - 16) / 64, 0, 1)
    col = np.clip((c - bg*(1-al[..., None])) / np.maximum(al, 1e-3)[..., None], 0, 255)
    return Image.fromarray(np.dstack([col, al*255]).astype(np.uint8), 'RGBA')
def up(im, s):
    im = im.resize((max(1, round(im.width*s)), max(1, round(im.height*s))), Image.LANCZOS)
    return im.filter(ImageFilter.UnsharpMask(radius=2, percent=50, threshold=3)) if s > 1 else im
NAVY = (4, 7, 34)
def canvas(size, im, frac, bgc=NAVY, w=None, h=None):
    W, H = w or size, h or size
    cv = Image.new('RGBA', (W, H), (bgc+(255,)) if bgc else (0, 0, 0, 0))
    rr = up(im, min(W, H)*frac/max(im.width, im.height)); cv.alpha_composite(rr, ((W-rr.width)//2, (H-rr.height)//2)); return cv
eb, wb, tb = bounds(560, 800), bounds(820, 975), bounds(985, 1035)
eye, word, tag = extract(eb), extract(wb), extract(tb, 8)
# Lockup = the three clean pieces re-placed at their original positions (avoids picking up background glow).
P = 14; ox, oy = min(eb[0], wb[0], tb[0]) - P, eb[1] - P
lock = Image.new('RGBA', (max(eb[2], wb[2], tb[2]) + P - ox, tb[3] + P - oy), (0, 0, 0, 0))
for piece, b, pad in [(eye, eb, 14), (word, wb, 14), (tag, tb, 8)]:
    lock.alpha_composite(piece, (b[0] - pad - ox, b[1] - pad - oy))
for n, im in [('mark', eye), ('wordmark', word), ('tagline', tag), ('lockup', lock)]: up(im, 3).save(OUT+'brand/'+n+'.png')
canvas(1024, eye, 0.74).convert('RGB').save(OUT+'icon.png')           # iOS: opaque, no alpha
canvas(1024, eye, 0.56, None).save(OUT+'adaptive-icon.png')            # Android: inside 66% safe zone
canvas(1284, lock, 0.66).convert('RGB').save(OUT+'splash.png')
canvas(512, eye, 0.74).convert('RGB').save(OUT+'brand/store-icon-512.png')
canvas(48, eye, 0.94).save(OUT+'favicon.png')
m = np.array(eye)[..., 3]
white = Image.fromarray(np.dstack([np.full(m.shape+(3,), 255), m]).astype(np.uint8), 'RGBA')
canvas(96, white, 0.92, None).save(OUT+'notification-icon.png')        # Android: white silhouette
canvas(0, lock, 0.84, w=1024, h=500).convert('RGB').save(OUT+'brand/play-feature-graphic.png')
print('done')
