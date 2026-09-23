import * as T from 'three';
import {mergeGeometries} from 'three/addons/utils/BufferGeometryUtils.js';
import {RAILWAY} from './alignment.js';

export const TRAIN={cars:8,pitch:24.4,speed:16,track:2.135,wheelRadius:.43,contactHeight:5.64};
const margin=240,period=RAILWAY.length+margin*2;
export function railPosition(u,lateral=0){const r=RAILWAY.at(u),extra=u-r.u;return new T.Vector3(r.x+r.tx*extra+r.lx*lateral,r.y+.15,r.z+r.tz*extra+r.lz*lateral);}
export function trainHead(time,direction){const phase=((time*TRAIN.speed+(direction===1?280:600)+margin)%period+period)%period-margin;return direction===1?phase:RAILWAY.length-phase;}
export function carPose(head,index,direction){
 const u=head-direction*index*TRAIN.pitch,lat=direction*TRAIN.track,a=railPosition(u-direction*7.8,lat),b=railPosition(u+direction*7.8,lat);
 return {u,heading:Math.atan2(-(b.x-a.x),-(b.z-a.z)),position:a.add(b).multiplyScalar(.5)};
}

export function createRailway(scene,model){
 const root=new T.Group();root.name='Tuen Ma Line';scene.add(root);
 const mats={steel:new T.MeshStandardMaterial({color:0x737f82,metalness:.65,roughness:.46}),dark:new T.MeshStandardMaterial({color:0x282f31,roughness:.85}),concrete:new T.MeshStandardMaterial({color:0x838985,roughness:.92}),wire:new T.MeshStandardMaterial({color:0x413d34,metalness:.7,roughness:.5}),insulator:new T.MeshStandardMaterial({color:0x765741,roughness:.4}),led:new T.MeshStandardMaterial({color:0xd7cfb2,emissive:0xffdc9a,emissiveIntensity:0}),ballast:new T.MeshStandardMaterial({color:0x525453,roughness:1})};
 const parts=Object.fromEntries(Object.keys(mats).map(k=>[k,[]]));
 function piece(kind,w,h,d,u,x,y){const r=RAILWAY.at(u),p=railPosition(u,x);p.y=r.y+y;parts[kind].push(new T.BoxGeometry(w,h,d).applyMatrix4(new T.Matrix4().makeRotationY(r.heading).setPosition(p)));}
 function rod(kind,a,b,r=.026){const d=b.clone().sub(a),q=new T.Quaternion().setFromUnitVectors(new T.Vector3(0,1,0),d.clone().normalize());parts[kind].push(new T.CylinderGeometry(r,r,d.length(),6).applyMatrix4(new T.Matrix4().compose(a.clone().add(b).multiplyScalar(.5),q,new T.Vector3(1,1,1))));}
 const lamps=[];
 for(let u=0;u<RAILWAY.length;u+=2){
  for(const side of [-1,1]){piece('ballast',3.5,.04,2.05,u,side*TRAIN.track,.025);piece('concrete',2.65,.075,.24,u,side*TRAIN.track,.07);}
 }
 // Contact wire follows each track; messenger sags between portals, droppers keep contact height level.
 const span=32,wirePoint=(u,side,y)=>{const p=railPosition(u,side*TRAIN.track);p.y=RAILWAY.at(u).y+y;return p;};
 for(let start=0;start<RAILWAY.length;start+=span){
  const end=Math.min(start+span,RAILWAY.length),station=Math.abs(start-RAILWAY.stationU)<115;
  for(const side of [-1,1]){
   // Portal crossheads fit beneath the station roof; platform columns carry the station brackets.
   if(!station){piece('steel',.20,6.45,.20,start,side*4.75,3.225);piece('concrete',.65,.25,.65,start,side*4.75,.125);}
   piece('insulator',.16,.30,.16,start,side*TRAIN.track,6.18);
   for(let u=start;u<end;u+=2){const v=Math.min(end,u+2),height=q=>6.00-.20*Math.sin((q-start)/(end-start)*Math.PI);rod('wire',wirePoint(u,side,TRAIN.contactHeight),wirePoint(v,side,TRAIN.contactHeight),.018);rod('wire',wirePoint(u,side,height(u)),wirePoint(v,side,height(v)),.019);}
   for(let u=start;u<=end;u+=8){const p=wirePoint(u,side,TRAIN.contactHeight),q=wirePoint(u,side,6-.2*Math.sin((u-start)/(end-start)*Math.PI));rod('wire',p,q,.012);}
   piece('steel',.38,.11,1.15,start,side*5.22,.92);piece('led',.26,.025,.88,start,side*5.22,1.0);
   piece('steel',.65,.14,.70,start,side*3.3,-1.36);piece('led',.53,.03,.56,start,side*3.3,-1.445);
   const p=railPosition(start,side*3.3);p.y-=1.6;lamps.push({position:p,deck:false,target:p.clone().add(new T.Vector3(0,-20,0))});
   if(!station){piece('steel',.38,.12,.72,start,side*3.7,6.24);piece('led',.29,.03,.59,start,side*3.7,6.165);const q=railPosition(start,side*3.7);q.y+=6;lamps.push({position:q,deck:true,target:railPosition(start,side*TRAIN.track)});}
  }
  piece('steel',station?8.7:9.7,.15,.15,start,0,6.40);
 }
 // Short scenic tunnels conceal off-map recycling of complete eight-car formations.
 for(const [u,sign] of [[-105,-1],[RAILWAY.length+105,1]]){
  piece('concrete',12,1.0,230,u,0,7.4);piece('concrete',12,1.2,230,u,0,-.6);
  for(let d=-96;d<=96;d+=32)piece('concrete',3.2,18,3.2,u+d,0,-10.2);
  for(const side of [-1,1])piece('concrete',.9,7.4,230,u,side*5.55,3.7);
  piece('dark',10.4,7.0,.5,u+sign*115,0,3.5);
  for(const side of [-1,1])for(const rail of [-.715,.715])piece('steel',.075,.15,230,u,side*TRAIN.track+rail,.075);
 }
 for(const [kind,list] of Object.entries(parts)){if(!list.length)continue;const m=new T.Mesh(mergeGeometries(list),mats[kind]);m.name='Railway '+kind;m.castShadow=kind!=='led'&&kind!=='wire';m.receiveShadow=true;root.add(m);for(const g of list)g.dispose();}
 // Fixed low-cost illumination makes the parapet visible along the entire line.
 const strips=[];for(let u=1;u<RAILWAY.length;u+=2)for(const side of [-1,1]){const r=RAILWAY.at(u),p=railPosition(u,side*5.358);p.y=r.y+.50;strips.push(new T.PlaneGeometry(2.02,.67).applyMatrix4(new T.Matrix4().makeRotationY(r.heading+side*Math.PI/2).setPosition(p)));}
 const glow=new T.Mesh(mergeGeometries(strips),new T.MeshBasicMaterial({color:0xb9a070,transparent:true,opacity:.24,depthWrite:false,blending:T.AdditiveBlending,side:T.DoubleSide}));glow.name='Viaduct parapet illumination';glow.visible=false;root.add(glow);strips.forEach(g=>g.dispose());
 // ponytail: four nearby real light sources; fixed emissive fixtures cover the distant viaduct.
 const viaductLights=Array.from({length:4},()=>{const l=new T.SpotLight(0xffdfad,0,36,Math.PI*.42,.8,1.4);l.name='Viaduct downlight';root.add(l,l.target);return l;});
 const trainMaterials=new Map(),trains=[];
 function display(text,w,h){const c=document.createElement('canvas');c.width=768;c.height=128;const x=c.getContext('2d');x.fillStyle='#080d0d';x.fillRect(0,0,768,128);x.fillStyle='#ffbf65';x.font='54px sans-serif';x.textAlign='center';x.fillText(text,384,86);const map=new T.CanvasTexture(c);map.colorSpace=T.SRGBColorSpace;return new T.Mesh(new T.PlaneGeometry(w,h),new T.MeshBasicMaterial({map}));}
 for(const direction of [1,-1]){
  const group=new T.Group();group.name=direction===1?'Tuen Ma Line · Wu Kai Sha':'Tuen Ma Line · Tuen Mun';root.add(group);
  const cars=[];
  for(let i=0;i<TRAIN.cars;i++){
   const source=model.getObjectByName(`car_${String(i+1).padStart(2,'0')}`);if(!source)throw Error('Missing Tuen Ma car '+(i+1));
   const car=source.clone(true);car.position.set(0,0,0);car.rotation.set(0,0,0);const bogies=[],wheels=[];
   car.traverse(n=>{if(n.userData.railBogie)bogies.push(n);if(n.userData.railWheel)wheels.push(n);
    if(n.name.startsWith('headlight'))n.visible=i===0;if(n.name.startsWith('taillight'))n.visible=i===7;
    if(n.userData.destination||n.name.startsWith('destination_side')){const front=!!n.userData.destination,d=display(direction===1?'烏溪沙  WU KAI SHA':'屯門  TUEN MUN',front?1.60:1.65,front?.23:.22);d.rotation.y=front?Math.PI:n.userData.side*Math.PI/2;n.add(d);}
    if(!n.isMesh||!n.material.name.startsWith('tm_'))return;
    if(!trainMaterials.has(n.material.name))trainMaterials.set(n.material.name,n.material.clone());n.material=trainMaterials.get(n.material.name);n.castShadow=true;n.receiveShadow=true;
    if(n.material.name==='tm_glass'){n.material.transparent=true;n.material.opacity=.30;n.material.depthWrite=false;}
   });
   group.add(car);cars.push({root:car,bogies,wheels,index:i});
  }
  const beams=[-1,1].map(side=>{const light=new T.SpotLight(0xd8e9ff,0,95,.24,.55,1.4);light.name='Tuen Ma headlight beam';cars[0].root.add(light,light.target);light.position.set(side*.9,1.8,-12.2);light.target.position.set(side*1.3,-.1,-85);return light;});
  trains.push({group,cars,direction,beams,head:0,emitters:[]});
 }
 let night=false;
 function setNight(on){night=on;glow.visible=on;mats.led.emissiveIntensity=on?3:0;for(const [name,m] of trainMaterials){const cabin=['tm_cabin_light','tm_map'].includes(name),light=['tm_headlight','tm_taillight','tm_amber'].includes(name);if(cabin||light)m.emissiveIntensity=on?(light?4:2.4):.4;else if(name==='tm_glass'){m.emissive.set(0xbad2c2);m.emissiveIntensity=on?.45:0;m.opacity=on?.42:.30;}else if(['tm_ivory','tm_seat','tm_yellow','tm_floor'].includes(name)){m.emissive.copy(m.color);m.emissiveIntensity=on?.65:0;}}for(const t of trains)for(const l of t.beams)l.intensity=on?140:0;for(const l of viaductLights)l.intensity=on?150:0;}
 function update(time,camera){
  for(const t of trains){t.head=trainHead(time,t.direction);t.emitters.length=0;
   for(const c of t.cars){const p=carPose(t.head,c.index,t.direction),flip=c.index===7?-1:1,orientation=t.direction*flip;c.root.position.copy(p.position);c.root.rotation.y=p.heading+(flip===-1?Math.PI:0);c.root.visible=p.u>-220&&p.u<RAILWAY.length+220;
    for(const b of c.bogies){const u=p.u-b.position.z*orientation;b.rotation.y=RAILWAY.at(u).heading+(orientation<0?Math.PI:0)-c.root.rotation.y;}
    for(const w of c.wheels)w.rotation.x=-time*TRAIN.speed/TRAIN.wheelRadius*flip;
    if(p.u>=0&&p.u<=RAILWAY.length)t.emitters.push(p.position);
   }
  }
  if(camera){const sorted=lamps.map(l=>({...l,d:l.position.distanceToSquared(camera.position)})).sort((a,b)=>a.d-b.d),nearest=[...sorted.filter(l=>l.deck).slice(0,2),...sorted.filter(l=>!l.deck).slice(0,2)];viaductLights.forEach((l,i)=>{l.position.copy(nearest[i].position);l.target.position.copy(nearest[i].target);l.intensity=night&&nearest[i].d<250**2?(nearest[i].deck?220:150):0;});}
 }
 update(0);return {root,trains,setNight,update,lamps,viaductLights,trainMaterials,alignment:RAILWAY};
}
