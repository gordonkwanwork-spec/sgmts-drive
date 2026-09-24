// W1 checks (node): smooth MTR viaduct alignment and night lighting of Hung Shui Kiu station and its entrances.
// Run: node src/checks/viaduct-lighting.test.js
import assert from 'node:assert/strict';
import {sample,project,LENGTH,STOPS,RAILWAY,railSample,roadSection,CYCLE_BRIDGES} from '../alignment.js';

// Rail alignment: finite, continuous, no cusps, heavy-rail radius, straight station box.
const MIN_RADIUS=200,STEP=2;
let minR=Infinity,maxTurn=0,prev=null;
for(let u=0;u<=RAILWAY.length;u+=STEP){const p=RAILWAY.at(u);for(const k of ['x','y','z','tx','tz','heading'])assert(Number.isFinite(p[k]),`rail ${k} finite at u=${u}`);assert(Math.abs(Math.hypot(p.tx,p.tz)-1)<1e-9);
 if(prev){assert(Math.abs(Math.hypot(p.x-prev.x,p.z-prev.z)-STEP)<1e-3,`rail arc length is uniform at u=${u} (no cusp or jump)`);const turn=Math.abs(Math.atan2(prev.tx*p.tz-prev.tz*p.tx,prev.tx*p.tx+prev.tz*p.tz));maxTurn=Math.max(maxTurn,turn);if(turn>1e-9)minR=Math.min(minR,STEP/turn);
  const chord={x:(p.x-prev.x)/STEP,z:(p.z-prev.z)/STEP};assert(chord.x*p.tx+chord.z*p.tz>.999,`tangent follows the curve at u=${u}`);}
 prev=p;}
assert(minR>=MIN_RADIUS-.01,`minimum rail radius ${minR.toFixed(1)} m >= ${MIN_RADIUS} m`);
assert(maxTurn<.0101,`heading change per ${STEP} m ${maxTurn.toFixed(4)} rad`);
for(let s=RAILWAY.start;s<=RAILWAY.end;s+=1){const p=railSample(s),q=railSample(Math.min(s+1,RAILWAY.end));assert(Number.isFinite(p.x+p.z+p.y));assert(Math.hypot(q.x-p.x,q.z-p.z)<3,`railSample continuous at s=${s}`);}
// No self-intersection: non-adjacent 8 m chords of the rail polyline never cross or come close.
const line=Array.from({length:Math.floor(RAILWAY.length/8)+1},(_,i)=>RAILWAY.at(i*8));
for(let i=0;i<line.length;i++)for(let j=i+6;j<line.length;j++)assert(Math.hypot(line[i].x-line[j].x,line[i].z-line[j].z)>20,`rail does not fold back (u=${i*8}/${j*8})`);
// Station box: HSK centre sits on railSample(A2) and the whole 224 m roof (plus margin) lies on straight track.
const a2=STOPS[1],centre=railSample(a2.s);assert.equal(RAILWAY.station,a2.s);assert(Math.abs(centre.u-RAILWAY.stationU)<1e-6);
for(let d=-120;d<=120;d+=4){const p=RAILWAY.at(RAILWAY.stationU+d);assert(Math.abs(p.heading-centre.heading)<1e-9,`station section straight at ${d} m`);assert(Math.abs((p.x-centre.x)*centre.lx+(p.z-centre.z)*centre.lz)<1e-6);}
let straight=0;for(let d=0;Math.abs(RAILWAY.at(RAILWAY.stationU+d).heading-centre.heading)<1e-9&&d<600;d+=1)straight++;for(let d=-1;Math.abs(RAILWAY.at(RAILWAY.stationU+d).heading-centre.heading)<1e-9&&d>-600;d-=1)straight++;
// The viaduct still crosses the corridor once, close to Ch.160, and keeps the station on the plaza (left) side.
const lat=u=>{const p=RAILWAY.at(u),q=project(p.x,p.z),r=sample(q);return {c:r.c,lat:(p.x-r.x)*r.lx+(p.z-r.z)*r.lz};};
const crossings=[];let last=lat(0);for(let u=4;u<=RAILWAY.length;u+=4){const now=lat(u);if(Math.sign(now.lat)!==Math.sign(last.lat))crossings.push(now.c);last=now;}
assert.equal(crossings.length,1,`viaduct crosses the corridor once (${crossings.map(c=>c.toFixed(0))})`);assert(Math.abs(crossings[0]-160)<40,`crossing near Ch.160 (Ch.${crossings[0].toFixed(0)})`);
assert(lat(RAILWAY.stationU).lat< -80,'station sits beyond the plaza on the left');

// Environment: continuous swept viaduct, scenery clearance by true rail distance, night-only station lighting.
const noop=new Proxy(function(){},{get:(t,k)=>k===Symbol.toPrimitive?()=>0:k==='canvas'?{}:noop,apply:()=>noop,set:()=>true});
globalThis.document??={createElement:()=>({width:0,height:0,getContext:()=>noop,style:{}})};
const T=await import('three'),{buildEnvironment,sceneryClear,cycleClearance}=await import('../environment.js');
for(let u=0;u<=RAILWAY.length;u+=10){const p=RAILWAY.at(u);for(const off of [0,6,-6])assert(!sceneryClear(p.x+p.lx*off,p.z+p.lz*off,4),`scenery cannot sit on the viaduct at u=${u}`);assert(RAILWAY.distance(p.x,p.z)<.5);}
for(let s=0;s<LENGTH;s+=30){const r=sample(s);assert(!sceneryClear(r.x,r.z,10));}
const {GLTFLoader}=await import('three/addons/loaders/GLTFLoader.js'),{readFile}=await import('node:fs/promises');
const data=await readFile('public/assets/street-kit.glb'),kit=await new GLTFLoader().parseAsync(data.buffer.slice(data.byteOffset,data.byteOffset+data.byteLength),'');
const scene=new T.Scene(),env=buildEnvironment(scene,kit.scene),meshes=[];scene.traverse(o=>{if(o.isMesh)meshes.push(o);});
for(const name of ['MTR-viaduct','MTR-rail']){const list=meshes.filter(m=>m.name===name);assert.equal(list.length,1,`${name} is one continuous swept mesh`);list[0].geometry.computeBoundingBox();const b=list[0].geometry.boundingBox;assert(b.max.y<RAILWAY.at(0).y+1.2&&b.min.y>RAILWAY.at(0).y-1.4,`${name} spans rail level`);assert(list[0].castShadow&&list[0].receiveShadow);}
const station=scene.getObjectByName('Hung Shui Kiu Station');assert(Math.hypot(station.position.x-centre.x,station.position.z-centre.z)<1e-6);assert(Math.abs(station.rotation.y-centre.heading)<1e-9);
const night=meshes.filter(m=>m.name==='Station night lighting'),nightOnly=night.filter(m=>m.userData.nightOnly);
assert.equal(night.length,4,'station lighting merges into four meshes');assert.equal(nightOnly.length,2);
const glass=station.children.find(m=>m.material.transparent).material;
env.setNight(false);assert(nightOnly.every(m=>!m.visible),'LED lines and light spill hidden by day');assert.equal(glass.emissiveIntensity,0);assert.equal(glass.emissive.getHex(),0);
env.setNight(true);assert(nightOnly.every(m=>m.visible),'LED lines and light spill shown at night');assert(glass.emissiveIntensity>0&&glass.emissive.getHex()!==0,'station glazing glows warm at night');
env.setNight(false);assert.equal(glass.emissive.getHex(),0,'day appearance restored');
// Paving light pools: HSK concourse, both HSWRL entrances and every SGMTS ramp end have baked lamp positions.
const near=(x,z,r)=>env.lampPositions.some(l=>Math.hypot(l.x-x,l.z-z)<r);
const hall=station.localToWorld(new T.Vector3(-22,0,0));assert(near(hall.x,hall.z,16),'concourse hall lights the plaza');
for(const entrance of meshes.map(m=>m.parent).filter(g=>g?.name==='HSWRL underground entrance'))assert(near(entrance.position.x,entrance.position.z,10));
const {stationAccess}=await import('../environment.js');let ramps=0;
for(const st of STOPS)for(const platform of st.platforms)for(const dir of [-1,1]){if(st.id==='A1'&&dir===-1)continue;const {a,b}=stationAccess(st,platform,dir);for(const p of [a[1],b[1]])assert(near(p.x,p.z,1.5),`ramp lamp at ${st.id}`);ramps++;}
console.log(`Viaduct checks passed: min radius ${minR.toFixed(1)} m, max heading change ${(maxTurn*1000).toFixed(2)} mrad/${STEP} m, ${straight} m straight through HSK station, one corridor crossing at Ch.${crossings[0].toFixed(0)}.`);
console.log(`Night lighting checks passed: 4 merged station lighting meshes, day/night toggles, lamp pools at the concourse, both HSWRL entrances and ${ramps} SGMTS ramps.`);

for(const p of env.plots)assert(sceneryClear(p.x,p.z,p.radius),'Every building clears the full cycleway and bridge approaches');
assert(env.plantings.length>5000,'Dense planted verges');
assert.equal(new Set(env.plantings.map(p=>p.kind)).size,5);
for(const p of env.plantings){const s=project(p.x,p.z),r=sample(s);const low=p.verge&&['grass','meadow'].includes(p.kind);assert(Math.hypot(p.x-r.x,p.z-r.z)>=roadSection(s).right+(p.strip?3.95:low?4:4.2)&&cycleClearance(p.x,p.z)>=(p.strip?2.2:low?2.35:2.7)&&env.plots.every(q=>Math.hypot(q.x-p.x,q.z-p.z)>=q.radius+.5),'Adjacent planting stays outside paths and buildings');assert(p.heightScale>=1.3,'Taller verge planting');}
for(const kind of ['D1','L35 bend','Depot approach','Terminal loop','underbridge'])assert(env.lampPositions.some(l=>l.kind===kind),kind+' is lit');
for(const l of env.lampPositions)assert(Number.isFinite(l.x+l.y+l.z),'Finite lamp position');
for(const m of meshes.filter(m=>m.name==='Road D1 connecting alignment'&&m.material===env.materials.road))assert(m.userData.nightOverlay,'D1 surface receives lighting');
env.update(800,2);assert.equal(env.windTime.value,2);env.setNight(true);
assert(meshes.filter(m=>m.name==='Fixed night illumination').every(m=>m.visible));
// Verges between the left footpath and cycle track are planted wherever at least 0.9 m of open grass exists.
{const {pavementLight}=await import('../environment.js'),{cycleOffset,cycleSample,cycleCrossing,cycleBridgeAt,cycleBridgeHeight,JUNCTIONS}=await import('../alignment.js');
 const cells=new Map(),key=(x,z)=>Math.floor(x/2)+','+Math.floor(z/2);for(const p of env.plantings){const k=key(p.x,p.z);if(!cells.has(k))cells.set(k,[]);cells.get(k).push(p);}
 const near=(x,z,d)=>{for(let i=-1;i<=1;i++)for(let j=-1;j<=1;j++)for(const p of cells.get((Math.floor(x/2)+i)+','+(Math.floor(z/2)+j))||[])if(Math.hypot(p.x-x,p.z-z)<d)return true;return false;};
 let open=0,planted=0;
 for(let s=10;s<LENGTH-10;s+=5){const inner=-(roadSection(s).right+3.75),outer=cycleOffset(s)+2;if(inner-outer<.45)continue;const lat=(inner+outer)/2,r=sample(s),x=r.x+r.lx*lat,z=r.z+r.lz*lat;
  if(!sceneryClear(x,z,0,true)||STOPS.some(st=>Math.abs(s-st.s)<st.footprintLength/2+14))continue;open++;if(near(x,z,1.6))planted++;}
 assert(planted/open>.9,`verge planted ${planted}/${open}`);
 // Nothing planted between the A2 plaza and the cycle track.
 const a2=STOPS[1];assert(!env.plantings.some(p=>{const s=project(p.x,p.z),r=sample(s),lat=(p.x-r.x)*r.lx+(p.z-r.z)*r.lz;return s>a2.s-110&&s<a2.s+120&&lat<cycleOffset(s)-2&&lat>-84;}),'No vegetation between the A2 plaza and the cycle track');
 // The whole cycle track (ground and bridges) sits in lamp light, except under station roofs and at road crossings.
 const lamps=env.lampPositions.map(l=>({...l,axis:l.axis||sample(l.s)}));let dark=[];
 for(let s=10;s<LENGTH-10;s+=2){if(cycleCrossing(s)||STOPS.some(st=>Math.abs(s-st.s)<st.footprintLength/2+2)||!cycleBridgeAt(s)&&JUNCTIONS.some(j=>Math.abs(j.s-s)<j.halfWidth+4))continue;const c=cycleSample(s),v=new T.Vector3(c.x,c.groundY+cycleBridgeHeight(s),c.z);if(pavementLight(v,lamps.filter(l=>Math.abs(l.x-v.x)<30&&Math.abs(l.z-v.z)<30))<.3)dark.push(s);}
 assert(dark.length<8,'Cycle track dark at '+dark.slice(0,10).join(','));
 // Planting carries the baked lamp light used at night.
 const glow=meshes.filter(m=>m.isInstancedMesh&&/^vegetation-/.test(m.name)).flatMap(m=>[...m.geometry.attributes.nightGlow.array]);assert(glow.filter(g=>g>.3).length>glow.length*.2,'Verge planting lit at night');
 // Trees (canopy and trunk) use the wind/night-light shader and most catch lamp spill.
 const trees=meshes.filter(m=>m.isInstancedMesh&&/^(foliage|trunk)-/.test(m.name));assert(trees.every(m=>m.material.customProgramCacheKey()==='verge-wind-v3'),'Tree materials keep the night-light shader');
 const treeGlow=trees.flatMap(m=>[...m.geometry.attributes.nightGlow.array]);assert(treeGlow.filter(g=>g>.2).length>treeGlow.length*.6,'Trees lit at night');
 console.log(`Verge fill ${planted}/${open}, clear A2 plaza strip, lit cycle track (${dark.length} dark samples) and lit planting passed`);}
console.log(`${env.plantings.length} clear verge plantings, wind updates, connecting road lamps and lit D1 surfaces passed`);

const cycleRamps=meshes.filter(m=>m.name==='Cycle bridge approach ramp');
assert.equal(cycleRamps.length,CYCLE_BRIDGES.length*2);
for(const m of cycleRamps){const p=m.geometry.attributes.position;for(let i=0;i<p.count;i+=4){assert(Math.abs(p.getY(i+3)-p.getY(i)-.42)<.0001,'Ramp has 420 mm structural depth');assert(Math.abs(p.getY(i+2)-p.getY(i+1)-.42)<.0001);}assert(m.castShadow&&m.receiveShadow);}
assert.equal(meshes.filter(m=>m.name==='Cycle bridge abutment pier'&&m.parent.name.startsWith('Cycle footbridge')).length,CYCLE_BRIDGES.length*2);
assert(meshes.filter(m=>m.name.startsWith('cycle-ramp-pier-')).reduce((n,m)=>n+m.count,0)>30,'Ramp piers support long approaches');
assert(!meshes.some(m=>m.name.startsWith('planter-')),'No concrete tree boxes');
assert(meshes.some(m=>m.name.startsWith('tree-shrub-')),'Trees have shrub underplanting');
assert.equal(new Set(env.trees.map(t=>t.kind)).size,4,'Four tree forms');
console.log('Solid cycle decks and piers, four tree forms and shrub bases passed');

const plantsWithLOD=meshes.filter(m=>m.userData.full&&m.userData.low);
assert(plantsWithLOD.length>100,'Planting is divided into small distance-selectable cells');
for(const mesh of plantsWithLOD){const full=mesh.userData.full,low=mesh.userData.low;assert((low.index?.count||low.attributes.position.count)<(full.index?.count||full.attributes.position.count)*.35,'Distant geometry is substantially smaller');}
const plant=plantsWithLOD.find(m=>m.userData.s>700&&m.userData.s<2000),s=plant.userData.s;
env.update(s,0);assert(plant.visible&&plant.geometry===plant.userData.full,'Nearby detail retained');
env.update(s+150,0);assert(plant.visible&&plant.geometry===plant.userData.low,'Distant plant simplified');
env.update(s+700,0);assert(!plant.visible,'Far planting culled');
console.log('Near/full, distant/simplified and far/culled vegetation checks passed');
