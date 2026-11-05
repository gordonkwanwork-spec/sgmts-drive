// Facade relief for massing buildings near the SGMTS corridor, after the street-level density of the Taipei GTA
// reference (taipei-gta.vercel.app): slab ledges, cornices and pilasters break up the flat facade tiles; flats get
// balconies with glass rails and hung AC units; ground floors get shopfronts behind piers, a continuous canopy,
// lit fascia signs and vertical blade signs; roofs get parapets, lift rooms, water tanks, plant, masts and dishes.
// Second pass: drain pipes, window sills, louvred plant-room vents, estate name boards, village window grilles,
// textured concrete and mosaic surfaces (metric UVs) and reflective shop/balcony glass.
// Buildings beyond DETAIL_RANGE keep the plain textured prism, so the extra geometry is only where riders look.
// Geometry is emitted per material in world space, like the rest of massingParts, and merged per cell there.
import * as T from 'three';
import {project,sample} from '../alignment.js';
import {canvasTex,seeded} from './massing.js';

export const DETAIL_RANGE=160;// metres from the route centreline to the building centre
export function nearCorridor(x,z){const r=sample(project(x,z));return Math.hypot(r.x-x,r.z-z)<DETAIL_RANGE;}

// Facade grids of the massing materials (tile ÷ window columns/rows in massing.js), so relief lands on the drawn bays.
const KINDS={
 tower:{bay:3,floor:3.15,balcony:'pairs',ac:.3,corners:true,groundShops:true,pipes:true,dishes:true},
 towerAlt:{bay:2.5,floor:3.15,balcony:'strips',fins:2,ac:.25,groundShops:true,pipes:true,dishes:true},
 podium:{bay:8,floor:5,shop:true,ac:.5,sill:[.55,6.25],vents:.25,estate:true},
 civic:{bay:4,floor:4.5,fins:1,ac:.35,entrance:true,sill:[.63,2.87],pipes:true},
 campus:{bay:5,floor:4.5,louvres:true,fins:2,entrance:true},
 house:{bay:4,floor:8.2/3,balcony:'front',ac:.5,village:true,sill:[.64,2.75],grilles:true,pipes:true},
};

// ---------- materials ----------
const SHOPS=[['茶餐廳','CAFE','#c8302c'],['藥房','PHARMACY','#1f8a4c'],['便利店','24H STORE','#f2a516'],['地產代理','PROPERTY','#1d4e89'],['麵包西餅','BAKERY','#8a4b23'],
 ['眼鏡','OPTICAL','#2a2a2a'],['診所','CLINIC','#ffffff'],['海鮮酒家','SEAFOOD','#a8131b'],['補習中心','TUTORING','#5b2c83'],['五金','HARDWARE','#d65a1f']];
const BLADES=[['牙科','#ffffff','#1f5fa8'],['中醫','#f6e7b4','#8a1c1c'],['茶樓','#b8141b','#ffd76a'],['金行','#1b1b1b','#f2c230'],['冰室','#1f7a6d','#ffffff'],['時裝','#e64a8a','#ffffff'],['旅行社','#ffffff','#d0281e'],['髮型','#262f6b','#ffffff']];
const HAN='"PingFang HK","Noto Sans TC","Microsoft JhengHei",sans-serif';
// Sign atlas 1024²: ten 512×128 fascia boards (rows 0–4), then eight 128×384 vertical blades along the bottom.
function drawSigns(g,n){g.fillStyle='#000';g.fillRect(0,0,1024,1024);g.textAlign='center';g.textBaseline='middle';
 SHOPS.forEach(([zh,en,bg],i)=>{const x=(i%2)*512,y=Math.floor(i/2)*128,dark=bg==='#ffffff'||bg==='#f2a516',ink=dark?'#1d2a3a':'#fff';
  g.fillStyle=bg;g.fillRect(x+4,y+4,504,120);if(n&&!dark){g.fillStyle='rgba(0,0,0,.35)';g.fillRect(x+4,y+4,504,120);}
  g.fillStyle=n?(dark?'#3a4a5a':'#fff8e6'):ink;g.font=`800 70px ${HAN}`;g.fillText(zh,x+256,y+56);g.font='700 26px "Helvetica Neue",Arial,sans-serif';g.fillText(en,x+256,y+106);
  g.strokeStyle=n?'#fff2c0':'rgba(255,255,255,.55)';g.lineWidth=4;g.strokeRect(x+10,y+10,492,108);});
 BLADES.forEach(([zh,bg,ink],i)=>{const x=i*128,y=640;g.fillStyle=bg;g.fillRect(x+6,y+6,116,372);if(n&&bg!=='#ffffff'){g.fillStyle='rgba(0,0,0,.3)';g.fillRect(x+6,y+6,116,372);}
  g.fillStyle=n?'#fffbe8':ink;g.font=`900 ${zh.length>2?84:100}px ${HAN}`;[...zh].forEach((ch,k)=>g.fillText(ch,x+64,y+192+(k-(zh.length-1)/2)*(zh.length>2?104:128)));
  g.strokeStyle=n?'#ffe9a8':ink;g.lineWidth=5;g.strokeRect(x+14,y+14,100,356);});}
// Shopfront strip, four 4 m units per 16 m tile, 4.2 m high: piers are separate geometry; this is the recess behind them.
let shopGlass=null;// day pass records the glazed recesses for the shopfront's roughness/metalness map
function drawShops(g,n){const r=seeded(41);g.fillStyle=n?'#000':'#3b3f42';g.fillRect(0,0,512,256);
 for(let k=0;k<4;k++){const x=k*128,shutter=r()<.22,warm=r()<.6;
  if(shutter){g.fillStyle=n?'#0c0c0c':'#9a9d9c';g.fillRect(x+8,40,112,216);if(!n){g.fillStyle='#82868a';for(let y=44;y<256;y+=7)g.fillRect(x+8,y,112,2);}continue;}
  if(n){const gr=g.createLinearGradient(0,40,0,256);gr.addColorStop(0,warm?'#fff0c8':'#eef6ff');gr.addColorStop(1,warm?'#c98f45':'#8fa6bd');g.fillStyle=gr;g.fillRect(x+8,40,112,216);}
  else{g.fillStyle='#55707f';g.fillRect(x+8,40,112,216);shopGlass?.push([x+8,40,112,216]);g.fillStyle='rgba(255,255,255,.12)';g.fillRect(x+8,40,112,60);}
  // goods on shelves read through the glass, a glass door with a push bar, transom and stall risers
  for(let s=0;s<3;s++){const y=110+s*44;for(let i=0;i<5;i++){g.fillStyle=`hsl(${r()*360|0},${40+r()*30|0}%,${n?55+r()*20|0:35+r()*25|0}%)`;g.fillRect(x+14+i*12,y,9,16+r()*10);}g.fillStyle=n?'rgba(80,60,40,.6)':'rgba(30,30,30,.5)';g.fillRect(x+12,y+28,64,3);}
  g.fillStyle=n?'rgba(0,0,0,.25)':'rgba(20,28,34,.45)';g.fillRect(x+84,96,30,160);g.fillStyle='#c9cdd0';g.fillRect(x+82,94,2,162);g.fillRect(x+114,94,2,162);g.fillRect(x+88,170,22,3);
  g.fillStyle=n?'#222':'#2b2f31';g.fillRect(x+8,92,112,4);g.fillRect(x+8,236,74,20);}
 if(!n){g.fillStyle='#24282a';g.fillRect(0,0,512,40);}}
// Split-unit condenser face: fan grille in a pale casing.
function drawAC(g){g.fillStyle='#e3e4df';g.fillRect(0,0,128,96);g.fillStyle='#bfc2bd';g.fillRect(0,0,128,4);g.fillStyle='#4b4f52';g.beginPath();g.arc(48,50,34,0,Math.PI*2);g.fill();
 g.strokeStyle='#9aa0a3';g.lineWidth=3;for(let r=8;r<34;r+=7){g.beginPath();g.arc(48,50,r,0,Math.PI*2);g.stroke();}g.fillStyle='#c8cbc6';for(let y=18;y<84;y+=8)g.fillRect(94,y,26,4);}
// Estate name boards: bronze ground, gilt lettering (lit warm at night); four 1024×128 slots.
const ESTATES=[['翠湖花園','JADE LAKE GARDEN'],['瑞峰苑','SUMMIT VIEW COURT'],['錦綉軒','BROCADE COURT'],['朗晴居','BRIGHT SKY RESIDENCE']];
function drawEstates(g,n){g.textAlign='center';g.textBaseline='middle';ESTATES.forEach(([zh,en],i)=>{const y=i*128;g.fillStyle=n?'#000':'#3a332a';g.fillRect(0,y,1024,128);
 g.fillStyle=n?'#ffe2a6':'#d9b45c';g.font=`700 78px ${HAN}`;g.fillText(zh,330,y+64);g.font='600 40px "Times New Roman",Georgia,serif';g.fillText(en,760,y+66);if(!n){g.strokeStyle='#8c7444';g.lineWidth=4;g.strokeRect(8,y+8,1008,112);}});}
// Board-marked concrete (ledges, fins, plant) and 25 mm mosaic tiles (shop piers): near-white so material colours tint them; 2 m repeat.
function drawConcrete(g){const r=seeded(61);g.fillStyle='#eeeeec';g.fillRect(0,0,256,256);for(let i=0;i<2600;i++){g.fillStyle=`rgba(${r()<.5?'0,0,0':'255,255,255'},${r()*.09})`;g.fillRect(r()*256,r()*256,1+r()*2,1+r()*2);}
 for(let y=0;y<256;y+=32){g.fillStyle='rgba(0,0,0,.05)';g.fillRect(0,y,256,1);}for(let i=0;i<14;i++){const x=r()*256,gr=g.createLinearGradient(0,0,0,256);gr.addColorStop(0,'rgba(60,55,45,.12)');gr.addColorStop(1,'rgba(60,55,45,0)');g.fillStyle=gr;g.fillRect(x,0,2+r()*5,60+r()*180);}}
function drawMosaic(g){const r=seeded(67);for(let y=0;y<256;y+=8)for(let x=0;x<256;x+=8){const v=225+r()*30|0;g.fillStyle=`rgb(${v},${v-4},${v-12})`;g.fillRect(x,y,8,8);}g.fillStyle='rgba(90,85,75,.35)';for(let k=0;k<256;k+=8){g.fillRect(k,0,1,256);g.fillRect(0,k,256,1);}}
// Aluminium plant-room louvres and a security grille (alpha-tested bars).
function drawLouvre(g){g.fillStyle='#8d9396';g.fillRect(0,0,128,128);for(let y=0;y<128;y+=8){g.fillStyle='#b9bec0';g.fillRect(0,y,128,4);g.fillStyle='#4a4f52';g.fillRect(0,y+4,128,2);}g.fillStyle='#6d7276';g.fillRect(0,0,128,3);g.fillRect(0,125,128,3);g.fillRect(0,0,3,128);g.fillRect(125,0,3,128);}
function drawGrille(g){g.clearRect(0,0,128,128);g.fillStyle='#e8ebe6';for(let x=4;x<128;x+=16)g.fillRect(x,0,4,128);g.fillRect(0,0,128,5);g.fillRect(0,123,128,5);g.fillRect(0,62,128,4);g.strokeStyle='#e8ebe6';g.lineWidth=3;for(let x=12;x<128;x+=32){g.beginPath();g.arc(x,32,9,0,Math.PI*2);g.stroke();g.beginPath();g.arc(x,96,9,0,Math.PI*2);g.stroke();}}
const tex=(w,h,draw)=>{const t=canvasTex(w,h,draw,false);t.anisotropy=8;return t;};
// Shop glazing: only the recorded glass recesses are smooth and metallic, so they mirror the street and sky.
function shopMaterial(){shopGlass=[];const m=lit(512,256,drawShops,{roughness:1,metalness:1,envMapIntensity:1.1}),glass=shopGlass;shopGlass=null;
 const rm=canvasTex(512,256,g=>{g.fillStyle='rgb(0,200,0)';g.fillRect(0,0,512,256);g.fillStyle='rgb(0,22,170)';for(const [x,y,w,h] of glass)g.fillRect(x,y,w,h);},false);rm.colorSpace=T.NoColorSpace;return Object.assign(m,{roughnessMap:rm,metalnessMap:rm});}
const lit=(w,h,draw,o={})=>{const m=new T.MeshStandardMaterial({map:canvasTex(w,h,draw,false),emissiveMap:canvasTex(w,h,draw,true),roughness:.55,...o});m.emissive.set(0);return m;};
let MATS;
// Shop and sign materials carry emissive maps, so massing.js's nightMaterials() lights them with the windows.
export function detailMaterials(){return MATS||(MATS={
 ledge:new T.MeshStandardMaterial({color:0xdcd9d0,roughness:.85,map:tex(256,256,drawConcrete)}),
 pier:new T.MeshStandardMaterial({color:0xd8d0c0,roughness:.45,map:tex(256,256,drawMosaic)}),
 fin:new T.MeshStandardMaterial({color:0xf1f2f0,roughness:.75,map:tex(256,256,drawConcrete)}),
 railGlass:new T.MeshStandardMaterial({color:0x9fc4d6,roughness:.03,metalness:.75,envMapIntensity:1.4,transparent:true,opacity:.5,depthWrite:false,side:T.DoubleSide}),
 pipe:new T.MeshStandardMaterial({color:0xbdb6a5,roughness:.6}),
 dish:new T.MeshStandardMaterial({color:0xeceeec,roughness:.5,side:T.DoubleSide}),
 louvre:new T.MeshStandardMaterial({map:tex(128,128,drawLouvre),roughness:.5,metalness:.4}),
 grille:new T.MeshStandardMaterial({map:tex(128,128,drawGrille),alphaTest:.5,side:T.DoubleSide,roughness:.5,metalness:.3}),
 estateSigns:lit(1024,512,drawEstates,{roughness:.35,metalness:.4}),
 metal:new T.MeshStandardMaterial({color:0x6a7075,roughness:.45,metalness:.6}),
 acBody:new T.MeshStandardMaterial({color:0xdedfd9,roughness:.7}),
 acFace:new T.MeshStandardMaterial({map:canvasTex(128,96,drawAC,false,false),roughness:.7}),
 tank:new T.MeshStandardMaterial({color:0x3b78b0,roughness:.6}),
 plant:new T.MeshStandardMaterial({color:0x9ea3a5,roughness:.7,metalness:.2,map:tex(256,256,drawConcrete)}),
 canopy:new T.MeshStandardMaterial({color:0xe2e4e2,roughness:.6,metalness:.15,map:tex(256,256,drawConcrete)}),
 shopfront:shopMaterial(),
 shopSigns:lit(1024,1024,drawSigns,{roughness:.5}),
});}

// ---------- geometry ----------
const V=(x,y,z)=>new T.Vector3(x,y,z),UP=V(0,1,0);
function builder(){const by=new Map();
 const get=m=>{if(!by.has(m))by.set(m,{p:[],n:[],uv:[],ix:[]});return by.get(m);};
 // Quad from corner o along a then b; faces a×b; uv=[u0,v0,u1,v1].
 const quad=(m,o,a,b,uv=[0,0,1,1])=>{const g=get(m),k=g.p.length/3,n=a.clone().cross(b).normalize();
  for(const [s,t] of [[0,0],[1,0],[1,1],[0,1]]){g.p.push(o.x+a.x*s+b.x*t,o.y+a.y*s+b.y*t,o.z+a.z*s+b.z*t);g.n.push(n.x,n.y,n.z);g.uv.push(uv[0]+(uv[2]-uv[0])*s,uv[1]+(uv[3]-uv[1])*t);}
  g.ix.push(k,k+1,k+2,k,k+2,k+3);};
 // Box centred on c, sx along unit X (horizontal), sy up, sz along X×up; bottom face skipped (never seen). UVs in metres/2, so textures keep scale.
 const cuboid=(m,c,X,sx,sy,sz)=>{const x=X.clone().multiplyScalar(sx),y=UP.clone().multiplyScalar(sy),z=X.clone().cross(UP).multiplyScalar(sz),h=(a,b,cc)=>c.clone().addScaledVector(x,a).addScaledVector(y,b).addScaledVector(z,cc),S=2;
  quad(m,h(-.5,-.5,.5),x,y,[0,0,sx/S,sy/S]);quad(m,h(.5,-.5,-.5),x.clone().negate(),y,[0,0,sx/S,sy/S]);quad(m,h(.5,-.5,.5),z.clone().negate(),y,[0,0,sz/S,sy/S]);quad(m,h(-.5,-.5,-.5),z,y,[0,0,sz/S,sy/S]);quad(m,h(-.5,.5,.5),x,z.clone().negate(),[0,0,sx/S,sz/S]);};
 // Open-ended upright cylinder (tanks, masts) with a lid.
 const drum=(m,c,r,hh,seg=10)=>{const g=get(m);for(let i=0;i<seg;i++){const a0=i/seg*Math.PI*2,a1=(i+1)/seg*Math.PI*2,p0=V(Math.cos(a0)*r,0,Math.sin(a0)*r),p1=V(Math.cos(a1)*r,0,Math.sin(a1)*r);
   quad(m,c.clone().add(p1),p0.clone().sub(p1),V(0,hh,0));const k=g.p.length/3;g.p.push(c.x,c.y+hh,c.z,c.x+p1.x,c.y+hh,c.z+p1.z,c.x+p0.x,c.y+hh,c.z+p0.z);g.n.push(0,1,0,0,1,0,0,1,0);g.uv.push(.5,.5,0,0,1,0);g.ix.push(k,k+1,k+2);}};
 // Flat disc (dishes): triangle fan in the plane of unit vectors X, Y.
 const disc=(m,c,X,Y,r,seg=10)=>{const g=get(m),k=g.p.length/3,n=X.clone().cross(Y);g.p.push(c.x,c.y,c.z);g.n.push(n.x,n.y,n.z);g.uv.push(.5,.5);
  for(let i=0;i<=seg;i++){const a=i/seg*Math.PI*2,p=c.clone().addScaledVector(X,Math.cos(a)*r).addScaledVector(Y,Math.sin(a)*r);g.p.push(p.x,p.y,p.z);g.n.push(n.x,n.y,n.z);g.uv.push(.5+Math.cos(a)/2,.5+Math.sin(a)/2);if(i)g.ix.push(k,k+i,k+i+1);}};
 const flush=out=>{for(const [m,g] of by){if(!g.ix.length)continue;const geo=new T.BufferGeometry();geo.setAttribute('position',new T.Float32BufferAttribute(g.p,3));geo.setAttribute('normal',new T.Float32BufferAttribute(g.n,3));
  geo.setAttribute('uv',new T.Float32BufferAttribute(g.uv,2));geo.setIndex(g.ix);out(m,geo);}};
 return {quad,cuboid,drum,disc,flush};}

// Same corner order as massing.js rect(), so each face's running u matches the prism's facade UVs.
const rect=(cx,cz,w,d,angle)=>{const c=Math.cos(angle),s=Math.sin(angle);return [[-w/2,-d/2],[w/2,-d/2],[w/2,d/2],[-w/2,d/2]].map(([u,v])=>V(cx+u*c+v*s,0,cz-u*s+v*c));};
function faces(r){const ring=rect(r.x,r.z,r.w,r.d,r.angle),centre=V(r.x,0,r.z);let u0=0;
 return ring.map((A,i)=>{const B=ring[(i+1)%4],len=A.distanceTo(B),T0=B.clone().sub(A).normalize(),N=V(T0.z,0,-T0.x);
  if(N.dot(A.clone().add(B).multiplyScalar(.5).sub(centre))<0)N.negate();const R=UP.clone().cross(N),f={A,T:T0,N,R,len,u0,L:A.clone().lerp(B,.5).addScaledVector(R,-len/2)};u0+=len;return f;});}
// at: t from A along the ring (matches facade UVs); atR: t from the left end seen from outside (R = left→right, quads face N).
const at=(f,t,out,y)=>f.A.clone().addScaledVector(f.T,t).addScaledVector(f.N,out).setY(y),atR=(f,t,out,y)=>f.L.clone().addScaledVector(f.R,t).addScaledVector(f.N,out).setY(y);
// Distances along a face (from A) of the facade's bay lines.
const bayLines=(f,bay)=>{const out=[];for(let t=(bay-f.u0%bay)%bay;t<=f.len+1e-6;t+=bay)out.push(t);return out;};

// out(material,geometry). r: footprint {x,z,w,d,angle}; y: base level; h: height; kind: a KINDS key.
// opts.ground: the base is street level (residential towers then get a shop storey); opts.lot: lot hash (estate name). Podium roofs (towers stand on them) get no plant.
export function facadeDetail(out,r,y,h,kind,opts={}){const K=KINDS[kind];if(!K||h<3)return;
 const M=detailMaterials(),{quad,cuboid,drum,disc,flush}=builder(),rnd=seeded(1+Math.abs(Math.round(r.x*73+r.z*179))%2147483646),F=faces(r),floors=Math.max(1,Math.round(h/K.floor));
 const toRoute=(()=>{const q=sample(project(r.x,r.z));return V(q.x-r.x,0,q.z-r.z).normalize();})(),front=F.reduce((a,b)=>b.N.dot(toRoute)>a.N.dot(toRoute)?b:a);
 const shopH=K.shop||opts.ground&&K.groundShops?4.2:0;
 for(const f of F){
  // Slab ledges at every floor line above the shop storey, wrapping the corners; heavier cornice under the parapet.
  for(let k=shopH?Math.ceil((shopH+.6)/K.floor):1;k<floors;k++)cuboid(M.ledge,at(f,f.len/2,.16,y+k*K.floor-.11),f.T,f.len+.64,.22,.32);
  cuboid(M.ledge,at(f,f.len/2,.25,y+h-.25),f.T,f.len+1,.5,.5);
  // Parapet with coping, sitting on the wall line.
  cuboid(M.ledge,at(f,f.len/2,-.12,y+h+.55),f.T,f.len,1.1,.24);cuboid(M.metal,at(f,f.len/2,-.12,y+h+1.13),f.T,f.len,.06,.3);
  if(K.corners)for(const t of [0])cuboid(M.fin,at(f,t,.05,y+h/2),f.T,.7,h,.7);
  const lines=bayLines(f,K.bay);
  if(K.fins)lines.forEach((t,i)=>{if(i%K.fins===0&&t>.5&&t<f.len-.5)cuboid(M.fin,at(f,t,.3,y+shopH+(h-shopH)/2),f.T,.28,h-shopH,.6);});
  if(K.louvres)for(let k=0;k<floors;k++)for(const dy of [2.75,3.55])cuboid(M.fin,at(f,f.len/2,.6,y+k*K.floor+dy),f.T,f.len-.6,.14,1.2);
  // Shop storey: dark recess with goods, piers on the 4 m grid, canopy, a fascia sign per unit and blade signs higher up.
  if(shopH){const units=Math.max(1,Math.round(f.len/4)),w=f.len/units;
   quad(M.shopfront,atR(f,.2,.06,y-.3),f.R.clone().multiplyScalar(f.len-.4),V(0,shopH+.3,0),[0,-.3/shopH,units/4,1]);
   for(let i=0;i<=units;i++)cuboid(M.pier,atR(f,i*w,.18,y+shopH/2-.3),f.R,.5,shopH+.6,.36);
   cuboid(M.canopy,at(f,f.len/2,.95,y+3.55),f.T,f.len+.4,.22,1.9);cuboid(M.metal,at(f,f.len/2,1.88,y+3.55),f.T,f.len+.4,.32,.06);
   for(let i=0;i<units;i++){const slot=Math.floor(rnd()*SHOPS.length),u=(slot%2)/2,v=1-Math.floor(slot/2)*.125;
    cuboid(M.metal,atR(f,(i+.5)*w,.32,y+4.45),f.R,w-.5,1.05,.16);
    quad(M.shopSigns,atR(f,i*w+.35,.42,y+4.02),f.R.clone().multiplyScalar(w-.7),V(0,.9,0),[u,v-.125,u+.5,v]);
    // Blade sign every few units, projecting from the first floor (both faces of the board carry the lettering).
    if(i%3===1&&h>9){const b=Math.floor(rnd()*BLADES.length),bu0=b/8,bu1=(b+1)/8,c=atR(f,i*w+.35,1.05,y+6.4),half=f.N.clone().multiplyScalar(.6),up=V(0,3,0),o=c.clone().sub(half).setY(y+4.9);
     quad(M.shopSigns,o,half.clone().multiplyScalar(2),up,[bu0,0,bu1,.375]);quad(M.shopSigns,o.clone().addScaledVector(f.N,1.2),half.clone().multiplyScalar(-2),up,[bu0,0,bu1,.375]);
     cuboid(M.metal,c,f.R,.06,3.1,1.25);}}}
  // Flats: balconies (slab, glass rail on three sides, handrail) and AC condensers on the other bays.
  const k0=shopH?Math.max(1,Math.ceil((shopH+.6)/K.floor)):1,balconyFace=K.balcony==='front'?f===front:K.balcony&&f.len>=12;
  const a0=Math.max(.4,lines[1]??0),spans=!balconyFace?[]:K.balcony==='pairs'?lines.slice(0,-1).map((t,i)=>i%3===1&&t+2*K.bay<=f.len?[t+.15,t+2*K.bay-.15]:null).filter(Boolean)
   :K.balcony==='strips'?[[a0,f.len/2-.6],[f.len/2+.6,f.len-a0]].filter(([a,b])=>b-a>2):[[.4,f.len-.4]];
  for(let k=k0;k<floors;k++){const fy=y+k*K.floor;
   for(const [a,b] of spans){const w=b-a,mid=(a+b)/2,dep=K.village?1.1:1.35;
    cuboid(M.ledge,at(f,mid,dep/2,fy-.09),f.T,w,.18,dep);
    // glass is double-sided, so each pane is a single quad
    quad(M.railGlass,at(f,a,dep-.03,fy+.02),f.T.clone().multiplyScalar(w),V(0,1,0));for(const e of [a+.02,b-.02])quad(M.railGlass,at(f,e,0,fy+.02),f.N.clone().multiplyScalar(dep-.03),V(0,1,0));
    cuboid(M.metal,at(f,mid,dep-.03,fy+1.06),f.T,w+.04,.05,.07);}
   if(K.ac)for(let i=0;i+1<lines.length;i++){if(rnd()>K.ac)continue;const t=(lines[i]+lines[i+1])/2+(rnd()-.5)*K.bay*.3;if(t<.8||t>f.len-.8||spans.some(([a,b])=>t>a-.6&&t<b+.6))continue;
    const c=at(f,t,.28,fy+.42);cuboid(M.acBody,c,f.T,.86,.56,.52);
    quad(M.acFace,c.clone().addScaledVector(f.N,.265).addScaledVector(f.R,-.43).setY(fy+.14),f.R.clone().multiplyScalar(.86),V(0,.56,0));
    cuboid(M.metal,at(f,t,.2,fy+.11),f.T,.7,.04,.4);}}
  // Drain stacks beside the second and second-last bay lines, from the shop canopy (or ground) to the parapet.
  if(K.pipes&&f.len>=10)for(const t of [lines[1],lines[lines.length-2]])if(t>1&&t<f.len-1){const y0=y+(shopH?4.6:.1),y1=y+h+.4;cuboid(M.pipe,at(f,t+.45,.16,(y0+y1)/2),f.T,.14,y1-y0,.14);
   for(let yy=y0+3;yy<y1;yy+=3)cuboid(M.metal,at(f,t+.45,.12,yy),f.T,.2,.05,.08);}
  // Window sills under each drawn window; podium bays whose glazing is replaced by plant-room louvres; village window grilles.
  if(K.sill)for(let k=shopH?1:0;k<floors;k++){const fy=y+k*K.floor;for(let i=0;i+1<lines.length;i++){const t=(lines[i]+lines[i+1])/2,[sh,sw]=K.sill;if(t<sw/2||t>f.len-sw/2)continue;
    cuboid(M.ledge,at(f,t,.1,fy+sh-.05),f.T,sw+.2,.1,.22);
    const winH=K.floor-2*sh,o=at(f,t,.035,fy+sh).addScaledVector(f.R,-sw/2);
    if(K.vents&&k>0&&rnd()<K.vents)quad(M.louvre,o,f.R.clone().multiplyScalar(sw),V(0,winH,0),[0,0,sw/1.5,winH/1.5]);
    else if(K.grilles&&f!==front)quad(M.grille,o.addScaledVector(f.N,.05),f.R.clone().multiplyScalar(sw),V(0,winH,0),[0,0,sw/1.4,winH/1.4]);}}
  // Estate name board across the top of the podium face that looks at the route.
  if(K.estate&&f===front&&f.len>12&&rnd()<.7){const bw=Math.min(14,f.len*.55),bh=bw/8,slot=(opts.lot??Math.floor(rnd()*99))%ESTATES.length,cy=y+h-.35-bh/2;// one estate name per lot
   cuboid(M.metal,atR(f,f.len/2,.3,cy),f.R,bw+.4,bh+.3,.2);quad(M.estateSigns,atR(f,(f.len-bw)/2,.42,cy-bh/2),f.R.clone().multiplyScalar(bw),V(0,bh,0),[0,1-(slot+1)/4,1,1-slot/4]);}
  // Entrance: deep canopy on two columns at the face that looks at the route.
  if(K.entrance&&f===front&&f.len>14){const w=Math.min(14,f.len*.5);cuboid(M.canopy,at(f,f.len/2,2.2,y+4.3),f.T,w,.4,4.4);for(const s of [-1,1])cuboid(M.metal,at(f,f.len/2+s*(w/2-.6),4,y+2.05),f.T,.3,4.1,.3);}
 }
 // Roof: lift machine room, water tanks, plant and masts (village houses: stair hut and one tank).
 if(!K.shop){const top=y+h,c=Math.cos(r.angle),s=Math.sin(r.angle),P=(u,v,yy)=>V(r.x+u*c+v*s,yy,r.z-u*s+v*c),X=V(c,0,-s);
  if(K.village){cuboid(M.ledge,P(-r.w*.25,-r.d*.2,top+1.3),X,3,2.6,3.2);drum(M.tank,P(r.w*.25,r.d*.2,top),.7,1.3,8);}
  else if(Math.min(r.w,r.d)>10){cuboid(M.ledge,P(-r.w*.18,0,top+1.7),X,Math.min(7,r.w*.3),3.4,Math.min(5,r.d*.3));
   for(const k of [-1,1])drum(M.tank,P(r.w*.2,k*r.d*.18,top+.4),1.1,2.2);cuboid(M.ledge,P(r.w*.2,0,top+.2),X,2.2,.4,r.d*.5);
   for(let i=0;i<3;i++)cuboid(M.plant,P((rnd()-.2)*r.w*.5,(rnd()-.5)*r.d*.6,top+.7),X,1.5+rnd()*2.5,1.4,1.2+rnd()*2);
   if(h>30)for(const k of [-1,1])cuboid(M.metal,P(-r.w*.18+k*2,0,top+3.4+3),X,.12,6,.12);
   // Satellite dishes on stub posts along the parapet, tilted up towards the southern sky.
   if(K.dishes)for(let i=0;i<3;i++){const p=P((rnd()-.5)*r.w*.7,(rnd()<.5?-1:1)*(r.d/2-1.2),top),aim=V(.25,.6,-1).normalize(),Xd=aim.clone().cross(UP).normalize(),Yd=Xd.clone().cross(aim);
    cuboid(M.metal,p.clone().setY(top+.6),X,.08,1.2,.08);disc(M.dish,p.clone().setY(top+1.3),Xd,Yd,.45+rnd()*.25);}}}
 flush(out);}
