// City rebuild 2 (14 Nov 2026): live traffic on the city lane graph (src/city/life.js). The graph covers every street both
// ways with a movement for every turn; cars driven on it for five simulated minutes never touch, never run a red light at a
// corridor crossing, never get stuck, and the ART corridor itself carries no city lane.
import assert from 'node:assert/strict';
import fs from 'node:fs';
const ctx2d=new Proxy({},{get:(_,k)=>k==='measureText'?()=>({width:0}):k==='createLinearGradient'?()=>({addColorStop(){}}):()=>{},set:()=>true});
globalThis.document??={createElement:()=>({getContext:()=>ctx2d,width:0,height:0})};
const {cityGraph}=await import('../city/life-headless.js');
const {createTraffic,stageAt}=await import('../city/life.js');
const {project,sample,roadSection}=await import('../alignment.js');
const network=JSON.parse(fs.readFileSync(new URL('../../public/street/furniture.json',import.meta.url))).network;
const g=cityGraph(network),lanes=g.pieces.filter(p=>p.kind==='lane');

// Graph: both directions of every street (the roundabout one way), no dead ends, every lane reachable.
for(const r of network.roads){const mine=lanes.filter(p=>p.road.r.id===r.id);assert.ok(mine.some(p=>p.dir>0),`${r.id} has no forward lane`);assert.ok(r.loop?!mine.some(p=>p.dir<0):mine.some(p=>p.dir<0),`${r.id} lanes are wrong for ${r.loop?'a roundabout':'a two-way street'}`);}
// Each of the two circulating traffic streams stays on its own side of the painted divider, through the mouths too.
const ringLanes=lanes.filter(p=>p.road.r.loop);
assert.deepEqual([...new Set(ringLanes.map(p=>p.k))].sort(),[0,1]);
for(const p of ringLanes){
 const {ox,oz,R}=p.road.ring,radius=R+(p.k===0?-2:2);
 const onward=p.next.find(q=>q.next[0].road===p.road);
 assert.equal(onward.next[0].k,p.k);
 for(const pt of [...p.pts,...onward.pts])assert.ok(Math.abs(Math.hypot(pt.x-ox,pt.z-oz)-radius)<.3);
}
// A pair of cars at the Give Way line can take the same gap. Traffic leaving the
// roundabout or continuing in a separate lane must not hold the whole approach.
for(const node of g.nodes.filter(n=>n.kind==='ring')){
 const entries=node.turns.filter(t=>t.rule==='minor');
 const through=k=>node.turns.find(t=>t.from.road.r.loop&&t.from.k===k&&t.next[0].road.r.loop);
 const [inner,outer]=[0,1].map(k=>entries.find(t=>t.from.k===k));
 function place(car,piece,s,next,v=0){
  const b=piece.pts.find(pt=>pt.s>s)||piece.pts.at(-1),a=piece.pts[piece.pts.indexOf(b)-1];
  const length=b.s-a.s,u=(s-a.s)/length,tx=(b.x-a.x)/length,tz=(b.z-a.z)/length;
  Object.assign(car,{piece,s,next,v,wait:0,x:a.x+(b.x-a.x)*u,z:a.z+(b.z-a.z)*u,tx,tz});
 }
 const start=(car,entry)=>place(car,entry.from,entry.from.len-car.length/2-.6,entry);
 const traffic=createTraffic(g,{count:3}),[a,b,other]=traffic.cars;
 start(a,inner);start(b,outer);
 const leaving=node.turns.find(t=>t.rule==='major'&&t.from.k===1&&!t.next[0].road.r.loop);
 place(other,leaving,leaving.len/2,leaving.next[0],5);
 for(let tick=0;tick<50;tick++)traffic.step(.05);
 assert.ok(a.piece===inner&&b.piece===outer,'both entry lanes take the same gap while a vehicle exits');
 // The inner entry crosses the outer circulating stream. A vehicle arriving there
 // simultaneously has priority, even when its eventual destination lane differs.
 const sim=createTraffic(g,{count:2}),[waiting,circulating]=sim.cars,ring=through(1);
 start(waiting,inner);place(circulating,ring.from,ring.from.len-4,ring,7);
 sim.step(.05);assert.ok(waiting.held,'inner entry yields across the occupied outer lane');
 for(let tick=0;tick<180;tick++)sim.step(.05);
 assert.ok(waiting.piece!==inner.from,'entry proceeds as soon as the conflict clears');
 start(waiting,outer);
 const separate=through(0);
 place(circulating,separate,separate.len/2,separate.next[0],6);
 sim.step(.05);assert.ok(!waiting.held&&waiting.v>0,'free outer lane accepts traffic beside the occupied inner lane');
}
const {stepCar,CAR}=await import('../city/drive.js'),{networkMask}=await import('../street/network.js');
const driveMask=networkMask(network),carWorld={drivable:(x,z)=>driveMask.onRoad(x,z,-.25),blocked:()=>false};
for(const lane of lanes.filter(p=>p.to.kind==='head')){
 const {r,F}=lane.road,f=F.at(-1),turn=lane.next[0];
 assert.equal(turn.kind,'uturn');
 const exit=turn.next[0];
 assert.equal(exit.road.r.id,r.id);
 assert.equal(exit.k,lane.k);
 assert.equal(exit.dir,-lane.dir);
 for(let i=2;i<turn.pts.length-1;i++){
  const a=turn.pts[i-1],b=turn.pts[i];
  assert.ok((a.x-f.x)*(b.z-f.z)-(a.z-f.z)*(b.x-f.x)>0,r.id+' clockwise circulation');
  assert.ok(Math.hypot(b.x-f.x,b.z-f.z)>r.turningRadius*.32+1.4,r.id+' clears central island');
 }
 // A point can follow an abrupt turn through the mouth where a steering car clips the exit kerb.
 const path=[...lane.pts.slice(-6),...turn.pts.slice(1),...exit.pts.slice(1,6)];
 const [p,q]=path,car={x:p.x,z:p.z,yaw:Math.atan2(p.x-q.x,p.z-q.z),length:4.6,width:1.95,steer:0,v:1.6};
 let target=1;
 for(let tick=0;tick<6000&&target<path.length;tick++){
  // Pure pursuit measures its look-ahead from the bicycle model’s rear axle.
  const rearX=car.x+CAR.wheelbase/2*Math.sin(car.yaw),rearZ=car.z+CAR.wheelbase/2*Math.cos(car.yaw);
  const dx=path[target].x-rearX,dz=path[target].z-rearZ,dist=Math.hypot(dx,dz);
  if(dist<2.75){target++;continue;}
  const angle=Math.atan2(-dx,-dz)-car.yaw;
  const steer=Math.atan(2*CAR.wheelbase*Math.sin(angle)/dist)/CAR.maxSteer;
  stepCar(car,{throttle:car.v<1.7?.35:0,steer:Math.max(-1,Math.min(1,steer))},1/60,carWorld);
 }
 assert.equal(target,path.length,r.id+' player car must exit lane '+lane.k);
}
for(const p of g.pieces)assert.ok(p.next.length||p.exit,`${p.kind} piece ${p.id} on ${p.road?.r.id} leads nowhere`);
assert.ok(g.sources.length>=6,'traffic enters at the map edges');
// (cars keep their lane, so the kerb lanes of the dual roads are fed from the map-edge entries)
const reach=new Set([lanes[0],...g.sources]),queue=[...reach];while(queue.length)for(const q of queue.pop().next)if(!reach.has(q)){reach.add(q);queue.push(q);}
const lost=lanes.filter(p=>!reach.has(p));assert.equal(lost.length,0,`unreachable lanes: ${lost.slice(0,5).map(p=>p.road.r.id+(p.dir>0?'+':'−')).join(' ')}`);
assert.equal(g.nodes.filter(n=>n.kind==='crossing').length,6,'six corridor crossings');assert.equal(g.nodes.filter(n=>n.kind==='signal'&&n.arms===2).length,3,'three signal crossroads');assert.ok(g.nodes.filter(n=>n.kind==='signal'&&n.arms===1).length>=6,'signalised major T-junctions');assert.equal(g.nodes.filter(n=>n.kind==='ring').length,4,'four roundabout entries');
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
// Pedestrians: footway lines on both sides of the streets, never on a carriageway; people keep walking and stay on them.
{const {cityFootways}=await import('../city/life-headless.js'),{createPeople}=await import('../city/life.js'),{junctions,nearestOn}=await import('../street/network.js'),{renderedGround}=await import('../environment.js');
 const paths=cityFootways(network),net=junctions(network,renderedGround);assert.ok(paths.length>60&&paths.reduce((s,p)=>s+p.len,0)>15000,`${paths.length} footway stretches`);
 // on a carriageway: inside any street's kerbs (a joining road's last 14 m lie on its host and are judged by the host)
 const joined=new Set(net.joins.map(j=>j.A.r.id+':'+j.end)),onRoad=(x,z)=>net.roads.some(o=>{const n=nearestOn(o.F,x,z),L=o.F.at(-1).d;
  return n.dist<o.P.carriageway/2-.3&&!(joined.has(o.r.id+':0')&&n.d<14)&&!(joined.has(o.r.id+':1')&&n.d>L-14);});
 for(const p of paths)for(const q of p.pts)assert.ok(!onRoad(q.x,q.z),`footway line of ${p.road} is on a carriageway at ${q.x.toFixed(0)},${q.z.toFixed(0)}`);
 const P=createPeople(paths,{count:28}),walked=new Map();for(let i=0;i<1200;i++){P.step(.05,{});for(const h of P.people)walked.set(h.id,(walked.get(h.id)||0)+(h.moved||0));}
 for(const h of P.people){assert.ok(h.path&&Number.isFinite(h.x+h.y+h.z),'person placed');assert.ok(walked.get(h.id)>30,`person ${h.id} walked only ${walked.get(h.id).toFixed(0)} m in a minute`);assert.ok(!onRoad(h.x,h.z),'person on a carriageway');}}
// Crossroads stages (the signal heads show these): major → all-red → arm0 → all-red → arm1 → all-red, 63 s, next stage named.
{const seq=[];for(let t=0;t<63;t+=.5){const s=stageAt({id:0},t),k=s.stage??'red>'+s.next;if(seq.at(-1)!==k)seq.push(k);assert.ok(s.left>0&&s.left<=26);}
 assert.deepEqual(seq,['major','red>arm0','arm0','red>arm1','arm1','red>major']);}
console.log(`city-life checks passed: ${lanes.length} lanes (${(lanes.reduce((s,p)=>s+p.len,0)/1000).toFixed(1)} km), ${g.pieces.filter(p=>p.kind==='turn').length} junction movements, 2 × 5 min of traffic clean`);
