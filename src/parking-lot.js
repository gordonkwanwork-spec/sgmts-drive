// Controlled commercial & public parking lot entrance, ticket office, animated boom gates,
// mixed parked vehicles (trucks + private cars), and live vehicles & pedestrians going in and out.
import * as T from 'three';
import {mergeGeometries} from 'three/addons/utils/BufferGeometryUtils.js';
import {mergeByMaterial} from './batching.js';
import {DEPOT_Y, CV_STALLS, CV_ROAD_WIDTH} from './depot.js';
import {CV_FRAME} from './street/roads.js';

export const GATE_X = -365.5;
export const GATE_Z = -2714.0;
const ENTRY_Z = -2716.0; // Hong Kong left-hand drive: eastbound (+X) entering lot uses north (left) lane
const EXIT_Z = -2712.0;  // Westbound (-X) exiting lot uses south (left) lane
const WALK_Z = -2708.6;  // Pedestrian walkway on south side beside Ticket Office

function stripeTexture(colors, horizontal = true) {
 const c = document.createElement('canvas');
 c.width = 128; c.height = 32;
 const ctx = c.getContext('2d');
 const n = 8, w = 128 / n;
 for (let i = 0; i < n; i++) {
  ctx.fillStyle = colors[i % colors.length];
  if (horizontal) ctx.fillRect(i * w, 0, w, 32);
  else ctx.fillRect(0, i * (32 / n), 128, 32 / n);
 }
 const t = new T.CanvasTexture(c);
 t.wrapS = t.wrapT = T.RepeatWrapping;
 t.colorSpace = T.SRGBColorSpace;
 return t;
}

function signTexture(lines, bg = '#153a4a', fg = '#fff6dc', accent = '#e8b931') {
 const c = document.createElement('canvas');
 c.width = 512; c.height = 160;
 const ctx = c.getContext('2d');
 ctx.fillStyle = bg; ctx.fillRect(0, 0, 512, 160);
 ctx.fillStyle = accent; ctx.fillRect(0, 0, 512, 10); ctx.fillRect(0, 150, 512, 10);
 ctx.fillStyle = fg; ctx.textAlign = 'center';
 ctx.font = 'bold 40px sans-serif';
 ctx.fillText(lines[0], 256, 70);
 ctx.font = 'bold 23px sans-serif';
 ctx.fillText(lines[1] || '', 256, 120);
 const t = new T.CanvasTexture(c);
 t.colorSpace = T.SRGBColorSpace;
 t.anisotropy = 4;
 return t;
}

function createBarrierGate(parent, staticGroup, x, z, y, side, mats, shared) {
 // side = -1 => arm extends toward -Z (north / entry lane); side = +1 => arm extends toward +Z (south / exit lane)
 const root = new T.Group();
 root.name = side < 0 ? 'Parking entry barrier' : 'Parking exit barrier';
 root.position.set(x, y, z);
 parent.add(root);

 const {bodyMat, trimMat, armMat} = shared;
 const beaconMat = new T.MeshStandardMaterial({color: 0xdd2218, emissive: 0xdd2218, emissiveIntensity: .9, roughness: .3});

 const addStatic = (geo, mat, dx, dy, dz, cast = false) => {
  const m = new T.Mesh(geo, mat);
  m.position.set(x + dx, y + dy, z + dz);
  m.castShadow = cast; m.receiveShadow = true;
  staticGroup.add(m);
 };
 addStatic(new T.BoxGeometry(.52, .12, .48), mats.concrete, 0, .06, 0);
 addStatic(new T.BoxGeometry(.38, 1.06, .34), bodyMat, 0, .62, 0, true);
 addStatic(new T.BoxGeometry(.42, .08, .38), trimMat, 0, 1.18, 0);
 // Far catch-rest post on the opposite kerb of the lane
 const armLen = 3.55;
 addStatic(new T.BoxGeometry(.09, .92, .09), bodyMat, 0, .46, side * (armLen + .15));

 const beacon = new T.Mesh(new T.CylinderGeometry(.06, .06, .12, 10), beaconMat);
 beacon.position.y = 1.28; root.add(beacon);

 // Pivoting boom arm: local Z extends from 0 to side * 3.55 m.
 // Rotating around X by (-side * angle) lifts the arm cleanly toward +Y.
 const pivot = new T.Group();
 pivot.position.set(0, .94, side * .18);
 root.add(pivot);

 const arm = new T.Mesh(new T.BoxGeometry(.055, .10, armLen), armMat);
 arm.position.set(0, 0, side * armLen / 2);
 arm.castShadow = true;
 pivot.add(arm);

 return {
  root, pivot, beaconMat, side,
  open: 0, // 0 = closed, 1 = fully raised
  target: 0,
  setOpen(v) {
   this.open = T.MathUtils.clamp(v, 0, 1);
   this.pivot.rotation.x = -this.side * this.open * 1.42;
   const green = this.open > 0.55;
   this.beaconMat.color.setHex(green ? 0x22cc55 : 0xdd2218);
   this.beaconMat.emissive.setHex(green ? 0x22cc55 : 0xdd2218);
  }
 };
}

export function buildParkingLotEntrance(parkGroup, {mats, lampPositions}) {
 const dy = DEPOT_Y;
 const root = new T.Group();
 root.name = 'Parking lot gate & ticket office';
 (parkGroup.parent || parkGroup).add(root);
 const staticGroup = new T.Group();
 staticGroup.name = 'Parking lot entrance static';
 root.add(staticGroup);

 const bodyMat = new T.MeshStandardMaterial({color: 0xe39b18, roughness: .42, metalness: .25});
 const trimMat = new T.MeshStandardMaterial({color: 0x2b3942, roughness: .48, metalness: .35});
 const wallMat = new T.MeshStandardMaterial({color: 0xd9dde0, roughness: .72});
 const glassMat = new T.MeshStandardMaterial({color: 0x5c8596, roughness: .22, metalness: .15, emissive: 0xffe4b0, emissiveIntensity: .15});
 const hazardMat = new T.MeshStandardMaterial({map: stripeTexture(['#e8b824', '#222426']), roughness: .75});
 const armMat = new T.MeshStandardMaterial({map: stripeTexture(['#d82820', '#f4f4f2']), roughness: .42, metalness: .12});
 const shared = {bodyMat, trimMat, armMat};

 // 1. Flush tarmac entrance apron connecting the end of Depot service road smoothly into the parking lot west aisle.
 const apron = new T.Mesh(new T.BoxGeometry(16, .08, 13.4), mats.road);
 apron.position.set(GATE_X + 2.5, dy + .02, GATE_Z);
 apron.receiveShadow = true;
 staticGroup.add(apron);

 // Painted stop bars & yellow-black speed humps at entry/exit barriers
 for (const [x, z] of [[GATE_X - 2.6, ENTRY_Z], [GATE_X + 2.6, EXIT_Z]]) {
  const m = new T.Mesh(new T.BoxGeometry(.35, .02, 3.2), mats.white);
  m.position.set(x, dy + .072, z); staticGroup.add(m);
 }
 for (const [x, z] of [[GATE_X - 4.4, ENTRY_Z], [GATE_X + 4.4, EXIT_Z]]) {
  const hump = new T.Mesh(new T.BoxGeometry(.55, .06, 3.3), hazardMat);
  hump.position.set(x, dy + .07, z); staticGroup.add(hump);
 }

 // 2. Central concrete splitter island separating IN and OUT lanes + Octopus/ticket dispenser kiosks.
 const island = new T.Mesh(new T.BoxGeometry(5.6, .18, 1.05), mats.concrete);
 island.position.set(GATE_X, dy + .12, GATE_Z);
 island.receiveShadow = true; island.castShadow = true;
 staticGroup.add(island);
 for (const dx of [-2.85, 2.85]) {
  const nose = new T.Mesh(new T.CylinderGeometry(.52, .52, .18, 12), hazardMat);
  nose.position.set(GATE_X + dx, dy + .12, GATE_Z);
  staticGroup.add(nose);
 }
 for (const [dx, dz] of [[-1.55, -.28], [1.55, .28]]) {
  const col = new T.Mesh(new T.BoxGeometry(.34, 1.28, .28), trimMat);
  col.position.set(GATE_X + dx, dy + .84, GATE_Z + dz); col.castShadow = true; staticGroup.add(col);
  const scr = new T.Mesh(new T.BoxGeometry(.22, .22, .04), glassMat);
  scr.position.set(GATE_X + dx, dy + 1.15, GATE_Z + dz + (dz < 0 ? -.14 : .14)); staticGroup.add(scr);
 }

 // 3. Two animated boom barrier gates (entry on north lane, exit on south lane).
 const entryGate = createBarrierGate(root, staticGroup, GATE_X, GATE_Z - .42, dy + .18, -1, mats, shared);
 const exitGate = createBarrierGate(root, staticGroup, GATE_X, GATE_Z + .42, dy + .18, 1, mats, shared);

 // 4. Overhead PARKING ENTRANCE portal gantry (height 5.3 m, clear of 4.4 m tall trucks).
 for (const z of [GATE_Z - 4.7, GATE_Z + 4.7]) {
  const leg = new T.Mesh(new T.BoxGeometry(.26, 5.4, .26), trimMat);
  leg.position.set(GATE_X - 1.2, dy + 2.7, z); leg.castShadow = true; staticGroup.add(leg);
 }
 const beam = new T.Mesh(new T.BoxGeometry(.28, .32, 9.7), trimMat);
 beam.position.set(GATE_X - 1.2, dy + 5.25, GATE_Z); beam.castShadow = true; staticGroup.add(beam);
 const gantrySignMat = new T.MeshStandardMaterial({map: signTexture(['公眾及貨車停車場', 'PUBLIC & GOODS VEHICLE PARK · IN / OUT']), roughness: .45});
 const gantryBoard = new T.Mesh(new T.BoxGeometry(.14, 1.05, 5.6), gantrySignMat);
 gantryBoard.position.set(GATE_X - 1.32, dy + 5.35, GATE_Z);
 staticGroup.add(gantryBoard);

 // 5. Pedestrian red-brick walkway continuing from the private road footpath past the Ticket Office into the lot.
 const walkMat = mats.walkRed ?? mats.walk;
 const walk = new T.Mesh(new T.BoxGeometry(15.5, .14, 2.3), walkMat);
 walk.position.set(GATE_X + 2.0, dy + .09, WALK_Z);
 walk.receiveShadow = true;
 staticGroup.add(walk);
 for (let x = GATE_X - 4.5; x <= GATE_X + 7.5; x += 2.2) {
  const b = new T.Mesh(new T.CylinderGeometry(.07, .07, .85, 8), bodyMat);
  b.position.set(x, dy + .55, WALK_Z - 1.05); staticGroup.add(b);
 }

 // 6. Ticket / Shroff Office (停車場繳費處 · TICKET OFFICE) beside the pedestrian walkway & exit lane.
 const ox = GATE_X + 2.2, oz = WALK_Z + 2.75;
 const addOffice = (geo, mat, dx, y0, dz, cast = false) => {
  const m = new T.Mesh(geo, mat);
  m.position.set(ox + dx, dy + y0, oz + dz);
  m.castShadow = cast; m.receiveShadow = true;
  staticGroup.add(m);
 };
 addOffice(new T.BoxGeometry(4.8, .22, 3.4), mats.concrete, 0, .11, 0);
 addOffice(new T.BoxGeometry(4.4, 1.15, 3.0), wallMat, 0, .795, 0, true);
 for (const sx of [-2.12, 2.12]) for (const sz of [-1.42, 1.42]) {
  addOffice(new T.BoxGeometry(.16, 1.55, .16), trimMat, sx, 2.14, sz);
 }
 addOffice(new T.BoxGeometry(4.26, 1.42, 2.86), glassMat, 0, 2.08, 0);
 addOffice(new T.BoxGeometry(4.4, 1.55, .18), wallMat, 0, 2.14, 1.41);
 addOffice(new T.BoxGeometry(2.6, .10, .48), mats.concrete, 0, 1.32, -1.62);
 addOffice(new T.BoxGeometry(5.6, .22, 4.8), trimMat, 0, 3.02, -.55, true);
 addOffice(new T.BoxGeometry(5.68, .12, 4.88), wallMat, 0, 3.16, -.55);
 const ticketSignMat = new T.MeshStandardMaterial({map: signTexture(['停車場繳費處', 'TICKET OFFICE · SHROFF'], '#184238', '#fff5d6', '#e8b931'), roughness: .4});
 addOffice(new T.BoxGeometry(3.8, .72, .08), ticketSignMat, 0, 3.48, -2.92);
 addOffice(new T.BoxGeometry(.08, .72, 3.2), ticketSignMat, -2.82, 3.48, -.55);

 mergeByMaterial(staticGroup);

 // Warm canopy downlight registered in lampPositions for night illumination
 if (lampPositions) {
  lampPositions.push({s: 3560, x: ox, y: dy + 2.9, z: oz - 1.8, kind: 'city'});
  lampPositions.push({s: 3560, x: GATE_X, y: dy + 5.0, z: GATE_Z, kind: 'city'});
 }

 function setNight(on) {
  glassMat.emissiveIntensity = on ? 1.15 : .15;
  ticketSignMat.emissive.setHex(on ? 0xffe8b0 : 0);
  ticketSignMat.emissiveIntensity = on ? .45 : 0;
  gantrySignMat.emissive.setHex(on ? 0xffe8b0 : 0);
  gantrySignMat.emissiveIntensity = on ? .42 : 0;
 }

 function updateGates(vehiclePositions, dt) {
  // Open each barrier if any vehicle is approaching within 11 m before or clearing within 6.5 m after the barrier in its lane.
  let wantEntry = false, wantExit = false;
  for (const v of vehiclePositions) {
   const dx = v.x - GATE_X;
   if (Math.abs(v.z - ENTRY_Z) < 2.2 && dx > -11.5 && dx < 6.5) wantEntry = true;
   if (Math.abs(v.z - EXIT_Z) < 2.2 && dx > -6.5 && dx < 11.5) wantExit = true;
  }
  const speed = 1.65;
  entryGate.target = wantEntry ? 1 : 0;
  exitGate.target = wantExit ? 1 : 0;
  for (const g of [entryGate, exitGate]) {
   if (Math.abs(g.open - g.target) > 1e-4) {
    const dir = Math.sign(g.target - g.open);
    g.setOpen(g.open + dir * Math.min(Math.abs(g.target - g.open), speed * dt));
   }
  }
 }

 return {root, entryGate, exitGate, setNight, updateGates, officePos: {x: ox, y: dy, z: oz}};
}

// Procedural Hong Kong medium goods truck / box lorry (local -Z forward, matching TRIPO_VEHICLES).
export function buildBoxTruck(cabColor = 0xe8ecf0, boxColor = 0xf2f3f0) {
 const g = new T.Group();
 g.name = 'box-truck';
 const cabMat = new T.MeshStandardMaterial({color: cabColor, roughness: .38, metalness: .22});
 const boxMat = new T.MeshStandardMaterial({color: boxColor, roughness: .58, metalness: .12});
 const darkMat = new T.MeshStandardMaterial({color: 0x202428, roughness: .82, metalness: .15});
 const glassMat = new T.MeshStandardMaterial({color: 0x2c4252, roughness: .18, metalness: .35});
 const headMat = new T.MeshStandardMaterial({color: 0xfff4cc, emissive: 0xfff0b0, emissiveIntensity: .3, roughness: .2});
 const tailMat = new T.MeshStandardMaterial({color: 0xcc1e18, emissive: 0xaa1410, emissiveIntensity: .25, roughness: .3});

 const add = (geo, mat, x, y, z, shadow = true) => {
  const m = new T.Mesh(geo, mat);
  m.position.set(x, y, z);
  m.castShadow = shadow; m.receiveShadow = true;
  g.add(m);
  return m;
 };
 // Chassis & bumper (length ~7.2 m, width ~2.3 m, height ~3.2 m)
 add(new T.BoxGeometry(2.15, .36, 6.9), darkMat, 0, .62, .1, false);
 add(new T.BoxGeometry(2.26, .28, .22), darkMat, 0, .54, -3.45, false);
 // Forward cab (-Z front)
 add(new T.BoxGeometry(2.22, 1.85, 1.95), cabMat, 0, 1.65, -2.42);
 add(new T.BoxGeometry(2.04, .76, .08), glassMat, 0, 2.02, -3.40, false);
 add(new T.BoxGeometry(1.70, .42, .06), darkMat, 0, 1.24, -3.40, false);
 for (const sx of [-.82, .82]) {
  add(new T.BoxGeometry(.34, .18, .06), headMat, sx, .96, -3.42, false);
  add(new T.BoxGeometry(.28, .16, .06), tailMat, sx, .82, 3.55, false);
 }
 // Cargo box body
 add(new T.BoxGeometry(2.36, 2.38, 4.85), boxMat, 0, 2.02, 1.08);
 // 4 wheels (front axle + dual-look rear axle)
 const wheelGeo = new T.CylinderGeometry(.46, .46, .34, 12);
 wheelGeo.rotateZ(Math.PI / 2);
 for (const [wx, wz] of [[-1.02, -2.35], [1.02, -2.35], [-1.02, 1.85], [1.02, 1.85]]) {
  add(wheelGeo, darkMat, wx, .46, wz, false);
 }
 return g;
}

// Build a merged single-material-per-part InstancedMesh set from a template Group for parked vehicles.
function instanceVehicleSet(parent, template, matrices, name) {
 if (!matrices.length || !template) return;
 template.updateMatrixWorld(true);
 const inv = template.matrixWorld.clone().invert();
 const by = new Map();
 template.traverse(n => {
  if (!n.isMesh) return;
  let geo = n.geometry.clone().applyMatrix4(inv.clone().multiply(n.matrixWorld));
  for (const a of Object.keys(geo.attributes)) if (!['position', 'normal', 'uv'].includes(a)) geo.deleteAttribute(a);
  if (!geo.attributes.normal) geo.computeVertexNormals();
  if (geo.index) geo = geo.toNonIndexed();
  if (!by.has(n.material)) by.set(n.material, []);
  by.get(n.material).push(geo);
 });
 for (const [mat, geos] of by) {
  if (!geos.every(g => g.attributes.uv)) geos.forEach(g => g.deleteAttribute('uv'));
  const mesh = new T.InstancedMesh(mergeGeometries(geos), mat, matrices.length);
  geos.forEach(g => g.dispose());
  matrices.forEach((m, i) => mesh.setMatrixAt(i, m));
  mesh.instanceMatrix.needsUpdate = true;
  mesh.name = name;
  mesh.castShadow = true;
  mesh.receiveShadow = true;
  mesh.computeBoundingSphere();
  parent.add(mesh);
 }
}

function polylineSampler(pts) {
 const s = [0];
 for (let i = 1; i < pts.length; i++) {
  s.push(s[i - 1] + Math.hypot(pts[i].x - pts[i - 1].x, pts[i].z - pts[i - 1].z));
 }
 const len = s.at(-1);
 return {
  len,
  at(dist) {
   const d = T.MathUtils.clamp(dist, 0, len);
   let i = 1;
   while (i < s.length - 1 && s[i] < d) i++;
   const a = pts[i - 1], b = pts[i], seg = (s[i] - s[i - 1]) || 1, u = (d - s[i - 1]) / seg;
   const dx = b.x - a.x, dz = b.z - a.z, n = Math.hypot(dx, dz) || 1;
   return {
    x: a.x + dx * u,
    y: a.y + (b.y - a.y) * u,
    z: a.z + dz * u,
    tx: dx / n,
    tz: dz / n,
    yaw: Math.atan2(-dx / n, -dz / n), // local -Z forward
   };
  }
 };
}

export function createParkingLotLife({scene, parkingEntrance, vehicleModels, streetModel, posePedestrian, pedStep, pedestrianCount}) {
 const dy = DEPOT_Y + .05;
 const root = new T.Group();
 root.name = 'Parking lot vehicles & people';
 scene.add(root);

 // Reserve 6 stalls across the aisles for live entering/exiting vehicles; populate the rest with a diverse mix of trucks & private cars.
 const liveStallIndices = [2, 8, 22, 30, 44, 58].filter(i => i < CV_STALLS.length);
 const reserved = new Set(liveStallIndices);

 let seed = 19;
 const rand = () => (seed = (seed * 16807) % 2147483647) / 2147483647;
 const buckets = {truckWhite: [], truckBlue: [], truckRed: [], van: [], car: [], suv: [], hatchback: [], taxi: []};
 const pos = new T.Vector3(), quat = new T.Quaternion(), eul = new T.Euler(), one = new T.Vector3(1, 1, 1);

 CV_STALLS.forEach((c, idx) => {
  if (reserved.has(idx) || rand() < .20) return;
  pos.set(c.x, dy, c.z);
  eul.set(0, rand() < .5 ? 0 : Math.PI, 0);
  quat.setFromEuler(eul);
  const m = new T.Matrix4().compose(pos, quat, one);
  // North rows (z < -2695): mostly goods trucks & vans; South rows (z >= -2695): mix of private cars, SUVs, hatchbacks, vans & trucks.
  const u = rand();
  if (c.z < -2695) {
   if (u < .30) buckets.truckWhite.push(m);
   else if (u < .50) buckets.truckBlue.push(m);
   else if (u < .64) buckets.truckRed.push(m);
   else if (u < .84) buckets.van.push(m);
   else buckets.suv.push(m);
  } else {
   if (u < .24) buckets.car.push(m);
   else if (u < .44) buckets.suv.push(m);
   else if (u < .62) buckets.hatchback.push(m);
   else if (u < .74) buckets.taxi.push(m);
   else if (u < .86) buckets.van.push(m);
   else buckets.truckWhite.push(m);
  }
 });

 instanceVehicleSet(root, buildBoxTruck(0xe8ecf0, 0xf2f4f2), buckets.truckWhite, 'parked goods truck (white)');
 instanceVehicleSet(root, buildBoxTruck(0x28568f, 0xeaeef2), buckets.truckBlue, 'parked goods truck (blue)');
 instanceVehicleSet(root, buildBoxTruck(0xb5342a, 0xf0eee8), buckets.truckRed, 'parked goods truck (red)');
 for (const kind of ['van', 'car', 'suv', 'hatchback', 'taxi']) {
  instanceVehicleSet(root, vehicleModels?.get(kind), buckets[kind], 'parked ' + kind);
 }

 // Build inbound & outbound lane polylines along Depot service road (CV_FRAME) into the parking lot.
 const inboundRoad = CV_FRAME.slice(0, -4).map(f => ({
  x: f.x + f.lx * 1.85,
  y: f.y + .05,
  z: f.z + f.lz * 1.85,
 }));
 const outboundRoad = CV_FRAME.slice(0, -4).reverse().map(f => ({
  x: f.x - f.lx * 1.85,
  y: f.y + .05,
  z: f.z - f.lz * 1.85,
 }));

 // Build a full loop path for each live vehicle: D5 mouth -> service road IN -> ENTRY gate -> aisle -> stall -> aisle -> EXIT gate -> service road OUT -> D5 mouth.
 const liveSpecs = [
  {kind: 'truck', cab: 0x26548c, stall: CV_STALLS[liveStallIndices[0]], speed: 7.0, phase: 0.04},
  {kind: 'car', stall: CV_STALLS[liveStallIndices[1]], speed: 8.2, phase: 0.22},
  {kind: 'van', stall: CV_STALLS[liveStallIndices[2]], speed: 7.6, phase: 0.41},
  {kind: 'suv', stall: CV_STALLS[liveStallIndices[3]], speed: 8.0, phase: 0.59},
  {kind: 'truck', cab: 0xc23a2c, stall: CV_STALLS[liveStallIndices[4]], speed: 6.8, phase: 0.76},
  {kind: 'hatchback', stall: CV_STALLS[liveStallIndices[5]], speed: 8.4, phase: 0.91},
 ];

 const liveVehicles = liveSpecs.map((spec, idx) => {
  const st = spec.stall;
  // Choose aisle z based on stall row
  const aisleZ = st.z < -2700 ? -2715.5 : -2673.0;
  const inPts = [
   ...inboundRoad,
   {x: GATE_X - 4.0, y: dy, z: ENTRY_Z},
   {x: GATE_X + 4.0, y: dy, z: ENTRY_Z},
   {x: -355.5, y: dy, z: ENTRY_Z},
   {x: -355.5, y: dy, z: aisleZ},
   {x: st.x - 2.0, y: dy, z: aisleZ},
   {x: st.x, y: dy, z: st.z},
  ];
  const outPts = [
   {x: st.x, y: dy, z: st.z},
   {x: st.x - 2.0, y: dy, z: aisleZ},
   {x: -355.5, y: dy, z: aisleZ},
   {x: -355.5, y: dy, z: EXIT_Z},
   {x: GATE_X + 4.0, y: dy, z: EXIT_Z},
   {x: GATE_X - 4.0, y: dy, z: EXIT_Z},
   ...outboundRoad,
  ];
  const inPath = polylineSampler(inPts);
  const outPath = polylineSampler(outPts);
  // Find exact distances of the entry & exit gate stop points
  const inGateDist = inPath.len - Math.hypot(st.x - (st.x - 2), st.z - aisleZ) - Math.hypot((st.x - 2) - (-355.5), 0) - Math.hypot(0, aisleZ - ENTRY_Z) - Math.hypot(-355.5 - (GATE_X + 4), 0) - 8.0;
  const outGateDist = Math.hypot(st.x - (st.x - 2), st.z - aisleZ) + Math.hypot((st.x - 2) - (-355.5), 0) + Math.hypot(0, EXIT_Z - aisleZ) + Math.hypot(-355.5 - (GATE_X + 4), 0);

  const group = spec.kind === 'truck'
   ? buildBoxTruck(spec.cab, 0xf2f3f0)
   : streetModel(spec.kind);
  group.name = 'parking-live-' + spec.kind + '-' + idx;
  scene.add(group);

  const totalDist = inPath.len + outPath.len;
  const startDist = spec.phase * totalDist;
  const entering = startDist < inPath.len;
  return {
   group, spec, inPath, outPath, inGateDist, outGateDist,
   state: entering ? 'in' : 'out',
   s: entering ? startDist : startDist - inPath.len,
   v: 0,
   wait: 0,
   x: GATE_X, y: dy, z: GATE_Z,
  };
 });

 // Build pedestrian paths along the new red-brick footpath on Depot service road -> Ticket Office -> inside parking lot.
 const footOffset = -(CV_ROAD_WIDTH / 2 + 1.45);
 const roadWalkPts = CV_FRAME.slice(2, -4).map(f => ({
  x: f.x + f.lx * footOffset,
  y: f.y + .17,
  z: f.z + f.lz * footOffset,
 }));
 const lotWalkPaths = [
  // Path 0: Full footpath walk from Road D5 -> Ticket Office -> pedestrian gate -> parking lot west aisle
  polylineSampler([
   ...roadWalkPts,
   {x: GATE_X - 2.0, y: dy + .11, z: WALK_Z},
   {x: GATE_X + 2.2, y: dy + .11, z: WALK_Z},
   {x: -355.0, y: dy, z: WALK_Z},
   {x: -355.0, y: dy, z: -2690.0},
   {x: -332.0, y: dy, z: -2673.0},
  ]),
  // Path 1: Footpath walk from Road D5 -> Ticket Office -> north parking aisle
  polylineSampler([
   ...roadWalkPts,
   {x: GATE_X - 2.0, y: dy + .11, z: WALK_Z},
   {x: GATE_X + 2.2, y: dy + .11, z: WALK_Z},
   {x: -353.0, y: dy, z: WALK_Z},
   {x: -353.0, y: dy, z: -2715.0},
   {x: -318.0, y: dy, z: -2715.0},
  ]),
  // Path 2: Inside parking lot between Ticket Office & southern car bays
  polylineSampler([
   {x: GATE_X + 2.2, y: dy + .11, z: WALK_Z + .4},
   {x: -354.0, y: dy, z: WALK_Z},
   {x: -354.0, y: dy, z: -2673.0},
   {x: -300.0, y: dy, z: -2673.0},
  ]),
  // Path 3: Inside parking lot between Ticket Office & northern truck bays
  polylineSampler([
   {x: GATE_X + 2.2, y: dy + .11, z: WALK_Z + .4},
   {x: -354.0, y: dy, z: WALK_Z},
   {x: -354.0, y: dy, z: -2715.0},
   {x: -292.0, y: dy, z: -2715.0},
  ]),
 ];

 const walkers = [];
 for (let i = 0; i < 8; i++) {
  const path = lotWalkPaths[i % lotWalkPaths.length];
  const group = streetModel('pedestrian_' + ((i * 3 + 1) % pedestrianCount));
  group.name = 'parking-pedestrian-' + i;
  scene.add(group);
  walkers.push({
   group, path,
   s: ((i + .3) / 8) * path.len,
   dir: i % 2 ? 1 : -1,
   speed: 1.15 + (i % 3) * .16,
   wait: 0,
  });
 }

 // Ticket office attendant standing inside/at the counter window
 const attendant = streetModel('pedestrian_0');
 attendant.name = 'parking-ticket-attendant';
 attendant.position.set(parkingEntrance.officePos.x, dy + .18, parkingEntrance.officePos.z - .45);
 attendant.rotation.y = Math.PI; // facing north toward the pedestrian counter & gate
 scene.add(attendant);

 function update(dt, cameraPos, playerCar) {
  const distToLot = Math.hypot(cameraPos.x - GATE_X, cameraPos.z - GATE_Z);
  const visible = distToLot < 420;
  attendant.visible = visible;

  const gateCheckVehicles = [];
  if (playerCar?.active) gateCheckVehicles.push({x: playerCar.x, z: playerCar.z});

  for (const lv of liveVehicles) {
   lv.group.visible = visible;
   if (!visible) continue;

   if (lv.state === 'parked') {
    lv.wait -= dt;
    if (lv.wait <= 0) {
     lv.state = 'out';
     lv.s = 0;
     lv.v = 0;
    }
   } else {
    const path = lv.state === 'in' ? lv.inPath : lv.outPath;
    const gateStop = lv.state === 'in' ? lv.inGateDist : lv.outGateDist;
    const gate = lv.state === 'in' ? parkingEntrance.entryGate : parkingEntrance.exitGate;

    // Slow down & pause cleanly at the barrier until the boom arm opens!
    const distToStop = gateStop - lv.s;
    let targetSpeed = lv.spec.speed;
    if (distToStop > -1.2 && distToStop < 14) {
     if (distToStop < 2.2 && gate.open < 0.72) targetSpeed = 0;
     else targetSpeed = Math.min(targetSpeed, Math.max(2.2, distToStop * .6));
    }
    // Slow down approaching parking stall or D5 junction
    const distToEnd = path.len - lv.s;
    if (distToEnd < 12) targetSpeed = Math.min(targetSpeed, Math.max(1.5, distToEnd * .55));

    // Simple spacing check so live vehicles never clip through each other
    for (const other of liveVehicles) {
     if (other === lv || other.state !== lv.state) continue;
     const gap = other.s - lv.s;
     if (gap > 0 && gap < 12) targetSpeed = Math.min(targetSpeed, Math.max(0, (gap - 8.5) * 1.4));
    }

    const accel = targetSpeed > lv.v ? 3.2 : 5.5;
    lv.v += Math.sign(targetSpeed - lv.v) * Math.min(Math.abs(targetSpeed - lv.v), accel * dt);
    lv.s += lv.v * dt;

    if (lv.s >= path.len) {
     if (lv.state === 'in') {
      lv.state = 'parked';
      lv.s = path.len;
      lv.v = 0;
      lv.wait = 5.5 + (lv.spec.phase * 5);
     } else {
      lv.state = 'in';
      lv.s = 0;
      lv.v = 0;
     }
    }
   }

   const activePath = lv.state === 'out' ? lv.outPath : lv.inPath;
   const p = activePath.at(lv.s);
   lv.x = p.x; lv.y = p.y; lv.z = p.z;
   lv.group.position.set(p.x, p.y, p.z);
   lv.group.rotation.y = p.yaw;
   gateCheckVehicles.push({x: p.x, z: p.z});
  }

  // Update entry & exit boom barriers based on all live vehicles + playerCar
  parkingEntrance.updateGates(gateCheckVehicles, dt);

  // Update pedestrians along the footpath, ticket office, and parking lot aisles
  for (const w of walkers) {
   w.group.visible = visible;
   if (!visible) continue;
   if (w.wait > 0) {
    w.wait -= dt;
    posePedestrian(w.group, 0, dt, pedStep(w.group));
    continue;
   }
   w.s += w.dir * w.speed * dt;
   if (w.s >= w.path.len) { w.s = w.path.len; w.dir = -1; w.wait = 2.0; }
   else if (w.s <= 0) { w.s = 0; w.dir = 1; w.wait = 1.5; }
   const p = w.path.at(w.s);
   w.group.position.set(p.x, p.y, p.z);
   w.group.rotation.y = Math.atan2(w.dir * p.tx, w.dir * p.tz);
   posePedestrian(w.group, w.speed, dt, pedStep(w.group));
  }
  if (visible) posePedestrian(attendant, 0, dt, pedStep(attendant));
 }

 return {root, liveVehicles, walkers, update};
}
