// Lion statue (3D Gaussian splat) on the Station A1 island lawn, platform-end cap (between the pads and the loop road), facing the platforms.
// Splat = visual (baked daylight, dimmed with the scene's lights). Convex hulls of the same capture = invisible shadow caster + walk-around collision.
import * as T from 'three';
import {ConvexGeometry} from 'three/addons/geometries/ConvexGeometry.js';
import {LOOP,STOPS,sample} from './alignment.js';
import {loadSplat,createSplatMesh} from './splat-lite.js';
import hull from './a1-lion-hull.json';

// Edit here to move it: lat = metres across the island (0 = centre pad line), along = metres from the loop centre along the station axis (+ toward the platforms).
export const A1_LION={lat:0,along:+9.65,facing:+1};
const DAY_LIGHT=3.1*.5+.42; // sun + hemisphere level the capture's baked colours stand for (morning preset)

export function addA1Lion({scene,url=import.meta.env.BASE_URL+'assets/a1-lion.gsplat'}){
 const t=sample(STOPS[0].s),root=new T.Group();root.name='A1 lion statue';
 root.position.set(LOOP.center.x+t.tx*A1_LION.along+t.lx*A1_LION.lat,LOOP.y+.325,LOOP.center.z+t.tz*A1_LION.along+t.lz*A1_LION.lat);
 root.rotation.y=Math.atan2(t.tx*A1_LION.facing,t.tz*A1_LION.facing); // model front is +Z
 const proxy=new T.MeshBasicMaterial({colorWrite:false,depthWrite:false});
 const parts=[['A1 lion plinth',hull.plinth],['A1 lion body',hull.lion]].map(([name,pts])=>{const m=new T.Mesh(new ConvexGeometry(pts.map(p=>new T.Vector3(...p))),proxy);m.name=name;m.castShadow=true;root.add(m);return m;});
 scene.add(root);
 let sun,ambient,splat,requested=false;const here=new T.Vector3();
 scene.traverse(o=>{if(o.isDirectionalLight&&!sun)sun=o;if(o.isHemisphereLight&&!ambient)ambient=o;});
 // Distance-gate download, cull and dim the baked daylight to the scene's current light, once per frame via the always-drawn proxy.
 parts[0].onBeforeRender=(_renderer,_scene,camera)=>{
  if(!camera.isPerspectiveCamera||camera.userData?.isFeed)return;
  const dist=camera.position.distanceTo(root.getWorldPosition(here));
  if(!requested&&dist<140){
   requested=true;
   loadSplat(url).then(d=>{splat=createSplatMesh(d,{radius:1.4,center:new T.Vector3(0,.9,0),lod:[[14,1],[32,.45],[75,.2],[1e9,.1]]});splat.name='A1 lion splat';root.add(splat);},e=>console.warn('A1 lion splat failed to load',e));
  }
  if(!splat)return;
  splat.visible=dist<115;
  if(sun&&ambient)splat.userData.dim=T.MathUtils.clamp((sun.intensity*.5+ambient.intensity)/DAY_LIGHT,.06,1.15);
 };
 return root;
}
