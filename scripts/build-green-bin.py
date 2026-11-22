"""Build the registered FEHD bin assets from the KIRI OBJ/JPG and 3DGS.ply.
Run: blender -b -P scripts/build-green-bin.py -- path/to/3DModel.obj path/to/3DGS.ply
"""
import json
from pathlib import Path
import sys

import bmesh
import bpy
import numpy as np
from mathutils import Matrix

folder = Path(__file__).resolve().parent
sys.path.insert(0, str(folder))
from gsplat_pack import pack

obj, ply = map(Path, sys.argv[sys.argv.index('--') + 1:])
assets = folder.parent / 'public/assets'
# Fit to the scan's pavement annulus. The two source exports share a frame
# after converting the PLY's camera convention to OBJ (+Y up, +Z forward).
normal = np.array([.04481812, 1., -.08003381])
normal /= np.linalg.norm(normal)
right = np.array([1., 0., 0.]) - normal * normal[0]
right /= np.linalg.norm(right)
rotation = np.stack([right, normal, np.cross(right, normal)])
scale = .99 / 2.96
base = np.array([-.31, .054, .24])

def place(points):
    return ((points - [0., -3.33154386, 0.]) @ rotation.T - base) * scale

def inside(p):
    # Trim the photographed pavement at the contact ring and isolate the bin.
    return (p[:, 1] >= 0) & (p[:, 1] < 1.02) & (np.hypot(p[:, 0], p[:, 2]) < .346)

bpy.ops.wm.read_factory_settings(use_empty=True)
bpy.ops.wm.obj_import(filepath=str(obj), forward_axis='NEGATIVE_Z', up_axis='Y')
body = bpy.context.selected_objects[0]
mesh = body.data
mesh.transform(body.matrix_world)
body.matrix_world = Matrix.Identity(4)
buf = np.empty(len(mesh.vertices) * 3, dtype=np.float32)
mesh.vertices.foreach_get('co', buf)
# Blender uses Z up. Convert both ways to match the glTF Y-up export.
to_blender = np.array([[1, 0, 0], [0, 0, -1], [0, 1, 0]])
p = place(buf.reshape(-1, 3) @ to_blender)
keep = inside(p)
mesh.vertices.foreach_set('co', (p @ to_blender.T).astype(np.float32).ravel())
bm = bmesh.new()
bm.from_mesh(mesh)
bmesh.ops.delete(bm, geom=[v for v in bm.verts if not keep[v.index]], context='VERTS')
bm.to_mesh(mesh)
bm.free()
dec = body.modifiers.new('Game mesh', 'DECIMATE')
dec.ratio = min(1, 18000 / len(mesh.polygons))
bpy.ops.object.modifier_apply(modifier=dec.name)
body.name = 'FEHD bin'
bpy.ops.export_scene.gltf(filepath=str(assets / 'green-bin.glb'), export_image_format='AUTO',
                          export_normals=True, export_yup=True)

solid = p[keep]
z = np.linspace(-1, 1, 96)
angle = np.arange(len(z)) * 2.39996
directions = np.stack([np.cos(angle)*np.sqrt(1-z*z), z, np.sin(angle)*np.sqrt(1-z*z)], 1)
hull = np.unique(solid[np.argmax(solid @ directions.T, axis=0)].round(4), axis=0)
(folder.parent / 'src/green-bin-hull.json').write_text(json.dumps({'height': .99, 'hull': hull.tolist()}))

with ply.open('rb') as f:
    header = []
    while (line := f.readline().strip()) != b'end_header':
        if not line:
            raise ValueError('Incomplete PLY header')
        header.append(line.decode())
    props = [line.split()[2] for line in header if line.startswith('property float')]
    count = int(next(line.split()[2] for line in header if line.startswith('element vertex')))
    a = np.fromfile(f, '<f4', count=count*len(props)).reshape(count, -1)
positions = place(a[:, :3] * [1, -1, -1])
mask = inside(positions)
a, positions = a[mask], positions[mask]
def columns(prefix, count):
    return a[:, [props.index(prefix + str(i)) for i in range(count)]]

# Rotate the ellipsoids with their centres, without changing their axes.
w, x, y, z = Matrix((rotation @ np.diag([1, -1, -1])).tolist()).to_quaternion()
product = np.array([[w,-x,-y,-z], [x,w,-z,y], [y,z,w,-x], [z,-y,x,w]])
pack(assets / 'green-bin.gsplat', positions, columns('f_dc_', 3), a[:, props.index('opacity')],
     columns('scale_', 3) + np.log(scale), columns('rot_', 4) @ product.T)
print(f'Wrote {len(mesh.polygons)} triangles and {len(positions)} registered splats')
