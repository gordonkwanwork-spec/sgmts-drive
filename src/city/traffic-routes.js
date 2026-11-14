// Lane paths for general traffic through the rebuilt corridor crossings (city rebuild, 5 Nov 2026): from the far end of the
// network road on one arm, straight through the junction (or under the viaduct) and out along the network road on the other arm.
// Keep-left lanes follow each road's own cross-section; at-grade routes hold at the side-road stop line on the junction's phase.
import * as T from 'three';
import {JUNCTIONS,UNDERPASSES,crossingGeometry} from '../alignment.js';
import {frames,streetHeight} from '../street/network.js';
import {crossingY} from './crossings.js';

const LANE=3.65;
export function crossingRoutes(network){const roads=network?.roads||[],routes=[];
 for(const j of [...JUNCTIONS,...UNDERPASSES]){const g=crossingGeometry(j),{C,u}=g;
  // Network road leaving arm σ, as points from its tie outwards.
  const arm=σ=>{const r=roads.find(r=>r.tie?.junction===j.c&&r.tie.side===σ);return r?frames(r).filter(f=>f.d<=260).filter((f,i,F)=>i%3===0||i===F.length-1).map(f=>({x:f.x,z:f.z})):[];};// control-centre routes: the first 260 m of each arm
  for(const σ of [1,-1]){// travelling from arm σ to arm −σ (direction −σ·u)
   const centre=[...arm(σ).reverse()];for(let d=σ*(j.extent-2);d*σ>-(j.extent-2);d-=σ*5)centre.push({x:C.x+u.x*d,z:C.z+u.z*d});centre.push(...arm(-σ));
   const dedup=centre.filter((p,i)=>!i||Math.hypot(p.x-centre[i-1].x,p.z-centre[i-1].z)>.5);if(dedup.length<4)continue;
   for(let k=0;k<j.lanes;k++){const off=j.median/2+LANE*(k+.5),pts=dedup.map((p,i)=>{const a=dedup[Math.max(0,i-1)],b=dedup[Math.min(dedup.length-1,i+1)],L=Math.hypot(b.x-a.x,b.z-a.z)||1,lx=(b.z-a.z)/L,lz=-(b.x-a.x)/L;// left of travel
     const x=p.x+lx*off,z=p.z+lz*off,dx=x-C.x,dz=z-C.z,inside=Math.abs(dx*u.x+dz*u.z)<j.extent;return new T.Vector3(x,(inside?crossingY(j,x,z)+.03:streetHeight(x,z)??crossingY(j,x,z)+.03)+.05,z);});
    const curve=new T.CatmullRomCurve3(pts,false,'centripetal');curve.arcLengthDivisions=Math.ceil(curve.getLength()/2);
    // Route distance of the stop line on the approach arm (the first point past it, junction-side).
    let at=null;if(!j.underpass){const L=curve.getLength(),n=Math.ceil(L);for(let i=0;i<=n;i++){const p=curve.getPointAt(i/n);if(((p.x-C.x)*u.x+(p.z-C.z)*u.z)*σ<=Math.abs(g.stopD[σ])){at=L*i/n;break;}}}
    routes.push({junction:j,dir:-σ,lane:k,curve,stopAt:at});}}}
 return routes;}
