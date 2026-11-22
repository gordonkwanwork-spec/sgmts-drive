// Street amenities ported from the city-rules sandbox (hydrants.js, city-amenities.js): the WSD pedestal fire hydrant, the Hong Kong kerbside and lay-by shelters
// with bilingual carriageway markings, and the H5144A tree pit with its guard. Each builder returns
// [{geometry, material}] in its own frame for the environment's batcher. Materials and canvases are made on first use, so Node
// tests can import this module. Frames: hydrant local −Z faces the road; shelter and tree pit use a kerb frame (x along the
// kerb, +z from the kerb face into the footway, y from the paving).
import * as T from 'three';
import {mergeGeometries} from 'three/addons/utils/BufferGeometryUtils.js';

const mats=new Map();
const mat=(color,o={})=>{const key=JSON.stringify([color,o]);if(!mats.has(key))mats.set(key,new T.MeshStandardMaterial({color,roughness:.7,...o}));return mats.get(key);};
const geo={box:new T.BoxGeometry(1,1,1),cyl:new T.CylinderGeometry(1,1,1,16),disc:new T.CircleGeometry(1,20)};
function box(p,material,x,y,z,w,h,d,rx=0,ry=0,rz=0){const m=new T.Mesh(geo.box,material);m.position.set(x,y+h/2,z);m.scale.set(w,h,d);m.rotation.set(rx,ry,rz);p.add(m);return m;}
function cyl(p,material,x,y,z,r,h){const m=new T.Mesh(geo.cyl,material);m.position.set(x,y+h/2,z);m.scale.set(r,h,r);p.add(m);return m;}
const plates=new Map();
function plate(key,w,h,draw){if(!plates.has(key)){const c=document.createElement('canvas');c.width=Math.round(256*w/h);c.height=256;draw(c.getContext('2d'),c.width,c.height);
 const tex=new T.CanvasTexture(c);tex.colorSpace=T.SRGBColorSpace;tex.anisotropy=4;plates.set(key,new T.MeshStandardMaterial({map:tex,emissive:0xffffff,emissiveMap:tex,emissiveIntensity:.16,roughness:.45,side:T.DoubleSide}));}return plates.get(key);}
const text=(g,s,x,y,px,color)=>{g.fillStyle=color;g.font=`bold ${px}px "Helvetica Neue",Arial,"PingFang HK",sans-serif`;g.textAlign='center';g.textBaseline='middle';g.fillText(s,x,y);};
// One geometry per material (an amenity is otherwise dozens of small meshes).
function parts(group){group.updateMatrixWorld(true);const buckets=new Map();
 group.traverse(m=>{if(!m.isMesh)return;let g=m.geometry.clone().applyMatrix4(m.matrixWorld);if(g.index)g=g.toNonIndexed();for(const k of Object.keys(g.attributes))if(!['position','normal','uv'].includes(k))g.deleteAttribute(k);
  if(!g.attributes.uv)g.setAttribute('uv',new T.Float32BufferAttribute(new Float32Array(g.attributes.position.count*2),2));if(!buckets.has(m.material))buckets.set(m.material,[]);buckets.get(m.material).push(g);});
 return [...buckets].map(([material,list])=>({geometry:mergeGeometries(list),material}));}
const cache=new Map(),once=(key,make)=>{if(!cache.has(key))cache.set(key,parts(make()));return cache.get(key);};

// Hong Kong pedestal fire hydrant, round head (WSD 1.34B): red body, two 65 mm outlets along the kerb (local X), 100 mm cap
// to the road (local −Z), yellow V arrow on the head. ponytail: no per-hydrant serial plate (one batched model); ~0.86 m tall.
export const hydrant=()=>once('hydrant',()=>{const g=new T.Group(),paint=mat('#b8262b',{roughness:.42,metalness:.15}),HY=.68,HR=.14;
 const along=(gm,axis)=>axis==='x'?gm.rotateZ(Math.PI/2):gm.rotateX(Math.PI/2),mesh=(gm,x=0,y=0,z=0)=>{const m=new T.Mesh(gm,paint);m.position.set(x,y,z);g.add(m);};
 const profile=[[0,0],[.2,0],[.2,.022],[.185,.032],[.15,.052],[.122,.082],[.106,.12],[.099,.16],[.116,.165],[.116,.197],[.088,.202],[.086,.42],[.1,.424],[.1,.446],[.086,.45],[.086,.5],[.12,.505],[.12,.537],[.092,.542],[.092,.6],[0,.6]];
 mesh(new T.LatheGeometry(profile.map(([r,y])=>new T.Vector2(r,y)),20));mesh(new T.SphereGeometry(HR,20,12),0,HY,0);
 mesh(new T.CylinderGeometry(.045,.05,.05,16),0,HY+HR-.005,0);mesh(new T.CylinderGeometry(.02,.022,.035,5),0,HY+HR+.035,0);
 for(const s of [-1,1]){mesh(along(new T.CylinderGeometry(.052,.058,.12,16),'x'),s*.15,HY,0);mesh(along(new T.CylinderGeometry(.07,.07,.02,16),'x'),s*.215,HY,0);
  mesh(along(new T.CylinderGeometry(.05,.05,.05,16),'x'),s*.245,HY,0);mesh(along(new T.CylinderGeometry(.057,.057,.04,16),'x'),s*.29,HY,0);}
 mesh(along(new T.CylinderGeometry(.075,.075,.05,16),'z'),0,HY,-.125);mesh(along(new T.CylinderGeometry(.068,.068,.035,16),'z'),0,HY,-.165);
 const arrow=plate('hydrant-arrow',.5,1,(c,W,H)=>{c.fillStyle='#b8262b';c.fillRect(0,0,W,H);c.fillStyle='#f2c230';c.beginPath();c.moveTo(W/2,H*.98);c.lineTo(W*.22,H*.08);c.lineTo(W/2,H*.43);c.lineTo(W*.78,H*.08);c.closePath();c.fill();});
 const a=new T.Mesh(new T.SphereGeometry(HR+.002,10,8,Math.PI*1.5-.45,.9,.4,.75),arrow);a.position.y=HY;g.add(a);return g;});

// H5144A tree pit: kerbed surround (W along the kerb × D), soil, and the circular steel guard. The tree is planted separately.
export const treePit=(W,D)=>once('pit'+W+'x'+D,()=>{const g=new T.Group(),c=mat('#b8b5aa',{roughness:.92}),e=.1,R=.32,gd=mat('#3a4440',{metalness:.4,roughness:.6});
 box(g,c,0,-.02,-(D+e)/2,W+2*e,.1,e);box(g,c,0,-.02,(D+e)/2,W+2*e,.1,e);box(g,c,-(W+e)/2,-.02,0,e,.1,D);box(g,c,(W+e)/2,-.02,0,e,.1,D);box(g,mat('#3b2f25',{roughness:1}),0,-.05,0,W,.04,D);
 for(const y of [.08,.62,1.16]){const ring=new T.Mesh(new T.CylinderGeometry(R,R,.06,24,1,true),gd);ring.position.y=y;g.add(ring);}
 for(let i=0;i<16;i++){const a=i/16*Math.PI*2;cyl(g,gd,Math.cos(a)*R,0,Math.sin(a)*R,.0075,1.2);}return g;});

// Open-fronted shelters, local +Z into the footway. Route flags stand at the
// boarding end (traffic travels along −X). Panels face approaching passengers.
function roadsidePanel(group,material,x,y,z,width,height){
 const panel=new T.Mesh(new T.PlaneGeometry(width,height),material);
 panel.rotation.y=Math.PI;panel.position.set(x,y,z);group.add(panel);
}

export const busStop=kind=>once('bus-stop-'+kind,()=>{
 const g=new T.Group(),bay=kind==='layby',length=bay?13.8:4.6;
 const frame=mat('#83908b',{metalness:.42}),green=mat('#28563f'),roof=mat('#c8cab9'),seat=mat('#87938f',{metalness:.45});
 const flagRed=mat('#a83232'),ochre=mat('#b96930'),dark=mat('#424c48');
 const posts=bay?[-6.2,-3.1,0,3.1,6.2]:[-1.82,1.82];
 for(const x of posts){
  box(g,frame,x,-.16,1.42,.09,2.73,.11);
  box(g,frame,x,2.51,.98,.075,.09,1.45);
 }
 // Folded sheet roof with a shallow fall, fine seams and painted edge beam.
 box(g,roof,0,2.61,.99,length,.065,1.65,-.045);
 box(g,green,0,2.43,.2,length,.17,.09);
 box(g,green,0,2.55,1.8,length,.12,.07);
 for(const x of posts)box(g,frame,x,2.675,.99,.025,.022,1.64,-.045);
 for(const x of (bay?[-3.45,3.45]:[0])){
  const w=bay?2.65:1.68;
  for(const dx of [-w*.35,w*.35])box(g,dark,x+dx,-.09,1.06,.1,.53,.24);
  box(g,seat,x,.44,1.06,w,.095,.36);
  box(g,mat('#fff1d6',{emissive:'#fff1d6',emissiveIntensity:.8}),x,2.51,.84,.75,.035,.09);
 }
 if(!bay)box(g,ochre,1.82,-.08,1.33,.22,2.58,.37);
 const flagX=-length/2-.67;
 cyl(g,frame,flagX,-.12,.67,.038,3.08);
 box(g,flagRed,flagX,2.40,.67,.43,.66,.075);
 const flag=plate('hk-route-flag',.43,.66,(c,w,h)=>{
  c.fillStyle='#ab3535';c.fillRect(0,0,w,h);text(c,'巴士站',w/2,h*.18,39,'#fff4da');
  c.fillStyle='#f3ca53';c.fillRect(5,h*.34,w-10,h*.61);
  text(c,'K65',w/2,h*.51,50,'#552e2a');text(c,'K66   K73',w/2,h*.80,27,'#552e2a');
 });
 roadsidePanel(g,flag,flagX,2.73,.628,.43,.66);
 const timetable=plate('hk-stop-timetable',.36,.83,(c,w,h)=>{
  c.fillStyle='#f4edda';c.fillRect(0,0,w,h);
  for(const [i,route] of ['K65','K66','K73'].entries()){
   const top=i*h/3;c.fillStyle=i===1?'#e5b44d':'#a73b34';c.fillRect(0,top,w,h*.10);
   text(c,route,w/2,top+h*.05,20,'#fff8ed');
   for(let row=0;row<5;row++){c.fillStyle='#73746b';c.fillRect(w*.10,top+h*.14+row*8,w*(row%2?.54:.78),2);}
  }
 });
 box(g,flagRed,flagX,.98,.67,.41,.90,.09);
 roadsidePanel(g,timetable,flagX,1.43,.622,.36,.83);
 if(bay){
  const x=posts.at(-1)-.51;
  box(g,frame,x,.14,1.40,.87,2.15,.12);
  roadsidePanel(g,timetable,x,1.28,1.335,.74,1.84);
 }
 return g;
});
// The franchised bus stop marking (RM1047/1048) in the same kerb frame, flat at y = 0: the caller drapes every vertex onto the road
// surface (the road climbs and crowns under a 13 m box). White broken box 3 m out, open to the kerb; 站 / 巴士 / STOP / BUS along travel.
export function busStopMarks(travel,kind){const g=new T.Group(),white=mat('#ecebe4',{roughness:.8,emissive:'#ecebe4',emissiveIntensity:.18}),Lm=kind==='layby'?20:13,Wm=3,flat=(m,x,z,w,d)=>{const q=new T.Mesh(new T.PlaneGeometry(w,d).rotateX(-Math.PI/2),m);q.position.set(x,0,z);g.add(q);return q;},dash=(x,z,w,d)=>flat(white,x,z,w,d);
 const count=Math.round((Lm+1)/2);
 for(let i=0;i<count;i++)dash(-Lm/2+.5+i*(Lm-1)/(count-1),-Wm+.05,1,.1);
 for(const e of [-1,1])for(const z0 of [-Wm,-1])dash(e*(Lm/2-.05),z0+.5,.1,1);
 // Yellow boarding queue corners on the paving beside the route flag.
 const queueX=kind==='layby'?-7.6:-3.0,queuePaint=mat('#dcb548',{roughness:.9});
 for(const sign of [-1,1]){
  flat(queuePaint,queueX+sign*.55,.88,.05,.96);
  flat(queuePaint,queueX+sign*.42,.42,.26,.05);
 }
 let at=-13/2+.7;for(const [label,len,cn] of [['站',2.7,1],['巴士',2.7,1],['STOP',1.6],['BUS',1.6]]){const across=cn?2.2:2;
  const m=plate('rm-'+label,across/len,1,(cx,Wc,Hc)=>{cx.fillStyle='#ecebe4';cx.font=`bold ${Hc*.86}px ${cn?'"PingFang HK","Heiti TC",sans-serif':'"Helvetica Neue",Arial,sans-serif'}`;const w=cx.measureText(label).width||Wc;cx.setTransform(Wc*.86/w,0,0,1,Wc/2,Hc*.52);cx.textAlign='center';cx.textBaseline='middle';cx.fillText(label,0,0);});
  Object.assign(m,{transparent:false,alphaTest:.5,roughness:.8,polygonOffset:true,polygonOffsetFactor:-2});m.map.generateMipmaps=true;
  flat(m,travel*(at+len/2),-Wm/2,across,len).rotation.y=-travel*Math.PI/2;at+=len+1;}
 return g;}
