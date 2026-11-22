import assert from 'node:assert/strict';
import {ART_RECTS,LIGHTBOX_SITES,bannerSite} from '../plaza.js';
import {STOPS,sample,CROSSINGS,JUNCTIONS} from '../alignment.js';
import {portalZ,portalX,portalDirection,portalLevel,stairCount,riser,halfRun,worldCoordinates,pavingY,frontage,zMin,zMax} from '../a2-site.js';
import {groundAt} from '../onfoot.js';
assert.equal(ART_RECTS.length,9);
for(const [x,y,w,h] of ART_RECTS)assert(x>=0&&y>=0&&w>0&&h>0&&x+w<=1536&&y+h<=1024);
for(const [x,z] of LIGHTBOX_SITES){
 assert(z>zMin&&z<zMax&&x>frontage(z).x&&x<-16,'Advert sits inside the pedestrian square');
 assert(Math.hypot(x+47,z+32)>13,'Fountain court stays clear');
 for(const c of portalZ)assert(Math.hypot(x-portalX,z-c)>10,'Entrance stays clear');
 const p=worldCoordinates(x,z);assert(Math.abs(groundAt(p.x,p.z).y-pavingY(x,z))<.01);
}
for(const c of portalZ){
 let y=portalLevel(c);
 for(let d=halfRun+.2;d>=-halfRun-.5;d-=.15){
  const p=worldCoordinates(portalX,c+d*portalDirection(c)),next=groundAt(p.x,p.z,STOPS[1].s,y).y;
  assert(Math.abs(next-y)<riser+.04,'A continuous flight from the square into the shared passage');y=next;
 }
 assert(Math.abs(y-portalLevel(c)+stairCount*riser)<.02);
}
const centre=worldCoordinates(portalX,0);
assert(groundAt(centre.x,centre.z).y-groundAt(centre.x,centre.z,STOPS[1].s,-1).y>3.5,'Square remains walkable above the underground passage');
const panel=s=>{const a=sample(s-.75),b=sample(s+.75);return {ax:a.x+a.lx*15,az:a.z+a.lz*15,bx:b.x+b.lx*15,bz:b.z+b.lz*15,y:a.groundY,top:1};};
for(const c of CROSSINGS)assert.equal(bannerSite(panel(c.s)),null,'No banner beside crossing');
for(const j of JUNCTIONS)assert.equal(bannerSite(panel(j.s)),null,'No banner at junction');
assert.equal(bannerSite({...panel(STOPS[1].s),top:.5}),null);
assert(STOPS.some(st=>[-130,-100,100,130].some(ds=>bannerSite(panel(st.s+ds)))),'Eligible approach fences carry banners');
console.log('Plaza artwork, plaza-only lightboxes, walking height and banner crossing exclusions passed');

// Real editable railing runs: density is capped around every requested landmark,
// even where a station end, crossing and junction are close together.
const {readFileSync}=await import('node:fs');
const {Vector3}=await import('three');
const {runPoints,railingBuilder}=await import('../street/furniture.js');
const {BANNER_TARGETS,selectBannerSites}=await import('../plaza.js');
const furniture=JSON.parse(readFileSync(new URL('../../public/street/furniture.json',import.meta.url))),fences=[];
const {railRun}=railingBuilder({batch:()=>{},kitParts:()=>[],fences});
for(const run of furniture.runs.filter(i=>i.type==='railing'))railRun(runPoints(run).map(p=>new Vector3(p.x,p.y,p.z)),()=>0);
const selected=selectBannerSites(fences),near=(p,t)=>{const r=sample(t.s);return Math.hypot(p.x-r.x,p.z-r.z)<t.radius;};
assert(selected.length>0&&selected.length<=BANNER_TARGETS.length*2);
for(const target of BANNER_TARGETS){const count=selected.filter(p=>near(p,target)).length;assert(count<=2,`${target.name}: ${count} banners`);if(target.name!=='A1 end -1')assert(count>=1,`${target.name}: missing banner`);}
for(const p of selected){assert(BANNER_TARGETS.some(t=>near(p,t)),'No ads along unrelated fencing');assert(bannerSite(p.f),'Crossing clearance retained');}
assert.deepEqual(selectBannerSites(fences),selected,'Placement remains stable');
console.log(`${selected.length} sparse banners on editable fencing; at most two per crossing, intersection and station end`);
console.log(BANNER_TARGETS.map(t=>`${t.name}: ${selected.filter(p=>near(p,t)).length}`).join(', '));

const {parkLamp}=await import('../street/park-lamp.js');
const {MeshStandardMaterial}=await import('three');
for(const height of [5.5,6,7]){
 const parts=[],base=new Vector3(10,2,20),lens=new MeshStandardMaterial();
 const head=parkLamp((name,geometry,material,pos,scale,rotation)=>parts.push({name,geometry,material,pos,scale,rotation}),base,height,lens);
 assert.equal(parts.length,8);assert.equal(parts.filter(p=>p.name==='park-lamp-rib').length,4);
 assert.equal(head.y,base.y+height-.4);assert.equal(head.x,base.x);assert.equal(head.z,base.z);
 const pole=parts[0],drum=parts[1];assert.equal(pole.geometry.type,'CylinderGeometry');assert.equal(drum.scale.x,drum.scale.z);
 assert(Math.abs(pole.pos.y-pole.scale.y/2-base.y)<1e-9);assert(Math.abs(drum.pos.y+drum.scale.y/2-base.y-height)<1e-9);
 assert.equal(parts[2].material,lens,'Night light material stays on the recessed lens');
}
console.log('Reference park lamps: round shafts, drum heads, four ribs and aligned night lights passed');

const {westEnd,eastEnd,roofLevel,southEdge,stairs}=await import('../a2-footbridge.js');
const {datum,rail}=await import('../a2-site.js');
const {walkStep}=await import('../onfoot.js');
function advance(walker,x,z){
 const to=worldCoordinates(x,z),next=walkStep(walker,to.x-walker.x,to.z-walker.z,[]);
 assert(!next.blocked&&Math.abs(next.y-walker.y)<.55,'Bridge path continuous at '+x+', '+z);
 return next;
}
for(const f of stairs){
 const toe=worldCoordinates(f.x,f.foot+.3);
 let walker={...toe,s:STOPS[1].s,y:groundAt(toe.x,toe.z).y};
 for(let z=f.foot;z>=southEdge(f.x)-.4;z-=.13)walker=advance(walker,f.x,z);
 assert(walker.y>datum+11.9,'Each stair flight reaches the bridge');
}
const walkway=x=>southEdge(x)-1.65;
let walker={...worldCoordinates(westEnd-.2,walkway(westEnd)),s:STOPS[1].s,y:datum+roofLevel};
for(let x=westEnd;x<eastEnd;x+=.18)walker=advance(walker,x,walkway(x));
for(let x=eastEnd;x<=-13.8;x+=.15)walker=advance(walker,x,walkway(eastEnd));
assert(Math.abs(walker.y-rail.y-1.15)<.01,'Bridge meets the Tuen Ma platform');
const crossing=worldCoordinates(-90,walkway(-90));
assert(groundAt(crossing.x,crossing.z,STOPS[1].s,datum+13.2).y-groundAt(crossing.x,crossing.z).y>8,'Road and bridge surfaces stay separate');
console.log('Western roof terrace, both ground approaches and the Tuen Ma platform are connected.');

const {lifts,liftAt}=await import('../a2-footbridge.js');
assert.equal(lifts.length,4);
for(const l of lifts){
 for(const [stop,y] of [['bridge',l.deck],['street',l.base]]){
  const w={...l[stop],y};
  assert.equal(liftAt(w)?.lift,l);
  assert.equal(liftAt(w)?.stop,stop);
  assert.equal(liftAt({...w,y:y+4}),null);
  assert(Math.abs(groundAt(w.x,w.z,STOPS[1].s,y).y-y)<.03,l.name+' flush threshold');
 }
 let w={...l.street,y:l.base,s:STOPS[1].s};
 for(let dz=3.1;dz<6;dz+=.15){
  const prevY=w.y;w=advance(w,l.x,l.z+dz);
  assert(Math.abs(w.y-prevY)<.035,l.name+' step-free street approach');
 }
}
console.log('All four lift banks have a continuous ground approach and independently reachable bridge and street landings.');
