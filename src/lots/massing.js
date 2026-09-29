// OZP lot → 3D. A lot shows either a procedural placeholder ("massing", sized from the OZP Notes plot
// ratio and the plan's height limit) or a GLB from public/lots/models. Shared by the game and the editor.
import * as T from 'three';
import {mergeGeometries} from 'three/addons/utils/BufferGeometryUtils.js';
import {GLTFLoader} from 'three/addons/loaders/GLTFLoader.js';
import {DATUM,project,sample} from '../alignment.js';
import {polygonArea,pointInPolygon} from './wand.js';
import {commercialMaterials,commercialPodium,commercialTower} from './commercial.js';

// Plot ratios from S/HSK/2A Notes (Annex III). null = no PR control (height/storeys only).
const PR={'C(1)':9.5,'C(2)':8,'C(3)':5,'C(4)':3,'C(5)':1.5,'R(A)1':6.5,'R(A)2':6,'R(A)3':5.5,'R(A)4':5,'R(A)5':3.8,'R(A)6':6.2,
 'R(B)1':3.5,'R(B)2':2.5,'R(B)3':1.26,'R(C)':.4,'I':3,'OU(Mixed Use)':7,'OU(Enterprise and Technology Park)':5,'OU(Logistics Facility)':5,'OU(Industry Park)':7,'OU(Port Back-up)':3};
export const ZONES=['R(A)1','R(A)2','R(A)3','R(A)4','R(A)5','R(A)6','R(B)1','R(B)2','R(B)3','R(C)','C(1)','C(2)','C(3)','C(4)','C(5)',
 'OU(Mixed Use)','G/IC','G/IC(1)','OU(Logistics Facility)','OU(Industry Park)','OU(Port Back-up)','OU(Enterprise and Technology Park)','I',
 'O','O(1)','GB','V','V(1)','OU(Sewage Treatment Works)','OU(District Cooling System)','OU(SGMTS depot)','OU'];
export function useOf(zone=''){
 if(zone.startsWith('R('))return 'residential';if(zone.startsWith('C('))return 'commercial';if(zone==='OU(Mixed Use)')return 'mixed';
 if(zone.startsWith('G/IC'))return 'gic';if(/Logistics|Port Back-up/.test(zone))return 'logistics';if(/Enterprise|Industry Park/.test(zone)||zone==='I')return 'enterprise';
 if(zone.startsWith('O(')||zone==='O')return 'open';if(zone==='GB')return 'green';if(zone.startsWith('V'))return 'village';if(/SGMTS/.test(zone))return 'transport';return zone?'utility':'unzoned';
}
export const plotRatio=zone=>PR[zone]??null;
export const USE_COLOURS={residential:0xe7a33e,commercial:0xd2463c,mixed:0xc76b9a,gic:0x4f8fd6,logistics:0x8a6bd1,enterprise:0x6c5bc7,open:0x57a55a,green:0x2f7d45,village:0xb5905e,utility:0x8d9aa3,transport:0xeb8a2f,unzoned:0x9a9a9a};
// Default model per use: the user's focus uses get placeholders; stations/depot/villages/utilities stay as the game draws them.
export const defaultModel=zone=>['residential','commercial','mixed','gic','logistics','enterprise','open','green'].includes(useOf(zone))?{type:'massing'}:{type:'none'};

// ---------- facade textures (reference renders: white/grey towers with blue glazing, grid-frame retail podiums, green roofs) ----------
function facade(draw,lit){const make=night=>{const c=document.createElement('canvas');c.width=c.height=256;const g=c.getContext('2d');draw(g,night);const t=new T.CanvasTexture(c);t.wrapS=t.wrapT=T.RepeatWrapping;t.colorSpace=T.SRGBColorSpace;t.anisotropy=4;return t;};
 panes=[];const map=make(false),glass=panes;panes=null;const m=new T.MeshStandardMaterial({map,emissiveMap:lit?make(true):null,roughness:.8,metalness:0});reflective(m,256,256,glass);m.emissive.set(0);return m;}
// Glass panes drawn in a day pass are recorded, so each facade gets a matching roughness/metalness map:
// only the glass is smooth and reflective, walls stay matte.
let panes=null;const pane=(g,x,y,w,h,fill)=>{g.fillStyle=fill;g.fillRect(x,y,w,h);panes?.push([x,y,w,h]);};
function reflective(m,w,h,glass){if(!glass.length)return;
 const t=canvasTex(w,h,g=>{g.fillStyle='rgb(0,215,0)';g.fillRect(0,0,w,h);g.fillStyle='rgb(0,14,205)';for(const [x,y,ww,hh] of glass)g.fillRect(x,y,ww,hh);});// G = roughness, B = metalness. Glass is near-mirror: the pane colour tints the sky it reflects.
 t.colorSpace=T.NoColorSpace;Object.assign(m,{roughnessMap:t,metalnessMap:t,roughness:1,metalness:1,envMap:envMap(),envMapIntensity:.9});
 // ponytail: the game's night switch only sets emissiveIntensity on lot materials; it also dims the daytime sky reflection.
 let ei=m.emissiveIntensity;Object.defineProperty(m,'emissiveIntensity',{get:()=>ei,set:v=>{ei=v;m.envMapIntensity=v>0?.1:.9;}});}
// Reflection environment: hazy Hong Kong sky with clouds, green hills and a distant skyline, then ground (equirect; three prefilters it).
let ENV;function envMap(){return ENV||(ENV=Object.assign(canvasTex(1024,512,g=>{const r=seeded(3),sky=g.createLinearGradient(0,0,0,256);
 sky.addColorStop(0,'#4f86c0');sky.addColorStop(.7,'#a9c3da');sky.addColorStop(1,'#dfe6e8');g.fillStyle=sky;g.fillRect(0,0,1024,256);
 g.fillStyle='rgba(255,255,255,.45)';for(let i=0;i<22;i++){g.beginPath();g.ellipse(r()*1024,30+r()*160,40+r()*110,6+r()*16,0,0,Math.PI*2);g.fill();}
 g.fillStyle='#71877a';g.beginPath();g.moveTo(0,256);for(let x=0;x<=1024;x+=32)g.lineTo(x,236-Math.abs(Math.sin(x*.011)*22+Math.sin(x*.037)*9));g.lineTo(1024,256);g.fill();
 for(let x=0;x<1024;){const w=6+r()*22,h=6+r()*34,v=120+r()*50;g.fillStyle=`rgb(${v},${v+8},${v+16})`;g.fillRect(x,256-h,w,h);x+=w+r()*14;}
 const gr=g.createLinearGradient(0,256,0,512);gr.addColorStop(0,'#7d8475');gr.addColorStop(1,'#3b3f37');g.fillStyle=gr;g.fillRect(0,256,1024,256);},false),{mapping:T.EquirectangularReflectionMapping}));}
// Precast weathering: speckle, plus faint rain streaks below each ledge row.
function weather(g,w,h,rows,seed){const r=seeded(seed);for(let i=0;i<w*h/40;i++){g.fillStyle=`rgba(${r()<.5?'0,0,0':'255,255,255'},${r()*.06})`;g.fillRect(r()*w,r()*h,1+r()*2,1+r()*2);}
 for(const y0 of rows)for(let i=0;i<w/14;i++){const x=r()*w,len=8+r()*40,gr=g.createLinearGradient(0,y0,0,y0+len);gr.addColorStop(0,`rgba(45,42,36,${.05+r()*.09})`);gr.addColorStop(1,'rgba(45,42,36,0)');g.fillStyle=gr;g.fillRect(x,y0,1+r()*3,len);}}
const shade=(hex,k)=>{const n=parseInt(hex.slice(1),16);return `rgb(${[16,8,0].map(s=>Math.min(255,Math.round((n>>s&255)*k))).join(',')})`;};
function windows(g,night,cols,rows,{wall,glass,frame=0,mullion=null,litColour='#ffd79a',litShare=.45}){
 const w=256/cols,h=256/rows;g.fillStyle=night?'#000':wall;g.fillRect(0,0,256,256);let seed=cols*31+rows;const rnd=()=>(seed=(seed*16807)%2147483647)/2147483647;
 for(let r=0;r<rows;r++)for(let c=0;c<cols;c++){const x=c*w+frame,y=r*h+frame,ww=w-2*frame,hh=h-2*frame;
  if(night){if(rnd()<litShare){g.fillStyle=litColour;g.fillRect(x,y,ww,hh);}continue;}
  pane(g,x,y,ww,hh,glass);g.fillStyle='rgba(255,255,255,.06)';g.fillRect(x,y,ww,hh*.3);if(mullion){g.fillStyle=mullion;g.fillRect(x+ww/2-1,y,2,hh);}}
}
// ---------- logistics (HK references: precast grid + spiral ramp drum, curved LED bands, white/orange punched, grey/orange frame) ----------
// Hypothetical operators. Each has one 1024×256 slot in the sign atlas: bg = backlit board, no bg = channel letters.
export const BRANDS=[
 {en:'HARBOURLINK',wall:'#a4a6a1',glass:'#4d6272',zh:'港聯物流',mark:'wave',ink:'#173a6b',accent:'#1fa6a0',bg:'#ffffff',style:'grid'},
 {en:'JADEWAY',wall:'#c7bca5',glass:'#51655f',zh:'翠途物流',mark:'leaf',ink:'#ffffff',accent:'#d9f2c4',bg:'#2e9e4f',style:'grid'},
 {en:'SKYRIVER',wall:'#d4d1ca',glass:'#3f6470',zh:'天河智運',mark:'chevron',ink:'#3d7bff',accent:'#2f5fd0',bg:null,style:'band'},
 {en:'ORBIS COLD CHAIN',wall:'#b3bac0',glass:'#465d78',zh:'環宇冷鏈',mark:'ring',ink:'#27b3e6',accent:'#1a86b8',bg:null,style:'band'},
 {en:'TIDEPOINT',wall:'#e2dac8',glass:'#4f6577',zh:'潮匯倉儲',mark:'ring',ink:'#e2632b',accent:'#e2632b',bg:null,style:'orange'},
 {en:'NORTHSTAR CARGO',wall:'#8b9298',glass:'#4a5864',zh:'北辰貨運',mark:'star',ink:'#1d3557',accent:'#f07a1c',bg:'#ffffff',style:'frame'},
 // co-tenants on shared sign walls
 {en:'PEARLGATE',zh:'珠門速遞',mark:'ring',ink:'#c8102e',accent:'#c8102e',bg:'#ffffff'},
 {en:'KESTREL',zh:'隼鏈供應鏈',mark:'chevron',ink:'#ffffff',accent:'#f2c230',bg:'#23303d'},
 {en:'MERIDIAN',zh:'子午線貨運',mark:'wave',ink:'#ffffff',accent:'#ffd6f0',bg:'#5b3f8c'},
];
const OPERATORS=6,TENANTS=[6,7,8];
function canvasTex(w,h,draw,night,repeat=true){const c=document.createElement('canvas');c.width=w;c.height=h;draw(c.getContext('2d'),night);const t=new T.CanvasTexture(c);if(repeat)t.wrapS=t.wrapT=T.RepeatWrapping;t.colorSpace=T.SRGBColorSpace;t.anisotropy=8;return t;}
// Day map + night emissive map from one draw(g,night); night pattern is seeded so it matches day bays.
function litMat(w,h,draw,tile,opts={}){panes=[];const map=canvasTex(w,h,draw,false),glass=panes;panes=null;
 const m=new T.MeshStandardMaterial({map,emissiveMap:canvasTex(w,h,draw,true),roughness:.85,metalness:0,...opts});reflective(m,w,h,glass);m.emissive.set(0);m.userData.tile=tile;return m;}
const seeded=s=>()=>(s=(s*16807)%2147483647)/2147483647;
function drawMark(g,type,x,y,size,a,b){g.save();g.translate(x,y);g.scale(size/100,size/100);g.lineCap=g.lineJoin='round';
 if(type==='wave'){g.lineWidth=14;[b,a].forEach((col,k)=>{g.strokeStyle=col;g.beginPath();g.moveTo(-42,-14+k*28);g.bezierCurveTo(-18,-42+k*28,12,16+k*28,42,-14+k*28);g.stroke();});}
 else if(type==='leaf'){g.fillStyle=a;g.beginPath();g.ellipse(0,0,24,46,Math.PI/4,0,Math.PI*2);g.fill();g.strokeStyle=b===a?'#fff':b;g.lineWidth=5;g.beginPath();g.moveTo(-30,30);g.lineTo(24,-24);g.stroke();}
 else if(type==='chevron')[a,b].forEach((col,k)=>{const dx=k?10:-26;g.fillStyle=col;g.beginPath();g.moveTo(dx-14,-44);g.lineTo(dx+20,0);g.lineTo(dx-14,44);g.lineTo(dx+8,44);g.lineTo(dx+42,0);g.lineTo(dx+8,-44);g.closePath();g.fill();});
 else if(type==='ring'){g.strokeStyle=a;g.lineWidth=14;g.beginPath();g.arc(0,0,38,0,Math.PI*2);g.stroke();g.fillStyle=b;g.beginPath();g.arc(14,-14,13,0,Math.PI*2);g.fill();}
 else if(type==='star'){g.fillStyle=b;g.beginPath();for(let k=0;k<8;k++){const r=k%2?13:50,t=k*Math.PI/4-Math.PI/2;g.lineTo(Math.cos(t)*r,Math.sin(t)*r);}g.closePath();g.fill();g.fillStyle=a;g.beginPath();g.arc(0,0,8,0,Math.PI*2);g.fill();}
 g.restore();}
function drawSign(g,b,x0,y0,night){g.save();g.translate(x0,y0);
 if(b.bg){g.fillStyle=b.bg;g.fillRect(0,0,1024,256);if(night){g.fillStyle='rgba(0,0,0,.5)';g.fillRect(0,0,1024,256);}}
 drawMark(g,b.mark,132,128,190,b.ink,b.accent);
 let f=124;const font=()=>`900 ${f}px "Helvetica Neue",Arial,sans-serif`;g.font=font();while(g.measureText(b.en).width>730&&f>40){f-=4;g.font=font();}
 g.fillStyle=b.ink;g.fillText(b.en,256,142);g.font='600 70px "PingFang HK","Noto Sans TC","Microsoft JhengHei",sans-serif';g.fillStyle=b.bg?b.ink:b.accent;g.fillText(b.zh,260,226);
 g.restore();}
function floors2(g,n,draw){for(let f=0;f<2;f++)draw(f*128);}
// Two storeys (2 × 6.5 m) per tile; canvas bottom = floor level. Night pattern is seeded so it matches day bays.
const FACADES={
 // Precast grid with louvred openings and a glazed bay every fourth (Goodman/DP World style).
 grid:(wall,glass)=>litMat(512,256,(g,n)=>{const r=seeded(7);g.fillStyle=n?'#000':wall;g.fillRect(0,0,512,256);if(!n)weather(g,512,256,[0,128],7);floors2(g,n,y=>{
  for(let x=0,b=0;x<512;x+=64,b++){const lit=r()<.4;
   if(b%4===3){if(n){g.fillStyle=lit?'#e8d6b0':'#000';g.fillRect(x+5,y+40,54,76);}else{pane(g,x+5,y+40,54,76,glass);g.fillStyle=shade(wall,.75);g.fillRect(x+31,y+40,2,76);g.fillRect(x+5,y+76,54,2);}continue;}
   g.fillStyle=n?(lit?'#e8c48c':'#000'):'#33393d';g.fillRect(x+5,y+64,54,52);g.fillStyle=n?'rgba(0,0,0,.5)':shade(wall,.6);for(let k=y+68;k<y+116;k+=7)g.fillRect(x+5,k,54,2);}
  if(!n){g.fillStyle=shade(wall,.88);for(let x=0;x<512;x+=64)g.fillRect(x,y,2,128);g.fillRect(0,y+34,512,2);g.fillStyle=shade(wall,.8);g.fillRect(0,y+118,512,10);g.fillStyle=shade(wall,1.1);g.fillRect(0,y,512,3);}});},[18,13]),
 // Curved spandrels over tinted glazing with a blue LED line (Cainiao style).
 band:(wall,glass)=>litMat(512,256,(g,n)=>{const r=seeded(11),t=seeded(12);g.fillStyle=n?'#000':wall;g.fillRect(0,0,512,256);if(!n)weather(g,512,256,[],11);floors2(g,n,y=>{
  if(n){for(let x=0;x<512;x+=32){g.fillStyle=r()<.42?(r()<.5?'#c9d6e2':'#d9c7a4'):'#05080f';g.fillRect(x,y+48,32,80);}g.fillStyle='#000';for(let x=0;x<512;x+=32)g.fillRect(x,y+48,3,80);g.fillRect(0,y+84,512,3);}
  else{pane(g,0,y+48,512,80,glass);for(let x=0;x<512;x+=32){g.fillStyle=`rgba(${t()<.5?'0,0,0':'120,150,170'},${t()*.12})`;g.fillRect(x,y+48,32,80);}g.fillStyle='#7f8b95';for(let x=0;x<512;x+=32)g.fillRect(x,y+48,2,80);g.fillRect(0,y+84,512,2);g.fillStyle='rgba(0,0,0,.3)';g.fillRect(0,y+46,512,5);}
  g.fillStyle=n?'#4a78ff':shade(wall,.9);g.fillRect(0,y+38,512,6);});},[16,13]),
 // Rendered wall, punched windows over orange sills (Mapletree style).
 orange:(wall,glass)=>litMat(512,256,(g,n)=>{const r=seeded(13);g.fillStyle=n?'#000':wall;g.fillRect(0,0,512,256);if(!n)weather(g,512,256,[110,238],13);floors2(g,n,y=>{
  for(let x=28;x<512;x+=170){if(n){g.fillStyle=r()<.5?'#ffe2b0':'#000';g.fillRect(x,y+30,114,62);}else{pane(g,x,y+30,114,62,glass);g.fillStyle=shade(wall,.85);g.fillRect(x+55,y+30,4,62);g.fillRect(x-3,y+27,120,3);}g.fillStyle=n?'#000':'#dd7329';g.fillRect(x-12,y+96,138,14);}
  if(!n){g.fillStyle=shade(wall,.93);g.fillRect(0,y+124,512,4);}});},[12,13]),
 // Grey cladding framed by bold orange floor bands and pilasters (NWS style).
 frame:(wall,glass)=>litMat(512,256,(g,n)=>{const r=seeded(17);g.fillStyle=n?'#000':wall;g.fillRect(0,0,512,256);if(!n)weather(g,512,256,[0,128],17);floors2(g,n,y=>{
  if(!n){g.fillStyle=shade(wall,.9);for(let x=0;x<512;x+=64)g.fillRect(x,y,2,128);}
  for(let x=0;x<512;x+=128){if(n){g.fillStyle=r()<.55?'#ffe6bc':'#000';g.fillRect(x+44,y+52,60,34);}else{pane(g,x+44,y+52,60,34,glass);g.fillStyle='#c3c6c6';g.fillRect(x+44,y+86,60,4);}}
  g.fillStyle=n?'#000':'#e0712b';g.fillRect(0,y+110,512,18);});g.fillStyle=n?'#000':'#e0712b';g.fillRect(0,0,20,256);},[14,13]),
};
function logisticsMaterials(){return {
 // One facade per operator: its style drawn in its own wall and glass colours.
 ...Object.fromEntries(BRANDS.slice(0,OPERATORS).map((b,i)=>['logi'+i,FACADES[b.style](b.wall,b.glass)])),
 // Loading bay: roller shutter in a dock seal, bumpers, lamp above (5 m bays, 7 m dock storey).
 dock:litMat(128,256,(g,n)=>{g.fillStyle=n?'#000':'#a8a69f';g.fillRect(0,0,128,256);if(!n)weather(g,128,256,[40],19);g.fillStyle=n?'#000':'#1d1f21';g.fillRect(12,54,104,160);
  g.fillStyle=n?'rgba(255,214,150,.35)':'#d3d6d6';g.fillRect(20,62,88,150);if(!n){g.fillStyle='#b5b9ba';for(let y=66;y<212;y+=6)g.fillRect(20,y,88,2);g.fillStyle='#222';g.fillRect(18,212,12,18);g.fillRect(98,212,12,18);g.fillStyle='#e8c21c';for(let x=0;x<128;x+=24)g.fillRect(x,244,12,12);}
  g.fillStyle=n?'#fff2cc':'#d9dcdc';g.fillRect(54,36,20,8);},[5,7]),
 // Stair/lift core: concrete with a slit window per storey.
 core:litMat(128,256,(g,n)=>{g.fillStyle=n?'#000':'#b6b3ab';g.fillRect(0,0,128,256);if(!n)weather(g,128,256,[210],23);if(n){g.fillStyle='#fff0cf';g.fillRect(54,40,20,170);}else{pane(g,54,40,20,170,'#4a5866');g.fillStyle='#a19e96';g.fillRect(0,250,128,6);}},[6,6.5]),
 rampEdge:litMat(256,32,(g,n)=>{g.fillStyle=n?'#000':'#d3d1ca';g.fillRect(0,0,256,32);g.fillStyle=n?'#cfe0ff':'#bcc2c5';g.fillRect(0,26,256,4);},[10,1],{side:T.DoubleSide}),
 // Boards (opaque atlas) and channel letters (transparent atlas) share slot positions but not textures, so mipmaps
 // never bleed transparent black into a board, and letters blend rather than alpha-test away at distance.
 ...(()=>{const make=(board,o)=>{const draw=(g,n)=>{if(board){g.fillStyle=n?'#000':'#8a9096';g.fillRect(0,0,2048,2048);}BRANDS.forEach((b,i)=>{if(!!b.bg===board)drawSign(g,b,(i%2)*1024,Math.floor(i/2)*256,n);});};
  const m=new T.MeshStandardMaterial({map:canvasTex(2048,2048,draw,false,false),emissiveMap:canvasTex(2048,2048,draw,true,false),roughness:.45,...o});m.emissive.set(0);return m;};
  return {signs:make(true,{}),letters:make(false,{transparent:true,alphaTest:.02,depthWrite:false})};})(),
 deck:new T.MeshStandardMaterial({roughness:.9,map:canvasTex(256,256,g=>{const r=seeded(5);g.fillStyle='#a8a79f';g.fillRect(0,0,256,256);
  for(let k=0;k<14;k++){g.fillStyle=`rgba(${r()<.5?'60,66,70':'255,255,255'},${.05+r()*.07})`;g.beginPath();g.ellipse(r()*256,r()*256,10+r()*40,6+r()*24,r()*3,0,Math.PI*2);g.fill();}
  g.fillStyle='rgba(70,76,80,.35)';for(let k=0;k<256;k+=64){g.fillRect(k,0,2,256);g.fillRect(0,k,256,2);}})}),
 rampCore:new T.MeshStandardMaterial({color:0x8f8d86,roughness:.9}),
 // Ramp deck: asphalt with white edge lines and a yellow double centre line (u across the deck, v along it, 10 m repeat).
 rampDeck:new T.MeshStandardMaterial({roughness:.85,map:canvasTex(128,256,g=>{const r=seeded(29);g.fillStyle='#46494b';g.fillRect(0,0,128,256);for(let i=0;i<900;i++){g.fillStyle=`rgba(${r()<.5?'0,0,0':'255,255,255'},${r()*.08})`;g.fillRect(r()*128,r()*256,2,2);}
  g.fillStyle='#e9e9e4';g.fillRect(5,0,3,256);g.fillRect(120,0,3,256);g.fillStyle='#e2b53a';g.fillRect(60,0,3,256);g.fillRect(65,0,3,256);g.fillStyle='rgba(0,0,0,.18)';g.fillRect(28,0,12,256);g.fillRect(88,0,12,256);})}),
 ledge:new T.MeshStandardMaterial({color:0xd8d6cf,roughness:.8}),
 canopy:new T.MeshStandardMaterial({color:0x8d918f,roughness:.8}),
 concrete:new T.MeshStandardMaterial({color:0xb4b2aa,roughness:.9}),
 steel:new T.MeshStandardMaterial({color:0x3a3f44,roughness:.5,metalness:.5}),
 yard:new T.MeshStandardMaterial({color:0x767b7e,roughness:.95,polygonOffset:true,polygonOffsetFactor:-1}),
 solar:new T.MeshStandardMaterial({map:canvasTex(256,256,g=>{g.fillStyle='#1c2c48';g.fillRect(0,0,256,256);g.fillStyle='#8a9bb3';for(let k=0;k<256;k+=32){g.fillRect(k,0,2,256);g.fillRect(0,k,256,2);}}),roughness:.3,metalness:.4}),
 ...Object.fromEntries([0xb8382c,0x1f6fb2,0x2e8b57,0xe0a030,0xdedede].map((color,i)=>['box'+i,new T.MeshStandardMaterial({color,roughness:.7,map:canvasTex(256,64,g=>{g.fillStyle='#e6e6e6';g.fillRect(0,0,256,64);g.fillStyle='#a9a9a9';for(let x=0;x<256;x+=8)g.fillRect(x,0,3,64);g.fillStyle='#8c8c8c';g.fillRect(0,0,256,4);g.fillRect(0,60,256,4);})})])),
};}
let MATS;
export function lotMaterials(){return MATS||(MATS={
 // Tile sizes (metres) keep storeys at believable heights on every face.
 tower:Object.assign(facade((g,n)=>{windows(g,n,4,8,{wall:'#e9ecee',glass:'#6f93b3',frame:6,mullion:'#dfe5ea'});if(!n){g.fillStyle='#cfd6dc';for(let x=0;x<256;x+=64)g.fillRect(x,0,5,256);}},true),{userData:{tile:[12,25.2]}}),
 towerAlt:Object.assign(facade((g,n)=>{windows(g,n,6,8,{wall:'#d9dfe2',glass:'#4f7fa6',frame:4});if(!n){g.fillStyle='#7ea88f';g.fillRect(0,0,8,256);}},true),{userData:{tile:[15,25.2]}}),
 ...commercialMaterials(),
 podium:Object.assign(facade((g,n)=>{windows(g,n,2,2,{wall:'#eceeee',glass:'#b98a55',frame:14,litColour:'#ffcf8a',litShare:.9});},true),{userData:{tile:[16,10]}}),
 campus:Object.assign(facade((g,n)=>{windows(g,n,1,4,{wall:'#f1f3f2',glass:'#5aa0a8',frame:0,litShare:.35});if(!n){g.fillStyle='#f1f3f2';for(let y=0;y<256;y+=64)g.fillRect(0,y,256,30);}},true),{userData:{tile:[20,18]}}),
 civic:Object.assign(facade((g,n)=>windows(g,n,3,3,{wall:'#f3f1ec',glass:'#789aab',frame:12,litShare:.5}),true),{userData:{tile:[12,13.5]}}),
 house:Object.assign(facade((g,n)=>windows(g,n,2,3,{wall:'#efe4cf',glass:'#6d7f8a',frame:20,litShare:.4}),true),{userData:{tile:[8,8.2]}}),
 ...logisticsMaterials(),
 dronePad:new T.MeshStandardMaterial({map:(()=>{const c=document.createElement('canvas');c.width=c.height=256;const g=c.getContext('2d');g.fillStyle='#39414a';g.fillRect(0,0,256,256);g.strokeStyle='#f2c230';g.lineWidth=14;g.beginPath();g.arc(128,128,104,0,Math.PI*2);g.stroke();g.fillStyle='#fff';g.font='bold 150px sans-serif';g.textAlign='center';g.textBaseline='middle';g.fillText('H',128,136);const t=new T.CanvasTexture(c);t.colorSpace=T.SRGBColorSpace;return t;})(),roughness:.8,polygonOffset:true,polygonOffsetFactor:-2}),
 roofDeck:new T.MeshStandardMaterial({color:0xc9cdcf,roughness:.85}),
 greenRoof:new T.MeshStandardMaterial({color:0x6f9a4a,roughness:.95}),
 roof:new T.MeshStandardMaterial({color:0xb9bec0,roughness:.9}),
 trunk:new T.MeshStandardMaterial({color:0x5e4632,roughness:.95}),
 crown:new T.MeshStandardMaterial({color:0x4f7f3a,roughness:.9}),
 lawn:new T.MeshStandardMaterial({color:0x7ea650,roughness:1}),
});}

// Prism with metric UVs on the walls (so facade tiles keep storey height) and a separate flat roof face.
function prism(ring,y,h,tile,sink=4){// sink: walls run below grade so sloping ground never shows a gap under a building
 const wall=[],uv=[],idx=[];let u0=0;
 for(let i=0;i<ring.length;i++){const a=ring[i],b=ring[(i+1)%ring.length],len=Math.hypot(b[0]-a[0],b[1]-a[1]),n=wall.length/3;
  wall.push(a[0],y-sink,a[1],b[0],y-sink,b[1],b[0],y+h,b[1],a[0],y+h,a[1]);uv.push(u0/tile[0],-sink/tile[1],(u0+len)/tile[0],-sink/tile[1],(u0+len)/tile[0],h/tile[1],u0/tile[0],h/tile[1]);u0+=len;
  idx.push(n,n+2,n+1,n,n+3,n+2);}
 const walls=new T.BufferGeometry();walls.setAttribute('position',new T.Float32BufferAttribute(wall,3));walls.setAttribute('uv',new T.Float32BufferAttribute(uv,2));walls.setIndex(idx);walls.computeVertexNormals();
 return {walls,top:flat(ring,y+h)};
}
// Horizontal face (roofs, decals) over a ring, facing up.
function flat(ring,y,uvScale=.1,down=false){const g=new T.BufferGeometry(),tris=T.ShapeUtils.triangulateShape(ring.map(([x,z])=>new T.Vector2(x,z)),[]);
 g.setAttribute('position',new T.Float32BufferAttribute(ring.flatMap(([x,z])=>[x,y,z]),3));g.setAttribute('uv',new T.Float32BufferAttribute(ring.flatMap(([x,z])=>[x*uvScale,z*uvScale]),2));
 // Each triangle faces up (+y normal) whatever the ring's winding: y of (b−a)×(c−a) = dz1·dx2 − dx1·dz2.
 g.setIndex(tris.flatMap(([i,j,k])=>{const [a,b,c]=[ring[i],ring[j],ring[k]];return (b[1]-a[1])*(c[0]-a[0])-(b[0]-a[0])*(c[1]-a[1])>0!==down?[i,j,k]:[i,k,j];}));g.computeVertexNormals();return g;}
const rect=(cx,cz,w,d,angle)=>{const c=Math.cos(angle),s=Math.sin(angle);return [[-w/2,-d/2],[w/2,-d/2],[w/2,d/2],[-w/2,d/2]].map(([u,v])=>[cx+u*c+v*s,cz-u*s+v*c]);};
function roundedRect(cx,cz,w,d,angle,r,seg=5){const c=Math.cos(angle),s=Math.sin(angle),out=[];r=Math.min(r,w/2-.1,d/2-.1);
 for(const [ux,vz,a0] of [[w/2-r,d/2-r,0],[-w/2+r,d/2-r,Math.PI/2],[-w/2+r,-d/2+r,Math.PI],[w/2-r,-d/2+r,1.5*Math.PI]])for(let i=0;i<=seg;i++){const a=a0+i/seg*Math.PI/2,u=ux+r*Math.cos(a),v=vz+r*Math.sin(a);out.push([cx+u*c+v*s,cz-u*s+v*c]);}
 return out;}
const box=(cx,cy,cz,w,h,d,angle,tile,sink)=>prism(rect(cx,cz,w,d,angle),cy,h,tile,sink);

// Principal axis of the lot = direction of its longest edge.
function lotFrame(poly){let best=0,angle=0;for(let i=0;i<poly.length;i++){const [x1,z1]=poly[i],[x2,z2]=poly[(i+1)%poly.length],l=Math.hypot(x2-x1,z2-z1);if(l>best){best=l;angle=Math.atan2(-(z2-z1),x2-x1);}}return angle;}
function edgeDistance([x,z],poly){let d=Infinity;for(let i=0;i<poly.length;i++){const [ax,az]=poly[i],[bx,bz]=poly[(i+1)%poly.length],dx=bx-ax,dz=bz-az,t=Math.max(0,Math.min(1,((x-ax)*dx+(z-az)*dz)/(dx*dx+dz*dz||1)));d=Math.min(d,Math.hypot(x-ax-t*dx,z-az-t*dz));}return d;}
export function centroid(poly){let x=0,z=0;for(const p of poly){x+=p[0];z+=p[1];}return [x/poly.length,z/poly.length];}

// Footprint slots: a rotated grid of w×d rectangles fully inside the lot (with setback) and clear of game scenery.
function slots(lot,w,d,gap,setback,ctx,limit=Infinity){
 const angle=lotFrame(lot.poly),c=Math.cos(angle),s=Math.sin(angle),[ox,oz]=centroid(lot.poly),out=[];
 const local=lot.poly.map(([x,z])=>[(x-ox)*c-(z-oz)*s,(x-ox)*s+(z-oz)*c]),us=local.map(p=>p[0]),vs=local.map(p=>p[1]);
 const r=Math.hypot(w,d)/2;
 for(let u=Math.min(...us)+setback+w/2;u<=Math.max(...us)-setback-w/2;u+=w+gap)for(let v=Math.min(...vs)+setback+d/2;v<=Math.max(...vs)-setback-d/2;v+=d+gap){
  const x=ox+u*c+v*s,z=oz-u*s+v*c,corners=[[-1,-1],[1,-1],[1,1],[-1,1]].map(([a,b])=>[x+(a*w/2)*c+(b*d/2)*s,z-(a*w/2)*s+(b*d/2)*c]);
  if(!corners.every(p=>pointInPolygon(p,lot.poly)&&edgeDistance(p,lot.poly)>=setback*.5)||!pointInPolygon([x,z],lot.poly))continue;
  out.push({x,z,angle});}
 // With a limit (planting), test scattered candidates only until enough pass: spreads trees and skips most clearance checks.
 if(limit<out.length)for(let i=out.length-1;i>0;i--){const j=Math.floor(rnd()*(i+1));[out[i],out[j]]=[out[j],out[i]];}
 const ok=[];for(const p of out){if(ok.length>=limit)break;if(!ctx.allowed||ctx.allowed(p.x,p.z,r))ok.push(p);}
 return ok;
}

// Cluster zones (HSK Logistics Cluster study, Figure 3). buildings: max per lot; maxFloors at 6.5 m/floor.
const CLUSTER={A:{buildings:2,maxFloors:7},B:{buildings:3,maxFloors:8},C:{buildings:2,maxFloors:5,dronePads:true},E:{buildings:2,maxFloors:7}};
// Largest free rectangles on an 8 m grid in the lot frame (maximal-rectangle scan), 25 m apart for yards and ramps.
function bigFootprints(lot,ctx,count){
 const angle=lotFrame(lot.poly),c=Math.cos(angle),s=Math.sin(angle),[ox,oz]=centroid(lot.poly),cell=8,local=lot.poly.map(([x,z])=>[(x-ox)*c-(z-oz)*s,(x-ox)*s+(z-oz)*c]);
 const u0=Math.min(...local.map(p=>p[0])),v0=Math.min(...local.map(p=>p[1])),nu=Math.ceil((Math.max(...local.map(p=>p[0]))-u0)/cell),nv=Math.ceil((Math.max(...local.map(p=>p[1]))-v0)/cell);
 const world=(u,v)=>[ox+u*c+v*s,oz-u*s+v*c],free=[];
 for(let j=0;j<nv;j++){free.push([]);for(let i=0;i<nu;i++){const p=world(u0+(i+.5)*cell,v0+(j+.5)*cell);free[j].push(pointInPolygon(p,lot.poly)&&edgeDistance(p,lot.poly)>=10&&(!ctx.allowed||ctx.allowed(p[0],p[1],cell*.75)));}}
 const out=[];
 for(let n=0;n<count;n++){let best=null;const h=new Array(nu).fill(0);
  for(let j=0;j<nv;j++){for(let i=0;i<nu;i++)h[i]=free[j][i]?h[i]+1:0;
   const st=[];for(let i=0;i<=nu;i++){const hi=i<nu?h[i]:0;let start=i;while(st.length&&st.at(-1)[1]>=hi){const [k,hk]=st.pop();const w=Math.min(i-k,22),d=Math.min(hk,16);if(!best||w*d>best.a)best={a:w*d,i0:k,i1:k+w,j0:j-d+1,j1:j+1};start=k;}st.push([start,hi]);}}
  if(!best||best.a*cell*cell<2500)break;
  for(let j=Math.max(0,best.j0-3);j<Math.min(nv,best.j1+3);j++)for(let i=Math.max(0,best.i0-3);i<Math.min(nu,best.i1+3);i++)free[j][i]=false;
  const [x,z]=world(u0+(best.i0+best.i1)/2*cell,v0+(best.j0+best.j1)/2*cell);out.push({x,z,w:(best.i1-best.i0)*cell-4,d:(best.j1-best.j0)*cell-4,angle});}
 return out;}
// Planar 0–1 UVs over a flat decal's own bounds.
function planarUV(g){g.computeBoundingBox();const b=g.boundingBox,p=g.attributes.position,uv=[];for(let i=0;i<p.count;i++)uv.push((p.getX(i)-b.min.x)/(b.max.x-b.min.x||1),(p.getZ(i)-b.min.z)/(b.max.z-b.min.z||1));g.setAttribute('uv',new T.Float32BufferAttribute(uv,2));return g;}

let seed=1;const rnd=()=>(seed=(seed*16807)%2147483647)/2147483647;
const hashSeed=id=>{let h=7;for(const ch of String(id))h=(h*31+ch.charCodeAt(0))%2147483647;return h||1;};

// Sign quad facing (nx,nz), textured from atlas slot. Reads left→right from the front.
function signQuad(x,y,z,nx,nz,w,h,slot){const g=new T.PlaneGeometry(w,h),uv=g.attributes.uv,col=slot%2,row=Math.floor(slot/2);
 for(let i=0;i<uv.count;i++)uv.setXY(i,(col+uv.getX(i))/2,1-(row+1-uv.getY(i))/8);
 return g.applyMatrix4(new T.Matrix4().makeBasis(new T.Vector3(nz,0,-nx),new T.Vector3(0,1,0),new T.Vector3(nx,0,nz)).setPosition(x,y,z));}
// Helical two-lane ramp (r0→r1) starting at angle a0: lane-marked deck, concrete soffit, outer parapet band, inner kerb.
function helix(cx,cz,y0,r0,r1,rise,turns,dir,a0){const n=Math.ceil(turns*48),rm=(r0+r1)/2,v={deck:[],soffit:[],wall:[],kerb:[]},uv={deck:[],soffit:[],wall:[],kerb:[]},ix={deck:[],soffit:[],wall:[],kerb:[]};
 for(let i=0;i<=n;i++){const t=i/n,a=a0+dir*t*turns*Math.PI*2,y=y0+t*rise,c=Math.cos(a),s=Math.sin(a),len=t*turns*Math.PI*2*rm/10,P=(r,h)=>[cx+c*r,y+h,cz+s*r];
  v.deck.push(...P(r0,0),...P(r1,0));uv.deck.push(0,len,1,len);v.soffit.push(...P(r0,-.45),...P(r1,-.45));uv.soffit.push(0,len,1,len);
  v.wall.push(...P(r1,-.5),...P(r1,1.2));uv.wall.push(len,0,len,1);v.kerb.push(...P(r0,-.45),...P(r0,.9));uv.kerb.push(len,0,len,1);
  if(i){const k=(i-1)*2,up=dir>0;// winding follows the spiral's direction so the deck faces up and the soffit down
   ix.deck.push(...(up?[k,k+2,k+1,k+1,k+2,k+3]:[k,k+1,k+2,k+1,k+3,k+2]));ix.soffit.push(...(up?[k,k+1,k+2,k+1,k+3,k+2]:[k,k+2,k+1,k+1,k+2,k+3]));
   ix.wall.push(k,k+1,k+2,k+1,k+3,k+2);ix.kerb.push(k,k+1,k+2,k+1,k+3,k+2);}}
 const out={};for(const key in v){const g=new T.BufferGeometry();g.setAttribute('position',new T.Float32BufferAttribute(v[key],3));g.setAttribute('uv',new T.Float32BufferAttribute(uv[key],2));g.setIndex(ix[key]);g.computeVertexNormals();out[key]=g;}
 return out;}
const DOCK=7,FLOOR=6.5;
// One multi-storey logistics building on footprint r: dock storey under a canopy, warehouse floors, spiral ramp,
// stair cores, rooftop plant/solar, operator signs and trailers at the docks. Returns the paved apron (for planting).
function logisticsBuilding(r,i,lot,ctx,parts,ramps,floors,cap,dronePads){
 const M=lotMaterials(),ground=(x,z)=>ctx.ground?ctx.ground(x,z):0,y=ground(r.x,r.z),h=cap(y,DOCK+(floors-1)*FLOOR),upper=Math.max(1,Math.round((h-DOCK)/FLOOR));
 const brand=hashSeed(lot.id+':'+i)%OPERATORS,B=BRANDS[brand],S=M['logi'+brand];
 const c=Math.cos(r.angle),s=Math.sin(r.angle),at=(u,v)=>[r.x+u*c+v*s,r.z-u*s+v*c],rad=Math.min(16,r.d*.22);
 const add=(material,geometry)=>parts.push({material,geometry}),ring=grow=>roundedRect(r.x,r.z,r.w+grow,r.d+grow,r.angle,rad+grow/2);
 const solid=(mat,b,top=M.roof)=>{add(mat,b.walls);add(top,b.top);};
 // Paved apron: grows up to 16 m per side while its edge stays inside the lot.
 const reach=(axis,side)=>{for(let e=16;e>6;e-=2){const pts=[-1,0,1].map(k=>axis?at(k*r.w/2,side*(r.d/2+e)):at(side*(r.w/2+e),k*r.d/2));if(pts.every(p=>pointInPolygon(p,lot.poly)))return e;}return 6;};
 const eu=[reach(0,-1),reach(0,1)],ev=[reach(1,-1),reach(1,1)],[ax,az]=at((eu[1]-eu[0])/2,(ev[1]-ev[0])/2);
 add(M.yard,flat(roundedRect(ax,az,r.w+eu[0]+eu[1],r.d+ev[0]+ev[1],r.angle,8),y+.12));
 // Dock storey recessed under a projecting canopy (with soffit), then the warehouse floors, slab ledges and parapet.
 add(M.dock,prism(ring(-3),y,DOCK,M.dock.userData.tile).walls);
 solid(M.canopy,prism(ring(5),y+DOCK-.9,.9,[4,4],0));add(M.canopy,flat(ring(5),y+DOCK-.9,.1,true));
 add(S,prism(ring(0),y+DOCK,h-DOCK,S.userData.tile,0).walls);
 if(B.style==='band'||B.style==='grid')for(let k=1;k<upper;k++)add(M.ledge,prism(ring(1.6),y+DOCK+k*FLOOR-.35,.7,[4,4],0).walls);
 add(M.ledge,prism(ring(.6),y+h,1.4,[4,4],0).walls);add(M.ledge,prism(ring(-.2).reverse(),y+h,1.4,[4,4],0).walls);add(M.deck,flat(ring(0),y+h+.02,.05));
 // Spiral vehicle ramp at one short end: core, helical deck, parapet band, columns.
 // The drum always overlaps the facade: each lap passes through the building (a floor entry), and every lap starts and
 // ends on that inside arc, so ramp trucks wrap from the top floor back to the dock unseen.
 const side=i%2?-1:1,rr=Math.min(19,r.d*.36),out=Math.min(rr*.8,eu[side>0?1:0]),[rx,rz]=at(side*(r.w/2+out-rr),0),turns=upper+1,a0=Math.atan2(side*s,-side*c);
 const hx=helix(rx,rz,y+.3,rr*.34,rr,h-.3,turns,side,a0);add(M.rampDeck,hx.deck);add(M.concrete,hx.soffit);add(M.rampEdge,hx.wall);add(M.rampEdge,hx.kerb);
 ramps.push({cx:rx,cz:rz,y0:y+.3,rise:h-.3,turns,dir:side,a0,lanes:[rr*(.34+.66*.72),rr*(.34+.66*.28)],building:ring(0)});
 add(M.rampCore,new T.CylinderGeometry(rr*.33,rr*.33,h+1.5,20).translate(rx,y+(h+1.5)/2-.5,rz));
 for(let k=0;k<10;k++){const a=k/10*Math.PI*2;add(M.concrete,new T.CylinderGeometry(.45,.45,h,6).translate(rx+Math.cos(a)*(rr-.5),y+h/2,rz+Math.sin(a)*(rr-.5)));}
 // Stair/lift cores proud of both long faces, rising above the roof.
 const cores=r.w*.33+4<r.w/2-rad?[-.33,.33].map(k=>k*r.w):[];
 for(const v of [1,-1])for(const u of cores){const [cx,cz]=at(u,v*(r.d/2+.8));solid(M.core,box(cx,y,cz,7,h+4.5,4.5,r.angle,M.core.userData.tile));}
 // Roof: solar rows on one half, plant boxes (or drone pads) on the other.
 const run=r.w-rad*2-24;if(run>10)for(let v=-r.d/2+8;v<-4;v+=5.5){const [px,pz]=at(-side*6,v);solid(M.steel,box(px,y+h+.3,pz,run,.3,3.6,r.angle,[4,4]),M.solar);}
 if(dronePads)for(const u of [-.25,.18]){const [px,pz]=at(u*r.w,r.d/4);add(M.dronePad,planarUV(flat(roundedRect(px,pz,15,15,r.angle,7.4,6),y+h+.32,0)));}
 else for(let k=0;k<5;k++){const [px,pz]=at((rnd()-.5)*(r.w-50),r.d*(.1+rnd()*.2));solid(M.roof,box(px,y+h,pz,4+rnd()*6,2.4,3+rnd()*3,r.angle,[4,4]));}
 // Signs go on one face only: the one whose outward normal points most directly at the nearest SGMTS route point
 // (long faces between the cores, or the short end away from the ramp), so neighbours never sign at each other.
 const q=sample(project(r.x,r.z)),du=(q.x-r.x)*c-(q.z-r.z)*s,dv=(q.x-r.x)*s+(q.z-r.z)*c,long=cores.length?r.w*.66-10:r.w*.5;
 const F=[{u:0,sg:1,n:dv,avail:long},{u:0,sg:-1,n:-dv,avail:long},{u:1,sg:-side,n:-side*du,avail:r.d-2*rad-4}].filter(f=>f.avail>=16).sort((a,b)=>b.n-a.n)[0];
 const onFace=(t,off)=>F.u?at(F.sg*(r.w/2+off),t):at(t,F.sg*(r.d/2+off)),[nx,nz]=F.u?[F.sg*c,-F.sg*s]:[F.sg*s,F.sg*c];
 const plate=(t,y0,W,H,off,D=.4)=>{const [bx,bz]=onFace(t,off);return F.u?box(bx,y0,bz,D,H,W,r.angle,[4,4],0):box(bx,y0,bz,W,H,D,r.angle,[4,4],0);};
 if(B.bg){// Backlit boards on steel backing across the top storey; wide buildings add co-tenant boards in the same row.
  const sw=Math.min(40,F.avail*.8),row=[{slot:brand,w:sw}];
  for(const slot of TENANTS){const tw=sw*.62;if(r.w<150||row.reduce((a,b)=>a+b.w+2,0)+tw>F.avail)break;row.push({slot,w:tw});}
  let t=-(row.reduce((a,b)=>a+b.w,0)+2*(row.length-1))/2;
  for(const {slot,w} of row){const hh=w/4,cy=y+h-2.2-hh/2,tc=t+w/2,[px,pz]=onFace(tc,1.1);solid(M.steel,plate(tc,cy-hh/2-.3,w+.6,hh+.6,.85),M.steel);add(M.signs,signQuad(px,cy,pz,nx,nz,w,hh,slot));t+=w+2;}}
 else{// Channel letters on a steel frame at the roof edge, read against the sky rather than over lit windows.
  const rw=Math.min(F.avail*.9,46),rh=rw/4,ry=y+h+1.6+rh/2,[px,pz]=onFace(0,-2.6);add(M.letters,signQuad(px,ry,pz,nx,nz,rw,rh,brand));
  solid(M.steel,plate(0,y+h+1.2,rw+1,.5,-3,.6),M.steel);for(const k of [-.4,-.13,.13,.4])solid(M.steel,plate(k*rw,y+h,.4,rh+1.6,-3.2),M.steel);}
 // Container trailers backed onto the docks where the apron is deep enough.
 for(const v of [1,-1]){if(ev[v>0?1:0]<14)continue;for(let u=-r.w/2+rad+3;u<r.w/2-rad-3;u+=4.6){
  if(rnd()>.5||cores.some(cu=>Math.abs(u-cu)<6)||Math.abs(u-side*(r.w/2+out-rr))<rr+3)continue;
  const [bx,bz]=at(u,v*(r.d/2+1.2+6.3)),gy=ground(bx,bz),paint=M['box'+Math.floor(rnd()*5)];
  solid(paint,box(bx,gy+1.25,bz,2.5,2.9,12.2,r.angle,[4,2.9]),paint);solid(M.steel,box(bx,gy+.45,bz,2,.8,11.8,r.angle,[4,4]),M.steel);}}
 return {x:ax,z:az,w:r.w+eu[0]+eu[1],d:r.d+ev[0]+ev[1],angle:r.angle};}

// Returns {parts:[{material,geometry}], trees:[{x,y,z,s}], ramps:[helix lanes for rampTraffic]}; geometry is in world space.
export function massingParts(lot,ctx){
 seed=hashSeed(lot.id);const use=lot.style||useOf(lot.zone),M=lotMaterials(),parts=[],trees=[],ramps=[],area=polygonArea(lot.poly),pr=plotRatio(lot.zone);
 const ground=(x,z)=>ctx.ground?ctx.ground(x,z):0,topY=lot.maxBH!=null?lot.maxBH-DATUM:null;
 const add=(mat,roofMat,b)=>{parts.push({material:mat,geometry:b.walls},{material:roofMat,geometry:b.top});};
 const block=(slot,w,d,h,mat,roofMat=M.greenRoof,base=null)=>{const y=base??ground(slot.x,slot.z);add(mat,roofMat,box(slot.x,y,slot.z,w,h,d,slot.angle,mat.userData.tile));return y+h;};
 const cap=(y,h)=>topY==null?h:Math.max(6,Math.min(h,topY-y));
 const base=ctx.allowedLow||ctx.allowed,plant=(spacing,limit,keep=()=>true)=>{for(const p of slots(lot,spacing*.5,spacing*.5,spacing*.5,3,{allowed:(x,z,r)=>keep(x,z)&&(!base||base(x,z,r))},limit)){const j=spacing*.3;trees.push({x:p.x+(rnd()-.5)*j,z:p.z+(rnd()-.5)*j,y:ground(p.x,p.z),s:.8+rnd()*.6});}};
 if(use==='residential'||use==='mixed'){
  const podiumH=use==='mixed'?18:12,pod=slots(lot,26,26,0,8,ctx);let roof=0;
  for(const p of pod)roof=block(p,26,26,podiumH,M.podium);
  const storeys=lot.maxStoreys,plate=650,sites=slots(lot,24,26,26,14,ctx);
  const baseY=pod.length?roof:ground(...centroid(lot.poly));
  const towerH=cap(baseY,storeys?storeys*3.15:(topY??baseY+100)-baseY-2),floors=Math.max(1,towerH/3.15);
  const want=Math.max(1,Math.ceil((pr??5)*area*(use==='mixed'?.6:.9)/(plate*floors)));
  sites.slice(0,want).forEach((p,i)=>{const h=cap(baseY,towerH-(i%3)*6.3),mat=i%2?M.towerAlt:M.tower;block(p,24,26,h,mat,M.roof,pod.length?baseY:null);});
  plant(18,40);
 }else if(use==='commercial'){
  // Retail podium, then towers cycling through five CBD archetypes (commercial.js) so neighbours differ.
  const out=(material,geometry)=>parts.push({material,geometry}),pod=slots(lot,30,30,0,8,ctx);let roof=0;for(const p of pod)roof=commercialPodium(p,ground(p.x,p.z),out);
  const baseY=pod.length?roof:ground(...centroid(lot.poly)),towerH=cap(baseY,(topY??baseY+120)-baseY-2),floors=towerH/4,want=Math.max(1,Math.ceil((pr??8)*area*.8/(1400*floors)));
  // ponytail: archetype offset from the lot number spreads all five over the four A2 C lots; revisit if lots are added.
  const k0=(parseInt(lot.id.split('-').pop())||hashSeed(lot.id))*3;
  slots(lot,38,34,30,14,ctx).slice(0,want).forEach((p,i)=>{const y=pod.length?baseY:ground(p.x,p.z);commercialTower((k0+i)%5,p,y,cap(y,towerH-i*16),out);});
  plant(18,30);
 }else if(use==='gic'){
  const h=Math.min(lot.maxStoreys?lot.maxStoreys*4.2:30,topY!=null?topY-ground(...centroid(lot.poly)):30);
  for(const p of slots(lot,24,24,0,7,ctx))block(p,24,24,Math.max(8,h),M.civic);plant(16,30);
 }else if(use==='logistics'){
  // HSK Logistics Cluster study: multi-storey, 6–7 m floors, spiral ramps; PR 5 / 110 mPD are ceilings, not targets.
  const zone=CLUSTER[lot.cluster]||CLUSTER.B,sites=bigFootprints(lot,ctx,zone.buildings);
  const cover=sites.reduce((a,r)=>a+r.w*r.d,0)||1,floors=Math.max(3,Math.min(zone.maxFloors,Math.ceil((pr??5)*area*.6/cover)));
  const aprons=sites.map((r,i)=>logisticsBuilding(r,i,lot,ctx,parts,ramps,floors,cap,zone.dronePads));
  // Trees stay off the paved aprons and loading yards.
  plant(16,90,(x,z)=>aprons.every(a=>{const dx=x-a.x,dz=z-a.z,c=Math.cos(a.angle),s=Math.sin(a.angle);return Math.abs(dx*c-dz*s)>a.w/2+3||Math.abs(dx*s+dz*c)>a.d/2+3;}));
 }else if(use==='enterprise'){
  const sites=slots(lot,32,32,16,10,ctx),cover=sites.length*32*32||1,floors=Math.ceil((pr??5)*area*.75/cover),y=ground(...centroid(lot.poly));
  for(const p of sites)block(p,32,32,cap(y,floors*4.5),M.campus);plant(20,40);
 }else if(use==='village'){
  for(const p of slots(lot,11,11,6,4,ctx))if(rnd()<.8)block(p,11,11,8.2,M.house,M.roof);
 }else if(use==='open')plant(14,220);
 else if(use==='green')plant(12,320);
 else if(use==='utility'){for(const p of slots(lot,30,30,4,8,ctx))block(p,30,30,Math.min(12,topY??12),M.civic,M.roof);}
 return {parts,trees,ramps};
}

const TREE={trunk:new T.CylinderGeometry(.25,.35,3,6).translate(0,1.5,0),crown:new T.IcosahedronGeometry(2.6,1).scale(1,.85,1).translate(0,4.6,0)};
function treeMeshes(trees){if(!trees.length)return [];const M=lotMaterials(),out=[];
 for(const [geo,mat] of [[TREE.trunk,M.trunk],[TREE.crown,M.crown]]){const mesh=new T.InstancedMesh(geo,mat,trees.length),m=new T.Matrix4();
  trees.forEach((t,i)=>mesh.setMatrixAt(i,m.compose(new T.Vector3(t.x,t.y,t.z),new T.Quaternion(),new T.Vector3(t.s,t.s,t.s))));mesh.name='lot vegetation';mesh.castShadow=true;mesh.receiveShadow=true;out.push(mesh);}
 return out;}

function mergeByMaterial(parts){const by=new Map();for(const p of parts){if(!by.has(p.material))by.set(p.material,[]);by.get(p.material).push(p.geometry);}
 return [...by].map(([mat,geos])=>{const mesh=new T.Mesh(mergeGeometries(geos),mat);geos.forEach(g=>g.dispose());mesh.castShadow=mesh.receiveShadow=true;return mesh;});}

const loader=new GLTFLoader(),glbCache=new Map();
export function loadModel(url){if(!glbCache.has(url))glbCache.set(url,loader.loadAsync(url).then(g=>g.scene));return glbCache.get(url).then(s=>s.clone(true));}
// A GLB is authored in metres, Y up, origin at the ground-floor centre; placed at the lot centroid plus offset.
export async function placeModel(lot,url,ctx){const m=lot.model,root=await loadModel(url),[cx,cz]=centroid(lot.poly),x=cx+(m.offset?.[0]||0),z=cz+(m.offset?.[1]||0);
 root.position.set(x,ctx.ground?ctx.ground(x,z):0,z);root.rotation.y=(m.rotation||0)*Math.PI/180;root.scale.setScalar(m.scale||1);
 root.traverse(n=>{if(n.isMesh){n.castShadow=n.receiveShadow=true;}});return root;}

// Object3D.add() with no arguments logs an error, and a lot can legitimately produce nothing.
const addAll=(g,list)=>{if(list.length)g.add(...list);};

// One lot → Group (editor; per-lot selection). ctx: {allowed(x,z,r), allowedLow, ground(x,z), modelUrl(src)}
export async function buildLot(lot,ctx){const g=new T.Group();g.name='lot:'+lot.id;g.userData.lotId=lot.id;
 if(lot.model?.type==='massing'){const {parts,trees}=massingParts(lot,ctx);addAll(g,[...mergeByMaterial(parts),...treeMeshes(trees)]);}
 else if(lot.model?.type==='glb'&&lot.model.src)g.add(await placeModel(lot,ctx.modelUrl(lot.model.src),ctx).catch(e=>{console.warn('Lot model failed',lot.model.src,e);return new T.Group();}));
 return g;}

// Game: lots merged by material within 400 m cells, so draw calls stay low while frustum culling and
// the collision grid (src/collision.js) still get compact bounds. Everything is static.
export async function buildLots(lots,ctx){const g=new T.Group();g.name='OZP lots';const cells=new Map(),trees=[],ramps=[];
 for(const lot of lots){if(lot.model?.type==='massing'){const r=massingParts(lot,ctx),[x,z]=centroid(lot.poly),k=Math.floor(x/400)+':'+Math.floor(z/400);
   if(!cells.has(k))cells.set(k,[]);cells.get(k).push(...r.parts);trees.push(...r.trees);ramps.push(...r.ramps);}
  else if(lot.model?.type==='glb'&&lot.model.src)g.add(await buildLot(lot,ctx));}
 for(const parts of cells.values())addAll(g,mergeByMaterial(parts));addAll(g,treeMeshes(trees));
 if(ramps.length)await (ctx.kit?Promise.resolve(ctx.kit):loadModel(ctx.truckUrl||(import.meta.env?.BASE_URL??'/')+'assets/street-kit.glb?v=street-kit-20260928'))// the game passes the kit it already parsed; the editor loads its own
  .then(kit=>g.add(rampTraffic(ramps,kit.getObjectByName('truck')))).catch(e=>console.warn('Ramp trucks unavailable',e));
 g.updateMatrixWorld(true);g.traverse(n=>n.matrixAutoUpdate=false);return g;}

// Lorries on the spiral ramps: the street kit's truck, instanced, driving the outer lane up and the inner lane down.
// Poses are a pure function of time, set once per rendered frame.
export const RAMP_SPEED=4.5,TRUCKS_PER_LANE=3;
export function rampPose(ramp,lane,phase,time,m=new T.Matrix4()){
 const r=ramp.lanes[lane],L=Math.hypot(ramp.turns*Math.PI*2*r,ramp.rise),f=((time*RAMP_SPEED/L+phase)%1+1)%1,p=lane?1-f:f,sgn=lane?-1:1;
 const a=ramp.a0+ramp.dir*p*ramp.turns*Math.PI*2,c=Math.cos(a),s=Math.sin(a),pos=new T.Vector3(ramp.cx+c*r,ramp.y0+p*ramp.rise,ramp.cz+s*r),k=ramp.turns*Math.PI*2*r;
 const ahead=pos.clone().add(new T.Vector3(-s*k*ramp.dir*sgn,ramp.rise*sgn,c*k*ramp.dir*sgn).normalize());
 return m.lookAt(pos,ahead,UP).setPosition(pos);// truck front is −Z, which lookAt points at `ahead`
}
const UP=new T.Vector3(0,1,0);
function rampTraffic(ramps,truck){
 // One geometry (a group per material) in the truck's own frame.
 truck.updateMatrixWorld(true);const inv=truck.matrixWorld.clone().invert(),meshes=[];truck.traverse(n=>{if(n.isMesh)meshes.push(n);});
 const uv=meshes.every(m=>m.geometry.attributes.uv),geos=meshes.map(m=>{let g=m.geometry.clone().applyMatrix4(inv.clone().multiply(m.matrixWorld));
  for(const k of Object.keys(g.attributes))if(!['position','normal',...(uv?['uv']:[])].includes(k))g.deleteAttribute(k);return g.index?g.toNonIndexed():g;});
 const trucks=ramps.flatMap(ramp=>[0,1].flatMap(lane=>Array.from({length:TRUCKS_PER_LANE},(_,k)=>({ramp,lane,phase:(k+lane*.5)/TRUCKS_PER_LANE}))));
 const mesh=new T.InstancedMesh(mergeGeometries(geos,true),meshes.map(m=>m.material),trucks.length),m=new T.Matrix4();
 mesh.name='ramp trucks';mesh.castShadow=mesh.receiveShadow=true;mesh.frustumCulled=false;// instances move; bounds would go stale
 let frame=-1;const pose=time=>{trucks.forEach((t,i)=>mesh.setMatrixAt(i,rampPose(t.ramp,t.lane,t.phase,time,m)));mesh.instanceMatrix.needsUpdate=true;};pose(0);
 mesh.onBeforeRender=renderer=>{if(renderer.info.render.frame===frame)return;frame=renderer.info.render.frame;pose(performance.now()/1000);};
 return mesh;}

// Lit-window materials for the game's night switch.
export const nightMaterials=()=>Object.values(lotMaterials()).filter(m=>m.emissiveMap);
export const occupiedBy=lots=>{const placed=lots.filter(l=>l.model&&l.model.type!=='none'),inside=list=>(x,z)=>list.some(l=>pointInPolygon([x,z],l.poly));
 // .builtPolys: outlines of lots carrying buildings (not open space or green belt); the backdrop hills keep off these.
 return Object.assign(inside(placed),{builtPolys:placed.filter(l=>l.model.type==='glb'||!['open','green'].includes(l.style||useOf(l.zone))).map(l=>l.poly)});};
// Shared with commercial.js.
export {flat,canvasTex,seeded,weather};
