"""Boundary mask without lettering: keep the OZP's zoning lines, drop labels (G/IC, O, OU, R(A)3, road names, site
circles, height triangles) that the magic wand would otherwise trace around as notches.

Usage: python3 scripts/ozp_lines.py [--check]  # public/lots/ozp-mask-raw.png + ozp-underlay.jpg → public/lots/ozp-mask.png
Also called by build_ozp_underlay.py. Pixels: True = ink.

Method (1.27 m px): lines = ink on a straight run of >= 41 px (52 m) at any of 48 angles. Every other connected piece
of ink is judged on its own:
  - touches a line and is tiny (<= 12 px): junction filler / line joint → keep
  - joined to a line in the undilated drawing (where labels have clear paper between them and the lines) and either
    long (> 40 px: a curve) or touching lines at two places that run different ways / across (corner, short side) → keep
  - otherwise touching a line: a label written against it → drop
No rule can promise never to open a gap, so the wand also traces the raw mask and falls back to it on a leak.
  - loose, within 3 px of line work: may be part of it → keep; loose dash with an aligned neighbour → keep
  - other loose ink (text, symbols, map noise) → drop
"""
import os, sys
from collections import deque
import numpy as np
from PIL import Image, ImageFilter

# Undilated ink in the plan image: STRICT keeps bold labels apart from lines; LIGHT still catches thin grey connectors.
STRICT, LIGHT = 100, 150
N8 = [(-1, -1), (-1, 0), (-1, 1), (0, -1), (0, 1), (1, -1), (1, 0), (1, 1)]


def opening(ink, length, angles=48):
    """Ink lying on a straight run of `length` px in some direction (morphological opening by rotated lines)."""
    h, w = ink.shape; r = length // 2; P = np.pad(ink, r); keep = np.zeros_like(ink)
    for k in range(angles):
        a = np.pi * k / angles
        offs = sorted({(round(t * np.sin(a)), round(t * np.cos(a))) for t in range(-r, r + 1)})
        E = np.ones_like(ink)
        for dy, dx in offs: E &= P[r + dy:r + dy + h, r + dx:r + dx + w]
        EP = np.pad(E, r); D = np.zeros_like(ink)
        for dy, dx in offs: D |= EP[r - dy:r - dy + h, r - dx:r - dx + w]
        keep |= D
    return keep & ink


def components(b):
    h, w = b.shape; seen = np.zeros_like(b); out = []
    for y, x in zip(*np.nonzero(b)):
        if seen[y, x]: continue
        q = deque([(y, x)]); seen[y, x] = 1; px = []
        while q:
            cy, cx = q.popleft(); px.append((cy, cx))
            for dy, dx in N8:
                Y, X = cy + dy, cx + dx
                if 0 <= Y < h and 0 <= X < w and b[Y, X] and not seen[Y, X]: seen[Y, X] = 1; q.append((Y, X))
        out.append(np.array(px))
    return out


def shape(px):
    """Length and width along/across the principal axis, the axis, and the centre."""
    c = px - px.mean(0); vt = np.linalg.svd(c.astype(float), full_matrices=True)[2]; a = c @ vt[0]; b = c @ vt[1]
    return a.max() - a.min() + 1, b.max() - b.min() + 1, vt[0], px.mean(0)


def contact_groups(pts, gap=4):
    out = []; left = [tuple(p) for p in pts]
    while left:
        g = [left.pop()]; q = [g[0]]
        while q:
            a = q.pop(); near = [p for p in left if abs(p[0] - a[0]) <= gap and abs(p[1] - a[1]) <= gap]
            for p in near: left.remove(p); q.append(p); g.append(p)
        out.append(np.array(g, float).mean(0))
    return out


def direction(lines, c, r=8):
    y, x = int(c[0]), int(c[1]); pts = np.argwhere(lines[max(0, y - r):y + r + 1, max(0, x - r):x + r + 1]).astype(float)
    if len(pts) < 3: return None
    pts -= pts.mean(0); return np.linalg.svd(pts, full_matrices=True)[2][0]


def bridges(touch, lines):
    """Joins two lines running different ways, or reaches across from one line to another (not one line twice)."""
    gs = contact_groups(touch)
    for i in range(len(gs)):
        for j in range(i + 1, len(gs)):
            a, b = direction(lines, gs[i]), direction(lines, gs[j]); d = gs[j] - gs[i]
            if a is None or b is None or np.hypot(*d) < 6: continue
            if abs(a @ b) < .94 or abs(d @ np.array([-a[1], a[0]])) > 6: return True
    return False


def lines_only(ink, strict, light):
    """ink: dilated threshold (the raw mask); strict/light: undilated ink from the plan image at two darkness cut-offs."""
    h, w = ink.shape; lines = opening(ink, 41); keep = lines.copy(); info = []; loose = []
    for px in components(ink & ~lines):
        L, W, axis, cen = shape(px); info.append((px, L, W, axis, cen))
    for i, (px, L, W, axis, cen) in enumerate(info):
        ys, xs = px[:, 0], px[:, 1]
        near = np.zeros(len(ys), bool)
        for dy, dx in N8: near |= lines[np.clip(ys + dy, 0, h - 1), np.clip(xs + dx, 0, w - 1)]
        if not near.any(): loose.append(i); continue
        size = np.hypot(np.ptp(ys) + 1, np.ptp(xs) + 1)
        if size <= 12: keep[ys, xs] = 1; continue  # junction filler / line joint
        def joins(ink0):
            core = ink0[ys, xs]; touch = set()
            for dy, dx in N8:
                Y = np.clip(ys[core] + dy, 0, h - 1); X = np.clip(xs[core] + dx, 0, w - 1); m = lines[Y, X] & ink0[Y, X]
                touch.update(zip(Y[m].tolist(), X[m].tolist()))
            return list(touch)
        # Joined in the undilated drawing and either long (a curve) or bridging two lines. Labels sit apart on paper.
        if size > 40 and joins(strict) or bridges(joins(light), lines): keep[ys, xs] = 1
    P = np.pad(keep, 3); nearby = np.zeros_like(keep)
    for dy in range(-3, 4):
        for dx in range(-3, 4): nearby |= P[3 + dy:3 + dy + h, 3 + dx:3 + dx + w]
    dash = [i for i in loose if info[i][1] >= 6 and info[i][1] >= 1.8 * info[i][2] and info[i][2] <= 6]
    DI = np.array(dash); DC = np.array([info[j][4] for j in dash]).reshape(-1, 2); DA = np.array([info[j][3] for j in dash]).reshape(-1, 2); DL = np.array([info[j][1] for j in dash])
    dashes = set(dash)
    for i in loose:
        px, L, W, axis, cen = info[i]; ys, xs = px[:, 0], px[:, 1]
        if nearby[ys, xs].any(): keep[ys, xs] = 1; continue
        if i in dashes:
            d = DC - cen; along = d @ axis; perp = np.abs(d @ np.array([-axis[1], axis[0]]))
            if ((perp < 3) & (np.abs(DA @ axis) > .9) & (np.abs(along) < (L + DL) / 2 + 9) & (DI != i)).any(): keep[ys, xs] = 1
    return keep


def clean(raw_mask, plan):
    """raw_mask, plan: greyscale PIL images of the same crop. Returns the cleaned mask image (0 = line, 255 = paper)."""
    ink = np.array(raw_mask.convert('L')) <= 127; grey = np.array(plan.convert('L'))
    return Image.fromarray(np.where(lines_only(ink, (grey < STRICT) & ink, (grey < LIGHT) & ink), 0, 255).astype(np.uint8)).convert('1')


def self_check():
    """A lot outline with a label written against its inside edge and a curved corner: label goes, lines stay."""
    from PIL import ImageDraw, ImageFont
    img = Image.new('L', (220, 160), 255); d = ImageDraw.Draw(img)
    d.line([(20, 20), (200, 20)], fill=0, width=3); d.line([(20, 20), (20, 140)], fill=0, width=3)
    d.line([(200, 20), (200, 110)], fill=0, width=3); d.line([(20, 140), (170, 140)], fill=0, width=3)
    d.arc([140, 80, 200, 140], 0, 90, fill=0, width=3)                     # rounded corner joining the two sides
    d.text((70, 124), 'G/IC', fill=0, font=ImageFont.load_default(size=16))  # label sitting on the bottom line
    raw = img.point(lambda v: 0 if v < 100 else 255).filter(ImageFilter.MinFilter(3))
    out = np.array(clean(raw, img).convert('L')) <= 127
    assert out[20, 100] and out[70, 20] and out[70, 200] and out[140, 60], 'boundary lines kept'
    assert out[131, 191] or out[132, 190] or out[133, 189], 'curved corner kept'
    assert not out[124:134, 72:110].any(), 'label against the line removed'
    print('ozp_lines self-check passed')


if __name__ == '__main__' and '--check' in sys.argv:
    self_check(); sys.exit()
if __name__ == '__main__':
    lots = os.path.join(os.path.dirname(__file__), '..', 'public', 'lots')
    out = clean(Image.open(os.path.join(lots, 'ozp-mask-raw.png')), Image.open(os.path.join(lots, 'ozp-underlay.jpg')))
    out.save(os.path.join(lots, 'ozp-mask.png')); print('wrote public/lots/ozp-mask.png')
