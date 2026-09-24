import * as T from 'three';
import {computeBoundsTree,acceleratedRaycast} from 'three-mesh-bvh';

// Real-geometry collision for the walking driver and third-person cameras: BVH raycasts against solid meshes.
T.BufferGeometry.prototype.computeBoundsTree=computeBoundsTree;T.Mesh.prototype.raycast=acceleratedRaycast;
const SOFT=/vegetation|foliage|leaf|grass|meadow|fern|shrub|flower|illumination|spill|LED|guidance|marking|zebra/i;
const ray=new T.Raycaster(),sphere=new T.Sphere(),matrix=new T.Matrix4();ray.firstHitOnly=true;
let moving=new Map();const grid=new Map(),CELL=40,key=(i,j)=>i*100003+j;

const shown=o=>{for(;o;o=o.parent)if(!o.visible)return false;return true;};
function worldSphere(m){
 const s=m.isInstancedMesh?(m.boundingSphere||(m.computeBoundingSphere(),m.boundingSphere)):(m.geometry.boundingSphere||(m.geometry.computeBoundingSphere(),m.geometry.boundingSphere));
 return sphere.copy(s).applyMatrix4(m.matrixWorld);
}

// Everything under `skip` (people, bikes, birds, sky) is walk-through; so is planting and ground paint.
export function collectSolids(scene,skip){
 const soft=new Set();for(const root of skip)root?.traverse(n=>soft.add(n));
 moving.clear();grid.clear();const geometries=new Set();
 for(const top of scene.children)top.traverse(m=>{if(!m.isMesh||soft.has(m)||SOFT.test(m.name)||SOFT.test(m.parent?.name||''))return;
  m.userData.owner=top;geometries.add(m.geometry);
  // Static meshes go in a 40 m grid by world sphere; moving vehicles are tested every query.
  m.updateWorldMatrix(true,false);
  if(m.matrixAutoUpdate){if(!moving.has(top))moving.set(top,{meshes:[],local:null,inverse:top.matrixWorld.clone().invert()});const v=moving.get(top),local=worldSphere(m).clone().applyMatrix4(v.inverse);v.meshes.push(m);v.local=v.local?v.local.union(local):local;return;}
  const s=m.userData.sphere=worldSphere(m).clone();
  for(let i=Math.floor((s.center.x-s.radius)/CELL);i<=Math.floor((s.center.x+s.radius)/CELL);i++)for(let j=Math.floor((s.center.z-s.radius)/CELL);j<=Math.floor((s.center.z+s.radius)/CELL);j++){const k=key(i,j);if(!grid.has(k))grid.set(k,[]);grid.get(k).push(m);}});
 // Build acceleration trees in idle time; a query builds any tree it still needs.
 const queue=[...geometries];
 const work=deadline=>{while(queue.length&&(deadline?.timeRemaining?.()??1)>2){const g=queue.pop();if(!g.boundsTree)g.computeBoundsTree();}if(queue.length)idle(work);};
 const idle=f=>(window.requestIdleCallback||(cb=>setTimeout(cb,16)))(f);idle(work);
 return geometries.size;
}

// Solid meshes whose bounds reach within `radius` of `centre`; `ignore` holds top-level groups to pass through.
export function nearby(centre,radius,ignore=[]){
 const found=new Set();
 for(let i=Math.floor((centre.x-radius)/CELL);i<=Math.floor((centre.x+radius)/CELL);i++)for(let j=Math.floor((centre.z-radius)/CELL);j<=Math.floor((centre.z+radius)/CELL);j++)for(const m of grid.get(key(i,j))||[])if(m.userData.sphere.distanceToPoint(centre)<radius)found.add(m);
 // Moving groups (vehicles, trains) are culled by one sphere each before testing their meshes.
 for(const [top,v] of moving)if(sphere.copy(v.local).applyMatrix4(top.matrixWorld).distanceToPoint(centre)<radius)for(const m of v.meshes)if(worldSphere(m).distanceToPoint(centre)<radius)found.add(m);
 const list=[...found].filter(m=>!ignore.includes(m.userData.owner)&&shown(m));
 for(const m of list)if(!m.geometry.boundsTree)m.geometry.computeBoundsTree();
 return list;
}

// Nearest solid hit along a ray: {distance, normal (world)} or null.
export function castSolid(origin,dir,far,ignore=[],candidates=nearby(origin,far,ignore)){
 ray.set(origin,dir);ray.far=far;
 const hit=ray.intersectObjects(candidates,false).sort((a,b)=>a.distance-b.distance)[0];
 if(!hit)return null;
 const normal=hit.face?hit.face.normal.clone():dir.clone().negate();
 if(hit.instanceId!==undefined){hit.object.getMatrixAt(hit.instanceId,matrix);normal.transformDirection(matrix);}
 return {distance:hit.distance,normal:normal.transformDirection(hit.object.matrixWorld),object:hit.object};
}

// Walking move against walls: cast at shin, waist and head height; slide along the wall instead of stopping dead.
const HEIGHTS=[.45,1.1,1.65],RADIUS=.35;
export function wallSlide(p,dx,dz){
 for(let attempt=0;attempt<2;attempt++){
  const len=Math.hypot(dx,dz);if(len<1e-6)return {x:0,z:0,hit:attempt>0};
  const dir=new T.Vector3(dx/len,0,dz/len),near=nearby(new T.Vector3(p.x,p.y+1,p.z),len+RADIUS+1);let hit=null;
  for(const h of HEIGHTS){const r=castSolid(new T.Vector3(p.x,p.y+h,p.z),dir,len+RADIUS,[],near);if(r&&(!hit||r.distance<hit.distance))hit=r;}
  if(!hit)return {x:dx,z:dz,hit:attempt>0};
  const n=hit.normal.setY(0);if(n.lengthSq()<1e-4)return {x:0,z:0,hit:true};n.normalize();if(n.dot(dir)>0)n.negate();
  const into=dx*n.x+dz*n.z;dx-=n.x*into;dz-=n.z*into;
 }
 return {x:0,z:0,hit:true};
}

// Third-person camera: never behind a wall. Pulls in immediately, eases back out.
let reach=Infinity;
export function clearView(focus,camera,ignore,dt){
 const offset=camera.clone().sub(focus),len=offset.length();if(len<.01)return camera;
 const dir=offset.divideScalar(len),hit=castSolid(focus,dir,len+.35,ignore),allowed=hit?Math.max(.5,hit.distance-.35):len;
 reach=allowed<reach?allowed:reach+(allowed-reach)*Math.min(1,dt*3);
 return focus.clone().addScaledVector(dir,Math.min(len,reach));
}
export const resetView=()=>{reach=Infinity;};
