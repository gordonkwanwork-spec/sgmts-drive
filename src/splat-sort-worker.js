// Dedicated 12-bit L1-friendly counting sort worker for large 3D Gaussian splats.
const BUCKETS=4096,MAX_BUCKET=4095;
const count=new Uint32Array(BUCKETS);
let depth=new Float32Array(0),keys=new Uint16Array(0);
const datasets=new Map();

self.onmessage=({data:msg})=>{
 if(msg.type==='init'){
  datasets.set(msg.dataId,new Float32Array(msg.pos));
  return;
 }
 if(msg.type!=='sort')return;
 const {reqId,dataId,m,cx,cy,cz,fx,fy,fz}=msg;
 const pos=datasets.get(dataId);
 if(!pos||m<=0)return;
 if(depth.length<m){depth=new Float32Array(m);keys=new Uint16Array(m);}
 let lo=1e9,hi=-1e9;
 for(let i=0;i<m;i++){
  const o=i*3,d=(pos[o]-cx)*fx+(pos[o+1]-cy)*fy+(pos[o+2]-cz)*fz;
  depth[i]=d;if(d<lo)lo=d;if(d>hi)hi=d;
 }
 const k=MAX_BUCKET/Math.max(hi-lo,1e-6);
 count.fill(0);
 for(let i=0;i<m;i++){
  let q=MAX_BUCKET-(((depth[i]-lo)*k)|0);
  if(q<0)q=0;else if(q>MAX_BUCKET)q=MAX_BUCKET;
  keys[i]=q;count[q]++;
 }
 for(let i=1;i<BUCKETS;i++)count[i]+=count[i-1];
 const out=new Float32Array(m);
 for(let i=m-1;i>=0;i--)out[--count[keys[i]]]=i;
 self.postMessage({type:'sorted',reqId,m,order:out.buffer},[out.buffer]);
};
