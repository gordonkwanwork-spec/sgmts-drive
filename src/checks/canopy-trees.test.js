import assert from 'node:assert/strict';
import fs from 'node:fs';
import * as T from 'three';

const ctx2d=new Proxy({},{get:(_,k)=>k==='measureText'?()=>({width:0}):k==='createLinearGradient'?()=>({addColorStop(){}}):()=>{},set:()=>true});
globalThis.document??={createElement:()=>({getContext:()=>ctx2d,width:0,height:0})};

const {CANOPY_SPECIES,canopyMaterial,canopyTreeAssets,pickCanopySpecies,setCanopyTreesNight,treeHash}=await import('../street/canopy-trees.js');
const {buildLots,lotMaterials,nightMaterials}=await import('../lots/massing.js');

// 1. Species catalog invariants.
assert.equal(CANOPY_SPECIES.length,6,'expected 6 Image-1 canopy tree variations');
const weightSum=CANOPY_SPECIES.reduce((s,sp)=>s+sp.weight,0);
assert(Math.abs(weightSum-1)<1e-6,`species weights must sum to 1 (got ${weightSum})`);
assert.equal(new Set(CANOPY_SPECIES.map(s=>s.id)).size,6,'species ids are unique');

// Deterministic weighted picker hits all species cleanly.
const picked=new Set(Array.from({length:200},(_,i)=>pickCanopySpecies(treeHash(i*17.3,i*29.1,1)).id));
assert.equal(picked.size,6,'weighted species picker produces all 6 species across samples');

// 2. Materials: backward-compatible boolean variants, caching, upward-normal shader, and night toggle.
const mFalse=canopyMaterial(false),mTrue=canopyMaterial(true);
assert.equal(mFalse,canopyMaterial('fig-jade'),'canopyMaterial(false) maps to fig-jade');
assert.equal(mTrue,canopyMaterial('camphor-olive'),'canopyMaterial(true) maps to camphor-olive');
for(const sp of CANOPY_SPECIES){
 const mat=canopyMaterial(sp.id);
 assert.equal(mat.alphaTest,.38);
 assert.equal(mat.side,T.DoubleSide);
 assert.equal(mat.emissiveMap,mat.map);
 const shader={vertexShader:'',fragmentShader:'#include <common>\n#include <normal_fragment_begin>'};
 mat.onBeforeCompile(shader);
 assert(shader.fragmentShader.includes('vec3(0.08,1.0,0.13)'),`${sp.id} injects upward-biased normal`);
}

// 3. Shared geometries & trunks.
const assets=canopyTreeAssets();
assert.equal(assets.species.length,6);
for(const kind of ['broadleaf','upright','golden','flowering']){
 const g=assets.barkByKind[kind];
 assert(g,'missing grounded bark geometry for '+kind);
 g.computeBoundingBox();
 assert(g.boundingBox.min.y>=-.05&&g.boundingBox.min.y<=.05,`${kind} trunk base near y=0 (${g.boundingBox.min.y})`);
 assert(g.boundingBox.max.y<=1.05,`${kind} trunk normalized height <=1 (${g.boundingBox.max.y})`);
 assert(g.getAttribute('color'),`${kind} trunk carries vertex colors`);
}
for(const sp of assets.species){
 assert.equal(sp.crownGeo.index.count/3,12,`${sp.id} crossed-card crown has 12 triangles`);
 assert(sp.crownGeo.boundingSphere&&Number.isFinite(sp.crownGeo.boundingSphere.radius));
}

// 4. Night lighting toggle stays separate from lotNightMaterials().
setCanopyTreesNight(true);
for(const sp of assets.species)assert.equal(sp.material.emissiveIntensity,.16);
assert.equal(assets.lotBarkMaterial.emissiveIntensity,.10);
setCanopyTreesNight(false);
for(const sp of assets.species)assert.equal(sp.material.emissiveIntensity,0);
assert.equal(assets.lotBarkMaterial.emissiveIntensity,0);

const lotNight=nightMaterials();
for(const sp of assets.species)assert(!lotNight.includes(sp.material),`canopy material ${sp.id} excluded from lotNightMaterials()`);
assert.equal(lotMaterials().trunk.isMeshStandardMaterial,true);

// 5. buildLots() emits multi-variation Image-1 'lot vegetation' meshes without lollipops.
const {lots}=JSON.parse(fs.readFileSync(new URL('../../public/lots/lots.json',import.meta.url),'utf8'));
const openAndMixed=lots.filter(l=>l.model?.type==='massing').slice(0,25);
const kit=new T.Group(),truck=new T.Group();truck.name='truck';truck.add(new T.Mesh(new T.BoxGeometry(2,3,10),new T.MeshStandardMaterial()));kit.add(truck);
const built=await buildLots(openAndMixed,{ground:()=>0,allowed:()=>true,kit});
const vegMeshes=[];
built.traverse(o=>{if(o.isInstancedMesh&&o.name==='lot vegetation')vegMeshes.push(o);});
assert(vegMeshes.length>0,'expected lot vegetation InstancedMeshes');
const crownMats=new Set();
for(const m of vegMeshes){
 const tris=m.geometry.index?m.geometry.index.count/3:m.geometry.getAttribute('position').count/3;
 assert(m.geometry.boundingSphere&&Number.isFinite(m.geometry.boundingSphere.radius),'valid boundingSphere');
 assert(m.instanceColor,'expected per-instance color tint');
 if(m.material!==assets.lotBarkMaterial){
  assert.equal(tris,12,'lot crown uses 12-triangle crossed cards instead of 80-tri lollipop icosahedron');
  crownMats.add(m.material);
 }
}
assert(crownMats.size>=4,`expected multiple canopy variations across built lots (got ${crownMats.size})`);

console.log(`Canopy trees test passed: ${CANOPY_SPECIES.length} variations, ${vegMeshes.length} lot vegetation batches, ${crownMats.size} crown variations, night toggle & exclusion verified.`);
