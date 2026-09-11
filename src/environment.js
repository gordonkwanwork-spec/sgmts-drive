import * as T from 'three';
import {LENGTH,STOPS,sample,LOOP,roadSection,fromChainage,project,PATH,BRIDGES,CROSSINGS,footpathHeight,cycleOffset,CYCLE_WIDTH,CHANNELS,JUNCTIONS,UNDERPASSES,L35,l35Offset,DEPOT,RAILWAY,railSample,cycleCrossing,cycleHeight,D1ROAD} from './alignment.js';
export {JUNCTIONS,UNDERPASSES} from './alignment.js';
const inJunction=s=>JUNCTIONS.some(j=>Math.abs(s-j.s)<j.halfWidth+6);
const inDepot=s=>Math.abs(s-DEPOT.s)<DEPOT.opening/2;
const groundCrossing=s=>inJunction(s)||UNDERPASSES.some(j=>Math.abs(j.s-s)<j.halfWidth+.5);
export function channelDepth(x,z){return Math.max(0,...CHANNELS.map(c=>{const r=sample(c.s),dx=x-r.x,dz=z-r.z;return Math.abs(dx*r.lx+dz*r.lz)<c.extent?3.8*Math.max(0,Math.min(1,(c.width/2+3-Math.abs(dx*r.tx+dz*r.tz))/3)):0;}));}
// Scenery must clear every nearby bend and crossing road, not just its placement sample.
export function sceneryClear(x,z,radius){
 const ps=project(x,z),r=sample(ps),lat=(x-r.x)*r.lx+(z-r.z)*r.lz;if((r.c>680&&r.c<980&&lat< -12+radius&&lat> -145-radius)||Math.abs(ps-DEPOT.s)<DEPOT.length/2+radius&&lat>10-radius&&lat<DEPOT.lateral+DEPOT.width/2+radius||ps>=L35.start-30&&ps<=L35.end+40&&lat<0&&lat> -35-radius||channelDepth(x,z)>0)return false;
 if(ps>=RAILWAY.start&&ps<=RAILWAY.end){const rail=railSample(ps);if(Math.hypot(x-rail.x,z-rail.z)<9+radius)return false;}
 const dp=sample(DEPOT.s),dl=(x-dp.x)*dp.lx+(z-dp.z)*dp.lz,ds=(x-dp.x)*dp.tx+(z-dp.z)*dp.tz;if(dl>10-radius&&dl<170+radius&&Math.abs(ds)<85+radius)return false;
 if(D1ROAD.some(p=>Math.hypot(x-p.x,z-p.z)<14+radius))return false;
 if(Math.hypot(x-r.x,z-r.z)<24+radius)return false;
 return [...JUNCTIONS,...UNDERPASSES].every(j=>{const p=sample(j.s),dx=x-p.x,dz=z-p.z;return Math.abs(dx*p.tx+dz*p.tz)>j.halfWidth+5+radius||Math.abs(dx*p.lx+dz*p.lz)>j.extent+radius;});
}
const V=new T.Vector3(), Q=new T.Quaternion(), S=new T.Vector3(), M=new T.Matrix4();
let seed=9173;const rnd=()=>{seed=(1664525*seed+1013904223)>>>0;return seed/4294967296;};
export function paintTexture(kind){
 const c=document.createElement('canvas');c.width=c.height=512;const x=c.getContext('2d');
 if(kind==='leaf'){
  x.clearRect(0,0,512,512);
  for(let i=0;i<220;i++){let px=256+(rnd()-.5)*430,py=256+(rnd()-.5)*420; if(Math.hypot((px-256)/230,(py-256)/235)>1)continue;x.fillStyle=`hsl(${88+rnd()*32} 25% ${19+rnd()*24}%)`;x.beginPath();x.ellipse(px,py,10+rnd()*16,5+rnd()*11,rnd()*6.28,0,6.28);x.fill();}
 }else{
  const base={road:[75,79,77],walk:[171,164,148],grass:[85,102,60],wall:[191,187,169]}[kind]||[160,160,150];
  const d=x.createImageData(512,512);for(let i=0;i<d.data.length;i+=4){const n=(rnd()-.5)*(kind==='grass'?48:22);d.data[i]=base[0]+n;d.data[i+1]=base[1]+n;d.data[i+2]=base[2]+n;d.data[i+3]=255;}x.putImageData(d,0,0);
  if(kind==='walk'){x.strokeStyle='#736f62';x.lineWidth=2;for(let y=0;y<512;y+=64){x.beginPath();x.moveTo(0,y);x.lineTo(512,y);x.stroke();for(let a=(y%128?32:0);a<512;a+=128){x.beginPath();x.moveTo(a,y);x.lineTo(a,y+64);x.stroke();}}}
  if(kind==='wall'){x.strokeStyle='#9d9a8e';x.lineWidth=3;for(let y=0;y<512;y+=128){x.beginPath();x.moveTo(0,y);x.lineTo(512,y);x.stroke();}}
 }
 const t=new T.CanvasTexture(c);t.colorSpace=T.SRGBColorSpace;t.wrapS=t.wrapT=T.RepeatWrapping;t.anisotropy=8;return t;
}
export function ribbon(start,end,left,right,yOffset=0,terrain=false,cut=false){
 const p=[],uv=[],idx=[];let n=Math.ceil((end-start)/2);
 for(let i=0;i<=n;i++){let s=start+(end-start)*i/n,r=sample(s),y=(terrain?r.groundY:r.y)+(typeof yOffset==='function'?yOffset(s):yOffset);
  for(const edge of [left,right]){const lat=typeof edge==='function'?edge(s):edge;p.push(r.x+r.lx*lat,y,r.z+r.lz*lat);uv.push(lat/5,s/5);}
 }
 // Drop a whole quad if either triangle folds or either edge runs backwards.
 const up=(a,b,c)=>(p[b*3+2]-p[a*3+2])*(p[c*3]-p[a*3])-(p[b*3]-p[a*3])*(p[c*3+2]-p[a*3+2]);
 for(let i=0;i<n;i++){const j=i*2,a=sample(start+(end-start)*i/n),b=sample(start+(end-start)*(i+1)/n),forward=k=>(p[(k+2)*3]-p[k*3])*(b.x-a.x)+(p[(k+2)*3+2]-p[k*3+2])*(b.z-a.z);if(!(cut&&(typeof cut==='function'?cut:inJunction)(start+(end-start)*(i+.5)/n))&&up(j,j+2,j+1)>1e-8&&up(j+1,j+2,j+3)>1e-8&&forward(j)>0&&forward(j+1)>0)idx.push(j,j+2,j+1,j+1,j+2,j+3);}
 let g=new T.BufferGeometry();g.setAttribute('position',new T.Float32BufferAttribute(p,3));g.setAttribute('uv',new T.Float32BufferAttribute(uv,2));g.setIndex(idx);g.computeVertexNormals();return g;
}
function terrainLevel(x,z,s){const d=sample(DEPOT.s),lat=(x-d.x)*d.lx+(z-d.z)*d.lz,along=(x-d.x)*d.tx+(z-d.z)*d.tz;if(lat>24&&lat<166&&Math.abs(along)<81||lat>0&&lat<55&&Math.abs(along)<16)return d.y;return sample(s).groundY;}
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
export function cycleGeometry(){return ribbon(0,LENGTH,s=>cycleOffset(s)-CYCLE_WIDTH/2,s=>cycleOffset(s)+CYCLE_WIDTH/2,cycleHeight,true,cycleCrossing);}
// Sweep a closed structural cross-section along the same centreline as the road.
export function structureGeometry(start,end,section){const positions=[],indices=[],n=Math.ceil((end-start)/2),count=section.length;
 for(let i=0;i<=n;i++){const s=start+(end-start)*i/n,r=sample(s);for(const [x,y] of section)positions.push(r.x+r.lx*x,r.y+(typeof y==='function'?y(s):y),r.z+r.lz*x);}
 for(let i=0;i<n;i++)for(let j=0;j<count;j++){const a=i*count+j,b=i*count+(j+1)%count;indices.push(a,b,a+count,b,b+count,a+count);}
 for(const i of [0,n])for(let j=1;j<count-1;j++)indices.push(i*count,i*count+j,i*count+j+1);
 const g=new T.BufferGeometry();g.setAttribute('position',new T.Float32BufferAttribute(positions,3));g.setIndex(indices);g.computeVertexNormals();return g;
}
export function buildEnvironment(scene){
 const backdrop=new T.Mesh(new T.PlaneGeometry(14000,14000),new T.MeshStandardMaterial({color:0x657647,roughness:1}));backdrop.rotation.x=-Math.PI/2;backdrop.position.y=-5;scene.add(backdrop);
 const roadTex=paintTexture('road'),paverTex=paintTexture('walk');
 const mats={road:new T.MeshStandardMaterial({map:roadTex,roughness:.91}),walk:new T.MeshStandardMaterial({map:paverTex,roughness:.96}),grass:new T.MeshStandardMaterial({map:paintTexture('grass'),roughness:1}),concrete:new T.MeshStandardMaterial({color:0xc6c2ac,roughness:.9,side:T.DoubleSide}),lamp:new T.MeshStandardMaterial({color:0xffecc9,emissive:0xffd995,emissiveIntensity:0}),white:new T.MeshStandardMaterial({color:0xece8d3,roughness:.8}),teal:new T.MeshStandardMaterial({color:0x47776b,roughness:.85}),metal:new T.MeshStandardMaterial({color:0x465654,metalness:.65,roughness:.4})};
 const groups=[],instances={},plots=[],lampPositions=[];
 const geo={box:new T.BoxGeometry(1,1,1),cyl:new T.CylinderGeometry(1,1,1,7),leaf:new T.PlaneGeometry(1,1),cone:new T.ConeGeometry(1,1,8)};
 const foliage=new T.MeshStandardMaterial({map:paintTexture('leaf'),alphaTest:.38,side:T.DoubleSide,roughness:1,color:0xe2e5b5});
 const trunk=new T.MeshStandardMaterial({color:0x665b43,roughness:1});
 const windowMats=[0x788d8b,0x6d8384,0x718784].map(color=>new T.MeshStandardMaterial({color,metalness:.35,roughness:.33}));
 const wallMats=[0xc8c7b7,0xb6b6a7,0xc5c5be,0xaebcb5].map(color=>new T.MeshStandardMaterial({color,roughness:.84,map:paintTexture('wall')}));
 function batch(key,geometry,material,pos,scale,rot=new T.Euler(),chunk=0){
  const k=key+'-'+chunk;if(!instances[k])instances[k]={geometry,material,matrices:[],chunk};
  Q.setFromEuler(rot);M.compose(pos,Q,scale);instances[k].matrices.push(M.clone());
 }
 function box(key,mat,x,y,z,w,h,d,heading=0,chunk=0){batch(key,geo.box,mat,new T.Vector3(x,y,z),new T.Vector3(w,h,d),new T.Euler(0,heading,0),chunk);}
 function at(s,lat){const r=sample(s);return new T.Vector3(r.x+r.lx*lat,r.groundY,r.z+r.lz*lat);}
 for(let start=0;start<LENGTH;start+=240){let end=Math.min(start+240,LENGTH),ch=Math.floor(start/240),group=new T.Group();group.userData.s=(start+end)/2;scene.add(group);groups.push(group);
  const ground=new T.Mesh(terrainPatch(start,end),mats.grass);ground.receiveShadow=true;group.add(ground);
  for(const [left,right,offset,mat,terrain] of [[s=>roadSection(s).left,s=>roadSection(s).right,0,mats.road,false],[s=>roadSection(s).left-3.75,s=>roadSection(s).left,footpathHeight,mats.walk,true],[s=>roadSection(s).right,s=>roadSection(s).right+3.75,footpathHeight,mats.walk,true]]){
   const mesh=new T.Mesh(ribbon(start,end,left,right,offset,terrain,mat===mats.walk?(s=>groundCrossing(s)||left(DEPOT.s)>0&&inDepot(s)):false),mat);mesh.receiveShadow=true;group.add(mesh);
  }
  for(const edge of [s=>roadSection(s).left,s=>roadSection(s).right]){const line=new T.Mesh(ribbon(start,end,s=>edge(s)-.05,s=>edge(s)+.05,.025,false,true),mats.white);group.add(line);}
  for(let s=start;s<end;s+=7){const r=sample(s);for(const lat of roadSection(s).right>3.85?[-3.8,0,3.8]:[0]){const line=new T.Mesh(ribbon(s,Math.min(s+3.1,end),lat-.045,lat+.045,.027,false,true),mats.white);group.add(line);}}
  for(let s=start;s<end;s+=2){const e=Math.min(s+2,end),r=sample((s+e)/2),a=sample(s),b=sample(e);
   for(const side of [-1,1]){if(inJunction(s)||side===1&&inDepot(s))continue;const la=side*(roadSection(s).right+(r.elevated?.21:0)),lb=side*(roadSection(e).right+(r.elevated?.21:0)),ax=a.x+a.lx*la,az=a.z+a.lz*la,bx=b.x+b.lx*lb,bz=b.z+b.lz*lb,len=Math.hypot(bx-ax,bz-az)+.03,heading=Math.atan2(ax-bx,az-bz),x=(ax+bx)/2,z=(az+bz)/2,y=(a.y+b.y)/2;
    if(r.elevated){box('parapet',mats.concrete,x,y+.4,z,.42,.8,len,heading,ch);for(const h of [1.02,1.3])box('parapet-rail',mats.metal,x,y+h,z,.06,.06,len,heading,ch);box('parapet-post',mats.metal,x,y+1.03,z,.07,.55,.07,heading,ch);
     if(r.structure==='ramp'){const h=Math.max(.2,y-r.groundY);box('retained-ramp',mats.concrete,x,y-h/2,z,.55,h,len,heading,ch);}
    }else{const h=footpathHeight((s+e)/2);box('kerb',mats.concrete,x,y+h/2,z,.15,h,len,heading,ch);}
   }
  }
  for(let s=start+3;s<end;s+=34){let r=sample(s);if(inJunction(s)||STOPS.some(st=>Math.abs(st.s-s)<st.footprintLength/2+5))continue;for(const side of [-1,1]){
    let lat=side*(r.elevated?roadSection(s).right+.35:roadSection(s).right+2.7),p=at(s,lat);p.y=r.y;
    box('lamp',mats.metal,p.x,p.y+5,p.z,.12,10,.12,0,ch);
    box('arm',mats.metal,p.x-r.lx*side*1.5,p.y+9.85,p.z-r.lz*side*1.5,3.2,.1,.12,r.heading,ch);
    lampPositions.push({s,x:p.x-r.lx*side*2.9,y:p.y+9.6,z:p.z-r.lz*side*2.9});
    box('fixture',mats.lamp,p.x-r.lx*side*2.9,p.y+9.75,p.z-r.lz*side*2.9,.65,.12,1.2,r.heading,ch);
   }}
  for(let s=start+5;s<end;s+=11){const r=sample(s);if([...JUNCTIONS,...UNDERPASSES].some(j=>Math.abs(j.s-s)<j.halfWidth+12))continue;for(let side of [-1,1]){
   const stationNearby=STOPS.some(st=>Math.abs(st.s-s)<60);
   let lat=side*((side===-1?29:stationNearby?27:25)+rnd()*9),p=at(s,lat),h=5+rnd()*5;if(!sceneryClear(p.x,p.z,3))continue;
   batch('trunk',geo.cyl,trunk,new T.Vector3(p.x,p.y+h*.4,p.z),new T.Vector3(.19,h*.8,.19),new T.Euler(),ch);
   for(let j=0;j<13;j++){let a=rnd()*6.28,rad=rnd()*2.9,pos=new T.Vector3(p.x+Math.cos(a)*rad,p.y+h-1+rnd()*3,p.z+Math.sin(a)*rad);batch('foliage',geo.leaf,foliage,pos,new T.Vector3(4+rnd()*2,3.5+rnd()*2,1),new T.Euler((rnd()-.5)*1.6,a,0),ch);}
   if(s%2<1)box('planter',mats.concrete,p.x,p.y+.2,p.z,3,.4,3,0,ch);
  }}
  for(let s=start+15;s<end;s+=52){if([...JUNCTIONS,...UNDERPASSES].some(j=>Math.abs(j.s-s)<j.halfWidth+25))continue;for(let side of [-1,1]){
    const r=sample(s),lat=side*(48+rnd()*40),p=at(s,lat),zone=r.c<650?'residential':r.c<1250?'logistics':r.c<1900?'tech':r.c<2550?'village':r.c<3200?'boulevard':'construction',h=zone==='village'?6+rnd()*4:zone==='logistics'?8+rnd()*5:zone==='tech'?16+rnd()*18:18+rnd()*66,w=15+rnd()*15,d=16+rnd()*16,k=Math.floor(rnd()*4),radius=Math.hypot(w,d)/2;
    if(!sceneryClear(p.x,p.z,radius)||plots.some(q=>Math.hypot(q.x-p.x,q.z-p.z)<q.radius+radius+3))continue;plots.push({x:p.x,z:p.z,radius,zone});
    if(zone==='construction'){
     for(let y=0;y<h;y+=3.2){box('construction-slab',mats.concrete,p.x,p.y+y,p.z,w,.3,d,r.heading,ch);for(const x of [-w/2+1,w/2-1])for(const z of [-d/2+1,d/2-1]){const u=new T.Vector3(x,y+1.6,z).applyAxisAngle(new T.Vector3(0,1,0),r.heading).add(p);box('construction-column',mats.concrete,u.x,u.y,u.z,.6,3.2,.6,r.heading,ch);}}
     box('crane-mast',mats.teal,p.x,p.y+(h+10)/2,p.z,.8,h+10,.8,0,ch);box('crane-jib',mats.teal,p.x,p.y+h+9,p.z,w+10,.65,.8,r.heading,ch);box('crane-counterweight',mats.concrete,p.x,p.y+h+8,p.z,2,2,2,0,ch);
     continue;
    }
    box('building'+k,wallMats[k],p.x,p.y+h/2,p.z,w,h,d,r.heading,ch);
    // Distinct floor bands and recessed glazing give scale at street level.
    for(let y=3;y<h-1;y+=zone==='logistics'?20:3.2){for(let face of [-1,1]){
      let u=new T.Vector3(face*(w/2+.02),y,0).applyAxisAngle(new T.Vector3(0,1,0),r.heading).add(p);
      box('glass'+k,windowMats[k%3],u.x,u.y,u.z,.08,1.95,d*.84,r.heading,ch);
      u=new T.Vector3(0,y,face*(d/2+.02)).applyAxisAngle(new T.Vector3(0,1,0),r.heading).add(p);
      box('glass'+k,windowMats[k%3],u.x,u.y,u.z,w*.82,1.95,.08,r.heading,ch);
     }}
    for(let a=-w/2+2;a<w/2;a+=4){for(let face of [-1,1]){let u=new T.Vector3(a,h/2,face*(d/2+.08)).applyAxisAngle(new T.Vector3(0,1,0),r.heading).add(p);box('fin'+k,wallMats[k],u.x,u.y,u.z,.28,h,.3,r.heading,ch);}}
    if(zone==='logistics'){for(let n=-1;n<=1;n++){const u=new T.Vector3(n*w*.28,2,d/2+.03).applyAxisAngle(new T.Vector3(0,1,0),r.heading).add(p);box('loading-bay',mats.metal,u.x,u.y,u.z,3.5,4,.1,r.heading,ch);}}
    box('roof',mats.concrete,p.x,p.y+h+.2,p.z,w+.5,.4,d+.5,r.heading,ch);
  }}
 }
 for(const st of STOPS)for(const ds of [-30,0,30])for(const lat of [-9,9]){const p=at(st.s+ds,lat);lampPositions.push({s:st.s+ds,x:p.x,y:sample(st.s+ds).y+3.4,z:p.z});}
 const cycle=new T.Mesh(cycleGeometry(),new T.MeshStandardMaterial({color:0x286e58,roughness:.92,side:T.DoubleSide}));cycle.name='continuous-green-cycleway';cycle.receiveShadow=true;scene.add(cycle);
 for(const side of [-1,1]){const line=new T.Mesh(ribbon(0,LENGTH,s=>cycleOffset(s)+side*1.86-.045,s=>cycleOffset(s)+side*1.86+.045,s=>cycleHeight(s)+.018,true,cycleCrossing),mats.white);scene.add(line);}
 // White lane divider, direction arrows, cycle symbols and amber approach bands (user photo).
 for(let s=0;s<LENGTH-3;s+=6){if(cycleCrossing(s)||cycleCrossing(s+2))continue;const line=new T.Mesh(ribbon(s,s+2,s=>cycleOffset(s)-.045,s=>cycleOffset(s)+.045,q=>cycleHeight(q)+.018,true),mats.white);scene.add(line);}
 const label=document.createElement('canvas');label.width=128;label.height=256;const ctx=label.getContext('2d');ctx.strokeStyle='white';ctx.lineWidth=5;for(const x of [35,93]){ctx.beginPath();ctx.arc(x,172,23,0,Math.PI*2);ctx.stroke();}ctx.beginPath();ctx.moveTo(35,172);ctx.lineTo(51,133);ctx.lineTo(76,172);ctx.closePath();ctx.moveTo(51,133);ctx.lineTo(82,133);ctx.lineTo(93,172);ctx.moveTo(82,133);ctx.lineTo(88,117);ctx.stroke();ctx.fillStyle='white';ctx.font='65px sans-serif';ctx.fillText('↑',37,83);const signTex=new T.CanvasTexture(label),signMat=new T.MeshBasicMaterial({map:signTex,transparent:true,depthWrite:false});
 for(let s=25;s<LENGTH-5;s+=70){if(cycleCrossing(s))continue;const r=sample(s);for(const dir of [-1,1]){const mark=new T.Mesh(new T.PlaneGeometry(1.2,2.7),signMat);mark.rotation.set(-Math.PI/2,0,-r.heading+(dir===1?Math.PI:0));const lat=cycleOffset(s)+dir*.9;mark.position.set(r.x+r.lx*lat,r.groundY+cycleHeight(s)+.022,r.z+r.lz*lat);scene.add(mark);}}
 const blueSign=document.createElement('canvas');blueSign.width=blueSign.height=128;const bx=blueSign.getContext('2d');bx.fillStyle='#1763a0';bx.beginPath();bx.arc(64,64,61,0,Math.PI*2);bx.fill();bx.strokeStyle='white';bx.lineWidth=4;bx.stroke();bx.drawImage(label,0,105,128,110,5,44,63,55);bx.strokeStyle='white';bx.lineWidth=4;bx.beginPath();bx.moveTo(71,25);bx.lineTo(71,104);bx.moveTo(96,52);bx.lineTo(96,78);bx.moveTo(82,64);bx.lineTo(110,64);bx.moveTo(96,78);bx.lineTo(85,99);bx.moveTo(96,78);bx.lineTo(107,99);bx.stroke();bx.fillStyle='white';bx.beginPath();bx.arc(96,39,7,0,Math.PI*2);bx.fill();const blueMat=new T.MeshBasicMaterial({map:new T.CanvasTexture(blueSign),transparent:true,side:T.DoubleSide});
 for(const j of [...JUNCTIONS,...UNDERPASSES])for(const end of [-1,1]){const s=j.s+end*(j.halfWidth+9),r=sample(s),lat=cycleOffset(s),band=new T.Mesh(ribbon(s-1.4,s+1.4,q=>cycleOffset(q)-2,q=>cycleOffset(q)+2,q=>cycleHeight(q)+.018,true),new T.MeshStandardMaterial({color:0xbba24f}));scene.add(band);const p=at(s,lat-2.4),ch=Math.floor(s/240);box('cycle-sign-post',mats.metal,p.x,p.y+1.4,p.z,.07,2.8,.07,0,ch);const sign=new T.Mesh(new T.PlaneGeometry(.65,.65),blueMat);sign.position.set(p.x,p.y+2.5,p.z);sign.rotation.y=r.heading;scene.add(sign);}
 // Visible game boundary: stopping bay and barrier, not an invented extra station.
 const terminal=sample(LENGTH-3),endGroup=new T.Group();endGroup.name='northern-route-end';endGroup.position.set(terminal.x,terminal.y,terminal.z);endGroup.rotation.y=terminal.heading;scene.add(endGroup);
 const boardCanvas=document.createElement('canvas');boardCanvas.width=1024;boardCanvas.height=256;const bc=boardCanvas.getContext('2d');bc.fillStyle='#173d35';bc.fillRect(0,0,1024,256);bc.fillStyle='#fff3cd';bc.textAlign='center';bc.font='bold 62px sans-serif';bc.fillText('END OF LINE · 路線終點',512,110);bc.font='36px sans-serif';bc.fillText('Stop here · 請停車',512,185);const board=new T.Mesh(new T.PlaneGeometry(7,1.75),new T.MeshBasicMaterial({map:new T.CanvasTexture(boardCanvas),side:T.DoubleSide}));board.position.set(0,3,0);endGroup.add(board);
 for(const x of [-3.4,3.4]){const post=new T.Mesh(new T.BoxGeometry(.15,3.8,.15),mats.metal);post.position.set(x,1.9,0);endGroup.add(post);}for(let x=-3.5;x<3.5;x+=.7){const bar=new T.Mesh(new T.BoxGeometry(.7,.45,.35),new T.MeshStandardMaterial({color:Math.round((x+3.5)/.7)%2?0xf0c55b:0x283a37}));bar.position.set(x+.35,.8,0);endGroup.add(bar);}
 // Continuous corner footpaths join the corridor and crossing-road approaches.
 for(const j of [...JUNCTIONS,...UNDERPASSES]){const r=sample(j.s),g=new T.Group(),w=roadSection(j.s).right,h=j.halfWidth,R=6;g.name=(j.underpass?'underpass-':'junction-')+j.c;g.position.set(r.x,j.underpass?r.groundY:r.y,r.z);g.rotation.y=r.heading;scene.add(g);
  const slab=(width,depth,x,z,mat,y=.045)=>{const m=new T.Mesh(new T.BoxGeometry(width,.05,depth),mat);m.position.set(x,y-.025-(j.underpass?0:r.grade*z),z);m.receiveShadow=true;g.add(m);return m;};
  slab(j.extent*2,h*2,0,0,mats.road);
  for(const side of [-1,1]){if(j.c===3395&&side===1){slab(j.extent+5,3.75,(5-j.extent)/2,side*(h+1.875),mats.walk,.3);slab(j.extent-30,3.75,(j.extent+30)/2,side*(h+1.875),mats.walk,.3);}else slab(j.extent*2,3.75,0,side*(h+1.875),mats.walk,.3);for(let x=-j.extent;x<j.extent;x+=7)for(const lane of j.underpass?[-h/2,0,h/2]:[0])slab(3,.09,x,lane,mats.white,.079);}
  if(!j.underpass){
   // Remove the two continuous sidewalk slabs just created and rebuild with four corner returns.
   for(const child of [...g.children])if(child.material===mats.walk){g.remove(child);child.geometry.dispose();}
   for(const side of [-1,1])for(const bank of [-1,1])for(const [a,b] of [[w+R,w+8.5],[w+11.5,j.extent]])slab(b-a,3.75,side*(a+b)/2,bank*(h+1.875),mats.walk,.3);
   const shape=new T.Shape();shape.moveTo(-w,h+R);shape.lineTo(w,h+R);shape.lineTo(w,h+R);shape.absarc(w+R,h+R,R,Math.PI,Math.PI*1.5,false);shape.lineTo(w+R,-h);shape.absarc(w+R,-h-R,R,Math.PI/2,Math.PI,false);shape.lineTo(-w,-h-R);shape.absarc(-w-R,-h-R,R,0,Math.PI/2,false);shape.lineTo(-w-R,h);shape.absarc(-w-R,h+R,R,-Math.PI/2,0,false);shape.closePath();const roadGeo=new T.ShapeGeometry(shape,16);roadGeo.rotateX(-Math.PI/2);const road=new T.Mesh(roadGeo,mats.road);road.position.y=.07;g.add(road);
   for(const sx of [-1,1])for(const sz of [-1,1]){const pos=[],ids=[];for(let i=0;i<=16;i++)for(const rad of [R,R-3.75]){const a=i*Math.PI/32,x=sx*(w+R-rad*Math.cos(a)),z=sz*(h+R-rad*Math.sin(a));pos.push(x,.3-r.grade*z,z);}for(let i=0;i<16;i++){const a=i*2;ids.push(a,a+2,a+1,a+1,a+2,a+3);}const geo=new T.BufferGeometry();geo.setAttribute('position',new T.Float32BufferAttribute(pos,3));geo.setIndex(ids);geo.computeVertexNormals();const m=new T.Mesh(geo,new T.MeshStandardMaterial({map:paverTex,side:T.DoubleSide,roughness:.96}));m.name='connected-corner-footpath';g.add(m);}
   for(const side of [-1,1]){slab(w-.15,.25,-side*w/2,side*j.stop,mats.white,.09);slab(.25,h-.15,side*j.stop,side*h/2,mats.white,.09);
    for(let x=-w+.4;x<w;x+=1.1)slab(.55,3,x,side*(h+10),mats.white,.085);
    for(let z=-h+.4;z<h;z+=1.1)slab(3,.55,side*(w+10),z,mats.white,.085);
    // Crossing-road kerb ramps replace the flat sidewalk within a 3 m wheelchair route.
    for(const bank of [-1,1]){const x=side*(w+10),z=bank*(h+1.875),ramp=new T.Mesh(new T.PlaneGeometry(3,3.75),mats.walk);ramp.geometry.rotateX(-Math.PI/2);const p=ramp.geometry.attributes.position;for(let i=0;i<p.count;i++){const zz=p.getZ(i)+z;p.setY(i,.02+.28*Math.min(1,(Math.abs(zz)-h)/3.75)-r.grade*zz);}ramp.geometry.computeVertexNormals();ramp.position.set(x,.005,z);ramp.name='junction-wheelchair-ramp';g.add(ramp);}
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
  for(const side of [-1,1])part(c.extent*2,3.6,.55,0,-1.8,side*c.width/2,mats.concrete);
  const edge=roadSection(c.s),left=edge.left-3.75-4,right=edge.right+3.75,w=right-left;
  part(w,.5,c.width+1,-(left+right)/2,-.3,0,mats.concrete);
  for(const portal of [-right,-left]){for(let z=-c.width/2;z<=c.width/2;z+=c.width/3)part(.7,3.2,.5,portal,-1.85,z,mats.concrete);part(.75,.6,c.width+1,portal,-.25,0,mats.concrete);}
 }
 // L35 begins at D6 beside the dedicated corridor; the 4 m cycleway lies outboard.
 const bendStart=fromChainage(3310),join=sample(L35.end),bend=sample(bendStart),bp=at(bendStart,-l35Offset(bendStart));
 const bendCurve=new T.CubicBezierCurve3(bp,new T.Vector3(bp.x+bend.tx*45,bp.y,bp.z+bend.tz*45),new T.Vector3(join.x-join.lx*35,join.groundY,join.z-join.lz*35),new T.Vector3(join.x,join.groundY,join.z));
 for(const [side,mat,y] of [[0,mats.road,.07],[1,mats.walk,.3],[-1,mats.walk,.3]]){const w=side?3.75:L35.width,offset=s=>-l35Offset(s)+side*(L35.width/2+1.875),m=new T.Mesh(ribbon(L35.start,bendStart,s=>offset(s)-w/2,s=>offset(s)+w/2,y,true,side?s=>s<L35.start+JUNCTIONS.find(j=>j.name==='Road D6').halfWidth:false),mat);m.name=side?'L35 footpath':'Road L35';m.receiveShadow=true;scene.add(m);}
 for(let s=L35.start+15;s<bendStart;s+=7){const m=new T.Mesh(ribbon(s,Math.min(s+3,bendStart),s=>-l35Offset(s)-.05,s=>-l35Offset(s)+.05,.1,true),mats.white);scene.add(m);}
 for(let i=1;i<=32;i++){const a=bendCurve.getPoint((i-1)/32),b=bendCurve.getPoint(i/32),n=a.distanceTo(b),heading=Math.atan2(a.x-b.x,a.z-b.z);for(const [offset,w,mat] of [[0,L35.width,mats.road],[-5.525,3.75,mats.walk],[5.525,3.75,mats.walk]]){if(offset&&Math.abs(((a.x+b.x)/2-join.x)*join.tx+((a.z+b.z)/2-join.z)*join.tz)<UNDERPASSES.find(j=>j.c===3395).halfWidth+2)continue;const m=new T.Mesh(new T.BoxGeometry(w,.1,n+.3),mat);m.name='L35 turn beneath VB2';m.position.set((a.x+b.x)/2+Math.cos(heading)*offset,(a.y+b.y)/2+(offset?.3:.08),(a.z+b.z)/2-Math.sin(heading)*offset);m.rotation.y=heading;scene.add(m);}}
 // Open the D6 sidewalk across the connected L35 mouth.
 const d6=scene.getObjectByName('junction-2650');if(d6)for(const child of [...d6.children]){if(!child.isMesh||child.material.map!==paverTex)continue;child.updateMatrix();const original=child.geometry.index?child.geometry.toNonIndexed():child.geometry.clone(),p=original.attributes.position,points=[];for(let i=0;i<p.count;i++)points.push(new T.Vector3().fromBufferAttribute(p,i).applyMatrix4(child.matrix));if(!points.some(p=>p.x>0&&p.z<0))continue;
  const out=[],uv=[],lo=L35.offset-L35.width/2,hi=L35.offset+L35.width/2;
  const clip=(poly,bound,sign)=>{const result=[];for(let i=0;i<poly.length;i++){const a=poly[i],b=poly[(i+1)%poly.length],inside=sign*(a.x-bound)>=0,next=sign*(b.x-bound)>=0;if(inside)result.push(a);if(inside!==next)result.push(a.clone().lerp(b,(bound-a.x)/(b.x-a.x)));}return result;};
  for(let i=0;i<points.length;i+=3){const tri=points.slice(i,i+3),parts=tri.every(p=>p.z<0)?[clip(tri,lo,-1),clip(tri,hi,1)]:[tri];for(const poly of parts)for(let n=1;n<poly.length-1;n++)for(const v of [poly[0],poly[n],poly[n+1]]){out.push(v.x,v.y,v.z);uv.push(v.x/5,v.z/5);}}
  const geometry=new T.BufferGeometry();geometry.setAttribute('position',new T.Float32BufferAttribute(out,3));geometry.setAttribute('uv',new T.Float32BufferAttribute(uv,2));geometry.computeVertexNormals();const replacement=new T.Mesh(geometry,child.material);replacement.name=child.name;d6.remove(child);d6.add(replacement);original.dispose();}
 // Broad paved interchange plaza between A2 and the elevated railway station.
 const a2=STOPS[1],plaza=new T.Mesh(ribbon(a2.s-115,a2.s+125,-84,-17,.31,true),mats.walk);plaza.name='Hung Shui Kiu regional plaza';plaza.receiveShadow=true;scene.add(plaza);
 function landmarkBoard(text,p,heading,width=12){const c=document.createElement('canvas');c.width=1024;c.height=160;const x=c.getContext('2d');x.fillStyle='#173d35';x.fillRect(0,0,1024,160);x.fillStyle='#fff3d0';x.textAlign='center';x.font='bold 56px sans-serif';x.fillText(text,512,101);const m=new T.Mesh(new T.PlaneGeometry(width,width/6.4),new T.MeshBasicMaterial({map:new T.CanvasTexture(c),side:T.DoubleSide}));m.position.copy(p);m.rotation.y=heading;scene.add(m);return m;}
 for(let s=RAILWAY.start;s<RAILWAY.end;s+=8){const a=railSample(s),b=railSample(Math.min(s+8,RAILWAY.end)),dx=b.x-a.x,dz=b.z-a.z,n=Math.hypot(dx,dz),heading=Math.atan2(-dx,-dz),x=(a.x+b.x)/2,z=(a.z+b.z)/2,ch=Math.floor(s/240);
  box('MTR-viaduct',mats.concrete,x,a.y-.65,z,11,1.3,n+.08,heading,ch);
  for(const lat of [-5.2,5.2])box('MTR-parapet',mats.concrete,x+dz/n*lat,a.y+.55,z-dx/n*lat,.3,1.1,n+.08,heading,ch);
  for(const lat of [-2.85,-1.42,1.42,2.85])box('MTR-rail',mats.metal,x+dz/n*lat,a.y+.12,z-dx/n*lat,.075,.15,n+.08,heading,ch);
 }
 for(let s=RAILWAY.start+15;s<RAILWAY.end;s+=32){const p=railSample(s),r=sample(s),ch=Math.floor(s/240),h=p.y-1.3-r.groundY;if(channelDepth(p.x,p.z)>0||Math.abs(s-fromChainage(160))<18||Math.abs(s-UNDERPASSES[0].s)<22)continue;box('MTR-pier',mats.concrete,p.x,r.groundY+h/2,p.z,2.4,h,2.4,0,ch);}
 const rp=railSample(a2.s),ra=railSample(a2.s-2),rb=railSample(a2.s+2),rh=Math.atan2(ra.x-rb.x,ra.z-rb.z),stationGroup=new T.Group();stationGroup.name='Hung Shui Kiu Station';stationGroup.position.set(rp.x,sample(a2.s).groundY,rp.z);stationGroup.rotation.y=rh;scene.add(stationGroup);
 const glass=new T.MeshStandardMaterial({color:0x608590,metalness:.35,roughness:.3,transparent:true,opacity:.65}),h=rp.y-stationGroup.position.y;
 for(const [w,hh,d,x,y,z,mat] of [[33,1,220,0,h-.5,0,mats.concrete],[36,.7,224,0,h+7,0,mats.metal],[.3,6,218,-16,h+3,0,glass],[.3,6,218,16,h+3,0,glass],[25,5,42,-22,2.5,0,glass]]){const m=new T.Mesh(new T.BoxGeometry(w,hh,d),mat);m.position.set(x,y,z);m.castShadow=true;stationGroup.add(m);}
 for(let z=-100;z<=100;z+=20)for(const x of [-14,14]){const post=new T.Mesh(new T.BoxGeometry(.8,h+7,.8),mats.concrete);post.position.set(x,(h+7)/2,z);stationGroup.add(post);}
 const sign=landmarkBoard('洪水橋站  HUNG SHUI KIU',new T.Vector3(rp.x,rp.y+4,rp.z),rh-Math.PI/2,27);sign.position.add(new T.Vector3(-18,0,0).applyAxisAngle(new T.Vector3(0,1,0),rh));
 for(const ds of [-80,0,80]){const p=at(a2.s+ds,-42),ch=Math.floor((a2.s+ds)/240);box('plaza-bench',mats.metal,p.x,p.y+.75,p.z,3,.15,.8,sample(a2.s).heading,ch);lampPositions.push({s:a2.s+ds,x:p.x,y:p.y+6,z:p.z});box('plaza-lamp',mats.metal,p.x,p.y+3,p.z,.1,6,.1,0,ch);box('plaza-light',mats.lamp,p.x,p.y+6,p.z,.6,.2,.6,0,ch);}
 // A 30 m access opening leads into the one-storey depot and apron on the left.
 const dr=sample(DEPOT.s),depotGroup=new T.Group();depotGroup.name='SGMTS depot';depotGroup.position.set(dr.x,dr.y,dr.z);depotGroup.rotation.y=dr.heading;scene.add(depotGroup);
 const apron=new T.Mesh(new T.BoxGeometry(DEPOT.width,.12,DEPOT.length),mats.road);apron.position.set(-DEPOT.lateral,.02,0);apron.receiveShadow=true;depotGroup.add(apron);
 const access=new T.Mesh(ribbon(DEPOT.s-15,DEPOT.s+15,s=>roadSection(s).right,55,.04,true),mats.road);access.name='30m depot entrance';scene.add(access);
 for(const [w,h,d,x,y,z,mat] of [[58,8,130,-123,4,0,mats.concrete],[61,.6,134,-123,8.3,0,mats.metal]]){const m=new T.Mesh(new T.BoxGeometry(w,h,d),mat);m.position.set(x,y,z);m.castShadow=true;depotGroup.add(m);}
 for(let z=-40;z<=40;z+=20){const door=new T.Mesh(new T.BoxGeometry(.15,5.5,9),mats.metal);door.position.set(-93.9,2.75,z);depotGroup.add(door);}
 for(const along of [-60,60])for(const lat of [30,85]){const p=new T.Vector3(dr.x+dr.lx*lat+dr.tx*along,dr.y,dr.z+dr.lz*lat+dr.tz*along),ch=Math.floor(DEPOT.s/240);box('depot-light-pole',mats.metal,p.x,p.y+4,p.z,.15,8,.15,0,ch);box('depot-light',mats.lamp,p.x,p.y+8,p.z,.8,.15,.8,0,ch);lampPositions.push({s:DEPOT.s,x:p.x,y:p.y+8,z:p.z});}
 const dp=at(DEPOT.s,94);dp.y+=7;landmarkBoard('SGMTS 車廠  DEPOT',dp,dr.heading+Math.PI/2,30);
 // Road D1 connects the at-grade junction after A7 to its northern bridge crossing.
 for(let i=1;i<D1ROAD.length;i++){const a=D1ROAD[i-1],b=D1ROAD[i],n=Math.hypot(b.x-a.x,b.z-a.z),heading=Math.atan2(a.x-b.x,a.z-b.z);for(const [offset,w,mat,y] of [[0,18,mats.road,.025],[-10.875,3.75,mats.walk,.3],[10.875,3.75,mats.walk,.3],...(i%2?[[0,.1,mats.white,.09]]:[])]){const m=new T.Mesh(new T.BoxGeometry(w,.1,n+.3),mat);m.name='Road D1 connecting alignment';m.position.set((a.x+b.x)/2+Math.cos(heading)*offset,(a.y+b.y)/2+y,(a.z+b.z)/2-Math.sin(heading)*offset);m.rotation.set(Math.atan2(b.y-a.y,n),heading,0,'YXZ');m.receiveShadow=true;scene.add(m);}}

 for(const [key,b] of Object.entries(instances)){if(/^(trunk|foliage|planter)-/.test(key))b.matrices=b.matrices.filter(m=>plots.every(p=>Math.hypot(m.elements[12]-p.x,m.elements[14]-p.z)>p.radius+2));if(!b.matrices.length)continue;const mesh=new T.InstancedMesh(b.geometry,b.material,b.matrices.length);b.matrices.forEach((m,i)=>mesh.setMatrixAt(i,m));mesh.receiveShadow=true;mesh.castShadow=b.material!==foliage;groups[b.chunk]?.add(mesh);}
 // The source-dimensioned A1 annular driving area is rendered as well as simulated.
 const ringGeo=new T.RingGeometry(LOOP.innerRadius,LOOP.outerRadius,96);ringGeo.rotateX(-Math.PI/2);const ring=new T.Mesh(ringGeo,mats.road);ring.position.set(LOOP.center.x,LOOP.y+.02,LOOP.center.z);ring.receiveShadow=true;scene.add(ring);
 const island=new T.Mesh(new T.CylinderGeometry(LOOP.innerRadius-.2,LOOP.innerRadius-.2,.35,64),mats.grass);island.position.set(LOOP.center.x,LOOP.y+.15,LOOP.center.z);island.receiveShadow=true;scene.add(island);
 const st=STOPS[0],r=sample(st.s),throat=new T.Group();throat.name='A1-connected-throat';throat.position.set(r.x,r.y,r.z);throat.rotation.y=r.heading;scene.add(throat);
 const shape=new T.Shape();shape.moveTo(-7.05,25);shape.lineTo(-15.37,44.8);shape.lineTo(-14.28,47.55);shape.lineTo(14.28,47.55);shape.lineTo(15.37,44.8);shape.lineTo(7.05,25);shape.closePath();const tie=new T.ShapeGeometry(shape);tie.rotateX(Math.PI/2);const tieMesh=new T.Mesh(tie,new T.MeshStandardMaterial({map:roadTex,roughness:.91,side:T.DoubleSide}));tieMesh.position.y=.012;throat.add(tieMesh);
 const outerWalk=new T.Mesh(new T.RingGeometry(LOOP.outerRadius,LOOP.outerRadius+3.75,96,1,Math.atan2(-r.tz,r.tx)+Math.PI/3,Math.PI*4/3),mats.walk);outerWalk.geometry.rotateX(-Math.PI/2);outerWalk.position.set(LOOP.center.x,LOOP.y+.3,LOOP.center.z);scene.add(outerWalk);
 // Connect both platform access ramps to the loop footpath without crossing its carriageway.
 for(const side of [-1,1]){const g=new T.BufferGeometry(),v=[];for(const [x,z,y] of [[15.37,44.8,.02],[20.37,44.8,.02],[20.568,49.675,.30],[17.321,51.55,.30]])v.push(r.x+r.lx*x*side-r.tx*z,r.y+y,r.z+r.lz*x*side-r.tz*z);g.setAttribute('position',new T.Float32BufferAttribute(v,3));g.setIndex(side===1?[0,2,1,0,3,2]:[0,1,2,0,2,3]);g.computeVertexNormals();const m=new T.Mesh(g,new T.MeshStandardMaterial({map:paverTex,roughness:.96,side:T.DoubleSide}));m.name='A1-loop-footpath-link-'+side;scene.add(m);}
 // Distant hills: a continuous ridgeline, well outside the traced corridor.
 const hillMat=new T.MeshStandardMaterial({color:0x65765c,roughness:1});
 for(let i=0;i<26;i++){let r=sample(LENGTH*i/25),hill=new T.Mesh(new T.SphereGeometry(1,18,12),hillMat);hill.position.set(r.x-450-rnd()*280,r.groundY-25,r.z);hill.scale.set(210+rnd()*160,80+rnd()*130,260);if(sceneryClear(hill.position.x,hill.position.z,Math.max(hill.scale.x,hill.scale.z)+20))scene.add(hill);}
 return {groups,plots,lampPositions,nightMaterials:[mats.lamp,...windowMats],materials:mats,update(s){for(const g of groups)g.visible=Math.abs(g.userData.s-s)<850;},weather(wet){mats.road.roughness=wet?.32:.91;mats.road.color.set(wet?0x9da8ac:0xffffff);}};
}
