"""Prepare clean turnaround sheets and isolated Tripo input views from generated reference images.

Copies the generated sheets into assets/character-references/2026-11-17-pedestrians-and-pets/,
crops each view into a centered 1024x1024 pure-white PNG under input-views/<id>/,
and stages upload PNGs into the active conversation's browser_sandbox/uploads/ if requested.
"""
import argparse
from pathlib import Path
from PIL import Image, ImageOps

ROOT = Path(__file__).resolve().parents[1]
ARTIFACT_DIR = Path('/Users/Gordon/.gemini/antigravity/brain/02ae8f16-6f18-46b8-9df8-194f0d509115')
REF_DIR = ROOT / 'assets/character-references/2026-11-17-pedestrians-and-pets'
INPUT_DIR = REF_DIR / 'input-views'

# Map asset id -> (source filename in ARTIFACT_DIR, (cols, rows), {view_name: (col, row, flip_x)})
ASSETS = {
    'p05-young-man': (
        'hk_man_turnaround_sheet_v3_1794919207437.jpg',
        (2, 2),
        {'front': (0, 0, False), 'back': (1, 0, False), 'left': (0, 1, True), 'three-quarter': (1, 1, False)},
    ),
    'p06-sporty-woman': (
        'hk_woman_turnaround_2x2_v2_1794919180235.jpg',
        (4, 2),
        {'front': (0, 0, False), 'back': (1, 0, False), 'left': (0, 1, True), 'three-quarter': (2, 1, False)},
    ),
    'p07-middle-aged-man': (
        'hk_man_turnaround_sheet_1794919159001.jpg',
        (4, 2),
        {'front': (0, 0, False), 'back': (2, 0, False), 'left': (0, 1, False), 'three-quarter': (1, 1, False)},
    ),
    'd01-shiba-inu': (
        'shiba_inu_turnaround_clean_1794919196614.jpg',
        (2, 2),
        {'front': (0, 0, False), 'back': (1, 0, False), 'left': (0, 1, False), 'three-quarter': (1, 1, False)},
    ),
    'd02-corgi': (
        'corgi_turnaround_2x2_1794919188015.jpg',
        (2, 2),
        {'front': (0, 0, False), 'back': (1, 0, False), 'left': (0, 1, False), 'three-quarter': (1, 1, False)},
    ),
    'c01-ginger-tabby': (
        'hk_ginger_cat_turnaround_2x2_1794919184696.jpg',
        (2, 2),
        {'front': (0, 0, False), 'back': (1, 0, False), 'left': (0, 1, False), 'three-quarter': (1, 1, False)},
    ),
    'c02-tuxedo-cat': (
        'tuxedo_cat_turnaround_sheet_1794919184693.jpg',
        (2, 2),
        {'front': (0, 0, False), 'back': (1, 0, False), 'left': (0, 1, False), 'three-quarter': (1, 1, False)},
    ),
    'c03-calico-cat': (
        'calico_cat_turnaround_sheet_1794919188883.jpg',
        (2, 2),
        {'front': (0, 0, False), 'back': (1, 0, False), 'left': (0, 1, False), 'three-quarter': (1, 1, False)},
    ),
}


def nonwhite_bbox(img: Image.Image, threshold: int = 246):
    gray = img.convert('L')
    mask = gray.point(lambda p: 255 if p < threshold else 0)
    return mask.getbbox()


def center_on_square(cell: Image.Image, size: int = 1024, margin_ratio: float = 0.08) -> Image.Image:
    bbox = nonwhite_bbox(cell)
    subject = cell.crop(bbox) if bbox else cell
    # Clean near-white JPEG compression noise around the white background.
    rgb = subject.convert('RGB')
    px = rgb.load()
    w, h = rgb.size
    for y in range(h):
        for x in range(w):
            r, g, b = px[x, y]
            if r >= 249 and g >= 249 and b >= 249:
                px[x, y] = (255, 255, 255)
    max_dim = int(size * (1 - 2 * margin_ratio))
    scale = min(max_dim / w, max_dim / h)
    nw, nh = max(1, round(w * scale)), max(1, round(h * scale))
    resized = rgb.resize((nw, nh), Image.Resampling.LANCZOS)
    canvas = Image.new('RGB', (size, size), (255, 255, 255))
    canvas.paste(resized, ((size - nw) // 2, (size - nh) // 2))
    return canvas


def main():
    parser = argparse.ArgumentParser()
    parser.add_argument('--stage-uploads', action='store_true', help='Copy upload views to browser_sandbox/uploads')
    args = parser.parse_args()

    REF_DIR.mkdir(parents=True, exist_ok=True)
    INPUT_DIR.mkdir(parents=True, exist_ok=True)
    upload_dir = ARTIFACT_DIR / 'browser_sandbox/uploads'
    if args.stage_uploads:
        upload_dir.mkdir(parents=True, exist_ok=True)

    for asset_id, (src_name, (cols, rows), views) in ASSETS.items():
        src_path = ARTIFACT_DIR / src_name
        if not src_path.exists():
            print(f'SKIP missing {src_path}')
            continue
        sheet = Image.open(src_path).convert('RGB')
        sheet.save(REF_DIR / f'{asset_id}.png', 'PNG')
        sw, sh = sheet.size
        cw, ch = sw / cols, sh / rows
        out_dir = INPUT_DIR / asset_id
        out_dir.mkdir(parents=True, exist_ok=True)
        short = asset_id.split('-')[0]
        for view_name, (col, row, flip_x) in views.items():
            box = (round(col * cw), round(row * ch), round((col + 1) * cw), round((row + 1) * ch))
            cell = sheet.crop(box)
            if flip_x:
                cell = ImageOps.mirror(cell)
            isolated = center_on_square(cell)
            out_path = out_dir / f'{view_name}.png'
            isolated.save(out_path, 'PNG')
            if args.stage_uploads and view_name in ('front', 'back', 'left', 'three-quarter'):
                tag = '3q' if view_name == 'three-quarter' else view_name
                isolated.save(upload_dir / f'{short}-{tag}.png', 'PNG')
        print(f'{asset_id}: extracted {len(views)} views from {src_name} ({sw}x{sh})')


if __name__ == '__main__':
    main()
