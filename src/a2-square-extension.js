// Paved station forecourts in the same survey frame as the cycleway and river.
import * as T from 'three';
import {siteCoordinates,worldCoordinates,frontage,pavingY,zMin,zMax} from './a2-site.js';
import {riverFrames,bankTerrace,upperBankY} from './a2-river-alignment.js';
import {surfaceSampler,streetLevel} from './street/network.js';

const rim=riverFrames.filter(f=>f.x>=-25&&f.x<=335).map(f=>{
 const o=bankTerrace(f.d)?.outer??25;
 return {x:f.x+o*f.nx,z:f.z+o*f.nz,d:f.d};
}).sort((a,b)=>a.x-b.x);
function bank(x){
 let i=0,j=rim.length-1;
 while(j-i>1){const k=(i+j)>>1;if(rim[k].x<x)i=k;else j=k;}
 const a=rim[i],b=rim[j],t=T.MathUtils.clamp((x-a.x)/(b.x-a.x),0,1);
 return {z:T.MathUtils.lerp(a.z,b.z,t),d:T.MathUtils.lerp(a.d,b.d,t)};
}
// East and south boundaries traced on the annotated OZP, in station-local metres
// (longitudinal Z, easternmost X). The south tongue narrows against the cycleway.
const eastBoundary=[[-405,96],[-402,98],[-372,112],[-322,119],[-290,111],[-256,105],
 [-209,84],[-159,73],[-100,77],[-43,104],[14,119],[56,120],[106,120],[144,124],
 [171,113],[183,102],[194,82],[197,51],[203,30],[219,19],[242,13],[258,3]];
function eastEdge(z){
 let i=0;
 while(i<eastBoundary.length-2&&eastBoundary[i+1][0]<z)i++;
 const [za,a]=eastBoundary[i],[zb,b]=eastBoundary[i+1];
 return T.MathUtils.lerp(a,b,T.MathUtils.clamp((z-za)/(zb-za),0,1));
}
function westEdge(p){
 if(p.z<zMin||p.z>zMax)return frontage(p.z).x;
 // Keep the original plaza and the actual 36 x 220 m station plinth open.
 return Math.abs(p.z)<=110?18:-18;
}
export function inSquareExtension(x,z,r=0){
 if(x< -75-r||x>322+r||z< -1090-r||z> -470+r)return false;
 const p=siteCoordinates(x,z);
 if(p.z>258+r||p.z< -405-r||p.x>eastEdge(p.z)+r||p.x<westEdge(p)-r)return false;
 if(p.z>=zMin)return true;
 const west=52+16*Math.max(0,1-Math.abs(z+945)/53);
 return x-west+Math.max(0,z+866)*2>=-r&&z>=bank(x).z-r;
}
export function extensionGrade(x,z,ground){
 const p=siteCoordinates(x,z),natural=ground(x,z)+.16;
 const nearZ=T.MathUtils.clamp(p.z,zMin,zMax);
 const joinY=pavingY(p.x,nearZ);
 let grade=natural;
 if(p.z<zMin){
  const edge=bank(x),off=z-edge.z;
  const lip=upperBankY(edge.d,x,ground(x,edge.z)+.03,bankTerrace(edge.d));
  grade=T.MathUtils.lerp(lip,natural-.13,T.MathUtils.clamp(off/84,0,1));
 }
 const distance=Math.hypot(Math.max(0,p.x-18),p.z-nearZ);
 grade=T.MathUtils.lerp(joinY,grade,T.MathUtils.clamp(distance/24,0,1));
 if(p.z>zMax){
  const edge=frontage(p.z);
  grade=T.MathUtils.lerp(edge.y+.32,grade,T.MathUtils.clamp((p.x-edge.x)/9,0,1));
 }
 return grade;
}
let surface=()=>null;
export const riversideSquareFloor=(x,z)=>surface(x,z);

export function buildSquareExtension(scene,ground,mask,material,roads){
 const headIds=['city-station-north','city-station-street','city-yick-yuen'];
 const heads=roads.filter(o=>headIds.includes(o.r.id)).map(({r,P,F})=>{
  const f=F.at(-1),outer=P.carriageway/2+P.footpath;
  return {x:f.x,z:f.z,radius:r.turningRadius+P.footpath,y:f.y+streetLevel(r,f.d,outer)};
 });
 function height(p){
  const grade=extensionGrade(p.x,p.z,ground);
  for(const head of heads){
   const gap=Math.hypot(p.x-head.x,p.z-head.z)-head.radius;
   if(gap<12)return T.MathUtils.lerp(head.y-.006,grade,T.MathUtils.clamp(gap/12,0,1));
  }
  return grade;
 }
 const positions=[],uv=[],indices=[];
 const vertex=(x,z)=>{
  const w=worldCoordinates(x,z);
  return {...w,localX:x,localZ:z,inside:inSquareExtension(w.x,w.z)&&!mask.onStreet(w.x,w.z,-.75)};
 };
 const cut=(a,b)=>{
  let low=a,high=b;
  for(let i=0;i<10;i++){
   const m=vertex((low.localX+high.localX)/2,(low.localZ+high.localZ)/2);
   if(m.inside===a.inside)low=m;else high=m;
  }
  return low.inside?low:high;
 };
 function triangle(points){
  const poly=[];
  points.forEach((p,i)=>{const q=points[(i+1)%3];if(p.inside)poly.push(p);if(p.inside!==q.inside)poly.push(cut(p,q));});
  if(poly.length<3)return;
  for(const p of poly){
   if(p.index!==undefined)continue;
   p.index=positions.length/3;
   positions.push(p.x,height(p),p.z);uv.push(p.localX/6,p.localZ/6);
  }
  for(let i=1;i+1<poly.length;i++)indices.push(poly[0].index,poly[i].index,poly[i+1].index);
 }
 const row=z=>Array.from({length:170},(_,i)=>vertex(-205+2*i,z));
 // Include the exact ends of the station slab and original paving in the grid.
 const stations=new Set([258,zMax,110,-110,zMin,-405]);
 for(let z=257;z>=-405;z-=2)stations.add(z);
 let prev=null;
 for(const z of [...stations].sort((a,b)=>b-a)){
  const next=row(z);
  if(prev)for(let i=1;i<prev.length;i++){
   triangle([prev[i-1],prev[i],next[i-1]]);
   triangle([prev[i],next[i],next[i-1]]);
  }
  prev=next;
 }
 const g=new T.BufferGeometry();g.setAttribute('position',new T.Float32BufferAttribute(positions,3));
 g.setAttribute('uv',new T.Float32BufferAttribute(uv,2));g.setIndex(indices);g.computeVertexNormals();
 const m=new T.Mesh(g,material);m.name='A2 riverside square';m.receiveShadow=true;scene.add(m);surface=surfaceSampler([m]);
}
