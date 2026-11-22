// A1 uses the textured scan. A2 adds its registered Gaussians over the same opaque surface.
import * as T from 'three';
import {ConvexGeometry} from 'three/addons/geometries/ConvexGeometry.js';
import {CROSSINGS} from './alignment.js';
import {pose} from './street/roads.js';
import {loadSplat,createSplatMesh} from './splat-lite.js';
import hull from './green-bin-hull.json' with {type:'json'};

const crossings=CROSSINGS.filter(c=>c.station==='A1'||c.station==='A2');
function stationFor(item){
 if(item.type!=='litter_bin'||item.road!=='corridor')return;
 const {s}=pose(item);
 return crossings.find(c=>Math.abs(c.s-s)<8)?.station;
}
export const isGreenBin=item=>Boolean(stationFor(item));

export function addGreenBins({scene,items,loader,modelUrl}){
 const asset=import.meta.env.BASE_URL+'assets/green-bin';
 const collider=new ConvexGeometry(hull.hull.map(p=>new T.Vector3(...p)));
 const proxy=new T.MeshBasicMaterial({colorWrite:false,depthWrite:false});
 const paving=[],up=new T.Vector3(0,1,0),ray=new T.Raycaster(),here=new T.Vector3();
 let model,data,sun,ambient;
 scene.traverse(o=>{
  if(o.userData.corridorPaving){o.updateWorldMatrix(true,false);paving.push(o);}
  if(o.isDirectionalLight&&!sun)sun=o;
  if(o.isHemisphereLight&&!ambient)ambient=o;
 });
 return items.filter(isGreenBin).map(item=>{
  const P=pose(item),station=stationFor(item),root=new T.Group();
  root.name='Green litter bin '+item.id;
  root.position.set(P.x,P.y,P.z);
  // The dropped kerb is triangulated. Seat the flat contact ring on the actual paving face.
  ray.set(new T.Vector3(P.x,P.y+1,P.z),new T.Vector3(0,-1,0));
  const hit=ray.intersectObjects(paving,false)[0];
  if(hit){
   root.position.y=hit.point.y+(item.dy||0);
   root.quaternion.setFromUnitVectors(up,hit.face.normal.clone().transformDirection(hit.object.matrixWorld));
  }
  root.rotateY(P.yaw);
  const body=new T.Mesh(collider,proxy);
  body.name='Green litter bin body';
  root.add(body);
  scene.add(root);
  model??=loader.loadAsync(modelUrl||(asset+'.glb')).then(({scene:scan})=>{
   scan.traverse(o=>{if(o.isMesh){o.castShadow=true;o.receiveShadow=true;if(o.material.map)o.material.map.anisotropy=8;}});
   return scan;
  });
  model.then(scan=>root.add(scan.clone()),e=>console.warn('Green bin mesh failed to load',e));
  if(station==='A2'){
   let splat=null,requested=false;
   body.onBeforeRender=(_renderer,_scene,camera)=>{
    if(!camera.isPerspectiveCamera||camera.userData?.isFeed)return;
    const dist=camera.position.distanceTo(root.getWorldPosition(here));
    if(!requested&&dist<110){
     requested=true;
     (data??=loadSplat(asset+'.gsplat')).then(d=>{
      splat=createSplatMesh(d,{radius:.65,center:new T.Vector3(0,.5,0)});
      splat.name='Green litter bin splat';
      splat.material.uniforms.opacity.value=.42;
      root.add(splat);
     },e=>console.warn('Green bin splat failed to load',e));
    }
    if(!splat)return;
    splat.visible=dist<90;
    if(sun&&ambient)splat.userData.dim=T.MathUtils.clamp((sun.intensity*.5+ambient.intensity)/1.97,.06,1.15);
   };
  }
  return root;
 });
}
