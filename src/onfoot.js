import {footbridgeFloor} from './pedestrian-footbridges.js';
import {bridgeWalkY,liftApronY} from './a2-footbridge.js';
import {siteCoordinates,squareFloor,galleryY} from './a2-site.js';
import * as T from 'three';
import {crossingY,cycleAprons} from './city/crossings.js';
import {sample,roadSection,projectFrame,STOPS,LENGTH,footpathHeight,cycleSample,cycleBridgeHeight,cycleCrossing,JUNCTIONS,UNDERPASSES,junctionPavement,crossingGeometry,PLATFORM_RISE} from './alignment.js';
import {streetHeight,surfaceSampler} from './street/network.js';
import {lotHeight} from './city/blocks.js';
import {ROAD,nearest} from './street/roads.js';
import {renderedGround,terrainLevel,channelDepth,stationAccess,depotKerbHeight} from './environment.js';

const clamp=(x,a,b)=>Math.max(a,Math.min(b,x));
export const STEP_UP=.6;
const RAMPS=STOPS.flatMap(st=>st.platforms.flatMap(p=>[-1,1].filter(dir=>st.id!=='A1'||dir===1).map(dir=>({side:p.side,start:st.s+p.centerOffset+dir*st.footprintLength/2,end:stationAccess(st,p,dir).end,outer:st.platformLateral+st.width+.5}))));

// Walk the same two triangles that render each station access ramp; interpolating
// route chainage independently produces a bump on A7's curved approach.
const accessMeshes=STOPS.flatMap(st=>st.platforms.flatMap(p=>[-1,1].filter(dir=>st.id!=='A1'||dir===1).map(dir=>{
 const {a,b}=stationAccess(st,p,dir),geo=new T.BufferGeometry();geo.setAttribute('position',new T.Float32BufferAttribute([...a,b[1],b[0]].flatMap(v=>[v.x,v.y,v.z]),3));geo.setIndex([0,1,2,0,2,3]);return {geometry:geo};
})));
const apronHeight=surfaceSampler(cycleAprons.map(geometry=>({geometry})));
const accessHeight=surfaceSampler(accessMeshes);
// Walkable surface from the route cross-section: carriageway/deck, platform tops, footpath, then terrain.
// ponytail: analytic cross-section, no mesh raycast; station stairs/canopy columns are not modelled.
export function groundAt(x,z,sGuess,fromY){
 const s=clamp(projectFrame(x,z,sGuess),0,LENGTH),r=sample(s),lat=(x-r.x)*r.lx+(z-r.z)*r.lz,e=roadSection(s);
 // An upper-level walker crosses the roadway and cycle track on a separate deck.
 if(Math.abs(s-STOPS[1].s)<155){
  const local=siteCoordinates(x,z),y=bridgeWalkY(local.x,local.z,fromY);if(y!==null)return {s,lat,y};
  const apron=liftApronY(local.x,local.z)??galleryY(local.x,local.z);if(apron!==null)return {s,lat,y:apron};
 }
 const bridge=footbridgeFloor(x,z,fromY);if(bridge!==null)return {s,lat,y:bridge};
 // Project onto the ground-level cycle alignment.
 let cs=s;for(let i=0;i<4;i++){const c=cycleSample(cs);cs=clamp(cs+(x-c.x)*c.tx+(z-c.z)*c.tz,0,LENGTH);}
 const c=cycleSample(cs),clat=(x-c.x)*c.lx+(z-c.z)*c.lz;
 if(Math.abs(clat)<=2&&!cycleCrossing(cs))return {s,lat,y:c.groundY+cycleBridgeHeight(cs)};
 const apron=apronHeight(x,z);if(apron!==null)return {s,lat,y:apron};
 // Rebuilt junctions and under-viaduct roads (src/city/crossings.js): kerb-return rings, arm footways and medians are raised;
 // the side carriageway and the fill between kerb returns sit at road level; land inside a kerb-return circle falls through to terrain.
 for(const j of [...JUNCTIONS,...UNDERPASSES]){const g=crossingGeometry(j),dx=x-g.C.x,dz=z-g.C.z,d=dx*g.u.x+dz*g.u.z,ee=dx*g.n.x+dz*g.n.z,h=j.halfWidth;
  if(Math.abs(d)>j.extent||Math.abs(ee)>h+(j.underpass?j.footway:(j.R||8)))continue;const base=crossingY(j,x,z);
  if(j.underpass){if(Math.abs(ee)<=h+j.footway)return {s,lat,y:base+(Math.abs(ee)>h||Math.abs(ee)<j.median/2?.18:.03)};continue;}
  const pave=junctionPavement(j,x,z);if(pave!==null)return {s,lat,y:base+pave};
  if(Math.abs(lat)<=e.right+.3)break;
  if([-1,1].some(σ=>[-1,1].some(τ=>Math.hypot(x-g.corners[σ][τ].O.x,z-g.corners[σ][τ].O.z)<g.corners[σ][τ].R)))break;
  if(Math.abs(ee)<=h||Math.abs(ee)<h+.9*(j.R||8))return {s,lat,y:base+.03};
 }
 if(lat>e.left-.3&&lat<e.right+.3)return {s,lat,y:r.y};
 const access=accessHeight(x,z);if(access!==null)return {s,lat,y:access};
 // Per platform: A2's two platforms are staggered, so each side has its own extent.
 if(STOPS.some(st=>st.platforms.some(p=>Math.abs(s-st.s-p.centerOffset)<st.footprintLength/2&&lat*p.side>=st.platformLateral-.3&&lat*p.side<st.platformLateral+st.width+.5)))return {s,lat,y:r.y+.32+PLATFORM_RISE};
 // Access ramps fall from the raised platform to the footpath between the platform end and the ramp foot.
 for(const q of RAMPS)if((s-q.start)*(s-q.end)<=0&&lat*q.side>=e.right-.3&&lat*q.side<q.outer){const u=(s-q.start)/(q.end-q.start);return {s,lat,y:(sample(q.start).y+.32+PLATFORM_RISE)*(1-u)+(r.groundY+footpathHeight(s))*u};}
 if(Math.abs(lat)<Math.max(Math.abs(e.left),e.right)+3.75)return {s,lat,y:r.groundY+depotKerbHeight(s,Math.sign(lat))};
 if(Math.abs(s-STOPS[1].s)<160){const local=siteCoordinates(x,z),y=squareFloor(local.x,local.z,fromY);if(y!==null)return {s,lat,y};}
 const street=streetHeight(x,z);if(street!==null)return {s,lat,y:street};
 const plot=lotHeight(x,z);if(plot!==null)return {s,lat,y:plot};// paved plot plinths and forecourts (src/city/blocks.js)
 return {s,lat,y:Math.hypot(x-r.x,z-r.z)>100?renderedGround(x,z):terrainLevel(x,z,s)-.24-channelDepth(x,z)};
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
 // A jump clears railings (top 1) but never building walls (top = eaves height).
 for(const f of fences){if(feetAbove>=Math.max(FENCE_CLEAR,f.top||0))continue;const dx=f.bx-f.ax,dz=f.bz-f.az,len2=dx*dx+dz*dz||1,t=Math.max(0,Math.min(1,((x-f.ax)*dx+(z-f.az)*dz)/len2)),cx=f.ax+dx*t,cz=f.az+dz*t,ox=x-cx,oz=z-cz,d=Math.hypot(ox,oz);
  if(d<radius){const n=d>1e-6?[ox/d,oz/d]:[-dz/Math.sqrt(len2),dx/Math.sqrt(len2)];x=cx+n[0]*radius;z=cz+n[1]*radius;}}
 return {x,z};
}

// One walking step: move, resolve colliders, and refuse a rise taller than a kerb (viaduct sides, walls).
export function walkStep(p,dx,dz,circles,fences=[]){
 if(Math.abs(p.s-STOPS[1].s)<155 && p.y>sample(p.s).groundY+2){
  const local=siteCoordinates(p.x,p.z);
  // Kerbside rails and tree-trunk circles belong to the street below; the
  // bridge rails and planters are already solid meshes in the walking BVH.
  if(bridgeWalkY(local.x,local.z,p.y)!==null){circles=[];fences=[];}
 }
 if(footbridgeFloor(p.x,p.z,p.y)!==null&&p.y>sample(p.s).groundY+2){circles=[];fences=[];}
 const pushed=pushOut(p.x+dx,p.z+dz,.35,circles),moved=pushOutFences(pushed.x,pushed.z,.35,fences,p.jumpY||0),g=groundAt(moved.x,moved.z,p.s,p.y);
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

// Hold the movement frame until the input changes: camera follow must not steer a held A/S/D key.
export function followWalking(player,orbit,forward,side,dt){
 const input=`${forward},${side}`;
 if(!forward&&!side){player.walkInput=null;return;}
 if(player.walkInput!==input){player.walkInput=input;player.walkYaw=orbit.yaw;}
 const yaw=player.walkYaw,want=yaw+Math.atan2(-side,forward),angle=d=>Math.atan2(Math.sin(d),Math.cos(d));
 player.heading+=angle(want-player.heading)*(1-Math.exp(-12*dt));
 orbit.yaw+=angle(player.heading-orbit.yaw)*(1-Math.exp(-3*dt));
}
