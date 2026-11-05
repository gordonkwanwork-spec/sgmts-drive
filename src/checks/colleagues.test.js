import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {Box3,Vector3,Group,Object3D} from 'three';
import {GLTFLoader} from 'three/addons/loaders/GLTFLoader.js';
import {COLLEAGUES} from '../colleagues.js';
import {tripoPlayer,posePedestrian,poseCyclist,rig} from '../street-models.js';
const loader=new GLTFLoader().register(()=>({name:'no-textures',loadTexture:()=>Promise.resolve(null)}));
assert.equal(COLLEAGUES.length,12);
for(const entry of COLLEAGUES){
 assert.equal(entry.baked,true,entry.name+' must use Tripo clips');
 const b=readFileSync(new URL('../../public/assets/characters/tripo/colleagues/'+entry.file,import.meta.url));
 const gltf=await loader.parseAsync(b.buffer.slice(b.byteOffset,b.byteOffset+b.byteLength),'');
 const g=tripoPlayer(gltf,1.75,entry.name,entry.baked),other=tripoPlayer(gltf),r=rig(g);
 assert.equal(g.userData.tripoAnimation.actions.turn,undefined,'turn clip removed from playback');
 assert.notEqual(r.bones.hips.bone,rig(other).bones.hips.bone,'cloned skeletons independent');
 const step=(speed,action={})=>{g.userData.action=action;for(let i=0;i<120;i++){posePedestrian(g,speed/60,1/60);g.updateMatrixWorld(true);}};
 for(const [speed,action,name] of [[0,{},'idle'],[1.4,{},'walk'],[3.5,{},'run'],[0,{sit:.45},'sit'],[0,{turn:true},'idle'],[0,{air:true},null],[0,{sit:0,ground:true},null],[0,{},'idle']]){
  step(speed,action);const box=new Box3().setFromObject(g,true);
  assert(Number.isFinite(box.min.y)&&box.max.y<2.3&&box.min.y>-.15,entry.name+' bounded pose '+JSON.stringify(action)+' '+box.min.y+' '+box.max.y);
  assert.equal(g.position.length(),0,'animation cannot move collision root');
  if(entry.baked&&name)assert.equal(g.userData.tripoAnimation.current,g.userData.tripoAnimation.actions[name]);
  if(name==='sit')assert(Math.abs(r.bones.hips.bone.getWorldPosition(new Vector3()).y-.55)<.08,entry.name+' sits on bench');
 }
 if(entry.name==='Joseph FAN'){
  const bike=new Group();other.name='seated_rider';bike.add(other);
  for(const side of [-1,1])for(const part of ['crank','pedal']){const o=new Object3D();o.name=part+'_'+side;bike.add(o);}
  const riderRig=rig(other),c={group:bike,wheels:[],v:3};
  for(let i=0;i<60;i++){poseCyclist(c,1/60);bike.updateMatrixWorld(true);for(const [side,n] of [[-1,'L'],[1,'R']]){
   const target=bike.getObjectByName('pedal_'+side).position.clone().add(new Vector3(0,.085,.04));
   assert(riderRig.bones['foot_'+n].bone.getWorldPosition(new Vector3()).distanceTo(target)<.1,'Tripo feet track pedals');
  }}
 }
 console.log(entry.name+' rig, movement and seated pose verified');
}
