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
// 2. Medians: on every dual carriageway, the median top stands 0.1–0.25 m above the carriageway at its edge.
let checked=0;for(const {r,P,F} of roads){if(!(P.median>0))continue;for(let d=40;d<F.at(-1).d-40;d+=25){if(r.junctionDistances.some(a=>Math.abs(a-d)<30))continue;const f=frameAt(F,d),y=H(f.x,f.z);if(y===null)continue;
 const edge=f.y+streetLevel(r,d,P.median/2);if(y<edge+.05)continue;// a median gap (side road, crossing): road level there
 assert.ok(y-edge>.1&&y-edge<.25,`${r.id} median at d=${d} stands ${(y-edge).toFixed(2)} m above the carriageway`);checked++;}}
assert.ok(checked>60,`median samples ${checked}`);
// 3. Crossings: signal-controlled on all four arms of the three crossroads, cautionary at every other junction; no zebras.
const cr=g.userData.crossings;assert.equal(cr.filter(c=>c.kind==='zebra').length,0,'no zebra crossings at junction mouths');
assert.equal(cr.filter(c=>c.kind==='signal').length,12,'12 signal crossings at the 3 crossroads');
assert.ok(cr.filter(c=>c.kind==='cautionary').length>=15,'cautionary crossings at the priority junctions');
assert.equal(joins.filter(j=>j.signal).length,6,'six crossroads arms');
// 4. Yellow kerb lines exist along the city kerbs (two lines per kerb on distributors).
const yl=g.children.filter(m=>m.material===yellow).reduce((s,m)=>s+m.geometry.index.count/3,0);assert.ok(yl>20000,`yellow kerb-line triangles ${yl}`);
console.log(`city-markings checks passed: no downward faces, ${checked} median samples, ${cr.length} crossings (${cr.filter(c=>c.kind==='signal').length} signal)`);
