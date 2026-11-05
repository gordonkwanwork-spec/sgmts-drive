// Corridor facade detail (lots/detail.js) and low-poly street trees (street/trees.js): buildings near the route gain
// relief that is finite, merges with the massing parts and stays on its lot; shop signs face outward and light at
// night; far buildings get none; every tree species stays under its triangle budget.
import fs from 'fs';
import assert from 'assert';
const ctx2d=new Proxy({},{get:(_,k)=>k==='measureText'?()=>({width:0}):k==='createLinearGradient'?()=>({addColorStop(){}}):()=>{},set:()=>true});
globalThis.document={createElement:()=>({getContext:()=>ctx2d,width:0,height:0})};
const {massingParts,nightMaterials,lotMaterials,useOf}=await import('../lots/massing.js');
const {detailMaterials,facadeDetail,nearCorridor,DETAIL_RANGE}=await import('../lots/detail.js');
const {pointInPolygon}=await import('../lots/wand.js');
const {sample}=await import('../alignment.js');
const {treeTemplates}=await import('../street/trees.js');
const {mergeGeometries}=await import('three/addons/utils/BufferGeometryUtils.js');
const {lots}=JSON.parse(fs.readFileSync(new URL('../../public/lots/lots.json',import.meta.url)));
const D=detailMaterials(),detail=new Set(Object.values(D));
const r=sample(1300);assert(nearCorridor(r.x+r.lx*40,r.z+r.lz*40)&&!nearCorridor(r.x+r.lx*(DETAIL_RANGE+60),r.z+r.lz*(DETAIL_RANGE+60)),'corridor range gate');
assert(nightMaterials().includes(D.shopfront)&&nightMaterials().includes(D.shopSigns),'shopfronts and signs not lit at night');
{const L=lotMaterials();for(const k of ['tower','towerAlt','podium','civic','house'])assert(L[k].normalMap&&L[k].roughnessMap,`${k} glass lacks per-pane tilt/roughness`);assert(D.shopfront.roughnessMap&&D.railGlass.metalness>.5,'shop/balcony glass not reflective');}
let detailed=0,signs=0;
for(const lot of lots.filter(l=>l.model?.type==='massing'&&['residential','mixed','gic','enterprise'].includes(useOf(l.zone)))){
 const {parts}=massingParts(lot,{ground:()=>0}),mine=parts.filter(p=>detail.has(p.material));if(!mine.length)continue;detailed++;
 for(const p of mine){const a=p.geometry.attributes.position.array;assert(a.every(Number.isFinite),`${lot.id} non-finite detail`);
  p.geometry.computeBoundingBox();const b=p.geometry.boundingBox;assert(pointInPolygon([(b.min.x+b.max.x)/2,(b.min.z+b.max.z)/2],lot.poly),`${lot.id} detail off its lot`);
  if(p.material===D.shopSigns)signs++;}
 const walls=parts.find(p=>!detail.has(p.material)).geometry;for(const p of mine)assert(mergeGeometries([walls,p.geometry]),`${lot.id} detail does not merge with massing walls`);}
// Fascia signs and AC faces on a known footprint face away from its centre (an inward quad is back-face culled).
{const C={x:r.x+r.lx*60,z:r.z+r.lz*60},out=[];facadeDetail((m,g)=>out.push([m,g]),{...C,w:26,d:20,angle:.4},0,12,'podium');let checked=0;
 for(const [m,g] of out){if(m!==D.shopSigns&&m!==D.acFace)continue;const a=g.attributes.position.array,n=g.attributes.normal.array,uv=g.attributes.uv.array;
  for(let i=0,j=0;i<a.length;i+=12,j+=8){if(m===D.shopSigns&&Math.max(uv[j+1],uv[j+5])<.4)continue;// blades stick out sideways and carry both faces
   const px=(a[i]+a[i+6])/2-C.x,pz=(a[i+2]+a[i+8])/2-C.z;assert(n[i]*px+n[i+2]*pz>0,'sign or AC face points into the building');checked++;}}
 assert(checked>10,'too few signs/AC faces checked');}
assert(detailed>=8,`only ${detailed} corridor lots detailed`);assert(signs>0,'no shop signs');
const tris=g=>g?(g.index?g.index.count:g.attributes.position.count)/3:0;
for(const k of treeTemplates()){const n=tris(k.barkGeo)+tris(k.crown)+tris(k.cards);assert(n<=400,`${k.name} tree has ${n} triangles`);
 for(const g of [k.barkGeo,k.crown,k.cards].filter(Boolean)){g.computeBoundingBox();assert(Math.abs(g.boundingBox.min.y+.5)<.05||g!==k.barkGeo,`${k.name} not standing on y=-.5 (wind sways on local y)`);}}
console.log(`Corridor detail: ${detailed} lots detailed, signs lit and mergeable, far buildings plain; trees ≤400 triangles each`);
