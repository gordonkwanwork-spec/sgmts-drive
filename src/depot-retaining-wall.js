// Road D3 cuts past the east face of the depot platform. Keep the crest behind
// its footway, including where the underpass meets the drawn city street.
import * as T from 'three';
import {SITE,DEPOT_Y} from './depot.js';
import {UNDERPASSES,crossingGeometry} from './alignment.js';
const road=UNDERPASSES.find(r=>r.c===3400),{C,u,n}=crossingGeometry(road);
const clearance=road.halfWidth+road.footway+1.3;
const setback=p=>(p[0]-C.x)*n.x+(p[1]-C.z)*n.z;
const side=Math.sign(setback(SITE[8]));
const intersect=(a,b)=>{
 const f=(side*clearance-setback(a))/(setback(b)-setback(a));
 return a.map((v,i)=>v+f*(b[i]-v));
};
const first=intersect(SITE[6],SITE[7]),last=intersect(SITE[7],SITE[8]);
const crest=[first,last,SITE[8]];
const spans=crest.slice(1).map(([bx,bz],i)=>{
 const [x,z]=crest[i],len=Math.hypot(bx-x,bz-z),tx=(bx-x)/len,tz=(bz-z)/len;
 return {x,z,tx,tz,len,nx:tz,nz:-tx};
});
export function wallGround(x,z,y){
 const reach=28;
 if(z<crest[0][1]-reach||z>SITE[8][1]+reach||x<SITE[8][0]-reach||x>first[0]+reach)return y;
 let nearest=Infinity;
 for(const p of spans){
  const dx=x-p.x,dz=z-p.z,along=Math.max(0,Math.min(p.len,dx*p.tx+dz*p.tz));
  nearest=Math.min(nearest,Math.hypot(dx-p.tx*along,dz-p.tz*along));
 }
 const t=Math.max(0,Math.min(1,(reach-nearest)/15)),weight=t*t*(3-2*t);
 return y+(Math.min(y,C.y-.45)-y)*weight;
}
function granite(){
 const canvas=document.createElement('canvas');canvas.width=canvas.height=512;
 const ctx=canvas.getContext('2d');ctx.fillStyle='#4a4c49';ctx.fillRect(0,0,512,512);
 let seed=6241;const rand=()=>((seed=Math.imul(1664525,seed)+1013904223>>>0)/4294967296);
 for(let row=0;row<8;row++)for(let col=0;col<8;col++){
  const px=col*64,py=row*64,split=rand()>.4,vertical=rand()>.5;
  for(let k=0;k<(split?2:1);k++){
   const w=split&&vertical?32:64,h=split&&!vertical?32:64,x=px+(vertical?k*w:0),y=py+(!vertical?k*h:0);
   const shade=Math.floor(143+rand()*19);
   ctx.fillStyle='rgb('+shade+','+(shade+1)+','+(shade-3)+')';ctx.fillRect(x+1.4,y+1.4,w-2.8,h-2.8);
   ctx.fillStyle='#bec0b8';ctx.fillRect(x+1,y+1,w-3,1);ctx.fillRect(x+1,y+1,1,h-3);
  }
 }
 for(let i=0;i<42000;i++){ctx.fillStyle=rand()>.5?'#ffffff22':'#15191426';ctx.fillRect(rand()*512,rand()*512,1+rand()*2,1);}
 const map=new T.CanvasTexture(canvas);map.colorSpace=T.SRGBColorSpace;map.wrapS=map.wrapT=T.RepeatWrapping;map.anisotropy=4;
 return new T.MeshStandardMaterial({map,bumpMap:map,bumpScale:.06,roughness:.96,side:T.DoubleSide});
}
export function depotWall(group,{box,mats,chunk,fences,addSlope}){
 const stone=granite(),top=DEPOT_Y+.02,bottom=Math.min(-5,C.y-1);
 const face=(name,mat,pos,uv)=>{
  const g=new T.BufferGeometry();g.setAttribute('position',new T.Float32BufferAttribute(pos.flat(),3));g.setIndex([0,1,2,0,2,3]);
  g.setAttribute('uv',new T.Float32BufferAttribute(uv,2));g.computeVertexNormals();const m=new T.Mesh(g,mat);m.name=name;m.receiveShadow=true;group.add(m);
 };
 let run=0;
 for(const p of spans){
  const at=(s,d,y)=>[p.x+p.tx*s+p.nx*d,y,p.z+p.tz*s+p.nz*d];
  const far=p.len,yaw=Math.atan2(-p.tz,p.tx),w=(run+far)/4;
  face('Road D3 granite retaining wall',stone,[at(0,0,top),at(far,0,top),at(far,0,bottom),at(0,0,bottom)],[run/4,0,w,0,w,(bottom-top)/4,run/4,(bottom-top)/4]);
  face('Depot crest verge',mats.grass,[at(0,0,top),at(0,-17,top),at(far,-17,top),at(far,0,top)],[0,0,0,4,far/4,4,far/4,0]);
  const [x,,z]=at(far/2,0,top);
  box('depot-wall-coping',mats.concrete,x,top+.12,z,far+.04,.27,.55,yaw,chunk);
  for(const dy of [.68,1.22])box('depot-wall-rail',mats.galvanised,x,top+dy,z,far,.052,.052,yaw,chunk);
  const bays=Math.ceil(far/2.3);
  for(let i=0;i<=bays;i++){
   const [px,,pz]=at(i*far/bays,0,top);
   box('depot-wall-upright',mats.galvanised,px,top+.73,pz,.065,1.05,.065,yaw,chunk);
   if(i<bays){
    const [bx,,bz]=at((i+1)*far/bays,0,top);
    fences.push({ax:px,az:pz,bx,bz,y:bottom,top:top+1.25-bottom});
   }
  }
  run+=far;
 }
 // Continue each wall end around the depot boundary. The crest stays at yard
 // level while the stone coping descends and the bank above it widens to 1:1.5.
 const ring=[...SITE.slice(8),...SITE.slice(0,7),first].map(([x,z])=>({x,z}));
 const normals=ring.map((p,i)=>{
  const a=ring[Math.max(0,i-1)],b=ring[Math.min(ring.length-1,i+1)],dx=b.x-a.x,dz=b.z-a.z,len=Math.hypot(dx,dz);
  return {x:dz/len,z:-dx/len};
 });
 const bank=mats.grass.clone();bank.side=T.DoubleSide;
 for(const start of [0,ring.length-1]){
  const step=start===0?1:-1,next=start+step,a=ring[start],b=ring[next],normal=normals[start],nextNormal=normals[next];
  const edgeLength=Math.hypot(b.x-a.x,b.z-a.z),length=Math.min(32,edgeLength*.85);
  const sections=[];
  for(let i=0;i<=20;i++){
   const u=i/20,t=u*length/edgeLength,blend=u*u*(3-2*u);
   const x=a.x+(b.x-a.x)*t,z=a.z+(b.z-a.z)*t;
   const nx=normal.x+(nextNormal.x-normal.x)*t,nz=normal.z+(nextNormal.z-normal.z)*t;
   const h=top+(bottom-top)*blend,run=(DEPOT_Y+5)*1.5*blend;
   const crest=[x,DEPOT_Y-.02,z],edge=[x+nx*run,h,z+nz*run];
   sections.push({crest,edge,toe:[edge[0],bottom,edge[2]],nx,nz});
   if(i===20){ring[start]={x,z};normals[start]={x:nx,z:nz};}
  }
  function ribbon(name,mat,edges){
   const positions=[],uv=[],indices=[];let along=0;
   for(const [i,q] of sections.entries()){
    const [a,b]=edges(q);
    if(i)along+=Math.hypot(...q.edge.map((v,k)=>v-sections[i-1].edge[k]));
    positions.push(...a,...b);uv.push(along/4,0,along/4,Math.hypot(...a.map((v,k)=>v-b[k]))/4);
    if(i){const j=i*2;indices.push(j-2,j-1,j,j,j-1,j+1);}
   }
   const g=new T.BufferGeometry();g.setAttribute('position',new T.Float32BufferAttribute(positions,3));g.setAttribute('uv',new T.Float32BufferAttribute(uv,2));
   g.setIndex(indices);g.computeVertexNormals();const m=new T.Mesh(g,mat);m.name=name;m.receiveShadow=true;group.add(m);
  }
  ribbon('Depot wall grass transition',bank,q=>[q.crest,q.edge]);
  ribbon('Depot tapered granite return',stone,q=>[q.edge,q.toe]);
  // Follow the descending stone face with a continuous concrete cap.
  const cap=(q,d,h)=>[q.edge[0]+q.nx*d,q.edge[1]+h,q.edge[2]+q.nz*d];
  const coping=mats.concrete.clone();coping.side=T.DoubleSide;
  ribbon('Depot return coping',coping,q=>[cap(q,-.26,.24),cap(q,.26,.24)]);
  ribbon('Depot return coping face',coping,q=>[cap(q,.26,.24),cap(q,.26,-.02)]);
  for(let i=1;i<sections.length;i++){
   const a=sections[i-1].edge,b=sections[i].edge;
   fences.push({ax:a[0],az:a[2],bx:b[0],bz:b[2],y:bottom,top:Math.max(a[1],b[1])+.24-bottom});
  }
 }
 addSlope(ring,normals);
}
