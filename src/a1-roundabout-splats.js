// Test 3D Gaussian splat vegetation and street/courtyard props placed beside the Station A1 roundabout (LOOP).
// Splat = visual (baked daylight, dimmed with scene lights). Convex hull proxy = shadow caster + walk-around collision.
import * as T from 'three';
import {ConvexGeometry} from 'three/addons/geometries/ConvexGeometry.js';
import {LOOP,STOPS,sample} from './alignment.js';
import {loadSplat,createSplatMesh} from './splat-lite.js';
import hulls from './a1-roundabout-splats-hulls.json' with {type:'json'};

const DAY_LIGHT=3.1*.5+.42; // morning preset sun*0.5 + hemisphere intensity

export const A1_ROUNDABOUT_SPLATS=[
 // Outer loop footpath (r in [20.0, 23.75], surface y = LOOP.y + 0.30)
 {id:'outer-bonsai',kind:'bonsai',label:'Chinese bonsai in stoneware tray',asset:'a1-splat-bonsai.gsplat',along:+6.5,lat:+21.6,yOffset:.30,yawOffset:0,inward:true},
 {id:'outer-garden-stool',kind:'garden-stool',label:'Glazed ceramic drum stool',asset:'a1-splat-garden-stool.gsplat',along:+4.0,lat:+22.2,yOffset:.30,yawOffset:0,inward:true},
 {id:'outer-plant',kind:'plant',label:'Potted broadleaf specimen',asset:'a1-splat-plant.gsplat',along:+1.5,lat:+22.5,yOffset:.30,yawOffset:0,inward:true},
 {id:'outer-lantern',kind:'lantern',label:'Glazed metal garden lantern',asset:'a1-splat-lantern.gsplat',along:-1.0,lat:+22.55,yOffset:.30,yawOffset:0,inward:true},
 // A1 roundabout island grass cap (r < 13.3, surface y = LOOP.y + 0.325), flanking the A1 lion statue
 {id:'island-bonsai',kind:'bonsai',label:'Chinese bonsai in stoneware tray',asset:'a1-splat-bonsai.gsplat',along:+9.1,lat:-3.4,yOffset:.325,yawOffset:.25,inward:false},
 {id:'island-plant',kind:'plant',label:'Potted broadleaf specimen',asset:'a1-splat-plant.gsplat',along:+9.1,lat:+3.4,yOffset:.325,yawOffset:-.25,inward:false},
];

export function addA1RoundaboutSplats({scene}){
 const t=sample(STOPS[0].s);
 let sun,ambient;
 scene.traverse(o=>{if(o.isDirectionalLight&&!sun)sun=o;if(o.isHemisphereLight&&!ambient)ambient=o;});
 const cache=new Map(),proxy=new T.MeshBasicMaterial({colorWrite:false,depthWrite:false}),here=new T.Vector3();
 return A1_ROUNDABOUT_SPLATS.map(item=>{
  const meta=hulls[item.kind];
  if(!meta)throw Error('Missing hull metadata for '+item.kind);
  const root=new T.Group();
  root.name='A1 roundabout 3DGS '+item.id;
  root.position.set(LOOP.center.x+t.tx*item.along+t.lx*item.lat,LOOP.y+item.yOffset,LOOP.center.z+t.tz*item.along+t.lz*item.lat);
  root.rotation.y=(item.inward?Math.atan2(LOOP.center.x-root.position.x,LOOP.center.z-root.position.z):Math.atan2(t.tx,t.tz))+(item.yawOffset||0);
  const body=new T.Mesh(new ConvexGeometry(meta.hull.map(p=>new T.Vector3(...p))),proxy);
  body.name='A1 roundabout 3DGS '+item.id+' body';
  body.castShadow=true;
  root.add(body);
  scene.add(root);
  let splat=null,requested=false;
  const lod=[[14,1],[30,.45],[60,.2],[1e9,.1]];
  body.onBeforeRender=(_renderer,_scene,camera)=>{
   if(!camera.isPerspectiveCamera||camera.userData?.isFeed)return;
   const dist=camera.position.distanceTo(root.getWorldPosition(here));
   if(!requested&&dist<110){
    requested=true;
    let p=cache.get(item.kind);
    if(!p){
     p=loadSplat(import.meta.env.BASE_URL+'assets/'+item.asset);
     cache.set(item.kind,p);
    }
    p.then(d=>{
     splat=createSplatMesh(d,{radius:meta.radius,center:new T.Vector3(0,meta.centerY,0),lod});
     splat.name='A1 roundabout 3DGS '+item.id+' splat';
     root.add(splat);
    },e=>console.warn('A1 roundabout splat failed to load',item.id,e));
   }
   if(splat){
    splat.visible=dist<85;
    if(sun&&ambient)splat.userData.dim=T.MathUtils.clamp((sun.intensity*.5+ambient.intensity)/DAY_LIGHT,.06,1.15);
   }
  };
  return root;
 });
}
