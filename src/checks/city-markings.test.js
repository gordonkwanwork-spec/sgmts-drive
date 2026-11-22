// City streets to Hong Kong practice (sandbox ROAD-MARKINGS-GUIDE.md): medians stand clear of the crowned carriageway, every
// road / paving / paint surface faces up (a culled junction fill showed grass through the road), crossings are signal-controlled
// at crossroads and cautionary elsewhere (no zebras at side-road mouths), and yellow kerb lines are drawn.
import assert from 'node:assert/strict';
import fs from 'node:fs';
const ctx2d=new Proxy({},{get:(_,k)=>k==='measureText'?()=>({width:0}):k==='createLinearGradient'?()=>({addColorStop(){}}):()=>{},set:()=>true});
globalThis.document??={createElement:()=>({getContext:()=>ctx2d,width:0,height:0})};
const T=await import('three');
const {buildNetwork,networkMask,junctions,frameAt,roundaboutLaneShift,streetLevel,surfaceSampler}=await import('../street/network.js');
const {renderedGround}=await import('../environment.js');
const network=JSON.parse(fs.readFileSync(new URL('../../public/street/furniture.json',import.meta.url))).network;
const yellow=new T.MeshStandardMaterial({color:0xf2c230}),grass=new T.MeshStandardMaterial({color:0x55663c}),road=new T.MeshStandardMaterial({color:0x4b4f4d}),white=new T.MeshStandardMaterial({color:0xffffff});
const tactile=new T.MeshStandardMaterial(),brick=new T.MeshStandardMaterial(),concreteFloor=new T.MeshStandardMaterial();
const {lookMarkingMaterial}=await import('../street/look-marking.js');
const lookRight=lookMarkingMaterial(true),lookLeft=lookMarkingMaterial(false);
const g=buildNetwork(network,{ground:renderedGround,mats:{yellow,grass,road,white,tactile,lookRight,lookLeft,walk:brick,channel:concreteFloor}}),H=g.userData.surfaceHeight,{roads,joins}=junctions(network,renderedGround);
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
const midblocks=roads.flatMap(o=>o.r.midblocks),surfaceApproaches=cr.filter(c=>c.kind==='signal').length-midblocks.length;
for(const o of roads)for(const d of o.r.midblocks)assert.equal(o.r.staggers.has(d),o.P.median>=3);
assert(midblocks.length>0&&surfaceApproaches<approaches-3);
for(const group of groups.filter(g=>g.arms===1&&g.B.P.median)){
 const {host}=joins.find(j=>j.B===group.B&&Math.abs(j.at.d-group.d)<5&&j.host);
 assert.equal([host.lo,host.hi].filter(d=>group.B.r.signalCrossings.includes(d)).length,1);
}
assert.ok(cr.filter(c=>c.kind==='cautionary').length>=joins.filter(j=>!j.signal&&!j.B.r.loop).length-2,'a cautionary crossing at nearly every priority junction');

// D3/D5 is a conventional four-arm roundabout. Signs are on the raised lawn facing their
// own entry. The blue approach maps list the other three arms in actual clockwise order.
const {roadDestination}=await import('../city/destinations.js');
const [island]=g.userData.roundabouts;
const entries=joins.filter(j=>j.B.r.loop).sort((a,b)=>a.at.d-b.at.d);
assert.equal(island.entries.length,4);
const whiteHeight=surfaceSampler(g.children.filter(mesh=>mesh.material===white));
const mask=networkMask(network,renderedGround,roads);
const asphaltHeight=surfaceSampler(g.children.filter(mesh=>mesh.material===road));
for(const [i,j] of entries.entries()){
 const flags=g.userData.directionSigns.filter(s=>s.roundabout&&s.exitRoad===j.A.r.id);
 assert.equal(flags.length,1);
 assert(flags[0].corner.tB<0,'exit flag precedes its arm in clockwise circulation');
 const e=island.entries[i],dx=e.x-island.x,dz=e.z-island.z;
 assert.ok(Math.hypot(dx,dz)<island.radius-1);
 assert.ok(Math.sin(e.yaw)*j.a[0]+Math.cos(e.yaw)*j.a[1]>.99);
 assert.deepEqual(e.exits,entries.slice(i+1).concat(entries.slice(0,i)).map(k=>roadDestination(k.A.r,k.end?-1:1)));
 assert.ok(Math.abs(H(e.x,e.z)-island.y)<.02);
 // Probe the rendered paint on both sides of the centreline, from the entry mouth back to the median nose.
 const {F,P,r}=j.A,dir=j.end?1:-1,joinD=j.end?F.at(-1).d:0;
 const widths=[];
 for(const back of [1.5,4,7,10,11]){
  const f=frameAt(F,joinD-dir*(j.B.P.carriageway/2+back));
  for(const side of [-1,1]){
   let outer=0;
   for(let offset=.025;offset<=P.median/2+.32;offset+=.04){
    const x=f.x+f.lx*side*offset,z=f.z+f.lz*side*offset,y=whiteHeight(x,z);
    if(y!==null&&y>=H(x,z)-.001)outer=offset;
   }
   widths.push(outer);
   assert.ok(outer>0,`${r.name}: missing painted splitter edge on side ${side}, ${back} m behind the mouth`);
  }
 }
 for(let p=2;p<widths.length;p++)assert.ok(widths[p]<widths[p-2],r.name+' splitter must narrow towards the median');
 // Sample the broad bar and the point of each lane triangle in its direction of travel.
 const h=P.carriageway/2,m=P.median/2,lane=(h-m)/2;
 const {nose,slope,width}=j.A.flares.find(flare=>flare.dir===dir);
 // Across each cross-section the whole of both lanes must fit between the hatch and the visible kerb.
 // Where a divider dash is present, measure its distance from the hatch on the rendered mesh.
 for(const side of [-1,1]){
  let dashes=0;
  for(let run=.25;run<=width/slope;run+=.25){
   const d=nose+dir*run,f=frameAt(F,d),divider=m+lane+roundaboutLaneShift(j.A,d);
   const point=offset=>[f.x+f.lx*side*offset,f.z+f.lz*side*offset];
   for(let offset=divider-lane+.08;offset<=divider+lane-.079;offset+=.16){
    const p=point(offset),roadY=asphaltHeight(...p);
    assert.ok(roadY!==null && H(...p)-roadY<.065,r.name+' surfaced lane at '+run+' m on side '+side+' offset '+offset);
   }
   for(const laneCentre of [divider-lane/2,divider+lane/2]){
    assert.ok(mask.onRoad(...point(laneCentre)),r.name+' drivable lane at '+run+' m on side '+side);
   }
   if(whiteHeight(...point(divider))===null)continue;
   let hatch=0;
   for(let l=.02;l<width+.09;l+=.04)if(whiteHeight(...point(l))!==null)hatch=l;
   assert.ok(hatch && divider-hatch>=lane-.10,r.name+' lane width beside painted splitter');
   dashes++;
  }
  assert.ok(dashes>=2,r.name+' has a flared lane divider on side '+side);
 }
 for(let k=0;k<2;k++){
  for(const [back,wide] of [[2.10,true],[5.35,false]]){
   const f=frameAt(F,joinD-dir*(j.B.P.carriageway/2-.25+back));
   const centre=dir*(m+(k+.5)*lane+roundaboutLaneShift(j.A,f.d));
   const painted=l=>whiteHeight(f.x+f.lx*l,f.z+f.lz*l)!==null;
   assert.ok(painted(centre),r.name+' triangle centreline at base and tip');
   assert.equal(painted(centre+.45),wide,r.name+' Give Way triangle must widen towards the roundabout');
  }
 }
}
const turning=g.userData.turningIslands;
assert.equal(turning.length,network.roads.filter(r=>r.turningRadius).length);
assert.deepEqual(new Set(turning.map(s=>s.style)),new Set(['painted','paved','planted']));
const {dressTurningIsland}=await import('../street/roundabout.js');
for(const site of turning){
 const {x,y,z,radius,style,road:id,outerRadius:head}=site;
 const faces=[];
 dressTurningIsland(site,{chunkAt:()=>0,batch:(key,geo,mat,pos,size,rot)=>{
  if(key==='mini-sign-right'||key==='island-sign-turn-left')faces.push({pos,rot});
 }});
 assert.equal(faces.length,2,id+' paired arrow signs');
 assert.ok(faces[0].pos.distanceTo(faces[1].pos)>radius,id+' signs on opposite sides');
 for(const {pos,rot} of faces){
  const offset=new T.Vector3(pos.x-x,0,pos.z-z);
  assert.ok(style==='painted'?offset.length()>head:offset.length()<radius,id+' post off the circulating lane');
  const clockwise=new T.Vector3(-offset.z,0,offset.x).normalize();
  assert.ok(new T.Vector3(-1,0,0).applyEuler(rot).dot(clockwise)>.85,id+' face points clockwise');
 }
 const {P,F}=roads.find(o=>o.r.id===id),f=F.at(-1);
 assert.equal(mask.onRoad(x,z),style==='painted',id+' island driveability');
 assert.ok(Math.abs(H(x,z)-y)<.012,id+' island visible above carriageway');
 if(style==='painted')assert.ok(Math.abs(whiteHeight(x,z)-y)<.002,id+' painted disc');
 const arrowR=style==='painted'?radius+1.75:(radius+head)/2;
 for(let i=0;i<3;i++){
  const a=Math.atan2(-f.tz,-f.tx)+i*2*Math.PI/3+.30;
  assert.ok(whiteHeight(x+arrowR*Math.cos(a),z+arrowR*Math.sin(a))!==null,id+' curved arrow '+i);
 }
 const d=f.d-Math.sqrt(head**2-(P.carriageway/2)**2)-1;
 const lanes=P.carriageway>12?2:1;
 for(const dir of [-1,1])for(let k=0;k<lanes;k++){
  const centre=dir*(P.median/2+(k+.5)*(P.carriageway/2-P.median/2)/lanes);
  for(const side of [-1,1]){
   const q=frameAt(F,d-10+side*dir),lat=centre+.36;
   assert.equal(whiteHeight(q.x+q.lx*lat,q.z+q.lz*lat)!==null,side===1,id+' lane arrowhead direction');
  }
 }
 for(const back of [.1,.5]){
  const mouth=frameAt(F,d-back);
  for(const side of [-1,1]){
   const xx=mouth.x+side*mouth.lx*.42,zz=mouth.z+side*mouth.lz*.42;
   assert.equal(whiteHeight(xx,zz)!==null,side===1,id+' entry-only Give Way row');
  }
 }
}
const ring=entries[0].B,first=ring.F[0],last=ring.F.at(-1);
assert.ok(Math.hypot(first.lx-last.lx,first.lz-last.lz)<.001,'both kerbs close across the ring seam');
assert.ok(!g.userData.edges.some(e=>e.road.loop&&e.side===-1),'no street furniture on the island kerb');

// 4. Yellow kerb lines exist along the city kerbs (two lines per kerb on distributors).
const yl=g.children.filter(m=>m.material===yellow).reduce((s,m)=>s+m.geometry.index.count/3,0);assert.ok(yl>20000,`yellow kerb-line triangles ${yl}`);
// A face must agree with the actual paint and face upstream in the adjacent lane.
const zones=g.userData.kerbZones,paintHeight=surfaceSampler(g.children.filter(m=>m.material===yellow));
assert.deepEqual(new Set(zones.map(z=>z.period)),new Set(['24h','7-7']));
let repeaters=0,transitions=0,singleEnds=0,doubleEnds=0;
function checkPaint(edge,t,expected){
 const p=edge.point(t);
 const mask=[.15,.25,.35].map(offset=>paintHeight(p.x-p.nx*offset,p.z-p.nz*offset)!==null);
 assert.deepEqual(mask,expected,edge.road.id+' kerb paint at '+t);
}
assert(!zones.some(z=>z.edge.road.turningRadius),'cul-de-sac roads and turning heads are clear');
const ringZones=zones.filter(z=>z.edge.road.loop);
assert.equal(ringZones.filter(z=>z.edge.kind==='island').length,1);
assert.equal(ringZones.filter(z=>z.edge.kind==='corner').length,entries.length*2);
assert.equal(zones.filter(z=>!z.edge.road.loop && (z.throughLo||z.throughHi)).length,entries.length*2);
const tangentRows=zones.filter(z=>z.edge.kind==='edge').flatMap(z=>[
 ...(z.throughLo?[z.edge.point(z.lo)]:[]),...(z.throughHi?[z.edge.point(z.hi)]:[])]);
for(const z of ringZones){
 assert(z.throughLo && z.throughHi && z.period==='24h');
 for(let t=.5;t<z.hi-.25;t+=.75)checkPaint(z.edge,t,[true,false,true]);
 if(z.edge.kind==='corner')for(const t of [z.lo,z.hi])assert(tangentRows.some(p=>Math.hypot(p.x-z.paintPoint(t).x,p.z-z.paintPoint(t).z)<.001),'return paint meets its neighbouring row');
}
for(const {edge,lo,hi,period,signs,joinsLo,joinsHi,throughLo,throughHi} of zones){
 const forward=edge.side>0,continues=forward?joinsHi:joinsLo;
 if(!(forward?throughLo:throughHi)){
  assert.equal(signs[0].t,forward?lo:hi);
  assert.equal(signs[0].role,'start');
 }
 if(!continues && !(forward?throughHi:throughLo)){
  assert.equal(signs.at(-1).t,forward?hi:lo);
  assert.equal(signs.at(-1).role,'end');
 }
 for(const [i,s] of signs.entries()){
  const p=edge.point(s.t);
  assert.equal(s.period,period);
  assert(Math.sin(s.yaw)*p.nz-Math.cos(s.yaw)*p.nx>.98,'faces oncoming traffic');
  assert(Math.abs(H(s.x,s.z)-s.y)<.08,'post rests on footway');
  if(i>0 && (continues || i<signs.length-1)){assert.equal(s.role,'repeater');repeaters++;}
 }
 const double=period==='24h',stripes=[double,!double,double];
 checkPaint(edge,(lo+hi)/2,stripes);
 for(const [t,dir,joined,through] of [[lo,1,joinsLo,throughLo],[hi,-1,joinsHi,throughHi]]){
  if(through)continue;
  checkPaint(edge,t+dir*.25,stripes);
  checkPaint(edge,t+dir*.05,double || !joined?[true,true,true]:stripes);
  if(joined){
   const other=zones.find(z=>z.edge===edge && z.period!==period && (dir>0?z.hi:z.lo)===t);
   assert(other,'both periods meet at one changeover');
   assert.equal([...signs,...other.signs].filter(s=>s.t===t).length,1,'one changeover plate');
   if(double)transitions++;
  }else{
   checkPaint(edge,t-dir*.12,[false,false,false]);
   if(double)doubleEnds++;else singleEnds++;
  }
 }
}
assert(transitions>0 && singleEnds>0 && doubleEnds>0);
console.log('Yellow-line boundaries:',{transitions,singleEnds,doubleEnds});
assert(repeaters>0);
const stops=g.userData.busStops;
assert.equal(stops.length,14);
assert.equal(stops.filter(s=>s.kind==='layby').length,network.roads.filter(r=>r.busLayby).length);
for(const {edge,t,half,kind} of stops){
 assert(!zones.some(z=>z.edge===edge && z.lo<t+half && z.hi>t-half),'bus stand and tapers clear');
 const o=roads.find(o=>o.r.id===edge.road.id),side=edge.side,h=o.P.carriageway/2;
 for(const along of [-24,-17,-8,0,8,17,24]){
  const f=frameAt(o.F,edge.from+t+along),p=edge.point(t+along);
  const setback=((p.x-f.x)*f.lx+(p.z-f.z)*f.lz)*side-h;
  const expected=kind==='kerbside'||Math.abs(along)===24?0:Math.abs(along)===17?1.6:3.2;
  assert(Math.abs(setback-expected)<.04,edge.road.name+' kerb profile');
  const heightAt=offset=>H(p.x+p.nx*offset,p.z+p.nz*offset);
  assert(Math.abs(heightAt(-.45)-p.base)<.04,edge.road.name+' berth meets road level');
  assert(Math.abs(heightAt(2.8)-p.y-.067)<.025,edge.road.name+' continuous raised footway');
  assert(mask.onRoad(p.x-p.nx*.6,p.z-p.nz*.6,-.25),'player can reach kerb');
  assert(!mask.onRoad(p.x+p.nx*1.5,p.z+p.nz*1.5,-.25),'footway excludes vehicles');
 }
}

// 5. Junction control hardware: a TS102 Give Way sign at every priority / roundabout entry, and at each crossroads four approaches
// with a kerb primary (carrying the pedestrian head), a pedestrian pole at the far kerb, a median primary where divided, and the
// secondaries back to back. Every pole and sign stands on its footway or median, not in the carriageway.
const ctl=g.userData.controls,gw=ctl.filter(c=>c.kind==='giveway'),sig=ctl.filter(c=>c.kind==='signal');
assert.equal(gw.length,joins.filter(j=>!j.signal).length+turning.length,'one Give Way sign per priority or roundabout entry');
assert.equal(sig.filter(c=>c.pedOnly&&!c.refuge).length,surfaceApproaches,'one far-kerb pedestrian pole per remaining signal crossing');
const staggered=roads.flatMap(o=>[...o.r.staggers.values()]);
const warningHeight=surfaceSampler(g.children.filter(m=>m.material===tactile));
const brickHeight=surfaceSampler(g.children.filter(m=>m.material===brick));
const refugeHeight=surfaceSampler(g.children.filter(m=>m.material===concreteFloor));
assert.equal(g.userData.refugeBollards.length,staggered.length);
for(const {r,F,P} of roads)for(const pen of r.staggers.values()){
 const dir=Math.sign(pen.outgoing-pen.incoming);
 const noseSurface=r.midblocks.includes(pen.incoming)?brickHeight:refugeHeight;
 const brickEnd=pen.incoming-dir*2.25,noseEnd=pen.outgoing+dir*2.25;
 for(const side of [-1,0,1]){
  const lat=side*(pen.half-.2);
  for(const [join,away,raised] of [[brickEnd,-dir,brickHeight],[noseEnd,dir,noseSurface]]){
   for(const step of [-.03,.03]){
    const f=frameAt(F,join+step*away),x=f.x+f.lx*lat,z=f.z+f.lz*lat;
    const y=(step<0?refugeHeight:raised)(x,z);
    assert.ok(y!==null&&Math.abs(y-H(x,z))<.003,r.id+' continuous visible surface at the refuge join');
   }
  }
 }
 const front=frameAt(F,noseEnd+dir*(1.8+.4*pen.half));
 const bollard=g.userData.refugeBollards.find(b=>Math.hypot(b.x-front.x,b.z-front.z)<.05);
 assert.ok(bollard&&Math.abs(noseSurface(bollard.x,bollard.z)-bollard.y)<.005,r.id+' bollard stands on raised median');
 assert.ok(dir*(Math.sin(bollard.yaw)*front.tx+Math.cos(bollard.yaw)*front.tz)>.99,r.id+' bollard faces the junction');
 assert.ok(Math.abs(Math.abs(pen.incoming-pen.outgoing)-6.4)<1e-6);
 for(const side of [-1,1]){
  // On entering from this kerb, the turn on the island faces traffic approaching the second leg.
  assert.ok(side*(pen.centre(-side)-pen.centre(side))>0);
  for(const off of [-1.3,0,1.3])for(const lat of [P.median/2-.6,P.carriageway/2+.6]){
   const f=frameAt(F,pen.centre(side)+off),x=f.x+side*lat*f.lx,z=f.z+side*lat*f.lz;
   const tile=warningHeight(x,z);
   assert.ok(tile!==null&&Math.abs(H(x,z)-tile)<.003,r.id+' exposed tactile landing');
  }
 }
}
const signalPens=roads.flatMap(o=>o.r.signalCrossings.filter(d=>o.r.staggers.has(d)));
assert.equal(sig.filter(c=>c.refuge).length,signalPens.length*2,'two pedestrian heads per signal-controlled staggered refuge');
const warnings=g.children.filter(m=>m.material===lookRight||m.material===lookLeft);
assert.equal(warnings.length,entries.length*4);
for(const j of entries){
 const {r,F,P}=j.A,d=j.crossingD,pen=r.staggers.get(d);
 assert.equal(!!pen,P.median>=3);
 for(const side of [-1,1]){
  const at=pen?.centre(side)??d;
  const frame=frameAt(F,at);
  for(const fromFootpath of [true,false]){
   const lat=side*(fromFootpath?P.carriageway/2-1.2:P.median/2+1.05);
   const x=frame.x+lat*frame.lx,z=frame.z+lat*frame.lz;
   const label=warnings.find(m=>{
    m.geometry.computeBoundingBox();const centre=m.geometry.boundingBox.getCenter(new T.Vector3());
    return Math.hypot(centre.x-x,centre.z-z)<.05;
   });
   assert.equal(label?.material,fromFootpath?lookRight:lookLeft,r.name+' text at the landing');
   const pos=label.geometry.attributes.position,corner=i=>new T.Vector3().fromBufferAttribute(pos,i);
   const arrow=corner(1).sub(corner(0)).normalize().multiplyScalar(fromFootpath?1:-1);
   assert.ok(-side*(arrow.x*frame.tx+arrow.z*frame.tz)>.99,r.name+' arrow points upstream');
   const toReader=corner(2).sub(corner(0)).normalize();
   assert.ok((fromFootpath?side:-side)*(toReader.x*frame.lx+toReader.z*frame.lz)>.99,r.name+' upright from the tactile paving');
   for(let i=0;i<pos.count;i++){
    const p=corner(i),roadY=asphaltHeight(p.x,p.z);
    assert.ok(roadY!==null&&p.y-roadY>.004&&p.y-roadY<.025,r.name+' marking follows the road surface');
   }
  }
  for(const along of [-1.35,0,1.35]){
   const f=frameAt(F,at+along);
   for(let l=.05;l<P.carriageway/2;l+=.15){
    const lat=side*l,x=f.x+lat*f.lx,z=f.z+lat*f.lz;
    const grade=f.y+streetLevel(r,f.d,lat)+(f.crossSlope||0)*lat;
    assert.ok(Math.abs(H(x,z)-grade)<.035,r.name+' flush crossing from kerb to median centre');
   }
   for(const l of [P.median/2-.6,P.carriageway/2+.6]){
    const x=f.x+side*l*f.lx,z=f.z+side*l*f.lz,y=warningHeight(x,z);
    assert.ok(y!==null&&Math.abs(H(x,z)-y)<.003,r.name+' visible warning tiles on both landings');
   }
  }
 }
}
assert.equal(g.userData.refugeRails.length,staggered.length*2,'opposing L-shaped guardrails at each wide street refuge');
assert.equal(sig.filter(c=>c.ped&&!c.pedOnly).length,surfaceApproaches+2*midblocks.length,'shared pedestrian heads at the remaining signal crossings');
assert.equal(sig.filter(c=>c.back).length+tees,approaches,'a secondary for every approach (behind the far kerb for a T side road)');
for(const c of [...gw,...sig]){const y=H(c.x,c.z);assert.ok(y!==null&&Math.abs(y-c.y)<.08,`${c.kind} at ${c.x.toFixed(1)},${c.z.toFixed(1)}: surface ${y?.toFixed(2)} vs ${c.y.toFixed(2)}`);}
// 6. Street furniture (city-details.js, sandbox dress rules): a bin at every crossing, hydrants at most ~100 m apart along each
// street, bus shelters on the distributors only, a controller cabinet per signal junction; railings follow need, not every kerb.
const {cityDetails}=await import('../street/city-details.js');
const fences=[];
const det=cityDetails(g,{batch:()=>{},kitParts:()=>[],fences,lampPositions:[],mats:{},plantTree:()=>{}});
assert.equal(det.bins,cr.length,'one litter bin per crossing');assert.equal(det.cabinets,groups.length+midblocks.length,'a controller cabinet at each signal site');
assert.ok(det.shelters>=5&&det.shelters<=25,`bus shelters ${det.shelters}`);assert.ok(det.trees>100,`street trees ${det.trees}`);
const kerb=g.userData.edges.filter(e=>e.kind==='edge').reduce((s,e)=>s+e.length,0)/2;assert.ok(det.hydrants>=kerb/110,`hydrants ${det.hydrants} for ${kerb.toFixed(0)} m of street`);
const railed=det.panels*1.5,all=g.userData.edges.reduce((s,e)=>s+e.length,0);assert.ok(det.panels>0&&railed<all*.25,`railing on ${(100*railed/all).toFixed(0)} % of the kerbs`);
for(const s of turning)for(const f of fences){
 const distance=Math.hypot((f.ax+f.bx)/2-s.x,(f.az+f.bz)/2-s.z);
 assert.ok(distance>s.outerRadius+1,s.road+' has a railing on the turning circle');
}
console.log(`city-markings checks passed: no downward faces, ${checked} median samples, ${cr.length} crossings (${cr.filter(c=>c.kind==='signal').length} signal), ${gw.length} Give Way signs, ${sig.length} signal poles; furniture ${JSON.stringify(det)}`);

// The support can fit on a footway while the board clips a carriageway or a
// facade. A closed building volume must also exclude a board entirely inside it.
{
 const {installDirectionSigns}=await import('../city/sign-placement.js');
 const scene=new T.Scene(),group=new T.Group();group.name='Drawn street network';scene.add(group);
 const floor=new T.Mesh(new T.PlaneGeometry(4,160).rotateX(-Math.PI/2),brick);floor.position.x=7;scene.add(floor);
 const field=new T.Mesh(new T.PlaneGeometry(200,160).rotateX(-Math.PI/2),grass);scene.add(field);
 const plot=floor.clone();plot.name='Plot paving';plot.position.x=20;scene.add(plot);
 const lane=new T.Mesh(new T.BoxGeometry(10,.1,120),road);scene.add(lane);
 const sample=(d)=>({x:0,z:d-60,d,y:0,tx:0,tz:1,lx:1,lz:0});
 const o={r:{id:'mock',crossings:[],junctionDistances:[]},F:[sample(0),sample(120)],P:{carriageway:10,footpath:4}};
 const rows=[{turn:'ahead',destination:{en:'Ha Tsuen',zh:'廈村'}}];
 const site=d=>({x:7,z:d-60,y:0,yaw:Math.PI,rows,site:{o,d,dir:1}});
 group.userData={roundabouts:[],directionSigns:[site(30),site(82),{...site(50),site:null,x:5.5,z:62},...([20,30].map(x=>({...site(82),site:null,x}))) ]};
 // The last post is outside the asphalt. Its full panel overlaps the road end.
 lane.scale.z=1.1;
 const modern={userData:{sink:{shells:[]}}},facade=[[5.1,-58],[40,-58],[40,-4],[5.1,-4]];
 const lots={userData:{cityPlan:[{footprints:[facade]}]}};
 const env={materials:{walk:brick,road,grass},groups:Array.from({length:30},()=>new T.Group()),fences:[]};
 // With no room along the first approach it must be omitted. The second street
 // should retain its legible sign behind the kerb.
 installDirectionSigns(scene,env,modern,lots);
 assert.equal(group.userData.directionSigns.length,1);
 const [placed]=group.userData.directionSigns;assert.equal(placed.site.d,82);
 assert(placed.x-placed.width/2>5.25);
 assert.equal(placed.foundations.length,2);assert.equal(env.fences.length,2);
 assert(placed.x+placed.width/2<9);
}
