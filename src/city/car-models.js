import * as T from 'three';
import {contactShadow} from '../street-models.js';
import {lampHandles,paintVehicleLamps,useLampMask} from './car-lamps.js';
import {FLEET_LAMPS} from './vehicle-lenses.js';

const trafficLamps=new Map();
export function prepareTrafficLamps(root,spec){
 const handles=paintVehicleLamps(root,FLEET_LAMPS[spec.id],{forward:-1});
 if(handles)trafficLamps.set(spec.id,handles);
}
export function trafficLights(on){
 for(const handles of trafficLamps.values())setLampLevels(handles,on,false,false);
}
function setLampLevels(lamps,on,braking,reversing){
 for(const m of lamps.front)m.emissiveIntensity=on?4:0;
 for(const m of lamps.rear)m.emissiveIntensity=braking?5:on?1.5:0;
 for(const m of lamps.reverse)m.emissiveIntensity=reversing?3:0;
}
export function playerModel(model,spec){
 const group=new T.Group();
 let lamps;
 const reflective=new Set();
 if(spec.url){
  lamps=paintVehicleLamps(model,spec.lampMask);
  model.traverse(n=>{for(const mat of [n.material].flat())if(mat?.isMeshStandardMaterial)reflective.add(mat);});
  model.rotation.y=Math.PI;
 }else{
  const levels={head:{value:0},tail:{value:0},reverse:{value:0}};
  lamps=lampHandles(levels,FLEET_LAMPS[spec.id]?.gain);
  const copies=new Map();
  model.traverse(n=>{
   const mat=n.material;
   if(!n.isMesh||!mat?.isMeshStandardMaterial)return;
   const channel=mat.userData.driveLamp;
   const paint=!!mat.lensMask||mat.userData.driveReflective;
   if(!paint&&!channel)return;
   if(!copies.has(mat)){
    const copy=mat.clone();copies.set(mat,copy);
    if(mat.lensMask)useLampMask(copy,mat.lensMask,levels);
    else if(channel){
     copy.emissive.copy(copy.color);copy.emissiveMap=copy.map;lamps[channel].push(copy);
    }
   }
   n.material=copies.get(mat);if(paint)reflective.add(n.material);
  });
 }
 if(!spec.url){contactShadow(group,.5);group.getObjectByName('contact shadow').scale.set(spec.width*1.1,1,spec.length*1.06);}
 group.reflectiveMaterials=reflective;group.add(model);group.name='Player · '+spec.name;
 const beams=[-1,1].map(side=>{
  const beam=new T.SpotLight(0xfff1db,0,65,.34,.55,2),front=spec.lamps?.front;
  const x=side*(front?.x??spec.width*.34),z=-(front?.z??spec.length/2);
  beam.position.set(x,front?.y??Math.min(1,spec.height*.48||.82),z);
  beam.target.position.set(x*.7,.12,z-28);group.add(beam,beam.target);return beam;
 });
 group.driveLights=(on,braking=false,reversing=false)=>{
  if(lamps)setLampLevels(lamps,on,braking,reversing);
  for(const beam of beams){beam.visible=on;beam.intensity=on?1800:0;}
 };
 group.rotateWheels=(distance,steer)=>{
  for(const w of model.userData.wheels??[]){w.w.rotation.x+=distance/w.r;if(w.front)w.pivot.rotation.y=steer;}
 };
 group.driveLights(false);
 return group;
}
