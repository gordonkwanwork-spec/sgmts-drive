// Compare the proposed stair envelope with the actual imported and graded SGMTS shelter.
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import * as T from 'three';
import {acceleratedRaycast,computeBoundsTree} from 'three-mesh-bvh';
import {GLTFLoader} from 'three/addons/loaders/GLTFLoader.js';
import {buildIconicBridge,bridgeLevel,stairEave,eastEnd,lifts,southEdge,stairs,westEnd} from '../a2-footbridge.js';
import {datum,siteCoordinates,galleryY,frontage,pavingY} from '../a2-site.js';
import {STOPS,sample} from '../alignment.js';

globalThis.self??=globalThis;
globalThis.createImageBitmap??=async()=>({width:1,height:1,close(){}});
const buf=await readFile(new URL('../../public/assets/station-A2.glb',import.meta.url));
const {scene:station}=await new GLTFLoader().parseAsync(buf.buffer.slice(buf.byteOffset,buf.byteOffset+buf.length),'');
station.updateMatrixWorld(true);
const west=stairs[0],st=STOPS[1],centre=sample(st.s);
const frame=new T.Matrix4().makeRotationY(centre.heading).setPosition(centre.x,centre.y,centre.z);
const toeZ=west.foot+1.1,roofEdge=west.x+west.width/2+stairEave;
let clearance=Infinity;
station.traverse(mesh=>{
 if(!mesh.isMesh||!mesh.parent.name.endsWith('_roof'))return;
 const geometry=mesh.geometry,pos=geometry.attributes.position,vertices=[];
 for(let i=0;i<pos.count;i++){
  const v=new T.Vector3().fromBufferAttribute(pos,i).applyMatrix4(mesh.matrixWorld);
  v.y+=sample(st.s-v.z).y-centre.y;v.applyMatrix4(frame);vertices.push(siteCoordinates(v.x,v.z));
 }
 const idx=geometry.index?.array??vertices.map((_,i)=>i);
 for(let i=0;i<idx.length;i+=3){
  const tri=[vertices[idx[i]],vertices[idx[i+1]],vertices[idx[i+2]]];
  // Clip at the toe so an end-panel corner between sampled cross-sections is counted.
  for(let j=0;j<3;j++){
   const a=tri[j],b=tri[(j+1)%3];
   if(a.z<=toeZ)clearance=Math.min(clearance,a.x-roofEdge);
   if((a.z-toeZ)*(b.z-toeZ)<0)clearance=Math.min(clearance,a.x+(b.x-a.x)*(toeZ-a.z)/(b.z-a.z)-roofEdge);
  }
 }
});
assert(Number.isFinite(clearance)&&clearance>.75,'Separation from the original SGMTS canopy: '+clearance);

globalThis.document??={createElement:()=>({getContext:()=>({fillRect(){},fillText(){}})})};
const site=new T.Group();buildIconicBridge(site,()=>{});site.updateMatrixWorld(true);
const canopy=site.getObjectByName('A2 bridge rain canopy'),structure=site.getObjectByName('A2 bridge columns and girders');
assert(structure?.children.length&&canopy?.children.length);
site.traverse(m=>{if(m.isMesh){m.geometry.computeBoundsTree=computeBoundsTree;m.geometry.computeBoundsTree();m.raycast=acceleratedRaycast;}});
const up=new T.Vector3(0,1,0),ray=new T.Raycaster();
ray.firstHitOnly=true;let probes=0;
function checkCover(x,z,feet){
 ray.set(new T.Vector3(x,feet+1.9,z),up);
 const hit=ray.intersectObject(canopy,true)[0];
 assert(hit&&hit.point.y-feet>=2.25&&hit.point.y-feet<6,'Roof coverage and headroom at '+[x,z,feet]);probes++;
}
// Probe the rendered walking surface across the full width of the curved deck.
const deck=site.getObjectByName('A2 iconic footbridge').children.filter(m=>m.isMesh);
for(let x=westEnd+.2;x<eastEnd;x+=1.1){
 const h=bridgeLevel(x);
 for(let z=southEdge(x)-.42;z>southEdge(x)-17;z-=.48){
  ray.set(new T.Vector3(x,h+.12,z),new T.Vector3(0,-1,0));ray.far=.17;
  const onDeck=ray.intersectObjects(deck,false).length;ray.far=Infinity;
  if(onDeck)checkCover(x,z,h);
 }
}
for(const f of stairs){
 for(const dx of [-f.width/2+.38,0,f.width/2-.38]){
  const x=f.x+dx;
  for(let i=0;i<=45;i++){
   const z=f.foot-.06+(southEdge(x)-f.foot+.12)*i/45;
   ray.set(new T.Vector3(x,17,z),new T.Vector3(0,-1,0));
   const tread=ray.intersectObjects(deck,false)[0];assert(tread,'Missing stair tread at '+[x,z,i]);
   checkCover(x,z,tread.point.y);
  }
 }
}
for(const l of lifts){
 const h=l.deck-datum,sill=l.z-1.4;
 for(const side of [-1,1]){
  const x=l.x+side*1.25,start=southEdge(x);
  for(const t of [.02,.25,.5,.75,.98])for(const height of [.45,1.1]){
   const z=start+(sill-start)*t;
   ray.set(new T.Vector3(x-side*.45,h+height,z),new T.Vector3(side,0,0));ray.far=.49;
   assert(ray.intersectObjects(deck,false).length,l.name+' unguarded lift deck edge at '+[x,z,height]);
  }
 }
 for(const dx of [-.6,0,.6]){
  const start=southEdge(l.x+dx)-.3;
  ray.set(new T.Vector3(l.x+dx,h+1.1,start),new T.Vector3(0,0,1));ray.far=sill-start-.15;
  assert.equal(ray.intersectObjects(deck,false).length,0,l.name+' lift approach must stay open');
 }
 ray.far=Infinity;
 for(const dx of [-1,0,1]){
  for(let dz=1.65;dz<=4.2;dz+=.25)checkCover(l.x+dx,l.z+dz,l.base-datum);
  for(let z=southEdge(l.x+dx)-.25;z<l.z-1.4;z+=.2)checkCover(l.x+dx,z,l.deck-datum);
 }
}
// Measure the six main shaft centrelines at their stems. Their foundations have
// to fit on the gallery forecourt or the plaza side of the segregated cycleway.
for(const x of [-111.8,-103.2,-72,-53,-37,-22]){
 // Find both structural bearings from above at the same cross-section, then the column between them.
 const leftRight=[];
 for(let z=-107;z<=-43;z+=.1){
  ray.set(new T.Vector3(x,22,z),new T.Vector3(0,-1,0));
  if(ray.intersectObject(structure,true).length)leftRight.push(z);
 }
 assert(leftRight.length>15,'Continuous pier cap at '+x);
 const mid=(leftRight[0]+leftRight.at(-1))/2;
 const y=(galleryY(x,mid)??pavingY(x,mid))-datum+1.25;
 ray.set(new T.Vector3(x-1.75,y,mid),new T.Vector3(1,0,0));
 const stem=ray.intersectObject(structure,true)[0];assert(stem&&stem.distance<1.5,'Grounded column stem at '+x);
 for(const dx of [-1.03,1.03])for(const dz of [-1.33,1.33])
  assert(galleryY(x+dx,mid+dz)!==null||x+dx>frontage(mid+dz).x,'Pier footing inside transport corridor at '+x);
}
assert(probes>1200);
console.log('A2 bridge: '+clearance.toFixed(2)+' m west canopy clearance; '+probes+' roof and headroom probes passed.');
