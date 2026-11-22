// The street sandbox offsets two 3.2 m crossings by a full crossing width between their stud rows.
// Keep the outgoing crossing at the kerb return and set the incoming crossing farther back.
export const staggerDistance=median=>median>=3?6.4:0;
export function staggeredCrossing(incoming,side,outward,median){
 const outgoing=incoming-outward*staggerDistance(median),half=median/2;
 const centre=s=>s===side?incoming:outgoing;
 const lo=Math.min(incoming,outgoing)-2.15,hi=Math.max(incoming,outgoing)+2.15;
 // The two opposing L-shaped guardrails connect the blocked edge to the end return.
 const rails=[-1,1].map(s=>{
  const z=s*(half-.22),c=centre(s),other=centre(-s),dir=Math.sign(other-c),end=dir>0?hi:lo;
  return [[c+dir*2.15,z],[end,z],[end,-z]];
 });
 return {incoming,outgoing,centre,lo,hi,half,rails};
}

// Protect the closed edges with K1 kerbs. The full 3.2 m striped opening on either side stays flush.
export function staggerKerbs(pen,point,kerb){
 const edge=(d,l,dd,dl,nd,nl,length)=>kerb(length,t=>{
  const p=point(d+dd*t,l+dl*t),q=point(d+dd*t+nd,l+dl*t+nl);
  const dx=q.x-p.x,dz=q.z-p.z,n=Math.hypot(dx,dz);
  return {x:p.x,z:p.z,nx:dx/n,nz:dz/n,y:p.y+.12,base:p.y};
 });
 for(const side of [-1,1]){
  const c=pen.centre(side),dir=Math.sign(pen.centre(-side)-c),start=c+dir*1.85,end=dir>0?pen.hi:pen.lo;
  edge(start,side*pen.half,dir,0,0,-side,Math.abs(end-start));
 }
 for(const [d,inward] of [[pen.lo,1],[pen.hi,-1]])edge(d,-pen.half,0,1,inward,0,2*pen.half);
}
