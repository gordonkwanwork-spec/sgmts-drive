#!/usr/bin/env python3
"""Download 4 pre-isolated 3DGS objects from marcelpadilla/splats, normalise to metric Y-up game space,
pack into GSP1 .gsplat files, and generate convex hull proxies for Station A1 roundabout testing.

Usage: python3 scripts/build-a1-roundabout-splats.py
"""
import json
import math
import sys
import urllib.request
from pathlib import Path

import numpy as np

FOLDER = Path(__file__).resolve().parent
ROOT = FOLDER.parent
sys.path.insert(0, str(FOLDER))
from gsplat_pack import C0, pack  # noqa: E402

BASE_URL = 'https://raw.githubusercontent.com/marcelpadilla/splats/main/data/'
CACHE_DIR = Path('/tmp/sgmts-3dgs-cache')
ASSETS_DIR = ROOT / 'public/assets'
HULLS_PATH = ROOT / 'src/a1-roundabout-splats-hulls.json'

ASSETS = [
    {
        'kind': 'bonsai',
        'src': 'bonsai_generated/bonsai_generated.splat',
        'out': 'a1-splat-bonsai.gsplat',
        'target_height': 1.55,
        'max_splats': 65000,
    },
    {
        'kind': 'plant',
        'src': 'plant/plant.splat',
        'out': 'a1-splat-plant.gsplat',
        'target_height': 0.95,
        'max_splats': 45000,
    },
    {
        'kind': 'garden-stool',
        'src': 'garden_stool_generated/garden_stool_generated.splat',
        'out': 'a1-splat-garden-stool.gsplat',
        'target_height': 0.52,
        'max_splats': 55000,
    },
    {
        'kind': 'lantern',
        'src': 'candle_lantern_generated/candle_lantern_generated.splat',
        'out': 'a1-splat-lantern.gsplat',
        'target_height': 0.68,
        'max_splats': 50000,
    },
]

FIB_DIRS = np.array([
    [np.cos(2.39996 * k) * np.sqrt(1 - z * z), z, np.sin(2.39996 * k) * np.sqrt(1 - z * z)]
    for k, z in enumerate(np.linspace(-1, 1, 96))
])


def fetch_splat(src: str) -> bytes:
    CACHE_DIR.mkdir(parents=True, exist_ok=True)
    cached = CACHE_DIR / Path(src).name
    if not cached.exists() or cached.stat().st_size == 0:
        url = BASE_URL + src
        print(f'Downloading {url} ...')
        req = urllib.request.Request(url, headers={'User-Agent': 'Mozilla/5.0'})
        with urllib.request.urlopen(req, timeout=60) as r:
            data = r.read()
        cached.write_bytes(data)
    return cached.read_bytes()


def decode_antimatter15(buf: bytes):
    if len(buf) == 0 or len(buf) % 32 != 0:
        raise ValueError(f'Invalid .splat size: {len(buf)} bytes')
    a = np.frombuffer(buf, dtype=np.uint8).reshape(-1, 32)
    pos = a[:, 0:12].copy().view('<f4')
    scale = a[:, 12:24].copy().view('<f4')
    rgba = a[:, 24:28]
    rgb = rgba[:, :3].astype(np.float32) / 255.0
    alpha = rgba[:, 3].astype(np.float32) / 255.0
    q = (a[:, 28:32].astype(np.float32) - 128.0) / 128.0
    return pos, scale, rgb, alpha, q


def process_asset(cfg: dict) -> dict:
    raw = fetch_splat(cfg['src'])
    pos, scale, rgb, alpha, q = decode_antimatter15(raw)

    q_norm = np.linalg.norm(q, axis=1, keepdims=True)
    valid = (
        np.all(np.isfinite(pos), axis=1)
        & np.all(np.isfinite(scale), axis=1)
        & np.all(scale > 1e-6, axis=1)
        & (q_norm[:, 0] > 1e-6)
        & (alpha >= 0.08)
    )
    pos, scale, rgb, alpha, q = pos[valid], scale[valid], rgb[valid], alpha[valid], q[valid] / q_norm[valid]

    # Source assets have up_axis = "-y"; rotate 180 deg about Z to convert to game Y-up.
    P = np.stack([-pos[:, 0], -pos[:, 1], pos[:, 2]], axis=1)
    q2 = np.stack([-q[:, 3], -q[:, 2], q[:, 1], q[:, 0]], axis=1)

    # Drop sparse floaters outside the dense object body.
    v = np.floor(P / 0.03).astype(np.int32)
    _, inv, cnt = np.unique(v, axis=0, return_inverse=True, return_counts=True)
    dense = cnt[inv.ravel()] >= 3
    P, scale, rgb, alpha, q2 = P[dense], scale[dense], rgb[dense], alpha[dense], q2[dense]

    # Metric normalisation from opaque body splats so stray halo splats don't float the base.
    body_mask = alpha >= 0.35
    body = P[body_mask] if np.any(body_mask) else P
    y_lo, y_hi = np.percentile(body[:, 1], [0.5, 99.5])
    cx = (np.percentile(body[:, 0], 1) + np.percentile(body[:, 0], 99)) * 0.5
    cz = (np.percentile(body[:, 2], 1) + np.percentile(body[:, 2], 99)) * 0.5
    s = cfg['target_height'] / max(float(y_hi - y_lo), 1e-4)

    X = np.stack([(P[:, 0] - cx) * s, (P[:, 1] - y_lo) * s, (P[:, 2] - cz) * s], axis=1)
    keep = X[:, 1] >= -0.02
    X, scale, rgb, alpha, q2 = X[keep], scale[keep], rgb[keep], alpha[keep], q2[keep]

    max_splats = cfg.get('max_splats')
    if max_splats and len(X) > max_splats:
        orig_len = len(X)
        imp = alpha * (scale.mean(axis=1) ** 2)
        order = np.argsort(-imp, kind='stable')
        k_hi = int(max_splats * 0.60)
        k_lo = max_splats - k_hi
        tail = order[k_hi:]
        stride_idx = np.linspace(0, len(tail) - 1, k_lo, dtype=np.int64)
        keep_idx = np.concatenate([order[:k_hi], tail[stride_idx]])
        X = X[keep_idx]
        scale = scale[keep_idx] * min(1.30, math.sqrt(orig_len / max_splats))
        rgb = rgb[keep_idx]
        alpha = alpha[keep_idx]
        q2 = q2[keep_idx]

    dc = (rgb - 0.5) / C0
    alpha_c = np.clip(alpha, 1e-4, 1.0 - 1e-4)
    opacity_logit = np.log(alpha_c / (1.0 - alpha_c))
    logscale = np.log(np.maximum(scale * s, 1e-6))

    ASSETS_DIR.mkdir(parents=True, exist_ok=True)
    out_path = ASSETS_DIR / cfg['out']
    nbytes = pack(out_path, X, dc, opacity_logit, logscale, q2)

    body_X = X[alpha >= 0.35] if np.any(alpha >= 0.35) else X
    body_X = body_X[body_X[:, 1] >= 0.0]
    hull = np.unique(np.round(body_X[np.argmax(body_X @ FIB_DIRS.T, axis=0)], 3), axis=0).tolist()
    height = float(round(float(body_X[:, 1].max()), 3))
    center_y = float(round(height * 0.5, 3))
    radius = float(round(float(np.linalg.norm(body_X - np.array([0.0, center_y, 0.0]), axis=1).max()) + 0.1, 3))

    bmin = X.min(0).round(3).tolist()
    bmax = X.max(0).round(3).tolist()
    print(f"{cfg['kind']:14s} | splats={len(X):6d} | MB={nbytes / 1e6:.2f} | bounds={bmin}..{bmax} | height={height:.3f}m | hull={len(hull)} pts")
    return {
        'asset': cfg['out'],
        'height': height,
        'centerY': center_y,
        'radius': radius,
        'splats': int(len(X)),
        'hull': hull,
    }


def main():
    hulls = {}
    for cfg in ASSETS:
        hulls[cfg['kind']] = process_asset(cfg)
    HULLS_PATH.write_text(json.dumps(hulls))
    print(f'Wrote {HULLS_PATH}')


if __name__ == '__main__':
    main()
