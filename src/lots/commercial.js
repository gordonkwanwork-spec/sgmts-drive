// Commercial towers for the C zones round A2, after Gordon's HK CBD references: a twisting ribbed tower with
// bulging tiers, a Lippo-style core with clustered cantilevered bays, a clear-glass slab with slab edges and a
// stone spine, a tapered chamfered grid tower with a lit crown, and (after the HSK development renders) a
// champagne oval tower with gold fins, a recessed sky garden and a sliced, sloping top. All stand on retail podiums with shopfronts, fascias and canopies.
// Curtain walls carry per-pane tint and roughness (roughness/metalness map), so the glass reflects the live sky
// (scene.environment, re-baked per condition in atmosphere.js) unevenly, as real unitised glazing does.
import * as T from 'three';
import {flat,canvasTex,seeded,weather} from './massing.js';

const FLOOR=4.2;
// Signed area ×2 in plan; > 0 means the wall winding below faces outward.
const area2=r=>{let a=0;for(let i=0;i<r.length;i++){const [x1,z1]=r[i],[x2,z2]=r[(i+1)%r.length];a+=x1*z2-x2*z1;}return a;};

// Day map, night emissive map and a roughness (G) / metalness (B) map from one draw(g,night,pane).
// pane() records a glass rectangle with its own roughness; everything else takes bg=[roughness,metalness].
function glassMat(w,h,tile,draw,{bg=[.78,0]}={}){
 const panes=[],rec=(g,x,y,pw,ph,fill,rough=.08,metal=.92)=>{g.fillStyle=fill;g.fillRect(x,y,pw,ph);panes.push([x,y,pw,ph,rough,metal]);},paint=(g,x,y,pw,ph,fill)=>{g.fillStyle=fill;g.fillRect(x,y,pw,ph);};
 const map=canvasTex(w,h,g=>draw(g,false,rec),false),emissiveMap=canvasTex(w,h,g=>draw(g,true,paint),true);
 const rm=canvasTex(w,h,g=>{g.fillStyle=`rgb(0,${bg[0]*255|0},${bg[1]*255|0})`;g.fillRect(0,0,w,h);for(const [x,y,pw,ph,r,m] of panes){g.fillStyle=`rgb(0,${r*255|0},${m*255|0})`;g.fillRect(x,y,pw,ph);}});
 rm.colorSpace=T.NoColorSpace;
 const m=new T.MeshStandardMaterial({map,emissiveMap,roughnessMap:rm,metalnessMap:rm,roughness:1,metalness:1,envMapIntensity:1.35});m.emissive.set(0);m.userData.tile=tile;return m;}

// Unitised curtain wall, `cols` modules × `floors` storeys per tile; canvas bottom = floor level.
// Per storey from the top: spandrel (fritted, rougher), vision glass, slab edge.
function curtain({cols,floors,hue,sat,light,mullion,mw=3,spandrel=.16,slab=0,slabColour='#e9eaea',interior=0,litShare=.5,warm=.4}){
 return (g,n,pane)=>{const r=seeded(cols*97+floors*13+hue),w=512,h=512,cw=w/cols,fh=h/floors;
  g.fillStyle=n?'#000':mullion;g.fillRect(0,0,w,h);
  for(let f=0;f<floors;f++){const y=f*fh,sp=fh*spandrel,sl=fh*slab,vh=fh-sp-sl,floorLit=r()<litShare,tone=r()<warm?['#d8c49c','#8c7a5c','#2c261e']:['#b7c6d2','#76828d','#20262c'];
   for(let c=0;c<cols;c++){const x=c*cw+mw/2,pw=cw-mw,v=r(),lit=r()<(floorLit?.85:.1);
    // Night: offices light a whole floor at a time; ceiling panels bright, falling off towards the sill.
    if(n){if(lit){const gr=g.createLinearGradient(0,y+sp,0,y+sp+vh);tone.forEach((t,i)=>gr.addColorStop(i/2,t));g.fillStyle=gr;g.fillRect(x,y+sp,pw,vh);
      g.fillStyle='#e8eef2';g.fillRect(x,y+sp+1,pw,2);}else if(v<.3){g.fillStyle='#0b111a';g.fillRect(x,y+sp,pw,vh);}continue;}
    pane(g,x,y+sp,pw,vh,`hsl(${hue+(v-.5)*8},${sat+(r()-.5)*8}%,${light+(v-.5)*9}%)`,.03+r()*.13);
    // Interior read through clear glass: ceiling line, occasional blinds or a column.
    if(interior){g.fillStyle=`rgba(236,238,236,${interior})`;g.fillRect(x,y+sp,pw,5);if(r()<.3){g.fillStyle=`rgba(222,220,210,${interior*.9})`;g.fillRect(x,y+sp,pw,vh*(.2+r()*.5));}if(r()<.2){g.fillStyle='rgba(40,44,48,.35)';g.fillRect(x+pw*.4,y+sp,pw*.18,vh);}}
    g.fillStyle='rgba(255,255,255,.07)';g.fillRect(x,y+sp,pw,vh*.22);
    if(sp)pane(g,x,y,pw,sp,`hsl(${hue},${sat*.5}%,${light*.72}%)`,.32,.55);}
   if(!n){g.fillStyle=mullion;g.fillRect(0,y+sp-1,w,2);if(sl){g.fillStyle=slabColour;g.fillRect(0,y+fh-sl,w,sl);g.fillStyle='rgba(0,0,0,.12)';g.fillRect(0,y+fh-sl,w,2);}}}
};}

// Retail podium, 20 m in one tile: shopfronts under coloured fascias and a canopy line, two glazed upper floors
// between stone piers, parapet band.
const retail=(g,n,pane)=>{const r=seeded(41);g.fillStyle=n?'#000':'#d8d0c2';g.fillRect(0,0,512,512);if(!n)weather(g,512,512,[22,176,340],41);
 for(const y of [34,190])for(let x=0;x<512;x+=128){if(n){g.fillStyle=r()<.7?'#ffd9a0':'#0a0a0a';g.fillRect(x+14,y,100,130);continue;}
  pane(g,x+14,y,100,130,`hsl(200,24%,${46+r()*12}%)`,.04+r()*.08);g.fillStyle='#b9b2a5';for(let k=1;k<3;k++)g.fillRect(x+14+k*33,y,4,130);g.fillStyle='rgba(255,255,255,.08)';g.fillRect(x+14,y,100,26);}
 g.fillStyle=n?'#000':'#c9c1b3';g.fillRect(0,0,512,20);g.fillStyle=n?'#000':'#3d4247';g.fillRect(0,344,512,24);
 for(let b=0;b<3;b++){const x=b*171,hue=Math.floor(r()*360);
  g.fillStyle=n?`hsl(${hue},85%,58%)`:`hsl(${hue},55%,${32+r()*20}%)`;g.fillRect(x+8,370,155,26);g.fillStyle='#f6f3ec';for(let k=0,m=5+r()*4;k<m;k++)g.fillRect(x+24+k*14,377,9,12);
  if(n){const gr=g.createLinearGradient(0,398,0,500);gr.addColorStop(0,'#fff0d0');gr.addColorStop(1,'#d9a868');g.fillStyle=gr;g.fillRect(x+8,398,155,102);}else pane(g,x+8,398,155,102,'hsl(35,14%,42%)',.04);
  for(let k=0;k<6;k++){g.fillStyle=`hsla(${Math.floor(r()*360)},50%,60%,${n?.7:.35})`;g.fillRect(x+16+k*24,450+r()*20,14,30);}
  g.fillStyle=n?'#000':'#8d857a';g.fillRect(x,368,8,144);}
 g.fillStyle=n?'#000':'#57514c';g.fillRect(0,500,512,12);};
// Stone spine: honed panels with a slot window per storey.
const stone=(g,n,pane)=>{g.fillStyle=n?'#000':'#dcd6cb';g.fillRect(0,0,256,256);if(!n){weather(g,256,256,[0],43);g.fillStyle='#c8c1b4';for(let y=0;y<256;y+=64)g.fillRect(0,y,256,2);g.fillRect(127,0,2,256);}
 if(n){g.fillStyle='#ffe4b8';g.fillRect(104,30,48,200);}else pane(g,104,30,48,200,'#26313a',.06);};
// Crown cladding: aluminium louvres with LED lines.
const crown=(g,n)=>{g.fillStyle=n?'#000':'#c3cad0';g.fillRect(0,0,256,256);if(!n){g.fillStyle='#98a1a8';for(let y=0;y<256;y+=16)g.fillRect(0,y,256,5);}g.fillStyle=n?'#c4ecff':'#eef3f6';for(let y=0;y<256;y+=64)g.fillRect(0,y,256,6);};
const louvre=(g,n)=>{g.fillStyle=n?'#000':'#8e959a';g.fillRect(0,0,128,128);if(!n){g.fillStyle='#646b70';for(let y=0;y<128;y+=10)g.fillRect(0,y,128,4);}};

let CM;
// Keys are prefixed so they can join lotMaterials() without clashing.
export function commercialMaterials(){return CM||(CM={
 cBlue:glassMat(512,512,[12,4*FLOOR],curtain({cols:8,floors:4,hue:203,sat:36,light:46,mullion:'#dfe5ea',spandrel:.16}),{bg:[.32,.8]}),
 cDark:glassMat(512,512,[12,4*FLOOR],curtain({cols:6,floors:4,hue:214,sat:30,light:22,mullion:'#aeb6be',spandrel:.1,slab:.13,slabColour:'#cdd2d6',litShare:.4}),{bg:[.3,.8]}),
 cClear:glassMat(512,512,[9,4*FLOOR],curtain({cols:6,floors:4,hue:192,sat:14,light:60,mullion:'#e3e6e8',mw:2,spandrel:.1,slab:.1,slabColour:'#f2f2ef',interior:.28,litShare:.7,warm:.8}),{bg:[.4,.6]}),
 cGrid:glassMat(512,512,[12,4*FLOOR],curtain({cols:4,floors:4,hue:208,sat:22,light:30,mullion:'#c9cdd1',mw:20,spandrel:.22,slab:.08,slabColour:'#c9cdd1',litShare:.5}),{bg:[.28,.85]}),
 cChamp:glassMat(512,512,[9.6,4*FLOOR],curtain({cols:8,floors:4,hue:38,sat:32,light:60,mullion:'#d9c9a2',mw:2,spandrel:.12,litShare:.55,warm:.7}),{bg:[.3,.85]}),
 cRetail:glassMat(512,512,[15,20],retail),
 cStone:glassMat(256,256,[6,FLOOR],stone),
 cCrown:glassMat(256,256,[6,6],crown,{bg:[.35,.8]}),
 cLouvre:new T.MeshStandardMaterial({map:canvasTex(128,128,louvre,false),roughness:.7,metalness:.3}),
 cGold:new T.MeshStandardMaterial({color:0xcdb27a,metalness:.85,roughness:.3,side:T.DoubleSide}),
 cAlu:new T.MeshStandardMaterial({color:0xd4d9dd,metalness:.85,roughness:.28,side:T.DoubleSide}),
 cDarkAlu:new T.MeshStandardMaterial({color:0x50565d,metalness:.7,roughness:.4}),
 cRoof:new T.MeshStandardMaterial({color:0xa9adaf,roughness:.9}),
 cCanopy:new T.MeshStandardMaterial({color:0x8fa3ae,metalness:.75,roughness:.12,side:T.DoubleSide}),
 cPlanter:new T.MeshStandardMaterial({color:0x6f9a4a,roughness:.95}),
 // Night switch copies color into emissive and needs an emissiveMap to include the material.
 cAviation:new T.MeshStandardMaterial({color:0xff2a1a,roughness:.5,emissiveMap:canvasTex(4,4,g=>{g.fillStyle='#fff';g.fillRect(0,0,4,4);},true)}),
});}

// Walls between successive rings (same vertex count), metric UVs: u = distance round each ring, v = height above vBase.
// smooth shares vertices round the ring (curved plans); otherwise each facet is flat-shaded.
function loft(rings,ys,tile,vBase,smooth=false){if(area2(rings[0])<0)rings=rings.map(r=>[...r].reverse());
 const n=rings[0].length,pos=[],uv=[],idx=[],cum=rings.map(r=>{const c=[0];for(let j=0;j<n;j++){const a=r[j],b=r[(j+1)%n];c.push(c[j]+Math.hypot(b[0]-a[0],b[1]-a[1]));}return c;});
 if(smooth){rings.forEach((r,k)=>{for(let j=0;j<=n;j++){const [x,z]=r[j%n];pos.push(x,ys[k],z);uv.push(cum[k][j]/tile[0],(ys[k]-vBase)/tile[1]);}});
  for(let k=0;k<rings.length-1;k++)for(let j=0;j<n;j++){const a=k*(n+1)+j,b=a+1,d=a+n+1,c=d+1;idx.push(a,c,b,a,d,c);}}
 else for(let j=0;j<n;j++){const base=pos.length/3;rings.forEach((r,k)=>{const a=r[j],b=r[(j+1)%n];pos.push(a[0],ys[k],a[1],b[0],ys[k],b[1]);uv.push(cum[k][j]/tile[0],(ys[k]-vBase)/tile[1],cum[k][j+1]/tile[0],(ys[k]-vBase)/tile[1]);
  if(k){const p=base+2*k-2;idx.push(p,p+3,p+1,p,p+2,p+3);}});}
 return geo(pos,uv,idx);}
function geo(pos,uv,idx){const g=new T.BufferGeometry();g.setAttribute('position',new T.Float32BufferAttribute(pos,3));g.setAttribute('uv',new T.Float32BufferAttribute(uv,2));g.setIndex(idx);g.computeVertexNormals();return g;}
// Vertical fins/ribs every `spacing` m round the lowest ring, following each ring up (so they lean and twist with it).
function fins(rings,ys,spacing,depth){const r0=rings[0],n=r0.length,sg=Math.sign(area2(r0)),places=[],pos=[],uv=[],idx=[];
 let acc=spacing/2;for(let j=0;j<n;j++){const a=r0[j],b=r0[(j+1)%n],L=Math.hypot(b[0]-a[0],b[1]-a[1]);for(;acc<L;acc+=spacing)places.push([j,acc/L]);acc-=L;}
 for(const [j,t] of places){const base=pos.length/3;rings.forEach((r,k)=>{const a=r[j],b=r[(j+1)%n],dx=b[0]-a[0],dz=b[1]-a[1],L=Math.hypot(dx,dz)||1,px=a[0]+dx*t,pz=a[1]+dz*t;
  pos.push(px,ys[k],pz,px+sg*dz/L*depth,ys[k],pz-sg*dx/L*depth);uv.push(0,0,1,0);if(k){const p=base+2*k-2;idx.push(p,p+2,p+1,p+1,p+2,p+3);}});}
 return geo(pos,uv,idx);}
// Prism with a sloped (planar) top: tops[] is the roof height at each ring vertex.
function slice(ring,y0,tops,tile,vBase){if(area2(ring)<0){ring=[...ring].reverse();tops=[...tops].reverse();}
 const pos=[],uv=[],idx=[],n=ring.length;let u=0;
 for(let i=0;i<n;i++){const a=ring[i],b=ring[(i+1)%n],ta=tops[i],tb=tops[(i+1)%n],L=Math.hypot(b[0]-a[0],b[1]-a[1]),k=pos.length/3;
  pos.push(a[0],y0,a[1],b[0],y0,b[1],b[0],tb,b[1],a[0],ta,a[1]);uv.push(u/tile[0],(y0-vBase)/tile[1],(u+L)/tile[0],(y0-vBase)/tile[1],(u+L)/tile[0],(tb-vBase)/tile[1],u/tile[0],(ta-vBase)/tile[1]);u+=L;idx.push(k,k+2,k+1,k,k+3,k+2);}
 const top=geo(ring.flatMap(([x,z],i)=>[x,tops[i],z]),ring.flatMap(([x,z])=>[x/tile[0],z/tile[0]]),T.ShapeUtils.triangulateShape(ring.map(([x,z])=>new T.Vector2(x,z)),[]).flatMap(([a,b,c])=>{const [p,q,r]=[ring[a],ring[b],ring[c]];return (q[1]-p[1])*(r[0]-p[0])-(q[0]-p[0])*(r[1]-p[1])>0?[a,b,c]:[a,c,b];}));
 return {walls:geo(pos,uv,idx),top};}

const rectL=(w,d)=>[[-w/2,-d/2],[w/2,-d/2],[w/2,d/2],[-w/2,d/2]];
const chamferL=(w,d,k)=>[[-w/2+k,-d/2],[w/2-k,-d/2],[w/2,-d/2+k],[w/2,d/2-k],[w/2-k,d/2],[-w/2+k,d/2],[-w/2,d/2-k],[-w/2,-d/2+k]];
const notchL=(w,d,k)=>{const a=w/2,b=d/2;return [[-a+k,-b],[a-k,-b],[a-k,-b+k],[a,-b+k],[a,b-k],[a-k,b-k],[a-k,b],[-a+k,b],[-a+k,b-k],[-a,b-k],[-a,-b+k],[-a+k,-b+k]];};
const ovalL=(a,b,n=36)=>Array.from({length:n},(_,i)=>{const t=i/n*Math.PI*2;return [Math.cos(t)*a,Math.sin(t)*b];});
const lobeL=(R,n=40)=>Array.from({length:n},(_,i)=>{const t=i/n*Math.PI*2,r=R*(1+.09*Math.cos(4*t));return [Math.cos(t)*r,Math.sin(t)*r];});

// Local plan helper for one slot {x,z,angle}: place(pts, scale, rotation, du, dv) → world ring.
function frame(p){const c=Math.cos(p.angle),s=Math.sin(p.angle),W=(u,v)=>[p.x+u*c+v*s,p.z-u*s+v*c];
 return {W,place:(pts,k=1,rot=0,du=0,dv=0)=>{const cr=Math.cos(rot),sr=Math.sin(rot);return pts.map(([u,v])=>W((u*cr-v*sr)*k+du,(u*sr+v*cr)*k+dv));}};}

// Retail podium block (30 × 30 × 20 m) with a canopy over the shopfronts and a planted roof. Returns the roof level.
export function commercialPodium(p,y,out){const M=commercialMaterials(),{place}=frame(p),r=place(rectL(30,30)),cp=place(rectL(33,33));
 out(M.cRetail,loft([r,r],[y-4,y+20],M.cRetail.userData.tile,y));out(M.cPlanter,flat(r,y+20));
 out(M.cCanopy,loft([cp,cp],[y+5.7,y+6.1],[4,4],y));out(M.cCanopy,flat(cp,y+6.1));out(M.cCanopy,flat(cp,y+5.7,.1,true));// above the fascias
 return y+20;}

// One tower of archetype `kind` (0–4) on slot p, base y0, total height H (crowns and masts included).
export function commercialTower(kind,p,y0,H,out){const M=commercialMaterials(),{W,place}=frame(p);if(H<40)kind=2;
 const walls=(mat,rings,ys,smooth)=>out(mat,loft(rings,ys,mat.userData.tile||[4,4],y0,smooth));
 const box=(mat,u,v,w,d,y,h,top=M.cRoof,under=null)=>{const r=place(rectL(w,d),1,0,u,v);walls(mat,[r,r],[y,y+h]);out(top,flat(r,y+h));if(under)out(under,flat(r,y,.1,true));};
 let roof=null,mast=0;
 if(kind===0){// Twisting ribbed tower: three bulging tiers, lobed plan turning 29° over the height, lantern crown.
  const crownH=Math.min(14,H*.1),Hb=H-crownH-5,plan=lobeL(15),n=Math.max(8,Math.round(Hb/2.1)),rings=[],ys=[];
  const kAt=h=>{const q=Math.min(2.999,h/Hb*3),tier=Math.floor(q);return (1-.07*tier)*(1+.05*Math.sin(Math.PI*(q-tier)));},rotAt=h=>h/Hb*.5;
  for(let i=0;i<=n;i++){const h=i/n*Hb;rings.push(place(plan,kAt(h),rotAt(h)));ys.push(y0+h);}
  walls(M.cBlue,rings,ys,true);out(M.cAlu,fins(rings,ys,3.2,.45));
  const cr=[],cy=[];for(let i=0;i<=3;i++){const h=Hb+i/3*crownH;cr.push(place(plan,kAt(Hb)*(1-.28*i/3),rotAt(h)));cy.push(y0+h);}
  walls(M.cCrown,cr,cy,true);out(M.cRoof,flat(cr[3],cy[3]));roof={pts:plan,k:kAt(Hb)*.72,rot:rotAt(Hb+crownH),y:cy[3]};mast=5;
 }else if(kind===1){// Lippo-style: chamfered core with cantilevered bays alternating tier by tier, silver bands, stepped top.
  const plan=chamferL(24,20,5),Hb=H-9,r=place(plan),band=place(chamferL(24.8,20.8,5.2));walls(M.cDark,[r,r],[y0,y0+Hb]);
  for(let y=8,t=0;y+4*FLOOR<Hb-2;y+=5*FLOOR,t++){const o=t%2?4:-4;
   for(const [u,v,w,d] of [[o,-11.5,11,3],[-o,11.5,11,3],[13.5,o,3,11],[-13.5,-o,3,11]])box(M.cDark,u,v,w,d,y0+y,4*FLOOR,M.cAlu,M.cAlu);
   walls(M.cAlu,[band,band],[y0+y-.7,y0+y]);out(M.cAlu,flat(band,y0+y));}
  const r2=place(plan,.82),r3=place(plan,.64);out(M.cRoof,flat(r,y0+Hb));walls(M.cDark,[r2,r2],[y0+Hb,y0+Hb+4]);out(M.cRoof,flat(r2,y0+Hb+4));
  walls(M.cLouvre,[r3,r3],[y0+Hb+4,y0+H]);out(M.cRoof,flat(r3,y0+H));roof={pts:plan,k:.64,rot:0,y:y0+H};
 }else if(kind===2){// Clear-glass slab with notched corners, a stone spine past the roof and a glass screen crown.
  const plan=notchL(34,22,3),Hb=H-6,r=place(plan),sc=place(plan,.97);walls(M.cClear,[r,r],[y0,y0+Hb]);out(M.cRoof,flat(r,y0+Hb));
  box(M.cStone,18.5,0,3,14,y0,H);walls(M.cCanopy,[sc,sc],[y0+Hb,y0+H-1]);
  for(let k=1;k*6*FLOOR<Hb-4;k++){const s=place(notchL(35.2,23.2,3.6));walls(M.cAlu,[s,s],[y0+k*6*FLOOR-.35,y0+k*6*FLOOR]);out(M.cAlu,flat(s,y0+k*6*FLOOR));}
  roof={pts:plan,k:.8,rot:0,y:y0+Hb};
 }else if(kind===3){// Tapered chamfered grid tower with deep aluminium fins and a lit pyramidal crown.
  const plan=chamferL(30,30,6),Hb=(H-6)*.86,rings=[],ys=[];for(let i=0;i<=6;i++){rings.push(place(plan,1-.1*i/6));ys.push(y0+i/6*Hb);}
  walls(M.cGrid,rings,ys);out(M.cAlu,fins(rings,ys,3,.7));
  const cr=[place(plan,.9),place(plan,.78),place(plan,.5)],cy=[y0+Hb,y0+Hb+(H-6-Hb)*.45,y0+H-6];walls(M.cCrown,cr,cy);out(M.cRoof,flat(cr[2],cy[2]));
  roof={pts:plan,k:.5,rot:0,y:cy[2]};mast=6;
 }else{// Champagne oval (HSK renders): gold fins, a two-storey recessed sky garden, top sliced by a sloping plane.
  const plan=ovalL(18,11),slope=Math.min(16,H*.1),Hb=H-slope,g1=Math.round(Hb*.55/FLOOR)*FLOOR,r=place(plan),r2=place(plan,.96),rin=place(plan,.86);
  walls(M.cChamp,[r,r],[y0,y0+g1]);out(M.cGold,fins([r,r],[y0,y0+g1],2.4,.5));out(M.cPlanter,flat(r,y0+g1));
  walls(M.cClear,[rin,rin],[y0+g1,y0+g1+2*FLOOR]);for(let k=0;k<6;k++){const [x,z]=W(-12+k*4.8,(k%2?1:-1)*7.8),y=y0+g1;out(M.cPlanter,new T.SphereGeometry(1.4,8,6).scale(1,.8,1).translate(x,y+1.1,z));}
  const ys=y0+g1+2*FLOOR,tops=plan.map(([u])=>ys+(Hb-g1-2*FLOOR)+slope*(u/18+1)/2),sl=slice(r2,ys,tops,M.cChamp.userData.tile,y0);out(M.cGold,flat(r2,ys,.1,true));
  out(M.cChamp,sl.walls);out(M.cChamp,sl.top);out(M.cGold,fins([r2,r2],[ys,Math.min(...tops)],2.4,.5));
  const [mx,mz]=W(17,0);out(M.cGold,new T.CylinderGeometry(.3,.4,6,8).translate(mx,y0+H-3+.01,mz));out(M.cAviation,new T.BoxGeometry(.6,.6,.6).translate(mx,y0+H+.3,mz));
 }
 if(!roof)return;
 // Roof: plant screen, building maintenance unit on its track, aviation lights on the corners, mast.
 const {pts,k,rot,y}=roof,cr=Math.cos(rot),sr=Math.sin(rot),rp=(u,v)=>[u*cr-v*sr,u*sr+v*cr];
 const plant=place(rectL(12*k/.7,8*k/.7),1,rot);walls(M.cLouvre,[plant,plant],[y,y+3.5]);out(M.cRoof,flat(plant,y+3.5));
 const [bu,bv]=rp(0,-9*k/.7);box(M.cDarkAlu,bu,bv,3,3,y,2.4);const arm=place(rectL(12*k/.7,.7),1,rot,bu,bv);walls(M.cDarkAlu,[arm,arm],[y+2.4,y+3.1]);out(M.cDarkAlu,flat(arm,y+3.1));
 const edge=place(pts,k*.97,rot);for(let i=0;i<4;i++){const [x,z]=edge[Math.floor(i*edge.length/4)];out(M.cAviation,new T.BoxGeometry(.6,.6,.6).translate(x,y+.3,z));}
 if(mast){const [x,z]=W(0,0);out(M.cAlu,new T.CylinderGeometry(.25,.4,mast,8).translate(x,y+mast/2,z));out(M.cAviation,new T.BoxGeometry(.6,.6,.6).translate(x,y+mast+.3,z));}
}
