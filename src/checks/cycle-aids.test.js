// Run: node src/checks/cycle-aids.test.js
import assert from 'node:assert/strict';
import * as T from 'three';
import {cycleRibbon} from '../environment.js';
import {cycleSample,cycleBridgeHeight,cycleCrossing,LENGTH} from '../alignment.js';
import {buildCycleAids,cycleMarkGeometry,cycleSignPose,CYCLE_PEDESTRIAN,CYCLE_DOWNHILL,CYCLE_ENDS} from '../street/cycle-aids.js';
const noop=new Proxy(function(){},{get:()=>noop,apply:()=>noop,set:()=>true});
globalThis.document={createElement:()=>({getContext:()=>noop})};
// UV top follows the rider, both sides of bends and sloping bridge approaches. Paint never floats horizontally.
for(const s of [1200,...CYCLE_DOWNHILL.map(d=>d.s+d.dir*40).filter(s=>s>5&&s<LENGTH-5)])for(const dir of [-1,1]){
 const g=cycleMarkGeometry(cycleRibbon,s,dir*.94,1.25,3.4,dir),p=g.attributes.position,uv=g.attributes.uv;
 assert(g.index.count>0);const a=new T.Vector3().fromBufferAttribute(p,0),b=new T.Vector3().fromBufferAttribute(p,p.count-2),f=cycleSample(s);
 assert((b.x-a.x)*f.tx+(b.z-a.z)*f.tz>0,'Mark geometry follows track tangent');
 assert((uv.getY(p.count-2)-uv.getY(0))*dir>.99,'Arrow points in rider travel direction');
 assert((uv.getX(0)-uv.getX(1))*dir>.99,'Bicycle/text is not mirrored');
 assert(Math.abs(a.y-cycleSample(s-1.7).groundY-cycleBridgeHeight(s-1.7)-.028)<.0002,'Mark touches ramp surface');
 const sign=cycleSignPose(s,dir),front=new T.Vector3(0,0,1).applyAxisAngle(new T.Vector3(0,1,0),sign.yaw);
 assert(front.x*f.tx*dir+front.z*f.tz*dir<-.999,'Sign faces approaching rider');
}
const group=buildCycleAids(cycleRibbon,new T.MeshStandardMaterial(),new T.MeshStandardMaterial());
assert(group.children.length<25,'Markings and signs are merged, not thousands of draw calls');
for(const m of group.children)assert([...m.geometry.attributes.position.array].every(Number.isFinite),m.name+' has finite geometry');
assert.equal(group.getObjectByName('Cycle pedestrian crossing').geometry.index.count,CYCLE_PEDESTRIAN.length*12,'All pedestrian crossing surfaces present');
assert.equal(group.getObjectByName('Cycle sign keep-left').geometry.index.count,CYCLE_PEDESTRIAN.length*2*6);
assert(group.getObjectByName('Cycle sign slope'));assert(group.getObjectByName('Cycle marking end'));
for(const e of CYCLE_ENDS)assert(!cycleCrossing(e.s-e.dir*5),'End markings precede carriageway');
console.log(`Cycle aids: ${CYCLE_PEDESTRIAN.length} pedestrian crossings, ${CYCLE_DOWNHILL.length} downhill approaches, ${CYCLE_ENDS.length} ends; paint alignment and sign orientation passed`);

// Every printed face must be in front of its supporting pole, including plates sharing one post.
const posts=group.getObjectByName('Cycle sign posts');group.updateMatrixWorld(true);
for(const face of group.children.filter(m=>m.name.startsWith('Cycle sign ')&&!['Cycle sign posts','Cycle sign backs'].includes(m.name))){
 const p=face.geometry.attributes.position,n=face.geometry.attributes.normal;
 for(let i=0;i<p.count;i+=4){const centre=new T.Vector3();for(let j=0;j<4;j++)centre.add(new T.Vector3().fromBufferAttribute(p,i+j));centre.multiplyScalar(.25);centre.y+=.013; // Avoid the shared triangle edge after world-coordinate float rounding.
  const normal=new T.Vector3().fromBufferAttribute(n,i),ray=new T.Raycaster(centre.clone().addScaledVector(normal,.25),normal.clone().negate(),0,.4),hits=ray.intersectObjects([face,posts]);
  assert(hits.length&&hits[0].object===face,face.name+' pole must not cover the printed face');
  const pole=hits.find(h=>h.object===posts);assert(pole&&pole.distance-hits[0].distance>.018,face.name+' has physical clearance from pole');
 }
}
const {placeFurniture}=await import('../street/furniture.js');
for(const rot of [0,90,180,270]){
 const parts=[];placeFurniture({items:[{type:'cycle_sign',road:'cycleway',ch:1200,side:'L',off:.5,rot}]},{kitParts:()=>[],batch:(key,geometry,material,pos,scale,rotation)=>{const m=new T.Mesh(geometry,material);m.name=key;m.position.copy(pos);m.scale.copy(scale);m.rotation.copy(rotation);m.updateMatrixWorld(true);parts.push(m);}});
 const face=parts.find(m=>m.name==='furn-cycle-sign'),normal=new T.Vector3(0,0,1).transformDirection(face.matrixWorld),ray=new T.Raycaster(face.position.clone().addScaledVector(normal,.25),normal.clone().negate(),0,.4),hits=ray.intersectObjects(parts);
 assert.equal(hits[0].object,face,'Editable cycle sign face clears pole at rotation '+rot);
 assert(hits.find(h=>h.object.name==='furn-cycle-sign-post').distance-hits[0].distance>.018);
}
console.log('All cycle-sign faces clear their rear-mounted posts, including four editable orientations');
