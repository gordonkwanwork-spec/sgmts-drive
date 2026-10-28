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
for(const entry of TRIPO_PEOPLE.slice(12)){
 const gltf=await load('public/assets/characters/tripo/'+entry.path),g=tripoPlayer(gltf,entry.height),other=tripoPlayer(gltf,entry.height);
 assert.notEqual(rig(g).bones.hips.bone,rig(other).bones.hips.bone);
 for(const action of [{},{sit:.45},{air:true}]){g.userData.action=action;for(let n=0;n<100;n++)posePedestrian(g,action.sit?0:1.4/60,1/60);g.updateMatrixWorld(true);const b=new Box3().setFromObject(g,true);assert(Number.isFinite(b.min.y)&&b.max.y<2.5&&b.min.y>-.3,entry.name+' bounded pose '+b.min.y);assert.equal(g.position.length(),0);}
}
console.log('11 Tripo vehicles: real GLBs, scale, collision bounds, shared geometry, bus LOD; 4 independent humanoid rigs and poses pass.');
