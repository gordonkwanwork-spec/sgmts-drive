import assert from 'node:assert/strict';
import fs from 'node:fs';
import {polygonContains,circleIntersects,rectangle,segmentsCross,edges,boundaryDistance} from '../lots/geometry.js';
import {networkMask} from '../street/network.js';
import {cityDiagnostics} from '../city-plan.js';
import {readSetting,writeSetting} from '../settings.js';
const ctx2d=new Proxy({},{get:(_,k)=>k==='measureText'?()=>({width:0}):k==='createLinearGradient'?()=>({addColorStop(){}}):()=>{},set:()=>true});
globalThis.document={createElement:()=>({getContext:()=>ctx2d,width:0,height:0})};
const {massingParts,buildLots,occupiedBy,useOf}=await import('../lots/massing.js');
const road=networkMask({roads:[{preset:'local',pts:[[0,-100],[0,100]]}],areas:[]});
let queries=0;for(const radius of [0,1,5,10,20,40,60])for(let x=-100;x<=100;x+=5){const expected=Math.abs(x)<7.15+radius+.5;assert.equal(road.blocked(x,0,radius),expected,`road radius ${radius}, x ${x}`);queries++;}
const diagonal=networkMask({areas:[{finish:'buff',pts:[[9,9],[11,9],[11,11],[9,11]]}]});assert(diagonal.onPaving(0,0,15));assert(!diagonal.onPaving(0,0,12));
const grass=networkMask({areas:[{finish:'grass',pts:[[0,0],[10,0],[10,10],[0,10]]}]});assert(grass.buildingBlocked(5,5));assert(!grass.blocked(5,5));
const notch=[[0,0],[120,0],[120,120],[85,120],[85,55],[75,55],[75,120],[0,120]];
assert(!polygonContains(notch,rectangle({x:60,z:60,w:80,d:80})), 'concave notch crossing must fail');
const synthetic={id:'audit-gic',zone:'G/IC',maxStoreys:3,poly:[[0,0],[120,0],[120,120],[0,120]]};
const ctx={ground:(x,z)=>x*.01+z*.005,allowed:()=>true};
const a=massingParts(synthetic,ctx),b=massingParts(synthetic,ctx);assert(a.footprints.length>0);
assert.deepEqual(a.trees,b.trees,'generation deterministic');assert.deepEqual(a.footprints,b.footprints);
const {lots}=JSON.parse(fs.readFileSync(new URL('../../public/lots/lots.json',import.meta.url)));
let footprints=0,trees=0,yards=0;
for(const lot of [synthetic,...lots.filter(l=>l.model?.type==='massing')]){
 const out=massingParts(lot,ctx);
 for(const p of out.footprints){assert(polygonContains(lot.poly,p),`${lot.id} footprint outside parcel`);footprints++;}
 for(const p of out.surfaces){assert(polygonContains(lot.poly,p),`${lot.id} hardscape outside parcel`);yards++;}
 for(const t of out.trees){const radius=t.s*2.6+.5;assert(boundaryDistance([t.x,t.z],lot.poly)>=radius,`${lot.id} canopy outside parcel`);assert(!out.footprints.some(p=>circleIntersects(t.x,t.z,radius+1,p)),`${lot.id} canopy meets building`);assert(!out.surfaces.some(p=>circleIntersects(t.x,t.z,radius,p)),`${lot.id} canopy meets hardscape`);assert.equal(t.y,ctx.ground(t.x,t.z));trees++;}
 if(['open','green'].includes(useOf(lot.zone)))assert.equal(out.footprints.length,0,'green/open zoning preserved');
}
const T=await import('three'),kit=new T.Group(),truck=new T.Mesh(new T.BoxGeometry(2,3,10),new T.MeshStandardMaterial());truck.name='truck';kit.add(truck);
const built=await buildLots(lots,{...ctx,kit});assert(built.children.length>0);assert(built.userData.cityPlan.length>0);built.traverse(n=>{if(n.isMesh)assert(n.geometry,'batched city geometry is valid');});
const jitter=massingParts({...synthetic,id:'mask-test-0',zone:'GB'},{ground:()=>0,allowed:(x,z,r)=>x-r>=37.75});assert(jitter.trees.length>0);assert(jitter.trees.every(t=>t.x-(2.6*t.s+.5)>=37.75),'final jittered canopy respects exclusions');
const ownership=occupiedBy([{...synthetic,model:{type:'none'}}]);assert(ownership(50,50));assert(ownership(-5,50,10));assert(ownership.study(50,50));assert(!ownership.study(500,500));
const warnings=cityDiagnostics(lots,{});assert(warnings.some(w=>w.includes('missing')));assert(!warnings.some(w=>w.includes('self-crossing')),'source-reviewed parcel rings remain simple');
globalThis.localStorage={getItem(){throw Error('blocked');},setItem(){throw Error('blocked');}};assert.equal(readSetting('a','smooth'),'smooth');writeSetting('a','cinematic');assert.equal(readSetting('a'),'cinematic');
let listener,options,requests=0;Object.defineProperty(globalThis,'navigator',{value:{},configurable:true});globalThis.matchMedia=()=>({matches:false});globalThis.addEventListener=(_,f,o)=>{listener=f;options=o;};globalThis.document={documentElement:{requestFullscreen(){requests++;return Promise.resolve();}}};
const {autoFullscreen}=await import('../fullscreen.js');autoFullscreen();assert.equal(options.once,true);listener();assert.equal(requests,1);
console.log(`City plan: ${queries} radius queries, diagonal paving, concave containment, ${footprints} footprints/${yards} hardscapes/${trees} canopies, determinism, ownership, diagnostics, safe storage/fullscreen passed`);
