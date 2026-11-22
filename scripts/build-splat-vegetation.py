#!/usr/bin/env python3
"""Convert Poly Haven CC0 botanical 3D models (1k glTF) into surface-tangent anisotropic
3D Gaussian Splats (.gsplat, GSP1) and convex hull proxies for reusable game vegetation.

Usage: python3 scripts/build-splat-vegetation.py
"""
import json
import math
import struct
import sys
import urllib.request
from pathlib import Path

import numpy as np
from PIL import Image

FOLDER = Path(__file__).resolve().parent
ROOT = FOLDER.parent
sys.path.insert(0, str(FOLDER))
from gsplat_pack import C0, pack  # noqa: E402

CACHE_DIR = Path('/tmp/sgmts-polyhaven-cache')
ASSETS_DIR = ROOT / 'public/assets'
HULLS_PATH = ROOT / 'src/splat-vegetation-hulls.json'

ASSETS = [
    {
        'id': 'tree-banyan',
        'ph_id': 'island_tree_01',
        'mesh_index': 0,
        'category': 'tree',
        'out': 'veg-tree-banyan.gsplat',
        'target_height': 6.5,
        'target_splats': 95000,
        'wood_fraction': 0.35,
        'trim_trunk_y': 0.14,  # drop flat grey sand mound under island_tree_01 roots
    },
    {
        'id': 'tree-street',
        'ph_id': 'tree_small_02',
        'mesh_index': 0,
        'category': 'tree',
        'out': 'veg-tree-street.gsplat',
        'target_height': 5.8,
        'target_splats': 85000,
        'wood_fraction': 0.30,
        'trim_trunk_y': None,
    },
    {
        'id': 'bush-tall',
        'ph_id': 'searsia_lucida',
        'mesh_index': 0,
        'category': 'bush',
        'out': 'veg-bush-tall.gsplat',
        'target_height': 2.1,
        'target_splats': 54000,
        'wood_fraction': 0.18,
        'trim_trunk_y': None,
        'sink_m': 0.08,
    },
    {
        'id': 'bush-wide',
        'ph_id': 'searsia_burchellii',
        'mesh_index': 1,
        'category': 'bush',
        'out': 'veg-bush-wide.gsplat',
        'target_height': 1.65,
        'target_splats': 58000,
        'wood_fraction': 0.18,
        'trim_trunk_y': None,
        'sink_m': 0.08,
    },
]

FIB_DIRS = np.array([
    [np.cos(2.39996 * k) * np.sqrt(1 - z * z), z, np.sin(2.39996 * k) * np.sqrt(1 - z * z)]
    for k, z in enumerate(np.linspace(-1, 1, 96))
])

COMP_DTYPE = {
    5120: np.int8,
    5121: np.uint8,
    5122: np.int16,
    5123: np.uint16,
    5125: np.uint32,
    5126: np.float32,
}
TYPE_COUNT = {'SCALAR': 1, 'VEC2': 2, 'VEC3': 3, 'VEC4': 4}


def fetch_url(url: str, dest: Path):
    if dest.exists() and dest.stat().st_size > 0:
        return
    dest.parent.mkdir(parents=True, exist_ok=True)
    req = urllib.request.Request(url, headers={'User-Agent': 'Mozilla/5.0'})
    with urllib.request.urlopen(req, timeout=60) as r:
        dest.write_bytes(r.read())


def ensure_polyhaven_1k(ph_id: str) -> tuple[dict, Path]:
    base = CACHE_DIR / ph_id
    manifest_path = base / 'files.json'
    if not manifest_path.exists():
        print(f'Fetching Poly Haven manifest for {ph_id} ...')
        fetch_url(f'https://api.polyhaven.com/files/{ph_id}', manifest_path)
    manifest = json.loads(manifest_path.read_text())
    entry = manifest['gltf']['1k']['gltf']
    gltf_rel = Path(entry['url'].split('/')[-1])
    gltf_path = base / gltf_rel
    fetch_url(entry['url'], gltf_path)
    gltf = json.loads(gltf_path.read_text())

    # Only download .bin and needed diffuse/arm textures referenced by the gltf
    needed = set()
    for b in gltf.get('buffers', []):
        if 'uri' in b:
            needed.add(b['uri'])
    for im in gltf.get('images', []):
        uri = im.get('uri', '')
        if '_diff_' in uri or '_arm_' in uri:
            needed.add(uri)

    inc = entry.get('include', {})
    for rel in sorted(needed):
        if rel in inc:
            fetch_url(inc[rel]['url'], base / rel)
    return gltf, base


def read_accessor(gltf: dict, bin_data: bytes, acc_idx: int) -> np.ndarray:
    acc = gltf['accessors'][acc_idx]
    bv = gltf['bufferViews'][acc['bufferView']]
    dtype = np.dtype(COMP_DTYPE[acc['componentType']]).newbyteorder('<')
    ncomp = TYPE_COUNT[acc['type']]
    count = acc['count']
    offset = bv.get('byteOffset', 0) + acc.get('byteOffset', 0)
    stride = bv.get('byteStride', 0)
    elem_bytes = dtype.itemsize * ncomp
    if stride in (0, elem_bytes):
        arr = np.frombuffer(bin_data, dtype=dtype, count=count * ncomp, offset=offset).reshape(count, ncomp)
        return arr.copy()
    raw = np.frombuffer(bin_data, dtype=np.uint8, count=(count - 1) * stride + elem_bytes, offset=offset)
    strided = np.lib.stride_tricks.as_strided(
        raw, shape=(count, elem_bytes), strides=(stride, 1)
    ).copy()
    return strided.view(dtype).reshape(count, ncomp)


def apply_khr_transform(uv: np.ndarray, ext: dict | None) -> np.ndarray:
    if not ext:
        return uv
    scale = ext.get('scale', [1.0, 1.0])
    offset = ext.get('offset', [0.0, 0.0])
    rot = ext.get('rotation', 0.0)
    u = uv[:, 0] * scale[0]
    v = uv[:, 1] * scale[1]
    if rot:
        c, s = math.cos(rot), math.sin(rot)
        u, v = u * c + v * s, -u * s + v * c
    return np.stack([u + offset[0], v + offset[1]], axis=1)


def sample_texture_nearest(img_arr: np.ndarray, uv: np.ndarray) -> np.ndarray:
    h, w = img_arr.shape[:2]
    u = np.mod(uv[:, 0], 1.0)
    v = np.mod(uv[:, 1], 1.0)
    ix = np.floor(u * w).astype(np.int32) % w
    iy = np.floor(v * h).astype(np.int32) % h
    return img_arr[iy, ix]


def rotmat_to_quat(R: np.ndarray) -> np.ndarray:
    """Vectorized conversion of (N, 3, 3) proper rotation matrices to unit quaternions (w, x, y, z).
    Matches src/splat-lite.js line 18 convention."""
    n = len(R)
    q = np.empty((n, 4), dtype=np.float32)
    m00, m01, m02 = R[:, 0, 0], R[:, 0, 1], R[:, 0, 2]
    m10, m11, m12 = R[:, 1, 0], R[:, 1, 1], R[:, 1, 2]
    m20, m21, m22 = R[:, 2, 0], R[:, 2, 1], R[:, 2, 2]
    tr = m00 + m11 + m22

    c0 = tr > 0
    c1 = (~c0) & (m00 > m11) & (m00 > m22)
    c2 = (~c0) & (~c1) & (m11 > m22)
    c3 = (~c0) & (~c1) & (~c2)

    if np.any(c0):
        s = np.sqrt(np.maximum(1.0 + tr[c0], 1e-12)) * 2.0
        q[c0, 0] = 0.25 * s
        q[c0, 1] = (m21[c0] - m12[c0]) / s
        q[c0, 2] = (m02[c0] - m20[c0]) / s
        q[c0, 3] = (m10[c0] - m01[c0]) / s
    if np.any(c1):
        s = np.sqrt(np.maximum(1.0 + m00[c1] - m11[c1] - m22[c1], 1e-12)) * 2.0
        q[c1, 0] = (m21[c1] - m12[c1]) / s
        q[c1, 1] = 0.25 * s
        q[c1, 2] = (m01[c1] + m10[c1]) / s
        q[c1, 3] = (m02[c1] + m20[c1]) / s
    if np.any(c2):
        s = np.sqrt(np.maximum(1.0 + m11[c2] - m00[c2] - m22[c2], 1e-12)) * 2.0
        q[c2, 0] = (m02[c2] - m20[c2]) / s
        q[c2, 1] = (m01[c2] + m10[c2]) / s
        q[c2, 2] = 0.25 * s
        q[c2, 3] = (m12[c2] + m21[c2]) / s
    if np.any(c3):
        s = np.sqrt(np.maximum(1.0 + m22[c3] - m00[c3] - m11[c3], 1e-12)) * 2.0
        q[c3, 0] = (m10[c3] - m01[c3]) / s
        q[c3, 1] = (m02[c3] + m20[c3]) / s
        q[c3, 2] = (m12[c3] + m21[c3]) / s
        q[c3, 3] = 0.25 * s

    q /= np.linalg.norm(q, axis=1, keepdims=True)
    return q


def quat_to_rotmat_js(q: np.ndarray) -> np.ndarray:
    """Exact replica of src/splat-lite.js line 18 for self-testing."""
    qw, qx, qy, qz = q[:, 0], q[:, 1], q[:, 2], q[:, 3]
    R = np.empty((len(q), 3, 3), dtype=np.float32)
    R[:, 0, 0] = 1 - 2 * (qy * qy + qz * qz)
    R[:, 0, 1] = 2 * (qx * qy - qw * qz)
    R[:, 0, 2] = 2 * (qx * qz + qw * qy)
    R[:, 1, 0] = 2 * (qx * qy + qw * qz)
    R[:, 1, 1] = 1 - 2 * (qx * qx + qz * qz)
    R[:, 1, 2] = 2 * (qy * qz - qw * qx)
    R[:, 2, 0] = 2 * (qx * qz - qw * qy)
    R[:, 2, 1] = 2 * (qy * qz + qw * qx)
    R[:, 2, 2] = 1 - 2 * (qx * qx + qy * qy)
    return R


def verify_quat_convention():
    rng = np.random.default_rng(7)
    A = rng.normal(size=(16, 3, 3))
    T = A[:, :, 0]
    T /= np.linalg.norm(T, axis=1, keepdims=True)
    N = np.cross(T, A[:, :, 1])
    N /= np.linalg.norm(N, axis=1, keepdims=True)
    B = np.cross(N, T)
    R = np.stack([T, B, N], axis=2)
    q = rotmat_to_quat(R)
    R_back = quat_to_rotmat_js(q)
    assert np.allclose(R_back, R, atol=1e-4), 'Quaternion convention mismatch with splat-lite.js'


def load_image_float(path: Path) -> np.ndarray:
    return np.asarray(Image.open(path).convert('RGB'), dtype=np.float32) / 255.0


def build_asset(cfg: dict, rng: np.random.Generator) -> dict:
    gltf, base = ensure_polyhaven_1k(cfg['ph_id'])
    bin_path = base / gltf['buffers'][0]['uri']
    bin_data = bin_path.read_bytes()
    mesh = gltf['meshes'][cfg['mesh_index']]

    tex_cache = {}
    def get_tex(uri: str) -> np.ndarray:
        if uri not in tex_cache:
            tex_cache[uri] = load_image_float(base / uri)
        return tex_cache[uri]

    prims = []
    for p_idx, prim in enumerate(mesh['primitives']):
        if prim.get('mode', 4) != 4:
            continue
        attrs = prim['attributes']
        pos = read_accessor(gltf, bin_data, attrs['POSITION']).astype(np.float32)
        if 'NORMAL' in attrs:
            nrm = read_accessor(gltf, bin_data, attrs['NORMAL']).astype(np.float32)
        else:
            nrm = np.zeros_like(pos)
        if 'indices' in prim:
            tris = read_accessor(gltf, bin_data, prim['indices']).reshape(-1, 3).astype(np.int32)
        else:
            tris = np.arange(len(pos), dtype=np.int32).reshape(-1, 3)

        mat = gltf['materials'][prim['material']]
        mat_name = mat.get('name', f'prim_{p_idx}')
        is_leaf = 'leaves' in mat_name.lower()
        pbr = mat.get('pbrMetallicRoughness', {})

        bc = pbr.get('baseColorTexture', {})
        tc_idx = bc.get('texCoord', 0)
        uv_raw = read_accessor(gltf, bin_data, attrs.get(f'TEXCOORD_{tc_idx}', attrs['TEXCOORD_0'])).astype(np.float32)
        uv_diff = apply_khr_transform(uv_raw, (bc.get('extensions') or {}).get('KHR_texture_transform'))
        diff_uri = gltf['images'][gltf['textures'][bc['index']]['source']]['uri']
        diff_img = get_tex(diff_uri)

        mr = pbr.get('metallicRoughnessTexture', {})
        if 'index' in mr:
            mr_tc = mr.get('texCoord', 0)
            uv_mr_raw = uv_raw if mr_tc == tc_idx else read_accessor(gltf, bin_data, attrs[f'TEXCOORD_{mr_tc}']).astype(np.float32)
            uv_arm = apply_khr_transform(uv_mr_raw, (mr.get('extensions') or {}).get('KHR_texture_transform'))
            arm_uri = gltf['images'][gltf['textures'][mr['index']]['source']]['uri']
            arm_img = get_tex(arm_uri)
        else:
            uv_arm = uv_diff
            arm_img = None

        if cfg['trim_trunk_y'] is not None and not is_leaf:
            y_cent = pos[tris, 1].mean(axis=1)
            tris = tris[y_cent >= cfg['trim_trunk_y']]

        p0 = pos[tris[:, 0]]
        p1 = pos[tris[:, 1]]
        p2 = pos[tris[:, 2]]
        e1 = p1 - p0
        e2 = p2 - p0
        cross = np.cross(e1, e2)
        cross_norm = np.linalg.norm(cross, axis=1)
        valid_tri = cross_norm > 1e-12
        tris = tris[valid_tri]
        areas = 0.5 * cross_norm[valid_tri]
        face_nrm = cross[valid_tri] / cross_norm[valid_tri, None]
        e1 = e1[valid_tri]

        prims.append({
            'name': mat_name,
            'is_leaf': is_leaf,
            'pos': pos,
            'nrm': nrm,
            'uv_diff': uv_diff,
            'uv_arm': uv_arm,
            'diff_img': diff_img,
            'arm_img': arm_img,
            'tris': tris,
            'areas': areas,
            'area_sum': float(areas.sum()),
            'face_nrm': face_nrm,
            'e1': e1,
        })

    # Compute unified bounding box and center horizontally on the trunk/stem base.
    all_y_min = min(float(pr['pos'][pr['tris'].ravel(), 1].min()) for pr in prims)
    all_y_max = max(float(pr['pos'][pr['tris'].ravel(), 1].max()) for pr in prims)
    s_metric = cfg['target_height'] / max(all_y_max - all_y_min, 1e-4)

    wood_pts = np.concatenate([pr['pos'][pr['tris'].ravel()] for pr in prims if not pr['is_leaf']], axis=0)
    if len(wood_pts) == 0:
        wood_pts = np.concatenate([pr['pos'][pr['tris'].ravel()] for pr in prims], axis=0)
    low_thresh = all_y_min + 0.15 * (all_y_max - all_y_min)
    wood_low = wood_pts[wood_pts[:, 1] <= low_thresh]
    if len(wood_low) < 10:
        wood_low = wood_pts
    cx = 0.5 * float(wood_low[:, 0].min() + wood_low[:, 0].max())
    cz = 0.5 * float(wood_low[:, 2].min() + wood_low[:, 2].max())

    # Allocate splat quotas across wood vs leaf/twig primitives.
    total_target = cfg['target_splats']
    wood_target = int(round(total_target * cfg['wood_fraction']))
    leaf_target = total_target - wood_target
    wood_area = sum(pr['area_sum'] for pr in prims if not pr['is_leaf'])
    leaf_area = sum(pr['area_sum'] for pr in prims if pr['is_leaf'])

    for pr in prims:
        if pr['is_leaf']:
            pr['quota'] = max(1, int(round(leaf_target * (pr['area_sum'] / max(leaf_area, 1e-12)))))
        else:
            pr['quota'] = max(1, int(round(wood_target * (pr['area_sum'] / max(wood_area, 1e-12)))))

    all_P, all_N, all_T, all_rgb, all_arm, all_scales, all_alpha, all_is_leaf = [], [], [], [], [], [], [], []
    is_bush = cfg['category'] == 'bush'
    max_patch_leaf = 0.036 if is_bush else 0.078
    min_patch_leaf = 0.010 if is_bush else 0.016
    max_patch_wood = 0.028 if is_bush else 0.105
    min_patch_wood = 0.008 if is_bush else 0.012

    for pr in prims:
        quota = pr['quota']
        cdf = np.cumsum(pr['areas']) / pr['area_sum']
        tris = pr['tris']
        pos, nrm, uv_diff, uv_arm = pr['pos'], pr['nrm'], pr['uv_diff'], pr['uv_arm']
        diff_img, arm_img = pr['diff_img'], pr['arm_img']

        kept_batches = []
        total_tried = 0
        total_valid = 0
        oversample = 2.6 if pr['is_leaf'] else 1.15

        while total_valid < quota:
            need = max(int((quota - total_valid) * oversample), 2048)
            total_tried += need
            ti = np.searchsorted(cdf, rng.random(need), side='right')
            ti = np.minimum(ti, len(tris) - 1)
            r1 = np.sqrt(rng.random(need, dtype=np.float32))
            r2 = rng.random(need, dtype=np.float32)
            w0 = (1.0 - r1)[:, None]
            w1 = (r1 * (1.0 - r2))[:, None]
            w2 = (r1 * r2)[:, None]

            i0, i1, i2 = tris[ti, 0], tris[ti, 1], tris[ti, 2]
            uv_d = uv_diff[i0] * w0 + uv_diff[i1] * w1 + uv_diff[i2] * w2
            rgb = sample_texture_nearest(diff_img, uv_d)

            if pr['is_leaf']:
                ok = (rgb.max(axis=1) >= 0.11) & (rgb[:, 1] >= rgb[:, 0] * 0.88) if is_bush else (rgb.max(axis=1) >= 0.06)
            elif is_bush and 'twigs' in pr['name'].lower():
                ok = rgb.max(axis=1) >= 0.08
            else:
                ok = np.ones(need, dtype=bool)

            if not np.any(ok):
                if total_tried > quota * 40:
                    raise RuntimeError(f"Primitive {pr['name']} produced almost no non-black samples")
                continue

            ti_ok = ti[ok]
            w0_ok, w1_ok, w2_ok = w0[ok], w1[ok], w2[ok]
            i0_ok, i1_ok, i2_ok = i0[ok], i1[ok], i2[ok]

            P_b = pos[i0_ok] * w0_ok + pos[i1_ok] * w1_ok + pos[i2_ok] * w2_ok
            N_b = nrm[i0_ok] * w0_ok + nrm[i1_ok] * w1_ok + nrm[i2_ok] * w2_ok
            nl = np.linalg.norm(N_b, axis=1, keepdims=True)
            N_b = np.where(nl > 1e-6, N_b / np.maximum(nl, 1e-6), pr['face_nrm'][ti_ok])
            T_b = pr['e1'][ti_ok]
            if arm_img is not None:
                uv_a = uv_arm[i0_ok] * w0_ok + uv_arm[i1_ok] * w1_ok + uv_arm[i2_ok] * w2_ok
                arm_b = sample_texture_nearest(arm_img, uv_a)[:, 0]
            else:
                arm_b = np.ones(len(P_b), dtype=np.float32)

            kept_batches.append((P_b, N_b, T_b, rgb[ok], arm_b))
            total_valid += len(P_b)

        valid_ratio = total_valid / max(total_tried, 1)
        P_cat = np.concatenate([b[0] for b in kept_batches], axis=0)[:quota]
        N_cat = np.concatenate([b[1] for b in kept_batches], axis=0)[:quota]
        T_cat = np.concatenate([b[2] for b in kept_batches], axis=0)[:quota]
        rgb_cat = np.concatenate([b[3] for b in kept_batches], axis=0)[:quota]
        arm_cat = np.concatenate([b[4] for b in kept_batches], axis=0)[:quota]

        eff_area = pr['area_sum'] * valid_ratio * (s_metric ** 2)
        base_r = math.sqrt((eff_area / max(quota, 1)) / math.pi)
        if pr['is_leaf']:
            r = np.clip(1.55 * base_r, min_patch_leaf, max_patch_leaf) * rng.uniform(0.88, 1.12, size=quota).astype(np.float32)
            sc = np.stack([r, r, 0.42 * r], axis=1)
            alp = np.full(quota, 0.90 if is_bush else 0.88, dtype=np.float32)
        else:
            r = np.clip(1.45 * base_r, min_patch_wood, max_patch_wood)
            sc = np.full((quota, 3), r, dtype=np.float32)
            sc[:, 2] = 0.38 * r
            alp = np.full(quota, 0.94, dtype=np.float32)

        all_P.append(P_cat)
        all_N.append(N_cat)
        all_T.append(T_cat)
        all_rgb.append(rgb_cat)
        all_arm.append(arm_cat)
        all_scales.append(sc)
        all_alpha.append(alp)
        all_is_leaf.append(np.full(quota, pr['is_leaf'], dtype=bool))

    P = np.concatenate(all_P, axis=0)
    N = np.concatenate(all_N, axis=0)
    T_raw = np.concatenate(all_T, axis=0)
    diff_rgb = np.concatenate(all_rgb, axis=0)
    arm_r = np.concatenate(all_arm, axis=0)
    scales = np.concatenate(all_scales, axis=0)
    alpha = np.concatenate(all_alpha, axis=0)
    is_leaf = np.concatenate(all_is_leaf, axis=0)

    # Convert positions to game space (Y-up, base centered at origin, metres).
    sink_m = float(cfg.get('sink_m') or 0.0)
    X = np.stack([
        (P[:, 0] - cx) * s_metric,
        (P[:, 1] - all_y_min) * s_metric - sink_m,
        (P[:, 2] - cz) * s_metric,
    ], axis=1).astype(np.float32)
    if sink_m > 0:
        keep_y = X[:, 1] >= -0.05
        X, N, T_raw, diff_rgb, arm_r, scales, alpha, is_leaf = (
            X[keep_y], N[keep_y], T_raw[keep_y], diff_rgb[keep_y], arm_r[keep_y], scales[keep_y], alpha[keep_y], is_leaf[keep_y]
        )

    # Build orthonormal tangent frame [T, B, N] -> unit quaternion (w, x, y, z).
    N /= np.maximum(np.linalg.norm(N, axis=1, keepdims=True), 1e-8)
    T_ortho = T_raw - (T_raw * N).sum(axis=1, keepdims=True) * N
    t_norm = np.linalg.norm(T_ortho, axis=1, keepdims=True)
    fallback_axis = np.where(np.abs(N[:, 0:1]) < 0.9, np.array([[1.0, 0.0, 0.0]], np.float32), np.array([[0.0, 1.0, 0.0]], np.float32))
    fallback_t = np.cross(fallback_axis, N)
    T = np.where(t_norm > 1e-6, T_ortho / np.maximum(t_norm, 1e-6), fallback_t / np.maximum(np.linalg.norm(fallback_t, axis=1, keepdims=True), 1e-6))
    B = np.cross(N, T)
    B /= np.maximum(np.linalg.norm(B, axis=1, keepdims=True), 1e-8)
    R = np.stack([T, B, N], axis=2)
    q = rotmat_to_quat(R)

    # Bake soft morning daylight matching SGMTS DAY_LIGHT (linear lighting -> sRGB).
    lin = np.power(np.clip(diff_rgb, 0.0, 1.0), 2.2)
    tex_ao = 0.55 + 0.45 * arm_r
    h_frac = np.clip(X[:, 1] / cfg['target_height'], 0.0, 1.0)
    max_r = max(float(np.percentile(np.hypot(X[:, 0], X[:, 2]), 98)), 0.25)
    rad_frac = np.clip(np.hypot(X[:, 0], X[:, 2]) / max_r, 0.0, 1.0)
    macro_ao = np.clip(0.48 + 0.30 * h_frac + 0.26 * rad_frac, 0.48, 1.05)

    sun_dir = np.array([0.45, 0.72, 0.52], dtype=np.float32)
    sun_dir /= np.linalg.norm(sun_dir)
    ndotl = N @ sun_dir
    sky_factor = 0.5 + 0.5 * N[:, 1]

    direct = np.where(
        is_leaf,
        np.maximum(0.0, ndotl) * 0.72 + np.maximum(0.0, -ndotl) * 0.28,
        np.maximum(0.0, ndotl) * 0.75,
    )
    sky = np.where(is_leaf, 0.44 + 0.32 * sky_factor, 0.40 + 0.30 * sky_factor)

    sky_col = np.array([0.92, 0.97, 1.05], dtype=np.float32)
    sun_col = np.array([1.12, 1.06, 0.94], dtype=np.float32)
    exposure = 1.12 if is_bush else 1.45
    lit_lin = lin * (tex_ao * macro_ao)[:, None] * (sky[:, None] * sky_col + direct[:, None] * sun_col) * exposure
    if is_bush:
        lum_b = (lit_lin * np.array([0.2126, 0.7152, 0.0722], dtype=np.float32)).sum(axis=1, keepdims=True)
        chroma_boost = np.where(is_leaf[:, None], 1.32, 1.05)
        lit_lin = lum_b + chroma_boost * (lit_lin - lum_b)
    rgb_out = np.power(np.clip(lit_lin, 0.0, 1.0), 1.0 / 2.2)

    dc = (rgb_out - 0.5) / C0
    alpha_c = np.clip(alpha, 1e-4, 1.0 - 1e-4)
    opacity_logit = np.log(alpha_c / (1.0 - alpha_c))
    logscale = np.log(np.maximum(scales, 1e-6))

    ASSETS_DIR.mkdir(parents=True, exist_ok=True)
    out_path = ASSETS_DIR / cfg['out']
    nbytes = pack(out_path, X, dc, opacity_logit, logscale, q)

    def extremes(pts: np.ndarray):
        return np.unique(np.round(pts[np.argmax(pts @ FIB_DIRS.T, axis=0)], 3), axis=0).tolist()

    height = float(round(float(X[:, 1].max()), 3))
    center_y = float(round(height * 0.5, 3))
    radius = float(round(float(np.linalg.norm(X - np.array([0.0, center_y, 0.0], np.float32), axis=1).max()) + 0.15, 3))

    meta = {
        'asset': cfg['out'],
        'category': cfg['category'],
        'height': height,
        'centerY': center_y,
        'radius': radius,
        'splats': int(len(X)),
    }
    if cfg['category'] == 'tree':
        trunk_pts = X[(~is_leaf) & (X[:, 1] <= 2.4)]
        if len(trunk_pts) < 16:
            trunk_pts = X[~is_leaf]
        canopy_pts = X[X[:, 1] >= 1.5]
        if len(canopy_pts) < 16:
            canopy_pts = X
        meta['trunkHull'] = extremes(trunk_pts)
        meta['canopyHull'] = extremes(canopy_pts)
    else:
        core_pts = X * np.array([0.65, 1.0, 0.65], dtype=np.float32)
        meta['bodyHull'] = extremes(core_pts)

    bmin = X.min(0).round(3).tolist()
    bmax = X.max(0).round(3).tolist()
    print(f"{cfg['id']:13s} | splats={len(X):6d} (wood={(~is_leaf).sum():6d}, leaf={is_leaf.sum():6d}) | MB={nbytes/1e6:.2f} | bounds={bmin}..{bmax} | radius={radius:.2f}m")
    return meta


def main():
    verify_quat_convention()
    rng = np.random.default_rng(20261120)
    hulls = {}
    for cfg in ASSETS:
        hulls[cfg['id']] = build_asset(cfg, rng)
    HULLS_PATH.write_text(json.dumps(hulls))
    print(f'Wrote {HULLS_PATH}')


if __name__ == '__main__':
    main()
