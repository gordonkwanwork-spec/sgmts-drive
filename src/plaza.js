import {parkLamp} from './street/park-lamp.js';
import * as T from 'three';
import {mergeGeometries} from 'three/addons/utils/BufferGeometryUtils.js';
import {worldCoordinates, pavingY, rail, benches} from './a2-site.js';
import {STOPS,sample,project,JUNCTIONS,CROSSINGS} from './alignment.js';
import {chessSet} from './a2-chess.js';

// Pixel bounds of the selected GPT artwork; sample inside the photographed frames.
export const ART_RECTS=[[32,58,469,242],[530,57,480,244],[1046,44,474,257],[111,363,293,426],[629,364,275,424],[1137,365,285,421],[24,847,467,153],[532,846,475,155],[1040,846,480,153]];
export const LIGHTBOX_SITES=[[-71,75],[-59,45],[-22,32],[-22,-32],[-58,-61],[-62,-85]];
export function bannerSite(f){
 const x=(f.ax+f.bx)/2,z=(f.az+f.bz)/2,s=project(x,z),length=Math.hypot(f.bx-f.ax,f.bz-f.az);
 if(length<1.25||length>5||f.top<.9||CROSSINGS.some(c=>Math.abs(c.s-s)<10)||JUNCTIONS.some(j=>Math.abs(j.s-s)<j.halfWidth+18))return null;
 return {x,z,s,length,heading:Math.atan2(f.bx-f.ax,f.bz-f.az)+Math.PI/2};
}
// Shared nearby targets reuse the same pair instead of stacking more banners.
export const BANNER_TARGETS=[
 ...CROSSINGS.map(c=>({s:c.s,radius:30,name:'crossing '+c.station})),
 ...JUNCTIONS.map(j=>({s:j.s,radius:j.halfWidth+38,name:'intersection '+j.name})),
 ...STOPS.flatMap(st=>[-1,1].map(dir=>({s:st.s+dir*44.8+(dir<0?Math.min(...st.platforms.map(p=>p.centerOffset)):Math.max(...st.platforms.map(p=>p.centerOffset))),radius:45,name:st.id+' end '+dir})))
];
export function selectBannerSites(fences){
 const candidates=[];
 for(let i=0;i<fences.length;i+=3){const first=fences[i],middle=fences[i+1],last=fences[i+2];if(!last||first.wall||Math.hypot(first.bx-middle.ax,first.bz-middle.az)>.05||Math.hypot(middle.bx-last.ax,middle.bz-last.az)>.05||Math.abs(first.y-last.y)>.15)continue;const f={...first,bx:last.bx,bz:last.bz},p=bannerSite(f);if(p)candidates.push({...p,f});}
 const selected=[],near=(p,t)=>{const r=sample(t.s);return Math.hypot(p.x-r.x,p.z-r.z)<t.radius;};
 for(const target of BANNER_TARGETS){const r=sample(target.s),ranked=candidates.filter(p=>near(p,target)).sort((a,b)=>Math.hypot(a.x-r.x,a.z-r.z)-Math.hypot(b.x-r.x,b.z-r.z));
  for(const p of ranked){if(selected.filter(q=>near(q,target)).length>=2)break;if(selected.includes(p)||selected.some(q=>Math.hypot(p.x-q.x,p.z-q.z)<6)||BANNER_TARGETS.some(t=>near(p,t)&&selected.filter(q=>near(q,t)).length>=2))continue;selected.push(p);}
 }
 return selected;
}
export function createPlazaAssets(){
 const atlas=new T.TextureLoader().load((import.meta.env?.BASE_URL??'/')+'assets/plaza/hk-adverts.webp');atlas.colorSpace=T.SRGBColorSpace;atlas.anisotropy=8;
 const materials=ART_RECTS.map(()=>new T.MeshStandardMaterial({map:atlas,emissiveMap:atlas,emissive:0xffffff,roughness:.8,polygonOffset:true,polygonOffsetFactor:-2,polygonOffsetUnits:-2}));
 const metal=new T.MeshStandardMaterial({color:0x39434a,roughness:.65});
 const lens=new T.MeshStandardMaterial({color:0xffefd7,emissive:0xffefd7});
 const solid=color=>new T.MeshStandardMaterial({color,roughness:.75,emissive:color,emissiveIntensity:0});
 const white=solid(0xece9dc),wood=solid(0x966f50);
 function part(root,name,geometry,material,x=0,y=0,z=0){const m=new T.Mesh(geometry,material);m.name=name;m.position.set(x,y,z);m.castShadow=m.receiveShadow=true;root.add(m);return m;}
 const box=(root,name,mat,x,y,z,w,h,d)=>part(root,name,new T.BoxGeometry(w,h,d),mat,x,y,z);
 function artwork(root,id,w,h,x,y,z,angle=0){const g=new T.PlaneGeometry(w,h),uv=g.attributes.uv,[px,py,pw,ph]=ART_RECTS[id];for(let i=0;i<uv.count;i++)uv.setXY(i,(px+uv.getX(i)*pw)/1536,1-(py+(1-uv.getY(i))*ph)/1024);const m=part(root,'HK artwork '+id,g,materials[id],x,y,z);m.rotation.y=angle;return m;}
 function board(parent,id,w,h,pos,heading,name){const g=new T.Group();g.name=name;g.position.copy(pos);g.rotation.y=heading;parent.add(g);box(g,'Advert frame',metal,0,0,0,w+.16,h+.16,.18);artwork(g,id,w,h,0,0,.13);return g;}
 function lamps(g,w,h){for(const x of [-w*.32,w*.32]){box(g,'Advert floodlight arm',metal,x,h/2+.2,.36,.06,.06,.7);box(g,'Advert floodlight',metal,x,h/2+.15,.69,.36,.13,.2);box(g,'Advert lamp lens',lens,x,h/2+.075,.69,.3,.025,.16);}}
 return {materials,board,lamps,
 setNight(on){materials.forEach((m,i)=>m.emissiveIntensity=on?(i>=6?.65:.85):0);lens.emissiveIntensity=on?1.8:0;white.emissiveIntensity=on?.18:0;wood.emissiveIntensity=on?.26:0;metal.emissive.setHex(on?0x566068:0);metal.emissiveIntensity=on?.18:0;},
 build(scene,{fences,lampPositions,batch,mats}){
 const root=new T.Group();root.name='A2 furnished plaza';scene.add(root);
 const at=(x,z,height=0)=>{const p=worldCoordinates(x,z);return new T.Vector3(p.x,pavingY(x,z)+height,p.z);};
 const orient=rail.heading;
 const local=(name,x,z)=>{const g=new T.Group();g.name=name;g.position.copy(at(x,z));g.rotation.y=orient;root.add(g);return g;};
 for(const [i,[x,z]] of LIGHTBOX_SITES.entries()){
  const p=at(x,z,1.4),g=board(root,3+i%3,1.15,1.8,p,orient,'A2 plaza lightbox');
  artwork(g,3+i%3,1.15,1.8,0,0,-.13,Math.PI);box(g,'Pedestal',metal,0,-1.12,0,.95,.56,.24);
  lampPositions.push({s:project(p.x,p.z),x:p.x,y:p.y+1,z:p.z});
 }
 for(const [x,z] of benches){
  const g=local('Promenade bench',x,z);
  for(const offset of [-.22,0,.22])box(g,'Timber slat',wood,0,.47,offset,3.4,.07,.205);
  for(const end of [-1.34,1.34])box(g,'Bench support',metal,end,.22,0,.12,.44,.7);
 }
 for(const [x,z] of [[-64,53],[-28,32],[-61,-21],[-28,-75]]){
  const g=local('Plaza chess pergola',x,z);
  g.add(chessSet());for(const px of [-2.9,2.9])for(const pz of [-2.2,2.2])box(g,'Steel column',metal,px,1.7,pz,.13,3.4,.13);
  for(const px of [-2.9,2.9])box(g,'Edge beam',metal,px,3.4,0,.16,.22,5.4);
  for(let pz=-2.8;pz<=2.8;pz+=.37)box(g,'Shade louvre',wood,0,3.55,pz,6.7,.18,.22);
  box(g,'Pergola lamp',lens,0,3.32,0,3.4,.06,.16);
 }
 for(const x of [-71,-22])for(const z of [-85,-56,-25,6,38,69,99]){
  if(x===-71&&(z===-56||z===-85))continue;
  const p=at(x,z),s=project(p.x,p.z),ch=Math.floor(s/240),head=parkLamp(batch,p,4.7,mats.lamp,ch);
  lampPositions.push({s,x:head.x,y:head.y,z:head.z});
 }
 const cycle=local('Plaza cycle parking',-76,98);
 for(let x=-3;x<=3;x+=1.5){
  part(cycle,'Cycle parking hoop',new T.TorusGeometry(.48,.045,6,16,Math.PI),metal,x,.55,0);
  for(const side of [-1,1])box(cycle,'Cycle stand leg',metal,x+side*.48,.275,0,.09,.55,.09);
 }
 // Banners attach to actual fence panels, so existing crossing/access gaps remain open.
 const bannerGroups=new Map();let count=0;
 const bannerSites=selectBannerSites(fences);
 for(const p of bannerSites){const f=p.f;const ch=Math.floor(p.s/240);if(!bannerGroups.has(ch)){const g=new T.Group();g.name='Station approach banners';g.userData.s=ch*240+120;scene.add(g);bannerGroups.set(ch,g);}const parent=bannerGroups.get(ch),g=new T.Group();g.name='Fence banner';g.position.set(p.x,f.y+.52,p.z);g.rotation.y=p.heading;parent.add(g);const w=p.length-.14;artwork(g,6+count%3,w,.72,0,0,.065);artwork(g,6+count%3,w,.72,0,0,-.065,Math.PI);
 for(const x of [-w/2,w/2])for(const y of [-.36,.36]){const eye=part(g,'Banner eyelet',new T.TorusGeometry(.032,.009,4,8),white,x,y,.077);box(g,'Banner cable tie',white,x,y+.035,0,.012,.09,.17);}box(g,'Banner lamp arm',metal,0,.6,0,.055,.055,.46);box(g,'Banner downlight',lens,0,.56,.2,.25,.055,.14);count++;}
 // Merge repeated banner fixtures per corridor chunk: no extra realtime lights or per-eyelet draw calls.
 for(const parent of bannerGroups.values()){
  parent.updateMatrixWorld(true);const buckets=new Map();parent.traverse(m=>{if(!m.isMesh)return;const key=m.material;if(!buckets.has(key))buckets.set(key,[]);buckets.get(key).push(m.geometry.clone().applyMatrix4(m.matrixWorld));});
  parent.clear();for(const [material,geometries] of buckets){const mesh=new T.Mesh(mergeGeometries(geometries),material);mesh.name='Fence banner surfaces';parent.add(mesh);geometries.forEach(g=>g.dispose());}
 }
 root.userData.lightboxes=LIGHTBOX_SITES.length;root.userData.bannerCount=count;root.userData.bannerSites=bannerSites.map(({x,z,s})=>({x,z,s}));
 return {root,bannerGroups:[...bannerGroups.values()]};
 }};
}
