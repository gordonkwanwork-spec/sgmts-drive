"""Editable eight-car C-Train interpretation; metres, +Y forward, rail top Z=0.
Run: /Applications/Blender.app/Contents/MacOS/Blender -b -P scripts/build_tuen_ma.py
Visual reference: https://estore.mtr.com.hk/en/products/mtr-train-model-tml-ctrain
"""
import sys, math
from pathlib import Path
sys.dont_write_bytecode=True
sys.path.insert(0,str(Path(__file__).resolve().parent))
import build_assets as b
import bpy

# Reuse the project's modeller and export pipeline; plain panels need no operators.
def box(n,p,s,m,parent,bev=0):
 if bev:return b.box(n,p,s,m,parent,bev)
 x,y,z=[v/2 for v in s]
 o=b.mesh(n,[(-x,-y,-z),(x,-y,-z),(x,y,-z),(-x,y,-z),(-x,-y,z),(x,-y,z),(x,y,z),(-x,y,z)],[(3,2,1,0),(4,5,6,7),(0,1,5,4),(1,2,6,5),(2,3,7,6),(3,0,4,7)],m,parent);o.location=p;return o

def cylinder(n,p,r,depth,m,parent,axis='X'):
 bpy.ops.mesh.primitive_cylinder_add(vertices=24,radius=r,depth=depth,location=p,rotation=(0,math.pi/2,0) if axis=='X' else (0,0,0))
 o=bpy.context.object;o.name=n;o.parent=parent;o.data.materials.append(b.M[m])
 for f in o.data.polygons:f.use_smooth=len(f.vertices)==4
 return o

def bogie(parent,y):
 g=b.empty('bogie',(0,y,0),parent);g['railBogie']=True
 box('Cast bogie frame',(0,0,.58),(2.35,3.6,.27),'tm_dark',g,.07)
 for s in [-1,1]:
  box('Bolster',(s*.92,0,.72),(.24,3.8,.26),'tm_steel',g,.06)
  for z in [-1.25,1.25]:
   box('Axlebox',(s*1.03,z,.45),(.29,.43,.30),'tm_steel',g,.05)
   b.tube('Coil spring',[(s*.97+.13*math.cos(t*math.tau/12),z+.13*math.sin(t*math.tau/12),.67+.018*t) for t in range(25)],.018,'tm_steel',g,6)
  cylinder('Air suspension',(s*.82,0,.87),.31,.20,'tm_rubber',g,'Z')
 for y0 in [-1.25,1.25]:
  w=b.empty('wheel_axle',(0,y0,.43),g);w['railWheel']=True
  cylinder('Axle',(0,0,0),.11,2.08,'tm_steel',w)
  for s in [-1,1]:
   cylinder('Forged wheel',(s*.75,0,0),.43,.14,'tm_steel',w)
   cylinder('Wheel flange',(s*.665,0,0),.465,.025,'tm_dark',w)
   cylinder('Brake disc',(s*.39,0,0),.29,.075,'tm_steel',w)
   for a in range(8):
    t=a*math.tau/8
    box('Wheel web relief',(s*.827,.27*math.sin(t),.27*math.cos(t)),(.015,.06,.08),'tm_dark',w)
  b.merge_static(w)
 b.merge_static(g)

def car(index,cab=False,panto=False):
 g=b.empty(f'car_{index:02}');g['carNumber']=index;g['cab']=cab;g['pantograph']=panto;g['length']=24.0
 # Open window/door apertures: full interior remains visible through real glazing.
 box('Underframe',(0,0,1.0),(2.95,23.4,.30),'tm_dark',g,.09)
 box('Saloon floor',(0,-.3,1.22),(2.93,23,.12),'tm_floor',g)
 box('Rounded roof',(0,-.15,3.72),(3.10,23.65,.46),'tm_silver',g,.20)
 box('Ceiling',(0,-.4,3.46),(2.88,22.8,.10),'tm_ivory',g)
 doors=[-9,-4.5,0,4.5,9]
 for side in [-1,1]:
  x=side*1.51
  box('Stainless skirt',(x,-.25,1.60),(.075,23.4,.70),'tm_silver',g,.025)
  box('Window header',(x,-.25,3.24),(.075,23.4,.44),'tm_silver',g)
  box('Red waist stripe',(side*1.553,-.25,1.98),(.018,23.4,.16),'tm_red',g)
  for z in [1.36,1.45,1.55,1.64,1.74]:box('Pressed body bead',(side*1.558,-.3,z),(.016,23.3,.016),'tm_steel',g)
  # Dark window seals frame the separate blue-grey glass panes.
  for y in [-11.2,-6.75,-2.25,2.25,6.75,11.05]:
   length=1.15 if abs(y)>10 else 2.42
   for z in [2.035,3.195]:box('Window rubber edge',(x,y,z),(.09,length,.07),'tm_rubber',g)
   for e in [-1,1]:box('Window rubber edge',(x,y+e*(length/2-.035),2.61),(.09,.07,1.23),'tm_rubber',g)
   box('Window glass',(side*1.565,y,2.63),(.025,length-.13,1.08),'tm_glass',g,.04)
   for e in [-1,1]:box('Window mullion',(x,y+e*(length/2+.06),2.64),(.10,.12,1.26),'tm_silver',g)
   if abs(y)<10:
    box('Longitudinal seating',(side*1.08,y,1.65),(.62,2.17,.14),'tm_seat',g,.05)
    box('Seat back',(side*1.35,y,1.91),(.10,2.17,.51),'tm_seat',g,.04)
    for q in [-.72,-.24,.24,.72]:box('Seat division',(side*1.09,y+q,1.727),(.57,.015,.008),'tm_dark',g)
  for y in doors:
   for leaf in [-1,1]:
    yy=y+leaf*.43
    box('Sliding door leaf',(side*1.57,yy,2.30),(.065,.84,2.02),'tm_silver',g,.025)
    box('Door window seal',(side*1.611,yy,2.64),(.025,.66,1.05),'tm_rubber',g,.05)
    box('Door glazing',(side*1.632,yy,2.65),(.018,.55,.92),'tm_glass',g,.035)
    box('Door handle',(side*1.643,yy-leaf*.30,2.12),(.022,.024,.22),'tm_dark',g)
   box('Door centre seal',(side*1.617,y,2.29),(.025,.026,2.04),'tm_rubber',g)
   box('Threshold',(side*1.53,y,1.27),(.22,1.78,.04),'tm_steel',g)
   box('Door warning lamp',(side*1.565,y,3.41),(.02,.11,.06),'tm_amber',g)
   box('Interior route map',(side*1.445,y,3.27),(.02,1.52,.22),'tm_map',g)
   b.tube('Door grab pole',[(side*1.15,y-.97,1.27),(side*1.15,y-.97,3.30)],.025,'tm_yellow',g)
  for y in [-7,-2,3,7]:
   b.tube('Luggage rail',[(side*.78,y-1.5,3.17),(side*.78,y+1.5,3.17)],.022,'tm_steel',g)
   for dy in [-1,0,1]:
    b.tube('Hanging strap',[(side*.78,y+dy,3.17),(side*.78,y+dy,2.95)],.015,'tm_dark',g)
    b.tube('Hand loop',[(side*.78,y+dy+.085*math.cos(a*math.tau/12),2.86+.085*math.sin(a*math.tau/12)) for a in range(13)],.014,'tm_yellow',g)
  box('Interior LED',(side*.76,-.35,3.398),(.085,22.5,.018),'tm_cabin_light',g)
  for yy in [-6,6]:
   b.text('Line identity','屯馬綫 Tuen Ma Line',(side*1.568,yy,1.83),.14,'tm_ink',g,rot=(math.pi/2,0,side*math.pi/2))
 # Equipment visible from the road beneath the viaduct.
 for x,y,l in [(-.5,-4.7,2.8),(.5,0,3.8),(-.4,4,2.1)]:
  box('Traction converter',(x,y,.70),(1.30,l,.50),'tm_equipment',g,.045)
  for yy in range(12):box('Converter grille',(x-.66,y-l/2+.1+yy*l/12,.7),(.018,.036,.36),'tm_dark',g)
 for x in [-.82,.82]:b.tube('Air reservoir',[(x,-3,.66),(x,-1.6,.66)],.16,'tm_steel',g,16)
 for y in [-7.8,7.8]:bogie(g,y)
 for y in [-6,5]:
  box('Rooftop air conditioner',(0,y,4.02),(2.3,3.7,.40),'tm_equipment',g,.12)
  for x in [-.69,.69]:
   cylinder('HVAC fan',(x,y,4.239),.46,.03,'tm_dark',g,'Z')
   for dy in range(13):box('HVAC louvre',(x,y-.53+dy*.088,4.269),(.99,.028,.016),'tm_steel',g)
  for side in [-1,1]:
   for dy in range(18):box('HVAC side grille',(side*1.158,y-1.55+dy*.18,4.03),(.018,.07,.23),'tm_dark',g)
 for x in [-1.15,1.15]:b.tube('Roof cable conduit',[(x,-11,3.96),(x,10,3.96)],.027,'tm_steel',g)
 if panto:
  for x in [-.6,.6]:
   for y in [-1,1]:
    cylinder('Pantograph insulator',(x,y,4.02),.105,.20,'tm_insulator',g,'Z')
    for z in [3.96,4.03,4.10]:cylinder('Ceramic skirt',(x,y,z),.15,.027,'tm_insulator',g,'Z')
  box('Pantograph base',(0,0,4.17),(1.5,2.45,.12),'tm_dark',g)
  for x in [-.48,.48]:
   b.tube('Pantograph lower arm',[(x,-.95,4.23),(x,.55,4.83)],.042,'tm_steel',g)
   b.tube('Pantograph upper arm',[(x,.55,4.83),(x,-.55,5.48)],.032,'tm_steel',g)
  box('Carbon contact strip',(0,-.55,5.49),(1.72,.12,.035),'tm_dark',g)
  b.tube('Collector horns',[(-1.03,-.55,5.32),(-.86,-.55,5.49),(.86,-.55,5.49),(1.03,-.55,5.32)],.023,'tm_steel',g)
 # Corrugated gangway and visible auto coupler.
 for end in [-1,1]:
  if cab and end==1:continue
  box('End wall',(0,end*11.79,2.45),(2.94,.09,2.50),'tm_silver',g,.05)
  box('Gangway opening',(0,end*11.85,2.33),(1.26,.08,2.03),'tm_dark',g,.08)
  for i in range(5):
   for x in [-.75,.75]:box('Gangway bellows',(x,end*(11.89+i*.065),2.35),(.12,.037,2.15),'tm_rubber',g)
   box('Bellows crown',(0,end*(11.89+i*.065),3.39),(1.6,.037,.12),'tm_rubber',g)
  box('Automatic coupler',(0,end*12.10,.94),(.5,.70,.26),'tm_dark',g,.04)
 if cab:
  # Tapered cab shell, red cheek surround, wide black windscreen and lower skirt.
  rings=[(10.9,1.53,1.18,3.86),(11.55,1.49,1.15,3.69),(12.02,1.27,1.20,3.37)]
  b.shell('Sculpted cab', [r[0] for r in rings],[r[1] for r in rings],1.18,3.68,'tm_red',g)
  box('Front black mask',(0,12.03,2.76),(2.41,.075,1.41),'tm_rubber',g,.19)
  box('Windscreen',(0,12.083,2.77),(2.20,.025,1.10),'tm_cab_glass',g,.15)
  box('Cab chin',(0,12.02,1.64),(2.42,.12,.64),'tm_silver',g,.19)
  box('Lower anti-climber',(0,12.13,1.19),(2.26,.23,.16),'tm_dark',g,.045)
  for x in [-.91,.91]:
   box('Lamp recess',(x,12.109,1.79),(.45,.055,.23),'tm_dark',g,.07)
   h=b.empty('headlight',(x,12.146,1.80),g);box('Headlamp lens',(0,0,0),(.27,.025,.10),'tm_headlight',h,.03)
   t=b.empty('taillight',(x,12.15,1.80),g);box('Tail lamp',(0,0,0),(.20,.025,.08),'tm_taillight',t,.02)
   b.tube('Windshield wiper',[(x*.5,12.11,2.27),(x*.8,12.11,2.82),(x*.8-.40,12.11,2.82)],.016,'tm_dark',g)
  box('Destination panel',(0,12.115,3.31),(1.65,.03,.25),'tm_dark',g)
  marker=b.empty('destination_front',(0,12.14,3.31),g);marker['destination']=True
  box('Coupler recess',(0,12.116,1.49),(.58,.028,.24),'tm_dark',g,.025)
  b.text('MTR label','港鐵 MTR',(0,12.157,2.05),.16,'tm_ivory',g,rot=(math.pi/2,0,math.pi))
  box('Driver console',(0,10.75,2.0),(2.2,.6,.45),'tm_dark',g,.08)
  box('Cab screen',(-.42,10.95,2.24),(.42,.05,.24),'tm_map',g)
  box('Cab partition',(0,10.1,2.3),(2.88,.07,2.05),'tm_ivory',g)
 for side in [-1,1]:
  marker=b.empty('destination_side',(side*1.624,0,3.23),g);marker['side']=side
 b.merge_static(g)
 return g

b.reset()
colors={'tm_silver':((.63,.67,.69),.72,.31),'tm_steel':((.31,.36,.39),.80,.30),'tm_red':((.65,.018,.034),.35,.28),'tm_dark':((.035,.045,.050),.3,.59),'tm_rubber':((.012,.018,.023),0,.72),'tm_glass':((.11,.22,.25),.25,.21),'tm_cab_glass':((.015,.046,.060),.52,.13),'tm_floor':((.26,.31,.32),0,.75),'tm_ivory':((.78,.80,.76),0,.5),'tm_seat':((.25,.40,.50),.25,.4),'tm_yellow':((.96,.68,.12),.3,.32),'tm_equipment':((.38,.42,.43),.55,.55),'tm_insulator':((.30,.19,.11),.2,.31),'tm_ink':((.075,.09,.10),0,.7)}
for n,args in colors.items():b.M[n]=b.mat(n,*args)
for n,c in {'tm_cabin_light':(.94,.88,.72),'tm_headlight':(.80,.91,1),'tm_taillight':(1,.008,.003),'tm_amber':(1,.37,.025),'tm_map':(.65,.84,.71)}.items():b.M[n]=b.mat(n,c,0,.4,2)
p=b.M['tm_glass'].node_tree.nodes.get('Principled BSDF');p.inputs['Alpha'].default_value=.30;b.M['tm_glass'].surface_render_method='DITHERED'
# Three unique models with linked mesh data throughout the full editable formation.
templates={1:car(1,True),2:car(2,False,True),3:car(3)}
for i in range(4,9):
 src=templates[1 if i==8 else 2 if i==7 else 3]
 def clone(o,parent=None):
  n=o.copy();n.data=o.data;bpy.context.collection.objects.link(n);n.parent=parent
  for ch in o.children:clone(ch,n)
  return n
 g=clone(src);g.name=f'car_{i:02}';g['carNumber']=i
for i in range(1,9):
 g=bpy.data.objects[f'car_{i:02}'];g.location.y=-(i-1)*24.4
 if i==8:g.rotation_euler.z=math.pi
b.save('tuen-ma-train')
