// Both endpoints belong to each block's bounds, including the shared point between adjacent blocks.
export function segmentBlocks(points){
 const blocks=[];
 for(let start=0;start<points.length-1;start+=32){
  const end=Math.min(start+32,points.length-1);
  let minX=Infinity,maxX=-Infinity,minZ=Infinity,maxZ=-Infinity;
  for(let i=start;i<=end;i++){
   const p=points[i];
   minX=Math.min(minX,p.x);maxX=Math.max(maxX,p.x);
   minZ=Math.min(minZ,p.z);maxZ=Math.max(maxZ,p.z);
  }
  blocks.push({start,end,minX,maxX,minZ,maxZ});
 }
 return blocks;
}

export function nearestSegment(points,blocks,x,z,sGuess){
 const hinted=Number.isFinite(sGuess),minS=sGuess-100,maxS=sGuess+100;
 let upper=Infinity;
 // The distance to any eligible route vertex is an upper bound on the nearest segment.
 for(const block of blocks){
  const p=points[block.start];
  if(hinted&&(p.s<minS||p.s>maxS))continue;
  upper=Math.min(upper,(x-p.x)**2+(z-p.z)**2);
 }
 let distanceSq=Infinity,index=-1,fraction=0;
 for(const block of blocks){
  if(hinted&&(points[block.end].s<minS||points[block.start].s>maxS))continue;
  const gapX=Math.max(block.minX-x,0,x-block.maxX),gapZ=Math.max(block.minZ-z,0,z-block.maxZ);
  if(gapX*gapX+gapZ*gapZ>upper+1e-9)continue;
  for(let i=block.start;i<block.end;i++){
   const a=points[i],b=points[i+1];
   if(hinted&&(b.s<minS||a.s>maxS))continue;
   const dx=b.x-a.x,dz=b.z-a.z;
   const t=Math.max(0,Math.min(1,((x-a.x)*dx+(z-a.z)*dz)/(dx*dx+dz*dz||1)));
   const d=(x-a.x-t*dx)**2+(z-a.z-t*dz)**2;
   if(d<distanceSq){distanceSq=d;upper=d;index=i;fraction=t;}
  }
 }
 return {index,fraction,distanceSq};
}
