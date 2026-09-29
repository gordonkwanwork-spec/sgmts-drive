import assert from 'node:assert/strict';
import fs from 'node:fs';
import * as T from 'three';
import {pavementLight,lampFade} from '../environment.js';
import {cyclingPose,poseCyclist,posePedestrian,gaitAngles,PEDESTRIAN_COUNT,windMaterial} from '../street-models.js';
// Node has no image decoder. Geometry/rig checks only need an image handle; actual
// texture decoding and appearance are checked in the browser model viewer.
globalThis.self??=globalThis;
globalThis.createImageBitmap??=async()=>({width:1024,height:1024,close(){}});
const readGLB=path=>{const b=fs.readFileSync(path);return JSON.parse(b.subarray(20,20+b.readUInt32LE(12)).toString());};
const kit=readGLB('public/assets/street-kit.glb'),names=kit.nodes.map(n=>n.name);
for(const name of ['cyclist','seated_rider','bike_wheel_front','bike_wheel_rear','car','taxi','van','truck','bus',...['residential','tech','logistics','village'].map(n=>'building_'+n)])assert(names.includes(name),`Missing ${name}`);
for(const side of [-1,1])for(const part of ['crank','pedal'])assert(names.includes(part+'_'+side));
assert(names.includes('P12_hips'),'Cyclist uses a continuous skinned human');
for(let i=0;i<PEDESTRIAN_COUNT;i++)for(const joint of ['hips','spine','chest','neck','head',...['clavicle','upperarm','forearm','hand','thigh','shin','foot','toe'].flatMap(b=>[b+'_L',b+'_R'])])assert(names.includes(`P${i}_${joint}`),`Missing bone P${i}_${joint}`);
assert(kit.skins.length>=PEDESTRIAN_COUNT,'Every pedestrian is one skinned mesh');
for(const name of ['litter_bin','railing_type2','railing_type2_end','railing_crossing','railing_crossing_end','railing_post','gully_grating','kerb_weir'])assert(names.includes(name),`Missing street furniture ${name}`);
// Gait: knees never hyperextend, arms oppose legs, running flexes knees further than walking.
let walkPeak=0,runPeak=0;
for(let ph=0;ph<Math.PI*2;ph+=.05){const w=gaitAngles(ph,1.4),r=gaitAngles(ph,5);for(const side of ['1','-1']){assert(w.legs[side].knee<=0&&r.legs[side].knee<=0);if(Math.abs(w.legs[side].hip)>.2)assert(Math.sign(w.arms[side].shoulder)===-Math.sign(w.legs[side].hip));}walkPeak=Math.min(walkPeak,w.legs['1'].knee);runPeak=Math.min(runPeak,r.legs['1'].knee);}
assert(walkPeak<-.9&&walkPeak>-1.3&&runPeak<walkPeak-.5,'Mid-swing knee flexion ~60° walking, more when running');
for(let phase=0;phase<Math.PI*2;phase+=.05)for(const side of [-1,1]){const {hip,knee,foot}=cyclingPose(phase,side);assert(Math.abs(hip.distanceTo(knee)-.45)<1e-8);assert(Math.abs(knee.distanceTo(foot)-.46)<1e-8);assert(foot.y>.2);assert(knee.z<hip.z,'Knees bend toward handlebars');}
const tram=readGLB('public/assets/art.glb');assert(tram.materials.some(m=>m.name==='cabin_led'&&m.emissiveFactor.some(v=>v>0)));
// Walking the camera along a dense row of lamps (viaduct): at most 6 lit, and no lamp's brightness jumps between steps.
{const lamps=Array.from({length:40},(_,i)=>({x:i*9,y:i%2?12:6}));let prev=null;
 for(let x=-50;x<400;x+=.25){const k=lampFade(lamps.map(l=>Math.hypot(l.x-x,l.y)),6);assert(k.filter(v=>v>0).length<=6);if(prev)k.forEach((v,i)=>assert(Math.abs(v-prev[i])<.05,'Lamp pops at x='+x));prev=k;}}
console.log('Blender templates, pedestrian pivots, full pedal cycle and tram LEDs passed');

for(const kind of ['grass','meadow','fern','shrub','flowering'])assert(names.includes('vegetation_'+kind));
const people=kit.nodes.filter(n=>/^pedestrian_\d+$/.test(n.name));
assert.equal(people.length,PEDESTRIAN_COUNT);
for(const gender of ['male','female'])for(const age of ['adult','older','child'])assert(people.some(p=>p.extras.gender===gender&&p.extras.age===age));
assert.equal(people.filter(p=>p.extras.wheelchair).length,2);
for(const p of people){assert.equal(p.extras.modelVersion,'reference-mesh-v1');assert(p.extras.triangles<24000,'NPC stays within the crowd geometry budget');}
assert.equal(kit.images.length,13,'All thirteen characters have their own reference atlas');
for(const material of kit.materials.filter(m=>m.name.startsWith('person_reference_')))assert(material.pbrMetallicRoughness.baseColorTexture,'Reference texture is exported');
const chair=new T.Group();chair.userData.wheelchair=true;
{const part=new T.Group();part.name='chair_wheel_1';chair.add(part);}
posePedestrian(chair,.31);assert.equal(chair.children[0].rotation.x,-1);posePedestrian(chair,0);assert.equal(chair.children[0].rotation.x,-1);
const clock={value:0},mat=windMaterial(new T.MeshStandardMaterial(),clock),shader={uniforms:{},vertexShader:'#include <begin_vertex>'};mat.onBeforeCompile(shader);assert.equal(shader.uniforms.windTime,clock);assert(shader.vertexShader.includes('instanceMatrix[3]'));clock.value=2;assert.equal(shader.uniforms.windTime.value,2);
const lamp={s:0,x:0,y:10,z:0,kind:'cross road',axis:{tx:1,tz:0,lx:0,lz:1}};
assert(pavementLight(new T.Vector3(13,0,0),[lamp])>pavementLight(new T.Vector3(0,0,13),[lamp]),'Pools follow the connecting road axis');
console.log('Diverse ages/genders, wheelchair motion, five Blender plant types, wind uniforms and cross-road lighting passed');

const stationColours=[];
for(let i=1;i<=7;i++){
 const station=readGLB(`public/assets/station-A${i}.glb`),accent=station.materials.find(m=>m.name.startsWith('accent'));
 stationColours.push(accent.pbrMetallicRoughness.baseColorFactor.join(','));
 const sign=station.materials.findIndex(m=>m.name.startsWith('sign_text'));
 assert(sign>=0&&station.materials[sign].emissiveFactor.some(v=>v>0),'Sign lettering is separate and luminous');
 assert(station.meshes.some(m=>m.primitives.some(p=>p.material===sign)),'Station sign has visible geometry');
 const {GLTFLoader}=await import('three/addons/loaders/GLTFLoader.js'),buf=fs.readFileSync(`public/assets/station-A${i}.glb`);
 const {scene}=await new Promise((ok,fail)=>new GLTFLoader().parse(buf.buffer.slice(buf.byteOffset,buf.byteOffset+buf.byteLength),'',ok,fail));
 scene.updateMatrixWorld(true);
 for(const platform of scene.children.filter(n=>n.name.includes('_platform_'))){
  let front=Infinity,roofs=0;const edges=new Map();
  platform.traverse(n=>{
   if(!n.isMesh)return;
   const p=n.geometry.attributes.position,roof=n.material.name.startsWith('roof')||n.parent.name.endsWith('_roof'),keys=[];
   for(let j=0;j<p.count;j++){
    const v=new T.Vector3().fromBufferAttribute(p,j).applyMatrix4(n.matrixWorld),along=v.z-platform.position.z;
    const curb=7.05+(i===1?Math.max(0,along-25)*.42:0),setback=Math.abs(v.x)-curb;
    if(roof||n.material.name.startsWith('accent')&&v.y>2.5){assert(setback>=.5-1e-4,`A${i}: roof and fascia stay 500 mm behind curb (${setback})`);front=Math.min(front,setback);}
    if(roof)keys.push([v.x,v.y,v.z].map(x=>x.toFixed(4)).join(','));
   }
   if(roof){
    roofs++;const index=n.geometry.index;
    for(let j=0;j<index.count;j+=3)for(let k=0;k<3;k++){
     const a=keys[index.getX(j+k)],b=keys[index.getX(j+(k+1)%3)],edge=[a,b].sort().join('|');
     assert.notEqual(a,b,'No collapsed canopy edges');edges.set(edge,(edges.get(edge)||0)+1);
    }
   }
  });
  assert(roofs>0);assert([...edges.values()].every(count=>count===2),`A${i} ${platform.name}: each canopy shell is watertight across material boundaries`);
  assert(Math.abs(front-.5)<1e-4,'Canopy front is exactly 500 mm from curb');
 }
}
assert.equal(new Set(stationColours).size,7,'Distinct colours at all seven stations');
console.log('Seven station colours, watertight canopy shells, 500 mm curb setbacks and illuminated lettering passed');

// Real skinned rig from the kit: bench sitting puts the pelvis on the seat and feet on the floor ahead;
// a jump tucks the knees up; walking never hyperextends a knee. Positions in the character's frame (−Z forward).
{const {GLTFLoader}=await import('three/addons/loaders/GLTFLoader.js');const buf=fs.readFileSync('public/assets/street-kit.glb');
 const gltf=await new Promise((ok,fail)=>new GLTFLoader().parse(buf.buffer.slice(buf.byteOffset,buf.byteOffset+buf.byteLength),'',ok,fail));
 for(let i=0;i<13;i++){
  const body=gltf.scene.getObjectByName('pedestrian_'+i+'_body'),colour=body.geometry.attributes.color;
  assert(body.isSkinnedMesh&&body.material.map&&colour,'Each human exports a skinned, textured mesh with vertex colour');
  const red=Array.from({length:colour.count},(_,j)=>colour.getX(j));
  assert(Math.min(...red)<.1&&Math.max(...red)>.8,'Hair/skin colours survive GLB export');
 }
 const {clone}=await import('three/addons/utils/SkeletonUtils.js'),person=clone(gltf.scene.getObjectByName('pedestrian_2'));
 const cycle=clone(gltf.scene.getObjectByName('cyclist')),actor={group:cycle,wheels:['bike_wheel_front','bike_wheel_rear'].map(n=>cycle.getObjectByName(n)),phase:0,v:4};
 for(let frame=0;frame<120;frame++){
  poseCyclist(actor,1/60);cycle.updateMatrixWorld(true);
  for(const side of [-1,1]){const n=side===1?'R':'L',ankle=cycle.worldToLocal(cycle.getObjectByName('P12_foot_'+n).getWorldPosition(new T.Vector3())),pedal=cycle.getObjectByName('pedal_'+side).position;
   assert(ankle.distanceTo(pedal.clone().add(new T.Vector3(0,.085,.04)))<.055,'Cyclist ankle follows its pedal through the complete cycle');}
 }
 const bone=n=>person.getObjectByName('P2_'+n),at=n=>{person.updateMatrixWorld(true);return person.worldToLocal(bone(n).getWorldPosition(new T.Vector3()));};
 const settle=(action,distance=0)=>{person.userData.action=action;for(let i=0;i<150;i++)posePedestrian(person,distance,1/60);};
 settle({});const stand=at('hips').y;assert(Math.abs(at('foot_L').y-.09)<.05,'Standing ankle above the floor');
 settle({sit:.45});assert(Math.abs(at('hips').y-.55)<.04,'Pelvis rests on a 0.45 m seat');assert(at('foot_L').y<.13&&at('foot_L').z<-.2,'Seated feet on the floor, ahead of the hips');
 settle({sit:0,ground:true});assert(at('hips').y<.2&&at('foot_L').y>-.02&&at('shin_L').y>at('hips').y,'Ground sit: knees up, heels on the ground');
 settle({air:true});assert(at('shin_L').y>.55&&at('shin_L').z<-.15,'Airborne tuck raises the knees forward');
 settle({});let lowest=1;for(let i=0;i<120;i++){posePedestrian(person,1.4/60,1/60);lowest=Math.min(lowest,at('toe_L').y);assert(at('hips').y>stand-.08);}assert(lowest>-.05,'Walking feet do not sink through the floor');
 console.log('Skinned pedestrians: bench/ground sitting, jump tuck and walking poses passed');}
