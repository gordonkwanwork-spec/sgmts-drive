// Reusable CC0 3D Gaussian splat vegetation (full-size trees & bushes from Poly Haven via scripts/build-splat-vegetation.py).
// Shared module cache reuses downloaded data and GPU float textures across every placement in the city.
import * as T from 'three';
import {ConvexGeometry} from 'three/addons/geometries/ConvexGeometry.js';
import {LOOP,STOPS,sample} from './alignment.js';
import {loadSplat,createSplatMesh} from './splat-lite.js';
import hulls from './splat-vegetation-hulls.json' with {type:'json'};

const DAY_LIGHT=3.1*.5+.42; // morning preset sun*0.5 + hemisphere intensity
const splatCache=new Map();

export const SPLAT_VEGETATION_CATALOG={
 'tree-banyan':{label:'Subtropical banyan tree',asset:'veg-tree-banyan.gsplat',category:'tree',source:'Poly Haven island_tree_01 (CC0-1.0)'},
 'tree-street':{label:'Ornamental street tree',asset:'veg-tree-street.gsplat',category:'tree',source:'Poly Haven tree_small_02 (CC0-1.0)'},
 'bush-tall':{label:'Tall park shrub',asset:'veg-bush-tall.gsplat',category:'bush',source:'Poly Haven searsia_lucida (CC0-1.0)'},
 'bush-wide':{label:'Spreading evergreen bush',asset:'veg-bush-wide.gsplat',category:'bush',source:'Poly Haven searsia_burchellii (CC0-1.0)'},
};

export const A1_ROUNDABOUT_VEGETATION=[
 {id:'a1-veg-banyan-1',kind:'tree-banyan',along:+5.0,lat:+27.2,yaw:.4,scale:1.0},
 {id:'a1-veg-bush-tall-1',kind:'bush-tall',along:+8.5,lat:+25.0,yaw:1.1,scale:1.0},
 {id:'a1-veg-bush-wide-1',kind:'bush-wide',along:-.8,lat:+26.4,yaw:2.3,scale:1.05},
 {id:'a1-veg-tree-street-1',kind:'tree-street',along:-6.5,lat:+26.8,yaw:-.7,scale:1.05},
 {id:'a1-veg-bush-tall-2',kind:'bush-tall',along:-10.8,lat:+25.2,yaw:3.8,scale:.85},
 {id:'a1-veg-banyan-2',kind:'tree-banyan',along:+5.5,lat:-27.2,yaw:2.6,scale:.90},
 {id:'a1-veg-bush-wide-2',kind:'bush-wide',along:+1.2,lat:-26.2,yaw:.5,scale:.95},
];

function convexFrom(pts){
 return new ConvexGeometry(pts.map(p=>new T.Vector3(...p)));
}

export function placeSplatVegetation({scene,placements,groundAt}){
 let sun,ambient;
 scene.traverse(o=>{if(o.isDirectionalLight&&!sun)sun=o;if(o.isHemisphereLight&&!ambient)ambient=o;});
 const proxy=new T.MeshBasicMaterial({colorWrite:false,depthWrite:false}),here=new T.Vector3();
 return placements.map(p=>{
  const meta=hulls[p.kind];
  if(!meta)throw Error('Unknown splat vegetation kind: '+p.kind);
  const y=p.y??(groundAt?groundAt(p.x,p.z):0);
  const root=new T.Group();
  root.name='Splat veg '+p.id;
  root.position.set(p.x,y,p.z);
  root.rotation.y=p.yaw||0;
  root.scale.setScalar(p.scale??1);

  const proxies=[];
  if(meta.category==='tree'){
   const trunk=new T.Mesh(convexFrom(meta.trunkHull),proxy);
   trunk.name='Splat veg '+p.id+' trunk';
   trunk.castShadow=true;
   root.add(trunk);
   proxies.push(trunk);

   // Named with 'foliage' so collision.js treats the canopy as walk-through while keeping canopy shadows.
   const canopy=new T.Mesh(convexFrom(meta.canopyHull),proxy);
   canopy.name='Splat veg '+p.id+' foliage shadow';
   canopy.castShadow=true;
   root.add(canopy);
   proxies.push(canopy);
  }else{
   const body=new T.Mesh(convexFrom(meta.bodyHull),proxy);
   body.name='Splat veg '+p.id+' body';
   body.castShadow=true;
   root.add(body);
   proxies.push(body);
  }
  scene.add(root);

  const lod=meta.category==='tree'?[[24,1],[55,.45],[105,.2],[1e9,.1]]:[[16,1],[38,.45],[80,.2],[1e9,.1]];
  const loadDist=meta.category==='tree'?170:140,viewDist=meta.category==='tree'?140:105;
  let splat=null,requested=false;
  const tick=(_renderer,_scene,camera)=>{
   if(!camera.isPerspectiveCamera||camera.userData?.isFeed)return;
   const dist=camera.position.distanceTo(root.getWorldPosition(here));
   if(!requested&&dist<loadDist){
    requested=true;
    let load=splatCache.get(p.kind);
    if(!load){
     load=loadSplat(import.meta.env.BASE_URL+'assets/'+meta.asset);
     splatCache.set(p.kind,load);
    }
    load.then(d=>{
     splat=createSplatMesh(d,{radius:meta.radius,center:new T.Vector3(0,meta.centerY,0),lod});
     splat.name='Splat veg '+p.id+' splat';
     root.add(splat);
    },e=>console.warn('Splat vegetation failed to load',p.id,e));
   }
   if(splat){
    splat.visible=dist<viewDist;
    if(sun&&ambient)splat.userData.dim=T.MathUtils.clamp((sun.intensity*.5+ambient.intensity)/DAY_LIGHT,.06,1.15);
   }
  };
  proxies[0].onBeforeRender=tick;
  return root;
 });
}

export function addA1RoundaboutVegetation({scene,groundAt}){
 const t=sample(STOPS[0].s);
 const placements=A1_ROUNDABOUT_VEGETATION.map(p=>{
  const x=LOOP.center.x+t.tx*p.along+t.lx*p.lat;
  const z=LOOP.center.z+t.tz*p.along+t.lz*p.lat;
  return {...p,x,z,y:groundAt?groundAt(x,z):LOOP.y};
 });
 return placeSplatVegetation({scene,placements,groundAt});
}
