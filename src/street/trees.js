import * as T from 'three';
import {mergeGeometries} from 'three/addons/utils/BufferGeometryUtils.js';

// Street tree species: branching tapered bark, faceted 3D leaf clumps (vertex-coloured, darker underneath) and a few leaf cards
// for a ragged edge. Leafless species have no crown and branch deeper. Sizes in metres for a reference tree; each template is
// normalised to 1 unit tall standing on y=-.5 (like the unit cylinder it replaces), so instances scale by height and the wind
// shader, which bends on local y, sways only the upper half.
// leaf: leaf-card texture kind (environment.js paintTexture), null = leafless. heights: world height range in metres.
export const TREE_SPECIES=[
 {name:'broadleaf',leaf:'broadleaf',heights:[6,11],trunk:3.2,radius:.3,len:2.6,forks:3,depth:2,angle:.75,ratio:.66,lift:.25,clump:1.9,squash:.8,bark:0x5f5241,palette:[0x4f7336,0x5f843d,0x6a8f45,0x46692f]},
 {name:'upright',leaf:'upright',heights:[8,15],trunk:2,radius:.2,len:2.2,forks:2,leader:true,depth:3,angle:.42,ratio:.74,lift:.35,clump:1.05,squash:1.25,bark:0x4e463a,palette:[0x335a32,0x3f6a3a,0x2c4d2c]},
 {name:'golden',leaf:'golden',heights:[5,9],trunk:2.4,radius:.25,len:2.8,forks:4,depth:2,angle:1.1,ratio:.78,lift:0,clump:1.55,squash:.55,bark:0x6b5b47,palette:[0xb89a3a,0xc9aa45,0x8f8a3a,0xa7923e]},
 {name:'flowering',leaf:'flowering',heights:[4,8],trunk:1.8,radius:.19,len:1.9,forks:3,depth:2,angle:.85,ratio:.7,lift:.2,clump:1.3,squash:.85,bark:0x5a4a3e,palette:[0xd98fb1,0xe6a6c1,0xc9789f,0x5f843d]},
 {name:'bare',leaf:null,heights:[7,13],trunk:3,radius:.34,len:2.4,forks:3,depth:4,angle:.62,ratio:.68,lift:.2,bark:0x6d665c},
 {name:'bare-slender',leaf:null,heights:[3.5,7],trunk:2.2,radius:.12,len:1.6,forks:2,leader:true,depth:4,angle:.55,ratio:.74,lift:.3,bark:0x8a8174},
];

const UP=new T.Vector3(0,1,0),X=new T.Vector3(1,0,0),C=new T.Color();
function tint(g,hex,shade=()=>1){const p=g.attributes.position,c=[];C.setHex(hex);for(let i=0;i<p.count;i++){const k=shade(p.getY(i));c.push(C.r*k,C.g*k,C.b*k);}g.setAttribute('color',new T.Float32BufferAttribute(c,3));return g;}
function limb(a,b,r0,r1,sides){const d=b.clone().sub(a),g=new T.CylinderGeometry(r1,r0,d.length(),sides).translate(0,d.length()/2,0);g.applyQuaternion(new T.Quaternion().setFromUnitVectors(UP,d.normalize()));return g.translate(a.x,a.y,a.z);}

function build(sp,seed){
 const rnd=()=>{seed=(1664525*seed+1013904223)>>>0;return seed/4294967296;},bark=[],tips=[];
 const grow=(a,dir,len,r,depth)=>{const b=a.clone().addScaledVector(dir,len),r1=r*.72;bark.push(limb(a,b,r,r1,depth>1?6:4));
  if(!depth){tips.push({p:b,dir});return;}
  if(depth<sp.depth&&sp.leaf)tips.push({p:b,dir,inner:true});// crown filled along the scaffold limbs, not only at the tips
  const side=new T.Vector3().crossVectors(dir,Math.abs(dir.y)<.9?UP:X).normalize(),spin=rnd()*6.28;
  for(let i=0;i<sp.forks+(sp.leader?1:0);i++){const lead=sp.leader&&i===sp.forks,tilt=lead?.12*rnd():sp.angle*(.75+rnd()*.5);
   const out=side.clone().applyAxisAngle(dir,spin+i/sp.forks*6.28+rnd()*.6),nd=dir.clone().multiplyScalar(Math.cos(tilt)).addScaledVector(out,Math.sin(tilt));nd.y+=sp.lift*(1-nd.y);nd.normalize();
   grow(b,nd,len*sp.ratio*(lead?1.05:.8+rnd()*.4),lead?r1:r1*.78,depth-1);}};
 const lean=new T.Vector3((rnd()-.5)*.12,1,(rnd()-.5)*.12).normalize(),top=lean.clone().multiplyScalar(sp.trunk);
 bark.push(limb(new T.Vector3(0,-.1,0),top,sp.radius,sp.radius*.8,8),limb(new T.Vector3(0,-.1,0),new T.Vector3(0,.35,0),sp.radius*1.35,sp.radius,8));// flared root collar
 grow(top,lean,sp.len,sp.radius*.8,sp.depth);
 const barkGeo=tint(mergeGeometries(bark),sp.bark,y=>.8+Math.min(y,6)*.04);
 let crown=null,cards=null;
 if(sp.leaf){const blobs=[],planes=[],jitter=new Map();
  for(const {p,dir,inner} of tips){const r=sp.clump*(inner?1.15:.75+rnd()*.5),g=new T.IcosahedronGeometry(1,0),pos=g.attributes.position;
   // Lumpy but crack-free: the same corner always gets the same offset (the icosahedron repeats corners per face).
   for(let i=0;i<pos.count;i++){const key=[pos.getX(i),pos.getY(i),pos.getZ(i)].map(v=>v.toFixed(3)).join();if(!jitter.has(key))jitter.set(key,.78+rnd()*.44);const k=jitter.get(key);pos.setXYZ(i,pos.getX(i)*k,pos.getY(i)*k,pos.getZ(i)*k);}
   const c=p.clone().addScaledVector(dir,r*.35);g.rotateY(rnd()*6.28).scale(r,r*sp.squash,r).translate(c.x,c.y,c.z);g.computeVertexNormals();
   const hue=sp.palette[Math.floor(rnd()*sp.palette.length)];blobs.push(tint(g,hue,y=>.62+.45*Math.min(1,Math.max(0,(y-c.y+r*sp.squash)/(2*r*sp.squash)))));
   if(!inner||rnd()<.5){const card=new T.PlaneGeometry(r*2.3,r*2.3*sp.squash).rotateX((rnd()-.5)*1.2).rotateY(rnd()*6.28).translate(c.x+(rnd()-.5)*r,c.y+r*.3*sp.squash,c.z+(rnd()-.5)*r);planes.push(card);}}
  crown=mergeGeometries(blobs);cards=mergeGeometries(planes);}
 const parts=[barkGeo,crown,cards].filter(Boolean);
 const box=new T.Box3();parts.forEach(g=>{g.computeBoundingBox();box.union(g.boundingBox);});const H=box.max.y;
 for(const g of parts){g.scale(1/H,1/H,1/H).translate(0,-.5,0);g.computeBoundingSphere();}
 return {...sp,barkGeo,crown,cards,trunkRadius:sp.radius/H};// trunkRadius: base radius per metre of height
}

export function treeTemplates(){return TREE_SPECIES.map((sp,i)=>build(sp,7919*(i+1)));}
