import * as T from 'three';
import {mergeGeometries} from 'three/addons/utils/BufferGeometryUtils.js';
import {STOPS} from './alignment.js';

// Saloon fit-out added in code on top of art.glb (section-local metres, front of vehicle is -z).
// Measured from the model: doorways centred at z −1.2 / +1.6 in every section, ceiling cove slopes from
// x 1.17 m (y 2.60) to 0.98 m (y 2.90), aisle floor 0.63 m, ceiling 3.05 m, podium seat backs at z ±3.
export const DOOR_Z=[-1.2,1.6];
const SALOON={section_front:[-2.1,4.9],section_mid:[-4.9,4.9],section_rear:[-4.9,2.1]};
const COVE_TILT=Math.atan2(.19,.3),AD=[.66,.22],AD_PITCH=.74;
export const INTERIOR_ADVERTS=['billboard-coffee','billboard-dining','billboard-family','billboard-fitness','billboard-harbour','billboard-shopping',...STOPS.map(s=>'billboard-'+s.id)];

const mat={
 steel:new T.MeshStandardMaterial({color:0xd5d9dc,metalness:.85,roughness:.28}),
 white:new T.MeshStandardMaterial({color:0xf1f2ef,roughness:.6}),
 glass:new T.MeshStandardMaterial({color:0xcfe3e6,roughness:.08,metalness:.1,transparent:true,opacity:.28,depthWrite:false}),
 dark:new T.MeshStandardMaterial({color:0x1d2124,roughness:.5}),
 dome:new T.MeshStandardMaterial({color:0x9aa3a8,roughness:.25,metalness:.3}),
 red:new T.MeshStandardMaterial({color:0xd8322b,roughness:.45,emissive:0x400806}),
 yellow:new T.MeshStandardMaterial({color:0xf2c418,roughness:.5}),
 blue:new T.MeshStandardMaterial({color:0x1d63b8,roughness:.5}),
 diffuser:new T.MeshStandardMaterial({color:0xffffff,emissive:0xfff3e0,emissiveIntensity:.55,roughness:.9}),
};
const tube=(a,b,r=.018)=>{const d=new T.Vector3().subVectors(b,a),g=new T.CylinderGeometry(r,r,d.length(),10);g.translate(0,d.length()/2,0);g.applyQuaternion(new T.Quaternion().setFromUnitVectors(new T.Vector3(0,1,0),d.normalize()));return g.translate(a.x,a.y,a.z);};
const box=(w,h,d,x,y,z)=>new T.BoxGeometry(w,h,d).translate(x,y,z);
const V=(x,y,z)=>new T.Vector3(x,y,z);

// Static fit-out for one section, merged per material (a few draw calls, shown only with the saloon).
function fitOut(name,parts){
 const [z0,z1]=SALOON[name];
 for(const side of [-1,1]){
  for(const dz of DOOR_Z){
   // Draft screens either side of each doorway: framed glass, stainless top rail, stop-request button, intercom.
   for(const e of [-.62,.62]){const z=dz+e;
    parts.glass.push(box(.42,1.05,.012,side*.95,1.55,z));
    parts.steel.push(tube(V(side*.73,.66,z),V(side*.73,2.98,z),.02),tube(V(side*.73,2.1,z),V(side*1.17,2.1,z),.017),tube(V(side*.73,1.02,z),V(side*1.17,1.02,z),.015));
    parts.red.push(box(.05,.07,.04,side*.73,1.42,z+Math.sign(e)*.03));}
   parts.dark.push(box(.03,.22,.14,side*1.165,1.48,dz+.64));parts.yellow.push(box(.035,.05,.05,side*1.165,1.52,dz+.64));parts.red.push(box(.035,.04,.04,side*1.165,1.44,dz+.64));
  }
  // Window surrounds on each wall run between doorways: sill, head rail, rubber-lined mullions every ~1.2 m.
  const cuts=[z0,DOOR_Z[0]-.55,DOOR_Z[0]+.55,DOOR_Z[1]-.55,DOOR_Z[1]+.55,z1];
  for(let i=0;i<cuts.length;i+=2){const a=cuts[i],b=cuts[i+1],len=b-a,n=Math.max(1,Math.round(len/1.2));
   parts.white.push(box(.1,.05,len,side*1.2,1.1,(a+b)/2),box(.07,.06,len,side*1.22,2.63,(a+b)/2));
   for(let k=0;k<=n;k++){const z=a+len*k/n;parts.white.push(box(.07,1.5,.09,side*1.235,1.87,z));parts.dark.push(box(.072,1.46,.012,side*1.236,1.87,z+.05),box(.072,1.46,.012,side*1.236,1.87,z-.05));}}
  // Grab rails along each podium seat back (backrests top out at 1.93 m).
  for(const zb of [-3,3])if(zb>z0&&zb<z1)parts.steel.push(tube(V(side*.62,1.98,zb),V(side*1.15,1.98,zb),.016),tube(V(side*.62,1.45,zb),V(side*.62,1.98,zb),.016));
  // Ceiling light diffusers and a CCTV dome per side.
  parts.diffuser.push(box(.22,.02,z1-z0-.4,side*.52,3.035,(z0+z1)/2));
  const dome=new T.SphereGeometry(.04,12,6,0,Math.PI*2,0,Math.PI/2).rotateX(Math.PI).translate(side*.3,3.03,side*2.2);parts.dome.push(dome);
 }
 if(name==='section_front'){parts.red.push(new T.CylinderGeometry(.07,.07,.42,12).translate(.95,.88,-1.95));parts.dark.push(box(.12,.1,.09,.95,1.13,-1.95));}
}

// Cove advert slots between doorways (mirrored on both sides), each a 3:1 card on the sloping cove.
function advertSlots(name){const [z0,z1]=SALOON[name],cuts=[z0,DOOR_Z[0]-.62,DOOR_Z[0]+.62,DOOR_Z[1]-.62,DOOR_Z[1]+.62,z1],slots=[];
 for(let i=0;i<cuts.length;i+=2){const a=cuts[i]+.06,b=cuts[i+1]-.06,n=Math.floor((b-a)/AD_PITCH);for(let k=0;k<n;k++)slots.push(a+(b-a)/2+(k-(n-1)/2)*AD_PITCH);}return slots;}

// Live displays: one canvas per vehicle for the ceiling next-stop signs, one for the door-header route maps.
function display(w,h){const canvas=document.createElement('canvas');canvas.width=w;canvas.height=h;const map=new T.CanvasTexture(canvas);map.colorSpace=T.SRGBColorSpace;map.anisotropy=4;return {canvas,map,material:new T.MeshBasicMaterial({map,toneMapped:false}),key:''};}

export function furnishTram(tram,adverts,index=0){
 const screens={next:display(512,150),route:display(1024,128)};tram.screens=screens;
 tram.sections.forEach(section=>{
  const host=tram.interiors.find(it=>it.section===section&&/^passenger_interior_\d$/.test(it.node.name))?.node;if(!host)return;
  // The model's static screens and LED text are replaced by the live ceiling sign below.
  host.traverse(n=>{if(n.isMesh&&/_(led_orange|pids_screen)$/.test(n.name))n.visible=false;});
  const parts=Object.fromEntries(Object.keys(mat).map(k=>[k,[]]));fitOut(section.name,parts);
  const g=new T.Group();g.name='Saloon fit-out';
  for(const [k,list] of Object.entries(parts))if(list.length){const m=new T.Mesh(mergeGeometries(list.map(x=>x.index?x.toNonIndexed():x)),mat[k]);m.name='Fit-out '+k;g.add(m);}
  // Cove adverts reuse the street/station artwork; neighbouring cards and sections differ.
  advertSlots(section.name).forEach((z,i)=>{for(const side of [-1,1]){const ad=adverts[(index*5+i*2+(side>0?1:0)+section.name.length)%adverts.length],m=new T.Mesh(new T.PlaneGeometry(...AD),ad);
   m.position.set(side*1.06,2.755,z);m.rotation.set(0,-side*Math.PI/2,0);m.rotateX(COVE_TILT);m.name='Saloon advert';g.add(m);}});
  // Door headers: route map, angled with the cove.
  for(const dz of DOOR_Z)for(const side of [-1,1]){const m=new T.Mesh(new T.PlaneGeometry(.9,.112),screens.route.material);m.position.set(side*1.045,2.82,dz);m.rotation.set(0,-side*Math.PI/2,0);m.rotateX(COVE_TILT);m.name='Door route display';g.add(m);
   const frame=new T.Mesh(new T.BoxGeometry(.94,.15,.02),mat.dark);frame.position.copy(m.position);frame.quaternion.copy(m.quaternion);frame.translateZ(-.012);g.add(frame);}
  // Ceiling next-stop sign at the model's LED sign position, readable from both ends of the saloon.
  const sign=new T.Group();sign.position.set(0,2.9,.2);sign.name='Next stop display';
  sign.add(new T.Mesh(new T.BoxGeometry(.78,.28,.12),mat.dark));for(const s of [1,-1]){const f=new T.Mesh(new T.PlaneGeometry(.68,.2),screens.next.material);f.position.z=s*.062;if(s<0)f.rotation.y=Math.PI;sign.add(f);}
  g.add(sign);host.add(g);});
}

const FONT='"Segoe UI",Helvetica,Arial,sans-serif',ZH='"PingFang HK","Microsoft JhengHei",sans-serif';
// next: index of the next (or current, while dwelling) stop; dir: travel direction; blink: on/off phase.
export function drawTramScreens(tram,{next,dir,here,blink}){
 const {next:n,route:r}=tram.screens,st=STOPS[next],key=[next,dir,here,blink].join();if(key===n.key)return false;n.key=r.key=key;
 let x=n.canvas.getContext('2d');x.fillStyle='#0b1b2e';x.fillRect(0,0,512,150);x.textBaseline='middle';
 if(st){x.fillStyle='#ffb347';x.font=`500 22px ${FONT}`;x.textAlign='left';x.fillText(here?'本站 This stop':'下一站 Next stop',18,32);
  x.fillStyle='#fff';x.font=`600 44px ${ZH}`;x.fillText(st.zh,18,98);const w=x.measureText(st.zh).width;x.font=`500 32px ${FONT}`;x.fillText(st.name,36+w,100);}
 else{x.fillStyle='#fff';x.font=`500 30px ${FONT}`;x.textAlign='center';x.fillText('終點站 Terminus',256,75);}
 n.map.needsUpdate=true;
 // Route strip: stops left to right in travel order; passed stops grey, next/current blinks, later stops white.
 x=r.canvas.getContext('2d');x.fillStyle='#10202c';x.fillRect(0,0,1024,128);const order=dir===1?STOPS.map((_,i)=>i):STOPS.map((_,i)=>6-i),gap=1024/7,cy=42;
 x.strokeStyle='#e8762c';x.lineWidth=8;x.beginPath();x.moveTo(gap/2,cy);x.lineTo(1024-gap/2,cy);x.stroke();
 order.forEach((i,k)=>{const cx=gap*(k+.5),passed=order.indexOf(next)>k,current=i===next,s=STOPS[i];
  x.fillStyle=passed?'#5d6870':current?(blink?'#ffcf33':'#10202c'):'#ffffff';x.strokeStyle=passed?'#5d6870':current?'#ffcf33':'#e8762c';x.lineWidth=5;x.beginPath();x.arc(cx,cy,current?17:12,0,Math.PI*2);x.fill();x.stroke();
  x.fillStyle=passed?'#7c878e':current?'#ffcf33':'#ffffff';x.textAlign='center';x.font=`600 24px ${ZH}`;x.fillText(s.zh,cx,cy+40);x.font=`16px ${FONT}`;x.fillText(s.name.length>15?s.name.replace('Hung Shui Kiu','HSK'):s.name,cx,cy+68);});
 x.fillStyle='#e8762c';x.beginPath();x.moveTo(1012,cy);x.lineTo(998,cy-10);x.lineTo(998,cy+10);x.fill();
 r.map.needsUpdate=true;return true;}

// Passengers' glass: the window film and wrap printing face outwards; from inside the body reads as lining
// and the film as a dark perforated screen (applied in tram-adverts.js via gl_FrontFacing).
export const INSIDE_GLASS_OPACITY=.45;
