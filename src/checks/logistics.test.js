// Logistics buildings: every seeded logistics lot gets detailed buildings with operator signs, finite geometry,
// yards and trailers inside the lot, and a spread of hypothetical operators across the cluster.
import fs from 'fs';
import assert from 'assert';
// Canvas stub: textures are drawn in the browser; here only geometry matters.
const ctx2d=new Proxy({},{get:(_,k)=>k==='measureText'?()=>({width:0}):k==='createLinearGradient'?()=>({addColorStop(){}}):()=>{},set:()=>true});
globalThis.document={createElement:()=>({getContext:()=>ctx2d,width:0,height:0})};
const {massingParts,lotMaterials,useOf,BRANDS,rampPose,TRUCKS_PER_LANE,RAMP_SPEED}=await import('../lots/massing.js');
const T=await import('three');
const {project,sample}=await import('../alignment.js');
const {pointInPolygon}=await import('../lots/wand.js');
const {lots}=JSON.parse(fs.readFileSync(new URL('../../public/lots/lots.json',import.meta.url)));
let ramps=0;const M=lotMaterials(),facades=[0,1,2,3,4,5].map(i=>M['logi'+i]),used=new Set();let buildings=0;
for(const lot of lots.filter(l=>useOf(l.zone)==='logistics'&&(l.style||'logistics')==='logistics')){
 const {parts,trees,ramps:rs}=massingParts(lot,{ground:()=>0}),n=parts.filter(p=>facades.includes(p.material)).length;
 buildings+=n;// narrow strips (40A-19) have no warehouse footprint
 for(const f of facades)assert(f.roughnessMap&&f.envMap,'facade glass not reflective');
 for(const p of parts){const a=p.geometry.attributes.position.array;assert(a.every(Number.isFinite),`${lot.id} non-finite geometry`);}
 const signs=parts.filter(p=>p.material===M.signs||p.material===M.letters);assert(signs.length>=n,`${lot.id} missing operator signs`);
 // Every sign faces the SGMTS corridor.
 for(const p of signs){const g=p.geometry;g.computeBoundingBox();const o=g.boundingBox.getCenter(new T.Vector3()),q=sample(project(o.x,o.z)),nx=g.attributes.normal.getX(0),nz=g.attributes.normal.getZ(0);
  assert((q.x-o.x)*nx+(q.z-o.z)*nz>0,`${lot.id} sign faces away from the corridor`);}
 for(const p of signs){const uv=p.geometry.attributes.uv.array;used.add(Math.floor((1-uv[1])*8)*2+Math.floor(uv[0]*2));}
 for(const key of ['yard','box0','box1','box2','box3','box4'])for(const p of parts.filter(p=>p.material===M[key])){p.geometry.computeBoundingBox();const {min,max}=p.geometry.boundingBox;
  assert(pointInPolygon([(min.x+max.x)/2,(min.z+max.z)/2],lot.poly),`${lot.id} ${key} outside its lot`);}

 // Ramps: one per building; laps start and end inside the building (hidden wrap), lanes clear the core, kerb and
 // columns, trucks keep headroom under the next turn, and trucks in a lane stay apart.
 assert.equal(rs.length,n,`${lot.id} ramp count`);ramps+=rs.length;
 for(const r of rs){const rr=r.lanes[0]/(.34+.66*.72),pitch=r.rise/r.turns;
  for(const lane of [0,1]){const R=r.lanes[lane];assert(R-1.3>rr*.34&&R+1.3<rr-.95,`${lot.id} lane ${lane} hits kerb or columns`);
   for(const p of [0,1]){const a=r.a0+r.dir*p*r.turns*Math.PI*2;assert(pointInPolygon([r.cx+Math.cos(a)*R,r.cz+Math.sin(a)*R],r.building),`${lot.id} lane ${lane} wrap is visible`);}}
  assert(pitch>=3.4+.6+.45,`${lot.id} ramp headroom ${pitch.toFixed(1)} m`);
  const L=Math.hypot(r.turns*Math.PI*2*r.lanes[1],r.rise);assert(L/TRUCKS_PER_LANE>20,`${lot.id} trucks too close`);
  for(const lane of [0,1]){const m=rampPose(r,lane,0,10),pos=new T.Vector3().setFromMatrixPosition(m),fwd=new T.Vector3(0,0,-1).transformDirection(m),later=new T.Vector3().setFromMatrixPosition(rampPose(r,lane,0,10.1));
  assert(later.sub(pos).normalize().dot(fwd)>.99,`${lot.id} truck not facing its travel direction`);
  assert(Math.abs(pos.distanceTo(new T.Vector3().setFromMatrixPosition(rampPose(r,lane,0,11)))-RAMP_SPEED)<.1,`${lot.id} truck speed`);}}
}
const operators=[...used].filter(i=>i<6);
assert(buildings>=8,'logistics cluster too sparse');assert(operators.length>=5,`only ${operators.length} operators in use`);
console.log(`Logistics: ${buildings} buildings, ${operators.length}/${BRANDS.length-3} operators + tenants signed, geometry finite, yards and trailers inside lots; ${ramps} ramps with ${ramps*TRUCKS_PER_LANE*2} trucks`);
