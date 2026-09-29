import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import * as T from 'three';
import {GLTFLoader} from 'three/addons/loaders/GLTFLoader.js';
import {doorLeafPose} from '../operating.js';
import {untexturedGLB} from './glb-geometry.js';

// 29 Sep 2026: split plug doors must leave the whole doorway clear; wheels sit under raised podiums or the cab floor.
const bytes=readFileSync('public/assets/art.glb');
const root=(await new GLTFLoader().parseAsync(untexturedGLB(bytes),'')).scene;
root.updateMatrixWorld(true);
const doors=[],leafMeshes=new Set(),solids=[];
root.traverse(n=>{if(/_door_(left|right)_[01]$/.test(n.name))doors.push(n);});
for(const d of doors)for(const l of d.children)l.traverse(m=>{if(m.isMesh)leafMeshes.add(m);});
root.traverse(n=>{if(n.isMesh&&!leafMeshes.has(n)&&!/_wheel_/.test(n.name))solids.push(n);});
assert.equal(doors.length,12,'Four doorways per section');
const ray=new T.Raycaster(),HALF=.535;

for(const d of doors){
 const leaves=d.children.filter(c=>/_leaf_[ab]$/.test(c.name));
 assert.equal(leaves.length,2,d.name+' has two leaves');
 const c=d.getWorldPosition(new T.Vector3()),out=Math.sign(c.x);
 // Horizontal rays through the doorway, from outside to 0.4 m inside the lining, hit nothing but the leaves.
 for(const z of [.75,1.2,1.7,2.2,2.5])for(const dz of [-.45,-.2,0,.2,.45]){
  ray.set(new T.Vector3(out*1.8,z,c.z+dz),new T.Vector3(-out,0,0));ray.far=1.8-.8;
  const hit=ray.intersectObjects(solids,false)[0];
  assert(!hit,`${d.name} obstructed by ${hit?.object.name} at height ${z}`);
 }
 const box=l=>new T.Box3().setFromObject(l);
 // Closed: the two leaves span the opening. Open: both clear it completely.
 const closed=box(leaves[0]).union(box(leaves[1]));
 assert(closed.min.z<=c.z-HALF+.005&&closed.max.z>=c.z+HALF-.005,d.name+' closed leaves cover the doorway');
 const {out:o,slide}=doorLeafPose(1);
 for(const l of leaves){const b=l.position.clone();l.position.x+=out*o;l.position.z+=Math.sign(b.z)*slide;l.updateMatrixWorld(true);
  const bb=box(l);assert(bb.max.z<=c.z-HALF+.001||bb.min.z>=c.z+HALF-.001,`${l.name} open leaf clears the doorway`);
  assert(out*bb.min.x>1.3||out*bb.max.x>1.36,`${l.name} slides outside the bodyside`);l.position.copy(b);l.updateMatrixWorld(true);}
}

// Every wheel is covered inside by a podium, seat or the raised cab floor/housing above the tyre.
let wheels=0;
root.traverse(n=>{if(!n.isMesh||!/_wheel_(left|right)_[01]$/.test(n.name))return;wheels++;
 const w=n.getWorldPosition(new T.Vector3()),side=Math.sign(w.x);
 for(const dz of [-.35,0,.35]){ray.set(new T.Vector3(side*1.08,2.4,w.z+dz),new T.Vector3(0,-1,0));ray.far=2;
  const hit=ray.intersectObjects(solids,false)[0];assert(hit&&hit.point.y>=.98,`${n.name} needs a raised cover, hit ${hit?.object.name} at ${hit?.point.y.toFixed(2)}`);}
});
assert.equal(wheels,12);
console.log('art interior: 12 doorways clear, 24 leaves, 12 wheels covered');
