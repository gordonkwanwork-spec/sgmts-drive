// The Hung Shui Kiu channel (src/city/river.js): east of the corridor, flowing north towards Tin Shui Wai, cut into the
// ground, clear of every city street except where Ha Tsuen Road crosses the culvert gap, inside the terrain, and off every plot.
import assert from 'node:assert/strict';
import fs from 'node:fs';
const ctx2d=new Proxy({},{get:(_,k)=>k==='measureText'?()=>({width:0}):k==='createLinearGradient'?()=>({addColorStop(){}}):()=>{},set:()=>true});
globalThis.document??={createElement:()=>({getContext:()=>ctx2d,width:0,height:0})};
const {RIVERS,riverDepth,riverReserve,riverMeshes,DEPTH,BANK}=await import('../city/river.js');
const {junctions,nearestOn,halfWidth}=await import('../street/network.js');
const {renderedGround,channelDepth,sceneryClear,CITY_TERRAIN_RADIUS}=await import('../environment.js');
const {project,sample}=await import('../alignment.js');
const {cityPlots}=await import('../city/plots-headless.js');
const network=JSON.parse(fs.readFileSync(new URL('../../public/street/furniture.json',import.meta.url))).network,lots=JSON.parse(fs.readFileSync(new URL('../../public/lots/lots.json',import.meta.url))).lots;
const roads=junctions(network,renderedGround).roads;
assert.equal(RIVERS.length,2,'two reaches: south and north of the Ha Tsuen Road culvert');
const all=RIVERS.flatMap(r=>r.pts.map(p=>({r,p})));
assert.ok(all[0].p[1]>all.at(-1).p[1]+1500&&all.at(-1).p[0]>all[0].p[0],'the river runs north for over 1.5 km and leaves north-east (towards Tin Shui Wai)');
for(const {r,p:[x,z]} of all){const c=sample(project(x,z)),d=Math.hypot(x-c.x,z-c.z);
 assert.ok(x>c.x&&d>150,`river at ${x.toFixed(0)},${z.toFixed(0)} is not east of the corridor`);assert.ok(d<CITY_TERRAIN_RADIUS-100,`river at ${x.toFixed(0)},${z.toFixed(0)} is off the level terrain (${d.toFixed(0)} m)`);
 assert.equal(riverDepth(x,z),DEPTH);assert.equal(channelDepth(x,z),DEPTH,'the terrain is cut');assert.ok(!sceneryClear(x,z,1),'scenery keeps out');
 for(const o of roads){const n=nearestOn(o.F,x,z);assert.ok(n.dist>r.width/2+BANK+halfWidth(o.r)+2,`river meets ${o.r.id} at ${x.toFixed(0)},${z.toFixed(0)} (${n.dist.toFixed(0)} m)`);}}
// the culvert: Ha Tsuen Road passes between the two reaches on uncut ground
{const a=RIVERS[0].pts.at(-1),b=RIVERS[1].pts[0],mid=[(a[0]+b[0])/2,(a[1]+b[1])/2],road=roads.find(o=>o.r.id==='city-hatsuen-east'),n=nearestOn(road.F,...mid);
 assert.ok(n.dist<12,'Ha Tsuen Road crosses in the gap');for(let lat=-12;lat<=12;lat+=4)assert.equal(riverDepth(n.f.x+n.f.lx*lat,n.f.z+n.f.lz*lat),0,'the road stands on solid ground');}
assert.equal(riverDepth(RIVERS[0].pts[5][0]-RIVERS[0].width/2-BANK-1,RIVERS[0].pts[5][1]),0,'no cut beyond the walls');
for(const p of cityPlots(network,lots))for(const [x,z] of [...p.poly,p.c])assert.ok(!riverReserve(x,z),`${p.id} stands in the channel reserve`);
const g=riverMeshes(renderedGround);assert.deepEqual(g.children.map(m=>m.name).sort(),['Channel promenade','Channel walls','Channel water']);
for(const m of g.children)assert.ok([...m.geometry.attributes.position.array].every(Number.isFinite),m.name+' geometry is finite');
console.log(`city-river checks passed: ${RIVERS.length} reaches, ${all.length} points, clear of ${roads.length} streets`);
