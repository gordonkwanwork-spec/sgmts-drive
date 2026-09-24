import {sample,roadSection,projectFrame,STOPS,LENGTH,footpathHeight} from './alignment.js';
import {terrainLevel,channelDepth} from './environment.js';

const clamp=(x,a,b)=>Math.max(a,Math.min(b,x));
export const STEP_UP=.6;

// Walkable surface from the route cross-section: carriageway/deck, platform tops, footpath, then terrain.
// ponytail: analytic cross-section, no mesh raycast; station stairs/canopy columns are not modelled.
export function groundAt(x,z,sGuess){
 const s=clamp(projectFrame(x,z,sGuess),0,LENGTH),r=sample(s),lat=(x-r.x)*r.lx+(z-r.z)*r.lz,e=roadSection(s);
 if(lat>e.left-.3&&lat<e.right+.3)return {s,lat,y:r.y};
 const st=STOPS.find(st=>Math.abs(s-st.s)<st.footprintLength/2+st.stagger/2);
 if(st&&Math.abs(lat)>=st.platformLateral-.3&&Math.abs(lat)<st.platformLateral+st.width+.5)return {s,lat,y:r.y+.32};
 if(!r.elevated&&Math.abs(lat)<Math.max(Math.abs(e.left),e.right)+3.75)return {s,lat,y:r.y+footpathHeight(s)};
 return {s,lat,y:terrainLevel(x,z,s)-.24-channelDepth(x,z)};
}

// Circle colliders (building plots, tree trunks): push the point out of every overlap.
export function pushOut(x,z,radius,circles){
 for(const c of circles){const dx=x-c.x,dz=z-c.z,d=Math.hypot(dx,dz),min=c.radius+radius;if(d<min){const k=d>1e-6?min/d:0;x=c.x+(k?dx*k:min);z=c.z+(k?dz*k:0);}}
 return {x,z};
}

// Fence panels as line segments: steel bars 0.2 m apart slip between wall rays, so push the walker out of each
// segment unless their feet are above the panel (a jump clears 1.0 m of the 1.2 m panel with legs tucked).
export const JUMP_SPEED=5,GRAVITY=9.81,FENCE_CLEAR=1;
export function pushOutFences(x,z,radius,fences,feetAbove=0){
 if(feetAbove>=FENCE_CLEAR)return {x,z};
 for(const f of fences){const dx=f.bx-f.ax,dz=f.bz-f.az,len2=dx*dx+dz*dz||1,t=Math.max(0,Math.min(1,((x-f.ax)*dx+(z-f.az)*dz)/len2)),cx=f.ax+dx*t,cz=f.az+dz*t,ox=x-cx,oz=z-cz,d=Math.hypot(ox,oz);
  if(d<radius){const n=d>1e-6?[ox/d,oz/d]:[-dz/Math.sqrt(len2),dx/Math.sqrt(len2)];x=cx+n[0]*radius;z=cz+n[1]*radius;}}
 return {x,z};
}

// One walking step: move, resolve colliders, and refuse a rise taller than a kerb (viaduct sides, walls).
export function walkStep(p,dx,dz,circles,fences=[]){
 const pushed=pushOut(p.x+dx,p.z+dz,.35,circles),moved=pushOutFences(pushed.x,pushed.z,.35,fences,p.jumpY||0),g=groundAt(moved.x,moved.z,p.s);
 if(!Number.isFinite(g.y)||g.y-p.y>STEP_UP+(p.jumpY||0))return {...p,blocked:true};
 return {x:moved.x,z:moved.z,y:g.y,s:g.s,blocked:false};
}

const LINES=[
 'Morning! This line saves me twenty minutes to Hung Shui Kiu.',
 '早晨！搭呢條線去洪水橋快好多。',
 'I used to take three minibuses. Now it is one ride.',
 'Is this the northbound platform? …Oh, it is. Thanks!',
 'The new trams are so quiet I didn’t hear it pull in.',
 'My grandson says these run on batteries. Is that true?',
 'I’m heading to the MTR — got a train to catch in Tuen Mun.',
 'Good driving earlier, by the way. Very smooth stop.',
 '唔該，想問下去廈村係咪呢邊？',
 'Every five minutes at peak — I don’t even check the timetable any more.',
 'I bike to the station and park right over there.',
 'Nice day for a walk along the cycle track, isn’t it?',
 'Sorry, I’m on a call… yes, Ma, I’m on the tram now.',
 'The ramp at the door is great for my wheelchair.',
 'Do you know if the Industry Park stop is open yet?',
 'I’m just people-watching. Best seat in town.',
 'Try the dim sum near the next station. Trust me.',
 '今日好熱呀，飲多啲水啦。',
 'These guideway dashes look like piano keys from up high.',
 'I missed the last one by ten seconds. Classic.',
 'Are you the driver? Shouldn’t you be… driving?',
 'My daughter designed some of these stations, you know.',
 'I count the trams. That’s the fourth orange one this hour.',
 'Please mind the gap, as they say.',
];
const RAIN=['Forgot my umbrella again…','落雨喇，小心地滑呀。','At least the canopy keeps us dry.'];
const NIGHT=['Long shift. Just want to get home.','The platform lights look lovely at night.','夜晚都咁多車，好方便。'];
const RIDE=['Next stop is mine — could you press the bell?','I always sit near the front for the view.','Smoother than the bus, that’s for sure.','Oh! You startled me. Is this seat free?'];

// Each person answers differently each time; conditions and riding add their own lines.
export function passengerLine(id,count,{condition='morning',riding=false}={}){
 const pool=[...(riding?RIDE:[]),...(condition==='rain'?RAIN:[]),...(condition==='night'?NIGHT:[]),...LINES];
 return pool[((id*7919)%pool.length+count*5)%pool.length];
}
