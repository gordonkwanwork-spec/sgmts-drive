import {cycleCanopyAt} from '../alignment.js';
import {parkLamp} from './park-lamp.js';
// Street furniture placed from public/street/furniture.json (edited in street.html). The game (environment.js) and the
// editor share this builder. Every item's front is its local −Z (the arrow in the editor): lamp arms, sign faces,
// signal lenses and pillar-box slots point that way. GLB models from public/street/models follow the same rule.
import * as T from 'three';
import {mergeGeometries} from 'three/addons/utils/BufferGeometryUtils.js';
import {pose,poseAt,ROAD} from './roads.js';

// Placeable types. kind 'point' = one item at a chainage; 'run' = from/to along a road.
export const CATALOGUE={
 lamp_road:{label:'Street lamp (single arm)',group:'Lighting',kind:'point',params:{height:10}},
 lamp_connecting:{label:'Street lamp (connecting road)',group:'Lighting',kind:'point',params:{height:10}},
 lamp_park:{label:'Park / plaza lamp (round drum)',group:'Lighting',kind:'point',params:{height:5.5}},
 lamp_cycle:{label:'Cycle track lamp (twin leaf arm)',group:'Lighting',kind:'point',params:{height:5}},
 litter_bin:{label:'Litter bin (FEHD)',group:'Furniture',kind:'point'},
 pillar_box:{label:'Post box',group:'Furniture',kind:'point'},
 manhole:{label:'Manhole cover',group:'Paving',kind:'point'},
 wayfinding_sign:{label:'Footpath wayfinding sign',group:'Signs',kind:'point'},
 cycle_sign:{label:'Cycle track sign',group:'Signs',kind:'point'},
 traffic_signal:{label:'Traffic signal head',group:'Signals',kind:'point',params:{junction:1660,axis:'corridor'}},
 railing:{label:'HyD Type 2 railing',group:'Railings',kind:'run'},
 paving:{label:'Footpath paving',group:'Paving',kind:'run',params:{pattern:'red'}},
};
export const PAVING_PATTERNS=['red','grey','buff'];
export const SIGNAL_AXES=['corridor','side','pedestrian'];
export const isModel=type=>type.startsWith('glb:');
export const RAIL=1.5;

// ---------- shared materials (created on first use: several need a canvas) ----------
let M=null;
export function furnitureMaterials(){if(M)return M;
 const labelMaterial=(lines,bg)=>{const c=document.createElement('canvas');c.width=256;c.height=256;const x=c.getContext('2d');x.fillStyle=bg;x.fillRect(0,0,256,256);x.fillStyle='#f2eee0';x.textAlign='center';x.font='bold 44px sans-serif';lines.forEach((line,i)=>x.fillText(line,128,85+i*65));const map=new T.CanvasTexture(c);map.colorSpace=T.SRGBColorSpace;return new T.MeshBasicMaterial({map,side:T.DoubleSide});};
 const blue=document.createElement('canvas');blue.width=blue.height=128;const bx=blue.getContext('2d');bx.fillStyle='#0756af';bx.beginPath();bx.arc(64,64,61,0,Math.PI*2);bx.fill();bx.strokeStyle='white';bx.lineWidth=3;bx.stroke();bx.drawImage(cycleSymbol(),0,105,128,110,12,20,104,89);
 // HK pedestrian aspects: standing man / walking man, white on black (the lens colour tints them).
 const figure=walking=>{const c=document.createElement('canvas');c.width=c.height=128;const x=c.getContext('2d');x.fillStyle='#000';x.fillRect(0,0,128,128);x.fillStyle=x.strokeStyle='#fff';x.lineCap=x.lineJoin='round';x.beginPath();x.arc(64,22,10,0,Math.PI*2);x.fill();x.lineWidth=15;x.beginPath();
  if(walking){x.moveTo(62,42);x.lineTo(58,74);x.stroke();x.lineWidth=9;x.beginPath();x.moveTo(60,46);x.lineTo(44,64);x.lineTo(40,78);x.moveTo(62,46);x.lineTo(78,60);x.lineTo(88,72);x.moveTo(58,74);x.lineTo(46,94);x.lineTo(36,112);x.moveTo(58,74);x.lineTo(74,92);x.lineTo(80,112);}
  else{x.moveTo(64,42);x.lineTo(64,78);x.stroke();x.lineWidth=9;x.beginPath();x.moveTo(56,44);x.lineTo(52,82);x.moveTo(72,44);x.lineTo(76,82);x.moveTo(58,76);x.lineTo(58,114);x.moveTo(70,76);x.lineTo(70,114);}
  x.stroke();const t=new T.CanvasTexture(c);t.colorSpace=T.SRGBColorSpace;t.flipY=false;return t;};
 return M={galvanised:new T.MeshStandardMaterial({color:0xa3adae,metalness:.55,roughness:.58}),lamp:new T.MeshStandardMaterial({color:0xfff1dc,emissive:0xfff1dc,emissiveIntensity:0}),metal:new T.MeshStandardMaterial({color:0x465654,metalness:.65,roughness:.4}),
  iron:new T.MeshStandardMaterial({color:0x3d4845,metalness:.65,roughness:.85}),postGreen:new T.MeshStandardMaterial({color:0x126d4c,roughness:.65}),patch:new T.MeshStandardMaterial({color:0x85877b,roughness:1}),
  postLabel:labelMaterial(['郵政','POST'],'#126d4c'),signLabel:labelMaterial(['行人 →','FOOTPATH'],'#18664e'),cycleSign:new T.MeshBasicMaterial({map:new T.CanvasTexture(blue),transparent:true,side:T.FrontSide}),
  redMan:figure(false),greenMan:figure(true),redManFlip:mirrored(figure(false)),greenManFlip:mirrored(figure(true)),banner:banner(),
  poleWhite:new T.MeshStandardMaterial({color:0xe6e4da,roughness:.45}),leafGreen:new T.MeshStandardMaterial({color:0x2e7d4f,metalness:.2,roughness:.45}),smoked:new T.MeshStandardMaterial({color:0x5a3a24,metalness:.8,roughness:.12}),lanternGrey:new T.MeshStandardMaterial({color:0x8a8f8c,metalness:.5,roughness:.4})};}
// Undo a mirrored parent (scale.x −1) on a lens texture.
function mirrored(t){t.wrapS=T.RepeatWrapping;t.repeat.x=-1;t.offset.x=1;return t;}
// Street-pole banner: crimson with gold border, district name and SGMTS (the site photo shows the national-day set in this style).
function banner(){const c=document.createElement('canvas');c.width=256;c.height=512;const x=c.getContext('2d'),g=x.createLinearGradient(0,0,0,512);g.addColorStop(0,'#b3202a');g.addColorStop(1,'#8c1420');x.fillStyle=g;x.fillRect(0,0,256,512);
 x.strokeStyle='#e7c26a';x.lineWidth=6;x.strokeRect(12,12,232,488);x.fillStyle='#f0cf78';x.textAlign='center';x.font='bold 64px "PingFang HK","Heiti TC",sans-serif';['洪','水','橋'].forEach((ch,i)=>x.fillText(ch,128,110+i*78));
 x.font='bold 22px Arial,sans-serif';x.fillText('HUNG SHUI KIU',128,330);x.globalAlpha=.55;x.lineWidth=3;for(let i=0;i<3;i++){x.beginPath();x.arc(128,410,28+i*16,Math.PI*1.1,Math.PI*1.9);x.stroke();}x.globalAlpha=1;x.font='bold 40px Arial,sans-serif';x.fillText('SGMTS',128,470);
 const t=new T.CanvasTexture(c);t.colorSpace=T.SRGBColorSpace;t.anisotropy=4;return new T.MeshStandardMaterial({map:t,roughness:.8});}
// White bicycle + arrow (also painted on the cycle track by environment.js).
let symbol=null;
export function cycleSymbol(){if(symbol)return symbol;const c=symbol=document.createElement('canvas');c.width=128;c.height=256;const x=c.getContext('2d');x.strokeStyle=x.fillStyle='white';x.lineWidth=5;x.lineCap=x.lineJoin='round';
 for(const cx of [30,98]){x.beginPath();x.arc(cx,177,23,0,Math.PI*2);x.stroke();}x.beginPath();x.moveTo(30,177);x.lineTo(49,136);x.lineTo(72,177);x.closePath();x.moveTo(49,136);x.lineTo(86,136);x.lineTo(72,177);x.moveTo(98,177);x.lineTo(83,121);x.lineTo(98,121);x.moveTo(43,127);x.lineTo(56,127);x.moveTo(49,127);x.lineTo(49,136);x.stroke();
 x.beginPath();x.moveTo(64,10);x.lineTo(91,43);x.lineTo(73,43);x.lineTo(73,92);x.lineTo(55,92);x.lineTo(55,43);x.lineTo(37,43);x.closePath();x.fill();return c;}
const geo={box:new T.BoxGeometry(1,1,1),cyl:new T.CylinderGeometry(1,1,1,7),plane:new T.PlaneGeometry(1,1)};
// CL0053 silhouette: round Ø219 column and swept bracket. Unspecified bracket/housing profiles are visual approximations.
geo.pole=new T.CylinderGeometry(1,1,1,16);
geo.lantern=new T.SphereGeometry(1,16,8);
geo.smartArm=new T.TubeGeometry(new T.CubicBezierCurve3(new T.Vector3(0,0,.55),new T.Vector3(0,-.12,-.2),new T.Vector3(0,.6,-.85),new T.Vector3(0,.6,-1.6)),20,.035,8,false);
// Cycle-track leaf arm (site photos): stalk + midrib, almond leaf outline and two vein pairs as one tube mesh.
// Springs from the pole axis and points −Z, tilted up by `tilt`; `lamp` is the midrib point the lantern hangs from.
function leafArm(len,width,tilt){const d=new T.Vector3(0,Math.sin(tilt),-Math.cos(tilt)),B=new T.Vector3(0,.3,-.4),on=t=>B.clone().addScaledVector(d,len*t),edge=(t,s)=>on(t).setX(s*width*Math.sin(Math.PI*t)**.7);
 const tube=(pts,r,closed=false)=>new T.TubeGeometry(new T.CatmullRomCurve3(pts,closed),closed?72:24,r,6,closed);
 const parts=[tube([...Array.from({length:13},(_,i)=>edge(i/12,1)),...Array.from({length:11},(_,i)=>edge((11-i)/12,-1))],.024,true),tube([new T.Vector3(0,-.12,-.06),new T.Vector3(0,.05,-.22),B,on(.5),on(.97)],.032)];
 for(const t of [.3,.62])for(const s of [-1,1])parts.push(tube([on(t),edge(t+.16,s*.92)],.012));
 return {geometry:mergeGeometries(parts),lamp:on(.45)};}
geo.leafBig=leafArm(1.7,.42,.4);geo.leafSmall=leafArm(1.15,.3,.5);
geo.sensorArm=new T.TubeGeometry(new T.CatmullRomCurve3([new T.Vector3(0,0,0),new T.Vector3(.3,.04,0),new T.Vector3(.55,.2,0),new T.Vector3(.62,.42,0)]),20,.03,6,false);
geo.smartBrace=new T.TubeGeometry(new T.QuadraticBezierCurve3(new T.Vector3(0,-.28,0),new T.Vector3(0,.5,-.6),new T.Vector3(0,.6,-1.6)),16,.025,8,false);

// ---------- Blender street-kit parts (instanced with the template's own materials) ----------
// FEHD warning stickers on the litter bin (lime panel, purple cloud outline, white speech bubble).
function binSticker(name){const low=name==='bin_sticker_low',c=document.createElement('canvas');c.width=512;c.height=low?340:180;const x=c.getContext('2d'),W=c.width,H=c.height;
 x.fillStyle='#b7d23a';x.fillRect(0,0,W,H);
 const bubble=(cx,cy,rx,ry)=>{x.beginPath();for(let i=0;i<=24;i++){const a=i/24*Math.PI*2,k=1+.08*Math.sin(i*Math.PI);x.lineTo(cx+Math.cos(a)*rx*k,cy+Math.sin(a)*ry*k);}x.closePath();x.fillStyle='#fff';x.fill();x.lineWidth=7;x.strokeStyle='#7a2c86';x.stroke();};
 const binIcon=(bx,by,s)=>{x.fillStyle='#e8762a';x.beginPath();x.roundRect(bx,by,s*.7,s,s*.2);x.fill();x.fillStyle='#fff';x.fillRect(bx+s*.2,by+s*.2,s*.3,s*.12);};
 x.fillStyle='#2b2140';x.textAlign='left';
 if(low){bubble(W*.56,H*.4,W*.4,H*.33);x.fillStyle='#2b2140';x.font='bold 40px sans-serif';x.fillText('棄置垃圾在廢屑箱旁',W*.2,H*.3);x.fillText('可被檢控',W*.2,H*.44);x.font='24px sans-serif';x.fillText('Discarding refuse at side of',W*.2,H*.56);x.fillText('the litter container will be prosecuted',W*.2,H*.65);
  binIcon(W*.05,H*.66,H*.3);x.fillStyle='#e06a2a';x.beginPath();x.arc(W*.3,H*.86,H*.1,0,Math.PI*2);x.fill();x.strokeStyle='#c21f1f';x.lineWidth=8;x.beginPath();x.moveTo(W*.22,H*.74);x.lineTo(W*.38,H*.98);x.moveTo(W*.38,H*.74);x.lineTo(W*.22,H*.98);x.stroke();}
 else{bubble(W*.42,H*.5,W*.36,H*.4);x.fillStyle='#2b2140';x.font='bold 30px sans-serif';x.fillText('棄置垃圾在廢屑箱頂',W*.1,H*.36);x.fillText('可被罰款',W*.1,H*.56);x.fillStyle='#c21f1f';x.fillText('$3000',W*.36,H*.56);x.fillStyle='#2b2140';x.font='17px sans-serif';x.fillText('Dumping litter on the top of litter container',W*.1,H*.72);x.fillText('is liable to a fine of $3,000',W*.1,H*.82);
  binIcon(W*.82,H*.3,H*.55);x.strokeStyle='#c21f1f';x.lineWidth=7;x.beginPath();x.moveTo(W*.8,H*.12);x.lineTo(W*.95,H*.35);x.moveTo(W*.95,H*.12);x.lineTo(W*.8,H*.35);x.stroke();}
 const map=new T.CanvasTexture(c);map.colorSpace=T.SRGBColorSpace;map.flipY=false;map.wrapS=T.RepeatWrapping;map.repeat.x=-1;map.offset.x=1;
 return new T.MeshStandardMaterial({map,roughness:.55});}
const kitLibraries=new WeakMap();
export function kitLibrary(streetKit){if(kitLibraries.has(streetKit))return kitLibraries.get(streetKit);const cache={},stickers={};
 const parts=name=>{if(cache[name])return cache[name];const root=streetKit.getObjectByName(name);if(!root)throw Error('Missing Blender model '+name);root.updateMatrixWorld(true);const inv=root.matrixWorld.clone().invert(),out=[];
  root.traverse(n=>{if(!n.isMesh)return;const m=n.material.name;if(/^bin_sticker_/.test(m))stickers[m]??=binSticker(m);out.push({geometry:n.geometry.clone().applyMatrix4(inv.clone().multiply(n.matrixWorld)),material:stickers[m]||n.material});});return cache[name]=out;};
 kitLibraries.set(streetKit,parts);return parts;}

// ---------- instancing for the editor (the game uses environment.js's chunked batches) ----------
export function instancer(){const buckets={};
 return {batch(key,geometry,material,pos,scale,rot=new T.Euler(),chunk=0){const k=key+'-'+chunk;(buckets[k]??={geometry,material,m:[]}).m.push(new T.Matrix4().compose(pos,new T.Quaternion().setFromEuler(rot),scale));},
  finish(parent){for(const [k,b] of Object.entries(buckets)){const mesh=new T.InstancedMesh(b.geometry,b.material,b.m.length);b.m.forEach((m,i)=>mesh.setMatrixAt(i,m));mesh.name=k;mesh.castShadow=mesh.receiveShadow=true;mesh.computeBoundingSphere();parent.add(mesh);}}};}

const UP=new T.Vector3(0,1,0),ONE=new T.Vector3(1,1,1);
const chunkOf=P=>Math.max(0,Math.floor(P.s/240));

// HyD Type 2 railings (H2130I) in 1.5 m bays; the two bays beside an open end use the H2132H junction/crossing
// panel with horizontal flats, and each open end finishes with a rounded end panel.
export function railingBuilder({batch,kitParts,fences}){
 const kit=(name,pos,rot,scale,ch)=>kitParts(name).forEach((part,i)=>batch(name+'-'+i,part.geometry,part.material,pos,scale||ONE,rot instanceof T.Euler?rot:new T.Euler(0,rot,0),ch));
 function railPanel(a,b,kind,ch){fences.push({ax:a.x,az:a.z,bx:b.x,bz:b.z,y:a.y,top:1});const horiz=Math.hypot(b.x-a.x,b.z-a.z),mid=a.clone().add(b).multiplyScalar(.5);
  kit(kind,mid,new T.Euler(Math.atan2(b.y-a.y,horiz),Math.atan2(a.x-b.x,a.z-b.z),0,'YXZ'),new T.Vector3(1,1,horiz/RAIL),ch);}
 function railEnd(p,toward,kind,ch){const d=p.clone().sub(toward).setY(0).normalize();fences.push({ax:p.x,az:p.z,bx:p.x+d.x*.4,bz:p.z+d.z*.4,y:p.y,top:1});kit(kind+'_end',p,Math.atan2(toward.x-p.x,toward.z-p.z),null,ch);}
 function railRun(points,chunk,ends=[true,true]){const n=points.length-1;if(n<1)return;
  const kind=i=>ends[0]&&i<2||ends[1]&&i>=n-2?'railing_crossing':'railing_type2';
  for(let i=0;i<n;i++)railPanel(points[i],points[i+1],kind(i),chunk(i));
  points.forEach((p,i)=>kit('railing_post',p,Math.atan2(points[Math.max(0,i-1)].x-points[Math.min(n,i+1)].x,points[Math.max(0,i-1)].z-points[Math.min(n,i+1)].z),null,chunk(Math.min(i,n-1))));
  if(ends[0])railEnd(points[0],points[1],kind(0),chunk(0));if(ends[1])railEnd(points[n],points[n-1],kind(n-1),chunk(n-1));}
 return {kit,railRun};}

// Post positions of a railing run: equal bays of at most 1.5 m between from and to.
export function runPoints(run){const road=ROAD[run.road],a=road.toParam(Math.min(run.from,run.to)),b=road.toParam(Math.max(run.from,run.to)),n=Math.max(1,Math.ceil((b-a)/RAIL-1e-3));
 return Array.from({length:n+1},(_,k)=>poseAt(run,a+(b-a)*k/n));}

// Builds every catalogue item into `batch` (instanced) and returns what the rest of the game needs: lamp heads for the
// baked night light, railing fences for collision, bins, and traffic-signal groups (animated by experience.js).
export function placeFurniture(data,{batch,kitParts}){const m=furnitureMaterials(),lampPositions=[],fences=[],bins=[],signals=[],errors=[];
 const {kit,railRun}=railingBuilder({batch,kitParts,fences});
 const at=(P,x,y,z)=>new T.Vector3(x,y,z).applyAxisAngle(UP,P.yaw).add(new T.Vector3(P.x,P.y,P.z));
 const box=(key,mat,P,x,y,z,w,h,d)=>batch(key,geo.box,mat,at(P,x,y,z),new T.Vector3(w,h,d),new T.Euler(0,P.yaw,0),chunkOf(P));
 const piece=(key,g,mat,P,x,y,z,w,h,d,turn=0)=>batch(key,g,mat,at(P,x,y,z),new T.Vector3(w,h,d),new T.Euler(0,P.yaw+turn,0),chunkOf(P));
 const light=(P,x,y,z,it,height)=>{const v=at(P,x,y,z),f=P.f;lampPositions.push({s:P.s,x:v.x,y:v.y,z:v.z,kind:it.type,road:it.road,height,axis:{tx:f.tx,tz:f.tz,lx:f.lx,lz:f.lz},id:it.id});};
 const BUILD={
  lamp_park(P,it){const h=it.params?.height??5.5;parkLamp(batch,new T.Vector3(P.x,P.y,P.z),h,m.lamp,chunkOf(P));light(P,0,h-.4,0,it,h);},
  lamp_road(P,it){const h=it.params?.height??10;
   if(it.road==='corridor'){
    const shaft=h-.678,e=h<7?2.22:2.6;
    piece('furn-smart-column',geo.pole,m.galvanised,P,0,shaft/2,0,.1095,shaft,.1095);
    piece('furn-smart-collar',geo.pole,m.metal,P,0,shaft-.18,0,.12,.12,.12);
    piece('furn-smart-arm',geo.smartArm,m.galvanised,P,0,shaft,0,1,1,1);
    piece('furn-smart-brace',geo.smartBrace,m.galvanised,P,0,shaft,0,1,1,1);
    piece('furn-smart-lantern',geo.lantern,m.galvanised,P,0,h-.045,-1.85,.23,.09,.5);
    piece('furn-smart-LED',geo.lantern,m.lamp,P,0,h-.12,-1.92,.18,.025,.36);
    // Only the lowest smart-device housing (E); no upper housings or aerial equipment.
    piece('furn-smart-housing-E',geo.pole,m.galvanised,P,0,e+.085,0,.255,.17,.19);
    piece('furn-smart-housing-seam',geo.pole,m.metal,P,0,e+.085,0,.257,.012,.192);
    for(const y of [.85,1.85]){box('furn-smart-door-rim',m.metal,P,0,y,.106,.105,.84,.018);box('furn-smart-door',m.galvanised,P,0,y,.119,.087,.81,.012);box('furn-smart-door-lock',m.iron,P,.026,y+.25,.127,.012,.035,.006);}
    light(P,0,h-.12,-1.92,it,h);
   }else{const arm=1.1;box('furn-lamp-column',m.galvanised,P,0,h/2,0,.16,h,.16);box('furn-lamp-bracket',m.galvanised,P,0,h-.15,-arm/2,.08,.08,arm);box('furn-lamp-LED',m.lamp,P,0,h-.2,-arm,.9,.09,.42);light(P,0,h-.2,-arm,it,h);}
   // Corridor columns carry back-to-back festive banners on two cross-arms, facing along the road (site photos 18.02.07); params.banner=false removes them.
   if(it.road==='corridor'&&it.params?.banner!==false&&h>=7)for(const x of [-1,1]){for(const y of [3.95,5.65])box('furn-banner-arm',m.galvanised,P,x*.1,y,0,.035,.035,.84);piece('furn-banner',geo.plane,m.banner,P,x*.11,4.8,0,.78,1.62,1,x*Math.PI/2);}},
  lamp_connecting(P,it){const h=it.params?.height??10;box('furn-conn-pole',m.galvanised,P,0,h/2,0,.15,h,.15);box('furn-conn-arm',m.galvanised,P,0,h-.12,-.7,.09,.09,1.6);box('furn-conn-lamp',m.lamp,P,0,h,-1.4,1,.13,.55);light(P,0,h,-1.4,it,h);},
  // Leaf-arm smart pole (site photos): white column, green cap, bulge ring, CCTV collar, weather sensor and two leaf
  // arms with lanterns — the larger over the track (−Z), the smaller behind.
  lamp_cycle(P,it){if(it.road==='cycleway'&&cycleCanopyAt(P.s))return;const h=it.params?.height??5,cap=h-.95,dome=h-1.75,sensor=dome-.75;
   piece('furn-cycle-column',geo.pole,m.poleWhite,P,0,cap/2,0,.1,cap,.1);piece('furn-cycle-cap',geo.pole,m.leafGreen,P,0,cap+.75,0,.105,1.5,.105);
   piece('furn-cycle-bulge',geo.lantern,m.poleWhite,P,0,1.7,0,.3,.2,.3);
   piece('furn-cycle-dome-hood',geo.pole,m.poleWhite,P,0,dome+.03,0,.3,.08,.3);piece('furn-cycle-dome',geo.lantern,m.smoked,P,0,dome-.04,0,.29,.15,.29);piece('furn-cycle-dome-lip',geo.pole,m.poleWhite,P,0,dome-.17,0,.2,.06,.2);
   piece('furn-cycle-sensor-arm',geo.sensorArm,m.leafGreen,P,0,sensor,0,1,1,1);piece('furn-cycle-sensor',geo.pole,m.metal,P,.62,sensor+.55,0,.06,.24,.06);
   for(let k=0;k<5;k++)piece('furn-cycle-sensor-louvre',geo.pole,m.poleWhite,P,.62,sensor+.45+k*.05,0,.085,.022,.085);
   for(const [key,g,d,lampY] of [['furn-cycle-leaf-big',geo.leafBig,1,h-.2],['furn-cycle-leaf-small',geo.leafSmall,-1,h-.85]]){
    const base=lampY+.07-g.lamp.y,z=d*g.lamp.z;piece(key,g.geometry,m.leafGreen,P,0,base,0,1,1,1,d>0?0:Math.PI);
    piece('furn-cycle-lantern',geo.lantern,m.lanternGrey,P,0,lampY+.035,z,.17,.06,.3);piece('furn-cycle-LED',geo.lantern,m.lamp,P,0,lampY,z,.13,.02,.22);light(P,0,lampY,z,it,h);}},
  litter_bin(P){kit('litter_bin',new T.Vector3(P.x,P.y,P.z),P.yaw,null,chunkOf(P));bins.push({x:P.x,y:P.y,z:P.z,s:P.s,side:P.lat>=0?1:-1});},
  pillar_box(P){piece('furn-pillar-box',geo.cyl,m.postGreen,P,0,.58,0,.25,1.16,.25);piece('furn-pillar-cap',geo.cyl,m.postGreen,P,0,1.17,0,.29,.12,.29);piece('furn-post-label',geo.plane,m.postLabel,P,0,.68,-.256,.28,.32,1,Math.PI);box('furn-letter-slot',m.iron,P,0,.95,-.255,.23,.045,.025);},
  manhole(P){box('furn-paving-repair',m.patch,P,0,.006,0,1.10,.016,1.35);box('furn-manhole-rim',m.galvanised,P,0,.018,0,.76,.022,1.03);box('furn-manhole-cover',m.iron,P,0,.032,0,.69,.018,.96);for(let i=-3;i<=3;i++)box('furn-manhole-tread',m.galvanised,P,i*.085,.044,0,.018,.008,.82);},
  wayfinding_sign(P){box('furn-wayfinding-post',m.galvanised,P,0,1.25,0,.06,2.5,.06);piece('furn-wayfinding-sign',geo.plane,m.signLabel,P,0,2.15,0,.8,.65,1,Math.PI);},
  cycle_sign(P){box('furn-cycle-sign-post',m.metal,P,0,1.4,0,.07,2.8,.07);piece('furn-cycle-sign-back',geo.plane,m.metal,P,0,2.5,-.043,.65,.65,1);piece('furn-cycle-sign',geo.plane,m.cycleSign,P,0,2.5,-.055,.65,.65,1,Math.PI);},
  // Blender signal pole + head (site photo); each lens gets its own material so experience.js can light it.
  // Blender signal pole + head (site photo); each lens gets its own material so experience.js can light it. params.hand −1 mirrors
  // the vehicle head to the pole's other side; a shared-pole pedestrian head (pedYaw) hangs on the side away from the vehicle lenses.
  traffic_signal(P,it){const axis=it.params?.axis||'corridor',ped=axis==='pedestrian',crossing=it.params?.crossing||'corridor',g=new T.Group(),body=new T.Group(),lens={};g.position.set(P.x,P.y,P.z);g.rotation.y=P.yaw;g.add(body);
   const hand=!ped&&it.params?.hand===-1?-1:1,lensMat=(name,flip)=>new T.MeshBasicMaterial({color:0x293731,map:name==='signal_ped_stop'?(flip?m.redManFlip:m.redMan):name==='signal_ped_go'?(flip?m.greenManFlip:m.greenMan):null});body.scale.x=hand;
   for(const part of kitParts(ped?'signal_pedestrian':'signal_vehicle')){const name=part.material.name,lit=/^signal_(red|amber|green|ped_)/.test(name),mesh=new T.Mesh(part.geometry,lit?lensMat(name,false):part.material);
    if(lit)lens[name]=mesh;else mesh.castShadow=mesh.receiveShadow=true;body.add(mesh);}
   const bulbs=ped?[lens.signal_ped_stop,{material:new T.MeshBasicMaterial()},lens.signal_ped_go]:[lens.signal_red,lens.signal_amber,lens.signal_green];
   g.name=ped?'Pedestrian signal':'Traffic signal';g.userData.furnitureId=it.id;signals.push({group:g,bulbs,axis,crossing,junction:it.params?.junction,id:it.id});
   if(!ped&&Number.isFinite(it.params?.pedYaw)){
    // Behind the vehicle head: the pedestrian head's +X (its right) must point opposite the vehicle facing (local +Z).
    const head=new T.Group(),lenses={},yaw=it.params.pedYaw*Math.PI/180;head.rotation.y=yaw;g.add(head);
    const behind=Math.sin(yaw)>0?-1:1;head.scale.x=behind;
    for(const part of kitParts('signal_pedestrian_head')){const name=part.material.name,lit=/^signal_ped_/.test(name),mesh=new T.Mesh(part.geometry,lit?lensMat(name,behind<0):part.material);if(lit)lenses[name]=mesh;else mesh.castShadow=mesh.receiveShadow=true;head.add(mesh);}
    // Phases address this head separately; its parent is the shared vehicle pole.
    signals.push({group:head,bulbs:[lenses.signal_ped_stop,{material:new T.MeshBasicMaterial()},lenses.signal_ped_go],axis:'pedestrian',crossing,junction:it.params.junction,id:it.id+'-pedestrian',sharedPole:true});
   }},
 };
 for(const it of data.items||[]){try{const P=pose(it);if(isModel(it.type)){if(it.params?.light)light(P,0,it.params.light,0,it,it.params.light);continue;}const build=BUILD[it.type];if(!build)throw Error('unknown type '+it.type);build(P,it);}catch(e){errors.push(`${it.id}: ${e.message}`);}}
 for(const run of data.runs||[]){if(run.type!=='railing')continue;try{const P=runPoints(run);railRun(P.map(p=>new T.Vector3(p.x,p.y,p.z)),i=>chunkOf(P[i]),run.ends||[true,true]);}catch(e){errors.push(`${run.id}: ${e.message}`);}}
 if(errors.length)console.warn('Street furniture skipped:',errors);
 return {lampPositions,fences,bins,signals,errors};}

// Paving pattern of the corridor footpath on one side at corridor distance s (null: the default chunk colours).
// Later runs sit on top of earlier ones, so a new run over the seeded 240 m bands wins.
export function pavingAt(data,s,side){for(const run of [...(data.runs||[])].reverse())if(run.type==='paving'&&run.road==='corridor'&&(run.side==='R'?-1:1)===side){const a=ROAD.corridor.toParam(Math.min(run.from,run.to)),b=ROAD.corridor.toParam(Math.max(run.from,run.to));if(s>=a&&s<b)return run.params?.pattern||'red';}return null;}
export function pavingBreaks(data){return (data.runs||[]).filter(r=>r.type==='paving'&&r.road==='corridor').flatMap(r=>[r.from,r.to].map(ch=>ROAD.corridor.toParam(ch)));}

// GLB street models (public/street/models): loaded once each, cloned per item. ponytail: plain clones; instance them if counts reach the hundreds.
export async function loadFurnitureModels(data,{loader,url}){const group=new T.Group(),cache={};group.name='street-furniture-models';
 for(const it of data.items||[]){if(!isModel(it.type))continue;const src=it.type.slice(4);
  try{cache[src]??=loader.loadAsync(url(src));const model=(await cache[src]).scene.clone(true),P=pose(it);model.position.set(P.x,P.y,P.z);model.rotation.y=P.yaw;model.scale.setScalar(it.params?.scale||1);model.userData.furnitureId=it.id;model.traverse(n=>{if(n.isMesh){n.castShadow=n.receiveShadow=true;}});group.add(model);}
  catch(e){console.warn('Street model failed to load:',src,e);}}
 return group;}
export const EMPTY={version:1,items:[],runs:[]};
