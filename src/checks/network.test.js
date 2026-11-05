// Drawn street network (street editor Road / Area tools): centrelines, T-junctions, surfaces facing up, furniture registry,
// scenery masks and the SGMTS corridor reserve.
import assert from 'node:assert/strict';
import * as T from 'three';
import {frames,frameAt,buildNetwork,networkMask,reserveClash,junctions,halfWidth,PRESETS,Y,BEND} from '../street/network.js';
import {setNetwork,pose,record,ROAD,ROADS} from '../street/roads.js';
import {sample} from '../alignment.js';
import {hillOutline,onHill,hillMesh} from '../street/hills.js';

const near=(a,b,e=1e-3)=>Math.abs(a-b)<e;
// straight legs, rounded corner: a 100 m + 100 m L is shorter by 2t − arc (t = R for a right angle)
const L=frames({pts:[[0,0],[100,0],[100,100]]});
assert.ok(near(L.at(-1).d,200-2*BEND+Math.PI*BEND/2,.6),'corner rounded on BEND m');
assert.ok(near(frameAt(L,50).z,0)&&near(frameAt(L,50).tx,1,1e-6),'first leg straight');

// main road along +x, a side road leaving its left side (+lateral = −z for a +x road) at x = 100
const net={roads:[{id:'road-001',preset:'local',pts:[[0,0],[200,0]]},{id:'road-002',preset:'local',pts:[[100,0],[100,-80]]}],areas:[{id:'area-001',finish:'buff',pts:[[110,-10],[150,-10],[150,-40],[110,-40]]},{id:'area-002',finish:'grass',pts:[[160,-10],[190,-10],[190,-40]]}]};
const {joins}=junctions(net);assert.equal(joins.length,1,'one T-junction');assert.equal(joins[0].A.r.id,'road-002');assert.equal(joins[0].B.r.id,'road-001');assert.equal(joins[0].side,1,'on the main road’s left');

const g=buildNetwork(net),P=PRESETS.local,h=P.carriageway/2;g.updateMatrixWorld(true);
const verts=[];g.traverse(m=>{if(!m.isMesh)return;const p=m.geometry.attributes.position,n=m.geometry.attributes.normal;for(let i=0;i<p.count;i++)verts.push({m,x:p.getX(i),y:p.getY(i),z:p.getZ(i),ny:n.getY(i)});});
const flat=verts.filter(v=>Math.abs(v.ny)>.5);assert.ok(flat.length&&flat.every(v=>v.ny>.99),'every surface faces up');
// raised footpath on the main road's left (z from −h to −h−footpath) is open across the mouth: no footpath vertex there
const foot=flat.filter(v=>near(v.y,Y.raised)&&v.z<-h+.01&&v.z>-h-P.footpath-.01&&Math.abs(v.x-100)<h-.1&&v.x>0);
assert.equal(foot.length,0,'main footpath opens for the side road');
// kerb returns: raised footpath vertices on a curve between the two kerb lines near each corner
assert.ok(flat.some(v=>near(v.y,Y.raised)&&v.x>100+h+.5&&v.x<100+h+6&&v.z<-h-.5&&v.z>-h-6),'kerb return on the corner');
// carriageway reaches the main road's kerb (no grass gap) and the main road's own carriageway is continuous
assert.ok(flat.some(v=>near(v.y,Y.road)&&Math.abs(v.x-100)<.1+h&&near(v.z,-h,.4)),'side carriageway meets the kerb line');
assert.ok(flat.some(v=>near(v.y,Y.area)&&v.x>110&&v.x<150),'paved area');assert.ok(flat.some(v=>near(v.y,Y.grass)&&v.x>160),'planted area');

// furniture registry: drawn roads place items like game roads (raised footpath behind the kerb)
const n=ROADS.length;setNetwork(net,()=>0);assert.equal(ROADS.length,n+2);
const lamp={road:'road-002',ch:30,side:'L',ref:'kerb',off:.6,rot:0},at=pose(lamp);assert.ok(near(at.y,Y.raised),'lamp on the footpath');
assert.ok(near(Math.abs(at.x-100),h+.6,1e-6)&&near(at.z,-30,1e-6),'kerb offset along the side road');
const back=record('road-002',at.x,at.y,at.z,at.yaw);assert.ok(near(back.ch,30)&&near(back.off,.6)&&back.side==='L','record round-trips');
setNetwork(null);assert.equal(ROADS.length,n);assert.ok(!ROAD['road-002'],'registry cleared');

// scenery masks
const mask=networkMask(net);
assert.ok(mask.onRoad(50,0)&&!mask.onRoad(50,-h-1)&&mask.onStreet(50,-h-1)&&!mask.onStreet(50,-halfWidth(net.roads[0])-2),'road and footpath masks');
assert.ok(mask.onPaving(130,-25)&&!mask.onPaving(180,-15)&&mask.blocked(130,-25)&&!mask.blocked(175,-30),'paving blocks scenery, grass does not');

// SGMTS corridor first
const c=sample(1500);assert.ok(reserveClash([[c.x-40,c.z],[c.x+40,c.z]],{width:6}),'a road across the corridor is refused');
assert.equal(reserveClash([[c.x+400,c.z+400],[c.x+500,c.z+400]],{width:6}),null,'far away is fine');
assert.ok(reserveClash([[c.x-5,c.z-5],[c.x+5,c.z-5],[c.x+5,c.z+5]],{closed:true}),'an area on the corridor is refused');
// hills (map editor Hills layer): footprint where the sunk ellipsoid meets the ground, turn applied, mesh matches the data
const hill={id:'hill-001',x:0,z:0,y:-30,rx:200,ry:100,rz:100,turn:90},ring=hillOutline(hill,-5),k=Math.sqrt(1-(25/100)**2);
assert.equal(ring.length,36);assert.ok(ring.every(([x,z])=>near(Math.hypot(x/(100*k),z/(200*k)),1,1e-6)),'turned 90°: long axis north–south');
assert.ok(onHill(hill,0,150,-5)&&!onHill(hill,150,0,-5),'inside test follows the turn');assert.equal(hillOutline({...hill,ry:20},-5).length,0,'a hill below ground has no footprint');
const hm=hillMesh(hill,new T.MeshBasicMaterial());assert.ok(near(hm.scale.x,200)&&near(hm.position.y,-30)&&near(hm.rotation.y,Math.PI/2)&&hm.userData.hillId==='hill-001');
console.log('network: centrelines, T-junction, surfaces, registry, masks, corridor reserve and hills ok');
