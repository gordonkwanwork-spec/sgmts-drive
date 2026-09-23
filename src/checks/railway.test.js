import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import * as T from 'three';
import {GLTFLoader} from 'three/addons/loaders/GLTFLoader.js';
import {RAILWAY} from '../alignment.js';
import {TRAIN,railPosition,trainHead,carPose,createRailway} from '../railway.js';
import {railwaySoundMix} from '../audio.js';
for(const direction of [-1,1])for(let head=0;head<RAILWAY.length;head+=5){
 for(let i=0;i<8;i++){
  const p=carPose(head,i,direction);assert(Number.isFinite(p.position.x+p.position.y+p.position.z+p.heading));
  if(i){const prev=carPose(head,i-1,direction);assert(Math.abs(p.position.distanceTo(prev.position)-TRAIN.pitch)<.4,'Coupled cars stay evenly spaced through curves');}
  const a=railPosition(p.u-7.8,direction*TRAIN.track),b=railPosition(p.u+7.8,direction*TRAIN.track);assert(Math.abs(a.distanceTo(b)-15.6)<.20,'Bogie centres follow the track');
 }
}
assert(trainHead(1,1)>trainHead(0,1));assert(trainHead(1,-1)<trainHead(0,-1));
assert(railPosition(0,-TRAIN.track).distanceTo(railPosition(0,TRAIN.track))>4.2);
assert.equal(railwaySoundMix(300,0).gain,0);assert(railwaySoundMix(15,0).gain>railwaySoundMix(150,0).gain);assert.equal(railwaySoundMix(10,2).pan,1);assert(railwaySoundMix(10,0,-16).doppler>1);assert(railwaySoundMix(10,0,16).doppler<1);
const noop=new Proxy(function(){},{get:()=>noop,apply:()=>noop,set:()=>true});globalThis.document={createElement:()=>({width:0,height:0,getContext:()=>noop})};
const bytes=readFileSync('public/assets/tuen-ma-train.glb'),json=JSON.parse(bytes.subarray(20,20+bytes.readUInt32LE(12))),model=await new GLTFLoader().parseAsync(bytes.buffer.slice(bytes.byteOffset,bytes.byteOffset+bytes.byteLength),'');
assert.equal(json.nodes.filter(n=>/^car_\d\d$/.test(n.name)).length,8);assert.equal(json.nodes.filter(n=>/^car_\d\d$/.test(n.name)&&n.extras.pantograph).length,2);
const scene=new T.Scene(),railway=createRailway(scene,model.scene),camera=new T.PerspectiveCamera();
assert.equal(railway.trains.length,2);
for(const t of railway.trains){assert.equal(t.cars.length,8);for(const c of t.cars){assert.equal(c.bogies.length,2);assert.equal(c.wheels.length,4);}const visible=[];t.group.traverse(n=>{if(n.visible&&/^headlight|^taillight/.test(n.name))visible.push(n);});assert.equal(visible.filter(n=>n.name.startsWith('headlight')).length,2);assert.equal(visible.filter(n=>n.name.startsWith('taillight')).length,2);}
const wheel=railway.trains[0].cars[0].wheels[0];railway.update(2,camera);const angle=wheel.rotation.x;railway.update(3,camera);assert.notEqual(wheel.rotation.x,angle);
railway.setNight(true);assert(scene.getObjectByName('Viaduct parapet illumination').visible);assert(railway.trains.every(t=>t.beams.every(l=>l.intensity>0)));assert(railway.trainMaterials.get('tm_cabin_light').emissiveIntensity>2);
railway.setNight(false);assert(!scene.getObjectByName('Viaduct parapet illumination').visible);assert(railway.viaductLights.every(l=>l.intensity===0));assert(railway.trains.every(t=>t.beams.every(l=>l.intensity===0)));
const body=railway.trains[0].cars[1].root;scene.updateMatrixWorld(true);assert.equal(body.userData.pantograph,true);const bounds=new T.Box3().setFromObject(body);assert(Math.abs(bounds.max.y-(RAILWAY.at(0).y+TRAIN.contactHeight))<.04,'Blender pantograph physically meets the contact wire');
console.log('Eight-car Blender formation, curve following, opposing movement, wheels, directional lights, catenary and spatial sound falloff passed.');
