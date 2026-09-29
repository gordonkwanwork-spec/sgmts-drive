import {parkLamp} from './street/park-lamp.js';
import * as T from 'three';
import {mergeGeometries} from 'three/addons/utils/BufferGeometryUtils.js';
import {FontLoader} from 'three/addons/loaders/FontLoader.js';
import {TextGeometry} from 'three/addons/geometries/TextGeometry.js';
import fontData from 'three/examples/fonts/helvetiker_bold.typeface.json' with {type:'json'};
import {STOPS,sample,project,JUNCTIONS,CROSSINGS} from './alignment.js';

// Pixel bounds of the selected GPT artwork; sample inside the photographed frames.
export const ART_RECTS=[[32,58,469,242],[530,57,480,244],[1046,44,474,257],[111,363,293,426],[629,364,275,424],[1137,365,285,421],[24,847,467,153],[532,846,475,155],[1040,846,480,153]];
export const LIGHTBOX_SITES=[[-96,-29],[-65,-69],[-32,-29],[-15,-69],[16,-29],[22,-69],[65,-29],[70,-69],[101,-29]];
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
 for(let i=0;i<fences.length;i+=3){const first=fences[i],middle=fences[i+1],last=fences[i+2];if(!last||Math.hypot(first.bx-middle.ax,first.bz-middle.az)>.05||Math.hypot(middle.bx-last.ax,middle.bz-last.az)>.05||Math.abs(first.y-last.y)>.15)continue;const f={...first,bx:last.bx,bz:last.bz},p=bannerSite(f);if(p)candidates.push({...p,f});}
 const selected=[],near=(p,t)=>{const r=sample(t.s);return Math.hypot(p.x-r.x,p.z-r.z)<t.radius;};
 for(const target of BANNER_TARGETS){const r=sample(target.s),ranked=candidates.filter(p=>near(p,target)).sort((a,b)=>Math.hypot(a.x-r.x,a.z-r.z)-Math.hypot(b.x-r.x,b.z-r.z));
  for(const p of ranked){if(selected.filter(q=>near(q,target)).length>=2)break;if(selected.includes(p)||selected.some(q=>Math.hypot(p.x-q.x,p.z-q.z)<6)||BANNER_TARGETS.some(t=>near(p,t)&&selected.filter(q=>near(q,t)).length>=2))continue;selected.push(p);}
 }
 return selected;
}
export function createPlazaAssets(){
 const atlas=new T.TextureLoader().load(import.meta.env.BASE_URL+'assets/plaza/hk-adverts.png');atlas.colorSpace=T.SRGBColorSpace;atlas.anisotropy=8;
 const materials=ART_RECTS.map(()=>new T.MeshStandardMaterial({map:atlas,emissiveMap:atlas,emissive:0xffffff,roughness:.8}));
 const metal=new T.MeshStandardMaterial({color:0x39434a,roughness:.65});
 const lens=new T.MeshStandardMaterial({color:0xffefd7,emissive:0xffefd7});
 const solid=color=>new T.MeshStandardMaterial({color,roughness:.75,emissive:color,emissiveIntensity:0});
 const white=solid(0xece9dc),yellow=solid(0xfbc73b),wood=solid(0xa87743),green=solid(0x528045),blue=solid(0x168ea9),red=solid(0xc85a43);
 const colors=[solid(0x16b5ff),solid(0xf239ae),solid(0xffcd35)];
 function part(root,name,geometry,material,x=0,y=0,z=0){const m=new T.Mesh(geometry,material);m.name=name;m.position.set(x,y,z);m.castShadow=m.receiveShadow=true;root.add(m);if(name.endsWith('activity paving')){m.updateWorldMatrix(true,false);const a=geometry.attributes.position;for(let i=0;i<a.count;i++){const v=new T.Vector3().fromBufferAttribute(a,i).applyMatrix4(m.matrixWorld);a.setY(i,a.getY(i)+sample(project(v.x,v.z)).groundY-(root.position.y-.32));}geometry.computeVertexNormals();}return m;}
 const box=(root,name,mat,x,y,z,w,h,d)=>part(root,name,new T.BoxGeometry(w,h,d),mat,x,y,z);
 function artwork(root,id,w,h,x,y,z,angle=0){const g=new T.PlaneGeometry(w,h),uv=g.attributes.uv,[px,py,pw,ph]=ART_RECTS[id];for(let i=0;i<uv.count;i++)uv.setXY(i,(px+uv.getX(i)*pw)/1536,1-(py+(1-uv.getY(i))*ph)/1024);const m=part(root,'HK artwork '+id,g,materials[id],x,y,z);m.rotation.y=angle;return m;}
 function board(parent,id,w,h,pos,heading,name){const g=new T.Group();g.name=name;g.position.copy(pos);g.rotation.y=heading;parent.add(g);box(g,'Advert frame',metal,0,0,0,w+.16,h+.16,.18);artwork(g,id,w,h,0,0,.101);return g;}
 function lamps(g,w,h){for(const x of [-w*.32,w*.32]){box(g,'Advert floodlight arm',metal,x,h/2+.2,.36,.06,.06,.7);box(g,'Advert floodlight',metal,x,h/2+.15,.69,.36,.13,.2);box(g,'Advert lamp lens',lens,x,h/2+.075,.69,.3,.025,.16);}}
 return {materials,board,lamps,
 setNight(on){materials.forEach((m,i)=>m.emissiveIntensity=on?(i>=6?.65:.85):0);lens.emissiveIntensity=on?1.5:0;[white,yellow,wood,green,blue,red].forEach(m=>m.emissiveIntensity=on?.2:0);colors.forEach(m=>m.emissiveIntensity=on?1:.08);},
 build(scene,{fences,lampPositions,kit,batch,mats}){
 const a2=STOPS[1],root=new T.Group();root.name='A2 furnished plaza';scene.add(root);
 const at=(ds,lat,y=.32)=>{const r=sample(a2.s+ds);return new T.Vector3(r.x+r.lx*lat,r.groundY+y,r.z+r.lz*lat);};
 const orient=sample(a2.s).heading-Math.PI/2;
 const local=(name,ds,lat)=>{const g=new T.Group();g.name=name;g.position.copy(at(ds,lat));g.rotation.y=orient;root.add(g);return g;};
 const lamp=(ds,lat)=>{const p=parkLamp(batch,at(ds,lat),5.5,mats.lamp,Math.floor((a2.s+ds)/240));lampPositions.push({s:a2.s+ds,x:p.x,y:p.y,z:p.z});};
 for(const [i,[ds,lat]] of LIGHTBOX_SITES.entries()){const p=at(ds,lat,1.9),g=board(root,3+i%3,1.35,2.1,p,orient,'A2 plaza lightbox');artwork(g,3+i%3,1.35,2.1,0,0,-.101,Math.PI);box(g,'Lightbox base',metal,0,-1.42,0,1.65,.25,.65);box(g,'Lightbox pedestal',metal,0,-1.2,0,.9,.35,.2);lampPositions.push({s:a2.s+ds,x:p.x,y:p.y+1,z:p.z});}
 const letters=local('Hung Shui Kiu landmark',-80,-52);box(letters,'Blue activity paving',blue,0,-.005,0,31,.035,10);
 const font=new FontLoader().parse(fontData);const words=['HUNG','SHUI','KIU'].map(word=>{const g=new TextGeometry(word,{font,size:2.2,depth:.25,curveSegments:3,bevelEnabled:false});g.computeBoundingBox();return g;});let cursor=-(words.reduce((sum,g)=>sum+g.boundingBox.max.x,0)+2)/2;
 for(const [i,word] of ['HUNG','SHUI','KIU'].entries()){const geo=words[i];part(letters,'Landmark letters '+word,geo,colors[i],cursor,at(-80-cursor,-52).y-letters.position.y+.08,0);cursor+=geo.boundingBox.max.x+1;}
 // Native canvas is used only for the place name; advertising remains the selected GPT artwork.
 const c=document.createElement('canvas');c.width=768;c.height=180;const ctx=c.getContext('2d');ctx.fillStyle='#e8faff';ctx.font='bold 135px "PingFang HK",sans-serif';ctx.textAlign='center';ctx.fillText('洪水橋',384,140);const tex=new T.CanvasTexture(c);tex.colorSpace=T.SRGBColorSpace;part(letters,'Chinese place name',new T.PlaneGeometry(5.5,1.3),new T.MeshBasicMaterial({map:tex,transparent:true,side:T.DoubleSide}),0,4.2,.32);
 const play=local('Circular seating garden',-24,-52);box(play,'Red activity paving',red,0,0,0,23,.04,14);
 for(const [x,y] of [[-6,1.8],[-2,1.8],[2,1.8],[6,1.8],[-4,5.2],[0,5.2],[4,5.2]]){const ring=part(play,'White seating ring',new T.TorusGeometry(1.65,.22,8,32),white,x,y,0);ring.scale.z=2;box(play,'Ring seat',yellow,x,y-1.2,0,2.1,.18,1);}
 for(const x of [-8,0,8]){const seat=part(play,'Curved yellow lounger',new T.TorusGeometry(1.2,.28,8,24,Math.PI*1.25),yellow,x,.65,4.8);seat.rotation.x=Math.PI/2;}
 for(const ds of [-100,-60,-10,20,65,100])for(const lat of [-36,-76]){const g=local('Plaza planted seating',ds,lat);box(g,'Raised planter',white,0,.35,0,5,.7,3);box(g,'Planter soil',green,0,.72,0,4.6,.08,2.6);box(g,'Timber bench',wood,0,.5,2.1,4,.18,.8);for(const x of [-1.6,1.6])box(g,'Bench leg',metal,x,.22,2.1,.13,.45,.65);
 const p=at(ds,lat,.95),ch=Math.floor((a2.s+ds)/240);kit('vegetation_shrub',p,0,new T.Vector3(2,1.5,2),ch);box(g,'Tree trunk',wood,0,2.4,0,.3,3.4,.3);for(const [x,y,z,r] of [[0,4.8,0,2],[-1.1,4.3,0,1.5],[1.2,4.5,.4,1.5]])part(g,'Plaza tree crown',new T.IcosahedronGeometry(r,1),green,x,y,z);
 if(ds===-60||ds===65){for(const x of [-3,3])for(const z of [-1.8,3])box(g,'Pergola post',metal,x,1.75,z,.14,3.5,.14);for(let x=-3.4;x<=3.4;x+=.45)box(g,'Pergola slat',wood,x,3.55,.6,.22,.16,5.5);}
 kit('litter_bin',at(ds+4,lat),orient,null,ch);lamp(ds+5,lat);}
 for(const [ds,lat] of [[-85,-58],[-75,-46],[-28,-59],[-20,-45],[40,-61],[40,-35]])lamp(ds,lat);
 const cycle=local('Plaza cycle parking',-104,-60);for(let x=-5;x<=5;x+=2){const hoop=part(cycle,'Cycle parking hoop',new T.TorusGeometry(.5,.045,6,16,Math.PI),metal,x,.65,0);for(const side of [-1,1])box(cycle,'Cycle stand leg',metal,x+side*.5,.325,0,.09,.65,.09);}
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
