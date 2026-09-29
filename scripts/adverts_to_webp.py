#!/usr/bin/env python3
"""Advert PNG sources (assets/advert-sources/) -> the WebP textures the game loads (public/assets/).
Billboards and tram sides 2172x724 -> 1536x512 (still 3:1), station posters 1024x1536 -> 768x1152, plaza atlas kept.
Run from sgmts-game/ after adding or changing a source PNG."""
import glob, os, sys
from PIL import Image
SRC = 'assets/advert-sources'
SIZES = {'adverts/billboard-': (1536, 512), 'adverts/A': (768, 1152), 'tram-adverts/': (1536, 512), 'plaza/': None}
for png in sorted(glob.glob(f'{SRC}/*/*.png')):
    rel = os.path.relpath(png, SRC)
    size = next((s for k, s in SIZES.items() if rel.startswith(k)), None)
    im = Image.open(png)
    if size: im = im.convert('RGB').resize(size, Image.LANCZOS)
    out = f'public/assets/{rel[:-4]}.webp'
    im.save(out, 'WEBP', quality=86, method=6)
    print(f'{out} {im.size} {os.path.getsize(out)//1024} KB')
