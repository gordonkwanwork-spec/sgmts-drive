import {sample,roadSection} from '../alignment.js';
// The shared junction keeps its cross-road frame at the mouth, but meets the
// actual curved/tapering corridor at each approach, including the outer footpath.
export function junctionPoint(j,x,y,z){
 const r=sample(j.s),w=roadSection(j.s).right;
 const t=Math.max(0,Math.min(1,(Math.abs(z)-j.halfWidth)/6))*Math.max(0,Math.min(1,(w+6-Math.abs(x))/2.25));
 if(!t)return {x,y,z};
 const q=sample(j.s-z),edge=roadSection(j.s-z).right;
 const across=Math.abs(x)<=w?x*edge/w:x+Math.sign(x)*(edge-w);
 const wx=q.x-q.lx*across-r.x,wz=q.z-q.lz*across-r.z;
 const xx=-(wx*r.lx+wz*r.lz),zz=-(wx*r.tx+wz*r.tz);
 return {x:x+(xx-x)*t,y:y+(q.y-r.y+r.grade*z)*t,z:z+(zz-z)*t};
}
export function junctionUnproject(j,x,z){
 let a=x,b=z;for(let i=0;i<12;i++){const p=junctionPoint(j,a,0,b),dx=x-p.x,dz=z-p.z;a+=dx;b+=dz;if(Math.hypot(dx,dz)<1e-7)break;}
 return {x:a,z:b};
}
