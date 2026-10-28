import assert from 'node:assert/strict';
import * as T from 'three';
import {createRiders} from '../riders.js';
import {RIDE_SEATS} from '../passenger.js';

// One stop: some riders walk out through the platform-side doorway, newcomers walk in and sit; nobody takes the player's seat.
const tram={s:900,homeDir:1,dwell:0,door:0,sections:['section_front','section_mid','section_rear'].map(n=>Object.assign(new T.Group(),{name:n}))};
const riders=createRiders({make:()=>new T.Group(),pose:()=>{}});
const player=RIDE_SEATS.findIndex(q=>q.section===1);riders.focus(tram,player);
const seated=()=>riders.pool.filter(r=>r.state==='seated');
const before=seated().length;assert(before>=4,'vehicle starts with a load');assert(riders.pool.filter(r=>r.state==='standing').length>=2,'some passengers stand');assert(!seated().some(r=>r.seat===player),'player seat kept free');
let left=0,out=0;tram.dwell=10;tram.door=1;
for(let i=0;i<300;i++){tram.dwell=Math.max(0,10-i/30);tram.door=tram.dwell>1?1:0;const taken=riders.update(1/30,{side:-1,avoid:player});assert(!taken.has(player));
 for(const r of riders.pool)if(r.state==='alighting'){out=Math.min(out,r.x);}if(i===150)left=riders.pool.filter(r=>r.state==='alighting'||r.state==='off').length;}
assert(out<-1.3,'alighters leave through the left (platform-side) doorway');
assert(riders.pool.every(r=>r.state==='off'||r.state==='seated'||r.state==='standing'),'everyone settled when the doors close');
const seats=seated().map(r=>r.seat);assert.equal(new Set(seats).size,seats.length,'one rider per seat');
assert(riders.pool.some(r=>r.group.parent&&r.state!=='off'),'riders ride in the sections');
console.log(`riders: ${before} aboard → ${seated().length} seated after a stop, exits on platform side`);
