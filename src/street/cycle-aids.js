// Visual adaptation of TD's typical traffic-aids arrangements (not a dimensioned engineering layout).
import * as T from 'three';
import {mergeGeometries} from 'three/addons/utils/BufferGeometryUtils.js';
import {LENGTH,CROSSINGS,JUNCTIONS,CYCLE_BRIDGES,CYCLE_RAMP,cycleBridgeAt,cycleCrossing,cycleSample,cycleBridgeHeight} from '../alignment.js';
import {cycleSymbol} from './furniture.js';

export const CYCLE_ENDS=[{s:0,dir:-1},{s:LENGTH,dir:1},...JUNCTIONS.filter(j=>!CYCLE_BRIDGES.includes(j)).flatMap(j=>[-1,1].map(d=>({s:j.s+d*(j.halfWidth+.8),dir:-d})))];
export const CYCLE_PEDESTRIAN=CROSSINGS.filter(c=>!cycleCrossing(c.s));
export const CYCLE_DOWNHILL=CYCLE_BRIDGES.flatMap(j=>[-1,1].map(dir=>({s:j.s+dir*(j.halfWidth+18),dir,end:j.s+dir*(j.halfWidth+8+CYCLE_RAMP)})));
const clear=(s,half=0)=>s-half>=0&&s+half<=LENGTH&&![s-half,s,s+half].some(cycleCrossing);
const surface=s=>cycleSample(s).groundY+cycleBridgeHeight(s);

// Texture top points in the riding direction; its lateral coordinate follows the same keep-left lane as riders.
export function cycleMarkGeometry(ribbon,s,lat,width,length,dir){
 const g=ribbon(s-length/2,s+length/2,lat-width/2,lat+width/2,.028),uv=g.attributes.uv;
 for(let i=0;i<uv.count;i++){const lateral=uv.getX(i)*5,along=uv.getY(i)*5;uv.setXY(i,.5-dir*(lateral-lat)/width,.5+dir*(along-s)/length);}return g;
}
const verge=s=>cycleBridgeAt(s)?2.08:2.5;
export function cycleSignPose(s,dir,lat=dir*verge(s)){const p=cycleSample(s);return {x:p.x+p.lx*lat,y:surface(s),z:p.z+p.lz*lat,yaw:p.heading+(dir===1?0:Math.PI)};}

export function buildCycleAids(ribbon,white,metal){
 const group=new T.Group();group.name='Cycle track traffic aids';const buckets=new Map(),materials={};
 const add=(name,g,m)=>{if(g.index?!g.index.count:!g.attributes.position.count){g.dispose();return;}(buckets.get(name)||buckets.set(name,{m,parts:[]}).get(name)).parts.push(g);};
 const paint=(name,a,b,l,r,m=white,h=.025)=>{if(b<=0||a>=LENGTH)return;add(name,ribbon(Math.max(0,a),Math.min(LENGTH,b),l,r,h),m);};
 function texture(kind){if(materials[kind])return materials[kind];const c=document.createElement('canvas');c.width=256;c.height=kind==='slow'||kind==='end'?512:256;const x=c.getContext('2d');x.lineJoin=x.lineCap='round';
  const text=(t,y,size=52)=>{x.fillStyle='#111';x.font=`bold ${size}px "PingFang HK",sans-serif`;x.textAlign='center';x.fillText(t,128,y);};
  const bike=()=>x.drawImage(cycleSymbol(),0,105,128,110,46,103,164,112);
  if(kind==='bike'){x.drawImage(cycleSymbol(),0,0,128,256,0,0,256,256);}
  else if(kind==='slow'||kind==='end'){x.fillStyle='white';x.textAlign='center';x.font='bold 91px "PingFang HK",sans-serif';x.fillText(kind==='slow'?'慢駛':'終止',128,160);x.font='bold 77px Arial';x.fillText(kind==='slow'?'SLOW':'END',128,350);}
  else if(kind==='pedestrian'||kind==='slope'){
   x.beginPath();x.moveTo(128,15);x.lineTo(242,226);x.lineTo(14,226);x.closePath();x.fillStyle='white';x.fill();x.strokeStyle='#d72823';x.lineWidth=17;x.stroke();
   x.fillStyle=x.strokeStyle='#111';x.lineWidth=11;
   if(kind==='pedestrian'){for(const [cx,cy,k] of [[110,94,1],[160,135,.65]]){x.beginPath();x.arc(cx,cy,11*k,0,Math.PI*2);x.fill();x.beginPath();x.moveTo(cx,cy+20*k);x.lineTo(cx-6*k,cy+54*k);x.lineTo(cx-24*k,cy+87*k);x.moveTo(cx-6*k,cy+54*k);x.lineTo(cx+17*k,cy+87*k);x.moveTo(cx,cy+22*k);x.lineTo(cx-23*k,cy+40*k);x.moveTo(cx,cy+22*k);x.lineTo(cx+25*k,cy+40*k);x.stroke();}}
   else{x.beginPath();x.moveTo(65,158);x.lineTo(199,210);x.lineTo(65,210);x.closePath();x.fill();x.save();x.translate(131,135);x.rotate(.36);x.lineWidth=5;for(const cx of [-33,33]){x.beginPath();x.arc(cx,0,17,0,Math.PI*2);x.stroke();}x.beginPath();x.moveTo(-33,0);x.lineTo(-18,-31);x.lineTo(10,0);x.closePath();x.moveTo(-18,-31);x.lineTo(22,-31);x.lineTo(10,0);x.moveTo(33,0);x.lineTo(18,-43);x.lineTo(31,-43);x.moveTo(-25,-39);x.lineTo(-11,-39);x.stroke();x.restore();}
  }else if(kind==='keep-left'||kind==='cycle'){
   x.fillStyle='#0756af';x.beginPath();x.arc(128,128,119,0,Math.PI*2);x.fill();x.strokeStyle='white';x.lineWidth=6;x.stroke();
   if(kind==='cycle')bike();else{x.strokeStyle='white';x.lineWidth=29;x.beginPath();x.moveTo(178,76);x.lineTo(78,176);x.moveTo(78,115);x.lineTo(78,176);x.lineTo(139,176);x.stroke();}
  }else if(kind==='dismount'||kind==='slow-sign'){
   x.fillStyle='white';x.fillRect(3,3,250,250);x.strokeStyle='#111';x.lineWidth=6;x.strokeRect(3,3,250,250);
   if(kind==='dismount'){text('Cyclists',54,38);text('dismount',98,38);text('騎單車者',162,43);text('下車',222,48);}else{text('SLOW',105,63);text('慢駛',198,72);}
  }else{const right=kind==='chevron-right';x.fillStyle='#eef333';x.fillRect(0,0,256,256);x.fillStyle='#101717';for(const off of [-50,78]){x.beginPath();for(const [px,py] of [[off,24],[off+62,24],[off+151,128],[off+62,232],[off,232],[off+90,128]])x.lineTo(right?px:256-px,py);x.closePath();x.fill();}}
  const map=new T.CanvasTexture(c);map.colorSpace=T.SRGBColorSpace;map.anisotropy=4;return materials[kind]=new T.MeshStandardMaterial({map,transparent:true,alphaTest:.2,roughness:.8,side:T.FrontSide,polygonOffset:true,polygonOffsetFactor:-1});
 }
 const mark=(kind,s,dir,length=3.4)=>{if(clear(s,length/2))add('Cycle marking '+kind,cycleMarkGeometry(ribbon,s,dir*.94,1.25,length,dir),texture(kind));};
 function sign(kind,s,dir,{lat=dir*verge(s),y=2.2,size=.68,post=true}={}){if(!clear(s))return;const p=cycleSignPose(s,dir,lat),matrix=new T.Matrix4().makeRotationY(p.yaw).setPosition(p.x,p.y+y,p.z);
  add('Cycle sign '+kind,new T.PlaneGeometry(size,size).translate(0,0,.055).applyMatrix4(matrix),texture(kind));
  // Backing plate faces away from approaching riders, preventing mirrored symbols from the reverse side.
  add('Cycle sign backs',new T.PlaneGeometry(size,size).rotateY(Math.PI).translate(0,0,.043).applyMatrix4(matrix),metal);
  if(post)add('Cycle sign posts',new T.CylinderGeometry(.032,.032,y+.1,8).translate(p.x,p.y+(y+.1)/2,p.z),metal);
 }
 const crossingNear=(s,d=3)=>CYCLE_PEDESTRIAN.some(c=>Math.abs(c.s-s)<d),endNear=s=>CYCLE_ENDS.some(e=>Math.abs(e.s-s)<17);
 // Edge lines break across pedestrian routes; the centreline becomes hatched on approaches.
 for(let s=0;s<LENGTH;s+=1){if(crossingNear(s+.5,2))continue;for(const side of [-1,1])paint('Cycle edge lines',s,s+1,side*1.86-.045,side*1.86+.045);
  if(!crossingNear(s+.5,15)&&!endNear(s+.5)&&s%6<2)paint('Cycle centre dashes',s,s+1,-.05,.05);}
 function hatch(a,b){if(b-a<2)return;for(const d of [-1,1])paint('Cycle hatched divider',a,b,d*.28-.045,d*.28+.045);
  for(let s=a;s<b-1;s+=2)paint('Cycle hatched divider',s,s+1,q=>-.24+(q-s)*.48,q=>-.17+(q-s)*.48);}
 const amber=new T.MeshStandardMaterial({color:0xb5a05c,roughness:.95,side:T.DoubleSide});
 for(const c of CYCLE_PEDESTRIAN){paint('Cycle pedestrian crossing',c.s-1.8,c.s+1.8,-2,2,amber,.019);
  for(const dir of [-1,1]){const approach=c.s-dir*8;hatch(Math.min(c.s-dir*3,c.s-dir*14),Math.max(c.s-dir*3,c.s-dir*14));
   mark('slow',c.s-dir*21,dir);mark('bike',approach,dir);sign('pedestrian',c.s-dir*16,dir);sign('keep-left',c.s-dir*4,dir,{lat:0,y:.95,size:.38});}}
 for(let s=25;s<LENGTH-5;s+=70){if(crossingNear(s,26)||endNear(s))continue;for(const dir of [-1,1])mark('bike',s,dir,3.2);}
 for(const e of CYCLE_ENDS){hatch(Math.min(e.s-e.dir*15,e.s-e.dir*2),Math.max(e.s-e.dir*15,e.s-e.dir*2));mark('end',e.s-e.dir*5.3,e.dir,4);
  sign('dismount',e.s-e.dir*9,e.dir);if(e.s===0||e.s===LENGTH)sign('cycle',e.s-e.dir*2,-e.dir);}
 for(const d of CYCLE_DOWNHILL){mark('slow',d.s-d.dir*5,d.dir);sign('slope',d.s,d.dir,{y:2.8});sign('slow-sign',d.s,d.dir,{y:2.05,size:.6,post:false});sign('dismount',d.s+d.dir*4,d.dir);
  // Only show chevrons where the sampled alignment actually turns, and on its outside verge.
  const a=cycleSample(Math.max(0,Math.min(LENGTH,d.end-d.dir*20))),b=cycleSample(Math.max(0,Math.min(LENGTH,d.end+d.dir*12))),turn=Math.atan2(Math.sin(b.heading-a.heading),Math.cos(b.heading-a.heading));
  if(Math.abs(turn)>.12)for(const offset of [-4,0,4])sign(turn>0?'chevron-left':'chevron-right',d.end+offset,d.dir,{lat:-Math.sign(turn)*d.dir*verge(d.end+offset),y:1.5,size:.7});}
 for(const [name,{m,parts}] of buckets){const mesh=new T.Mesh(mergeGeometries(parts),m);mesh.name=name;mesh.receiveShadow=true;group.add(mesh);for(const p of parts)p.dispose();}
 return group;
}
