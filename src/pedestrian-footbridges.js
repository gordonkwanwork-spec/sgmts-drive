// Geometry, walking surfaces and lift stops use the same local frame on skewed roads.
import * as T from 'three';
import {panelParts} from './street/sandbox/railing-details.js';
import {frameAt,streetLevel} from './street/network.js';
import {mergeGeometries} from 'three/addons/utils/BufferGeometryUtils.js';
import {CYCLE_GAPS,cycleSample,cycleBridgeHeight,sample,project,FOOTBRIDGE_FORECOURT,crossingGeometry} from './alignment.js';
import {crossingY} from './city/crossings.js';

const BASE=.30, DECK=6.4, TOP_LANDING=3.8, GOING=.30, LANDING=1.8;
const RISERS=[11,10,10,11], RISE=(DECK-BASE)/42, STAIR_HALF=1.75;
const stair=[];
let run=TOP_LANDING,level=DECK;
for(const [i,count] of RISERS.entries()){
 for(let n=0;n<count;n++){
  level-=RISE;stair.push({start:run,end:run+GOING,level,nosing:true});run+=GOING;
 }
 if(i<RISERS.length-1){stair.push({start:run,end:run+LANDING,level});run+=LANDING;}
}
function world(frame,x,z){return {x:frame.x-frame.lx*x-frame.tx*z,z:frame.z-frame.lz*x-frame.tz*z};}
function local(frame,x,z){const dx=x-frame.x,dz=z-frame.z;return {x:-dx*frame.lx-dz*frame.lz,z:-dx*frame.tx-dz*frame.tz};}
function makeBridge(site,frame,datum,forecourt,roadside){
 const {road,half}=site;
 const ends=[-1,1].map(side=>{
  const z=side*(half+TOP_LANDING/2),door=world(frame,3.65,z);
  const lift={name:road.name+' footbridge lift',street:door,bridge:door,car:world(frame,6.56,z),base:datum+BASE,deck:datum+DECK};
  const from=world(frame,3.55,side*(half+.1)),to=roadside(from,side);
  const length=Math.hypot(to.x-from.x,to.z-from.z);
  const link={from,to,length,tx:(to.x-from.x)/length,tz:(to.z-from.z)/length,y0:lift.base,y1:to.y};
  return {side,lift,link};
 });
 return {...site,frame,datum,forecourt,ends,world:(x,z)=>world(frame,x,z)};
}
export const pedestrianBridges=CYCLE_GAPS.map(gap=>{
 const {road,centre}=gap,frame=cycleSample(centre),g=crossingGeometry(road);
 return makeBridge(gap,frame,frame.groundY,FOOTBRIDGE_FORECOURT,from=>{
  const dx=from.x-g.C.x,dz=from.z-g.C.z;
  const d=Math.max(-road.extent+2,Math.min(road.extent-2,dx*g.u.x+dz*g.u.z));
  const n=Math.sign(dx*g.n.x+dz*g.n.z)*(road.halfWidth+road.footway*.57);
  const x=g.C.x+g.u.x*d+g.n.x*n,z=g.C.z+g.u.z*d+g.n.z*n;
  return {x,z,y:crossingY(road,x,z)+.19};
 });
});
// Reserve the roof, entrances and their edges when siting road lighting on either kerb.
export function clearOfBridgeStructure(x,z,margin){
 return pedestrianBridges.every(b=>{
  const p=local(b.frame,x,z),d=Math.abs(p.z)-b.half;
  if(d<=0)return Math.abs(p.x)>2.68+margin;
  if(d>b.forecourt+margin)return true;
  return p.x< -2.35-margin||p.x>(d<TOP_LANDING+margin?8.25:6.15)+margin;
 });
}
export let cityPedestrianBridges=[];
let walkBridges=pedestrianBridges;
export function setCityFootbridges(sites){
 cityPedestrianBridges=sites.map(({o,d,frame:f})=>{
  // Local X points back along the road. Local Z carries the deck across it.
  const tx=-f.lx,tz=-f.lz,frame={x:f.x,z:f.z,tx,tz,lx:tz,lz:-tx,heading:Math.atan2(-tx,-tz)};
  const half=o.P.carriageway/2+o.P.footpath+.3;
  return makeBridge({road:o.r,half,streetDistance:d,centre:project(f.x,f.z)},frame,f.y+.23-BASE,25,(from,side)=>{
   const accessD=d+(from.x-f.x)*f.tx+(from.z-f.z)*f.tz,edge=frameAt(o.F,accessD),lat=side*(o.P.carriageway/2+o.P.footpath*.64);
   return {x:edge.x+edge.lx*lat,z:edge.z+edge.lz*lat,y:edge.y+(edge.crossSlope||0)*lat+streetLevel(o.r,accessD,lat)+.01};
  });
 });
 walkBridges=pedestrianBridges.concat(cityPedestrianBridges);
}
// Lower only the terrain triangles that can reach an entrance. Street and deck levels stay independent.
export function cityForecourtGround(x,z,y,margin){
 for(const b of cityPedestrianBridges){
  if(Math.abs(b.frame.x-x)>70||Math.abs(b.frame.z-z)>70)continue;
  const p=local(b.frame,x,z),d=Math.abs(p.z)-b.half;
  if(p.x>=-2.35-margin&&p.x<=8.25+margin&&d>=-margin&&d<=b.forecourt+margin)y=Math.min(y,b.datum-.06);
 }
 return y;
}
export function nearCityFootbridge(x,z,radius){
 return cityPedestrianBridges.some(b=>{const p=local(b.frame,x,z);return p.x>=-2.7-radius&&p.x<=8.3+radius&&Math.abs(p.z)<=b.half+b.forecourt+radius;});
}
// Bench the terrain beneath the entrances and merge it back into the natural verge.
export function footbridgeTerrain(x,z,s,natural){
 for(const b of pedestrianBridges){
  if(Math.abs(s-b.centre)>b.half+FOOTBRIDGE_FORECOURT+80)continue;
  const p=local(b.frame,x,z),d=Math.abs(p.z)-b.half;
  if(d<0||d>FOOTBRIDGE_FORECOURT+68)continue;
  const outside=Math.max(-4-p.x,p.x-13.5,0),w=Math.max(0,1-outside/10);
  if(!w)continue;
  const q=b.centre-p.z,level=d<=FOOTBRIDGE_FORECOURT?b.datum:sample(q).groundY+cycleBridgeHeight(q)-.30;
  return natural+(level-natural)*w;
 }
 return natural;
}
export function pedestrianLiftAt(p){
 for(const b of walkBridges)for(const {lift} of b.ends){
  if(Math.hypot(p.x-lift.street.x,p.z-lift.street.z)>1.5)continue;
  if(Math.abs(p.y-lift.base)<.55)return {lift,stop:'street'};
  if(Math.abs(p.y-lift.deck)<.55)return {lift,stop:'bridge'};
 }
 return null;
}
export function footbridgeFloor(x,z,fromY){
 for(const b of walkBridges){
  if(Math.abs(b.frame.x-x)>75||Math.abs(b.frame.z-z)>75)continue;
  const p=local(b.frame,x,z),d=Math.abs(p.z)-b.half;
  if(d<=0&&Math.abs(p.x)<=2.35&&Math.abs(fromY-(b.datum+DECK))<.75)return b.datum+DECK;
  if(d>=-1e-6&&d<=b.forecourt+1e-6&&p.x>=-2.35&&p.x<=8.25){
   if(d<=TOP_LANDING&&p.x<=5.05&&Math.abs(fromY-(b.datum+DECK))<.75)return b.datum+DECK;
   if(d>=TOP_LANDING&&Math.abs(p.x)<=STAIR_HALF){const step=stair.find(t=>d<t.end);if(step&&Math.abs(fromY-(b.datum+step.level))<.75)return b.datum+step.level;}
   if(p.x<=6.15||d<=TOP_LANDING)return b.datum+BASE;
  }
  for(const {link:l} of b.ends){const dx=x-l.from.x,dz=z-l.from.z,t=dx*l.tx+dz*l.tz;
   if(t>=0&&t<=l.length&&Math.abs(dx*l.tz-dz*l.tx)<=1.8)return l.y0+(l.y1-l.y0)*t/l.length;}
 }
 return null;
}

function liftSign(){
 const c=document.createElement('canvas');c.width=512;c.height=128;const ctx=c.getContext('2d');
 ctx.fillStyle='#154d49';ctx.fillRect(0,0,512,128);ctx.fillStyle='white';ctx.textAlign='center';
 ctx.font='bold 65px "PingFang HK", sans-serif';ctx.fillText('升降機   LIFT',256,87);
 const map=new T.CanvasTexture(c);map.colorSpace=T.SRGBColorSpace;
 return new T.MeshStandardMaterial({map,roughness:.75,emissive:0x444444,emissiveMap:map});
}

export function buildPedestrianBridges(scene,m,lampAt){
 const cabins=new Map(),sign=liftSign(),steel=m.galvanised;
 const glazing=new T.MeshStandardMaterial({color:0x74aaad,transparent:true,opacity:.38,roughness:.24,depthWrite:false});
 const type2=panelParts('railing_type2',steel)[0].geometry;
 const topBar=new T.MeshStandardMaterial({color:0xb18851,metalness:.36,roughness:.52});
 for(const b of walkBridges){
  const g=new T.Group();g.name='Pedestrian footbridge '+b.road.name;g.position.set(b.frame.x,b.datum,b.frame.z);g.rotation.y=b.frame.heading;scene.add(g);
  const bins=new Map();
  function add(geo,mat){if(!bins.has(mat))bins.set(mat,[]);bins.get(mat).push(geo);}
  function box(x,y,z,w,h,d,mat){add(new T.BoxGeometry(w,h,d).translate(x,y,z),mat);}
  const H=b.half;
  box(0,DECK-.23,0,4.7,.46,2*H,m.concrete);
  box(0,9.05,0,5.35,.18,2*H,m.teal);
  const panels=[];
  function guard(x1,z1,x2,z2,y=DECK,y2=y){
   const dx=x2-x1,dz=z2-z1,dy=y2-y,length=Math.hypot(dx,dz),n=Math.ceil(length/1.5);
   const rot=Math.atan2(dx,dz),stretch=length/(1.5*n),slope=dy/(1.5*n);
   for(let i=0;i<=n;i++){
    const t=i/n;box(x1+dx*t,y+dy*t+.56,z1+dz*t,.04,1.12,.04,steel);
    if(i===n)break;
    const mid=(i+.5)/n;
    const matrix=new T.Matrix4().makeRotationY(rot).multiply(new T.Matrix4().set(1,0,0,0, 0,1,slope,0, 0,0,stretch,0, 0,0,0,1));
    panels.push(matrix.setPosition(x1+dx*mid,y+dy*mid,z1+dz*mid));
   }
   const axis=new T.Vector3(dx,dy,dz),cap=new T.BoxGeometry(.06,.06,axis.length());
   cap.rotateX(-Math.atan2(dy,length)).rotateY(rot);
   add(cap.translate((x1+x2)/2,(y+y2)/2+1.13,(z1+z2)/2),topBar);
  }
  for(const side of [-1,1]){
   guard(side*2.31,-H,side*2.31,H);
   for(let i=0,n=Math.ceil(2*H/4.5);i<=n;i++)box(side*2.31,7.71,-H+i*2*H/n,.10,2.62,.10,m.teal);
  }
  for(let z=-H+2;z<H;z+=6){box(0,8.91,z,2.4,.08,.32,m.lamp);lampAt(g,0,8.78,z);}
  for(const {side,lift,link} of b.ends){
   const Z=d=>side*(H+d),zc=Z(TOP_LANDING/2);
   // The stair and its parallel 3.6 m through path have separate footprints. The lift waits face onto a recessed landing.
   const foundation=b.start==null?1.25:.5;
   box(1.9,BASE-foundation/2,Z(b.forecourt/2),8.5,foundation,b.forecourt,m.walk);
   box(6.56,BASE-foundation/2,zc,3.02,foundation,TOP_LANDING,m.concrete);
   box(1.35,DECK-.21,zc,7.4,.42,TOP_LANDING,m.concrete);
   box(1.35,9.05,zc,7.8,.18,TOP_LANDING,m.teal);
   box(0,3.12,Z(.7),1.05,5.94,1.15,m.concrete);
   // The compact upper landing bears directly on the adjacent lift shaft.
   guard(-2.31,Z(0),-2.31,Z(TOP_LANDING));guard(2.35,Z(0),5.05,Z(0));
   guard(1.75,Z(TOP_LANDING),5.05,Z(TOP_LANDING));guard(-2.31,Z(TOP_LANDING),-1.75,Z(TOP_LANDING));
   for(const t of stair){
    const h=Math.max(.09,t.level-BASE+.09),z=Z((t.start+t.end)/2);
    box(0,t.level-h/2,z,STAIR_HALF*2,h,t.end-t.start,m.concrete);
    if(t.nosing)box(0,t.level+.006,Z(t.end-.032),STAIR_HALF*2-.08,.012,.06,m.tactile);
   }
   for(const x of [-1.71,1.71]){
    let d=TOP_LANDING,y=DECK;
    for(const [i,n] of RISERS.entries()){
     const end=d+n*GOING,newY=y-n*RISE;
     guard(x,Z(d),x,Z(end),y,newY);
     d=end;y=newY;
     if(i<RISERS.length-1){guard(x,Z(d),x,Z(d+LANDING),y);d+=LANDING;}
    }
   }
   // A pitched cover follows each flight with level roof panels over the rest landings.
   let d=TOP_LANDING,y=DECK;
   for(const [i,n] of RISERS.entries()){
    const end=d+n*GOING,newY=y-n*RISE;
    const roof=new T.BoxGeometry(4.08,.12,Math.hypot(end-d,newY-y)+.035);
    roof.rotateX(side*Math.atan2(y-newY,end-d)).translate(0,(y+newY)/2+2.64,Z((d+end)/2));add(roof,m.teal);
    for(const x of [-1.83,1.83])box(x,newY+1.28,Z(end),.095,2.56,.095,m.teal);
    d=end;y=newY;
    if(i<RISERS.length-1){box(0,y+2.64,Z(d+LANDING/2),4.08,.12,LANDING+.02,m.teal);box(0,y+2.55,Z(d+LANDING/2),1.2,.045,.15,m.lamp);lampAt(g,0,y+2.48,Z(d+LANDING/2));d+=LANDING;}
   }
   for(const [d,y] of [[TOP_LANDING-.55,DECK],[run+.55,BASE]])box(0,y+.012,Z(d),3.35,.024,.55,m.tactile);
   for(const d of [12,b.forecourt-5]){
    box(5.85,BASE+1.75,Z(d),.11,3.5,.11,steel);
    box(5.53,BASE+3.51,Z(d),.75,.10,.22,m.teal);
    box(5.32,BASE+3.44,Z(d),.32,.05,.17,m.lamp);lampAt(g,5.32,BASE+3.40,Z(d));
   }
   // Side and rear glazing and slender corner columns leave the two entrances legible.
   for(const x of [5.08,8.05])for(const dz of [-1.6,1.6])box(x,4.78,zc+dz,.14,9,.14,m.teal);
   for(const dz of [-1.6,1.6])box(6.56,4.78,zc+dz,2.96,8.95,.06,glazing);
   box(8.05,4.78,zc,.06,8.95,3.2,glazing);box(6.56,9.33,zc,3.25,.22,3.52,m.teal);
   box(5.08,4.51,zc,.12,3.54,3.18,glazing);
   const doors=[];
   for(const floor of [BASE,DECK]){
    for(const dz of [-1.31,1.31])box(5.08,floor+1.12,zc+dz,.14,2.24,.58,m.concrete);
    box(5.08,floor+2.51,zc,.16,.55,3.2,m.concrete);
    add(new T.PlaneGeometry(1.7,.425).rotateY(-Math.PI/2).translate(4.985,floor+2.51,zc),sign);
    const pair=[];
    for(const dir of [-1,1]){const leaf=new T.Mesh(new T.BoxGeometry(.09,2.23,.99),steel);
     leaf.name='Lift sliding door';leaf.position.set(5.07,floor+1.12,zc+dir*.5);g.add(leaf);pair.push(leaf);}
    doors.push(pair);
    box(4.8,floor+2.72,zc,.56,.06,.65,m.lamp);lampAt(g,4.65,floor+2.66,zc);
    box(4.97,floor+1.04,zc+1.2,.06,.26,.13,m.yellow);
    box(3.95,floor+.012,zc, .5,.024,1.9,m.tactile);
   }
   const cab=new T.Mesh(new T.BoxGeometry(2.9,.14,3.04),steel);cab.name='Moving lift floor';cab.position.set(6.56,BASE-.07,zc);g.add(cab);
   cabins.set(lift,(height,street=0,bridge=0)=>{cab.position.y=height-b.datum-.07;cab.updateMatrix();cab.updateMatrixWorld(true);for(const [i,open] of [street,bridge].entries())doors[i].forEach((leaf,k)=>{leaf.position.z=zc+(k?1:-1)*(.5+.99*open);leaf.updateMatrix();leaf.updateMatrixWorld(true);});});
   const a=local(b.frame,link.from.x,link.from.z),v=local(b.frame,link.to.x,link.to.z),dx=(v.x-a.x)/link.length,dz=(v.z-a.z)/link.length;
   const corners=[[a,1,link.y0],[a,-1,link.y0],[v,-1,link.y1],[v,1,link.y1]].map(([p,k,y])=>[p.x+k*dz*1.8,y-b.datum,p.z-k*dx*1.8]);
   const geo=new T.BufferGeometry();geo.setAttribute('position',new T.Float32BufferAttribute(corners.flat(),3));geo.setAttribute('uv',new T.Float32BufferAttribute([0,0,1,0,1,link.length/3.6,0,link.length/3.6],2));geo.setIndex([0,1,2,0,2,3]);geo.computeVertexNormals();add(geo,m.walk);
  }
  const infill=new T.InstancedMesh(type2,steel,panels.length);infill.name='Type 2 bridge railing panels';
  panels.forEach((matrix,i)=>infill.setMatrixAt(i,matrix));infill.castShadow=false;infill.receiveShadow=true;g.add(infill);
  for(const [mat,geos] of bins){const mesh=new T.Mesh(mergeGeometries(geos),mat);mesh.castShadow=mesh.receiveShadow=true;g.add(mesh);for(const geo of geos)geo.dispose();}
 }
 return cabins;
}
