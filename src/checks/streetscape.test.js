import fs from 'node:fs';
import {buildNetwork,junctions,streetTerrain,surfaceSampler} from '../street/network.js';
import {cycleAprons} from '../city/crossings.js';
import assert from 'node:assert/strict';
import {sample,project,RAILWAY,STOPS,cyclingSection,rideablePosition,FOOTBRIDGE_FORECOURT,cycleSample,cycleBridgeHeight,cycleCrossing,fromChainage,crossingGeometry,roadSection,LEVEL_TRACK_GAPS} from '../alignment.js';
import {cycleClearance,sceneryClear,cycleGeometry,terrainPatch,renderedGround} from '../environment.js';
import {pedestrianBridges,pedestrianLiftAt,setCityFootbridges,cityPedestrianBridges} from '../pedestrian-footbridges.js';
import {groundAt} from '../onfoot.js';
import {railPosition} from '../railway.js';
// Include the full off-map train enclosure: checking only the main rail deck missed the second crossing.
for(let u=RAILWAY.stationU;u<RAILWAY.length+225;u+=2){const p=railPosition(u),r=sample(project(p.x,p.z));assert((p.x-r.x)*r.lx+(p.z-r.z)*r.lz < -20,'Rail alignment and off-map train path stay on the station side');}
for(let c=3200;c<3650;c+=3){const p=cycleSample(fromChainage(c));assert(cycleClearance(p.x,p.z)<.12);assert(!sceneryClear(p.x,p.z,18),'Buildings cannot occupy the detoured cycleway');}
// Walk from each track end up to the bridge and back down, then follow the step-free paths.
assert.equal(pedestrianBridges.length,5);
for(const b of pedestrianBridges){
 assert(cycleCrossing(b.centre));
 const middle=b.world(0,0);
 assert(groundAt(middle.x,middle.z,b.centre).y<b.datum+1);
 for(const {side,lift,link} of b.ends){
  const g=crossingGeometry(b.road);
  for(const x of [-2.35,8.2]){const p=b.world(x,side*b.half),lateral=(p.x-g.C.x)*g.n.x+(p.z-g.C.z)*g.n.z;
   assert(Math.abs(lateral)>b.road.halfWidth+b.road.footway,'Both skewed bridge ends clear the roadside footway');}
  const terminal=side===1?b.start:b.end,approach=terminal-side*5;
  assert(!cycleCrossing(approach)&&cycleCrossing(terminal+side*.01));
  const section=cyclingSection(approach);assert.equal(side===1?section.end:section.start,terminal-side*1.6);
  assert.equal(rideablePosition(terminal+side),terminal-side*1.6);
  const p=cycleSample(terminal),toe=b.world(0,side*(b.half+FOOTBRIDGE_FORECOURT));assert(Math.hypot(p.x-toe.x,p.z-toe.z)<.001);
  let y=p.groundY+cycleBridgeHeight(terminal);
  for(const reverse of [false,true]){
   for(let i=0;i<=FOOTBRIDGE_FORECOURT*10;i++){const d=reverse?i/10:FOOTBRIDGE_FORECOURT-i/10;const q=b.world(0,side*(b.half+d)),next=groundAt(q.x,q.z,b.centre,y).y;
    assert(Math.abs(next-y)<.151,'Continuous staircase '+b.road.name);y=next;}
   assert(Math.abs(y-(reverse?lift.base:lift.deck))<.001);
  }
  for(const stop of ['street','bridge']){const y=stop==='street'?lift.base:lift.deck;assert.equal(pedestrianLiftAt({...lift[stop],y}).stop,stop);assert.equal(groundAt(lift[stop].x,lift[stop].z,b.centre,y).y,y);}
  for(let d=0;d<FOOTBRIDGE_FORECOURT;d+=.25)for(const x of [1.95,5.45]){const q=b.world(x,side*(b.half+d+.02));assert.equal(groundAt(q.x,q.z,b.centre,lift.base).y,lift.base);}
  for(let t=.01;t<1;t+=.05){const x=link.from.x+(link.to.x-link.from.x)*t,z=link.from.z+(link.to.z-link.from.z)*t;assert(Math.abs(groundAt(x,z,b.centre,lift.base).y-(link.y0+(link.y1-link.y0)*t))<.05);}
 }
}
const geometry=cycleGeometry(),p=geometry.attributes.position;for(const v of p.array)assert(Number.isFinite(v));
const {network}=JSON.parse(fs.readFileSync(new URL('../../public/street/furniture.json',import.meta.url)));
const {footbridges}=junctions(network,renderedGround);
assert.deepEqual(footbridges.map(({o})=>o.r.id),['city-d3-d1','city-hatsuen-east','city-tin-ha']);
buildNetwork(network,{ground:renderedGround});
setCityFootbridges(footbridges);
for(const {o,d} of footbridges){
 assert(!o.r.crossings.includes(d)&&!o.r.signalCrossings.includes(d)&&!o.r.staggers.has(d));
}
const grade=streetTerrain(network,renderedGround);
for(const b of cityPedestrianBridges){
 const surface=surfaceSampler([{geometry:terrainPatch(b.centre-130,b.centre+130,grade)}]);
 for(const {side,lift} of b.ends)for(let d=0;d<=b.forecourt;d++)for(const off of [-2.3,0,6.1]){
  const q=b.world(off,side*(b.half+d)),ground=surface(q.x,q.z);
  assert(ground!==null&&ground<lift.base-.08,'Terrain through city entrance '+b.road.name);
 }
}
for(const b of cityPedestrianBridges)for(const {side,lift,link} of b.ends){
 let y=lift.base;
 for(let i=0;i<=(b.forecourt+1)*10;i++){
  const q=b.world(0,side*(b.half+b.forecourt-i/10)),next=groundAt(q.x,q.z,b.centre,y).y;
  assert(Math.abs(y-next)<.15,'Walk onto city deck '+b.road.name);y=next;
 }
 assert.equal(y,lift.deck);
 for(const [stop,y] of [['bridge',lift.deck],['street',lift.base]])assert.equal(pedestrianLiftAt({...lift[stop],y}).stop,stop);
 assert(Math.abs(groundAt(link.to.x,link.to.z,b.centre,link.y1).y-link.y1)<.05);
}
const atA7=fromChainage(3883),terrain=terrainPatch(atA7-150,atA7+150,streetTerrain(network,renderedGround));
const terrainTop=surfaceSampler([{geometry:terrain}]);
for(let ch=3800;ch<3960;ch+=.5){
 const s=fromChainage(ch),r=sample(s),width=roadSection(s).right+3.5;
 for(let lateral=-width;lateral<=width;lateral+=.5){
  const y=terrainTop(r.x+r.lx*lateral,r.z+r.lz*lateral);
  assert(y!==null&&y<r.y-.15,'Terrain protrudes at Ch. '+ch);
 }
}
for(const {start,end} of LEVEL_TRACK_GAPS)for(const [s,sign] of [[start,1],[end,-1]]){
 assert(cycleCrossing(s+sign*.01)&&!cycleCrossing(s-sign*.01));
 const floor=surfaceSampler(cycleAprons.map(geometry=>({geometry}))),r=cycleSample(s+sign*.1);
 for(const offset of [-1.9,0,1.9])assert(floor(r.x+r.lx*offset,r.z+r.lz*offset)!==null,'Paved transition across full track width');
}
console.log('Eight footbridges, sixteen stair and lift approaches, cycle terminals and A7 terrain clearance passed');
