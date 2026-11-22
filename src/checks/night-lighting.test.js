// Regression checks for night-mode lighting across stations, plazas, trees, street hardscapes, modern buildings, and vehicles.
globalThis.self??=globalThis;
globalThis.createImageBitmap??=async()=>({width:1024,height:1024,close(){}});
const noop=new Proxy(function(){},{get:(t,k)=>k===Symbol.toPrimitive?()=>0:k==='canvas'?{}:noop,apply:()=>noop,set:()=>true});
globalThis.document??={createElement:()=>({width:0,height:0,getContext:()=>noop,style:{}})};
document.createElementNS??=()=>({addEventListener(){},removeEventListener(){},set src(value){}});

import assert from 'node:assert/strict';
import {readFile,readFileSync} from 'node:fs';
import {readFile as readFileAsync} from 'node:fs/promises';
import * as T from 'three';
import {GLTFLoader} from 'three/addons/loaders/GLTFLoader.js';
import {buildGreenMinibus} from '../green-minibus.js';
import {LOOKS} from '../atmosphere.js';
import {buildEnvironment} from '../environment.js';
import {createRailway} from '../railway.js';
import {windMaterial,PLANT_NIGHT} from '../street-models.js';
import {setNight as setModernNight} from '../city/kit/hk-modern.js';
import {playerModel} from '../city/car-models.js';
import {sample,STOPS} from '../alignment.js';

// 1. Atmosphere night levels keep dark silhouettes readable without flattening night contrast.
assert(LOOKS.night.sunI>=.25&&LOOKS.night.sunI<.5,'moonlight sunI stays dim but non-crushing');
assert(LOOKS.night.hemi[2]>=.3,'night hemisphere ambient floor prevents black silhouettes');
assert(LOOKS.night.env>=.4,'night env intensity reflects moonlit sky');

// 2. Wind foliage shader has moonlight floor even when vNightGlow is zero.
{
 const mat=windMaterial(new T.MeshStandardMaterial({color:0x4b6a3c}),{value:0});
 assert.equal(mat.customProgramCacheKey(),'verge-wind-v3');
 const shader={uniforms:{},vertexShader:'#include <common>\n#include <begin_vertex>',fragmentShader:'#include <common>\n#include <emissivemap_fragment>'};
 mat.onBeforeCompile(shader);
 assert(shader.fragmentShader.includes('1. - vNightGlow * .5'),'windMaterial blends cool moonlight floor');
}

// 3. Modern HK building shaders include night podium/tower bounce with ascending smoothstep bounds.
{
 const modernSrc=readFileSync(new URL('../city/kit/hk-modern.js',import.meta.url),'utf8');
 assert(modernSrc.includes('vHkY'),'patch computes world height vHkY');
 assert(modernSrc.includes('smoothstep(4.,26.,vHkY)'),'MATS uses ascending smoothstep bounds on vHkY');
 assert(modernSrc.includes('smoothstep(4.,22.,vSUv.y)'),'SHELL uses ascending smoothstep bounds on vSUv.y');
 assert.equal(PLANT_NIGHT.value,0);
 setModernNight(true);
}

// 4. Railway viaduct parapet glow and structure night emissives toggle cleanly.
{
 const bytes=readFileSync('public/assets/tuen-ma-train.glb');
 const model=await new GLTFLoader().parseAsync(bytes.buffer.slice(bytes.byteOffset,bytes.byteOffset+bytes.byteLength),'');
 const railScene=new T.Scene(),railway=createRailway(railScene,model.scene);
 const glow=railScene.getObjectByName('Viaduct parapet illumination');
 assert(glow.material.opacity>=.4,'viaduct parapet illumination opacity boosted');
 const viaduct=railScene.getObjectByName('Railway concrete'),rail=railScene.getObjectByName('Railway steel');
 railway.setNight(true);
 assert(viaduct.material.emissiveIntensity>0&&rail.material.emissiveIntensity>0,'viaduct concrete & steel light at night');
 railway.setNight(false);
 assert.equal(viaduct.material.emissiveIntensity,0,'viaduct concrete restored in day');
 assert.equal(rail.material.emissiveIntensity,0,'viaduct steel restored in day');
}

// 5. Full environment: lazy night overlays (including Plot paving & A1/A2 hardstands), street tree nightGlow,
//    A2 footbridge, Hung Shui Kiu Station, A2 arcade/gardens, park lamp, plaza pergolas, and shared materials.
{
 const kitData=await readFileAsync('public/assets/street-kit.glb');
 const kit=await new GLTFLoader().parseAsync(kitData.buffer.slice(kitData.byteOffset,kitData.byteOffset+kitData.byteLength),'');
 const furniture=JSON.parse(readFileSync(new URL('../../public/street/furniture.json',import.meta.url),'utf8'));
 const scene=new T.Scene();
 const env=buildEnvironment(scene,kit.scene,{furniture,lazyNight:true});

 // Add a late indexed Plot paving mesh (like experience.js) near an A2 lamp before enabling night.
 const r=sample(STOPS[1].s);
 const plotGeo=new T.BufferGeometry();
 plotGeo.setAttribute('position',new T.Float32BufferAttribute([
  r.x-40,r.groundY,r.z-40, r.x+40,r.groundY,r.z-40, r.x+40,r.groundY,r.z+40, r.x-40,r.groundY,r.z+40
 ],3));
 plotGeo.setIndex([0,1,2,0,2,3]);
 const plotPaving=new T.Mesh(plotGeo,new T.MeshStandardMaterial({color:0xb9b3a4,roughness:.95,side:T.DoubleSide}));
 plotPaving.name='Plot paving';
 scene.add(plotPaving);

 env.setNight(true);

 // Check street & garden tree nightGlow attributes.
 const streetTreeMeshes=[];
 scene.traverse(o=>{
  if(o.isInstancedMesh&&/^(?:(street-trunk|street-foliage|street-leaf)-|garden-trunk$)/.test(o.name))streetTreeMeshes.push(o);
 });
 assert(streetTreeMeshes.length>0,'street & garden tree instanced meshes present');
 for(const m of streetTreeMeshes){
  const attr=m.geometry.getAttribute('nightGlow');
  assert(attr&&attr.count===m.count,`${m.name} has matching nightGlow attribute`);
 }
 assert(streetTreeMeshes.some(m=>Array.from(m.geometry.getAttribute('nightGlow').array).some(v=>v>0)),'some street/garden trees receive positive nightGlow near lamps');

 // Check hardstanding overlays exist and toggle visibility.
 const a1Hard=scene.getObjectByName('A1 island hardstanding');
 const forecourt=scene.getObjectByName('A2 commercial forecourt');
 assert(a1Hard,'A1 island hardstanding named and in scene');
 assert(forecourt,'A2 commercial forecourt named and in scene');
 assert(plotPaving.userData.nightOverlay?.visible,'Plot paving gets lazy nightOverlay and shows at night');
 assert(a1Hard.userData.nightOverlay?.visible,'A1 island hardstanding gets nightOverlay');
 assert(forecourt.userData.nightOverlay?.visible,'A2 commercial forecourt gets nightOverlay');

 // Check A2 footbridge, Hung Shui Kiu Station, A2 gardens/arcade, pergola, park lamp, and furniture materials.
 const footbridge=scene.getObjectByName('A2 iconic footbridge');
 const footMats=[];footbridge.traverse(o=>{if(o.isMesh&&o.material?.isMeshStandardMaterial&&o.material.emissive)footMats.push(o.material);});
 assert(footMats.length>0&&footMats.every(m=>m.emissive.getHex()!==0&&m.emissiveIntensity>0),'A2 footbridge StandardMaterials lit at night');

 const station=scene.getObjectByName('Hung Shui Kiu Station');
 const stationMats=[];station.traverse(o=>{if(o.isMesh&&o.material?.isMeshStandardMaterial&&!o.material.transparent)stationMats.push(o.material);});
 assert(stationMats.some(m=>m.emissive.getHex()!==0&&m.emissiveIntensity>0),'Hung Shui Kiu Station materials lit at night');

 const arcade=scene.getObjectByName('A2 commercial frontage');
 const arcadeGlass=arcade.children.find(o=>o.isMesh&&o.material?.emissiveMap)?.material;
 assert(arcadeGlass&&arcadeGlass.emissive.getHex()!==0&&arcadeGlass.emissiveIntensity>1,'A2 arcade glazing has emissiveMap active at night');

 assert(scene.getObjectByName('Pergola lamp'),'Plaza chess pergola includes ceiling lamp');
 for(const key of ['concrete','kerb','channel','galvanised','metal','teal']){
  assert(env.materials[key].emissive.getHex()!==0&&env.materials[key].emissiveIntensity>0,`env.materials.${key} lit at night`);
 }

 // Toggling back to day resets all newly wired emissives and overlays cleanly.
 env.setNight(false);
 assert(!plotPaving.userData.nightOverlay.visible,'Plot paving nightOverlay hidden by day');
 assert(footMats.every(m=>m.emissiveIntensity===0),'A2 footbridge emissives reset in day');
 assert.equal(arcadeGlass.emissiveIntensity,0,'A2 arcade glazing emissive reset in day');
 for(const key of ['concrete','kerb','channel','galvanised','metal','teal']){
  assert.equal(env.materials[key].emissiveIntensity,0,`env.materials.${key} reset in day`);
 }
}

// 6. experience.js integration invariants.
{
 const expSrc=readFileSync(new URL('../experience.js',import.meta.url),'utf8');
 assert(expSrc.includes('if(mobile||!night){streetLights.forEach(light=>light.intensity=0);return;}'),'keeps mobile/day streetLights early-return invariant');
 assert(expSrc.includes('viaductLights.flatMap(l=>[l,l.target])'),'excludes viaductLights and targets from freezeStatic');
 assert(expSrc.includes('environment.materials.lamp.emissiveIntensity=night?2.4:0'),'boosts lamp head emissive at night');
 assert(expSrc.includes('...cityWalkers,...(player.group?[player]:[])'),'lightStreetObjects prioritizes cityWalkers and on-foot player');
 // The player's headlights stay under driver control even when other traffic occupies both pooled lights.
 const body=buildGreenMinibus();
 const player=playerModel(body.clone(),{id:'minibus',name:'Green minibus',width:2.2,length:7,height:2.8}),beams=player.children.filter(n=>n.isSpotLight);
 assert.equal(beams.length,2);
 player.driveLights(true);assert(beams.every(b=>b.visible&&b.intensity>0&&b.target.position.z<b.position.z));
 player.driveLights(false,true,true);assert(beams.every(b=>!b.visible&&b.intensity===0));
 for(const [channel,level] of [['front',0],['rear',5],['reverse',3]]){
  const lens=player.getObjectsByProperty('isMesh',true).find(n=>n.material.userData.driveLamp===channel);
  const other=body.getObjectByName(lens.name);
  assert.equal(lens.geometry,other.geometry);assert.notEqual(lens.material,other.material);
  assert.equal(lens.material.emissiveIntensity,level);assert.notEqual(other.material.emissiveIntensity,level);
 }
 assert((expSrc.match(/peopleGlowTick=0/g)||[]).length>=4,'peopleGlowTick reset in weather + streamed character/pet installers');
}

console.log('Night lighting checks passed: atmosphere, wind foliage, hk-modern, viaduct, footbridge, HSK station, A2 gardens/plaza, trees, hardstands, furniture & experience wiring.');
