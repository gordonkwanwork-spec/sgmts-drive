import * as T from 'three';
import {mergeGeometries} from 'three/addons/utils/BufferGeometryUtils.js';
// The generated tyres are fused to forks/bodywork. Keep that mesh intact and put
// low-poly rotating sidewalls/rims over its static wheel faces, rather than spin
// pieces of fenders. Tyre tread is rotationally symmetric at this detail level.
const RADII={taxi:.32,'modern-taxi':.32,bus:.48,'single-bus':.44,minibus:.35,car:.33,hatchback:.31,suv:.37,van:.36,'motor-scooter':.25,motorbike:.32};
const rubber=new T.MeshStandardMaterial({color:0x17191b,roughness:.96}),metal=new T.MeshStandardMaterial({color:0x8b9299,metalness:.65,roughness:.38});
const cache=new Map();
function wheelFaces(radius,sides){const key=radius+':'+sides.join(',');if(cache.has(key))return cache.get(key);const tyres=[],rims=[];
 for(const x of sides){const sign=x<0?-1:1;const disc=new T.CircleGeometry(radius*.97,20).rotateY(sign*Math.PI/2).translate(x,0,0);tyres.push(disc);
  rims.push(new T.RingGeometry(radius*.60,radius*.73,16).rotateY(sign*Math.PI/2).translate(x+sign*.003,0,0));
  rims.push(new T.CircleGeometry(radius*.17,12).rotateY(sign*Math.PI/2).translate(x+sign*.005,0,0));
  for(let i=0;i<6;i++){const a=i*Math.PI/3;const spoke=new T.BoxGeometry(.008,radius*.105,radius*.55).translate(0,0,radius*.38).rotateX(a).translate(x+sign*.006,0,0);rims.push(spoke);}}
 const value=[mergeGeometries(tyres),mergeGeometries(rims)];[...tyres,...rims].forEach(g=>g.dispose());cache.set(key,value);return value;}
export function rigVehicle(root,spec){if(root.userData.wheelRig)return root;root.updateMatrixWorld(true);const bike=['motorbike','motor-scooter'].includes(spec.id),r=RADII[spec.id],points=[],all=[],v=new T.Vector3(),inv=root.matrixWorld.clone().invert();let original=0;
 root.traverse(n=>{if(!n.isMesh)return;const p=n.geometry.attributes.position,m=new T.Matrix4().multiplyMatrices(inv,n.matrixWorld);original+=(n.geometry.index?.count??p.count)/3;for(let i=0;i<p.count;i++){v.fromBufferAttribute(p,i).applyMatrix4(m);all.push({x:v.x,y:v.y,z:v.z});if(v.y<.15&&(bike||Math.abs(v.x)>spec.width*.25))points.push({x:v.x,z:v.z});}});
 const seeds=spec.id==='bus'?[-.29,.205,.325]:[-.30,.30],clusters=[];for(const p of [...points].sort((a,b)=>a.z-b.z)){const last=clusters.at(-1);if(!last||p.z-last.at(-1).z>.45)clusters.push([p]);else last.push(p);}let count=0;
 for(const [i,seed] of seeds.entries()){const near=clusters.length===seeds.length?clusters[i]:points.filter(p=>Math.abs(p.z-seed*spec.length)<spec.length*(spec.id==='bus'?.04:.15)),z=near.length?(Math.min(...near.map(p=>p.z))+Math.max(...near.map(p=>p.z)))/2:seed*spec.length;
 const faces=all.filter(p=>Math.abs(p.z-z)<r*.45&&p.y>r*.3&&p.y<r*1.6);
  for(const side of bike?[0]:[-1,1]){const contact=(faces.length?faces:near).filter(p=>side===0||p.x*side>0),xs=contact.map(p=>p.x),x=side===0?0:xs.length?(side<0?Math.min(...xs)-.012:Math.max(...xs)+.012):side*spec.width*.4;const half=bike?(xs.length?Math.max(...xs.map(Math.abs))+.012:.11):0;
   const pivot=new T.Group();pivot.name=`road-wheel-${i}-${side}`;pivot.position.set(x,r,z);pivot.userData.roadWheel={radius:r,front:i===0};const [tyre,rim]=wheelFaces(r,bike?[-half,half]:[side*.003]);pivot.add(new T.Mesh(tyre,rubber),new T.Mesh(rim,metal));root.add(pivot);count++;}}
 root.userData.wheelRig={originalTriangles:original,wheels:count};return root;}
export function animateRoadWheels(root,distance,steer=0){root._roadWheels??=(()=>{const list=[];root.traverse(n=>{if(n.userData.roadWheel)list.push(n);});return list;})();for(const w of root._roadWheels)w.rotation.x=(w.rotation.x-distance/w.userData.roadWheel.radius)%(Math.PI*2);}
