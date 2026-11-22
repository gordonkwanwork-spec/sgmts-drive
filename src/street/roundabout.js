// HK TPDM V2 §4.5.19 and V3 diagrams 2.3.3.3 / 3.4.3.10.
// Signs face local +Z, so the arrow points to the approaching driver's left.
import * as T from 'three';

const metal=new T.MeshStandardMaterial({color:0x989d98,roughness:.62,metalness:.24});
const post=new T.CylinderGeometry(.046,.055,1,10);
const box=new T.BoxGeometry(1,1,.045);
const plane=new T.PlaneGeometry();
const disc=new T.CircleGeometry(.5,48);
const backDisc=new T.CylinderGeometry(.5,.5,.05,48).rotateX(Math.PI/2);
const faces=new Map();

function panel(key,draw){
 if(!faces.has(key)){
  const canvas=document.createElement('canvas');canvas.width=768;canvas.height=512;
  draw(canvas.getContext('2d'));
  const map=new T.CanvasTexture(canvas);map.colorSpace=T.SRGBColorSpace;
  faces.set(key,new T.MeshStandardMaterial({map,roughness:.6,emissive:0xffffff,emissiveMap:map,emissiveIntensity:.18}));
 }
 return faces.get(key);
}

function polygon(ctx,points,colour){
 ctx.beginPath();
 points.forEach(([x,y],i)=>i?ctx.lineTo(x,y):ctx.moveTo(x,y));
 ctx.closePath();ctx.fillStyle=colour;ctx.fill();
}

function arrowFace(){
 return panel('TS107',ctx=>{
  ctx.fillStyle='#fafaf2';ctx.fillRect(0,0,768,512);
  ctx.fillStyle='#0868ac';ctx.beginPath();ctx.ellipse(384,256,362,241,0,0,Math.PI*2);ctx.fill();
  polygon(ctx,[[102,256],[333,131],[333,216],[645,216],[645,296],[333,296],[333,381]],'#ffffff');
 });
}

function chevronFace(){
 return panel('TS414',ctx=>{
  ctx.fillStyle='#161817';ctx.fillRect(0,0,768,512);
  for(const x of [18,274,530])polygon(ctx,[[x+121,0],[x+230,0],[x+113,256],[x+230,512],[x+121,512],[x,256]],'#ffffff');
 });
}

// Geometry and sign faces are shared by the environment's existing instanced batches.
export function islandSign(batch,x,y,z,yaw,chunk){
 const rot=new T.Euler(0,yaw,0);
 function part(key,geo,mat,h,scale,forward=0){
  batch(key,geo,mat,new T.Vector3(x+Math.sin(yaw)*forward,y+h,z+Math.cos(yaw)*forward),scale,rot,chunk);
 }
 part('island-sign-post',post,metal,1.2,new T.Vector3(1,2.4,1));
 const board=new T.Vector3(2.40,.8,1),circle=new T.Vector3(.90,.90,1);
 part('island-sign-board-back',box,metal,1.32,board,.058);
 part('island-sign-chevron',plane,chevronFace(),1.32,board,.085);
 part('island-sign-disc-back',backDisc,metal,2.25,circle,.058);
 part('island-sign-turn-left',disc,arrowFace(),2.25,circle,.088);
}

// One clipped, slightly irregular crown shared by every shrub. Small leaf pairs give the
// hedge surface scale at driver's-eye distance without individual leaf meshes or downloads.
const clump=new T.SphereGeometry(1,20,12);
const vertices=clump.attributes.position;
for(let i=0;i<vertices.count;i++){
 const x=vertices.getX(i),y=vertices.getY(i),z=vertices.getZ(i);
 const shoulder=n=>Math.sign(n)*Math.pow(Math.abs(n),.66);
 const ripple=1+.035*Math.sin(x*14+z*8)*Math.cos(z*11-y*5);
 vertices.setXYZ(i,shoulder(x)*ripple,shoulder(y)*ripple,shoulder(z)*ripple);
}
clump.computeVertexNormals();
let leafTexture;
const foliage=[];
function hedgeMaterial(colour){
 if(!leafTexture){
  const canvas=document.createElement('canvas');canvas.width=256;canvas.height=128;
  const ctx=canvas.getContext('2d');ctx.fillStyle='#7c8376';ctx.fillRect(0,0,256,128);
  let seed=417;
  const random=()=>((seed=(Math.imul(seed,1664525)+1013904223)>>>0)/4294967296);
  for(let i=0;i<6400;i++){
   const x=random()*256,y=random()*128,a=random()*Math.PI,light=90+Math.floor(random()*165);
   ctx.fillStyle='rgb('+light+','+light+','+Math.round(light*.93)+')';
   ctx.beginPath();ctx.ellipse(x,y,1.1+random()*2,.7+random(),a,0,2*Math.PI);ctx.fill();
  }
  leafTexture=new T.CanvasTexture(canvas);leafTexture.colorSpace=T.SRGBColorSpace;
  leafTexture.wrapS=leafTexture.wrapT=T.RepeatWrapping;leafTexture.repeat.set(2,1);
 }
 return foliage[colour]??=new T.MeshStandardMaterial({color:[0x9eb84d,0x587a3c,0x755147][colour],map:leafTexture,roughness:1});
}
function hedge(batch,x,y,z,yaw,width,height,depth,colour,chunk){
 batch('roundabout-hedge-'+colour,clump,hedgeMaterial(colour),new T.Vector3(x,y+height*.30,z),
  new T.Vector3(width,height*.70,depth),new T.Euler(0,yaw,0),chunk);
}

export function dressRoundabout(island,{batch,gardenTree,chunkAt}){
 const {x,y,z,radius,entries}=island,ch=chunkAt(x,z);
 for(const entry of entries){
  islandSign(batch,entry.x,y,entry.z,entry.yaw,ch);
 }
 // Curved planting beds with mown gaps. The outer fifth stays low and clear around the signs.
 for(let bed=0;bed<6;bed++){
  const bearing=2*Math.PI*bed/6;
  // A ribbon of narrow bronze foliage traces the edge of each bank of green shrubs.
  for(let row=0;row<3;row++)for(let i=0;i<12;i++){
   const u=i/11,a=bearing+(u-.5)*.82+row*.055;
   const r=radius*(.43+row*.12+.095*Math.sin(Math.PI*u));
   const colour=row===2?2:(bed+row)%2;
   hedge(batch,x+r*Math.cos(a),y,z+r*Math.sin(a),-a, row===2?.70:1.8,
    row===2?.48:.75+.25*Math.sin(Math.PI*u),1+.34*Math.sin(Math.PI*u),colour,ch);
  }
 }
 for(let i=0;i<8;i++){
  const a=i*2*Math.PI/7,r=i===7?0:radius*(.29+.065*Math.sin(3*a));
  gardenTree(new T.Vector3(x+r*Math.cos(a),y,z+r*Math.sin(a)),(i+.35)/8,ch);
 }
}

export function dressTurningIsland({x,y,z,radius,outerRadius,style,yaw},{batch,chunkAt}){
 const ch=chunkAt(x,z),painted=style==='painted';
 for(const half of [0,Math.PI]){
  const bearing=yaw+half+(painted?.95:.18);
  const d=painted?outerRadius+.65:radius*.64;
  const sx=x+Math.sin(bearing)*d,sz=z+Math.cos(bearing)*d;
  if(painted){
   // The white disc is mountable. Right arrows on the two opposite outer kerbs point along the same clockwise tangent.
   const front=bearing+Math.PI-.42,rot=new T.Euler(0,front,0),height=y+.15;
   const centre=new T.Vector3(sx,height+2.45,sz),size=new T.Vector3(.80,.80,1);
   batch('mini-sign-post',post,metal,new T.Vector3(sx,height+1.21,sz),new T.Vector3(1,2.42,1),rot,ch);
   batch('mini-sign-back',backDisc,metal,centre,size,rot,ch);
   batch('mini-sign-right',disc,arrowFace(),centre.clone().add(new T.Vector3(.03*Math.sin(front),0,.03*Math.cos(front))),size,new T.Euler(0,front,Math.PI),ch);
  }else islandSign(batch,sx,y,sz,bearing,ch);
 }
 if(style==='planted'){
  hedge(batch,x,y,z,0,radius*.33,.72,radius*.33,1,ch);
  for(let i=0;i<10;i++){
   const a=i*Math.PI/5,d=radius*.56;
   hedge(batch,x+d*Math.cos(a),y,z+d*Math.sin(a),-a,.52,.45,.68,i%2?0:2,ch);
  }
 }
}

export function dressTerminalIsland(loop,t,{batch,chunkAt}){
 const {x,z}=loop.center,y=loop.y+.325,ch=chunkAt(x,z),yaw=Math.atan2(t.tx,t.tz);
 // Single transit throat. Leave the station-facing lion, feeder-pillar pads and their access free.
 const at=(along,lat)=>[x+t.tx*along+t.lx*lat,z+t.tz*along+t.lz*lat];
 const [sx,sz]=at(10.4,-6.1);
 islandSign(batch,sx,y,sz,yaw,ch);
 for(const side of [-1,1])for(let i=0;i<10;i++){
  const a=(i/9-.5)*1.02,r=10.75;
  const [px,pz]=at(r*Math.sin(a),side*r*Math.cos(a));
  hedge(batch,px,y,pz,yaw+side*a,.90,.55,.94,i<5?0:1,ch);
 }
 for(let i=0;i<11;i++){
  const a=(i/10-.5)*1.23,[px,pz]=at(-10.2*Math.cos(a),10.2*Math.sin(a));
  hedge(batch,px,y,pz,yaw-a,1.05,.8,1.10,2,ch);
 }
}
