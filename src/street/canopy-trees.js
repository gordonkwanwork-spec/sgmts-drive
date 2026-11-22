// Shared subtropical leaf-card tree library (Image-1 A2 style in 6 botanical variations).
// Zero downloads, cached geometries & materials, upward-normal shading, and safe night tinting.
import * as T from 'three';
import {mergeGeometries} from 'three/addons/utils/BufferGeometryUtils.js';
import {treeTemplates} from './trees.js';

export const CANOPY_SPECIES=[
 {id:'banyan-emerald',weight:.24,trunk:'broadleaf',seed:401,rgb:[58,108,56],accentRgb:[96,146,70],accentShare:.22,rx:118,ry:92,leafAspect:1.35,spreadRatio:.88,cardHeightRatio:.62,crownY:.65,radialOffset:.17,tilt:.20,lotHeightScale:7.4,gardenHeight:[8.6,11.4]},
 {id:'camphor-olive',weight:.22,trunk:'broadleaf',seed:571,rgb:[117,132,58],accentRgb:[88,108,48],accentShare:.22,rx:113,ry:97,leafAspect:1.40,spreadRatio:.78,cardHeightRatio:.68,crownY:.68,radialOffset:.15,tilt:.15,lotHeightScale:7.5,gardenHeight:[8.2,11.2]},
 {id:'fig-jade',weight:.20,trunk:'broadleaf',seed:913,rgb:[71,117,66],accentRgb:[48,86,50],accentShare:.24,rx:108,ry:100,leafAspect:1.38,spreadRatio:.75,cardHeightRatio:.70,crownY:.66,radialOffset:.14,tilt:.16,lotHeightScale:7.3,gardenHeight:[8.0,10.8]},
 {id:'paperbark-tall',weight:.14,trunk:'upright',seed:733,rgb:[50,94,62],accentRgb:[76,126,82],accentShare:.25,rx:84,ry:114,leafAspect:1.85,spreadRatio:.56,cardHeightRatio:.74,crownY:.64,radialOffset:.11,tilt:.12,lotHeightScale:8.6,gardenHeight:[9.0,12.2]},
 {id:'cassia-lime',weight:.11,trunk:'golden',seed:619,rgb:[134,152,54],accentRgb:[172,168,58],accentShare:.28,rx:116,ry:88,leafAspect:1.55,spreadRatio:.85,cardHeightRatio:.60,crownY:.70,radialOffset:.18,tilt:.18,lotHeightScale:7.2,gardenHeight:[7.6,10.2]},
 {id:'bauhinia-blossom',weight:.09,trunk:'flowering',seed:827,rgb:[74,114,60],accentRgb:[214,128,158],accentRgb2:[232,166,188],accentShare:.36,rx:106,ry:94,leafAspect:1.30,spreadRatio:.76,cardHeightRatio:.65,crownY:.68,radialOffset:.15,tilt:.16,lotHeightScale:7.0,gardenHeight:[7.4,9.8]},
];

const materials=new Map();
let cachedAssets=null;

export function treeHash(x,z,salt=0){
 const v=Math.sin(x*12.9898+z*78.233+salt*37.719)*43758.5453;
 return v-Math.floor(v);
}

export function pickCanopySpecies(u,list=CANOPY_SPECIES){
 const t=Math.max(0,Math.min(.999999,u));
 let acc=0;
 for(const sp of list){
  acc+=sp.weight;
  if(t<acc)return sp;
 }
 return list[list.length-1];
}

function resolveSpecies(variant){
 if(variant===false)return CANOPY_SPECIES[2];
 if(variant===true)return CANOPY_SPECIES[1];
 if(typeof variant==='string')return CANOPY_SPECIES.find(s=>s.id===variant)||CANOPY_SPECIES[2];
 if(variant&&typeof variant==='object')return CANOPY_SPECIES.find(s=>s.id===variant.id)||variant;
 return CANOPY_SPECIES[2];
}

// Layered leaf sprays painted on a 256x256 canvas with upward-biased normals for soft volume.
export function canopyMaterial(variant=false){
 const sp=resolveSpecies(variant);
 if(materials.has(sp.id))return materials.get(sp.id);

 const c=document.createElement('canvas');c.width=c.height=256;
 const ctx=c.getContext('2d');
 let seed=sp.seed|0;
 const random=()=>((seed=(1664525*seed+1013904223)>>>0)/4294967296);

 for(let cloud=0;cloud<80;cloud++){
  const theta=random()*Math.PI*2,r=Math.sqrt(random())*.81;
  const x=128+Math.cos(theta)*r*sp.rx,y=130+Math.sin(theta)*r*sp.ry;
  const size=10+random()*19;
  const useAccent=(1-y/256)*.4+r*.6>.45&&random()<sp.accentShare;
  const baseRgb=useAccent?(sp.accentRgb2&&random()<.4?sp.accentRgb2:sp.accentRgb):sp.rgb;

  for(let i=0;i<90;i++){
   const a=random()*Math.PI*2,radius=Math.sqrt(random())*size,dy=Math.sin(a)*radius;
   const shade=.61+.28*(1-dy/size)+.18*random()+.1*(1-y/256);
   const rw=1.8+2.4*random(),rh=(rw/sp.leafAspect)*(.85+.3*random());
   ctx.fillStyle='rgb('+baseRgb.map(v=>Math.min(255,Math.round(v*shade))).join(',')+')';
   ctx.beginPath();
   ctx.ellipse(x+Math.cos(a)*radius,y+dy,rw,rh,a,0,Math.PI*2);
   ctx.fill();
  }
 }

 const map=new T.CanvasTexture(c);
 map.colorSpace=T.SRGBColorSpace;
 map.anisotropy=4;
 const material=new T.MeshStandardMaterial({map,alphaTest:.38,side:T.DoubleSide,roughness:1,emissiveMap:map});
 material.customProgramCacheKey=()=>'canopy-spray-v1';
 // Cards describe a single rounded crown volume: shade both faces from above.
 material.onBeforeCompile=shader=>{
  shader.fragmentShader=shader.fragmentShader.replace(
   '#include <normal_fragment_begin>',
   '#include <normal_fragment_begin>\nnormal = normalize(mat3(viewMatrix) * vec3(0.08,1.0,0.13));'
  );
 };
 materials.set(sp.id,material);
 return material;
}

// Six crossed leaf cards merged into one 12-triangle crown anchored on y in [0, 1].
export function buildCrownGeometry(sp){
 const cards=[];
 for(let i=0;i<6;i++){
  const angle=i*Math.PI/3;
  const g=new T.PlaneGeometry(sp.spreadRatio,sp.cardHeightRatio);
  // Alternate outward card pitch so high drone cameras see continuous volume instead of flat rims.
  g.rotateX((i%2?1:-1)*sp.tilt);
  g.rotateY(angle);
  g.translate(
   Math.sin(angle)*sp.spreadRatio*sp.radialOffset,
   sp.crownY+.045*Math.sin(i*2.1),
   Math.cos(angle)*sp.spreadRatio*sp.radialOffset
  );
  cards.push(g);
 }
 const crown=mergeGeometries(cards);
 cards.forEach(g=>g.dispose());
 crown.computeBoundingSphere();
 return crown;
}

export function canopyTreeAssets(){
 if(cachedAssets)return cachedAssets;
 const templates=treeTemplates();
 const needed=new Set(CANOPY_SPECIES.map(s=>s.trunk));
 const barkByKind={};
 for(const tmpl of templates){
  if(needed.has(tmpl.name)&&!barkByKind[tmpl.name]){
   // Shift from y in [-0.5, 0.5] to y in [0, 1] so root collars seat flush with y = 0 ground.
   const g=tmpl.barkGeo.clone().translate(0,.5,0);
   g.computeBoundingSphere();
   barkByKind[tmpl.name]=g;
  }
  tmpl.barkGeo?.dispose();
  tmpl.crown?.dispose();
  tmpl.cards?.dispose();
 }
 const lotBarkMaterial=new T.MeshStandardMaterial({vertexColors:true,roughness:.96});
 const species=CANOPY_SPECIES.map(sp=>({
  ...sp,
  material:canopyMaterial(sp),
  crownGeo:buildCrownGeometry(sp),
 }));
 cachedAssets={barkByKind,lotBarkMaterial,species};
 return cachedAssets;
}

export function setCanopyTreesNight(on){
 for(const mat of materials.values()){
  mat.emissive.setHex(on?0xe1d2b1:0);
  mat.emissiveIntensity=on?.16:0;
 }
 if(cachedAssets){
  cachedAssets.lotBarkMaterial.emissive.setHex(on?0x5c6876:0);
  cachedAssets.lotBarkMaterial.emissiveIntensity=on?.10:0;
 }
}
