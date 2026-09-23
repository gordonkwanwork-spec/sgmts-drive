import assert from 'node:assert/strict';
import {sample,project,RAILWAY,STOPS,CYCLE_BRIDGES,CYCLE_RAMP,cycleSample,cycleBridgeHeight,cycleCrossing,fromChainage} from '../alignment.js';
import {cycleClearance,sceneryClear,cycleGeometry} from '../environment.js';
import {railPosition} from '../railway.js';
// Include the full off-map train enclosure: checking only the main rail deck missed the second crossing.
for(let u=RAILWAY.stationU;u<RAILWAY.length+225;u+=2){const p=railPosition(u),r=sample(project(p.x,p.z));assert((p.x-r.x)*r.lx+(p.z-r.z)*r.lz < -20,'Rail and tunnel stay on the station side');}
for(let c=3200;c<3650;c+=3){const p=cycleSample(fromChainage(c));assert(cycleClearance(p.x,p.z)<.12);assert(!sceneryClear(p.x,p.z,18),'Buildings cannot occupy the detoured cycleway');}
for(const j of CYCLE_BRIDGES){assert(!cycleCrossing(j.s));const centre=sample(j.s);
 for(let d=-j.halfWidth-7;d<=j.halfWidth+7;d+=1){const s=j.s+d,p=cycleSample(s);assert(Math.abs(p.groundY+cycleBridgeHeight(s)-centre.groundY-6.4)<.001,'Riding surface meets the bridge deck');}
 for(let s=j.s-j.halfWidth-8-CYCLE_RAMP;s<j.s+j.halfWidth+8+CYCLE_RAMP;s+=.5){const a=cycleSample(s),b=cycleSample(s+.01);assert(Math.hypot(b.x-a.x,b.z-a.z)<.06,'Approach plan is continuous');assert(Math.abs(b.groundY+cycleBridgeHeight(s+.01)-a.groundY-cycleBridgeHeight(s))<.006,'No lift jumps in bike route');}
}
const geometry=cycleGeometry(),p=geometry.attributes.position;for(const v of p.array)assert(Number.isFinite(v));
console.log('Rail enclosure clearance, cycle/building exclusions and continuous raised bridge approaches passed');
