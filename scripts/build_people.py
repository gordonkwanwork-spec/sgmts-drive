"""Reference-matched skinned NPCs. CC0 MakeHuman topology, fitted garments,
photo-derived facial/cloth atlases, explicit weights and the existing game rig.
Blender +Y forward; source provenance is in assets/character-source/makehuman.
"""
import math, json
from pathlib import Path
from collections import defaultdict
import bpy, bmesh
import numpy as np
from mathutils import Vector, Quaternion
import build_assets as b

# Variant table: sex, age, top, bottom, shoes, hair style, skin, extras.
# The twelve wardrobes correspond to assets/character-references/2026-09-29.
VARIANTS=[
 dict(sex='m',age='adult',top=(.05,.34,.36),sleeve='short',bottom=(.06,.07,.12),legs='jeans',shoes=(.9,.9,.88),hair='crop',hc=(.03,.02,.015),skin=0,extra='backpack'),
 dict(sex='f',age='adult',top=(.55,.08,.14),sleeve='short',bottom=(.08,.08,.09),legs='skirt',shoes=(.08,.06,.05),hair='ponytail',hc=(.04,.025,.018),skin=1,extra='handbag'),
 dict(sex='m',age='adult',top=(.78,.78,.74),sleeve='long',bottom=(.12,.12,.13),legs='trousers',shoes=(.04,.035,.03),hair='side',hc=(.02,.015,.012),skin=2,extra='none'),
 dict(sex='f',age='adult',top=(.72,.62,.42),sleeve='long',bottom=(.1,.14,.26),legs='jeans',shoes=(.85,.85,.84),hair='bob',hc=(.02,.014,.01),skin=0,extra='tote'),
 dict(sex='m',age='older',top=(.42,.46,.36),sleeve='long',bottom=(.34,.3,.22),legs='trousers',shoes=(.12,.08,.05),hair='bald',hc=(.62,.61,.58),skin=1,extra='cane'),
 dict(sex='f',age='older',top=(.5,.26,.42),sleeve='long',bottom=(.18,.17,.2),legs='trousers',shoes=(.1,.08,.07),hair='bun',hc=(.7,.69,.67),skin=0,extra='none'),
 dict(sex='m',age='child',top=(.9,.62,.1),sleeve='short',bottom=(.1,.2,.42),legs='shorts',shoes=(.2,.35,.7),hair='crop',hc=(.03,.02,.015),skin=2,extra='schoolbag'),
 dict(sex='f',age='child',top=(.9,.45,.6),sleeve='short',bottom=(.2,.2,.45),legs='skirt',shoes=(.85,.2,.3),hair='ponytail',hc=(.02,.015,.01),skin=1,extra='schoolbag'),
 dict(sex='m',age='adult',top=(.14,.2,.32),sleeve='long',bottom=(.2,.2,.21),legs='trousers',shoes=(.05,.04,.03),hair='side',hc=(.03,.02,.015),skin=0,extra='none',chair=True),
 dict(sex='f',age='older',top=(.26,.44,.3),sleeve='long',bottom=(.25,.22,.2),legs='trousers',shoes=(.1,.08,.06),hair='bob',hc=(.65,.64,.62),skin=2,extra='none',chair=True),
 dict(sex='m',age='adult',top=(.09,.1,.13),sleeve='suit',bottom=(.09,.1,.13),legs='trousers',shoes=(.03,.025,.02),hair='side',hc=(.015,.012,.01),skin=1,extra='briefcase'),
 dict(sex='f',age='adult',top=(.16,.36,.24),sleeve='short',bottom=(.16,.36,.24),legs='dress',shoes=(.75,.6,.45),hair='long',hc=(.05,.03,.02),skin=2,extra='phone'),
]
SKINS=[(.78,.55,.40),(.86,.66,.50),(.55,.36,.24)]
BONES=['hips','spine','chest','neck','head','clavicle_L','upperarm_L','forearm_L','hand_L','clavicle_R','upperarm_R','forearm_R','hand_R','thigh_L','shin_L','foot_L','toe_L','thigh_R','shin_R','foot_R','toe_R']


def skeleton(v):
 """Joint positions (metres) for this body type; L is -X (character's left when facing +Y)."""
 f=v['sex']=='f';H=1.63 if f else 1.75
 J={'ankle':.085,'knee':.49,'hip':.905,'pelvis':.96,'waist':1.07,'chest':1.26,'shoulder':1.435,'neck':1.47,'head':1.65,'crown':1.75}
 J={k:z*H/1.75 for k,z in J.items()}
 sw=(.16 if f else .178);hw=(.098 if f else .092)
 P={}
 for s,n in [(-1,'L'),(1,'R')]:
  sh=Vector((s*sw,-.005,J['shoulder']));d=Vector((s*math.sin(math.radians(42)),.03,-math.cos(math.radians(42)))).normalized()
  ua=.285*H/1.75;fa=.255*H/1.75
  P['shoulder'+n]=sh;P['elbow'+n]=sh+d*ua;P['wrist'+n]=sh+d*(ua+fa);P['hand'+n]=sh+d*(ua+fa+.17*H/1.75)
  P['hip'+n]=Vector((s*hw,0,J['hip']));P['knee'+n]=Vector((s*(hw+.005),.012,J['knee']));P['ankle'+n]=Vector((s*(hw+.012),-.01,J['ankle']))
  P['ball'+n]=Vector((s*(hw+.02),.12*H/1.75,.028));P['toe'+n]=Vector((s*(hw+.025),.175*H/1.75,.022))
 return J,P,H


def armature(name,J,P):
 arm=bpy.data.armatures.new(name);rig=bpy.data.objects.new(name,arm);bpy.context.collection.objects.link(rig)
 bpy.ops.object.select_all(action='DESELECT');bpy.context.view_layer.objects.active=rig;rig.select_set(True);bpy.ops.object.mode_set(mode='EDIT')
 eb=arm.edit_bones
 def bone(n,h,t,parent=None,connect=False):
  x=eb.new(n);x.head=Vector(h);x.tail=Vector(t);x.parent=eb[parent] if parent else None;x.use_connect=connect;x.roll=0;return x
 bone('hips',(0,0,J['hip']+.03),(0,0,J['waist']))
 bone('spine',(0,0,J['waist']),(0,0,J['chest']),'hips',True)
 bone('chest',(0,0,J['chest']),(0,0,J['neck']-.02),'spine',True)
 bone('neck',(0,0,J['neck']-.02),(0,.01,J['head']-.03),'chest',True)
 bone('head',(0,.01,J['head']-.03),(0,.01,J['crown']),'neck',True)
 for n in 'LR':
  bone('clavicle_'+n,(0,0,J['neck']-.04),P['shoulder'+n],'chest')
  bone('upperarm_'+n,P['shoulder'+n],P['elbow'+n],'clavicle_'+n,True)
  bone('forearm_'+n,P['elbow'+n],P['wrist'+n],'upperarm_'+n,True)
  bone('hand_'+n,P['wrist'+n],P['hand'+n],'forearm_'+n,True)
  bone('thigh_'+n,P['hip'+n],P['knee'+n],'hips')
  bone('shin_'+n,P['knee'+n],P['ankle'+n],'thigh_'+n,True)
  bone('foot_'+n,P['ankle'+n],P['ball'+n],'shin_'+n,True)
  bone('toe_'+n,P['ball'+n],P['toe'+n],'foot_'+n,True)
 bpy.ops.object.mode_set(mode='OBJECT');return rig


def relax(rig,objs,J,P):
 """Lower the arms from the A-pose, bake the deformation into the meshes, and make that the rest pose."""
 bpy.ops.object.select_all(action='DESELECT');bpy.context.view_layer.objects.active=rig;rig.select_set(True);bpy.ops.object.mode_set(mode='POSE')
 for n,s in [('L',-1),('R',1)]:
  pb=rig.pose.bones['upperarm_'+n];pb.rotation_mode='XYZ'
  # Rotate about the forward axis (in bone space) so the arm hangs ~9 deg from vertical.
  sh=P['shoulder'+n];el=P['elbow'+n];cur=(el-sh).normalized();want=Vector((s*math.sin(math.radians(9)),.02,-math.cos(math.radians(9)))).normalized()
  q=cur.rotation_difference(want);bm=rig.data.bones['upperarm_'+n].matrix_local.to_quaternion()
  pb.rotation_mode='QUATERNION';pb.rotation_quaternion=bm.inverted()@q@bm
  fb=rig.pose.bones['forearm_'+n];fb.rotation_mode='QUATERNION'
  fm=rig.data.bones['forearm_'+n].matrix_local.to_quaternion();bend=Quaternion(Vector((1,0,0)),math.radians(12))
  fb.rotation_quaternion=fm.inverted()@(q@bend@q.inverted())@fm
 bpy.context.view_layer.update();bpy.ops.object.mode_set(mode='OBJECT')
 for o in objs:
  bpy.ops.object.select_all(action='DESELECT');bpy.context.view_layer.objects.active=o;o.select_set(True)
  mod=next(m for m in o.modifiers if m.type=='ARMATURE');bpy.ops.object.modifier_apply(modifier=mod.name)
 bpy.ops.object.select_all(action='DESELECT');bpy.context.view_layer.objects.active=rig;rig.select_set(True);bpy.ops.object.mode_set(mode='POSE')
 bpy.ops.pose.armature_apply(selected=False);bpy.ops.object.mode_set(mode='OBJECT')
 for o in objs:m=o.modifiers.new('Armature','ARMATURE');m.object=rig


SOURCE=b.ROOT/'assets/character-source'
_DATA=None

def source_data():
 global _DATA
 if _DATA:return _DATA
 vs=[];groups=defaultdict(list);group='body'
 for line in (SOURCE/'makehuman/base.obj').read_text().splitlines():
  a=line.split()
  if not a:continue
  if a[0]=='v':vs.append(Vector(tuple(map(float,a[1:]))))
  elif a[0]=='g':group=a[1]
  elif a[0]=='f':groups[group].append(tuple(int(x.split('/')[0])-1 for x in reversed(a[1:])))
 spec=json.loads((SOURCE/'makehuman/default.mhskel').read_text())
 weights=json.loads((SOURCE/'makehuman/default_weights.mhw').read_text())['weights']
 def mapped(n):
  side='L' if n.endswith('.R') else 'R' # MH +X is anatomical left; our +X is anatomical right.
  prefix=n.split('.')[0]
  for stem,to in [('upperarm','upperarm'),('lowerarm','forearm'),('wrist','hand'),('finger','hand'),('metacarpal','hand'),('upperleg','thigh'),('lowerleg','shin'),('foot','foot'),('toe','toe'),('clavicle','clavicle'),('shoulder','clavicle')]:
   if prefix.startswith(stem):return to+'_'+side
  if prefix.startswith('neck'):return 'neck'
  if prefix in ('root','spine05','spine04') or prefix.startswith('pelvis'):return 'hips'
  if prefix=='spine03':return 'spine'
  if prefix in ('spine02','spine01') or prefix.startswith('breast'):return 'chest'
  return 'head'
 skin=[defaultdict(float) for _ in vs]
 for name,items in weights.items():
  for i,w in items:skin[i][mapped(name)]+=w
 for i,w in enumerate(skin):
  largest=sorted(w.items(),key=lambda q:q[1],reverse=True)[:4];total=sum(v for _,v in largest)
  skin[i]={n:v/total for n,v in largest} if total else {'hips':1}
 _DATA=vs,groups,spec,skin
 return _DATA


def human(index,v,J,P,H):
 base,groups,spec,weights=source_data();coords=[p.copy() for p in base]
 age={'adult':'young','older':'old','child':'child'}[v['age']];sex='female' if v['sex']=='f' else 'male'
 for line in (SOURCE/f'makehuman/asian-{sex}-{age}.target').read_text().splitlines():
  a=line.split()
  if len(a)==4 and not a[0].startswith('#'):coords[int(a[0])]+=Vector(tuple(map(float,a[1:])))
 def joint(name,edge):
  ids=spec['joints'][spec['bones'][name][edge]]
  q=sum((coords[i] for i in ids),Vector())/len(ids)
  return Vector((q.x,q.z,q.y)) # Y-up source -> Z-up Blender, preserving +Y forward.
 sources={
  'hips':(joint('spine05','head'),joint('spine03','head')),
  'spine':(joint('spine03','head'),joint('spine02','head')),
  'chest':(joint('spine02','head'),joint('neck01','head')),
  'neck':(joint('neck01','head'),joint('head','head')),
  'head':(joint('head','head'),joint('head','tail'))}
 targets={'hips':(Vector((0,0,J['hip']+.03)),Vector((0,0,J['waist']))),'spine':(Vector((0,0,J['waist'])),Vector((0,0,J['chest']))),'chest':(Vector((0,0,J['chest'])),Vector((0,0,J['neck']-.02))),'neck':(Vector((0,0,J['neck']-.02)),Vector((0,.01,J['head']-.03))),'head':(Vector((0,.01,J['head']-.03)),Vector((0,.01,J['crown'])))}
 for n,mh in [('L','R'),('R','L')]:
  for dest,first,last,pa,pb in [('clavicle','clavicle','upperarm01',None,'shoulder'),('upperarm','upperarm01','lowerarm01','shoulder','elbow'),('forearm','lowerarm01','wrist','elbow','wrist'),('hand','wrist','finger3-3','wrist','hand'),('thigh','upperleg01','lowerleg01','hip','knee'),('shin','lowerleg01','foot','knee','ankle'),('foot','foot','toe2-1','ankle','ball'),('toe','toe2-1','toe2-3','ball','toe')]:
   sources[dest+'_'+n]=(joint(first+'.'+mh,'head'),joint(last+'.'+mh,'tail' if dest in ('hand','toe') else 'head'))
   targets[dest+'_'+n]=(P[pa+n] if pa else Vector((0,0,J['neck']-.04)),P[pb+n])
 # Transverse body sizes retain realistic source anatomy, while limb lengths match the game's rig.
 scale=H/(max(p.y for p in coords[:13380])-min(p.y for p in coords[:13380]))
 transforms={}
 for name,(a,c) in sources.items():
  u,z=targets[name];d=c-a;t=z-u;rot=d.normalized().rotation_difference(t.normalized())
  transforms[name]=(a,u,rot,scale,d.normalized(),t.length/d.length)
 zsource=[min(p.y for p in coords[:13380]),joint('foot.L','head').z,joint('lowerleg01.L','head').z,joint('upperleg01.L','head').z,joint('spine05','head').z,joint('spine03','head').z,joint('spine02','head').z,joint('upperarm01.L','head').z,joint('neck01','head').z,joint('head','head').z,max(p.y for p in coords[:13380])]
 ztarget=[.012,J['ankle'],J['knee'],J['hip'],J['hip']+.03,J['waist'],J['chest'],J['shoulder'],J['neck']-.02,J['head']-.03,J['crown']]
 out=[]
 for i,p in enumerate(coords):
  q=Vector((p.x,p.z,p.y));total=Vector()
  for name,w in weights[i].items():
   if name in ('hips','spine','chest','neck','head'):
    total+=Vector((q.x*scale,q.y*scale,float(np.interp(q.z,zsource,ztarget))))*w
   else:
    a,u,rot,k,d,long=transforms[name];rel=q-a
    total+=(u+rot@(rel*k+d*rel.dot(d)*(long-k)))*w
  head_mix=max(0,min(1,(total.z-(J['neck']-.015))/(.08*H/1.75)))
  total.z+=(H-total.z)*(-.27 if v['age']=='child' else -.16)*head_mix
  total.x*=1+(.35 if v['age']=='child' else .27)*head_mix
  out.append(total)
 # Stable landmarks from the original helper eyes; no invented eye sockets or floating eyeballs.
 eyes=[]
 for side in ['l','r']:
  ids={i for f in groups['helper-'+side+'-eye'] for i in f};eyes.append(sum((out[i] for i in ids),Vector())/len(ids))
 return out,groups,weights,eyes


def activate(o):
 bpy.ops.object.select_all(action='DESELECT');o.select_set(True);bpy.context.view_layer.objects.active=o


def paint(o,colour):
 a=o.data.color_attributes.get('Col') or o.data.color_attributes.new('Col','FLOAT_COLOR','CORNER')
 for f in o.data.polygons:
  for li in f.loop_indices:a.data[li].color=(*colour(o.data.vertices[o.data.loops[li].vertex_index].co),1)
 o.data.color_attributes.active_color=a


def linear(c):return tuple(x/12.92 if x<=.04045 else ((x+.055)/1.055)**2.4 for x in c)


def material(index):
 name=f'person_reference_{index:02}';m=bpy.data.materials.new(name);m.use_nodes=True
 nt=m.node_tree;p=nt.nodes.get('Principled BSDF');p.inputs['Roughness'].default_value=.78
 p.inputs['Specular IOR Level'].default_value=.25
 image=bpy.data.images.load(str(SOURCE/f'textures/person-{index:02}.jpg'),check_existing=True);image.pack()
 tex=nt.nodes.new('ShaderNodeTexImage');tex.image=image
 col=nt.nodes.new('ShaderNodeVertexColor');col.layer_name='Col'
 multiply=nt.nodes.new('ShaderNodeMixRGB');multiply.blend_type='MULTIPLY';multiply.inputs[0].default_value=1
 nt.links.new(tex.outputs['Color'],multiply.inputs[1]);nt.links.new(col.outputs['Color'],multiply.inputs[2]);nt.links.new(multiply.outputs[0],p.inputs['Base Color'])
 return m


def make_mesh(name,coords,faces,weights,mat,colour,uv=None):
 ids=sorted({i for f in faces for i in f});lookup={v:i for i,v in enumerate(ids)}
 me=bpy.data.meshes.new(name);me.from_pydata([coords[i] for i in ids],[],[tuple(lookup[i] for i in f) for f in faces]);me.update()
 o=bpy.data.objects.new(name,me);bpy.context.collection.objects.link(o);me.materials.append(mat)
 bybone={n:o.vertex_groups.new(name=n) for n in BONES}
 for i,source in enumerate(ids):
  for n,w in weights[source].items():bybone[n].add([i],w,'REPLACE')
 for f in me.polygons:f.use_smooth=True
 paint(o,colour);layer=me.uv_layers.new(name='UVMap')
 for li,loop in enumerate(me.loops):layer.data[li].uv=uv(me.vertices[loop.vertex_index].co) if uv else (.8,.2)
 return o


def rigid(o,bone,mat,col,parts):
 o.data.materials.clear();o.data.materials.append(mat);paint(o,lambda p:col)
 uv=o.data.uv_layers.get('UVMap') or o.data.uv_layers.new(name='UVMap')
 for x in uv.data:x.uv=(.8,.2)
 group=o.vertex_groups.new(name=bone);group.add(range(len(o.data.vertices)),1,'REPLACE');parts.append(o);return o


def sphere(name,loc,scale,mat,col,parts,bone='head',segments=20):
 bpy.ops.mesh.primitive_uv_sphere_add(segments=segments,ring_count=12,radius=1,location=loc);o=bpy.context.object;o.name=name;o.scale=scale
 bpy.ops.object.transform_apply(location=False,rotation=False,scale=True)
 for f in o.data.polygons:f.use_smooth=True
 return rigid(o,bone,mat,col,parts)


def box(name,loc,size,mat,col,parts,bone='chest',bevel=.012):
 bpy.ops.mesh.primitive_cube_add(size=1,location=loc);o=bpy.context.object;o.name=name;o.dimensions=size
 bpy.ops.object.transform_apply(location=False,rotation=False,scale=True)
 mod=o.modifiers.new('Rounded edges','BEVEL');mod.width=bevel;mod.segments=3;bpy.ops.object.modifier_apply(modifier=mod.name)
 return rigid(o,bone,mat,col,parts)


def tube(name,pts,r,mat,col,parts,bone='chest',sides=8):
 # Reuse the street-kit tube geometry; replace its material before merging.
 o=b.tube(name,pts,r,'dark',sides=sides);return rigid(o,bone,mat,col,parts)


def garments(v,J,P,H,coords,groups,weights,mat,parts):
 # Reuse the continuous clothing topology: shoulder seams and crotch are connected.
 k=H/1.75
 def clothing(name,kind):
  points=[p.copy() for p in coords];faces=[];clothweights=[dict(w) for w in weights]
  for fc in groups['helper-tights']:
   p=sum((coords[i] for i in fc),Vector())/len(fc)
   if kind=='shirt':
    if p.z<J['hip']+.025*k:continue
    if abs(p.x)>.205*k:
     side='L' if p.x<0 else 'R';sh,el,wr=(P[a+side] for a in ('shoulder','elbow','wrist'))
     length=(p-sh).dot((el-sh).normalized())
     if length>(.155*k if v['sleeve']=='short' else (wr-sh).length-.014*k):continue
   else:
    hem=J['knee']+.095*k if v['legs']=='shorts' else J['ankle']+.022*k
    if not hem<p.z<J['hip']+.065*k:continue
   faces.append(fc)
  ids={i for fc in faces for i in fc}
  for i in ids:
   p=points[i]
   if kind=='shirt':
    if abs(p.x)<.21*k:
     p.x*=1.06;p.y*=1.10
     # Relax the abdomen into a hanging shirt rather than body paint.
     if p.z<J['chest'] and abs(p.x)<.13*k:p.y=max(p.y,.105*k) if p.y>0 else min(p.y,-.09*k)
    else:
     side='L' if p.x<0 else 'R';sh=P['shoulder'+side];d=(P['elbow'+side]-sh).normalized();axis=sh+d*(p-sh).dot(d);p[:]=axis+(p-axis)*1.12
   else:
    side='L' if p.x<0 else 'R';cx=P['hip'+side].x;p.x=cx+(p.x-cx)*1.12;p.y*=1.10
  # Project open boundary loops onto clean hems and cuffs.
  edges=defaultdict(int)
  for fc in faces:
   for a,c in zip(fc,fc[1:]+fc[:1]):edges[tuple(sorted((a,c)))]+=1
  boundary={i for edge,count in edges.items() if count==1 for i in edge}
  for i in boundary:
   p=points[i]
   if kind=='shirt':
    if p.z<J['hip']+.13*k:p.z=J['hip']+.025*k
    elif abs(p.x)<.13*k:p.z=J['neck']-.006*k
    else:
     side='L' if p.x<0 else 'R';sh=P['shoulder'+side];d=(P['elbow'+side]-sh).normalized();cut=.155*k if v['sleeve']=='short' else (P['wrist'+side]-sh).length-.014*k
     p+=d*(cut-(p-sh).dot(d));clothweights[i]={('upperarm_' if v['sleeve']=='short' else 'forearm_')+side:1}
   else:p.z=J['hip']+.065*k if p.z>J['hip']-.08*k else hem
  o=make_mesh(name,points,faces,clothweights,mat,lambda p:(1,1,1))
  activate(o)
  smooth=o.modifiers.new('Tailored surface','SMOOTH');smooth.factor=.65;smooth.iterations=4;bpy.ops.object.modifier_apply(modifier=smooth.name)
  sub=o.modifiers.new('Clothing surface','SUBSURF');sub.levels=1;bpy.ops.object.modifier_apply(modifier=sub.name)
  uv=o.data.uv_layers.active
  for poly in o.data.polygons:
   for li in poly.loop_indices:
    p=o.data.vertices[o.data.loops[li].vertex_index].co
    uv.data[li].uv=(.52+.46*(math.atan2(p.y,p.x)/math.tau+.5),(.76 if kind=='shirt' else .51)+.225*max(0,min(1,(p.z-J['hip'])/.55 if kind=='shirt' else p.z/J['hip'])))
  solid=o.modifiers.new('Cloth hem','SOLIDIFY');solid.thickness=.002*k;bpy.ops.object.modifier_apply(modifier=solid.name);parts.append(o)
 clothing('Shirt','shirt')
 if v['legs'] in ('jeans','trousers','shorts'):clothing('Trousers','pants')
 else:
  points=[p.copy() for p in coords];faces=[]
  for fc in groups['helper-skirt']:
   p=sum((coords[i] for i in fc),Vector())/len(fc)
   if J['knee']+.015*k<p.z<J['hip']+.065*k:faces.append(fc)
  for i in {i for fc in faces for i in fc}:points[i].x*=1.04;points[i].y*=1.08
  o=make_mesh('Skirt',points,faces,weights,mat,lambda p:(1,1,1),lambda p:(.52+.45*(math.atan2(p.y,p.x)/math.tau+.5),(.76 if v['legs']=='dress' else .51)+.22*max(0,min(1,(p.z-J['knee'])/(J['hip']-J['knee'])))))
  activate(o);sub=o.modifiers.new('Cloth surface','SUBSURF');sub.levels=1;bpy.ops.object.modifier_apply(modifier=sub.name);parts.append(o)


def hair_mesh(v,J,H,coords,groups,weights,mat,parts):
 k=H/1.75;style=v['hair'];headtop=max(p.z for p in coords[:13380]);hz=J['head'];col=linear(tuple(c+.075 if c<.1 else c for c in v['hc']));faces=[]
 for face in groups['body']:
  p=sum((coords[i] for i in face),Vector())/len(face)
  if p.z < hz-.13*k:continue
  # Scalp wraps temples and occiput, leaving the full face and ears exposed.
  hairline=hz+(.035 if p.y>.08*k else -.015 if p.y>.02*k else -.10)*k
  if style=='bald':hairline=hz+(.16 if p.y>.005*k else .04)*k
  if p.z>hairline:faces.append(face)
 haircoords=[p.copy() for p in coords]
 for i in {i for fc in faces for i in fc}:
  p=haircoords[i];p.x*=1.07;p.y*=1.08;p.z+=.010*k+(.003*k*math.sin(p.x*420)*math.cos(p.z*360))
 o=make_mesh('Hair scalp',haircoords,faces,weights,mat,lambda p:tuple(c*(.8+.2*math.sin(p.x*220+p.z*330)**2) for c in col));parts.append(o)
 if style in ('crop','side') and not v.get('_cyclist'):
  for j in range(15):
   x=(-.09+.01286*j)*k;z=headtop+.022*k-.048*k*(abs(x)/(.10*k))**1.5+.005*k*math.sin(j*2.3)
   lock=sphere('Swept hair',(x,.005*k,z),(.019*k,.075*k,.027*k),mat,col,parts,'head',12)
   lock.rotation_euler.y=-.24
 if style in ('bob','long'):
  # Hair curtain follows the back and side of the head; front remains open.
  vs=[];ws=[];fs=[];rows=8;n=32
  end=hz-(.11 if style=='bob' else .39)*k
  for j in range(rows):
   t=j/(rows-1);z=(hz+.08*k)*(1-t)+end*t;radius=(.082+.044*math.sin(t*math.pi/2))*k
   for a in range(n):
    theta=-2.18+4.36*a/(n-1);x=radius*math.sin(theta);y=-.015*k-radius*math.cos(theta)
    vs.append(Vector((x,y,z+.007*k*math.sin(theta*9)*t)));ws.append({'head':1})
  for j in range(rows-1):
   for a in range(n-1):fs.append((j*n+a,(j+1)*n+a,(j+1)*n+a+1,j*n+a+1))
  o=make_mesh('Hair curtain',vs,fs,ws,mat,lambda p:tuple(c*(.75+.25*math.sin(p.x*300)**2) for c in col));parts.append(o)
 if style in ('bob','long','ponytail'):
  for j in range(7):
   x=(-.08+j*.024)*k
   tube('Swept fringe',[(x*.45,.032*k,headtop+.006*k),(x,.077*k,hz+.069*k),(x-.02*k,.103*k,hz+.025*k+abs(x)*.2)],.012*k,mat,col,parts,'head',8)
 if style=='bun':sphere('Hair bun',(0,-.092*k,hz+.055*k),(.057*k,.045*k,.05*k),mat,col,parts)
 if style=='ponytail':
  sphere('Hair tie',(0,-.098*k,hz+.015*k),(.023*k,.022*k,.018*k),mat,linear((.15,.12,.10)),parts)
  tube('Ponytail',[(0,-.09*k,hz+.035*k),(0,-.12*k,hz-.04*k),(.01*k,-.13*k,hz-.16*k),(.02*k,-.11*k,hz-.23*k)],.027*k,mat,col,parts,'head',12)


def accessories(v,J,P,H,mat,parts):
 k=H/1.75;ex=v['extra'];dark=linear((.12,.13,.14));skin=linear(v['_skin'])
 if v['sleeve']=='long' and not v.get('chair') or v['sleeve']=='suit':
  collar=linear((.86,.85,.82)) if v['sleeve']=='suit' else linear(v['top'])
  for sign in [-1,1]:
   pts=[(sign*.014*k,.068*k,J['neck']-.008*k),(sign*.071*k,.033*k,J['neck']-.008*k),(sign*.091*k,.165*k,J['neck']-.065*k),(sign*.04*k,.178*k,J['neck']-.098*k)]
   o=b.mesh('Shirt collar',pts,[(0,1,2,3)],'dark');rigid(o,'chest',mat,collar,parts)
  if v['sleeve']!='suit':
   for j in range(5):
    z=J['chest']+.05*k-j*.067*k;y=(.178 if z>J['waist']+.08 else .13)*k
    sphere('Shirt button',(0,y+.003,z),(.0035*k,.002*k,.0035*k),mat,linear((.65,.63,.58)),parts,'chest',8)
 if ex in ('backpack','schoolbag'):
  col=linear((.18,.19,.21) if ex=='backpack' else (.68,.12,.16))
  box('Backpack',(0,-.16*k,J['chest']-.05*k),(.26*k,.12*k,.38*k),mat,col,parts,bevel=.045*k)
  box('Backpack front pocket',(0,-.225*k,J['chest']-.13*k),(.22*k,.025*k,.15*k),mat,col,parts,bevel=.022*k)
  tube('Pocket zip',[(-.10*k,-.243*k,J['chest']-.06*k),(.10*k,-.243*k,J['chest']-.06*k)],.003*k,mat,dark,parts)
  for s in [-1,1]:tube('Shoulder strap',[(s*.09*k,-.14*k,J['chest']+.13*k),(s*.095*k,-.01,J['neck']-.01),(s*.12*k,.175*k,J['chest']+.07*k),(s*.12*k,.17*k,J['chest']-.16*k)],.013*k,mat,dark,parts)
 if ex in ('handbag','tote'):
  col=linear((.32,.18,.10) if ex=='handbag' else (.77,.72,.61));x=-.25*k
  box('Shoulder bag',(x,.01,J['hip']+.035*k),(.075*k,.24*k,.25*k),mat,col,parts,'hips',.025*k)
  tube('Shoulder bag strap',[(x,.08,J['hip']+.16*k),(-.18*k,.08,J['neck']-.035),(-.18*k,-.06,J['neck']-.035),(x,-.07,J['hip']+.16*k)],.009*k,mat,col,parts)
 if v['sleeve']=='suit':
  # White shirt front and separate jacket lapels establish layered clothing.
  o=b.mesh('White shirt',[(-.06*k,.18*k,J['neck']-.035*k),(.06*k,.18*k,J['neck']-.035*k),(0,.195*k,J['chest']-.04*k)],[(0,1,2)],'dark');rigid(o,'chest',mat,linear((.9,.9,.88)),parts)
  for s in [-1,1]:
   pts=[(s*.035*k,.185*k,J['neck']-.05*k),(s*.1*k,.197*k,J['chest']+.12*k),(s*.028*k,.198*k,J['chest']-.02*k)]
   o=b.mesh('Jacket lapel',pts,[(0,1,2)],'dark');rigid(o,'chest',mat,linear((.11,.12,.14)),parts)
  tube('Tie',[(0,.203*k,J['neck']-.095*k),(0,.203*k,J['chest']+.01*k),(0,.2*k,J['chest']-.045*k)],.017*k,mat,linear((.3,.09,.13)),parts)
 # Shoes are volumes with a flat sole, not enlarged anatomical toes.
 for s,n in [(-1,'L'),(1,'R')]:
  x=P['ankle'+n].x;y=.055*k;col=linear(v['shoes']);top=.105*k
  shoe=sphere('Shoe upper',(x,y,top*.55),(.052*k,.14*k,top*.52),mat,col,parts,'foot_'+n)
  box('Shoe sole',(x,y,.017*k),(.108*k,.282*k,.028*k),mat,linear((.75,.75,.72)) if v['shoes'][0]>.6 else dark,parts,'foot_'+n,.012*k)
  if v['age']=='child' or v['shoes'][0]>.8:
   for j in range(4):tube('Laces',[(x-.031*k,.035*k+j*.014*k,.098*k),(x+.031*k,.035*k+j*.014*k,.098*k)],.0025*k,mat,linear((.8,.8,.78)),parts,'foot_'+n,6)


def person(index,wheel=None):
 v=dict(VARIANTS[index] if index<12 else dict(VARIANTS[0],extra='none',legs='shorts',bottom=(.05,.08,.16),hair='crop'))
 v['_cyclist']=index==12
 J,P,H=skeleton(v);name='pedestrian_'+str(index);root=b.empty(name)
 root['gender']='female' if v['sex']=='f' else 'male';root['age']=v['age'];root['wheelchair']=bool(v.get('chair'));root['referenceSheet']=index;root['modelVersion']='reference-mesh-v1'
 coords,groups,weights,eyes=human(index,v,J,P,H)
 metadata=json.loads((SOURCE/'textures/mapping.json').read_text())[index];v['_skin']=metadata['skin'];skin=linear(v['_skin']);mat=material(index);parts=[]
 eyex=sum(abs(p.x) for p in eyes)/2;eyez=sum(p.z for p in eyes)/2
 # The base mesh has actual eyelid loops, lips, nose, ears and separate fingers.
 # Reference pixels supply facial identity; map eyes and chin to the photographed landmarks.
 spec=source_data()[2]
 def landmark(name,edge):
  ids=spec['joints'][spec['bones'][name][edge]];return sum((coords[i] for i in ids),Vector())/len(ids)
 chin=landmark('oris02','head').z-.009*H/1.75
 mouth=(landmark('oris01','tail').z+landmark('oris05','tail').z)/2
 nose=max((p for p in coords[:13380] if abs(p.x)<.018*H/1.75 and mouth+.012<p.z<eyez-.008),key=lambda p:p.y).z
 def face_uv(p):
  
  box0=metadata['crop'];span=box0[2]-box0[0];px=metadata['eyes'][0]-p.x/(eyex*2)*metadata['eyeDistance']
  py=float(np.interp(p.z,[chin,mouth,nose,eyez,eyez+.085*H/1.75],[metadata['chin'],metadata['mouth'][1],metadata['nose'],metadata['eyes'][1],metadata['eyes'][1]-metadata['eyeDistance']*1.15]))
  return (max(.003,min(.497,(px-box0[0])/span*.5)),1-max(.003,min(.497,(py-box0[1])/span*.5)))
 faces=[]
 # Remove hidden torso and upper-leg skin: prevents poke-through and saves crowd triangles.
 for fc in groups['body']:
  p=sum((coords[i] for i in fc),Vector())/len(fc)
  k=H/1.75;exposed=(p.z>J['neck']+.008*k and abs(p.x)<.12*k) or (p.z>J['neck']-.025*k and abs(p.x)<.075*k)
  if abs(p.x)>.19*k and p.z>J['hip']-.10*k:
   side='L' if p.x<0 else 'R';sh=P['shoulder'+side];d=(P['elbow'+side]-sh).normalized()
   cuff=.145*k if v['sleeve']=='short' else (P['wrist'+side]-sh).length-.024*k
   exposed|=(p-sh).dot(d)>cuff
  exposed|=J['ankle']+.005*k<p.z<J['knee']+.13*k and v['legs'] in ('shorts','skirt','dress')
  if exposed:faces.append(fc)
 front=[];plain=[]
 for fc in faces:
  p=sum((coords[i] for i in fc),Vector())/len(fc)
  (front if p.z>chin-.005 and p.y>.065*H/1.75 and abs(p.x)<.074*H/1.75 else plain).append(fc)
 body=make_mesh('Skin',coords,plain,weights,mat,lambda p:skin);parts.append(body)
 parts.append(make_mesh('Reference face',coords,front,weights,mat,lambda p:(1,1,1),face_uv))
 for side in ['l','r']:
  # Spherical eyes use the same aligned portrait, avoiding separate painted-on googly eyes.
  o=make_mesh('Eye '+side,coords,groups['helper-'+side+'-eye'],weights,mat,lambda p:(1,1,1),face_uv);parts.append(o)
 garments(v,J,P,H,coords,groups,weights,mat,parts)
 hair_mesh(v,J,H,coords,groups,weights,mat,parts)
 accessories(v,J,P,H,mat,parts)
 rig=armature(name+'_rig',J,P)
 activate(body)
 for o in parts:o.select_set(True)
 bpy.ops.object.join();body.name=name+'_body';body.parent=rig
 modifier=body.modifiers.new('Armature','ARMATURE');modifier.object=rig
 relax(rig,[body],J,P)
 # Props authored after rest-pose bake stay in the actual hands.
 extra=[];hand=rig.data.bones['hand_R'].head_local.copy();ex=v['extra']
 if ex=='cane':
  x,y,z=hand;tip=(x,y+.035,.025)
  tube('Walking cane',[tip,(x,y+.035,z-.015),(x,y+.02,z+.005),(x,y-.02,z+.005)],.01,mat,linear((.28,.16,.085)),extra,'hand_R')
  sphere('Cane rubber tip',tip,(.016,.016,.025),mat,linear((.12,.12,.12)),extra,'hand_R',12)
 if ex=='briefcase':
  box('Briefcase',hand+Vector((.02,0,-.23)),(.09,.32,.24),mat,linear((.23,.14,.08)),extra,'hand_R',.012)
  tube('Briefcase handle',[hand+Vector((.02,-.055,-.12)),hand+Vector((.02,-.055,-.07)),hand+Vector((.02,.055,-.07)),hand+Vector((.02,.055,-.12))],.007,mat,linear((.16,.1,.06)),extra,'hand_R')
 if ex=='phone':box('Phone',hand+Vector((0,.03,-.06)),(.065,.013,.13),mat,linear((.035,.04,.045)),extra,'hand_R',.005)
 if index==12:
  k=H/1.75
  sphere('Cycling helmet',(0,0,J['crown']-.015),(.125,.15,.075),mat,linear((.88,.89,.86)),extra)
  for x in [-.05,0,.05]:tube('Helmet vents',[(x,.07,J['crown']+.02),(x,0,J['crown']+.04),(x,-.065,J['crown']+.022)],.007,mat,linear((.04,.045,.05)),extra,'head')
  box('Cycling glasses',(0,eyes[0].y+.055,eyez),(.15,.018,.033),mat,linear((.025,.03,.035)),extra,'head',.008)
 if extra:
  activate(body)
  for o in extra:o.select_set(True)
  bpy.ops.object.join()
 # One textured material and one skinned mesh per NPC. Preserve face loops at crowd budget.
 activate(body);dec=body.modifiers.new('Crowd geometry budget','DECIMATE');dec.ratio=.26;bpy.ops.object.modifier_apply(modifier=dec.name)
 for bone in list(rig.data.bones):bone.name='P%d_%s'%(index,bone.name)
 rig.parent=root;body['skinned']=True
 if v['age']=='child':root.scale=(.72,.72,.72)
 elif v['age']=='older':root.scale=(.96,.96,.96)
 root['triangles']=sum(len(f.vertices)-2 for f in body.data.polygons)
 print('NPC',index,'triangles',root['triangles'],flush=True)
 return root,rig,body,v
