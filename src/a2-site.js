// Station-local metres. X increases from the SGMTS cycle track towards the Tuen Ma Line.
// Positive Z is the near end in the approach view supplied for the square.
import {STOPS, sample, roadSection, cycleSample, railSample} from './alignment.js';

const stop = STOPS[1];
export const rail = railSample(stop.s);
export const datum = sample(stop.s).groundY;
export const benches=[[-59,35],[-35,-18],[-59,-83]];
export const portalX = -48;
export const portalZ = [-77, 64];
export const halfWidth = 4;
export const halfRun = 7;
export const stairCount = 24;
export const riser = .16;

export function siteCoordinates(x, z) {
 const dx = x - rail.x, dz = z - rail.z;
 return {x: -dx * rail.lx - dz * rail.lz, z: -dx * rail.tx - dz * rail.tz};
}
export function worldCoordinates(x,z) {
 return {x: rail.x - x * rail.lx - z * rail.tx, z: rail.z - x * rail.lz - z * rail.tz};
}

export const galleryEdge=Array.from({length:146},(_,i)=>{
 const s=stop.s-77+i,r=sample(s),offset=roadSection(s).right+3.75;
 return {...siteCoordinates(r.x+r.lx*offset,r.z+r.lz*offset),y:r.groundY+.3};
}).sort((a,b)=>a.z-b.z);
export function galleryY(x,z){
 if(x< -114||x> -90||z<galleryEdge[0].z||z>galleryEdge.at(-1).z)return null;
 let lo=0,hi=galleryEdge.length-1;
 while(hi-lo>1){const mid=(lo+hi)>>1;if(galleryEdge[mid].z<z)lo=mid;else hi=mid;}
 const a=galleryEdge[lo],b=galleryEdge[hi],t=(z-a.z)/(b.z-a.z),edge=a.x+(b.x-a.x)*t;
 if(x>edge)return null;
 const base=datum+.49;
 return base+(a.y+(b.y-a.y)*t-base)*(x+114)/(edge+114);
}

// Sample the edge of the actual cycle track. Interpolate by station Z so the square
// can meet the curved track at one edge and the straight concourse at the other.
const edge = [];
for (let d=150; d>=-150; d-=1) {
 const r=cycleSample(stop.s+d);
 edge.push({...siteCoordinates(r.x-2.01*r.lx,r.z-2.01*r.lz), y:r.groundY});
}
export const zMin=-119, zMax=113;
export function frontage(z) {
 let lo=0, hi=edge.length-1;
 while(hi-lo>1){const mid=(lo+hi)>>1;if(edge[mid].z<z)lo=mid;else hi=mid;}
 const a=edge[lo], b=edge[hi], t=Math.max(0,Math.min(1,(z-a.z)/(b.z-a.z)));
 return {x:a.x+(b.x-a.x)*t, y:a.y+(b.y-a.y)*t};
}
export function pavingY(x,z) {
 const left=frontage(z), t=Math.max(0,Math.min(1,(x-left.x)/(-16-left.x)));
 return left.y+(datum-left.y)*t+.32;
}
export function insidePortal(x,z,margin=0) {
 return Math.abs(x-portalX)<halfWidth+margin && portalZ.some(c=>Math.abs(z-c)<halfRun+margin);
}
export function stairDrop(localZ) {
 return Math.min(stairCount,Math.max(0,Math.floor((halfRun-localZ)/.43)))*riser;
}
export const portalDirection=z=>Math.sign(z);
export const portalLevel=z=>pavingY(portalX,z+portalDirection(z)*halfRun);
export function passageY(z){
 const a=portalZ[0]+halfRun,b=portalZ[1]-halfRun,t=Math.max(0,Math.min(1,(z-a)/(b-a)));
 return portalLevel(portalZ[0])*(1-t)+portalLevel(portalZ[1])*t-stairCount*riser;
}
export function squareFloor(x,z,fromY) {
 if(z<zMin || z>zMax || x<frontage(z).x || x>17.15)return null;
 for(const c of portalZ)if(Math.abs(x-portalX)<halfWidth && Math.abs(z-c)<halfRun)
  return portalLevel(c)-stairDrop((z-c)*portalDirection(c));
 if(Math.abs(x-portalX)<halfWidth && z>portalZ[0] && z<portalZ[1] && fromY<pavingY(x,z)-1.8)
  return passageY(z);
 // Pick the elevated surface only from its stairs or once the walker is upstairs.
 const deck=rail.y+1.15;
 if(Math.abs(x)>3.85&&Math.abs(x)<17.16&&Math.abs(z)<=105){
  if(Math.abs(Math.abs(x)-10.1)<2.42){
   for(const centre of [-35,35])if(z>=centre-10.16&&z<centre+9.04){
    const step=Math.min(60,1+Math.floor((z-centre+10.16)/.32));
    return datum+.32+(deck-datum-.32)*step/60;
   }
  }
  if(fromY>deck-.65)return deck;
 }
 return pavingY(x,z);
}
