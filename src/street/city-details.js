// Furnish the renderer's exact kerb paths, including swept corners. There is no
// second centreline or independently inferred verge; everything stays inside the
// 0.9 m kerbside furniture band, retaining the existing walking width beyond that band.
import * as T from 'three';
import {railingBuilder} from './furniture.js';
import {project} from '../alignment.js';
export function cityDetails(networkGroup,{batch,kitParts,fences,lampPositions,mats}){
 const {railRun,kit}=railingBuilder({batch,kitParts,fences}),ONE=new T.Vector3(1,1,1);
 const offset=(edge,t,d=.28)=>{const p=edge.point(t);return new T.Vector3(p.x+p.nx*d,p.y+Math.max(0,d-.125)*.025,p.z+p.nz*d);};
 let panels=0,lamps=0,gullies=0;
 const edges=networkGroup.userData.edges||[],used=new Set();
 const close=(a,b)=>Math.hypot(a.x-b.x,a.z-b.z)<.08;
 // Stitch straight edges and swept returns before laying out bays, so rounded
 // end panels appear only at genuine openings, never at a corner tangent.
 for(const seed of edges){if(used.has(seed))continue;const chain=[{e:seed,reverse:false}];used.add(seed);
  for(const end of [0,1]){for(;;){const tip=end?chain.at(-1):chain[0],p=tip.e.point(end?(tip.reverse?0:tip.e.length):(tip.reverse?tip.e.length:0));let found=null;
    for(const e of edges){if(used.has(e))continue;if(close(p,e.point(0))){found={e,reverse:!end};break;}if(close(p,e.point(e.length))){found={e,reverse:!!end};break;}}
    if(!found)break;used.add(found.e);end?chain.push(found):chain.unshift(found);
  }}
  let length=0;const gaps=[];for(const p of chain){p.start=length;for(const c of p.e.crossings||[])gaps.push([length+(p.reverse?p.e.length-c:c)-3.9,length+(p.reverse?p.e.length-c:c)+3.9]);length+=p.e.length;}
  const point=t=>{const p=chain.find(p=>t<=p.start+p.e.length)||chain.at(-1),d=Math.max(0,Math.min(p.e.length,t-p.start));return offset(p.e,p.reverse?p.e.length-d:d);};
  // Open the complete dropped-kerb and flare footprint. No horizontal panel or
 // rounded end intrudes onto the wheelchair approach.
  for(let a=60;a<length-10;a+=60)if(!gaps.some(([x,y])=>a>x-10&&a<y+10))gaps.push([a-2,a+2]);
  let pieces=[[.6,length-.6]];for(const [lo,hi] of gaps)pieces=pieces.flatMap(([a,b])=>hi<=a||lo>=b?[[a,b]]:[...(lo>a?[[a,lo]]:[]),...(hi<b?[[hi,b]]:[])]);
  for(const [a,b] of pieces){if(b-a<2)continue;const n=Math.ceil((b-a)/1.5),points=Array.from({length:n+1},(_,i)=>point(a+(b-a)*i/n));railRun(points,()=>Math.floor(project(points[0].x,points[0].z)/240));panels+=n;}
 }
 for(const edge of edges){if(edge.kind==='corner')continue;const length=edge.length;
  for(let t=12;t<length-8;t+=30){
   if((edge.crossings||[]).some(c=>Math.abs(c-t)<5))continue;const p=edge.point(t),P=offset(edge,t,.75),ch=Math.floor(project(P.x,P.z)/240),yaw=Math.atan2(p.nx,p.nz);
   // One lamp row for two lanes; stagger the second row on wider roads.
   if(edge.side===-1&&(edge.road.carriageway||7.3)<12)continue;
   const height=(edge.road.carriageway||7.3)>=12?10:8;
   const put=(name,geo,mat,pos,scale)=>batch(name,geo,mat,pos,scale,new T.Euler(0,yaw,0),ch);
   put('city-light-column',new T.CylinderGeometry(.07,.09,1,8),mats.galvanised,P.clone().add(new T.Vector3(0,height/2,0)),new T.Vector3(1,height,1));
   put('city-light-arm',new T.BoxGeometry(.07,.07,1.4),mats.galvanised,P.clone().add(new T.Vector3(-p.nx*.7,height-.15,-p.nz*.7)),ONE);
   const head=P.clone().add(new T.Vector3(-p.nx*1.4,height-.2,-p.nz*1.4));
   put('city-light-head',new T.BoxGeometry(.38,.1,.8),mats.lamp,head,ONE);lampPositions.push({s:project(P.x,P.z),x:head.x,y:head.y,z:head.z,kind:'city',height});lamps++;
  }
  for(let t=8;t<length-5;t+=25){if((edge.crossings||[]).some(c=>Math.abs(c-t)<4))continue;const p=edge.point(t),P=new T.Vector3(p.x,p.base+.005,p.z),ch=Math.floor(project(P.x,P.z)/240);
   kit('gully_grating',P,Math.atan2(p.nz,-p.nx),ONE,ch);gullies++;}
 }
 // Amber globes identify the unsignalised local-street zebra crossings.
 const poleGeo=new T.CylinderGeometry(.045,.045,2.5,8),globeGeo=new T.SphereGeometry(.16,12,8),beacon=new T.MeshStandardMaterial({color:0xffa31a,emissive:0xff8500,emissiveIntensity:.5});
 for(const c of networkGroup.userData.crossings||[])for(const side of [-1,1]){const {f,half}=c,lat=side*(half+.65),P=new T.Vector3(f.x+f.lx*lat+f.tx*3.8,f.y+.18,f.z+f.lz*lat+f.tz*3.8),ch=Math.floor(project(P.x,P.z)/240);
  batch('city-zebra-pole',poleGeo,mats.metal,P.clone().add(new T.Vector3(0,1.25,0)),ONE,new T.Euler(),ch);batch('city-zebra-beacon',globeGeo,beacon,P.clone().add(new T.Vector3(0,2.6,0)),ONE,new T.Euler(),ch);
 }
 networkGroup.userData.details={panels,lamps,gullies};return networkGroup.userData.details;
}
