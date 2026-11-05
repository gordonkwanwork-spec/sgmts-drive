import assert from 'node:assert/strict';
import fs from 'node:fs';
import {JUNCTIONS,DEPOT,sample,roadSection,projectFrame,footpathHeight} from '../alignment.js';
import {junctionPoint,junctionUnproject} from '../street/junction-frame.js';
import {depotKerbHeight,junctionBox,ribbon} from '../environment.js';
import {signalCrossingMarkings} from '../street/sandbox/street-rules.js';
import {k1Profile} from '../street/kerbs.js';
assert.deepEqual(JSON.parse(fs.readFileSync('scripts/k1-profile.json')),k1Profile(),'native assets use the street K1 profile');
let count=0;
for(const j of JUNCTIONS){const w=roadSection(j.s).right,r=sample(j.s);
 const clearance=(x,z)=>{const p=junctionPoint(j,x,0,z),wx=r.x-r.lx*p.x-r.tx*p.z,wz=r.z-r.lz*p.x-r.tz*p.z,s=projectFrame(wx,wz,j.s-p.z),q=sample(s);return roadSection(s).right-Math.abs((wx-q.x)*q.lx+(wz-q.z)*q.lz);};
 for(const side of [-1,1]){const markings=signalCrossingMarkings({at:side*(j.halfWidth+10),width:3.2,roadWidth:2*w,edgeMargin:.5});let edgeGap=Infinity;
  for(const b of markings.bars)for(const dx of [-b.d/2,b.d/2])for(const dz of [-b.w/2,0,b.w/2]){const gap=clearance(b.z+dx,b.x+dz);assert(gap>.35,`${j.c}: entire yellow stripe stays off the footpath`);edgeGap=Math.min(edgeGap,gap);count++;}
  assert(edgeGap<.65,'outer stripes stay close to the kerb');
  for(const sx of [-1,1])for(const d of [.125,1,3.75]){const z=side*(j.halfWidth+6),p=junctionPoint(j,sx*(w+d),.18-r.grade*z,z),q=sample(j.s-z),lat=-sx*(roadSection(j.s-z).right+d),wx=r.x-r.lx*p.x-r.tx*p.z,wz=r.z-r.lz*p.x-r.tz*p.z;
   assert(Math.hypot(wx-q.x-q.lx*lat,wz-q.z-q.lz*lat)<1e-7,'corner end meets the full width of corridor paving');assert(Math.abs(p.y+r.y-q.y-footpathHeight(j.s-z))<1e-6,'corner end has no vertical step');const inv=junctionUnproject(j,p.x,p.z);assert(Math.hypot(inv.x-sx*(w+d),inv.z-z)<1e-5);
  }
 }
 for(const [x,z] of junctionBox(j).poly)assert(clearance(x,z)>.14,'box outline remains on the carriageway');
 const g=ribbon(j.s-40,j.s+40,s=>roadSection(s).right+.125,s=>roadSection(s).right+3.75,footpathHeight,true,s=>Math.abs(s-j.s)<j.halfWidth+6),p=g.attributes.position;
 for(const dir of [-1,1]){const s=j.s+dir*(j.halfWidth+6),q=sample(s),lat=roadSection(s).right+.125;assert(Array.from({length:p.count},(_,i)=>Math.hypot(p.getX(i)-q.x-q.lx*lat,p.getZ(i)-q.z-q.lz*lat)).some(d=>d<.001),'paving has exact tangent vertices');}
}
for(const dir of [-1,1]){assert.equal(depotKerbHeight(DEPOT.gate+dir*14,1),.02);assert(Math.abs(depotKerbHeight(DEPOT.gate+dir*16.5,1)-.085)<1e-6);assert.equal(depotKerbHeight(DEPOT.gate+dir*19,1),footpathHeight(DEPOT.gate+dir*19));}
console.log(`${count} full stripe footprint checks; all shared-junction paving joins, K1 profile and depot tapers pass.`);
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
{const j=JUNCTIONS[1],s=j.s+j.halfWidth+6,q=sample(s),lo=roadSection(s).right,hi=l35Offset(s)-L35.width/2,mid=(lo+hi)/2,R=(hi-lo)/2;
 for(const angle of [.2,.7,1.2,1.8,2.4,2.9]){const x=mid+(R-.3)*Math.cos(angle),z=(R-.3)*Math.sin(angle),wx=q.x-q.lx*x-q.tx*z,wz=q.z-q.lz*x-q.tz*z;assert(Math.abs(groundAt(wx,wz,s).y-q.y-footpathHeight(s))<.002,'D6 rounded island is walkable to its kerb');}
}
console.log('Glass/Type 2 exclusion and rounded D6 island walking checks pass.');
