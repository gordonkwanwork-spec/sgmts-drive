import * as T from 'three';
import {mergeGeometries} from 'three/addons/utils/BufferGeometryUtils.js';
import {mergeByMaterial} from './batching.js';

// Procedural 3rd-gen Toyota Coaster (B40/B50 / BZB40) Hong Kong 16-seat Green Minibus.
// Local frame: -Z forward, +Z rear, -X left (kerbside door), +X right (RHD driver), Y=0 ground.
const WHEEL_R=0.35;
const FRONT_AXLE_Z=-2.21;
const REAR_AXLE_Z=1.28;
const ARCH_R=0.42;
const BODY_W=0.985;
const ROOF_Y=2.31;
const CROWN_Y=2.62;
const FRONT_Z=-3.412;
const REAR_Z=3.418;
const R_FRONT=0.20;
const R_REAR=0.18;
const REAR_SIDE_JOIN=3.08;
const REAR_DOOR_SEAMS=[[-0.505,-0.495],[0.016,0.026]];

function halfW(y){
 if(y<1.44){
  const u=Math.max(0,Math.min(1,(y-0.33)/1.11));
  return 0.950+0.030*u+0.028*Math.sin(u*Math.PI);
 }
 if(y<=ROOF_Y){
  const u=(y-1.44)/0.87;
  return 0.980-0.055*(0.55*u+0.45*u*u);
 }
 const t=Math.min(1,Math.max(0,(y-ROOF_Y)/(CROWN_Y-ROOF_Y)));
 return 0.925*Math.sqrt(Math.max(0,1-t*t));
}

function zFront(y){
 if(y<0.55){
  const u=Math.max(0,Math.min(1,(y-0.32)/0.23));
  return -3.412-0.024*Math.sin(u*Math.PI);
 }
 if(y<0.82)return FRONT_Z;
 if(y<1.42){
  const u=(y-0.82)/0.60;
  return FRONT_Z-0.015*Math.sin(u*Math.PI)+0.068*(0.45*u*u+0.55*u);
 }
 if(y<=ROOF_Y){
  const u=(y-1.42)/0.89;
  return -3.344+0.484*u-0.016*Math.sin(u*Math.PI);
 }
 const t=Math.min(1,Math.max(0,(y-ROOF_Y)/(CROWN_Y-ROOF_Y)));
 return -2.86+0.42*(1-Math.sqrt(Math.max(0,1-t*t)));
}

function zRear(y){
 if(y<0.55){
  const u=Math.max(0,Math.min(1,(y-0.32)/0.23));
  return 3.424+0.022*Math.sin(u*Math.PI);
 }
 if(y<1.44){
  const u=(y-0.55)/0.89;
  return REAR_Z+0.012*Math.sin(u*Math.PI)-0.036*u;
 }
 if(y<=ROOF_Y){
  const u=(y-1.44)/0.87;
  return 3.382-0.072*u+0.010*Math.sin(u*Math.PI);
 }
 const t=Math.min(1,Math.max(0,(y-ROOF_Y)/(CROWN_Y-ROOF_Y)));
 return 3.31-0.30*(1-Math.sqrt(Math.max(0,1-t*t)));
}

// Evaluates point & outward normal along the continuous front or rear wrap-around contour.
function hullSample(end,s,y,offset=0,edgeScale=1,sideExt=0.10){
 const W=halfW(y),R=Math.min(W*0.42,(end<0?R_FRONT:R_REAR)*edgeScale),flatW=Math.max(0.05,W-R);
 const z0=end<0?zFront(y):zRear(y),sign=s<0?-1:1,absS=Math.abs(s);
 const sCorner=0.76;
 let x,z,nx,nz;
 if(absS<=sCorner){
  const u=s/sCorner;
  x=u*flatW;
  const bow=(end<0?-0.040:0.030)*(1-u*u);
  z=z0+bow;
  const dzdx=(end<0?0.080:-0.060)*u/flatW;
  const len=Math.hypot(dzdx,1)||1;
  nx=dzdx*(end<0?-1:1)/len;
  nz=(end<0?-1:1)/len;
 }else if(absS<=0.94){
  const a=((absS-sCorner)/(0.94-sCorner))*(Math.PI/2);
  x=sign*(flatW+R*Math.sin(a));
  z=z0+(end<0?1:-1)*R*(1-Math.cos(a));
  nx=sign*Math.sin(a);
  nz=(end<0?-1:1)*Math.cos(a);
 }else{
  const k=(absS-0.94)/0.06;
  x=sign*W;
  z=z0+(end<0?1:-1)*(R+k*sideExt);
  nx=sign;
  nz=0;
 }
 const dy=0.02,zUp=end<0?zFront(y+dy):zRear(y+dy),zDn=end<0?zFront(Math.max(0.3,y-dy)):zRear(Math.max(0.3,y-dy));
 const dzdy=(zUp-zDn)/(2*dy),dwdy=(halfW(y+dy)-halfW(Math.max(0.3,y-dy)))/(2*dy);
 const ny=-nz*dzdy-Math.abs(nx)*dwdy;
 const nLen=Math.hypot(nx,ny,nz)||1;
 return {x:x+nx/nLen*offset,y:y+ny/nLen*offset,z:z+nz/nLen*offset,nx:nx/nLen,ny:ny/nLen,nz:nz/nLen};
}

// Builds a smooth-shaded BufferGeometry strip along the front/rear hull (indexed vertex-normal computation).
function hullStrip(end,sList,yList,offset=0,sideExt=0.10){
 const cols=sList.length,rows=yList.length,pos=[],uv=[],indices=[];
 for(let j=0;j<rows;j++){
  const y=yList[j];
  for(let i=0;i<cols;i++){
   const p=hullSample(end,sList[i],y,offset,1,sideExt);
   pos.push(p.x,p.y,p.z);
   uv.push(i/(cols-1),j/(rows-1));
  }
 }
 const flip=end>0;
 for(let j=0;j<rows-1;j++){
  for(let i=0;i<cols-1;i++){
   const a=j*cols+i,b=j*cols+i+1,c=(j+1)*cols+i+1,d=(j+1)*cols+i;
   if(flip)indices.push(a,b,c,a,c,d);
   else indices.push(a,c,b,a,d,c);
  }
 }
 const g=new T.BufferGeometry();
 g.setAttribute('position',new T.Float32BufferAttribute(pos,3));
 g.setAttribute('uv',new T.Float32BufferAttribute(uv,2));
 g.setIndex(indices);
 g.computeVertexNormals();
 const ni=g.toNonIndexed();
 g.dispose();
 return ni;
}

// Tile the rear skin edge-to-edge so paint, rubber, glass and door gaps share vertices.
function addRearWindowBand(parts){
 const sill=1.44,bottom=1.48,seal=0.023,radius=0.055;
 const panes=[
  {left:-0.77,right:-0.548,top:2.265},
  {left:-0.452,right:-0.025,top:2.215},
  {left:0.068,right:0.77,top:2.265}
 ];
 const levels=new Set([sill-0.006,sill,1.68,1.90,2.11,ROOF_Y,ROOF_Y+0.006]);
 for(const {top} of panes){
  for(const d of [0,0.006,0.014,seal,0.030,0.043,radius]){
   levels.add(bottom+d);
   levels.add(top-d);
  }
 }
 const heights=[...levels].sort((a,b)=>a-b);
 const buffers=new Map();
 function span(material,a,b,steps,ya,yb){
  // Each boundary is a pair of contour coordinates, at the lower and upper row.
  if(!buffers.has(material))buffers.set(material,{pos:[],norm:[],uv:[]});
  const {pos,norm,uv}=buffers.get(material);
  function point(t,row){
   const height=row?yb:ya,y=Math.min(ROOF_Y,Math.max(sill,height)),s=a[row]+(b[row]-a[row])*t;
   // End the corner exactly where the side window frame begins.
   // Fold the top and bottom edges behind the roof and lower panel.
   const p=hullSample(1,s,y,height===y?0:-0.025,1,zRear(y)-R_REAR-REAR_SIDE_JOIN);
   p.y=height;
   return {p,s,y};
  }
  function vertex({p,s,y}){
   pos.push(p.x,p.y,p.z);
   norm.push(Math.abs(s)<=0.76?-p.nx:p.nx,p.ny,p.nz);
   uv.push((s+1)/2,y/ROOF_Y);
  }
  let low=point(0,0),high=point(0,1);
  for(let i=1;i<=steps;i++){
   const nextLow=point(i/steps,0),nextHigh=point(i/steps,1);
   for(const v of [low,nextLow,nextHigh,low,nextHigh,high])vertex(v);
   low=nextLow;high=nextHigh;
  }
 }
 function cornerInset(y,top,inset){
  const r=radius-inset;
  const d=Math.min(r,Math.max(0,bottom+radius-y,y-(top-radius)));
  return radius-Math.sqrt(Math.max(0,r*r-d*d));
 }
 const fixed=s=>[s,s];
 for(let j=1;j<heights.length;j++){
  const ya=heights[j-1],yb=heights[j],mid=(ya+yb)/2;
  let edge=fixed(-1);
  const strip=(material,next,steps=1)=>{
   span(material,edge,next,steps,ya,yb);
   edge=next;
  };
  for(const s of [-0.94,-0.90,-0.86,-0.82])strip('cream',fixed(s),2);
  for(const [i,{left,right,top}] of panes.entries()){
   const bounds=(base,sign,inset)=>[ya,yb].map(y=>base+sign*cornerInset(y,top,inset));
   const surround=mid>bottom&&mid<top?'dark':'cream';
   const center=mid>bottom+seal&&mid<top-seal?'glass':surround;
   strip('cream',bounds(left,1,0),2);
   strip(surround,bounds(left,1,seal));
   strip(center,bounds(right,-1,seal),6);
   strip(surround,bounds(right,-1,0));
   const seam=REAR_DOOR_SEAMS[i];
   if(seam){
    strip('cream',fixed(seam[0]),2);
    strip('dark',fixed(seam[1]));
   }
  }
  for(const s of [0.82,0.86,0.90,0.94,1])strip('cream',fixed(s),2);
 }
 for(const [material,{pos,norm,uv}] of buffers){
  const g=new T.BufferGeometry();
  g.setAttribute('position',new T.Float32BufferAttribute(pos,3));
  g.setAttribute('normal',new T.Float32BufferAttribute(norm,3));
  g.setAttribute('uv',new T.Float32BufferAttribute(uv,2));
  parts[material].push(g);
  // The cabin sees the upholstered back of the painted surround and seals.
  if(material!=='glass'){
   const lining=g.clone(),indices=[];
   for(let i=0;i<pos.length/3;i+=3)indices.push(i,i+2,i+1);
   lining.setIndex(indices);
   lining.computeVertexNormals();
   parts.liner.push(lining);
  }
 }
}

// Builds a double-walled barrel-curved rectangular side panel along X = side * (halfW(y) - inset)
// with smooth indexed vertex normals across yList.
function sideLoft(side,z0,z1,yList,thickness=0.04,inset=0,doubleWall=true){
 const nz=Math.max(1,Math.round((z1-z0)/0.45)),cols=nz+1,rows=yList.length;
 const makeFace=(inward,faceInset)=>{
  const pos=[],uv=[],indices=[];
  for(let j=0;j<rows;j++){
   const y=yList[j],wx=side*(halfW(y)-faceInset);
   for(let i=0;i<cols;i++){
    const z=z0+(z1-z0)*(i/(cols-1));
    pos.push(wx,y,z);
    uv.push((z+3.5)/7,(y-0.3)/2.1);
   }
  }
  const flip=(side<0)!==inward;
  for(let j=0;j<rows-1;j++){
   for(let i=0;i<cols-1;i++){
    const a=j*cols+i,b=j*cols+i+1,c=(j+1)*cols+i+1,d=(j+1)*cols+i;
    if(flip)indices.push(a,b,c,a,c,d);
    else indices.push(a,c,b,a,d,c);
   }
  }
  const g=new T.BufferGeometry();
  g.setAttribute('position',new T.Float32BufferAttribute(pos,3));
  g.setAttribute('uv',new T.Float32BufferAttribute(uv,2));
  g.setIndex(indices);
  g.computeVertexNormals();
  const ni=g.toNonIndexed();
  g.dispose();
  return ni;
 };
 const geos=[makeFace(false,inset)];
 if(doubleWall&&thickness>0.015){
  geos.push(makeFace(true,inset+thickness));
  // Thin flat perimeter jambs closing top, bottom, front, rear edges
  const pushQuad=(p0,p1,p2,p3)=>{
   const g=new T.BufferGeometry();
   g.setAttribute('position',new T.Float32BufferAttribute([...p0,...p1,...p2,...p0,...p2,...p3],3));
   g.setAttribute('uv',new T.Float32BufferAttribute([0,0,1,0,1,1,0,0,1,1,0,1],2));
   g.computeVertexNormals();
   geos.push(g);
  };
  const xo=y=>side*(halfW(y)-inset),xi=y=>side*(halfW(y)-inset-thickness);
  const yb=yList[0],yt=yList[rows-1];
  for(let j=0;j<rows-1;j++){
   const ya=yList[j],yc=yList[j+1];
   if(side<0){
    pushQuad([xo(ya),ya,z0],[xi(ya),ya,z0],[xi(yc),yc,z0],[xo(yc),yc,z0]);
    pushQuad([xi(ya),ya,z1],[xo(ya),ya,z1],[xo(yc),yc,z1],[xi(yc),yc,z1]);
   }else{
    pushQuad([xi(ya),ya,z0],[xo(ya),ya,z0],[xo(yc),yc,z0],[xi(yc),yc,z0]);
    pushQuad([xo(ya),ya,z1],[xi(ya),ya,z1],[xi(yc),yc,z1],[xo(yc),yc,z1]);
   }
  }
  if(side<0){
   pushQuad([xo(yt),yt,z0],[xi(yt),yt,z0],[xi(yt),yt,z1],[xo(yt),yt,z1]);
   pushQuad([xi(yb),yb,z0],[xo(yb),yb,z0],[xo(yb),yb,z1],[xi(yb),yb,z1]);
  }else{
   pushQuad([xi(yt),yt,z0],[xo(yt),yt,z0],[xo(yt),yt,z1],[xi(yt),yt,z1]);
   pushQuad([xo(yb),yb,z0],[xi(yb),yb,z0],[xi(yb),yb,z1],[xo(yb),yb,z1]);
  }
 }
 const merged=mergeGeometries(geos);
 geos.forEach(g=>g.dispose());
 return merged;
}

// Builds a barrel-curved wheel-arch surround spandrel spanning [cz - halfZ, cz + halfZ] x [0.33, yTop]
// with clean radial cutout around (cz, WHEEL_R, ARCH_R) and smooth vertex normals.
function wheelArchSpandrel(side,cz,halfZ=0.46,yTop=0.82,thickness=0.04){
 const radSteps=3,pos=[],uv=[],indices=[];
 const halfH=yTop-WHEEL_R,yMin=0.33;
 const thL=Math.atan2(halfH,halfZ),thR=Math.PI-thL;
 const thList=[0];
 for(let i=1;i<18;i++){const th=(i/18)*Math.PI;thList.push(th);}
 thList.push(Math.PI,thL,thR);
 thList.sort((a,b)=>a-b);
 // Deduplicate angles closer than 1e-4
 const angles=thList.filter((v,idx)=>idx===0||v-thList[idx-1]>1e-4);
 const seg=angles.length-1;
 for(let r=0;r<=radSteps;r++){
  const u=r/radSteps;
  for(const th of angles){
   const c=-Math.cos(th),s=Math.sin(th);
   const zIn=cz+ARCH_R*c,yIn=Math.max(yMin,WHEEL_R+ARCH_R*s);
   const tz=Math.abs(c)>1e-4?halfZ/Math.abs(c):1e6;
   const ty=s>1e-4?halfH/s:1e6;
   const tMax=Math.min(tz,ty);
   const zOut=cz+c*tMax,yOut=Math.max(yMin,WHEEL_R+s*tMax);
   const z=zIn+(zOut-zIn)*u,y=yIn+(yOut-yIn)*u;
   pos.push(side*halfW(y),y,z);
   uv.push((z+3.5)/7,(y-0.3)/2.1);
  }
 }
 const cols=seg+1,flip=side<0;
 for(let r=0;r<radSteps;r++){
  for(let i=0;i<seg;i++){
   const a=r*cols+i,b=r*cols+i+1,c=(r+1)*cols+i+1,d=(r+1)*cols+i;
   if(flip)indices.push(a,b,c,a,c,d);
   else indices.push(a,c,b,a,d,c);
  }
 }
 const g=new T.BufferGeometry();
 g.setAttribute('position',new T.Float32BufferAttribute(pos,3));
 g.setAttribute('uv',new T.Float32BufferAttribute(uv,2));
 g.setIndex(indices);
 g.computeVertexNormals();
 const outer=g.toNonIndexed();
 g.dispose();
 // Add solid inward arch-lip flange sealing smoothly to recessed wheel-well barrel (x = +-0.935)
 const lipPos=[],lipUv=[],lipIdx=[];
 for(let i=0;i<=seg;i++){
  const th=angles[i],c=-Math.cos(th),s=Math.sin(th);
  const z=cz+ARCH_R*c,y=Math.max(yMin,WHEEL_R+ARCH_R*s);
  lipPos.push(side*halfW(y),y,z,side*0.935,y,z);
  lipUv.push(i/seg,0,i/seg,1);
 }
 for(let i=0;i<seg;i++){
  const a=i*2,b=a+1,c=a+3,d=a+2;
  if(flip)lipIdx.push(a,b,c,a,c,d);else lipIdx.push(a,c,b,a,d,c);
 }
 const lg=new T.BufferGeometry();
 lg.setAttribute('position',new T.Float32BufferAttribute(lipPos,3));
 lg.setAttribute('uv',new T.Float32BufferAttribute(lipUv,2));
 lg.setIndex(lipIdx);
 lg.computeVertexNormals();
 const lip=lg.toNonIndexed();
 lg.dispose();
 const merged=mergeGeometries([outer,lip]);
 outer.dispose();lip.dispose();
 return merged;
}

// Extrudes a closed or windowed side panel on X = side * halfW(y) from a 2D (z, y) Shape.
function sidePanel(side,shape,thickness=0.04,inset=0){
 const g=new T.ExtrudeGeometry(shape,{depth:thickness,bevelEnabled:false,curveSegments:16});
 const p=g.attributes.position,uv=g.attributes.uv;
 for(let i=0;i<p.count;i++){
  const z=p.getX(i),y=p.getY(i),d=p.getZ(i);
  const wx=side*(halfW(y)-inset-(side<0?thickness-d:d));
  p.setXYZ(i,wx,y,z);
  if(uv)uv.setXY(i,(z+3.5)/7,(y-0.3)/2.1);
 }
 g.computeVertexNormals();
 return g;
}

function addBox(list,w,h,d,x,y,z,rx=0,ry=0,rz=0){
 const g=new T.BoxGeometry(w,h,d);
 if(rx)g.rotateX(rx);if(ry)g.rotateY(ry);if(rz)g.rotateZ(rz);
 g.translate(x,y,z);
 list.push(g);
}

function addTube(list,a,b,r=0.015,seg=10){
 const dir=new T.Vector3().subVectors(b,a),len=dir.length();
 if(len<1e-4)return;
 const g=new T.CylinderGeometry(r,r,len,seg);
 g.translate(0,len/2,0);
 g.applyQuaternion(new T.Quaternion().setFromUnitVectors(new T.Vector3(0,1,0),dir.normalize()));
 g.translate(a.x,a.y,a.z);
 list.push(g);
}

function addFrameRect(list,x,y0,y1,z0,z1,t,d,axis='x'){
 const cy=(y0+y1)/2,cz=(z0+z1)/2,h=y1-y0,len=z1-z0;
 if(axis==='x'){
  addBox(list,d,t,len,x,y1-t/2,cz);
  addBox(list,d,t,len,x,y0+t/2,cz);
  addBox(list,d,h,t,x,cy,z0+t/2);
  addBox(list,d,h,t,x,cy,z1-t/2);
 }else{
  addBox(list,len,t,d,cz,y1-t/2,x);
  addBox(list,len,t,d,cz,y0+t/2,x);
  addBox(list,t,h,d,z0+t/2,cy,x);
  addBox(list,t,h,d,z1-t/2,cy,x);
 }
}

function addArchCutout(shape,cz,r=ARCH_R){
 shape.lineTo(cz-r,0.33);
 shape.absarc(cz,WHEEL_R,r,Math.PI,0,true);
 shape.lineTo(cz+r,0.33);
}

function makeCanvasTexture(w,h,draw){
 if(typeof document==='undefined')return null;
 const canvas=document.createElement('canvas');
 canvas.width=w;canvas.height=h;
 draw(canvas.getContext('2d'),w,h);
 const tex=new T.CanvasTexture(canvas);
 tex.colorSpace=T.SRGBColorSpace;
 tex.anisotropy=4;
 return tex;
}

// Builds a single or twin-dual 3D tyre geometry centered at local origin (axle along X).
function buildTyreGeometry(isDual){
 const offsets=isDual?[-0.112,0.112]:[0];
 const hw=isDual?0.090:0.095,rOut=WHEEL_R,rRim=0.205,rSh=0.336;
 const prof=[
  [rRim,-hw*0.86],[rRim+0.025,-hw*0.97],[rSh,-hw],
  [rOut,-hw*0.72],[rOut,hw*0.72],
  [rSh,hw],[rRim+0.025,hw*0.97],[rRim,hw*0.86],
  [rRim,-hw*0.86]
 ];
 const geos=[];
 for(const off of offsets){
  const pts=prof.map(([r,x])=>new T.Vector2(r,x+off));
  const g=new T.LatheGeometry(pts,28);
  g.rotateZ(-Math.PI/2);
  const ni=g.toNonIndexed();
  ni.computeVertexNormals();
  g.dispose();
  geos.push(ni);
 }
 const merged=mergeGeometries(geos);
 geos.forEach(g=>g.dispose());
 return merged;
}

// Builds a 3D vertex-colored cream steel rim + dark hub + lug bolts (single mesh per wheel pivot).
function buildRimGeometry(isDual,side){
 const geos=[];
 const pushColored=(geo,hex)=>{
  const g=geo.index?geo.toNonIndexed():geo;
  const col=new T.Color(hex),n=g.attributes.position.count,arr=new Float32Array(n*3);
  for(let i=0;i<n;i++){arr[i*3]=col.r;arr[i*3+1]=col.g;arr[i*3+2]=col.b;}
  g.setAttribute('color',new T.BufferAttribute(arr,3));
  g.computeVertexNormals();
  geos.push(g);
  if(g!==geo)geo.dispose();
 };
 const dishX=isDual?side*0.032:side*0.044;
 const lipX=isDual?side*0.184:side*0.086;
 const barrelPts=[
  new T.Vector2(0.195,-0.08),new T.Vector2(0.212,-0.08),
  new T.Vector2(0.212,lipX*side),new T.Vector2(0.196,lipX*side+0.014),
  new T.Vector2(0.172,lipX*side-0.006),new T.Vector2(0.135,dishX*side),
  new T.Vector2(0.068,dishX*side)
 ];
 const barrel=new T.LatheGeometry(barrelPts,24);
 barrel.rotateZ(side>0?-Math.PI/2:Math.PI/2);
 pushColored(barrel,0xd6c792);

 const back=new T.CylinderGeometry(0.19,0.19,0.018,22);
 back.rotateZ(Math.PI/2);
 back.translate(dishX-side*0.015,0,0);
 pushColored(back,0x1d2024);

 for(let i=0;i<5;i++){
  const a=i*(Math.PI*2/5);
  const slot=new T.CylinderGeometry(0.026,0.026,0.016,10);
  slot.rotateZ(Math.PI/2);
  slot.translate(dishX+side*0.005,Math.cos(a)*0.135,Math.sin(a)*0.135);
  pushColored(slot,0x181a1d);
 }

 const hub=new T.CylinderGeometry(0.056,0.064,isDual?0.09:0.055,16);
 hub.rotateZ(Math.PI/2);
 hub.translate(dishX+side*(isDual?0.025:0.015),0,0);
 pushColored(hub,0x74777c);

 const cap=new T.CylinderGeometry(0.036,0.042,0.03,14);
 cap.rotateZ(Math.PI/2);
 cap.translate(dishX+side*(isDual?0.065:0.036),0,0);
 pushColored(cap,0x272a2e);

 for(let i=0;i<5;i++){
  const a=i*(Math.PI*2/5)+Math.PI/5;
  const nut=new T.CylinderGeometry(0.011,0.011,0.022,6);
  nut.rotateZ(Math.PI/2);
  nut.translate(dishX+side*0.018,Math.cos(a)*0.088,Math.sin(a)*0.088);
  pushColored(nut,0x8f949a);
 }

 const merged=mergeGeometries(geos);
 geos.forEach(g=>g.dispose());
 return merged;
}

// Smooth curved indexed turquoise-green roof cap from y=ROOF_Y (2.31) rolling organically up to y=2.605.
function buildRoofCap(){
 const sCols=16,sideSteps=16;
 const sampleRing=(W,zf,zr,rf,rr,yBase,crownBump)=>{
  const pts=[];
  const add=(x,z)=>{
   const nxNorm=x/Math.max(0.1,W);
   const y=yBase+crownBump*(1-nxNorm*nxNorm);
   pts.push({x,y,z});
  };
  // Front arc (-X to +X, clockwise from above)
  const flatW=Math.max(0.02,W-rf);
  for(let i=0;i<=sCols;i++){
   const s=-1+2*(i/sCols),sign=s<0?-1:1,absS=Math.abs(s);
   if(absS<=0.76){
    const u=s/0.76;
    add(u*flatW,zf-0.030*(1-u*u));
   }else{
    const a=((absS-0.76)/0.24)*(Math.PI/2);
    add(sign*(flatW+rf*Math.sin(a)),zf+rf*(1-Math.cos(a)));
   }
  }
  const fR=pts[pts.length-1],flatWr=Math.max(0.02,W-rr);
  const rStartZ=zr-rr;
  for(let k=1;k<sideSteps;k++){
   const u=k/sideSteps;
   add(W,fR.z+(rStartZ-fR.z)*u);
  }
  // Rear arc (+X to -X)
  for(let i=0;i<=sCols;i++){
   const s=1-2*(i/sCols),sign=s<0?-1:1,absS=Math.abs(s);
   if(absS<=0.76){
    const u=s/0.76;
    add(u*flatWr,zr+0.022*(1-u*u));
   }else{
    const a=((absS-0.76)/0.24)*(Math.PI/2);
    add(sign*(flatWr+rr*Math.sin(a)),zr-rr*(1-Math.cos(a)));
   }
  }
  const rL=pts[pts.length-1],fL=pts[0];
  for(let k=1;k<sideSteps;k++){
   const u=k/sideSteps;
   add(-W,rL.z+(fL.z-rL.z)*u);
  }
  return pts;
 };

 const rings=[];
 // Rings 0..9: smooth quarter-ellipse shoulder roll from drip rail (y=2.31) to upper deck (y=2.56)
 for(let j=0;j<=9;j++){
  const a=(j/9)*(Math.PI/2),c=1-Math.cos(a),s=Math.sin(a);
  rings.push(sampleRing(0.925-0.25*c,-2.86+0.36*c,3.31-0.34*c,R_FRONT+0.04*c,R_REAR+0.04*c,ROOF_Y+0.25*s,0.008*s));
 }
 // Rings 10..14: gentle crowned top deck converging cleanly to center spine ridge (W=0)
 for(let j=1;j<=5;j++){
  const t=j/5,c=1-Math.cos(t*Math.PI/2),s=Math.sin(t*Math.PI/2);
  rings.push(sampleRing(0.675*(1-t),-2.50+0.48*c,2.97-0.48*c,Math.max(0.01,(R_FRONT+0.04)*(1-t)),Math.max(0.01,(R_REAR+0.04)*(1-t)),2.56+0.045*s,0.008));
 }

 const nRing=rings[0].length,pos=[],uv=[];
 for(let j=0;j<rings.length;j++){
  for(let i=0;i<nRing;i++){
   const p=rings[j][i];
   pos.push(p.x,p.y,p.z);
   uv.push((p.x+1)/2,(p.z+3.5)/7);
  }
 }
 const indices=[];
 for(let j=0;j<rings.length-1;j++){
  for(let i=0;i<nRing;i++){
   const i1=(i+1)%nRing;
   const a=j*nRing+i,b=j*nRing+i1,c=(j+1)*nRing+i1,d=(j+1)*nRing+i;
   indices.push(a,c,b,a,d,c);
  }
 }
 const g=new T.BufferGeometry();
 g.setAttribute('position',new T.Float32BufferAttribute(pos,3));
 g.setAttribute('uv',new T.Float32BufferAttribute(uv,2));
 g.setIndex(indices);
 g.computeVertexNormals();
 const ni=g.toNonIndexed();
 g.dispose();
 return ni;
}

// Smooth domed rear AC roof blister fairing sitting cleanly atop the curved roof crown.
function buildRoofBlister(){
 const rSteps=6,seg=28,pos=[],uv=[],indices=[];
 const rx=0.52,rz=0.40,cz=2.24,h=0.042;
 const yAt=(rScale,nx)=>{
  const roofY=2.595-0.025*(rScale*nx)*(rScale*nx);
  return roofY+h*Math.sin((1-rScale)*(Math.PI/2));
 };
 for(let j=0;j<=rSteps;j++){
  const rScale=Math.cos((j/rSteps)*(Math.PI/2));
  for(let i=0;i<seg;i++){
   const th=(i/seg)*Math.PI*2;
   const cx=Math.cos(th),sz=Math.sin(th);
   const norm=Math.pow(Math.abs(cx)**4+Math.abs(sz)**4,0.25)||1;
   const nx=cx/norm,nz=sz/norm;
   const x=rScale*rx*nx,z=cz+rScale*rz*nz,y=yAt(rScale,nx);
   pos.push(x,y,z);
   uv.push((x/rx+1)/2,((z-cz)/rz+1)/2);
  }
 }
 for(let j=0;j<rSteps;j++){
  for(let i=0;i<seg;i++){
   const i1=(i+1)%seg;
   const a=j*seg+i,b=j*seg+i1,c=(j+1)*seg+i1,d=(j+1)*seg+i;
   indices.push(a,c,b,a,d,c);
  }
 }
 const g=new T.BufferGeometry();
 g.setAttribute('position',new T.Float32BufferAttribute(pos,3));
 g.setAttribute('uv',new T.Float32BufferAttribute(uv,2));
 g.setIndex(indices);
 g.computeVertexNormals();
 const ni=g.toNonIndexed();
 g.dispose();
 return ni;
}

// Samples a rounded-rectangle loop with optional top shoulder taper.
function roundedLoopPts(w,h,r,seg=36,taper=0.09){
 const pts=[];
 for(let i=0;i<seg;i++){
  const th=(i/seg)*Math.PI*2;
  const s=Math.sin(th),c=Math.cos(th);
  // Superellipse p=5 gives sleek curved corners without pinching
  const d=Math.pow(Math.abs(s)**5+Math.abs(c)**5,0.2)||1;
  const ny=c/d,nx=s/d;
  const x=nx*(w/2)*(1-taper*Math.max(0,ny));
  const y=ny*(h/2);
  pts.push([x,y]);
 }
 return pts;
}

// Smooth, solid, outward-wound curvy front destination sign pod with recessed front pocket.
// Strictly encloses the front sign face so nothing black is ever visible from rear/sides.
function buildDestPod(){
 const seg=40,pos=[],uv=[],indices=[];
 const slices=[];
 const pushSlice=(zCenter,w,h,r,yCenter,tilt=0,taper=0.10)=>{
  const pts=roundedLoopPts(w,h,r,seg,taper);
  const ring=[];
  for(const [x,ly] of pts){
   const y=yCenter+ly;
   const z=zCenter+ly*tilt;
   ring.push([x,y,z]);
  }
  slices.push(ring);
 };
 // 0: recessed pocket back wall (behind sign face)
 pushSlice(-2.805,0.90,0.25,0.04,2.575,0.12,0.04);
 // 1: front molded green surround lip around pocket
 pushSlice(-2.865,1.14,0.42,0.11,2.565,0.14,0.11);
 // 2..13: smooth curvy fiberglass pod body tapering backward into roof crown
 const zList=[-2.83,-2.76,-2.66,-2.52,-2.36,-2.20,-2.04,-1.90,-1.78,-1.68];
 for(let k=0;k<zList.length;k++){
  const u=k/(zList.length-1),z=zList[k];
  // Smooth bell crest peaking at y=2.80 around z=-2.55, then melting down below 2.60 roof crown
  const yTop=u<0.32?2.77+0.03*Math.sin((u/0.32)*(Math.PI/2)):2.80-0.25*(0.5-0.5*Math.cos(((u-0.32)/0.68)*Math.PI));
  const yBot=2.34+0.12*u;
  const h=Math.max(0.10,yTop-yBot),yCenter=(yTop+yBot)/2;
  const w=1.20*(1-0.22*u*u);
  pushSlice(z,w,h,0.13,yCenter,0,0.14);
 }
 // 12: closed rear tail rim tucked inside the roof
 pushSlice(-1.64,0.78,0.06,0.03,2.45,0,0.10);

 for(const ring of slices){
  for(const [x,y,z] of ring){
   pos.push(x,y,z);
   uv.push((x+0.7)/1.4,(z+2.9)/1.3);
  }
 }
 const frontCenterIdx=pos.length/3;
 pos.push(0,2.575,-2.805);uv.push(0.5,0.5);
 const rearCenterIdx=pos.length/3;
 pos.push(0,2.45,-1.64);uv.push(0.5,0.5);

 // Front pocket cap (facing -Z out of pocket)
 for(let i=0;i<seg;i++){
  const i1=(i+1)%seg;
  indices.push(i,i1,frontCenterIdx);
 }
 // Outer & pocket lofted rings (outward normals along +Z progression)
 for(let k=0;k<slices.length-1;k++){
  for(let i=0;i<seg;i++){
   const i1=(i+1)%seg;
   const a=k*seg+i,b=k*seg+i1,c=(k+1)*seg+i1,d=(k+1)*seg+i;
   indices.push(a,d,c,a,c,b);
  }
 }
 // Rear closed tail cap (facing +Z)
 const lastStart=(slices.length-1)*seg;
 for(let i=0;i<seg;i++){
  const i1=(i+1)%seg;
  indices.push(lastStart+i,rearCenterIdx,lastStart+i1);
 }

 const g=new T.BufferGeometry();
 g.setAttribute('position',new T.Float32BufferAttribute(pos,3));
 g.setAttribute('uv',new T.Float32BufferAttribute(uv,2));
 g.setIndex(indices);
 g.computeVertexNormals();
 const ni=g.toNonIndexed();
 g.dispose();
 return ni;
}

// Creates a rounded-rectangle planar or ring geometry with normalized [0,1] UVs facing -Z.
function buildFrontSignSignFace(w,h,r){
 const hw=w/2-r,hh=h/2-r,s=new T.Shape();
 s.moveTo(-hw,-hh-r);s.lineTo(hw,-hh-r);
 s.absarc(hw,-hh,r,-Math.PI/2,0,false);
 s.lineTo(hw+r,hh);s.absarc(hw,hh,r,0,Math.PI/2,false);
 s.lineTo(-hw,hh+r);s.absarc(-hw,hh,r,Math.PI/2,Math.PI,false);
 s.lineTo(-hw-r,-hh);s.absarc(-hw,-hh,r,Math.PI,Math.PI*1.5,false);
 const g=new T.ShapeGeometry(s,8);
 const p=g.attributes.position,uv=g.attributes.uv;
 for(let i=0;i<p.count;i++){
  const x=p.getX(i),y=p.getY(i);
  uv.setXY(i,(x+w/2)/w,(y+h/2)/h);
 }
 g.rotateY(Math.PI); // Front normal now points strictly -Z
 return g;
}

// Creates a thin rounded-rectangle rubber bezel ring facing -Z inside the destination pod pocket.
function buildSignBezel(ow,oh,or,iw,ih,ir){
 const rect=(w,h,r,ccw)=>{
  const hw=w/2-r,hh=h/2-r,p=new T.Path();
  if(ccw){
   p.moveTo(-hw,-hh-r);p.lineTo(hw,-hh-r);p.absarc(hw,-hh,r,-Math.PI/2,0,false);
   p.lineTo(hw+r,hh);p.absarc(hw,hh,r,0,Math.PI/2,false);
   p.lineTo(-hw,hh+r);p.absarc(-hw,hh,r,Math.PI/2,Math.PI,false);
   p.lineTo(-hw-r,-hh);p.absarc(-hw,-hh,r,Math.PI,Math.PI*1.5,false);
  }else{
   p.moveTo(-hw,-hh-r);p.absarc(-hw,-hh,r,Math.PI*1.5,Math.PI,true);
   p.lineTo(-hw-r,hh);p.absarc(-hw,hh,r,Math.PI,Math.PI/2,true);
   p.lineTo(hw,hh+r);p.absarc(hw,hh,r,Math.PI/2,0,true);
   p.lineTo(hw+r,-hh);p.absarc(hw,-hh,r,0,-Math.PI/2,true);
   p.lineTo(-hw,-hh-r);
  }
  return p;
 };
 const s=new T.Shape(rect(ow,oh,or,true).getPoints(24));
 s.holes.push(rect(iw,ih,ir,false));
 const g=new T.ExtrudeGeometry(s,{depth:0.018,bevelEnabled:false,curveSegments:8});
 g.rotateY(Math.PI);
 return g;
}

function roundedBoxGeo(w,h,d,r=0.025){
 const hw=w/2-r,hh=h/2-r,s=new T.Shape();
 s.moveTo(-hw,-hh-r);s.lineTo(hw,-hh-r);
 s.absarc(hw,-hh,r,-Math.PI/2,0,false);
 s.lineTo(hw+r,hh);s.absarc(hw,hh,r,0,Math.PI/2,false);
 s.lineTo(-hw,hh+r);s.absarc(-hw,hh,r,Math.PI/2,Math.PI,false);
 s.lineTo(-hw-r,-hh);s.absarc(-hw,-hh,r,Math.PI,Math.PI*1.5,false);
 const g=new T.ExtrudeGeometry(s,{depth:Math.max(0.01,d-0.02),bevelEnabled:true,bevelThickness:0.01,bevelSize:0.01,bevelSegments:2,curveSegments:6});
 g.translate(0,0,-(d-0.02)/2);
 g.computeVertexNormals();
 return g;
}

export function buildGreenMinibus(spec={id:'minibus',width:2.2,length:7,height:2.8}){
 const root=new T.Group();
 root.name=spec.id||'minibus';
 root.userData.proceduralVehicle=spec.id||'minibus';

 // --- Shared Materials ---
 const mCream=new T.MeshStandardMaterial({color:0xf2e1a6,roughness:0.34,metalness:0.06});
 const mCrease=new T.MeshStandardMaterial({color:0xd1be82,roughness:0.45,metalness:0.04});
 const mGreen=new T.MeshStandardMaterial({color:0x0eb893,roughness:0.28,metalness:0.08});
 mGreen.name='minibus_green';
 const mDark=new T.MeshStandardMaterial({color:0x1b1e22,roughness:0.80,metalness:0.06});
 const mWell=new T.MeshStandardMaterial({color:0x15171a,roughness:0.92,metalness:0.04,side:T.DoubleSide});
 const mGrille=new T.MeshStandardMaterial({color:0x363b42,roughness:0.58,metalness:0.12});
 const mDash=new T.MeshStandardMaterial({color:0x2b3036,roughness:0.70,emissive:0x0e1012,emissiveIntensity:0.15});
 const mAlu=new T.MeshStandardMaterial({color:0xcfd4d8,metalness:0.78,roughness:0.28});
 const mChrome=new T.MeshStandardMaterial({color:0xe8ecef,metalness:0.92,roughness:0.12});
 const mGlass=new T.MeshStandardMaterial({color:0x1f2a30,roughness:0.08,metalness:0.18,transparent:true,opacity:0.42,depthWrite:false,side:T.DoubleSide});
 const mPerspex=new T.MeshStandardMaterial({color:0xdbe7ec,roughness:0.12,metalness:0.08,transparent:true,opacity:0.22,depthWrite:false,side:T.DoubleSide});
 const headlightTex=makeCanvasTexture(256,128,(ctx,w,h)=>{
  ctx.fillStyle='#f8f3e3';ctx.fillRect(0,0,w,h);
  for(const cx of [w*0.26,w*0.74]){
   const g=ctx.createRadialGradient(cx,h*0.5,6,cx,h*0.5,h*0.44);
   g.addColorStop(0,'#ffffff');g.addColorStop(0.65,'#ebe4d1');g.addColorStop(1,'#bfc4c9');
   ctx.fillStyle=g;ctx.beginPath();ctx.arc(cx,h*0.5,h*0.44,0,Math.PI*2);ctx.fill();
  }
  ctx.strokeStyle='rgba(150,158,168,0.45)';ctx.lineWidth=2;
  for(let x=6;x<w;x+=10){ctx.beginPath();ctx.moveTo(x,0);ctx.lineTo(x,h);ctx.stroke();}
  for(const y of [h*0.25,h*0.5,h*0.75]){ctx.beginPath();ctx.moveTo(0,y);ctx.lineTo(w,y);ctx.stroke();}
 });
 const mLight=new T.MeshStandardMaterial({
  color:0xfff4dc,map:headlightTex,emissive:0xfff4dc,emissiveMap:headlightTex,
  emissiveIntensity:0.35,roughness:0.12,metalness:0.1
 });
 mLight.name='light';mLight.userData.driveLamp='front';
 const tailRedTex=makeCanvasTexture(256,128,(ctx,w,h)=>{
  ctx.fillStyle='#c41d15';ctx.fillRect(0,0,w,h);
  ctx.fillStyle='#e23228';ctx.fillRect(10,14,w-20,h-28);
  ctx.strokeStyle='rgba(95,12,10,0.45)';ctx.lineWidth=3;
  for(let y=8;y<h;y+=12){ctx.beginPath();ctx.moveTo(0,y);ctx.lineTo(w,y);ctx.stroke();}
  ctx.beginPath();ctx.moveTo(w*0.52,0);ctx.lineTo(w*0.52,h);ctx.stroke();
 });
 const mRed=new T.MeshStandardMaterial({
  color:0xc52018,map:tailRedTex,emissive:0xc52018,emissiveMap:tailRedTex,
  emissiveIntensity:0.35,roughness:0.15,metalness:0.05
 });
 mRed.name='red';mRed.userData.driveLamp='rear';
 const amberTex=makeCanvasTexture(128,64,(ctx,w,h)=>{
  ctx.fillStyle='#e58918';ctx.fillRect(0,0,w,h);
  ctx.strokeStyle='rgba(140,65,8,0.4)';ctx.lineWidth=2;
  for(let y=6;y<h;y+=8){ctx.beginPath();ctx.moveTo(0,y);ctx.lineTo(w,y);ctx.stroke();}
  for(let x=8;x<w;x+=12){ctx.beginPath();ctx.moveTo(x,0);ctx.lineTo(x,h);ctx.stroke();}
 });
 const mAmber=new T.MeshStandardMaterial({color:0xe68a1a,map:amberTex,emissive:0x6a3500,emissiveMap:amberTex,emissiveIntensity:0.22,roughness:0.16});
 const clearTex=makeCanvasTexture(128,64,(ctx,w,h)=>{
  ctx.fillStyle='#dfe5ea';ctx.fillRect(0,0,w,h);
  ctx.strokeStyle='rgba(140,150,160,0.4)';ctx.lineWidth=2;
  for(let y=6;y<h;y+=8){ctx.beginPath();ctx.moveTo(0,y);ctx.lineTo(w,y);ctx.stroke();}
  for(let x=8;x<w;x+=12){ctx.beginPath();ctx.moveTo(x,0);ctx.lineTo(x,h);ctx.stroke();}
 });
 const mClearLamp=new T.MeshStandardMaterial({color:0xdde3e8,map:clearTex,roughness:0.18,metalness:0.15});

 const mReverse=mClearLamp.clone();mReverse.userData.driveLamp='reverse';
 for(const mat of [mCream,mGreen,mGlass,mChrome])mat.userData.driveReflective=true;

 // Interior materials
 const mLiner=new T.MeshStandardMaterial({color:0xe8e1ce,roughness:0.65,emissive:0xe8e1ce,emissiveIntensity:0.16});
 const mFloor=new T.MeshStandardMaterial({color:0x32373c,roughness:0.88,emissive:0x32373c,emissiveIntensity:0.14});
 const mYellow=new T.MeshStandardMaterial({color:0xf2c418,roughness:0.45,emissive:0xf2c418,emissiveIntensity:0.18});
 const mSeatTeal=new T.MeshStandardMaterial({color:0x1b7568,roughness:0.55,emissive:0x1b7568,emissiveIntensity:0.20});
 const mHeadrest=new T.MeshStandardMaterial({color:0xf2ede0,roughness:0.55,emissive:0xf2ede0,emissiveIntensity:0.18});
 const mSafetyRed=new T.MeshStandardMaterial({color:0xd12c22,roughness:0.42,emissive:0xd12c22,emissiveIntensity:0.18});
 const mCabinLed=new T.MeshStandardMaterial({color:0xfff7e6,emissive:0xfff2d6,emissiveIntensity:0.50,roughness:0.85});
 mCabinLed.name='minibus_cabin';

 const destTex=makeCanvasTexture(512,160,(ctx,w,h)=>{
  ctx.fillStyle='#14181b';ctx.fillRect(0,0,w,h);
  ctx.fillStyle='#13b892';ctx.fillRect(16,18,112,124);
  ctx.fillStyle='#09201a';ctx.font='bold 48px sans-serif';ctx.textAlign='center';ctx.textBaseline='middle';
  ctx.fillText('34A',72,82);
  ctx.fillStyle='#f6d66b';ctx.font='bold 54px sans-serif';ctx.textAlign='left';
  ctx.fillText('洪水橋',148,66);
  ctx.fillStyle='#e8edf0';ctx.font='bold 24px sans-serif';
  ctx.fillText('HUNG SHUI KIU',148,122);
 });
 const mSign=new T.MeshStandardMaterial({
  color:destTex?0xffffff:0x1a1e22,map:destTex,emissive:destTex?0xffffff:0x22302c,
  emissiveMap:destTex,emissiveIntensity:0.55,roughness:0.35
 });
 mSign.name='minibus_sign';

 const placardTex=makeCanvasTexture(512,200,(ctx,w,h)=>{
  ctx.fillStyle='#faf7ef';ctx.fillRect(0,0,w,h);
  ctx.strokeStyle='#159676';ctx.lineWidth=10;ctx.strokeRect(5,5,w-10,h-10);
  ctx.fillStyle='#d12020';ctx.font='bold 74px sans-serif';ctx.textAlign='left';ctx.textBaseline='middle';
  ctx.fillText('洪水橋',24,78);
  ctx.fillStyle='#154ea3';ctx.font='bold 34px sans-serif';
  ctx.fillText('HUNG SHUI KIU',26,154);
  ctx.fillStyle='#111';ctx.font='bold 54px sans-serif';ctx.textAlign='right';
  ctx.fillText('$6.5',w-24,96);
 });
 const mPlacard=new T.MeshStandardMaterial({
  color:placardTex?0xffffff:0xfaf7ef,map:placardTex,emissive:placardTex?0xfaf7ef:0xdad5c8,
  emissiveMap:placardTex,emissiveIntensity:0.25,roughness:0.45
 });

 const speedoTex=makeCanvasTexture(256,128,(ctx,w,h)=>{
  ctx.fillStyle='#111417';ctx.fillRect(0,0,w,h);
  ctx.strokeStyle='#353b40';ctx.lineWidth=4;ctx.strokeRect(4,4,w-8,h-8);
  ctx.fillStyle='#ff3322';ctx.font='bold 64px monospace';ctx.textAlign='center';ctx.textBaseline='middle';
  ctx.fillText('48',92,66);
  ctx.fillStyle='#cc3024';ctx.font='bold 22px sans-serif';
  ctx.fillText('km/h',175,78);
  ctx.fillStyle='#f2a918';ctx.font='bold 18px sans-serif';
  ctx.fillText('STOP 落車',180,32);
 });
 const mSpeedo=new T.MeshStandardMaterial({
  color:speedoTex?0xffffff:0x111417,map:speedoTex,emissive:0xff5533,
  emissiveMap:speedoTex,emissiveIntensity:1.1,roughness:0.4
 });

 const octoTex=makeCanvasTexture(128,160,(ctx,w,h)=>{
  ctx.fillStyle='#242a30';ctx.fillRect(0,0,w,h);
  ctx.fillStyle='#1b5c3b';ctx.fillRect(16,12,96,34);
  ctx.fillStyle='#8fffa8';ctx.font='bold 22px monospace';ctx.textAlign='center';ctx.textBaseline='middle';
  ctx.fillText('$6.5',64,29);
  ctx.fillStyle='#f39c12';ctx.beginPath();ctx.arc(64,102,38,0,Math.PI*2);ctx.fill();
  ctx.strokeStyle='#1565c0';ctx.lineWidth=8;ctx.beginPath();ctx.arc(64,102,24,0.3,Math.PI*1.65);ctx.stroke();
 });
 const mOcto=new T.MeshStandardMaterial({
  color:octoTex?0xffffff:0xf39c12,map:octoTex,emissive:octoTex?0xffffff:0x443311,
  emissiveMap:octoTex,emissiveIntensity:0.35,roughness:0.4
 });

 const gaugeTex=makeCanvasTexture(256,96,(ctx,w,h)=>{
  ctx.fillStyle='#171b1f';ctx.fillRect(0,0,w,h);
  for(const [cx,r,val] of [[78,36,-0.4],[178,36,0.3]]){
   ctx.strokeStyle='#5a6570';ctx.lineWidth=3;ctx.beginPath();ctx.arc(cx,50,r,Math.PI*0.75,Math.PI*2.25);ctx.stroke();
   ctx.strokeStyle='#e8edf0';ctx.lineWidth=2;ctx.beginPath();ctx.moveTo(cx,50);ctx.lineTo(cx+Math.cos(val)*28,50+Math.sin(val)*28);ctx.stroke();
  }
  ctx.fillStyle='#38d399';ctx.fillRect(120,66,16,8);
 });
 const mGauge=new T.MeshStandardMaterial({
  color:gaugeTex?0xffffff:0x171b1f,map:gaugeTex,emissive:gaugeTex?0x88ccff:0x112233,
  emissiveMap:gaugeTex,emissiveIntensity:0.45,roughness:0.4
 });

 const plateFrontTex=makeCanvasTexture(256,64,(ctx,w,h)=>{
  ctx.fillStyle='#f3f4f6';ctx.fillRect(0,0,w,h);
  ctx.strokeStyle='#222';ctx.lineWidth=4;ctx.strokeRect(3,3,w-6,h-6);
  ctx.fillStyle='#181a1d';ctx.font='bold 38px sans-serif';ctx.textAlign='center';ctx.textBaseline='middle';
  ctx.fillText('KH 3416',w/2,h/2+2);
 });
 const plateRearTex=makeCanvasTexture(256,64,(ctx,w,h)=>{
  ctx.fillStyle='#f2bd1d';ctx.fillRect(0,0,w,h);
  ctx.strokeStyle='#222';ctx.lineWidth=4;ctx.strokeRect(3,3,w-6,h-6);
  ctx.fillStyle='#181a1d';ctx.font='bold 38px sans-serif';ctx.textAlign='center';ctx.textBaseline='middle';
  ctx.fillText('KH 3416',w/2,h/2+2);
 });
 const mPlateF=new T.MeshStandardMaterial({color:plateFrontTex?0xffffff:0xf0f2f4,map:plateFrontTex,roughness:0.45});
 const mPlateR=new T.MeshStandardMaterial({color:plateRearTex?0xffffff:0xf2bd1d,map:plateRearTex,roughness:0.45});

 const parts={
  cream:[],crease:[],green:[],dark:[],well:[],grille:[],dash:[],alu:[],chrome:[],glass:[],perspex:[],
  light:[],red:[],amber:[],reverse:[],clearLamp:[],liner:[],floor:[],yellow:[],seatTeal:[],headrest:[],
  safetyRed:[],cabinLed:[],sign:[],placard:[],speedo:[],octo:[],gauge:[],plateF:[],plateR:[]
 };

 const sFull=[-1,-0.97,-0.94,-0.91,-0.88,-0.85,-0.82,-0.79,-0.76,-0.70,-0.60,-0.48,-0.36,-0.24,-0.12,0,0.12,0.24,0.36,0.48,0.60,0.70,0.76,0.79,0.82,0.85,0.88,0.91,0.94,0.97,1];

 // =========================================================================
 // 1. FRONT & REAR WRAP-AROUND HULL SURFACES + BODY-CONFORMING LIGHTS
 // =========================================================================
 // Front bumper (y=0.33..0.55, rounded bullnose & wrapback to z=-2.78)
 parts.cream.push(hullStrip(-1,sFull,[0.33,0.36,0.41,0.47,0.52,0.55],0.012,0.48));
 parts.dark.push(hullStrip(-1,sFull,[0.548,0.555],-0.008,0.48));
 addBox(parts.dark,0.92,0.05,0.03,0,0.35,-3.42);
 addBox(parts.dark,0.50,0.14,0.014,0,0.445,-3.478);
 addBox(parts.plateF,0.47,0.12,0.014,0,0.445,-3.488);

 // Front headlight/grille recessed fascia trough (y=0.545..0.82 so zero gap above bumper)
 parts.dark.push(hullStrip(-1,sFull,[0.545,0.68,0.82],-0.020,0.085));
 // 4 visible charcoal horizontal grille slats + central chrome Toyota emblem
 const sGrille=Array.from({length:11},(_,i)=>-0.35+0.70*(i/10));
 for(const gy of [0.60,0.66,0.72,0.78])parts.grille.push(hullStrip(-1,sGrille,[gy-0.014,gy+0.014],-0.001,0.08));
 parts.chrome.push(hullStrip(-1,[-0.075,0,0.075],[0.705,0.745],0.006,0.08));

 // Paired flush curved headlamps + wraparound front corner amber/clear turn-signal clusters
 for(const side of [-1,1]){
  const sLamp=Array.from({length:9},(_,i)=>side*(0.37+0.26*(i/8)));
  if(side<0)sLamp.reverse();
  parts.chrome.push(hullStrip(-1,sLamp,[0.585,0.795],-0.009,0.08));
  parts.light.push(hullStrip(-1,sLamp,[0.585,0.69,0.795],0.003,0.08));
  const sDiv=[side*0.495,side*0.508];if(side<0)sDiv.reverse();
  parts.chrome.push(hullStrip(-1,sDiv,[0.585,0.795],0.006,0.08));

  const sCorner=Array.from({length:12},(_,i)=>side*(0.635+0.345*(i/11)));
  if(side<0)sCorner.reverse();
  parts.clearLamp.push(hullStrip(-1,sCorner,[0.71,0.795],0.003,0.08));
  parts.amber.push(hullStrip(-1,sCorner,[0.585,0.70],0.003,0.08));
  const sSep=[side*0.625,side*0.638];if(side<0)sSep.reverse();
  parts.dark.push(hullStrip(-1,sSep,[0.58,0.80],0.006,0.08));
  const sEnd=[side*0.975,side*0.992];if(side<0)sEnd.reverse();
  parts.dark.push(hullStrip(-1,sEnd,[0.58,0.80],0.006,0.08));
 }
 parts.dark.push(hullStrip(-1,sFull,[0.565,0.582],0.005,0.08));
 parts.dark.push(hullStrip(-1,sFull,[0.798,0.816],0.005,0.08));

 // Front cream convex nose panel (y=0.815..1.35)
 parts.cream.push(hullStrip(-1,sFull,[0.815,0.92,1.04,1.16,1.27,1.35],0,0.06));
 parts.liner.push(hullStrip(-1,sFull,[0.82,1.35],-0.04,0.06));

 // Broad panoramic windscreen + SLIM corner A-pillars & slender rubber gasket (y=1.35..2.31)
 const sLeftA=[-1,-0.96,-0.92,-0.88,-0.842];
 const sRightA=[0.842,0.88,0.92,0.96,1];
 parts.cream.push(hullStrip(-1,sLeftA,[1.35,1.59,1.83,2.07,2.31],0,0.03));
 parts.cream.push(hullStrip(-1,sRightA,[1.35,1.59,1.83,2.07,2.31],0,0.03));
 const sGlass=[-0.818,-0.76,-0.65,-0.48,-0.32,-0.16,0,0.16,0.32,0.48,0.65,0.76,0.818];
 parts.dark.push(hullStrip(-1,sGlass,[1.35,1.374],0.004,0.03));
 parts.dark.push(hullStrip(-1,sGlass,[2.282,2.306],0.004,0.03));
 parts.dark.push(hullStrip(-1,[-0.844,-0.816],[1.35,1.83,2.306],0.004,0.03));
 parts.dark.push(hullStrip(-1,[0.816,0.844],[1.35,1.83,2.306],0.004,0.03));
 parts.glass.push(hullStrip(-1,sGlass,[1.374,1.60,1.84,2.08,2.282],0,0.03));

 // Rear bumper (y=0.33..0.55, rounded bullnose, closed step notch & flank wrap to z=+2.72)
 const sRearL=[-1,-0.96,-0.92,-0.87,-0.82,-0.75,-0.65,-0.56,-0.50];
 const sRearM=[-0.50,-0.40,-0.30,-0.20,-0.10,0.02];
 const sRearR=[0.02,0.14,0.28,0.42,0.56,0.70,0.80,0.87,0.92,0.96,1];
 parts.cream.push(hullStrip(1,sRearL,[0.33,0.37,0.43,0.50,0.55],0.014,0.52));
 parts.cream.push(hullStrip(1,sRearM,[0.33,0.37,0.42,0.47,0.51],0.014,0.52));
 parts.cream.push(hullStrip(1,sRearR,[0.33,0.37,0.43,0.50,0.55],0.014,0.52));
 // Smoothly seal rear bumper step notch behind sRearM without protruding edges
 parts.cream.push(hullStrip(1,sRearM,[0.505,0.555],-0.022,0.52));
 addBox(parts.cream,0.52,0.02,0.04,-0.24,0.508,3.435);
 addBox(parts.dark,0.036,0.036,0.03,0.16,0.42,3.465);

 // Rear convex lower bodywork (y=0.55..1.44)
 const [leftSeam,rightSeam]=REAR_DOOR_SEAMS;
 const lowerRearY=[0.55,0.56,0.572,0.60,0.76,0.89,1.03,1.17,1.31,1.44];
 const lowerBands=[[-0.53,leftSeam[0],'cream'],[...leftSeam,'dark'],[leftSeam[1],rightSeam[0],'cream'],[...rightSeam,'dark'],[rightSeam[1],0.53,'cream']];
 for(const [a,b,material] of lowerBands){
  const n=Math.ceil((b-a)/0.07),cols=Array.from({length:n+1},(_,i)=>a+(b-a)*i/n);
  const doorPanel=a===leftSeam[1];
  parts[material].push(hullStrip(1,cols,lowerRearY.slice(2),0,0.06));
  parts[doorPanel?'dark':material].push(hullStrip(1,cols,lowerRearY.slice(1,3),0,0.06));
  parts.cream.push(hullStrip(1,cols,lowerRearY.slice(0,2),0,0.06));
 }
 const sRearWingL=[-1,-0.96,-0.92,-0.87,-0.82,-0.74,-0.66,-0.58,-0.53];
 const sRearWingR=[0.53,0.58,0.66,0.74,0.82,0.87,0.92,0.96,1];
 parts.cream.push(hullStrip(1,sRearWingL,[0.89,1.03,1.17,1.31,1.44],0,0.06));
 parts.cream.push(hullStrip(1,sRearWingR,[0.89,1.03,1.17,1.31,1.44],0,0.06));
 parts.cream.push(hullStrip(1,sRearWingL,[0.55,0.60],0,0.06));
 parts.cream.push(hullStrip(1,sRearWingR,[0.55,0.60],0,0.06));

 // Rear stepped wrap-around combination taillights (y=0.60..0.89, wrapping smoothly onto flank!)
 for(const side of [-1,1]){
  const sLo=Array.from({length:11},(_,i)=>side*(0.535+0.465*(i/10)));
  const sHi=Array.from({length:11},(_,i)=>side*(0.575+0.425*(i/10)));
  if(side<0){sLo.reverse();sHi.reverse();}
  parts.dark.push(hullStrip(1,sLo,[0.59,0.74,0.895],-0.016,0.09));
  parts.red.push(hullStrip(1,sLo,[0.605,0.68,0.745],0.002,0.086));
  const sRev=Array.from({length:7},(_,i)=>side*(0.58+0.24*(i/6)));
  const sTurn=Array.from({length:6},(_,i)=>side*(0.82+0.18*(i/5)));
  if(side<0){sRev.reverse();sTurn.reverse();}
  parts.reverse.push(hullStrip(1,sRev,[0.765,0.875],0.002,0.09));
  parts.amber.push(hullStrip(1,sTurn,[0.765,0.875],0.002,0.09));
  parts.chrome.push(hullStrip(1,sLo,[0.745,0.765],0.005,0.09));
  parts.dark.push(hullStrip(1,sLo,[0.592,0.606],0.006,0.09));
  parts.dark.push(hullStrip(1,sHi,[0.875,0.890],0.006,0.09));
  const sInnerLo=[side*0.53,side*0.542];if(side<0)sInnerLo.reverse();
  const sInnerHi=[side*0.57,side*0.582];if(side<0)sInnerHi.reverse();
  const sOuter=[side*0.985,side*1.00];if(side<0)sOuter.reverse();
  parts.dark.push(hullStrip(1,sInnerLo,[0.59,0.75],0.006,0.09));
  parts.dark.push(hullStrip(1,sInnerHi,[0.75,0.89],0.006,0.09));
  parts.dark.push(hullStrip(1,sOuter,[0.59,0.89],0.006,0.09));
  const sStep=[side*0.53,side*0.575];if(side<0)sStep.reverse();
  parts.cream.push(hullStrip(1,sStep,[0.765,0.895],0,0.09));
 }

 // Emergency door sill, handle and plate.
 addBox(parts.dark,0.125,0.105,0.032,-0.24,1.24,3.425);
 addBox(parts.chrome,0.038,0.038,0.025,-0.24,1.07,3.432);
 addBox(parts.dark,0.44,0.032,0.035,-0.24,0.92,3.435);
 addBox(parts.dark,0.44,0.23,0.016,-0.24,0.77,3.442);
 addBox(parts.plateR,0.41,0.20,0.014,-0.24,0.77,3.452,-0.03,0,0);

 addRearWindowBand(parts);

 // =========================================================================
 // 2. BARREL-CURVED LEFT & RIGHT SIDE PANELS, ARCHES, DOOR & SLIM WINDOWS
 // =========================================================================
 const ySideLo=[0.33,0.55,0.82],ySideMid=[0.82,0.96,1.10,1.26,1.46],ySideWin=[1.46,1.68,1.90,2.11,2.31];
 const addSideFrame=(side,z0,z1,zm,mullW=0.018)=>{
  // Outer slim barrel-curved perimeter border + horizontal sash + vertical mullion
  parts.alu.push(sideLoft(side,z0,z1,[1.46,1.484],0.024,-0.003,false));
  parts.alu.push(sideLoft(side,z0,z1,[2.286,2.31],0.024,-0.003,false));
  parts.alu.push(sideLoft(side,z0,z0+0.022,ySideWin,0.024,-0.003,false));
  parts.alu.push(sideLoft(side,z1-0.022,z1,ySideWin,0.024,-0.003,false));
  if(zm!==null)parts.alu.push(sideLoft(side,zm-mullW/2,zm+mullW/2,ySideWin,0.024,-0.004,false));
  if(z0>-2.0)parts.alu.push(sideLoft(side,z0,z1,[1.78,1.798],0.022,-0.003,false));
 };

 // Left side (-X): barrel-curved lower panels, front/rear radial arch spandrels, kerb window, folding door
 {
  // Forward of front wheel arch (-3.18..-2.67, y=0.33..0.82)
  parts.cream.push(sideLoft(-1,-3.18,-2.67,ySideLo,0.04));
  // Front wheel-arch curved spandrel (-2.67..-1.75, y=0.33..0.82)
  parts.cream.push(wheelArchSpandrel(-1,FRONT_AXLE_Z,0.46,0.82));
  // Strip between front arch and folding door (-1.75..-1.39, y=0.33..0.82)
  parts.cream.push(sideLoft(-1,-1.75,-1.39,ySideLo,0.04));
  // Continuous curved beltline band behind kerb window (-2.14..-1.39, y=0.82..1.46) and below kerb window (-3.18..-2.14, y=0.82..1.03)
  parts.cream.push(sideLoft(-1,-2.14,-1.39,ySideMid,0.04));
  parts.cream.push(sideLoft(-1,-3.18,-2.14,[0.82,0.92,1.03],0.04));

  // Kerbside lower triangular observation window surround (with intermediate y stops for curved fit)
  const sKw=new T.Shape();
  sKw.moveTo(-3.18,1.03);sKw.lineTo(-2.14,1.03);sKw.lineTo(-2.14,1.46);
  sKw.lineTo(-2.14,1.38);sKw.lineTo(-2.55,1.03);sKw.lineTo(-3.04,1.03);sKw.lineTo(-3.16,1.46);sKw.lineTo(-3.18,1.46);
  sKw.lineTo(-3.18,1.25);sKw.closePath();
  parts.cream.push(sidePanel(-1,sKw,0.04));

  // Kerbside lower observation window frame + barrel-contoured glass
  const kw=new T.Shape();
  kw.moveTo(-3.14,1.44);kw.lineTo(-3.02,1.05);kw.lineTo(-2.56,1.05);kw.lineTo(-2.16,1.38);kw.lineTo(-2.16,1.44);kw.closePath();
  parts.glass.push(sidePanel(-1,kw,0.008,0.014));
  const vPt=(z,y)=>new T.Vector3(-halfW(y),y,z);
  addTube(parts.dark,vPt(-3.14,1.44),vPt(-3.02,1.05),0.014,6);
  addTube(parts.dark,vPt(-3.02,1.05),vPt(-2.56,1.05),0.014,6);
  addTube(parts.dark,vPt(-2.56,1.05),vPt(-2.16,1.38),0.014,6);
  addTube(parts.dark,vPt(-3.14,1.44),vPt(-2.16,1.44),0.014,6);

  // Left rear lower panel behind folding door (-0.45..+3.18) using curved sideLoft + arch spandrel!
  parts.cream.push(sideLoft(-1,-0.45,0.82,ySideLo,0.04));
  parts.cream.push(wheelArchSpandrel(-1,REAR_AXLE_Z,0.46,0.82));
  parts.cream.push(sideLoft(-1,1.74,3.18,ySideLo,0.04));
  parts.cream.push(sideLoft(-1,-0.45,3.18,ySideMid,0.04));

  // Twin-leaf folding passenger door (-1.38..-0.46, y=0.36..2.29) contoured to barrel halfW(y)
  addBox(parts.alu,0.06,0.032,0.94,-halfW(0.35)+0.02,0.345,-0.92);
  parts.dark.push(sideLoft(-1,-1.39,-1.365,[0.35,0.82,1.35,1.83,2.30],0.03,-0.002,false));
  parts.dark.push(sideLoft(-1,-0.475,-0.45,[0.35,0.82,1.35,1.83,2.30],0.03,-0.002,false));
  parts.cream.push(sideLoft(-1,-1.39,-0.45,[2.25,2.31],0.04));
  for(const dz of [-1.15,-0.69]){
   parts.cream.push(sideLoft(-1,dz-0.21,dz+0.21,[0.37,0.65,0.98,1.36],0.032,0.005));
   parts.dark.push(sideLoft(-1,dz-0.21,dz+0.21,[1.36,1.395],0.025,0.004,false));
   parts.dark.push(sideLoft(-1,dz-0.21,dz+0.21,[2.205,2.24],0.025,0.004,false));
   parts.dark.push(sideLoft(-1,dz-0.21,dz-0.175,[1.36,1.80,2.24],0.025,0.004,false));
   parts.dark.push(sideLoft(-1,dz+0.175,dz+0.21,[1.36,1.80,2.24],0.025,0.004,false));
   parts.glass.push(sideLoft(-1,dz-0.175,dz+0.175,[1.395,1.80,2.205],0.008,0.012,false));
   for(const hy of [0.46,1.32,2.14])addBox(parts.alu,0.022,0.055,0.028,-halfW(hy)-0.004,hy,dz+(dz<-0.92?-0.20:0.20));
  }
  parts.dark.push(sideLoft(-1,-0.932,-0.908,[0.37,0.92,1.46,1.90,2.25],0.025,0.002,false));
  addBox(parts.dark,0.026,0.14,0.06,-halfW(1.08),1.08,-0.98);
  addBox(parts.chrome,0.024,0.045,0.045,-halfW(0.92),0.92,-0.98);

  // Left 3-column x 6-slat recessed AC condenser vent grille (-0.34..+0.62, y=0.40..0.72)
  addBox(parts.dark,0.02,0.32,0.96,-halfW(0.56)+0.008,0.56,0.14);
  for(const colZ of [-0.18,0.14,0.46]){
   for(let k=0;k<6;k++){const sy=0.43+k*0.048;addBox(parts.cream,0.022,0.016,0.27,-halfW(sy)-0.002,sy,colZ);}
  }
  // LPG/Fuel filler flap behind rear wheel arch
  addFrameRect(parts.crease,-halfW(0.93)-0.002,0.82,1.04,1.82,2.06,0.008,0.01,'x');

  // Segmented subtle horizontal body swage crease moldings following barrel halfW(y)
  addBox(parts.crease,0.01,0.012,0.72,-halfW(1.06)-0.002,1.06,-1.76);
  addBox(parts.crease,0.01,0.012,3.60,-halfW(1.06)-0.002,1.06,1.36);
  addBox(parts.crease,0.01,0.012,0.50,-halfW(0.68)-0.002,0.68,-2.90);
  addBox(parts.crease,0.01,0.012,1.44,-halfW(0.68)-0.002,0.68,2.44);

  // SLIM raked front A-pillar (-3.12..-3.04 at sill -> -2.72..-2.64 at top, 8 cm wide)
  const apL=new T.Shape();apL.moveTo(-3.12,1.46);apL.lineTo(-3.04,1.46);apL.lineTo(-2.64,2.31);apL.lineTo(-2.72,2.31);apL.closePath();
  parts.cream.push(sidePanel(-1,apL,0.04));
  for(const [z0,z1] of [[-1.46,-1.38],[-0.46,-0.38],[1.26,1.38]]){
   parts.cream.push(sideLoft(-1,z0,z1,ySideWin,0.04));
   addBox(parts.liner,0.02,0.85,z1-z0,-0.915,1.88,(z0+z1)/2);
  }
  // Raked front cab side window with SLIM 1.8 cm front mullion (-2.18)
  {
   const cabWin=new T.Shape();cabWin.moveTo(-3.03,1.48);cabWin.lineTo(-1.48,1.48);cabWin.lineTo(-1.48,2.29);cabWin.lineTo(-2.63,2.29);cabWin.closePath();
   parts.glass.push(sidePanel(-1,cabWin,0.008,0.012));
   addTube(parts.alu,new T.Vector3(-halfW(1.47),1.47,-3.04),new T.Vector3(-halfW(2.30),2.30,-2.64),0.011,6);
   parts.alu.push(sideLoft(-1,-3.04,-1.47,[1.46,1.482],0.024,-0.003,false));
   parts.alu.push(sideLoft(-1,-2.64,-1.47,[2.288,2.31],0.024,-0.003,false));
   parts.alu.push(sideLoft(-1,-1.485,-1.465,ySideWin,0.024,-0.003,false));
   parts.alu.push(sideLoft(-1,-2.19,-2.172,ySideWin,0.024,-0.004,false)); // Slim 1.8 cm cab mullion!
  }
  for(const [z0,z1,zm] of [[-0.38,1.26,0.44],[1.38,REAR_SIDE_JOIN,2.26]]){
   addSideFrame(-1,z0,z1,zm,0.020);
   parts.glass.push(sideLoft(-1,z0+0.02,z1-0.02,ySideWin,0.008,0.012,false));
  }
 }

 // Right side (+X, driver offside — barrel-curved continuous body with NO extra door!)
 {
  parts.cream.push(sideLoft(1,-3.18,-2.67,ySideLo,0.04));
  parts.cream.push(wheelArchSpandrel(1,FRONT_AXLE_Z,0.46,0.82));
  parts.cream.push(sideLoft(1,-1.75,0.82,ySideLo,0.04));
  parts.cream.push(wheelArchSpandrel(1,REAR_AXLE_Z,0.46,0.82));
  parts.cream.push(sideLoft(1,1.74,3.18,ySideLo,0.04));
  parts.cream.push(sideLoft(1,-3.18,3.18,ySideMid,0.04));

  addFrameRect(parts.crease,halfW(0.64)+0.002,0.42,0.86,-1.25,-0.55,0.008,0.01,'x');
  addBox(parts.crease,0.01,0.012,6.32,halfW(1.06)+0.002,1.06,0);
  addBox(parts.crease,0.01,0.012,0.50,halfW(0.68)+0.002,0.68,-2.90);
  addBox(parts.crease,0.01,0.012,2.56,halfW(0.68)+0.002,0.68,-0.46);
  addBox(parts.crease,0.01,0.012,1.44,halfW(0.68)+0.002,0.68,2.44);

  // SLIM raked right front A-pillar (-3.12..-3.04 -> -2.72..-2.64)
  const apR=new T.Shape();apR.moveTo(-3.12,1.46);apR.lineTo(-3.04,1.46);apR.lineTo(-2.64,2.31);apR.lineTo(-2.72,2.31);apR.closePath();
  parts.cream.push(sidePanel(1,apR,0.04));
  for(const [z0,z1] of [[-1.46,-1.36],[0.12,0.22],[1.62,1.72]]){
   parts.cream.push(sideLoft(1,z0,z1,ySideWin,0.04));
   addBox(parts.liner,0.02,0.85,z1-z0,0.915,1.88,(z0+z1)/2);
  }
  {
   const cabWinR=new T.Shape();cabWinR.moveTo(-3.03,1.48);cabWinR.lineTo(-1.48,1.48);cabWinR.lineTo(-1.48,2.29);cabWinR.lineTo(-2.63,2.29);cabWinR.closePath();
   parts.glass.push(sidePanel(1,cabWinR,0.008,0.012));
   addTube(parts.alu,new T.Vector3(halfW(1.47),1.47,-3.04),new T.Vector3(halfW(2.30),2.30,-2.64),0.011,6);
   parts.alu.push(sideLoft(1,-3.04,-1.47,[1.46,1.482],0.024,-0.003,false));
   parts.alu.push(sideLoft(1,-2.64,-1.47,[2.288,2.31],0.024,-0.003,false));
   parts.alu.push(sideLoft(1,-1.485,-1.465,ySideWin,0.024,-0.003,false));
   parts.alu.push(sideLoft(1,-2.39,-2.372,ySideWin,0.024,-0.004,false)); // Slim 1.8 cm driver cab mullion!
  }
  for(const [z0,z1,zm] of [[-1.36,0.12,-0.62],[0.22,1.62,0.92],[1.72,REAR_SIDE_JOIN,2.43]]){
   addSideFrame(1,z0,z1,zm,0.020);
   parts.glass.push(sideLoft(1,z0+0.02,z1-0.02,ySideWin,0.008,0.012,false));
  }
 }

 // Recessed opaque dark wheel-well barrels & mudflaps (tucked strictly inside curved rocker halfW(0.35)=0.952)
 for(const [cz,innerX,halfD] of [[FRONT_AXLE_Z,0.48,0.465],[REAR_AXLE_Z,0.44,0.505]]){
  for(const side of [-1,1]){
   const wArc=new T.CylinderGeometry(ARCH_R+0.005,ARCH_R+0.005,halfD,18,1,true,0,Math.PI);
   wArc.rotateZ(Math.PI/2);
   wArc.translate(side*(0.945-halfD/2),WHEEL_R,cz);
   parts.well.push(wArc);
   const wWall=new T.CircleGeometry(ARCH_R+0.005,18,0,Math.PI);
   wWall.rotateY(side<0?-Math.PI/2:Math.PI/2);
   wWall.translate(side*innerX,WHEEL_R,cz);
   parts.well.push(wWall);
   addBox(parts.dark,0.24,0.26,0.02,side*0.80,0.21,cz+ARCH_R+0.02,0.12,0,0);
  }
 }

 // =========================================================================
 // 3. TURQUOISE-GREEN ROOF CAP, FRONT DESTINATION POD & EXTERIOR HARDWARE
 // =========================================================================
 parts.green.push(buildRoofCap());
 for(const side of [-1,1])addBox(parts.dark,0.024,0.024,5.78,side*0.925,ROOF_Y,0.23);
 parts.green.push(buildRoofBlister());

 // Curvy front roof destination sign housing + embedded front-only bezel & LED display
 parts.green.push(buildDestPod());
 const bezelGeo=buildSignBezel(0.88,0.24,0.04,0.81,0.19,0.022);
 bezelGeo.rotateX(0.12);
 bezelGeo.translate(0,2.575,-2.810);
 parts.dark.push(bezelGeo);
 const signGeo=buildFrontSignSignFace(0.82,0.20,0.022);
 signGeo.rotateX(0.12);
 signGeo.translate(0,2.575,-2.814);
 parts.sign.push(signGeo);

 // Rounded wing mirrors (outer edge at x = +-1.10 total width = 2.20 m)
 for(const side of [-1,1]){
  const mx=side*1.022;
  addTube(parts.dark,new T.Vector3(side*(halfW(2.08)-0.015),2.08,-2.90),new T.Vector3(mx,2.14,-3.04),0.012,8);
  addTube(parts.dark,new T.Vector3(side*(halfW(1.88)-0.015),1.88,-2.93),new T.Vector3(mx,1.89,-3.04),0.012,8);
  const mg=roundedBoxGeo(0.146,0.24,0.075,0.026);
  mg.rotateY(side*0.18);
  mg.translate(mx,2.02,-3.04);
  parts.cream.push(mg);
  addBox(parts.chrome,0.115,0.195,0.015,mx-side*0.008,2.02,-3.005,0,side*0.18,0);
  if(side<0){
   const spot=new T.CylinderGeometry(0.055,0.055,0.025,12);
   spot.rotateX(Math.PI/2);
   spot.translate(mx-0.02,1.83,-3.03);
   parts.dark.push(spot);
  }
 }

 // Dual pantograph windscreen wipers flush against raked windscreen & washer nozzles
 for(const wx of [-0.30,0.32]){
  const zPiv=zFront(1.37)-0.02,zTip=zFront(1.56)-0.022;
  addTube(parts.dark,new T.Vector3(wx,1.37,zPiv),new T.Vector3(wx+0.42,1.56,zTip),0.011,6);
  addBox(parts.dark,0.56,0.018,0.018,wx+0.32,1.57,zTip,0,0,0.08);
  addBox(parts.dark,0.022,0.018,0.022,wx+0.02,1.32,-3.38);
 }

 // Underbody chassis rails, axles, differential, LPG tank, exhaust & spare wheel
 for(const sx of [-0.42,0.42])addBox(parts.dark,0.08,0.10,6.05,sx,0.31,0);
 addTube(parts.dark,new T.Vector3(-0.62,0.33,FRONT_AXLE_Z),new T.Vector3(0.62,0.33,FRONT_AXLE_Z),0.032,8);
 addTube(parts.dark,new T.Vector3(-0.60,0.35,REAR_AXLE_Z),new T.Vector3(0.60,0.35,REAR_AXLE_Z),0.042,8);
 const diff=new T.SphereGeometry(0.13,10,8);diff.translate(0,0.35,REAR_AXLE_Z);parts.dark.push(diff);
 const lpg=new T.CylinderGeometry(0.17,0.17,1.25,12);lpg.rotateX(Math.PI/2);lpg.translate(-0.22,0.30,0.05);parts.dark.push(lpg);
 addTube(parts.dark,new T.Vector3(0.28,0.26,2.1),new T.Vector3(0.32,0.24,3.30),0.024,8);
 const spare=new T.CylinderGeometry(0.31,0.31,0.18,16);spare.translate(0,0.26,2.65);parts.dark.push(spare);

 // =========================================================================
 // 4. RICH 16-SEAT HONG KONG MINIBUS INTERIOR
 // =========================================================================
 // Ivory headliner & interior side trim (strictly inside curvy roof shoulders & front/rear domes)
 addBox(parts.liner,1.48,0.03,5.50,0,2.38,0.17);
 addBox(parts.liner,0.02,0.62,1.36,-0.92,1.15,-2.12);
 addBox(parts.liner,0.02,0.62,3.46,-0.92,1.15,1.34);
 addBox(parts.liner,0.02,0.62,5.84,0.92,1.15,0.08);
 // Non-slip ribbed dark grey aisle floor & raised side seat platforms
 addBox(parts.floor,1.74,0.04,6.12,0,0.72,0.05);
 addBox(parts.floor,0.52,0.05,3.66,-0.64,0.79,1.25);
 addBox(parts.floor,0.96,0.05,4.32,0.44,0.79,0.95);
 addBox(parts.dash,0.38,0.28,0.78,0.68,0.88,FRONT_AXLE_Z);
 addBox(parts.dash,0.36,0.26,0.72,-0.68,0.88,FRONT_AXLE_Z);

 // Entrance 2-step passenger stairwell at folding door (-1.38..-0.46) with HK yellow step nosings
 addBox(parts.floor,0.46,0.04,0.86,-0.74,0.38,-0.92);
 addBox(parts.floor,0.46,0.04,0.86,-0.66,0.55,-0.92);
 addBox(parts.yellow,0.04,0.025,0.86,-0.92,0.40,-0.92);
 addBox(parts.yellow,0.04,0.025,0.86,-0.76,0.57,-0.92);
 addBox(parts.yellow,0.04,0.025,0.86,-0.54,0.74,-0.92);
 addBox(parts.liner,0.16,0.12,0.92,-0.84,2.24,-0.92);

 // Driver's cab (RHD +X, z=-3.25..-1.48)
 addBox(parts.dash,1.66,0.30,0.44,0,1.16,-3.08);
 addBox(parts.dash,0.68,0.16,0.36,0.46,1.33,-3.02);
 addBox(parts.gauge,0.44,0.13,0.015,0.46,1.31,-2.84,-0.25,0,0); // Lit gauge dials
 addBox(parts.dash,0.38,0.48,0.86,-0.02,0.95,-2.52);
 addBox(parts.alu,0.09,0.05,0.02,0.36,0.80,-2.90,0.5,0,0); // Brake pedal
 addBox(parts.alu,0.05,0.09,0.02,0.52,0.81,-2.90,0.5,0,0); // Accelerator pedal
 addTube(parts.dark,new T.Vector3(0.08,1.16,-2.36),new T.Vector3(0.14,1.46,-2.30),0.013,8);
 const knob=new T.SphereGeometry(0.026,8,8);knob.translate(0.14,1.47,-2.30);parts.dark.push(knob);
 addTube(parts.dark,new T.Vector3(-0.08,1.16,-2.12),new T.Vector3(-0.08,1.30,-1.96),0.011,6);

 // Driver seat (high-back charcoal, +X) & clear perspex driver rear partition
 addBox(parts.dash,0.46,0.10,0.46,0.46,1.08,-2.04);
 addBox(parts.dash,0.44,0.64,0.10,0.46,1.44,-1.84,0.14,0,0);
 addBox(parts.headrest,0.24,0.18,0.09,0.46,1.84,-1.78,0.10,0,0);
 addBox(parts.dash,0.18,0.30,0.18,0.46,0.88,-2.04);
 addTube(parts.alu,new T.Vector3(0.16,0.74,-1.60),new T.Vector3(0.16,2.30,-1.60),0.016,8);
 addTube(parts.alu,new T.Vector3(0.16,1.68,-1.60),new T.Vector3(0.88,1.68,-1.60),0.016,8);
 addBox(parts.perspex,0.68,0.72,0.014,0.52,1.68,-1.59);

 // Classic HK windscreen route placard ("洪水橋 / HUNG SHUI KIU / $6.5") on front-left dash
 addBox(parts.placard,0.52,0.21,0.018,-0.46,1.44,-3.02,-0.25,0.06,0);
 addBox(parts.dark,0.28,0.08,0.025,0.12,2.14,-2.84);
 addBox(parts.liner,0.54,0.12,0.016,0.46,2.18,-2.80,0.4,0,0);

 // HK Fare Payment Station: Octopus Card Reader + Coin Farebox at entrance top
 addTube(parts.alu,new T.Vector3(-0.34,0.74,-1.44),new T.Vector3(-0.34,2.32,-1.44),0.018,8);
 addTube(parts.alu,new T.Vector3(-0.46,0.74,-0.46),new T.Vector3(-0.46,2.32,-0.46),0.018,8);
 addBox(parts.octo,0.15,0.20,0.07,-0.34,1.32,-1.38,0,-0.45,0);
 addBox(parts.dash,0.22,0.34,0.22,-0.26,0.92,-1.64);
 addBox(parts.perspex,0.18,0.20,0.18,-0.26,1.18,-1.64);

 // Iconic ceiling-mounted passenger digital speedometer ("48 km/h")
 addBox(parts.dark,0.38,0.16,0.09,-0.02,2.24,-2.22);
 addBox(parts.speedo,0.34,0.13,0.015,-0.02,2.24,-2.17);

 // Exact 16 Passenger Seats: Rows 1..4 (1 left + 2 right) + Row 5 (4 across rear)
 const addSeat=(x,z)=>{
  addBox(parts.seatTeal,0.39,0.09,0.40,x,1.08,z);
  addBox(parts.seatTeal,0.38,0.56,0.085,x,1.40,z+0.16,0.12,0,0);
  addBox(parts.headrest,0.35,0.20,0.088,x,1.73,z+0.20,0.10,0,0);
  addTube(parts.alu,new T.Vector3(x-0.16,1.84,z+0.20),new T.Vector3(x+0.16,1.84,z+0.20),0.011,6);
  addBox(parts.dark,0.035,0.52,0.02,x-0.02,1.44,z+0.11,0.12,0,-0.42);
  addBox(parts.safetyRed,0.04,0.05,0.03,x+0.16,1.13,z+0.02);
  addTube(parts.dark,new T.Vector3(x-0.13,0.79,z-0.10),new T.Vector3(x-0.13,1.05,z-0.10),0.012,6);
  addTube(parts.dark,new T.Vector3(x+0.13,0.79,z+0.10),new T.Vector3(x+0.13,1.05,z+0.10),0.012,6);
 };
 const rowZ=[-0.16,0.62,1.40,2.18];
 for(const rz of rowZ){
  addSeat(-0.67,rz);
  addSeat(0.20,rz);
  addSeat(0.66,rz);
 }
 for(const rx of [-0.68,-0.23,0.22,0.67])addSeat(rx,2.94);

 // Modesty screen in front of Row 1 left
 addTube(parts.alu,new T.Vector3(-0.88,0.79,-0.42),new T.Vector3(-0.46,0.79,-0.42),0.014,6);
 addTube(parts.alu,new T.Vector3(-0.88,1.52,-0.42),new T.Vector3(-0.46,1.52,-0.42),0.014,6);
 addBox(parts.perspex,0.38,0.44,0.012,-0.67,1.28,-0.42);

 // Overhead stainless handrails, hand straps, AC coves, fluorescent strip, stop bells & safety gear
 for(const hx of [-0.42,0.02]){
  addTube(parts.alu,new T.Vector3(hx,2.16,-1.44),new T.Vector3(hx,2.16,2.85),0.014,8);
  for(const bz of [-1.44,0.10,1.55,2.85])addTube(parts.alu,new T.Vector3(hx,2.16,bz),new T.Vector3(hx,2.39,bz),0.012,6);
 }
 for(const sz of [-0.20,0.58,1.36,2.14]){
  for(const hx of [-0.42,0.02]){
   addBox(parts.dark,0.018,0.10,0.016,hx,2.10,sz);
   const ring=new T.TorusGeometry(0.042,0.008,6,14);
   ring.rotateY(Math.PI/2);
   ring.translate(hx,2.01,sz);
   parts.dark.push(ring);
  }
 }
 for(const side of [-1,1]){
  addBox(parts.liner,0.22,0.10,4.90,side*0.74,2.28,0.35);
  for(const vz of [-0.15,0.63,1.41,2.19,2.85])addBox(parts.dark,0.07,0.03,0.07,side*0.74,2.22,vz);
 }
 addBox(parts.cabinLed,0.22,0.025,4.10,-0.20,2.37,0.85);
 for(const bz of [-0.40,1.32]){
  addBox(parts.yellow,0.035,0.075,0.04,-0.89,1.54,bz);
  addBox(parts.safetyRed,0.04,0.03,0.03,-0.885,1.55,bz);
 }
 for(const bz of [0.16,1.66])addBox(parts.safetyRed,0.025,0.14,0.05,0.89,1.64,bz);
 const ext=new T.CylinderGeometry(0.055,0.055,0.34,10);ext.translate(-0.78,0.94,-1.56);parts.safetyRed.push(ext);
 addBox(parts.safetyRed,0.09,0.09,0.035,-0.24,1.32,3.34);

 // Merge static parts by material into root
 const mats={
  cream:mCream,crease:mCrease,green:mGreen,dark:mDark,well:mWell,grille:mGrille,dash:mDash,alu:mAlu,chrome:mChrome,
  glass:mGlass,perspex:mPerspex,light:mLight,red:mRed,amber:mAmber,reverse:mReverse,clearLamp:mClearLamp,liner:mLiner,
  floor:mFloor,yellow:mYellow,seatTeal:mSeatTeal,headrest:mHeadrest,safetyRed:mSafetyRed,
  cabinLed:mCabinLed,sign:mSign,placard:mPlacard,speedo:mSpeedo,octo:mOcto,gauge:mGauge,
  plateF:mPlateF,plateR:mPlateR
 };
 for(const [key,geos] of Object.entries(parts)){
  if(!geos.length)continue;
  const normalized=geos.map(g=>{
   const ni=g.index?g.toNonIndexed():g;
   if(!ni.attributes.normal)ni.computeVertexNormals();
   if(!ni.attributes.uv){
    const n=ni.attributes.position.count;
    ni.setAttribute('uv',new T.Float32BufferAttribute(new Float32Array(n*2),2));
   }
   return ni;
  });
  const merged=mergeGeometries(normalized);
  geos.forEach(g=>g.dispose());
  normalized.forEach(g=>{if(!geos.includes(g))g.dispose();});
  if(!merged)continue;
  const mesh=new T.Mesh(merged,mats[key]);
  mesh.name='minibus-'+key;
  if(key==='glass'||key==='perspex')mesh.renderOrder=key==='glass'?2:3;
  root.add(mesh);
 }

 // =========================================================================
 // 5. SEPARATE ANIMATED INTERIOR STEERING WHEEL
 // =========================================================================
 const colGroup=new T.Group();
 colGroup.name='minibus-steering-column';
 colGroup.position.set(0.46,1.42,-2.56);
 colGroup.rotation.x=-0.58;
 const shaft=new T.Mesh(new T.CylinderGeometry(0.022,0.026,0.34,10).rotateX(Math.PI/2).translate(0,0,-0.17),mDark);
 shaft.name='minibus-steering-shaft';
 colGroup.add(shaft);

 const swGroup=new T.Group();
 swGroup.name='minibus-steering-wheel';
 swGroup.userData.minibusSteeringWheel=true;
 const swGeos=[];
 swGeos.push(new T.TorusGeometry(0.20,0.017,10,24));
 addBox(swGeos,0.38,0.028,0.018,0,-0.02,0);
 addBox(swGeos,0.035,0.19,0.018,0,-0.10,0);
 swGeos.push(new T.CylinderGeometry(0.055,0.055,0.032,14).rotateX(Math.PI/2));
 const swMerged=mergeGeometries(swGeos.map(g=>g.index?g.toNonIndexed():g));
 swGeos.forEach(g=>g.dispose());
 const swMesh=new T.Mesh(swMerged,mDark);
 swMesh.name='minibus-steering-wheel-mesh';
 swGroup.add(swMesh);
 colGroup.add(swGroup);
 root.add(colGroup);

 // =========================================================================
 // 6. 4 INDEPENDENT SPINNING & STEERABLE 3D WHEELS (SEPARATE FROM BODY)
 // =========================================================================
 const mTyre=new T.MeshStandardMaterial({color:0x191b1e,roughness:0.94,metalness:0.04});
 const mRim=new T.MeshStandardMaterial({color:0xffffff,vertexColors:true,metalness:0.42,roughness:0.36});

 const axles=[
  {i:0,z:FRONT_AXLE_Z,xMag:0.81,front:true,dual:false},
  {i:1,z:REAR_AXLE_Z,xMag:0.75,front:false,dual:true}
 ];
 const rimGeos={};
 for(const ax of axles){
  for(const side of [-1,1]){
   const pivot=new T.Group();
   pivot.name=`road-wheel-${ax.i}-${side}`;
   pivot.rotation.order='YXZ';
   pivot.position.set(side*ax.xMag,WHEEL_R,ax.z);
   pivot.userData.roadWheel={radius:WHEEL_R,front:ax.front,steerable:ax.front,maxSteer:0.48};
   const tKey=`${ax.dual}:${side}`;
   rimGeos[tKey]??=[buildTyreGeometry(ax.dual,side),buildRimGeometry(ax.dual,side)];
   const [tyreGeo,rimGeo]=rimGeos[tKey];
   const tyreMesh=new T.Mesh(tyreGeo,mTyre);tyreMesh.name='tyre';
   const rimMesh=new T.Mesh(rimGeo,mRim);rimMesh.name='rim';
   pivot.add(tyreMesh,rimMesh);
   root.add(pivot);
  }
 }

 mergeByMaterial(root,{stop:/^(road-wheel-|minibus-steering-wheel)/});

 let triCount=0;
 root.traverse(n=>{
  if(n.isMesh){
   n.castShadow=true;
   n.receiveShadow=true;
   triCount+=(n.geometry.index?.count??n.geometry.attributes.position.count)/3;
  }
 });

 root.userData.wheelRig={originalTriangles:Math.round(triCount),wheels:4};
 root.userData.minibusDetails={
  passengerSeats:16,
  driverSeat:true,
  dualRearWheels:true,
  wraparoundLights:true,
  steerableFrontWheels:true
 };
 return root;
}
