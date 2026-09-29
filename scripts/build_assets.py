"""Reproducible Blender 5.2 source. Metres; Blender +Y forward -> glTF -Z."""
import bpy, bmesh, math, json, random, sys
from pathlib import Path
from mathutils import Vector
ROOT=Path(__file__).resolve().parents[1]
OUT=ROOT/'public/assets'; BLEND=ROOT/'assets/blender'
STATION_NAMES={s['id']:s for s in json.loads((ROOT/'src/station-data.json').read_text())}
STATION_FONT=bpy.data.fonts.load('/System/Library/Fonts/STHeiti Medium.ttc')
random.seed(21)

def mat(n,c,metal=0,rough=.45,emission=0):
 m=bpy.data.materials.new(n); m.diffuse_color=(*c,1); m.use_nodes=True
 p=m.node_tree.nodes.get('Principled BSDF'); p.inputs['Base Color'].default_value=(*c,1); p.inputs['Metallic'].default_value=metal;p.inputs['Roughness'].default_value=rough
 if emission:p.inputs['Emission Color'].default_value=(*c,1);p.inputs['Emission Strength'].default_value=emission
 return m
M={}
def materials():
 global M
 M={n:mat(n,*v) for n,v in {'pearl':((.83,.86,.83),.35,.27),'orange':((.97,.29,.055),.45,.26),'glass':((.022,.064,.083),.5,.17),'rubber':((.018,.022,.023),0,.8),'steel':((.38,.47,.51),.8,.26),'dark':((.047,.063,.071),.35,.35),'light':((.8,.94,1),.2,.2,4),'red':((.9,.025,.025),.2,.2,3),'teal':((.04,.55,.6),.2,.36),'blue':((.17,.4,.62),.2,.36),'yellow':((.98,.69,.23),.1,.5),'sand':((.74,.65,.49),0,.8),'concrete':((.57,.61,.6),0,.92),'tile':((.71,.73,.71),0,.85),'tile_dark':((.25,.34,.39),0,.8),'roof':((.61,.59,.53),.25,.55),'cladding':((.79,.77,.69),.15,.55),'panel':((.29,.29,.27),.1,.6),'accent':((.95,.09,.015),.2,.4)}.items()}

def reset():
 bpy.ops.object.select_all(action='SELECT');bpy.ops.object.delete(use_global=False)
 for m in list(bpy.data.materials):bpy.data.materials.remove(m)
 materials()
def mesh(n,vs,fs,m,parent=None,smooth=False):
 d=bpy.data.meshes.new(n);d.from_pydata(vs,[],fs);d.update();o=bpy.data.objects.new(n,d);bpy.context.collection.objects.link(o);o.data.materials.append(M[m]);o.parent=parent
 for p in d.polygons:p.use_smooth=smooth
 return o
def empty(n,pos=(0,0,0),parent=None):
 o=bpy.data.objects.new(n,None);bpy.context.collection.objects.link(o);o.location=pos;o.parent=parent;return o
def box(n,pos,size,m,parent=None,bev=0):
 bpy.ops.mesh.primitive_cube_add(size=1,location=pos);o=bpy.context.object;o.name=n;o.dimensions=size;bpy.ops.object.transform_apply(location=False,rotation=False,scale=True);o.data.materials.append(M[m]);o.parent=parent
 if bev:
  mod=o.modifiers.new('Soft manufactured edges','BEVEL');mod.width=bev;mod.segments=3;bpy.context.view_layer.objects.active=o;bpy.ops.object.modifier_apply(modifier=mod.name)
 return o
def tube(n,pts,r,m,parent=None,sides=8):
 vs=[]
 for i,p in enumerate(pts):
  t=Vector(pts[min(i+1,len(pts)-1)])-Vector(pts[max(0,i-1)]);t.normalize();u=t.cross(Vector((0,0,1)))
  if u.length<.01:u=Vector((1,0,0))
  u.normalize();v=t.cross(u)
  vs.extend([tuple(Vector(p)+r*(u*math.cos(a*2*math.pi/sides)+v*math.sin(a*2*math.pi/sides))) for a in range(sides)])
 fs=[(i*sides+j,i*sides+(j+1)%sides,(i+1)*sides+(j+1)%sides,(i+1)*sides+j) for i in range(len(pts)-1) for j in range(sides)]
 return mesh(n,vs,fs,m,parent,True)
def text(n,s,pos,size,m,parent=None,rot=(math.pi/2,0,0)):
 c=bpy.data.curves.new(n,'FONT');c.body=s;c.font=STATION_FONT;c.size=size;c.extrude=0;c.resolution_u=2;c.align_x='CENTER';o=bpy.data.objects.new(n,c);bpy.context.collection.objects.link(o);o.location=pos;o.rotation_euler=rot;o.data.materials.append(M[m]);o.parent=parent;return o

def merge_static(parent=None):
 groups={}
 for o in list(bpy.context.scene.objects):
  if o.type in ('MESH','FONT') and o.parent==parent and not o.get('animated'):
   groups.setdefault(o.data.materials[0].name,[]).append(o)
 for name,obs in groups.items():
  bpy.ops.object.select_all(action='DESELECT')
  for o in obs:o.select_set(True)
  bpy.context.view_layer.objects.active=obs[0];bpy.ops.object.convert(target='MESH');bpy.ops.object.join();obs[0].name=(parent.name+'_' if parent else '')+name

def save(name):
 bpy.context.preferences.filepaths.save_version=0
 bpy.ops.wm.save_as_mainfile(filepath=str(BLEND/(name+'.blend')))
 bpy.ops.export_scene.gltf(filepath=str(OUT/(name+'.glb')),export_format='GLB',export_yup=True,export_extras=True,export_vertex_color='NAME',export_vertex_color_name='Col',export_all_vertex_colors=False)
 tris=sum(len(p.vertices)-2 for o in bpy.context.scene.objects if o.type=='MESH' for p in o.data.polygons)
 print('ASSET',name,'triangles',tris,'bytes',(OUT/(name+'.glb')).stat().st_size,flush=True)
 return {'triangles':tris,'bytes':(OUT/(name+'.glb')).stat().st_size}

# Aerodynamic bodyshell after the 2026 livery sheet: one smooth loft per section.
# Half cross-section, sill centre -> roof centre. Segment bands: 0-5 white skirt,
# 6-8 glazing line, 9 black header, 10+ orange roof.
PROFILE=[(0,.30),(.9,.30),(1.2,.32),(1.3,.38),(1.33,.5),(1.335,.8),(1.335,1.12),(1.33,1.5),(1.32,2.0),(1.31,2.62),(1.30,2.95),(1.27,3.14),(1.19,3.32),(1.02,3.44),(.7,3.49),(.35,3.505),(0,3.51)]
RING=PROFILE+[(-x,z) for x,z in reversed(PROFILE[1:-1])];NR=len(RING)
NOSE_Y=4.9;NOSE_R=.7;NOSE_L=NOSE_Y+NOSE_R;RAKE=.2;RAKE_Z=1.15
DOORS=[-1.6,1.2]
WINDOWS_NOSE=[(-4.75,-2.35),(-.85,.45),(1.95,3.75),(3.95,4.85)];WINDOWS_MID=[(-4.75,-2.35),(-.85,.45),(1.95,4.75)]
LIVERY=['livery_teal','livery_orange','livery_yellow','livery_pink','livery_sky','livery_green','livery_red']
def seg(i):return i if i<len(PROFILE)-1 else NR-1-i
def ring(y,hw=1.335,theta=0,roof=1):
 # theta: nose rounding angle (0 straight body, pi/2 flat front); the roof rolls down into the header.
 out=[]
 for x,z in RING:
  if z>2.95:z=2.95+(z-2.95)*roof
  out.append((x*hw/1.335,y-RAKE*max(0,z-RAKE_Z)*math.sin(theta),z))
 return out
def nose_surface(x,z,off=0):
 # Point on the build-frame nose (towards +y) at half-width x and height z, pushed out by off.
 ax=min(abs(x),1.32);th=math.pi/2 if ax<=.62 else math.acos((ax-.62)/NOSE_R)
 n=Vector((math.copysign(math.cos(th),x),math.sin(th),RAKE*math.sin(th)*(z>RAKE_Z)));n.normalize()
 return Vector((x if ax<=.62 else math.copysign(.62+NOSE_R*math.cos(th),x),NOSE_Y+NOSE_R*math.sin(th)-RAKE*max(0,z-RAKE_Z)*math.sin(th),z))+off*n

def body(p,idx):
 nose=idx!=1;sign=-1 if idx==2 else 1
 windows=WINDOWS_NOSE if nose else WINDOWS_MID
 # Rear cab is the front cab mirrored in y; built in the front frame, faces tested in real coordinates.
 end=NOSE_Y if nose else 5.0
 rings=[(y,ring(y),'body') for y in sorted({-5.0,end,*[e for w in windows for e in w],*[d*sign+s*.535 for d in DOORS for s in (-1,1)]})]
 if nose:
  for k in range(1,11):
   th=k*math.pi/20;y=NOSE_Y+NOSE_R*math.sin(th);rings.append((y,ring(y,.62+NOSE_R*math.cos(th),th,.35+.65*math.cos(th)),'corner' if k<10 else 'front'))
  for k in range(1,7):rings.append((NOSE_L,ring(NOSE_L,.62*(1-k/6),math.pi/2,.35),'front'))
 vs=[(x,y*sign,z) for _,r,_ in rings for x,y,z in r];fs=[];mats=[]
 for j in range(len(rings)-1):
  y,_,kind=rings[j+1];yb=(rings[j][0]+y)/2
  for i in range(NR):
   s=seg(i);f=(j*NR+i,j*NR+(i+1)%NR,(j+1)*NR+(i+1)%NR,(j+1)*NR+i)
   if kind=='body' and 3<=s<=8 and any(abs(yb-d*sign)<.535 for d in DOORS):continue # door openings
   if s<=5:m='body_white'
   elif s>=10:m='body_orange'
   elif s==9:m='body_black'
   elif kind=='front' or kind=='corner' and y>NOSE_Y+.4 or kind=='body' and any(a<yb<b for a,b in windows):m='glass'
   else:m='body_black'
   fs.append(f if sign>0 else f[::-1]);mats.append(m)
 names=['body_white','body_orange','body_black','glass'];o=mesh('Aerodynamic bodyshell',vs,fs,'body_white',p,True)
 for n in names[1:]:o.data.materials.append(M[n])
 for poly,m in zip(o.data.polygons,mats):poly.material_index=names.index(m)
 bm=bmesh.new();bm.from_mesh(o.data);bmesh.ops.remove_doubles(bm,verts=bm.verts,dist=1e-5);bm.to_mesh(o.data);bm.free()
 for poly in o.data.polygons:poly.use_smooth=True
 # One material per object so glazing and advert wraps can address panels by material.
 bpy.ops.object.select_all(action='DESELECT');o.select_set(True);bpy.context.view_layer.objects.active=o
 bpy.ops.object.mode_set(mode='EDIT');bpy.ops.mesh.separate(type='MATERIAL');bpy.ops.object.mode_set(mode='OBJECT')
 for q in bpy.context.selected_objects:
  m=q.data.materials[q.data.polygons[0].material_index];q.data.materials.clear();q.data.materials.append(m)
  for poly in q.data.polygons:poly.material_index=0

def livery(p,y0,y1,side,rnd):
 # Overlapping pastel and signal-colour spikes rising from the sill, clear of the doors.
 y=y0;k=0
 while y<y1-.1:
  w=rnd.uniform(.1,.22);h=rnd.uniform(.22,.66)*(1 if rnd.random()>.2 else .5);x=side*(1.3365+.0004*(k%6))
  if not any(abs(y+w/2-d)<.6 for d in DOORS):mesh('Spike livery',[(x,y,.42),(x,y+w,.42),(x,y+w*rnd.uniform(.3,.7),.42+h)],[(0,1,2)],rnd.choice(LIVERY),p)
  y+=w*rnd.uniform(.35,.7);k+=1

def exterior(p,idx):
 rnd=random.Random(40+idx);nose=idx!=1;sign=-1 if idx==2 else 1
 body(p,idx)
 for side in [-1,1]:
  livery(p,-4.8 if idx==2 else -4.95,4.8 if idx==0 else 4.95,side,rnd)
  for y in [-4.5,4.5]:box('Amber side marker',(side*1.34,y,1.02),(.03,.16,.045),'yellow',p,.015)
 # Low orange equipment pods with fan grilles, as in the roof plan.
 for y,fan in [(-2.8,idx!=1),(2.8,idx==1)]:
  box('Roof equipment pod',(0,y,3.55),(1.5,1.9,.14),'body_orange',p,.06)
  if fan:
   bpy.ops.mesh.primitive_cylinder_add(vertices=32,radius=.27,depth=.03,location=(0,y,3.63));o=bpy.context.object;o.name='Roof fan grille';o.data.materials.append(M['dark']);o.parent=p
   tube('Roof fan rim',[(.29*math.cos(a*math.pi/16),y+.29*math.sin(a*math.pi/16),3.635) for a in range(33)],.018,'steel',p)
 if not nose:return
 # Rear cab = front cab rotated 180 degrees about the vertical axis.
 def S(x,z,off=0):v=nose_surface(x,z,off);return (v.x*sign,v.y*sign,v.z)
 for side in [-1,1]:
  # Orange frame runs from the roof, down the windscreen edges and turns in over the bumper.
  tube('Orange nose frame',[S(side*x,z,.03) for x,z in [(1.08,2.97),(1.12,2.6),(1.13,2.1),(1.12,1.6),(1.08,1.22),(.98,.92),(.8,.66),(.58,.48),(.38,.38)]],.065,'body_orange',p,12)
  tube('Headlamp cluster',[S(side*x,.78,.01) for x in [.74,.86,.98,1.1,1.2]],.075,'body_black',p,12)
  tube('Headlamp LED',[S(side*x,.78,.07) for x in [.78,.9,1.02,1.14]],.03,'light' if sign>0 else 'red',p,10)
  # Mirror stalk grows out of the front roof corner; the pod hangs clear of the windscreen.
  top=S(side*1.16,2.98,.02);pod=Vector(S(side*1.2,2.5))+Vector((side*sign*.42,-sign*.18,0))
  tube('Mirror stalk',[top,(top[0]+side*sign*.22,top[1]-sign*.05,top[2]+.08),(pod.x,pod.y,3.02),(pod.x,pod.y,pod.z+.25)],.028,'body_black',p,8)
  box('Mirror pod',tuple(pod),(.13,.24,.52),'body_black',p,.05)
 tube('LED signature',[S(x,.99,.012) for x in [-.95,-.7,-.4,-.15,.15,.4,.7,.95]],.022,'light' if sign>0 else 'red',p,8)
 for k in range(26):
  xc=-1.2+k*.096+rnd.uniform(-.03,.03);w=rnd.uniform(.08,.16);h=rnd.uniform(.12,.55);off=.006+.0004*(k%5)
  mesh('Spike livery',[S(xc-w/2,.38,off),S(xc+w/2,.38,off),S(xc+rnd.uniform(-.04,.04),.38+h,off)],[(0,1,2)],rnd.choice(LIVERY),p)
 # Destination display sits flush in the black header on the raked glazing line.
 tilt=math.atan(RAKE)
 box('Destination display',S(0,2.785,.004),(1.05,.012,.27),'dark',p).rotation_euler.x=tilt*sign
 d=text('Route destination','泥圍' if sign>0 else '產業園',S(0,2.785,.012),.2,'led_orange',p,rot=(math.pi/2-tilt,0,math.pi if sign>0 else 0));d.data.align_y='CENTER';d['animated']=True
 # Wiper parks below the glazing line, out of the driver's view, and sweeps up the glass in rain.
 w=empty('wiper_pivot_'+('front' if sign>0 else 'rear'),S(.55,1.07,.035),p);w.rotation_euler=(tilt-math.pi/2,0,0 if sign>0 else math.pi);w['wiper']=True
 tube('Wiper arm',[(0,0,0),(-.5,0,.012),(-1.08,0,.012)],.016,'body_black',w,8)
 box('Wiper blade',(-.6,0,0),(.98,.022,.028),'rubber',w,.008)
 bpy.ops.mesh.primitive_cylinder_add(vertices=16,radius=.045,depth=.05,location=(0,0,0));c=bpy.context.object;c.name='Wiper spindle cap';c.data.materials.append(M['body_black']);c.parent=w
 merge_static(w)

# ---- Saloon, cab and doors (29 Sep 2026 rebuild after the CRRC ART cab and saloon photographs) ----
FLOOR=.63;CAB_FLOOR=.90;CAB_Y=2.15;PODIUM=.99;WHEELS=[-3.0,3.0];DOOR_HALF=.535
EYE=(0,2.84,2.13);CONSOLE_P=(0,3.0)
# Inner lining half-profile (x,z): floor, window sill 1.20, window head 2.50, door head 2.60, cove to the LED strip.
IP=[(1.20,.63),(1.215,.92),(1.22,1.20),(1.21,1.60),(1.195,2.05),(1.18,2.50),(1.17,2.60),(1.13,2.74),(1.04,2.86),(.93,2.94)]
SEAT_PROFILE=[(.215,.39),(.238,.418),(.228,.446),(.19,.458),(.08,.455),(-.06,.446),(-.16,.44),(-.205,.47),(-.222,.58),(-.24,.72),(-.256,.86),(-.262,.93),(-.25,.965),(-.225,.975)]

def lerp_profile(pts,z):
 for (x0,z0),(x1,z1) in zip(pts,pts[1:]):
  if z0<=z<=z1:return x0+(x1-x0)*(z-z0)/(z1-z0)
 return pts[-1][0] if z>pts[-1][1] else pts[0][0]
def xin(z):return lerp_profile(IP,z)
def skin_x(z):return lerp_profile(PROFILE[3:11],z)
def loft(n,rows,m,parent=None,smooth=True,closed=False,caps=False):
 k=len(rows[0]);vs=[tuple(p) for r in rows for p in r]
 fs=[(j*k+i,j*k+(i+1)%k,(j+1)*k+(i+1)%k,(j+1)*k+i) for j in range(len(rows)-1) for i in range(k if closed else k-1)]
 if caps:fs+=[tuple(range(k))[::-1],tuple(range((len(rows)-1)*k,len(rows)*k))]
 return mesh(n,vs,fs,m,parent,smooth)
def uv_floor(o):
 uv=o.data.uv_layers.new(name='UVMap')
 for l in o.data.loops:co=o.data.vertices[l.vertex_index].co;uv.data[l.index].uv=((co.x+1.2)/2.4,(co.y+4.8)/9.6)
def cyl(n,pos,r,depth,m,parent,rot=(0,0,0),verts=12,scale=None):
 bpy.ops.mesh.primitive_cylinder_add(vertices=verts,radius=r,depth=depth,location=pos,rotation=rot);o=bpy.context.object;o.name=n;o.data.materials.append(M[m]);o.parent=parent
 if scale:o.scale=scale
 return o
def ball(n,pos,r,m,parent,scale=(1,1,1),seg=12,rings=8):
 bpy.ops.mesh.primitive_uv_sphere_add(segments=seg,ring_count=rings,radius=r,location=pos);o=bpy.context.object;o.name=n;o.scale=scale;o.data.materials.append(M[m]);o.parent=parent;return o
def facing(c,eye=EYE):
 # Right/up/normal frame for a panel at c turned towards the driver's eye.
 N=(Vector(eye)-Vector(c)).normalized();R=Vector((0,0,1)).cross(N).normalized();return R,N.cross(R),N
def facing_quad(n,c,w,h,m,parent,push=0):
 R,U,N=facing(c);c=Vector(c)+N*push
 o=mesh(n,[tuple(c+R*sx*w/2+U*sy*h/2) for sx,sy in [(-1,-1),(1,-1),(1,1),(-1,1)]],[(0,1,2,3)],m,parent)
 uv=o.data.uv_layers.new(name='Display UV')
 for loop,coord in zip(uv.data,[(0,0),(1,0),(1,1),(0,1)]):loop.uv=coord
 return o
def facing_box(n,c,w,h,d,m,parent,frame=None):
 R,U,N=frame or facing(c);c=Vector(c)
 vs=[tuple(c+R*sx*w/2+U*sy*h/2+N*sz*d/2) for sz in (-1,1) for sy in (-1,1) for sx in (-1,1)]
 return mesh(n,vs,[(0,2,3,1),(4,5,7,6),(0,1,5,4),(2,6,7,3),(0,4,6,2),(1,3,7,5)],m,parent)
def pip(poly,x,y):
 inside=False
 for (x0,y0),(x1,y1) in zip(poly,poly[1:]+poly[:1]):
  if (y0>y)!=(y1>y) and x<x0+(y-y0)*(x1-x0)/(y1-y0):inside=not inside
 return inside

def floor_material():
 # Speckled grey vinyl; the aisle carries irregular slate paving in pale outline, as in the saloon photograph.
 import numpy as np
 W,H=256,1024;rng=np.random.default_rng(7)
 X,Y=np.meshgrid((np.arange(W)+.5)/W*2.4-1.2,(np.arange(H)+.5)/H*9.6-4.8)
 img=np.empty((H,W,3),np.float32);img[:]=(.43,.44,.45)
 n=rng.random((H,W));img+=((n>.95)*.11-(n<.05)*.07)[...,None]
 pts=np.stack([rng.uniform(-.5,.5,80),rng.uniform(-5,5,80)],1).astype(np.float32)
 d=np.sort(np.hypot(X[...,None]-pts[:,0],Y[...,None]-pts[:,1]),axis=2)
 aisle=np.abs(X)<.42;img[aisle]=img[aisle]*.82
 img[aisle&(d[...,1]-d[...,0]<.02)]=(.68,.69,.69);img[np.abs(np.abs(X)-.435)<.012]=(.68,.69,.69)
 rgba=np.ones((H,W,4),np.float32);rgba[...,:3]=np.clip(img,0,1)
 im=bpy.data.images.new('floor_vinyl',W,H);im.pixels.foreach_set(rgba.ravel());im.file_format='PNG';im.pack()
 m=mat('floor_vinyl',(.43,.44,.45),0,.72);t=m.node_tree.nodes.new('ShaderNodeTexImage');t.image=im
 m.node_tree.links.new(t.outputs['Color'],m.node_tree.nodes.get('Principled BSDF').inputs['Base Color']);return m

def seat(m,pos,yaw,parent):
 # Moulded single shell facing local +y: dished pan, front roll and a sculpted back with side wings.
 rows=[]
 for x in [-.23,-.215,-.15,-.05,.05,.15,.215,.23]:
  e=(abs(x)/.23)**4
  rows.append([(x,y+(e*.024 if i>=8 else 0),z+(0 if i>=8 else e*.022)) for i,(y,z) in enumerate(SEAT_PROFILE)])
 o=loft('Moulded seat',rows,m)
 mod=o.modifiers.new('Shell','SOLIDIFY');mod.thickness=.024;mod.offset=0
 bpy.context.view_layer.objects.active=o;bpy.ops.object.modifier_apply(modifier=mod.name)
 o.location=pos;o.rotation_euler.z=yaw;o.parent=parent;return o
def hand_loop(parent,x,y,top,m):
 # Strap and rounded-triangle grip hanging from the ceiling rail.
 box('Loop strap',(x,y,top-.1),(.008,.028,.2),'dark',parent)
 zc=top-.27;pts=[]
 for k in range(13):
  t=k/12*2*math.pi;r=.066*(1+.13*math.cos(3*t));pts.append((x,y+r*math.sin(t),zc+r*math.cos(t)))
 tube('Hand loop grip',pts,.012,m,parent,6)
def pole(parent,pts):return tube('Stainless stanchion',pts,.019,'stainless',parent,10)

def wall_lining(parent,y0,y1,windows,doors):
 # Lofted inner side lining with window and door openings, lined reveals and rounded window corners.
 cuts=sorted({y0,y1,*[e for a,b in windows for e in (a,b) if y0<e<y1],*[d+s*DOOR_HALF for d in doors for s in (-1,1) if y0<d+s*DOOR_HALF<y1]})
 k=len(IP);isdoor=lambda y:any(abs(y-d)<DOOR_HALF for d in doors)
 for side in [-1,1]:
  vs=[(side*x,y,z) for y in cuts for x,z in IP];fs=[]
  for j in range(len(cuts)-1):
   yb=(cuts[j]+cuts[j+1])/2;door=isdoor(yb);win=any(a<yb<b for a,b in windows)
   for i in range(k-1):
    if door and i<=5 or win and 2<=i<=4:continue
    fs.append((j*k+i,j*k+i+1,(j+1)*k+i+1,(j+1)*k+i))
  mesh('Moulded side lining',vs,fs,'pearl',parent,True)
  for a,b in windows:
   a,b=max(a,y0),min(b,y1)
   segs=[];y=a
   for c in cuts:
    if a<c<=b:
     if not isdoor((y+c)/2):
      if segs and abs(segs[-1][1]-y)<1e-6:segs[-1]=(segs[-1][0],c)
      else:segs.append((y,c))
     y=c
   for a2,b2 in segs:
    if b2-a2<.05:continue
    for z in (1.20,2.50):
     mesh('Window reveal',[(side*xin(z),a2,z),(side*(skin_x(z)-.006),a2,z),(side*(skin_x(z)-.006),b2,z),(side*xin(z),b2,z)],[(0,1,2,3)],'pearl',parent)
    zs=[1.20,1.60,2.05,2.50]
    for yy in (a2,b2):
     if isdoor(yy-.01 if yy==a2 else yy+.01):continue
     mesh('Window reveal',[(side*xin(z),yy,z) for z in zs]+[(side*(skin_x(z)-.006),yy,z) for z in zs],[(i,i+1,5+i,4+i) for i in range(3)],'pearl',parent)
    # Rounded corners: concave fillets across the full reveal depth.
    r=.1
    for yy,dy in ((a2,1),(b2,-1)):
     if isdoor(yy-.01*dy):continue
     for zz,dz in ((1.20,1),(2.50,-1)):
      arc=[(yy+dy*r*(1-math.cos(t*math.pi/10)),zz+dz*r*(1-math.sin(t*math.pi/10))) for t in range(6)]
      vs=[(side*xin(zz),yy,zz)]+[(side*(xin(z)-.002),y,z) for y,z in arc]+[(side*(skin_x(z)-.006),y,z) for y,z in arc]
      fs=[(0,i+1,i+2) for i in range(5)]+[(i+1,i+2,i+8,i+7) for i in range(5)]
      mesh('Rounded window corner',vs,fs,'pearl',parent)

def ceiling(parent,y0,y1,pids=None):
 for side in [-1,1]:
  mesh('LED cove strip',[(side*.93,y0,2.94),(side*.93,y1,2.94),(side*.72,y1,3.03),(side*.72,y0,3.03)],[(0,1,2,3)],'cabin_led',parent)
  box('Ceiling diffuser lip',(side*.715,(y0+y1)/2,3.03),(.025,y1-y0,.035),'pearl',parent)
 mesh('Central ceiling panel',[(-.72,y0,3.045),(.72,y0,3.045),(.72,y1,3.045),(-.72,y1,3.045)],[(0,1,2,3)],'pearl',parent)
 y=y0+.35
 while y<y1-.8:
  for x in (-.34,.34):
   box('Air diffuser',(x,y+.35,3.038),(.12,.7,.014),'grey_panel',parent)
   for dx in (-.03,0,.03):box('Air diffuser slot',(x+dx,y+.35,3.031),(.012,.62,.004),'dark',parent)
  cyl('Ceiling speaker',(0,y+.1,3.04),.055,.008,'grey_panel',parent,verts=16)
  y+=1.9
 for y in pids or []:
  # Double-sided passenger information display hung from the ceiling spine.
  box('PIDS housing',(0,y,2.84),(.66,.075,.18),'dark',parent,.012)
  for x in (-.24,.24):tube('PIDS hanger',[(x,y,2.93),(x,y,3.045)],.01,'stainless',parent,6)
  for f in (-1,1):
   box('PIDS screen',(0,y+f*.039,2.84),(.6,.004,.13),'pids_screen',parent)
   t=text('PIDS text','下一站 洪水橋 Hung Shui Kiu',(0,y+f*.042,2.83),.034,'led_orange',parent,rot=(math.pi/2,0,0 if f<0 else math.pi));t.data.align_y='CENTER'
 for y in (y0+.9,y1-.9):
  cyl('CCTV dome base',(.42,y,3.038),.065,.014,'pearl',parent,verts=16);ball('CCTV dome',(.42,y,3.03),.048,'pids_screen',parent,(1,1,.75))

def doorway(parent,side,d):
 # Lined reveals, stainless threshold with yellow nosing, and the step riser: nothing enters the clear opening.
 zs=[.63,.92,1.2,1.6,2.05,2.5,2.6];n=len(zs);e=DOOR_HALF
 for y in (d-e,d+e):mesh('Door reveal',[(side*xin(z),y,z) for z in zs]+[(side*(skin_x(z)-.004),y,z) for z in zs],[(i,i+1,n+i+1,n+i) for i in range(n-1)],'pearl',parent)
 mesh('Door head reveal',[(side*xin(2.6),d-e,2.6),(side*(skin_x(2.6)-.004),d-e,2.6),(side*(skin_x(2.6)-.004),d+e,2.6),(side*xin(2.6),d+e,2.6)],[(0,1,2,3)],'pearl',parent)
 box('Door threshold plate',(side*1.265,d,FLOOR+.004),(.15,2*e,.012),'stainless',parent)
 for k in range(6):box('Threshold rib',(side*(1.2+k*.022),d,FLOOR+.011),(.006,2*e,.004),'dark',parent)
 box('Threshold nosing',(side*1.318,d,FLOOR+.006),(.035,2*e,.016),'safety_yellow',parent)
 mesh('Door step riser',[(side*1.33,d-e,.38),(side*1.33,d+e,.38),(side*1.33,d+e,FLOOR),(side*1.33,d-e,FLOOR)],[(0,1,2,3)],'dark',parent)
 box('Door warning strip',(side*1.08,d,FLOOR+.005),(.2,2*e,.006),'safety_yellow',parent)
 box('Door header panel',(side*1.135,d,2.675),(.05,1.3,.13),'pearl',parent,.01)
 box('Door closing light',(side*1.108,d,2.675),(.012,.9,.022),'btn_red',parent)
 # Line map above the doorway, on the cove.
 nx,nz=-side*.8,-.6;c=(side*1.078,d,2.806)
 def put(o,depth):o.location=(c[0]+nx*depth,o.location.y,c[2]+nz*depth);o.rotation_euler.y=-side*.6435;return o
 put(box('Line map panel',(0,d,0),(.008,1.12,.13),'pearl',parent),0)
 put(box('Line map route',(0,d,0),(.004,.96,.012),'orange',parent),.005)
 for k in range(7):put(cyl('Line map stop',(0,d-.48+k*.16,0),.014,.004,'teal',parent,(0,0,0),10),.007).rotation_euler.y=math.atan2(-side*.8,-.6)
 # Door poles clear of the opening, open/intercom panel one side, emergency release the other.
 for dy in (-.66,.66):pole(parent,[(side*1.05,d+dy,FLOOR),(side*1.05,d+dy,2.42),(side*1.09,d+dy,2.54),(side*1.16,d+dy,2.61)])
 box('Door control plate',(side*1.198,d-.64,1.3),(.02,.1,.26),'grey_panel',parent,.006)
 cyl('Door open button',(side*1.186,d-.64,1.36),.026,.012,'btn_green',parent,(0,math.pi/2,0),16)
 cyl('Intercom button',(side*1.186,d-.64,1.24),.018,.012,'btn_yellow',parent,(0,math.pi/2,0),12)
 for k in range(4):box('Intercom grille',(side*1.187,d-.64,1.17-k*.012),(.004,.06,.005),'dark',parent)
 box('Emergency door release',(side*1.19,d+.64,1.85),(.035,.12,.17),'signal_red',parent,.01)
 box('Release cover',(side*1.17,d+.64,1.85),(.006,.09,.12),'pearl',parent)

def podium(parent,side,c):
 # Raised plinth over the wheel housing, carrying a back-to-back pair of single seats.
 x0,x1,y0,y1=.50,1.20,c-.8,c+.8
 box('Wheel podium',(side*(x0+x1)/2,c,(FLOOR+PODIUM)/2),(x1-x0,y1-y0,PODIUM-FLOOR),'pearl',parent,.015)
 uv_floor(mesh('Podium tread',[(side*x0,y0,PODIUM+.002),(side*x1,y0,PODIUM+.002),(side*x1,y1,PODIUM+.002),(side*x0,y1,PODIUM+.002)],[(0,1,2,3)],'floor_vinyl',parent))
 box('Podium nosing',(side*(x0+.0125),c,PODIUM-.012),(.035,y1-y0,.03),'safety_yellow',parent)
 for y,f in ((y0,1),(y1,-1)):box('Podium nosing',(side*(x0+x1)/2,y+f*.0125,PODIUM-.012),(x1-x0,.035,.03),'safety_yellow',parent)
 box('Podium vent grille',(side*(x0-.004),c,FLOOR+.16),(.01,.9,.12),'dark',parent,.004)
 box('Seat pedestal',(side*.88,c,PODIUM+.19),(.34,.5,.38),'grey_panel',parent,.02)
 for f in (-1,1):seat('seat_orange',(side*.88,c+f*.27,PODIUM),0 if f>0 else math.pi,parent)
 tube('Seat-back grab',[(side*.665,c-.12,PODIUM+.94),(side*.665,c-.12,PODIUM+1.05),(side*.665,c+.12,PODIUM+1.05),(side*.665,c+.12,PODIUM+.94)],.014,'stainless',parent,8)
 pole(parent,[(side*.53,c,PODIUM),(side*.53,c,2.56),(side*.6,c,2.68),(side*.72,c,2.72)])

def bench(parent,side,ys,m):
 # Cantilevered longitudinal seats over an ivory plinth with a heater grille.
 for y in ys:seat(m,(side*.94,y,FLOOR),side*math.pi/2,parent)
 mid=(ys[0]+ys[-1])/2;span=ys[-1]-ys[0]+.48
 box('Seat plinth',(side*1.0,mid,FLOOR+.17),(.36,span,.34),'pearl',parent,.02)
 box('Heater grille',(side*.818,mid,FLOOR+.13),(.008,span-.12,.1),'dark',parent)
 for y in (ys[0]-.26,ys[-1]+.26):tube('Seat end rail',[(side*1.19,y,FLOOR+.72),(side*.74,y,FLOOR+.72),(side*.72,y,FLOOR+.69),(side*.72,y,FLOOR+.36)],.016,'stainless',parent,8)

def passenger_interior(parent,idx):
 interior=empty('passenger_interior_'+str(idx),parent=parent)
 sign=-1 if idx==2 else 1
 windows=sorted((min(a*sign,b*sign),max(a*sign,b*sign)) for a,b in (WINDOWS_MID if idx==1 else WINDOWS_NOSE))
 y0=-CAB_Y if idx==2 else -4.78;y1=CAB_Y if idx==0 else 4.78
 wall_lining(interior,y0,y1,windows,DOORS)
 ceiling(interior,y0,y1,[-.2])
 uv_floor(mesh('Vinyl floor',[(-1.2,y0,FLOOR+.004),(1.2,y0,FLOOR+.004),(1.2,y1,FLOOR+.004),(-1.2,y1,FLOOR+.004)],[(0,1,2,3)],'floor_vinyl',interior))
 incab=lambda y:y>CAB_Y if idx==0 else y< -CAB_Y if idx==2 else False
 rnd=random.Random(70+idx)
 for side in [-1,1]:
  for d in DOORS:doorway(interior,side,d)
  for c in WHEELS:
   if not incab(c):podium(interior,side,c)
  # Middle bay between the doorways: three seats, or the wheelchair bay in the middle section.
  if idx==1 and side==-1:
   box('Wheelchair backboard',(-1.155,-.2,1.3),(.07,.72,.5),'seat_fabric',interior,.03)
   for z in (1.0,1.62):tube('Wheelchair rail',[(-1.2,-.92,z),(-1.12,-.86,z),(-1.12,.46,z),(-1.2,.52,z)],.016,'stainless',interior,8)
   box('Wheelchair sign',(-1.195,-.2,1.95),(.012,.24,.24),'wheelchair_blue',interior,.004)
   tube('Wheelchair symbol',[(-1.187,-.2+.06*math.cos(t*math.pi/8),1.92+.06*math.sin(t*math.pi/8)) for t in range(17)],.008,'pearl',interior,6)
   ball('Wheelchair symbol',(-1.187,-.19,2.03),.018,'pearl',interior,(.4,1,1),8,6)
   mesh('Wheelchair floor bay',[(-1.18,-.85,FLOOR+.006),(-.5,-.85,FLOOR+.006),(-.5,.45,FLOOR+.006),(-1.18,.45,FLOOR+.006)],[(0,1,2,3)],'wheelchair_blue',interior)
   cyl('Wheelchair call button',(-1.188,.42,1.3),.022,.012,'btn_blue',interior,(0,math.pi/2,0),12)
  else:bench(interior,side,[-.67,-.2,.27],'seat_orange')
  # Priority seats at the gangway ends; a padded lean rail where the doorway meets the podium.
  for end in (-1,1):
   if not incab(end*4.3):bench(interior,side,[end*4.05,end*4.52][::end],'mint')
  if not incab(2.0) and idx!=0:box('Lean pad',(side*1.15,1.97,1.32),(.08,.36,.16),'seat_fabric',interior,.03)
  # Ceiling rails, their brackets and hand loops.
  ra,rb=y0+.12,y1-.12
  tube('Ceiling handrail',[(side*.72,ra,2.72),(side*.72,rb,2.72)],.017,'stainless',interior,10)
  y=ra+.2
  while y<rb:tube('Handrail bracket',[(side*.72,y,2.72),(side*.72,y,3.03)],.012,'stainless',interior,6);y+=1.6
  y=ra+.45
  while y<rb-.2:
   if all(abs(y-c)>.18 for c in WHEELS):hand_loop(interior,side*.72,y,2.705,'mint' if abs(y)>3.7 else 'burgundy')
   y+=.8
  # Poster frames on the cove above the windows.
  for a,b in windows:
   a,b=max(a,y0),min(b,y1)
   if b-a<1.4:continue
   m=(a+b)/2;col=rnd.choice(LIVERY)
   rows=[[(side*(x-.006),yy,z) for x,z in [(1.172,2.61),(1.14,2.71)]] for yy in (m-.55,m+.55)]
   loft('Advert card',rows,'pearl',interior,False)
   rows=[[(side*(x-.009),yy,z) for x,z in [(1.168,2.625),(1.143,2.70)]] for yy in (m-.5,m+.5)]
   loft('Advert print',rows,col,interior,False)
 # Open gangway: pleats, tread and the turntable plate between sections.
 for end in [-1,1]:
  if idx==0 and end==1 or idx==2 and end==-1:continue
  for k in range(6):
   y=end*(4.78+k*.10)
   tube('Gangway inner pleat',[(-1.1,y,.65),(-1.1,y,2.75),(-.95,y,2.92),(.95,y,2.92),(1.1,y,2.75),(1.1,y,.65)],.035,'concrete',interior)
  box('Gangway tread',(0,end*4.99,.638),(2.13,.56,.012),'grey_panel',interior)
  for x in (-1.02,1.02):tube('Gangway handrail',[(x,end*4.72,1.05),(x*1.02,end*5.0,1.05),(x,end*5.28,1.05)],.016,'stainless',interior,8)
  if end==-1:
   cyl('Gangway turntable',(0,-5.3,.64),.62,.014,'stainless',interior,verts=32)
   for k in range(8):box('Turntable rib',(0,-5.3,.648),(1.1,.012,.004),'dark',interior).rotation_euler.z=k*math.pi/8
 merge_static(interior)

def cockpit(parent,sign):
 # Built in the leading-cab frame (+y towards the windscreen); the rear cab is rotated half a turn.
 cab=empty('cockpit_'+parent.name,parent=parent);cab.rotation_euler.z=0 if sign>0 else math.pi
 empty('driver_eye',EYE,cab)
 xs=[.62+NOSE_R*math.cos(k*math.pi/20) for k in range(11)]+[.45,.3,.15,0]
 def ring(z,off,clamp=1.19):
  pts=[nose_surface(x,z,off) for x in xs]+[nose_surface(-x,z,off) for x in reversed(xs[:-1])]
  return [Vector((max(-clamp,min(clamp,p.x)),p.y,p.z)) for p in pts]
 wall_lining(cab,CAB_Y,NOSE_Y,WINDOWS_NOSE,[])
 # Raised cab floor over the leading wheels, with a nosed step from the saloon.
 fl=ring(CAB_FLOOR,-.05)
 mesh('Raised cab floor',[(-1.2,CAB_Y+.05,CAB_FLOOR),(1.2,CAB_Y+.05,CAB_FLOOR)]+[tuple(p) for p in fl],[tuple(range(len(fl)+2))],'cab_floor',cab)
 mesh('Cab step riser',[(-1.2,CAB_Y+.05,FLOOR),(1.2,CAB_Y+.05,FLOOR),(1.2,CAB_Y+.05,CAB_FLOOR),(-1.2,CAB_Y+.05,CAB_FLOOR)],[(0,1,2,3)],'pearl',cab)
 box('Cab step nosing',(0,CAB_Y+.062,CAB_FLOOR-.012),(2.4,.035,.03),'safety_yellow',cab)
 for x in (-1,1):box('Cab wheel housing',(x*1.08,3.0,1.0),(.25,1.5,.2),'pearl',cab,.03)
 # Horseshoe console: ivory knee roll and hood around a charcoal fascia, the hood running forward to the glass.
 poly=[(-1.19,CAB_Y),(1.19,CAB_Y)]+[(p.x,p.y) for p in ring(1.56,-.07)]
 def reach(a):
  r=.9
  while pip(poly,CONSOLE_P[0]+r*math.sin(a),CONSOLE_P[1]+r*math.cos(a)) and r<3:r+=.005
  return r-.005
 A=1.38;angles=[-A+i*2*A/40 for i in range(41)]
 pt=lambda a,r,z:(CONSOLE_P[0]+r*math.sin(a),CONSOLE_P[1]+r*math.cos(a),z)
 BODY=[(1.02,CAB_FLOOR),(.95,1.14),(.80,1.24),(.71,1.29),(.675,1.35),(.685,1.40),(.705,1.418)]
 FASCIA=[(.705,1.418),(.78,1.46),(.88,1.515),(1.0,1.58)]
 def fz(r):return next(z0+(z1-z0)*(r-r0)/(r1-r0) for (r0,z0),(r1,z1) in zip(FASCIA,FASCIA[1:]) if r0<=r<=r1)
 def hood(a):
  rb=reach(a);return [(1.0,1.58),(1.05,1.612),(1.11,1.628)]+[(1.12+(rb-1.12)*t,1.627-.09*t*t) for t in (.35,.7,1)]
 for n,strip,m in [('Console knee roll',lambda a:BODY,'pearl'),('Charcoal fascia',lambda a:FASCIA,'dark'),('Console hood',hood,'pearl')]:
  loft(n,[[pt(a,r,z) for r,z in strip(a)] for a in angles],m,cab)
 for a in (-A,A):
  sec=BODY+FASCIA[1:]+hood(a)[1:]+[(reach(a),CAB_FLOOR)]
  mesh('Console end cap',[pt(a,r,z) for r,z in sec],[tuple(range(len(sec)))],'pearl',cab)
 # Screens: instrument pod behind the wheel, operating HMI to the left, saloon CCTV to the right.
 c=Vector(pt(0,1.07,1.72));R,U,N=facing(c)
 facing_box('Instrument pod',c-N*.05,.42,.24,.1,'pearl',cab,(R,U,N))
 facing_box('Instrument hood',c+U*.125+N*.03,.42,.03,.14,'pearl',cab,(R,U,N))
 facing_box('Instrument bezel',c,.35,.2,.02,'dark',cab,(R,U,N))
 d=facing_quad('cab_display_speed',c,.31,.17,'teal',cab,.012);d['animated']=True
 for a,name in ((-.56,'cab_display_hmi'),(.56,'cab_display_cctv')):
  c=Vector(pt(a,.9,1.66));R,U,N=facing(c)
  facing_box('Screen housing',c-N*.03,.39,.27,.06,'dark',cab,(R,U,N))
  facing_box('Screen stand',c-N*.05-U*.1,.2,.12,.08,'dark',cab,(R,U,N))
  d=facing_quad(name,c,.34,.215,'teal',cab,.002);d['animated']=True
  for k in range(5):
   q=c-U*.12+R*(-.14+k*.07)+N*.005;facing_box('Screen soft key',q,.045,.018,.012,'grey_panel',cab,(R,U,N))
 # Illuminated push-button banks on both wings, in the photographed colour order.
 colours=[['btn_green','btn_green','btn_yellow','btn_red'],['btn_white','btn_green','btn_yellow','btn_red'],['btn_blue','btn_white','btn_green','btn_yellow']]
 tilt=math.atan(.55)
 for wing in (-1,1):
  for row,r in enumerate((.80,.88,.96)):
   for col in range(4):
    a=wing*(.92+col*.11);p=pt(a,r,fz(r));rot=(tilt,0,-a)
    nrm=Vector((-math.sin(tilt)*math.sin(a),-math.sin(tilt)*math.cos(a),math.cos(tilt)))
    cyl('Button bezel',tuple(Vector(p)+nrm*.004),.022,.01,'stainless',cab,rot,12)
    cyl('Push button',tuple(Vector(p)+nrm*.01),.016,.012,colours[row][col if wing>0 else 3-col],cab,rot,12)
  for k in range(3):
   a=wing*(.30+k*.075);p=Vector(pt(a,.735,fz(.735)));nrm=Vector((-math.sin(tilt)*math.sin(a),-math.sin(tilt)*math.cos(a),math.cos(tilt)))
   cyl('Rotary selector',tuple(p+nrm*.016),.024,.03,'rubber',cab,(tilt,0,-a),14)
   box('Selector pointer',tuple(p+nrm*.033),(.006,.03,.004),'btn_white',cab).rotation_euler=(tilt,0,-a)
 # Key switch left, emergency stop right, direction toggles either side of the column.
 p=Vector(pt(-1.3,.86,fz(.86)));cyl('Key switch',tuple(p),.03,.02,'stainless',cab,(tilt,0,1.3),16);box('Driver key',tuple(p+Vector((0,0,.03))),(.012,.04,.05),'yellow',cab).rotation_euler.z=1.3
 p=Vector(pt(1.3,.86,fz(.86)));cyl('Emergency stop collar',tuple(p),.05,.02,'safety_yellow',cab,(tilt,0,-1.3),20);ball('Emergency stop',tuple(p+Vector((0,0,.02))),.036,'btn_red',cab,(1,1,.6),16,8)
 for x in (-.15,-.1,.1,.15):
  a=math.atan2(x,.74);p=Vector(pt(a,.745,fz(.745)))
  box('Toggle plate',tuple(p),(.03,.05,.008),'stainless',cab).rotation_euler=(tilt,0,-a)
  tube('Toggle lever',[tuple(p),tuple(p+Vector((0,-.02,.035)))],.005,'stainless',cab,6)
 # Steering: column shroud, four-spoke wheel with emblem hub, indicator stalk.
 tube('Steering column',[(0,3.78,1.33),(0,3.62,1.47),(0,3.5,1.56)],.055,'dark',cab,12)
 box('Column shroud',(0,3.66,1.43),(.16,.2,.12),'dark',cab,.04).rotation_euler.x=math.radians(-40)
 tube('Indicator stalk',[(-.07,3.62,1.47),(-.2,3.6,1.5)],.009,'dark',cab,6)
 wheel=empty('steering_wheel',(0,3.47,1.585),cab);wheel.rotation_euler.x=math.radians(42)
 tube('Steering rim',[(.235*math.cos(i*math.pi/24),.235*math.sin(i*math.pi/24),0) for i in range(49)],.022,'rubber',wheel,12)
 for ang in (0,180,240,300):
  t=math.radians(ang);tube('Steering spoke',[(.06*math.cos(t),.06*math.sin(t),-.012),(.14*math.cos(t),.14*math.sin(t),-.006),(.22*math.cos(t),.22*math.sin(t),0)],.017,'dark',wheel,8)
 cyl('Steering hub',(0,0,-.012),.07,.05,'dark',wheel,verts=24);cyl('Steering emblem',(0,0,.015),.038,.006,'stainless',wheel,verts=20)
 # Pedals on the raised floor.
 for x,w in ((.16,.09),(-.08,.15)):
  pedal=box('Driver pedal',(x,3.78,CAB_FLOOR+.1),(w,.24,.025),'rubber',cab,.008);pedal.rotation_euler.x=math.radians(38)
  for k in range(4):box('Pedal tread',(x,3.72+k*.04,CAB_FLOOR+.07+k*.032),(w-.02,.006,.006),'stainless',cab).rotation_euler.x=math.radians(38)
 # Master controller pod at the driver's right hand.
 box('Controller pod',(.52,3.06,1.17),(.17,.4,.54),'pearl',cab,.04)
 box('Controller plate',(.52,3.06,1.445),(.15,.36,.012),'dark',cab,.004)
 tube('Controller gaiter',[(.52,3.1,1.45),(.52,3.1,1.49)],.035,'rubber',cab,12)
 tube('Master controller',[(.52,3.1,1.45),(.52,3.13,1.6)],.012,'dark',cab,8);ball('Controller knob',(.52,3.135,1.62),.032,'rubber',cab,(1,1,1.2))
 cyl('Direction selector',(.52,2.96,1.465),.022,.03,'rubber',cab,verts=12);box('Direction marks',(.52,2.96,1.452),(.08,.012,.002),'btn_white',cab)
 # PA handset on the left wing with a coiled cord.
 a=-1.15;rad=Vector((math.sin(a),math.cos(a),0));tan=Vector((math.cos(a),-math.sin(a),0));c=Vector(pt(a,.86,1.17));up=Vector((0,0,1))
 box('Handset cradle',tuple(c),(.07,.22,.1),'dark',cab,.015).rotation_euler.z=math.pi/2-a
 tube('PA handset',[tuple(c-tan*.09-rad*.03+up*.02),tuple(c-rad*.045+up*.04),tuple(c+tan*.09-rad*.03+up*.02)],.022,'rubber',cab,8)
 tube('Handset cord',[tuple(c-tan*.09-rad*.05+Vector((.02*math.cos(t*.9),.02*math.sin(t*.9),-.03-t*.0062))) for t in range(40)],.004,'rubber',cab,5)
 # A-pillar camera monitors, dome camera and roller blind at the header.
 for x,name in ((-.93,'cab_display_mirror_l'),(.93,'cab_display_mirror_r')):
  c=Vector((x,4.45,2.43));R,U,N=facing(c)
  facing_box('Mirror monitor',c-N*.022,.29,.21,.04,'dark',cab,(R,U,N))
  d=facing_quad(name,c,.25,.17,'teal',cab,.002);d['animated']=True
  tube('Monitor arm',[tuple(c-N*.04+U*.08),(x*1.04,4.5,2.7),(x*1.05,4.52,2.95)],.016,'dark',cab,8)
 hdr=[ring(z,-.03) for z in (2.62,2.72,2.84,2.97)]
 loft('Windscreen header lining',hdr,'pearl',cab)
 blind=[p for p in ring(2.69,-.08) if abs(p.x)<1.02]
 tube('Roller blind housing',[tuple(p) for p in blind],.036,'dark',cab,10)
 top=[p for p in hdr[-1] if abs(p.x)<.93]
 mesh('Cab ceiling',[(-.93,CAB_Y,2.97),(.93,CAB_Y,2.97),(.93,top[0].y,2.97)]+[tuple(p) for p in top]+[(-.93,top[-1].y,2.97)],[tuple(range(len(top)+4))],'pearl',cab)
 cyl('Dome camera base',(0,4.98,2.955),.07,.014,'pearl',cab,verts=16);ball('Dome camera',(0,4.98,2.95),.05,'pids_screen',cab,(1,1,.75))
 cyl('Cab reading lamp',(-.45,3.2,2.962),.05,.01,'cabin_led',cab,verts=16);cyl('Cab speaker',(.45,3.2,2.962),.06,.01,'grey_panel',cab,verts=16)
 for x in (-.3,.3):box('Cab air louvre',(x,4.4,2.962),(.3,.08,.012),'dark',cab)
 # A-pillar trims from the side window into the black pillar, clear of the windscreen glass.
 for s in (-1,1):
  rows=[[(s*xin(z),4.85,z)]+[tuple(nose_surface(s*(.62+NOSE_R*math.cos(math.radians(t))),z,-.035)) for t in (0,9,18,27)] for z in (1.12,1.6,2.1,2.62)]
  loft('A-pillar trim',rows,'pearl',cab)
  box('Emergency hammer holder',(s*1.14,4.7,1.95),(.03,.06,.2),'dark',cab,.008);box('Emergency hammer',(s*1.12,4.7,2.0),(.03,.1,.035),'signal_red',cab,.008)
 # Driver's seat: suspension pedestal, bolstered cushion and back, integral headrest, armrests.
 cyl('Seat base plate',(0,2.88,CAB_FLOOR+.015),.21,.03,'dark',cab,verts=20)
 loft('Suspension bellows',[[(r*math.cos(t*math.pi/8),2.88+r*math.sin(t*math.pi/8),CAB_FLOOR+.03+k*.03) for t in range(16)] for k,r in enumerate([.15,.13,.15,.13,.15,.13,.15,.13,.15])],'rubber',cab,True,True)
 box('Seat frame',(0,2.88,1.2),(.46,.46,.05),'dark',cab,.012)
 box('Driver seat cushion',(0,2.9,1.29),(.52,.5,.12),'seat_fabric',cab,.045)
 for x in (-.235,.235):box('Cushion bolster',(x,2.9,1.36),(.075,.46,.06),'seat_fabric',cab,.025)
 lean=math.radians(12)
 for n,pos,size in (('Driver seat back',(0,2.62,1.82),(.52,.13,.8)),('Back bolster',(-.24,2.66,1.78),(.075,.12,.62)),('Back bolster',(.24,2.66,1.78),(.075,.12,.62)),('Driver headrest',(0,2.56,2.3),(.32,.12,.2))):
  box(n,pos,size,'seat_fabric',cab,.045).rotation_euler.x=lean
 for x in (-.08,.08):tube('Headrest post',[(x,2.6,2.18),(x,2.575,2.24)],.008,'stainless',cab,6)
 for x in (-.33,.33):box('Driver armrest',(x,2.9,1.58),(.075,.34,.07),'seat_fabric',cab,.025);cyl('Armrest pivot',(x,2.72,1.56),.03,.06,'dark',cab,(0,math.pi/2,0),12)
 box('Seat adjust lever',(-.27,3.05,1.2),(.02,.14,.02),'dark',cab)
 cyl('Fire extinguisher',(-.75,2.4,CAB_FLOOR+.23),.07,.42,'signal_red',cab,verts=16);cyl('Extinguisher head',(-.75,2.4,CAB_FLOOR+.47),.035,.06,'dark',cab,verts=12)
 # Partition behind the cab with a waist-height gate.
 for s in (-1,1):box('Cab partition',(s*.83,CAB_Y,1.79),(.74,.05,2.32),'pearl',cab,.02)
 box('Cab partition header',(0,CAB_Y,2.82),(1.0,.05,.26),'pearl',cab,.02)
 box('Cab gate',(0,CAB_Y,1.33),(.9,.035,.9),'pearl',cab,.02)
 for x in (-.46,.46):tube('Gate post',[(x,CAB_Y,FLOOR),(x,CAB_Y,1.8)],.018,'stainless',cab,8)
 merge_static(wheel);merge_static(cab)

def door_leaf(d,name,side,ly,rnd):
 # Outside-hung plug leaf: follows the bodyside curve, glazed above a white lower panel.
 leaf=empty(name,(0,ly,0),d);W=DOOR_HALF/2;outer=1 if ly>0 else -1
 def slab(n,y0,y1,z0,z1,m,out=.002,t=.032):
  zs=[z0]+[z for _,z in PROFILE[3:11] if z0<z<z1]+[z1]
  ring=[(skin_x(z)+out,z) for z in zs]+[(skin_x(z)+out-t,z) for z in reversed(zs)]
  return loft(n,[[(side*(x-1.335),y,z) for x,z in ring] for y in (y0,y1)],m,leaf,False,True,True)
 slab('Door lower panel',-W,W,.40,1.0,'body_white')
 slab('Door glazing',-W+.045,W-.045,1.0,2.49,'glass',-.004,.012)
 for a,b in ((-W,-W+.045),(W-.045,W)):slab('Door stile',a,b,1.0,2.49,'body_black',.004,.04)
 slab('Door top rail',-W,W,2.49,2.6,'body_black',.004,.04);slab('Door mid rail',-W,W,.98,1.03,'body_black',.006,.04)
 m=-outer*W;slab('Door meeting seal',min(m,m+outer*.014),max(m,m+outer*.014),.42,2.58,'rubber',.012,.05)
 if outer>0:cyl('Door open button',(side*(skin_x(.86)+.008-1.335),-.07,.86),.022,.01,'btn_green',leaf,(0,math.pi/2,0),16)
 cols=rnd.sample(LIVERY,2);yy=-W+.02
 while yy<W-.1:
  ww=rnd.uniform(.08,.16);z1=.44+rnd.uniform(.12,.45);xx=lambda z:side*(skin_x(z)+.0045-1.335)
  mesh('Door spike livery',[(xx(.44),yy,.44),(xx(.44),yy+ww,.44),(xx(z1),yy+ww*.5,z1)],[(0,1,2)],rnd.choice(cols),leaf);yy+=ww*.7
 merge_static(leaf)

def vehicle():
 reset();M.update({'seat_orange':mat('seat_orange',(.95,.36,.05),0,.38),'mint':mat('mint',(.52,.76,.30),0,.4),'burgundy':mat('burgundy',(.62,.06,.08),0,.45),'cabin_led':mat('cabin_led',(1,.89,.70),0,.3,2)})
 # Exterior-only paint: reflective metallic body colours, tinted glazing and LED destination text.
 M.update({'body_white':mat('body_white',(.86,.87,.86),.55,.18),'body_orange':mat('body_orange',(.80,.25,.06),.6,.2),'body_black':mat('body_black',(.012,.014,.016),.7,.14),'led_orange':mat('led_orange',(1,.42,.04),0,.4,4)})
 # Saloon and cab trim; btn_* push buttons keep their own glow in the game.
 M.update({'stainless':mat('stainless',(.78,.79,.8),.9,.22),'safety_yellow':mat('safety_yellow',(.98,.78,.05),0,.5),'cab_floor':mat('cab_floor',(.09,.1,.11),0,.88),'seat_fabric':mat('seat_fabric',(.1,.105,.115),0,.95),'grey_panel':mat('grey_panel',(.55,.57,.58),.1,.5),'pids_screen':mat('pids_screen',(.01,.012,.02),.3,.15),'signal_red':mat('signal_red',(.75,.05,.04),0,.4),'wheelchair_blue':mat('wheelchair_blue',(.05,.3,.75),0,.4),'floor_vinyl':floor_material()})
 for n,c,e in (('btn_green',(.1,.95,.25),2.5),('btn_red',(1,.08,.05),2.5),('btn_yellow',(1,.72,.08),2.2),('btn_white',(.95,.97,1),1.4),('btn_blue',(.15,.45,1),2.2)):M[n]=mat(n,c,0,.3,e)
 for n,c in zip(LIVERY,[(.02,.55,.68),(.95,.25,.03),(.98,.75,.2),(.95,.62,.6),(.5,.78,.9),(.25,.6,.3),(.85,.1,.04)]):M[n]=mat(n,c,.1,.35)
 g=M['glass'].node_tree.nodes.get('Principled BSDF');M['glass'].diffuse_color=(.008,.016,.02,1);g.inputs['Base Color'].default_value=(.008,.016,.02,1);g.inputs['Metallic'].default_value=.4;g.inputs['Roughness'].default_value=.04
 meta={'forward':'-Z','width':2.65,'height':3.5,'length':32.4,'sections':[]}
 for idx,label in enumerate(['front','mid','rear']):
  name='section_'+label;p=empty(name,(0,-idx*10.6,0));p['sectionIndex']=idx
  exterior(p,idx)
  box('Interior floor',(0,0,.56),(2.4,9.6,.14),'dark',p,.035)
  for side in [-1,1]:
   for wi,y in enumerate(WHEELS):
    bpy.ops.mesh.primitive_cylinder_add(vertices=24,radius=.48,depth=.22,location=(side*1.23,y,.49),rotation=(0,math.pi/2,0));w=bpy.context.object;w.name=f'{name}_wheel_{"left" if side<0 else "right"}_{wi}';w.parent=p;w.data.materials.append(M['rubber']);w['animated']=True
    bpy.ops.mesh.primitive_cylinder_add(vertices=20,radius=.31,depth=.025,location=(side*1.20,y,.49),rotation=(0,math.pi/2,0));hub=bpy.context.object;hub.data.materials.append(M['steel']);hub.parent=p
    for a in range(6):
     theta=a*math.pi/3;box('Hub spoke',(side*1.21,y+.15*math.cos(theta),.49+.15*math.sin(theta)),(.015,.055,.055),'dark',p) # ponytail: unbevelled, spokes sit mostly behind the skirt
   for di,y in enumerate(DOORS):
    dn=f'{name}_door_{"left" if side<0 else "right"}_{di}';d=empty(dn,(side*1.335,y,0),p);d['door']=True
    rnd=random.Random(idx*10+di*2+side)
    for li,ly in (('a',DOOR_HALF/2),('b',-DOOR_HALF/2)):door_leaf(d,f'{dn}_leaf_{li}',side,ly,rnd)
    box('Door track cover',(side*(skin_x(2.665)+.012),y,2.665),(.024,2.3,.05),'body_black',p,.008)
  if idx<2:
   # Black pleated accordion bellows: one closed-sided loft spanning the 0.6 m articulation gap.
   rs=[(x*(.93+(k%2)*.04),-5.0-k*.04,.40+(z-.30)*.92) for k in range(16) for x,_,z in ring(0)]
   mesh('Articulation bellows',rs,[((k+1)*NR+i,(k+1)*NR+(i+1)%NR,k*NR+(i+1)%NR,k*NR+i) for k in range(15) for i in range(NR)],'rubber',p,True)
  passenger_interior(p,idx)
  if idx in [0,2]:cockpit(p,1 if idx==0 else -1)
  empty(name+'_hitch_front',(0,5.3,.9),p);empty(name+'_hitch_rear',(0,-5.3,.9),p)
  merge_static(p)
  meta['sections'].append({'name':name,'pivot':[0,0,idx*10.6],'hitchFront':[0,.9,-5.3],'hitchRear':[0,.9,5.3],'doors':[{'name':f'{name}_door_{side}_{di}','position':[x,0,-y]} for side,x in [('left',-1.335),('right',1.335)] for di,y in enumerate(DOORS)]})
 meta.update(save('art'));return meta


def platform(id,side,width,offset,length=89.6,bent=False):
 p=empty(f'{id}_platform_{side}',(0,offset,0));edge=7.05
 # Bent A1 wing follows its dimensioned GA break; extension coordinate is measured approximation.
 def pt(x,y,z):return (side*(x+(max(0,-y-25)*.42 if bent else 0)),y,z)
 def b(n,x,y,z,sx,sy,sz,m,bev=0):
  if bev:o=box(n,(x,y,z),(sx,sy,sz),m,p,bev)
  else:
   o=mesh(n,[(xx*sx/2,yy*sy/2,zz*sz/2) for zz in [-1,1] for yy in [-1,1] for xx in [-1,1]],[(0,2,3,1),(4,5,7,6),(0,1,5,4),(2,6,7,3),(0,4,6,2),(1,3,7,5)],m,p)
  origin=Vector(pt(x,y,z))
  for v in o.data.vertices:v.co=Vector(pt(*(v.co+Vector((x,y,z)))))-origin
  o.location=origin
  if side<0:o.data.flip_normals()
  return o
 for y in range(-42,42,2):
  low=max(y,-41.8);high=min(y+2,41.8);mid=(low+high)/2;span=high-low
  mesh('Platform slab',[pt(x,yy,z) for z in [0,.3] for yy in [low,high] for x in [edge,edge+width]],[(0,2,3,1),(4,5,7,6),(0,1,5,4),(2,6,7,3),(0,4,6,2),(1,3,7,5)],'concrete',p) if bent else b('Platform slab',edge+width/2,mid,.15,width,span,.3,'concrete')
  for lane in range(int(width*2)):
   b('Paver course',edge+.25+lane*.5,mid,.306,.485,span-.015,.018,'tile')
  b('Tactile warning',edge+.38,mid,.329,.4,span-.015,.026,'yellow')
  for rail in [-.12,0,.12]:b('Tactile rib',edge+.38+rail,mid,.348,.025,span-.02,.017,'yellow')
 # 3m end ramps, total overall 89.6m with central 83.6m flat deck.
 for end in [-1,1]:
  y0=end*41.8;y1=end*44.8;x0=edge;x1=edge+width
  mesh('Access ramp',[pt(x0,y0,.315),pt(x1,y0,.315),pt(x1,y1,.30),pt(x0,y1,.30)],[(0,1,2,3)],'tile',p)
 # One closed wall/haunch/roof profile per bay, including fascia and end caps.
 # The closest roof point is 500 mm behind the curb, including the bent A1 wing.
 back=edge+width-.15;front=edge+.5
 curve=[(back,.31),(back,2.45)]
 for j in range(1,13):
  a=j*math.pi/24
  curve.append((back-.6+.6*math.cos(a),2.45+.6*math.sin(a)))
 curve.append((front,3.27))
 outer=[]
 for i,(x,z) in enumerate(curve):
  normals=[]
  for j in [i-1,i]:
   if 0<=j<len(curve)-1:
    dx=curve[j+1][0]-curve[j][0];dz=curve[j+1][1]-curve[j][1];n=math.hypot(dx,dz)
    normals.append(Vector((dz/n,-dx/n)))
  normal=sum(normals,Vector((0,0))).normalized()
  shell_offset=normal*(.2/normal.dot(normals[0]))
  outer.append((x+shell_offset.x,z+shell_offset.y))
 outer[-1]=(front,3.47)
 profile=curve+outer[::-1];count=len(profile)
 def shell(name,y0,y1,material,rib=False):
  section=[(x-(.035 if rib and i<len(curve)-1 else 0),z) for i,(x,z) in enumerate(profile)]
  rows=[y0]+([-25] if bent and y0 < -25 < y1 else [])+[y1]
  vs=[pt(x,y,z) for y in rows for x,z in section]
  faces=[(r*count+i,r*count+(i+1)%count,(r+1)*count+(i+1)%count,(r+1)*count+i) for r in range(len(rows)-1) for i in range(count)]
  faces.extend([tuple(reversed(range(count))),tuple(range((len(rows)-1)*count,len(rows)*count))])
  o=mesh(name,vs,faces,material,p)
  if material!='accent':
   o.data.materials.append(M['accent'])
   for r in range(len(rows)-1):o.data.polygons[r*count+len(curve)-1].material_index=1
  bm=bmesh.new();bm.from_mesh(o.data);bmesh.ops.recalc_face_normals(bm,faces=list(bm.faces))
  assert all(e.is_manifold for e in bm.edges),name+' must be closed'
  bm.to_mesh(o.data);bm.free()
  # Smooth only the rounded haunch; keep the soffit, fascia and end caps planar.
  for i,f in enumerate(o.data.polygons):
   k=i%count;f.use_smooth=i<len(faces)-2 and (1<=k<len(curve)-2 or count-len(curve)+1<=k<count-2)
  return o
 for bay,y in enumerate([-39.8+i*5 for i in range(17)]):
  shell('Closed curved canopy',y-2.34,y+(2.34 if bay==16 else 2.5),'roof')
  b('Lower aluminium cladding',back-.025,y,1.31,.12,4.98,2,'cladding')
  b('Wall panel seam',back-.091,y-2.48,1.38,.008,.012,2.1,'panel')
  for z in [1.05,1.78,2.31]:b('Horizontal cladding joint',back-.091,y,z,.008,4.98,.012,'panel')
  # Solid coloured portal frames and a continuous enclosed front fascia.
  shell('Closed canopy rib',y-2.5,y-2.34,'accent' if bay%4==0 else 'cladding',rib=True)
  if bay==16:shell('Closed canopy end',y+2.34,y+2.5,'accent',rib=True)
  b('Recessed canopy light',edge+width*.42,y,3.12,.24,1.4,.028,'light')
  if bay%4!=3:
   for dy in [-1.1,1.1]:
    b('Poster frame',back-.10,y+dy,1.95,.07,.85,1.2,'dark')
    b('Poster artwork',back-.15,y+dy,1.96,.035,.73,1.08,'cladding')
    b('Poster colour field',back-.18,y+dy,1.67,.025,.70,.47,'accent')
    for j in range(5):
     tube('Poster rays',[pt(back-.20,y+dy,2.02),pt(back-.20,y+dy+(j-2)*.12,2.37)],.016,'teal' if j%2 else 'yellow',p)
  else:
   b('Rear station board',back-.10,y,1.95,.08,3.35,1.15,'cladding')
   for label,z,size in [(STATION_NAMES[id]['zh'],2.05,.38),(STATION_NAMES[id]['name'],1.72,.19)]:
    o=text('Rear board lettering',label,pt(back-.16,y,z),size,'panel',p,rot=(math.pi/2,0,-side*math.pi/2));bpy.context.view_layer.update()
    if o.dimensions.y>3.05:o.scale*=3.05/o.dimensions.y

 # Roadside approach rails run longitudinally, leaving the access through the gates clear.
 for end in [-1,1]:
  rail=empty(f'{id}_platform_{side}_approach_rail_{end}',parent=p)
  def height(y):return .315-.015*max(0,(abs(y)-41.8)/3)
  tube('Approach handrail',[pt(edge+.18,end*y,height(y)+1.09) for y in [36.5,41.8,44.8]],.035,'steel',rail)
  for j in range(53):
   y=end*(36.5+j*8.3/52);z=height(y)
   tube('Approach railing bar',[pt(edge+.18,y,z),pt(edge+.18,y,z+1.09)],.018,'steel',rail)
  merge_static(rail)
 for y in [-27,-12,8,25]:
  b('Bench seat',edge+width-1.2,y,.8,.65,2,.12,'sand',.04)
  for dy in [-.75,.75]:b('Bench leg',edge+width-1.2,y+dy,.55,.08,.1,.5,'steel')
  b('Bench back',edge+width-.92,y,1.13,.10,2,.6,'sand',.04)
 for y in [-30,0,30]:
  b('Suspended station sign',edge+1.5,y,2.82,.12,2.5,.46,'dark',.025)
  # Text faces inward, readable from platform and passing vehicle.
  for label,z,size in [(STATION_NAMES[id]['zh'],2.85,.18),(STATION_NAMES[id]['name'],2.66,.115)]:
   o=text('Station name',label,pt(edge+1.43,y,z),size,'sign_text',p,rot=(math.pi/2,0,-side*math.pi/2));bpy.context.view_layer.update()
   if o.dimensions.y>2.28:o.scale*=2.28/o.dimensions.y

 for y in [-36,36]:
  for dx in [.9,1.8,2.7]:
   b('Fare gate',edge+dx,y,.82,.22,.7,1,'steel',.08)
   b('Gate reader',edge+dx,y,1.34,.17,.22,.08,'teal',.02)
 merge_static(p)
 return {'name':p.name,'side':side,'width':width,'length':length,'offsetZ':-offset,'edgeX':side*edge,'height':.31,'bent':bent,'bendStartLocalZ':25,'bendSlope':.42 if bent else 0}

def station(id):
 reset();width=6 if id=='A2' else (5 if id=='A1' else 4)
 colors=[(.08,.38,.31),(.07,.27,.61),(.57,.17,.24),(.45,.22,.57),(.68,.38,.06),(.10,.47,.53),(.45,.55,.17)]
 c=colors[int(id[1:])-1];M['accent'].diffuse_color=(*c,1);M['accent'].node_tree.nodes.get('Principled BSDF').inputs['Base Color'].default_value=(*c,1);M['sign_text']=mat('sign_text',(.92,.98,1),0,.5,1)

 # A2 platform starts differ by ~18.5m from scaled GA; retain stagger explicitly.
 plats=[platform(id,-1,width,-9.25 if id=='A2' else 0,bent=id=='A1'),platform(id,1,width,9.25 if id=='A2' else 0,bent=id=='A1')]
 d={'id':id,'platforms':plats,'roadGap':14.1,'source':'ST-110'+str(int(id[1:])),'appearance':'ACABAS Issue 3 station render and ST-5301–5307 curved cladding','inferred':'Poster artwork, furniture positions and A1 wing interpolation; platform dimensions from GA. Bench backs are outboard of seats, facing the carriageway.'};d.update(save('station-'+id));return d

if __name__=='__main__':
 OUT.mkdir(exist_ok=True,parents=True);BLEND.mkdir(exist_ok=True,parents=True)
 if '--vehicle' in sys.argv:
  manifest=json.loads((OUT/'asset-manifest.json').read_text());manifest['vehicle']=vehicle();(OUT/'asset-manifest.json').write_text(json.dumps(manifest,indent=2));sys.exit(0)
 if '--station' in sys.argv:
  sid=sys.argv[sys.argv.index('--station')+1]
  if sid not in ['A'+str(i) for i in range(1,8)]:raise ValueError('Unknown station')
  manifest=json.loads((OUT/'asset-manifest.json').read_text());new=station(sid)
  manifest['stations']=[new if st['id']==sid else st for st in manifest['stations']]
  (OUT/'asset-manifest.json').write_text(json.dumps(manifest,indent=2));sys.exit(0)
 manifest={'vehicle':vehicle(),'stations':[station('A2')]}
 (OUT/'asset-manifest.json').write_text(json.dumps(manifest,indent=2))
 for sid in ['A1','A3','A4','A5','A6','A7']:
  manifest['stations'].append(station(sid));(OUT/'asset-manifest.json').write_text(json.dumps(manifest,indent=2))
 # Detailed saloon and cab; other trams hide interiors beyond 60 m in the game.
 assert manifest['vehicle']['triangles']<200000
 # Closed canopy shells and bilingual sign lettering remain below 60k triangles per station.
 assert all(s['triangles']<60000 for s in manifest['stations'])
