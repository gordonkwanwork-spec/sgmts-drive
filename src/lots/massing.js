// OZP lot → 3D. A lot shows either a procedural placeholder ("massing", sized from the OZP Notes plot
// ratio and the plan's height limit) or a GLB from public/lots/models. Shared by the game and the editor.
import * as T from 'three';
import {mergeGeometries} from 'three/addons/utils/BufferGeometryUtils.js';
import {GLTFLoader} from 'three/addons/loaders/GLTFLoader.js';
import {DATUM} from '../alignment.js';
import {polygonArea,pointInPolygon} from './wand.js';

// Plot ratios from S/HSK/2A Notes (Annex III). null = no PR control (height/storeys only).
const PR={'C(1)':9.5,'C(2)':8,'C(3)':5,'C(4)':3,'C(5)':1.5,'R(A)1':6.5,'R(A)2':6,'R(A)3':5.5,'R(A)4':5,'R(A)5':3.8,'R(A)6':6.2,
 'R(B)1':3.5,'R(B)2':2.5,'R(B)3':1.26,'R(C)':.4,'I':3,'OU(Mixed Use)':7,'OU(Enterprise and Technology Park)':5,'OU(Logistics Facility)':5,'OU(Industry Park)':7,'OU(Port Back-up)':3};
export const ZONES=['R(A)1','R(A)2','R(A)3','R(A)4','R(A)5','R(A)6','R(B)1','R(B)2','R(B)3','R(C)','C(1)','C(2)','C(3)','C(4)','C(5)',
 'OU(Mixed Use)','G/IC','G/IC(1)','OU(Logistics Facility)','OU(Industry Park)','OU(Port Back-up)','OU(Enterprise and Technology Park)','I',
 'O','O(1)','GB','V','V(1)','OU(Sewage Treatment Works)','OU(District Cooling System)','OU(SGMTS depot)','OU'];
export function useOf(zone=''){
 if(zone.startsWith('R('))return 'residential';if(zone.startsWith('C('))return 'commercial';if(zone==='OU(Mixed Use)')return 'mixed';
 if(zone.startsWith('G/IC'))return 'gic';if(/Logistics|Port Back-up/.test(zone))return 'logistics';if(/Enterprise|Industry Park/.test(zone)||zone==='I')return 'enterprise';
 if(zone.startsWith('O(')||zone==='O')return 'open';if(zone==='GB')return 'green';if(zone.startsWith('V'))return 'village';if(/SGMTS/.test(zone))return 'transport';return zone?'utility':'unzoned';
}
export const plotRatio=zone=>PR[zone]??null;
export const USE_COLOURS={residential:0xe7a33e,commercial:0xd2463c,mixed:0xc76b9a,gic:0x4f8fd6,logistics:0x8a6bd1,enterprise:0x6c5bc7,open:0x57a55a,green:0x2f7d45,village:0xb5905e,utility:0x8d9aa3,transport:0xeb8a2f,unzoned:0x9a9a9a};
// Default model per use: the user's focus uses get placeholders; stations/depot/villages/utilities stay as the game draws them.
export const defaultModel=zone=>['residential','commercial','mixed','gic','logistics','enterprise','open','green'].includes(useOf(zone))?{type:'massing'}:{type:'none'};

// ---------- facade textures (reference renders: white/grey towers with blue glazing, grid-frame retail podiums, green roofs) ----------
function facade(draw,lit){const make=night=>{const c=document.createElement('canvas');c.width=c.height=256;const g=c.getContext('2d');draw(g,night);const t=new T.CanvasTexture(c);t.wrapS=t.wrapT=T.RepeatWrapping;t.colorSpace=T.SRGBColorSpace;t.anisotropy=4;return t;};
 const m=new T.MeshStandardMaterial({map:make(false),emissiveMap:lit?make(true):null,roughness:.55,metalness:.08});m.emissive.set(0);return m;}
function windows(g,night,cols,rows,{wall,glass,frame=0,mullion=null,litColour='#ffd79a',litShare=.45}){
 const w=256/cols,h=256/rows;g.fillStyle=night?'#000':wall;g.fillRect(0,0,256,256);let seed=cols*31+rows;const rnd=()=>(seed=(seed*16807)%2147483647)/2147483647;
 for(let r=0;r<rows;r++)for(let c=0;c<cols;c++){const x=c*w+frame,y=r*h+frame,ww=w-2*frame,hh=h-2*frame;
  if(night){if(rnd()<litShare){g.fillStyle=litColour;g.fillRect(x,y,ww,hh);}continue;}
  g.fillStyle=glass;g.fillRect(x,y,ww,hh);g.fillStyle='rgba(255,255,255,.18)';g.fillRect(x,y,ww,hh*.3);if(mullion){g.fillStyle=mullion;g.fillRect(x+ww/2-1,y,2,hh);}}
}
let MATS;
export function lotMaterials(){return MATS||(MATS={
 // Tile sizes (metres) keep storeys at believable heights on every face.
 tower:Object.assign(facade((g,n)=>{windows(g,n,4,8,{wall:'#e9ecee',glass:'#6f93b3',frame:6,mullion:'#dfe5ea'});if(!n){g.fillStyle='#cfd6dc';for(let x=0;x<256;x+=64)g.fillRect(x,0,5,256);}},true),{userData:{tile:[12,25.2]}}),
 towerAlt:Object.assign(facade((g,n)=>{windows(g,n,6,8,{wall:'#d9dfe2',glass:'#4f7fa6',frame:4});if(!n){g.fillStyle='#7ea88f';g.fillRect(0,0,8,256);}},true),{userData:{tile:[15,25.2]}}),
 office:Object.assign(facade((g,n)=>windows(g,n,8,6,{wall:'#9fb7cc',glass:'#3f6f99',frame:1.5,litColour:'#e8f2ff',litShare:.6}),true),{userData:{tile:[12,24]}}),
 podium:Object.assign(facade((g,n)=>{windows(g,n,2,2,{wall:'#eceeee',glass:'#b98a55',frame:14,litColour:'#ffcf8a',litShare:.9});},true),{userData:{tile:[16,10]}}),
 campus:Object.assign(facade((g,n)=>{windows(g,n,1,4,{wall:'#f1f3f2',glass:'#5aa0a8',frame:0,litShare:.35});if(!n){g.fillStyle='#f1f3f2';for(let y=0;y<256;y+=64)g.fillRect(0,y,256,30);}},true),{userData:{tile:[20,18]}}),
 civic:Object.assign(facade((g,n)=>windows(g,n,3,3,{wall:'#f3f1ec',glass:'#789aab',frame:12,litShare:.5}),true),{userData:{tile:[12,13.5]}}),
 house:Object.assign(facade((g,n)=>windows(g,n,2,3,{wall:'#efe4cf',glass:'#6d7f8a',frame:20,litShare:.4}),true),{userData:{tile:[8,8.2]}}),
// Logistics render: white/charcoal bands per floor with coloured diagonal accents, one colour per cluster zone.
 ...Object.fromEntries(Object.entries({A:'#2f7fd0',B:'#6cc24a',C:'#e3a52c',E:'#3aa3a8'}).map(([k,accent])=>['logistics'+k,Object.assign(facade((g,n)=>{
  g.fillStyle=n?'#000':'#eef0ef';g.fillRect(0,0,256,256);
  for(let f=0;f<2;f++){const y=f*128;g.fillStyle=n?'#000':'#3d434a';g.fillRect(0,y,256,46);g.fillStyle=n?'#ffe6bf':'#9fb3c0';g.fillRect(0,y+50,256,5);
   if(!n){g.fillStyle=accent;for(let x=(f*97)%256-40;x<256;x+=150){g.beginPath();g.moveTo(x,y+60);g.lineTo(x+34,y+60);g.lineTo(x+14,y+124);g.lineTo(x-20,y+124);g.fill();}}}
 },true),{userData:{tile:[40,13]}})])),
 ramp:Object.assign(facade((g,n)=>{g.fillStyle=n?'#000':'#2d3136';g.fillRect(0,0,256,256);for(let y=0;y<256;y+=128){g.fillStyle=n?'#fff0d0':'#f4f5f4';g.fillRect(0,y+70,256,58);if(!n){g.fillStyle='#c9ced1';g.fillRect(0,y+122,256,6);}}},true),{userData:{tile:[18,13]}}),
 dronePad:new T.MeshStandardMaterial({map:(()=>{const c=document.createElement('canvas');c.width=c.height=256;const g=c.getContext('2d');g.fillStyle='#39414a';g.fillRect(0,0,256,256);g.strokeStyle='#f2c230';g.lineWidth=14;g.beginPath();g.arc(128,128,104,0,Math.PI*2);g.stroke();g.fillStyle='#fff';g.font='bold 150px sans-serif';g.textAlign='center';g.textBaseline='middle';g.fillText('H',128,136);const t=new T.CanvasTexture(c);t.colorSpace=T.SRGBColorSpace;return t;})(),roughness:.8,polygonOffset:true,polygonOffsetFactor:-2}),
 roofDeck:new T.MeshStandardMaterial({color:0xc9cdcf,roughness:.85}),
 greenRoof:new T.MeshStandardMaterial({color:0x6f9a4a,roughness:.95}),
 roof:new T.MeshStandardMaterial({color:0xb9bec0,roughness:.9}),
 trunk:new T.MeshStandardMaterial({color:0x5e4632,roughness:.95}),
 crown:new T.MeshStandardMaterial({color:0x4f7f3a,roughness:.9}),
 lawn:new T.MeshStandardMaterial({color:0x7ea650,roughness:1}),
});}

// Prism with metric UVs on the walls (so facade tiles keep storey height) and a separate flat roof face.
function prism(ring,y,h,tile){
 const wall=[],uv=[],idx=[];let u0=0;
 const sink=4;// walls run below grade so sloping ground never shows a gap under a building
 for(let i=0;i<ring.length;i++){const a=ring[i],b=ring[(i+1)%ring.length],len=Math.hypot(b[0]-a[0],b[1]-a[1]),n=wall.length/3;
  wall.push(a[0],y-sink,a[1],b[0],y-sink,b[1],b[0],y+h,b[1],a[0],y+h,a[1]);uv.push(u0/tile[0],-sink/tile[1],(u0+len)/tile[0],-sink/tile[1],(u0+len)/tile[0],h/tile[1],u0/tile[0],h/tile[1]);u0+=len;
  idx.push(n,n+2,n+1,n,n+3,n+2);}
 const walls=new T.BufferGeometry();walls.setAttribute('position',new T.Float32BufferAttribute(wall,3));walls.setAttribute('uv',new T.Float32BufferAttribute(uv,2));walls.setIndex(idx);walls.computeVertexNormals();
 return {walls,top:flat(ring,y+h)};
}
// Horizontal face (roofs, decals) over a ring, facing up.
function flat(ring,y,uvScale=.1){const g=new T.BufferGeometry(),tris=T.ShapeUtils.triangulateShape(ring.map(([x,z])=>new T.Vector2(x,z)),[]);
 g.setAttribute('position',new T.Float32BufferAttribute(ring.flatMap(([x,z])=>[x,y,z]),3));g.setAttribute('uv',new T.Float32BufferAttribute(ring.flatMap(([x,z])=>[x*uvScale,z*uvScale]),2));
 // Each triangle faces up (+y normal) whatever the ring's winding: y of (b−a)×(c−a) = dz1·dx2 − dx1·dz2.
 g.setIndex(tris.flatMap(([i,j,k])=>{const [a,b,c]=[ring[i],ring[j],ring[k]];return (b[1]-a[1])*(c[0]-a[0])-(b[0]-a[0])*(c[1]-a[1])>0?[i,j,k]:[i,k,j];}));g.computeVertexNormals();return g;}
const rect=(cx,cz,w,d,angle)=>{const c=Math.cos(angle),s=Math.sin(angle);return [[-w/2,-d/2],[w/2,-d/2],[w/2,d/2],[-w/2,d/2]].map(([u,v])=>[cx+u*c+v*s,cz-u*s+v*c]);};
function roundedRect(cx,cz,w,d,angle,r,seg=5){const c=Math.cos(angle),s=Math.sin(angle),out=[];r=Math.min(r,w/2-.1,d/2-.1);
 for(const [ux,vz,a0] of [[w/2-r,d/2-r,0],[-w/2+r,d/2-r,Math.PI/2],[-w/2+r,-d/2+r,Math.PI],[w/2-r,-d/2+r,1.5*Math.PI]])for(let i=0;i<=seg;i++){const a=a0+i/seg*Math.PI/2,u=ux+r*Math.cos(a),v=vz+r*Math.sin(a);out.push([cx+u*c+v*s,cz-u*s+v*c]);}
 return out;}
const box=(cx,cy,cz,w,h,d,angle,tile)=>prism(rect(cx,cz,w,d,angle),cy,h,tile);

// Principal axis of the lot = direction of its longest edge.
function lotFrame(poly){let best=0,angle=0;for(let i=0;i<poly.length;i++){const [x1,z1]=poly[i],[x2,z2]=poly[(i+1)%poly.length],l=Math.hypot(x2-x1,z2-z1);if(l>best){best=l;angle=Math.atan2(-(z2-z1),x2-x1);}}return angle;}
function edgeDistance([x,z],poly){let d=Infinity;for(let i=0;i<poly.length;i++){const [ax,az]=poly[i],[bx,bz]=poly[(i+1)%poly.length],dx=bx-ax,dz=bz-az,t=Math.max(0,Math.min(1,((x-ax)*dx+(z-az)*dz)/(dx*dx+dz*dz||1)));d=Math.min(d,Math.hypot(x-ax-t*dx,z-az-t*dz));}return d;}
export function centroid(poly){let x=0,z=0;for(const p of poly){x+=p[0];z+=p[1];}return [x/poly.length,z/poly.length];}

// Footprint slots: a rotated grid of w×d rectangles fully inside the lot (with setback) and clear of game scenery.
function slots(lot,w,d,gap,setback,ctx,limit=Infinity){
 const angle=lotFrame(lot.poly),c=Math.cos(angle),s=Math.sin(angle),[ox,oz]=centroid(lot.poly),out=[];
 const local=lot.poly.map(([x,z])=>[(x-ox)*c-(z-oz)*s,(x-ox)*s+(z-oz)*c]),us=local.map(p=>p[0]),vs=local.map(p=>p[1]);
 const r=Math.hypot(w,d)/2;
 for(let u=Math.min(...us)+setback+w/2;u<=Math.max(...us)-setback-w/2;u+=w+gap)for(let v=Math.min(...vs)+setback+d/2;v<=Math.max(...vs)-setback-d/2;v+=d+gap){
  const x=ox+u*c+v*s,z=oz-u*s+v*c,corners=[[-1,-1],[1,-1],[1,1],[-1,1]].map(([a,b])=>[x+(a*w/2)*c+(b*d/2)*s,z-(a*w/2)*s+(b*d/2)*c]);
  if(!corners.every(p=>pointInPolygon(p,lot.poly)&&edgeDistance(p,lot.poly)>=setback*.5)||!pointInPolygon([x,z],lot.poly))continue;
  out.push({x,z,angle});}
 // With a limit (planting), test scattered candidates only until enough pass: spreads trees and skips most clearance checks.
 if(limit<out.length)for(let i=out.length-1;i>0;i--){const j=Math.floor(rnd()*(i+1));[out[i],out[j]]=[out[j],out[i]];}
 const ok=[];for(const p of out){if(ok.length>=limit)break;if(!ctx.allowed||ctx.allowed(p.x,p.z,r))ok.push(p);}
 return ok;
}

// Cluster zones (HSK Logistics Cluster study, Figure 3). buildings: max per lot; maxFloors at 6.5 m/floor.
const CLUSTER={A:{buildings:2,maxFloors:7},B:{buildings:3,maxFloors:8},C:{buildings:2,maxFloors:5,dronePads:true},E:{buildings:2,maxFloors:7}};
// Largest free rectangles on an 8 m grid in the lot frame (maximal-rectangle scan), 25 m apart for yards and ramps.
function bigFootprints(lot,ctx,count){
 const angle=lotFrame(lot.poly),c=Math.cos(angle),s=Math.sin(angle),[ox,oz]=centroid(lot.poly),cell=8,local=lot.poly.map(([x,z])=>[(x-ox)*c-(z-oz)*s,(x-ox)*s+(z-oz)*c]);
 const u0=Math.min(...local.map(p=>p[0])),v0=Math.min(...local.map(p=>p[1])),nu=Math.ceil((Math.max(...local.map(p=>p[0]))-u0)/cell),nv=Math.ceil((Math.max(...local.map(p=>p[1]))-v0)/cell);
 const world=(u,v)=>[ox+u*c+v*s,oz-u*s+v*c],free=[];
 for(let j=0;j<nv;j++){free.push([]);for(let i=0;i<nu;i++){const p=world(u0+(i+.5)*cell,v0+(j+.5)*cell);free[j].push(pointInPolygon(p,lot.poly)&&edgeDistance(p,lot.poly)>=10&&(!ctx.allowed||ctx.allowed(p[0],p[1],cell*.75)));}}
 const out=[];
 for(let n=0;n<count;n++){let best=null;const h=new Array(nu).fill(0);
  for(let j=0;j<nv;j++){for(let i=0;i<nu;i++)h[i]=free[j][i]?h[i]+1:0;
   const st=[];for(let i=0;i<=nu;i++){const hi=i<nu?h[i]:0;let start=i;while(st.length&&st.at(-1)[1]>=hi){const [k,hk]=st.pop();const w=Math.min(i-k,22),d=Math.min(hk,16);if(!best||w*d>best.a)best={a:w*d,i0:k,i1:k+w,j0:j-d+1,j1:j+1};start=k;}st.push([start,hi]);}}
  if(!best||best.a*cell*cell<2500)break;
  for(let j=Math.max(0,best.j0-3);j<Math.min(nv,best.j1+3);j++)for(let i=Math.max(0,best.i0-3);i<Math.min(nu,best.i1+3);i++)free[j][i]=false;
  const [x,z]=world(u0+(best.i0+best.i1)/2*cell,v0+(best.j0+best.j1)/2*cell);out.push({x,z,w:(best.i1-best.i0)*cell-4,d:(best.j1-best.j0)*cell-4,angle});}
 return out;}
// Planar 0–1 UVs over a flat decal's own bounds.
function planarUV(g){g.computeBoundingBox();const b=g.boundingBox,p=g.attributes.position,uv=[];for(let i=0;i<p.count;i++)uv.push((p.getX(i)-b.min.x)/(b.max.x-b.min.x||1),(p.getZ(i)-b.min.z)/(b.max.z-b.min.z||1));g.setAttribute('uv',new T.Float32BufferAttribute(uv,2));}

let seed=1;const rnd=()=>(seed=(seed*16807)%2147483647)/2147483647;
const hashSeed=id=>{let h=7;for(const ch of String(id))h=(h*31+ch.charCodeAt(0))%2147483647;return h||1;};

// Returns {parts:[{material,geometry}], trees:[{x,y,z,s}]}; geometry is in world space.
export function massingParts(lot,ctx){
 seed=hashSeed(lot.id);const use=lot.style||useOf(lot.zone),M=lotMaterials(),parts=[],trees=[],area=polygonArea(lot.poly),pr=plotRatio(lot.zone);
 const ground=(x,z)=>ctx.ground?ctx.ground(x,z):0,topY=lot.maxBH!=null?lot.maxBH-DATUM:null;
 const add=(mat,roofMat,b)=>{parts.push({material:mat,geometry:b.walls},{material:roofMat,geometry:b.top});};
 const block=(slot,w,d,h,mat,roofMat=M.greenRoof,base=null)=>{const y=base??ground(slot.x,slot.z);add(mat,roofMat,box(slot.x,y,slot.z,w,h,d,slot.angle,mat.userData.tile));return y+h;};
 const cap=(y,h)=>topY==null?h:Math.max(6,Math.min(h,topY-y));
 const plant=(spacing,limit)=>{for(const p of slots(lot,spacing*.5,spacing*.5,spacing*.5,3,{allowed:ctx.allowedLow||ctx.allowed},limit)){const j=spacing*.3;trees.push({x:p.x+(rnd()-.5)*j,z:p.z+(rnd()-.5)*j,y:ground(p.x,p.z),s:.8+rnd()*.6});}};
 if(use==='residential'||use==='mixed'){
  const podiumH=use==='mixed'?18:12,pod=slots(lot,26,26,0,8,ctx);let roof=0;
  for(const p of pod)roof=block(p,26,26,podiumH,M.podium);
  const storeys=lot.maxStoreys,plate=650,sites=slots(lot,24,26,26,14,ctx);
  const baseY=pod.length?roof:ground(...centroid(lot.poly));
  const towerH=cap(baseY,storeys?storeys*3.15:(topY??baseY+100)-baseY-2),floors=Math.max(1,towerH/3.15);
  const want=Math.max(1,Math.ceil((pr??5)*area*(use==='mixed'?.6:.9)/(plate*floors)));
  sites.slice(0,want).forEach((p,i)=>{const h=cap(baseY,towerH-(i%3)*6.3),mat=i%2?M.towerAlt:M.tower;block(p,24,26,h,mat,M.roof,pod.length?baseY:null);});
  plant(18,40);
 }else if(use==='commercial'){
  const pod=slots(lot,30,30,0,8,ctx);let roof=0;for(const p of pod)roof=block(p,30,30,20,M.podium);
  const baseY=pod.length?roof:ground(...centroid(lot.poly)),towerH=cap(baseY,(topY??baseY+120)-baseY-2),floors=towerH/4,want=Math.max(1,Math.ceil((pr??8)*area*.8/(1400*floors)));
  slots(lot,38,34,30,14,ctx).slice(0,want).forEach((p,i)=>block(p,38,34,cap(baseY,towerH-i*16),M.office,M.roof,pod.length?baseY:null));
  plant(18,30);
 }else if(use==='gic'){
  const h=Math.min(lot.maxStoreys?lot.maxStoreys*4.2:30,topY!=null?topY-ground(...centroid(lot.poly)):30);
  for(const p of slots(lot,24,24,0,7,ctx))block(p,24,24,Math.max(8,h),M.civic);plant(16,30);
 }else if(use==='logistics'){
  // HSK Logistics Cluster study: multi-storey, 6–7 m floors, spiral ramps; PR 5 / 110 mPD are ceilings, not targets.
  const zone=CLUSTER[lot.cluster]||CLUSTER.B,sites=bigFootprints(lot,ctx,zone.buildings);
  const cover=sites.reduce((a,r)=>a+r.w*r.d,0)||1,y0=ground(...centroid(lot.poly)),floors=Math.max(3,Math.min(zone.maxFloors,Math.ceil((pr??5)*area*.6/cover)));
  sites.forEach((r,i)=>{const y=ground(r.x,r.z),h=cap(y,floors*6.5+2),mat=M['logistics'+(lot.cluster in CLUSTER?lot.cluster:'B')];
   const ring=roundedRect(r.x,r.z,r.w,r.d,r.angle,Math.min(16,r.d*.22)),b=prism(ring,y,h,mat.userData.tile);parts.push({material:mat,geometry:b.walls},{material:M.greenRoof,geometry:b.top});
   parts.push({material:M.roofDeck,geometry:flat(roundedRect(r.x,r.z,r.w-12,r.d-12,r.angle,Math.min(10,r.d*.18)),y+h+.25)});
   const c=Math.cos(r.angle),s=Math.sin(r.angle),at=(u,v)=>[r.x+u*c+v*s,r.z-u*s+v*c];
   // Spiral vehicle ramp drum on one short end, as in the cluster render.
   const rr=Math.min(19,r.d*.36),end=(i%2?-1:1)*(r.w/2-rr*.55),[rx,rz]=at(end,0),drum=prism(roundedRect(rx,rz,rr*2,rr*2,0,rr,6),y,h+1.5,M.ramp.userData.tile);
   parts.push({material:M.ramp,geometry:drum.walls},{material:M.greenRoof,geometry:drum.top});
   for(let k=0;k<4;k++){const [px,pz]=at((rnd()-.5)*(r.w-40),(rnd()-.5)*(r.d-30));parts.push(...Object.entries(box(px,y+h+.25,pz,4+rnd()*6,2.2,3+rnd()*3,r.angle,[4,4])).map(([,g])=>({material:M.roof,geometry:g})));}
   if(zone.dronePads)for(const u of [-.25,.18]){const [px,pz]=at(u*r.w,0);parts.push({material:M.dronePad,geometry:flat(roundedRect(px,pz,15,15,r.angle,7.4,6),y+h+.32,.0)});}
  });
  if(zone.dronePads)parts.filter(p=>p.material===M.dronePad).forEach(p=>planarUV(p.geometry));
  plant(16,90);
 }else if(use==='enterprise'){
  const sites=slots(lot,32,32,16,10,ctx),cover=sites.length*32*32||1,floors=Math.ceil((pr??5)*area*.75/cover),y=ground(...centroid(lot.poly));
  for(const p of sites)block(p,32,32,cap(y,floors*4.5),M.campus);plant(20,40);
 }else if(use==='village'){
  for(const p of slots(lot,11,11,6,4,ctx))if(rnd()<.8)block(p,11,11,8.2,M.house,M.roof);
 }else if(use==='open')plant(14,220);
 else if(use==='green')plant(12,320);
 else if(use==='utility'){for(const p of slots(lot,30,30,4,8,ctx))block(p,30,30,Math.min(12,topY??12),M.civic,M.roof);}
 return {parts,trees};
}

const TREE={trunk:new T.CylinderGeometry(.25,.35,3,6).translate(0,1.5,0),crown:new T.IcosahedronGeometry(2.6,1).scale(1,.85,1).translate(0,4.6,0)};
function treeMeshes(trees){if(!trees.length)return [];const M=lotMaterials(),out=[];
 for(const [geo,mat] of [[TREE.trunk,M.trunk],[TREE.crown,M.crown]]){const mesh=new T.InstancedMesh(geo,mat,trees.length),m=new T.Matrix4();
  trees.forEach((t,i)=>mesh.setMatrixAt(i,m.compose(new T.Vector3(t.x,t.y,t.z),new T.Quaternion(),new T.Vector3(t.s,t.s,t.s))));mesh.name='lot vegetation';mesh.castShadow=true;mesh.receiveShadow=true;out.push(mesh);}
 return out;}

function mergeByMaterial(parts){const by=new Map();for(const p of parts){if(!by.has(p.material))by.set(p.material,[]);by.get(p.material).push(p.geometry);}
 return [...by].map(([mat,geos])=>{const mesh=new T.Mesh(mergeGeometries(geos),mat);geos.forEach(g=>g.dispose());mesh.castShadow=mesh.receiveShadow=true;return mesh;});}

const loader=new GLTFLoader(),glbCache=new Map();
export function loadModel(url){if(!glbCache.has(url))glbCache.set(url,loader.loadAsync(url).then(g=>g.scene));return glbCache.get(url).then(s=>s.clone(true));}
// A GLB is authored in metres, Y up, origin at the ground-floor centre; placed at the lot centroid plus offset.
export async function placeModel(lot,url,ctx){const m=lot.model,root=await loadModel(url),[cx,cz]=centroid(lot.poly),x=cx+(m.offset?.[0]||0),z=cz+(m.offset?.[1]||0);
 root.position.set(x,ctx.ground?ctx.ground(x,z):0,z);root.rotation.y=(m.rotation||0)*Math.PI/180;root.scale.setScalar(m.scale||1);
 root.traverse(n=>{if(n.isMesh){n.castShadow=n.receiveShadow=true;}});return root;}

// Object3D.add() with no arguments logs an error, and a lot can legitimately produce nothing.
const addAll=(g,list)=>{if(list.length)g.add(...list);};

// One lot → Group (editor; per-lot selection). ctx: {allowed(x,z,r), allowedLow, ground(x,z), modelUrl(src)}
export async function buildLot(lot,ctx){const g=new T.Group();g.name='lot:'+lot.id;g.userData.lotId=lot.id;
 if(lot.model?.type==='massing'){const {parts,trees}=massingParts(lot,ctx);addAll(g,[...mergeByMaterial(parts),...treeMeshes(trees)]);}
 else if(lot.model?.type==='glb'&&lot.model.src)g.add(await placeModel(lot,ctx.modelUrl(lot.model.src),ctx).catch(e=>{console.warn('Lot model failed',lot.model.src,e);return new T.Group();}));
 return g;}

// Game: lots merged by material within 400 m cells, so draw calls stay low while frustum culling and
// the collision grid (src/collision.js) still get compact bounds. Everything is static.
export async function buildLots(lots,ctx){const g=new T.Group();g.name='OZP lots';const cells=new Map(),trees=[];
 for(const lot of lots){if(lot.model?.type==='massing'){const r=massingParts(lot,ctx),[x,z]=centroid(lot.poly),k=Math.floor(x/400)+':'+Math.floor(z/400);
   if(!cells.has(k))cells.set(k,[]);cells.get(k).push(...r.parts);trees.push(...r.trees);}
  else if(lot.model?.type==='glb'&&lot.model.src)g.add(await buildLot(lot,ctx));}
 for(const parts of cells.values())addAll(g,mergeByMaterial(parts));addAll(g,treeMeshes(trees));
 g.updateMatrixWorld(true);g.traverse(n=>n.matrixAutoUpdate=false);return g;}

// Lit-window materials for the game's night switch.
export const nightMaterials=()=>Object.values(lotMaterials()).filter(m=>m.emissiveMap);
export const occupiedBy=lots=>{const placed=lots.filter(l=>l.model&&l.model.type!=='none');return (x,z)=>placed.some(l=>pointInPolygon([x,z],l.poly));};
