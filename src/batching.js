import * as T from 'three';
import {mergeGeometries} from 'three/addons/utils/BufferGeometryUtils.js';

// Fuses the static meshes under `group` into one mesh per material (geometry baked into the group's own frame), so a
// detailed interior costs a handful of draw calls instead of dozens. `skip(mesh)` keeps a mesh separate;
// `stop` names nodes (and everything below them) that animate on their own and must stay as they are.
export function mergeByMaterial(group,{skip=()=>false,stop=/^$/}={}){
  group.updateWorldMatrix(true,true);
  const inverse=group.matrixWorld.clone().invert(),buckets=new Map(),merged=[];
  const frozen=n=>{for(let p=n.parent;p&&p!==group;p=p.parent)if(stop.test(p.name))return true;return false;};
  group.traverse(n=>{
    if(!n.isMesh||n.isSkinnedMesh||n.isInstancedMesh||Array.isArray(n.material)||skip(n)||frozen(n))return;
    const g=n.geometry.clone().applyMatrix4(inverse.clone().multiply(n.matrixWorld));
    for(const k of Object.keys(g.attributes))if(!['position','normal','uv'].includes(k))g.deleteAttribute(k);
    const key=[n.material.uuid,!!g.attributes.normal,!!g.attributes.uv,n.castShadow,n.receiveShadow,n.renderOrder].join('|');
    if(!buckets.has(key))buckets.set(key,{material:n.material,cast:n.castShadow,receive:n.receiveShadow,order:n.renderOrder,geos:[]});
    buckets.get(key).geos.push(g.index?g.toNonIndexed():g);merged.push(n);
  });
  for(const n of merged)n.parent.remove(n);
  let i=0;
  for(const {material,cast,receive,order,geos} of buckets.values()){
    const mesh=new T.Mesh(mergeGeometries(geos),material);mesh.name='merged-'+(i++);mesh.castShadow=cast;mesh.receiveShadow=receive;mesh.renderOrder=order;
    geos.forEach(g=>g.dispose());group.add(mesh);
  }
  return group;
}
