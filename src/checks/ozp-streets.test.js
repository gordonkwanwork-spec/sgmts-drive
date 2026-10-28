import assert from 'node:assert/strict';
import fs from 'node:fs';
import {centreline,frames,halfWidth,networkMask,buildNetwork,reserveClash,presetOf,junctions,streetHeight,streetLevel} from '../street/network.js';
import {polygonContains,circleIntersects} from '../lots/geometry.js';
import {cityDiagnostics} from '../city-plan.js';
import {JUNCTIONS,UNDERPASSES,BRIDGES} from '../alignment.js';
import crypto from 'node:crypto';
import {corridorReserve} from '../lots/wand.js';
const context2d=new Proxy({},{get:(_,k)=>k==='measureText'?()=>({width:0}):k==='createLinearGradient'?()=>({addColorStop(){}}):()=>{},set:()=>true});
globalThis.document={createElement:()=>({getContext:()=>context2d,width:0,height:0})};
const {massingParts}=await import('../lots/massing.js');
const data=JSON.parse(fs.readFileSync(new URL('../../public/street/furniture.json',import.meta.url))),lots=JSON.parse(fs.readFileSync(new URL('../../public/lots/lots.json',import.meta.url))).lots;
const network={...data.network,roads:data.network.roads.filter(r=>!r.id.startsWith('city-')).map(r=>({...r,standard:undefined}))},mask=networkMask(network),discs=corridorReserve();
assert.equal(network.roads.filter(r=>r.id.startsWith('ozp-')).length,5);assert.equal(network.roads.length,6);
assert.equal(data.items.length,753);assert.equal(data.runs.length,118);
assert.deepEqual(cityDiagnostics(lots,data),[]);
const baseline=JSON.parse(fs.readFileSync(new URL('../../scripts/corridor-junction-baseline.json',import.meta.url)));
assert.deepEqual(JUNCTIONS,baseline.shared);assert.deepEqual(UNDERPASSES,baseline.gradeSeparated);
assert.deepEqual(BRIDGES.map(b=>b.id),baseline.bridgeIds);
// Footpath profiles are deliberately updated; the engineering junction arrays above remain locked.
const graph=junctions(network),components=new Map(network.roads.map(r=>[r.id,new Set([r.id])]));
for(const {A,B} of graph.joins){const joined=new Set([...components.get(A.r.id),...components.get(B.r.id)]);for(const id of joined)components.set(id,joined);}
assert.equal(components.values().next().value.size,network.roads.length,'all six roads join into one neighbourhood network');
assert.equal(graph.joins.length,5,'five local street connections, outside corridor');
let length=0,samples=0;
for(const r of network.roads){
 assert.equal(reserveClash(centreline(r.pts),{width:halfWidth(r)}),null,`${r.id} keeps complete street off corridor reserve`);
 const F=frames(r);length+=F.at(-1).d;
 for(const f of F){assert(mask.onRoad(f.x,f.z));assert(mask.buildingBlocked(f.x,f.z,10));samples++;}
 if(r.turningRadius){const p=r.pts.at(-1),P=presetOf(r);assert.equal(reserveClash([p],{width:r.turningRadius+P.footpath}),null);
  for(let i=0;i<16;i++){const a=i*Math.PI/8,rad=r.turningRadius+P.footpath-1;assert(mask.onStreet(p[0]+Math.cos(a)*rad,p[1]+Math.sin(a)*rad));}
 }
}
const built=buildNetwork(network);const relevant=discs.filter(d=>d.z>-850&&d.z<50);let renderedVertices=0,renderedTriangles=0;assert(built.children.length>0);built.traverse(o=>{if(o.isMesh){const ix=o.geometry.index.array,p=o.geometry.attributes.position;for(let k=0;k<ix.length;k+=3){const poly=[ix[k],ix[k+1],ix[k+2]].map(i=>[p.getX(i),p.getZ(i)]),xs=poly.map(p=>p[0]),zs=poly.map(p=>p[1]),minX=Math.min(...xs),maxX=Math.max(...xs),minZ=Math.min(...zs),maxZ=Math.max(...zs);assert(!relevant.some(d=>d.x+d.r>=minX&&d.x-d.r<=maxX&&d.z+d.r>=minZ&&d.z-d.r<=maxZ&&circleIntersects(d.x,d.z,d.r,poly)),'full triangle/junction envelope stays outside corridor');renderedTriangles++;}const a=o.geometry.attributes.position.array;assert(a.every(Number.isFinite));for(let k=0;k<a.length;k+=3){assert(!relevant.some(d=>Math.hypot(a[k]-d.x,a[k+2]-d.z)<d.r),'complete rendered pavement/junction/head stays outside corridor');renderedVertices++;}}});
for(const r of network.roads){const f=frames(r)[Math.floor(frames(r).length*.45)],P=presetOf(r);assert(streetHeight(f.x,f.z)!==null,'carriageway physically walkable');const lat=P.carriageway/2+P.footpath*.65,y=streetHeight(f.x+f.lx*lat,f.z+f.lz*lat);assert(Math.abs(y-streetLevel(r,f.d,lat))<.002,'walkable pavement matches rendered height');}
for(const j of graph.joins)assert(streetHeight(j.at.x,j.at.z)!==null,'joined road mouth is walkable');
assert.equal(streetHeight(10000,10000),null);
const {renderedGround}=await import('../environment.js'),{groundAt,walkStep}=await import('../onfoot.js');
buildNetwork(network,{ground:renderedGround});let walkingSteps=0;
for(const r of network.roads){const F=frames(r,renderedGround),P=presetOf(r),lat=P.carriageway/2+P.footpath*.5;
 const points=F.map(f=>[f.x+f.lx*lat,f.z+f.lz*lat]);let p={x:points[0][0],z:points[0][1],...groundAt(...points[0])};
 for(const [x,z] of points.slice(1)){const next=walkStep(p,x-p.x,z-p.z,[]);assert(!next.blocked,`${r.id} walk continuity at ${x},${z}`);assert(Number.isFinite(next.y));p=next;walkingSteps++;}
}
const allowed=(x,z,r=0)=>!mask.buildingBlocked(x,z,r)&&!discs.some(d=>Math.hypot(x-d.x,z-d.z)<d.r+r),allowedLow=(x,z,r=0)=>!mask.blocked(x,z,r)&&!discs.some(d=>Math.hypot(x-d.x,z-d.z)<d.r+r);
let buildings=0,trees=0;
for(const lot of lots.filter(l=>l.model?.type==='massing')){const out=massingParts(lot,{ground:()=>0,allowed,allowedLow});
 for(const poly of out.footprints){assert(polygonContains(lot.poly,poly));for(const r of network.roads){for(const f of frames(r))assert(!circleIntersects(f.x,f.z,halfWidth(r),poly),`${lot.id} meets ${r.id}`);if(r.turningRadius){const p=r.pts.at(-1);assert(!circleIntersects(...p,r.turningRadius+presetOf(r).footpath,poly));}}buildings++;}
 for(const t of out.trees){assert(!mask.blocked(t.x,t.z,t.s*2.6+.5));trees++;}
}
console.log(`Corridor junctions: shared ${baseline.shared.length} → ${JUNCTIONS.length}; grade-separated ${baseline.gradeSeparated.length} → ${UNDERPASSES.length}; local street network connected (${graph.joins.length} joins); ${renderedVertices} vertices/${renderedTriangles} full rendered triangles clear corridor; walking surfaces match geometry.`);
console.log(`OZP streets: 5 source-traced roads + western connector, ${Math.round(length)}m, ${samples} samples, turning heads, corridor clearances, ${buildings} building footprints/${trees} canopies, ${walkingSteps} ground-conforming walking steps and all parcel topology passed.`);
