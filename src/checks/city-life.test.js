// City rebuild 2 (14 Nov 2026): live traffic on the city lane graph (src/city/life.js). The graph covers every street both
// ways with a movement for every turn; cars driven on it for five simulated minutes never touch, never run a red light at a
// corridor crossing, never get stuck, and the ART corridor itself carries no city lane.
import assert from 'node:assert/strict';
import fs from 'node:fs';
const ctx2d=new Proxy({},{get:(_,k)=>k==='measureText'?()=>({width:0}):k==='createLinearGradient'?()=>({addColorStop(){}}):()=>{},set:()=>true});
globalThis.document??={createElement:()=>({getContext:()=>ctx2d,width:0,height:0})};
const {cityGraph}=await import('../city/life-headless.js');
const {createTraffic}=await import('../city/life.js');
const {project,sample,roadSection}=await import('../alignment.js');
const network=JSON.parse(fs.readFileSync(new URL('../../public/street/furniture.json',import.meta.url))).network;
const g=cityGraph(network),lanes=g.pieces.filter(p=>p.kind==='lane');

// Graph: both directions of every street (the roundabout one way), no dead ends, every lane reachable.
for(const r of network.roads){const mine=lanes.filter(p=>p.road.r.id===r.id);assert.ok(mine.some(p=>p.dir>0),`${r.id} has no forward lane`);assert.ok(r.loop?!mine.some(p=>p.dir<0):mine.some(p=>p.dir<0),`${r.id} lanes are wrong for ${r.loop?'a roundabout':'a two-way street'}`);}
for(const p of g.pieces)assert.ok(p.next.length||p.exit,`${p.kind} piece ${p.id} on ${p.road?.r.id} leads nowhere`);
assert.ok(g.sources.length>=6,'traffic enters at the map edges');
// (cars keep their lane, so the kerb lanes of the dual roads are fed from the map-edge entries)
const reach=new Set([lanes[0],...g.sources]),queue=[...reach];while(queue.length)for(const q of queue.pop().next)if(!reach.has(q)){reach.add(q);queue.push(q);}
const lost=lanes.filter(p=>!reach.has(p));assert.equal(lost.length,0,`unreachable lanes: ${lost.slice(0,5).map(p=>p.road.r.id+(p.dir>0?'+':'−')).join(' ')}`);
assert.equal(g.nodes.filter(n=>n.kind==='crossing').length,6,'six corridor crossings');assert.equal(g.nodes.filter(n=>n.kind==='crossroads').length,3);assert.equal(g.nodes.filter(n=>n.kind==='ring').length,4,'four roundabout entries');
// Lanes never lie on the ART carriageway: the only pieces over it are the six crossings (the two only meet at shared junctions).
for(const p of g.pieces)if(p.kind!=='cross')for(const q of p.pts){const s=project(q.x,q.z),c=sample(s);if(Math.abs(q.y-c.y)<3)assert.ok(Math.hypot(q.x-c.x,q.z-c.z)>roadSection(s).right+1,`${p.kind} on ${p.road?.r.id||p.node?.kind} runs on the corridor at ${q.x.toFixed(0)},${q.z.toFixed(0)}`);}
// Turns slow down, straight-ahead movements keep the street's speed, and lane geometry is finite.
for(const p of g.pieces){assert.ok(p.pts.every(q=>[q.x,q.y,q.z,q.s].every(Number.isFinite)),`piece ${p.id} geometry`);if(p.kind==='turn'&&p.dir!=='straight')assert.ok(p.vmax<=6);}

// Simulation: 50 cars, 5 minutes, signals at the corridor crossings on a 30 s green / 30 s red cycle.
for(const seed of [7,21]){let green=true;const T=createTraffic(g,{count:50,seed,signal:()=>green}),moved=new Set();let closest=1e9;
 for(let i=0;i<6000;i++){green=(i*.05)%60<30;T.step(.05,{});
  if(i%4===0)for(const a of T.cars){if(a.v>2)moved.add(a.id);for(const b of T.cars)if(a.id<b.id&&a.piece&&b.piece)closest=Math.min(closest,Math.hypot(a.x-b.x,a.z-b.z));}}
 assert.ok(closest>=1.9,`seed ${seed}: two cars came within ${closest.toFixed(2)} m`);assert.equal(T.stats.redRuns,0,`seed ${seed}: red-light runs`);
 assert.equal(T.stats.respawns,0,`seed ${seed}: stuck cars ${(T.stats.stuck||[]).join('; ')}`);assert.equal(moved.size,50,`seed ${seed}: every car drove`);assert.ok(T.stats.exits>20,'cars leave at the map edge and are recycled');}
// A red light holds a queue; a blocker (the player's vehicle, a person) is never driven into.
{const T=createTraffic(g,{count:50,seed:3,signal:()=>false});for(let i=0;i<3600;i++)T.step(.05,{});
 assert.equal(T.cars.filter(c=>c.piece?.kind==='cross'&&c.piece.hold!=null&&c.s>c.piece.hold+1).length,0,'no car passes a stop line on red');assert.ok(T.cars.some(c=>c.held),'cars queue at the red light');}
{const T=createTraffic(g,{count:50,seed:5});for(let i=0;i<600;i++)T.step(.05,{});const c=T.cars.find(c=>c.v>8&&c.piece.kind==='lane'&&c.piece.len-c.s>80),b={x:c.x+c.tx*40,z:c.z+c.tz*40,r:1};
 for(let i=0;i<400;i++){T.step(.05,{blockers:[b]});assert.ok(Math.hypot(c.x-b.x,c.z-b.z)>c.length/2+1,'car stops short of an obstacle in its lane');}}
console.log(`city-life checks passed: ${lanes.length} lanes (${(lanes.reduce((s,p)=>s+p.len,0)/1000).toFixed(1)} km), ${g.pieces.filter(p=>p.kind==='turn').length} junction movements, 2 × 5 min of traffic clean`);
