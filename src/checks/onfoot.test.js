import assert from 'node:assert/strict';
import {groundAt,pushOut,walkStep,passengerLine,STEP_UP,pushOutFences,JUMP_SPEED,GRAVITY,FENCE_CLEAR} from '../onfoot.js';
import {sample,STOPS,LENGTH} from '../alignment.js';

// Surface is finite along the whole corridor, on both sides and well off it.
for(let s=0;s<=LENGTH;s+=25)for(const lat of [0,9,-14,-40,60]){const r=sample(s),g=groundAt(r.x+r.lx*lat,r.z+r.lz*lat,s);assert(Number.isFinite(g.y),`ground NaN at s=${s} lat=${lat}`);}
// Platform tops sit above the carriageway at every station.
for(const st of STOPS){const r=sample(st.s),lat=st.platformLateral+1.5,road=groundAt(r.x,r.z,st.s),plat=groundAt(r.x+r.lx*lat,r.z+r.lz*lat,st.s);assert(Math.abs(plat.y-road.y-.32)<.05,`${st.id} platform height`);}
// Colliders push out; a viaduct side cannot be stepped onto from the ground.
const out=pushOut(1,0,.35,[{x:0,z:0,radius:2}]);assert(Math.hypot(out.x,out.z)>=2.34);
const deck=Array.from({length:LENGTH},(_,s)=>sample(s)).find(r=>r.elevated&&r.y-r.groundY>3);
if(deck){const s=Math.round(deck.s??0),r=deck,far=groundAt(r.x+r.lx*30,r.z+r.lz*30,s),p={x:r.x+r.lx*30,z:r.z+r.lz*30,y:far.y,s:far.s},step=walkStep(p,-r.lx*29.5,-r.lz*29.5,[]);assert(step.blocked||step.y-p.y<=STEP_UP,'climbed onto viaduct deck');}
// A fence line cannot be walked through at any approach angle, but a jump clears it.
{const fence=[{ax:-100,az:0,bx:100,bz:0}];for(const angle of [0,.3,.8,1.2]){let x=0,z=-1;for(let i=0;i<200;i++){const next=pushOutFences(x+Math.sin(angle)*.08,z+Math.cos(angle)*.08,.35,fence);x=next.x;z=next.z;}assert(z<0,'walked through fence at '+angle);}
 let x=0,z=-1;for(let i=0;i<30;i++){({x,z}=pushOutFences(x,z+.08,.35,fence,1.1));}assert(z>0,'jump should clear the fence');
 assert(JUMP_SPEED**2/(2*GRAVITY)>FENCE_CLEAR+.2,'jump apex clears the panel');}
// Each passenger varies their replies.
const lines=new Set(Array.from({length:6},(_,n)=>passengerLine(3,n)));assert(lines.size===6,'repeated passenger reply');
assert(passengerLine(1,0,{riding:true,condition:'rain'}).length>0);
console.log('on-foot checks passed');

// Feet follow the actual cycle deck and both bridge ramps, not the terrain below.
const {cycleSample,cycleBridgeHeight,cycleCrossing}=await import('../alignment.js');
for(let s=5;s<LENGTH-5;s+=7)if(!cycleCrossing(s))for(const lat of [-1.5,0,1.5]){
 const c=cycleSample(s),g=groundAt(c.x+c.lx*lat,c.z+c.lz*lat,s);
 assert(Math.abs(g.y-c.groundY-cycleBridgeHeight(s))<.035,`cycle surface at ${s}, ${lat}: ${g.y}`);
}
// Station access bikes sit on the footpath, including beside elevated stations.
const {stationAccess}=await import('../environment.js');
const {roadSection,footpathHeight}=await import('../alignment.js');
for(const st of STOPS)for(const platform of st.platforms)for(const dir of [-1,1]){
 if(st.id==='A1'&&dir===-1)continue;
 const s=Math.max(4,Math.min(LENGTH-4,stationAccess(st,platform,dir).end+dir*2)),r=sample(s),lat=platform.side*(roadSection(s).right+2.8);
 assert(Math.abs(groundAt(r.x+r.lx*lat,r.z+r.lz*lat,s).y-r.groundY-footpathHeight(s))<.02,`${st.id} bike access surface`);
}

// All four junction corners use the raised slab surface, including the road grade.
const {JUNCTIONS,sideCrossing}=await import('../alignment.js');
for(const j of JUNCTIONS){const r=sample(j.s),w=roadSection(j.s).right;
 for(const sx of [-1,1])for(const sz of [-1,1]){
  const x=sx*(w+6-4/Math.SQRT2),z=sz*(j.halfWidth+6-4/Math.SQRT2),wx=r.x-r.lx*x-r.tx*z,wz=r.z-r.lz*x-r.tz*z;
  assert(Math.abs(groundAt(wx,wz,j.s-z).y-(r.y-r.grade*z+.3))<.002,`${j.name}: raised corner`);
  const rx=sx*sideCrossing(j,sx),rz=sz*(j.halfWidth+.65),px=r.x-r.lx*rx-r.tx*rz,pz=r.z-r.lz*rx-r.tz*rz;
  // The elevated cycle deck takes precedence where it crosses above a side-road ramp.
  const g=groundAt(px,pz,j.s-rz),ramp=r.y-r.grade*rz+.025+.28*.65/3.75;
  assert(g.y>=ramp-.002,`${j.name}: ramp does not sink below paving`);
 }
}
console.log('Raised junction corner and crossing ramp heights passed');
// Ribbon vertices include every crossing/ramp break, keeping rendered paving flush with walking heights.
const {ribbon}=await import('../environment.js');
for(const j of JUNCTIONS){const s=j.s+j.halfWidth+10,w=roadSection(s).right,geo=ribbon(s-8,s+8,w,w+3.75,footpathHeight,true),p=geo.attributes.position;
 for(const d of [-4,-1.5,1.5,4]){const q=sample(s+d),x=q.x+q.lx*w,z=q.z+q.lz*w;let found=false;for(let i=0;i<p.count;i++)if(Math.hypot(p.getX(i)-x,p.getZ(i)-z)<.001){found=true;assert(Math.abs(p.getY(i)-q.groundY-footpathHeight(s+d))<.001);}
  assert(found,'Dropped-kerb boundary vertex is present');}
 geo.dispose();
}
