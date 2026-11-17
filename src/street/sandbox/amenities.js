// Street amenities ported from the city-rules sandbox (hydrants.js, city-amenities.js): the WSD pedestal fire hydrant, the HyD
// H4109 Type B bus shelter with its RM1047/1048 bus stop marking, and the H5144A tree pit with its guard. Each builder returns
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
 const tex=new T.CanvasTexture(c);tex.colorSpace=T.SRGBColorSpace;tex.anisotropy=4;plates.set(key,new T.MeshStandardMaterial({map:tex,roughness:.45,side:T.DoubleSide}));}return plates.get(key);}
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

// H4109 Type B RC bus shelter (columns 1.84 m from the kerb face, roof 0.5–2.0 m, 2.25 m clear, 14.4 m long) and the
// franchised bus stop marking RM1047/1048 on the carriageway (13 m box, 3 m out; 站 / 巴士 / STOP / BUS reading along travel).
// travel: ±1, the direction of traffic along local X.
export const SHELTER_HALF=7.2;
export const busStop=travel=>once('bus-stop'+travel,()=>{const g=new T.Group(),c=mat('#b8b5aa',{roughness:.92}),col=1.84,clear=2.25,fall=Math.atan(1/24),top=clear+.25,L=2*SHELTER_HALF,COLS=[-5.4,-1.8,1.8,5.4];
 for(const x of COLS){cyl(g,c,x,0,col,.15,clear);box(g,c,x,clear-.15,col,.32,top-clear+.15,.32);}
 box(g,c,0,clear,col,L-.6,top-clear-.06,.32);
 {const z0=.5,z1=2,mid=(z0+z1)/2,rise=Math.abs(mid-col)*Math.tan(fall);box(g,c,0,top-.09+rise,mid,L,.09,z1-z0+.01,mid<col?fall:-fall);}
 const route=plate('bus-route',7/3,1,(cx,W,H)=>{cx.fillStyle='#f4f2ea';cx.fillRect(0,0,W,H);cx.strokeStyle='#30302f';cx.lineWidth=10;cx.strokeRect(5,5,W-10,H-10);text(cx,'K65  K66  K73',W/2,H*.42,64,'#30302f');text(cx,'巴士站 BUS STOP',W/2,H*.75,46,'#7a1d1a');});
 for(const s of [-1,1])box(g,route,s*(SHELTER_HALF-.4),top+.15,col,.05,.3,.7);
 const lit=mat('#fff1d6',{emissive:'#fff1d6',emissiveIntensity:.8});for(const x of [-3.6,0,3.6]){const d=new T.Mesh(geo.disc,lit);d.scale.set(.12,.12,1);d.rotation.x=Math.PI/2;d.position.set(x,top-.1,col-.7);g.add(d);}
 const x0=COLS[0]+.15,x1=COLS.at(-1)-.15,s=mat('#c9cdcf',{metalness:.7,roughness:.35}),gl=mat('#bcd3d6',{transparent:true,opacity:.28,roughness:.08,metalness:.1,depthWrite:false});
 box(g,s,0,1.08,col,x1-x0,.028,.025);box(g,s,0,.1,col,x1-x0,.025,.025);box(g,gl,0,.12,col,x1-x0,.96,.01);for(let x=x0;x<=x1+1e-6;x+=(x1-x0)/12)box(g,s,x,.1,col,.025,1,.028);
 for(const [a,b] of [[-1.65,-.6],[.6,1.65]]){box(g,gl,(a+b)/2,1.12,col,b-a,1.03,.01);box(g,s,(a+b)/2,2.15,col,b-a,.025,.028);for(const x of [a,b])box(g,s,x,1.1,col,.025,1.07,.028);}
 return g;});
// The franchised bus stop marking (RM1047/1048) in the same kerb frame, flat at y = 0: the caller drapes every vertex onto the road
// surface (the road climbs and crowns under a 13 m box). White broken box 3 m out, open to the kerb; 站 / 巴士 / STOP / BUS along travel.
export function busStopMarks(travel){const g=new T.Group(),white=mat('#ecebe4',{roughness:.8}),Lm=13,Wm=3,flat=(m,x,z,w,d)=>{const q=new T.Mesh(new T.PlaneGeometry(w,d).rotateX(-Math.PI/2),m);q.position.set(x,0,z);g.add(q);return q;},dash=(x,z,w,d)=>flat(white,x,z,w,d);
 for(let x=-Lm/2;x<Lm/2-1;x+=2)dash(x+.5,-Wm+.05,1,.1);dash(Lm/2-.5,-Wm+.05,1,.1);for(const e of [-1,1])for(const z0 of [-Wm,-1])dash(e*(Lm/2-.05),z0+.5,.1,1);
 let at=-Lm/2+.7;for(const [label,len,cn] of [['站',2.7,1],['巴士',2.7,1],['STOP',1.6],['BUS',1.6]]){const across=cn?2.2:2;
  const m=plate('rm-'+label,across/len,1,(cx,Wc,Hc)=>{cx.fillStyle='#ecebe4';cx.font=`bold ${Hc*.86}px ${cn?'"PingFang HK","Heiti TC",sans-serif':'"Helvetica Neue",Arial,sans-serif'}`;const w=cx.measureText(label).width||Wc;cx.setTransform(Wc*.86/w,0,0,1,Wc/2,Hc*.52);cx.textAlign='center';cx.textBaseline='middle';cx.fillText(label,0,0);});
  Object.assign(m,{transparent:false,alphaTest:.5,roughness:.8,polygonOffset:true,polygonOffsetFactor:-2});m.map.generateMipmaps=true;
  flat(m,travel*(at+len/2),-Wm/2,across,len).rotation.y=-travel*Math.PI/2;at+=len+1;}
 return g;}
