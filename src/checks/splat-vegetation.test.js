import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import {fileURLToPath} from 'node:url';
import {LOOP,RAILWAY,STOPS,sample} from '../alignment.js';
import {pose} from '../street/roads.js';
import {A1_ROUNDABOUT_SPLATS} from '../a1-roundabout-splats.js';
import {A1_ROUNDABOUT_VEGETATION,SPLAT_VEGETATION_CATALOG} from '../splat-vegetation.js';
import hulls from '../splat-vegetation-hulls.json' with {type:'json'};

const root=path.resolve(path.dirname(fileURLToPath(import.meta.url)),'../..');
const assetsDir=path.join(root,'public/assets');
const furniture=JSON.parse(fs.readFileSync(path.join(root,'public/street/furniture.json'),'utf8'));
const t=sample(STOPS[0].s);
const cabins=(furniture.items||[]).filter(i=>i.id.startsWith('a1-wc-pod')||i.id==='a1-rest-quarters').map(i=>({id:i.id,p:pose(i)}));

assert.equal(Object.keys(SPLAT_VEGETATION_CATALOG).length,4,'4 reusable vegetation asset kinds');
assert.equal(A1_ROUNDABOUT_VEGETATION.length,7,'7 A1 roundabout lawn vegetation placements');

const checkHull=(pts,label)=>{
 assert.ok(Array.isArray(pts)&&pts.length>=12,`${label} has >=12 hull points`);
 for(const pt of pts){
  assert.equal(pt.length,3);
  assert.ok(pt.every(Number.isFinite),`${label} coords are finite`);
 }
};

// 1. Validate packed .gsplat files and hull metadata for all 4 catalog kinds
for(const [kind,entry] of Object.entries(SPLAT_VEGETATION_CATALOG)){
 const meta=hulls[kind];
 assert.ok(meta,`hull metadata exists for ${kind}`);
 assert.equal(meta.asset,entry.asset,`asset matches catalog for ${kind}`);
 assert.equal(meta.category,entry.category,`category matches catalog for ${kind}`);
 if(meta.category==='tree'){
  assert.ok(meta.height>=4.5&&meta.height<=10,`tree height realistic for ${kind}: ${meta.height}`);
  checkHull(meta.trunkHull,`${kind}.trunkHull`);
  checkHull(meta.canopyHull,`${kind}.canopyHull`);
 }else{
  assert.ok(meta.height>=1.2&&meta.height<=2.6,`bush height realistic for ${kind}: ${meta.height}`);
  checkHull(meta.bodyHull,`${kind}.bodyHull`);
 }
 assert.ok(Number.isFinite(meta.radius)&&meta.radius>=0.8&&meta.radius<=8.0,`radius realistic for ${kind}: ${meta.radius}`);

 const file=path.join(assetsDir,entry.asset);
 assert.ok(fs.existsSync(file),`packed asset exists: ${entry.asset}`);
 const buf=fs.readFileSync(file);
 assert.equal(buf.subarray(0,4).toString('ascii'),'GSP1',`${entry.asset} has GSP1 magic`);
 const n=buf.readUInt32LE(4);
 const flags=buf.readUInt8(8);
 assert.ok(n>=50000,`${entry.asset} has >=50k splats: ${n}`);
 assert.ok((flags&1)===1,`${entry.asset} flagged most-important-first`);
 assert.equal(buf.length,16+n*26,`expected packed byte length for ${entry.asset}`);
}

// 2. Validate A1 roundabout lawn clearances
for(const veg of A1_ROUNDABOUT_VEGETATION){
 assert.ok(SPLAT_VEGETATION_CATALOG[veg.kind],`known vegetation kind: ${veg.kind}`);
 const r=Math.hypot(veg.along,veg.lat);
 assert.ok(r>=LOOP.outerRadius+4.5,`${veg.id} sits on open lawn clear of outer footpath (r=${r.toFixed(2)})`);
 const wx=LOOP.center.x+t.tx*veg.along+t.lx*veg.lat;
 const wz=LOOP.center.z+t.tz*veg.along+t.lz*veg.lat;
 const dRail=RAILWAY.distance(wx,wz);
 assert.ok(dRail>20,`${veg.id} clears railway viaduct (${dRail.toFixed(1)} m)`);
 for(const c of cabins){
  const dCab=Math.hypot(wx-c.p.x,wz-c.p.z);
  assert.ok(dCab>6,`${veg.id} clears ${c.id} (${dCab.toFixed(2)} m)`);
 }
 for(const s of A1_ROUNDABOUT_SPLATS){
  const sx=LOOP.center.x+t.tx*s.along+t.lx*s.lat;
  const sz=LOOP.center.z+t.tz*s.along+t.lz*s.lat;
  const dProp=Math.hypot(wx-sx,wz-sz);
  assert.ok(dProp>2.5,`${veg.id} clears ${s.id} (${dProp.toFixed(2)} m)`);
 }
}

console.log(`Splat vegetation test passed: ${Object.keys(SPLAT_VEGETATION_CATALOG).length} CC0 assets, ${A1_ROUNDABOUT_VEGETATION.length} A1 lawn placements verified.`);
