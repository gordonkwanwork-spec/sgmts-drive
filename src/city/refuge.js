// Pedestrian refuge details. The body dimensions are shared with the Hong Kong street sandbox.
import * as T from 'three';
import {mergeGeometries} from 'three/addons/utils/BufferGeometryUtils.js';
import {NRTB} from '../street/sandbox/street-rules.js';

// H5122A: one field on a shallow refuge, two 600 mm warning strips on a deeper one.
export function warningBands(width){
 const half=width/2;
 return width<1.8?[[-half,half]]:[[-half+.3,-half+.9],[half-.9,half-.3]];
}

const unit=new T.Vector3(1,1,1);
let bollard;
function bollardParts(){
 if(bollard)return bollard;
 const {body,base,neck,plinth,bodyBottom,roundel}=NRTB,w=body.w/2,h=body.h,z=body.depth/2;
 // A broad, slightly crowned head and a tapered lower moulding, like the photographed flexible bollard.
 const shield=new T.Shape();
 shield.moveTo(-.056,0);shield.quadraticCurveTo(-.16,.12,-w,.24);shield.lineTo(-w,h-.036);
 shield.quadraticCurveTo(-w,h,-w+.03,h);shield.quadraticCurveTo(0,h+.012,w-.03,h);
 shield.quadraticCurveTo(w,h,w,h-.036);shield.lineTo(w,.24);shield.quadraticCurveTo(.16,.12,.056,0);shield.closePath();
 const shell=new T.ExtrudeGeometry(shield,{depth:body.depth,bevelEnabled:true,bevelSize:.007,bevelThickness:.007,bevelSegments:2,curveSegments:6}).translate(0,bodyBottom,-z);
 const block=(width,height,depth,y)=>new T.BoxGeometry(width,height,depth).translate(0,y,0).toNonIndexed();
 const rubber=new T.MeshStandardMaterial({color:0x252728,roughness:.82});
 const hardware=mergeGeometries([shell,block(base.w,base.h,base.d,plinth.h+base.h/2),
  new T.CylinderGeometry(neck.r,neck.r*1.2,neck.h,12).translate(0,plinth.h+base.h+neck.h/2,0).toNonIndexed()]);
 const flange=block(plinth.w,plinth.h,plinth.d,plinth.h/2),bolts=[];
 for(const x of [-.12,.12])for(const dz of [-.12,.12])bolts.push(new T.CylinderGeometry(.013,.013,.014,6).translate(x,plinth.h+base.h+.006,dz).toNonIndexed());
 // The recessed yellow panel follows the actual silhouette on both faces. Only approaching traffic sees an arrow.
 const panel=new T.ShapeGeometry(shield,8);panel.scale(.927,.955,1);panel.translate(0,.018,0);
 const uv=panel.attributes.uv,pos=panel.attributes.position;
 for(let i=0;i<pos.count;i++)uv.setXY(i,.5+pos.getX(i)/body.w,pos.getY(i)/h);
 const front=panel.clone().translate(0,bodyBottom,z+.008);
 const yellow=new T.MeshStandardMaterial({color:0xffbd14,emissive:0x805800,emissiveIntensity:.14,roughness:.48});
 const rear=panel.rotateY(Math.PI).translate(0,bodyBottom,-z-.008).toNonIndexed();
 const sides=[-1,1].map(k=>block(.003,NRTB.side.h,NRTB.side.w,bodyBottom+.51).translate(k*(w+.008),0,0));
 const c=document.createElement('canvas');c.width=256;c.height=560;const ctx=c.getContext('2d');
 ctx.fillStyle='#ffbd14';ctx.fillRect(0,0,256,560);
 ctx.fillStyle='#ffcb22';ctx.fillRect(0,0,256,389);
 const cx=128,cy=(1-NRTB.roundelCentre/h)*560,rad=roundel.r/body.w*256;
 for(const [radius,color] of [[rad,'#fff'],[rad-3,'#1252ab']]){ctx.beginPath();ctx.arc(cx,cy,radius,0,2*Math.PI);ctx.fillStyle=color;ctx.fill();}
 ctx.save();ctx.translate(cx,cy);ctx.rotate(Math.PI/4);ctx.fillStyle='#fff';ctx.beginPath();
 ctx.moveTo(-13,-67);ctx.lineTo(13,-67);ctx.lineTo(13,13);ctx.lineTo(44,13);ctx.lineTo(0,70);ctx.lineTo(-44,13);ctx.lineTo(-13,13);ctx.closePath();ctx.fill();ctx.restore();
 ctx.textAlign='center';ctx.fillStyle='#302e28';ctx.font='bold 26px sans-serif';ctx.fillText('H2312',128,327);
 ctx.fillStyle='#f1ede2';ctx.fillRect(103,337,50,12);
 const map=new T.CanvasTexture(c);map.colorSpace=T.SRGBColorSpace;map.anisotropy=8;
 bollard=[['housing',hardware,rubber],['plinth',flange,new T.MeshStandardMaterial({color:0x595957,roughness:.92})],
  ['bolts',mergeGeometries(bolts),new T.MeshStandardMaterial({color:0xaaaead,metalness:.5,roughness:.5})],
  ['reflectors',mergeGeometries([rear,...sides]),yellow],
  ['face',front,new T.MeshStandardMaterial({map,emissive:0xffffff,emissiveMap:map,emissiveIntensity:.13,roughness:.48})]];
 return bollard;
}

export function keepLeftBollard(batch,x,y,z,yaw,chunk){
 const at=new T.Vector3(x,y,z),rot=new T.Euler(0,yaw,0);
 for(const [part,geo,mat] of bollardParts())batch('refuge-bollard-'+part,geo,mat,at,unit,rot,chunk);
}

export const STATION_REFUGE_WIDTH=.9;
const length=3,r=STATION_REFUGE_WIDTH/2;
let nose;
// A flat end against the waiting area and a semicircle facing traffic. The concrete kerb is laid in sections.
function noseGeometry(){
 const pos=[],colors=[],grey=new T.Color();
 const tri=(a,b,c,colour)=>{pos.push(...a,...b,...c);grey.setHex(colour);for(let i=0;i<3;i++)colors.push(grey.r,grey.g,grey.b);};
 const contour=(inset)=>{
  const rad=r-inset,points=[[-rad,inset],[rad,inset]];
  for(let i=0;i<=12;i++){const angle=Math.PI*i/12;points.push([rad*Math.cos(angle),length-r+rad*Math.sin(angle)]);}
  return points;
 };
 const outer=contour(0),rim=contour(.025),inner=contour(.125),center=[0,.146,length/2];
 const pt=(a,y)=>[a[0],y,a[1]],mix=(a,b,t)=>a.map((v,i)=>v+(b[i]-v)*t);
 for(let i=0;i<outer.length;i++){
  const j=(i+1)%outer.length;
  const slabs=(i===1||j===0)?3:1;
  for(let k=0;k<slabs;k++){
   const joint=i<2||j===0||i%4===1,span=Math.hypot(outer[j][0]-outer[i][0],outer[j][1]-outer[i][1]);
   const end=(k+1)/slabs,seam=end-(joint?.008/span:0);
   for(const [a,b,col] of [[k/slabs,seam,0xa5a49e],[seam,end,0x5d5b55]]){
    if(b<=a)continue;
    const strip=(ring1,y1,ring2,y2,colour)=>{
     const p=pt(mix(ring1[i],ring1[j],a),y1),q=pt(mix(ring1[i],ring1[j],b),y1);
     const s=pt(mix(ring2[i],ring2[j],a),y2),t=pt(mix(ring2[i],ring2[j],b),y2);
     tri(p,s,q,colour);tri(q,s,t,colour);
    };
    strip(outer,-.02,outer,.075,col);strip(outer,.075,rim,.15,col);strip(rim,.15,inner,.15,col);
   }
  }
  tri(center,pt(inner[j],.15),pt(inner[i],.15),0x82817a);
 }
 const geo=new T.BufferGeometry();geo.setAttribute('position',new T.Float32BufferAttribute(pos,3));geo.setAttribute('color',new T.Float32BufferAttribute(colors,3));geo.setAttribute('uv',new T.Float32BufferAttribute(Array.from({length:pos.length/3},(_,i)=>[pos[3*i],pos[3*i+2]+pos[3*i+1]]).flat(),2));geo.computeVertexNormals();return geo;
}
// Shared metre-scale aggregate and broom marks keep grey concrete legible at pedestrian eye level.
function noseMaterial(){
 const c=document.createElement('canvas');c.width=c.height=256;const ctx=c.getContext('2d');
 ctx.fillStyle='#ece8e1';ctx.fillRect(0,0,256,256);
 let seed=2312;const random=()=>((seed=Math.imul(seed,1664525)+1013904223>>>0)/4294967296);
 for(let i=0;i<5500;i++){
  ctx.fillStyle=i%3?'rgba(72,66,58,.18)':'rgba(255,255,250,.7)';
  ctx.fillRect(random()*256,random()*256,1+random()*1.7,1+random()*1.5);
 }
 ctx.fillStyle='rgba(92,85,76,.10)';
 for(let i=0;i<280;i++)ctx.fillRect(random()*256,random()*256,5+random()*38,.65);
 const map=new T.CanvasTexture(c);map.wrapS=map.wrapT=T.RepeatWrapping;map.colorSpace=T.SRGBColorSpace;map.anisotropy=8;
 return new T.MeshStandardMaterial({map,bumpMap:map,bumpScale:.0015,vertexColors:true,roughness:.97});
}
export function stationRefugeNose(batch,sample,start,dir,chunk){
 if(!nose)nose={geo:noseGeometry(),mat:noseMaterial()};
 const a=sample(start),end=sample(start+dir*length),dx=end.x-a.x,dz=end.z-a.z;
 const yaw=Math.atan2(dx,dz),rot=new T.Euler(-Math.atan2(end.y-a.y,Math.hypot(dx,dz)),yaw,0,'YXZ');
 batch('refuge-concrete-nose',nose.geo,nose.mat,new T.Vector3(a.x,a.y,a.z),unit,rot,chunk);
 const base=new T.Vector3(0,.15,length-r-.12).applyEuler(rot);
 keepLeftBollard(batch,a.x+base.x,a.y+base.y,a.z+base.z,yaw,chunk);
}
