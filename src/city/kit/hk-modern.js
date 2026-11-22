// Modern Hong Kong building kit: rendering (hk-modern-plan.js plans, this draws).
// · Near detail: one InstancedMesh per module part across the whole city, instance attribute iTint = tint rgb + aux
//   (wall finish id / window light / sign brightness). A BatchedMesh benchmark on this Mac (ANGLE Metal, 100k instances)
//   ran 114 ms a frame against 12 ms for InstancedMesh, so instancing it is.
// · Shells: every volume's outline extruded 0.5 m inside the facade (modules reach 0.28 m back: a 2 cm gap z-fought beyond ~150 m), one merged mesh with a procedural window grid.
//   Always drawn: the far level of detail, the roofs and the only shadow caster.
// · Per record (a podium, a tower) detail is shown within NEAR metres and inside the view; buckets are compacted to
//   the visible records when the camera moves, from the shell mesh's onBeforeRender, so callers need no update loop.
import * as T from 'three';
import {GLTFLoader} from 'three/addons/loaders/GLTFLoader.js';
import {planSite,Sink,standInKit,FAMILIES,PROPS,TYPES,MODERN_TYPES,hash} from './hk-modern-plan.js';
export {MODERN_TYPES,TYPES};
const BASE=`${import.meta.env?.BASE_URL??'/'}hk-modern/`;
const PART_BATCH={wall:'paint',trim:'paint',frame:'detail',detail:'detail',glass:'glass',glow:'glow'};

// ---------------------------------------------------------------- materials (shared by every render; never disposed)
const NIGHT={value:0};
// Detail dissolves (screen-door) over the last 70 m before the LOD distance, so swapping detail ↔ shell never pops.
const FADE={value:new T.Vector2(1e9,1e9+1)};
function patch(m,key,{vertex='',fragment=[]}){m.customProgramCacheKey=()=>'hkm-'+key;
 m.onBeforeCompile=s=>{s.uniforms.uNight=NIGHT;s.uniforms.uFade=FADE;
  s.vertexShader=s.vertexShader.replace('#include <project_vertex>','#include <project_vertex>\n#ifdef USE_INSTANCING\nvec4 hkWPos=modelMatrix*instanceMatrix*vec4(transformed,1.);\n#else\nvec4 hkWPos=modelMatrix*vec4(transformed,1.);\n#endif\nvHkD=distance(hkWPos.xyz,cameraPosition);vHkY=hkWPos.y;').replace('#include <common>','#include <common>\nvarying float vHkD;varying float vHkY;');
  s.fragmentShader=s.fragmentShader.replace('#include <clipping_planes_fragment>','#include <clipping_planes_fragment>\nfloat hkF=1.-smoothstep(uFade.x,uFade.y,vHkD);if(hkF<1.&&fract(52.9829189*fract(dot(gl_FragCoord.xy,vec2(.06711056,.00583715))))>hkF)discard;').replace('#include <common>','#include <common>\nuniform vec2 uFade;varying float vHkD;varying float vHkY;');
  s.vertexShader=s.vertexShader.replace('#include <common>','#include <common>\nattribute vec4 iTint;\nvarying float vAux;\nvarying vec2 vMUv;\n')
   .replace('#include <color_vertex>','#include <color_vertex>\nvColor.rgb*=iTint.rgb;vAux=iTint.a;vMUv=uv;\n'+vertex);
  s.fragmentShader=s.fragmentShader.replace('#include <common>','#include <common>\nuniform float uNight;\nvarying float vAux;\nvarying vec2 vMUv;\n'+FRAG_LIB);
  for(const [at,code] of fragment)s.fragmentShader=s.fragmentShader.replace(at,at+'\n'+code);};return m;}
const FRAG_LIB=`
float hkHash(vec2 p){return fract(sin(dot(p,vec2(127.1,311.7)))*43758.5453);}
float hkNoise(vec2 p){vec2 i=floor(p),f=fract(p);f=f*f*(3.-2.*f);return mix(mix(hkHash(i),hkHash(i+vec2(1,0)),f.x),mix(hkHash(i+vec2(0,1)),hkHash(i+vec2(1,1)),f.x),f.y);}
// Grid lines of cell size c and line width w (metres), faded out once a cell is smaller than a few pixels.
float hkGrid(vec2 uv,vec2 c,float w){vec2 q=uv/c,d=abs(fract(q+.5)-.5)*c,aa=fwidth(uv)*.8;vec2 l=1.-smoothstep(vec2(w)-aa,vec2(w)+aa,d);float fade=1.-smoothstep(.12,.35,max(fwidth(q).x,fwidth(q).y));return max(l.x,l.y)*fade;}
vec3 hkFinish(vec3 c,vec2 uv,float id){
 float n=hkNoise(uv*.7)*.06+hkNoise(uv*4.)*.025-.045;
 float streak=smoothstep(.55,1.,hkNoise(vec2(uv.x*3.1,uv.y*.18)))*.08;   // rain streaks run down the wall
 c*=1.+n-streak;
 if(id>.5&&id<1.5)c*=1.-.28*hkGrid(uv,vec2(.05),.004);                 // mosaic
 else if(id<2.5&&id>1.5)c*=1.-.22*hkGrid(uv,vec2(.3,.15),.006);         // tile
 else if(id<3.5&&id>2.5){c*=1.-.25*hkGrid(uv,vec2(30.,.9),.015);c*=.97+.03*step(.5,fract(uv.y*6.));}   // ribbed metal cladding
 else if(id<4.5&&id>3.5){c*=1.-.12*hkGrid(uv,vec2(30.,.6),.01)+hkNoise(uv*1.3)*.05-.025;}            // board-marked concrete
 else if(id<5.5&&id>4.5)c*=1.-.3*hkGrid(uv,vec2(1.2,.6),.008);                                      // stone / panel joints
 return c;}
`;
const MATS={
 paint:patch(new T.MeshStandardMaterial({vertexColors:true,roughness:.88,metalness:0}),'paint',{fragment:[['#include <color_fragment>','diffuseColor.rgb=hkFinish(diffuseColor.rgb,vMUv,vAux);'],['#include <emissivemap_fragment>','totalEmissiveRadiance+=diffuseColor.rgb*mix(vec3(.96,.88,.76),vec3(.65,.76,.94),smoothstep(4.,26.,vHkY))*uNight*.16;']]}),
 detail:patch(new T.MeshStandardMaterial({vertexColors:true,roughness:.55,metalness:.25}),'detail',{fragment:[['#include <emissivemap_fragment>','totalEmissiveRadiance+=diffuseColor.rgb*mix(vec3(.96,.88,.76),vec3(.65,.76,.94),smoothstep(4.,26.,vHkY))*uNight*.18;']]}),
 glass:patch(new T.MeshStandardMaterial({vertexColors:true,roughness:.1,metalness:.6}),'glass',{fragment:[['#include <emissivemap_fragment>',
  'float hkL=vAux>1.?vAux-1.:vAux;vec3 hkC=vAux>1.?vec3(.82,.92,1.):vec3(1.,.78,.47);float hkP=hkHash(floor(vMUv*vec2(.62,.31))+vAux*7.);totalEmissiveRadiance+=hkC*hkL*uNight*.85*step(.28,hkP)*(.45+.7*hkP);diffuseColor.rgb*=1.-.6*uNight*step(.01,hkL);']]}),
 glow:patch(new T.MeshStandardMaterial({vertexColors:true,roughness:.45,metalness:0}),'glow',{fragment:[['#include <emissivemap_fragment>','totalEmissiveRadiance+=diffuseColor.rgb*vAux*(.35+2.2*uNight);']]}),
};
// Shell: wall colour per vertex, window grid from attributes (bay, floor, window w/h fractions), lit cells at night.
const SHELL=new T.MeshStandardMaterial({vertexColors:true,roughness:.9,metalness:0});SHELL.customProgramCacheKey=()=>'hkm-shell';
SHELL.onBeforeCompile=s=>{s.uniforms.uNight=NIGHT;
 s.vertexShader=s.vertexShader.replace('#include <common>','#include <common>\nattribute vec4 sGrid;attribute vec4 sGlass;attribute vec2 sMeta;varying vec4 vGrid;varying vec4 vGl;varying vec2 vMeta;varying vec2 vSUv;\n')
  .replace('#include <uv_vertex>','#include <uv_vertex>\nvGrid=sGrid;vGl=sGlass;vMeta=sMeta;vSUv=uv;\n');
 s.fragmentShader=s.fragmentShader.replace('#include <common>','#include <common>\nuniform float uNight;varying vec4 vGrid;varying vec4 vGl;varying vec2 vMeta;varying vec2 vSUv;\n'+FRAG_LIB+`
float hkWin=0.,hkLit=0.,hkTone=.5;`)
  .replace('#include <color_fragment>',`#include <color_fragment>
 if(vGrid.x>0.){vec2 q=vSUv/vGrid.xy,cell=floor(q),f=fract(q),aa=fwidth(q)*1.2;float cover=clamp(1.-max(aa.x,aa.y)*1.6,0.,1.);
  float wx=1.-smoothstep(vGrid.z*.5-aa.x,vGrid.z*.5+aa.x,abs(f.x-.5)),wy=1.-smoothstep(vGrid.w*.5-aa.y,vGrid.w*.5+aa.y,abs(f.y-.5));
  hkWin=mix(vGrid.z*vGrid.w,wx*wy,cover)*step(0.,vSUv.y);
  float h=hkHash(cell+vMeta.y*vec2(17.3,31.1)),hf=hkHash(vec2(0.,cell.y)+vMeta.y*vec2(17.3,31.1));
  float lit=vMeta.x<.5?step(h,vGl.a):vMeta.x<1.5?step(hf,vGl.a):step(.62,f.y)*step(f.y,.8);
  hkLit=mix(vGl.a,lit,cover);hkTone=mix(.5,hkHash(cell*1.37+vMeta.y*vec2(5.3,9.1)),cover);
  diffuseColor.rgb=mix(hkFinish(diffuseColor.rgb,vSUv,0.),vGl.rgb,hkWin);}`)
  .replace('#include <roughnessmap_fragment>','#include <roughnessmap_fragment>\nroughnessFactor=mix(roughnessFactor,.15,hkWin);')
  .replace('#include <metalnessmap_fragment>','#include <metalnessmap_fragment>\nmetalnessFactor=mix(metalnessFactor,.5,hkWin);')
  .replace('#include <emissivemap_fragment>','#include <emissivemap_fragment>\nfloat hkB=fract(vMeta.y*13.);vec3 hkC=hkTone<.25+.5*hkB?mix(vec3(1.,.66,.34),vec3(1.,.84,.6),hkTone*2.):hkTone<.9?vec3(.8,.9,1.):vec3(.62,.78,1.);   /* per-window warm tungsten / neutral / cool LED, mix set per building */\ntotalEmissiveRadiance+=hkC*(.45+.75*fract(hkTone*7.31))*hkLit*hkWin*uNight*.8+diffuseColor.rgb*mix(vec3(.95,.84,.7),vec3(.62,.74,.92),smoothstep(4.,22.,vSUv.y))*uNight*.15*(1.-hkWin*.5);');};

// ---------------------------------------------------------------- kit
let kitPromise=null,kitReady=null;   // kitReady: the loaded kit, so later renders build synchronously (planner thumbnails)
export function loadModernKit({url=BASE+'kit.glb',loader=new GLTFLoader()}={}){return kitPromise??=Promise.all([fetch(BASE+'kit.json').then(r=>r.ok?r.json():null).catch(()=>null),loader.loadAsync(url).catch(()=>null)]).then(([json,gltf])=>{
 const parts=new Map();
 if(json&&gltf){gltf.scene.updateMatrixWorld(true);gltf.scene.traverse(o=>{if(!o.isMesh||!o.name.startsWith('M__'))return;const [mod,matName]=o.name.slice(3).split('_');const mat=(o.material?.name??matName).split('.')[0];
  if(!PART_BATCH[mat])return;if(!parts.has(mod))parts.set(mod,[]);parts.get(mod).push({geometry:canonical(o.geometry,o.matrixWorld),mat});});
  return kitReady={json,parts,standIn:false};}
 // No Blender kit yet: grey stand-ins with a window, so planning and rendering can be checked.
 const stand=standInKit();for(const [name,{w,h}] of Object.entries(stand.modules)){const fam=name.replace(/\d+$/,''),isFacade=!!FAMILIES[fam];
  if(isFacade){parts.set(name,[{geometry:canonical(new T.PlaneGeometry(w,h).translate(w/2,h/2,0)),mat:'wall'},{geometry:canonical(new T.PlaneGeometry(w*.6,h*.5).translate(w/2,h*.55,.02)),mat:'glass'}]);}
  else parts.set(name,[{geometry:canonical(new T.BoxGeometry(1,1,1).translate(0,.5,0)),mat:name==='HELIX'||name==='RAMP'?'wall':'detail'}]);}
 return kitReady={json:stand,parts,standIn:true};});}
// Every part gets the same attribute layout (position, normal, uv, colour; indexed) so materials and shaders agree.
function canonical(g,M){g=g.clone();if(M&&!M.equals(new T.Matrix4()))g.applyMatrix4(M);if(!g.index)g.setIndex([...Array(g.attributes.position.count).keys()]);
 const n=g.attributes.position.count,out=new T.BufferGeometry();out.setIndex(new T.BufferAttribute(Uint32Array.from(g.index.array),1));
 if(!g.attributes.normal)g.computeVertexNormals();const copy=(A,k)=>{const a=new Float32Array(n*k);for(let i=0;i<n;i++){a[i*k]=A.getX(i);a[i*k+1]=A.getY(i);if(k>2)a[i*k+2]=A.getZ(i);}return a;};
 out.setAttribute('position',new T.BufferAttribute(copy(g.attributes.position,3),3));out.setAttribute('normal',new T.BufferAttribute(copy(g.attributes.normal,3),3));
 const uv=new Float32Array(n*2);if(g.attributes.uv)for(let i=0;i<n;i++){uv[i*2]=g.attributes.uv.getX(i);uv[i*2+1]=g.attributes.uv.getY(i);}out.setAttribute('uv',new T.BufferAttribute(uv,2));
 const col=new Float32Array(n*3).fill(1);const C=g.attributes.color;if(C)for(let i=0;i<n;i++){col[i*3]=C.getX(i);col[i*3+1]=C.getY(i);col[i*3+2]=C.getZ(i);}out.setAttribute('color',new T.BufferAttribute(col,3));
 out.computeBoundingSphere();return out;}

// ---------------------------------------------------------------- plan cache (re-renders only plan new or changed sites)
const cache=new Map(),CACHE_MAX=600;
function sitePlan(kit,site,type,seed){const key=[type,seed??0,site.id,site.poly.map(p=>p.x.toFixed(2)+','+p.z.toFixed(2)).join(';'),site.edges?.map(e=>e.role).join('')??'',(site.yaw??0).toFixed(3)].join('|');
 let s=cache.get(key);if(s){cache.delete(key);cache.set(key,s);return s;}s=planSite(kit,site,type,seed??0);cache.set(key,s);if(cache.size>CACHE_MAX)cache.delete(cache.keys().next().value);return s;}
// SGMTS game: sites stand on terrain at p.y; shift a (cached, so copied) plan up without replanning.
function lift(s,y){if(!y)return s;const o=Object.assign(Object.create(Object.getPrototypeOf(s)),s);o.m=s.m.slice();for(let i=0;i<s.n;i++)o.m[i*12+10]+=y;
 o.shells=s.shells.map(h=>({...h,y0:h.y0+y,y1:h.y1+y}));o.records=s.records.map(r=>({...r,y:r.y+y,top:r.top+y}));return o;}
// Concatenate per-site sinks (module, style and record indices remapped).
function concat(sinks){const out=new Sink();let n=0;for(const s of sinks)n+=s.n;while(out.cap<n)out.grow();
 for(const s of sinks){const so=out.styles.length,ro=out.records.length,map=s.mods.map(m=>{let k=out.modIndex.get(m);if(k===undefined){k=out.mods.length;out.mods.push(m);out.modIndex.set(m,k);}return k;});
  out.styles.push(...s.styles);out.records.push(...s.records);for(const sh of s.shells)out.shells.push({...sh,rec:sh.rec+ro});for(const m of s.missing)out.missing.add(m);
  const o=out.n;out.m.set(s.m.subarray(0,s.n*12),o*12);out.lit.set(s.lit.subarray(0,s.n),o);for(let i=0;i<s.n;i++){out.mod[o+i]=map[s.mod[i]];out.sty[o+i]=s.sty[i]+so;out.rec[o+i]=s.rec[i]+ro;}out.n+=s.n;}
 return out;}

// ---------------------------------------------------------------- shells
function shellGeometry(shells){let nv=0;const tris=[];for(const s of shells){nv+=s.P.length*4;const tri=T.ShapeUtils.triangulateShape(s.P.map(p=>new T.Vector2(p.x,p.z)),[]);tris.push(tri);nv+=s.P.length;}
 const pos=new Float32Array(nv*3),nor=new Float32Array(nv*3),col=new Float32Array(nv*3),uv=new Float32Array(nv*2),grid=new Float32Array(nv*4),gl=new Float32Array(nv*4),meta=new Float32Array(nv*2),idx=[];let v=0;
 const put=(x,y,z,nx,ny,nz,c,u,w,s,win)=>{pos.set([x,y,z],v*3);nor.set([nx,ny,nz],v*3);col.set(c,v*3);uv.set([u,w],v*2);grid.set(win?[s.bay,s.floor,s.win[0],s.win[1]]:[0,0,0,0],v*4);gl.set([...s.glass,s.lit],v*4);meta.set([s.kind,s.seed],v*2);return v++;};
 shells.forEach((s,si)=>{const P=s.P;let u=0;for(let i=0;i<P.length;i++){const a=P[i],b=P[(i+1)%P.length],dx=b.x-a.x,dz=b.z-a.z,L=Math.hypot(dx,dz)||1e-9,nx=-dz/L,nz=dx/L;
   const k0=put(a.x,s.y0,a.z,nx,0,nz,s.wall,u,s.y0-s.gy,s,true),k1=put(b.x,s.y0,b.z,nx,0,nz,s.wall,u+L,s.y0-s.gy,s,true),k2=put(b.x,s.y1,b.z,nx,0,nz,s.wall,u+L,s.y1-s.gy,s,true),k3=put(a.x,s.y1,a.z,nx,0,nz,s.wall,u,s.y1-s.gy,s,true);
   idx.push(k0,k1,k2,k0,k2,k3);u+=L;}
  const base=v;for(const p of P)put(p.x,s.y1,p.z,0,1,0,s.roof,p.x,p.z,s,false);for(const [a,b,c] of tris[si]){const A=P[a],B=P[b],C=P[c],up=(B.x-A.x)*(C.z-A.z)-(B.z-A.z)*(C.x-A.x)>0;idx.push(base+a,up?base+c:base+b,up?base+b:base+c);}});   // roof triangles wound to face +y
 const g=new T.BufferGeometry();g.setAttribute('position',new T.BufferAttribute(pos,3));g.setAttribute('normal',new T.BufferAttribute(nor,3));g.setAttribute('color',new T.BufferAttribute(col,3));
 g.setAttribute('uv',new T.BufferAttribute(uv,2));g.setAttribute('sGrid',new T.BufferAttribute(grid,4));g.setAttribute('sGlass',new T.BufferAttribute(gl,4));g.setAttribute('sMeta',new T.BufferAttribute(meta,2));
 g.setIndex(nv>65535?new T.BufferAttribute(Uint32Array.from(idx),1):idx);g.computeBoundingSphere();return g;}

// ---------------------------------------------------------------- render
// plots: [{id, poly:[{x,z}], edges?, yaw?, modern|type, seed?}] (planner lots, or any outline).
export function renderModernBuildings(plots,{near=320}={}){const root=new T.Group();root.name='Modern Hong Kong buildings';
 root.userData.lod={near,hysteresis:40};root.userData.count=plots.length;
 const make=kit=>{if(root.userData.disposed)return;
  const sink=concat(plots.map(p=>lift(sitePlan(kit.json,{id:p.id,poly:p.poly,edges:p.edges,yaw:p.yaw},p.modern??p.type,p.seed),p.y??0)));
  if(sink.missing.size)console.warn('hk-modern: kit lacks',[...sink.missing].join(' '));
  build(root,kit,sink);root.userData.sink=sink;};
 if(kitReady){make(kitReady);root.userData.ready=Promise.resolve();}else root.userData.ready=loadModernKit().then(make);
 root.addEventListener('removed',()=>{root.userData.disposed=true;root.traverse(o=>{if(o.isMesh)o.geometry.dispose();});});
 return root;}

// The kit bridge runs 14 m along local +Z. Intersect both sides of its deck with
// the same occupied façade at deck height, so a skew landing has no exposed corner.
function connectMallBridges(sink){
 const lengths=new Map(),m=sink.m;
 for(let i=0;i<sink.n;i++)if(sink.mods[sink.mod[i]]==='FB'){
  const o=i*12,x=m[o+9],z=m[o+11],y=m[o+10],dx=m[o+6],dz=m[o+8];
  let length=Infinity;
  for(const shift of [0,-3,3,-6,6]){
   // A narrow gap between opposing lots can bisect a landing. Slide the
   // connection along the originating façade until its full width is supported.
   for(const sh of sink.shells){
   if(sh.rec===sink.rec[i]||sh.y0>y+.8||sh.y1<y+3.4)continue;
   const hits=[-2.35,2.35].map(offset=>{
    const ox=x+(shift+offset)*m[o],oz=z+(shift+offset)*m[o+2];let best=Infinity;
    for(let j=0;j<sh.P.length;j++){
     const a=sh.P[j],b=sh.P[(j+1)%sh.P.length],ex=b.x-a.x,ez=b.z-a.z,det=dx*ez-dz*ex;
     if(Math.abs(det)<1e-7)continue;
     const t=((a.x-ox)*ez-(a.z-oz)*ex)/det,u=((a.x-ox)*dz-(a.z-oz)*dx)/det;
     if(u>=0&&u<=1&&t>1&&t<75)best=Math.min(best,t);
    }
    return best;
   });
   length=Math.min(length,Math.max(...hits));
   }
   if(Number.isFinite(length)){
    m[o+9]+=shift*m[o]-.3*dx;m[o+11]+=shift*m[o+2]-.3*dz;length+=.3;
    break;
   }
  }
  if(Number.isFinite(length)){
   lengths.set(i,length);m[o+6]*=(length+.3)/14;m[o+8]*=(length+.3)/14;
  }
 }
 return lengths;
}

function build(root,kit,sink){const buckets=new Map(),bridges=connectMallBridges(sink);
 for(let i=0;i<sink.n;i++){const name=sink.mods[sink.mod[i]],parts=kit.parts.get(name);if(!parts||name==='FB'&&sink.records.length>1&&!bridges.has(i))continue;
  for(let k=0;k<parts.length;k++){const key=sink.mod[i]*16+k;let b=buckets.get(key);if(!b)buckets.set(key,b={part:parts[k],list:[]});b.list.push(i);}}
 root.userData.mallBridges=[...bridges].map(([i,length])=>({x:sink.m[i*12+9],z:sink.m[i*12+11],y:sink.m[i*12+10],length}));
 const recs=sink.records.map(r=>({...r,near:true,buckets:new Set()})),meshes=[],M=new T.Matrix4(),E=M.elements;let instances=0,tris=0;
 for(const b of buckets.values()){const n=b.list.length,batch=PART_BATCH[b.part.mat],src=b.part.geometry,g=new T.BufferGeometry();
  for(const [k,a] of Object.entries(src.attributes))g.setAttribute(k,new T.BufferAttribute(a.array,a.itemSize));g.setIndex(new T.BufferAttribute(src.index.array,1));g.boundingSphere=src.boundingSphere;
  const mat=new Float32Array(n*16),tint=new Float32Array(n*4),ranges=[];
  b.list.forEach((i,j)=>{const m=sink.m,o=i*12;E[0]=m[o];E[1]=m[o+1];E[2]=m[o+2];E[3]=0;E[4]=m[o+3];E[5]=m[o+4];E[6]=m[o+5];E[7]=0;E[8]=m[o+6];E[9]=m[o+7];E[10]=m[o+8];E[11]=0;E[12]=m[o+9];E[13]=m[o+10];E[14]=m[o+11];E[15]=1;mat.set(E,j*16);
   const st=sink.styles[sink.sty[i]],c=b.part.mat==='detail'?[1,1,1]:st[b.part.mat]??[1,1,1];tint.set(c,j*4);tint[j*4+3]=batch==='paint'?st.finish:batch==='glass'?sink.lit[i]:batch==='glow'?st.glowLevel:0;
   const r=sink.rec[i],last=ranges.at(-1);if(last&&last[0]===r)last[2]++;else{ranges.push([r,j,1]);recs[r]?.buckets.add(meshes.length);}});
  const mesh=new T.InstancedMesh(g,MATS[batch],n);mesh.instanceMatrix.array.set(mat);g.setAttribute('iTint',new T.InstancedBufferAttribute(tint.slice(),4));
  mesh.frustumCulled=false;mesh.castShadow=false;mesh.receiveShadow=true;mesh.userData={shared:true,master:{mat,tint},ranges,full:true};mesh.name='hk-modern-detail '+sink.mods[sink.mod[b.list[0]]]+'·'+b.part.mat;// collision.js skips instanced detail: the merged shells are the solid walls
  root.add(mesh);meshes.push(mesh);instances+=n;tris+=n*src.index.count/3;}
 const shellBuckets=new Map();
 for(const sh of sink.shells){const p0=sh.P[0],k=(Math.floor((p0?.x||0)/320))+','+(Math.floor((p0?.z||0)/320));let list=shellBuckets.get(k);if(!list)shellBuckets.set(k,list=[]);list.push(sh);}
 const shellMeshes=[];
 for(const list of shellBuckets.values()){const shell=new T.Mesh(shellGeometry(list),SHELL);shell.castShadow=shell.receiveShadow=true;shell.userData.shared=true;shell.name='Modern shells';root.add(shell);shellMeshes.push(shell);}
 // level of detail: recompute when the camera has moved or turned enough
 const last={p:new T.Vector3(1e9,0,0),q:new T.Quaternion(),fov:0},_camP=new T.Vector3(),_camQ=new T.Quaternion(),F=new T.Frustum(),PM=new T.Matrix4(),S=new T.Sphere(),dirty=new Set();
 const update=(camera,force=false)=>{const p=camera.getWorldPosition(_camP),q=camera.getWorldQuaternion(_camQ);
  if(!force&&p.distanceTo(last.p)<6&&Math.abs(q.dot(last.q))>.9995&&camera.fov===last.fov)return;last.p.copy(p);last.q.copy(q);last.fov=camera.fov;
  camera.updateMatrixWorld();PM.multiplyMatrices(camera.projectionMatrix,camera.matrixWorldInverse);F.setFromProjectionMatrix(PM);
  const {near:N,hysteresis:H}=root.userData.lod,rw=root.matrixWorld;if(N<1e4)FADE.value.set(N-70,N);
  for(const r of recs){S.center.set(r.x,r.y,r.z).applyMatrix4(rw);S.radius=r.r;const d=S.center.distanceTo(p)-r.r,want=d<(r.near?N+H:N)&&(S.radius+=r.near?60:40,F.intersectsSphere(S));/* margin: no detail toggling at the screen edge from a stale frustum */if(want!==r.near){r.near=want;for(const b of r.buckets)dirty.add(b);}}
  for(const bi of dirty){const mesh=meshes[bi],{master,ranges}=mesh.userData,A=mesh.instanceMatrix,Ti=mesh.geometry.attributes.iTint;let c=0;
   for(const [r,start,count] of ranges){if(!recs[r]?.near)continue;A.array.set(master.mat.subarray(start*16,(start+count)*16),c*16);Ti.array.set(master.tint.subarray(start*4,(start+count)*4),c*4);c+=count;}
   mesh.count=c;mesh.visible=c>0;A.clearUpdateRanges();A.addUpdateRange(0,c*16);A.needsUpdate=true;Ti.clearUpdateRanges();Ti.addUpdateRange(0,c*4);Ti.needsUpdate=true;}
  dirty.clear();};
 let lastRenderFrame=-1;
 const onBeforeRender=(renderer,scene,camera)=>{const env=scene.environmentIntensity??1;NIGHT.value=scene.userData.nightLights??1-Math.min(1,Math.max(0,(env-.12)/.38));if(!camera.isPerspectiveCamera||camera.userData?.isFeed||camera.parent?.isCubeCamera||camera.parent?.type==='CubeCamera')return;const f=renderer?.info?.render?.frame;if(f!=null){if(lastRenderFrame===f)return;lastRenderFrame=f;}update(camera);};   // ignore shadow, feed and reflection cameras: their passes flipped the LOD every frame (re-upload + blinking)
 for(const shell of shellMeshes)shell.onBeforeRender=onBeforeRender;
 root.userData.update=update;root.userData.recs=recs;   // recs: LOD state per podium / tower (inspection)
 root.userData.stats=()=>({sites:root.userData.count,records:recs.length,near:recs.filter(r=>r.near).length,buckets:meshes.length,instances,visible:meshes.reduce((s,m)=>s+(m.visible?m.count:0),0),
  triangles:Math.round(tris),visibleTriangles:Math.round(meshes.reduce((s,m)=>s+(m.visible?m.count*m.geometry.index.count/3:0),0)),shellTriangles:shellMeshes.reduce((s,m)=>s+m.geometry.index.count/3,0),standIn:kit.standIn,missing:[...sink.missing]});}

// One type on its own (thumbnails, the planner's lot ghosts): a square site sized for the type unless an outline is given.
export function modernModel(type,{poly,seed=0,id='preview:'+type}={}){const t=TYPES[type],[w,d]=t?.span??[30,30];
 return renderModernBuildings([{id,poly:poly??[{x:-w/2,z:-d/2},{x:w/2,z:-d/2},{x:w/2,z:d/2},{x:-w/2,z:d/2}],yaw:0,modern:type,seed}],{near:1e5});}
// Set the night factor directly (pages without a lab-style environmentIntensity).
export const setNight=v=>{NIGHT.value=v;};
