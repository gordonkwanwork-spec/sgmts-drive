// Minimal static 3D Gaussian splat renderer for three 0.166 (Spark/other libraries need three >= r179).
// One object, SH0 colour only: data sit in float textures, one instanced quad per splat, back-to-front order re-sorted on the CPU
// (counting sort on 16-bit view depth) when the camera has moved. Draws in the normal pass: depth-tested against meshes, no depth write,
// tone mapping and output colour space applied by the renderer, so it also works inside the post-processing chain.
import * as T from 'three';

const W=1024,SH0=.28209479177387814,lin=c=>c<=.04045?c/12.92:Math.pow((c+.055)/1.055,2.4);

export async function loadSplatPLY(url){
 const buf=await (await fetch(url)).arrayBuffer(),head=new TextDecoder().decode(new Uint8Array(buf,0,Math.min(buf.byteLength,4096))),end=head.indexOf('end_header\n')+11;
 const props=[...head.slice(0,end).matchAll(/property float (\w+)/g)].map(m=>m[1]),n=+head.match(/element vertex (\d+)/)[1],stride=props.length,f=new Float32Array(buf.slice(end,end+n*stride*4)),ix=Object.fromEntries(props.map((p,i)=>[p,i]));
 const H=Math.ceil(n/W),tex=()=>new Float32Array(W*H*4),A=tex(),B=tex(),C=tex(),D=tex(),pos=new Float32Array(n*3);
 for(let i=0;i<n;i++){
  const o=i*stride,g=k=>f[o+ix[k]],x=g('x'),y=g('y'),z=g('z'),k=i*4;
  let qw=g('rot_0'),qx=g('rot_1'),qy=g('rot_2'),qz=g('rot_3');const ql=Math.hypot(qw,qx,qy,qz)||1;qw/=ql;qx/=ql;qy/=ql;qz/=ql;
  const s=[Math.exp(g('scale_0')),Math.exp(g('scale_1')),Math.exp(g('scale_2'))];
  // M = R * diag(s); covariance = M * M^T
  const R=[1-2*(qy*qy+qz*qz),2*(qx*qy-qw*qz),2*(qx*qz+qw*qy),2*(qx*qy+qw*qz),1-2*(qx*qx+qz*qz),2*(qy*qz-qw*qx),2*(qx*qz-qw*qy),2*(qy*qz+qw*qx),1-2*(qx*qx+qy*qy)];
  const M=R.map((v,j)=>v*s[j%3]),c=(r,t)=>M[r*3]*M[t*3]+M[r*3+1]*M[t*3+1]+M[r*3+2]*M[t*3+2];
  A[k]=x;A[k+1]=y;A[k+2]=z;A[k+3]=1/(1+Math.exp(-g('opacity')));
  B[k]=c(0,0);B[k+1]=c(0,1);B[k+2]=c(0,2);B[k+3]=c(1,1);C[k]=c(1,2);C[k+1]=c(2,2);
  for(let j=0;j<3;j++)D[k+j]=lin(Math.min(1,Math.max(0,.5+SH0*g('f_dc_'+j))));
  pos[i*3]=x;pos[i*3+1]=y;pos[i*3+2]=z;
 }
 return {n,H,pos,textures:[A,B,C,D]};
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
 mat3 Sig=mat3(b.x,b.y,b.z,b.y,b.w,c.x,b.z,c.x,c.y),S=Rv*Sig*transpose(Rv);
 float fx=projectionMatrix[0][0]*viewport.x*.5,fy=projectionMatrix[1][1]*viewport.y*.5,z=p.z;
 vec3 j0=vec3(fx/z,0.,-fx*p.x/(z*z)),j1=vec3(0.,fy/z,-fy*p.y/(z*z));
 float ca=dot(j0,S*j0)+.3,cb=dot(j0,S*j1),cd=dot(j1,S*j1)+.3;
 float mid=(ca+cd)*.5,rad=length(vec2((ca-cd)*.5,cb)),l1=mid+rad,l2=max(mid-rad,.1);
 vec2 dv=normalize(vec2(cb,l1-ca));
 vec2 major=min(sqrt(2.*l1),1024.)*dv,minor=min(sqrt(2.*l2),1024.)*vec2(dv.y,-dv.x);
 vec2 off=corner.x*major+corner.y*minor;
 vec2 ndc=clip.xy/clip.w+vec2(off.x,-off.y)*2./viewport;
 gl_Position=vec4(ndc,clip.z/clip.w,1.);
 vColor=vec4(d.rgb,a.w);vP=corner;
}`;
const fragment=`
uniform float dim;varying vec4 vColor;varying vec2 vP;
void main(){
 float A=-dot(vP,vP);if(A<-4.)discard;
 gl_FragColor=vec4(vColor.rgb*dim,exp(A)*vColor.a);

 #include <colorspace_fragment>
}`;

// data from loadSplatPLY. Returns a Mesh; set mesh.userData.dim (0..1.2) each frame to relight the baked colours.
export function createSplatMesh(data,{radius=1.5,center=new T.Vector3()}={}){
 const {n,H,pos,textures}=data,geo=new T.InstancedBufferGeometry();
 geo.setAttribute('position',new T.BufferAttribute(new Float32Array(12),3)); // unused, keeps three happy
 geo.setAttribute('corner',new T.BufferAttribute(new Float32Array([-2,-2,2,-2,2,2,-2,2]),2));
 geo.setIndex([0,1,2,0,2,3]);geo.instanceCount=n;
 const order=new T.InstancedBufferAttribute(new Float32Array(n),1);order.setUsage(T.DynamicDrawUsage);geo.setAttribute('order',order);
 for(let i=0;i<n;i++)order.array[i]=i;
 geo.boundingSphere=new T.Sphere(center.clone(),radius);
 const tx=textures.map(a=>{const t=new T.DataTexture(a,W,H,T.RGBAFormat,T.FloatType);t.minFilter=t.magFilter=T.NearestFilter;t.needsUpdate=true;return t;});
 const mat=new T.ShaderMaterial({vertexShader:vertex,fragmentShader:fragment,transparent:true,depthWrite:false,depthTest:true,side:T.DoubleSide,
  uniforms:{tA:{value:tx[0]},tB:{value:tx[1]},tC:{value:tx[2]},tD:{value:tx[3]},viewport:{value:new T.Vector2(1,1)},dim:{value:1}}});
 const mesh=new T.Mesh(geo,mat);mesh.frustumCulled=true;mesh.userData.dim=1;mesh.raycast=()=>{}; // never a collider; collision/shadow come from the hull proxies
 // Colours are baked-in daylight, so no tone-mapping chunk: they should read as captured. Output colour space is still applied.
 // CPU depth sort, only when the camera moved or turned relative to the splat.
 const keys=new Uint16Array(n),count=new Uint32Array(65536),out=order.array,inv=new T.Matrix4(),cam=new T.Vector3(),fwd=new T.Vector3(),size=new T.Vector2();
 let lastCam=new T.Vector3(1e9,0,0),lastFwd=new T.Vector3(),lastT=0;
 mesh.onBeforeRender=(renderer,scene,camera)=>{
  renderer.getDrawingBufferSize(size);mat.uniforms.viewport.value.copy(size);mat.uniforms.dim.value=mesh.userData.dim;
  inv.copy(mesh.matrixWorld).invert();cam.setFromMatrixPosition(camera.matrixWorld).applyMatrix4(inv);
  fwd.set(0,0,-1).transformDirection(camera.matrixWorld).transformDirection(inv);
  const now=performance.now();if(now-lastT<50||(cam.distanceTo(lastCam)<.04&&fwd.dot(lastFwd)>.9995))return;
  lastCam.copy(cam);lastFwd.copy(fwd);lastT=now;
  let lo=1e9,hi=-1e9;const dep=sortDepth;
  for(let i=0;i<n;i++){const d=(pos[i*3]-cam.x)*fwd.x+(pos[i*3+1]-cam.y)*fwd.y+(pos[i*3+2]-cam.z)*fwd.z;dep[i]=d;if(d<lo)lo=d;if(d>hi)hi=d;}
  const k=65535/Math.max(hi-lo,1e-6);count.fill(0);
  for(let i=0;i<n;i++){const q=65535-((dep[i]-lo)*k|0);keys[i]=q;count[q]++;} // far (large depth) first
  for(let i=1;i<65536;i++)count[i]+=count[i-1];
  for(let i=n-1;i>=0;i--)out[--count[keys[i]]]=i;
  order.needsUpdate=true;
 };
 const sortDepth=new Float32Array(n);
 return mesh;
}
