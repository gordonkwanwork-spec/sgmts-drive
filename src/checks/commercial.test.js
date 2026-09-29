// Commercial towers (C zones round A2): every lot gets podiums and towers, all five archetypes appear,
// geometry is finite, merges per material, stays under the plan's height limit and on its lot.
import fs from 'fs';
import assert from 'assert';
const ctx2d=new Proxy({},{get:(_,k)=>k==='measureText'?()=>({width:0}):k==='createLinearGradient'?()=>({addColorStop(){}}):()=>{},set:()=>true});
globalThis.document={createElement:()=>({getContext:()=>ctx2d,width:0,height:0})};
const {massingParts,lotMaterials,useOf}=await import('../lots/massing.js');
const {pointInPolygon}=await import('../lots/wand.js');
const {DATUM}=await import('../alignment.js');
const {mergeGeometries}=await import('three/addons/utils/BufferGeometryUtils.js');
const {lots}=JSON.parse(fs.readFileSync(new URL('../../public/lots/lots.json',import.meta.url)));
const M=lotMaterials(),kinds={cBlue:0,cDark:0,cClear:0,cGrid:0,cChamp:0},used=new Set();let n=0;
for(const lot of lots.filter(l=>useOf(l.zone)==='commercial'&&l.model?.type==='massing')){n++;
 const {parts}=massingParts(lot,{ground:()=>0}),by=new Map();
 for(const k of Object.keys(kinds))if(parts.some(p=>p.material===M[k]))used.add(k);
 assert(parts.some(p=>p.material===M.cRetail),`${lot.id} no retail podium`);
 for(const p of parts){const a=p.geometry.attributes.position.array;assert(a.every(Number.isFinite),`${lot.id} non-finite geometry`);
  p.geometry.computeBoundingBox();const b=p.geometry.boundingBox;if(lot.maxBH!=null)assert(b.max.y<=lot.maxBH-DATUM+1.5,`${lot.id} above height limit (${b.max.y.toFixed(1)})`);
  assert(pointInPolygon([(b.min.x+b.max.x)/2,(b.min.z+b.max.z)/2],lot.poly),`${lot.id} part off its lot`);
  if(!by.has(p.material))by.set(p.material,[]);by.get(p.material).push(p.geometry);}
 for(const [m,g] of by)assert(mergeGeometries(g),`${lot.id} ${m.type} parts do not merge`);
 for(const k of ['cBlue','cDark','cClear','cGrid','cChamp','cRetail'])assert(M[k].roughnessMap&&M[k].emissiveMap,`${k} missing reflection/night maps`);}
assert(n>=4,'commercial lots missing');assert.equal(used.size,5,`only ${[...used]} archetypes used`);
console.log(`Commercial: ${n} lots, all 5 tower archetypes on retail podiums; geometry finite, mergeable, within height limits and lots`);
