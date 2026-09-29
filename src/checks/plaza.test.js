import assert from 'node:assert/strict';
import {ART_RECTS,LIGHTBOX_SITES,bannerSite} from '../plaza.js';
import {STOPS,sample,CROSSINGS,JUNCTIONS} from '../alignment.js';
import {groundAt} from '../onfoot.js';
assert.equal(ART_RECTS.length,9);
for(const [x,y,w,h] of ART_RECTS)assert(x>=0&&y>=0&&w>0&&h>0&&x+w<=1536&&y+h<=1024);
assert.equal(LIGHTBOX_SITES.length,9);
for(const [ds,lat] of LIGHTBOX_SITES){
 assert(ds>-115&&ds<125&&lat>-84&&lat<-17,'Lightbox is inside A2 plaza');
 assert(Math.hypot(ds-40,lat+48)>13,'Fountain stays clear');
 for(const entrance of [-55,90])assert(Math.hypot(ds-entrance,lat+48)>10,'Entrance stays clear');
 const s=STOPS[1].s+ds,r=sample(s),g=groundAt(r.x+r.lx*lat,r.z+r.lz*lat,s);assert(Math.abs(g.y-r.groundY-.34)<.01,'Feet remain above the plaza paving');
}
const panel=s=>{const a=sample(s-.75),b=sample(s+.75);return {ax:a.x+a.lx*15,az:a.z+a.lz*15,bx:b.x+b.lx*15,bz:b.z+b.lz*15,y:a.groundY,top:1};};
for(const c of CROSSINGS)assert.equal(bannerSite(panel(c.s)),null,'No banner beside crossing');
for(const j of JUNCTIONS)assert.equal(bannerSite(panel(j.s)),null,'No banner at junction');
assert.equal(bannerSite({...panel(STOPS[1].s),top:.5}),null);
assert(STOPS.some(st=>[-130,-100,100,130].some(ds=>bannerSite(panel(st.s+ds)))),'Eligible approach fences carry banners');
console.log('Plaza artwork, nine plaza-only lightboxes, walking height and banner crossing exclusions passed');

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
