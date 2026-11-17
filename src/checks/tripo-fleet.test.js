import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {Box3,Vector3} from 'three';
import {GLTFLoader} from 'three/addons/loaders/GLTFLoader.js';
import {TRIPO_PEOPLE,TRIPO_VEHICLES,loadTripoVehicles} from '../tripo-assets.js';
import {tripoPlayer,posePedestrian,rig} from '../street-models.js';
const loader=new GLTFLoader().register(()=>({name:'no-textures',loadTexture:()=>Promise.resolve(null)}));
const load=async path=>{const b=readFileSync(path);return loader.parseAsync(b.buffer.slice(b.byteOffset,b.byteOffset+b.byteLength),'');};
const fleet=await loadTripoVehicles({loadAsync:load},f=>'public/assets/vehicles/tripo/'+f);
assert.equal(fleet.size,11);
for(const spec of TRIPO_VEHICLES){
 const g=fleet.get(spec.id);g.updateMatrixWorld(true);
 const b=new Box3().setFromObject(g),v=b.getSize(new Vector3());
 assert(Math.abs(b.min.y)<.10,spec.id+' grounded');
 assert(Math.abs(v.x-spec.width)<.10&&Math.abs(v.y-spec.height)<.10&&Math.abs(v.z-spec.length)<.08,spec.id+' collision dimensions');
 assert(g.userData.tripoVehicle===spec.file);
 const clone=g.clone(true);let a,bmesh;g.traverse(n=>{if(n.isMesh)a??=n;});clone.traverse(n=>{if(n.isMesh)bmesh??=n;});assert.equal(a.geometry,bmesh.geometry,'traffic shares geometry');
 if(spec.low)assert.deepEqual(g.levels.map(l=>l.distance),[0,85]);
}
assert.equal(TRIPO_PEOPLE.slice(12).length,7);
for(const entry of TRIPO_PEOPLE.slice(12)){
 const gltf=await load('public/assets/characters/tripo/'+entry.path),g=tripoPlayer(gltf,entry.height,entry.name,entry.baked),other=tripoPlayer(gltf,entry.height,entry.name,entry.baked);
 assert.notEqual(rig(g).bones.hips.bone,rig(other).bones.hips.bone);
 if(entry.baked){for(const [speed,name] of [[1.4,'walk'],[3.5,'run']]){posePedestrian(g,speed/60,1/60);assert.equal(g.userData.tripoAnimation.current,g.userData.tripoAnimation.actions[name]);}assert.equal(other.userData.tripoAnimation.current,null);}
 const left=g.getObjectByName('mixamorigLeftUpLeg')?.getWorldPosition(new Vector3()).sub(g.getObjectByName('mixamorigRightUpLeg').getWorldPosition(new Vector3()))
  ||g.getObjectByName('mixamorig:LeftUpLeg').getWorldPosition(new Vector3()).sub(g.getObjectByName('mixamorig:RightUpLeg').getWorldPosition(new Vector3()));
 assert(left.x<-.05*entry.height&&Math.abs(left.z)<.05*entry.height,entry.name+' faces -Z');
 for(const action of [{},{sit:.45},{air:true}]){g.userData.action=action;for(let n=0;n<100;n++)posePedestrian(g,action.sit?0:1.4/60,1/60);g.updateMatrixWorld(true);const b=new Box3().setFromObject(g,true);assert(Number.isFinite(b.min.y)&&b.max.y<2.5&&b.min.y>-.3,entry.name+' bounded pose '+b.min.y);assert.equal(g.position.length(),0);}
}
console.log(`11 Tripo vehicles: real GLBs, scale, collision bounds, shared geometry, bus LOD; ${TRIPO_PEOPLE.slice(12).length} independent humanoid rigs and poses pass.`);
