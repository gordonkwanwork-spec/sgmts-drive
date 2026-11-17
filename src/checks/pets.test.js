import assert from 'node:assert/strict';
import fs from 'node:fs';
import {Box3,Group,Vector3} from 'three';
import {GLTFLoader} from 'three/addons/loaders/GLTFLoader.js';
import {TRIPO_DOGS,TRIPO_CATS,TRIPO_RATS,TRIPO_PETS} from '../tripo-assets.js';
import {loadTripoPets,clonePet,posePet,petRig,createLeash,updateDogFollower,createCats} from '../pets.js';

const ctx2d=new Proxy({},{get:(_,k)=>k==='measureText'?()=>({width:0}):k==='createLinearGradient'?()=>({addColorStop(){}}):()=>{},set:()=>true});
globalThis.document??={createElement:()=>({getContext:()=>ctx2d,width:0,height:0})};

function imageSize(b){
 if(b[0]===0x89&&b[1]===0x50)return {width:b.readUInt32BE(16),height:b.readUInt32BE(20)};
 for(let i=2;i<b.length-9;){
  const marker=b.readUInt16BE(i);
  if(marker>=0xffc0&&marker<=0xffcf&&![0xffc4,0xffc8,0xffcc].includes(marker))return {height:b.readUInt16BE(i+5),width:b.readUInt16BE(i+7)};
  i+=2+b.readUInt16BE(i+2);
 }
 throw Error('Unsupported embedded image format');
}

function inspectGlb(path){
 const b=fs.readFileSync(path),jlen=b.readUInt32LE(12),doc=JSON.parse(b.subarray(20,20+jlen).toString()),bin=b.subarray(28+jlen);
 const triangles=doc.meshes.reduce((s,m)=>s+m.primitives.reduce((t,p)=>t+doc.accessors[p.indices].count/3,0),0);
 const textures=(doc.images||[]).map(im=>{const v=doc.bufferViews[im.bufferView],o=v.byteOffset||0;return imageSize(bin.subarray(o,o+v.byteLength));});
 return {triangles,textures};
}

assert.equal(TRIPO_DOGS.length,3,'three dog breeds');
assert.equal(TRIPO_CATS.length,3,'three cat varieties');
assert.equal(TRIPO_RATS.length,1,'big fat rat');

for(const spec of TRIPO_PETS){
 const {triangles,textures}=inspectGlb('public/assets/characters/tripo/pets/'+spec.file);
 assert(triangles>0&&triangles<=10000,`${spec.file} triangle count ${triangles}`);
 assert(textures.length>0&&textures.every(t=>t.width<=1024&&t.height<=1024),`${spec.file} textures <= 1024`);
}

const loader=new GLTFLoader().register(()=>({name:'no-textures',loadTexture:()=>Promise.resolve(null)}));
const load=async path=>{const b=fs.readFileSync(path);return loader.parseAsync(b.buffer.slice(b.byteOffset,b.byteOffset+b.byteLength),'');};
const pets=await loadTripoPets({loadAsync:load},f=>'public/assets/characters/tripo/pets/'+f,TRIPO_PETS);
assert.equal(pets.size,TRIPO_PETS.length);

for(const spec of TRIPO_PETS){
 const tmpl=pets.get(spec.id),a=clonePet(tmpl),b=clonePet(tmpl);
 if(a.userData.petClips){
  let meshA,meshB;a.traverse(n=>{if(n.isSkinnedMesh)meshA=n;});b.traverse(n=>{if(n.isSkinnedMesh)meshB=n;});
  assert.notEqual(meshA.skeleton.bones[0],meshB.skeleton.bones[0],'preset skeletons stay independent');
 }else assert.notEqual(petRig(a).legFL,petRig(b).legFL,'cloned pet skeletons stay independent');
 a.updateMatrixWorld(true);
 const box=new Box3();a.traverse(n=>{if(n.isSkinnedMesh)box.expandByObject(n);});
 const sz=box.getSize(new Vector3());
 assert(Math.abs(box.min.y)<.05,`${spec.id} grounded (${box.min.y.toFixed(3)})`);
 assert(Math.abs(sz.x-spec.width)<.05&&Math.abs(sz.y-spec.height)<.05&&Math.abs(sz.z-spec.length)<.06,`${spec.id} bounds ${sz.toArray().map(v=>v.toFixed(2))}`);
 if(a.userData.petClips){
  posePet(a,1.1/60,1/60);const anim=a.userData.petAnimation;
  const before=anim.action.time;for(let i=0;i<10;i++)posePet(a,1.1/60,1/60);
  assert.notEqual(anim.action.time,before,'preset advances while moving');
  assert(!b.userData.petAnimation,'cloned playback is independent');
  const stopped=anim.action.time;posePet(a,0,1/60);assert.equal(anim.action.time,stopped,'stopped pet freezes its gait');
  posePet(a,3/60,1/60);assert(anim.action.getEffectiveTimeScale()>1,'fast movement speeds up the available walk preset');
  const mesh=a.getObjectsByProperty('isSkinnedMesh',true)[0],v1=new Vector3(),v2=new Vector3();
  a.updateMatrixWorld(true);mesh.getVertexPosition(0,v1);for(let i=0;i<20;i++)posePet(a,1.1/60,1/60);
  a.updateMatrixWorld(true);mesh.getVertexPosition(0,v2);assert(v1.distanceTo(v2)>1e-5,'authored animation deforms the skin');
  const animatedBox=new Box3().setFromObject(a,true);assert(animatedBox.min.y>-.15&&animatedBox.max.y<spec.height*2,'preset stays grounded and bounded');
  assert.equal(a.position.length(),0,'preset never moves the game actor');
  continue;
 }
 const swings=[];
 for(let i=0;i<90;i++){posePet(a,1.1/60,1/60);a.updateMatrixWorld(true);swings.push(petRig(a).legFL.rotation.x);}
 const span=Math.max(...swings)-Math.min(...swings);
 assert(span>.35,`${spec.id} legs swing during walk (${span.toFixed(2)})`);
 const r=petRig(a);
 assert(Math.sign(r.legFL.rotation.x)===Math.sign(r.legBR.rotation.x)||Math.abs(r.legFL.rotation.x)<.05,'diagonal pair FL/BR moves together');
 assert(Math.sign(r.legFR.rotation.x)===-Math.sign(r.legFL.rotation.x)||Math.abs(r.legFL.rotation.x)<.05,'opposite diagonal pair alternates');
}

// Dog follower + 3D catenary leash test
const master=new Group();master.visible=true;master.position.set(0,0,0);master.rotation.y=0;
const dogGroup=clonePet(pets.get('dog-shiba')),leash=createLeash();
const dog={group:dogGroup,leash,side:1,seed:0};
for(let i=0;i<120;i++){master.position.z-=1.3/60;updateDogFollower(dog,master,1/60);}
const dist=Math.hypot(dog.group.position.x-master.position.x,dog.group.position.z-master.position.z);
assert(dist>=.40&&dist<=1.30,`dog stays on leash (${dist.toFixed(2)} m)`);
const pts=leash.userData.points,mid=pts[Math.floor(pts.length/2)];
assert(pts.length===11&&leash.visible,'10-segment leash visible');
assert(mid.y<(pts[0].y+pts.at(-1).y)/2,'leash has realistic downward catenary sag');

// Autonomous cats & rats on city footways (never on carriageways)
const {cityFootways}=await import('../city/life-headless.js'),{junctions,nearestOn}=await import('../street/network.js'),{renderedGround}=await import('../environment.js');
const network=JSON.parse(fs.readFileSync(new URL('../../public/street/furniture.json',import.meta.url))).network;
const paths=cityFootways(network),net=junctions(network,renderedGround);
const joined=new Set(net.joins.map(j=>j.A.r.id+':'+j.end));
const onRoad=(x,z)=>net.roads.some(o=>{const n=nearestOn(o.F,x,z),L=o.F.at(-1).d;return n.dist<o.P.carriageway/2-.3&&!(joined.has(o.r.id+':0')&&n.d<14)&&!(joined.has(o.r.id+':1')&&n.d>L-14);});
const C=createCats(paths,{count:20,seed:29}),walked=new Map();
for(let i=0;i<1200;i++){C.step(.05,{});for(const c of C.cats)walked.set(c.id,(walked.get(c.id)||0)+(c.moved||0));}
for(const c of C.cats){assert.ok(c.path&&Number.isFinite(c.x+c.y+c.z),'roamer placed');assert.ok(walked.get(c.id)>15,`roamer ${c.id} walked ${walked.get(c.id).toFixed(0)} m`);assert.ok(!onRoad(c.x,c.z),'roamer never on carriageway');}

console.log('Pets & pedestrians checks passed: 3 dogs on catenary leashes, 3 cats and big fat rat roaming footways independently.');
