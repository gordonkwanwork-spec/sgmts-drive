// Driving/HUD package checks (node): low-speed guided progress through every bend.
// Run: node src/checks/driving-hud.test.js
import assert from 'node:assert/strict';
import {sample,project,projectFrame,laneOffset,LENGTH,END_STOP,STOPS,roadSection} from '../alignment.js';
import {driveStep,angleDelta} from '../operating.js';

const point=(s,lat=0)=>{const p=sample(s);return {x:p.x+p.lx*lat,z:p.z+p.lz*lat};};

// projectFrame inverts point(): the frame refinement must return the station it was given.
let worst=0;
for(let s=1;s<LENGTH-1;s+=3.7)for(const lat of [-6,-3.5,-1.9,0,1.9,3.5,6]){if(Math.abs(lat)>roadSection(s).right)continue;const p=point(s,lat);worst=Math.max(worst,Math.abs(projectFrame(p.x,p.z,s)-s));}
assert(worst<2e-3,`projectFrame(point(s,lat)) must return s (worst ${worst})`);

// Same guided pure-pursuit kinematics as experience.js update(): driveStep + guided wheel + re-projection.
function guidedRun(v,proj,dt=1/60){
 let s=STOPS[0].s+10.6,lat=laneOffset(s,1),yaw=0,t=0,minStep=Infinity,maxLane=0,frozen=0;
 while(s<END_STOP-1&&t<LENGTH/v*1.4){
  t+=dt;const p=sample(s),heading=p.heading+yaw,ahead=Math.min(8,Math.max(5,5+v*.25)),dest=s+ahead,aim=point(dest,laneOffset(dest,1)),here=point(s,lat);
  const alpha=angleDelta(Math.atan2(-(aim.x-here.x),-(aim.z-here.z)),heading),wheel=Math.max(-.65,Math.min(.65,Math.atan2(2*6.2*Math.sin(alpha),ahead)));
  const m=driveStep(here.x,here.z,heading,v/Math.sqrt(1+p.grade*p.grade),wheel,dt),next=Math.max(0,Math.min(END_STOP,proj(m.x,m.z,s))),r=sample(next);
  minStep=Math.min(minStep,next-s);frozen=next-s<1e-9?frozen+1:0;if(frozen>60)return {stalled:true,s,t};
  s=next;lat=(m.x-r.x)*r.lx+(m.z-r.z)*r.lz;yaw=angleDelta(m.heading,r.heading);maxLane=Math.max(maxLane,Math.abs(lat-laneOffset(s,1)));
 }
 return {stalled:false,s,t,minStep,maxLane};
}
// The polyline projection alone reproduces the reported corner stall (vertex snapping on the outside of a bend).
const legacy=guidedRun(7/3.6,project);
assert(legacy.stalled&&legacy.s<400,'Regression premise: project() alone freezes the 7 km/h run in the first bend');
for(const v of [1,2]){
 const run=guidedRun(v,projectFrame);
 assert(!run.stalled,`Guided run at ${v.toFixed(2)} m/s stalled at s=${run.s?.toFixed(1)}`);
 assert(run.s>=END_STOP-1.001,`Guided run at ${v.toFixed(2)} m/s must reach the end of the corridor (s=${run.s.toFixed(1)})`);
 assert(run.minStep>0,`Progress must be strictly monotonic at ${v.toFixed(2)} m/s`);
 assert(run.maxLane<.6,`Guidance keeps the lane at ${v.toFixed(2)} m/s (max deviation ${run.maxLane.toFixed(2)} m)`);
 console.log(`Guided ${v.toFixed(2)} m/s: corridor completed in ${run.t.toFixed(0)} s, min step ${(run.minStep*1000).toFixed(2)} mm, max lane deviation ${run.maxLane.toFixed(2)} m.`);
}
console.log(`Driving checks passed: projectFrame round-trip (worst ${(worst*1000).toFixed(3)} mm) and no low-speed corner stall.`);
