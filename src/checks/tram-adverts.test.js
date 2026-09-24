import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import * as T from 'three';
import {GLTFLoader} from 'three/addons/loaders/GLTFLoader.js';
import {TRAM_CAMPAIGNS,tramCampaign,applyTramAdvert} from '../tram-adverts.js';

for(const count of [6,17]){
 const selected=Array.from({length:count},(_,i)=>tramCampaign(i));
 assert.equal(selected.filter(Boolean).length,Math.floor(count/3));
 for(let i=0;i<count;i++)assert.equal(!!selected[i],(i+1)%3===0);
}
assert.equal(new Set(Array.from({length:12},(_,i)=>tramCampaign(i)?.id).filter(Boolean)).size,4);
for(const c of TRAM_CAMPAIGNS){
 const image=readFileSync(`public/assets/tram-adverts/${c.id}.png`);
 assert.equal(image.subarray(1,4).toString(),'PNG');
 assert.equal(image.readUInt32BE(16)/image.readUInt32BE(20),3);
}
const bytes=readFileSync('public/assets/art.glb');
const model=await new GLTFLoader().parseAsync(bytes.buffer.slice(bytes.byteOffset,bytes.byteOffset+bytes.byteLength),'');
for(const campaign of TRAM_CAMPAIGNS){
 const root=model.scene.clone(true),original=new Map();
 root.traverse(n=>{if(n.isMesh)original.set(n,{material:n.material,geometry:n.geometry});});
 const sections=['section_front','section_mid','section_rear'].map(name=>root.getObjectByName(name));
 const tram={sections};applyTramAdvert(tram,{...campaign,map:new T.Texture()});
 assert.equal(tram.advert,campaign.id);
 let glazing=0,doors=0,painted=0;
 for(const [mesh,before] of original){
  assert.equal(mesh.geometry,before.geometry,'Wraps leave geometry and openings unchanged');
  if(before.material.name==='glass'){
   glazing++;assert.equal(mesh.material,before.material,'Window material is untouched');
   assert(!mesh.userData.tramAdvert);
  }
  if(mesh.userData.tramAdvert){
   painted++;assert.notEqual(mesh.material,before.material,'Unwrapped fleet shares no modified material');
   assert(!mesh.material.transparent,'Only opaque body panels receive ads');
   if(/_door_(left|right)_[01]$/.test(mesh.parent.name)){
    if(before.material.name==='body_white')doors++;else assert.match(before.material.name,/^livery_/,'Door glass, frames and handles stay clear');
   }
  }
 }
 assert(glazing>=15);assert.equal(doors,12);assert(painted>18);
 const plain=model.scene.clone(true),plainTram={sections:[plain]};applyTramAdvert(plainTram,null);
 assert(!plainTram.advert);plain.traverse(n=>assert(!n.userData.tramAdvert));
}
console.log('Tram wraps: every third running tram, four campaigns, opaque body and twelve moving door panels only; glazing and shared originals unchanged.');
