import assert from 'node:assert/strict';
import fs from 'node:fs';
import * as T from 'three';
import {pavementLight} from '../environment.js';
import {cyclingPose,posePedestrian,PEDESTRIAN_COUNT,windMaterial} from '../street-models.js';
const readGLB=path=>{const b=fs.readFileSync(path);return JSON.parse(b.subarray(20,20+b.readUInt32LE(12)).toString());};
const kit=readGLB('public/assets/street-kit.glb'),names=kit.nodes.map(n=>n.name);
for(const name of ['cyclist','seated_rider','bike_wheel_front','bike_wheel_rear','car','taxi','van','truck','bus',...['residential','tech','logistics','village'].map(n=>'building_'+n)])assert(names.includes(name),`Missing ${name}`);
for(const side of [-1,1])for(const part of ['thigh','shin','crank','pedal'])assert(names.includes(part+'_'+side));
for(let i=0;i<PEDESTRIAN_COUNT;i++)for(const side of [-1,1])for(const limb of ['arm','leg'])assert(names.includes(`pedestrian_${i}_${limb}_${side}`));
for(let phase=0;phase<Math.PI*2;phase+=.05)for(const side of [-1,1]){const {hip,knee,foot}=cyclingPose(phase,side);assert(Math.abs(hip.distanceTo(knee)-.45)<1e-8);assert(Math.abs(knee.distanceTo(foot)-.46)<1e-8);assert(foot.y>.2);assert(knee.z<hip.z,'Knees bend toward handlebars');}
const tram=readGLB('public/assets/art.glb');assert(tram.materials.some(m=>m.name==='cabin_led'&&m.emissiveFactor.some(v=>v>0)));
console.log('Blender templates, pedestrian pivots, full pedal cycle and tram LEDs passed');

for(const kind of ['grass','meadow','fern','shrub','flowering'])assert(names.includes('vegetation_'+kind));
const people=kit.nodes.filter(n=>/^pedestrian_\d+$/.test(n.name));
assert.equal(people.length,10);
for(const gender of ['male','female'])for(const age of ['adult','older','child'])assert(people.some(p=>p.extras.gender===gender&&p.extras.age===age));
assert.equal(people.filter(p=>p.extras.wheelchair).length,2);
const chair=new T.Group();chair.userData.wheelchair=true;
for(const name of ['chair_wheel_1','pedestrian_8_arm_1','pedestrian_8_leg_1']){const part=new T.Group();part.name=name;chair.add(part);}
posePedestrian(chair,.31);assert.equal(chair.children[0].rotation.x,-1);assert.equal(chair.children[2].rotation.x,0);posePedestrian(chair,0);assert.equal(chair.children[0].rotation.x,-1);
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
 const roof=station.materials.findIndex(m=>m.name.startsWith('roof'));
 for(const m of station.meshes)for(const p of m.primitives)if(p.material===roof)assert(station.accessors[p.indices].count>=17*10*36,'Canopy has six-sided shell sections, not double-sided planes');
}
assert.equal(new Set(stationColours).size,7,'Distinct colours at all seven stations');
console.log('Seven distinct Blender station colours, solid canopy shells and separate illuminated lettering passed');
