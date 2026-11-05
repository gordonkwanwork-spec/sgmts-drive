"""Shrink embedded textures of the Tripo character GLBs so phones can hold ~15 of them in GPU memory.

A 4096² colour map costs ~85 MB of GPU memory once decoded; characters are ~1.75 m tall on screen, so
colour maps are capped at 1024² and normal / metal-rough maps at 512². Idempotent (never upscales).
Usage: python3 scripts/shrink_glb_textures.py [glb ...]   (default: public/assets/characters/tripo/**/*.glb)
"""
import io, json, struct, sys
from pathlib import Path
from PIL import Image

ROOT = Path(__file__).resolve().parents[1]
CAPS = {'baseColorTexture': 1024, 'normalTexture': 512, 'metallicRoughnessTexture': 512}

def shrink(path):
    data = path.read_bytes()
    jlen = struct.unpack_from('<I', data, 12)[0]
    gltf = json.loads(data[20:20 + jlen])
    binary = data[20 + jlen + 8:]
    cap = {}
    for m in gltf['materials']:
        for key, slot in (('baseColorTexture', m['pbrMetallicRoughness']), ('metallicRoughnessTexture', m['pbrMetallicRoughness']), ('normalTexture', m)):
            if key in slot: cap[gltf['textures'][slot[key]['index']]['source']] = CAPS[key]
    views = gltf['bufferViews']
    blobs = [binary[v.get('byteOffset', 0):v.get('byteOffset', 0) + v['byteLength']] for v in views]
    for i, image in enumerate(gltf['images']):
        img = Image.open(io.BytesIO(blobs[image['bufferView']]))
        if max(img.size) <= cap[i]: continue
        img = img.convert('RGB').resize((cap[i], cap[i]), Image.Resampling.LANCZOS)
        out = io.BytesIO(); img.save(out, 'JPEG', quality=85, optimize=True)
        blobs[image['bufferView']] = out.getvalue(); image['mimeType'] = 'image/jpeg'
    body = b''
    for v, blob in zip(views, blobs):
        v['byteOffset'] = len(body); v['byteLength'] = len(blob)
        body += blob + b'\0' * (-len(blob) % 4)
    gltf['buffers'][0]['byteLength'] = len(body)
    js = json.dumps(gltf, separators=(',', ':')).encode(); js += b' ' * (-len(js) % 4)
    path.write_bytes(b'glTF' + struct.pack('<II', 2, 12 + 8 + len(js) + 8 + len(body)) + struct.pack('<I4s', len(js), b'JSON') + js + struct.pack('<I4s', len(body), b'BIN\0') + body)

for p in [Path(a) for a in sys.argv[1:]] or sorted((ROOT / 'public/assets/characters/tripo').rglob('*.glb')):
    before = p.stat().st_size; shrink(p); print(f'{p.name}: {before / 1e6:.1f} -> {p.stat().st_size / 1e6:.1f} MB')
