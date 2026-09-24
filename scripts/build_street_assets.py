"""Blender-built street kit; +Y forward, feet at Z=0. Run with Blender -b -P."""
import math, sys, random
from pathlib import Path
sys.dont_write_bytecode=True
sys.path.insert(0,str(Path(__file__).resolve().parent))
import build_assets as b
import bpy
from mathutils import Vector

# Most facade pieces are plain boxes: avoid Blender operator scene updates per brick.
_bevel_box=b.box
def box(name,pos,size,material,parent=None,bev=0):
 if bev:return _bevel_box(name,pos,size,material,parent,bev)
 x,y,z=(v/2 for v in size)
 o=b.mesh(name,[(-x,-y,-z),(x,-y,-z),(x,y,-z),(-x,y,-z),(-x,-y,z),(x,-y,z),(x,y,z),(-x,y,z)],[(3,2,1,0),(4,5,6,7),(0,1,5,4),(1,2,6,5),(2,3,7,6),(3,0,4,7)],material,parent)
 o.location=pos
 return o
b.box=box


def ellipsoid(name, pos, size, material, parent):
 bpy.ops.mesh.primitive_uv_sphere_add(segments=6 if material=='flower' else 12, ring_count=4 if material=='flower' else 8, radius=1, location=pos)
 o=bpy.context.object;o.name=name;o.scale=size;o.parent=parent;o.data.materials.append(b.M[material])
 for f in o.data.polygons:f.use_smooth=True
 return o


def wheel(name, y, radius, width, parent, x=0):
 p=b.empty(name,(x,y,radius+.025),parent)
 if width>.15:
  for r,depth,material in [(radius,width,'rubber'),(radius*.68,width+.012,'steel'),(radius*.24,width+.025,'dark')]:
   bpy.ops.mesh.primitive_cylinder_add(vertices=24,radius=r,depth=depth,rotation=(0,math.pi/2,0))
   o=bpy.context.object;o.name='Road tyre' if material=='rubber' else 'Alloy hub';o.parent=p;o.data.materials.append(b.M[material])
   for f in o.data.polygons:f.use_smooth=len(f.vertices)==4
 else:
  for r,thick,mat in [(radius,.037,'rubber'),(radius*.83,.016,'steel')]:
   b.tube('Wheel rim',[(0,r*math.cos(i*math.tau/32),r*math.sin(i*math.tau/32)) for i in range(33)],thick,mat,p)
  for i in range(12):
   a=i*math.tau/12;b.tube('Spoke',[(0,0,0),(0,radius*.82*math.cos(a),radius*.82*math.sin(a))],.006,'steel',p,4)
 b.tube('Axle',[(-width/2,0,0),(width/2,0,0)],.04,'dark',p)
 b.merge_static(p)
 return p


def loft(name,pts,radii,material,parent,sides=12):
 """Smooth limb/torso section: elliptical rings (rx side, ry front-back) along pts, capped at both ends."""
 vs=[];fs=[]
 for i,p in enumerate(pts):
  t=Vector(pts[min(i+1,len(pts)-1)])-Vector(pts[max(0,i-1)]);t.normalize();u=t.cross(Vector((0,0,1)))
  if u.length<.01:u=Vector((1,0,0))
  u.normalize();v=t.cross(u);rx,ry=radii[i] if isinstance(radii[i],tuple) else (radii[i],radii[i])
  vs.extend([tuple(Vector(p)+u*rx*math.cos(a*math.tau/sides)+v*ry*math.sin(a*math.tau/sides)) for a in range(sides)])
 n=len(pts);fs=[(i*sides+j,i*sides+(j+1)%sides,(i+1)*sides+(j+1)%sides,(i+1)*sides+j) for i in range(n-1) for j in range(sides)]
 vs.extend([tuple(pts[0]),tuple(pts[-1])]);first,last=len(vs)-2,len(vs)-1
 fs+=[(first,(j+1)%sides,j) for j in range(sides)]+[(last,(n-1)*sides+j,(n-1)*sides+(j+1)%sides) for j in range(sides)]
 return b.mesh(name,vs,fs,material,parent,True)


def person(index):
 """Jointed pedestrian: pelvis (body) → chest → shoulders/elbows, hips → knees → ankles. JS drives the gait."""
 p=b.empty('pedestrian_'+str(index));shirt=['teal','burgundy','blue','sand'][index%4]
 female=index%2==1;elder=index in (4,5);child=index in (6,7);seated=index>=8
 p['gender']='female' if female else 'male';p['age']='child' if child else 'older' if elder else 'adult';p['wheelchair']=seated
 hair='silver' if elder else 'hair';skin='skin'+str(index%3);legwear=['trouser_charcoal','trouser_navy','trouser_khaki'][index%3]
 if child:p.scale=(.72,.72,.72)
 elif elder:p.scale=(.94,.96,.94)
 body=b.empty(p.name+'_body',(0,0,-.37 if seated else 0),p)
 # Pelvis and optional tunic stay with the hips; everything above the waist twists with the chest.
 ellipsoid('Hips',(0,-.005,.94),(.155,.105,.12),legwear,body)
 chest=b.empty(p.name+'_chest',(0,0,.98),body)
 w=.9 if female else 1
 loft('Torso',[(0,-.005,0),(0,0,.12),(0,.005,.3),(0,-.005,.43),(0,-.01,.51)],[(.14*w,.1),(.15*w,.105),(.17*w,.12),(.18*w,.105),(.08,.07)],shirt,chest,14)
 if female and not seated:loft('Tunic hem',[(0,0,.12),(0,0,-.02),(0,0,-.2)],[(.155,.11),(.17,.125),(.2,.15)],shirt,chest,14)
 loft('Neck',[(0,0,.48),(0,.005,.6)],[.052,.047],skin,chest)
 ellipsoid('Face',(0,.012,.655),(.093,.108,.118),skin,chest)
 ellipsoid('Jaw',(0,.035,.6),(.074,.078,.055),skin,chest)
 ellipsoid('Hair',(0,-.012,.705),(.1,.117,.082),hair,chest)
 ellipsoid('Nose',(0,.112,.648),(.014,.022,.024),skin,chest)
 for s in [-1,1]:
  ellipsoid('Eye',(s*.036,.1,.668),(.013,.008,.009),'dark',chest)
  ellipsoid('Ear',(s*.094,0,.655),(.018,.026,.038),skin,chest)
 if female:ellipsoid('Long hair',(0,-.07,.6),(.12,.1,.17),hair,chest)
 if elder:
  for side in [-1,1]:b.tube('Spectacle rim',[(side*.037+.03*math.cos(a*math.tau/12),.108,.67+.024*math.sin(a*math.tau/12)) for a in range(13)],.005,'steel',chest,4)
 b.box('Backpack',(0,-.17,.24),(.28,.14,.36),'dark',chest,.05)
 for s in [-1,1]:b.tube('Bag strap',[(s*.12,-.11,.45),(s*.14,.1,.36),(s*.13,.11,.06)],.016,'dark',chest)
 for s in [-1,1]:
  arm=b.empty(p.name+'_arm_'+str(s),(s*.2*w,-.01,.42),chest);arm.rotation_euler.y=-s*.07
  loft('Shoulder',[(0,0,.035),(0,0,-.02)],[(.058,.06),(.057,.058)],shirt,arm)
  loft('Upper arm',[(0,0,.02),(0,0,-.14),(0,0,-.28)],[.056,.05,.043],shirt if not elder else shirt,arm)
  elbow=b.empty(p.name+'_elbow_'+str(s),(0,0,-.285),arm)
  ellipsoid('Elbow',(0,0,0),(.043,.043,.045),skin,elbow)
  loft('Forearm',[(0,0,.015),(0,.004,-.12),(0,.005,-.245)],[.041,.037,.029],skin,elbow)
  ellipsoid('Hand',(0,.008,-.31),(.027,.043,.072),skin,elbow)
  if elder and s==1:b.tube('Walking cane',[(0,.03,-.3),(0,.06,-.35),(0,.08,-1.1)],.013,'dark',elbow)
  hip=b.empty(p.name+'_leg_'+str(s),(s*.092,0,.92),body)
  ellipsoid('Hip joint',(0,0,0),(.1,.1,.1),legwear,hip)
  loft('Thigh',[(0,0,.07),(0,.012,-.12),(0,.006,-.3),(0,0,-.43)],[.1,.092,.076,.064],legwear,hip)
  knee=b.empty(p.name+'_knee_'+str(s),(0,0,-.43),hip)
  ellipsoid('Knee',(0,0,0),(.061,.063,.07),legwear,knee)
  loft('Shin',[(0,0,.03),(0,-.012,-.1),(0,0,-.3),(0,0,-.41)],[.062,.064,.049,.042],legwear,knee)
  ankle=b.empty(p.name+'_ankle_'+str(s),(0,0,-.41),knee)
  loft('Shoe',[(0,-.06,-.03),(0,-.02,-.045),(0,.08,-.05),(0,.19,-.055)],[(.048,.045),(.055,.05),(.052,.04),(.04,.028)],'pearl',ankle,10)
  b.box('Shoe sole',(0,.065,-.087),(.1,.28,.022),'rubber',ankle,.008)
  if seated:hip.rotation_euler.x=math.radians(88);knee.rotation_euler.x=-math.radians(88)
 if seated:
  for side in [-1,1]:
   wheel('chair_wheel_'+str(side),-.12,.31,.09,p,side*.36)
   wheel('chair_caster_'+str(side),.46,.09,.06,p,side*.29)
   b.tube('Chair frame',[(side*.30,.46,.12),(side*.30,-.25,.20),(side*.30,-.27,1.05)],.025,'steel',p)
   b.tube('Push handle',[(side*.30,-.27,1.05),(side*.30,-.40,1.05)],.03,'dark',p)
   b.box('Armrest',(side*.30,.02,.77),(.08,.42,.07),'dark',p,.015)
  b.box('Wheelchair seat',(0,-.02,.50),(.56,.48,.09),'dark',p,.025)
  b.box('Wheelchair back',(0,-.24,.76),(.55,.07,.46),'blue',p,.03)
  b.box('Footrest',(0,.46,.14),(.55,.26,.045),'steel',p)
 for o in [o for o in [p,*p.children_recursive] if o.type=='EMPTY']:b.merge_static(o)


def vegetation():
 rng=random.Random(834)
 for kind in ['grass','meadow','fern','shrub','flowering']:
  p=b.empty('vegetation_'+kind);p['wind']=True
  vs=[];faces=[]
  def leaf(base,tip,width):
   a=Vector(base);c=Vector(tip);d=c-a;side=Vector((-d.y,d.x,0)).normalized()*width
   if side.length==0:side=Vector((width,0,0))
   mid=a.lerp(c,.52);i=len(vs);vs.extend([tuple(a),tuple(mid+side),tuple(c),tuple(mid-side)]);faces.append((i,i+1,i+2,i+3))
  for i in range(36 if kind in ('grass','meadow') else 12):
   angle=rng.random()*math.tau;r=rng.random()*.65;x=math.cos(angle)*r;y=math.sin(angle)*r
   h=rng.uniform(.3,.72) if kind=='grass' else rng.uniform(.65,1.15)
   if kind in ('grass','meadow'):leaf((x,y,0),(x+math.cos(angle)*.28,y+math.sin(angle)*.28,h),.025 if kind=='grass' else .045)
   elif kind=='fern':
    for n in range(1,8):
     t=n/8;stem=(x*t,y*t,.65*math.sin(t*2));spread=.20*(1-t)
     for side in [-1,1]:leaf(stem,(stem[0]+side*math.cos(angle+math.pi/2)*spread,stem[1]+side*math.sin(angle+math.pi/2)*spread,stem[2]-.08),.045)
   else:
    b.tube('Woody stem',[(x*.2,y*.2,0),(x,y,h)],.012,'branch',p,4)
    for n in range(5):
     z=h*(.3+n*.14);a=angle+n*2.4;leaf((x*z/h,y*z/h,z),(x*z/h+math.cos(a)*.3,y*z/h+math.sin(a)*.3,z+.13),.10)
    if kind=='flowering':
     for petal in range(5):
      a=petal*math.tau/5;ellipsoid('Flower petal',(x+.065*math.cos(a),y+.065*math.sin(a),h+.02),(.065,.065,.025),'flower',p)
  b.mesh('Leaves',vs,faces,'leaf_'+kind,p)
  b.merge_static(p)


def cyclist():
 p=b.empty('cyclist');rear=(0,-.57,.365);front=(0,.57,.365);crank=(0,0,.38);saddle=(0,-.20,.94);head=(0,.43,.95)
 wheel('bike_wheel_rear',-.57,.34,.12,p);wheel('bike_wheel_front',.57,.34,.12,p)
 for a,c in [(rear,crank),(crank,saddle),(saddle,rear),(saddle,head),(head,crank),(head,front)]:b.tube('Diamond frame',[a,c],.025,'orange',p,10)
 for s in [-1,1]:
  b.tube('Fork',[(s*.045,.43,.95),(s*.06,.57,.365)],.018,'steel',p)
  b.tube('Rear stays',[(s*.06,-.57,.365),(s*.06,-.2,.94)],.016,'steel',p)
 b.box('Saddle',(0,-.20,.975),(.24,.32,.065),'rubber',p,.025)
 b.tube('Stem',[(0,.43,.95),(0,.48,1.08)],.025,'steel',p)
 b.tube('Handlebar',[(-.29,.48,1.08),(-.18,.53,1.08),(.18,.53,1.08),(.29,.48,1.08)],.022,'dark',p)
 b.tube('Brake cable',[(.25,.48,1.08),(.16,.66,.83),(.045,.57,.48)],.007,'rubber',p,6)
 b.tube('Chain',[(-.07,-.57,.405),(-.07,0,.48),(-.07,.08,.38),(-.07,0,.28),(-.07,-.57,.325),(-.07,-.57,.405)],.009,'steel',p,5)
 b.box('Rear reflector',(0,-.39,.88),(.07,.025,.05),'red',p,.01)
 b.box('Bike headlight',(0,.53,1.05),(.065,.07,.06),'light',p,.015)
 rider=b.empty('seated_rider',parent=p)
 ellipsoid('Cycling shorts',(0,-.20,1.075),(.21,.17,.15),'navy',rider)
 b.tube('Jersey',[(0,-.20,1.10),(0,.03,1.42)],.20,'teal',rider,12)
 ellipsoid('Neck',(0,.10,1.49),(.07,.075,.09),'skin0',rider)
 ellipsoid('Rider face',(0,.16,1.60),(.12,.115,.15),'skin0',rider)
 ellipsoid('Helmet',(0,.145,1.72),(.16,.18,.10),'pearl',rider)
 for x in [-.08,0,.08]:b.tube('Helmet vent',[(x,.01,1.76),(x,.14,1.815),(x,.27,1.755)],.014,'dark',rider)
 b.tube('Helmet strap',[(-.13,.15,1.68),(0,.22,1.46),(.13,.15,1.68)],.009,'dark',rider)
 b.box('Sunglasses',(0,.261,1.63),(.20,.025,.047),'dark',rider,.01)
 for s in [-1,1]:
  b.tube('Sleeve',[(s*.18,.015,1.41),(s*.24,.18,1.26)],.075,'teal',rider)
  b.tube('Bent arm',[(s*.24,.18,1.26),(s*.27,.29,1.19),(s*.27,.48,1.08)],.052,'skin0',rider)
  ellipsoid('Gloved hand',(s*.27,.48,1.08),(.058,.065,.047),'dark',rider)
  for name,material,radius in [('thigh','navy',.083),('shin','skin0',.058),('crank','steel',.014)]:
   o=b.tube(name+'_'+str(s),[(0,0,0),(0,0,1)],radius,material,p,10);o['animated']=True
  foot=b.empty('pedal_'+str(s),parent=p)
  b.box('Cycling shoe',(0,.065,0),(.16,.28,.11),'pearl',foot,.035)
  b.box('Pedal',(0,0,-.065),(.20,.10,.027),'dark',foot)
  b.merge_static(foot)
 for s in [-1,1]:
  hip=Vector((s*.14,-.20,1.075));foot=Vector((s*.14,0,.38+s*.17));delta=foot-hip;distance=delta.length
  along=(.45**2-.46**2+distance**2)/(2*distance);bend=math.sqrt(max(0,.45**2-along**2))
  knee=hip+delta*(along/distance)+Vector((0,-delta.z,delta.y))*(bend/distance)
  for name,a,c in [('thigh',hip,knee),('shin',knee,foot),('crank',Vector((s*.14,0,.38)),foot)]:
   o=bpy.data.objects[name+'_'+str(s)];o.location=a;o.scale.z=(c-a).length;o.rotation_euler=(c-a).to_track_quat('Z','Y').to_euler()
  bpy.data.objects['pedal_'+str(s)].location=foot
 b.merge_static(rider);b.merge_static(p)


def traffic(kind,w,length,h):
 p=b.empty(kind)
 b.box('Lower body',(0,0,.72),(w,length,.75),'paint_'+kind,p,.16)
 cablen=length*.57 if kind in ('car','taxi') else length*.85
 if kind in ('car','taxi'):
  # Sloped windscreen and rear screen, with a narrower roof than the beltline.
  vs=[(-w*.45,-cablen/2,.99),(w*.45,-cablen/2,.99),(w*.45,cablen/2,.99),(-w*.45,cablen/2,.99),(-w*.37,-cablen*.34,h-.10),(w*.37,-cablen*.34,h-.10),(w*.37,cablen*.29,h-.10),(-w*.37,cablen*.29,h-.10)]
  b.mesh('Sloped glasshouse',vs,[(0,1,5,4),(1,2,6,5),(2,3,7,6),(3,0,4,7)],'glass',p)
  b.box('Roof',(0,-cablen*.025,h-.055),(w*.78,cablen*.66,.11),'pearl' if kind=='taxi' else 'paint_'+kind,p,.05)
  for side in [-1,1]:
   for bottom,top in [(0,4),(3,7)]:
    a=vs[bottom if side<0 else bottom+(1 if bottom==0 else -1)];c=vs[top if side<0 else top+(1 if top==4 else -1)]
    b.tube('Sloped pillar',[a,c],.035,'paint_'+kind,p)
 else:
  b.box('Cab glazing',(0,.05,(h+.93)/2),(w*.90,cablen,h-.93),'glass',p,.16)
  b.box('Roof',(0,.05,h-.06),(w*.93,cablen+.05,.14),'paint_'+kind,p,.08)
 if kind in ('truck','van'):
  b.box('Cargo box',(0,-length*.18,h*.61),(w*.96,length*.58,h*.72),'paint_'+kind,p,.06)
  for y in range(8):b.box('Cargo panel seam',(w*.485,-length*.44+y*length*.065,h*.62),(.026,.025,h*.60),'steel',p)
 for s in [-1,1]:
  for y in [-length*.31,length*.31]:wheel('road_wheel',y,.36,.20,p,s*(w/2-.08))
  for y in ([0] if kind in ('car','taxi') else [-cablen*.45,0,cablen*.45]):b.box('Window pillar',(s*(w*.41 if kind in ('car','taxi') else w*.46),y,(h+1)/2),(.075,.09,h-1),'paint_'+kind,p,.018)
  b.box('Side skirt',(s*w*.49,0,.42),(.07,length*.88,.12),'dark',p,.025)
  for y in [-.5,.65]:b.box('Door handle',(s*w*.507,y,1.1),(.035,.19,.035),'steel',p,.012)
  b.box('Wing mirror',(s*(w/2+.09),length*.25,1.36),(.21,.24,.13),'dark',p,.045)
  for end in [-1,1]:b.box('Lamp',(s*w*.33,end*(length/2+.015),.88),(.34,.045,.16),'light' if end==1 else 'red',p,.04)
 for end in [-1,1]:
  b.box('Bumper',(0,end*(length/2+.035),.49),(w*.90,.10,.13),'dark',p,.035)
  b.box('Number plate',(0,end*(length/2+.09),.71),(.45,.015,.13),'pearl' if end==1 else 'yellow',p,.01)
 for y in [.02,.08,.14]:b.box('Front grille',(0,length/2+.055,.94+y),(w*.42,.025,.018),'dark',p)
 if kind=='taxi':b.box('Taxi roof sign',(0,0,h+.14),(.55,.22,.23),'yellow',p,.035)
 if kind=='bus':
  b.box('Destination panel',(0,length*.43,h-.35),(1.65,.025,.25),'dark',p)
  b.text('Bus route','SGMTS',(0,length*.43+.02,h-.40),.16,'light',p,rot=(math.pi/2,0,math.pi))
 b.merge_static(p)


def building(kind,floors):
 p=b.empty('building_'+kind);w=20;d=22;h=floors*3.2+4
 p['dimensions']=[w,h,d]
 b.box('Rendered masonry',(0,0,h/2),(w-.5,d-.5,h),'sand' if kind=='village' else 'concrete',p)
 for y in [-1,1]:
  for x in [-7,-3.5,0,3.5,7]:
   b.box('Shopfront',(x,y*10.9,1.7),(2.9,.12,2.8),'glass',p)
   b.box('Shop canopy',(x,y*11,3.2),(3.2,1.1,.16),'teal',p)
 for level in range(floors):
  z=5+level*3.2
  for side in [-1,1]:
   for x in [-7,-3.5,0,3.5,7]:
    b.box('Window recess',(x,side*10.82,z),(2.6,.10,2.3),'dark',p)
    b.box('Window pane',(x,side*10.89,z),(2.35,.06,2.04),'window_lit' if (level+int(x*2))%4==0 else 'glass',p)
    b.box('Window mullion',(x,side*10.94,z),(.065,.075,2.10),'pearl',p)
    if kind in ('residential','village'):
     b.box('Balcony slab',(x,side*11.25,z-1.17),(3.1,1,.14),'pearl',p)
     b.tube('Balcony handrail',[(x-1.48,side*11.7,z-.25),(x+1.48,side*11.7,z-.25)],.035,'steel',p)
     for dx in [-1.4,-.7,0,.7,1.4]:b.box('Balustrade',(x+dx,side*11.7,z-.70),(.045,.045,.9),'steel',p)
     b.box('AC condenser',(x+.86,side*11.05,z-.75),(.53,.32,.42),'pearl',p,.02)
   for y in [-7,-3.5,0,3.5,7]:b.box('Side glazing',(side*9.8,y,z),(.1,2.4,2.1),'glass',p)
  b.box('Floor ledge',(0,0,z-1.3),(20.1,22.1,.16),'pearl',p)
 b.box('Roof coping',(0,0,h+.12),(20.4,22.4,.24),'pearl',p)
 for side in [-1,1]:
  b.box('Roof parapet',(side*9.8,0,h+.6),(.18,22,.9),'concrete',p)
  b.box('Roof parapet',(0,side*10.8,h+.6),(20,.18,.9),'concrete',p)
 b.box('Lift overrun',(0,2,h+1.4),(4,5,2.6),'concrete',p,.06)
 for x in [-5,5]:
  b.box('Rooftop HVAC',(x,-3,h+.65),(2.6,3.6,1),'steel',p,.06)
  for y in [-4,-3.5,-3,-2.5,-2]:b.box('HVAC grille',(x,y,h+1.17),(2.3,.08,.035),'dark',p)
 b.merge_static(p)

if '--people' in sys.argv:
 # Fast path: rebuild only the pedestrians inside the existing kit.
 bpy.ops.wm.open_mainfile(filepath=str(b.BLEND/'street-kit.blend'));b.M.update({m.name:m for m in bpy.data.materials})
 _mat=b.mat;b.mat=lambda n,*a,**k:bpy.data.materials.get(n) or _mat(n,*a,**k)
 for root in [o for o in bpy.data.objects if o.name.startswith('pedestrian_') and o.parent is None]:
  for o in [root,*root.children_recursive]:bpy.data.objects.remove(o,do_unlink=True)
b.reset() if '--people' not in sys.argv else None
b.M.update({n:b.mat(n,c,0,.65) for n,c in {'navy':(.045,.075,.11),'hair':(.035,.022,.016),'skin0':(.67,.40,.25),'skin1':(.86,.61,.43),'skin2':(.43,.25,.16),'burgundy':(.35,.045,.10)}.items()})
b.M['window_lit']=b.mat('window_lit',(.82,.69,.44),0,.35)
for name,c in {'car':(.16,.35,.42),'taxi':(.65,.035,.025),'van':(.76,.77,.70),'truck':(.19,.36,.29),'bus':(.82,.48,.12)}.items():b.M['paint_'+name]=b.mat('paint_'+name,c,.45,.28)
b.M['silver']=b.mat('silver',(.55,.56,.52))
b.M['branch']=b.mat('branch',(.18,.12,.06))
b.M['flower']=b.mat('flower',(.76,.19,.42))
for kind,color in {'grass':(.24,.38,.085),'meadow':(.43,.49,.16),'fern':(.09,.30,.14),'shrub':(.15,.32,.07),'flowering':(.22,.38,.10)}.items():b.M['leaf_'+kind]=b.mat('leaf_'+kind,color,0,.95)
for name,c in {'trouser_charcoal':(.05,.055,.06),'trouser_navy':(.035,.05,.09),'trouser_khaki':(.36,.3,.2)}.items():b.M[name]=b.M.get(name) or b.mat(name,c,0,.88)
for i in range(10):person(i)
if '--people' in sys.argv:b.save('street-kit');sys.exit(0)
vegetation()
from build_vegetation_lod import add_vegetation_lods
add_vegetation_lods()
cyclist()
for args in [('car',1.8,4.2,1.6),('taxi',1.8,4.7,1.65),('van',2,5.5,2.5),('truck',2.4,8.5,3.2),('bus',2.5,11,3.5)]:traffic(*args)
for args in [('residential',10),('tech',6),('village',2),('logistics',1)]:building(*args)
b.save('street-kit')
