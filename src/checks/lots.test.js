// OZP lots: valid polygons clear of the SGMTS carriageway, and the wand traces a closed box exactly.
import fs from 'fs';
import assert from 'assert';
import {project,sample,roadSection} from '../alignment.js';
import {flood,trace,simplify,polygonArea,pointInPolygon,wandPolygon} from '../lots/wand.js';
import {useOf,plotRatio} from '../lots/massing.js';
const {lots}=JSON.parse(fs.readFileSync(new URL('../../public/lots/lots.json',import.meta.url)));
assert(lots.length>=60,'seeded lots missing');assert.equal(new Set(lots.map(l=>l.id)).size,lots.length,'duplicate lot ids');
for(const l of lots){assert(l.poly.length>=3&&polygonArea(l.poly)>500,`${l.id} degenerate`);
 for(const [x,z] of l.poly){const s=project(x,z),r=sample(s);assert(Math.hypot(x-r.x,z-r.z)>=roadSection(s).right,`${l.id} corner on the SGMTS carriageway`);}}
assert.equal(plotRatio('R(A)1'),6.5);assert.equal(useOf('OU(Logistics Facility)'),'logistics');assert.equal(useOf('G/IC(1)'),'gic');
// 20×10 px open box inside a 1 px line on a 30×20 mask.
const w=30,h=20,mask=new Uint8Array(w*h);for(let y=5;y<15;y++)for(let x=5;x<25;x++)mask[y*w+x]=1;
const f=flood(mask,w,h,10,10);assert.equal(f.count,200);const poly=simplify(trace(f.region,w,h),.5);
assert.equal(poly.length,4,'box should simplify to 4 corners');assert(pointInPolygon([15,10],poly)&&!pointInPolygon([2,2],poly));
assert.equal(flood(mask,w,h,1,1),null,'seed on a line returns null');
// A 1 px gap in the box wall leaks at r=0; the wand closes it and returns the box, not the outside.
const cal={width:60,height:40,metresPerPixel:1,originX:0,originZ:0},m2=new Uint8Array(60*40).fill(1);
for(let x=10;x<=40;x++){m2[10*60+x]=0;m2[30*60+x]=0;}for(let y=10;y<=30;y++){m2[y*60+10]=0;m2[y*60+40]=0;}m2[20*60+40]=1;
const boxPoly=wandPolygon(m2,cal,[25,20],.5,500);assert(boxPoly&&polygonArea(boxPoly)>300&&polygonArea(boxPoly)<600,'gap-closing wand should return the box');
// Leak guard: a wall piece the label cleaning removed (5 px gap, too wide to close by thickening) makes the clean
// flood escape into the next lot; the raw mask still has it, so the wand keeps the raw box.
const cal3={width:120,height:40,metresPerPixel:1,originX:0,originZ:0},raw3=new Uint8Array(120*40).fill(1);
for(let x=10;x<=110;x++){raw3[10*120+x]=0;raw3[30*120+x]=0;}for(const X of [10,40,110])for(let y=10;y<=30;y++)raw3[y*120+X]=0;
const clean3=raw3.slice();for(let y=16;y<21;y++)clean3[y*120+40]=1;
const guarded=wandPolygon(clean3,cal3,[25,20],.5,2000,raw3),leaked=wandPolygon(clean3,cal3,[25,20],.5,2000);
assert(polygonArea(leaked)>1500&&polygonArea(guarded)<700,'raw mask stops a leak through a removed line piece');
console.log(`OZP lots: ${lots.length} valid lots clear of the carriageway; wand traces a closed box and guards leaks`);
