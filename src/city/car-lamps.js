import * as T from 'three';
// Surface lamps: the glow is painted onto the vehicle's own baked texture, so lit lamps follow the lamp graphics exactly
// (no boxes floating over the bodywork). At load a small UV-space mask is built per textured material:
//   R = tail / brake, G = headlamp, B = reverse.
// A texel is lit when its point on the body falls inside a zone of the vehicle's `lampMask` rules and, optionally, its
// baked colour passes a key (`red` = the tail-lamp red, `light` = pale lens). The body shader then adds
// level × mask × lamp colour to its emissive term, with the levels driven by updateVehicleLights through `handles`.
//
// Rules (vehicle frame: metres, +Z forward, y up, x mirrored so one zone covers both sides):
//   {tail:[zone], head:[zone], reverse:[zone], gain?:{tail,head,reverse}}
//   zone = {box:{x:[lo,hi] (|x|), y:[lo,hi], z:[lo,hi]}, face?:'front'|'rear'|'side', poly?:[[a,b],…], key?:'red'|'light'|'dark'|'grey', feather?:m}
//   face picks triangles by their normal; poly is an outline in the face's view plane: (|x|, y) for front/rear, (z, y) for side;
//   feather fades the glow over that many metres inside the box edges (for a zone cut out of a larger lamp graphic).
const smooth=(a,b,x)=>{const t=Math.min(1,Math.max(0,(x-a)/(b-a)));return t*t*(3-2*t);};
// Keys: red = lamp red; light = pale, unsaturated lens (not yellow or pastel paint); dark = dark lens on pale paint; grey = mid-grey lens.
const chroma=(r,g,b)=>Math.max(r,g,b)-Math.min(r,g,b),grey=(r,g,b)=>1-smooth(.18,.32,chroma(r,g,b));
export const LAMP_KEYS={red:(r,g,b)=>smooth(.07,.2,r-Math.max(g,b)),light:(r,g,b)=>smooth(.45,.6,(r+g+b)/3)*grey(r,g,b),
 dark:(r,g,b)=>1-smooth(.28,.42,(r+g+b)/3),grey:(r,g,b)=>smooth(.25,.38,(r+g+b)/3)*grey(r,g,b)};
export const LAMP_CHANNELS=['tail','head','reverse'];
export function inPoly(a,b,poly){let inside=false;for(let i=0,j=poly.length-1;i<poly.length;j=i++){const [ai,bi]=poly[i],[aj,bj]=poly[j];if((bi>b)!==(bj>b)&&a<(aj-ai)*(b-bi)/(bj-bi)+ai)inside=!inside;}return inside;}
const inRange=(v,r)=>!r||(v>=r[0]&&v<=r[1]);
export function facing(n){const ax=Math.abs(n[0]),az=Math.abs(n[2]);return ax>=az?'side':n[2]>0?'front':'rear';}
// Does point p (with surface normal n) belong to this zone? (Colour key aside.)
export function inZone(zone,p,n){
 const x=Math.abs(p[0]),b=zone.box;if(b&&!(inRange(x,b.x)&&inRange(p[1],b.y)&&inRange(p[2],b.z)))return false;
 if(zone.face&&zone.face!==facing(n))return false;
 return !zone.poly||(zone.face==='side'?inPoly(p[2],p[1],zone.poly):inPoly(x,p[1],zone.poly));
}
export function zoneFeather(zone,p){
 const f=zone.feather,b=zone.box;if(!f||!b)return 1;const v=[Math.abs(p[0]),p[1],p[2]];let w=1;
 ['x','y','z'].forEach((k,i)=>{if(b[k])w*=smooth(0,f,Math.min(v[i]-b[k][0],b[k][1]-v[i]));});return w;
}
// Paint the mask for one material. tris: {pos(i)→[x,y,z] vehicle frame, nrm(i)→[x,y,z], uv(i)→[u,v], count, index(t,k)}
// sample(u,v)→[r,g,b] 0..1 from the material's baked map. Returns {data (RGBA bytes), lit:{tail,head,reverse} texel counts}.
export function paintLampMask(tris,sample,rules,size){
 const data=new Uint8Array(size*size*4),lit={tail:0,head:0,reverse:0};for(let i=3;i<data.length;i+=4)data[i]=255;
 const zones=LAMP_CHANNELS.flatMap((c,ch)=>(rules[c]??[]).map(z=>({...z,ch,c})));if(!zones.length)return {data,lit};
 // Cheap reject: the triangle's bounds (|x| folded) must reach the zone box.
 const near=(z,lo,hi)=>{const b=z.box,m=.02;if(!b)return true;const xl=lo[0]<=0&&hi[0]>=0?0:Math.min(Math.abs(lo[0]),Math.abs(hi[0])),xh=Math.max(Math.abs(lo[0]),Math.abs(hi[0]));
  const hit=(l,h,r)=>!r||(h>=r[0]-m&&l<=r[1]+m);return hit(xl,xh,b.x)&&hit(lo[1],hi[1],b.y)&&hit(lo[2],hi[2],b.z);};
 const P=[0,0,0].map(()=>[0,0,0]),N=[0,0,0],U=[[0,0],[0,0],[0,0]],p=[0,0,0];
 for(let t=0;t<tris.count;t++){
  for(let k=0;k<3;k++){const i=tris.index(t,k);P[k]=tris.pos(i);U[k]=tris.uv(i);}
  const lo=[0,1,2].map(a=>Math.min(P[0][a],P[1][a],P[2][a])),hi=[0,1,2].map(a=>Math.max(P[0][a],P[1][a],P[2][a]));
  const cand=zones.filter(z=>near(z,lo,hi));if(!cand.length)continue;
  // Normal: mean of the vertex normals when present (Tripo winding is unreliable), else the face normal.
  N[0]=N[1]=N[2]=0;if(tris.nrm){for(let k=0;k<3;k++){const n=tris.nrm(tris.index(t,k));N[0]+=n[0];N[1]+=n[1];N[2]+=n[2];}}
  else{const a=P[1].map((v,j)=>v-P[0][j]),b=P[2].map((v,j)=>v-P[0][j]);N[0]=a[1]*b[2]-a[2]*b[1];N[1]=a[2]*b[0]-a[0]*b[2];N[2]=a[0]*b[1]-a[1]*b[0];}
  // Rasterise the triangle in texel space (conservatively: texels within ~1 texel of it, so seams don't drop out).
  const tx=U.map(([u,v])=>[u*size-.5,v*size-.5]),d=(tx[1][1]-tx[2][1])*(tx[0][0]-tx[2][0])+(tx[2][0]-tx[1][0])*(tx[0][1]-tx[2][1]);if(Math.abs(d)<1e-12)continue;
  const edge=Math.max(...[0,1,2].map(k=>Math.hypot(tx[k][0]-tx[(k+1)%3][0],tx[k][1]-tx[(k+1)%3][1]))),tol=Math.min(.5,.75/Math.max(edge,1e-6));
  const x0=Math.max(0,Math.floor(Math.min(tx[0][0],tx[1][0],tx[2][0])-1)),x1=Math.min(size-1,Math.ceil(Math.max(tx[0][0],tx[1][0],tx[2][0])+1));
  const y0=Math.max(0,Math.floor(Math.min(tx[0][1],tx[1][1],tx[2][1])-1)),y1=Math.min(size-1,Math.ceil(Math.max(tx[0][1],tx[1][1],tx[2][1])+1));
  for(let y=y0;y<=y1;y++)for(let x=x0;x<=x1;x++){
   let w0=((tx[1][1]-tx[2][1])*(x-tx[2][0])+(tx[2][0]-tx[1][0])*(y-tx[2][1]))/d,w1=((tx[2][1]-tx[0][1])*(x-tx[2][0])+(tx[0][0]-tx[2][0])*(y-tx[2][1]))/d,w2=1-w0-w1;
   if(w0<-tol||w1<-tol||w2<-tol)continue;w0=Math.max(0,w0);w1=Math.max(0,w1);w2=Math.max(0,w2);const s=w0+w1+w2;w0/=s;w1/=s;w2/=s;
   for(let a=0;a<3;a++)p[a]=P[0][a]*w0+P[1][a]*w1+P[2][a]*w2;
   const o=(y*size+x)*4;let rgb=null;
   for(const z of cand){if(!inZone(z,p,N))continue;let v=zoneFeather(z,p);if(v>0&&z.key){rgb??=sample((x+.5)/size,(y+.5)/size);v*=LAMP_KEYS[z.key](...rgb);}
    const byte=Math.round(v*255);if(byte>data[o+z.ch]){if(!data[o+z.ch]&&byte>127)lit[z.c]++;data[o+z.ch]=byte;}}
  }
 }
 return {data,lit};
}
// Read a texture image's pixels (browser only); returns sample(u,v) → [r,g,b] (glTF UVs: v down from the top, flipY false).
function sampler(image,flipY){
 if(typeof document==='undefined'||!image?.width)return null;
 const c=document.createElement('canvas');c.width=image.width;c.height=image.height;const g=c.getContext('2d',{willReadFrequently:true});if(!g)return null;g.drawImage(image,0,0);
 const px=g?.getImageData?.(0,0,c.width,c.height)?.data,W=c.width,H=c.height;if(px?.length!==W*H*4)return null;
 return (u,v)=>{const x=Math.min(W-1,Math.max(0,Math.floor(u*W))),y=Math.min(H-1,Math.max(0,Math.floor((flipY?1-v:v)*H))),o=(y*W+x)*4;return [px[o]/255,px[o+1]/255,px[o+2]/255];};
}
// Deep reds: ACES pushes bright red towards orange, so tail ≈ 0.6 and brake ≈ 2 in linear units (updateVehicleLights levels 1.5 / 5).
const FRAG=`#include <emissivemap_fragment>
 { vec3 lm=texture2D(lampMask,vMapUv).rgb;float lum=dot(diffuseColor.rgb,vec3(.3,.59,.11));
   totalEmissiveRadiance+=lampTail*.4*lm.r*vec3(1.,.03,.012)*(.4+1.2*diffuseColor.r)+lampHead*.2*lm.g*vec3(1.,.96,.88)*(.15+1.8*lum)+lampReverse*.35*lm.b*vec3(.95,.97,1.); }`;
// Hook the mask into a lit material's shader; levels = {tail,head,reverse} uniforms shared by the whole vehicle.
export function useLampMask(material,mask,levels){
 material.lensMask=mask;
 material.onBeforeCompile=shader=>{Object.assign(shader.uniforms,{lampMask:{value:mask},lampTail:levels.tail,lampHead:levels.head,lampReverse:levels.reverse});
  shader.fragmentShader='uniform sampler2D lampMask;uniform float lampTail,lampHead,lampReverse;\n'+shader.fragmentShader.replace('#include <emissivemap_fragment>',FRAG);};
 material.customProgramCacheKey=()=>'vehicle-lamps';material.needsUpdate=true;
}
// Level handles look like the old lamp materials to updateVehicleLights (emissiveIntensity in, always "visible").
// gain {tail,head,reverse} brightens one vehicle's lamps (e.g. a dark-red lens on red paint) without changing the levels callers set.
export function lampHandles(levels,gain={}){
 const handle=(u,k,name)=>{const g=gain[k]??1;return {name,userData:{surfaceLamp:true},visible:true,get emissiveIntensity(){return u.value/g;},set emissiveIntensity(v){u.value=v*g;}};};
 return {front:[handle(levels.head,'head','Headlamps (surface)')],rear:[handle(levels.tail,'tail','Tail and brake lamps (surface)')],reverse:[handle(levels.reverse,'reverse','Reverse lamps (surface)')]};
}
// Paint lamps onto every textured mesh of a built vehicle (root: vehicle frame, +Z forward). Returns lamp handles for
// the driving and traffic light controls, or null if the vehicle has no readable lens texture.
const NO_PIXELS=new Error('texture pixels unavailable');
export function paintVehicleLamps(root,rules,options){try{return paint(root,rules,options);}catch(e){if(e===NO_PIXELS)return null;throw e;}}
function paint(root,rules,{maxSize=1024,forward=1}={}){
 if(!rules||typeof document==='undefined')return null;root.updateMatrixWorld(true);const inv=root.matrixWorld.clone().invert(),byMaterial=new Map();
 if(forward<0)inv.premultiply(new T.Matrix4().makeRotationY(Math.PI));
 root.traverse(o=>{if(!o.isMesh||!o.material?.isMeshStandardMaterial||!o.material.map?.image||!o.geometry.attributes.uv)return;(byMaterial.get(o.material)??byMaterial.set(o.material,[]).get(o.material)).push(o);});
 const levels={tail:{value:0},head:{value:0},reverse:{value:0}},v=new T.Vector3(),total={tail:0,head:0,reverse:0};let painted=0;
 for(const [material,meshes] of byMaterial){
  const map=material.map,img=map.image,size=Math.min(maxSize,Math.max(256,T.MathUtils.floorPowerOfTwo(Math.max(img.width,img.height)/2)));let sample=null,data=null;   /* the map's pixels are read only if a keyed zone needs them */
  for(const mesh of meshes){const g=mesh.geometry,pos=g.attributes.position,nrm=g.attributes.normal,uv=g.attributes.uv,m=new T.Matrix4().multiplyMatrices(inv,mesh.matrixWorld),nm=new T.Matrix3().getNormalMatrix(m),n=new T.Vector3();
   const idx=g.index?.array,tris={count:(idx?idx.length:pos.count)/3,index:idx?(t,k)=>idx[t*3+k]:(t,k)=>t*3+k,pos:i=>v.fromBufferAttribute(pos,i).applyMatrix4(m).toArray(),uv:i=>[uv.getX(i),uv.getY(i)],nrm:nrm?i=>n.fromBufferAttribute(nrm,i).applyMatrix3(nm).toArray():null};
   const r=paintLampMask(tris,(u,w)=>{sample??=sampler(img,map.flipY);if(!sample)throw NO_PIXELS;return sample(u,w);},rules,size);if(!r.lit.tail&&!r.lit.head&&!r.lit.reverse)continue;
   if(data){for(let i=0;i<data.length;i++)if(r.data[i]>data[i])data[i]=r.data[i];}else data=r.data;for(const c of LAMP_CHANNELS)total[c]+=r.lit[c];}
  if(!data)continue;
  const mask=new T.DataTexture(data,size,size,T.RGBAFormat);mask.flipY=false;mask.magFilter=mask.minFilter=T.LinearFilter;mask.channel=map.channel;mask.needsUpdate=true;mask.name='Lamp mask';
  useLampMask(material,mask,levels);painted++;
 }
 if(!painted)return null;
 const handles=lampHandles(levels,rules.gain);handles.texels=total;return handles;
}
