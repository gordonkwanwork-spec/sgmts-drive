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
