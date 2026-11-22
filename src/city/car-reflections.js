import * as T from 'three';
import {setSplatsVisibleForFeed} from '../splat-lite.js';

// Sample nearby streets for glossy paint and glass. Spread the six views over successive
// frames and reuse the previous complete reflection until all six faces are available.
export function carReflections(renderer,scene){
 const cube=new T.WebGLCubeRenderTarget(64,{type:T.HalfFloatType}),camera=new T.CubeCamera(.3,85,cube);
 camera.coordinateSystem=renderer.coordinateSystem;camera.updateCoordinateSystem();
 const pmrem=new T.PMREMGenerator(renderer);
 let filtered=null,face=0,next=0,lastCar=null;
 return (group,moving,now)=>{
  if(group!==lastCar){face=0;next=0;lastCar=group;}
  if(now<next)return;
  if(face===0){camera.position.copy(group.position);camera.position.y+=1.1;camera.updateMatrixWorld();}
  const previous=renderer.getRenderTarget(),auto=renderer.shadowMap.autoUpdate,need=renderer.shadowMap.needsUpdate;
  group.visible=false;renderer.shadowMap.autoUpdate=renderer.shadowMap.needsUpdate=false;
  setSplatsVisibleForFeed(true);
  try{
   renderer.setRenderTarget(cube,face);renderer.render(scene,camera.children[face]);
  }finally{
   renderer.setRenderTarget(previous);setSplatsVisibleForFeed(false);group.visible=true;
   renderer.shadowMap.autoUpdate=auto;renderer.shadowMap.needsUpdate=need;
  }
  if(++face===6){
   filtered=pmrem.fromCubemap(cube.texture,filtered??undefined);
   for(const material of group.reflectiveMaterials){if(material.envMap!==filtered.texture){material.envMap=filtered.texture;material.needsUpdate=true;}}
   face=0;next=now+(moving?1000:3000);
  }
 };
}
