// The roof garden of the western podium and the Tuen Ma side platform set the
// landing levels. All geometry and walkable heights use the same station-local frame.
import * as T from 'three';
import {mergeByMaterial} from './batching.js';
import {datum,rail,pavingY,worldCoordinates,siteCoordinates,galleryY} from './a2-site.js';

export const westEnd=-115.8,eastEnd=-16.85,gateZ=-66,roofLevel=13.8;
const clamp=v=>Math.max(0,Math.min(1,v)),smooth=t=>t*t*(3-2*t);
export const bridgeLevel=x=>roofLevel+((rail.y+1.15-datum)-roofLevel)*smooth(clamp((x-westEnd)/(eastEnd-westEnd)));
function spine(x){
 const trough=-58;
 if(x<trough)return -51-46*smooth(clamp((x-westEnd)/(trough-westEnd)));
 return -97+31*smooth(clamp((x-trough)/(eastEnd-trough)));
}
const swell=(x,from,to)=>x<=from||x>=to?0:Math.sin(Math.PI*(x-from)/(to-from))**2;
function halfSpan(x){
 const slope=(spine(x+.1)-spine(x-.1))/.2;
 return (3.35+2.8*swell(x,-77,-35))*Math.hypot(1,slope);
}
export const southEdge=x=>spine(x)+halfSpan(x);
const northEdge=x=>spine(x)-halfSpan(x);

export const stairs=[
 {x:-109.95,foot:-20.6,width:3.3,grade:galleryY(-109.95,-20.6)-datum},
 {x:-69.7,foot:-39,width:5.0,grade:null}
];
// Through-car lifts open south at street level and north onto the bridge.
export const lifts=[
 {x:-103.8,name:'Western podium and west SGMTS'},
 {x:-64.6,name:'East SGMTS'},
 {x:-54.4,name:'HSWRL plaza'},
 {x:-22.2,name:'Hung Shui Kiu Station'}
].map(({x,name},i)=>{
 const edge=southEdge(x),z=Math.max(southEdge(x-1.4),southEdge(x+1.4))+1.58;
 const base=i===0?galleryY(x,z+3.1):pavingY(x,z+3.1),deck=datum+bridgeLevel(x);
 return {x,z,name,base,deck,street:worldCoordinates(x,z+3.1),bridge:worldCoordinates(x,edge-.95),car:worldCoordinates(x,z)};
});
export function liftAt(walker){
 const local=siteCoordinates(walker.x,walker.z);
 for(const lift of lifts){
  if(Math.abs(local.x-lift.x)>1.6)continue;
  for(const [stop,y] of [['street',lift.base],['bridge',lift.deck]]){
   if(Math.abs(walker.y-y)<.55&&Math.hypot(walker.x-lift[stop].x,walker.z-lift[stop].z)<1.95)
    return {lift,stop};
  }
 }
 return null;
}
export function liftApronY(x,z){
 for(const lift of lifts)if(Math.abs(x-lift.x)<=1.95&&z>=lift.z+1.3&&z<=lift.z+4.25)return lift.base;
 return null;
}
const flights=4,stepsPerFlight=18,slots=flights*stepsPerFlight+(flights-1)*4;
function stepsDone(slot){
 const whole=Math.min(flights,Math.floor(slot/(stepsPerFlight+4)));
 return Math.min(flights*stepsPerFlight,whole*stepsPerFlight+Math.min(stepsPerFlight,slot-whole*(stepsPerFlight+4)));
}
function stairY(flight,x,t){
 const base=flight.grade??(pavingY(x,flight.foot)-datum);
 return base+(bridgeLevel(x)-base)*stepsDone(Math.floor(clamp(t)*slots+.000001))/(stepsPerFlight*flights);
}
export function bridgeWalkY(x,z,feet){
 if(!Number.isFinite(feet)||x<westEnd-31||x>eastEnd+.2||z>78||z<-112)return null;
 for(const lift of lifts)if(Math.abs(x-lift.x)<=1.25&&z>=southEdge(x)-.2&&z<=lift.z-1.23&&Math.abs(feet-lift.deck)<.7)return lift.deck;
 const level=datum+bridgeLevel(x);
 if(x>=westEnd&&x<=eastEnd&&z>=northEdge(x)&&z<=southEdge(x)){
  if(Math.abs(feet-level)<.85)return level;
 }
 for(const f of stairs){
  if(Math.abs(x-f.x)>f.width/2)continue;
  const t=(z-f.foot)/(southEdge(x)-f.foot);
  if(t<0||t>1)continue;
  const y=datum+stairY(f,x,t);if(Math.abs(feet-y)<.7)return y;
 }
 // Open terrace on the east rim of the western podium.
 if(x>=-146&&x<=-112.7&&z>-58&&z<71&&Math.abs(feet-datum-roofLevel)<.7)return datum+roofLevel;
 return null;
}

const roofStart=-120.6,roofEnd=-16.25;
export const stairEave=.45;
const roofRadius=x=>halfSpan(x)+.70;
function deckRoofY(x,u){
 const gateDrop=.68*smooth(clamp((x+25)/8));
 return bridgeLevel(x)+3.23+.62*(1-u*u)-gateDrop;
}
function stairRoofY(f,x,z){
 const base=f.grade??(pavingY(f.x,f.foot)-datum),t=clamp((z-f.foot)/(southEdge(x)-f.foot));
 return base+(bridgeLevel(x)-base)*t+3.1+.24*(1-Math.abs(x-f.x)/(f.width/2+stairEave));
}
const pierStations=[-111.8,-103.2,-72,-53,-37,-22];
const girderDepth=x=>.66+.87*swell(x,-111,-63);

// The weather particles occupy a moving volume. Clip individual streaks under the
// shelter in station coordinates so rain is still visible beyond either eave.
function rainRoofHeight(x,z){
 let y=0;
 if(x>=roofStart&&x<=roofEnd){
  const u=(z-spine(x))/roofRadius(x);if(Math.abs(u)<=1)y=deckRoofY(x,u);
 }
 for(const f of stairs)if(Math.abs(x-f.x)<=f.width/2+stairEave&&z>=southEdge(x)-.8&&z<=f.foot+1.1)y=Math.max(y,stairRoofY(f,x,z));
 for(const l of lifts){
  const dx=Math.abs(x-l.x),dz=z-l.z;
  if(dx<=1.675&&z>=Math.min(southEdge(l.x-1.65),southEdge(l.x+1.65))-.6&&dz<=1.55)y=Math.max(y,l.deck-datum+3.23);
  if(dx<=2.105&&dz>=.465&&dz<=4.515)y=Math.max(y,l.base-datum+3.29);
 }
 return y;
}
export function shelterBridgeRain(material){
 const x0=-123,z0=-110,w=440,h=380,cell=.25,scale=32;
 const data=new Uint8Array(w*h);
 for(let j=0;j<h;j++)for(let i=0;i<w;i++)
  data[j*w+i]=Math.round(rainRoofHeight(x0+(i+.5)*cell,z0+(j+.5)*cell)*255/scale);
 const mask=new T.DataTexture(data,w,h,T.RedFormat);mask.needsUpdate=true;
 material.onBeforeCompile=shader=>{
  shader.uniforms.a2Shelter={value:mask};
  shader.uniforms.a2ToLocal={value:new T.Matrix4().makeRotationY(rail.heading).setPosition(rail.x,datum,rail.z).invert()};
  shader.vertexShader='uniform mat4 a2ToLocal; varying vec3 vA2Rain;\n'+shader.vertexShader.replace('#include <project_vertex>',
   '#include <project_vertex>\n vA2Rain=(a2ToLocal*modelMatrix*vec4(transformed,1.)).xyz;');
  shader.fragmentShader='uniform sampler2D a2Shelter; varying vec3 vA2Rain;\n'+shader.fragmentShader.replace('#include <clipping_planes_fragment>',
   `#include <clipping_planes_fragment>\n float cover=texture2D(a2Shelter,(vA2Rain.xz-vec2(${x0}.,${z0}.))/vec2(${w*cell}.,${h*cell}.)).r;
    if(cover>0. && vA2Rain.y<cover*${scale}.) discard;`);
 };
}
export function buildIconicBridge(parent,light){
 const group=new T.Group();group.name='A2 iconic footbridge';parent.add(group);
 const coat=new T.MeshStandardMaterial({color:0xe1daca,metalness:.22,roughness:.61});
 const copper=new T.MeshStandardMaterial({color:0x886849,metalness:.46,roughness:.48});
 const dark=new T.MeshStandardMaterial({color:0x4e5655,metalness:.35,roughness:.61});
 const paving=new T.MeshStandardMaterial({color:0xd0c8b9,roughness:.9});
 const floorFinish=new T.MeshStandardMaterial({map:parent.getObjectByName('Hung Shui Kiu regional plaza')?.material.map??null,roughness:.93,color:0xe7ded0,side:T.DoubleSide});
 floorFinish.emissiveMap=floorFinish.map;
 const roof=new T.Group();roof.name='A2 bridge rain canopy';group.add(roof);
 const structure=new T.Group();structure.name='A2 bridge columns and girders';group.add(structure);
 let parts=group;
 const zinc=new T.MeshStandardMaterial({color:0xd8d4c6,metalness:.37,roughness:.53});
 const rooflight=new T.MeshStandardMaterial({color:0xa5c8cc,metalness:.25,roughness:.24,side:T.DoubleSide});
 const pierMat=new T.MeshStandardMaterial({color:0xc6bea9,roughness:.85});
 const girder=new T.MeshStandardMaterial({color:0x685d51,metalness:.37,roughness:.67});
 const glass=new T.MeshStandardMaterial({color:0x99bdba,transparent:true,opacity:.38,depthWrite:false,side:T.DoubleSide,roughness:.3});
 const led=new T.MeshBasicMaterial({color:0xffe7b6});
 function mesh(geometry,mat){const m=new T.Mesh(geometry,mat);m.castShadow=!mat.transparent&&mat!==led;m.receiveShadow=true;parts.add(m);return m;}
 function box(mat,x,y,z,w,h,d){const m=mesh(new T.BoxGeometry(w,h,d),mat);m.position.set(x,y,z);return m;}
 function strut(mat,a,b,r0,r1=r0){
  const dir=b.clone().sub(a),m=mesh(new T.CylinderGeometry(r1,r0,dir.length(),10),mat);
  m.position.copy(a).lerp(b,.5);m.quaternion.setFromUnitVectors(new T.Vector3(0,1,0),dir.normalize());
 }
 const v=(x,y,z)=>new T.Vector3(x,y,z);
 // Closed sections give the edge a deep curved fascia and a narrower, bronze soffit.
 function strip(mat,from,to,section,step=1){
  const n=Math.max(1,Math.ceil((to-from)/step)),verts=[],indices=[];
  for(let i=0;i<=n;i++){const t=from+(to-from)*i/n,ring=section(t);verts.push(...ring.flat());}
  const count=verts.length/(3*(n+1));
  for(let i=0;i<n;i++)for(let j=0;j<count;j++){
   const a=i*count+j,b=i*count+(j+1)%count;indices.push(a,b,a+count,b,b+count,a+count);
  }
  for(let i=1;i<count-1;i++)indices.push(0,i+1,i,n*count,n*count+i,n*count+i+1);
  const geo=new T.BufferGeometry();geo.setAttribute('position',new T.Float32BufferAttribute(verts,3));geo.setIndex(indices);geo.computeVertexNormals();
  mat.side=T.DoubleSide;mesh(geo,mat);
 }
 function band(mat,from,to,edge,width,lower,upper){
  strip(mat,from,to,x=>{const z=edge(x),y=bridgeLevel(x);return [[x,y+upper,z-width/2],[x,y+upper,z+width/2],[x,y+lower,z+width/2],[x,y+lower,z-width/2]];});
 }
 for(const side of [-1,1]){
  const outer=side>0?southEdge:northEdge,inner=spine;
  strip(coat,westEnd,eastEnd,x=>{const z=outer(x),y=bridgeLevel(x);return [[x,y,inner(x)],[x,y,z],[x,y-.34,z],[x,y-1.02,z-side*.95],[x,y-.76,inner(x)]];});
  // Independent paving normals keep the broad deck level under the low evening sun.
  const top=[],uv=[],idx=[];
  for(let i=0;i<=144;i++){
   const x=westEnd+(eastEnd-westEnd)*i/144;
   for(const z of [inner(x),outer(x)]){top.push(x,bridgeLevel(x)+.018,z);uv.push(x/5,z/5);}
   if(i){const a=i*2-2;if(side>0)idx.push(a,a+1,a+2,a+1,a+3,a+2);else idx.push(a,a+2,a+1,a+1,a+2,a+3);}
  }
  const surface=new T.BufferGeometry();surface.setAttribute('position',new T.Float32BufferAttribute(top,3));surface.setAttribute('uv',new T.Float32BufferAttribute(uv,2));surface.setIndex(idx);surface.computeVertexNormals();mesh(surface,floorFinish);
  band(copper,westEnd,eastEnd,outer,.09,-.34,-.16);
  band(led,westEnd,eastEnd,outer,.065,-.16,-.105);
  const gaps=side<0?[]:[...stairs.map(f=>[f.x-f.width/2,f.x+f.width/2]),...lifts.map(({x})=>[x-1.25,x+1.25])].sort((a,b)=>a[0]-b[0]);
  let cursor=westEnd;const runs=[];
  for(const [a,b] of gaps){if(a>cursor)runs.push([cursor,a,outer]);cursor=b;}
  runs.push([cursor,eastEnd,outer]);
  for(const [a,b,rim] of runs){
   band(glass,a,b,rim,.075,.12,1.25);band(copper,a,b,rim,.14,1.23,1.33);band(coat,a,b,rim,.25,0,.18);
   for(let x=a+.6;x<b;x+=2.8)box(dark,x,bridgeLevel(x)+.68,rim(x),.06,1.22,.075);
  }
 }
 // A sealed rooflight follows the crown between the two standing-seam metal wings.
 parts=roof;
 const fractions=[-1,-.62,-.16,.16,.62,1];
 function roofPoint(x,u){
  const z=spine(x)+u*roofRadius(x);
  return v(x,deckRoofY(x,u),z);
 }
 for(let j=1;j<fractions.length;j++){
  const lo=fractions[j-1],hi=fractions[j];
  strip(lo===-.16?rooflight:zinc,roofStart,roofEnd,x=>{
   const a=roofPoint(x,lo),b=roofPoint(x,hi);
   return [[x,a.y,a.z],[x,b.y,b.z],[x,b.y-.18,b.z],[x,a.y-.18,a.z]];
  },.55);
 }
 for(const u of [-1,1]){
  strip(copper,roofStart,roofEnd,x=>{const p=roofPoint(x,u);return [[x,p.y+.035,p.z-.065],[x,p.y+.035,p.z+.065],[x,p.y-.23,p.z+.065],[x,p.y-.23,p.z-.065]];},.55);
 }
 for(let x=roofStart+.8;x<roofEnd;x+=2.75){
  const rib=fractions.map(u=>roofPoint(x,u).add(v(0,.026,0)));
  for(let i=1;i<rib.length;i++)strut(copper,rib[i-1],rib[i],.032);
 }
 // Portal frames sit beside the balustrades. Leave the mouths of each stair and lift clear.
 for(const x of [-114,-101,-93,-85,-77,-60,-49,-40,-31,-19]){
  const left=northEdge(x)+.18,right=southEdge(x)-.18;
  for(const z of [left,right]){
   const u=(z-spine(x))/roofRadius(x),head=v(x,deckRoofY(x,u)-.19,z);
   strut(dark,v(x,bridgeLevel(x),z),head,.105);
   strut(dark,head,roofPoint(x,0).add(v(0,-.22,0)),.095);
  }
 }
 parts=group;
 // Paired, splayed stair flights and three intermediate landings lead towards the SGMTS stops.
 for(const f of stairs){
  parts=group;
  const edges=[f.x-f.width/2,f.x+f.width/2],zp=(x,t)=>f.foot+(southEdge(x)-f.foot)*t;
  for(let i=0;i<slots;i++){
   const t0=i/slots,t1=(i+1)/slots;
   strip(paving,t0,t1,t=>{const [a,b]=edges,y=stairY(f,f.x,(t0+t1)/2);return [[a,y,zp(a,t)],[b,y,zp(b,t)],[b,y-.22,zp(b,t)],[a,y-.22,zp(a,t)]];},1);
  }
  // The straight last tread meets a curved deck edge. A fitted landing closes the crescent between them.
  strip(paving,edges[0],edges[1],x=>{
   const t=(x-edges[0])/f.width,lip=southEdge(edges[0])*(1-t)+southEdge(edges[1])*t+.17;
   const end=Math.min(lip-.2,southEdge(x)-.25),y=bridgeLevel(x)+.008;
   return [[x,y,lip],[x,y,end],[x,y-.2,end],[x,y-.2,lip]];
  },.25);
  for(const x of edges){
   const h=t=>stairY(f,x,t);
   strip(coat,0,1,t=>{const z=zp(x,t),y=h(t);return [[x-.20,y+.18,z],[x+.20,y+.18,z],[x+.14,y-.75,z],[x-.14,y-.75,z]];},1/slots);
   for(let i=0;i<flights;i++){
    const first=i*(stepsPerFlight+4)/slots,last=(i*(stepsPerFlight+4)+stepsPerFlight)/slots;
    const spans=[[first,last],...(i<flights-1?[[last,last+4/slots]]:[])];
    for(const [a,b] of spans){
     strut(copper,v(x,h(a)+1.13,zp(x,a)),v(x,h(b)+1.13,zp(x,b)),.067);
     strip(glass,a,b,t=>{const z=zp(x,t),y=h(a)+(h(b)-h(a))*(t-a)/(b-a);return [[x-.035,y+1.09,z],[x+.035,y+1.09,z],[x+.035,y+.16,z],[x-.035,y+.16,z]];},1);
    }
   }
  }
  parts=roof;
  const roofHalf=f.width/2+stairEave;
  const stairZ=(x,t)=>f.foot+1.1+(southEdge(x)-.8-f.foot-1.1)*t;
  for(const side of [-1,1]){
   strip(zinc,0,1,t=>{
    const x=f.x+side*roofHalf,z=stairZ(x,t),zc=stairZ(f.x,t),y=stairRoofY(f,x,z),yc=stairRoofY(f,f.x,zc);
    return [[f.x,yc,zc],[x,y,z],[x,y-.16,z],[f.x,yc-.16,zc]];
   },1/48);
   for(const t of [.035,.29,.55,.80]){
    const x=f.x+side*f.width/2,z=zp(x,t);
    strut(dark,v(x,stairY(f,x,t),z),v(x,stairRoofY(f,x,z)-.14,z),.095);
   }
  }
  for(let i=0;i<=16;i++){
   const t=i/16,z0=stairZ(f.x,t),centre=v(f.x,stairRoofY(f,f.x,z0)+.02,z0);
   for(const side of [-1,1]){const x=f.x+side*roofHalf,z=stairZ(x,t);strut(copper,centre,v(x,stairRoofY(f,x,z)+.02,z),.026);}
  }
  parts=structure;
  for(const t of [.32,.61,.88]){
   const z=zp(f.x,t),bottom=(galleryY(f.x,z)??pavingY(f.x,z))-datum,top=stairY(f,f.x,t)-.30;
   strut(pierMat,v(f.x,bottom-.45,z),v(f.x,top,z),.48,.41);
   box(girder,f.x,top,z,f.width-.45,.34,.65);

  }
 }
 parts=group;
 // Four through-car lifts have level turning aprons and independently operated landing doors.
 const mechanisms=new Map();
 const bronze=new T.MeshStandardMaterial({color:0xac885b,metalness:.35,roughness:.55});
 const signs=new Map();
 function marker(level){
  if(signs.has(level))return signs.get(level);
  const canvas=document.createElement('canvas');canvas.width=384;canvas.height=128;
  const ctx=canvas.getContext('2d');ctx.fillStyle='#17443f';ctx.fillRect(0,0,384,128);
  ctx.fillStyle='#fffbee';ctx.font='bold 60px sans-serif';ctx.fillText('↕',12,79);ctx.font='bold 38px sans-serif';ctx.fillText('升降機  LIFT',70,57);
  ctx.font='26px sans-serif';ctx.fillText(level==='G'?'G   地面  STREET':'1   天橋  BRIDGE',70,101);
  const texture=new T.CanvasTexture(canvas);texture.colorSpace=T.SRGBColorSpace;
  const mat=new T.MeshBasicMaterial({map:texture});signs.set(level,mat);return mat;
 }
 for(const lift of lifts){
  const {x,z}=lift,base=lift.base-datum,h=lift.deck-datum,crown=h+3.25;
  const sill=z-1.4;
  // Fit the landing to the curved bridge rim across its full width.
  strip(coat,x-1.4,x+1.4,xx=>{
   const start=southEdge(xx)-.18;
   return [[xx,h,start],[xx,h,sill+.12],[xx,h-.32,sill+.12],[xx,h-.32,start]];
  },.2);
  // The two sides can have very different lengths where the bridge curves.
  for(const side of [-1,1]){
   const xx=x+side*1.25,start=southEdge(xx)-.04,end=sill+.04;
   const length=end-start,mid=(start+end)/2;
   box(coat,xx,h+.09,mid,.18,.18,length);
   box(glass,xx,h+.68,mid,.075,1.14,length);
   box(copper,xx,h+1.28,mid,.14,.10,length);
   for(const zz of [start+.045,end-.045])box(dark,xx,h+.68,zz,.07,1.22,.075);
  }
  box(paving,x,base-.08,z+2.77,3.9,.16,2.96);
  for(const dx of [-1.38,1.38]){
   for(const dz of [-1.4,1.4])box(coat,x+dx,(base+crown)/2,z+dz,.18,crown-base,.18);
   box(glass,x+dx,(base+crown)/2,z,.08,crown-base,2.75);
   for(let y=base+2.6;y<crown;y+=2.6)box(copper,x+dx,y,z,.14,.09,2.8);
  }
  const floor=box(dark,x,base-.08,z,2.58,.16,2.62);floor.name='Lift cabin floor · '+lift.name;
  const movingDoors={};
  for(const [stop,dir,y] of [['street',1,base],['bridge',-1,h]]){
   const face=z+dir*1.42;
   // The glazed spandrels stop at the door header or sill.
   const lower=stop==='street'?base+2.38:base,upper=stop==='street'?crown:h;
   box(glass,x,(upper+lower)/2,face,2.64,upper-lower,.08);
   for(const dx of [-1.12,1.12])box(coat,x+dx,y+1.14,face,.46,2.28,.16);
   box(coat,x,y+2.31,face,2.72,.14,.22);
   const leaves=[];
   for(const side of [-1,1]){
    const door=box(dark,x+side*.45,y+1.13,face,.89,2.26,.07);
    door.name='Lift door · '+lift.name+' · '+stop;leaves.push(door);
   }
   movingDoors[stop]=leaves;
   const sign=mesh(new T.PlaneGeometry(1.91,.64),marker(stop==='street'?'G':'1'));sign.position.set(x,y+2.70,face+dir*.15);sign.rotation.y=dir===1?0:Math.PI;
   box(dark,x+1.12,y+1.03,face+dir*.12,.25,.36,.08);box(led,x+1.12,y+1.04,face+dir*.17,.13,.13,.03);
   for(let i=-5;i<=5;i++)box(bronze,x+i*.17,y+.011,face+dir*.56,.082,.022,.42);
  }
  box(coat,x,crown,z,3.08,.3,3.14);box(copper,x,crown+.19,z,3.18,.09,3.24);
  // The projecting hoods cover both the upper link and the street turning apron.
  parts=roof;
  const upperNorth=Math.min(southEdge(x-1.65),southEdge(x+1.65))-.6;
  box(zinc,x,h+3.13,(upperNorth+z)/2,3.35,.17,z-upperNorth);
  box(zinc,x,base+3.2,z+2.49,4.21,.19,4.05);
  for(const dx of [-1.33,1.33])strut(copper,v(x+dx,base+2.52,z+1.44),v(x+dx,base+3.09,z+3.52),.055);
  parts=group;
  mechanisms.set(lift,{floor,movingDoors});
 }
 // Continuous box girders span the SGMTS carriageway and cycle track between the two abutment piers.
 parts=structure;
 const girderLine=(x,side)=>spine(x)+side*halfSpan(x)*.64;
 for(const side of [-1,1]){
  strip(girder,westEnd,eastEnd,x=>{
   const z=girderLine(x,side),y=bridgeLevel(x)-.4,depth=girderDepth(x);
   return [[x,y,z-.43],[x,y,z+.43],[x,y-depth,z+.29],[x,y-depth,z-.29]];
  });
 }
 for(const x of pierStations){
  const z=spine(x),ground=(galleryY(x,z)??pavingY(x,z))-datum;
  const bearingY=bridgeLevel(x)-.4-girderDepth(x),head=bearingY-.52;
  box(pierMat,x,ground+.14,z,2.05,.48,2.65);
  box(pierMat,x,(ground+head)/2,z,1.45,head-ground,1.65);
  for(const side of [-1,1]){
   const end=girderLine(x,side);
   strut(pierMat,v(x,head-2.4,z),v(x,head,end),.59,.48);
   box(dark,x,bearingY-.11,end,1.1,.24,.86);
  }
  box(pierMat,x,bearingY-.37,z,1.18,.52,1.28*halfSpan(x)+1.0);
 }
 parts=group;
 for(const x of [-111,-92,-75,-62,-48,-33,-21])light(group,x,bridgeLevel(x)+.92,northEdge(x)+.6);
 mergeByMaterial(roof);mergeByMaterial(structure);
 mergeByMaterial(group,{stop:/^A2 bridge /,skip:m=>m.name.startsWith('Lift ')});
 const setNight=on=>{
  coat.emissive.setHex(on?0xffe4be:0);coat.emissiveIntensity=on?.18:0;
  copper.emissive.setHex(on?0xffcf96:0);copper.emissiveIntensity=on?.16:0;
  dark.emissive.setHex(on?0x8ba2c0:0);dark.emissiveIntensity=on?.16:0;
  paving.emissive.setHex(on?0xffe5bf:0);paving.emissiveIntensity=on?.22:0;
  floorFinish.emissiveMap=floorFinish.map;floorFinish.emissive.setHex(on?0xffe6c2:0);floorFinish.emissiveIntensity=on?.24:0;
  zinc.emissive.setHex(on?0xb8cbe0:0);zinc.emissiveIntensity=on?.14:0;
  rooflight.emissive.setHex(on?0xffdfad:0);rooflight.emissiveIntensity=on?.34:0;
  pierMat.emissive.setHex(on?0xc7d4e6:0);pierMat.emissiveIntensity=on?.15:0;
  girder.emissive.setHex(on?0x9fb0c4:0);girder.emissiveIntensity=on?.16:0;
  glass.emissive.setHex(on?0xffe1b5:0);glass.emissiveIntensity=on?.22:0;
  bronze.emissive.setHex(on?0xffd39c:0);bronze.emissiveIntensity=on?.18:0;
  led.color.setHex(0xffe7b6);if(on)led.color.multiplyScalar(1.85);
 };
 group.userData.setNight=setNight;
 function poseLift(lift,worldY,streetOpen=0,bridgeOpen=0){
  const {floor,movingDoors}=mechanisms.get(lift);floor.position.y=worldY-datum-.08;floor.updateMatrix();
  for(const [stop,amount] of [['street',streetOpen],['bridge',bridgeOpen]]){
   movingDoors[stop].forEach((door,i)=>{door.position.x=lift.x+(i*2-1)*(.45+amount*.94);door.updateMatrix();});
  }
 }
 poseLift.setNight=setNight;
 return poseLift;
}
