import assert from 'node:assert/strict';
import fs from 'node:fs';
import * as T from 'three';
import {buildNetwork,junctions,frames,frameAt,presetOf,halfWidth,reserveClash,streetHeight,tieFrame,streetLevel} from '../street/network.js';
import {JUNCTIONS,UNDERPASSES,STOPS,footpathHeight,sample} from '../alignment.js';
import {renderedGround} from '../environment.js';
import {groundAt} from '../onfoot.js';
import {panelParts,type2PostParts} from '../street/sandbox/railing-details.js';
import {sweptKerbs} from '../street/kerbs.js';
const n=JSON.parse(fs.readFileSync(new URL('../../public/street/furniture.json',import.meta.url))).network;
const graph=junctions(n,renderedGround),g=buildNetwork(n,{ground:renderedGround});
assert.equal(n.roads.filter(r=>r.tie).length,12);
for(const j of [...JUNCTIONS,...UNDERPASSES])for(const side of [-1,1])assert(n.roads.some(r=>r.tie?.junction===j.c&&r.tie.side===side));
let tieChecks=0;
for(const {r,F,P} of graph.roads){
 assert.equal(reserveClash(F.map(f=>[f.x,f.z]),{width:halfWidth(r)}),null,r.id+' clear of dedicated corridor');
 if(!r.tie)continue;const f=tieFrame(r.tie);assert(Math.hypot(F[0].x-f.x,F[0].z-f.z)<1e-6);assert.equal(P.carriageway,f.width);
 for(const d of [.002,.2,1,3])for(const lat of [-P.carriageway/2-1,-P.carriageway/4,0,P.carriageway/4,P.carriageway/2+1]){
  const a=frameAt(F,d),x=a.x+a.lx*lat,z=a.z+a.lz*lat,expected=a.y+(a.crossSlope||0)*lat+streetLevel(r,d,lat),actual=streetHeight(x,z);
  assert(actual!==null,`${r.id} has a gap at ${d}/${lat}`);assert(Math.abs(actual-expected)<.04,`${r.id}: surface ${actual} differs from ${expected}`);
  const walk=groundAt(x,z);assert(Math.abs(walk.y-actual)<.04,`${r.id}: walking agrees with mesh`);tieChecks++;
 }
}
for(const j of graph.joins){for(let d=0;d<8;d+=.5){const x=j.at.x+j.a[0]*d,z=j.at.z+j.a[1]*d,y=streetHeight(x,z);assert(y!==null,'local junction is connected');assert(Math.abs(y-j.at.y-.03)<.12,`${j.A.r.id}: pavement blocks carriageway at ${d}`);}}
// Sandbox railing silhouette, orientation, no surface-mounted baseplate.
const steel=new T.MeshStandardMaterial();for(const name of ['railing_type2','railing_type2_end','railing_crossing','railing_crossing_end']){const parts=panelParts(name,steel);for(const {geometry} of parts){geometry.computeBoundingBox();const b=geometry.boundingBox;assert(Math.abs(b.max.x-b.min.x-.04)<1e-5);assert(Math.abs(b.max.y-1)<1e-5);if(name.endsWith('_end'))assert(b.max.z<0,'end panel extends away along local -Z');}}
const post=type2PostParts(steel);assert.equal(post.filter(p=>p.role==='rounded dome stiffener').length,6);assert(!post.some(p=>/plate/i.test(p.role)));post[0].geometry.computeBoundingBox();assert(Math.abs(post[0].geometry.boundingBox.max.y-.96)<1e-5);
// Taller / transition units preserve the K1 arris, continuous top and embedded bottom.
const [kerb]=sweptKerbs(12,t=>({x:t,z:0,nx:0,nz:1,y:.15+.15*t/12,base:0}));assert([...kerb.attributes.position.array].every(Number.isFinite));kerb.computeBoundingBox();assert(Math.abs(kerb.boundingBox.min.y+.1)<1e-5);assert(kerb.boundingBox.max.y>.299);
assert(Math.abs(footpathHeight(STOPS[3].s)-.3)<1e-5);let ordinary=0;for(let s=0;s<4200;s+=10)if(Math.abs(footpathHeight(s)-.15)<1e-8)ordinary++;assert(ordinary>150);
assert(g.userData.crossings.length>8,'city crossings carry shared ramp/marking records');
console.log(`City streets: ${n.roads.length} roads; ${tieChecks} seam/walking samples; ${graph.joins.length} local junctions; ${g.userData.crossings.length} dropped-kerb crossings; K1 transitions and Type 2 details pass.`);
// Grading the ground clears the actual sloping junction surface, including corners.
const {streetTerrain,surfaceSampler}=await import('../street/network.js'),{terrainPatch}=await import('../environment.js'),{project}=await import('../alignment.js');
const at=graph.joins[5].at,s=project(at.x,at.z),grade=streetTerrain(n,renderedGround),terrain=surfaceSampler([new T.Mesh(terrainPatch(Math.max(0,s-120),s+120,grade))]);let clear=0;
for(let x=at.x-15;x<at.x+15;x+=.75)for(let z=at.z-15;z<at.z+15;z+=.75){const y=g.userData.surfaceHeight(x,z),base=terrain(x,z);if(y!==null&&base!==null){assert(base<y-.05,'terrain must not pierce the junction paving');clear++;}}
assert(clear>500);
// A sloping authored bay may subdivide: its original chunk remains valid.
const {railingBuilder,runPoints}=await import('../street/furniture.js'),{setNetwork}=await import('../street/roads.js');setNetwork(n,renderedGround);const fences=[],builder=railingBuilder({batch(){},kitParts:()=>[],fences});
for(const run of JSON.parse(fs.readFileSync(new URL('../../public/street/furniture.json',import.meta.url))).runs){if(run.type!=='railing')continue;const P=runPoints(run);builder.railRun(P.map(p=>new T.Vector3(p.x,p.y,p.z)),i=>{assert(P[i],'subdivided bay retains original chunk');return Math.floor(P[i].s/240);});}
assert(fences.length>1000);console.log(`${clear} pavement/terrain samples clear; all authored railing runs retain their complete bays.`);
for(const e of g.userData.edges.filter(e=>e.kind==='corner'))for(const u of [.25,.5,.75]){const p=e.point(e.length*u),y=g.userData.surfaceHeight(p.x-p.nx*.4,p.z-p.nz*.4);assert(y!==null,'carriageway fills the road side of every swept kerb return');assert(Math.abs(y-p.base)<.12,'curved return meets carriageway level');}
