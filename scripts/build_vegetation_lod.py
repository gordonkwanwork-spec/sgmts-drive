"""Keep full near plants; export a decimated copy for distant instancing."""
import bpy
from pathlib import Path

def add_vegetation_lods():
 for kind in ['grass','meadow','fern','shrub','flowering']:
  source=bpy.data.objects['vegetation_'+kind]
  root=source.copy();root.name=source.name+'_lod';bpy.context.collection.objects.link(root)
  for child in list(source.children):
   if child.type!='MESH':continue
   obj=child.copy();obj.data=child.data.copy();obj.name=child.name+'_lod';obj.parent=root;bpy.context.collection.objects.link(obj)
   mod=obj.modifiers.new('Distant plant detail','DECIMATE');mod.ratio=.04 if kind=='flowering' else .24
   bpy.context.view_layer.objects.active=obj;bpy.ops.object.modifier_apply(modifier=mod.name)

if __name__=='__main__':
 root=Path(__file__).resolve().parents[1];path=root/'assets/blender/street-kit.blend'
 bpy.ops.wm.open_mainfile(filepath=str(path));add_vegetation_lods();bpy.context.preferences.filepaths.save_version=0
 bpy.ops.wm.save_as_mainfile(filepath=str(path));bpy.ops.export_scene.gltf(filepath=str(root/'public/assets/street-kit.glb'),export_format='GLB',export_yup=True,export_extras=True)
