import assert from 'node:assert/strict';
import { safeSpeed, energyFlow, boxesOverlap, SCENARIOS } from './simulation.js';
assert.equal(safeSpeed(-5), 0);
assert(safeSpeed(30, 0.8) < safeSpeed(30, 1.3));
assert(energyFlow(10, 1, 0, 90, 1).power > energyFlow(10, 1, 0, 0, 1).power);
assert(energyFlow(10, -1.5, 0, 0, 1).recovered > 0);
assert(energyFlow(-2, -0.8, 0, 0, 1).power > 9);
assert.equal(energyFlow(0, 0, 0, 0, 1).power, 9);
const a = { cx: 0, cz: 0, hw: 1, hl: 5, heading: 0 };
assert(boxesOverlap(a, { x: 0, z: 0, hw: 1, hl: 5, heading: Math.PI / 2 }));
assert(!boxesOverlap(a, { x: 8, z: 0, hw: 1, hl: 5, heading: 0 }));
assert.equal(Object.keys(SCENARIOS).length, 3);
console.log('Simulation checks passed: braking, load, regeneration, idle and crossing-box collisions.');

import {selfCheck,STOPS,fromChainage,sample,LOOP} from './alignment.js';
import {tractionLocked,verticalOverlap,doorsFit,freeStep} from './operating.js';
import {readFileSync,existsSync} from 'node:fs';
selfCheck();
assert.equal(STOPS.length,7);assert.equal(LOOP.innerRadius,13.5);assert.equal(LOOP.outerRadius,20);
assert(sample(fromChainage(1950)).y>sample(fromChainage(2310)).y+7,'At-grade profile must not be flattened');
assert(sample(fromChainage(350)).elevated);assert(!sample(fromChainage(1500)).elevated);
assert(sample(fromChainage(350)).y>sample(fromChainage(350)).groundY+5,'Deck remains above independent ground');
assert(tractionLocked({park:false,door:0,doorTarget:1,ramp:0,rampTarget:0,hold:0}));
assert(tractionLocked({park:false,door:0,doorTarget:0,ramp:1,rampTarget:0,hold:0}));
assert(!verticalOverlap({yBottom:8,yTop:12},{yBottom:0,yTop:2}));
assert(verticalOverlap({yBottom:0,yTop:3},{yBottom:1,yTop:2}));
assert(doorsFit([{along:0,lateral:6.74,floor:.05}],{length:89.6}));
assert(!doorsFit([{along:46,lateral:6.74,floor:.05}],{length:89.6}));
assert(!doorsFit([{along:0,lateral:6.74,floor:.05}],{length:89.6},-1));
assert.deepEqual(freeStep(0,2,0,0,1,0,0,10,1),{x:0,y:2,z:-10});
assert.deepEqual(freeStep(0,2,0,0,0,1,0,10,1),{x:-10,y:2,z:0});
assert.equal(freeStep(0,2,0,0,1,1,1,10,1).y,2+10/Math.sqrt(3));
const manifest=JSON.parse(readFileSync('public/assets/asset-manifest.json','utf8'));
assert.equal(manifest.stations.length,7);for(const id of ['art',...STOPS.map(s=>'station-'+s.id)]){assert(existsSync(`assets/blender/${id}.blend`));let b=readFileSync(`public/assets/${id}.glb`);assert.equal(b.readUInt32LE(0),0x46546c67);assert.equal(b.readUInt32LE(4),2);assert.equal(b.readUInt32LE(8),b.length);}
console.log('Drawing alignment, platform rules, traction interlocks, grade separation and all 8 Blender/GLB assets passed.');

import {LENGTH,roadSection,TAPER} from './alignment.js';
import {ribbon} from './environment.js';
assert.deepEqual(roadSection(1200),{left:-3.8,right:3.8});
for(const st of STOPS){const c=st.s,h=st.footprintLength/2+st.stagger/2;
 for(const s of [c-h,c,c+h]){const w=roadSection(s);assert(w.right>=7.05-1e-9);assert.equal(w.left,-w.right);}
 for(const side of [-1,1]){if(st.id==='A1'&&side===-1)continue;let prev=7.05;for(let d=0;d<=TAPER;d++){const w=roadSection(c+side*(h+d));assert.equal(w.left,-w.right);assert(w.right>=3.8&&w.right<=7.05);prev=w.right;}assert(prev>=3.8&&prev<=6,'Taper meets the dimensioned running carriageway');}
}
const edges=[[-100,100],[s=>roadSection(s).left,s=>roadSection(s).right],[s=>roadSection(s).left-3.75,s=>roadSection(s).left],[s=>roadSection(s).right,s=>roadSection(s).right+3.75],[s=>roadSection(s).left-.05,s=>roadSection(s).left+.05],[s=>roadSection(s).right-.05,s=>roadSection(s).right+.05],[-.045,.045],[-3.845,-3.755],[3.755,3.845],[s=>roadSection(s).left-.1,s=>roadSection(s).right+.1]];
let triangles=0;
for(let s=0;s<LENGTH;s+=240)for(const [l,r] of edges){const g=ribbon(s,Math.min(s+240,LENGTH),l,r),p=g.attributes.position,idx=g.index.array;assert(idx.length>0,'Ribbon must retain visible surface');for(let i=0;i<idx.length;i+=3){const [a,b,c]=idx.slice(i,i+3),up=(p.getZ(b)-p.getZ(a))*(p.getX(c)-p.getX(a))-(p.getX(b)-p.getX(a))*(p.getZ(c)-p.getZ(a));assert(up>0,`Reversed ribbon triangle at ${s}`);triangles++;}g.dispose();}
console.log(`Road widths and 40 m station tapers at all seven stops,  ${triangles} non-reversed ribbon triangles passed.`);
for(const name of 'game world vehicle traffic route scenery signals textures hud cameras input style'.split(' '))assert(!existsSync(`src/${name}.${name==='style'?'css':'js'}`),'Unreachable legacy implementation must stay removed');
console.log('All twelve unreachable legacy source files are absent.');

import {GLTFLoader} from 'three/addons/loaders/GLTFLoader.js';
import {Vector3} from 'three';
const rawA1=readFileSync('public/assets/station-A1.glb'),a1=await new Promise((resolve,reject)=>new GLTFLoader().parse(rawA1.buffer.slice(rawA1.byteOffset,rawA1.byteOffset+rawA1.byteLength),'',resolve,reject));a1.scene.updateMatrixWorld(true);
for(const side of [-1,1]){const platform=a1.scene.getObjectByName('A1_platform_'+side),slab=platform.getObjectByName(platform.name+'_concrete'),pts=[];assert(slab,'Authored A1 platform slab');const pos=slab.geometry.attributes.position;for(let i=0;i<pos.count;i++)pts.push(new Vector3().fromBufferAttribute(pos,i).applyMatrix4(slab.matrixWorld));const straight=pts.filter(v=>Math.abs(v.z)<20).map(v=>Math.abs(v.x)),width=Math.max(...straight)-Math.min(...straight);assert(Math.abs(width-5)<.3,`A1 straight platform width ${width}`);const widest=pts.reduce((a,b)=>Math.abs(a.x)>Math.abs(b.x)?a:b);assert(widest.z>24.8&&widest.z<=44.9,'A1 flare must be within 20 m of the +Z loop end');console.log(`A1 platform ${side}: straight width ${width.toFixed(3)} m, widest slab at local Z ${widest.z.toFixed(2)} m.`);}

// Current driving contract supersedes the former sideways-at-rest acceptance test.
import {driveStep} from './operating.js';
import {cycleGeometry} from './environment.js';
let motion=driveStep(0,0,0,0,.4,2);assert.deepEqual(motion,{x:0,z:0,heading:0});
const left=driveStep(0,0,0,8,.4,1),right=driveStep(0,0,0,8,-.4,1);assert(left.heading>0&&left.x<0&&right.heading<0&&right.x>0);const straight=driveStep(left.x,left.z,left.heading,8,0,1);assert.equal(straight.heading,left.heading);assert(straight.x<left.x);const back=driveStep(0,0,0,-2,.4,1);assert(back.heading<0&&back.z>0);
for(const st of STOPS){const a=sample(st.s);for(let d=-44;d<=44;d+=2){const b=sample(st.s+d);assert(Math.abs((b.x-a.x)*a.lx+(b.z-a.z)*a.lz)<.01,st.id+' road must follow straight station');}}
const cycle=cycleGeometry();assert(cycle.index.count>0&&cycle.index.count<(cycle.attributes.position.count/2-1)*6,'Cycle path is interrupted at crossing roads');for(let i=0;i<cycle.attributes.position.count;i+=2){const a=new Vector3().fromBufferAttribute(cycle.attributes.position,i),b=new Vector3().fromBufferAttribute(cycle.attributes.position,i+1);assert(Math.abs(a.distanceTo(b)-4)<.002);}
for(const st of manifest.stations){const raw=readFileSync('public/assets/station-'+st.id+'.glb'),asset=await new Promise((resolve,reject)=>new GLTFLoader().parse(raw.buffer.slice(raw.byteOffset,raw.byteOffset+raw.byteLength),'',resolve,reject));asset.scene.updateMatrixWorld(true);for(const side of [-1,1]){const group=asset.scene.getObjectByName(st.id+'_platform_'+side),sand=group.getObjectByName(group.name+'_sand'),ps=sand.geometry.attributes.position,seat=[],back=[];for(let i=0;i<ps.count;i++){const p=new Vector3().fromBufferAttribute(ps,i).applyMatrix4(sand.matrixWorld);if(Math.abs(p.z)<20){if(p.y>.95)back.push(Math.abs(p.x));if(p.y>.73&&p.y<.87)seat.push(Math.abs(p.x));}}assert(back.length&&seat.length);assert(back.reduce((a,b)=>a+b)/back.length>seat.reduce((a,b)=>a+b)/seat.length,st.id+' bench backs must be outside the seats');}}
console.log('Heading-driven forward/reverse steering, seven straight station corridors, all bench orientations and 4 m cycle path with crossing breaks passed.');

// Drawing correction regressions: actual steering circle, clearances and source profiles.
import {TURN_RADIUS,MAX_WHEEL_ANGLE,WHEELBASE} from './operating.js';
import {BRIDGES,PROFILE,profileHeight,CROSSINGS,footpathHeight,cycleOffset,CYCLE_WIDTH,toChainage} from './alignment.js';
import {UNDERPASSES} from './environment.js';
assert.equal(TURN_RADIUS,15);
assert(Math.abs(WHEELBASE/Math.tan(MAX_WHEEL_ANGLE)-15)<1e-10);
let circle={x:0,z:0,heading:0};for(let i=0;i<3600;i++)circle=driveStep(circle.x,circle.z,circle.heading,15,MAX_WHEEL_ANGLE,2*Math.PI/3600);
assert(Math.hypot(circle.x,circle.z)<1e-8,'Full-lock motion closes a 15 m circle');
let minimum=Infinity;
for(let s=2;s<LENGTH-2;s++){const a=sample(s-1),b=sample(s+1),k=Math.abs(Math.atan2(Math.sin(b.heading-a.heading),Math.cos(b.heading-a.heading)))/2;minimum=Math.min(minimum,1/k);}
assert(minimum>20,'Road bends leave margin beyond vehicle full lock');
for(const [c,y] of PROFILE)assert(Math.abs(profileHeight(c)-y)<1e-9,'FRL anchor '+c);
assert(Math.abs(profileHeight(371.1)-17.94)<1e-9);
assert(Math.abs(profileHeight(3390)-22.66)<1e-9);
for(const b of BRIDGES){assert.equal(sample(fromChainage((b.start+b.deckStart)/2)).structure,'ramp');assert.equal(sample(fromChainage((b.deckStart+b.deckEnd)/2)).structure,'deck');for(let c=b.start;c<b.end;c+=5)assert(roadSection(fromChainage(c)).right>=4.55-1e-9);}
for(const j of UNDERPASSES){const r=sample(j.s),b=BRIDGES.find(b=>b.id===r.bridge);assert(r.y-r.groundY-b.depth>5.1,'Underpass clearance '+b.id);assert(!b.piers.some(c=>Math.abs(fromChainage(c)-j.s)<j.halfWidth+1.5),'Piers must clear the busy road');}
assert(CROSSINGS.length>=12);for(const c of CROSSINGS){assert(!sample(c.s).elevated);assert.equal(footpathHeight(c.s),.02);}
assert(Math.abs(footpathHeight(STOPS[1].s)-.30)<1e-12);
assert.equal(CYCLE_WIDTH,4);for(const st of STOPS.filter(st=>st.id!=='A6'))assert(Math.abs(-cycleOffset(st.s)-CYCLE_WIDTH/2-7.05-st.width-.6)<1e-9,'Cycle track verge clears '+st.id+' back edge');
const terminal=sample(STOPS[0].s),dx=LOOP.center.x-terminal.x,dz=LOOP.center.z-terminal.z;assert(Math.abs(dx*terminal.lx+dz*terminal.lz)<1e-8,'Loop and station share an axis');assert(Math.abs(Math.hypot(dx,dz)-61.55)<1e-8);
assert.equal(toChainage(LENGTH),4526);
console.log(`Drawing corrections passed: minimum centreline radius ${minimum.toFixed(1)} m; 15 m steering, bridge FRLs/clearances, crossings, cycle adjacency and terminal registration.`);

// Actor stops are direction-independent and cannot step through a red stop line.
const {approachStep}=await import('./operating.js');
for(const direction of [-1,1]){let position=-direction*30,speed=10;for(let i=0;i<600;i++){const step=approachStep(position,speed,direction,10,0,1/60);position=step.position;speed=step.speed;assert(position*direction<=0);}assert(Math.abs(position)<.001);assert.equal(speed,0);}
const {sceneryClear}=await import('./environment.js');
for(let s=0;s<LENGTH;s+=30){const r=sample(s);assert(!sceneryClear(r.x,r.z,10));}
console.log('Realism checks passed: both traffic directions stop without overshoot; scenery clears the full alignment.');

// Latest layout and service queue regressions.
const {CHANNELS,JUNCTIONS,DEPOT,L35,cycleCrossing}=await import('./alignment.js');
const {followingStop}=await import('./operating.js');
assert.equal(JUNCTIONS.length,3);assert(JUNCTIONS.every(j=>Math.abs(toChainage(j.s)-660)>50));
assert(CHANNELS[0].s<STOPS[1].s&&CHANNELS[1].s>STOPS[1].s&&CHANNELS[1].s<STOPS[2].s);
assert(JUNCTIONS.find(j=>j.name==='Road D1').s>STOPS[6].s+80);
assert.equal(DEPOT.opening,30);assert.equal(BRIDGES[1].end,3524.2);
assert(-cycleOffset((L35.start+L35.end)/2)-2>L35.offset+L35.width/2);
for(const j of JUNCTIONS)assert(cycleCrossing(j.s));
for(const c of CROSSINGS)for(const st of STOPS)assert(Math.abs(c.s-st.s)>st.length/2+20,'Crossing outside platform and bus bay');
for(const dir of [-1,1]){const leader={s:dir*100,dir,active:true},follower={s:0,v:10,dir,active:true};for(let i=0;i<1200;i++){const m=approachStep(follower.s,follower.v,dir,10,followingStop(follower.s,dir,[leader,follower],follower),1/60);follower.s=m.position;follower.v=m.speed;}assert(Math.abs((leader.s-follower.s)*dir-40)<.001);assert.equal(follower.v,0);leader.s+=dir*20;const m=approachStep(follower.s,follower.v,dir,10,followingStop(follower.s,dir,[leader]),1);assert(m.speed>0);}
console.log('Latest layout and queue regressions passed: channels, D1, depot opening, L35, crossing positions and both-direction following.');

assert(followingStop(100,1,[{s:120,dir:1,active:true}])<100,'Emergency following stop remains behind an already-too-close follower');
assert(L35.end>STOPS[5].s+300,'L35 continues past A6 toward VB2');

const {laneOffset,curveRadius}=await import('./alignment.js');
for(let s=0;s<LENGTH;s+=.5){for(const dir of [-1,1]){assert.ok(Math.abs(laneOffset(s,dir))<=roadSection(s).right-1.6+1e-5,'Bay path remains within carriageway');assert.ok(Math.abs(laneOffset(s+.01,dir)-laneOffset(s,dir))<.002,'Continuous distance-based bay path');}}
assert.ok(Math.min(...Array.from({length:Math.floor(LENGTH/2)-10},(_,i)=>curveRadius(10+i*2)))>28,'No short-radius key-plan kinks');
console.log('Smooth bay paths and broadened curves passed.');

const {musicLevels}=await import('./audio.js');
const cruise={screen:'driving',mode:'service',condition:'morning',v:10,park:false,crashed:false};
assert.equal(musicLevels({...cruise,screen:'menu'}).menu,.65);
assert.equal(musicLevels(cruise).day,.65);
assert.equal(musicLevels({...cruise,condition:'night'}).night,.65);
assert.equal(musicLevels({...cruise,condition:'night'}).day,0);
for(const extra of [{v:0},{crashed:true},{park:true},{mobileBrake:true},{screen:'paused'}])assert.equal(musicLevels({...cruise,...extra}).day,0);
console.log('Menu/day/night selection and stop/crash music fade targets passed.');

const {returnOffset,CROSSOVER_START}=await import('./alignment.js');
assert.equal(returnOffset(CROSSOVER_START),1.9);
assert.equal(returnOffset(CROSSOVER_START-70),-1.9);
for(let s=CROSSOVER_START-75;s<LENGTH;s+=.1)assert(Math.abs(returnOffset(s+.01)-returnOffset(s))<.002,'Crossover remains spatially continuous');
for(const st of STOPS)assert.equal(laneOffset(st.s,1,[st.id]),1.9,'Express branch remains in through lane');
const {terminalCurve,depotCurve,l35BendCurve,l35TrafficCurve}=await import('./routes.js');
for(const curve of [terminalCurve,depotCurve,l35BendCurve,l35TrafficCurve])for(let i=0;i<=100;i++){const p=curve.getPointAt(i/100);assert([p.x,p.y,p.z].every(Number.isFinite),'Shared branch route has finite coordinates');}
console.log('Express, crossover and shared branch route checks passed.');

assert.equal(ribbon(0,0,-1,1).attributes.position.count,0,'Clipped empty ribbons have no invalid vertices');

// Cab eye anchors and controls must be exported with the vehicle, not drawn on the camera.
const artBuffer=readFileSync('public/assets/art.glb');
const artJSON=JSON.parse(artBuffer.subarray(20,20+artBuffer.readUInt32LE(12)).toString());
for(const [prefix,count] of [['driver_eye',2],['cockpit_section_',2],['passenger_interior_',3],['cab_display',10]])assert.equal(artJSON.nodes.filter(n=>n.name?.startsWith(prefix)&&(prefix==='cab_display'||n.mesh===undefined)).length,count,prefix+' Blender nodes');
assert(manifest.vehicle.triangles<100000,'Detailed vehicle stays within the geometry budget');

const {fenceAllowed,stationAccess}=await import('./environment.js');
for(const c of [...CROSSINGS,...JUNCTIONS.flatMap(j=>[-1,1].map(d=>({s:j.s+d*(j.halfWidth+10)})))])for(const side of [-1,1])for(let q=c.s-7;q<c.s+6;q+=.5)if(q+2.2>c.s-6)assert(!fenceAllowed(q,q+2.2,side),'Fence must leave the full crossing opening clear');
for(const st of STOPS)for(const platform of st.platforms)for(const dir of [-1,1]){
 const {a,b,end}=stationAccess(st,platform,dir),r=sample(end);
 for(const p of [...a,...b])assert(p.toArray().every(Number.isFinite));
 assert(Math.abs(b[0].y-r.groundY-footpathHeight(end)-.003)<1e-9,'Ramp meets sidewalk without a step');
 assert(a[0].distanceTo(a[1])>st.width-.001,'Full-width station entrance');
 assert(Math.abs(a[0].y-b[0].y)/a[0].distanceTo(b[0])<1/12,'Station approach remains a gentle ramp');
}
console.log('Intersection fence openings and all station ramp endpoints passed.');
