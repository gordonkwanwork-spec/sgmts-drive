import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import {fileURLToPath} from 'node:url';
import {LOOP,STOPS,sample} from '../alignment.js';
import {A1_PADS} from '../environment.js';
import {pose} from '../street/roads.js';
import {A1_ROUNDABOUT_SPLATS} from '../a1-roundabout-splats.js';
import hulls from '../a1-roundabout-splats-hulls.json' with {type:'json'};

const root=path.resolve(path.dirname(fileURLToPath(import.meta.url)),'../..');
const assetsDir=path.join(root,'public/assets');
const furniture=JSON.parse(fs.readFileSync(path.join(root,'public/street/furniture.json'),'utf8'));
const lionMatch=fs.readFileSync(path.join(root,'src/a1-lion.js'),'utf8').match(/lat:\s*([^,}]+),\s*along:\s*([^,}]+)/);
assert.ok(lionMatch,'A1_LION coordinates found in src/a1-lion.js');
const A1_LION={lat:Number(lionMatch[1]),along:Number(lionMatch[2])};
const t=sample(STOPS[0].s);
const lionPos={
 x:LOOP.center.x+t.tx*A1_LION.along+t.lx*A1_LION.lat,
 z:LOOP.center.z+t.tz*A1_LION.along+t.lz*A1_LION.lat,
};
const cabins=(furniture.items||[]).filter(i=>i.id.startsWith('a1-wc-pod')||i.id==='a1-rest-quarters').map(i=>({id:i.id,p:pose(i)}));

assert.equal(A1_ROUNDABOUT_SPLATS.length,6,'6 test placements beside the A1 roundabout');

// 1. Validate packed GSP1 files and convex hull metadata
const seenAssets=new Set();
for(const item of A1_ROUNDABOUT_SPLATS){
 const meta=hulls[item.kind];
 assert.ok(meta,`hull metadata exists for ${item.kind}`);
 assert.equal(meta.asset,item.asset,`asset matches hull metadata for ${item.id}`);
 assert.ok(Number.isFinite(meta.height)&&meta.height>0.3&&meta.height<3.0,`realistic height for ${item.kind}: ${meta.height}`);
 assert.ok(Number.isFinite(meta.radius)&&meta.radius>0.2&&meta.radius<3.0,`realistic radius for ${item.kind}: ${meta.radius}`);
 assert.ok(Array.isArray(meta.hull)&&meta.hull.length>=12,`hull points present for ${item.kind}`);
 for(const pt of meta.hull){
  assert.equal(pt.length,3);
  assert.ok(pt.every(Number.isFinite),`finite hull coords for ${item.kind}`);
 }
 if(!seenAssets.has(item.asset)){
  seenAssets.add(item.asset);
  const file=path.join(assetsDir,item.asset);
  assert.ok(fs.existsSync(file),`packed asset exists: ${item.asset}`);
  const buf=fs.readFileSync(file);
  assert.equal(buf.subarray(0,4).toString('ascii'),'GSP1',`${item.asset} has GSP1 magic`);
  const n=buf.readUInt32LE(4);
  const flags=buf.readUInt8(8);
  assert.ok(n>10000,`positive splat count for ${item.asset}: ${n}`);
  assert.ok((flags&1)===1,`${item.asset} flagged most-important-first`);
  assert.equal(buf.length,16+n*26,`expected packed byte length for ${item.asset}`);
 }
}

// 2. Validate roundabout clearances, pads, A1 lion, and cabins
for(const item of A1_ROUNDABOUT_SPLATS){
 const r=Math.hypot(item.along,item.lat);
 if(item.id.startsWith('island-')){
  assert.ok(r<LOOP.innerRadius-0.5,`${item.id} inside island grass (r=${r.toFixed(2)})`);
  for(const pad of A1_PADS){
   const clearAlong=Math.abs(item.along)>pad.length/2+0.6;
   const clearLat=Math.abs(item.lat-pad.lat)>2.0+0.6;
   assert.ok(clearAlong||clearLat,`${item.id} clears pad at lat=${pad.lat}`);
  }
 }else{
  assert.ok(r>=LOOP.outerRadius+1.0&&r<=LOOP.outerRadius+3.5,`${item.id} sits on outer footpath clear of kerb (r=${r.toFixed(2)})`);
 }
 const wx=LOOP.center.x+t.tx*item.along+t.lx*item.lat;
 const wz=LOOP.center.z+t.tz*item.along+t.lz*item.lat;
 const dLion=Math.hypot(wx-lionPos.x,wz-lionPos.z);
 assert.ok(dLion>2.5,`${item.id} clears A1 lion (${dLion.toFixed(2)} m)`);
 for(const c of cabins){
  const dCab=Math.hypot(wx-c.p.x,wz-c.p.z);
  assert.ok(dCab>4.0,`${item.id} clears ${c.id} (${dCab.toFixed(2)} m)`);
 }
}

console.log(`A1 roundabout 3DGS test passed: ${seenAssets.size} packed .gsplat assets, ${A1_ROUNDABOUT_SPLATS.length} placements verified.`);
