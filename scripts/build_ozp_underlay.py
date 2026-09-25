"""Crop the S/HSK/2A OZP (1:7500) around the corridor into a georeferenced underlay + lot-boundary mask.
Usage: python3 scripts/build_ozp_underlay.py "<Annex II_S_HSK_2A.pdf | 150 dpi render .png>"
World frame = src/alignment.js (x east, z south, metres, origin at A1 trace start)."""
import json, subprocess, sys, tempfile, os
from PIL import Image, ImageFilter
Image.MAX_IMAGE_PIXELS = None
DPI = 150
M_PER_PX = 7500 * 0.0254 / DPI            # 1.27 m
ORIGIN_PX = (1832, 4108)                  # world (0,0) on the 150 dpi page; fitted by overlaying alignment.PATH
CROP = (1303, 1107, 2418, 4384)           # corridor bbox + ~350 m
out = os.path.join(os.path.dirname(__file__), '..', 'public', 'lots')
if sys.argv[1].lower().endswith('.png'):   # an existing 150 dpi render of the same sheet
    page = Image.open(sys.argv[1]).convert('L')
else:
    with tempfile.TemporaryDirectory() as t:
        subprocess.run(['pdftoppm', '-r', str(DPI), '-gray', '-png', sys.argv[1], t + '/p'], check=True)
        page = Image.open(t + '/p-1.png').convert('L')
img = page.crop(CROP)
img.save(os.path.join(out, 'ozp-underlay.jpg'), quality=82)
# Zoning boundaries are the darkest ink; grey base-map linework drops out. Dilate 1 px to close line breaks.
mask = img.point(lambda v: 0 if v < 100 else 255).filter(ImageFilter.MinFilter(3))
mask.convert('1').save(os.path.join(out, 'ozp-mask.png'))
json.dump({'source': 'S/HSK/2A (Annex II), 1:7500', 'width': img.width, 'height': img.height, 'metresPerPixel': M_PER_PX,
           'originX': -(ORIGIN_PX[0] - CROP[0]) * M_PER_PX, 'originZ': -(ORIGIN_PX[1] - CROP[1]) * M_PER_PX},
          open(os.path.join(out, 'ozp-underlay.json'), 'w'), indent=1)
print(img.size)
