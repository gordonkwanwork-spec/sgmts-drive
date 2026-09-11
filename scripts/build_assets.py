"""Reproducible Blender 5.2 source. Metres; Blender +Y forward -> glTF -Z."""
import bpy, math, json, random, sys
from pathlib import Path
from mathutils import Vector
ROOT=Path(__file__).resolve().parents[1]
OUT=ROOT/'public/assets'; BLEND=ROOT/'assets/blender'
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
 bpy.ops.object.select_all(action='SELECT');bpy.ops.object.delete(use_global=False);materials()
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
 c=bpy.data.curves.new(n,'FONT');c.body=s;c.size=size;c.extrude=0;c.resolution_u=2;c.align_x='CENTER';o=bpy.data.objects.new(n,c);bpy.context.collection.objects.link(o);o.location=pos;o.rotation_euler=rot;o.data.materials.append(M[m]);o.parent=parent;return o

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

def shell(n,ys,widths,zbottom,ztop,m,parent):
 # Rounded rectangular extrusion with separately curved longitudinal end profile.
 vs=[];N=20
 for y,w in zip(ys,widths):
  for i in range(N):
   a=2*math.pi*i/N;x=w*math.copysign(abs(math.cos(a))**.32,math.cos(a));z=(ztop+zbottom)/2+(ztop-zbottom)/2*math.copysign(abs(math.sin(a))**.32,math.sin(a));yy=y
   if n in ('Glazed cabin','Orange sculpted roof') and parent.name!='section_mid' and ((parent.name=='section_front' and y>3.5) or (parent.name=='section_rear' and y< -3.5)):
    yy=y-math.copysign(max(0,z-1.0)/2.5*1.3*max(0,abs(y)-3.5)/2.1,y)
   vs.append((x,yy,z))
 fs=[(j*N+i,j*N+(i+1)%N,(j+1)*N+(i+1)%N,(j+1)*N+i) for j in range(len(ys)-1) for i in range(N)]
 fs.extend([tuple(range(N-1,-1,-1)),tuple((len(ys)-1)*N+i for i in range(N))]);return mesh(n,vs,fs,m,parent,True)

def vehicle():
 reset();meta={'forward':'-Z','width':2.65,'height':3.5,'length':32.4,'sections':[]}
 for idx,label in enumerate(['front','mid','rear']):
  name='section_'+label;p=empty(name,(0,-idx*10.6,0));p['sectionIndex']=idx
  ys=[-5,-4.8,3.5,4.6,5.25,5.6] if idx==0 else ([-5.6,-5.25,-4.6,-3.5,4.8,5] if idx==2 else [-5,-4.8,4.8,5])
  widths=[1.2,1.32,1.32,1.24,1.06,.88] if idx==0 else ([.88,1.06,1.24,1.32,1.32,1.2] if idx==2 else [1.2,1.32,1.32,1.2])
  shell('Lower pearl bodyshell',ys,widths,.26,1.15,'pearl',p)
  shell('Glazed cabin',ys,[w*.99 for w in widths],1.02,3.21,'glass',p)
  shell('Orange sculpted roof',ys,[w*.99 for w in widths],3.13,3.49,'orange',p)
  box('Interior floor',(0,0,.56),(2.4,9.6,.14),'dark',p,.035)
  for side in [-1,1]:
   for y in [-3.8,-2.5,-1.2,.1,1.4,2.7]:
    box('Window mullion',(side*1.31,y,2.1),(.035,.045,1.98),'dark',p)
    box('Seat cushion',(side*.91,y,.95),(.5,.49,.15),'blue',p,.055)
    box('Seat back',(side*1.07,y,1.24),(.13,.49,.65),'blue',p,.055)
   tube('Passenger handrail',[(side*.8,-4,2.82),(side*.8,4,2.82)],.025,'steel',p)
   for y in [-3,0,3]:tube('Vertical handrail',[(side*.83,y,.6),(side*.83,y,2.82)],.022,'yellow',p)
   for k in range(34):
    y=-4.65+k*.265;h=random.uniform(.14,.87);x=side*1.327
    mesh('Skyline livery',[(x,y,.35),(x,y+.23,.35),(x,y+.23,.35+h*.8),(x,y+.1,.35+h),(x,y,.35+h*.8)],[(0,1,2,3,4)],['teal','orange','blue','yellow','sand'][k%5],p)
   for wi,y in enumerate([-3.0,3.0]):
    bpy.ops.mesh.primitive_cylinder_add(vertices=24,radius=.48,depth=.22,location=(side*1.23,y,.49),rotation=(0,math.pi/2,0));w=bpy.context.object;w.name=f'{name}_wheel_{"left" if side<0 else "right"}_{wi}';w.parent=p;w.data.materials.append(M['rubber']);w['animated']=True
    bpy.ops.mesh.primitive_cylinder_add(vertices=20,radius=.31,depth=.025,location=(side*1.355,y,.49),rotation=(0,math.pi/2,0));hub=bpy.context.object;hub.data.materials.append(M['steel']);hub.parent=p
    for a in range(6):
     theta=a*math.pi/3;box('Hub spoke',(side*1.37,y+.15*math.cos(theta),.49+.15*math.sin(theta)),(.015,.055,.055),'dark',p,.012)
   for di,y in enumerate([-1.6,1.2]):
    dn=f'{name}_door_{"left" if side<0 else "right"}_{di}';d=empty(dn,(side*1.335,y,0),p);d['door']=True
    box('Door frame',(0,0,1.59),(.042,1.12,2.46),'steel',d,.035)
    box('Door glazing',(side*.024,0,1.93),(.022,1.02,1.7),'glass',d,.025)
    box('Door lower',(side*.026,0,.68),(.023,1.02,.57),'pearl',d,.02)
    box('Door split',(side*.043,0,1.6),(.025,.025,2.36),'dark',d)
    tube('Door grab',[(side*.054,.15,1.16),(side*.054,.15,1.65)],.013,'steel',d)
    merge_static(d)
  if idx in [0,2]:
   sign=1 if idx==0 else -1
   # Swept nose glass, orange rails and continuous illuminated eyebrow.
   for side in [-1,1]:
    tube('Orange nose surround',[(side*1.25,sign*4.05,3.27),(side*1.19,sign*4.62,2.87),(side*1.02,sign*5.19,1.6),(side*.91,sign*5.58,.39)],.065,'orange',p,12)
   tube('LED signature',[(x,sign*(5.66-.37*(abs(x)/.94)**2),1.05+.12*(abs(x)/.94)**2) for x in [-.94,-.7,-.4,0,.4,.7,.94]],.033,'light' if idx==0 else 'red',p,10)
   tube('Windscreen wiper',[(.55,sign*5.61,1.18),(.12,sign*5.5,1.82),(-.35,sign*5.18,2.29)],.022,'dark',p)
   text('Route destination','A1  HSK / HT',(0,sign*5.35,2.88),.16,'light',p,rot=(math.pi/2 if sign<0 else math.pi/2,0,math.pi if sign>0 else 0))
   for side in [-1,1]:box('Mirror pod',(side*1.52,sign*3.86,2.38),(.24,.32,.55),'dark',p,.09)
  if idx<2:
   for k in range(7):shell('Articulation bellows',[-5.01-k*.08,-5.045-k*.08],[1.23+(k%2)*.055]*2,.37,3.33,'rubber',p)
  empty(name+'_hitch_front',(0,5.3,.9),p);empty(name+'_hitch_rear',(0,-5.3,.9),p)
  merge_static(p)
  meta['sections'].append({'name':name,'pivot':[0,0,idx*10.6],'hitchFront':[0,.9,-5.3],'hitchRear':[0,.9,5.3],'doors':[{'name':f'{name}_door_{side}_{di}','position':[x,0,-y]} for side,x in [('left',-1.335),('right',1.335)] for di,y in enumerate([-1.6,1.2])]})
 meta.update(save('art'));return meta


def platform(id,side,width,offset,length=89.6,bent=False):
 p=empty(f'{id}_platform_{side}',(0,offset,0));edge=7.05
 # Bent A1 wing follows its dimensioned GA break; extension coordinate is measured approximation.
 def pt(x,y,z):return (side*(x+(max(0,-y-25)*.42 if bent else 0)),y,z)
 def b(n,x,y,z,sx,sy,sz,m,bev=0):return box(n,pt(x,y,z),(sx,sy,sz),m,p,bev)
 for y in range(-44,44,2):
  mesh('Platform slab',[pt(x,yy,z) for z in [0,.3] for yy in [y,y+2] for x in [edge,edge+width]],[(0,2,3,1),(4,5,7,6),(0,1,5,4),(2,6,7,3),(0,4,6,2),(1,3,7,5)],'concrete',p) if bent else b('Platform slab',edge+width/2,y+1,.15,width,2,.3,'concrete')
  for lane in range(int(width*2)):
   b('Paver course',edge+.25+lane*.5,y+1,.306,.485,1.985,.018,'tile')
  b('Tactile warning',edge+.38,y+1,.329,.4,1.985,.026,'yellow')
  for rail in [-.12,0,.12]:b('Tactile rib',edge+.38+rail,y+1,.348,.025,1.98,.017,'yellow')
 # 3m end ramps, total overall 89.6m with central 83.6m flat deck.
 for end in [-1,1]:
  y0=end*41.8;y1=end*44.8;x0=edge;x1=edge+width
  mesh('Access ramp',[pt(x0,y0,.31),pt(x1,y0,.31),pt(x1,y1,.02),pt(x0,y1,.02)],[(0,1,2,3)],'tile',p)
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
   mesh('Curved wall and canopy',[pt(x0,y-2.49,z0),pt(x1,y-2.49,z1),pt(x1,y+2.49,z1),pt(x0,y+2.49,z0)],[(0,1,2,3),(3,2,1,0)],'panel' if k==0 else 'roof',p)
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
   text('Rear board lettering','SGMTS  /  '+id,pt(back-.16,y,1.95),.35,'teal',p,rot=(math.pi/2,0,-side*math.pi/2))
 # Roadside approach rails run longitudinally, leaving the access through the gates clear.
 for end in [-1,1]:
  rail=empty(f'{id}_platform_{side}_approach_rail_{end}',parent=p)
  def height(y):return .31-.29*max(0,(abs(y)-41.8)/3)
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
  o=text('Station name',id+'  |  SGMTS',pt(edge+1.43,y,2.7),.22,'light',p,rot=(math.pi/2,0,-side*math.pi/2))
 for y in [-36,36]:
  for dx in [.9,1.8,2.7]:
   b('Fare gate',edge+dx,y,.82,.22,.7,1,'steel',.08)
   b('Gate reader',edge+dx,y,1.34,.17,.22,.08,'teal',.02)
 merge_static(p)
 return {'name':p.name,'side':side,'width':width,'length':length,'offsetZ':-offset,'edgeX':side*edge,'height':.31,'bent':bent,'bendStartLocalZ':25,'bendSlope':.42 if bent else 0}

def station(id):
 reset();width=6 if id=='A2' else (5 if id=='A1' else 4)
 # A2 platform starts differ by ~18.5m from scaled GA; retain stagger explicitly.
 plats=[platform(id,-1,width,-9.25 if id=='A2' else 0,bent=id=='A1'),platform(id,1,width,9.25 if id=='A2' else 0,bent=id=='A1')]
 d={'id':id,'platforms':plats,'roadGap':14.1,'source':'ST-110'+str(int(id[1:])),'appearance':'ACABAS Issue 3 station render and ST-5301–5307 curved cladding','inferred':'Poster artwork, furniture positions and A1 wing interpolation; platform dimensions from GA. Bench backs are outboard of seats, facing the carriageway.'};d.update(save('station-'+id));return d

if __name__=='__main__':
 OUT.mkdir(exist_ok=True,parents=True);BLEND.mkdir(exist_ok=True,parents=True)
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
 assert manifest['vehicle']['triangles']<60000
 # Measured runtime permits the full A2 detail (40,478 triangles); preserve reference detail.
 assert all(s['triangles']<42000 for s in manifest['stations'])
