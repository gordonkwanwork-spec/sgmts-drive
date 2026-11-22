// Minimal static 3D Gaussian splat renderer for three 0.166 (Spark/other libraries need three >= r179).
// One object, SH0 colour only: compact GPU textures (A f32 pos+alpha, B/C f16 covariance, D u8 sRGB), one instanced quad per splat,
// back-to-front order re-sorted via 12-bit L1 counting sort (offloaded to a Web Worker for large clouds when moving).
import * as T from 'three';

const W=1024,SH0=.28209479177387814,COV_SCALE=1024,BUCKETS=4096,MAX_BUCKET=4095;
const toHalf=T.DataUtils.toHalfFloat;
const halfFloat=h=>{const e=(h>>10)&31,m=h&1023,v=e===0?m*5.960464477539063e-8:e===31?(m?NaN:Infinity):(1+m/1024)*2**(e-15);return h&32768?-v:v;};
const packHalf=v=>toHalf(v>65504?65504:v<-65504?-65504:v);

// Module-shared synchronous sort scratch (avoid per-mesh 256 KB count + depth/key allocations).
const syncCount=new Uint32Array(BUCKETS);
let syncDepth=new Float32Array(0),syncKeys=new Uint16Array(0);
function sortSync(pos,m,cx,cy,cz,fwd,out){
 if(syncDepth.length<m){syncDepth=new Float32Array(m);syncKeys=new Uint16Array(m);}
 const fx=fwd.x,fy=fwd.y,fz=fwd.z;
 let lo=1e9,hi=-1e9;
 for(let i=0;i<m;i++){
  const o=i*3,d=(pos[o]-cx)*fx+(pos[o+1]-cy)*fy+(pos[o+2]-cz)*fz;
  syncDepth[i]=d;if(d<lo)lo=d;if(d>hi)hi=d;
 }
 const k=MAX_BUCKET/Math.max(hi-lo,1e-6);
 syncCount.fill(0);
 for(let i=0;i<m;i++){
  let q=MAX_BUCKET-(((syncDepth[i]-lo)*k)|0);
  if(q<0)q=0;else if(q>MAX_BUCKET)q=MAX_BUCKET;
  syncKeys[i]=q;syncCount[q]++;
 }
 for(let i=1;i<BUCKETS;i++)syncCount[i]+=syncCount[i-1];
 for(let i=m-1;i>=0;i--)out[--syncCount[syncKeys[i]]]=i;
}

// Optional Web Worker async sorter for camera-move updates on large clouds (> 12k splats).
let worker=null,nextDataId=1,nextReqId=1;
const workerCallbacks=new Map();
function getWorker(){
 if(worker!==null)return worker||null;
 if(typeof Worker==='undefined')return worker=false,null;
 try{
  const w=new Worker(new URL('./splat-sort-worker.js',import.meta.url),{type:'module'});
  w.onmessage=({data:msg})=>{
   if(msg.type!=='sorted')return;
   const cb=workerCallbacks.get(msg.reqId);
   if(cb){workerCallbacks.delete(msg.reqId);cb(msg.m,new Float32Array(msg.order));}
  };
  w.onerror=()=>{worker=false;};
  return worker=w;
 }catch{return worker=false,null;}
}

// Write covariance * COV_SCALE into half-float B/C textures without per-splat array or closure allocations.
function encodeCovariance(B,C,k,sx,sy,sz,qw,qx,qy,qz){
 const ql=Math.hypot(qw,qx,qy,qz)||1;
 qw/=ql;qx/=ql;qy/=ql;qz/=ql;
 const xx=qx*qx,yy=qy*qy,zz=qz*qz,xy=qx*qy,xz=qx*qz,yz=qy*qz,wx=qw*qx,wy=qw*qy,wz=qw*qz;
 const m00=(1-2*(yy+zz))*sx,m01=(2*(xy-wz))*sy,m02=(2*(xz+wy))*sz;
 const m10=(2*(xy+wz))*sx,m11=(1-2*(xx+zz))*sy,m12=(2*(yz-wx))*sz;
 const m20=(2*(xz-wy))*sx,m21=(2*(yz+wx))*sy,m22=(1-2*(xx+yy))*sz;
 B[k]=packHalf((m00*m00+m01*m01+m02*m02)*COV_SCALE);
 B[k+1]=packHalf((m00*m10+m01*m11+m02*m12)*COV_SCALE);
 B[k+2]=packHalf((m00*m20+m01*m21+m02*m22)*COV_SCALE);
 B[k+3]=packHalf((m10*m10+m11*m11+m12*m12)*COV_SCALE);
 C[k]=packHalf((m10*m20+m11*m21+m12*m22)*COV_SCALE);
 C[k+1]=packHalf((m20*m20+m21*m21+m22*m22)*COV_SCALE);
}

function finishPacked({n,pos,h16,rgba,q8,ordered=false}){
 const H=Math.ceil(n/W),texelCount=W*H*4;
 const A=new Float32Array(texelCount),B=new Uint16Array(texelCount),C=new Uint16Array(texelCount),D=new Uint8Array(texelCount);
 D.set(rgba);
 const inv127=1/127,inv255=1/255;
 for(let i=0;i<n;i++){
  const k=i*4,p=i*3;
  A[k]=pos[p];A[k+1]=pos[p+1];A[k+2]=pos[p+2];A[k+3]=rgba[k+3]*inv255;
  encodeCovariance(B,C,k,halfFloat(h16[p]),halfFloat(h16[p+1]),halfFloat(h16[p+2]),q8[k]*inv127,q8[k+1]*inv127,q8[k+2]*inv127,q8[k+3]*inv127);
 }
 return {n,H,pos,textures:[A,B,C,D],gpu:null,ordered};
}

export async function loadSplatPLY(url){
 const buf=await (await fetch(url)).arrayBuffer(),head=new TextDecoder().decode(new Uint8Array(buf,0,Math.min(buf.byteLength,4096))),end=head.indexOf('end_header\n')+11;
 const props=[...head.slice(0,end).matchAll(/property float (\w+)/g)].map(m=>m[1]),n=+head.match(/element vertex (\d+)/)[1],stride=props.length;
 const slice=(end&3)===0?new Float32Array(buf,end,n*stride):new Float32Array(buf.slice(end,end+n*stride*4));
 const ix=Object.fromEntries(props.map((p,i)=>[p,i]));
 const ixX=ix.x,ixY=ix.y,ixZ=ix.z,ixS0=ix.scale_0,ixS1=ix.scale_1,ixS2=ix.scale_2;
 const ixR0=ix.rot_0,ixR1=ix.rot_1,ixR2=ix.rot_2,ixR3=ix.rot_3,ixC0=ix.f_dc_0,ixC1=ix.f_dc_1,ixC2=ix.f_dc_2,ixOp=ix.opacity;
 const pos=new Float32Array(n*3),H=Math.ceil(n/W),texelCount=W*H*4;
 const A=new Float32Array(texelCount),B=new Uint16Array(texelCount),C=new Uint16Array(texelCount),D=new Uint8Array(texelCount);
 for(let i=0;i<n;i++){
  const o=i*stride,k=i*4,p=i*3;
  const x=slice[o+ixX],y=slice[o+ixY],z=slice[o+ixZ],alpha=1/(1+Math.exp(-slice[o+ixOp]));
  pos[p]=x;pos[p+1]=y;pos[p+2]=z;
  A[k]=x;A[k+1]=y;A[k+2]=z;A[k+3]=alpha;
  encodeCovariance(B,C,k,Math.exp(slice[o+ixS0]),Math.exp(slice[o+ixS1]),Math.exp(slice[o+ixS2]),slice[o+ixR0],slice[o+ixR1],slice[o+ixR2],slice[o+ixR3]);
  D[k]=Math.round(Math.min(1,Math.max(0,.5+SH0*slice[o+ixC0]))*255);
  D[k+1]=Math.round(Math.min(1,Math.max(0,.5+SH0*slice[o+ixC1]))*255);
  D[k+2]=Math.round(Math.min(1,Math.max(0,.5+SH0*slice[o+ixC2]))*255);
  D[k+3]=Math.round(alpha*255);
 }
 return {n,H,pos,textures:[A,B,C,D],gpu:null,ordered:false};
}

// Packed .gsplat (scripts/gsplat_pack.py): 16 B header 'GSP1',u32 n, then planar blocks pos f32x3 | scale f16x3 (linear) | rgba u8 (display colour, opacity) | quat i8x4 (w,x,y,z)/127.
export async function loadSplat(url){
 if(!url.endsWith('.gsplat'))return loadSplatPLY(url);
 const buf=await (await fetch(url)).arrayBuffer(),dv=new DataView(buf);
 if(dv.getUint32(0)!==0x47535031)throw Error('not a GSP1 splat file: '+url);
 const n=dv.getUint32(4,true);
 // Copy pos into its own compact Float32Array so the fetched ArrayBuffer can be garbage-collected right after decoding.
 const pos=new Float32Array(buf.slice(16,16+12*n)),h16=new Uint16Array(buf,16+12*n,3*n),rgba=new Uint8Array(buf,16+18*n,4*n),q8=new Int8Array(buf,16+22*n,4*n);
 return finishPacked({n,pos,h16,rgba,q8,ordered:!!(dv.getUint8(8)&1)});
}

const vertex=`
uniform sampler2D tA,tB,tC,tD;uniform vec2 viewport;
attribute float order;attribute vec2 corner;
varying vec4 vColor;varying vec2 vP;
void main(){
 int i=int(order);ivec2 t=ivec2(i&${W-1},i>>10);
 vec4 a=texelFetch(tA,t,0),b=texelFetch(tB,t,0),c=texelFetch(tC,t,0),d=texelFetch(tD,t,0);
 vec4 mv=modelViewMatrix*vec4(a.xyz,1.);vec4 clip=projectionMatrix*mv;
 if(clip.w<=.0||a.w<.004){gl_Position=vec4(0.,0.,2.,1.);return;}
 // camera frame with +z forward and y down (3DGS convention): p=(x,-y,-z)
 vec3 p=vec3(mv.x,-mv.y,-mv.z);
 mat3 Rv=mat3(1.,0.,0.,0.,-1.,0.,0.,0.,-1.)*mat3(modelViewMatrix);
 mat3 Sig=mat3(b.x,b.y,b.z,b.y,b.w,c.x,b.z,c.x,c.y)*(1.0/${COV_SCALE.toFixed(1)}),S=Rv*Sig*transpose(Rv);
 float fx=projectionMatrix[0][0]*viewport.x*.5,fy=projectionMatrix[1][1]*viewport.y*.5,z=p.z;
 vec3 j0=vec3(fx/z,0.,-fx*p.x/(z*z)),j1=vec3(0.,fy/z,-fy*p.y/(z*z));
 float ca=dot(j0,S*j0)+.3,cb=dot(j0,S*j1),cd=dot(j1,S*j1)+.3;
 float mid=(ca+cd)*.5,rad=length(vec2((ca-cd)*.5,cb)),l1=mid+rad,l2=max(mid-rad,.1);
 vec2 dv=normalize(vec2(cb,l1-ca));
 vec2 major=min(sqrt(2.*l1),1024.)*dv,minor=min(sqrt(2.*l2),1024.)*vec2(dv.y,-dv.x);
 vec2 off=corner.x*major+corner.y*minor;
 vec2 ndc=clip.xy/clip.w+vec2(off.x,-off.y)*2./viewport;
 gl_Position=vec4(ndc,clip.z/clip.w,1.);
 vec3 linRgb=mix(d.rgb/12.92,pow((d.rgb+.055)/1.055,vec3(2.4)),step(vec3(.04045),d.rgb));
 vColor=vec4(linRgb,a.w);vP=corner;
}`;
const fragment=`
uniform float dim,opacity;varying vec4 vColor;varying vec2 vP;
void main(){
 float A=-dot(vP,vP);if(A<-4.)discard;
 gl_FragColor=vec4(vColor.rgb*dim,exp(A)*vColor.a*opacity);

 #include <colorspace_fragment>
}`;

const liveSplats=new Set(),hiddenForFeed=[];
export function setSplatsVisibleForFeed(hide){
 if(hide){
  hiddenForFeed.length=0;
  for(const ref of liveSplats){
   const m=ref.deref();
   if(!m){liveSplats.delete(ref);continue;}
   if(m.visible){m.visible=false;hiddenForFeed.push(m);}
  }
 }else{
  while(hiddenForFeed.length)hiddenForFeed.pop().visible=true;
 }
}

function makeGPUTextures(data){
 const [A,B,C,D]=data.textures,H=data.H;
 const specs=[[A,T.FloatType],[B,T.HalfFloatType],[C,T.HalfFloatType],[D,T.UnsignedByteType]];
 return specs.map(([arr,type])=>{
  const t=new T.DataTexture(arr,W,H,T.RGBAFormat,type);
  t.minFilter=t.magFilter=T.NearestFilter;t.generateMipmaps=false;t.needsUpdate=true;
  return t;
 });
}

// data from loadSplat / loadSplatPLY. Returns a Mesh; set mesh.userData.dim (0..1.2) each frame to relight the baked colours.
// lod: [[maxDistance m, fraction of splats drawn]...]; only for files flagged most-important-first.
export function createSplatMesh(data,{radius=1.5,center=new T.Vector3(),lod=data.ordered?[[14,1],[32,.45],[75,.2],[1e9,.1]]:[[1e9,1]]}={}){
 const {n,pos}=data,geo=new T.InstancedBufferGeometry();
 geo.setAttribute('position',new T.BufferAttribute(new Float32Array(12),3)); // unused, keeps three happy
 geo.setAttribute('corner',new T.BufferAttribute(new Float32Array([-2,-2,2,-2,2,2,-2,2]),2));
 geo.setIndex([0,1,2,0,2,3]);geo.instanceCount=n;
 const order=new T.InstancedBufferAttribute(new Float32Array(n),1);order.setUsage(T.DynamicDrawUsage);geo.setAttribute('order',order);
 for(let i=0;i<n;i++)order.array[i]=i;
 geo.boundingSphere=new T.Sphere(center.clone(),radius);
 const tx=data.gpu??=makeGPUTextures(data); // shared by every copy of the same capture
 const mat=new T.ShaderMaterial({vertexShader:vertex,fragmentShader:fragment,transparent:true,depthWrite:false,depthTest:true,side:T.DoubleSide,
  uniforms:{tA:{value:tx[0]},tB:{value:tx[1]},tC:{value:tx[2]},tD:{value:tx[3]},viewport:{value:new T.Vector2(1,1)},dim:{value:1},opacity:{value:1}}});
 const mesh=new T.Mesh(geo,mat);mesh.frustumCulled=true;mesh.userData.dim=1;mesh.raycast=()=>{}; // never a collider; collision/shadow come from the hull proxies
 const ref=new WeakRef(mesh);liveSplats.add(ref);
 mesh.addEventListener?.('removed',()=>liveSplats.delete(ref));

 const out=order.array,inv=new T.Matrix4(),cam=new T.Vector3(),fwd=new T.Vector3(),size=new T.Vector2();
 const lastCam=new T.Vector3(1e9,0,0),lastFwd=new T.Vector3(),here=new T.Vector3();
 let lastT=0,sortedM=0,wantM=n,wasM=0,sortedOnce=false,pendingReq=0;

 mesh.onBeforeRender=(renderer,scene,camera)=>{
  if(!camera.isPerspectiveCamera||camera.userData?.isFeed)return;
  renderer.getDrawingBufferSize(size);mat.uniforms.viewport.value.copy(size);mat.uniforms.dim.value=mesh.userData.dim;
  const dist=camera.position.distanceTo(mesh.getWorldPosition(here));
  wantM=Math.ceil(n*lod.find(l=>dist<l[0])[1]);
  inv.copy(mesh.matrixWorld).invert();cam.setFromMatrixPosition(camera.matrixWorld).applyMatrix4(inv);
  fwd.set(0,0,-1).transformDirection(camera.matrixWorld).transformDirection(inv);
  const now=performance.now();
  if(sortedOnce&&wantM===wasM&&(now-lastT<50||(cam.distanceTo(lastCam)<.04&&fwd.dot(lastFwd)>.9995))){
   geo.instanceCount=sortedM;return;
  }
  wasM=wantM;lastCam.copy(cam);lastFwd.copy(fwd);lastT=now;
  const w=sortedOnce&&wantM>12000?getWorker():null;
  if(!w){
   sortSync(pos,wantM,cam.x,cam.y,cam.z,fwd,out);
   sortedOnce=true;sortedM=wantM;geo.instanceCount=wantM;
   order.clearUpdateRanges();order.addUpdateRange(0,wantM);order.needsUpdate=true;
   return;
  }
  geo.instanceCount=sortedM||wantM;
  if(pendingReq)return;
  if(!data.workerId){const copy=pos.slice();data.workerId=nextDataId++;w.postMessage({type:'init',dataId:data.workerId,pos:copy.buffer},[copy.buffer]);}
  const reqId=nextReqId++;pendingReq=reqId;
  workerCallbacks.set(reqId,(replyM,replyOrder)=>{
   pendingReq=0;
   out.set(replyOrder.subarray(0,replyM));
   sortedM=replyM;geo.instanceCount=replyM;
   order.clearUpdateRanges();order.addUpdateRange(0,replyM);order.needsUpdate=true;
  });
  w.postMessage({type:'sort',reqId,dataId:data.workerId,m:wantM,cx:cam.x,cy:cam.y,cz:cam.z,fx:fwd.x,fy:fwd.y,fz:fwd.z});
 };
 return mesh;
}
