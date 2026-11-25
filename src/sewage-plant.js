// San Wai Sewage Treatment Works (Area 41A north) & Hung Shui Kiu Effluent Polishing Plant (HSKEPP, Area 41A south + 41C),
// directly west and south of the SGMTS depot (Area 41B) across Road D5.
// Layout, building heights (above ~19 mPD formation; OZP cap 50 mPD), 5 anaerobic digesters, 3 biogas tanks, Road D5 steel
// utility bridge, warm timber-louvre cladding, green roofs and DSD solar PV arrays are derived from DSD drawings DSS/2025/001-003
// (PWSC(2025-26)4) and EIA AEIAR-240/2022 Figures 2.1 & 9.9 / Table 9.9, in the game's HK1980-derived metre frame.
import * as T from 'three';
import {mergeGeometries} from 'three/addons/utils/BufferGeometryUtils.js';
import {pointInPolygon} from './lots/wand.js';
import {canopyTreeAssets,pickCanopySpecies,treeHash} from './street/canopy-trees.js';

function orientedRect(cx,cz,w,d,deg){
 const a=deg*Math.PI/180,ux=Math.cos(a),uz=Math.sin(a),vx=-uz,vz=ux;
 return [[-w/2,-d/2],[w/2,-d/2],[w/2,d/2],[-w/2,d/2]].map(([lw,ld])=>[cx+ux*lw+vx*ld,cz+uz*lw+vz*ld]);
}

function building(id,name,site,zone,cx,cz,w,d,deg,h,kind){
 return {id,name,site,zone,cx,cz,w,d,deg,h,kind,poly:orientedRect(cx,cz,w,d,deg)};
}

// 20 enclosed plant buildings: 5 existing San Wai STW Phase 1 (41A north), 3 HSKEPP West (41A south), 12 HSKEPP East (41C).
export const STW_BUILDINGS=[
 // Area 41A (North): Existing San Wai Sewage Treatment Works Phase 1 (200,000 m3/day compact CEPT + UV)
 building('sw-cept','SW-CEPT Main Hall','41A-north','SWSTW',-516,-2648,84,46,2,14.0,'sw-hall'),
 building('sw-sludge','SW-Sludge Dewatering','41A-north','SWSTW',-524,-2695,62,24,2,13.0,'sw-hall'),
 building('sw-inlet','SW-Inlet Pumping Station','41A-north','SWSTW',-576,-2652,24,38,2,11.5,'sw-hall'),
 building('sw-admin','SW-Administration & Lab','41A-north','SWSTW',-448,-2676,30,44,-4,13.5,'sw-admin'),
 building('sw-uv','SW-UV & Effluent Block','41A-north','SWSTW',-450,-2622,28,32,-4,10.0,'sw-hall'),

 // Area 41A (South): HSKEPP Western Site (DSD Zones 4 & 5; tallest roof +50 mPD -> ~31 m above formation)
 building('hsk-sludge-main','HSK-Sludge Dewatering & Food Waste','41A-south','Zone 5',-488,-2540,64,40,-5,31.0,'hsk-sludge-main'),
 building('hsk-sludge-annex','HSK-Sludge West Annex','41A-south','Zone 5',-540,-2540,22,22,-5,18.0,'hsk-hall'),
 building('hsk-uv','HSK-UV Disinfection','41A-south','Zone 4',-442,-2548,20,26,-5,13.0,'hsk-hall'),

 // Area 41C: HSKEPP Eastern Site (DSD Zones 1, 2, 3, 5 & 6)
 building('hsk-inlet','HSK-Inlet Works','41C','Zone 1',-276,-2482,46,24,18,19.0,'hsk-hall'),
 building('hsk-deod','HSK-Deodorization System','41C','Zone 1',-292,-2456,26,14,18,11.0,'hsk-green'),
 building('hsk-primary','HSK-Primary Treatment','41C','Zone 2',-224,-2446,42,34,18,15.0,'hsk-hall'),
 building('hsk-chp','HSK-CHP Building','41C','Zone 5',-374,-2425,38,18,34,22.5,'hsk-chp'),
 building('hsk-thick','HSK-Sludge Thickening','41C','Zone 5',-342,-2414,18,36,34,21.0,'hsk-hall'),
 building('hsk-bio-sec','HSK-Secondary Treatment','41C','Zone 3',-310,-2402,34,44,34,21.0,'hsk-hall'),
 building('hsk-bio-main','HSK-Biological Treatment Main','41C','Zone 3',-254,-2378,60,46,34,23.5,'hsk-bio-main'),
 building('hsk-pump','HSK-Sludge Pumping Station','41C','Zone 5',-393,-2467,13,11,34,6.0,'hsk-low'),
 building('hsk-pre','HSK-Biogas Pre-Treatment','41C','Zone 5',-354,-2444,14,9,34,4.6,'hsk-low'),
 building('hsk-chem','HSK-Chemical Dosing','41C','Zone 6',-272,-2340,26,9,34,7.0,'hsk-green'),
 building('hsk-work','HSK-Workshop & Store','41C','Zone 6',-218,-2314,22,14,32,11.0,'hsk-admin'),
 building('hsk-admin','HSK-Administration Building','41C','Zone 6',-205,-2292,22,14,32,11.0,'hsk-admin'),
];

// 5 anaerobic digesters (r=9.5 m, h=16.5 m) and 3 biogas holding tanks (r=5.5-5.8 m, h=16.0 m) on 41C NW curve.
export const STW_TANKS=[
 {id:'digester-1',name:'Anaerobic Digester 1',site:'41C',zone:'Zone 5',cx:-322,cz:-2498,r:9.5,h:16.5,kind:'digester'},
 {id:'digester-2',name:'Anaerobic Digester 2',site:'41C',zone:'Zone 5',cx:-344,cz:-2495,r:9.5,h:16.5,kind:'digester'},
 {id:'digester-3',name:'Anaerobic Digester 3',site:'41C',zone:'Zone 5',cx:-366,cz:-2487,r:9.5,h:16.5,kind:'digester'},
 {id:'digester-4',name:'Anaerobic Digester 4',site:'41C',zone:'Zone 5',cx:-335,cz:-2474,r:9.5,h:16.5,kind:'digester'},
 {id:'digester-5',name:'Anaerobic Digester 5',site:'41C',zone:'Zone 5',cx:-357,cz:-2466,r:9.5,h:16.5,kind:'digester'},
 {id:'biogas-1',name:'Biogas Holding Tank 1',site:'41C',zone:'Zone 5',cx:-388,cz:-2453,r:5.8,h:16.0,kind:'biogas'},
 {id:'biogas-2',name:'Biogas Holding Tank 2',site:'41C',zone:'Zone 5',cx:-375,cz:-2445,r:5.5,h:16.0,kind:'biogas'},
 {id:'biogas-3',name:'Biogas Holding Tank 3',site:'41C',zone:'Zone 5',cx:-396,cz:-2439,r:5.5,h:16.0,kind:'biogas'},
];

// Paved operational yards strictly inside OZP parcels 41A-21 and 41C-28 and clear of all surrounding carriageways.
export const STW_YARDS=[
 {
  id:'41A-north',name:'San Wai STW yard',lotId:'41A-21',
  poly:[[-572,-2705],[-432,-2712],[-426,-2630],[-426,-2594],[-596,-2594],[-594,-2660]],
  gates:[[-429,-2671]],
 },
 {
  id:'41A-south',name:'HSKEPP Western yard',lotId:'41A-21',
  poly:[[-562,-2566],[-426,-2574],[-425,-2526],[-442,-2508],[-552,-2518]],
  gates:[[-425.5,-2550],[-515,-2515]],
 },
 {
  id:'41C',name:'HSKEPP Eastern yard',lotId:'41C-28',
  poly:[[-325,-2514],[-286,-2514],[-252,-2504],[-210,-2488],[-192,-2470],[-184,-2434],[-192,-2348],[-192,-2275],[-210,-2275],[-244,-2316],[-310,-2360],[-392,-2420],[-408,-2440],[-405,-2472],[-368,-2504]],
  gates:[[-305,-2514],[-338,-2380]],
 },
];

export const UTILITY_BRIDGE={start:[-442,-2520],end:[-398,-2476],width:5.0,height:4.0};

const YARD_BOUNDS=STW_YARDS.map(y=>({
 poly:y.poly,
 x0:Math.min(...y.poly.map(p=>p[0])),x1:Math.max(...y.poly.map(p=>p[0])),
 z0:Math.min(...y.poly.map(p=>p[1])),z1:Math.max(...y.poly.map(p=>p[1])),
}));

function segDist(x,z,a,b){
 const dx=b[0]-a[0],dz=b[1]-a[1],t=Math.max(0,Math.min(1,((x-a[0])*dx+(z-a[1])*dz)/(dx*dx+dz*dz||1)));
 return Math.hypot(x-a[0]-t*dx,z-a[1]-t*dz);
}

export function inSewagePlant(x,z,margin=0){
 for(const yb of YARD_BOUNDS){
  if(x<yb.x0-margin||x>yb.x1+margin||z<yb.z0-margin||z>yb.z1+margin)continue;
  if(pointInPolygon([x,z],yb.poly))return true;
  if(margin>0&&yb.poly.some((p,i)=>segDist(x,z,p,yb.poly[(i+1)%yb.poly.length])<margin))return true;
 }
 return false;
}

function tex(w,h,draw,repeat=true){
 const c=document.createElement('canvas');c.width=w;c.height=h;
 draw(c.getContext('2d'),w,h);
 const t=new T.CanvasTexture(c);
 t.colorSpace=T.SRGBColorSpace;t.anisotropy=4;
 if(repeat){t.wrapS=t.wrapT=T.RepeatWrapping;}
 return t;
}

function makeMaterials(nightMaterials){
 const yardTex=tex(256,256,g=>{
  g.fillStyle='#595d5a';g.fillRect(0,0,256,256);
  for(let i=0;i<2400;i++){const x=(i*73)%256,y=(i*137)%256;g.fillStyle=i%2?'rgba(255,255,255,.04)':'rgba(0,0,0,.06)';g.fillRect(x,y,2,2);}
  g.strokeStyle='rgba(0,0,0,.06)';g.lineWidth=1;for(let k=0;k<256;k+=64){g.beginPath();g.moveTo(k,0);g.lineTo(k,256);g.moveTo(0,k);g.lineTo(256,k);g.stroke();}
 });
 yardTex.repeat.set(1,1);
 const yardMat=new T.MeshStandardMaterial({map:yardTex,roughness:.93,side:T.DoubleSide});

 const plinthMat=new T.MeshStandardMaterial({color:0x6c706b,roughness:.92});
 const stoneBaseMat=new T.MeshStandardMaterial({
  map:tex(256,256,g=>{
   g.fillStyle='#5b6062';g.fillRect(0,0,256,256);
   g.fillStyle='#4a4e50';for(let y=0;y<256;y+=32)g.fillRect(0,y,256,2);
   for(let row=0;row<8;row++)for(let col=0;col<4;col++){const x=col*64+(row%2)*32;g.fillRect(x%256,row*32,2,32);}
   g.fillStyle='#6d7375';for(let i=0;i<900;i++)g.fillRect((i*53)%256,(i*97)%256,2,2);
  }),
  roughness:.88,
 });

 // HSKEPP warm vertical timber-tone louvre cladding over dark acoustic backing (DSS/2025/002-003).
 const hskLouvreMat=new T.MeshStandardMaterial({
  map:tex(256,256,g=>{
   g.fillStyle='#414548';g.fillRect(0,0,256,256);
   for(let x=0;x<256;x+=8){g.fillStyle=x%24===0?'#8d6b4b':'#9c7855';g.fillRect(x,0,5,256);g.fillStyle='#785a3d';g.fillRect(x+4,0,1,256);}
   g.fillStyle='rgba(36,44,49,.35)';g.fillRect(0,118,256,14);g.fillRect(0,242,256,14);
  }),
  roughness:.76,
 });

 // San Wai STW crisp cool-grey ribbed cladding with high clerestory band.
 const swCladMat=new T.MeshStandardMaterial({
  map:tex(256,256,g=>{
   g.fillStyle='#d4d8da';g.fillRect(0,0,256,256);
   g.fillStyle='#bec4c7';for(let x=0;x<256;x+=10)g.fillRect(x,0,2,256);
   g.fillStyle='#5c717d';g.fillRect(0,28,256,36);
   g.fillStyle='#43535c';for(let x=0;x<256;x+=32)g.fillRect(x,28,3,36);
   g.fillStyle='#8c9396';g.fillRect(0,224,256,32);
  }),
  roughness:.72,
 });

 const adminMat=(wallHex,louvreHex)=>{
  const draw=(g,night)=>{
   g.fillStyle=night?'#000000':wallHex;g.fillRect(0,0,256,256);
   for(let r=0;r<4;r++){
    const y=14+r*62;
    for(let c=0;c<4;c++){
     const x=10+c*62,lit=(r*5+c*3)%5!==0;
     if(night){if(lit){g.fillStyle='#ffd898';g.fillRect(x,y,46,38);}}
     else{
      g.fillStyle='#3c5566';g.fillRect(x,y,46,38);
      g.fillStyle='rgba(255,255,255,.12)';g.fillRect(x,y,46,12);
      g.fillStyle=louvreHex;for(let lx=x+8;lx<x+44;lx+=12)g.fillRect(lx,y,2,38);
     }
    }
   }
  };
  const m=new T.MeshStandardMaterial({map:tex(256,256,g=>draw(g,false)),emissiveMap:tex(256,256,g=>draw(g,true)),roughness:.6,metalness:.1});
  m.emissive.set(0);
  nightMaterials.push(m);
  return m;
 };

 const swAdminMat=adminMat('#cfd5d8','#475966');
 const hskAdminMat=adminMat('#8f6f50','#5a4531');

 const pvMat=new T.MeshStandardMaterial({
  map:tex(256,256,g=>{
   g.fillStyle='#1f304c';g.fillRect(0,0,256,256);
   g.strokeStyle='#6e829c';g.lineWidth=3;
   for(let x=0;x<=256;x+=64){g.beginPath();g.moveTo(x,0);g.lineTo(x,256);g.stroke();}
   for(let y=0;y<=256;y+=32){g.beginPath();g.moveTo(0,y);g.lineTo(256,y);g.stroke();}
   g.strokeStyle='rgba(160,195,230,.22)';g.lineWidth=1;
   for(let x=16;x<256;x+=16){g.beginPath();g.moveTo(x,0);g.lineTo(x,256);g.stroke();}
  }),
  roughness:.35,metalness:.38,
 });

 // Dedicated solar PV array for Biological Treatment Main showing the DSD "D" emblem across the array (DSS/2025/002).
 const dsdSolarMat=new T.MeshStandardMaterial({
  map:tex(512,512,g=>{
   g.fillStyle='#1e2f4b';g.fillRect(0,0,512,512);
   g.strokeStyle='#6d8199';g.lineWidth=3;
   for(let x=0;x<=512;x+=64){g.beginPath();g.moveTo(x,0);g.lineTo(x,512);g.stroke();}
   for(let y=0;y<=512;y+=32){g.beginPath();g.moveTo(0,y);g.lineTo(512,y);g.stroke();}
   g.strokeStyle='#72c0df';g.lineWidth=28;g.lineCap='round';
   g.beginPath();g.arc(256,256,112,-Math.PI*.55,Math.PI*.55);g.lineTo(192,368);g.lineTo(192,144);g.closePath();g.stroke();
   g.fillStyle='rgba(88,164,205,.38)';g.beginPath();g.arc(256,256,82,-Math.PI*.5,Math.PI*.5);g.lineTo(212,338);g.lineTo(212,174);g.closePath();g.fill();
  },false),
  roughness:.36,metalness:.36,
 });

 const greenRoofMat=new T.MeshStandardMaterial({
  map:tex(256,256,g=>{
   g.fillStyle='#51723a';g.fillRect(0,0,256,256);
   for(let i=0;i<1800;i++){g.fillStyle=i%3?'#628546':'#3f5c2d';g.fillRect((i*47)%256,(i*89)%256,3,3);}
  }),
  roughness:.95,
 });

 const tankMat=new T.MeshStandardMaterial({
  map:tex(256,256,g=>{
   g.fillStyle='#deddd5';g.fillRect(0,0,256,256);
   g.fillStyle='rgba(0,0,0,.07)';for(let y=0;y<256;y+=32)g.fillRect(0,y,256,2);
   for(let x=0;x<256;x+=64)g.fillRect(x,0,2,256);
  }),
  roughness:.8,
 });

 const tankGreenMat=new T.MeshStandardMaterial({
  map:tex(256,256,g=>{
   g.fillStyle='#4a6936';g.fillRect(0,0,256,256);
   for(let x=0;x<256;x+=16){g.fillStyle='#d4d3ca';g.fillRect(x,0,4,256);}
   for(let i=0;i<1000;i++){const x=(i*41)%256;if(x%16>=4){g.fillStyle=i%2?'#658a47':'#3a5429';g.fillRect(x,(i*83)%256,3,3);}}
  }),
  roughness:.92,
 });

 const steelMat=new T.MeshStandardMaterial({color:0xb8c0c4,roughness:.45,metalness:.55});

 const wireMat=new T.MeshStandardMaterial({
  map:tex(64,64,g=>{
   g.clearRect(0,0,64,64);g.strokeStyle='#c4cbce';g.lineWidth=5;
   g.beginPath();g.moveTo(0,32);g.lineTo(32,0);g.lineTo(64,32);g.lineTo(32,64);g.closePath();g.stroke();
  }),
  alphaTest:.5,side:T.DoubleSide,metalness:.5,roughness:.6,
 });

 return {yardMat,plinthMat,stoneBaseMat,hskLouvreMat,swCladMat,swAdminMat,hskAdminMat,pvMat,dsdSolarMat,greenRoofMat,tankMat,tankGreenMat,steelMat,wireMat};
}

function prep(g){
 const out=g.index?g.toNonIndexed():g;
 if(out!==g)g.dispose();
 if(!out.attributes.normal)out.computeVertexNormals();
 if(!out.attributes.uv){
  const n=out.attributes.position.count;
  out.setAttribute('uv',new T.Float32BufferAttribute(new Float32Array(n*2),2));
 }
 for(const k of Object.keys(out.attributes))if(k!=='position'&&k!=='normal'&&k!=='uv')out.deleteAttribute(k);
 return out;
}

function emitMerged(group,name,geos,mat,{castShadow=true,receiveShadow=true}={}){
 if(!geos.length)return null;
 const prepped=geos.map(prep),merged=mergeGeometries(prepped,false);
 prepped.forEach(g=>g.dispose());
 const mesh=new T.Mesh(merged,mat);
 mesh.name=name;mesh.castShadow=castShadow;mesh.receiveShadow=receiveShadow;
 mesh.updateMatrix();mesh.matrixAutoUpdate=false;
 group.add(mesh);
 return mesh;
}

// World-scaled UVs on a BoxGeometry(w, h, d) before rotating by yaw = -deg * PI / 180 and translating to (cx, cy, cz).
function boxGeo(w,h,d,cx,cy,cz,deg,tile=[10,10],stretchV=false){
 const g=new T.BoxGeometry(w,h,d),p=g.attributes.position,n=g.attributes.normal,uv=g.attributes.uv;
 for(let i=0;i<p.count;i++){
  if(Math.abs(n.getY(i))>.5){uv.setXY(i,(p.getX(i)+w/2)/tile[0],(p.getZ(i)+d/2)/tile[1]);}
  else{
   const across=Math.abs(n.getX(i))>.5?p.getZ(i)+d/2:p.getX(i)+w/2;
   const v=stretchV?(p.getY(i)+h/2)/h:(p.getY(i)+h/2)/tile[1];
   uv.setXY(i,across/tile[0],v);
  }
 }
 if(deg)g.rotateY(-deg*Math.PI/180);
 g.translate(cx,cy,cz);
 return g;
}

function cylGeo(rTop,rBot,h,segs,cx,cy,cz,tile=[12,12]){
 const g=new T.CylinderGeometry(rTop,rBot,h,segs),uv=g.attributes.uv,p=g.attributes.position;
 for(let i=0;i<p.count;i++){
  const ang=Math.atan2(p.getZ(i),p.getX(i));
  uv.setXY(i,(ang+Math.PI)*rBot/tile[0],(p.getY(i)+h/2)/tile[1]);
 }
 g.translate(cx,cy,cz);
 return g;
}

function beamGeo(ax,ay,az,bx,by,bz,thick,depth){
 const dx=bx-ax,dy=by-ay,dz=bz-az,len=Math.hypot(dx,dy,dz)||1;
 const g=new T.BoxGeometry(thick,depth,len);
 const q=new T.Quaternion().setFromUnitVectors(new T.Vector3(0,0,1),new T.Vector3(dx/len,dy/len,dz/len));
 g.applyQuaternion(q);
 g.translate((ax+bx)/2,(ay+by)/2,(az+bz)/2);
 return g;
}

function buildYardGeo(yard,ground,net){
 const step=3,xs=yard.poly.map(p=>p[0]),zs=yard.poly.map(p=>p[1]);
 const x0=Math.floor(Math.min(...xs)),x1=Math.ceil(Math.max(...xs)),z0=Math.floor(Math.min(...zs)),z1=Math.ceil(Math.max(...zs));
 const nx=Math.ceil((x1-x0)/step)+1,nz=Math.ceil((z1-z0)/step)+1;
 const ok=[],pos=[],uv=[],idx=[];
 for(let j=0;j<nz;j++)for(let i=0;i<nx;i++){
  const x=x0+i*step,z=z0+j*step;
  const valid=pointInPolygon([x,z],yard.poly)&&!(net?.onStreet(x,z,.6));
  ok.push(valid);
  pos.push(x,ground(x,z)+.08,z);uv.push(x/6,z/6);
 }
 for(let j=0;j<nz-1;j++)for(let i=0;i<nx-1;i++){
  const a=j*nx+i,b=a+1,c=a+nx,e=c+1;
  if(ok[a]&&ok[b]&&ok[c]&&ok[e])idx.push(a,c,b,b,c,e);
 }
 const g=new T.BufferGeometry();
 g.setAttribute('position',new T.Float32BufferAttribute(pos,3));
 g.setAttribute('uv',new T.Float32BufferAttribute(uv,2));
 g.setIndex(idx);g.computeVertexNormals();
 return g;
}

function signMesh(title,subtitle,showEmblem,pos,yaw,width,height){
 const c=document.createElement('canvas');c.width=1024;c.height=224;
 const g=c.getContext('2d');
 g.fillStyle='#1d2e38';g.fillRect(0,0,1024,224);
 g.strokeStyle='#63b5d6';g.lineWidth=6;g.strokeRect(8,8,1008,208);
 if(showEmblem){
  g.fillStyle='#ffffff';g.beginPath();g.arc(106,112,62,0,Math.PI*2);g.fill();
  g.strokeStyle='#0071b8';g.lineWidth=18;g.beginPath();g.arc(106,112,34,-Math.PI*.55,Math.PI*.55);g.lineTo(84,146);g.lineTo(84,78);g.closePath();g.stroke();
 }
 const tx=showEmblem?570:512;
 g.fillStyle='#f6f2e2';g.textAlign='center';g.font='bold 56px sans-serif';g.fillText(title,tx,98);
 g.fillStyle='#8bd0ec';g.font='bold 34px sans-serif';g.fillText(subtitle,tx,166);
 const t=new T.CanvasTexture(c);t.colorSpace=T.SRGBColorSpace;t.anisotropy=4;
 const m=new T.Mesh(new T.PlaneGeometry(width,height),new T.MeshStandardMaterial({map:t,roughness:.5,side:T.DoubleSide}));
 m.position.copy(pos);m.rotation.y=yaw;m.name='STW signage';
 m.updateMatrix();m.matrixAutoUpdate=false;
 return m;
}

export function buildSewagePlants(scene,{ground,mats,nightMaterials=[],net=null}={}){
 const group=new T.Group();group.name='Sewage treatment complex';scene.add(group);
 const M=makeMaterials(nightMaterials);
 const buckets={
  yards:[],plinths:[],swClad:[],swAdmin:[],hskLouvre:[],hskAdmin:[],stoneBase:[],
  greenRoof:[],pv:[],dsdSolar:[],tanks:[],tankGreen:[],steel:[],wire:[],
 };

 // 1. Terrain-following operational yards clipped clear of surrounding streets.
 const yardMeshes=[];
 for(const y of STW_YARDS){
  const g=buildYardGeo(y,ground,net);
  if(g.index?.count)buckets.yards.push(g);else g.dispose();
 }

 // 2. Enclosed treatment & operational buildings (San Wai STW Phase 1 + HSKEPP West & East).
 for(const b of STW_BUILDINGS){
  const ys=b.poly.map(([x,z])=>ground(x,z)),baseY=Math.max(...ys),minY=Math.min(...ys);
  const skirtBottom=minY-3.5,skirtTop=baseY+.35,skirtH=skirtTop-skirtBottom;
  buckets.plinths.push(boxGeo(b.w+.5,skirtH,b.d+.5,b.cx,skirtBottom+skirtH/2,b.cz,b.deg,[8,4]));

  const bodyTop=baseY+b.h;
  if(b.kind==='sw-hall'||b.kind==='sw-admin'){
   const target=b.kind==='sw-admin'?buckets.swAdmin:buckets.swClad;
   target.push(boxGeo(b.w,b.h-.35,b.d,b.cx,skirtTop+(b.h-.35)/2,b.cz,b.deg,[16,b.h],true));
   buckets.plinths.push(boxGeo(b.w+.3,0.3,b.d+.3,b.cx,bodyTop+.15,b.cz,b.deg,[8,2]));
   if(b.kind==='sw-admin')buckets.greenRoof.push(boxGeo(b.w-2.4,.22,b.d-2.4,b.cx,bodyTop+.16,b.cz,b.deg,[8,8]));
   else buckets.pv.push(boxGeo(b.w-3.5,.18,b.d-3.5,b.cx,bodyTop+.14,b.cz,b.deg,[10,8]));
   continue;
  }

  // HSKEPP architecture: dark stone plinth course + warm vertical timber-louvre upper envelope + green-rimmed solar PV roof.
  const hStone=Math.min(4.6,b.h*.38),hUpper=b.h-.35-hStone;
  buckets.stoneBase.push(boxGeo(b.w+.15,hStone,b.d+.15,b.cx,skirtTop+hStone/2,b.cz,b.deg,[8,4]));
  if(hUpper>.2){
   const target=b.kind==='hsk-admin'?buckets.hskAdmin:buckets.hskLouvre;
   target.push(boxGeo(b.w,hUpper,b.d,b.cx,skirtTop+hStone+hUpper/2,b.cz,b.deg,b.kind==='hsk-admin'?[14,12]:[10,b.h],b.kind==='hsk-admin'));
  }
  buckets.plinths.push(boxGeo(b.w+.25,.35,b.d+.25,b.cx,bodyTop+.175,b.cz,b.deg,[8,2]));

  if(b.kind==='hsk-green'||b.kind==='hsk-low'){
   buckets.greenRoof.push(boxGeo(b.w-1.4,.24,b.d-1.4,b.cx,bodyTop+.16,b.cz,b.deg,[8,8]));
  }else if(b.kind==='hsk-bio-main'){
   // Signature green parapet planters framing the DSD-emblem solar PV roof (DSS/2025/002-003).
   buckets.greenRoof.push(boxGeo(b.w-1.0,.28,b.d-1.0,b.cx,bodyTop+.14,b.cz,b.deg,[10,10]));
   buckets.dsdSolar.push(boxGeo(b.w-5.0,.18,b.d-5.0,b.cx,bodyTop+.32,b.cz,b.deg,[b.w-5.0,b.d-5.0],false));
   // Normalize single planar UV [0..1] across top of the DSD emblem array so the "D" emblem spans the full roof cleanly.
   const dsdG=buckets.dsdSolar.at(-1),uv=dsdG.attributes.uv,p=dsdG.attributes.position,a=b.deg*Math.PI/180,ux=Math.cos(a),uz=Math.sin(a),vx=-uz,vz=ux;
   for(let i=0;i<p.count;i++){const dx=p.getX(i)-b.cx,dz=p.getZ(i)-b.cz;uv.setXY(i,(dx*ux+dz*uz)/(b.w-5)+.5,(dx*vx+dz*vz)/(b.d-5)+.5);}
  }else{
   buckets.greenRoof.push(boxGeo(b.w-1.2,.24,b.d-1.2,b.cx,bodyTop+.14,b.cz,b.deg,[8,8]));
   buckets.pv.push(boxGeo(b.w-4.6,.18,b.d-4.6,b.cx,bodyTop+.29,b.cz,b.deg,[10,8]));
  }

  // Rooftop scrubber / exhaust drums on CHP building (DSS/2025/002).
  if(b.kind==='hsk-chp'){
   const a=b.deg*Math.PI/180,ux=Math.cos(a),uz=Math.sin(a);
   for(const off of [-10,-5,0,5,10])buckets.tanks.push(cylGeo(1.1,1.1,2.6,12,b.cx+ux*off,bodyTop+1.4,b.cz+uz*off,[6,4]));
  }
 }

 // Waste gas burner / enclosed flare stack beside Biogas Pre-Treatment (Fig. 9.9: +29.35 mPD -> ~10 m).
 {const fx=-360,fz=-2455,fy=ground(fx,fz);
  buckets.plinths.push(boxGeo(4.2,1.6,4.2,fx,fy-.4,fz,34));
  buckets.steel.push(cylGeo(.65,.85,9.6,12,fx,fy+5.1,fz,[4,10]));
 }

 // 3. 5 Anaerobic Digesters + 3 Biogas Holding Tanks on 41C NW curve.
 for(const t of STW_TANKS){
  const samples=Array.from({length:8},(_,i)=>{const a=i*Math.PI/4;return ground(t.cx+Math.cos(a)*t.r,t.cz+Math.sin(a)*t.r);});
  const baseY=Math.max(...samples),minY=Math.min(...samples);
  const padH=baseY+.3-(minY-3.2);
  buckets.plinths.push(cylGeo(t.r+.55,t.r+.55,padH,20,t.cx,minY-3.2+padH/2,t.cz,[10,4]));
  const bodyBase=baseY+.3,cylH=t.h-2.0;
  buckets.tanks.push(cylGeo(t.r,t.r,cylH,24,t.cx,bodyBase+cylH/2,t.cz,[14,10]));
  buckets.tanks.push(cylGeo(1.2,t.r+.15,2.2,24,t.cx,bodyBase+cylH+1.1,t.cz,[14,6]));
  if(t.kind==='digester'){
   buckets.tankGreen.push(cylGeo(t.r+.28,t.r+.28,7.2,24,t.cx,bodyBase+3.6,t.cz,[12,8]));
   buckets.steel.push(cylGeo(t.r*.38,t.r*.38,.9,16,t.cx,bodyBase+cylH+2.2,t.cz,[4,2]));
  }
 }

 // 4. ACABAS Steel Warren-Truss Utility Bridge spanning Road D5 between 41A-south and 41C.
 let bridgeDeckY=0;
 {const [sx,sz]=UTILITY_BRIDGE.start,[ex,ez]=UTILITY_BRIDGE.end,dx=ex-sx,dz=ez-sz,L=Math.hypot(dx,dz);
  const ux=dx/L,uz=dz/L,nx=-uz,nz=ux,hw=UTILITY_BRIDGE.width/2,H=UTILITY_BRIDGE.height;
  let maxRoadY=Math.max(ground(sx,sz),ground(ex,ez));
  for(let i=0;i<=20;i++){const t=i/20;maxRoadY=Math.max(maxRoadY,ground(sx+dx*t,sz+dz*t));}
  const deckY=bridgeDeckY=Math.max(maxRoadY+6.4,ground(sx,sz)+6.0,ground(ex,ez)+6.0);
  // End piers / concrete portals (strictly at start & end, well clear of Road D5).
  for(const [px,pz] of [[sx,sz],[ex,ez]]){
   const gy=ground(px,pz),pierH=deckY+1.0-(gy-2.8);
   for(const side of [-1,1])buckets.plinths.push(beamGeo(px+nx*side*hw,gy-2.8,pz+nz*side*hw,px+nx*side*hw,deckY+.4,pz+nz*side*hw,.85,.85));
   buckets.plinths.push(beamGeo(px-nx*(hw+.4),deckY-.35,pz-nz*(hw+.4),px+nx*(hw+.4),deckY-.35,pz+nz*(hw+.4),.9,.9));
  }
  // Lower deck slab + top/bottom chords + diagonal Warren truss + top lateral struts + enclosed utility pipes.
  const deg=Math.atan2(dz,dx)*180/Math.PI;
  buckets.plinths.push(boxGeo(L,.32,UTILITY_BRIDGE.width-.4,(sx+ex)/2,deckY+.16,(sz+ez)/2,deg,[8,4]));
  for(const side of [-1,1]){
   const ox=nx*side*hw,oz=nz*side*hw;
   buckets.steel.push(beamGeo(sx+ox,deckY+.2,sz+oz,ex+ox,deckY+.2,ez+oz,.32,.32));
   buckets.steel.push(beamGeo(sx+ox,deckY+H,sz+oz,ex+ox,deckY+H,ez+oz,.32,.32));
   buckets.steel.push(beamGeo(sx+ox,deckY+.2,sz+oz,sx+ox,deckY+H,sz+oz,.34,.34));
   buckets.steel.push(beamGeo(ex+ox,deckY+.2,ez+oz,ex+ox,deckY+H,ez+oz,.34,.34));
  }
  const bays=10;
  for(let i=0;i<bays;i++){
   const t0=i/bays,t1=(i+1)/bays,tm=(i+.5)/bays;
   const x0=sx+dx*t0,z0=sz+dz*t0,x1=sx+dx*t1,z1=sz+dz*t1,xm=sx+dx*tm,zm=sz+dz*tm;
   for(const side of [-1,1]){
    const ox=nx*side*hw,oz=nz*side*hw;
    buckets.steel.push(beamGeo(x0+ox,deckY+.2,z0+oz,xm+ox,deckY+H,zm+oz,.22,.22));
    buckets.steel.push(beamGeo(xm+ox,deckY+H,zm+oz,x1+ox,deckY+.2,z1+oz,.22,.22));
   }
   buckets.steel.push(beamGeo(xm-nx*hw,deckY+H,zm-nz*hw,xm+nx*hw,deckY+H,zm+nz*hw,.22,.22));
  }
  for(const pipeOff of [-1.1,0,1.1]){
   const px=nx*pipeOff,pz=nz*pipeOff;
   buckets.steel.push(beamGeo(sx+px,deckY+1.4,sz+pz,ex+px,deckY+1.4,ez+pz,.52,.52));
  }
 }

 // 5. Security chain-link perimeter fence around each yard (open at vehicular gates and utility bridge landings).
 for(const y of STW_YARDS){
  const pts=y.poly;
  for(let i=0;i<pts.length;i++){
   const [ax,az]=pts[i],[bx,bz]=pts[(i+1)%pts.length],len=Math.hypot(bx-ax,bz-az),dx=(bx-ax)/len,dz=(bz-az)/len;
   const step=4;
   for(let t=0;t<len-.2;t+=step){
    const t1=Math.min(len,t+step),mx=ax+dx*(t+t1)/2,mz=az+dz*(t+t1)/2,segL=t1-t;
    if(net?.onStreet(mx,mz,1.5))continue;
    if(y.gates.some(([gx,gz])=>Math.hypot(mx-gx,mz-gz)<6))continue;
    if(Math.hypot(mx-UTILITY_BRIDGE.start[0],mz-UTILITY_BRIDGE.start[1])<5||Math.hypot(mx-UTILITY_BRIDGE.end[0],mz-UTILITY_BRIDGE.end[1])<5)continue;
    const xA=ax+dx*t,zA=az+dz*t,xB=ax+dx*t1,zB=az+dz*t1,yA=ground(xA,zA),yB=ground(xB,zB),ym=(yA+yB)/2;
    const heading=Math.atan2(-(zB-zA),xB-xA);
    const pg=new T.PlaneGeometry(segL,2.2),uv=pg.attributes.uv;
    for(let k=0;k<uv.count;k++)uv.setXY(k,uv.getX(k)*segL/.28,uv.getY(k)*2.2/.28);
    pg.rotateY(heading);pg.translate(mx,ym+1.1,mz);buckets.wire.push(pg);
    buckets.steel.push(boxGeo(.08,2.35,.08,xA,yA+1.15,zA,0));
    buckets.steel.push(beamGeo(xA,yA+2.25,zA,xB,yB+2.25,zB,.06,.06));
   }
  }
 }

 const ym=emitMerged(group,'STW paved yards',buckets.yards,M.yardMat,{castShadow:false,receiveShadow:true});
 if(ym)yardMeshes.push(ym);
 emitMerged(group,'STW plinths & abutments',buckets.plinths,M.plinthMat);
 emitMerged(group,'San Wai STW cladding',buckets.swClad,M.swCladMat);
 emitMerged(group,'San Wai STW admin',buckets.swAdmin,M.swAdminMat);
 emitMerged(group,'HSKEPP timber louvres',buckets.hskLouvre,M.hskLouvreMat);
 emitMerged(group,'HSKEPP admin & workshop',buckets.hskAdmin,M.hskAdminMat);
 emitMerged(group,'HSKEPP stone podium',buckets.stoneBase,M.stoneBaseMat);
 emitMerged(group,'STW green roofs',buckets.greenRoof,M.greenRoofMat,{castShadow:false});
 emitMerged(group,'STW solar arrays',buckets.pv,M.pvMat,{castShadow:false});
 emitMerged(group,'HSKEPP DSD emblem solar array',buckets.dsdSolar,M.dsdSolarMat,{castShadow:false});
 emitMerged(group,'STW digesters & tanks',buckets.tanks,M.tankMat);
 emitMerged(group,'HSKEPP digester green screens',buckets.tankGreen,M.tankGreenMat);
 emitMerged(group,'STW utility bridge & steelwork',buckets.steel,M.steelMat);
 emitMerged(group,'STW security fences',buckets.wire,M.wireMat,{castShadow:false});

 // 6. Architectural signage boards facing Road D5 & SGMTS Depot (east walls of HSK Sludge Main & San Wai Admin).
 {const b=STW_BUILDINGS.find(q=>q.id==='hsk-sludge-main'),a=b.deg*Math.PI/180,ux=Math.cos(a),uz=Math.sin(a),by=Math.max(...b.poly.map(p=>ground(...p)));
  group.add(signMesh('洪水橋淨水設施','HUNG SHUI KIU EFFLUENT POLISHING PLANT',true,new T.Vector3(b.cx+ux*(b.w/2+.4),by+23.5,b.cz+uz*(b.w/2+.4)),Math.atan2(ux,uz),28,5.6));}
 {const b=STW_BUILDINGS.find(q=>q.id==='sw-admin'),a=b.deg*Math.PI/180,ux=Math.cos(a),uz=Math.sin(a),by=Math.max(...b.poly.map(p=>ground(...p)));
  group.add(signMesh('新圍污水處理廠','SAN WAI SEWAGE TREATMENT WORKS',false,new T.Vector3(b.cx+ux*(b.w/2+.4),by+9.5,b.cz+uz*(b.w/2+.4)),Math.atan2(ux,uz),22,4.2));}

 // 7. Perimeter buffer planting trees inside the yards (well clear of buildings, tanks and roads; 3 InstancedMeshes total).
 {const assets=canopyTreeAssets(),spList=[assets.species[0],assets.species[2]],treePts=[];
  const clear=([x,z])=>!net?.blocked(x,z,3.5)&&!STW_BUILDINGS.some(b=>pointInPolygon([x,z],b.poly)||b.poly.some((p,i)=>segDist(x,z,p,b.poly[(i+1)%b.poly.length])<4))&&!STW_TANKS.some(t=>Math.hypot(x-t.cx,z-t.cz)<t.r+4);
  for(const y of STW_YARDS){
   const pts=y.poly,cx=pts.reduce((s,p)=>s+p[0],0)/pts.length,cz=pts.reduce((s,p)=>s+p[1],0)/pts.length;
   for(let i=0;i<pts.length;i++){
    const [ax,az]=pts[i],[bx,bz]=pts[(i+1)%pts.length],len=Math.hypot(bx-ax,bz-az);
    for(let d=10;d<len-8;d+=18){
     const px=ax+(bx-ax)*d/len,pz=az+(bz-az)*d/len,il=Math.hypot(cx-px,cz-pz)||1;
     const tx=px+(cx-px)/il*3.2,tz=pz+(cz-pz)/il*3.2;
     if(pointInPolygon([tx,tz],y.poly)&&clear([tx,tz])&&!y.gates.some(([gx,gz])=>Math.hypot(tx-gx,tz-gz)<8))treePts.push([tx,tz]);
    }
   }
  }
  if(treePts.length){
   const m4=new T.Matrix4(),q=new T.Quaternion(),e=new T.Euler(),p=new T.Vector3(),sc=new T.Vector3(),col=new T.Color();
   const trunks=[],crowns=[[],[]];
   for(const [tx,tz] of treePts){
    const idx=treeHash(tx,tz,7)<.5?0:1,sp=spList[idx],h=sp.lotHeightScale*(.85+.25*treeHash(tx,tz,3)),w=Math.min(h,5.2/sp.spreadRatio);
    const yaw=treeHash(tx,tz,2)*Math.PI*2,v=.9+.18*treeHash(tx,tz,4);
    e.set(0,yaw,0);q.setFromEuler(e);p.set(tx,ground(tx,tz),tz);sc.set(w,h,w);
    const mat4=m4.compose(p,q,sc).clone(),tint=col.setRGB(v,v,v).clone();
    trunks.push({mat4,tint});crowns[idx].push({mat4,tint});
   }
   const emitInst=(geo,mat,items,name)=>{if(!items.length)return;const im=new T.InstancedMesh(geo,mat,items.length);items.forEach((it,i)=>{im.setMatrixAt(i,it.mat4);im.setColorAt(i,it.tint);});im.name=name;im.castShadow=im.receiveShadow=true;im.instanceMatrix.needsUpdate=true;if(im.instanceColor)im.instanceColor.needsUpdate=true;im.computeBoundingSphere();im.updateMatrix();im.matrixAutoUpdate=false;group.add(im);};
   emitInst(assets.barkByKind.broadleaf,assets.lotBarkMaterial,trunks,'STW perimeter tree trunks');
   crowns.forEach((items,i)=>emitInst(spList[i].crownGeo,spList[i].material,items,'STW perimeter tree vegetation'));
  }
 }

 group.updateMatrixWorld(true);
 group.matrixAutoUpdate=false;
 return {group,yardMeshes,buildings:STW_BUILDINGS,tanks:STW_TANKS,bridgeDeckY};
}
