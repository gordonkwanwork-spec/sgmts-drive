import {boxesOverlap} from '../simulation.js';

// Register rails, walls, trunks and street furniture once. Query only cells touched by the vehicle.
export function streetObstacles(fences,posts){
 const cells=new Map(),cell=v=>Math.floor(v/12);
 const add=(box,reach)=>{
  for(let i=cell(box.x-reach);i<=cell(box.x+reach);i++)for(let j=cell(box.z-reach);j<=cell(box.z+reach);j++){
   const key=i+','+j;if(!cells.has(key))cells.set(key,[]);cells.get(key).push(box);
  }
 };
 for(const f of fences){
  const dx=f.bx-f.ax,dz=f.bz-f.az,hl=Math.hypot(dx,dz)/2;
  add({x:(f.ax+f.bx)/2,z:(f.az+f.bz)/2,y:f.y,top:f.top??1,hl,hw:.04,heading:Math.atan2(dx,dz)},hl+.05);
 }
 for(const p of posts){const r=p.radius??.18;add({x:p.x,y:p.y,z:p.z,top:p.height??2.5,hl:r,hw:r,heading:0},r*1.42);}
 return (box,y,height)=>{
  const r=Math.hypot(box.hw,box.hl);
  for(let i=cell(box.cx-r);i<=cell(box.cx+r);i++)for(let j=cell(box.cz-r);j<=cell(box.cz+r);j++){
   for(const o of cells.get(i+','+j)??[]){
    if(o.y!=null&&(o.y+o.top<y+.22||o.y>y+height))continue;
    if(boxesOverlap(box,o))return true;
   }
  }
  return false;
 };
}
