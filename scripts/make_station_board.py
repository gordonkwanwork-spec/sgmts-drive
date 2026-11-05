"""SGMTS back-wall logo board, after the 2025-09 Enscape station renders (ACABAS photomontage set).
Run with system python3 (Pillow); build_assets.py embeds the PNG in every station GLB."""
from pathlib import Path
from PIL import Image, ImageDraw, ImageFont

OUT = Path(__file__).resolve().parents[1] / 'assets/textures/sgmts-board.png'
W, H = 1200, 440
BLUE, TEAL, GREEN, ORANGE = (28, 78, 140), (22, 150, 150), (40, 160, 90), (235, 90, 35)
zh = lambda s: ImageFont.truetype('/System/Library/Fonts/STHeiti Medium.ttc', s)
latin = ImageFont.truetype('/System/Library/Fonts/Helvetica.ttc', 150, index=1)

im = Image.new('RGB', (W, H), (246, 247, 245)); d = ImageDraw.Draw(im)
d.rectangle((0, 0, W - 1, H - 1), outline=(60, 64, 66), width=10)
d.rounded_rectangle((60, 34, 520, 92), 12, fill=ORANGE)
d.text((80, 40), '洪水橋/厦村 HSK/HT', font=zh(40), fill='white')
d.text((70, 100), 'SGMTS', font=latin, fill=BLUE)
# Circuit traces running out of the wordmark into a tram outline.
for y, c in [(282, TEAL), (306, GREEN)]:
    d.line((70, y, 560, y, 600, y - 24, 760, y - 24), fill=c, width=8)
    for x in (70, 560, 760): d.ellipse((x - 11, y - 11 - (24 if x == 760 else 0), x + 11, y + 11 - (24 if x == 760 else 0)), outline=c, width=6)
d.rounded_rectangle((790, 150, 1130, 300), 30, outline=GREEN, width=12)
for x in (830, 900, 970, 1040): d.rounded_rectangle((x, 180, x + 55, 232), 8, outline=GREEN, width=7)
for x in (860, 1060): d.ellipse((x - 26, 282, x + 26, 334), outline=GREEN, width=10, fill=(246, 247, 245))
d.text((70, 334), '智慧綠色集體運輸系統', font=zh(76), fill=TEAL)
OUT.parent.mkdir(parents=True, exist_ok=True); im.save(OUT, optimize=True)
print(OUT, OUT.stat().st_size)
