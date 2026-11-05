// Sandbox K1 profile swept along the actual street edge. Taller stones retain the
// 25 mm / 100 mm battered face; only their buried stem grows at station approaches.
import * as T from 'three';
import {k1Profile} from './sandbox/kerbs.js';
export {k1Profile};
export function sweptKerbs(length,point,{step=1}={}){
 const profile=k1Profile(),n=profile.length,buffers=[{pos:[],idx:[]},{pos:[],idx:[]}];
 function piece(a,b,joint){if(b<=a)return;const out=buffers[joint?1:0],base=out.pos.length/3,N=Math.max(1,Math.ceil((b-a)/step));
  for(let i=0;i<=N;i++){const p=point(a+(b-a)*i/N);for(const [d,y] of profile){const top=p.y-(joint?.003:0),bottom=Math.min(top+y,(p.base??top-.15)-.1);out.pos.push(p.x+p.nx*d,y===-.25?bottom:top+y,p.z+p.nz*d);}}
  for(let k=0;k<N;k++)for(let i=0;i<n;i++){const a=base+k*n+i,b=base+k*n+(i+1)%n;out.idx.push(a,b,a+n,b,b+n,a+n);}
  for(let i=1;i<n-1;i++)out.idx.push(base,base+i+1,base+i,base+N*n,base+N*n+i,base+N*n+i+1);
 }
 for(let a=0;a<length-.001;a+=1){const b=Math.min(a+1,length);piece(a,Math.max(a,b-.008),false);piece(Math.max(a,b-.008),b,true);}
 return buffers.map(({pos,idx})=>{const g=new T.BufferGeometry();g.setAttribute('position',new T.Float32BufferAttribute(pos,3));g.setIndex(idx);g.computeVertexNormals();return g;});
}
