// Utility and operator buildings for street furniture (src/street/furniture.js): the stainless two-door feeder pillar
// (site photo, Tung Chung waterfront) and the one-level steel operator cabin (GA-1101 "operator's facilities",
// styled on a box-section, glazed, barrel-roofed shelter). Local frame as every furniture item: front is −Z, X across
// the front, Y up, origin on the ground at the centre of the footprint.
import * as T from 'three';

// ---------- materials (canvas textures, created on first use in the browser) ----------
let K=null;
const canvas=(w,h,draw)=>{const c=document.createElement('canvas');c.width=w;c.height=h;draw(c.getContext('2d'),w,h);const t=new T.CanvasTexture(c);t.colorSpace=T.SRGBColorSpace;t.anisotropy=4;return t;};
const speckle=(base,spread)=>(x,w,h)=>{x.fillStyle=base;x.fillRect(0,0,w,h);for(let i=0;i<w*h/6;i++){const v=Math.random()*spread-spread/2;x.fillStyle=`rgba(${v>0?255:0},${v>0?255:0},${v>0?255:0},${Math.abs(v)/255})`;x.fillRect(Math.random()*w,Math.random()*h,1+Math.random()*2,1+Math.random()*2);}};
// Sign panel: lines of [text, px size], centred, on a coloured board.
const sign=(bg,fg,lines,w=512,h=128,icon)=>canvas(w,h,(x)=>{x.fillStyle=bg;x.fillRect(0,0,w,h);x.fillStyle=fg;x.textAlign='center';x.textBaseline='middle';
 const left=icon?h:0;if(icon)icon(x,h);lines.forEach(([t,size],i)=>{x.font=`bold ${size}px "PingFang HK","Heiti TC",Arial,sans-serif`;x.fillText(t,left+(w-left)/2,h*(i+1)/(lines.length+1));});});
// WC pictograms (white figures, ISO style).
const figure=(kind)=>(x,h)=>{x.fillStyle='#fff';const cx=h/2,s=h/128;x.beginPath();x.arc(cx,26*s,11*s,0,Math.PI*2);x.fill();
 if(kind==='accessible'){x.lineWidth=9*s;x.strokeStyle='#fff';x.beginPath();x.arc(cx+2*s,86*s,24*s,.2*Math.PI,1.75*Math.PI);x.stroke();x.fillRect(cx-6*s,40*s,12*s,40*s);x.fillRect(cx-6*s,72*s,34*s,10*s);x.fillRect(cx+22*s,72*s,10*s,34*s);return;}
 if(kind==='female'){x.beginPath();x.moveTo(cx,40*s);x.lineTo(cx+22*s,88*s);x.lineTo(cx-22*s,88*s);x.closePath();x.fill();x.fillRect(cx-10*s,88*s,7*s,30*s);x.fillRect(cx+3*s,88*s,7*s,30*s);return;}
 x.fillRect(cx-14*s,40*s,28*s,46*s);x.fillRect(cx-12*s,86*s,10*s,32*s);x.fillRect(cx+2*s,86*s,10*s,32*s);};
export function kitMaterials(){if(K)return K;
 const std=(color,o={})=>new T.MeshStandardMaterial({color,roughness:.6,...o});
 const render=canvas(128,128,speckle('#9da3a7',40));render.wrapS=render.wrapT=T.RepeatWrapping;
 // Brushed stainless: fine vertical grain with a few brighter streaks.
 const brushed=canvas(64,256,(x,w,h)=>{x.fillStyle='#c9ced1';x.fillRect(0,0,w,h);for(let i=0;i<w;i++){const v=Math.random()<.5?255:40;x.fillStyle=`rgba(${v},${v},${v+6},${.05+Math.random()*.12})`;x.fillRect(i,0,1,h);}});
 // Expanded-metal vent mesh: dark field with vertical diamond strands.
 const mesh=canvas(128,128,(x,w,h)=>{x.fillStyle='#1b1e20';x.fillRect(0,0,w,h);x.strokeStyle='#4a5054';x.lineWidth=2;for(let i=-w;i<w*2;i+=8){x.beginPath();x.moveTo(i,0);x.lineTo(i+4,h);x.stroke();}x.strokeStyle='#30353a';for(let j=0;j<h;j+=16){x.beginPath();x.moveTo(0,j);x.lineTo(w,j+3);x.stroke();}});
 mesh.wrapS=mesh.wrapT=T.RepeatWrapping;mesh.repeat.set(3,4);
 const grille=canvas(128,128,(x,w,h)=>{x.fillStyle='#d9dcdc';x.fillRect(0,0,w,h);x.strokeStyle='#30363a';x.lineWidth=3;for(let r=8;r<60;r+=8){x.beginPath();x.arc(64,64,r,0,Math.PI*2);x.stroke();}x.fillStyle='#30363a';x.fillRect(60,4,8,120);x.fillRect(4,60,120,8);});
 const notices=canvas(256,160,(x,w,h)=>{x.fillStyle='#b48a5a';x.fillRect(0,0,w,h);const cols=['#fff','#fde9a8','#cfe7ff','#ffd0d0'];for(let i=0;i<7;i++){x.fillStyle=cols[i%4];const px=12+(i%4)*60,py=12+Math.floor(i/4)*72;x.fillRect(px,py,50,62);x.fillStyle='#777';for(let l=0;l<5;l++)x.fillRect(px+6,py+10+l*9,38-(l%2)*12,3);}});
 return K={
  plinth:std(0xc4c9cc,{map:render,roughness:.9}),paint:std(0xd6dbde,{map:render,roughness:.85}),
  steel:std(0xe1e5e7,{map:brushed,metalness:.55,roughness:.32}),gap:std(0x1f2326,{roughness:.8}),vent:std(0xffffff,{map:mesh,metalness:.35,roughness:.55}),
  lock:std(0x9aa0a3,{metalness:.7,roughness:.3}),brass:std(0xb08d3c,{metalness:.7,roughness:.35}),
  frame:std(0x8c8a9b,{metalness:.45,roughness:.45}),panel:std(0xc8ccd0,{roughness:.55}),roof:std(0xb5babe,{metalness:.5,roughness:.42,side:T.DoubleSide}),
  glass:new T.MeshStandardMaterial({color:0x9fbcc6,metalness:.2,roughness:.06,transparent:true,opacity:.3,depthWrite:false}),
  frosted:new T.MeshStandardMaterial({color:0xe8eef0,roughness:.35,transparent:true,opacity:.88}),
  slab:std(0xb9b7ae,{map:render,roughness:.95}),apron:std(0xc7c5bb,{map:render,roughness:.95}),rubber:std(0x26292b,{roughness:.9}),
  floor:std(0x6e7c84,{roughness:.7}),ceiling:std(0xeeeeea,{roughness:.8}),wood:std(0xc5a57a,{roughness:.6}),locker:std(0x4f7898,{metalness:.35,roughness:.45}),
  sofa:std(0x2d4c66,{roughness:.9}),ceramic:std(0xf4f4f0,{roughness:.2}),fridge:std(0xdfe2e3,{roughness:.3}),black:std(0x15181a,{roughness:.5}),
  grille:std(0xffffff,{map:grille,roughness:.6}),notices:std(0xffffff,{map:notices,roughness:.8}),mirror:std(0xdfe8ec,{metalness:.95,roughness:.05}),cord:std(0xc8202a,{roughness:.6}),
  signs:{rest:std(0xffffff,{map:sign('#0f5a52','#fff',[['車長休息室',54],['CAPTAIN REST ROOM',34]],512,128),roughness:.5}),
   male:std(0xffffff,{map:sign('#1e4f93','#fff',[['男廁',52],['MEN',36]],384,128,figure('male')),roughness:.5}),
   female:std(0xffffff,{map:sign('#b03a52','#fff',[['女廁',52],['WOMEN',36]],384,128,figure('female')),roughness:.5}),
   accessible:std(0xffffff,{map:sign('#1e4f93','#fff',[['暢通易達洗手間',34],['ACCESSIBLE TOILET',26]],384,128,figure('accessible')),roughness:.5}),
   staff:std(0xffffff,{map:sign('#2b2f33','#ffd34d',[['職員專用',40],['STAFF ONLY',30]],384,96),roughness:.5}),
   fp:std(0xffffff,{map:sign('#f2c230','#141414',[['危險 DANGER',38],['高壓電力 HIGH VOLTAGE',24]],384,128),roughness:.5})}};}

// Night: lit interiors glow through the glazing, obscured WC lights and ceiling (called from environment.setNight).
export function setKitNight(on){if(!K)return;for(const [mat,c,k] of [[K.glass,0xffd9a0,.75],[K.frosted,0xfff4e0,.7],[K.ceiling,0xfff6e8,.6]]){mat.emissive.set(on?c:0);mat.emissiveIntensity=on?k:0;}}

// ---------- shared geometry ----------
const BOX=new T.BoxGeometry(1,1,1),CYL=new T.CylinderGeometry(1,1,1,10);
// Cabin cross-section: 3.2 m deep box frame, eaves at 2.75 m above its 0.18 m slab, barrel roof rising 0.45 m over a 3.7 m span.
export const CABIN={depth:3.2,floor:.18,eave:2.75,sill:1.0,transom:2.35,span:3.7,rise:.45,thick:.05};
const R=(CABIN.span**2/4+CABIN.rise**2)/(2*CABIN.rise),arcY=z=>Math.sqrt(R*R-z*z)-(R-CABIN.rise);
// Unit-length (along local X) curved shells: roof sheet and rib; and the gable infill between eave line and roof.
function vault(thick){const s=new T.Shape(),half=CABIN.span/2,n=24;s.moveTo(-half,thick);
 for(let i=1;i<=n;i++){const z=-half+CABIN.span*i/n;s.lineTo(z,arcY(z)+thick);}
 for(let i=n;i>=0;i--){const z=-half+CABIN.span*i/n;s.lineTo(z,arcY(z));}
 const g=new T.ExtrudeGeometry(s,{depth:1,bevelEnabled:false});g.translate(0,0,-.5);g.rotateY(Math.PI/2);return g;}
function gable(){const s=new T.Shape(),half=CABIN.depth/2,n=20,base=arcY(half);s.moveTo(-half,0);
 for(let i=0;i<=n;i++){const z=-half+CABIN.depth*i/n;s.lineTo(z,arcY(z)-base);}s.lineTo(half,0);
 const g=new T.ExtrudeGeometry(s,{depth:1,bevelEnabled:false});g.translate(0,0,-.5);g.rotateY(Math.PI/2);return g;}
const GEO={roof:vault(CABIN.thick),rib:vault(.09),gable:gable()};
export const gableHeight=()=>arcY(0)-arcY(CABIN.depth/2);

// Builder context from furniture.js: P (pose), batch, chunk and the world transform `at`.
function kit(ctx,P){const {batch,at,chunk}=ctx;
 const put=(key,g,mat,x,y,z,w,h,d,rx=0,ry=0)=>batch(key,g,mat,at(P,x,y,z),new T.Vector3(w,h,d),new T.Euler(rx,P.yaw+ry,0,'YXZ'),chunk);
 return {box:(key,mat,x,y,z,w,h,d,rx=0,ry=0)=>put(key,BOX,mat,x,y,z,w,h,d,rx,ry),cyl:(key,mat,x,y,z,r,h,rx=0)=>put(key,CYL,mat,x,y,z,r,h,r,rx),put};}
// Closed outline of a local rectangle as collision fences (world segments).
// Also clears planting from the footprint plus `margin`; wall:true keeps plaza banners off it.
function outline(ctx,P,hx,hz,top,margin=.5){ctx.clearings.push({x:P.x,z:P.z,yaw:P.yaw,hx:hx+margin,hz:hz+margin});const c=[[-hx,-hz],[hx,-hz],[hx,hz],[-hx,hz]].map(([x,z])=>ctx.at(P,x,0,z));
 c.forEach((a,i)=>{const b=c[(i+1)%4];ctx.fences.push({ax:a.x,az:a.z,bx:b.x,bz:b.z,y:a.y,top,wall:true});});}

// ---------- two-door stainless feeder pillar on a concrete plinth ----------
// 2.12 × 1.12 m plinth, painted concrete housing, 2.18 m roof slab; doors face −Z.
export function feederPillar(ctx,P){const m=kitMaterials(),{box,cyl}=kit(ctx,P),F=-.48;
 box('fp-plinth',m.plinth,0,.15,0,2.12,.3,1.12);box('fp-plinth-cap',m.plinth,0,.315,0,2.04,.03,1.04);
 box('fp-housing',m.paint,0,1.225,0,1.96,1.79,.96);
 box('fp-roof',m.paint,0,2.175,-.03,2.2,.11,1.22);box('fp-roof-top',m.paint,0,2.245,-.03,2.12,.03,1.14);box('fp-roof-drip',m.gap,0,2.117,-.03,2.16,.006,1.18);
 // Stainless surround with shadow gaps round the leaves and a centre astragal.
 box('fp-door-recess',m.gap,0,1.22,F-.004,1.8,1.7,.01);
 for(const x of [-.905,.905])box('fp-frame-stile',m.steel,x,1.22,F-.013,.05,1.75,.026);
 for(const y of [.372,2.068])box('fp-frame-rail',m.steel,0,y,F-.013,1.86,.05,.026);
 box('fp-astragal',m.steel,0,1.22,F-.034,.03,1.6,.012);
 // Pressed hood louvre: tapered box with three inclined blades over a dark throat.
 const louvre=(x,y,w,h)=>{box('fp-louvre-throat',m.gap,x,y,F-.04,w-.02,h-.02,.006);
  box('fp-louvre-head',m.steel,x,y+h/2,F-.058,w+.04,.022,.06);box('fp-louvre-sill',m.steel,x,y-h/2,F-.065,w+.06,.026,.075);
  for(const s of [-1,1])box('fp-louvre-cheek',m.steel,x+s*(w/2+.01),y,F-.055,.02,h,.055);
  for(let k=0;k<3;k++)box('fp-louvre-blade',m.steel,x,y+h/2-.03-k*(h-.04)/3,F-.05,w-.02,.012,.055,-.65);};
 for(const s of [-1,1]){const cx=s*.443;
  box('fp-door-leaf',m.steel,cx,1.22,F-.024,.86,1.62,.02);
  for(const y of [.42,2.02])box('fp-door-hem',m.steel,cx,y,F-.036,.86,.02,.006);for(const x of [cx-.42,cx+.42])box('fp-door-hem',m.steel,x,1.22,F-.036,.02,1.62,.006);// pressed edge
  louvre(cx+s*.02,1.86,.44,.15);
  box('fp-vent-frame',m.steel,cx+s*.02,1.47,F-.041,.47,.5,.01);box('fp-vent-mesh',m.vent,cx+s*.02,1.47,F-.047,.42,.45,.004);
  s<0?louvre(cx-.1,.56,.34,.12):louvre(cx+.06,.5,.42,.13);
  for(const y of [.6,1.22,1.84]){cyl('fp-hinge',m.steel,s*.875,y,F-.05,.014,.11);box('fp-hinge-leaf',m.steel,s*.855,y,F-.04,.04,.1,.006);}
  // Barrel bolt into a keep on the opposite leaf, hasp and hanging padlock.
  const bx=s*.2,by=s<0?1.28:1.25;
  box('fp-bolt-plate',m.steel,bx,by,F-.04,.16,.05,.006);box('fp-bolt-rod',m.lock,s*.105,by,F-.05,.19,.016,.016);
  box('fp-bolt-knob',m.lock,s*.15,by-.03,F-.056,.016,.07,.016);box('fp-bolt-keep',m.steel,s*.02,by,F-.046,.035,.045,.02);
  box('fp-hasp',m.steel,bx,by-.055,F-.048,.05,.08,.008);
  box('fp-padlock',m.lock,bx,by-.115,F-.06,.045,.055,.022);box('fp-padlock-shackle',m.lock,bx,by-.07,F-.058,.032,.04,.008);
  box('fp-padlock-key',m.gap,bx,by-.128,F-.072,.008,.016,.002);}
 // Danger plate on the right leaf (statutory electrical warning).
 box('fp-danger-plate',m.signs.fp,.443,1.02,F-.036,.3,.1,.003);
 outline(ctx,P,1.06,.56,2.3);}

// ---------- one-level steel operator cabin ----------
// params: length (m along local X, default 12), use 'rest' (captain rest room + accessible WC) or 'wc' (single toilet
// pod), wc 'male' | 'female' | 'accessible' (pod sign), apron (paved surround width, default 1.2 m).
export function operatorCabin(ctx,P,it){const m=kitMaterials(),{box,put,cyl}=kit(ctx,P),C=CABIN,p=it.params||{};
 const L=Math.max(1.6,p.length??12),D=C.depth,use=p.use==='wc'?'wc':'rest',apron=p.apron??1.2,y0=C.floor,yE=C.eave;
 const n=Math.max(1,Math.round(L/1.5)),bay=L/n,X=i=>-L/2+i*bay;
 const wcBays=use==='rest'&&n>=5?2:0,door=use==='wc'?Math.floor(n/2):1,wcDoor=n-1;
 // Front (−Z) and back (+Z) bay types; WC bays are solid with obscured top lights.
 const kind=(side,i)=>use==='wc'?(side<0&&i===door?'wcdoor':'solid'):side<0&&i===door?'door':i>=n-wcBays?(side<0&&i===wcDoor?'wcdoor':'solid'):'glass';
 // Base: concrete slab and paved apron (hardstanding), accessible ramp at each door.
 // Both run 0.6 m below the origin so a cabin set on a raised walk never floats over lower grass.
 box('oc-apron',m.apron,0,-.28,0,L+2*apron,.64,D+2*apron);box('oc-slab',m.slab,0,(y0-.6)/2,0,L+.3,y0+.6,D+.3);
 for(let i=0;i<n;i++)if(kind(-1,i).endsWith('door'))box('oc-door-ramp',m.slab,X(i+.5),y0/2,-D/2-.15-.55,bay-.15,.02,1.1,-Math.atan2(y0,1.1));
 // Box-section frame: posts on every bay line, eaves and end beams.
 for(const z of [-D/2,D/2])for(let i=0;i<=n;i++)box('oc-post',m.frame,X(i),(y0+yE)/2,z,.1,yE-y0,.1);
 for(const x of [-L/2,L/2])box('oc-post',m.frame,x,(y0+yE)/2,0,.1,yE-y0,.1);
 for(const z of [-D/2,D/2])box('oc-eave-beam',m.frame,0,yE+.07,z,L+.1,.14,.12);
 for(const x of [-L/2,L/2])box('oc-end-beam',m.frame,x,yE+.07,0,.12,.14,D+.1);
 // One wall bay between two posts: x/z centre, width, facing axis ('z' = long wall, 'x' = end wall).
 const wall=(type,cx,cz,w,axis,out)=>{const at=(key,mat,y,h,t,o=0)=>axis==='z'?box(key,mat,cx,y,cz+out*o,w,h,t):box(key,mat,cx+out*o,y,cz,t,h,w);
  at('oc-bottom-rail',m.frame,y0+.04,.08,.08);at('oc-top-rail',m.frame,yE-.03,.06,.08);
  if(type.endsWith('door')){at('oc-door-head',m.frame,2.18,.08,.08);const wc=type==='wcdoor';at(wc?'oc-frosted':'oc-glass',wc?m.frosted:m.glass,(2.22+yE-.06)/2,yE-.06-2.22,.012);return;}
  at('oc-transom',m.frame,C.transom,.07,.08);
  if(type==='glass'){at('oc-sill',m.frame,C.sill,.08,.09);at('oc-lower-panel',m.panel,(y0+.08+C.sill-.04)/2,C.sill-.04-y0-.08,.04);
   at('oc-panel-groove',m.gap,(y0+C.sill)/2,.012,.044);at('oc-glass',m.glass,(C.sill+C.transom)/2,C.transom-C.sill-.08,.012);}
  else{at('oc-solid-panel',m.panel,(y0+.08+C.transom-.035)/2,C.transom-.035-y0-.08,.045);for(const y of [.9,1.6])at('oc-panel-groove',m.gap,y,.012,.05);}
  at(type==='glass'?'oc-glass':'oc-frosted',type==='glass'?m.glass:m.frosted,(C.transom+yE-.06)/2,yE-.06-C.transom-.04,.012);};
 for(const side of [-1,1])for(let i=0;i<n;i++)wall(kind(side,i),X(i+.5),side*D/2,bay-.1,'z',side);
 // Solid end walls: lockers stand against one, the WC against the other.
 for(const end of [-1,1])for(const z of [-D/4,D/4])wall('solid',end*L/2,z,D/2-.1,'x',end);
 // Doors: glazed rest-room door, solid WC doors with signs; closer, lever handle, kick plate.
 for(let i=0;i<n;i++){if(!kind(-1,i).endsWith('door'))continue;const x=X(i+.5),w=Math.min(1.05,bay-.16),z=-D/2,wc=kind(-1,i)==='wcdoor';
  for(const dx of [-1,1])box('oc-door-jamb',m.frame,x+dx*(w/2+.03),(y0+2.18)/2,z,.06,2.18-y0,.1);
  if(wc){box('oc-door-solid',m.panel,x,(y0+2.14)/2,z-.02,w,2.14-y0,.045);for(let k=0;k<4;k++)box('oc-door-louvre',m.gap,x,.34+k*.06,z-.045,w-.3,.02,.008);}
  else{for(const dx of [-1,1])box('oc-door-stile',m.frame,x+dx*(w/2-.04),(y0+2.14)/2,z-.02,.08,2.14-y0,.05);
   box('oc-door-rail',m.frame,x,2.09,z-.02,w,.1,.05);box('oc-door-rail',m.frame,x,y0+.17,z-.02,w,.3,.05);box('oc-door-glass',m.glass,x,(y0+.32+2.04)/2,z-.02,w-.16,2.04-y0-.32,.01);}
  box('oc-kick-plate',m.steel,x,y0+.16,z-.05,w-.06,.25,.004);box('oc-door-closer',m.frame,x-w/4,2.1,z-.07,.3,.06,.06);
  box('oc-lever',m.steel,x+w/2-.12,1.05,z-.075,.13,.025,.025);box('oc-lever-rose',m.steel,x+w/2-.08,1.05,z-.05,.05,.05,.01);
  // One batch key per sign: instanced batches share the first material seen for a key.
  const name=wc?(use==='wc'?(p.wc||'male'):'accessible'):'rest';
  box('oc-door-sign-'+name,m.signs[name],x,wc?1.62:2.5,z-(wc?.07:.06),wc?.6:1.4,wc?.2:.36,.006);
  box('oc-bulkhead',m.frame,x,2.6,z-.1,.32,.1,.12);box('oc-bulkhead-lens',ctx.lamp,x,2.55,z-.11,.26,.02,.1);ctx.light(P,x,2.55,z-.3);}
 if(use==='rest')box('oc-staff-sign',m.signs.staff,X(door+.5)+.85,1.6,-D/2-.03,.5,.12,.006);
 // Barrel roof: curved sheet with ribs over each bay line, gutters, gable infills with twin vents, downpipes.
 // The sheet bears on the eave beams at the wall lines and droops slightly to the gutters (as the reference shelter).
 const top=yE+.14,roofY=top-arcY(D/2);
 put('oc-roof',GEO.roof,m.roof,0,roofY,0,L+.4,1,1);
 for(let i=0;i<=n;i++)put('oc-roof-rib',GEO.rib,m.frame,X(i),roofY-.02,0,.08,1,1);
 for(const z of [-1,1]){box('oc-gutter',m.roof,0,roofY-.02,z*(C.span/2+.04),L+.4,.1,.1);box('oc-fascia',m.frame,0,roofY+.02,z*(C.span/2-.02),L+.42,.06,.04);}
 for(const x of [-L/2,L/2]){put('oc-gable',GEO.gable,m.panel,x,top,0,.06,1,1);for(const z of [-.45,.45])box('oc-gable-vent',m.gap,x+Math.sign(x)*.035,top+gableHeight()*.4,z,.01,.1,.3);}
 for(const [x,z] of [[-L/2-.15,-D/2-.2],[L/2+.15,D/2+.2]])cyl('oc-downpipe',m.roof,x,(y0+roofY)/2,z,.04,roofY-y0);
 // Ceiling and LED panels (night-lit with the street lamps), vinyl floor.
 box('oc-floor',m.floor,0,y0+.01,0,L-.12,.02,D-.12);box('oc-ceiling',m.ceiling,0,yE-.04,0,L-.12,.02,D-.12);
 for(let i=0;i<n;i++)box('oc-ceiling-led',ctx.lamp,X(i+.5),yE-.055,0,Math.min(1.2,bay-.3),.012,.3);
 if(n>1)ctx.light(P,0,yE-.06,0);
 if(use==='wc'){toilet(box,cyl,m,0,D/2,p.wc==='accessible');return outline(ctx,P,L/2+.05,D/2+.05,yE,apron+.3);}
 // Rest room: partition to the accessible WC, lockers, sofa, tables and chairs, pantry counter, AC, notice board.
 const xw=X(n-wcBays),xr=wcBays?xw:L/2;
 if(wcBays){box('oc-partition',m.panel,xw,(y0+yE)/2,0,.08,yE-y0-.06,D-.12);toilet(box,cyl,m,(xw+L/2)/2,D/2,true);}
 for(let k=0;k<6;k++){const z=-D/2+.55+k*.45;box('oc-locker',m.locker,-L/2+.3,y0+.95,z,.48,1.9,.42);box('oc-locker-vent',m.gap,-L/2+.545,y0+1.7,z,.004,.1,.25);box('oc-locker-handle',m.steel,-L/2+.548,y0+1.05,z+.14,.008,.12,.02);}
 const seatEnd=xr-(wcBays?2.2:1.6);
 box('oc-sofa-seat',m.sofa,(-L/2+.8+seatEnd)/2,y0+.22,D/2-.4,seatEnd-(-L/2+.8),.44,.62);box('oc-sofa-back',m.sofa,(-L/2+.8+seatEnd)/2,y0+.65,D/2-.13,seatEnd-(-L/2+.8),.5,.18);
 for(let x=-L/2+1.8;x<seatEnd-.6;x+=2.6){box('oc-table-top',m.wood,x,y0+.74,-.15,1.2,.035,.75);cyl('oc-table-leg',m.steel,x,y0+.37,-.15,.03,.72);box('oc-table-foot',m.steel,x,y0+.01,-.15,.5,.02,.5);
  for(const dx of [-.35,.35])for(const dz of [-.55,.55]){box('oc-chair-seat',m.black,x+dx,y0+.45,-.15+dz,.42,.04,.42);box('oc-chair-back',m.black,x+dx,y0+.72,-.15+dz*1.45,.42,.4,.03);for(const lx of [-.18,.18])box('oc-chair-leg',m.steel,x+dx+lx,y0+.22,-.15+dz,.02,.44,.02);}}
 // Pantry against the back wall by the partition: counter with sink and microwave, fridge; water dispenser at the front.
 const cx=xr-1.4;
 box('oc-counter',m.panel,cx,y0+.45,D/2-.35,1.3,.9,.6);box('oc-worktop',m.wood,cx,y0+.915,D/2-.35,1.34,.03,.62);box('oc-sink',m.steel,cx-.3,y0+.935,D/2-.35,.45,.012,.38);
 box('oc-tap',m.steel,cx-.3,y0+1.04,D/2-.12,.03,.2,.03);box('oc-microwave',m.black,cx+.35,y0+1.08,D/2-.38,.48,.28,.36);box('oc-microwave-door',m.glass,cx+.3,y0+1.08,D/2-.565,.32,.2,.005);
 box('oc-fridge',m.fridge,xr-.4,y0+.85,D/2-.38,.6,1.7,.62);box('oc-water-dispenser',m.fridge,xr-.35,y0+.5,-D/2+.4,.32,1.0,.32);box('oc-water-bottle',m.glass,xr-.35,y0+1.18,-D/2+.4,.26,.36,.26);
 box('oc-ac-indoor',m.fridge,(-L/2+seatEnd)/2,yE-.35,D/2-.12,.9,.28,.2);box('oc-notice-board',m.notices,(-L/2+seatEnd)/2,1.6,D/2-.05,1.2,.75,.02);
 // Outdoor AC condenser on the rear apron.
 box('oc-ac-condenser',m.fridge,(-L/2+seatEnd)/2,.35,D/2+.45,.85,.62,.32);box('oc-ac-fan',m.grille,(-L/2+seatEnd)/2+.12,.45,D/2+.615,.46,.46,.005);
 outline(ctx,P,L/2+.05,D/2+.05,yE,apron+.3);}
// WC fit-out against the back wall at local (x, back): pan with cistern, basin, mirror, grab rails.
function toilet(box,cyl,m,x,back,accessible){
 box('oc-wc-cistern',m.ceramic,x-.3,CABIN.floor+.7,back-.17,.42,.38,.16);box('oc-wc-pan',m.ceramic,x-.3,CABIN.floor+.2,back-.45,.38,.4,.55);box('oc-wc-seat',m.black,x-.3,CABIN.floor+.415,back-.47,.38,.03,.5);
 box('oc-basin',m.ceramic,x+.45,CABIN.floor+.82,back-.24,.5,.14,.4);box('oc-basin-tap',m.steel,x+.45,CABIN.floor+.95,back-.08,.03,.12,.03);box('oc-mirror',m.mirror,x+.45,1.55,back-.04,.5,.7,.01);
 if(accessible){box('oc-grab-rail',m.steel,x-.62,CABIN.floor+.75,back-.45,.04,.04,.7);box('oc-grab-rail',m.steel,x-.3,CABIN.floor+.95,back-.06,.6,.04,.04);box('oc-alarm-cord',m.cord,x-.75,CABIN.floor+.3,back-.6,.02,.6,.02);}
 cyl('oc-wc-extract',m.frame,x,CABIN.eave-.2,back+.01,.08,.03,Math.PI/2);}
