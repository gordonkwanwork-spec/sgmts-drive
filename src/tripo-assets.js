import {rigVehicle} from './vehicle-motion.js';
import {staticMotorRider} from './street-models.js';
import * as T from 'three';
import {COLLEAGUES} from './colleagues.js';

export const TRIPO_PEOPLE=[
 ...COLLEAGUES.map(c=>({...c,path:'colleagues/'+c.file,height:1.75})),
 {file:'p01-older-man-rigged.glb',name:'Older man',height:1.70,age:'older'},
 {file:'p02-older-woman-rigged.glb',name:'Older woman',height:1.58,age:'older'},
 {file:'p03-young-woman-rigged.glb',name:'Young woman',height:1.65},
 {file:'p04-worker-rigged.glb',name:'Construction worker',height:1.78},
 {file:'p05-young-man-rigged.glb',baked:'locomotion',name:'Young man',height:1.76},
 {file:'p06-sporty-woman-rigged.glb',baked:'locomotion',name:'Sporty woman',height:1.64},
 {file:'p07-middle-aged-man-rigged.glb',baked:'locomotion',name:'Middle-aged man',height:1.72},
].map(c=>({...c,path:c.path||'pedestrians/'+c.file}));

export const TRIPO_DOGS=[
 {id:'dog-shiba',kind:'dog',file:'d01-shiba-inu.glb',name:'Shiba Inu',width:.26,height:.48,length:.68},
 {id:'dog-corgi',kind:'dog',file:'d02-corgi.glb',name:'Welsh Corgi',width:.25,height:.36,length:.64},
 {id:'dog-retriever',kind:'dog',file:'d03-golden-retriever.glb',name:'Golden Retriever',width:.32,height:.60,length:.88},
];
export const TRIPO_CATS=[
 {id:'cat-ginger',kind:'cat',file:'c01-ginger-tabby.glb',name:'Ginger tabby cat',width:.18,height:.30,length:.48},
 {id:'cat-tuxedo',kind:'cat',file:'c02-tuxedo-cat.glb',name:'Tuxedo cat',width:.17,height:.29,length:.47},
 {id:'cat-calico',kind:'cat',file:'c03-calico-cat.glb',name:'Calico cat',width:.17,height:.28,length:.46},
];
export const TRIPO_RATS=[
 {id:'rat-fat',kind:'rat',file:'r01-big-fat-rat.glb',name:'Big fat rat',width:.25,height:.30,length:.45},
];
export const TRIPO_PETS=[...TRIPO_DOGS,...TRIPO_CATS,...TRIPO_RATS];

// Dimensions include mirrors. Local -Z is the direction of travel throughout the game.
export const TRIPO_VEHICLES=[
 {id:'taxi',file:'v01-classic-taxi-6k.glb',width:1.9,length:4.7,height:1.55},
 {id:'modern-taxi',file:'v02-modern-taxi-6k.glb',width:1.95,length:4.4,height:1.78},
 {id:'bus',file:'v03-double-decker-10k.glb',low:'v03-double-decker-lod-2500.glb',width:2.8,length:12,height:4.4},
 {id:'single-bus',file:'v04-single-decker-8k.glb',width:2.8,length:11,height:3.15},
 {id:'minibus',file:'v05-minibus-8k.glb',width:2.2,length:7,height:2.8},
 {id:'car',file:'v06-sedan-6k.glb',width:1.95,length:4.6,height:1.5},
 {id:'hatchback',file:'v07-hatchback-6k.glb',width:1.9,length:4.05,height:1.55},
 {id:'suv',file:'v08-suv-6k.glb',width:2.1,length:4.75,height:1.65},
 {id:'van',file:'v09-delivery-van-6k.glb',width:2.05,length:5.3,height:2.25},
 {id:'motor-scooter',file:'v10-scooter-5k.glb',width:.8,length:2,height:1.25},
 {id:'motorbike',file:'v11-motorbike-6k.glb',width:.85,length:2.15,height:1.35},
];

export function vehicleModel(gltf,spec){
 const model=gltf.scene.clone(true),root=new T.Group();
 // Tripo exports face +Z. Rotate the entire source, including its node transforms.
 model.rotation.y+=Math.PI;model.updateMatrixWorld(true);
 const bounds=new T.Box3().setFromObject(model),size=bounds.getSize(new T.Vector3()),centre=bounds.getCenter(new T.Vector3());
 const fit=new T.Group();fit.add(model);fit.scale.set(spec.width/size.x,spec.height/size.y,spec.length/size.z);
 model.position.sub(new T.Vector3(centre.x,bounds.min.y,centre.z));root.add(fit);
 root.name=spec.id;root.userData.tripoVehicle=spec.file;
 root.traverse(n=>{if(n.isMesh){n.castShadow=true;n.receiveShadow=true;}});
 return root;
}

export async function loadTripoVehicles(loader,url,riderSource=null){
 const files=[...new Set(TRIPO_VEHICLES.flatMap(v=>[v.file,...(v.low?[v.low]:[])]))];
 const sources=Object.fromEntries(await Promise.all(files.map(async f=>[f,await loader.loadAsync(url(f))])));
 const templates=new Map();
 for(const spec of TRIPO_VEHICLES){
  const main=rigVehicle(vehicleModel(sources[spec.file],spec),spec);let root=main;
  if(spec.low){root=new T.LOD();root.addLevel(main,0);root.addLevel(rigVehicle(vehicleModel(sources[spec.low],spec),spec),85);root.name=spec.id;root.userData.tripoVehicle=spec.file;}
  if(riderSource&&['motorbike','motor-scooter'].includes(spec.id))root.add(staticMotorRider(riderSource,spec.id==='motor-scooter'));
  // Small shared emissive lamps keep the existing night-lighting path working.
  for(const [end,color,name] of [[-1,0xfff4dc,'light'],[1,0xc52018,'red']]){
   const material=new T.MeshStandardMaterial({color,emissive:color,emissiveIntensity:.35});material.name=name;
   for(const side of [-1,1]){const lamp=new T.Mesh(new T.BoxGeometry(spec.width*.12,.10,.035),material);lamp.position.set(side*spec.width*.32,spec.height*.3,end*spec.length/2);root.add(lamp);}
  }
  templates.set(spec.id,root);
 }
 return templates;
}
