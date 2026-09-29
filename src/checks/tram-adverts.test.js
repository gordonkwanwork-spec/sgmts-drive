import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import * as T from 'three';
import {GLTFLoader} from 'three/addons/loaders/GLTFLoader.js';
import {untexturedGLB} from './glb-geometry.js';
import {TRAM_CAMPAIGNS,tramCampaign,applyTramAdvert,tramWindowRange} from '../tram-adverts.js';

for(const count of [6,17,18,23]){
 const selected=Array.from({length:count},(_,i)=>tramCampaign(i));
 assert.equal(selected.filter(Boolean).length,Math.floor(count/2));
 for(let i=0;i<count;i++)assert.equal(!!selected[i],i%2===1);
}
assert.equal(new Set(Array.from({length:12},(_,i)=>tramCampaign(i)?.id).filter(Boolean)).size,4);
for(const c of TRAM_CAMPAIGNS){
 const image=readFileSync(`public/assets/tram-adverts/${c.id}.png`);
 assert.equal(image.subarray(1,4).toString(),'PNG');
 assert.equal(image.readUInt32BE(16)/image.readUInt32BE(20),3);
}
const bytes=readFileSync('public/assets/art.glb');
const model=await new GLTFLoader().parseAsync(untexturedGLB(bytes),'');
for(const campaign of TRAM_CAMPAIGNS){
 const root=model.scene.clone(true),original=new Map();
 root.traverse(n=>{if(n.isMesh)original.set(n,{material:n.material,geometry:n.geometry});});
 const sections=['section_front','section_mid','section_rear'].map(name=>root.getObjectByName(name));
 sections.forEach((section,i)=>section.name=`depot-vehicle-1-section-${i}`);
 const tram={sections};applyTramAdvert(tram,{...campaign,map:new T.Texture()});
 assert.equal(tram.advert,campaign.id);
 let glazing=0,doors=0,painted=0;
 for(const [mesh,before] of original){
  assert.equal(mesh.geometry,before.geometry,'Wraps leave geometry and openings unchanged');
  // 25 Sep 2026: the print runs across the windows as a see-through film; each glass pane gets its own clone.
  if(before.material.name==='glass'&&mesh.parent.parent!==null){
   glazing++;if(mesh.userData.tramAdvert){assert.notEqual(mesh.material,before.material,'Wrapped glass is a per-tram clone');assert.equal(mesh.material.transparent,before.material.transparent,'Wrapped glazing keeps its transparency');assert.equal(mesh.material.opacity,before.material.opacity);}
  }
  if(mesh.userData.tramAdvert){
   painted++;assert.notEqual(mesh.material,before.material,'Unwrapped fleet shares no modified material');
   const shader={uniforms:{},vertexShader:T.ShaderLib.standard.vertexShader,fragmentShader:T.ShaderLib.standard.fragmentShader};
   mesh.material.onBeforeCompile(shader);
   const section=sections.find(s=>{for(let n=mesh.parent;n;n=n.parent)if(n===s)return true;}),index=sections.indexOf(section);
   assert.equal(shader.uniforms.tramHero.value,index===1?1:0,'Only the middle section prints the hero, including renamed depot vehicles');
   assert.deepEqual(shader.uniforms.tramWindowRange.value.toArray(),tramWindowRange(['section_front','section_mid','section_rear'][index]));
   assert(shader.fragmentShader.includes('vTramPosition.y<=2.10'),'Film ends halfway up passenger glazing');
   if(before.material.name!=='glass')assert(!mesh.material.transparent,'Body panels stay opaque');
   if(/_door_(left|right)_[01](_leaf_[ab])?$/.test(mesh.parent.name)){
    if(before.material.name==='body_white')doors++;else assert.match(before.material.name,/^(livery_|glass$|body_black$)/,'Only door panels, frames and glass carry the print');
   }
  }
 }
 assert(glazing>=15);assert.equal(doors,24);assert(painted>18);
 const plain=model.scene.clone(true),plainTram={sections:[plain]};applyTramAdvert(plainTram,null);
 assert(!plainTram.advert);plain.traverse(n=>assert(!n.userData.tramAdvert));
}
console.log('Tram wraps: half of the fleet, four campaigns, one hero per side and lower-half passenger window film; shared originals unchanged.');

assert.deepEqual(tramWindowRange('section_front'),[-2.15,2.85]);
assert.deepEqual(tramWindowRange('section_mid'),[-2.85,2.85]);
assert.deepEqual(tramWindowRange('section_rear'),[-2.85,2.15]);
