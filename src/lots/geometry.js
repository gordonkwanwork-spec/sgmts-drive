// World X/Z geometry shared by parcel, surface and planting reservations.
import {pointInPolygon} from './wand.js';
const EPS=1e-7;
export function segmentDistance(p,a,b){const dx=b[0]-a[0],dz=b[1]-a[1],t=Math.max(0,Math.min(1,((p[0]-a[0])*dx+(p[1]-a[1])*dz)/(dx*dx+dz*dz||1)));return Math.hypot(p[0]-a[0]-t*dx,p[1]-a[1]-t*dz);}
export const edges=poly=>poly.map((p,i)=>[p,poly[(i+1)%poly.length]]);
export const boundaryDistance=(p,poly)=>Math.min(...edges(poly).map(([a,b])=>segmentDistance(p,a,b)));
const cross=(a,b,c)=>(b[0]-a[0])*(c[1]-a[1])-(b[1]-a[1])*(c[0]-a[0]);
export function segmentsCross(a,b,c,d){return cross(a,b,c)*cross(a,b,d)<-EPS&&cross(c,d,a)*cross(c,d,b)<-EPS;}
const inside=(p,poly)=>pointInPolygon(p,poly)||boundaryDistance(p,poly)<EPS;
export function polygonContains(outer,inner,setback=0){
 if(!inner.every(p=>inside(p,outer)))return false;
 const oe=edges(outer),ie=edges(inner);
 if(ie.some(([a,b])=>oe.some(([c,d])=>segmentsCross(a,b,c,d))))return false;
 // A notch vertex can lie on a candidate edge; check midpoints and boundary distances too.
 if(oe.some(([p])=>pointInPolygon(p,inner)&&boundaryDistance(p,inner)>EPS))return false;
 if(ie.some(([a,b])=>!inside([(a[0]+b[0])/2,(a[1]+b[1])/2],outer)))return false;
 if(setback>0&&ie.some(([a,b])=>oe.some(([c,d])=>Math.min(segmentDistance(a,c,d),segmentDistance(b,c,d),segmentDistance(c,a,b),segmentDistance(d,a,b))<setback-EPS)))return false;
 return true;
}
export const circleIntersects=(x,z,r,poly)=>inside([x,z],poly)||boundaryDistance([x,z],poly)<=r+EPS;
export function rectangle({x,z,w,d,angle=0},grow=0){const c=Math.cos(angle),s=Math.sin(angle);return [[-1,-1],[1,-1],[1,1],[-1,1]].map(([u,v])=>[x+u*(w/2+grow)*c+v*(d/2+grow)*s,z-u*(w/2+grow)*s+v*(d/2+grow)*c]);}
