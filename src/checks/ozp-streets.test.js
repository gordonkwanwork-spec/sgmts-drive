// City rebuild (5 Nov 2026). This test used to pin the old illustrative OZP streets (5 ozp- roads, 753 furniture items) and the
// old shared-junction baseline (scripts/corridor-junction-baseline.json). Gordon asked for every road except the SGMTS corridor to
// be removed and the network and junctions rebuilt to the OZP, so it now checks the rebuilt network instead:
// · each corridor crossing sits where an OZP road reserve crosses the corridor, between the viaduct piers when underneath;
// · every crossing arm continues as a network road; T-junction ends lie on their host; nothing enters the corridor reserve;
// · no road or junction arm comes within 2 m of a logistics building (Gordon: keep them; roads go around them);
// · the at-grade junction geometry is ordered: kerb returns inside the kerb gaps, ART stop line before the crossing.
import assert from 'node:assert/strict';
import fs from 'node:fs';
const context2d=new Proxy({},{get:(_,k)=>k==='measureText'?()=>({width:0}):k==='createLinearGradient'||k==='createRadialGradient'?()=>({addColorStop(){}}):()=>{},set:()=>true});
globalThis.document={createElement:()=>({getContext:()=>context2d,width:0,height:0})};
const {centreline,frames,halfWidth,junctions,reserveClash,nearestOn}=await import('../street/network.js');
const {JUNCTIONS,UNDERPASSES,BRIDGES,crossingGeometry,fromChainage,sample}=await import('../alignment.js');
const {pointInPolygon}=await import('../lots/wand.js'),{massingParts}=await import('../lots/massing.js'),{sceneryClear}=await import('../environment.js');
const data=JSON.parse(fs.readFileSync(new URL('../../public/street/furniture.json',import.meta.url))),n=data.network,lots=JSON.parse(fs.readFileSync(new URL('../../public/lots/lots.json',import.meta.url))).lots;

// Crossing positions (chainage) read off the OZP road-reserve centrelines on the project underlay.
const OZP={'Crossing road':1681,'Ha Tsuen Road':2546,'Road D1':[3971,4398],'Road D3':3400,'Road D8':371};
for(const j of [...JUNCTIONS,...UNDERPASSES]){const want=[OZP[j.name]].flat(),err=Math.min(...want.map(c=>Math.abs(c-j.c)));assert(err<=(j.name==='Road D8'?16:2),`${j.name} at Ch ${j.c} follows the OZP reserve`);}
for(const j of UNDERPASSES){const g=crossingGeometry(j),b=BRIDGES.find(b=>b.id===sample(j.s).bridge);assert(b,`${j.name} passes under a viaduct`);
 for(const c of b.piers){const along=Math.abs(fromChainage(c)-j.s);assert(along>(j.halfWidth+j.footway)/g.cos+1,`${j.name} clears pier at Ch ${c}`);}}

assert(n.roads.length>=20&&n.roads.every(r=>r.id.startsWith('city-')),'only the rebuilt network remains');
for(const j of [...JUNCTIONS,...UNDERPASSES])for(const side of [-1,1])assert(n.roads.some(r=>[r.tie,r.endTie].some(t=>t?.junction===j.c&&t.side===side)),`${j.name} arm ${side} continues`);
const graph=junctions(n);assert(graph.joins.length>=11,'side roads join their hosts');
for(const r of n.roads){const P=centreline(r.pts),skip=(r.tie?2:0),tail=(r.endTie?2:0);assert.equal(reserveClash(P.slice(skip,P.length-tail),{width:halfWidth(r)}),null,`${r.id} clear of the corridor`);
 for(const p of r.pts)assert(p.every(Number.isFinite));}

// Logistics buildings as the game places them (allowedKept: scenery clearance only), against roads and junction arms + 2 m.
const keep=lots.filter(l=>/Logistics Facility/.test(l.zone)).flatMap(l=>massingParts(l,{ground:()=>0,allowed:(x,z,r)=>sceneryClear(x,z,r)}).footprints);
assert(keep.length>=4,'all four logistics warehouses stand');
const band=(P,hw)=>{const out=[];for(let i=1;i<P.length;i++){const [ax,az]=P[i-1],[bx,bz]=P[i],L=Math.hypot(bx-ax,bz-az)||1,k=Math.max(1,Math.ceil(L/2));for(let t=0;t<=k;t++){const x=ax+(bx-ax)*t/k,z=az+(bz-az)*t/k;for(const e of [-hw,-hw/2,0,hw/2,hw])out.push([x-(bz-az)/L*e,z+(bx-ax)/L*e]);}}return out;};
let probes=0;
for(const r of n.roads)for(const p of band(centreline(r.pts),halfWidth(r)+2)){probes++;for(const f of keep)assert(!pointInPolygon(p,f),`${r.id} reaches a logistics building at ${p.map(v=>v.toFixed(0))}`);}
for(const j of [...JUNCTIONS,...UNDERPASSES]){const g=crossingGeometry(j),A=d=>[g.C.x+g.u.x*d,g.C.z+g.u.z*d];
 for(const p of band([A(-j.extent),A(j.extent)],j.halfWidth+j.footway+2)){probes++;for(const f of keep)assert(!pointInPolygon(p,f),`${j.name} arm reaches a logistics building`);}}

for(const j of JUNCTIONS){const g=crossingGeometry(j);
 assert(g.crossS[-1]<j.s&&j.s<g.crossS[1],'corridor crossings either side');assert(j.s-j.stop<g.crossS[-1]-1.6&&j.s+j.stop>g.crossS[1]+1.6,'ART stop lines before the crossings');
 for(const σ of [-1,1]){assert(Math.abs(g.stopD[σ])>Math.abs(g.crossD[σ])+1.6,'side stop line behind its crossing');assert(Math.abs(g.crossD[σ])<j.extent-5,'crossing on the arm');}}
console.log(`Rebuilt OZP network: ${n.roads.length} roads, ${graph.joins.length} T-junctions, ${JUNCTIONS.length}+${UNDERPASSES.length} corridor crossings on the OZP reserves; ${probes} probes clear of ${keep.length} logistics buildings.`);
