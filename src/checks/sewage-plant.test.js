// San Wai STW (41A north) + HSKEPP (41A south & 41C): bespoke 3D complex replacing generic godown plots.
import assert from 'node:assert/strict';
import fs from 'node:fs';
import * as T from 'three';

const ctx2d=new Proxy({},{get:(_,k)=>k==='measureText'?()=>({width:0}):k==='createLinearGradient'?()=>({addColorStop(){}}):()=>{},set:()=>true});
globalThis.document??={createElement:()=>({getContext:()=>ctx2d,width:0,height:0})};

const {cityPlots}=await import('../city/plots-headless.js');
const {renderedGround}=await import('../environment.js');
const {junctions,networkMask}=await import('../street/network.js');
const {pointInPolygon}=await import('../lots/wand.js');
const {CV_ROAD,CV_ROAD_WIDTH,SITE:DEPOT_SITE}=await import('../depot.js');
const {STW_BUILDINGS,STW_TANKS,STW_YARDS,UTILITY_BRIDGE,buildSewagePlants,inSewagePlant}=await import('../sewage-plant.js');

const network=JSON.parse(fs.readFileSync(new URL('../../public/street/furniture.json',import.meta.url))).network;
const lots=JSON.parse(fs.readFileSync(new URL('../../public/lots/lots.json',import.meta.url))).lots;
const l41a=lots.find(l=>l.id==='41A-21').poly;
const l41c=lots.find(l=>l.id==='41C-28').poly;

// 1. cityPlots places 0 generic godown plots in 41A-21 and 41C-28.
const plots=cityPlots(network,lots);
assert.equal(plots.filter(p=>p.lot==='41A-21'||p.lot==='41C-28').length,0,'no generic plots inside 41A-21 or 41C-28');

// 2. Every building and tank footprint lies strictly inside its parent OZP parcel (41A-21 or 41C-28) and within 50 mPD (~31.5 m above formation).
assert.equal(STW_BUILDINGS.length,20);
assert.equal(STW_TANKS.length,8);
for(const b of STW_BUILDINGS){
 const lot=b.site.startsWith('41A')?l41a:l41c;
 assert.ok(b.h<=31.5,`${b.id} height ${b.h} exceeds OZP 50 mPD envelope`);
 for(const p of b.poly)assert.ok(pointInPolygon(p,lot),`${b.id} corner [${p[0].toFixed(1)},${p[1].toFixed(1)}] outside ${b.site}`);
 // Verify Three.js rotateY(-deg) corner alignment matches b.poly within 0.1 m.
 const box=new T.BoxGeometry(b.w,1,b.d).rotateY(-b.deg*Math.PI/180).translate(b.cx,0,b.cz);
 const pos=box.attributes.position,corners=b.poly.map(q=>({q,best:Infinity}));
 for(let i=0;i<pos.count;i++)for(const c of corners)c.best=Math.min(c.best,Math.hypot(pos.getX(i)-c.q[0],pos.getZ(i)-c.q[1]));
 for(const c of corners)assert.ok(c.best<.1,`${b.id} Three.js rotated corner deviates ${c.best.toFixed(3)} m from poly`);
 box.dispose();
}

function tankRing(t,n=16){return Array.from({length:n},(_,i)=>{const a=i/n*2*Math.PI;return [t.cx+Math.cos(a)*t.r,t.cz+Math.sin(a)*t.r];});}
for(const t of STW_TANKS){
 assert.ok(t.h<=31.5,`${t.id} height ${t.h} exceeds OZP cap`);
 for(const p of tankRing(t))assert.ok(pointInPolygon(p,l41c),`${t.id} perimeter [${p[0].toFixed(1)},${p[1].toFixed(1)}] outside 41C-28`);
}

// 3. Zero pairwise overlap (SAT test) among all 20 buildings and 8 tanks.
function overlapSAT(A,B,pad=0){
 for(const poly of [A,B])for(let i=0;i<poly.length;i++){
  const p1=poly[i],p2=poly[(i+1)%poly.length],nx=-(p2[1]-p1[1]),ny=p2[0]-p1[0],L=Math.hypot(nx,ny)||1,ux=nx/L,uy=ny/L;
  const pA=A.map(p=>p[0]*ux+p[1]*uy),pB=B.map(p=>p[0]*ux+p[1]*uy);
  if(Math.max(...pA)<=Math.min(...pB)-pad||Math.max(...pB)<=Math.min(...pA)-pad)return false;
 }
 return true;
}
const solids=[...STW_BUILDINGS.map(b=>({id:b.id,poly:b.poly})),...STW_TANKS.map(t=>({id:t.id,poly:tankRing(t,12)}))];
for(let i=0;i<solids.length;i++)for(let j=i+1;j<solids.length;j++){
 assert.ok(!overlapSAT(solids[i].poly,solids[j].poly,-0.15),`${solids[i].id} overlaps ${solids[j].id}`);
}

// 4. Clearances from Road D5, Road D8, Depot CV_ROAD and DEPOT_SITE.
const roads=junctions(network,renderedGround).roads;
const d5=roads.find(o=>o.r.id==='city-d5-west'),d8=roads.find(o=>o.r.id==='city-d8-west');
const minSegDist=(p,pts)=>Math.min(...pts.slice(1).map((b,i)=>{const a=pts[i],dx=b[0]-a[0],dz=b[1]-a[1],t=Math.max(0,Math.min(1,((p[0]-a[0])*dx+(p[1]-a[1])*dz)/(dx*dx+dz*dz||1)));return Math.hypot(p[0]-a[0]-t*dx,p[1]-a[1]-t*dz);}));
const d5Pts=d5.F.map(f=>[f.x,f.z]),d8Pts=d8.F.map(f=>[f.x,f.z]),cvPts=CV_ROAD.map(p=>[p.x,p.z]);
const d5hw=d5.P.carriageway/2+d5.P.footpath,d8hw=d8.P.carriageway/2+d8.P.footpath;
for(const s of solids){
 for(const p of s.poly){
  assert.ok(minSegDist(p,d5Pts)>=d5hw+2,`${s.id} too close to Road D5`);
  assert.ok(minSegDist(p,d8Pts)>=d8hw+2,`${s.id} too close to Road D8`);
  assert.ok(minSegDist(p,cvPts)>=CV_ROAD_WIDTH/2+4,`${s.id} too close to Depot CV_ROAD`);
  assert.ok(!pointInPolygon(p,DEPOT_SITE),`${s.id} enters DEPOT_SITE`);
 }
}
for(const ep of [UTILITY_BRIDGE.start,UTILITY_BRIDGE.end]){
 assert.ok(minSegDist(ep,d5Pts)>=d5hw+4,'Utility bridge abutment clears Road D5');
 assert.ok(minSegDist(ep,cvPts)>=CV_ROAD_WIDTH/2+4,'Utility bridge abutment clears Depot CV_ROAD');
 assert.ok(!pointInPolygon(ep,DEPOT_SITE),'Utility bridge abutment clears DEPOT_SITE');
}
for(const y of STW_YARDS){
 const lot=y.lotId==='41A-21'?l41a:l41c;
 for(const p of y.poly)assert.ok(pointInPolygon(p,lot),`${y.id} yard vertex outside ${y.lotId}`);
}
assert.ok(inSewagePlant(-488,-2540)&&inSewagePlant(-254,-2378)&&!inSewagePlant(-280,-2640));

// 5. Scene build + Road D5 bridge vertical clearance >= 6.0 m + <= 25 meshes + matrixAutoUpdate=false.
const scene=new T.Scene(),net=networkMask(network,renderedGround,roads),nightMaterials=[];
const mats={concrete:new T.MeshStandardMaterial(),galvanised:new T.MeshStandardMaterial(),metal:new T.MeshStandardMaterial()};
const res=buildSewagePlants(scene,{ground:renderedGround,mats,nightMaterials,net});

let roadMaxY=-Infinity;
for(let i=0;i<=20;i++){
 const t=i/20,x=UTILITY_BRIDGE.start[0]+(UTILITY_BRIDGE.end[0]-UTILITY_BRIDGE.start[0])*t,z=UTILITY_BRIDGE.start[1]+(UTILITY_BRIDGE.end[1]-UTILITY_BRIDGE.start[1])*t;
 if(minSegDist([x,z],d5Pts)<=d5hw+1)roadMaxY=Math.max(roadMaxY,renderedGround(x,z));
}
assert.ok(roadMaxY>-Infinity,'Utility bridge crosses Road D5');
assert.ok(res.bridgeDeckY-roadMaxY>=6.0,`Utility bridge clearance ${(res.bridgeDeckY-roadMaxY).toFixed(2)} m < 6.0 m`);

let meshes=0;
res.group.traverse(n=>{
 if(!n.isMesh)return;
 meshes++;
 assert.equal(n.matrixAutoUpdate,false,`${n.name} must be static (matrixAutoUpdate=false)`);
 const pos=n.geometry.attributes.position;
 assert.ok(pos&&pos.count>0,`${n.name} empty geometry`);
 for(let i=0;i<pos.array.length;i++)assert.ok(Number.isFinite(pos.array[i]),`${n.name} non-finite vertex`);
});
assert.ok(meshes>=10&&meshes<=25,`expected <= 25 batched/instanced meshes, got ${meshes}`);
assert.equal(nightMaterials.length,2,'two night-lit admin materials registered');
console.log(`Sewage plant checks passed: 0 generic plots in 41A/41C, 20 buildings + 8 tanks inside parcels with 0 overlaps, bridge clearance ${(res.bridgeDeckY-roadMaxY).toFixed(2)} m, ${meshes} static meshes.`);
