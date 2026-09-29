// Re-trace existing lots against the current boundary mask (after scripts/build_ozp_underlay.py cleans labels out of it).
// A lot is replaced only when the new trace contains the stored outline (≥ 95 %) and is at most 35 % larger — i.e. it just
// fills notches the old labels cut. Lots edited by hand (split, shrunk, redrawn) fail that test and are kept as they are.
// Usage: node scripts/retrace-lots.mjs <mask.bin> <raw.bin> [--dry]   (1 byte/px of public/lots/ozp-mask.png and ozp-mask-raw.png)
import fs from 'fs';
import {blockCorridor,wandPolygon,polygonArea,pointInPolygon} from '../src/lots/wand.js';
const file=p=>new URL('../'+p,import.meta.url),cal=JSON.parse(fs.readFileSync(file('public/lots/ozp-underlay.json')));
const mask=blockCorridor(new Uint8Array(fs.readFileSync(process.argv[2])),cal),raw=blockCorridor(new Uint8Array(fs.readFileSync(process.argv[3])),cal),doc=JSON.parse(fs.readFileSync(file('public/lots/lots.json')));
// Interior points, farthest from the outline first (the old centroid seeds often sat on the lot's own label).
function interior(poly){const xs=poly.map(p=>p[0]),zs=poly.map(p=>p[1]),step=Math.max(1,Math.sqrt(polygonArea(poly))/60),out=[];
 for(let x=Math.min(...xs);x<Math.max(...xs);x+=step)for(let z=Math.min(...zs);z<Math.max(...zs);z+=step){if(!pointInPolygon([x,z],poly))continue;let d=Infinity;
  for(let i=0;i<poly.length;i++){const a=poly[i],b=poly[(i+1)%poly.length],dx=b[0]-a[0],dz=b[1]-a[1],t=Math.max(0,Math.min(1,((x-a[0])*dx+(z-a[1])*dz)/(dx*dx+dz*dz||1)));d=Math.min(d,Math.hypot(x-a[0]-t*dx,z-a[1]-t*dz));}
  out.push({p:[x,z],d});}return out.sort((a,b)=>b.d-a.d).map(o=>o.p);}
// First seed on open paper wins.
const retrace=poly=>{for(const at of interior(poly).slice(0,40)){const p=wandPolygon(mask,cal,at,1.6,400000,raw);if(p)return p;}return null;};
// Share of polygon a's area inside polygon b, by sampling.
function inside(a,b){const xs=a.map(p=>p[0]),zs=a.map(p=>p[1]),step=Math.max(.5,Math.sqrt(polygonArea(a))/80);let n=0,k=0;
 for(let x=Math.min(...xs);x<Math.max(...xs);x+=step)for(let z=Math.min(...zs);z<Math.max(...zs);z+=step)if(pointInPolygon([x,z],a)){n++;if(pointInPolygon([x,z],b))k++;}return n?k/n:0;}
let changed=0;const kept=[];
for(const l of doc.lots){const poly=retrace(l.poly);if(!poly){kept.push(`${l.id} (no closed region)`);continue;}
 const grow=polygonArea(poly)/polygonArea(l.poly),cover=inside(l.poly,poly);
 if(cover<.95||grow>1.35||grow<.97){kept.push(`${l.id} (covers ${(cover*100).toFixed(0)} %, area ×${grow.toFixed(2)})`);continue;}
 l.poly=poly;changed++;}
if(!process.argv.includes('--dry'))fs.writeFileSync(file('public/lots/lots.json'),JSON.stringify(doc,null,0).replace(/\{"id"/g,'\n{"id"'));
console.log(`${changed} lots re-traced, ${kept.length} kept as stored:\n  ${kept.join('\n  ')}`);
