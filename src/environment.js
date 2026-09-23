import {windMaterial} from './street-models.js';
import {TessellateModifier} from 'three/addons/modifiers/TessellateModifier.js';
import {mergeGeometries} from 'three/addons/utils/BufferGeometryUtils.js';
import {terminalCurve,depotCurve,l35BendCurve,l35Mouth,l35D6} from './routes.js';
import * as T from 'three';
import {LENGTH,STOPS,sample,LOOP,roadSection,fromChainage,project,PATH,BRIDGES,CROSSINGS,footpathHeight,cycleOffset,CYCLE_WIDTH,CHANNELS,JUNCTIONS,UNDERPASSES,L35,l35Offset,DEPOT,RAILWAY,railSample,cycleCrossing,cycleHeight,sideCrossing,D1ROAD,laneOffset,curveRadius,returnOffset,CROSSOVER_START,END_STOP,CYCLE_BRIDGES,CYCLE_RAMP,cycleBridgeAt,cycleBridgeHeight,cycleSample} from './alignment.js';
export {JUNCTIONS,UNDERPASSES} from './alignment.js';
const inJunction=s=>JUNCTIONS.some(j=>Math.abs(s-j.s)<j.halfWidth+6);
const inDepot=s=>Math.abs(s-DEPOT.s)<DEPOT.opening/2;
const groundCrossing=s=>inJunction(s)||UNDERPASSES.some(j=>Math.abs(j.s-s)<j.halfWidth+.5);
// Any fence line (corridor or L35) opens 6 m either side of a pedestrian crossing.
export const crossingGap=(start,end)=>CROSSINGS.some(c=>start<c.s+6&&end>c.s-6);
// Corridor lines stop at the outer edge of each junction's corridor crossings; the yellow box replaces them inside.
const inBox=s=>JUNCTIONS.some(j=>Math.abs(s-j.s)<j.halfWidth+11.5);
const arcPts=(cx,cz,r,a0,a1,n=8)=>Array.from({length:n+1},(_,i)=>{const a=a0+(a1-a0)*i/n;return [cx+r*Math.cos(a),cz+r*Math.sin(a)];});
// Yellow box junction (junction-local x across the corridor, z=-along): the carriageway inside the pedestrian crossings, kerb to kerb
// with R6 corner returns (and D6's L35 arm), filled with a 45-degree lattice at 2.2 m spacing clipped to the polygon.
export function junctionBox(j){const r=sample(j.s),w=roadSection(j.s).right,h=j.halfWidth,R=6,zc=h+8.5,X=[sideCrossing(j,-1)-1.5,sideCrossing(j,1)-1.5],local=(s,lat)=>{const q=sample(s),x=q.x+q.lx*lat-r.x,z=q.z+q.lz*lat-r.z;return [-(x*r.lx+z*r.lz),-(x*r.tx+z*r.tz)];};
 let quad=arcPts(w+R,-h-R,R,Math.PI/2,Math.PI);
 if(j.c===2650){const left=z=>local(j.s-z,-l35Offset(j.s-z)+L35.width/2),right=z=>local(j.s-z,-l35Offset(j.s-z)-L35.width/2),lo=L35.offset-L35.width/2,inner=Math.sqrt((R-3.75)**2-(w+R-lo)**2);quad=[...arcPts(l35D6.kerb+l35D6.R,-h-l35D6.R,l35D6.R,Math.PI/2,Math.PI),right(-zc),left(-zc),left(-h-R),left(-h-R+inner),[lo,-h-R+inner],[lo,-h-R+Math.sqrt(R*R-(w+R-lo)**2)],...quad.filter(p=>p[0]<lo)];}
 const poly=[[-w,zc],[w,zc],...arcPts(w+R,h+R,R,Math.PI,Math.PI*1.5),[X[1],h],[X[1],-h],...quad,[w,-zc],[-w,-zc],...arcPts(-w-R,-h-R,R,0,Math.PI/2),[-X[0],-h],[-X[0],h],...arcPts(-w-R,h+R,R,-Math.PI/2,0)];
 const lattice=[],step=2.2*Math.SQRT2;for(const sign of [-1,1]){const ks=poly.map(([x,z])=>z-sign*x);for(let k=Math.ceil(Math.min(...ks)/step)*step+.37;k<Math.max(...ks);k+=step){const xs=[];poly.forEach((a,i)=>{const b=poly[(i+1)%poly.length],fa=a[1]-sign*a[0]-k,fb=b[1]-sign*b[0]-k;if((fa>0)!==(fb>0))xs.push(a[0]+(b[0]-a[0])*fa/(fa-fb));});xs.sort((a,b)=>a-b);for(let i=0;i+1<xs.length;i+=2)lattice.push([[xs[i],sign*xs[i]+k],[xs[i+1],sign*xs[i+1]+k]]);}}
 return {poly,lattice};}
// Test the whole panel, including the junction zebras beyond the corner returns.
export function fenceAllowed(start,end,side){
 const overlaps=(centre,half)=>start<centre+half&&end>centre-half;
 return !sample(start).elevated&&!sample(end).elevated&&!groundCrossing(start)&&!groundCrossing(end)
  &&!crossingGap(start,end)
  &&!JUNCTIONS.some(j=>[-1,1].some(d=>overlaps(j.s+d*(j.halfWidth+10),6)))
  &&!stationFenceSpans.some(p=>p.side===side&&start<p.end&&end>p.start)
  &&!(side===1&&overlaps(DEPOT.s,22));
}
export function stationAccess(st,platform,dir){
 const r=sample(st.s),along=platform.centerOffset+dir*44.8,angle=0;
 const transform=new T.Matrix4().makeRotationFromEuler(new T.Euler(angle,r.heading,0,'YXZ')).setPosition(r.x,r.y,r.z);
 const bend=st.id==='A1'?Math.max(0,-dir*44.8-25)*.42:0;
 const a=[7.05,7.05+st.width].map(x=>new T.Vector3(-platform.side*(x+bend),sample(st.s+along).y-r.y+.30,-along).applyMatrix4(transform));
 let end,b;
 for(let length=10;length<=80;length+=2){
  end=st.s+along+dir*length;const q=sample(end);
  b=[roadSection(end).right,roadSection(end).right+3.75].map(x=>new T.Vector3(q.x+q.lx*platform.side*x,q.groundY+footpathHeight(end)+.003,q.z+q.lz*platform.side*x));
  if(Math.abs(a[0].y-b[0].y)/a[0].distanceTo(b[0])<=1/15)break;
 }

 return {a,b,end};
}
const stationFenceSpans=STOPS.flatMap(st=>st.platforms.map(p=>({side:p.side,start:stationAccess(st,p,-1).end,end:stationAccess(st,p,1).end})));
// Static neutral-white LED pools; preserve the pavement colour beneath them.
export function pavementLight(v,lamps){
 let glow=0;
 for(const l of lamps){
  const height=l.y-v.y;if(height<.1||height>15)continue;
  const dx=v.x-l.x,dz=v.z-l.z;if(Math.abs(dx)>55||Math.abs(dz)>55)continue;const r=l.axis||sample(l.s),along=dx*r.tx+dz*r.tz,across=dx*r.lx+dz*r.lz;
  const radius=l.kind==='cycle'?8:Math.max(9,Math.min(18,height*1.5)),width=l.kind==='cycle'?4:Math.max(5,height*.9);
  glow=Math.max(glow,Math.exp(-(along*along/(radius*radius)+across*across/(width*width)))*.9);
 }
 return glow;
}
export function channelDepth(x,z){return Math.max(0,...CHANNELS.map(c=>{const r=sample(c.s),dx=x-r.x,dz=z-r.z;return Math.abs(dx*r.lx+dz*r.lz)<c.extent?3.8*Math.max(0,Math.min(1,(c.width/2+3-Math.abs(dx*r.tx+dz*r.tz))/3)):0;}));}
const cycleLine=Array.from({length:Math.ceil(LENGTH/3)+1},(_,i)=>cycleSample(Math.min(i*3,LENGTH)));
export function cycleClearance(x,z){let nearest=Infinity;for(let i=1;i<cycleLine.length;i++){const a=cycleLine[i-1],b=cycleLine[i],dx=b.x-a.x,dz=b.z-a.z,t=Math.max(0,Math.min(1,((x-a.x)*dx+(z-a.z)*dz)/(dx*dx+dz*dz||1)));nearest=Math.min(nearest,Math.hypot(x-a.x-t*dx,z-a.z-t*dz));}return nearest;}
// Scenery must clear every nearby bend and crossing road, not just its placement sample.
export function sceneryClear(x,z,radius){
 const ps=project(x,z),r=sample(ps),lat=(x-r.x)*r.lx+(z-r.z)*r.lz;if((r.c>680&&r.c<980&&lat< -12+radius&&lat> -145-radius)||Math.abs(ps-DEPOT.s)<DEPOT.length/2+radius&&lat>10-radius&&lat<DEPOT.lateral+DEPOT.width/2+radius||ps>=L35.start-30&&ps<=L35.end+40&&lat<0&&lat> -35-radius||channelDepth(x,z)>0)return false;
 if(RAILWAY.distance(x,z)<9+radius||cycleClearance(x,z)<CYCLE_WIDTH/2+radius+1.5)return false;
 for(const j of CYCLE_BRIDGES){const c=sample(j.s),dx=x-c.x,dz=z-c.z,along=dx*c.tx+dz*c.tz,lat=dx*c.lx+dz*c.lz;if(Math.abs(along)<j.halfWidth+35+radius&&Math.abs(lat-(cycleOffset(j.s)-6))<12+radius)return false;}
 const dp=sample(DEPOT.s),dl=(x-dp.x)*dp.lx+(z-dp.z)*dp.lz,ds=(x-dp.x)*dp.tx+(z-dp.z)*dp.tz;if(dl>10-radius&&dl<170+radius&&Math.abs(ds)<85+radius)return false;
 if(D1ROAD.some(p=>Math.hypot(x-p.x,z-p.z)<14+radius))return false;
 if(Math.hypot(x-r.x,z-r.z)<roadSection(ps).right+3.75+radius)return false;
 return [...JUNCTIONS,...UNDERPASSES].every(j=>{const p=sample(j.s),dx=x-p.x,dz=z-p.z;return Math.abs(dx*p.tx+dz*p.tz)>j.halfWidth+5+radius||Math.abs(dx*p.lx+dz*p.lz)>j.extent+radius;});
}
const V=new T.Vector3(), Q=new T.Quaternion(), S=new T.Vector3(), M=new T.Matrix4();
let seed=9173;const rnd=()=>{seed=(1664525*seed+1013904223)>>>0;return seed/4294967296;};
export function paintTexture(kind){
 const c=document.createElement('canvas');c.width=c.height=512;const x=c.getContext('2d');
 if(kind.startsWith('leaf')){
  x.clearRect(0,0,512,512);
  for(let i=0;i<220;i++){let px=256+(rnd()-.5)*430,py=256+(rnd()-.5)*420; if(Math.hypot((px-256)/230,(py-256)/235)>1)continue;const blossom=kind==='leaf-flowering'&&rnd()<.32;x.fillStyle=blossom?`hsl(${312+rnd()*25} 48% ${55+rnd()*18}%)`:kind==='leaf-golden'?`hsl(${38+rnd()*22} 56% ${35+rnd()*22}%)`:`hsl(${88+rnd()*32} 25% ${19+rnd()*24}%)`;x.beginPath();x.ellipse(px,py,10+rnd()*16,5+rnd()*11,rnd()*6.28,0,6.28);x.fill();}
 }else{
  const base={road:[75,79,77],walk:[151,91,79],grass:[85,102,60],wall:[191,187,169]}[kind]||[160,160,150];
  const d=x.createImageData(512,512);for(let i=0;i<d.data.length;i+=4){const n=(rnd()-.5)*(kind==='grass'?48:22);d.data[i]=base[0]+n;d.data[i+1]=base[1]+n;d.data[i+2]=base[2]+n;d.data[i+3]=255;}x.putImageData(d,0,0);
  if(kind.startsWith('walk')){
   const colors=kind==='walk-grey'?['#969b98','#797f7d','#a7aaa1','#686f6c']:kind==='walk-buff'?['#b5a98c','#c1b69d','#9c947d','#837f71']:['#a67863','#985c4b','#b38e73','#7d7770'];
   x.fillStyle='#565a53';x.fillRect(0,0,512,512);
   const flag=kind!=='walk',tileHeight=flag?64:32;
   for(let row=0;row<512/tileHeight;row++)for(let col=-1;col<8;col++){
    const xx=col*64+(flag?0:(row%2)*32),yy=row*tileHeight;x.fillStyle=colors[Math.floor(rnd()*colors.length)];x.fillRect(xx+1,yy+1,62,tileHeight-2);if(kind==='walk-buff'){x.fillStyle='#686c5e';if((row+col)%2)x.fillRect(xx+31,yy+1,2,62);else x.fillRect(xx+1,yy+31,62,2);}
    x.fillStyle='rgba(230,220,197,.16)';x.fillRect(xx+2,yy+2,60,1);
   }
   // Dark stone bands and patched pavers break up the brick fields.
   for(const y of [0,256]){x.fillStyle='#656d68';x.fillRect(0,y,512,12);x.fillStyle='#b4b19e';x.fillRect(0,y+12,512,5);}
   for(let i=0;i<1800;i++){x.fillStyle=i%3?'rgba(36,42,33,.12)':'rgba(215,207,181,.16)';x.fillRect(rnd()*512,rnd()*512,1+rnd()*5,1+rnd()*3);}
   for(let i=0;i<16;i++){const px=rnd()*512,py=rnd()*512;x.strokeStyle='rgba(35,44,36,.24)';x.lineWidth=.7;x.beginPath();x.moveTo(px,py);x.lineTo(px+8,py+4);x.lineTo(px+17,py+2);x.stroke();}
  }
  if(kind==='wall'){x.strokeStyle='#9d9a8e';x.lineWidth=3;for(let y=0;y<512;y+=128){x.beginPath();x.moveTo(0,y);x.lineTo(512,y);x.stroke();}}
 }
 const t=new T.CanvasTexture(c);t.colorSpace=T.SRGBColorSpace;t.wrapS=t.wrapT=T.RepeatWrapping;t.anisotropy=8;return t;
}
export function ribbon(start,end,left,right,yOffset=0,terrain=false,cut=false,sampler=sample){
 if(end<=start)return new T.BufferGeometry().setAttribute('position',new T.Float32BufferAttribute([],3));
 const p=[],uv=[],idx=[];let n=Math.ceil((end-start)/2);
 for(let i=0;i<=n;i++){let s=start+(end-start)*i/n,r=sampler(s),y=(terrain?r.groundY:r.y)+(typeof yOffset==='function'?yOffset(s):yOffset);
  for(const edge of [left,right]){const lat=typeof edge==='function'?edge(s):edge;p.push(r.x+r.lx*lat,y,r.z+r.lz*lat);uv.push(lat/5,s/5);}
 }
 // Drop a whole quad if either triangle folds or either edge runs backwards.
 const up=(a,b,c)=>(p[b*3+2]-p[a*3+2])*(p[c*3]-p[a*3])-(p[b*3]-p[a*3])*(p[c*3+2]-p[a*3+2]);
 for(let i=0;i<n;i++){const j=i*2,a=sample(start+(end-start)*i/n),b=sample(start+(end-start)*(i+1)/n),forward=k=>(p[(k+2)*3]-p[k*3])*(b.x-a.x)+(p[(k+2)*3+2]-p[k*3+2])*(b.z-a.z);if(!(cut&&(typeof cut==='function'?cut:inJunction)(start+(end-start)*(i+.5)/n))&&up(j,j+2,j+1)>1e-8&&up(j+1,j+2,j+3)>1e-8&&forward(j)>0&&forward(j+1)>0)idx.push(j,j+2,j+1,j+1,j+2,j+3);}
 let g=new T.BufferGeometry();g.setAttribute('position',new T.Float32BufferAttribute(p,3));g.setAttribute('uv',new T.Float32BufferAttribute(uv,2));g.setIndex(idx);g.computeVertexNormals();return g;
}
function terrainLevel(x,z,s){for(const j of [...JUNCTIONS,...UNDERPASSES]){const r=sample(j.s),dx=x-r.x,dz=z-r.z;if(Math.abs(dx*r.lx+dz*r.lz)<j.extent+1&&Math.abs(dx*r.tx+dz*r.tz)<j.halfWidth+4)return j.underpass?r.groundY:r.y;}const d=sample(DEPOT.s),lat=(x-d.x)*d.lx+(z-d.z)*d.lz,along=(x-d.x)*d.tx+(z-d.z)*d.tz;if(lat>24&&lat<166&&Math.abs(along)<81||lat>0&&lat<55&&Math.abs(along)<16)return d.y;return sample(s).groundY;}
// Fixed world grid prevents the folded wide-offset ribbons that left terrain holes.
export function terrainPatch(start,end){
 const pts=PATH.filter(p=>p.s>=Math.max(0,start-5)&&p.s<=end+5),step=8,p=[],uv=[],idx=[];
 const minX=Math.floor((Math.min(...pts.map(p=>p.x))-100)/step)*step,maxX=Math.max(...pts.map(p=>p.x))+100,minZ=Math.floor((Math.min(...pts.map(p=>p.z))-100)/step)*step,maxZ=Math.max(...pts.map(p=>p.z))+100;
 const nx=Math.ceil((maxX-minX)/step)+1,nz=Math.ceil((maxZ-minZ)/step)+1,inside=[];
 for(let z=0;z<nz;z++)for(let x=0;x<nx;x++){const wx=minX+x*step,wz=minZ+z*step,s=project(wx,wz),r=sample(s);p.push(wx,terrainLevel(wx,wz,s)-.24-channelDepth(wx,wz),wz);uv.push(wx/5,wz/5);inside.push(Math.hypot(wx-r.x,wz-r.z)<=100&&s>=start-10&&s<=end+10);}
 for(let z=0;z<nz-1;z++)for(let x=0;x<nx-1;x++){const a=z*nx+x,b=a+1,c=a+nx,d=c+1;if([a,b,c,d].every(i=>inside[i]))idx.push(a,c,b,b,c,d);}
 const g=new T.BufferGeometry();g.setAttribute('position',new T.Float32BufferAttribute(p,3));g.setAttribute('uv',new T.Float32BufferAttribute(uv,2));g.setIndex(idx);g.computeVertexNormals();return g;
}
// Continuous separate path at ground level, eased around the corridor bends.
export function cycleRibbon(start,end,left=-2,right=2,height=0){return ribbon(start,end,left,right,s=>cycleBridgeHeight(s)+height,true,cycleCrossing,cycleSample);}
export function cycleGeometry(){return cycleRibbon(0,LENGTH);}
// Sweep a closed structural cross-section along the same centreline as the road.
export function structureGeometry(start,end,section,sampler=sample){const positions=[],indices=[],n=Math.ceil((end-start)/2),count=section.length;
 for(let i=0;i<=n;i++){const s=start+(end-start)*i/n,r=sampler(s);for(const [x,y] of section)positions.push(r.x+r.lx*(typeof x==='function'?x(s):x),r.y+(typeof y==='function'?y(s):y),r.z+r.lz*(typeof x==='function'?x(s):x));}
 for(let i=0;i<n;i++)for(let j=0;j<count;j++){const a=i*count+j,b=i*count+(j+1)%count;indices.push(a,b,a+count,b,b+count,a+count);}
 for(const i of [0,n])for(let j=1;j<count-1;j++)indices.push(i*count,i*count+j,i*count+j+1);
 const g=new T.BufferGeometry();g.setAttribute('position',new T.Float32BufferAttribute(positions,3));g.setIndex(indices);g.computeVertexNormals();return g;
}
export function buildEnvironment(scene,streetKit){
 const backdrop=new T.Mesh(new T.PlaneGeometry(14000,14000),new T.MeshStandardMaterial({color:0x657647,roughness:1}));backdrop.rotation.x=-Math.PI/2;backdrop.position.y=-5;scene.add(backdrop);
 const roadTex=paintTexture('road'),paverTex=paintTexture('walk'),greyPaver=paintTexture('walk-grey'),buffPaver=paintTexture('walk-buff'),pavers=[paverTex,greyPaver,buffPaver];
 const mats={road:new T.MeshStandardMaterial({map:roadTex,roughness:.91}),walk:new T.MeshStandardMaterial({map:paverTex,roughness:.96}),grass:new T.MeshStandardMaterial({map:paintTexture('grass'),roughness:1}),concrete:new T.MeshStandardMaterial({color:0xc6c2ac,roughness:.9,side:T.DoubleSide}),lamp:new T.MeshStandardMaterial({color:0xfff1dc,emissive:0xfff1dc,emissiveIntensity:0}),galvanised:new T.MeshStandardMaterial({color:0xa3adae,metalness:.55,roughness:.58}),yellow:new T.MeshStandardMaterial({color:0xffcf22,roughness:.8}),white:new T.MeshStandardMaterial({color:0xece8d3,roughness:.8}),teal:new T.MeshStandardMaterial({color:0x47776b,roughness:.85}),metal:new T.MeshStandardMaterial({color:0x465654,metalness:.65,roughness:.4})};
 mats.walkGrey=new T.MeshStandardMaterial({map:greyPaver,roughness:.97});mats.walkBuff=new T.MeshStandardMaterial({map:buffPaver,roughness:.96});
 const groups=[],instances={},plots=[],trees=[],lampPositions=[],plantings=[],windTime={value:0},plantMeshes=[];
 const geo={box:new T.BoxGeometry(1,1,1),cyl:new T.CylinderGeometry(1,1,1,7),leaf:new T.PlaneGeometry(1,1),cone:new T.ConeGeometry(1,1,8)};
 const foliage=new T.MeshStandardMaterial({map:paintTexture('leaf'),alphaTest:.38,side:T.DoubleSide,roughness:1,color:0xe2e5b5});
 const treeKinds=[{name:'broadleaf',color:0xbac99a,spread:1,rise:1},{name:'upright',color:0x89ab83,spread:.58,rise:1.55},{name:'golden',color:0xd8ba62,spread:1.2,rise:.8},{name:'flowering',color:0xe6a6c1,spread:.9,rise:1.05}].map(k=>({...k,material:foliage.clone()}));treeKinds.forEach(k=>{k.material.map=paintTexture('leaf-'+k.name);k.material.color.setHex(k.name==='golden'||k.name==='flowering'?0xffffff:k.color);});
 const trunk=new T.MeshStandardMaterial({color:0x665b43,roughness:1});
 const windowMats=[];
 function batch(key,geometry,material,pos,scale,rot=new T.Euler(),chunk=0){
  const k=key+'-'+chunk;if(!instances[k])instances[k]={geometry,material,matrices:[],chunk};
  Q.setFromEuler(rot);M.compose(pos,Q,scale);instances[k].matrices.push(M.clone());
 }
 function box(key,mat,x,y,z,w,h,d,heading=0,chunk=0){batch(key,geo.box,mat,new T.Vector3(x,y,z),new T.Vector3(w,h,d),new T.Euler(0,heading,0),chunk);}
 function at(s,lat){const r=sample(s);return new T.Vector3(r.x+r.lx*lat,r.groundY,r.z+r.lz*lat);}
 for(let start=0;start<LENGTH;start+=240){let end=Math.min(start+240,LENGTH),ch=Math.floor(start/240),group=new T.Group();group.userData.s=(start+end)/2;scene.add(group);groups.push(group);
  const ground=new T.Mesh(terrainPatch(start,end),mats.grass);ground.receiveShadow=true;group.add(ground);
  for(const [left,right,offset,mat,terrain] of [[s=>roadSection(s).left,s=>roadSection(s).right,0,mats.road,false],[s=>roadSection(s).left-3.75,s=>roadSection(s).left,footpathHeight,mats.walk,true],[s=>roadSection(s).right,s=>roadSection(s).right+3.75,footpathHeight,mats.walk,true]]){
   const paving=[mats.walk,mats.walkGrey,mats.walkBuff][(ch+(left(start)>0?1:0))%3];const mesh=new T.Mesh(ribbon(start,end,left,right,offset,terrain,mat===mats.walk?(s=>groundCrossing(s)||left(DEPOT.s)>0&&inDepot(s)):false),mat===mats.walk?paving:mat);mesh.receiveShadow=true;group.add(mesh);
  }
  for(const edge of [s=>roadSection(s).left,s=>roadSection(s).right]){const line=new T.Mesh(ribbon(start,end,s=>edge(s)-.05,s=>edge(s)+.05,.025,false,inBox),mats.white);group.add(line);}
  for(const lat of [-.14,.14]){const line=new T.Mesh(ribbon(Math.max(35,start),Math.min(end,CROSSOVER_START-75),lat-.055,lat+.055,.028,false,q=>inBox(q)||groundCrossing(q)||inDepot(q)),mats.white);if(start<CROSSOVER_START-75)group.add(line);}
  for(let q=Math.max(start,DEPOT.s-15);q<Math.min(end,DEPOT.s+15);q+=5)group.add(new T.Mesh(ribbon(q,Math.min(q+2,end),-.055,.055,.03),mats.white));
  for(let s=Math.max(start,CROSSOVER_START-75);s<end;s+=7)group.add(new T.Mesh(ribbon(s,Math.min(s+3,end),-.05,.05,.029),mats.white));
  for(let s=Math.ceil(Math.max(start,35)/1.5)*1.5;s<end;s+=1.5)for(const dir of [-1,1])for(const branch of [0,...(Math.abs(laneOffset(s,dir))>1.91?[1]:[])])for(const track of [-.24,.24]){const offset=q=>branch?dir*1.9:dir===-1?returnOffset(q):laneOffset(q),guide=new T.Mesh(ribbon(s,Math.min(s+.55,end),q=>offset(q)+track-.085,q=>offset(q)+track+.085,.105,false,false),mats.white);guide.name='ART guidance marks';group.add(guide);}
  const marks=group.children.filter(m=>m.name==='ART guidance marks'),positions=[],indices=[];for(const m of marks){const offset=positions.length/3;positions.push(...m.geometry.attributes.position.array);indices.push(...Array.from(m.geometry.index.array,i=>i+offset));m.geometry.dispose();group.remove(m);}const guideGeo=new T.BufferGeometry();guideGeo.setAttribute('position',new T.Float32BufferAttribute(positions,3));guideGeo.setIndex(indices);guideGeo.computeVertexNormals();const guides=new T.Mesh(guideGeo,mats.white);guides.name='ART guidance marks';group.add(guides);
  for(let s=start;s<end;s+=2){const e=Math.min(s+2,end),r=sample((s+e)/2),a=sample(s),b=sample(e);
   for(const side of [-1,1]){if(inJunction(s)||side===1&&inDepot(s))continue;const la=side*(roadSection(s).right+(r.elevated?.21:0)),lb=side*(roadSection(e).right+(r.elevated?.21:0)),ax=a.x+a.lx*la,az=a.z+a.lz*la,bx=b.x+b.lx*lb,bz=b.z+b.lz*lb,len=Math.hypot(bx-ax,bz-az)+.03,heading=Math.atan2(ax-bx,az-bz),x=(ax+bx)/2,z=(az+bz)/2,y=(a.y+b.y)/2;
    if(r.elevated){if(Math.floor(s/2)%3===0){box('parapet-light-housing',mats.metal,x-r.lx*side*.24,y+.56,z-r.lz*side*.24,.09,.19,1.35,heading,ch);box('parapet-light',mats.lamp,x-r.lx*side*.3,y+.56,z-r.lz*side*.3,.035,.11,1.15,heading,ch);}if(Math.floor(s)%12<2)lampPositions.push({s,x:x-r.lx*side*1.8,y:y+.6,z:z-r.lz*side*1.8});const swept=(name,mat,width,bottom,top)=>{const l=q=>side*(roadSection(q).right+.21),m=new T.Mesh(structureGeometry(s,e,[[q=>l(q)-width/2,bottom],[q=>l(q)+width/2,bottom],[q=>l(q)+width/2,top],[q=>l(q)-width/2,top]]),mat);m.name=name;group.add(m);};swept('parapet',mats.concrete,.42,0,.8);for(const h of [1.02,1.3])swept('parapet-rail',mats.metal,.06,h-.03,h+.03);box('parapet-post',mats.metal,x,y+1.03,z,.07,.55,.07,heading,ch);
     if(r.structure==='ramp'){const h=Math.max(.2,y-r.groundY);swept('retained-ramp',mats.concrete,.55,q=>sample(q).groundY-sample(q).y,0);}
    }else{const h=footpathHeight((s+e)/2);const l=q=>side*roadSection(q).right,m=new T.Mesh(structureGeometry(s,e,[[q=>l(q)-.075,0],[q=>l(q)+.075,0],[q=>l(q)+.075,footpathHeight],[q=>l(q)-.075,footpathHeight]]),mats.concrete);m.name='continuous-kerb';group.add(m);}
   }
  }
  for(const name of ['parapet','parapet-rail','retained-ramp','continuous-kerb']){const list=group.children.filter(m=>m.name===name);if(list.length){const mesh=new T.Mesh(mergeGeometries(list.map(m=>m.geometry)),list[0].material);mesh.name=name;mesh.castShadow=true;mesh.receiveShadow=true;for(const m of list){group.remove(m);m.geometry.dispose();}group.add(mesh);}}
  for(let s=start+5;s<end;s+=11){const r=sample(s);if([...JUNCTIONS,...UNDERPASSES].some(j=>Math.abs(j.s-s)<j.halfWidth+12))continue;for(let side of [-1,1]){
   const stationNearby=STOPS.some(st=>Math.abs(st.s-s)<60);
   let lat=side*((side===-1?29:stationNearby?27:25)+rnd()*9),p=at(s,lat),h=5+rnd()*5;if(!sceneryClear(p.x,p.z,3))continue;
   const kind=treeKinds[Math.floor(rnd()*treeKinds.length)];trees.push({x:p.x,z:p.z,y:p.y,s,kind:kind.name});
   batch('trunk',geo.cyl,trunk,new T.Vector3(p.x,p.y+h*.4,p.z),new T.Vector3(.16+kind.spread*.05,h*.8,.16+kind.spread*.05),new T.Euler(),ch);
   for(let j=0;j<16;j++){let a=rnd()*6.28,rad=rnd()*2.9*kind.spread,pos=new T.Vector3(p.x+Math.cos(a)*rad,p.y+h-1+rnd()*3*kind.rise,p.z+Math.sin(a)*rad);batch('foliage-'+kind.name,geo.leaf,kind.material,pos,new T.Vector3((4+rnd()*2)*kind.spread,(3.5+rnd()*2)*kind.rise,1),new T.Euler((rnd()-.5)*1.6,a,0),ch);}
  }}
  for(let s=start+15;s<end;s+=52){if([...JUNCTIONS,...UNDERPASSES].some(j=>Math.abs(j.s-s)<j.halfWidth+25))continue;for(let side of [-1,1]){
    const r=sample(s),lat=side*(48+rnd()*40),p=at(s,lat),zone=r.c<650?'residential':r.c<1250?'logistics':r.c<1900?'tech':r.c<2550?'village':r.c<3200?'boulevard':'construction',h=zone==='village'?6+rnd()*4:zone==='logistics'?8+rnd()*5:zone==='tech'?16+rnd()*18:18+rnd()*66,w=15+rnd()*15,d=16+rnd()*16,k=Math.floor(rnd()*4),radius=Math.hypot(w,d)/2+2;
    if(!sceneryClear(p.x,p.z,radius)||plots.some(q=>Math.hypot(q.x-p.x,q.z-p.z)<q.radius+radius+3))continue;plots.push({x:p.x,z:p.z,radius,zone});
    if(zone==='construction'){
     for(let y=0;y<h;y+=3.2){box('construction-slab',mats.concrete,p.x,p.y+y,p.z,w,.3,d,r.heading,ch);for(const x of [-w/2+1,w/2-1])for(const z of [-d/2+1,d/2-1]){const u=new T.Vector3(x,y+1.6,z).applyAxisAngle(new T.Vector3(0,1,0),r.heading).add(p);box('construction-column',mats.concrete,u.x,u.y,u.z,.6,3.2,.6,r.heading,ch);}}
     box('crane-mast',mats.teal,p.x,p.y+(h+10)/2,p.z,.8,h+10,.8,0,ch);box('crane-jib',mats.teal,p.x,p.y+h+9,p.z,w+10,.65,.8,r.heading,ch);box('crane-counterweight',mats.concrete,p.x,p.y+h+8,p.z,2,2,2,0,ch);
     continue;
    }
    const model=streetKit.getObjectByName('building_'+(zone==='boulevard'?'residential':zone));
    const [bw,bh,bd]=model.userData.dimensions;model.updateMatrixWorld(true);
    model.traverse(part=>{if(!part.isMesh)return;const geometry=part.userData.worldGeometry||(part.userData.worldGeometry=part.geometry.clone().applyMatrix4(part.matrixWorld));
     batch(part.name,geometry,part.material,p,new T.Vector3(w/bw,h/bh,d/bd),new T.Euler(0,r.heading,0),ch);
     if(part.material.name==='window_lit'&&!windowMats.includes(part.material))windowMats.push(part.material);
    });
  }}
 }
 function utilityPole(s,lat,height,kind,side=1,twin=false){const r=sample(s),p=at(s,lat),ch=Math.floor(s/240),arm=twin?1.35:1.1;const column=mats.galvanised;
  box(kind+'-column',column,p.x,p.y+height/2,p.z,.16,height,.16,0,ch);
  for(const d of twin?[-1,1]:[side]){const x=p.x-r.lx*d*arm,z=p.z-r.lz*d*arm;box(kind+'-bracket',column,p.x-r.lx*d*arm/2,p.y+height-.15,p.z-r.lz*d*arm/2,arm,.08,.08,r.heading,ch);box(kind+'-LED',mats.lamp,x,p.y+height-.2,z,.42,.09,.9,r.heading,ch);lampPositions.push({s,x,y:p.y+height-.2,z,kind,height});}
 }
 for(let s=20;s<LENGTH;){const r=sample(s),near=[...JUNCTIONS,...CROSSINGS].some(j=>Math.abs(j.s-s)<55),bend=curveRadius(s)<180,wide=roadSection(s).right>5.5;
  if(!r.elevated&&!inJunction(s)&&!STOPS.some(st=>Math.abs(st.s-s)<st.footprintLength/2+6))for(const side of wide||near?[-1,1]:[1])if(!(side===1&&inDepot(s)))utilityPole(s,side*(roadSection(s).right+3.95),near&&wide?12:10,'road',side);
  s+=near||bend?27:35;
 }
 for(let s=12;s<LENGTH;s+=23){if(cycleBridgeAt(s))continue;utilityPole(s,cycleOffset(s)+2.3,5,'cycle',1,true);}
 for(const st of STOPS)for(const ds of [-30,0,30])for(const lat of [-9,9]){const p=at(st.s+ds,lat);lampPositions.push({s:st.s+ds,x:p.x,y:sample(st.s+ds).y+3.4,z:p.z});}
 const cycle=new T.Mesh(cycleGeometry(),new T.MeshStandardMaterial({color:0x286e58,roughness:.92,side:T.DoubleSide}));cycle.name='continuous-green-cycleway';cycle.receiveShadow=true;scene.add(cycle);
 for(const side of [-1,1]){const line=new T.Mesh(cycleRibbon(0,LENGTH,side*1.86-.045,side*1.86+.045,.018),mats.white);scene.add(line);}
 for(const st of STOPS)for(const platform of st.platforms)for(const dir of [-1,1]){
  if(st.id==='A1'&&dir===-1)continue;
  const {a,b}=stationAccess(st,platform,dir),g=new T.BufferGeometry();
  g.setAttribute('position',new T.Float32BufferAttribute([...a[0].toArray(),...a[1].toArray(),...b[0].toArray(),...b[1].toArray()],3));
  g.setAttribute('uv',new T.Float32BufferAttribute([0,0,st.width/5,0,0,2,.75,2],2));
  g.setIndex(platform.side*dir===1?[0,2,1,1,2,3]:[0,1,2,1,3,2]);g.computeVertexNormals();
  const mesh=new T.Mesh(g,mats.walk);mesh.name='Smooth station footpath connection';scene.add(mesh);
 }

 // White lane divider, direction arrows, cycle symbols and amber approach bands (user photo).
 for(let s=0;s<LENGTH-3;s+=6){if(cycleCrossing(s)||cycleCrossing(s+2))continue;const line=new T.Mesh(cycleRibbon(s,s+2,-.045,.045,.018),mats.white);scene.add(line);}
 const label=document.createElement('canvas');label.width=128;label.height=256;const ctx=label.getContext('2d');ctx.strokeStyle='white';ctx.lineWidth=5;for(const x of [35,93]){ctx.beginPath();ctx.arc(x,172,23,0,Math.PI*2);ctx.stroke();}ctx.beginPath();ctx.moveTo(35,172);ctx.lineTo(51,133);ctx.lineTo(76,172);ctx.closePath();ctx.moveTo(51,133);ctx.lineTo(82,133);ctx.lineTo(93,172);ctx.moveTo(82,133);ctx.lineTo(88,117);ctx.stroke();ctx.fillStyle='white';ctx.font='65px sans-serif';ctx.fillText('↑',37,83);const signTex=new T.CanvasTexture(label),signMat=new T.MeshBasicMaterial({map:signTex,transparent:true,depthWrite:false});
 for(let s=25;s<LENGTH-5;s+=70){if(cycleCrossing(s))continue;const r=cycleSample(s);for(const dir of [-1,1]){const mark=new T.Mesh(new T.PlaneGeometry(1.2,2.7),signMat);mark.rotation.set(-Math.PI/2,0,-r.heading+(dir===1?Math.PI:0));const lat=dir*.9;mark.position.set(r.x+r.lx*lat,r.groundY+cycleBridgeHeight(s)+.022,r.z+r.lz*lat);scene.add(mark);}}
 const blueSign=document.createElement('canvas');blueSign.width=blueSign.height=128;const bx=blueSign.getContext('2d');bx.fillStyle='#1763a0';bx.beginPath();bx.arc(64,64,61,0,Math.PI*2);bx.fill();bx.strokeStyle='white';bx.lineWidth=4;bx.stroke();bx.drawImage(label,0,105,128,110,5,44,63,55);bx.strokeStyle='white';bx.lineWidth=4;bx.beginPath();bx.moveTo(71,25);bx.lineTo(71,104);bx.moveTo(96,52);bx.lineTo(96,78);bx.moveTo(82,64);bx.lineTo(110,64);bx.moveTo(96,78);bx.lineTo(85,99);bx.moveTo(96,78);bx.lineTo(107,99);bx.stroke();bx.fillStyle='white';bx.beginPath();bx.arc(96,39,7,0,Math.PI*2);bx.fill();const blueMat=new T.MeshBasicMaterial({map:new T.CanvasTexture(blueSign),transparent:true,side:T.DoubleSide});
 for(const j of JUNCTIONS.filter(j=>!CYCLE_BRIDGES.includes(j)))for(const end of [-1,1]){const s=j.s+end*(j.halfWidth+9),r=sample(s),lat=cycleOffset(s),band=new T.Mesh(ribbon(s-1.4,s+1.4,q=>cycleOffset(q)-2,q=>cycleOffset(q)+2,q=>cycleHeight(q)+.018,true),new T.MeshStandardMaterial({color:0xbba24f}));scene.add(band);const p=at(s,lat-2.4),ch=Math.floor(s/240);box('cycle-sign-post',mats.metal,p.x,p.y+1.4,p.z,.07,2.8,.07,0,ch);const sign=new T.Mesh(new T.PlaneGeometry(.65,.65),blueMat);sign.position.set(p.x,p.y+2.5,p.z);sign.rotation.y=r.heading;scene.add(sign);}
 // Visible game boundary: stopping bay and barrier, not an invented extra station.
 const terminal=sample(LENGTH-3),endGroup=new T.Group();endGroup.name='northern-route-end';endGroup.position.set(terminal.x,terminal.y,terminal.z);endGroup.rotation.y=terminal.heading;scene.add(endGroup);
 const boardCanvas=document.createElement('canvas');boardCanvas.width=1024;boardCanvas.height=256;const bc=boardCanvas.getContext('2d');bc.fillStyle='#173d35';bc.fillRect(0,0,1024,256);bc.fillStyle='#fff3cd';bc.textAlign='center';bc.font='bold 62px sans-serif';bc.fillText('END OF LINE · 路線終點',512,110);bc.font='36px sans-serif';bc.fillText('Stop here · 請停車',512,185);const board=new T.Mesh(new T.PlaneGeometry(7,1.75),new T.MeshBasicMaterial({map:new T.CanvasTexture(boardCanvas),side:T.DoubleSide}));board.position.set(0,3,0);endGroup.add(board);
 for(const x of [-3.4,3.4]){const post=new T.Mesh(new T.BoxGeometry(.15,3.8,.15),mats.metal);post.position.set(x,1.9,0);endGroup.add(post);}for(let x=-3.5;x<3.5;x+=.7){const bar=new T.Mesh(new T.BoxGeometry(.7,.45,.35),new T.MeshStandardMaterial({color:Math.round((x+3.5)/.7)%2?0xf0c55b:0x283a37}));bar.position.set(x+.35,.8,0);endGroup.add(bar);}
 // Merged marking strips, flat kerb-return fills and corner footpaths in a junction group's local frame; y follows the road grade.
 const strips=(segs,width,y,mat,grade=0)=>{const p=[],idx=[];for(const [a,b] of segs){const dx=b[0]-a[0],dz=b[1]-a[1],n=Math.hypot(dx,dz)||1,nx=-dz/n*width/2,nz=dx/n*width/2,k=p.length/3;for(const [x,z] of [[a[0]+nx,a[1]+nz],[a[0]-nx,a[1]-nz],[b[0]+nx,b[1]+nz],[b[0]-nx,b[1]-nz]])p.push(x,y-grade*z,z);idx.push(k,k+2,k+1,k+1,k+2,k+3);}const geo=new T.BufferGeometry();geo.setAttribute('position',new T.Float32BufferAttribute(p,3));geo.setIndex(idx);geo.computeVertexNormals();const m=new T.Mesh(geo,mat);m.receiveShadow=true;return m;};
 const flat=(pts,y,mat,grade=0)=>{const geo=new T.ShapeGeometry(new T.Shape(pts.map(([x,z])=>new T.Vector2(x,-z))));geo.rotateX(-Math.PI/2);const p=geo.attributes.position;for(let i=0;i<p.count;i++)p.setY(i,(typeof y==='function'?y(p.getZ(i)):y)-grade*p.getZ(i));geo.setAttribute('uv',new T.Float32BufferAttribute(Array.from({length:p.count},(_,i)=>[p.getX(i)/5,p.getZ(i)/5]).flat(),2));geo.computeVertexNormals();const m=new T.Mesh(geo,mat);m.receiveShadow=true;return m;};
 const cornerMat=new T.MeshStandardMaterial({map:paverTex,side:T.DoubleSide,roughness:.96}),annulus=(cx,cz,r0,r1,a0,a1,y,grade=0)=>{const pos=[],ids=[];for(let i=0;i<=12;i++)for(const rad of [r1,r0]){const a=a0+(a1-a0)*i/12,x=cx+rad*Math.cos(a),z=cz+rad*Math.sin(a);pos.push(x,y-grade*z,z);}for(let i=0;i<12;i++){const k=i*2;ids.push(k,k+2,k+1,k+1,k+2,k+3);}const geo=new T.BufferGeometry();geo.setAttribute('position',new T.Float32BufferAttribute(pos,3));geo.setIndex(ids);geo.setAttribute('uv',new T.Float32BufferAttribute(pos.flatMap((v,i)=>i%3===0?[v/5,pos[i+2]/5]:[]),2));geo.computeVertexNormals();const m=new T.Mesh(geo,cornerMat);m.name='connected-corner-footpath';return m;};
 const beaconMat=new T.MeshStandardMaterial({color:0xe7c752}),dashes=(x0,x1,z,dash,gap)=>{const out=[];for(let x=x0;x<x1-.01;x+=dash+gap)out.push([[x,z],[Math.min(x+dash,x1),z]]);return out;};
 // Continuous corner footpaths join the corridor and crossing-road approaches.
 for(const j of [...JUNCTIONS,...UNDERPASSES]){const r=sample(j.s),g=new T.Group(),w=roadSection(j.s).right,h=j.halfWidth,R=6;g.name=(j.underpass?'underpass-':'junction-')+j.c;g.position.set(r.x,j.underpass?r.groundY:r.y,r.z);g.rotation.y=r.heading;scene.add(g);
  const slab=(width,depth,x,z,mat,y=.045)=>{const m=new T.Mesh(new T.BoxGeometry(width,.05,depth,Math.max(1,Math.ceil(width/6)),1,Math.max(1,Math.ceil(depth/6))),mat);m.position.set(x,y-.025,z);if(!j.underpass){const p=m.geometry.attributes.position;for(let i=0;i<p.count;i++)p.setY(i,p.getY(i)-r.grade*(p.getZ(i)+z));m.geometry.computeVertexNormals();}m.receiveShadow=true;g.add(m);return m;};
  slab(j.extent*2,h*2,0,0,mats.road);
  for(const side of [-1,1]){if(!(j.c===3395&&side===1))slab(j.extent*2,3.75,0,side*(h+1.875),mats.walk,.3);for(let x=-j.extent;x<j.extent;x+=7){if(j.underpass?j.c===3395&&Math.abs(Math.abs(x)-30)<3.2:Math.abs(x)<sideCrossing(j,Math.sign(x)||1)+4.5)continue;for(const lane of j.underpass?[-h/2,0,h/2]:[0])slab(3,.09,x,lane,mats.white,.079);}}
  // D3 priority T: R6 kerb returns at the L35 mouth, a 25 m tapered merge downstream, give-way markings and zebras clear of the mouth.
  if(j.c===3395){const M=l35Mouth,dk=M.x-M.half,uk=M.x+M.half,t0=dk-M.R,t1=t0-M.taperLength,zt=h+M.taper,zeb=[-30,30],clear=segs=>segs.flatMap(([a,b])=>{let out=[[a,b]];for(const x of zeb)out=out.flatMap(([p,q])=>{const lo=Math.min(p[0],q[0]),hi=Math.max(p[0],q[0]);return hi<x-1.7||lo>x+1.7?[[p,q]]:[...(lo<x-1.7?[[[lo,p[1]],[x-1.7,p[1]]]]:[]),...(hi>x+1.7?[[[x+1.7,p[1]],[hi,p[1]]]]:[])];});return out;});
   g.add(flat([[dk,h],...arcPts(t0,zt+M.R,M.R,0,-Math.PI/2),[t1,h]],.07,mats.road),flat([[uk,h],...arcPts(uk+M.R,h+M.R,M.R,-Math.PI/2,-Math.PI)],.07,mats.road),flat([[t0,zt],[t1,h],[t1,h+3.75],[t0,zt+3.75]],.3,mats.walk),annulus(uk+M.R,h+M.R,M.R-3.75,M.R,-Math.PI/2,-Math.PI,.3),annulus(t0,zt+M.R,M.R-3.75,M.R,0,-Math.PI/2,.3));
   slab(j.extent-uk-M.R,3.75,(j.extent+uk+M.R)/2,h+1.875,mats.walk,.3);slab(j.extent+t1,3.75,(t1-j.extent)/2,h+1.875,mats.walk,.3);
   const tri=[[M.x-1.8-.75,zt+M.R+2],[M.x-1.8+.75,zt+M.R+2],[M.x-1.8,zt+M.R+7]];
   g.add(strips([...clear([[[-j.extent,-h+.25],[j.extent,-h+.25]],[[-j.extent,h-.25],[t1,h-.25]],[[uk+M.R,h-.25],[j.extent,h-.25]]]),[[t0,zt-.25],[t1,h-.25]],...dashes(t1,uk+M.R,h-.25,1,1),...[.35,.75].flatMap(dz=>dashes(t0+Math.sqrt(M.R*M.R-(M.R-dz)**2)+.1,M.x,zt+dz,.6,.3)),...tri.map((p,i)=>[p,tri[(i+1)%3]])],.15,.11,mats.white));
   g.add(strips(zeb.flatMap(x=>Array.from({length:Math.ceil((2*h-.4)/1.1)},(_,i)=>[[x-1.5,-h+.4+i*1.1],[x+1.5,-h+.4+i*1.1]])),.55,.085,mats.white));
   for(const x of zeb)for(const side of [-1,1]){slab(2.9,.6,x,side*(h+.65),beaconMat,.31);const post=new T.Mesh(new T.CylinderGeometry(.06,.06,2.6,8),mats.metal),globe=new T.Mesh(new T.SphereGeometry(.2,12,8),new T.MeshStandardMaterial({color:0xffa31a,emissive:0xff8800,emissiveIntensity:.8}));post.position.set(x+2.1,1.6,side*(h+.7));globe.position.set(x+2.1,3,side*(h+.7));globe.name='zebra-beacon';g.add(post,globe);}}

  if(!j.underpass){
   const box=junctionBox(j);g.add(strips(box.poly.map((p,i)=>[p,box.poly[(i+1)%box.poly.length]]),.2,.1,mats.yellow,r.grade),strips(box.lattice,.12,.1,mats.yellow,r.grade));
   // Remove the two continuous sidewalk slabs just created and rebuild with four corner returns.
   for(const child of [...g.children])if(child.material===mats.walk){g.remove(child);child.geometry.dispose();}
   for(const side of [-1,1])for(const bank of [-1,1])for(const [a,b] of [[w+R,sideCrossing(j,side)-1.5],[sideCrossing(j,side)+1.5,j.extent]])slab(b-a,3.75,side*(a+b)/2,bank*(h+1.875),mats.walk,.3);
   const shape=new T.Shape();shape.moveTo(-w,h+R);shape.lineTo(w,h+R);shape.lineTo(w,h+R);shape.absarc(w+R,h+R,R,Math.PI,Math.PI*1.5,false);shape.lineTo(w+R,-h);shape.absarc(w+R,-h-R,R,Math.PI/2,Math.PI,false);shape.lineTo(-w,-h-R);shape.absarc(-w-R,-h-R,R,0,Math.PI/2,false);shape.lineTo(-w-R,h);shape.absarc(-w-R,h+R,R,-Math.PI/2,0,false);shape.closePath();const roadGeo=new T.ShapeGeometry(shape,16);roadGeo.rotateX(-Math.PI/2);for(let i=0,p=roadGeo.attributes.position;i<p.count;i++)p.setY(i,.07-r.grade*p.getZ(i));const road=new T.Mesh(roadGeo,mats.road);g.add(road);
   for(const sx of [-1,1])for(const sz of [-1,1]){const pos=[],ids=[];for(let i=0;i<=16;i++)for(const rad of [R,R-3.75]){const a=i*Math.PI/32,x=sx*(w+R-rad*Math.cos(a)),z=sz*(h+R-rad*Math.sin(a));pos.push(x,.3-r.grade*z,z);}for(let i=0;i<16;i++){const a=i*2;ids.push(a,a+2,a+1,a+1,a+2,a+3);}const geo=new T.BufferGeometry();geo.setAttribute('position',new T.Float32BufferAttribute(pos,3));geo.setIndex(ids);geo.setAttribute('uv',new T.Float32BufferAttribute(pos.flatMap((v,i)=>i%3===0?[v/5,pos[i+2]/5]:[]),2));geo.computeVertexNormals();const m=new T.Mesh(geo,new T.MeshStandardMaterial({map:paverTex,side:T.DoubleSide,roughness:.96}));m.name='connected-corner-footpath';g.add(m);}
   for(const side of [-1,1]){slab(w-.15,.25,-side*w/2,side*j.stop,mats.white,.09);slab(.25,h-.15,side*(sideCrossing(j,side)+3),side*h/2,mats.white,.09);
    const bars=[];for(let x=-w+.275;x<=w-.20;x+=1.1)bars.push([[x,side*(h+10)-1.5],[x,side*(h+10)+1.5]]);
    for(let z=-h+.275;z<=h-.20;z+=1.1)bars.push([[side*sideCrossing(j,side)-1.5,z],[side*sideCrossing(j,side)+1.5,z]]);
    const zebra=strips(bars,.55,.125,mats.yellow,r.grade);zebra.name='Full-width yellow crossings';g.add(zebra);
    // Crossing-road kerb ramps replace the flat sidewalk within a 3 m wheelchair route.
    for(const bank of [-1,1]){const x=side*sideCrossing(j,side),z=bank*(h+1.875),ramp=new T.Mesh(new T.PlaneGeometry(3,3.75),mats.walk);ramp.geometry.rotateX(-Math.PI/2);const p=ramp.geometry.attributes.position;for(let i=0;i<p.count;i++){const zz=p.getZ(i)+z;p.setY(i,.02+.28*Math.min(1,(Math.abs(zz)-h)/3.75)-r.grade*zz);}ramp.geometry.computeVertexNormals();ramp.position.set(x,.005,z);ramp.name='junction-wheelchair-ramp';g.add(ramp);}
   }
  }
 }
 // Unsignalised station crossings with flush kerbs and 1:20 access ramps.
 for(const crossing of CROSSINGS){const s=crossing.s,r=sample(s),edge=roadSection(s),g=new T.Group();g.name='unsignalised-crossing-'+crossing.station+'-'+Math.round(s);scene.add(g);
  for(let lat=edge.left+.35;lat<edge.right-.2;lat+=1.1){const m=new T.Mesh(ribbon(s-1.5,s+1.5,lat,Math.min(lat+.55,edge.right),.025),mats.white);g.add(m);}
  for(const side of [-1,1]){const mark=new T.Mesh(ribbon(s-1.45,s+1.45,side>0?edge.right+.35:edge.left-.95,side>0?edge.right+.95:edge.left-.35,.025),new T.MeshStandardMaterial({color:0xe7c752}));g.add(mark);}
 }
 // BW-3301/3302: box-girder silhouette and flared 2.5 x 2.0 m pier shafts.
 for(const b of BRIDGES){const ds=fromChainage(b.deckStart),de=fromChainage(b.deckEnd),w=4.76,d=b.depth,soffit=s=>-d-(b.depth>2?.75*Math.max(0,1-Math.min(...b.piers.map(c=>Math.abs(fromChainage(c)-s)))/9):0);
  const deck=new T.Mesh(structureGeometry(ds,de,[[-w,-.08],[w,-.08],[w,-.38],[2.65,-.55],[1.8,soffit],[-1.8,soffit],[-2.65,-.55],[-w,-.38]]),mats.concrete);deck.name=b.id+'-box-girder';deck.castShadow=true;deck.receiveShadow=true;scene.add(deck);
  for(const c of b.piers){const s=fromChainage(c),r=sample(s),h=r.y-r.groundY+soffit(s)-.2,ch=Math.floor(s/240);if(h<=0)continue;
   box(b.id+'-pier',mats.concrete,r.x,r.groundY+h/2,r.z,2.5,h,2,r.heading,ch);
   const geo=new T.BufferGeometry(),v=[];for(const [y,width,depth] of [[r.groundY+Math.max(0,h-2.7),2.5,2],[r.groundY+h,4,2.8]])for(const [x,z] of [[-1,-1],[1,-1],[1,1],[-1,1]])v.push(x*width/2,y,z*depth/2);geo.setAttribute('position',new T.Float32BufferAttribute(v,3));geo.setIndex([0,1,5,0,5,4,1,2,6,1,6,5,2,3,7,2,7,6,3,0,4,3,4,7,4,5,6,4,6,7]);geo.computeVertexNormals();const cap=new T.Mesh(geo,mats.concrete);cap.position.set(r.x,0,r.z);cap.rotation.y=r.heading;cap.castShadow=true;cap.name=b.id+'-pier-cap-'+c;scene.add(cap);
   box('bearing',mats.metal,r.x,r.y+soffit(s)-.1,r.z,3.4,.2,2.4,r.heading,ch);
   const pipe=new T.Mesh(new T.CylinderGeometry(.15,.15,h,8),mats.metal);pipe.position.set(r.x+r.lx*1.4,r.groundY+h/2,r.z+r.lz*1.4);scene.add(pipe);
  }
  for(const c of [b.deckStart,...(b.id==='VB3'?[]:[b.deckEnd])]){const s=fromChainage(c),r=sample(s),h=r.y-r.groundY,ch=Math.floor(s/240);box(b.id+'-abutment',mats.concrete,r.x,r.groundY+h/2,r.z,9.52,h,1.3,r.heading,ch);box('expansion-joint',mats.metal,r.x,r.y+.015,r.z,9.1,.035,.18,r.heading,ch);}
 }
 // Water channels are excavated in terrain; the road and cycleway pass over concrete culverts.
 for(const c of CHANNELS){const r=sample(c.s),g=new T.Group();g.name=c.name;g.position.set(r.x,r.y,r.z);g.rotation.y=r.heading;scene.add(g);
  const part=(w,h,d,x,y,z,mat)=>{const m=new T.Mesh(new T.BoxGeometry(w,h,d),mat);m.position.set(x,y,z);m.receiveShadow=true;g.add(m);return m;};
  part(c.extent*2,.08,c.width,0,-3.25,0,new T.MeshStandardMaterial({color:0x4f8587,metalness:.35,roughness:.2}));
  for(const side of [-1,1]){const e=roadSection(c.s),a=e.right+3.75,b=-cycleOffset(c.s)+2.5;part(c.extent-a,3.6,.55,-(c.extent+a)/2,-1.8,side*c.width/2,mats.concrete);part(c.extent-b,3.6,.55,(c.extent+b)/2,-1.8,side*c.width/2,mats.concrete);}
  const edge=roadSection(c.s),left=edge.left-3.75-4,right=edge.right+3.75,w=right-left;
  part(w,.5,c.width+1,-(left+right)/2,-1,0,mats.concrete);
  for(const portal of [-right,-left]){for(let z=-c.width/2;z<=c.width/2;z+=c.width/3)part(.7,3.2,.5,portal,-1.85,z,mats.concrete);part(.75,.6,c.width+1,portal,-1,0,mats.concrete);}
 }
 for(const c of CHANNELS){const start=c.s-c.width/2-3,end=c.s+c.width/2+3;scene.add(new T.Mesh(ribbon(start,end,q=>roadSection(q).left,q=>roadSection(q).right,.012),mats.road));for(const side of [-1,1]){const lat=side===1?roadSection(c.s).right+3.6:cycleOffset(c.s)-2;for(const y of [.55,1.25])scene.add(new T.Mesh(structureGeometry(start,end,[[lat-.035,y-.035],[lat+.035,y-.035],[lat+.035,y+.035],[lat-.035,y+.035]]),mats.metal));for(let q=start;q<end;q+=1.5){const p=at(q,lat);box('river-fence',mats.metal,p.x,p.y+.8,p.z,.06,1.2,.06,0,Math.floor(q/240));}}}
 // L35 begins at D6 beside the dedicated corridor; the 4 m cycleway lies outboard.
 const bendStart=fromChainage(3310),join=sample(L35.end),bend=sample(bendStart),bp=at(bendStart,-l35Offset(bendStart));
 const bendCurve=l35BendCurve;
 for(const [side,mat,y] of [[0,mats.road,.07],[1,mats.walk,footpathHeight],[-1,mats.walk,footpathHeight]]){const w=side?3.75:L35.width,offset=s=>-l35Offset(s)+side*(L35.width/2+1.875),m=new T.Mesh(ribbon(L35.start,bendStart,s=>offset(s)-w/2,s=>offset(s)+w/2,y,true,side?s=>s<L35.start+JUNCTIONS.find(j=>j.name==='Road D6').halfWidth+l35D6.R:false),mat);m.name=side?'L35 footpath':'Road L35';m.receiveShadow=true;scene.add(m);}
 for(const side of [-1,1]){scene.add(new T.Mesh(ribbon(L35.start+JUNCTIONS[1].halfWidth+11.5,bendStart,q=>-l35Offset(q)+side*(L35.width/2-.18)-.06,q=>-l35Offset(q)+side*(L35.width/2-.18)+.06,.105,true),mats.white));scene.add(new T.Mesh(curveRibbon(bendCurve,side*(L35.width/2-.18)-.06,side*(L35.width/2-.18)+.06,.105,0,bendCurve.getLength()-l35Mouth.R-(side>0?l35Mouth.taper:0)),mats.white));}
 for(let s=L35.start+JUNCTIONS[1].halfWidth+14;s<bendStart;s+=7){const m=new T.Mesh(ribbon(s,Math.min(s+3,bendStart),s=>-l35Offset(s)-.05,s=>-l35Offset(s)+.05,.1,true),mats.white);scene.add(m);}
 for(const [offset,width,mat,y] of [[0,L35.width,mats.road,.08],[-5.525,3.75,mats.walk,.3],[5.525,3.75,mats.walk,.3],[0,.12,mats.white,.105]]){const end=bendCurve.getLength()-(mat===mats.walk?l35Mouth.R+(offset>0?l35Mouth.taper:0):mat===mats.white?l35Mouth.taper:0),m=new T.Mesh(curveRibbon(bendCurve,offset-width/2,offset+width/2,y,0,end),mat);m.name='L35 turn beneath VB2';m.receiveShadow=true;scene.add(m);}
 // Open the D6 sidewalk across the connected L35 mouth.
 const d6=scene.getObjectByName('junction-2650');if(d6)for(const child of [...d6.children]){if(!child.isMesh||child.material.map!==paverTex||child.name==='junction-wheelchair-ramp')continue;child.updateMatrix();const original=child.geometry.index?child.geometry.toNonIndexed():child.geometry.clone(),p=original.attributes.position,points=[];for(let i=0;i<p.count;i++)points.push(new T.Vector3().fromBufferAttribute(p,i).applyMatrix4(child.matrix));if(!points.some(p=>p.x>0&&p.z<0))continue;
  const out=[],uv=[],lo=L35.offset-L35.width/2,hi=l35D6.kerb+l35D6.R;
  const clip=(poly,bound,sign)=>{const result=[];for(let i=0;i<poly.length;i++){const a=poly[i],b=poly[(i+1)%poly.length],inside=sign*(a.x-bound)>=0,next=sign*(b.x-bound)>=0;if(inside)result.push(a);if(inside!==next)result.push(a.clone().lerp(b,(bound-a.x)/(b.x-a.x)));}return result;};
  for(let i=0;i<points.length;i+=3){const tri=points.slice(i,i+3),parts=tri.every(p=>p.z<0)?[clip(tri,lo,-1),clip(tri,hi,1)]:[tri];for(const poly of parts)for(let n=1;n<poly.length-1;n++)for(const v of [poly[0],poly[n],poly[n+1]]){out.push(v.x,v.y,v.z);uv.push(v.x/5,v.z/5);}}
  const geometry=new T.BufferGeometry();geometry.setAttribute('position',new T.Float32BufferAttribute(out,3));geometry.setAttribute('uv',new T.Float32BufferAttribute(uv,2));geometry.computeVertexNormals();const replacement=new T.Mesh(geometry,child.material);replacement.name=child.name;d6.remove(child);d6.add(replacement);original.dispose();}
 // L35's outer kerb returns into D6 at R6 (shared with the turning path); signalised yellow crossing and stop line on the L35 arm.
 {const J=JUNCTIONS[1],grade=sample(J.s).grade,{kerb,R}=l35D6,h=J.halfWidth,edge=flat([[kerb,-h],...arcPts(kerb+R,-h-R,R,Math.PI/2,Math.PI)],.07,mats.road,grade),ret=annulus(kerb+R,-h-R,R-3.75,R,Math.PI/2,Math.PI,.3,grade);ret.name='l35-kerb-return';const w=roadSection(J.s).right,lo=L35.offset-L35.width/2,island=flat([[w+3.75,-h-R-.05],[lo,-h-R-.05],[lo,-h-R+2.3],[w+3.75,-h-R+2.3]],.3,mats.walk,grade),apron=flat([[w,-h-R-2.1],[lo,-h-R-2.1],[lo,-h-R],[w,-h-R]],z=>footpathHeight(J.s-z)+.005,mats.walk,grade);island.name=apron.name='l35-corner-island';if(d6)d6.add(edge,ret,island,apron);
  const s=J.s+h+10,mid=-l35Offset(s),bars=[];for(let lat=mid-L35.width/2+.35;lat<mid+L35.width/2-.2;lat+=1.1)bars.push(ribbon(s-1.5,s+1.5,lat,Math.min(lat+.55,mid+L35.width/2),.1,true));const yb=new T.Mesh(mergeGeometries(bars),mats.yellow);yb.name='L35 signalised crossing';scene.add(yb,new T.Mesh(ribbon(s+2.875,s+3.125,mid-L35.width/2+.15,mid,.1,true),mats.white));}
 // Zebras continue the A6 station crossings over L35; paved links cross the verge so the route is unbroken from corridor to cycleway.
 for(const c of CROSSINGS.filter(c=>c.s>L35.start&&c.s<bendStart)){const s=c.s,mid=-l35Offset(s),e=L35.width/2,bars=[];for(let lat=mid-e+.35;lat<mid+e-.2;lat+=1.1)bars.push(ribbon(s-1.5,s+1.5,lat,Math.min(lat+.55,mid+e),.1,true));const zebra=new T.Mesh(mergeGeometries(bars),mats.white);zebra.name='L35 zebra crossing '+c.station;scene.add(zebra);
  for(const [a,b] of [[mid+e+.35,mid+e+.95],[mid-e-.95,mid-e-.35]])scene.add(new T.Mesh(ribbon(s-1.45,s+1.45,a,b,q=>footpathHeight(q)+.01,true),beaconMat));const link=new T.Mesh(ribbon(s-1.5,s+1.5,mid+e+3.75,-(roadSection(s).right+3.75),footpathHeight,true),mats.walk);link.name='L35 crossing verge link';link.receiveShadow=true;scene.add(link);}
 // Broad paved interchange plaza between A2 and the elevated railway station.
 const a2=STOPS[1],plaza=new T.Mesh(ribbon(a2.s-115,a2.s+125,-84,-17,.31,true),mats.walk);plaza.name='Hung Shui Kiu regional plaza';plaza.receiveShadow=true;scene.add(plaza);
 function landmarkBoard(text,p,heading,width=12){const c=document.createElement('canvas');c.width=1024;c.height=160;const x=c.getContext('2d');x.fillStyle='#173d35';x.fillRect(0,0,1024,160);x.fillStyle='#fff3d0';x.textAlign='center';x.font='bold 56px sans-serif';x.fillText(text,512,101);const m=new T.Mesh(new T.PlaneGeometry(width,width/6.4),new T.MeshBasicMaterial({map:new T.CanvasTexture(c),side:T.DoubleSide}));m.position.copy(p);m.rotation.y=heading;scene.add(m);return m;}
 // HSWRL viaduct: continuous box-girder deck, parapets and rails swept every 2 m along the smooth rail curve.
 const railRings=Array.from({length:Math.ceil(RAILWAY.length/2)+1},(_,i)=>RAILWAY.at(i*2)),bar=(c,w,y0,y1)=>[[c+w/2,y1],[c-w/2,y1],[c-w/2,y0],[c+w/2,y0]];
 function railSweep(name,mat,sections){const p=[],idx=[];for(const sec of sections){for(let f=0;f<sec.length;f++){const k=p.length/3;for(const r of railRings)for(const [lat,y] of [sec[f],sec[(f+1)%sec.length]])p.push(r.x+r.lx*lat,r.y+y,r.z+r.lz*lat);for(let i=0;i<railRings.length-1;i++){const j=k+i*2;idx.push(j,j+1,j+2,j+1,j+3,j+2);}}
  for(const [r,start] of [[railRings[0],true],[railRings.at(-1),false]]){const k=p.length/3;for(const [lat,y] of sec)p.push(r.x+r.lx*lat,r.y+y,r.z+r.lz*lat);for(let t of T.ShapeUtils.triangulateShape(sec.map(([x,y])=>new T.Vector2(x,y)),[])){const [a,b,c]=t.map(i=>sec[i]);if(((b[0]-a[0])*(c[1]-a[1])-(b[1]-a[1])*(c[0]-a[0])>0)===start)t=[t[0],t[2],t[1]];idx.push(...t.map(i=>i+k));}}}
  const g=new T.BufferGeometry();g.setAttribute('position',new T.Float32BufferAttribute(p,3));g.setIndex(idx);g.computeVertexNormals();const m=new T.Mesh(g,mat);m.name=name;m.castShadow=m.receiveShadow=true;scene.add(m);}
 railSweep('MTR-viaduct',mats.concrete,[[[5.5,0],[-5.5,0],[-5.5,-.35],[-3.3,-.55],[-2.5,-1.3],[2.5,-1.3],[3.3,-.55],[5.5,-.35]],bar(-5.2,.3,0,1.1),bar(5.2,.3,0,1.1)]);
 railSweep('MTR-rail',mats.metal,[-2.85,-1.42,1.42,2.85].map(c=>bar(c,.075,0,.15)));
 // Piers clear the channels, the corridor carriageway/footpath/cycle track and Road D8; far piers reach the backdrop.
 const d8=sample(UNDERPASSES[0].s);for(let u=12;u<RAILWAY.length;u+=32){const p=RAILWAY.at(u),q=project(p.x,p.z),r=sample(q),lat=(p.x-r.x)*r.lx+(p.z-r.z)*r.lz,ch=Math.floor(q/240),base=Math.hypot(p.x-r.x,p.z-r.z)>99?-5:r.groundY-.3,h=p.y-1.3-base;
  if(channelDepth(p.x,p.z)>0||lat>cycleOffset(q)-4&&lat<roadSection(q).right+6||Math.abs((p.x-d8.x)*d8.tx+(p.z-d8.z)*d8.tz)<UNDERPASSES[0].halfWidth+7)continue;box('MTR-pier',mats.concrete,p.x,base+h/2,p.z,2.4,h,2.4,p.heading,ch);box('MTR-pier-head',mats.concrete,p.x,p.y-1.6,p.z,4.6,.6,3,p.heading,ch);}
 // Night lighting for the railway station and its entrances: merged fixtures, night-only LED lines and additive light spill.
 const nightParts={fixture:[],led:[],glow:[],post:[]},litBox=(list,object,w,h,d,x,y,z,tilt=0)=>{object.updateMatrixWorld();list.push(new T.BoxGeometry(w,h,d).applyMatrix4(new T.Matrix4().makeRotationX(tilt).setPosition(x,y,z)).applyMatrix4(object.matrixWorld));},glowAt=(object,w,d,x,y,z,upright=false)=>{object.updateMatrixWorld();const g=new T.PlaneGeometry(w,d);if(!upright)g.rotateX(-Math.PI/2);nightParts.glow.push(g.translate(x,y,z).applyMatrix4(object.matrixWorld));},lampAt=(object,x,y,z)=>{object.updateMatrixWorld();const p=object.localToWorld(new T.Vector3(x,y,z));lampPositions.push({s:project(p.x,p.z),x:p.x,y:p.y,z:p.z});};
 const rp=railSample(a2.s),rh=rp.heading,stationGroup=new T.Group();stationGroup.name='Hung Shui Kiu Station';stationGroup.position.set(rp.x,sample(a2.s).groundY,rp.z);stationGroup.rotation.y=rh;scene.add(stationGroup);
 const glass=new T.MeshStandardMaterial({color:0x608590,metalness:.35,roughness:.3,transparent:true,opacity:.65}),h=rp.y-stationGroup.position.y;
 for(const [w,hh,d,x,y,z,mat] of [[12.4,2.15,220,-10.3,h+.075,0,mats.concrete],[12.4,2.15,220,10.3,h+.075,0,mats.concrete],[36,.7,224,0,h+7,0,mats.metal],[.3,6,218,-16,h+3,0,glass],[.3,6,218,16,h+3,0,glass],[25,5,42,-22,2.5,0,glass]]){const m=new T.Mesh(new T.BoxGeometry(w,hh,d),mat);m.position.set(x,y,z);m.castShadow=true;stationGroup.add(m);}
 for(let z=-100;z<=100;z+=20)for(const x of [-14,14]){const post=new T.Mesh(new T.BoxGeometry(.8,h+7,.8),mats.concrete);post.position.set(x,(h+7)/2,z);stationGroup.add(post);}
 const sign=landmarkBoard('洪水橋站  HUNG SHUI KIU',new T.Vector3(rp.x,rp.y+4,rp.z),rh-Math.PI/2,27);sign.position.add(new T.Vector3(-18,0,0).applyAxisAngle(new T.Vector3(0,1,0),rh));
 // Side platforms flank the viaduct tracks: soffit strips above both, edge LEDs, lit roof fascia and concourse, backlit name sign.
 for(const x of [-13,-7.5,7.5,13])litBox(nightParts.fixture,stationGroup,.3,.06,212,x,h+6.62,0);for(const x of [-4.2,4.2])litBox(nightParts.led,stationGroup,.1,.02,216,x,h+1.16,0);for(const x of [-18.05,18.05])litBox(nightParts.led,stationGroup,.1,.2,224,x,h+7,0);litBox(nightParts.led,stationGroup,24,.1,41,-22,4.85,0);
 for(let z=-102;z<=102;z+=12)for(const x of [-10.3,10.3])glowAt(stationGroup,11,14,x,h+1.18,z);for(const z of [-14,0,14])lampAt(stationGroup,-22,4.6,z);lampAt(stationGroup,-38,4,0);glowAt(sign,33,6.5,0,0,-.15,true);
 for(const ds of [-80,0,80]){const p=at(a2.s+ds,-42),ch=Math.floor((a2.s+ds)/240);box('plaza-bench',mats.metal,p.x,p.y+.75,p.z,3,.15,.8,sample(a2.s).heading,ch);lampPositions.push({s:a2.s+ds,x:p.x,y:p.y+6,z:p.z});box('plaza-lamp',mats.metal,p.x,p.y+3,p.z,.1,6,.1,0,ch);box('plaza-light',mats.lamp,p.x,p.y+6,p.z,.6,.2,.6,0,ch);}
 // A 30 m access opening leads into the one-storey depot and apron on the left.
 const dr=sample(DEPOT.s),depotGroup=new T.Group();depotGroup.name='SGMTS depot';depotGroup.position.set(dr.x,dr.y,dr.z);depotGroup.rotation.y=dr.heading;scene.add(depotGroup);
 const apron=new T.Mesh(new T.BoxGeometry(DEPOT.width,.12,DEPOT.length),mats.road);apron.position.set(-DEPOT.lateral,.02,0);apron.receiveShadow=true;depotGroup.add(apron);
 const access=new T.Mesh(ribbon(DEPOT.s-15,DEPOT.s+15,s=>roadSection(s).right,55,.04,true),mats.road);access.name='30m depot entrance';scene.add(access);
 for(const [w,h,d,x,y,z,mat] of [[58,8,.5,-123,4,-65,mats.concrete],[58,8,.5,-123,4,65,mats.concrete],[.5,8,130,-152,4,0,mats.concrete],[61,.6,134,-123,8.3,0,mats.metal]]){const m=new T.Mesh(new T.BoxGeometry(w,h,d),mat);m.position.set(x,y,z);m.castShadow=true;depotGroup.add(m);}
 for(let z=-60;z<=60;z+=20){if(Math.abs(z)<12)continue;const pier=new T.Mesh(new T.BoxGeometry(.5,8,.5),mats.concrete);pier.position.set(-94,4,z);depotGroup.add(pier);}for(const lat of [105,130]){const fixture=new T.Mesh(new T.BoxGeometry(1,.1,12),mats.lamp);fixture.position.set(-lat,7.6,0);depotGroup.add(fixture);lampPositions.push({s:DEPOT.s,x:dr.x+dr.lx*lat,y:dr.y+7.6,z:dr.z+dr.lz*lat});}
 for(const along of [-60,60])for(const lat of [30,85]){const p=new T.Vector3(dr.x+dr.lx*lat+dr.tx*along,dr.y,dr.z+dr.lz*lat+dr.tz*along),ch=Math.floor(DEPOT.s/240);box('depot-light-pole',mats.metal,p.x,p.y+4,p.z,.15,8,.15,0,ch);box('depot-light',mats.lamp,p.x,p.y+8,p.z,.8,.15,.8,0,ch);lampPositions.push({s:DEPOT.s,x:p.x,y:p.y+8,z:p.z});}
 const dp=at(DEPOT.s,94);dp.y+=7;landmarkBoard('SGMTS 車廠  DEPOT',dp,dr.heading+Math.PI/2,30);
 // Road D1 connects the at-grade junction after A7 to its northern bridge crossing.
 for(let i=1;i<D1ROAD.length;i++){const a=D1ROAD[i-1],b=D1ROAD[i],n=Math.hypot(b.x-a.x,b.z-a.z),heading=Math.atan2(a.x-b.x,a.z-b.z);for(const [offset,w,mat,y] of [[0,18,mats.road,.025],[-10.875,3.75,mats.walk,.3],[10.875,3.75,mats.walk,.3],...(i%2?[[0,.1,mats.white,.09]]:[])]){const m=new T.Mesh(new T.BoxGeometry(w,.1,n+.3),mat);m.name='Road D1 connecting alignment';m.position.set((a.x+b.x)/2+Math.cos(heading)*offset,(a.y+b.y)/2+y,(a.z+b.z)/2-Math.sin(heading)*offset);m.rotation.set(Math.atan2(b.y-a.y,n),heading,0,'YXZ');m.receiveShadow=true;scene.add(m);}}

 for(const c of CROSSINGS){const l=cycleOffset(c.s),m=new T.Mesh(ribbon(c.s-1.8,c.s+1.8,l-2,l+2,.33,true),mats.yellow);m.name='Cycle pedestrian crossing';scene.add(m);for(const ds of [-4,4]){const p=at(c.s+ds,l+2.5);box('cycle-crossing-sign',mats.teal,p.x,p.y+2,p.z,.45,.6,.08,sample(c.s).heading,Math.floor(c.s/240));box('cycle-sign-pole',mats.metal,p.x,p.y+1,p.z,.06,2,.06,0,Math.floor(c.s/240));}}

 for(const j of [...JUNCTIONS,...UNDERPASSES])for(let lat=-135;lat<=135;lat+=35){if(Math.abs(lat)<30)continue;const r=sample(j.s),p=at(j.s,lat);p.x+=r.tx*(j.halfWidth+4.1);p.z+=r.tz*(j.halfWidth+4.1);const ch=Math.floor(j.s/240);box('side-road-lamp',mats.galvanised,p.x,p.y+6,p.z,.16,12,.16,0,ch);box('side-road-fixture',mats.lamp,p.x,p.y+12,p.z,.5,.12,1,0,ch);lampPositions.push({s:j.s,x:p.x,y:p.y+12,z:p.z,kind:'distributor',height:12});}
 for(let q=L35.start+35;q<L35.end-45;q+=35){const p=at(q,-l35Offset(q)-7.7),ch=Math.floor(q/240);box('L35-lamp',mats.galvanised,p.x,p.y+5,p.z,.16,10,.16,0,ch);box('L35-light',mats.lamp,p.x,p.y+10,p.z,.5,.12,1,0,ch);lampPositions.push({s:q,x:p.x,y:p.y+10,z:p.z,kind:'L35',height:10});}
 for(const j of [JUNCTIONS.find(j=>j.c===2650),UNDERPASSES.find(j=>j.c===3395)]){const p=at(j.s-25,-l35Offset(j.s)-6),ch=Math.floor(j.s/240);box('L35-direction-post',mats.metal,p.x,p.y+1.5,p.z,.12,3,.12,0,ch);p.y+=3;landmarkBoard('L35  →  '+j.name,p,sample(j.s).heading,6);}
 // Covered footbridges, straight lift towers and external stair flights.
 function footbridge(name,centre,heading,length,width=4.5){const g=new T.Group();g.name=name;g.position.copy(centre);g.rotation.y=heading;scene.add(g);const part=(w,h,d,x,y,z,mat)=>{const m=new T.Mesh(new T.BoxGeometry(w,h,d),mat);m.position.set(x,y,z);m.castShadow=m.receiveShadow=true;g.add(m);return m;};
 part(width,.45,length,0,6.15,0,mats.concrete);for(const side of [-1,1]){const pier=part(.9,5.9,1.2,0,2.95,side*(length/2-.6),mats.concrete);pier.name='Cycle bridge abutment pier';part(width,.35,1.4,0,5.78,side*(length/2-.6),mats.concrete);}part(width+.8,.22,length+1,0,9,0,mats.teal);
 for(let z=-length/2;z<=length/2;z+=4)for(const side of [-1,1]){part(.12,2.6,.12,side*width/2,7.7,z,mats.metal);part(.07,1,.09,side*width/2,6.9,z,mats.metal);}
 for(const side of [-1,1]){part(.09,1.1,length,side*width/2,6.95,0,glass);const z=side*(length/2+2),liftX=width/2+2.2;part(3.6,9,4.2,liftX,4.5,z,mats.concrete);part(.08,2.5,2.2,liftX-1.81,1.25,z,glass);part(.08,2.5,2.2,liftX-1.81,7.55,z,glass);part(6.3,.25,4.2,width/2+3.15,6.25,z,mats.concrete);for(let i=0;i<36;i++)part(2.4,(i+1)*6.3/36,.42,width/2+6.5,(i+1)*6.3/72,side*(length/2+4+(35-i)*.42),mats.concrete);const top=g.localToWorld(new T.Vector3(0,8.7,side*length/3));lampPositions.push({s:project(top.x,top.z),x:top.x,y:top.y,z:top.z});part(width-.6,.08,1,0,8.8,side*length/3,mats.lamp);
  litBox(nightParts.fixture,g,2.6,.08,.6,liftX,2.72,z+side*2.45);lampAt(g,liftX,3,z+side*4);for(const x of [liftX-1.86,liftX+1.86])litBox(nightParts.led,g,.06,8.4,.06,x,4.5,z+side*2.12);for(const x of [width/2+5.32,width/2+7.68])litBox(nightParts.led,g,.05,.05,15.9,x,4.25,side*(length/2+11.35),side*Math.atan2(6.13,14.7));lampAt(g,width/2+6.5,3,side*(length/2+20));}
 return g;
 }
 for(const j of CYCLE_BRIDGES){const r=sample(j.s),p=at(j.s,cycleOffset(j.s)),length=j.halfWidth*2+16,g=footbridge('Cycle footbridge '+j.name,p,r.heading,length);
  // Only the upper route crosses the road. Riders climb the same ramp surface as the paint.
  for(const side of [-1,1]){
   const begin=j.s+side*(j.halfWidth+8),end=j.s+side*(j.halfWidth+8+CYCLE_RAMP),a=Math.min(begin,end),b=Math.max(begin,end);
   const top=q=>sample(q).groundY+cycleBridgeHeight(q)-sample(q).y-.025;
   const slab=new T.Mesh(structureGeometry(a,b,[[-2.15,q=>top(q)-.42],[2.15,q=>top(q)-.42],[2.15,top],[-2.15,top]],cycleSample),mats.concrete);slab.name='Cycle bridge approach ramp';slab.castShadow=slab.receiveShadow=true;scene.add(slab);
   for(let q=begin+side*3;side*(end-q)>4;q+=side*16){const c=cycleSample(q),h=cycleBridgeHeight(q)-.445;if(h<.65)continue;const ch=Math.floor(q/240);box('cycle-ramp-pier',mats.concrete,c.x,c.groundY+h/2,c.z,.8,h,1.2,c.heading,ch);box('cycle-ramp-cap',mats.concrete,c.x,c.groundY+h-.16,c.z,3.9,.32,1.3,c.heading,ch);}

   for(const edge of [-2.12,2.12]){const rail=cycleRibbon(a,b,edge-.035,edge+.035,1.15),mesh=new T.Mesh(rail,mats.galvanised);mesh.name='Cycle ramp handrail';scene.add(mesh);}
   for(let q=a;q<=b;q+=5){const c=cycleSample(q),height=cycleBridgeHeight(q);for(const edge of [-2.12,2.12])box('cycle-ramp-post',mats.galvanised,c.x+c.lx*edge,c.groundY+height+.57,c.z+c.lz*edge,.06,1.14,.06,c.heading,Math.floor(q/240));}
   // Ground-level spur skirts the staircase and arrives at the lift entrance.
   const along=side*(length/2+24),q=j.s+along,road=sample(q),outer=-(roadSection(q).right+3.75),start=new T.Vector3(road.x+road.lx*outer,road.groundY+.30,road.z+road.lz*outer),finish=g.localToWorld(new T.Vector3(9, .30,-along));
   const path=new T.LineCurve3(start,finish),link=new T.Mesh(curveRibbon(path,-1.5,1.5,.015),mats.walk);link.name='Footbridge pedestrian approach';scene.add(link);
   const landing=new T.Mesh(new T.BoxGeometry(7,.15,26),mats.walk);landing.position.set(6.7,.225,side*(length/2+14));g.add(landing);
  }
 }

 const plazaPoint=at(a2.s+40,-48),fountain=new T.Group();fountain.name='HSWRL plaza fountain';fountain.position.copy(plazaPoint);scene.add(fountain);
 const basin=new T.Mesh(new T.CylinderGeometry(11,11,1,64),mats.concrete);basin.position.y=.65;fountain.add(basin);const waterMat=new T.MeshStandardMaterial({color:0x55b9d2,metalness:.35,roughness:.12,transparent:true,opacity:.8,emissive:0x0d526b,emissiveIntensity:.4}),water=new T.Mesh(new T.CylinderGeometry(10.3,10.3,.08,64),waterMat);water.position.y=1.2;fountain.add(water);
 for(let i=0;i<16;i++){const a=i*Math.PI/8,curve=new T.QuadraticBezierCurve3(new T.Vector3(Math.cos(a)*8,1.3,Math.sin(a)*8),new T.Vector3(Math.cos(a)*4,8,Math.sin(a)*4),new T.Vector3(0,1.3,0)),jet=new T.Mesh(new T.TubeGeometry(curve,24,.07,5,false),waterMat);fountain.add(jet);}const jet=new T.Mesh(new T.CylinderGeometry(.15,.5,6,12),waterMat);jet.position.y=4;fountain.add(jet);
 for(const ds of [-55,90]){const p=at(a2.s+ds,-48),g=new T.Group();g.name='HSWRL underground entrance';g.position.copy(p);g.rotation.y=sample(a2.s).heading;scene.add(g);for(const [w,h,d,x,y,z,mat] of [[9,.4,12,0,4.2,0,mats.teal],[.35,4,12,-4.3,2,0,glass],[.35,4,12,4.3,2,0,glass],[8,3,.3,0,1.5,5.5,mats.metal]]){const m=new T.Mesh(new T.BoxGeometry(w,h,d),mat);m.position.set(x,y,z);g.add(m);}for(let i=0;i<12;i++){const m=new T.Mesh(new T.BoxGeometry(7,.16,.5),mats.concrete);m.position.set(0,.32-i*.12,-5+i*.5);g.add(m);}const sign=landmarkBoard('HSWRL  高速鐵路  ↓',p.clone().add(new T.Vector3(0,3.5,0)),sample(a2.s).heading+Math.PI,8);sign.position.addScaledVector(new T.Vector3(sample(a2.s).tx,0,sample(a2.s).tz),6);
  litBox(nightParts.fixture,g,7.6,.06,10.6,0,3.97,0);litBox(nightParts.led,g,7,1.4,.06,0,2.1,5.32);glowAt(g,7.5,7,0,.36,-2);for(const z of [-9,0])lampAt(g,0,3.9,z);glowAt(sign,10,2.6,0,0,-.08,true);litBox(nightParts.fixture,sign,7.4,.08,.3,0,.78,.18);}
 const bridgeCentre=at(a2.s+115,-28);footbridge('HSWRL plaza pedestrian bridge',bridgeCentre,sample(a2.s+115).heading+Math.PI/2,104,7);
 for(let ds=-100;ds<=115;ds+=25)for(const lat of [-22,-72]){const p=at(a2.s+ds,lat),ch=Math.floor(a2.s/240);box('plaza-light-pole',mats.metal,p.x,p.y+3.5,p.z,.12,7,.12,0,ch);box('plaza-globe',mats.lamp,p.x,p.y+7,p.z,.7,.25,.7,0,ch);lampPositions.push({s:a2.s+ds,x:p.x,y:p.y+7,z:p.z});}
 // Steel pedestrian panels sit on the kerb side, leaving junctions and crossings open.
 function pedestrianPanel(a,b,ch){const length=a.distanceTo(b),heading=Math.atan2(a.x-b.x,a.z-b.z),mid=a.clone().add(b).multiplyScalar(.5);
  for(const h of [.18,1.05])batch('pedestrian-steel-rail',geo.box,mats.galvanised,new T.Vector3(mid.x,mid.y+h,mid.z),new T.Vector3(.045,.045,length),new T.Euler(Math.atan2(b.y-a.y,Math.hypot(b.x-a.x,b.z-a.z)),heading,0,'YXZ'),ch);
  for(let d=0;d<=length;d+=.22){const p=a.clone().lerp(b,d/length);box('pedestrian-steel-bar',mats.galvanised,p.x,p.y+.61,p.z,.025,.88,.025,heading,ch);}
  box('pedestrian-steel-post',mats.galvanised,a.x,a.y+.6,a.z,.065,1.2,.065,heading,ch);
 }
 for(const j of [...JUNCTIONS,...UNDERPASSES])for(const side of [-1,1])for(let lat=-j.extent;lat<j.extent-2;lat+=2.2){if(Math.abs(lat)<42)continue;const r=sample(j.s),a=at(j.s,lat),b=at(j.s,lat+2.2);for(const p of [a,b]){p.x+=r.tx*side*(j.halfWidth+.25);p.z+=r.tz*side*(j.halfWidth+.25);p.y+=.3;}pedestrianPanel(a,b,Math.floor(j.s/240));}
 for(let q=L35.start+30;q<bendStart-4;q+=2.2)for(const side of [-1,1]){if(crossingGap(q,q+2.2))continue;const a=at(q,-l35Offset(q)+side*(L35.width/2+.25)),b=at(q+2.2,-l35Offset(q+2.2)+side*(L35.width/2+.25));a.y+=.3;b.y+=.3;pedestrianPanel(a,b,Math.floor(q/240));}
 for(let q=35;q<LENGTH-3;q+=2.2)for(const side of [-1,1]){if(!fenceAllowed(q,q+2.2,side))continue;const a=at(q,side*(roadSection(q).right+.25)),b=at(q+2.2,side*(roadSection(q+2.2).right+.25));a.y+=footpathHeight(q);b.y+=footpathHeight(q+2.2);pedestrianPanel(a,b,Math.floor(q/240));}
 // Continue the roadside barrier along each ramp, without fencing across its entrance.
 for(const st of STOPS)for(const platform of st.platforms)for(const dir of [-1,1]){
  if(st.id==='A1'&&dir===-1)continue;
  const {a,b,end}=stationAccess(st,platform,dir),inner=a[0].clone().lerp(a[1],.18/st.width),outer=b[0].clone().lerp(b[1],.25/3.75);
  const q=dir===1?Math.ceil((end-35)/2.2)*2.2+35:Math.floor((end-35)/2.2)*2.2+35;
  const tie=at(q,platform.side*(roadSection(q).right+.25));tie.y+=footpathHeight(q);
  for(let i=0;i<5;i++)pedestrianPanel(inner.clone().lerp(outer,i/5),inner.clone().lerp(outer,(i+1)/5),Math.floor(st.s/240));
  pedestrianPanel(outer,tie,Math.floor(st.s/240));
 }

 // Shared road-oriented fixtures cover every connecting carriageway, including their bends.
 function roadLamp(p,t,width,kind,side=1,height=10){
  const s=project(p.x,p.z),ch=Math.min(groups.length-1,Math.floor(s/240)),lx=-t.z,lz=t.x;
  const x=p.x+lx*side*(width/2+1),z=p.z+lz*side*(width/2+1);
  box('connecting-road-pole',mats.galvanised,x,p.y+height/2,z,.15,height,.15,0,ch);
  box('connecting-road-lamp',mats.lamp,x-lx*side*1.4,p.y+height,z-lz*side*1.4,.55,.13,1,Math.atan2(-t.x,-t.z),ch);
  box('connecting-road-arm',mats.galvanised,x-lx*side*.7,p.y+height-.12,z-lz*side*.7,1.6,.09,.09,Math.atan2(-t.x,-t.z),ch);
  lampPositions.push({s,x:x-lx*side*1.4,y:p.y+height,z:z-lz*side*1.4,kind,axis:{tx:t.x,tz:t.z,lx,lz}});
 }
 for(const j of [...JUNCTIONS,...UNDERPASSES]){const r=sample(j.s);
  if(j.underpass)for(const d of [-24,-12,0,12,24])for(const side of [-1,1]){
   const x=r.x+r.lx*d+r.tx*side*j.halfWidth*.55,z=r.z+r.lz*d+r.tz*side*j.halfWidth*.55,y=Math.min(r.groundY+5.5,r.y-1.2);
   box('underbridge-LED',mats.lamp,x,y,z,.35,.12,2,r.heading+Math.PI/2,Math.floor(j.s/240));
   lampPositions.push({s:j.s,x,y,z,kind:'underbridge',axis:{tx:r.lx,tz:r.lz,lx:r.tx,lz:r.tz}});
  }
  for(let d=-j.extent+8;d<j.extent;d+=26)for(const side of [-1,1]){
   // Keep poles out of the main corridor, cycleway and L35 junction mouth.
   if(Math.abs(d)<42)continue;
   roadLamp(new T.Vector3(r.x+r.lx*d,j.underpass?r.groundY:r.y-r.grade*side*(j.halfWidth+1),r.z+r.lz*d),new T.Vector3(r.lx,0,r.lz),j.halfWidth*2,j.name,side);
  }
 }
 let d1Distance=0;
 for(let i=1;i<D1ROAD.length;i++){const a=new T.Vector3(D1ROAD[i-1].x,D1ROAD[i-1].y,D1ROAD[i-1].z),b=new T.Vector3(D1ROAD[i].x,D1ROAD[i].y,D1ROAD[i].z),length=a.distanceTo(b),t=b.clone().sub(a).normalize();
  for(let d=d1Distance;d<length;d+=26)for(const side of [-1,1])roadLamp(a.clone().lerp(b,d/length),t,18,'D1',side);
  d1Distance=(d1Distance-length)%26;if(d1Distance<0)d1Distance+=26;
 }
 for(const [curve,width,kind] of [[l35BendCurve,L35.width,'L35 bend'],[depotCurve,7,'Depot approach']])for(let d=12;d<curve.getLength()-12;d+=24){const u=d/curve.getLength();roadLamp(curve.getPointAt(u),curve.getTangentAt(u),width,kind,-1,7);}
 for(let d=0;d<LOOP.length;d+=20){const p=LOOP.sample(d);roadLamp(new T.Vector3(p.x,p.y,p.z),new T.Vector3(p.tx,0,p.tz),LOOP.outerRadius-LOOP.innerRadius,'Terminal loop',-1,7);}
 // Familiar street furniture sits in the outer furnishing strip, leaving the walking route clear.
 const iron=new T.MeshStandardMaterial({color:0x3d4845,metalness:.65,roughness:.85}),postGreen=new T.MeshStandardMaterial({color:0x126d4c,roughness:.65}),binOrange=new T.MeshStandardMaterial({color:0xd57929,roughness:.8}),patchMat=new T.MeshStandardMaterial({color:0x85877b,roughness:1});
 const labelMaterial=(lines,bg)=>{const c=document.createElement('canvas');c.width=256;c.height=256;const x=c.getContext('2d');x.fillStyle=bg;x.fillRect(0,0,256,256);x.fillStyle='#f2eee0';x.textAlign='center';x.font='bold 44px sans-serif';lines.forEach((line,i)=>x.fillText(line,128,85+i*65));const map=new T.CanvasTexture(c);map.colorSpace=T.SRGBColorSpace;return new T.MeshBasicMaterial({map,side:T.DoubleSide});};
 const postLabel=labelMaterial(['郵政','POST'],'#126d4c'),binLabel=labelMaterial(['廢屑','LITTER'],'#d57929'),signLabel=labelMaterial(['行人 →','FOOTPATH'],'#18664e'),signGeo=new T.PlaneGeometry(1,1);
 for(let q=35;q<LENGTH-25;q+=18)for(const side of [-1,1]){
  if(groundCrossing(q)||crossingGap(q-5,q+5)||STOPS.some(st=>Math.abs(st.s-q)<st.footprintLength/2+12)||side===1&&inDepot(q))continue;
  const r=sample(q),edge=roadSection(q).right,ch=Math.floor(q/240),level=r.groundY+footpathHeight(q),heading=r.heading;
  const p=at(q,side*(edge+.28));
  box('kerb-drain-frame',iron,p.x,level+.004,p.z,.40,.025,.82,heading,ch);
  for(let i=0;i<8;i++){const v=new T.Vector3(0,0,(i-3.5)*.09).applyAxisAngle(new T.Vector3(0,1,0),heading).add(p);box('drain-grille',mats.galvanised,v.x,level+.022,v.z,.32,.018,.025,heading,ch);}
  const index=Math.floor((q-35)/18);
  if(index%3===0){const p=at(q+4,side*(roadSection(q+4).right+1.2)),y=sample(q+4).groundY+footpathHeight(q+4);
   box('paving-repair',patchMat,p.x,y+.006,p.z,1.10,.016,1.35,heading,ch);box('manhole-rim',mats.galvanised,p.x,y+.018,p.z,.76,.022,1.03,heading,ch);box('manhole-cover',iron,p.x,y+.032,p.z,.69,.018,.96,heading,ch);
   for(let i=-3;i<=3;i++){const v=new T.Vector3(i*.085,0,0).applyAxisAngle(new T.Vector3(0,1,0),heading).add(p);box('manhole-tread',mats.galvanised,v.x,y+.044,v.z,.018,.008,.82,heading,ch);}
  }
  if(index%4===0){const p=at(q,side*(edge+3.22));p.y=level;
   batch('HK-orange-bin',geo.cyl,binOrange,p.clone().add(new T.Vector3(0,.45,0)),new T.Vector3(.29,.9,.29),new T.Euler(),ch);
   batch('bin-rim',geo.cyl,iron,p.clone().add(new T.Vector3(0,.92,0)),new T.Vector3(.31,.13,.31),new T.Euler(),ch);
   const face=p.clone().add(new T.Vector3(0,.50,.295).applyAxisAngle(new T.Vector3(0,1,0),heading));batch('bin-label',signGeo,binLabel,face,new T.Vector3(.25,.28,1),new T.Euler(0,heading,0),ch);
  }
  if(side===1&&index%12===0){const p=at(q+2,edge+3.2);p.y=sample(q+2).groundY+footpathHeight(q+2);
   batch('HK-pillar-box',geo.cyl,postGreen,p.clone().add(new T.Vector3(0,.58,0)),new T.Vector3(.25,1.16,.25),new T.Euler(),ch);batch('pillar-box-cap',geo.cyl,postGreen,p.clone().add(new T.Vector3(0,1.17,0)),new T.Vector3(.29,.12,.29),new T.Euler(),ch);
   const face=p.clone().add(new T.Vector3(0,.68,.256).applyAxisAngle(new T.Vector3(0,1,0),heading));batch('post-label',signGeo,postLabel,face,new T.Vector3(.28,.32,1),new T.Euler(0,heading,0),ch);
   const slot=p.clone().add(new T.Vector3(0,.95,.255).applyAxisAngle(new T.Vector3(0,1,0),heading));box('letter-slot',iron,slot.x,slot.y,slot.z,.23,.045,.025,heading,ch);
  }
  if(index%8===2){const p=at(q,side*(edge+3.3));box('pedestrian-wayfinding-post',mats.galvanised,p.x,level+1.25,p.z,.06,2.5,.06,heading,ch);batch('HK-wayfinding-sign',signGeo,signLabel,new T.Vector3(p.x,level+2.15,p.z),new T.Vector3(.8,.65,1),new T.Euler(0,heading,0),ch);}
  if(!r.elevated){const a=q-5,b=q+5,outer=side*(edge+3.95);for(const dx of [-.21,.21]){const m=new T.Mesh(ribbon(a,b,outer+dx-.055,outer+dx+.055,.06,true),mats.concrete);m.name='Open verge drainage channel';groups[ch].add(m);}const m=new T.Mesh(ribbon(a,b,outer-.15,outer+.15,-.06,true),iron);m.name='Drainage channel invert';groups[ch].add(m);}
 }
 // Blender templates share geometry and material in spatially culled instanced beds.
 streetKit.updateMatrixWorld(true);
 const plants=['grass','meadow','fern','shrub','flowering'].map(kind=>{const parts=[];streetKit.getObjectByName('vegetation_'+kind).traverse(n=>{if(n.isMesh)parts.push({geometry:n.geometry.clone().applyMatrix4(n.matrixWorld),material:windMaterial(n.material,windTime),low:streetKit.getObjectByName(n.name+'_lod')?.geometry.clone().applyMatrix4(n.matrixWorld)});});for(const part of parts)part.geometry.userData.low=part.low;return {kind,parts};});
 for(const tree of trees){if(plots.some(p=>Math.hypot(p.x-tree.x,p.z-tree.z)<p.radius+3))continue;const plant=plants[3];for(let i=0;i<6;i++){const angle=i*Math.PI/3,p=new T.Vector3(tree.x+Math.cos(angle)*1.05,tree.y-.15,tree.z+Math.sin(angle)*1.05);for(const part of plant.parts)batch('tree-shrub-'+part.material.name+'-cell'+Math.floor(tree.s/40),part.geometry,part.material,p,new T.Vector3(.85,.9,.85),new T.Euler(0,angle,0),Math.floor(tree.s/240));}}
 for(let s=8;s<LENGTH-8;s+=1.7)for(const side of [-1,1])for(let row=0;row<3;row++){
  if([...JUNCTIONS,...UNDERPASSES].some(j=>Math.abs(j.s-s)<j.halfWidth+35)||channelDepth(at(s,0).x,at(s,0).z)>0)continue;
  const edge=side===-1?-cycleOffset(s)+2:Math.max(roadSection(s).right+3.75,...STOPS.filter(st=>Math.abs(st.s-s)<st.footprintLength/2+8).map(st=>7.05+st.width));
  const lat=side*(edge+1.0+row*.8),p=at(s+(rnd()-.5)*.6,lat),plant=plants[row===0?Math.floor(rnd()*2):2+Math.floor(rnd()*3)],scale=1.3+rnd()*.45;
  if(side===-1){const c=cycleSample(s),offset=-3-row*.8;p.x=c.x+c.lx*offset;p.z=c.z+c.lz*offset;}
  const nearestS=project(p.x,p.z),nearest=sample(nearestS);
  if(Math.hypot(p.x-nearest.x,p.z-nearest.z)<roadSection(nearestS).right+4.2||cycleClearance(p.x,p.z)<2.7||channelDepth(p.x,p.z)>0||D1ROAD.some(q=>Math.hypot(q.x-p.x,q.z-p.z)<14.5)||plots.some(q=>Math.hypot(q.x-p.x,q.z-p.z)<q.radius+.5)||RAILWAY.distance(p.x,p.z)<8||side===1&&Math.abs(s-DEPOT.s)<DEPOT.opening/2+12)continue;
  p.y-=.18;plantings.push({x:p.x,z:p.z,kind:plant.kind,s,lat,heightScale:scale});
  const rotation=new T.Euler(0,rnd()*Math.PI*2,0);
  plant.parts.forEach((part,i)=>batch('vegetation-'+plant.kind+'-'+i+'-cell'+Math.floor(s/40),part.geometry,part.material,p,new T.Vector3(scale*.75,scale,scale*.75),rotation,Math.floor(s/240)));
 }

 for(const [key,b] of Object.entries(instances)){if(/^(trunk|foliage|tree-shrub)-/.test(key))b.matrices=b.matrices.filter(m=>plots.every(p=>Math.hypot(m.elements[12]-p.x,m.elements[14]-p.z)>p.radius+2));if(!b.matrices.length)continue;const mesh=new T.InstancedMesh(b.geometry,b.material,b.matrices.length);b.matrices.forEach((m,i)=>mesh.setMatrixAt(i,m));mesh.name=key;mesh.receiveShadow=true;mesh.castShadow=!/^(foliage|vegetation|tree-shrub)-/.test(key);if(b.geometry.userData.low){mesh.userData.full=b.geometry;mesh.userData.low=b.geometry.userData.low;mesh.userData.s=Number(key.match(/cell(\d+)/)[1])*40+20;plantMeshes.push(mesh);}groups[b.chunk]?.add(mesh);}
 // The source-dimensioned A1 annular driving area is rendered as well as simulated.
 const ringGeo=new T.RingGeometry(LOOP.innerRadius,LOOP.outerRadius,96);ringGeo.rotateX(-Math.PI/2);const ring=new T.Mesh(ringGeo,mats.road);ring.position.set(LOOP.center.x,LOOP.y+.02,LOOP.center.z);ring.receiveShadow=true;scene.add(ring);
 const island=new T.Mesh(new T.CylinderGeometry(LOOP.innerRadius-.2,LOOP.innerRadius-.2,.35,64),mats.grass);island.position.set(LOOP.center.x,LOOP.y+.15,LOOP.center.z);island.receiveShadow=true;scene.add(island);
 const st=STOPS[0],r=sample(st.s),throat=new T.Group();throat.name='A1-connected-throat';throat.position.set(r.x,r.y,r.z);throat.rotation.y=r.heading;scene.add(throat);
 const shape=new T.Shape();shape.moveTo(-7.05,25);shape.lineTo(-15.37,44.8);shape.lineTo(-14.28,47.55);shape.lineTo(14.28,47.55);shape.lineTo(15.37,44.8);shape.lineTo(7.05,25);shape.closePath();const tie=new T.ShapeGeometry(shape);tie.rotateX(Math.PI/2);const tieMesh=new T.Mesh(tie,new T.MeshStandardMaterial({map:roadTex,roughness:.91,side:T.DoubleSide}));tieMesh.position.y=.012;throat.add(tieMesh);
 const outerWalk=new T.Mesh(new T.RingGeometry(LOOP.outerRadius,LOOP.outerRadius+3.75,96,1,Math.atan2(-r.tz,r.tx)+Math.PI/3,Math.PI*4/3),mats.walk);outerWalk.geometry.rotateX(-Math.PI/2);outerWalk.position.set(LOOP.center.x,LOOP.y+.3,LOOP.center.z);scene.add(outerWalk);
 // Connect both platform access ramps to the loop footpath without crossing its carriageway.
 for(const side of [-1,1]){const g=new T.BufferGeometry(),v=[];for(const [x,z,y] of [[15.37,44.8,.30],[20.37,44.8,.30],[20.568,49.675,.30],[17.321,51.55,.30]])v.push(r.x+r.lx*x*side-r.tx*z,r.y+y,r.z+r.lz*x*side-r.tz*z);g.setAttribute('position',new T.Float32BufferAttribute(v,3));g.setIndex(side===1?[0,2,1,0,3,2]:[0,1,2,0,2,3]);g.computeVertexNormals();const m=new T.Mesh(g,new T.MeshStandardMaterial({map:paverTex,roughness:.96,side:T.DoubleSide}));m.name='A1-loop-footpath-link-'+side;scene.add(m);}
 // Distant hills: a continuous ridgeline, well outside the traced corridor.
 const hillMat=new T.MeshStandardMaterial({color:0x65765c,roughness:1});
 for(let i=0;i<26;i++){let r=sample(LENGTH*i/25),hill=new T.Mesh(new T.SphereGeometry(1,18,12),hillMat);hill.position.set(r.x-450-rnd()*280,r.groundY-25,r.z);hill.scale.set(210+rnd()*160,80+rnd()*130,260);if(sceneryClear(hill.position.x,hill.position.z,Math.max(hill.scale.x,hill.scale.z)+20))scene.add(hill);}
 const ringCurve=new T.CatmullRomCurve3(Array.from({length:97},(_,i)=>{const p=LOOP.sample(LOOP.length*i/96);return new T.Vector3(p.x,p.y,p.z);}),false,'centripetal');
 for(const curve of [terminalCurve,depotCurve])for(let d=0;d<curve.getLength();d+=1.5)for(const offset of [-.24,.24]){const m=new T.Mesh(curveRibbon(curve,offset-.085,offset+.085,.105,d,Math.min(d+.55,curve.getLength())),mats.white);m.name='ART branch guidance';scene.add(m);}
 // SGMTS ramp ends get slim lamp posts so the ramp paving shows light pools.
 for(const st of STOPS)for(const platform of st.platforms)for(const dir of [-1,1]){if(st.id==='A1'&&dir===-1)continue;const {a,b}=stationAccess(st,platform,dir);for(const [p0,p1] of [a,b]){const p=p1.clone().addScaledVector(p1.clone().sub(p0).setY(0).normalize(),.35);nightParts.post.push(new T.BoxGeometry(.12,4,.12).translate(p.x,p.y+2,p.z));nightParts.fixture.push(new T.BoxGeometry(.34,.12,.34).translate(p.x,p.y+4.02,p.z));lampPositions.push({s:project(p.x,p.z),x:p.x,y:p.y+4,z:p.z});}}
 // Night fixtures merge into one mesh per material; LED lines and additive light spill show only at night.
 const spill=document.createElement('canvas');spill.width=spill.height=64;{const x=spill.getContext('2d'),g=x.createRadialGradient(32,32,0,32,32,32);g.addColorStop(0,'rgba(255,228,178,.95)');g.addColorStop(1,'rgba(255,228,178,0)');x.fillStyle=g;x.fillRect(0,0,64,64);}
 const nightMeshes=[[nightParts.fixture,mats.lamp,true],[nightParts.post,mats.metal,true],[nightParts.led,new T.MeshBasicMaterial({color:0xfff2d8}),false],[nightParts.glow,new T.MeshBasicMaterial({map:new T.CanvasTexture(spill),transparent:true,opacity:.42,depthWrite:false,blending:T.AdditiveBlending,side:T.DoubleSide}),false]].map(([list,mat,day])=>{const m=new T.Mesh(mergeGeometries(list),mat);m.name='Station night lighting';m.visible=day;m.userData.nightOnly=!day;m.castShadow=day&&mat===mats.metal;scene.add(m);return m;});
 // ponytail: fixed baked pavement illumination keeps every lamp on without
 // hundreds of realtime lights on mobile; dynamic shadows still come from headlights.
 const tessellate=new TessellateModifier(4,8);
 scene.updateMatrixWorld(true);scene.traverse(m=>{if(!m.isMesh||m.isInstancedMesh||!m.material?.map||![roadTex,...pavers].includes(m.material.map))return;const p=m.geometry.attributes.position,uv=[];for(let i=0;i<p.count;i++){const v=new T.Vector3().fromBufferAttribute(p,i).applyMatrix4(m.matrixWorld);uv.push(v.x/3.2,v.z/3.2);}m.geometry.setAttribute('uv',new T.Float32BufferAttribute(uv,2));});
 const nightSurfaces=[];scene.updateMatrixWorld(true);scene.traverse(m=>{if(m.isMesh&&!m.isInstancedMesh&&([roadTex,...pavers].includes(m.material?.map)||m===cycle||m.name==='Elevated cycle connection'))nightSurfaces.push(m);});
 for(const m of nightSurfaces){
  const geo=tessellate.modify(m.geometry),p=geo.attributes.position,colors=[],v=new T.Vector3(),base=m.material.color;
  geo.computeBoundingBox();const bounds=geo.boundingBox.clone().applyMatrix4(m.matrixWorld).expandByScalar(55),lamps=lampPositions.filter(l=>bounds.containsPoint(new T.Vector3(l.x,l.y,l.z))).map(l=>({...l,axis:l.axis||sample(l.s)}));
  for(let i=0;i<p.count;i++){v.fromBufferAttribute(p,i).applyMatrix4(m.matrixWorld);const glow=pavementLight(v,lamps)*1.05;colors.push(glow*base.r,glow*base.g*.94,glow*base.b*.83);}
  geo.setAttribute('color',new T.Float32BufferAttribute(colors,3));
  const material=new T.MeshBasicMaterial({map:m.material.map,vertexColors:true,transparent:true,opacity:.85,blending:T.AdditiveBlending,depthWrite:false,side:m.material.side,polygonOffset:true,polygonOffsetFactor:-2,polygonOffsetUnits:-2});
  const overlay=new T.Mesh(geo,material);overlay.name='Fixed night illumination';overlay.visible=false;m.add(overlay);m.userData.nightOverlay=overlay;
 }

 scene.traverse(n=>{if(n.isMesh&&!n.isSkinnedMesh){n.updateMatrix();n.matrixAutoUpdate=false;}});
 return {groups,plots,trees,lampPositions,plantings,windTime,setNight(on){nightSurfaces.forEach(m=>m.userData.nightOverlay.visible=on);nightMeshes.forEach(m=>{if(m.userData.nightOnly)m.visible=on;});glass.emissive.set(on?0xffc27a:0);glass.emissiveIntensity=on?.5:0;},nightMaterials:[mats.lamp,...windowMats],markingMaterial:mats.white,materials:mats,update(s,time=0){windTime.value=time;for(const mesh of plantMeshes){const d=Math.abs(mesh.userData.s-s);mesh.visible=d<550;const geometry=d<65?mesh.userData.full:mesh.userData.low;if(mesh.geometry!==geometry){mesh.geometry=geometry;mesh.boundingSphere=null;}}for(const g of groups)g.visible=Math.abs(g.userData.s-s)<850;},weather(wet){mats.road.roughness=wet?.32:.91;mats.road.color.set(wet?0x9da8ac:0xffffff);}};
}

export function curveRibbon(curve,left,right,y=0,start=0,end=curve.getLength()){const p=[],uv=[],idx=[],n=Math.max(1,Math.ceil((end-start)/.6)),length=curve.getLength();for(let i=0;i<=n;i++){const d=start+(end-start)*i/n,u=d/length,v=curve.getPointAt(u),t=curve.getTangentAt(u);for(const lat of [left,right]){p.push(v.x+t.z*lat,v.y+y,v.z-t.x*lat);uv.push(lat/5,d/5);}if(i<n){const a=i*2;idx.push(a,a+2,a+1,a+1,a+2,a+3);}}const g=new T.BufferGeometry();g.setAttribute('position',new T.Float32BufferAttribute(p,3));g.setAttribute('uv',new T.Float32BufferAttribute(uv,2));g.setIndex(idx);g.computeVertexNormals();return g;}
