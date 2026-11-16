// City streets to Hong Kong practice (sandbox ROAD-MARKINGS-GUIDE.md): medians stand clear of the crowned carriageway, every
// road / paving / paint surface faces up (a culled junction fill showed grass through the road), crossings are signal-controlled
// at crossroads and cautionary elsewhere (no zebras at side-road mouths), and yellow kerb lines are drawn.
import assert from 'node:assert/strict';
import fs from 'node:fs';
const ctx2d=new Proxy({},{get:(_,k)=>k==='measureText'?()=>({width:0}):k==='createLinearGradient'?()=>({addColorStop(){}}):()=>{},set:()=>true});
globalThis.document??={createElement:()=>({getContext:()=>ctx2d,width:0,height:0})};
const T=await import('three');
const {buildNetwork,junctions,frameAt,streetLevel}=await import('../street/network.js');
const {renderedGround}=await import('../environment.js');
const network=JSON.parse(fs.readFileSync(new URL('../../public/street/furniture.json',import.meta.url))).network;
const yellow=new T.MeshStandardMaterial({color:0xf2c230}),grass=new T.MeshStandardMaterial({color:0x55663c}),road=new T.MeshStandardMaterial({color:0x4b4f4d}),white=new T.MeshStandardMaterial({color:0xffffff});
const g=buildNetwork(network,{ground:renderedGround,mats:{yellow,grass,road,white}}),H=g.userData.surfaceHeight,{roads,joins}=junctions(network,renderedGround);
// 1. Flat surfaces face up.
let down=0;for(const m of g.children){if(![road,grass,white,yellow].includes(m.material))continue;const p=m.geometry.attributes.position,ix=m.geometry.index.array;
 for(let k=0;k<ix.length;k+=3){const [a,b,c]=[0,1,2].map(i=>[p.getX(ix[k+i]),p.getY(ix[k+i]),p.getZ(ix[k+i])]),ny=(b[2]-a[2])*(c[0]-a[0])-(b[0]-a[0])*(c[2]-a[2]);if(ny<-1e-6)down++;}}
assert.equal(down,0,`${down} road/paint/planting triangles face down (culled: the terrain shows through)`);
// 2. Medians: on every dual carriageway the median stands above the carriageway edge: paved 0.1–0.25 m, planter 0.4–0.55 m.
let checked=0;for(const {r,P,F} of roads){if(!(P.median>0))continue;for(let d=40;d<F.at(-1).d-40;d+=25){if(r.junctionDistances.some(a=>Math.abs(a-d)<30))continue;const f=frameAt(F,d),y=H(f.x,f.z);if(y===null)continue;
 const edge=f.y+streetLevel(r,d,P.median/2);if(y<edge+.05)continue;// a median gap (side road, crossing): road level there
 assert.ok(y-edge>.1&&y-edge<.25||y-edge>.4&&y-edge<.55,`${r.id} median at d=${d} stands ${(y-edge).toFixed(2)} m above the carriageway`);checked++;}}
assert.ok(checked>60,`median samples ${checked}`);
// 3. Crossings: signal-controlled on all four arms of the three crossroads, cautionary at every other junction; no zebras.
const cr=g.userData.crossings;assert.equal(cr.filter(c=>c.kind==='zebra').length,0,'no zebra crossings at junction mouths');
const groups=[];for(const j of joins.filter(j=>j.signal)){const g=groups.find(g=>g.B===j.B&&Math.abs(g.d-j.at.d)<5);if(g)g.arms++;else groups.push({B:j.B,d:j.at.d,arms:1});}
const approaches=groups.reduce((s,g)=>s+2+g.arms,0),tees=groups.filter(g=>g.arms===1).length;
assert.equal(groups.filter(g=>g.arms===2).length,3,'three signal crossroads');assert.ok(tees>=6,`signalised major T-junctions: ${tees}`);
assert.equal(cr.filter(c=>c.kind==='signal').length,approaches,'a signal crossing on every approach of every signal junction');
assert.ok(cr.filter(c=>c.kind==='cautionary').length>=joins.filter(j=>!j.signal&&!j.B.r.loop).length-2,'a cautionary crossing at nearly every priority junction');

// 4. Yellow kerb lines exist along the city kerbs (two lines per kerb on distributors).
const yl=g.children.filter(m=>m.material===yellow).reduce((s,m)=>s+m.geometry.index.count/3,0);assert.ok(yl>20000,`yellow kerb-line triangles ${yl}`);
// 5. Junction control hardware: a TS102 Give Way sign at every priority / roundabout entry, and at each crossroads four approaches
// with a kerb primary (carrying the pedestrian head), a pedestrian pole at the far kerb, a median primary where divided, and the
// secondaries back to back. Every pole and sign stands on its footway or median, not in the carriageway.
const ctl=g.userData.controls,gw=ctl.filter(c=>c.kind==='giveway'),sig=ctl.filter(c=>c.kind==='signal');
assert.equal(gw.length,joins.filter(j=>!j.signal).length,'one Give Way sign per priority or roundabout entry');
assert.equal(sig.filter(c=>c.pedOnly).length,approaches,'pedestrian poles: one per signal crossing');
assert.equal(sig.filter(c=>c.ped&&!c.pedOnly).length,approaches,'kerb primaries: one per approach');
assert.equal(sig.filter(c=>c.back).length+tees,approaches,'a secondary for every approach (behind the far kerb for a T side road)');
for(const c of [...gw,...sig]){const y=H(c.x,c.z);assert.ok(y!==null&&Math.abs(y-c.y)<.08,`${c.kind} at ${c.x.toFixed(1)},${c.z.toFixed(1)}: surface ${y?.toFixed(2)} vs ${c.y.toFixed(2)}`);}
// 6. Street furniture (city-details.js, sandbox dress rules): a bin at every crossing, hydrants at most ~100 m apart along each
// street, bus shelters on the distributors only, a controller cabinet per signal junction; railings follow need, not every kerb.
const {cityDetails}=await import('../street/city-details.js');
const det=cityDetails(g,{batch:()=>{},kitParts:()=>[],fences:[],lampPositions:[],mats:{},plantTree:()=>{}});
assert.equal(det.bins,cr.length,'one litter bin per crossing');assert.equal(det.cabinets,groups.length,'a controller cabinet at each signal junction');
assert.ok(det.shelters>=5&&det.shelters<=25,`bus shelters ${det.shelters}`);assert.ok(det.trees>100,`street trees ${det.trees}`);
const kerb=g.userData.edges.filter(e=>e.kind==='edge').reduce((s,e)=>s+e.length,0)/2;assert.ok(det.hydrants>=kerb/110,`hydrants ${det.hydrants} for ${kerb.toFixed(0)} m of street`);
const railed=det.panels*1.5,all=g.userData.edges.reduce((s,e)=>s+e.length,0);assert.ok(railed<all*.8&&railed>all*.25,`railing on ${(100*railed/all).toFixed(0)} % of the kerbs`);
console.log(`city-markings checks passed: no downward faces, ${checked} median samples, ${cr.length} crossings (${cr.filter(c=>c.kind==='signal').length} signal), ${gw.length} Give Way signs, ${sig.length} signal poles; furniture ${JSON.stringify(det)}`);
