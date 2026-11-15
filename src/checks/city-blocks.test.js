// City rebuild 2 (14 Nov 2026): buildings are plots cut from street frontages (src/city/blocks.js). Every plot faces a street
// across a forecourt, stands on its own paved plinth, keeps clear of streets, the corridor and other plots, and takes its
// building type from the OZP zone beneath it. Open space, green belt, logistics lots and the depot take none.
import assert from 'node:assert/strict';
import fs from 'node:fs';
const ctx2d=new Proxy({},{get:(_,k)=>k==='measureText'?()=>({width:0}):k==='createLinearGradient'?()=>({addColorStop(){}}):()=>{},set:()=>true});
globalThis.document??={createElement:()=>({getContext:()=>ctx2d,width:0,height:0})};
const {cityPlots}=await import('../city/plots-headless.js');
const {plotPaving,zoneRule}=await import('../city/blocks.js');
const {networkMask,nearestOn,surfaceSampler}=await import('../street/network.js');
const {renderedGround,sceneryClear}=await import('../environment.js');
const {pointInPolygon}=await import('../lots/wand.js');
const {TYPES}=await import('../city/kit/hk-modern-plan.js');
const T=await import('three');

const network=JSON.parse(fs.readFileSync(new URL('../../public/street/furniture.json',import.meta.url))).network;
const lots=JSON.parse(fs.readFileSync(new URL('../../public/lots/lots.json',import.meta.url))).lots;
const plots=cityPlots(network,lots),roads=plots.roads,mask=networkMask(network,renderedGround),byRoad=new Map(roads.map(o=>[o.r.id,o]));
assert.ok(plots.length>=200,`${plots.length} plots line the streets`);
assert.deepEqual(cityPlots(network,lots).map(p=>p.id+p.type),plots.map(p=>p.id+p.type),'the city is the same on every run');
const lotOf=(x,z)=>lots.find(l=>pointInPolygon([x,z],l.poly));

for(const p of plots){const [w,d]=TYPES[p.type].span;assert.equal(p.w,w);assert.equal(p.d,d);
 // clear of every street, the corridor, the depot and the railway
 for(const [x,z] of [...p.poly,p.c]){assert.ok(!mask.onStreet(x,z,-.1),`${p.id} stands on a street at ${x.toFixed(0)},${z.toFixed(0)}`);assert.ok(sceneryClear(x,z,1),`${p.id} is in the corridor reserve at ${x.toFixed(0)},${z.toFixed(0)}`);}
 // the right use for the OZP zone under it; never in open space, green belt, a logistics lot or the depot
 for(const [x,z] of [...p.poly,p.c]){const l=lotOf(x,z);if(l)assert.equal(zoneRule(l.zone)?.[1],p.group,`${p.id} (${p.group}) reaches into ${l.id} ${l.zone}`);}
 if(p.row===1){// faces its street: the front edge is parallel to it, 2–8 m behind the back of the footway
  const o=byRoad.get(p.road),h=o.P.carriageway/2+o.P.footpath,front=[p.c[0]-p.v[0]*p.d/2,p.c[1]-p.v[1]*p.d/2],n=nearestOn(o.F,...front),set=Math.min(...[-.5,-.25,0,.25,.5].map(a=>nearestOn(o.F,front[0]+p.u[0]*a*p.w,front[1]+p.u[1]*a*p.w).dist))-h;
  assert.ok(set>.3&&set<(p.group==='utility'?3.5:2.2),`${p.id} front is ${set.toFixed(1)} m behind the footway of ${p.road}`);// sandbox: 0.5 m
  assert.ok(Math.abs(p.u[0]*n.f.tx+p.u[1]*n.f.tz)>.96,`${p.id} is not parallel to ${p.road}`);
  assert.ok(Math.abs(p.y-(n.f.y+.2))<.6,`${p.id} plinth ${p.y.toFixed(2)} is not at the footway level ${(n.f.y+.2).toFixed(2)}`);
 }else{const f=plots.find(q=>q.id===p.front);assert.ok(f&&f.lot===p.lot&&f.row===1,`${p.id} has no frontage plot in its lot`);assert.equal(p.y,f.y,'second row shares the plinth level');}
}
// plots never overlap; urban neighbours may share a party wall (separating axis on the rectangles)
const sep=(a,b)=>{for(const [ux,uz] of [a.u,[-a.u[1],a.u[0]],b.u,[-b.u[1],b.u[0]]]){const pr=q=>q.poly.map(([x,z])=>x*ux+z*uz),A=pr(a),B=pr(b);if(Math.min(...A)-Math.max(...B)>-.06||Math.min(...B)-Math.max(...A)>-.06)return true;}return false;};
for(let i=0;i<plots.length;i++)for(let k=i+1;k<plots.length;k++)if(Math.hypot(plots[i].c[0]-plots[k].c[0],plots[i].c[1]-plots[k].c[1])<200)assert.ok(sep(plots[i],plots[k]),`${plots[i].id} and ${plots[k].id} overlap`);
// every built zone group appears, and housing, offices and industry are all present
const groups=new Set(plots.map(p=>p.group));for(const g of ['residential','commercial','mixed','enterprise','industry','civic','village'])assert.ok(groups.has(g),`no ${g} plots`);

// Paving: each plot's whole footprint is paved at plinth level (a building never touches grass), and the forecourt reaches the footway.
const {pos,idx}=plotPaving(plots,roads),geo=new T.BufferGeometry();geo.setAttribute('position',new T.Float32BufferAttribute(pos,3));geo.setIndex(idx);
assert.ok(pos.every(Number.isFinite),'paving geometry is finite');
const height=surfaceSampler([new T.Mesh(geo)]);
for(const p of plots){for(const [x,z] of [...p.poly.map(([x,z])=>[x+(p.c[0]-x)*.03,z+(p.c[1]-z)*.03]),p.c]){const y=height(x,z);/* just inside the corners: party-wall neighbours touch */assert.ok(y!==null&&Math.abs(y-p.y)<.05,`${p.id} is not on its plinth at ${x.toFixed(0)},${z.toFixed(0)}`);}
 if(p.row===1){const o=byRoad.get(p.road),h=o.P.carriageway/2+o.P.footpath,mid=[p.c[0]-p.v[0]*(p.d/2+.25),p.c[1]-p.v[1]*(p.d/2+.25)],n=nearestOn(o.F,...mid),edge=[n.f.x+Math.sign(n.lat)*n.f.lx*(h-.1),n.f.z+Math.sign(n.lat)*n.f.lz*(h-.1)];
  assert.ok(height(...mid)!==null&&height(...edge)!==null,`${p.id} forecourt does not reach the footway of ${p.road}`);}}
// the street wall: most urban frontage plots share a party wall with a neighbour; every plot has a front edge for the kit
const urban=plots.filter(p=>p.row===1&&['residential','commercial','mixed','enterprise','industry'].includes(p.group));
assert.ok(urban.filter(p=>p.roles.includes('party')).length>urban.length*.4,`only ${urban.filter(p=>p.roles.includes('party')).length} of ${urban.length} urban plots share a party wall`);
for(const p of plots){assert.equal(p.roles.length,4);assert.equal(p.roles[0],'front');}
console.log(`city-blocks checks passed: ${plots.length} plots (${plots.filter(p=>p.row===2).length} second-row), all on paved plinths facing a street`);
