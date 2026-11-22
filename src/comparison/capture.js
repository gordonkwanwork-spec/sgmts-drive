// Capture from the assembled scene so a parcel, a frontage plot and a building have distinct outlines.
import {Vector3,Matrix4} from 'three';
import {BUILDINGS,SITE,CV_ROAD,CV_ROAD_WIDTH} from '../depot.js';
import {STOPS,sample,PATH,LOOP,RAILWAY,cycleSample,CYCLE_INTERRUPTS,LENGTH} from '../alignment.js';
import {corridorReserve} from '../lots/wand.js';

const xy=p=>[p.x,p.z];
const round=v=>Math.round(v*10)/10;
function mask(cal,colour){
 const c=document.createElement('canvas');c.width=cal.width;c.height=cal.height;
 const ctx=c.getContext('2d'),k=1/cal.metresPerPixel;
 ctx.setTransform(k,0,0,k,-cal.originX*k,-cal.originZ*k);
 ctx.fillStyle=ctx.strokeStyle=colour;ctx.lineJoin=ctx.lineCap='round';
 function path(points){ctx.beginPath();ctx.moveTo(...points[0]);for(const p of points.slice(1))ctx.lineTo(...p);}
 function fill(points){if(points.length<3)return;path(points);ctx.closePath();ctx.fill();}
 function line(points,width){if(points.length<2)return;path(points);ctx.lineWidth=width;ctx.stroke();}
 // Union the horizontal projections of actual triangles, including meshes already merged or instanced.
 function project(mesh){
  if(!mesh.isMesh)return;
  const geo=mesh.geometry,pos=geo.attributes.position,idx=geo.index;
  const v=new Vector3(),mat=new Matrix4(),triangles=idx?idx.count:pos.count;
  for(let j=0;j<(mesh.isInstancedMesh?mesh.count:1);j++){
   if(mesh.isInstancedMesh){mesh.getMatrixAt(j,mat);mat.premultiply(mesh.matrixWorld);}else mat.copy(mesh.matrixWorld);
   const pts=new Float64Array(pos.count*2);
   for(let i=0;i<pos.count;i++){v.fromBufferAttribute(pos,i).applyMatrix4(mat);pts[i*2]=v.x;pts[i*2+1]=v.z;}
   ctx.beginPath();
   for(let i=0;i<triangles;i+=3){
    const a=2*(idx?idx.getX(i):i),b=2*(idx?idx.getX(i+1):i+1),d=2*(idx?idx.getX(i+2):i+2);
    const area=(pts[b]-pts[a])*(pts[d+1]-pts[a+1])-(pts[b+1]-pts[a+1])*(pts[d]-pts[a]);
    if(Math.abs(area)<.01)continue;
    const q=area>0?b:d,r=area>0?d:b;
    ctx.moveTo(pts[a],pts[a+1]);ctx.lineTo(pts[q],pts[q+1]);ctx.lineTo(pts[r],pts[r+1]);ctx.closePath();
    if(i%1500===1497){ctx.fill();ctx.beginPath();}
   }
   ctx.fill();
  }
 }
 return {c,ctx,fill,line,project};
}
export async function captureComparison({scene,lots,environment,lotGroup,kitCity,stations,roads}){
 const response=await fetch(import.meta.env.BASE_URL+'lots/ozp-underlay.json');
 if(!response.ok)throw Error('Cannot load the OZP coordinates.');
 const cal=await response.json(),built=mask(cal,'#006b62'),used=mask(cal,'#899895');
 scene.updateMatrixWorld(true);
 const sink=kitCity.userData.sink;
 for(const sh of sink.shells)built.fill(sh.P.map(xy));
 for(const rec of lotGroup.userData.cityPlan){
  for(const p of rec.footprints)built.fill(p);
  for(const p of rec.surfaces)used.fill(p);
 }
 for(const g of lotGroup.children)if(g.userData.lotId)g.traverse(built.project);
 for(const p of environment.plots){
  const c=Math.cos(p.angle),s=Math.sin(p.angle);
  built.fill([[-1,-1],[1,-1],[1,1],[-1,1]].map(([u,v])=>[p.x+u*p.w*c/2+v*p.d*s/2,p.z-u*p.w*s/2+v*p.d*c/2]));
 }
 for(const b of BUILDINGS)built.fill([[b.x0,b.z0],[b.x1,b.z0],[b.x1,b.z1],[b.x0,b.z1]]);
 used.ctx.beginPath();used.ctx.arc(LOOP.center.x,LOOP.center.z,LOOP.outerRadius+3.75,0,2*Math.PI);used.ctx.fill();
 used.fill(SITE);used.line(CV_ROAD.map(xy),CV_ROAD_WIDTH);
 for(const {x,z,r} of corridorReserve()){used.ctx.beginPath();used.ctx.arc(x,z,r,0,2*Math.PI);used.ctx.fill();}
 used.line(Array.from({length:Math.ceil(RAILWAY.length/4)+1},(_,i)=>xy(RAILWAY.at(i*4))),14);
 const starts=[0,...CYCLE_INTERRUPTS.map(g=>g.end)],ends=[...CYCLE_INTERRUPTS.map(g=>g.start),LENGTH];
 for(const [i,start] of starts.entries()){const end=ends[i];
  used.line(Array.from({length:Math.ceil((end-start)/4)+1},(_,i)=>xy(cycleSample(Math.min(end,start+i*4)))),4);
 }
 for(const root of scene.children){
  if(root.name==='Drawn street network'||/^(junction-|underpass-|Pedestrian footbridge )/.test(root.name))root.traverse(used.project);
 }
 for(const name of ['Plot paving','Hung Shui Kiu regional plaza','A2 commercial forecourt','A2 iconic footbridge']){
  scene.getObjectByName(name)?.traverse(used.project);
 }
 for(const name of ['Hung Shui Kiu Station','A2 commercial frontage']){
  scene.getObjectByName(name)?.traverse(m=>{if(m.name!=='A2 commercial forecourt')built.project(m);});
 }
 scene.traverse(m=>{
  if(m.name==='HSWRL underground entrance')m.traverse(built.project);
  if(/(?:^|-)oc-roof-\d+$/.test(m.name))built.project(m);
  if(m.name==='A1 island hardstanding'||m.name==='A1-connected-throat')m.traverse(used.project);
 });
 for(const {root} of stations)root.traverse(used.project);
 return {version:2,captured:new Date().toISOString(),cal,lots:lots.map(({id,zone,note,poly})=>({id,zone,note,poly})),
  stops:STOPS.map(st=>({id:st.id,name:st.en||st.name,point:xy(sample(st.s)).map(round)})),
  streets:roads.map(({r,F,P})=>({name:r.name||r.id,width:P.carriageway,points:F.map(f=>xy(f).map(round))})),
  route:PATH.filter((_,i)=>i%4===0).map(p=>xy(p).map(round)),
  built:built.c.toDataURL(),used:used.c.toDataURL()};
}
