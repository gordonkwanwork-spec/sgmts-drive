// Geometry checks use an image handle; browser checks verify embedded textures.
globalThis.self??=globalThis;
globalThis.createImageBitmap??=async()=>({width:1024,height:1024,close(){}});
// Street furniture checks (node): road chainage frames, public/street/furniture.json validity, runs and paving overrides.
// Run: node src/checks/furniture.test.js
import assert from 'node:assert/strict';
import fs from 'node:fs';
import {ROADS,ROAD,pose,record,locate} from '../street/roads.js';
import {CATALOGUE,runPoints,pavingAt,RAIL,isModel} from '../street/furniture.js';
import {JUNCTIONS,sample,sideCrossing} from '../alignment.js';

// Every road: pose → record → pose lands within 1 cm and 0.01°, for kerb and centreline offsets on both sides.
for(const road of ROADS)for(let i=1;i<10;i++){const ch=road.toCh(road.p0+(road.p1-road.p0)*i/10);
 for(const it of [{road:road.id,ch,side:'L',off:2.3,rot:30},{road:road.id,ch,side:'R',ref:'centre',off:1.1,rot:-90,dy:.2}]){
  const P=pose(it),rec=record(road.id,P.x,P.y,P.z,P.yaw,{ref:it.ref||'kerb'}),Q=pose(rec);
  assert(Math.hypot(P.x-Q.x,P.y-Q.y,P.z-Q.z)<.01,`${road.id} round trip at Ch ${ch.toFixed(1)}`);assert(Math.abs(rec.rot-it.rot)<.01,`${road.id} rotation at Ch ${ch.toFixed(1)}`);}}
{const P=pose({road:'corridor',ch:1234,side:'L',off:3}),l=locate(P.x,P.z);assert.equal(l.road.id,'corridor');assert(Math.abs(l.ch-1234)<.01&&l.lat>0,'locate finds corridor chainage and side');}

// The data file: unique ids, known roads/types, chainages on the road, runs with from < to, signals on real junctions.
const data=JSON.parse(fs.readFileSync(new URL('../../public/street/furniture.json',import.meta.url),'utf8')),models=new URL('../../public/street/models/',import.meta.url);
const ids=new Set();
for(const e of [...data.items,...data.runs]){assert(!ids.has(e.id),'duplicate id '+e.id);ids.add(e.id);const road=ROAD[e.road];assert(road,`${e.id}: unknown road ${e.road}`);assert(['L','R'].includes(e.side),`${e.id}: side`);
 const range=[road.toCh(road.p0)-.01,road.toCh(road.p1)+.01],on=c=>c>=range[0]&&c<=range[1];
 if('from' in e){assert(CATALOGUE[e.type]?.kind==='run',`${e.id}: run type`);assert(e.from<e.to&&on(e.from)&&on(e.to),`${e.id}: from < to on ${e.road}`);if(e.type==='paving')assert.equal(e.road,'corridor');}
 else{assert(isModel(e.type)?fs.existsSync(new URL(e.type.slice(4),models)):CATALOGUE[e.type]?.kind==='point',`${e.id}: type ${e.type}`);assert(on(e.ch),`${e.id}: Ch ${e.ch} on ${e.road}`);
  if(e.type==='traffic_signal')assert(JUNCTIONS.some(j=>j.c===e.params?.junction),`${e.id}: junction`);}}

// Railing posts: bays of at most 1.5 m, from the first chainage to the last.
{const run={road:'corridor',from:1000,to:1037.3,side:'L',off:.25},pts=runPoints(run),gaps=pts.slice(1).map((p,i)=>Math.hypot(p.x-pts[i].x,p.z-pts[i].z));
 assert(gaps.every(g=>g<=RAIL+.01&&g>1),'railing bays ≤ 1.5 m (equal along the road; offset bends vary them slightly)');const a=pose({...run,ch:1000}),b=pose({...run,ch:1037.3});
 assert(Math.hypot(pts[0].x-a.x,pts[0].z-a.z)<1e-6&&Math.hypot(pts.at(-1).x-b.x,pts.at(-1).z-b.z)<1e-6,'railing ends at from/to');}
// Paving: a later run overrides the seeded 240 m band underneath it; other side untouched.
{const s=ROAD.corridor.toParam(1500),base={runs:[{type:'paving',road:'corridor',from:1400,to:1640,side:'L',params:{pattern:'red'}}]};
 assert.equal(pavingAt(base,s,1),'red');base.runs.push({type:'paving',road:'corridor',from:1490,to:1510,side:'L',params:{pattern:'grey'}});
 assert.equal(pavingAt(base,s,1),'grey');assert.equal(pavingAt(base,s,-1),null);}
console.log(`Street furniture: ${ROADS.length} road frames round-trip, ${data.items.length} items and ${data.runs.length} runs valid, railing bays and paving overrides passed`);

// HK layout (TD diagram): per approach a primary at the stop line and a secondary beyond the junction, both on the driver's left
// (+lat is left of the corridor direction) facing the approaching traffic; a pedestrian head on the junction side of each crossing end
// facing across it; the secondaries share their pole with that crossing end's pedestrian head.
for(const j of JUNCTIONS){const r=sample(j.s),h=j.halfWidth,items=data.items.filter(i=>i.type==='traffic_signal'&&i.params.junction===j.c&&i.id!=='signal-2650-L35'),ends=new Set();
 const frame=(it,turn=0)=>{const p=pose(it),dx=p.x-r.x,dz=p.z-r.z,a=p.yaw+turn,fx=-Math.sin(a),fz=-Math.cos(a);return {lat:dx*r.lx+dz*r.lz,ds:dx*r.tx+dz*r.tz,ft:fx*r.tx+fz*r.tz,fl:fx*r.lx+fz*r.lz};};
 const vehicles=items.filter(i=>i.params.axis!=='pedestrian');assert.equal(vehicles.length,8,`${j.c}: eight vehicle heads`);
 for(const it of vehicles){const f=frame(it),primary=it.id.endsWith('primary');
  if(it.params.axis==='corridor'){assert(Math.abs(f.ft)>.99,`${it.id}: faces along the corridor`);const d=-Math.sign(f.ft);
   assert(Math.sign(f.lat)===d,`${it.id}: on the driver's left`);assert(Math.sign(f.ds)===(primary?-d:d)&&(primary?Math.abs(f.ds)>h+11.5:Math.abs(f.ds)<h+8.5),`${it.id}: ${primary?'at the stop line':'beyond the junction'}`);}
  else{assert(Math.abs(f.fl)>.99,`${it.id}: faces along the side road`);const A=Math.sign(f.fl),C=sideCrossing(j,A);
   assert(Math.sign(f.ds)===A&&Math.abs(f.ds)<h+2,`${it.id}: on the driver's left`);assert(primary?Math.sign(f.lat)===A&&Math.abs(f.lat)>C+1.5:Math.sign(f.lat)===-A&&Math.abs(f.lat)<sideCrossing(j,-A)-1.5,`${it.id}: ${primary?'at the stop line':'beyond the junction'}`);}}
 const peds=[...items.filter(i=>i.params.axis==='pedestrian').map(i=>[i,0]),...items.filter(i=>Number.isFinite(i.params.pedYaw)).map(i=>[i,i.params.pedYaw*Math.PI/180])];assert.equal(peds.length,8,`${j.c}: eight pedestrian heads`);
 for(const [it,turn] of peds){const f=frame(it,turn);
  if(it.params.crossing==='side'){const A=Math.sign(f.lat);assert(Math.sign(f.ft)===-Math.sign(f.ds)&&Math.abs(f.ft)>.99,`${it.id}: pedestrian faces across the side crossing`);assert(Math.abs(f.lat)<sideCrossing(j,A)-1.5,`${it.id}: junction side of the crossing`);ends.add(`s${A}${Math.sign(f.ds)}`);}
  else{assert(Math.sign(f.fl)===-Math.sign(f.lat)&&Math.abs(f.fl)>.99,`${it.id}: pedestrian faces across the corridor crossing`);assert(Math.abs(f.ds)<h+8.5&&Math.abs(f.ds)>h,`${it.id}: junction side of the crossing`);ends.add(`c${Math.sign(f.ds)}${Math.sign(f.lat)}`);}}
 assert.equal(ends.size,8,`${j.c}: every crossing end has its pedestrian head`);
}
console.log('Primary/secondary vehicle heads on the left and inside pedestrian heads at every crossing end passed');
// The pedestrian attachment must contain no second full-height pole.
const {GLTFLoader}=await import('three/addons/loaders/GLTFLoader.js');
const {Box3}=await import('three');
const raw=fs.readFileSync(new URL('../../public/assets/street-kit.glb',import.meta.url));
const kit=await new Promise((resolve,reject)=>new GLTFLoader().parse(raw.buffer.slice(raw.byteOffset,raw.byteOffset+raw.byteLength),'',resolve,reject));
const head=kit.scene.getObjectByName('signal_pedestrian_head');assert(head,'Pole-free pedestrian head exists');
assert(new Box3().setFromObject(head).min.y>2,'Pedestrian attachment has no extra pole');

// Corridor smart poles: one housing at E, original banners, and a light beneath the lantern.
const noop=new Proxy(function(){},{get:()=>noop,apply:()=>noop,set:()=>true});
globalThis.document??={createElement:()=>({getContext:()=>noop})};
const {placeFurniture}=await import('../street/furniture.js');
for(const height of [5.1,8,10,12]){
 const item={id:'smart-check',type:'lamp_road',road:'corridor',ch:1200,side:'L',off:1,params:{height}},P=pose(item),parts=[];
 const out=placeFurniture({items:[item]},{batch:(key,geometry,material,pos,scale)=>parts.push({key,geometry,pos,scale}),kitParts:()=>[]});
 assert.deepEqual(out.errors,[]);assert.equal(out.lampPositions.length,1);
 const housing=parts.filter(p=>p.key==='furn-smart-housing-E');assert.equal(housing.length,1);
 assert(Math.abs(housing[0].pos.y-housing[0].scale.y/2-P.y-(height<7?2.22:2.6))<1e-9,'E housing lower edge follows drawing');
 assert.equal(parts.filter(p=>p.key==='furn-banner').length,height>=7?2:0,'Existing back-to-back ads retained');
 const shaft=parts.find(p=>p.key==='furn-smart-column');assert.equal(shaft.geometry.type,'CylinderGeometry');assert.equal(shaft.scale.x*2,.219);
 assert(Math.abs(out.lampPositions[0].y-P.y-height+.12)<1e-9,'Light stays beneath the lantern');
 const noBanner=[];placeFurniture({items:[{...item,params:{height,banner:false}}]},{batch:key=>noBanner.push(key),kitParts:()=>[]});assert(!noBanner.includes('furn-banner'));
}
console.log('Smart lamp round columns, E-only housing, retained banners and lantern heights passed');
// Cycle-track leaf pole: two lanterns on opposite sides, each light beneath its lantern.
{const item={id:'leaf-check',type:'lamp_cycle',road:'cycleway',ch:600,side:'L',off:2.3,params:{height:5}},parts=[];
 const out=placeFurniture({items:[item]},{batch:(key,geometry,material,pos)=>parts.push({key,pos}),kitParts:()=>[]});
 assert.deepEqual(out.errors,[]);assert.equal(out.lampPositions.length,2);
 const lanterns=parts.filter(p=>p.key==='furn-cycle-lantern');assert.equal(lanterns.length,2);assert.equal(parts.filter(p=>/^furn-cycle-leaf-/.test(p.key)).length,2);
 out.lampPositions.forEach((l,i)=>assert(Math.hypot(l.x-lanterns[i].pos.x,l.z-lanterns[i].pos.z)<1e-9&&l.y<lanterns[i].pos.y,'Light beneath its lantern'));
 const [a,b]=out.lampPositions,P=pose(item),side=l=>(l.x-P.x)*Math.sin(P.yaw)+(l.z-P.z)*Math.cos(P.yaw);assert(side(a)*side(b)<0,'Leaves on opposite sides');}
console.log('Cycle-track leaf pole passed');

{const {CYCLE_BRIDGES,cycleCanopyAt}=await import('../alignment.js');
 for(const j of CYCLE_BRIDGES){const parts=[],item={id:'covered-cycle-check',type:'lamp_cycle',road:'cycleway',ch:ROAD.cycleway.toCh(j.s),side:'L',off:2.15};
  const out=placeFurniture({items:[item]},{batch:(...p)=>parts.push(p),kitParts:()=>[]});
  assert.equal(parts.length,0,'No poles or leaf heads beneath cycle canopies');assert.equal(out.lampPositions.length,0,'No phantom pole light');
  assert(!cycleCanopyAt(j.s+j.halfWidth+12),'Uncovered ramps retain their lighting');}
 assert(!data.items.some(i=>i.type==='lamp_cycle'&&i.road==='cycleway'&&cycleCanopyAt(pose(i).s)),'Saved bridge poles removed');}
console.log('Covered cycle bridges exclude pole furniture and pole light sources');

// A1 terminus: no lamp columns on the loop; feeder pillars stand on the island pads; cabins clear of the cycle track and loop walk.
{const {LOOP,STOPS,cycleOffset,CYCLE_WIDTH}=await import('../alignment.js'),{A1_PADS}=await import('../environment.js'),{CABIN}=await import('../street/operator-kit.js');
 assert(!data.items.some(i=>i.road==='loop'&&i.type.startsWith('lamp_')),'A1 loop has no lamp columns');
 const t=sample(STOPS[0].s),pillars=data.items.filter(i=>i.type==='feeder_pillar'&&i.id.startsWith('a1-'));
 assert.equal(pillars.length,A1_PADS.reduce((n,p)=>n+p.pillars,0),'A1 pillar count');
 for(const it of pillars){const P=pose(it),dx=P.x-LOOP.center.x,dz=P.z-LOOP.center.z,along=dx*t.tx+dz*t.tz,lat=dx*t.lx+dz*t.lz;
  assert(Math.hypot(dx,dz)+1.2<LOOP.innerRadius,it.id+' inside the island');
  assert(A1_PADS.some(p=>Math.abs(lat-p.lat)<=2-.56&&Math.abs(along)<=p.length/2-1.06),it.id+' on a hardstanding');}
 const rest=data.items.find(i=>i.id==='a1-rest-quarters'),R=pose(rest),q=sample(R.s),lat=Math.abs((R.x-q.x)*q.lx+(R.z-q.z)*q.lz);
 assert(lat-CABIN.depth/2-rest.params.apron>=-cycleOffset(R.s)+CYCLE_WIDTH/2-.01,'Rest quarters apron stays off the cycle track');
 for(const it of data.items.filter(i=>i.id.startsWith('a1-wc-pod'))){const P=pose(it);assert(Math.hypot(P.x-LOOP.center.x,P.z-LOOP.center.z)-CABIN.depth/2-it.params.apron>=LOOP.outerRadius+3.75-.01,it.id+' beyond the loop footpath');}
 console.log(`A1 facilities: ${pillars.length} feeder pillars on ${A1_PADS.length} island pads, rest quarters and WC pods clear of paths; no loop lamps`);}
{const parts=[],items=data.items.filter(i=>/^a1-(rest|wc-pod-1|feeder-pillar-11)/.test(i.id)),out=placeFurniture({items},{batch:(key,g,m,pos,scale)=>parts.push({key,pos,scale,m}),kitParts:()=>[]});
 assert.deepEqual(out.errors,[],'Operator kit builds');assert(parts.length>400&&parts.every(p=>[p.pos.x,p.pos.y,p.pos.z,p.scale.x,p.scale.y,p.scale.z].every(Number.isFinite)),'Finite operator kit parts');
 // Instanced batches keep the first material per key, so a key must never carry two materials.
 const mat=new Map();for(const p of parts){if(mat.has(p.key))assert.equal(mat.get(p.key),p.m,'One material per batch key: '+p.key);mat.set(p.key,p.m);}
 assert.equal(out.clearings.length,items.length,'Every building clears its planting');assert(out.fences.filter(f=>f.wall).length===items.length*4,'Closed collision outline per building');
 console.log(`Operator kit: ${parts.length} parts for ${items.length} items, one material per key`);}
