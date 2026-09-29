// One-off: writes public/street/furniture.json from the procedural street-furniture rules the game used until
// 26 Sep 2026, so the editable layout starts identical to the old one. Refuses to overwrite unless --force.
// Run: node scripts/seed-furniture.mjs [--force]
import fs from 'node:fs';
import * as T from 'three';
import {LENGTH,STOPS,sample,roadSection,footpathHeight,JUNCTIONS,UNDERPASSES,CROSSINGS,DEPOT,L35,l35Offset,sideCrossing,curveRadius,cycleSample,cycleOffset,cycleBridgeAt,cycleCanopyAt,cycleBridgeHeight,cycleCrossing,CYCLE_BRIDGES,D1ROAD,LOOP,fromChainage} from '../src/alignment.js';
import {l35BendCurve,depotCurve,depotInner} from '../src/routes.js';
import {fenceAllowed,crossingGap} from '../src/environment.js';
import {record,ROAD,pose,CV_FRAME,junctionSignalItems} from '../src/street/roads.js';
import {CV_ROAD_WIDTH} from '../src/depot.js';
import {runPoints} from '../src/street/furniture.js';

const OUT=new URL('../public/street/furniture.json',import.meta.url);
if(fs.existsSync(OUT)&&!process.argv.includes('--force')){console.error('public/street/furniture.json exists; pass --force to overwrite it.');process.exit(1);}
const inJunction=s=>JUNCTIONS.some(j=>Math.abs(s-j.s)<j.halfWidth+6);
const inDepot=s=>Math.abs(s-DEPOT.gate)<DEPOT.opening/2;
const groundCrossing=s=>inJunction(s)||UNDERPASSES.some(j=>Math.abs(j.s-s)<j.halfWidth+.5);
const at=(s,lat)=>{const r=sample(s);return {x:r.x+r.lx*lat,y:r.groundY,z:r.z+r.lz*lat};};
const items=[],runs=[],counts={},id=type=>`${type}-${String(counts[type]=(counts[type]||0)+1).padStart(3,'0')}`;
// Every record must land where the old rule put it (within 1 cm and 0.1°).
const add=(type,road,p,yaw,{ref='kerb',guess,params}={})=>{const it={id:id(type),type,...record(road,p.x,p.y,p.z,yaw,{ref,guess}),...(params?{params}:{})},q=pose(it),turn=Math.abs(Math.atan2(Math.sin(q.yaw-yaw),Math.cos(q.yaw-yaw)));
 if(Math.hypot(q.x-p.x,q.y-p.y,q.z-p.z)>.01||turn>.002)console.warn(`${it.id} on ${road} deviates ${Math.hypot(q.x-p.x,q.y-p.y,q.z-p.z).toFixed(3)} m / ${(turn*180/Math.PI).toFixed(2)}°`);items.push(it);};
const armYaw=(lx,lz)=>Math.atan2(-lx,-lz);// yaw whose local −Z points along (lx,lz)

// Corridor street lamps: 35 m, 27 m near junctions/crossings and on bends; both sides where wide or near a junction.
for(let s=20;s<LENGTH;){const r=sample(s),near=[...JUNCTIONS,...CROSSINGS].some(j=>Math.abs(j.s-s)<55),bend=curveRadius(s)<180,wide=roadSection(s).right>5.5;
 if(!r.elevated&&!inJunction(s)&&!STOPS.some(st=>Math.abs(st.s-s)<st.footprintLength/2+6))for(const side of wide||near?[-1,1]:[1])if(!(side===1&&inDepot(s)))
  add('lamp_road','corridor',at(s,side*(roadSection(s).right+3.95)),armYaw(-r.lx*side,-r.lz*side),{guess:s,params:{height:near&&wide?12:10}});
 s+=near||bend?27:35;}
// Cycle track lamps every 18 m measured along the track.
const roofHalf=st=>st.id==='A1'?19.2:7.05+st.width;
for(let s=10,run=18,prev=cycleSample(10);s<LENGTH-4;s+=1){const here=cycleSample(s);run+=Math.hypot(here.x-prev.x,here.z-prev.z);prev=here;if(run<18)continue;
 const bridge=cycleBridgeAt(s),edge=bridge&&cycleBridgeHeight(s)>.6?2.15:2.3;
 if(cycleCanopyAt(s)||cycleCrossing(s)||!bridge&&[...JUNCTIONS,...UNDERPASSES].some(j=>Math.abs(j.s-s)<j.halfWidth+2))continue;
 const lat=Math.abs(cycleOffset(s)+edge);if(STOPS.some(st=>Math.abs(st.s-s)<st.footprintLength/2+2&&lat<roofHalf(st)+1.6))continue;
 const c=cycleSample(s);add('lamp_cycle','cycleway',{x:c.x+c.lx*edge,y:c.groundY+cycleBridgeHeight(s),z:c.z+c.lz*edge},armYaw(-c.lx,-c.lz),{ref:'centre',guess:s,params:{height:5}});run=0;}
// Cycle-only entry signs face riders entering the track after each road crossing.
for(const j of JUNCTIONS.filter(j=>!CYCLE_BRIDGES.includes(j)))for(const end of [-1,1]){const s=j.s+end*(j.halfWidth+2.8),r=cycleSample(s);add('cycle_sign','cycleway',{x:r.x+r.lx*end*2.5,y:r.groundY+cycleBridgeHeight(s),z:r.z+r.lz*end*2.5},r.heading+(end===1?Math.PI:0),{ref:'centre',guess:s});}
// Roadside furniture on an 18 m rhythm: manholes, post boxes and wayfinding signs.
for(let q=35;q<LENGTH-25;q+=18)for(const side of [-1,1]){
 if(groundCrossing(q)||crossingGap(q-5,q+5)||STOPS.some(st=>Math.abs(st.s-q)<st.footprintLength/2+12)||side===1&&inDepot(q))continue;
 const r=sample(q),edge=roadSection(q).right,level=r.groundY+footpathHeight(q),index=Math.floor((q-35)/18);
 if(index%3===0){const p=at(q+4,side*(roadSection(q+4).right+1.2));p.y=sample(q+4).groundY+footpathHeight(q+4);add('manhole','corridor',p,r.heading,{guess:q+4});}
 if(side===1&&index%12===0){const p=at(q+2,edge+3.2);p.y=sample(q+2).groundY+footpathHeight(q+2);add('pillar_box','corridor',p,r.heading+Math.PI,{guess:q+2});}
 if(index%8===2){const p=at(q,side*(edge+3.3));p.y=level;add('wayfinding_sign','corridor',p,r.heading+Math.PI,{guess:q});}}
// FEHD litter bins: one per crossing (alternating sides) and two diagonally opposite corners of each at-grade junction.
for(const b of [...CROSSINGS.map((c,i)=>({s:c.s+(i%2?4.5:-4.5),side:i%2?1:-1})),...JUNCTIONS.flatMap(j=>[-1,1].map(d=>({s:j.s+d*(j.halfWidth+12.5),side:d})))]){
 if(sample(b.s).elevated||b.side===1&&inDepot(b.s))continue;const r=sample(b.s),p=at(b.s,b.side*(roadSection(b.s).right+3.3));p.y=r.groundY+footpathHeight(b.s);
 add('litter_bin','corridor',p,Math.atan2(b.side*r.lx,b.side*r.lz),{guess:b.s});}
// Connecting-road lamps (arm towards the carriageway).
const roadLamp=(road,p,t,width,side,height)=>{const lx=-t.z,lz=t.x;add('lamp_connecting',road,{x:p.x+lx*side*(width/2+1),y:p.y,z:p.z+lz*side*(width/2+1)},armYaw(-lx*side,-lz*side),{params:{height}});};
for(const j of [...JUNCTIONS,...UNDERPASSES]){const r=sample(j.s);for(let d=-j.extent+8;d<j.extent;d+=26)for(const side of [-1,1]){if(Math.abs(d)<42)continue;
 roadLamp((j.underpass?'U':'J')+j.c,{x:r.x+r.lx*d,y:j.underpass?r.groundY:r.y-r.grade*side*(j.halfWidth+1),z:r.z+r.lz*d},{x:r.lx,z:r.lz},j.halfWidth*2,side,10);}}
{let d1=0;for(let i=1;i<D1ROAD.length;i++){const a=new T.Vector3(D1ROAD[i-1].x,D1ROAD[i-1].y,D1ROAD[i-1].z),b=new T.Vector3(D1ROAD[i].x,D1ROAD[i].y,D1ROAD[i].z),length=a.distanceTo(b),t=b.clone().sub(a).normalize();
 for(let d=d1;d<length;d+=26)for(const side of [-1,1])roadLamp('D1',a.clone().lerp(b,d/length),t,18,side,10);d1=(d1-length)%26;if(d1<0)d1+=26;}}
for(const [road,curve,width] of [['L35-bend',l35BendCurve,L35.width],['depot',depotCurve,7]])for(let d=12;d<(curve===depotCurve?curve.getLength()-depotInner.getLength()+6:curve.getLength()-12);d+=24){const u=d/curve.getLength();roadLamp(road,curve.getPointAt(u),curve.getTangentAt(u),width,-1,7);}
for(let i=8;i<CV_FRAME.length;i+=15){const f=CV_FRAME[i];roadLamp('service',f,{x:f.tx,z:f.tz},CV_ROAD_WIDTH,i%30<15?1:-1,10);}
for(let d=0;d<LOOP.length;d+=20){const p=LOOP.sample(d);roadLamp('loop',p,{x:p.tx,z:p.tz},LOOP.outerRadius-LOOP.innerRadius,-1,7);}
// Combined vehicle/pedestrian poles at both ends of every crossing.
items.push(...junctionSignalItems());

// Railings: unbroken runs between gaps, posts every 1.5 m (the same parameter steps as before).
const RAIL=1.5,addRun=(road,a,b,point,ref)=>{const p=point(a),rec=record(road,p.x,p.y,p.z,0,{ref,guess:ROAD[road].id==='corridor'||road==='L35'?a:undefined}),run={id:id('railing'),type:'railing',road,from:+ROAD[road].toCh(a).toFixed(3),to:+ROAD[road].toCh(b).toFixed(3),side:rec.side,ref,off:rec.off,dy:rec.dy};
 const pts=runPoints(run);let worst=0;for(let k=0;k<pts.length;k++){const q=point(a+k*RAIL);worst=Math.max(worst,Math.hypot(q.x-pts[k].x,q.y-pts[k].y,q.z-pts[k].z));}
 if(worst>.01)console.warn(`${run.id} (${road} ${run.from}–${run.to}) deviates ${worst.toFixed(3)} m`);runs.push(run);};
function railRuns(road,from,to,point,allowed,ref='kerb'){let start=null,end=null;const flush=()=>{if(start!=null)addRun(road,start,end,point,ref);start=null;};
 for(let q=from;q<to;q+=RAIL){if(allowed(q)){if(start==null)start=q;end=q+RAIL;}else flush();}flush();}
for(const j of [...JUNCTIONS,...UNDERPASSES])for(const side of [-1,1]){const r=sample(j.s);
 railRuns((j.underpass?'U':'J')+j.c,-j.extent,j.extent-2,lat=>{const p=at(j.s,lat);return {x:p.x+r.tx*side*(j.halfWidth+.25),y:p.y+.3,z:p.z+r.tz*side*(j.halfWidth+.25)};},lat=>lat>=42||lat+RAIL<=-42);}
for(const side of [-1,1])railRuns('L35',L35.start+30,fromChainage(3310)-4,q=>{const p=at(q,-l35Offset(q)+side*(L35.width/2+.25));p.y+=.3;return p;},q=>!crossingGap(q,q+RAIL));
for(const side of [-1,1])railRuns('corridor',35,LENGTH-3,q=>{const p=at(q,side*(roadSection(q).right+.25));p.y+=footpathHeight(q);return p;},q=>fenceAllowed(q,q+RAIL,side));
// Footpath paving: the colour used to alternate every 240 m, offset by one between the two sides.
const PATTERNS=['red','grey','buff'];
for(let start=0,ch=0;start<LENGTH;start+=240,ch++)for(const [side,k] of [['R',0],['L',1]])runs.push({id:id('paving'),type:'paving',road:'corridor',from:+ROAD.corridor.toCh(start).toFixed(3),to:+ROAD.corridor.toCh(Math.min(start+240,LENGTH)).toFixed(3),side,params:{pattern:PATTERNS[(ch+k)%3]}});

fs.mkdirSync(new URL('.',OUT),{recursive:true});
const json=JSON.stringify({version:1,items,runs},null,0).replace(/\{"id"/g,'\n{"id"');
fs.writeFileSync(OUT,json);
console.log('Wrote',items.length,'items and',runs.length,'runs:',counts);
