// Backdrop hills: ellipsoids sunk into the ground, {id, x, z, y (centre height, usually ground − 25 m), rx, ry, rz (radii, m),
// turn (°)}. The game builds the set saved in public/street/furniture.json (`hills`), or environment.js's own default set.
import * as T from 'three';

export const HILL={rx:260,ry:120,rz:220,sink:25};
const geo=new T.SphereGeometry(1,18,12);
export function hillMesh(h,mat){const m=new T.Mesh(geo,mat);m.position.set(h.x,h.y,h.z);m.scale.set(h.rx,h.ry,h.rz);m.rotation.y=(h.turn||0)*Math.PI/180;m.name='Backdrop hill';m.userData.hillId=h.id;m.receiveShadow=true;return m;}
// Where the hill meets level gy: n points around the ellipse (empty if it stays below gy).
export function hillOutline(h,gy,n=36){const k=1-((gy-h.y)/h.ry)**2;if(k<=0)return [];const s=Math.sqrt(k),a=(h.turn||0)*Math.PI/180,c=Math.cos(a),sn=Math.sin(a);
 return Array.from({length:n},(_,i)=>{const t=i/n*2*Math.PI,u=Math.cos(t)*h.rx*s,v=Math.sin(t)*h.rz*s;return [h.x+u*c+v*sn,h.z-u*sn+v*c];});}
// True when (x,z) lies inside the hill's footprint at level gy.
export function onHill(h,x,z,gy){const a=(h.turn||0)*Math.PI/180,c=Math.cos(a),s=Math.sin(a),dx=x-h.x,dz=z-h.z,u=(dx*c-dz*s)/h.rx,v=(dx*s+dz*c)/h.rz;return u*u+v*v<1-((gy-h.y)/h.ry)**2;}
