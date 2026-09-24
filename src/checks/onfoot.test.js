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
