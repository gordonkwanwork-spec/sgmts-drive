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
 """Skinned pedestrian (build_people) plus, for wheelchair users, a rigid chair on the root."""
 import build_people
 p,rig,body,v=build_people.person(index)
 if v.get('chair'):
  for side in [-1,1]:
   wheel('chair_wheel_'+str(side),-.12,.31,.09,p,side*.36)
   wheel('chair_caster_'+str(side),.46,.09,.06,p,side*.29)
   b.tube('Chair frame',[(side*.30,.46,.12),(side*.30,-.25,.20),(side*.30,-.27,1.05)],.025,'steel',p)
   b.tube('Push handle',[(side*.30,-.27,1.05),(side*.30,-.40,1.05)],.03,'dark',p)
   b.box('Armrest',(side*.30,.02,.77),(.08,.42,.07),'dark',p,.015)
  b.box('Wheelchair seat',(0,-.02,.50),(.56,.48,.09),'dark',p,.025)
  b.box('Wheelchair back',(0,-.24,.76),(.55,.07,.46),'blue',p,.03)
  b.box('Footrest',(0,.46,.14),(.55,.26,.045),'steel',p)
  b.merge_static(p)


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
 import build_people
 rider,rig,body,_=build_people.person(12);rider.name='seated_rider';rider.parent=p
 rider.location=(0,-.20,.14)
 for side in [-1,1]:
  crank=b.tube('crank_'+str(side),[(0,0,0),(0,0,1)],.014,'steel',p,10);crank['animated']=True
  pedal=b.empty('pedal_'+str(side),parent=p)
  b.box('Pedal',(0,0,-.04),(.20,.10,.027),'dark',pedal)
  b.merge_static(pedal)
 b.merge_static(p)



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

def lathe(name,profile,material,parent,segments=40,start=0,end=math.tau):
 """Surface of revolution about Z from (radius,z) pairs, with cylindrical UVs."""
 closed=end-start>=math.tau-1e-6;cols=segments if closed else segments+1;vs=[];fs=[]
 for r,z in profile:
  for i in range(cols):a=start+(end-start)*i/segments;vs.append((r*math.sin(a),r*math.cos(a),z))
 for j in range(len(profile)-1):
  for i in range(segments):fs.append(((j+1)*cols+i,(j+1)*cols+(i+1)%cols,j*cols+(i+1)%cols,j*cols+i))  # outward normals
 o=b.mesh(name,vs,fs,material,parent,True);uv=o.data.uv_layers.new(name='UVMap')
 for f in o.data.polygons:
  for li in f.loop_indices:
   vi=o.data.loops[li].vertex_index;j,i=divmod(vi,cols);uv.data[li].uv=(i/segments,j/(len(profile)-1))
 return o


def litter_bin():
 """FEHD orange street litter container after the site photo: capsule body, black rubber band near the base,
 rounded letterbox aperture with dark liner, ash tray on the crown, and lime warning stickers (JS adds lettering)."""
 p=b.empty('litter_bin');R=.3
 prof=[(0,.02),(.2,.02),(.265,.028),(.29,.045),(R,.08)]+[(R,z) for z in (.2,.45,.7)]+[(R*math.cos(a),.82+.17*math.sin(a)) for a in [i*math.pi/2/7 for i in range(1,8)]]
 body=lathe('Bin shell',prof,'bin_orange',p,48)
 cut=b.box('cutter',(0,R,.61),(.27,.2,.2),'dark',None,.035)
 m=body.modifiers.new('Aperture','BOOLEAN');m.object=cut;m.operation='DIFFERENCE';m.solver='EXACT'
 bpy.ops.object.select_all(action='DESELECT');bpy.context.view_layer.objects.active=body;body.select_set(True);bpy.ops.object.modifier_apply(modifier='Aperture')
 bpy.data.objects.remove(cut,do_unlink=True)
 # Rubber aperture trim hugging the cut, inner liner and refuse bag.
 w,h,rc=.135,.1,.035;trim=[]
 for cx,cz,a0 in [(w-rc,h-rc,0),(-w+rc,h-rc,math.pi/2),(-w+rc,-h+rc,math.pi),(w-rc,-h+rc,1.5*math.pi)]:
  for k in range(5):a=a0+k*math.pi/8;x=cx+rc*math.cos(a);trim.append((x,math.sqrt(max(0,R**2-x*x))+.004,.61+cz+rc*math.sin(a)))
 trim.append(trim[0]);b.tube('Aperture trim',trim,.012,'rubber',p,6)
 lathe('Liner',[(R-.03,.08),(R-.03,.8)],'dark',p,24)
 ellipsoid('Refuse bag',(0,.04,.5),(.2,.2,.18),'bin_bag',p)
 b.tube('Base band',[(R*math.sin(a)*1.012,R*math.cos(a)*1.012,.115) for a in [i*math.tau/48 for i in range(49)]],.016,'rubber',p,6)
 ellipsoid('Ash tray',(0,0,.985),(.09,.09,.008),'ash',p)
 for name,z0,z1,half in [('bin_sticker_top',.73,.83,.34),('bin_sticker_low',.25,.47,.56)]:
  o=lathe(name,[(R+.003,z0),(R+.003,(z0+z1)/2),(R+.003,z1)],name,p,10,-half,half)
 b.merge_static(p)


def rect_sweep(name,path,width,depth,material,parent,closed=True):
 """Flat bar (width in the path plane, depth across it) swept along a polyline in the Y-Z plane."""
 n=len(path);vs=[];fs=[]
 for i,q in enumerate(path):
  a=Vector(path[i-1] if closed or i>0 else q);c=Vector(path[(i+1)%n] if closed or i<n-1 else q);t=(c-a).normalized();nrm=Vector((0,-t.z,t.y))
  for sx,sn in [(-1,-1),(1,-1),(1,1),(-1,1)]:vs.append(tuple(Vector(q)+Vector((sx*depth/2,0,0))+nrm*sn*width/2))
 for i in range(n if closed else n-1):
  j=(i+1)%n
  for k in range(4):fs.append((i*4+k,i*4+(k+1)%4,j*4+(k+1)%4,j*4+k))
 if not closed:fs+=[(3,2,1,0),((n-1)*4,(n-1)*4+1,(n-1)*4+2,(n-1)*4+3)]
 return b.mesh(name,vs,fs,material,parent,False)


def rounded_rect(y0,y1,z0,z1,r0,r1,seg=5):
 """Anticlockwise outline; r0 radius at the y0 corners, r1 at the y1 corners."""
 pts=[]
 for cy,cz,r,a0 in [(y1-r1,z0+r1,r1,-math.pi/2),(y1-r1,z1-r1,r1,0),(y0+r0,z1-r0,r0,math.pi/2),(y0+r0,z0+r0,r0,math.pi)]:
  for k in range(seg+1):a=a0+k*math.pi/2/seg;pts.append((0,cy+r*math.cos(a),cz+r*math.sin(a)))
 return pts


def railings():
 """HyD Type 2 railing for control purpose: 40 sq posts, 40x15 flat frames 100-1000 mm above paving, 1500 mm bays.
 H2130I infill: 16 rounds at Q<=125 c/c. H2132H (junctions/crossings): open panels with two intermediate flats.
 Panels run along Y between post centres (-0.75..0.75); end panels run +Y from a post."""
 L=1.5;Q=(L-.055)/12;F=.04;T=.015
 for kind in ['type2','crossing']:
  p=b.empty('railing_'+kind);half=(L-.055)/2
  rect_sweep('Perimeter flat',rounded_rect(-half,half,.1+F/2,1-F/2,.03,.03),F,T,'galvanised',p)
  if kind=='type2':
   for i in range(1,12):b.tube('Infill round',[(0,-half+i*Q,.1+F/2),(0,-half+i*Q,1-F/2)],.008,'galvanised',p,8)
  else:
   for z in [.4,.7]:rect_sweep('Intermediate flat',[(0,-half,z),(0,half,z)],F,T,'galvanised',p,False)
  b.merge_static(p)
  e=b.empty('railing_'+kind+'_end');y0=.0275;y1=(3*Q+.035 if kind=='type2' else 3*Q+.0075)
  rect_sweep('End perimeter flat',rounded_rect(y0,y1,.1+F/2,1-F/2,.03,Q-.015 if kind=='type2' else Q),F,T,'galvanised',e)
  if kind=='type2':
   for i in [1,2]:b.tube('Infill round',[(0,y0+i*Q,.1+F/2+.03),(0,y0+i*Q,1-F/2-.03)],.008,'galvanised',e,8)
  else:
   for z in [.4,.7]:rect_sweep('Intermediate flat',[(0,y0,z),(0,y1-.02,z)],F,T,'galvanised',e,False)
  b.merge_static(e)
 p=b.empty('railing_post')
 b.box('Solid square post',(0,0,.51),(.04,.04,1.02),'galvanised',p)
 for z in [.2,.87]:
  for y in [-1,1]:b.box('Stiffener clip',(0,y*.035,z),(.05,.03,.06),'galvanised',p)
 b.box('Post base plate',(0,0,.004),(.12,.12,.008),'galvanised',p)
 b.merge_static(p)


def gully():
 """H3105A gully grating against the kerb in a concrete boxout (300 margins, 150x150 chamfers).
 Kerb face at X=0, carriageway towards +X, traffic along Y."""
 p=b.empty('gully_grating');W=.45;Lg=.75;m=.3;c=.15
 outer=[(0,-Lg/2-m),(W+m-c,-Lg/2-m),(W+m,-Lg/2-m+c),(W+m,Lg/2+m-c),(W+m-c,Lg/2+m),(0,Lg/2+m)];inner=[(0,-Lg/2),(W,-Lg/2),(W,-Lg/2),(W,Lg/2),(W,Lg/2),(0,Lg/2)]
 b.mesh('Gully boxout',[(x,y,.006) for x,y in outer+inner],[(i,(i+1)%6,6+(i+1)%6,6+i) for i in range(5)],'boxout',p)
 b.mesh('Gully sump',[(.03,-Lg/2+.03,.008),(W-.03,-Lg/2+.03,.008),(W-.03,Lg/2-.03,.008),(.03,Lg/2-.03,.008)],[(0,1,2,3)],'sump',p)
 for y in [-1,1]:b.box('Grating frame',(W/2,y*(Lg/2-.02),.012),(W,.04,.018),'cast_iron',p)
 for x in [.02,W-.02]:b.box('Grating frame',(x,0,.012),(.04,Lg,.018),'cast_iron',p)
 # Diagonal slotted bars (plan hatching on the drawing), clipped to the opening.
 x0,x1,y0,y1=.04,W-.04,-Lg/2+.04,Lg/2-.04;k=y0-x1
 while k<y1-x0:
  pts=[(x,x+k) for x in (x0,x1)];a=max(x0,y0-k);c2=min(x1,y1-k)
  if c2-a>.02:b.box('Grating bar',((a+c2)/2,(a+c2)/2+k,.012),(.022,(c2-a)*math.sqrt(2),.02),'cast_iron',p).rotation_euler.z=-math.pi/4
  k+=.055
 b.merge_static(p)
 # Overflow weir kerb (flexible pavement detail): one kerb length with a lowered, open throat into the gully.
 w=b.empty('kerb_weir')
 b.box('Weir kerb back',(-.045,0,.15),(.06,.994,.3),'kerb',w)
 for y in [-1,1]:b.box('Weir kerb cheek',(.03,y*.42,.15),(.09,.154,.3),'kerb',w,.012)
 b.box('Weir lintel',(.03,0,.235),(.09,.69,.13),'kerb',w,.012)
 b.box('Weir throat',(.03,0,.085),(.08,.69,.17),'sump',w)
 b.merge_static(w)


def disc(name,centre,r,material,parent,seg=24):
 """Lens facing +Y with front-view UVs (image right = viewer's right)."""
 cx,cy,cz=centre;vs=[(cx+r*math.cos(-i*math.tau/seg),cy,cz+r*math.sin(-i*math.tau/seg)) for i in range(seg)]
 o=b.mesh(name,vs,[tuple(range(seg))],material,parent);uv=o.data.uv_layers.new(name='UVMap')
 for li,l in enumerate(o.data.loops):x,_,z=vs[l.vertex_index];uv.data[li].uv=(.5-(x-cx)/(2*r),.5+(z-cz)/(2*r))
 return o


def hood(name,centre,r,top,bottom,parent,seg=20,t=.01):
 """Tunnel visor: open tube along +Y, long at the top and short underneath, with a rolled lip."""
 cx,cy,cz=centre;vs=[];fs=[]
 for rr in (r,r+t):
  for i in range(seg):a=i*math.tau/seg;L=bottom+(top-bottom)*(1+math.sin(a))/2;vs+=[(cx+rr*math.cos(a),cy,cz+rr*math.sin(a)),(cx+rr*math.cos(a),cy+L,cz+rr*math.sin(a))]
 for i in range(seg):
  j=(i+1)%seg;o=2*seg
  fs+=[(2*i,2*j,2*j+1,2*i+1),(o+2*i+1,o+2*j+1,o+2*j,o+2*i),(2*i+1,2*j+1,o+2*j+1,o+2*i+1)]
 return b.mesh(name,vs,fs,'signal_black',parent,True)


def traffic_signals():
 """HK junction signal after the Wan Chai site photo: grey Ø114 pole with domed cap, a black 300 mm aspect head clamped
 beside it on two brackets (tunnel hoods, cable looping from the pole top). Vehicle: red/amber/green; pedestrian: red man
 over green man. Lenses keep their own materials so the game can light them; lens front faces +Y."""
 for kind,aspects,lenses in [('vehicle',3,['signal_red','signal_amber','signal_green']),('pedestrian',2,['signal_ped_stop','signal_ped_go'])]:
  p=b.empty('signal_'+kind);W,D,pitch,x0,y0,zb=.40,.22,.34,.29,-.1,2.25;H=aspects*pitch+.02;zt=zb+H;yf=y0+D
  lathe('Signal pole',[(0,0),(.078,0),(.078,.035),(.057,.07),(.057,3.72),(.048,3.755),(.025,3.775),(0,3.78)],'signal_grey',p,20)
  b.box('Signal head',(x0,y0+D/2,zb+H/2),(W,D,H),'signal_black',p,.025)
  b.box('Signal door seam',(x0,yf+.002,zb+H/2),(W-.03,.006,H-.03),'signal_black',p)
  for k in range(aspects):
   z=zt-.01-pitch*(k+.5)
   if k:b.box('Aspect joint',(x0,yf+.004,z+pitch/2),(W+.006,.012,.012),'signal_seal',p)
   b.box('Lens bezel',(x0,yf+.003,z),(.33,.006,.33),'signal_black',p)
   hood('Tunnel hood',(x0,yf,z),.165,.26 if kind=='vehicle' else .2,.05,p)
   disc(lenses[k],(x0,yf+.008,z),.148,lenses[k],p)
  for z in (zt-.12,zb+.12):
   lathe('Pole clamp band',[(.066,z-.04),(.066,z+.04)],'signal_grey',p,20)
   b.box('Bracket arm',(x0/2+.02,y0+.03,z),(x0-.06,.05,.05),'signal_grey',p)
   b.box('Bracket plate',(x0,y0-.01,z),(.14,.02,.09),'signal_grey',p)
  b.tube('Signal cable',[(-.035,-.045,3.6),(-.02,-.07,3.35),(.03,-.09,3.15),(x0-.1,-.13,zt-.02),(x0-.02,-.12,zt-.01),(x0,y0+.04,zt+.005)],.009,'rubber',p,6)
  if kind=='pedestrian':
   head=b.empty('signal_pedestrian_head')
   for obj in list(p.children):
    if obj.name.startswith('Signal pole'):continue
    copy=obj.copy();copy.data=obj.data.copy() if obj.data else None;bpy.context.collection.objects.link(copy);copy.parent=head
   b.merge_static(head)
  b.merge_static(p)


def tree_supports():
 """Newly planted street tree supports after the site photos, sized for a 0.22 m trunk (the game scales X/Y to the trunk).
 tree_stakes: three bamboo poles splayed 0.95 m out, crossing the trunk at 2.2 m under a rope lashing (18.01.43 (1)).
 tree_guard: LCSD green steel cage, 16 rounds between two flat hoops with paired loops on top, around a granite-edged pit (18.02.08)."""
 p=b.empty('tree_stakes')
 for i in range(3):
  a=i*math.tau/3+.3;c,s_=math.cos(a),math.sin(a);lean=lambda z:.95-(.95-.25)*z/2.2
  b.tube('Bamboo pole',[(lean(z)*c,lean(z)*s_,z) for z in (0,.9,1.8,2.75)],.03,'bamboo',p,8)
  for z in (.45,.9,1.35,1.8,2.3):b.tube('Bamboo node',[(lean(z)*c,lean(z)*s_,z-.012),(lean(z)*c,lean(z)*s_,z+.012)],.035,'bamboo_node',p,8)
 for z in (2.14,2.2,2.26):b.tube('Rope lashing',[(.27*math.cos(k*math.tau/16),.27*math.sin(k*math.tau/16),z) for k in range(17)],.01,'rope',p,5)
 b.merge_static(p)
 g=b.empty('tree_guard');R=.4;N=16;ring=lambda r,z,n=48:[(r*math.cos(k*math.tau/n),r*math.sin(k*math.tau/n),z) for k in range(n+1)]
 for z in (.32,1.5):b.tube('Guard hoop',ring(R,z),.018,'guard_green',g,6)
 for k in range(N):a=k*math.tau/N;b.tube('Guard bar',[(R*math.cos(a),R*math.sin(a),.02),(R*math.cos(a),R*math.sin(a),1.62)],.011,'guard_green',g,6)
 for k in range(0,N,2):
  a0,a1=k*math.tau/N,(k+1)*math.tau/N;am=(a0+a1)/2;h=R*math.sin(math.pi/N)
  b.tube('Guard loop',[(R*math.cos(a0+(a1-a0)*t/8)*(1+.25*math.sin(math.pi*t/8)),R*math.sin(a0+(a1-a0)*t/8)*(1+.25*math.sin(math.pi*t/8)),1.62+.2*math.sin(math.pi*t/8)) for t in range(9)],.011,'guard_green',g,6)
 for x,y,w,d in [(0,.6,1.3,.1),(0,-.6,1.3,.1),(.6,0,.1,1.1),(-.6,0,.1,1.1)]:b.box('Pit edging',(x,y,.03),(w,d,.08),'granite',g)
 b.box('Pit soil',(0,0,.012),(1.1,1.1,.02),'soil',g)
 b.merge_static(g)


if '--people' in sys.argv or '--furniture' in sys.argv:
 # Fast path: rebuild only the pedestrians inside the existing kit.
 bpy.ops.wm.open_mainfile(filepath=str(b.BLEND/'street-kit.blend'));b.M.update({m.name:m for m in bpy.data.materials})
 _mat=b.mat;b.mat=lambda n,*a,**k:bpy.data.materials.get(n) or _mat(n,*a,**k)
 for root in [o for o in bpy.data.objects if (o.name.startswith('pedestrian_') or o.name=='cyclist') and o.parent is None and '--people' in sys.argv]:
  for o in [root,*root.children_recursive]:bpy.data.objects.remove(o,do_unlink=True)
b.reset() if '--people' not in sys.argv and '--furniture' not in sys.argv else None
b.M.update({n:b.mat(n,c,0,.65) for n,c in {'navy':(.045,.075,.11),'hair':(.035,.022,.016),'skin0':(.67,.40,.25),'skin1':(.86,.61,.43),'skin2':(.43,.25,.16),'burgundy':(.35,.045,.10)}.items()})
b.M['window_lit']=b.mat('window_lit',(.82,.69,.44),0,.35)
for name,c in {'car':(.16,.35,.42),'taxi':(.65,.035,.025),'van':(.76,.77,.70),'truck':(.19,.36,.29),'bus':(.82,.48,.12)}.items():b.M['paint_'+name]=b.mat('paint_'+name,c,.45,.28)
b.M['silver']=b.mat('silver',(.55,.56,.52))
for n,c,metal,rough in [('bin_orange',(.93,.30,.035),0,.38),('bin_bag',(.05,.05,.06),0,.5),('ash',(.13,.12,.1),0,.95),('bin_sticker_top',(.62,.78,.2),0,.6),('bin_sticker_low',(.62,.78,.2),0,.6),
 ('galvanised',(.6,.63,.62),.6,.42),('cast_iron',(.12,.12,.11),.5,.7),('sump',(.012,.012,.012),0,1),('boxout',(.36,.36,.34),0,.95),('kerb',(.52,.52,.49),0,.9),
 ('signal_grey',(.30,.33,.33),.35,.5),('signal_black',(.016,.018,.018),0,.45),('signal_seal',(.05,.055,.055),0,.7),
 ('bamboo',(.47,.39,.24),0,.75),('bamboo_node',(.36,.29,.17),0,.8),('rope',(.33,.26,.17),0,.95),('guard_green',(.06,.33,.22),.3,.5),('granite',(.42,.42,.41),0,.85),('soil',(.2,.15,.1),0,1)]+[(n,(.03,.03,.03),0,.2) for n in ('signal_red','signal_amber','signal_green','signal_ped_stop','signal_ped_go')]:
 b.M[n]=bpy.data.materials.get(n) or b.mat(n,c,metal,rough)
 if n.startswith(('signal_','bamboo','rope','guard_','granite','soil')):  # furniture fast path: keep colours in step with this list
  bsdf=b.M[n].node_tree.nodes['Principled BSDF'];bsdf.inputs['Base Color'].default_value=(*c,1);bsdf.inputs['Metallic'].default_value=metal;bsdf.inputs['Roughness'].default_value=rough;b.M[n].diffuse_color=(*c,1)
b.M['branch']=b.mat('branch',(.18,.12,.06))
b.M['flower']=b.mat('flower',(.76,.19,.42))
for kind,color in {'grass':(.24,.38,.085),'meadow':(.43,.49,.16),'fern':(.09,.30,.14),'shrub':(.15,.32,.07),'flowering':(.22,.38,.10)}.items():b.M['leaf_'+kind]=b.mat('leaf_'+kind,color,0,.95)
for name,c in {'trouser_charcoal':(.05,.055,.06),'trouser_navy':(.035,.05,.09),'trouser_khaki':(.36,.3,.2)}.items():b.M[name]=b.M.get(name) or b.mat(name,c,0,.88)
import build_people
if '--furniture' not in sys.argv or '--people' in sys.argv:
 for i in range(len(build_people.VARIANTS)):person(i)
if '--people' in sys.argv or '--furniture' in sys.argv:
 if '--people' in sys.argv:cyclist()
 if '--furniture' in sys.argv:
  for root in [o for o in bpy.data.objects if o.parent is None and o.name.split('.')[0] in ('litter_bin','railing_type2','railing_type2_end','railing_crossing','railing_crossing_end','railing_post','gully_grating','kerb_weir','signal_vehicle','signal_pedestrian','signal_pedestrian_head','tree_stakes','tree_guard')]:
   for o in [root,*root.children_recursive]:bpy.data.objects.remove(o,do_unlink=True)
  litter_bin();railings();gully();traffic_signals();tree_supports()
 b.save('street-kit');sys.exit(0)
vegetation()
from build_vegetation_lod import add_vegetation_lods
add_vegetation_lods()
cyclist()
for args in [('car',1.8,4.2,1.6),('taxi',1.8,4.7,1.65),('van',2,5.5,2.5),('truck',2.4,8.5,3.2),('bus',2.5,11,3.5)]:traffic(*args)
for args in [('residential',10),('tech',6),('village',2),('logistics',1)]:building(*args)
litter_bin();railings();gully();traffic_signals();tree_supports()
b.save('street-kit')
