// Hong Kong road signs for the rebuilt city (TPDM V3 Ch 2 shapes and colours; plates drawn on canvas like the sandbox's road-signs.js).
// Plates face `face` (the direction approaching drivers come from); lower edge 2.3 m above the footway; grey back plate and strap.
import * as T from 'three';

const BLUE='#1f4e9c',RED='#d22630';
const cache=new Map();
function plate(key,draw,w=256,h=256){if(cache.has(key))return cache.get(key);const c=document.createElement('canvas');c.width=w;c.height=h;const x=c.getContext('2d');draw(x,w,h);
 const t=new T.CanvasTexture(c);t.colorSpace=T.SRGBColorSpace;t.anisotropy=4;
 // Retroreflective sheeting: a faint self-light so plates read under headlights and street lamps at night.
 const mat=new T.MeshStandardMaterial({map:t,emissive:0xffffff,emissiveMap:t,emissiveIntensity:.18,roughness:.55,transparent:true,alphaTest:.5});cache.set(key,mat);return mat;}
const disc=(x,w,fill,ring='#fff')=>{x.fillStyle=ring;x.beginPath();x.arc(w/2,w/2,w/2-2,0,7);x.fill();x.fillStyle=fill;x.beginPath();x.arc(w/2,w/2,w/2-12,0,7);x.fill();};
const arrow=(x,w,angle)=>{x.save();x.translate(w/2,w/2);x.rotate(angle);x.fillStyle='#fff';x.beginPath();x.moveTo(0,-82);x.lineTo(52,-22);x.lineTo(18,-22);x.lineTo(18,78);x.lineTo(-18,78);x.lineTo(-18,-22);x.lineTo(-52,-22);x.closePath();x.fill();x.restore();};
const PLATES={
 // T.S. 110 Keep left: white arrow pointing down to the left on a blue disc.
 'keep-left':{size:.75,mat:()=>plate('keep-left',(x,w)=>{disc(x,w,BLUE);arrow(x,w,-Math.PI*3/4);})},
 // T.S. 107 Ahead only.
 'ahead-only':{size:.6,mat:()=>plate('ahead-only',(x,w)=>{disc(x,w,BLUE);arrow(x,w,0);})},
 // T.S. 116 No entry for vehicles, with an "except SGMTS" supplementary plate.
 'no-entry':{size:.75,mat:()=>plate('no-entry',(x,w)=>{disc(x,w,RED);x.fillStyle='#fff';x.fillRect(w*.18,w*.42,w*.64,w*.16);})},
 'except-sgmts':{w:.9,h:.42,mat:()=>plate('except-sgmts',(x,w,h)=>{x.fillStyle='#fff';x.fillRect(0,0,w,h);x.strokeStyle='#111';x.lineWidth=8;x.strokeRect(6,6,w-12,h-12);x.fillStyle='#111';x.textAlign='center';
  x.font='bold 44px "PingFang HK","Heiti TC",sans-serif';x.fillText('智能綠色集體運輸系統除外',w/2,h*.45);x.font='bold 40px Arial,sans-serif';x.fillText('Except SGMTS',w/2,h*.82);},512,240)},
};
const back=new T.MeshStandardMaterial({color:0x8d9295,metalness:.6,roughness:.45}),post=new T.MeshStandardMaterial({color:0xa9aeb0,metalness:.55,roughness:.4});
const circle=new T.CircleGeometry(.5,32),square=new T.PlaneGeometry(1,1),pole=new T.CylinderGeometry(.038,.038,1,10);
// One post with its plates stacked downwards from the top plate (record.sign names the stack).
const STACKS={'keep-left':['keep-left'],'ahead-only':['ahead-only'],'no-entry-sgmts':['no-entry','except-sgmts']};
export function signPost(group,{sign,x,y,z,face}){const g=new T.Group();g.position.set(x,y,z);g.rotation.y=Math.atan2(face.x,face.z);g.name='Road sign · '+sign;group.add(g);
 const stack=STACKS[sign].map(k=>PLATES[k]),heights=stack.map(p=>p.size||p.h);let top=2.3+heights.reduce((a,b)=>a+b+.05,0);
 const p=new T.Mesh(pole,post);p.scale.y=top+.05;p.position.y=(top+.05)/2;p.position.z=-.06;p.castShadow=true;g.add(p);
 for(const k of STACKS[sign]){const P=PLATES[k],w=P.size||P.w,h=P.size||P.h,geo=P.size?circle:square,front=new T.Mesh(geo,P.mat()),rear=new T.Mesh(geo,back);
  front.scale.set(w,h,1);rear.scale.set(w,h,1);rear.rotation.y=Math.PI;const yc=top-h/2;front.position.set(0,yc,0);rear.position.set(0,yc,-.012);front.castShadow=true;g.add(front,rear);top-=h+.05;}
 return g;}

// All-vehicle no-stopping sign. Boundary signs have yellow upper panels,
// repeaters white. The time plate always stays white, including on the End sign.
function restrictionFace(period,role) {
 const key='no-stopping-'+role+(role==='end'?'':'-'+period);
 return plate(key,x=>{
  x.fillStyle='#131313';x.beginPath();x.roundRect(2,2,252,312,13);x.fill();
  x.fillStyle=role==='repeater'?'#fff':'#ffce00';
  x.beginPath();x.roundRect(10,10,236,140,7);x.fill();
  x.fillStyle='#fff';x.beginPath();x.roundRect(10,157,236,149,7);x.fill();
  x.fillStyle=RED;x.beginPath();x.arc(128,80,60,0,2*Math.PI);x.fill();
  x.fillStyle=BLUE;x.beginPath();x.arc(128,80,49,0,2*Math.PI);x.fill();
  x.strokeStyle=RED;x.lineWidth=11;x.beginPath();
  x.moveTo(91,43);x.lineTo(165,117);x.moveTo(165,43);x.lineTo(91,117);x.stroke();
  x.fillStyle='#101010';x.textAlign='center';x.textBaseline='middle';
  const label=(text,size,px,py)=>{
   x.font='bold '+size+'px Arial,"PingFang HK","Microsoft JhengHei",sans-serif';
   x.fillText(text,px,py);
  };
  if(role==='end' || period==='24h'){
   label(role==='end'?'End':'24 hrs',53,128,198);
   label(role==='end'?'終止':'全日',51,128,269);
  }else{
   label('am',25,85,175);label('上午',28,85,204);label('7',58,166,191);
   x.fillRect(121,224,14,8);x.beginPath();x.moveTo(110,231);x.lineTo(146,231);x.lineTo(128,243);x.closePath();x.fill();
   label('pm',25,85,258);label('下午',28,85,287);label('7',58,166,273);
  }
 },256,316);
}
const daytimePost=new T.MeshStandardMaterial({color:0xf5c522,roughness:.55});
export function restrictionSign(batch,{x,y,z,yaw,period,role},chunk) {
 const rot=new T.Euler(0,yaw,0),p=new T.Vector3(x,y,z);
 const timed=period==='7-7',scale=new T.Vector3(.68,.84,1);
 batch('restriction-post-'+period,pole,timed?daytimePost:post,p.clone().add(new T.Vector3(0,1.55,0)),new T.Vector3(1,3.1,1),rot,chunk);
 p.y+=2.72;
 batch('restriction-back',square,back,p.clone(),scale,new T.Euler(0,yaw+Math.PI,0),chunk);
 p.x+=Math.sin(yaw)*.05;p.z+=Math.cos(yaw)*.05;
 batch('restriction-'+role+'-'+period,square,restrictionFace(period,role),p,scale,rot,chunk);
}

// The advance board is a single sign face. Each branch shares its direction with
// its bilingual legend, including junctions at which there is no forward route.
function mapFace(sign) {
 const ring=sign.diagram==='ring',rows=sign.rows;
 return plate('advance-'+sign.diagram+JSON.stringify(rows),(c,w,h)=>{
  c.fillStyle=BLUE;c.fillRect(0,0,w,h);
  c.lineJoin='round';c.lineWidth=7;c.strokeStyle='#fff';c.strokeRect(9,9,w-18,h-18);
  const cx=w/2,cy=369,r=70;
  const line=(x,y,dx,dy)=>{c.beginPath();c.moveTo(x,y);c.lineTo(dx,dy);c.stroke();};
  c.lineWidth=23;line(cx,h-25,cx,ring?cy+r:cy);
  if(ring){c.beginPath();c.arc(cx,cy,r,.61*Math.PI,2.47*Math.PI);c.stroke();}
  for(const {turn,destination} of rows){
   const side=turn==='left'?-1:turn==='right'?1:0;
   const ex=cx+side*324,ey=side?cy:175;
   line(cx+side*(ring?r:0),cy-(ring&&!side?r:0),ex,ey);
   c.save();c.translate(ex,ey);c.rotate(side*Math.PI/2);
   c.beginPath();c.moveTo(0,-22);c.lineTo(-20,6);c.lineTo(20,6);c.closePath();c.fillStyle='#fff';c.fill();c.restore();
   const x=side?cx+side*324:cx,span=side?348:445,base=side?cy-85:56;
   c.font=(destination.local?'600':'500')+' 47px Arial,sans-serif';
   const words=destination.en.split(' ');
   let lines=[destination.en];
   if(words.length>1&&c.measureText(destination.en).width>span-22){
    const pairs=words.slice(1).map((_,n)=>[words.slice(0,n+1).join(' '),words.slice(n+1).join(' ')]);
    const widest=pair=>Math.max(...pair.map(line=>c.measureText(line).width));
    lines=pairs.reduce((a,b)=>widest(a)<=widest(b)?a:b);
   }
   const top=base-(side?(lines.length-1)*45:0),zhY=top+(lines.length-1)*46+49;
   if(destination.local){c.fillStyle='#f8f8f4';c.fillRect(x-span/2,top-44,span,zhY-top+54);}
   c.textAlign='center';c.fillStyle=destination.local?'#181818':'#fff';
   lines.forEach((line,n)=>c.fillText(line,x,top+n*46,span-20));
   c.font='bold 51px "PingFang HK","Microsoft JhengHei",sans-serif';c.fillText(destination.zh,x,zhY,span-20);
  }
 },1024,576);
}

const channel=new T.BoxGeometry(1,1,1);
export const signPosts=width=>[-width*.36,width*.36];
export function destinationSign(batch,s,chunk){
 const {x,y,z,yaw,width,height,diagram,flag}=s,rot=new T.Euler(0,yaw,0);
 const face=(h,side=0,depth=0)=>new T.Vector3(x+Math.cos(yaw)*side+Math.sin(yaw)*depth,y+h,z-Math.sin(yaw)*side+Math.cos(yaw)*depth);
 const put=(key,geo,mat,pos,w,h,d,rotation=rot)=>batch(key,geo,mat,pos,new T.Vector3(w,h,d),rotation,chunk);
 const bottom=s.mounted?0:2.3,top=bottom+height;
 for(const [i,side] of signPosts(width).entries()){
  if(s.mounted){
   put('wayfinding-deck-bracket',channel,post,face(.16,side,-.19),.12,.14,.52);
   put('wayfinding-deck-strap',channel,post,face(height/2,side,-.09),.10,height,.08);
   continue;
  }
  const base=s.foundations[i].post-.025;
  put('wayfinding-upright',channel,post,face((top+base)/2,side,-.11),.12,top-base,.115);
  if(s.brace){
   const start=face(s.foundations[i].brace-.025,side,-s.brace),end=face(top-.4,side,-.14),v=end.clone().sub(start);
   const q=new T.Quaternion().setFromUnitVectors(new T.Vector3(0,1,0),v.clone().normalize());
   put('wayfinding-brace',channel,post,start.lerp(end,.5),.09,v.length(),.1,new T.Euler().setFromQuaternion(q));
  }
 }
 if(diagram){
  put('wayfinding-map-back',channel,back,face(bottom+height/2),width,height,.09);
  put('wayfinding-map-'+diagram+s.rows.map(r=>r.destination.en+r.turn).join('/'),square,mapFace(s),face(bottom+height/2,0,.055),width,height,1);
  return;
 }
 const rows=flag&&s.street?[{destination:s.street,turn:s.rows[0].turn},...s.rows]:s.rows;
 const rh=height/rows.length;
 rows.forEach(({destination,turn},i)=>{
  const key=['wayfinding',destination.en,turn,!!flag].join('-'),ink=destination.local?'#15191b':'#fff',right=turn==='right';
  function panel(c,w,h,rear=false){
   c.save();if(rear){c.translate(w,0);c.scale(-1,1);}
   const point=flag?h*.45:0;
   const points=[[point+4,4],[w-4,4],[w-4,h-4],[point+4,h-4],...(flag?[[4,h/2]]:[])];
   c.beginPath();points.forEach(([px,py],n)=>{if(flag&&right)px=w-px;n?c.lineTo(px,py):c.moveTo(px,py);});c.closePath();
   c.fillStyle=rear?'#929a9b':destination.local?'#f9f9f5':BLUE;c.fill();
   if(!rear){
    c.lineWidth=6;c.strokeStyle=ink;c.stroke();
    c.save();c.translate(right?w-75:75,h/2);
    if(flag){c.scale(right?-1:1,1);c.beginPath();c.moveTo(24,-h*.42);c.lineTo(-23,0);c.lineTo(24,h*.42);c.lineWidth=19;c.stroke();}
    else{c.rotate(turn==='left'?-Math.PI/2:right?Math.PI/2:0);c.fillStyle=ink;c.fillRect(-7,-18,14,58);
     c.beginPath();c.moveTo(0,-44);c.lineTo(27,-11);c.lineTo(-27,-11);c.fill();}
    c.restore();
    const tx=right?18:132;c.fillStyle=ink;c.textAlign='left';c.font='600 59px Arial,sans-serif';c.fillText(destination.en,tx,83,w-158);
    c.font='bold 64px "PingFang HK","Microsoft JhengHei",sans-serif';c.fillText(destination.zh,tx,163,w-158);
   }
   c.restore();
  }
  const h=top-(i+.5)*rh;
  put(key,square,plate(key,panel,720,200),face(h,0,.055),width,rh-.025,1);
  const bk='wayfinding-back-'+!!flag+'-'+right;
  put(bk,square,plate(bk,(...args)=>panel(...args,true),720,200),face(h,0,.015),width,rh-.025,1,new T.Euler(0,yaw+Math.PI,0));
 });
}
