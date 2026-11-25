import {inSquareExtension,extensionGrade} from './a2-square-extension.js';
// The north-up trace is in the same world metres as the OZP and the D6 road.
import * as T from 'three';
import {mergeGeometries} from 'three/addons/utils/BufferGeometryUtils.js';
import {mergeByMaterial} from './batching.js';
import {sample,cycleSample,cycleBridgeHeight,CYCLE_WIDTH,roadSection,footpathHeight,project,LENGTH} from './alignment.js';
import {junctions,frameAt,streetLevel} from './street/network.js';

import {riverFrames,riverAt,riverReserve,waterHalf,walkEdge,rampEdge,bankEdge,outerEdge,waterY,length,count,landing,d6Span,terraceFrames,bankTerrace,upperBankY,terraceRamp} from './a2-river-alignment.js';
export {riverFrames,riverAt,riverReserve,riverExcavation} from './a2-river-alignment.js';
export function bankLevels(d,natural){
 const water=waterY(d),end=Math.min(d,length-d);
 const walk=Math.max(water+1.05,natural-.048*end);
 // Dip the upper paths through the skew crossing, then climb back to the banks at 1:22.
 const upper=upperBankY(d,0,natural,null);
 const ramp=Math.max(walk,Math.min(upper,natural-.046*Math.max(0,Math.abs(d-landing)-17)));
 return {water,walk,ramp,upper};
}
const innerSteps=32,outerSteps=18;
function terraceLevels(d,t,l,x,natural){
 return {...l,ramp:T.MathUtils.lerp(l.ramp,terraceRamp(x,l.walk),t.blend),upper:upperBankY(d,x,natural,t)};
}
function tread(t,n){return Math.floor(T.MathUtils.clamp(t,0,1)*n+1e-7)/n;}
function terraceFloor(o,t,l){
 if(o<=walkEdge)return l.walk;
 if(o<t.inner)return T.MathUtils.lerp(l.walk,l.ramp,tread((o-walkEdge)/(t.inner-walkEdge),innerSteps));
 if(o<=t.lane)return l.ramp;
 if(o<t.crest){
  const f=(o-t.lane)/(t.crest-t.lane);
  return T.MathUtils.lerp(l.ramp,l.upper,T.MathUtils.lerp(f,tread(f,outerSteps),t.blend));
 }
 return l.upper;
}
function groundProfile(offset,level){
 const t=Math.abs(offset),{water,walk,ramp,upper}=level;
 if(t<waterHalf)return water;
 if(t<=walkEdge)return walk;
 if(t<=rampEdge)return ramp;
 if(t<bankEdge)return T.MathUtils.lerp(ramp,upper,(t-rampEdge)/(bankEdge-rampEdge));
 return upper;
}

export function promenadeFloor(x,z,fromY,groundSample){
 const r=riverAt(x,z);if(!r||r.past>.02)return null;
 const t=r.offset>walkEdge?bankTerrace(r.d):null;
 if(Math.abs(r.offset)>(t?.outer??outerEdge))return null;
 const natural=groundSample(x,z)+.03,l=bankLevels(r.d,natural);
 const y=t?terraceFloor(r.offset,t,terraceLevels(r.d,t,l,x,natural)):groundProfile(r.offset,l);
 return {y,water:Math.abs(r.offset)<waterHalf,below:Number.isFinite(fromY)&&fromY<natural-1.75&&y<natural-1.75};
}

export function promenadePose(distance,side,groundSample){
 const d=Math.max(0,Math.min(length,distance)),u=d*count/length,i=Math.min(count-1,Math.floor(u)),t=u-i;
 const a=riverFrames[i],b=riverFrames[i+1],offset=side*10.8;
 const mix=k=>a[k]+(b[k]-a[k])*t;
 const x=mix('x')+mix('nx')*offset,z=mix('z')+mix('nz')*offset;
 return {x,z,y:bankLevels(d,groundSample(x,z)+.03).walk,heading:Math.atan2(-mix('nz'),mix('nx'))};
}

function ribbon(group,name,rows,material){
 const positions=[],uv=[],indices=[];
 for(let i=0;i<rows.length;i++){
  const row=rows[i],w=row.length;
  for(let j=0;j<w;j++){
   const [x,y,z,u,v]=row[j];positions.push(x,y,z);uv.push(u,v);
   if(i&&j){const k=i*w+j;indices.push(k-w-1,k,k-1,k-w-1,k-w,k);}
  }
 }
 const geo=new T.BufferGeometry();geo.setAttribute('position',new T.Float32BufferAttribute(positions,3));geo.setAttribute('uv',new T.Float32BufferAttribute(uv,2));geo.setIndex(indices);geo.computeVertexNormals();
 const mesh=new T.Mesh(geo,material);mesh.name=name;mesh.receiveShadow=true;group.add(mesh);return mesh;
}
function flowMaterial(time){
 const mat=new T.MeshStandardMaterial({color:0x428e90,metalness:.19,roughness:.36,side:T.DoubleSide});
 mat.onBeforeCompile=shader=>{
  shader.uniforms.riverTime=time;
  shader.vertexShader='varying vec2 vRiver; uniform float riverTime;\n'+shader.vertexShader.replace('#include <begin_vertex>',`
   #include <begin_vertex>
   vRiver=uv;
   float along=uv.y-riverTime*.85;
   transformed.y+=.045*sin(along*.88+uv.x*.54)+.022*sin(along*1.39-uv.x*.31);
  `);
  shader.fragmentShader='varying vec2 vRiver; uniform float riverTime;\n'+shader.fragmentShader.replace('#include <color_fragment>',`
   #include <color_fragment>
   float s=vRiver.y-riverTime*0.85, w=vRiver.x;
   float a=sin(s*1.9+sin(w*.9+s*.19)*1.8);
   float b=sin(s*3.1-w*1.6+sin(s*.46+w*1.2));
   float glint=smoothstep(1.35,1.97,a+b);
   float edge=smoothstep(6.9,8.52,abs(w));
   diffuseColor.rgb*=.85+.1*a+.07*b;
   diffuseColor.rgb+=vec3(.17,.22,.19)*(glint*.7+edge*glint);
  `).replace('#include <normal_fragment_maps>',`
   #include <normal_fragment_maps>
   normal=normalize(normal+vec3(.055*cos(vRiver.y*1.9-riverTime*1.615),0.,.045*sin(vRiver.x+vRiver.y*2.1-riverTime*1.785)));
  `);
 };
 return mat;
}
function promenadeMaterial(){
 const c=document.createElement('canvas');c.width=512;c.height=512;
 const ctx=c.getContext('2d');
 // Base warm terracotta / reddish-brown promenade coating (matching Hong Kong riverside reference).
 ctx.fillStyle='#8c5548';ctx.fillRect(0,0,512,512);
 // Subtle speckled aggregate & weathered surface variation across the terracotta coating.
 for(let i=0;i<5500;i++){
  const x=(i*197)%512,y=(i*313+Math.floor(i/13)*29)%512;
  const s=1+(i%2),dark=(i%3)===0;
  ctx.fillStyle=dark?'rgba(74,40,33,.13)':'rgba(176,120,104,.11)';
  ctx.fillRect(x,y,s,s);
 }
 // Water-side light-grey concrete coping/edging strip (u = 0 .. 0.088).
 ctx.fillStyle='#c4c1b7';ctx.fillRect(0,0,45,512);
 // Inland-side light-grey concrete/stone edging strip (u = 0.925 .. 1.0).
 ctx.fillStyle='#c2bfb5';ctx.fillRect(474,0,38,512);
 for(let y=0;y<512;y+=64){
  ctx.fillStyle='rgba(92,90,82,.26)';
  ctx.fillRect(0,y,45,2);
  ctx.fillRect(474,y,38,2);
 }
 // Subtle dark seam where the terracotta surface meets both concrete edge strips.
 ctx.fillStyle='rgba(62,42,36,.32)';ctx.fillRect(44,0,3,512);ctx.fillRect(472,0,3,512);
 // Crisp off-white dashed centreline along the middle of the terracotta promenade.
 ctx.fillStyle='#eeebe3';ctx.fillRect(253,36,14,230);
 const map=new T.CanvasTexture(c);
 map.wrapS=T.ClampToEdgeWrapping;map.wrapT=T.RepeatWrapping;
 map.colorSpace=T.SRGBColorSpace;map.anisotropy=8;
 return new T.MeshStandardMaterial({map,roughness:.88,metalness:.02});
}
function waterfrontRailingMaterials(){
 return {
  topRail:new T.MeshStandardMaterial({color:0x6d221b,roughness:.44,metalness:.14,side:T.DoubleSide}),
  mintSteel:new T.MeshStandardMaterial({color:0x9ac8bc,roughness:.42,metalness:.22,side:T.DoubleSide}),
 };
}
function waterfrontPostGeometry(){
 // Architectural mint-green post with base plinth and top bracket supporting the mahogany top rail.
 const shaft=new T.BoxGeometry(.10,.99,.12);shaft.translate(0,.555,0);
 const base=new T.BoxGeometry(.17,.06,.18);base.translate(0,.09,0);
 const cap=new T.BoxGeometry(.13,.06,.15);cap.translate(0,1.03,0);
 const merged=mergeGeometries([shaft,base,cap]);
 shaft.dispose();base.dispose();cap.dispose();
 return merged;
}
function channelMesh(scene,mats,ground,time){
 const root=new T.Group();root.name='A2 river and promenades';scene.add(root);
 const concrete=mats.concrete,paving=mats.walkGrey??mats.walk;
 const promenadePaving=promenadeMaterial();
 const {topRail,mintSteel}=waterfrontRailingMaterials();
 const postGeo=waterfrontPostGeometry();
 const point=(f,o,h)=>[f.x+o*f.nx,h,f.z+o*f.nz,o/5,f.d/5];
 const strip=(name,section,mat)=>ribbon(root,name,riverFrames.map(f=>section(f)),mat);
 const nat=(f,o)=>ground(f.x+o*f.nx,f.z+o*f.nz)+.03;
 const waterOffsets=Array.from({length:13},(_,i)=>waterHalf*(i/6-1));
 strip('Flowing water',f=>waterOffsets.map(o=>[f.x+o*f.nx,waterY(f.d),f.z+o*f.nz,o,f.d]),flowMaterial(time));
 // Horizontal formwork lines and vertical panel joints give the retaining walls a scale at walking height.
 const panel=document.createElement('canvas');panel.width=256;panel.height=128;
 const ink=panel.getContext('2d');ink.fillStyle='#b5b7ac';ink.fillRect(0,0,256,128);
 for(let y=0;y<128;y+=16){ink.fillStyle='rgba(73,78,74,.13)';ink.fillRect(0,y,256,1);}
 ink.fillStyle='#828980';ink.fillRect(0,0,2,128);
 for(const x of [33,128,222])for(const y of [32,96]){ink.fillStyle='#8d948a';ink.fillRect(x,y,2,2);}
 const texture=new T.CanvasTexture(panel);texture.wrapS=texture.wrapT=T.RepeatWrapping;texture.colorSpace=T.SRGBColorSpace;
 const wall=new T.MeshStandardMaterial({map:texture,side:T.DoubleSide,roughness:.94});
 const turf=mats.grass.clone();turf.side=T.DoubleSide;
 for(const side of [-1,1]){
  const at=(f,o,which,delta=0)=>{const offset=side*o,n=nat(f,offset),l=bankLevels(f.d,n);return point(f,offset,(l[which]??n)+delta);};
  const span=(name,section,mat)=>strip(name,f=>{const row=section(f);return side<0?row.reverse():row;},mat);
  const panelled=(name,o,bottom,top,base=0)=>span(name,f=>{
   const row=[at(f,o,bottom,base),at(f,o,top)];
   for(const v of row){v[3]=f.d/4;v[4]=v[1]/2;}return row;
  },wall);
  panelled('Quay wall',waterHalf,'water','walk',-1.3);
  span('Riverside promenade',f=>{
   const inner=at(f,waterHalf,'walk'),outer=at(f,walkEdge,'walk');
   inner[3]=0;inner[4]=f.d/4.5;outer[3]=1;outer[4]=f.d/4.5;
   return [inner,outer];
  },promenadePaving);
  const banks=side<0?[riverFrames]:[riverFrames.filter(f=>f.d<=terraceFrames[0].d),riverFrames.filter(f=>f.d>=terraceFrames.at(-1).d)];
  const bankSpan=(name,section,mat)=>{for(const frames of banks)ribbon(root,name,frames.map(f=>side<0?section(f).reverse():section(f)),mat);};
  bankSpan('Access ramp retaining wall',f=>[at(f,walkEdge,'walk'),at(f,walkEdge,'ramp')],wall);
  // Guard the open side of the raised ramp. Its level ends stay open for wheelchair access.
  for(const bank of banks){
  const raised=bank.filter(f=>{
   const l=bankLevels(f.d,nat(f,side*walkEdge));return l.ramp-l.walk>.42;
  });
  if(raised.length>1){
   ribbon(root,'Ramp edge handrail',raised.map(f=>[
    at(f,walkEdge+.09,'ramp',1.02),at(f,walkEdge+.09,'ramp',1.09),
    at(f,walkEdge+.16,'ramp',1.09),at(f,walkEdge+.16,'ramp',1.02)
   ]),mats.galvanised);
   const supports=raised.filter((_,i)=>i%2===0),railPosts=new T.InstancedMesh(new T.BoxGeometry(.08,1.06,.08),mats.galvanised,supports.length);
   supports.forEach((f,i)=>{const [x,y,z]=at(f,walkEdge+.12,'ramp',.53);railPosts.setMatrixAt(i,new T.Matrix4().makeTranslation(x,y,z));});
   root.add(railPosts);
  }
  }
  const belowRoad=v=>{
   const s=project(v[0],v[2]),r=sample(s);
   if(!r.elevated){const lat=(v[0]-r.x)*r.lx+(v[2]-r.z)*r.lz,e=roadSection(s);if(lat>e.left-1.2&&lat<e.right+1.2)v[1]=Math.min(v[1],r.y-.35);}
   return v;
  };
  bankSpan('Promenade access ramp',f=>[at(f,walkEdge,'ramp'),at(f,rampEdge,'ramp')],paving);
  bankSpan('Grassed embankment',f=>[at(f,rampEdge,'ramp'),at(f,bankEdge,'upper')].map(belowRoad),turf);
  bankSpan('Upper riverside footpath',f=>[at(f,bankEdge,'upper'),at(f,outerEdge,'upper')].map(belowRoad),paving);
  // Keep the old bank skirt buried wherever the station square or corridor road now meets it.
  const belowSquare=(v,i)=>{
   if(side>0&&i&&inSquareExtension(v[0],v[2],2))v[1]=Math.min(v[1],extensionGrade(v[0],v[2],ground)-.35);
   return belowRoad(v);
  };
  bankSpan('Verge',f=>[at(f,outerEdge,'upper'),at(f,35,'upper',-.30),at(f,39,'ground',-.7)].map(belowSquare),turf);
  if(side>0){
   const sections=terraceFrames.map(f=>({f,t:bankTerrace(f.d)}));
   const surface=(name,section,material)=>ribbon(root,name,sections.map(({f,t})=>section(f,t)),material);
   const vertex=(f,t,o,level)=>{
    const l=terraceLevels(f.d,t,bankLevels(f.d,nat(f,o)),f.x+f.nx*o,nat(f,o));
    return point(f,o,level(l));
   };
   for(const inner of [true,false]){
    const n=inner?innerSteps:outerSteps;
    surface('Plaza terrace steps',(f,t)=>{
     const row=[],a=inner?walkEdge:t.lane,b=inner?t.inner:t.crest;
     for(let j=0;j<n;j++){
      for(const [offset,step] of [[j,j],[j+1,j],[j+1,j+1]]){
       const o=T.MathUtils.lerp(a,b,offset/n);
       row.push(vertex(f,t,o,l=>inner?T.MathUtils.lerp(l.walk,l.ramp,step/n):
        T.MathUtils.lerp(l.ramp,l.upper,T.MathUtils.lerp(offset/n,step/n,t.blend))));
      }
     }
     return row;
    },paving);
   }
   surface('Station promenade ramp',(f,t)=>[t.inner,t.lane].map(o=>vertex(f,t,o,l=>l.ramp)),mats.walkBuff??paving);
   surface('Terrace upper landing',(f,t)=>[t.crest,t.outer].map(o=>vertex(f,t,o,l=>l.upper)),paving);
   surface('Terrace verge',(f,t)=>[t.outer,Math.max(35,t.outer+1),40].map((o,i)=>{
    const v=vertex(f,t,o,l=>l.upper-[.035,.30,.75][i]);
    return belowSquare(v,i);
   }),turf);
   // Short planter beds sit beside the ramp, leaving both ends and its full width open.
   const leaf=new T.MeshStandardMaterial({color:0x63804b,roughness:1});
   for(const [i,{f,t}] of sections.entries()){
    if(i%9!==0||t.blend<.99||Math.abs(f.d-landing)<27)continue;
    const o=t.inner-1.05,l=terraceLevels(f.d,t,bankLevels(f.d,nat(f,o)),f.x+f.nx*o,nat(f,o)),y=terraceFloor(o,t,l);
    for(const [name,w,h,len,base,mat] of [['Terrace planter',1.4,.64,5.4,-.12,concrete],['Terrace planting soil',1.22,.08,5.16,.5,leaf]]){
     const m=new T.Mesh(new T.BoxGeometry(w,h,len),mat);m.name=name;
     m.position.set(f.x+f.nx*o,y+base+h/2,f.z+f.nz*o);m.rotation.y=Math.atan2(-f.nz,f.nx);root.add(m);
    }
    const crown=new T.IcosahedronGeometry(1,1);
    for(let j=-2;j<=2;j++){
     const shrub=new T.Mesh(crown,leaf);shrub.name='Terrace shrub';
     shrub.position.set(f.x+f.nx*o+f.nz*j*.87,y+.65+.06*Math.sin(i+j),f.z+f.nz*o-f.nx*j*.87);
     shrub.rotation.y=i+j*2.4;shrub.scale.set(.60,.38+.10*Math.cos(j),.72);root.add(shrub);
    }
   }
  }
  // Waterfront concrete coping, dark reddish-brown top rail, 4 pale mint-green mid-rails and posts.
  span('Promenade coping',f=>[
   at(f,waterHalf,'walk',0),at(f,waterHalf,'walk',.075),
   at(f,waterHalf+.36,'walk',.075),at(f,waterHalf+.36,'walk',0)
  ],concrete);
  span('Promenade handrail',f=>[
   at(f,waterHalf+.11,'walk',1.04),at(f,waterHalf+.11,'walk',1.12),
   at(f,waterHalf+.25,'walk',1.12),at(f,waterHalf+.25,'walk',1.04),
   at(f,waterHalf+.11,'walk',1.04)
  ],topRail);
  for(const height of [.24,.45,.66,.87]){
   span('Promenade mid-rail',f=>[
    at(f,waterHalf+.164,'walk',height-.016),at(f,waterHalf+.164,'walk',height+.016),
    at(f,waterHalf+.196,'walk',height+.016),at(f,waterHalf+.196,'walk',height-.016),
    at(f,waterHalf+.164,'walk',height-.016)
   ],mintSteel);
  }
  const posts=riverFrames,mesh=new T.InstancedMesh(postGeo,mintSteel,posts.length);
  const m4=new T.Matrix4(),rot=new T.Matrix4();
  posts.forEach((f,i)=>{
   const [x,y,z]=at(f,waterHalf+.18,'walk',0);
   rot.makeRotationY(Math.atan2(-f.nz,f.nx));
   m4.makeTranslation(x,y,z).multiply(rot);
   mesh.setMatrixAt(i,m4);
  });
  mesh.instanceMatrix.needsUpdate=true;mesh.castShadow=false;mesh.receiveShadow=true;
  mesh.name='Waterfront railing posts';root.add(mesh);
 }
 // The open reach emerges from and returns to covered drainage at its two ends.
 for(const f of [riverFrames[0],riverFrames.at(-1)]){
  const n=nat(f,0),cap=new T.Mesh(new T.BoxGeometry(2*waterHalf+.6,.48,5),concrete);
  cap.name='Drainage portal lintel';cap.position.set(f.x,n-.21,f.z);cap.rotation.y=Math.atan2(-f.nz,f.nx);root.add(cap);
  const sign=f.d===0?-1:1,roof=[0,4,12,18].map(dist=>[-36,36].map(o=>{
   const x=f.x+o*f.nx+sign*dist*f.nz,z=f.z+o*f.nz-sign*dist*f.nx;
   return [x,ground(x,z)-.01-.025*dist,z,o/5,dist/5];
  }));
  ribbon(root,'Covered channel approach',sign<0?roof.reverse():roof,turf);
 }
 return root;
}

function bridgeMaterials(mats){
 // Streaks and formwork joints on the exposed concrete fascia and end blocks.
 const c=document.createElement('canvas');c.width=256;c.height=128;
 const ctx=c.getContext('2d');ctx.fillStyle='#b9b6aa';ctx.fillRect(0,0,256,128);
 for(let x=0;x<256;x++){
  const dirt=(Math.sin(x*.33)+Math.sin(x*.12)+Math.cos(x*2.17)+3)/6;
  ctx.fillStyle='rgba(69,65,53,'+(.04+.12*dirt)+')';ctx.fillRect(x,0,1,128*dirt);
 }
 ctx.fillStyle='#88877f';ctx.fillRect(0,0,1,128);
 const map=new T.CanvasTexture(c);map.wrapS=map.wrapT=T.RepeatWrapping;map.colorSpace=T.SRGBColorSpace;
 const concrete=new T.MeshStandardMaterial({map,roughness:.96,side:T.DoubleSide});
 const steel=mats.galvanised.clone();steel.side=T.DoubleSide;
 return {concrete,steel};
}

function bridgeSweep(root,frame){
 // Closed cross sections with capped ends and flat faces. Longitudinal stations follow the built road.
 return function sweep(name,start,end,profile,mat){
  const n=Math.ceil((end-start)/1.1),pos=[],uv=[],ix=[];
  for(let i=0;i<=n;i++){
   const d=start+(end-start)*i/n,f=frame(d),section=profile(d),k=section.length;
   const v=(o,h)=>[f.x+f.lx*o,f.y+h,f.z+f.lz*o];
   for(let j=0;j<k;j++){
    const p=section[j],q=section[(j+1)%k],row=pos.length/3;
    pos.push(...v(...p),...v(...q));uv.push(d/4,p[1]/2,d/4,q[1]/2);
    if(i){const h=row-2*k;ix.push(h,h+1,row,h+1,row+1,row);}
   }
   if(i===0||i===n){
    const base=i*2*k,faces=T.ShapeUtils.triangulateShape(section.map(([o,h])=>new T.Vector2(o,h)),[]);
    for(const tri of faces)ix.push(...(i?tri:tri.reverse()).map(j=>base+2*j));
   }
  }
  const geo=new T.BufferGeometry();geo.setAttribute('position',new T.Float32BufferAttribute(pos,3));geo.setAttribute('uv',new T.Float32BufferAttribute(uv,2));geo.setIndex(ix);geo.computeVertexNormals();
  const m=new T.Mesh(geo,mat);m.name=name;m.castShadow=m.receiveShadow=true;root.add(m);return m;
 };
}

// The rail meets a solid concrete shoulder at the deck joint. The path end has
// a square nose. On a roadside verge the shoulder anchors a W-beam instead.
function bridgeParapet(sweep,a,b,edge,side,level,materials,roadside){
 const {concrete,steel}=materials;
 const profile=(d,points)=>{
  const base=level(d);return points.map(([o,h])=>[edge+side*o,base+h]);
 };
 const wall=h=>[[0,-.10],[0,.12],[.075,.32],[.12,.36],[.12,h-.035],
  [.155,h],[.425,h],[.46,h-.035],[.46,-.10]];
 sweep('Battered concrete parapet',a,b,d=>profile(d,wall(.83)),concrete);
 sweep('Parapet top rail',a,b,d=>profile(d,[[.21,1.015],[.32,1.015],[.32,1.10],[.21,1.10]]),steel);
 const bays=Math.ceil((b-a-.9)/2.4),posts=[];
 for(let i=0;i<=bays;i++){
  const d=a+.45+(b-a-.9)*i/bays;
  posts.push(sweep('Top rail supports',d-.045,d+.045,s=>profile(s,[[.22,.83],[.31,.83],[.31,1.02],[.22,1.02]]),steel));
 }
 const mergedPosts=mergeGeometries(posts.map(post=>post.geometry));
 for(const post of posts){post.geometry.dispose();if(post!==posts[0])post.removeFromParent();}
 posts[0].geometry=mergedPosts;
 for(const [end,dir] of [[a,-1],[b,1]]){
  const approach=(name,from,to,shape,mat)=>{
   const d0=end+dir*from,d1=end+dir*to;
   sweep(name,Math.min(d0,d1),Math.max(d0,d1),d=>profile(d,shape((d-end)*dir)),mat);
  };
  const beam=roadside(end),nose=beam?3.45:2.9;
  approach('Concrete parapet end block',0,nose,t=>{
   const h=T.MathUtils.lerp(1.10,beam ? .76 : .70,T.MathUtils.clamp((t-.32)/(nose-.72),0,1));
   return wall(h);
  },concrete);
  if(!beam)continue;
  // The pressed beam overlaps both concrete anchors. Its lower end follows the
  // verge down to the splayed concrete toe, as in the roadside reference.
  approach('Approach W-beam',nose-.58,8.8,t=>{
   const drop=.33*T.MathUtils.clamp((t-5.2)/3.6,0,1);
   return [[.13,.44],[.045,.49],[.12,.59],[.045,.69],[.13,.75],
    [.15,.75],[.065,.69],[.14,.59],[.065,.49],[.15,.44]].map(([o,h])=>[o,h-drop]);
  },steel);
  for(const t of [4,6,8]){
   const h=.69-.33*T.MathUtils.clamp((t-5.2)/3.6,0,1);
   approach('Approach rail post',t-.06,t+.06,()=>[[.13,0],[.25,0],[.25,h],[.13,h]],steel);
  }
  approach('Guardrail concrete toe',8.32,10.8,t=>{
   const h=T.MathUtils.lerp(.51,.13,T.MathUtils.clamp((t-8.8)/2,0,1));
   return [[.11,-.10],[.11,h-.025],[.135,h],[.435,h],[.46,h-.025],[.46,-.10]];
  },concrete);
 }
}

function buildD6Bridge(group,{r,F,P},materials){
 const half=P.carriageway/2+P.footpath,span=d6Span(r,F,half);
 if(!span)return;
 const [a,b]=span,root=new T.Group();root.name='Road D6 river bridge';group.add(root);
 const {concrete}=materials,frame=d=>frameAt(F,d),sweep=bridgeSweep(root,frame);
 const soffit=d=>-.77-1.16*Math.pow(Math.abs(2*(d-a)/(b-a)-1),2.6);
 sweep('Single-span concrete deck',a,b,d=>[[-half,-.06],[half,-.06],[half,soffit(d)+.20],[half-.32,soffit(d)],[-half+.32,soffit(d)],[-half,soffit(d)+.20]],concrete);
 for(const sign of [-1,1]){
  const edge=sign*(half-.48);
  const lateral=sign*(half-.24);
  const level=d=>streetLevel(r,d,lateral)+(frame(d).crossSlope||0)*lateral;
  bridgeParapet(sweep,a,b,edge,sign,level,materials,end=>{
   const f=frame(end),x=f.x+f.lx*lateral,z=f.z+f.lz*lateral;
   return !inSquareExtension(x,z,2);
  });
 }
 for(const end of [a,b]){
  sweep('Bank abutment',end-.45,end+.45,()=>[[-half,-1.83],[half,-1.83],[half,-7.0],[-half,-7.0]],concrete);
 }
}

function riverBridge(group,name,frames,width,frame,level,mats,materials){
 // Carriageway/track surfaces already exist. Sweep the viaduct box section just under them.
 const crossing=frames.filter(f=>riverReserve(f.x,f.z,3));
 if(crossing.length<2)return;
 const root=new T.Group();root.name=name;group.add(root);
 const at=(f,o,h)=>[f.x+f.lx*o,f.y+h,f.z+f.lz*o,o/5,f.d/5],half=width/2;
 const section=(n,profile,mat)=>ribbon(root,n,crossing.map(f=>profile.map(([o,h])=>at(f,o,h))),mat);
 section('Haunched concrete box girder',[[-half,-.07],[-half,-.36],[-half*.64,-.67],[-half*.55,-1.36],[half*.55,-1.36],[half*.64,-.67],[half,-.36],[half,-.07]],mats.concrete);
 const sweep=bridgeSweep(root,frame);
 for(const side of [-1,1]){
  bridgeParapet(sweep,crossing[0].d,crossing.at(-1).d,side*(half-.48),side,level,materials,()=>false);
 }
 for(const f of [crossing[0],crossing.at(-1)]){
  const abut=new T.Mesh(new T.BoxGeometry(width*.86,6,.95),mats.concrete);abut.name='Bank abutment';abut.position.set(f.x,f.y-3.32,f.z);abut.rotation.y=Math.atan2(f.lz,-f.lx);root.add(abut);
 }
}
const CAPTURE_NAMES=new Set(['Flowing water','Riverside promenade','Promenade access ramp','Upper riverside footpath','Grassed embankment','Plaza terrace steps','Station promenade ramp','Terrace upper landing']);
export function buildA2River(scene,{ground,mats,time,network}){
 const root=channelMesh(scene,mats,ground,time);
 const d6=junctions(network,ground).roads.find(o=>o.r.id==='city-d6');
 const materials=bridgeMaterials(mats);
 if(d6)buildD6Bridge(root,d6,materials);
 const roads=[],cycles=[];
 const start=project(-45,-1020);
 const cycleFrame=s=>{const c=cycleSample(s);return {...c,y:c.groundY+cycleBridgeHeight(s)};};
 for(let s=Math.max(0,start-185);s<Math.min(LENGTH,start+185);s+=2){
  roads.push({...sample(s),d:s});cycles.push({...cycleFrame(s),d:s});
 }
 riverBridge(root,'SGMTS river bridge',roads,roadSection(start).right-roadSection(start).left+7.5,sample,footpathHeight,mats,materials);
 riverBridge(root,'Cycleway river bridge',cycles,CYCLE_WIDTH+.96,cycleFrame,()=>0,mats,materials);
 mergeByMaterial(root,{skip:m=>CAPTURE_NAMES.has(m.name)});
 return root;
}
