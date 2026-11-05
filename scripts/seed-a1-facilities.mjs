// One-off (re-runnable): A1 terminus facilities in public/street/furniture.json.
// Removes the A1 loop lamp columns, then places feeder pillars on the island hardstandings (GA-1101 station facilities,
// A1_PADS), the captain rest quarters beside the platform beyond the cycle track and three WC pods on the loop's east
// rim (GA-1301 operator's facilities). Afterwards everything is an ordinary street-editor item (street.html).
// Run: node scripts/seed-a1-facilities.mjs
import fs from 'node:fs';
import {STOPS,sample,LOOP,cycleOffset,CYCLE_WIDTH} from '../src/alignment.js';
import {A1_PADS} from '../src/environment.js';
import {record,pose} from '../src/street/roads.js';
import {CABIN} from '../src/street/operator-kit.js';

const FILE=new URL('../public/street/furniture.json',import.meta.url),data=JSON.parse(fs.readFileSync(FILE,'utf8'));
const t=sample(STOPS[0].s),items=[];
// yaw whose local −Z (the item front) points along (dx,dz)
const facing=(dx,dz)=>Math.atan2(-dx,-dz);
const add=(id,type,road,p,yaw,params,guess)=>{const it={id,type,...record(road,p.x,p.y,p.z,yaw,{ref:'centre',guess}),...(params?{params}:{})},q=pose(it);
 if(Math.hypot(q.x-p.x,q.y-p.y,q.z-p.z)>.01)throw Error(id+' does not round-trip');items.push(it);};

// Island: island top 0.325 m + 0.03 m pad; pillars on the back (+l) half of each pad, doors facing −l over 2.4 m of working space.
for(const [r,pad] of A1_PADS.entries())for(let k=0;k<pad.pillars;k++){const along=(k-(pad.pillars-1)/2)*2.35,lat=pad.lat+1;
 add(`a1-feeder-pillar-${r+1}${k+1}`,'feeder_pillar','loop',{x:LOOP.center.x+t.tx*along+t.lx*lat,y:LOOP.y+.355,z:LOOP.center.z+t.tz*along+t.lz*lat},facing(-t.lx,-t.lz));}

// Rest quarters: 21 m (14 bays) on the north-east (−l) side, apron flush with the raised cycle track's outer edge; door faces the corridor.
{const s=31.5,r=sample(s),apron=1.2,edge=-cycleOffset(s)+CYCLE_WIDTH/2,lat=-(edge+apron+CABIN.depth/2);
 add('a1-rest-quarters','operator_cabin','corridor',{x:r.x+r.lx*lat,y:r.groundY+.26,z:r.z+r.lz*lat},facing(r.lx,r.lz),{length:21,use:'rest',apron},s);}

// WC pods beyond the loop's outer footpath (radius 23.75 m), 45° round from the far point towards the rest quarters.
for(const [i,[phi,wc]] of [[37,'accessible'],[45,'female'],[53,'male']].entries()){const a=phi*Math.PI/180,dx=-t.tx*Math.cos(a)-t.lx*Math.sin(a),dz=-t.tz*Math.cos(a)-t.lz*Math.sin(a),rad=LOOP.outerRadius+3.75+.6+CABIN.depth/2;
 add(`a1-wc-pod-${i+1}`,'operator_cabin','loop',{x:LOOP.center.x+dx*rad,y:LOOP.y+.26,z:LOOP.center.z+dz*rad},facing(-dx,-dz),{length:2.4,use:'wc',wc,apron:.6});}

const ids=new Set(items.map(i=>i.id));
data.items=[...data.items.filter(i=>!(i.road==='loop'&&i.type==='lamp_connecting')&&!ids.has(i.id)),...items];
const line=o=>JSON.stringify(o);
fs.writeFileSync(FILE,`{"version":${data.version},"items":[\n${data.items.map(line).join(',\n')}],"runs":[\n${data.runs.map(line).join(',\n')}]}`);
console.log(`${items.length} A1 facility items written; loop lamp columns removed.`);
