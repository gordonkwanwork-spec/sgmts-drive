import {gateZ} from './a2-footbridge.js';
// Railway section: MTR Contract 1801, https://www.mtr.com.hk/en/corporate/tenders/HSK_1801.html
// Exterior reference: MTR's September 2024 photomontage, PR-24-061-E, p.3.
// Architectural dimensions and details below are fitted to the game's rail alignment.
import * as T from 'three';
import {mergeByMaterial} from './batching.js';
import {rail,datum,portalX,portalZ,halfRun,halfWidth,stairCount,riser,portalLevel,passageY} from './a2-site.js';

const finish=(color,metalness=0)=>new T.MeshStandardMaterial({color,metalness,roughness:metalness?.55:.85});
const porcelain=finish(0xddd4c0),bronze=finish(0x967553,.38),bronzeLight=finish(0xc7af83,.34);
const graphite=finish(0x393c39,.32),timber=finish(0x846647),roof=finish(0xd0cdc2,.38);
const terra=finish(0xa06049),clay=finish(0xc18165);
let solarMat=null;

export function setHungShuiKiuNight(on){
 porcelain.emissive.setHex(on?0xffe4be:0);porcelain.emissiveIntensity=on?.2:0;
 bronze.emissive.setHex(on?0xffcf99:0);bronze.emissiveIntensity=on?.16:0;
 bronzeLight.emissive.setHex(on?0xffdcb0:0);bronzeLight.emissiveIntensity=on?.18:0;
 graphite.emissive.setHex(on?0x90a4c2:0);graphite.emissiveIntensity=on?.16:0;
 timber.emissive.setHex(on?0xffcf96:0);timber.emissiveIntensity=on?.22:0;
 roof.emissive.setHex(on?0xb8cde4:0);roof.emissiveIntensity=on?.14:0;
 terra.emissive.setHex(on?0xffcfa8:0);terra.emissiveIntensity=on?.18:0;
 clay.emissive.setHex(on?0xffd6b0:0);clay.emissiveIntensity=on?.18:0;
 if(solarMat){solarMat.emissive.setHex(on?0x7b98c0:0);solarMat.emissiveIntensity=on?.14:0;}
}
function piece(g,geo,mat,x,y,z){
 const m=new T.Mesh(geo,mat);m.position.set(x,y,z);m.castShadow=!mat.transparent;m.receiveShadow=true;g.add(m);return m;
}
function box(g,mat,x,y,z,w,h,d){return piece(g,new T.BoxGeometry(w,h,d),mat,x,y,z);}
function beam(g,mat,start,end,width,depth=width){
 const a=new T.Vector3(...start),b=new T.Vector3(...end),v=b.clone().sub(a);
 const m=box(g,mat,0,0,0,width,v.length(),depth);m.position.copy(a).lerp(b,.5);
 m.quaternion.setFromUnitVectors(new T.Vector3(0,1,0),v.normalize());return m;
}
function sign(g,text,sub,width,height,x,y,z,angle=0,line='#986644'){
 const c=document.createElement('canvas');c.width=1024;c.height=192;const ctx=c.getContext('2d');
 ctx.fillStyle='#303832';ctx.fillRect(0,0,1024,192);ctx.fillStyle=line;ctx.fillRect(0,0,18,192);
 ctx.fillStyle='#fff5df';ctx.font='600 78px "PingFang HK", sans-serif';ctx.fillText(text,48,87,935);
 ctx.font='500 48px Arial, sans-serif';ctx.fillText(sub,50,158,930);
 const map=new T.CanvasTexture(c);map.colorSpace=T.SRGBColorSpace;map.anisotropy=8;
 piece(g,new T.PlaneGeometry(width,height),new T.MeshBasicMaterial({map}),x,y,z).rotation.y=angle;
}
function roofProfile(x){return 8.35-.0019*x*x-.15*Math.max(0,Math.abs(x)-16)**1.7;}
function photovoltaicMaterial(){
 const c=document.createElement('canvas');c.width=256;c.height=128;const ctx=c.getContext('2d');
 ctx.fillStyle='#70818a';ctx.fillRect(0,0,256,128);
 for(let row=0;row<6;row++)for(let col=0;col<12;col++){
  ctx.fillStyle=['#41535b','#485a62','#43555f'][(col+row*2)%3];ctx.fillRect(col*256/12+1,row*128/6+1,20.5,20.4);
 }
 const map=new T.CanvasTexture(c);map.colorSpace=T.SRGBColorSpace;map.anisotropy=8;
 return new T.MeshStandardMaterial({map,roughness:.48,metalness:.22});
}
function shell(g,h){
 const solar=solarMat=photovoltaicMaterial();
 const shape=new T.Shape();
 for(let i=0;i<=44;i++){const x=i-22,y=h+roofProfile(x);if(i===0)shape.moveTo(x,y);else shape.lineTo(x,y);}
 for(let i=44;i>=0;i--){const x=i-22;shape.lineTo(x,h+roofProfile(x)-.32);}
 shape.closePath();
 piece(g,new T.ExtrudeGeometry(shape,{depth:226,bevelEnabled:false}),roof,0,0,-113);
 for(let z=-110;z<=110;z+=5)for(const side of [-1,1]){
  // Two photovoltaic fields divided by a crown strip and narrow maintenance aisles.
  for(const centre of [5.8,13.1]){
   const x=side*centre,p=box(g,solar,x,h+roofProfile(x)+.065,z,6.9,.085,4.8);
   p.rotation.z=Math.atan(-.0038*x);
  }
 }
 for(const side of [-1,1]){
  for(const x of [1,17.5,19.5,21.4])box(g,bronzeLight,side*x,h+roofProfile(x)+.025,0,.10,.09,226);
  for(let z=-108;z<=108;z+=12){
   beam(g,graphite,[side*14.8,h+4.8,z],[side*20.8,h+roofProfile(20.8)-.45,z],.22,.32);
   beam(g,graphite,[side*14.8,h+5,z],[side*8,h+7.9,z],.2,.3);
  }
 }
}
export function buildHungShuiKiu(scene,glass,light){
 const g=new T.Group();g.name='Hung Shui Kiu Station';g.position.set(rail.x,datum,rail.z);g.rotation.y=rail.heading;scene.add(g);
 const h=rail.y-datum, floor=h+1.15;
 shell(g,h);
 box(g,porcelain,0,-.39,0,36,1.42,220);
 for(const side of [-1,1]){
  const edge=side*3.86;
  // Continuous track edge and outer passage flank the two stairwell openings.
  for(const [lo,hi] of [[3.85,7.68],[12.52,17.15]])
   box(g,porcelain,side*(hi+lo)/2,floor-.55,0,hi-lo,1.1,210);
  for(const [lo,hi] of [[-105,-45.16],[-25.96,24.84],[44.04,105]])
   box(g,porcelain,side*10.1,floor-.55,(hi+lo)/2,4.84,1.1,hi-lo);
  box(g,bronzeLight,side*4.33,floor+.016,0,.36,.03,209);
  box(g,graphite,edge,floor+2.6,0,.14,.18,209);
  box(g,glass,edge,floor+1.3,0,.09,2.55,209);
  for(let z=-103;z<=103;z+=3.05)box(g,graphite,edge,floor+1.28,z,.13,2.56,.065);
  for(let z=-102;z<=102;z+=12){
   box(g,graphite,side*14.8,h*.5+3.2,z,.45,h+6.4,.55);
   if(side>0||Math.abs(z-gateZ)>5)box(g,bronze,side*16.9,floor+2.9,z,.18,5.8,.16);
  }
  // An open undercroft and a fine two-layer screen, interrupted by tall entrance bays.
  for(let z=-102;z<=102;z+=1.2){
   const gateway=Math.abs(Math.abs(z)-35)<7 || (side<0&&Math.abs(z-gateZ)<5);
   if(gateway)continue;
   const end=Math.abs(z)>80, bottom=end?.35:floor+.1, top=h+6.45;
   const fin=box(g,Math.round((z+102)/1.2)%4===0?bronze:bronzeLight,side*17,(top+bottom)/2,z,.46,top-bottom,.32);
   fin.rotation.y=side*.43;
  }
  const screens=side<0?[[-103.5,gateZ-5],[gateZ+5,103.5]]:[[-103.5,103.5]];
  for(const [a,b] of screens)for(let y=floor+.3;y<h+6.4;y+=.58)box(g,bronze,side*16.65,y,(a+b)/2,.07,.075,b-a);
  if(side<0){
   box(g,bronze,side*16.95,floor+3.8,gateZ,.42,.78,10);
   for(const dz of [-4.85,4.85])box(g,bronze,side*16.95,floor+1.8,gateZ+dz,.42,3.6,.30);
   sign(g,'洪水橋站    Hung Shui Kiu','屯馬綫    TUEN MA LINE',8.4,.97,side*17.18,floor+4.0,gateZ,-Math.PI/2);
  }
  for(let z=-102;z<104;z+=12){
   if(Math.abs(Math.abs(z)-35)<10)continue;
   box(g,glass,side*15,3.7,z,.1,6.8,11.8);
   box(g,graphite,side*15,3.72,z,.19,6.8,.13);
  }
  for(const z of [-35,35]){
   const x=side*10.1, rise=floor-.32;
   // A stair flight and parallel escalator balustrades from the concourse.
   for(let i=0;i<60;i++){const top=.32+rise*(i+1)/60;box(g,porcelain,x,top-.24,z-10+i*.32,4.8,.48,.33);}
   for(const dx of [-2.48,0,2.48])beam(g,graphite,[x+dx,1.32,z-10],[x+dx,floor+1,z+9],.14);
   box(g,timber,side*18.2,6.15,z,4.8,.42,13.6);
   box(g,graphite,side*17.32,8.6,z,.25,2.22,12);
   for(const dz of [-5.5,5.5])box(g,bronze,side*17.3,7.8,z+dz,.18,3.2,.18);
   sign(g,'洪水橋站   Hung Shui Kiu','屯馬綫    TUEN MA LINE',11.8,2.15,side*17.46,8.6,z,side*Math.PI/2);
   light(g,side*18,5.7,z);
  }
  for(const z of [-92,92])box(g,graphite,side*10,.32+h*.45,z,12,h*.9,22);
  // Glazed lift enclosure, shaft uprights and doors at both levels.
  box(g,glass,side*11.7,floor*.5,0,3.8,floor,4);
  for(const dx of [-1.85,1.85])for(const dz of [-1.95,1.95])box(g,graphite,side*11.7+dx,floor*.5,dz,.12,floor,.12);
  for(const base of [.32,floor]){box(g,bronze,side*11.7,base+1.12,2.04,2.05,2.24,.09);box(g,graphite,side*11.7,base+1.12,2.10,.035,2.24,.04);}
  for(const z of [-72,0,72]){
   box(g,timber,side*12.6,floor+.46,z,.72,.17,5.2);
   for(const dz of [-1.9,1.9])box(g,graphite,side*12.6,floor+.22,z+dz,.62,.44,.17);
  }
 }
 // Large slow-speed concourse fans sit in the open bays beneath the platforms.
 for(const z of [-55,0,55]){
  box(g,graphite,-8.2,h-1.8,z,.12,1.8,.12);
  for(let i=0;i<5;i++){
   const a=i*Math.PI*2/5,m=box(g,bronzeLight,-8.2+1.55*Math.sin(a),h-2.7,z+1.55*Math.cos(a),.26,.07,3.15);
   m.rotation.y=a;
  }
  for(let i=0;i<6;i++)box(g,graphite,0,1,z+i-2.5,1.5,1.4,.29);
 }
 mergeByMaterial(g);return g;
}

export function buildWesternRailEntrances(parent,glass,light){
 const entrances=[];
 for(const z of portalZ){
  const g=new T.Group();g.name='HSWRL underground entrance';
  g.position.set(portalX,portalLevel(z)-datum,z);g.rotation.y=z<0?Math.PI:0;parent.add(g);
  const depth=riser*stairCount;
  box(g,graphite,0,-depth-.15,0,8,.3,14);
  for(let i=0;i<stairCount;i++)box(g,porcelain,0,-i*riser-.10,halfRun-(i+.5)*.43,8,.20,.434);
  for(const side of [-1,1]){
   box(g,terra,side*(halfWidth+.18),.75-depth/2,0,.38,depth+1.5,14.6);
   box(g,graphite,side*3.96,.84,0,.1,.12,14.6);
   beam(g,bronzeLight,[side*3.75,1,6.7],[side*3.75,1-depth,-3.6],.095);
   box(g,clay,side*4.34,3.0,-4.4,.60,6,6.1);
   for(let j=0;j<7;j++)box(g,bronze,side*4.71,3.1,-7+j*.87,.18,6,.17);
   for(const dz of [-1.6,3.2,7.3])box(g,bronze,side*4.33,2.65,dz,.16,5.3,.20);
   box(g,glass,side*4.32,2.97,3,.09,3,7.8);
  }
  // A stepped terracotta vent building marks each entrance above the passage.
  for(const [cz,w,d,height] of [[-12,9.8,10.4,8.2],[-19.1,8.3,4.5,10.8]]){
   const shape=new T.Shape(),r=.95;
   shape.moveTo(-w/2+r,-d/2);shape.lineTo(w/2-r,-d/2);shape.quadraticCurveTo(w/2,-d/2,w/2,-d/2+r);
   shape.lineTo(w/2,d/2-r);shape.quadraticCurveTo(w/2,d/2,w/2-r,d/2);
   shape.lineTo(-w/2+r,d/2);shape.quadraticCurveTo(-w/2,d/2,-w/2,d/2-r);
   shape.lineTo(-w/2,-d/2+r);shape.quadraticCurveTo(-w/2,-d/2,-w/2+r,-d/2);
   const skin=new T.ExtrudeGeometry(shape,{depth:height+.5,bevelEnabled:false,curveSegments:5}).rotateX(-Math.PI/2);
   piece(g,skin,terra,0,-.5,cz);
   const cap=new T.ExtrudeGeometry(shape,{depth:.22,bevelEnabled:false,curveSegments:5}).rotateX(-Math.PI/2);
   piece(g,cap,bronzeLight,0,height,cz).scale.set(1.04,1,1.04);
   box(g,graphite,0,height+.23,cz,w-1.1,.17,d-1);
   for(let q=-d/2+.8;q<d/2-.45;q+=.42)box(g,bronze,0,height+.36,cz+q,w-1.25,.13,.15);
   for(const side of [-1,1])for(let q=-d/2+1.1;q<d/2-.8;q+=.61)
    box(g,clay,side*w/2,height*.53,cz+q,.18,height*.91,.14);
  }
  box(g,terra,0,3,-6.95,9,6,.5);
  box(g,clay,0,6.18,-4.5,10,.36,6.6);
  box(g,bronzeLight,0,6.40,-4.5,10.1,.12,6.7);
  const canopy=box(g,bronze,0,5.35,3.25,10,.24,9.1);canopy.rotation.x=.065;
  for(let x=-4.55;x<=4.6;x+=.6){const rib=box(g,timber,x,5.19,3.25,.12,.2,9.05);rib.rotation.x=.065;}
  sign(g,'港深西部鐵路','HSWRL    ↓',8,1.38,0,4.12,7.76,0,'#b57a57');
  light(g,0,4.6,5);
  mergeByMaterial(g);entrances.push(g);
 }
 const tunnel=new T.Group();tunnel.name='HSWRL underground passage';parent.add(tunnel);
 const a=portalZ[0]+halfRun,b=portalZ[1]-halfRun,m=(a+b)/2;
 const low=passageY(m)-datum, slope=-Math.atan2(passageY(b)-passageY(a),b-a);
 const slab=box(tunnel,porcelain,portalX,low-.16,m,8,.32,b-a);slab.rotation.x=slope;
 for(const side of [-1,1]){
  const wall=box(tunnel,timber,portalX+side*4.1,low+1.56,m,.2,3.45,b-a);wall.rotation.x=slope;
 }
 const ceiling=box(tunnel,graphite,portalX,low+3.24,m,8.3,.2,b-a);ceiling.rotation.x=slope;
 const lens=new T.MeshBasicMaterial({color:0xffe0b2});
 for(let z=a+3;z<b;z+=5)box(tunnel,lens,portalX,passageY(z)-datum+3.10,z,5,.06,.15);
 mergeByMaterial(tunnel);return entrances;
}
