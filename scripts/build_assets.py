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
 bpy.ops.export_scene.gltf(filepath=str(OUT/(name+'.glb')),export_format='GLB',export_yup=True,export_extras=True)
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
 windows=[(-4.75,-2.35),(-.85,.45),(1.95,3.75),(3.95,4.85)] if nose else [(-4.75,-2.35),(-.85,.45),(1.95,4.75)]
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

def cockpit(parent,sign):
 cab=empty('cockpit_'+parent.name,parent=parent);cab.rotation_euler.z=0 if sign>0 else math.pi
 empty('driver_eye',(0,2.7,2.05),cab)
 # Curved console surrounds the seated driver, below the windscreen sightline.
 vs=[]
 for i in range(25):
  a=-1.23+i*2.46/24
  for radius,z in [(.72,.68),(1.12,.68),(1.12,1.42),(.72,1.30)]:vs.append((radius*math.sin(a),2.95+radius*math.cos(a),z))
 fs=[(i*4+j,i*4+(j+1)%4,(i+1)*4+(j+1)%4,(i+1)*4+j) for i in range(24) for j in range(4)]
 mesh('Curved ivory console',vs,fs,'pearl',cab)
 vs=[]
 for i in range(25):
  a=-1.23+i*2.46/24
  for radius,z in [(.70,1.32),(1.14,1.45)]:vs.append((radius*math.sin(a),2.95+radius*math.cos(a),z))
 mesh('Charcoal instrument fascia',vs,[(i*2,i*2+1,i*2+3,i*2+2) for i in range(24)],'dark',cab)
 for x,y,z,angle in [(0,3.97,1.47,0),(-.53,3.72,1.43,-.42),(.53,3.72,1.43,.42),(-1.04,4.00,2.34,-.35),(1.04,4.00,2.34,.35)]:
  frame=box('Instrument surround',(x,y,z),(.40,.055,.27),'dark',cab,.025);frame.rotation_euler.x=math.radians(18);frame.rotation_euler.z=angle
  display=mesh('cab_display',[(-.175,-.041,-.107),(.175,-.041,-.107),(.175,-.041,.107),(-.175,-.041,.107)],[(0,1,2,3)],'teal',cab);display.location=(x,y,z);display.rotation_euler=frame.rotation_euler;display['animated']=True
  uv=display.data.uv_layers.new(name='Display UV')
  for loop,coord in zip(uv.data,[(0,0),(1,0),(1,1),(0,1)]):loop.uv=coord
 for side in [-1,1]:
  box('Button bank',(side*.83,3.33,1.435),(.38,.48,.065),'dark',cab,.025)
  for row in range(4):
   for col in range(3):
    x=side*(.73+col*.075);y=3.47-row*.095;z=1.48
    bpy.ops.mesh.primitive_uv_sphere_add(segments=10,ring_count=6,radius=.024,location=(x,y,z));o=bpy.context.object;o.name='Illuminated control';o.scale.z=.4;o.data.materials.append(M[['teal','red','yellow'][col]]);o.parent=cab
  tube('Windshield ivory pillar',[(side*1.14,3.9,1.45),(side*1.08,4.20,2.15),(side*.94,4.14,3.05)],.07,'pearl',cab,10)
  box('Cab side lining',(side*1.19,3.4,1.09),(.09,1.9,.9),'pearl',cab,.03)
  box('Sun visor',(side*.51,4.12,2.88),(.8,.09,.23),'dark',cab,.025)
 box('Cab roof lining',(0,3.4,3.02),(2.2,2.3,.10),'pearl',cab,.06)
 box('Driver pedestal',(0,2.68,.82),(.46,.52,.40),'dark',cab,.06)
 box('Driver seat cushion',(0,2.68,1.08),(.56,.60,.16),'dark',cab,.07)
 back=box('Driver high back',(0,2.39,1.55),(.56,.15,.95),'dark',cab,.08);back.rotation_euler.x=-.08
 box('Driver headrest',(0,2.36,2.07),(.36,.16,.26),'dark',cab,.06)
 for side in [-1,1]:box('Driver armrest',(side*.36,2.7,1.32),(.10,.48,.09),'dark',cab,.035)
 tube('Steering column',[(0,3.55,.75),(0,3.51,1.34)],.06,'dark',cab)
 wheel=empty('steering_wheel',(0,3.50,1.43),cab);wheel.rotation_euler.x=math.radians(62)
 tube('Steering rim',[(.245*math.cos(i*math.pi/24),.245*math.sin(i*math.pi/24),0) for i in range(49)],.024,'rubber',wheel,10)
 for a in [0,2.1,4.2]:tube('Steering spoke',[(0,0,0),(.23*math.cos(a),.23*math.sin(a),0)],.022,'dark',wheel)
 box('Steering hub',(0,0,0),(.15,.12,.05),'dark',wheel,.035)
 for x in [-.12,.12]:pedal=box('Driver pedal',(x,3.47,.74),(.12,.24,.035),'rubber',cab,.012);pedal.rotation_euler.x=.32
 for x in [-.92,.92]:box('Cab partition',(x,2.15,1.82),(.25,.08,2.35),'pearl',cab,.04)
 box('Cab partition header',(0,2.15,2.94),(2.1,.08,.2),'pearl',cab,.04)
 merge_static(wheel);merge_static(cab)

def passenger_interior(parent,idx):
 interior=empty('passenger_interior_'+str(idx),parent=parent)
 for side in [-1,1]:
  box('Recessed LED diffuser',(side*.64,0,2.975),(.075,8.8,.035),'cabin_led',interior,.012)
  for y in [-3,0,3]:
   for dx in [-.09,0,.09]:box('Ceiling ventilation slot',(side*.94+dx,y,2.997),(.028,1.2,.015),'dark',interior)
 box('Ivory ceiling',(0,0,3.06),(2.36,9.6,.10),'pearl',interior,.05)
 for y in [-3,0,3]:
  box('Ceiling service panel',(0,y,2.99),(.85,1.5,.055),'concrete',interior,.1)
 for side in [-1,1]:
  box('Lower interior lining',(side*1.19,0,.98),(.055,9.6,.68),'pearl',interior,.02)
  tube('Overhead stainless rail',[(side*.79,-4.65,2.76),(side*.79,4.65,2.76)],.024,'steel',interior)
  for y in [-4.25,-3.6,-.15,2.55,3.3,4.05]:
   if idx==0 and y>2 or idx==2 and y< -2:continue
   # Orange longitudinal seats, with contrasting priority seats at the gangways.
   color='mint' if abs(y)>4 else 'seat_orange'
   box('Moulded seat pan',(side*.94,y,1.0),(.48,.56,.13),color,interior,.065)
   back=box('Moulded seat back',(side*1.13,y,1.33),(.11,.56,.65),color,interior,.06);back.rotation_euler.y=-side*.09
   box('Seat plinth',(side*1.04,y,.78),(.29,.48,.31),'pearl',interior,.025)
  for y in [-4.6,-2.4,.35,2.05,4.6]:
   if idx==0 and y>2 or idx==2 and y< -2:continue
   tube('Stainless stanchion',[(side*.72,y,.64),(side*.72,y,2.65),(side*.80,y,2.76)],.025,'steel',interior)
   tube('Seat end armrest',[(side*1.17,y,1.25),(side*.7,y,1.25),(side*.7,y,1.0)],.022,'steel',interior)
  for y in [-4,-3,-2,-1,0,1,2,3,4]:
   if idx==0 and y>2 or idx==2 and y< -2:continue
   tube('Strap webbing',[(side*.79,y,2.76),(side*.79,y,2.53)],.012,'dark',interior)
   tube('Hanging hand loop',[(side*.79+.095*math.cos(a*math.pi/12),y,2.43+.10*math.sin(a*math.pi/12)) for a in range(25)],.016,'burgundy',interior)
  for y in [-1.6,1.2]:
   box('Door header',(side*1.19,y,2.82),(.12,1.2,.20),'pearl',interior,.035)
   for dy in [-.62,.62]:box('Door inner pillar',(side*1.20,y+dy,1.8),(.11,.08,2.30),'pearl',interior,.02)
   box('Door request button',(side*1.13,y+.66,1.65),(.04,.08,.11),'red',interior,.015)
 # Open gangway rings, never a solid cap across the aisle.
 for end in [-1,1]:
  if idx==0 and end==1 or idx==2 and end==-1:continue
  for k in range(6):
   y=end*(4.78+k*.10)
   tube('Gangway inner pleat',[(-1.1,y,.65),(-1.1,y,2.75),(-.95,y,2.92),(.95,y,2.92),(1.1,y,2.75),(1.1,y,.65)],.035,'concrete',interior)
  box('Gangway tread',(0,end*4.99,.65),(2.13,.56,.035),'dark',interior)
 merge_static(interior)

def vehicle():
 reset();M.update({'seat_orange':mat('seat_orange',(.95,.28,.025),0,.4),'mint':mat('mint',(.52,.76,.30),0,.42),'burgundy':mat('burgundy',(.22,.035,.07),0,.5),'cabin_led':mat('cabin_led',(1,.89,.70),0,.3,2)})
 # Exterior-only paint: reflective metallic body colours, tinted glazing and LED destination text.
 M.update({'body_white':mat('body_white',(.86,.87,.86),.55,.18),'body_orange':mat('body_orange',(.80,.25,.06),.6,.2),'body_black':mat('body_black',(.012,.014,.016),.7,.14),'led_orange':mat('led_orange',(1,.42,.04),0,.4,4)})
 for n,c in zip(LIVERY,[(.02,.55,.68),(.95,.25,.03),(.98,.75,.2),(.95,.62,.6),(.5,.78,.9),(.25,.6,.3),(.85,.1,.04)]):M[n]=mat(n,c,.1,.35)
 g=M['glass'].node_tree.nodes.get('Principled BSDF');M['glass'].diffuse_color=(.008,.016,.02,1);g.inputs['Base Color'].default_value=(.008,.016,.02,1);g.inputs['Metallic'].default_value=.4;g.inputs['Roughness'].default_value=.04
 meta={'forward':'-Z','width':2.65,'height':3.5,'length':32.4,'sections':[]}
 for idx,label in enumerate(['front','mid','rear']):
  name='section_'+label;p=empty(name,(0,-idx*10.6,0));p['sectionIndex']=idx
  exterior(p,idx)
  box('Interior floor',(0,0,.56),(2.4,9.6,.14),'dark',p,.035)
  for side in [-1,1]:
   for wi,y in enumerate([-3.0,3.0]):
    bpy.ops.mesh.primitive_cylinder_add(vertices=24,radius=.48,depth=.22,location=(side*1.23,y,.49),rotation=(0,math.pi/2,0));w=bpy.context.object;w.name=f'{name}_wheel_{"left" if side<0 else "right"}_{wi}';w.parent=p;w.data.materials.append(M['rubber']);w['animated']=True
    bpy.ops.mesh.primitive_cylinder_add(vertices=20,radius=.31,depth=.025,location=(side*1.20,y,.49),rotation=(0,math.pi/2,0));hub=bpy.context.object;hub.data.materials.append(M['steel']);hub.parent=p
    for a in range(6):
     theta=a*math.pi/3;box('Hub spoke',(side*1.21,y+.15*math.cos(theta),.49+.15*math.sin(theta)),(.015,.055,.055),'dark',p) # ponytail: unbevelled, spokes sit mostly behind the skirt
   for di,y in enumerate(DOORS):
    dn=f'{name}_door_{"left" if side<0 else "right"}_{di}';d=empty(dn,(side*1.335,y,0),p);d['door']=True
    for edge in [-1,1]:box('Door jamb',(0,edge*.535,1.59),(.042,.05,2.46),'body_black',d)
    for z in [.385,2.795]:box('Door header',(0,0,z),(.042,1.12,.05),'body_black',d)
    box('Door glazing',(side*.024,0,1.93),(.022,1.02,1.7),'glass',d,.025)
    box('Door lower',(side*.026,0,.68),(.023,1.02,.57),'body_white',d,.02)
    box('Door split',(side*.043,0,1.6),(.025,.025,2.36),'dark',d)
    tube('Door grab',[(side*.054,.15,1.16),(side*.054,.15,1.65)],.013,'steel',d)
    rnd=random.Random(idx*10+di*2+side);yy=-.5
    while yy<.42:
     ww=rnd.uniform(.1,.2);mesh('Door spike livery',[(side*.04,yy,.42),(side*.04,yy+ww,.42),(side*.04,yy+ww*.5,.42+rnd.uniform(.12,.5))],[(0,1,2)],rnd.choice(LIVERY),d);yy+=ww*.7
    merge_static(d)
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
  o=box(n,(x,y,z),(sx,sy,sz),m,p,bev)
  origin=Vector(pt(x,y,z))
  for v in o.data.vertices:v.co=Vector(pt(*(v.co+Vector((x,y,z)))))-origin
  o.location=origin
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
 # ACABAS station render and ST-5301–5307: continuous aluminium back wall,
 # curved haunch, 5 m structural bays and open boarding face.
 for bay,y in enumerate([-39.8+i*5 for i in range(17)]):
  back=edge+width-.15
  curve=[(back,.31),(back,2.45)]
  for j in range(1,9):
   a=j*math.pi/16
   curve.append((back-.6+.6*math.cos(a),2.45+.6*math.sin(a)))
  curve.extend([(edge+.5,3.47),(edge-.12,3.5)])
  for k,((x0,z0),(x1,z1)) in enumerate(zip(curve,curve[1:])):
   # Closed 120 mm shell with visible soffit and bay end faces.
   dx=x1-x0;dz=z1-z0;n=math.hypot(dx,dz);ox=-dz/n*.12;oz=dx/n*.12
   vs=[pt(x,y0,z) for x,z in [(x0,z0),(x1,z1),(x1+ox,z1+oz),(x0+ox,z0+oz)] for y0 in [y-2.49,y+2.49]]
   mesh('Curved wall and canopy',vs,[(0,2,3,1),(4,6,7,5),(0,1,5,4),(2,6,7,3),(0,4,6,2),(1,3,7,5)],'panel' if k==0 else 'roof',p)
  b('Lower aluminium cladding',back-.025,y,.77,.12,4.96,.9,'cladding')
  b('Wall panel seam',back-.09,y-2.48,1.65,.035,.025,2.65,'dark')
  # Red ribs wrap from the back wall to the front fascia, as in the source view.
  for k,((x0,z0),(x1,z1)) in enumerate(zip(curve,curve[1:])):
   mesh('Canopy rib',[pt(x0-.05,y-2.49,z0),pt(x1-.05,y-2.49,z1),pt(x1-.05,y-2.29,z1),pt(x0-.05,y-2.29,z0)],[(0,1,2,3),(3,2,1,0)],'accent' if bay%4==0 else 'cladding',p)
  b('Red roof edge',edge-.10,y,3.52,.15,4.99,.15,'accent')
  b('Recessed canopy light',edge+width*.42,y,3.28,.24,1.4,.028,'light')
  if bay%4!=3:
   for dy in [-1.1,1.1]:
    b('Poster frame',back-.10,y+dy,1.95,.07,.85,1.2,'dark')
    b('Poster artwork',back-.15,y+dy,1.96,.035,.73,1.08,'cladding')
    b('Poster colour field',back-.18,y+dy,1.67,.025,.70,.47,'accent')
    for j in range(5):
     tube('Poster rays',[pt(back-.20,y+dy,2.02),pt(back-.20,y+dy+(j-2)*.12,2.37)],.016,'teal' if j%2 else 'yellow',p)
  else:
   b('Rear station board',back-.10,y,1.95,.08,3.35,1.15,'cladding')
   text('Rear board lettering',STATION_NAMES[id]['zh']+' / '+STATION_NAMES[id]['name'],pt(back-.16,y,1.95),.20,'teal',p,rot=(math.pi/2,0,-side*math.pi/2))
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
  b('Passenger information',edge+width-.48,y+2,1.7,.12,1.5,1.8,'pearl',.025)
  b('Map graphic',edge+width-.55,y+2,1.85,.02,1.27,1.14,'teal')
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
 assert manifest['vehicle']['triangles']<100000
 # Closed canopy shells and bilingual sign lettering remain below 60k triangles per station.
 assert all(s['triangles']<60000 for s in manifest['stations'])
