import assert from 'node:assert/strict';
import * as T from 'three';
import {buildGreenMinibus} from '../green-minibus.js';
import {animateRoadWheels} from '../vehicle-motion.js';

// 1. Headless build (no document) + envelope checks
const headlessBus=buildGreenMinibus();
headlessBus.updateMatrixWorld(true);
const bounds=new T.Box3().setFromObject(headlessBus);
const size=bounds.getSize(new T.Vector3());
assert(Math.abs(bounds.min.y)<0.005,`expected grounded min.y≈0, got ${bounds.min.y}`);
assert(Math.abs(size.x-2.2)<0.06,`expected width≈2.2, got ${size.x}`);
assert(Math.abs(size.y-2.8)<0.06,`expected height≈2.8, got ${size.y}`);
assert(Math.abs(size.z-7.0)<0.06,`expected length≈7.0, got ${size.z}`);

// 2. Canvas build with minimal mock document
const noopCtx=new Proxy({createRadialGradient:()=>({addColorStop(){}})},{get:(t,k)=>t[k]??(()=>undefined),set:()=>true});
const origDoc=globalThis.document;
globalThis.document={createElement:()=>({width:0,height:0,getContext:()=>noopCtx})};
let canvasBus;
try{canvasBus=buildGreenMinibus();}finally{globalThis.document=origDoc;}
canvasBus.updateMatrixWorld(true);

// 3. Body-conforming curved front & rear lights (never floating boxes) & roof/sign geometry checks
let lightMesh=null,redMesh=null,glassMesh=null,signMesh=null,greenMesh=null,meshCount=0,triangles=0;
canvasBus.traverse(n=>{
 if(!n.isMesh)return;
 meshCount++;
 triangles+=(n.geometry.index?.count??n.geometry.attributes.position.count)/3;
 if(n.material?.name==='light')lightMesh=n;
 if(n.material?.name==='red')redMesh=n;
 if(n.material?.name==='minibus_sign')signMesh=n;
 if(n.material?.name==='minibus_green')greenMesh=n;
 if(n.material?.transparent&&n.material.opacity>0.30&&n.material.opacity<0.65)glassMesh=n;
});
assert(lightMesh,'front headlamp mesh present');
assert(redMesh,'rear taillight mesh present');
assert(signMesh,'front roof destination sign mesh present');
assert(greenMesh,'green roof/pod mesh present');
assert(glassMesh,'translucent glazing mesh present');
assert(glassMesh.material.depthWrite===false&&glassMesh.material.opacity>0.15&&glassMesh.material.opacity<0.65,'glazing allows interior view');

// Destination sign is single-sided facing strictly forward (-Z) inside pod pocket
const signBox=new T.Box3().setFromObject(signMesh);
assert(signBox.min.y>=2.38&&signBox.max.y<=2.79,`sign vertical placement (${signBox.min.y.toFixed(3)}..${signBox.max.y.toFixed(3)})`);
assert(signBox.max.z<-2.60&&Math.abs(signBox.min.x)<0.50&&Math.abs(signBox.max.x)<0.50,'sign embedded inside front destination pod');
const sn=signMesh.geometry.attributes.normal;
for(let i=0;i<sn.count;i++)assert(sn.getZ(i)<-0.5,`sign normal must face forward (-Z), got nz=${sn.getZ(i)}`);

// Green roof/pod mesh has outward rear slope above crown (y > 2.62, nz > 0.2, ny > 0.2) and crown normals ny > 0.7
const gp=greenMesh.geometry.attributes.position,gn=greenMesh.geometry.attributes.normal;
let podRearOut=0,crownUp=0;
for(let i=0;i<gp.count;i++){
 if(gp.getY(i)>2.62&&gn.getZ(i)>0.2&&gn.getY(i)>0.2)podRearOut++;
 if(gp.getY(i)>2.56&&gn.getY(i)>0.7)crownUp++;
}
assert(podRearOut>10,`destination pod rear slope must face outward (+Z,+Y), got ${podRearOut} verts`);
assert(crownUp>50,`green roof crown must face upward (+Y), got ${crownUp} verts`);

// Broad panoramic front windscreen (slim A-pillars, not chunky bars)
const gpGlass=glassMesh.geometry.attributes.position,gnGlass=glassMesh.geometry.attributes.normal;
let wsMinX=Infinity,wsMaxX=-Infinity;
for(let i=0;i<gpGlass.count;i++){
 if(gpGlass.getZ(i)<-2.80&&gnGlass.getZ(i)<-0.75){
  wsMinX=Math.min(wsMinX,gpGlass.getX(i));
  wsMaxX=Math.max(wsMaxX,gpGlass.getX(i));
 }
}
assert(wsMaxX-wsMinX>=1.56,`front windscreen span must be >= 1.56 m (slim A-pillars), got ${(wsMaxX-wsMinX).toFixed(3)}`);

// Cast from behind the vehicle. An uncovered header returns a seat or interior
// trim as the first hit, even when the glass and pillars each look valid alone.
const rearRay=new T.Raycaster(new T.Vector3(),new T.Vector3(0,0,-1),0,0.95);
function rearSurface(x,y){
 rearRay.ray.origin.set(x,y,4);
 const hit=rearRay.intersectObject(canvasBus,true)[0];
 assert.ok(hit,`hole in rear skin at (${x}, ${y})`);
 return hit.object.material;
}
const paint=rearSurface(0.30,1.30);
assert.equal(paint.transparent,false);
for(const x of [-0.76,-0.66,-0.28,0.18,0.45,0.75]){
 for(const y of [1.455,2.28,2.30])assert.equal(rearSurface(x,y),paint,`painted rear rail at (${x}, ${y})`);
}
for(const x of [-0.66,-0.24,0.42]){
 assert.equal(rearSurface(x,1.90),glassMesh.material,`rear glazing at x=${x}`);
 assert.equal(rearSurface(x,1.491).transparent,false,`lower rubber seal at x=${x}`);
}
assert.equal(rearSurface(-0.24,2.24),paint,'paint above emergency-door window');
const doorGap=rearSurface(0.021,1.44);
assert.notEqual(doorGap,paint);
assert.equal(doorGap.transparent,false);
assert.equal(rearSurface(-0.25,0.565),doorGap,'bottom seam across the emergency door');
for(const [y,leftX] of [[0.94,-0.535],[1.43,-0.527],[1.48,-0.525],[1.77,-0.516],[2.08,-0.502],[2.29,-0.491]]){
 for(const x of [leftX,0.021]){
  assert.equal(rearSurface(x,y),doorGap,`continuous door seam at (${x}, ${y})`);
  for(const dx of [-0.014,0.014])assert.equal(rearSurface(x+dx,y),paint,'solid mullion beside door seam');
 }
}

const lightBox=new T.Box3().setFromObject(lightMesh);
assert(lightBox.min.z>=-3.50&&lightBox.max.z<=-3.15,`headlights inside front fascia (${lightBox.min.z}..${lightBox.max.z})`);
assert(lightBox.min.y>=0.55&&lightBox.max.y<=0.85,`headlights vertical span (${lightBox.min.y}..${lightBox.max.y})`);
assert(lightBox.min.x<-0.65&&lightBox.max.x>0.65,'headlights span both left and right sides');
const lightTris=(lightMesh.geometry.index?.count??lightMesh.geometry.attributes.position.count)/3;
assert(lightTris>32,`curved wraparound headlights must not be flat boxes (${lightTris} tris)`);

const redBox=new T.Box3().setFromObject(redMesh);
assert(redBox.min.z>=3.15&&redBox.max.z<=3.50,`taillights inside rear corner zone (${redBox.min.z}..${redBox.max.z})`);
assert(redBox.min.y>=0.58&&redBox.max.y<=0.85,`taillights vertical span (${redBox.min.y}..${redBox.max.y})`);
assert(redBox.max.z-redBox.min.z>0.08,`taillights wrap cleanly onto rear flanks (${redBox.max.z-redBox.min.z})`);

// 4. Independent spinning & steerable front wheels (separate from body meshes)
const bus=canvasBus.clone(true);
const wheels=[],bodyMeshes=[];
bus.traverse(n=>{
 if(n.userData.roadWheel)wheels.push(n);
 else if(n.isMesh&&!n.parent?.userData?.roadWheel)bodyMeshes.push(n);
});
assert.equal(wheels.length,4,'4 wheel pivots');
for(const w of wheels)assert.equal(w.children.length,2,'2 child meshes (tyre + rim) per wheel');
const frontWheels=wheels.filter(w=>w.userData.roadWheel.front);
const rearWheels=wheels.filter(w=>!w.userData.roadWheel.front);
assert.equal(frontWheels.length,2);
assert.equal(rearWheels.length,2);
for(const rw of rearWheels){
 const rBox=new T.Box3().setFromObject(rw.children[0]);
 assert(rBox.max.x-rBox.min.x>0.35,`dual rear tyre X-span > 0.35 m, got ${rBox.max.x-rBox.min.x}`);
}

// Verify front wheels spin and steer left/right independently while body remains stationary
const bodyQuatBefore=bodyMeshes.map(m=>m.rotation.toArray());
animateRoadWheels(bus,0.5,0.4);
assert(wheels.every(w=>w.rotation.x<0),'all 4 wheels spin forward');
for(const fw of frontWheels){
 assert.equal(fw.rotation.order,'YXZ');
 assert(Math.abs(fw.rotation.y-0.4)<1e-6,'front wheels steer left (+0.4)');
}
for(const rw of rearWheels)assert.equal(rw.rotation.y,0,'rear wheels stay straight');
assert.deepEqual(bodyMeshes.map(m=>m.rotation.toArray()),bodyQuatBefore,'body meshes do not rotate when wheels turn');

const spinAtTurn=wheels.map(w=>w.rotation.x);
animateRoadWheels(bus,0,-0.4);
assert.deepEqual(wheels.map(w=>w.rotation.x),spinAtTurn,'stopped wheels keep spin angle');
for(const fw of frontWheels)assert(Math.abs(fw.rotation.y+0.4)<1e-6,'front wheels steer right (-0.4)');
for(const rw of rearWheels)assert.equal(rw.rotation.y,0,'rear wheels remain straight');

animateRoadWheels(bus,-0.5,0);
assert(wheels.every(w=>Math.abs(w.rotation.x)<1e-6),'reverse unwinds spin');
for(const fw of frontWheels)assert.equal(fw.rotation.y,0,'front wheels re-center');

// Verify wheel well clearance when front wheels are at max steer lock (+-0.48 rad)
animateRoadWheels(bus,0,0.48);
bus.updateMatrixWorld(true);
for(const fw of frontWheels){
 const fwBox=new T.Box3().setFromObject(fw);
 assert(Math.abs(fwBox.min.x)>=0.52||Math.abs(fwBox.max.x)>=0.52,'front tyre stays clear of inner wheel well (|x|>=0.48)');
 assert(fwBox.min.z>-2.64&&fwBox.max.z<-1.78,`steered front tyre fits inside front arch z-opening (${fwBox.min.z.toFixed(3)}..${fwBox.max.z.toFixed(3)})`);
}

// 5. Interior, batching & shared cloning checks
assert.equal(bus.userData.minibusDetails.passengerSeats,16);
assert(meshCount<=40,`batched mesh count <= 40, got ${meshCount}`);
assert(triangles>=5000&&triangles<=30000,`triangle budget 5k..30k, got ${Math.round(triangles)}`);
const clone=bus.clone(true);
let m1,m2;
bus.traverse(n=>{if(n.isMesh)m1??=n;});
clone.traverse(n=>{if(n.isMesh)m2??=n;});
assert.equal(m1.geometry,m2.geometry,'clones share geometry');
assert.equal(m1.material,m2.material,'clones share material');

console.log(`Minibus checks passed: ${Math.round(triangles)} tris, ${meshCount} meshes, 16 seats, wraparound lights, dual rear tyres & steerable front wheels.`);
