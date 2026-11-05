import fs from 'node:fs';
import {networkMask} from '../street/network.js';
import {massingParts,footprintSlots,lotMaterials} from '../lots/massing.js';
import {rectangle} from '../lots/geometry.js';
const ctx2d=new Proxy({},{get:(_,k)=>k==='measureText'?()=>({width:0}):k==='createLinearGradient'?()=>({addColorStop(){}}):()=>{},set:()=>true});
globalThis.document={createElement:()=>({getContext:()=>ctx2d,width:0,height:0})};
export {networkMask};
export const pickFootprints=({lot,width,depth,gap,setback})=>footprintSlots(lot,width,depth,gap,setback,{}).map(p=>rectangle({...p,w:width,d:depth}));
function hull(points){const ps=[...new Map(points.map(p=>[p.join(','),p])).values()].sort((a,b)=>a[0]-b[0]||a[1]-b[1]),cross=(a,b,c)=>(b[0]-a[0])*(c[1]-a[1])-(b[1]-a[1])*(c[0]-a[0]);if(ps.length<3)return [];
 const side=list=>{const out=[];for(const p of list){while(out.length>1&&cross(out.at(-2),out.at(-1),p)<=1e-7)out.pop();out.push(p);}return out;};const a=side(ps),b=side([...ps].reverse());return [...a.slice(0,-1),...b.slice(0,-1)];}
export function generateLot(lot){const out=massingParts(lot,{ground:()=>0,allowed:()=>true}),M=lotMaterials();return {trees:out.trees,footprints:out.parts.map(p=>{const v=p.geometry.attributes.position,pts=[];let ymin=Infinity,ymax=-Infinity;for(let i=0;i<v.count;i++){pts.push([v.getX(i),v.getZ(i)]);ymin=Math.min(ymin,v.getY(i));ymax=Math.max(ymax,v.getY(i));}return {kind:p.material===M.yard?'paving':'building',poly:hull(pts),ymin,ymax};}).filter(f=>f.poly.length>=3)};}
export function realLots(){return JSON.parse(fs.readFileSync(new URL('../../public/lots/lots.json',import.meta.url))).lots;}
