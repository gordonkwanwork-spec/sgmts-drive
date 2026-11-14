# Dev tool: draw scripts/city-overlay.mjs output on the OZP underlay.
# Run: python3 scripts/city_overlay.py overlay.json out.png [x0 z0 x1 z1] [scale]
import json, sys
from PIL import Image, ImageDraw, ImageFont
d = json.load(open(sys.argv[1])); u = json.load(open('public/lots/ozp-underlay.json'))
S = float(sys.argv[7]) if len(sys.argv) > 7 else 2.0
img = Image.open('public/lots/ozp-underlay.jpg').convert('RGB'); k = S; img = img.resize((int(img.width * k), int(img.height * k)))
mpp = u['metresPerPixel'] / k
P = lambda x, z: ((x - u['originX']) / mpp, (z - u['originZ']) / mpp)
ov = Image.new('RGBA', img.size, (0, 0, 0, 0)); g = ImageDraw.Draw(ov)
ZC = {'R': (255, 170, 60), 'C': (230, 60, 60), 'G': (60, 150, 230), 'O': (60, 190, 90), 'V': (170, 120, 70), 'I': (150, 90, 200)}
for l in d['lots']:
    z = l['zone']; c = ZC['O'] if z.startswith('O') and not z.startswith('OU') else (130, 130, 160) if z.startswith('OU') else ZC.get(z[0], (120, 120, 120))
    if z == 'GB': c = (20, 110, 40)
    g.polygon([P(*p) for p in l['poly']], fill=c + (70,), outline=c + (255,))
for x, z, r in d['reserve']: g.ellipse([P(x - r, z - r), P(x + r, z + r)], fill=(255, 140, 0, 60))
g.line([P(*p) for p in d['corridor']], fill=(255, 100, 0, 255), width=3)
g.polygon([P(p['x'], p['z']) if isinstance(p, dict) else P(*p) for p in d['depot']], outline=(255, 100, 0, 255))
w = lambda m: max(1, int(m / mpp))
g.line([P(*p) for p in d['service']['pts']], fill=(200, 0, 200, 200), width=w(d['service']['hw'] * 2))
for r in d['roads']:
    pts = [P(*p) for p in r['pts']]
    g.line(pts, fill=(250, 250, 120, 150), width=w(r['hw'] * 2), joint='curve'); g.line(pts, fill=(40, 40, 40, 220), width=w(r['cw'] * 2), joint='curve')
    if r['head']: x, z = r['pts'][-1]; h = r['head']; g.ellipse([P(x - h, z - h), P(x + h, z + h)], fill=(40, 40, 40, 220))
for c in d['crossings']:
    a = P(c['x'] - c['ux'] * c['extent'], c['z'] - c['uz'] * c['extent']); b = P(c['x'] + c['ux'] * c['extent'], c['z'] + c['uz'] * c['extent'])
    g.line([a, b], fill=(0, 200, 255, 255) if c['under'] else (255, 0, 0, 255), width=w(c['hw'] * 2))
img = Image.alpha_composite(img.convert('RGBA'), ov); g = ImageDraw.Draw(img)
try: f = ImageFont.truetype('/System/Library/Fonts/Helvetica.ttc', int(7 * k))
except Exception: f = ImageFont.load_default()
for l in d['lots']:
    xs = [p[0] for p in l['poly']]; zs = [p[1] for p in l['poly']]; g.text(P(sum(xs) / len(xs), sum(zs) / len(zs)), l['id'], fill=(0, 0, 120), font=f)
for r in d['roads']: m = r['pts'][len(r['pts']) // 2]; g.text(P(*m), r['id'].replace('city-', ''), fill=(200, 0, 0), font=f)
for c in d['crossings']: g.text(P(c['x'] + 10, c['z']), f"Ch{c['c']}", fill=(0, 90, 200), font=f)
for s, x, z in d['stops']: g.text(P(x + 8, z), s, fill=(255, 80, 0), font=f)
# 100 m grid with world coordinates
import math
x0, z0 = u['originX'], u['originZ']; x1, z1 = x0 + img.width * mpp, z0 + img.height * mpp
for x in range(int(math.ceil(x0 / 100)) * 100, int(x1), 100): g.line([P(x, z0), P(x, z1)], fill=(0, 0, 0, 40)); [g.text(P(x + 2, z), str(x), fill=(90, 90, 90), font=f) for z in range(int(math.ceil(z0 / 500)) * 500, int(z1), 500)]
for z in range(int(math.ceil(z0 / 100)) * 100, int(z1), 100): g.line([P(x0, z), P(x1, z)], fill=(0, 0, 0, 40)); g.text(P(x0 + 4, z + 1), str(z), fill=(90, 90, 90), font=f)
if len(sys.argv) > 6:
    a = P(float(sys.argv[3]), float(sys.argv[4])); b = P(float(sys.argv[5]), float(sys.argv[6])); img = img.crop((int(a[0]), int(a[1]), int(b[0]), int(b[1])))
img.convert('RGB').save(sys.argv[2])
