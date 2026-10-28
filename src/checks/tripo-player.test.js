import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {Vector3,Box3} from 'three';
import {GLTFLoader} from 'three/addons/loaders/GLTFLoader.js';
import {tripoPlayer,posePedestrian,rig} from '../street-models.js';
// Geometry/rig test in Node; the browser verifies embedded textures.
const loader=new GLTFLoader().register(()=>({name:'test-no-textures',loadTexture:()=>Promise.resolve(null)}));
for(const [file,height] of [['player',1.75],['schoolboy-white-uniform-blue-backpack-walk',1.25],['schoolgirl-blue-uniform-walk',1.25]]){
 const b=readFileSync(new URL(`../../public/assets/characters/tripo/${file}.glb`,import.meta.url));
 const group=tripoPlayer(await loader.parseAsync(b.buffer.slice(b.byteOffset,b.byteOffset+b.byteLength),''),height);
 const world=n=>group.getObjectByName('mixamorig'+n).getWorldPosition(new Vector3()),step=(d,dt=1/60)=>{posePedestrian(group,d,dt);group.updateMatrixWorld(true);};
 step(0);const r=rig(group);assert(r&&r.bones.thigh_L&&r.bones.upperarm_R&&r.bones.toe_R,file+' must expose the gait joints');
 // Faces -Z (left hip on −X), scaled to its height, standing on the ground.
 const left=world('LeftUpLeg').sub(world('RightUpLeg'));assert(left.x<-.05*height&&Math.abs(left.z)<.05*height,file+' must face -Z');
 const box=new Box3().setFromObject(group,true);assert(Math.abs(box.max.y-box.min.y-height)<.12*height&&Math.abs(box.min.y)<.05,file+' height/grounding '+box.min.y+' '+box.max.y);
 // Arms hang at the sides, not out in the A-pose.
 for(const s of ['Left','Right'])assert(Math.abs(world(s+'Hand').x-world(s+'Shoulder').x)<.16*height&&world(s+'Hand').y<world(s+'Shoulder').y-.2*height,file+' '+s+' arm must hang');
 // Walking swings the legs and keeps feet above ground; running swings further and bends the knee more; nothing drifts.
 const range=(speed)=>{let lo=1e9,hi=-1e9,low=1e9;for(let i=0;i<240;i++){step(speed/60);const f=world('LeftFoot'),h=world('Hips'),z=(f.z-h.z);lo=Math.min(lo,z);hi=Math.max(hi,z);low=Math.min(low,f.y);}return {swing:hi-lo,low};};
 const walk=range(1.2),run=range(4);assert(walk.swing>.2*height&&run.swing>walk.swing*1.2,file+' gait swing '+walk.swing+' '+run.swing);assert(walk.low>-.04&&run.low>-.06,file+' feet stay above ground');
 assert(group.position.length()===0,'animation must not move the collision root');
 // Sitting: hips meet the seat, feet stay above the floor; standing recovers.
 for(const sit of [{sit:.45},{sit:.54},{sit:0,ground:true}]){group.userData.action=sit;for(let i=0;i<300;i++)step(0);
  const hip=world('Hips').y;assert(hip>0&&hip<.85*height,file+' seated hip '+hip);
  if(!sit.ground)assert(Math.abs(hip-(sit.sit+.1))<.14,file+` hips at seat ${sit.sit}: ${hip}`);
  assert(new Box3().setFromObject(group,true).min.y>(sit.ground?-.14:-.08),file+' feet above floor when seated '+JSON.stringify(sit)+' '+new Box3().setFromObject(group,true).min.y+' hip '+hip);}
 group.userData.action={};for(let i=0;i<300;i++)step(0);
 assert(Math.abs(world('Hips').y-r.hipY*group.scale.y)<.03,file+' standing recovers');
}
console.log('Tripo characters: Mixamo rigs face -Z, hang their arms, and walk, run, sit and stand with the shared gait poses.');
