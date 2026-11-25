// City rebuild 2 (14 Nov 2026): the city street network is a graph with no conflicts. Roads touch only at declared
// junctions, meet square, keep their distance along a host, stay off the corridor and the railway, and are drivable grades.
import assert from 'node:assert/strict';
import fs from 'node:fs';
const ctx2d=new Proxy({},{get:(_,k)=>k==='measureText'?()=>({width:0}):k==='createLinearGradient'?()=>({addColorStop(){}}):()=>{},set:()=>true});
globalThis.document??={createElement:()=>({getContext:()=>ctx2d,width:0,height:0})};
const {junctions,presetOf,nearestOn,reserveClash,centreline,halfWidth,frameAt}=await import('../street/network.js');
const {project,sample,RAILWAY,railSample}=await import('../alignment.js');
const {renderedGround}=await import('../environment.js');
const {D5_MOUTH}=await import('../depot.js');

const network=JSON.parse(fs.readFileSync(new URL('../../public/street/furniture.json',import.meta.url))).network;
const {roads,joins}=junctions(network,renderedGround),byId=new Map(roads.map(o=>[o.r.id,o]));
assert.ok(roads.length>=30,`the city has ${roads.length} streets`);
const km=roads.reduce((s,o)=>s+o.F.at(-1).d,0)/1000;assert.ok(km>13,`street length ${km.toFixed(1)} km`);

// 1. Every road end is a corridor crossing, a junction, a turning head or the map edge (250 m or more from the corridor).
const joined=new Set(joins.map(j=>j.A.r.id+':'+j.end));
for(const {r,F} of roads){if(r.loop)continue;
 for(const end of [0,1]){const f=end?F.at(-1):F[0],kind=(end?r.endTie:r.tie)?'tie':joined.has(r.id+':'+end)?'join':end&&r.turningRadius?'head':'edge';
  if(kind==='edge'){const c=sample(project(f.x,f.z));assert.ok(Math.hypot(f.x-c.x,f.z-c.z)>250,`${r.id} end ${end} is loose at ${f.x.toFixed(0)},${f.z.toFixed(0)}`);}}}

// 2. Junctions meet at 70° or more (TPDM: 70–110°) and at least 60 m apart along their host, except the two arms of a crossroads.
for(const j of joins){const cos=Math.abs(j.a[0]*j.at.tx+j.a[1]*j.at.tz),angle=Math.acos(Math.min(1,cos))*180/Math.PI;
 assert.ok(angle>=69.5,`${j.A.r.id} meets ${j.B.r.id} at ${angle.toFixed(0)}°`);}
for(const a of joins)for(const b of joins){if(a===b||a.B!==b.B)continue;const gap=Math.abs(a.at.d-b.at.d);
 assert.ok(gap<5&&a.side!==b.side||gap>=(a.B.r.loop?40:60),`${a.A.r.id} and ${b.A.r.id} join ${a.B.r.id} only ${gap.toFixed(0)} m apart`);}// roundabout arms: 40 m of ring between centres
const crossroads=joins.filter(a=>joins.some(b=>b!==a&&b.B===a.B&&Math.abs(a.at.d-b.at.d)<5));
assert.equal(crossroads.length,6,'three crossroads: D1/D3/D4, Tin Ha Road/Ha Tsuen Road, D1/D2');

// 3. No carriageway overlaps another outside a junction between the two (or a crossroads they share).
const linked=(A,B,x,z,reach)=>joins.some(j=>(j.A===A&&j.B===B||j.A===B&&j.B===A||(j.A===A||j.A===B)&&joins.some(k=>k!==j&&k.B===j.B&&(k.A===A||k.A===B)&&Math.abs(k.at.d-j.at.d)<5))&&Math.hypot(j.at.x-x,j.at.z-z)<reach);
for(let i=0;i<roads.length;i++)for(let k=i+1;k<roads.length;k++){const A=roads[i],B=roads[k],reach=A.P.carriageway/2+B.P.carriageway/2;
 for(const f of A.F){if(Math.round(f.d)%2)continue;const n=nearestOn(B.F,f.x,f.z);if(n.dist>=reach)continue;
  assert.ok(linked(A,B,f.x,f.z,reach+25),`${A.r.id} overlaps ${B.r.id} at ${f.x.toFixed(0)},${f.z.toFixed(0)} away from any junction`);}}

// 4. One connected network: junctions join roads, and the two arms of a corridor crossing are one road across it.
const parent=new Map(roads.map(o=>[o.r.id,o.r.id])),find=a=>parent.get(a)===a?a:find(parent.get(a)),union=(a,b)=>parent.set(find(a),find(b));
for(const j of joins)union(j.A.r.id,j.B.r.id);
const ties=new Map();for(const {r} of roads)for(const t of [r.tie,r.endTie])if(t){if(ties.has(t.junction))union(r.id,ties.get(t.junction));else ties.set(t.junction,r.id);}
assert.equal(new Set(roads.map(o=>find(o.r.id))).size,1,'every street is reachable from every other');
assert.equal(ties.size,6,'all six corridor crossings carry a city street');

// 5. Clear of the SGMTS corridor reserve (tie stubs excepted) and of the railway viaduct (Road D8 passes beside VB1).
const rail=[];for(let s=RAILWAY.start;s<=RAILWAY.end;s+=10){const p=railSample(s);rail.push(p);}
for(const {r,F} of roads){let P=centreline(r.pts);if(r.tie)P=P.slice(2);if(r.endTie)P=P.slice(0,-2);
 assert.equal(reserveClash(P,{width:halfWidth(r)}),null,`${r.id} enters the corridor reserve`);
 if(!/d8-(west|east)$/.test(r.id))for(const f of F){
  const overhead=rail.find(p=>Math.hypot(p.x-f.x,p.z-f.z)<halfWidth(r)+6);
  if(!overhead)continue;
  assert.ok(['city-crossing-east','city-tin-ha'].includes(r.id)&&overhead.y-1.3-f.y>=5.1,`${r.id} lacks a clear grade-separated railway crossing at ${f.x},${f.z}`);
 }}

// 6. The roundabout is a circle (its host line is not straightened at the arms) with four arms meeting it radially.
const ring=byId.get('city-roundabout'),cx=ring.F.slice(0,-1).reduce((s,f)=>s+f.x,0)/(ring.F.length-1),cz=ring.F.slice(0,-1).reduce((s,f)=>s+f.z,0)/(ring.F.length-1);
for(const f of ring.F){const d=Math.hypot(f.x-cx,f.z-cz);assert.ok(Math.abs(d-32)<.25,`roundabout radius ${d.toFixed(2)} m at d=${f.d.toFixed(0)}`);}
assert.equal(joins.filter(j=>j.B===ring).length,4,'four arms on the roundabout');

// 7. Drivable: no street steeper than 6 % over 20 m (the ground away from the corridor is one smooth field).
for(const {r,F} of roads)for(let i=20;i<F.length;i++){const g=Math.abs(F[i].y-F[i-20].y)/(F[i].d-F[i-20].d);assert.ok(g<=.06,`${r.id} climbs ${(g*100).toFixed(1)} % at d=${F[i].d.toFixed(0)}`);}

// 8. The depot service road starts on Road D5's north kerb.
const d5=byId.get('city-d5-west'),m=nearestOn(d5.F,D5_MOUTH.x,D5_MOUTH.z);
assert.ok(Math.abs(m.dist-d5.P.carriageway/2)<.5,`depot service road mouth is ${m.dist.toFixed(1)} m from Road D5's centreline`);
assert.ok(Math.abs(m.f.y+.18-D5_MOUTH.y)<.25,`depot service road mouth level ${D5_MOUTH.y} vs Road D5 footway ${(m.f.y+.18).toFixed(2)}`);
// Smooth roads (Gordon, 16 Nov: no kinks): over any 12 m of a street as drawn, the circumradius stays at or above 38 m on a dual
// carriageway and 28 m on a local road (filleted at 60 / 45 m in build-city-network.mjs; junction mouths straightened in network.js).
{const rad=(a,b,c)=>{const A=Math.hypot(b.x-c.x,b.z-c.z),B=Math.hypot(a.x-c.x,a.z-c.z),C=Math.hypot(a.x-b.x,a.z-b.z),cr=Math.abs((b.x-a.x)*(c.z-a.z)-(b.z-a.z)*(c.x-a.x));return cr<1e-9?Infinity:A*B*C/(2*cr);};
 for(const {r,P,F} of roads){if(r.loop)continue;const min=P.median>0?38:28;for(let d=6;d<F.at(-1).d-6;d+=1){const R=rad(frameAt(F,d-6),frameAt(F,d),frameAt(F,d+6));assert.ok(R>=min,`${r.id} bends at ${R.toFixed(0)} m radius at d=${d}`);}}}
console.log(`city-network checks passed: ${roads.length} streets, ${km.toFixed(1)} km, ${joins.length} junction arms`);
