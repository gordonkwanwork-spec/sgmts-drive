import assert from 'node:assert/strict';
import fs from 'node:fs';
import {JUNCTIONS,DEPOT,sample,roadSection,footpathHeight,crossingGeometry,junctionGap} from '../alignment.js';
import {depotKerbHeight,junctionBox,ribbon} from '../environment.js';
import {signalCrossingMarkings} from '../street/sandbox/street-rules.js';
import {k1Profile} from '../street/kerbs.js';
assert.deepEqual(JSON.parse(fs.readFileSync('scripts/k1-profile.json')),k1Profile(),'native assets use the street K1 profile');
let count=0;
// City rebuild (5 Nov 2026): junctions are solved in world space (crossingGeometry) for skewed OZP roads, so the old fixed
// R6 / ±(halfWidth+10) junction-frame checks are restated against the solved crossings, kerb returns and per-side gaps.
for(const j of JUNCTIONS){const g=crossingGeometry(j);
 for(const τ of [-1,1]){const at=g.crossS[τ],markings=signalCrossingMarkings({at,width:3.2,roadWidth:2*roadSection(at).right,edgeMargin:.5});let edgeGap=Infinity;
  for(const b of markings.bars)for(const dz of [-b.d/2,b.d/2])for(const dx of [-b.w/2,0,b.w/2]){const q=b.x+dx,gap=roadSection(q).right-Math.abs(b.z+dz);assert(gap>.35,`${j.c}: entire yellow stripe stays off the footpath`);edgeGap=Math.min(edgeGap,gap);count++;}
  assert(edgeGap<.65,'outer stripes stay close to the kerb');}
 for(const σ of [-1,1])for(const τ of [-1,1]){const k=g.corners[σ][τ],q=sample(k.s),lat=σ*roadSection(k.s).right;
  assert(Math.hypot(k.T1.x-q.x-q.lx*lat,k.T1.z-q.z-q.lz*lat)<1e-6,'kerb return starts on the corridor kerb');assert(Math.abs(Math.hypot(k.T2.x-k.O.x,k.T2.z-k.O.z)-k.R)<1e-6,'kerb return meets the side-road kerb tangentially');
  assert(k.s>g.gaps[σ][0]-1e-9&&k.s<g.gaps[σ][1]+1e-9,'gap spans both kerb returns');}
 for(const [x,z] of junctionBox(j).poly){const s=j.s-z;assert(roadSection(s).right-Math.abs(x)>.14,'box outline remains on the carriageway');}
 for(const σ of [-1,1]){const gr=ribbon(j.s-60,j.s+60,q=>σ*(roadSection(q).right+.125),q=>σ*(roadSection(q).right+3.75),footpathHeight,true,q=>junctionGap(q,σ)),p=gr.attributes.position;
  for(const s of g.gaps[σ]){const q=sample(s),lat=σ*(roadSection(s).right+.125);assert(Array.from({length:p.count},(_,i)=>Math.hypot(p.getX(i)-q.x-q.lx*lat,p.getZ(i)-q.z-q.lz*lat)).some(d=>d<.001),'paving has exact tangent vertices');}}
}
for(const dir of [-1,1]){assert.equal(depotKerbHeight(DEPOT.gate+dir*14,1),.02);assert(Math.abs(depotKerbHeight(DEPOT.gate+dir*16.5,1)-.085)<1e-6);assert.equal(depotKerbHeight(DEPOT.gate+dir*19,1),footpathHeight(DEPOT.gate+dir*19));}
console.log(`${count} full stripe footprint checks; all rebuilt-junction paving joins, K1 profile and depot tapers pass.`);
// Exported stations, not just generator source: all four ends have transparent
// glass and both platforms carry separate K1 meshes.
for(let i=1;i<=7;i++){
 const bytes=fs.readFileSync(`public/assets/station-A${i}.glb`),g=JSON.parse(bytes.subarray(20,20+bytes.readUInt32LE(12)).toString());
 const glass=g.materials.findIndex(m=>m.name==='station_glass');assert(glass>=0,`A${i}: glass material`);assert.equal(g.materials[glass].alphaMode,'BLEND');assert(g.materials[glass].doubleSided);assert(g.materials[glass].pbrMetallicRoughness.baseColorFactor[3]<.4);
 assert.equal(g.nodes.filter(n=>n.name?.endsWith('station_kerb')).length,2);
 const ends=g.nodes.filter(n=>n.name?.includes('approach_rail')&&n.mesh===undefined);assert.equal(ends.length,4);
 for(const end of ends)assert(end.children.some(c=>g.meshes[g.nodes[c].mesh]?.primitives.some(p=>p.material===glass)),`A${i}: each end has its own glass panels`);
}
console.log('Seven exported stations: 28 glass end barriers and 14 taller K1 platform edges verified.');
const {L35,l35Offset,STOPS}=await import('../alignment.js'),{groundAt}=await import('../onfoot.js'),{fenceAllowed}=await import('../environment.js');
for(const st of STOPS)for(const p of st.platforms)for(const dir of [-1,1]){
 const a=st.s+p.centerOffset+dir*36.5,b=st.s+p.centerOffset+dir*44.8;
 assert(!fenceAllowed(Math.min(a,b),Math.max(a,b),p.side),`${st.id}: Type 2 run excluded from glass end`);
}
// (The D6 rounded median nose between the corridor and L35 was removed with L35 in the city rebuild, 5 Nov 2026.)
console.log('Glass/Type 2 exclusion checks pass.');
