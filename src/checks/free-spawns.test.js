import assert from 'node:assert/strict';
import {FREE_SPAWNS,freeSpawn} from '../free-spawns.js';
import {STOPS,DEPOT,LENGTH,sample,project} from '../alignment.js';
assert.equal(FREE_SPAWNS.length,STOPS.length+3);
assert.equal(new Set(FREE_SPAWNS.map(p=>p.id)).size,FREE_SPAWNS.length);
for(const location of FREE_SPAWNS){
 const p=freeSpawn(location.id);
 assert(Object.values(p).every(Number.isFinite),location.id);
 assert.equal(p.freeS,location.s);
 assert(p.freeY>sample(p.freeS).y);
 assert(Math.abs(project(p.freeX,p.freeZ)-p.freeS)<35);
}
for(const st of STOPS)assert.equal(freeSpawn(st.id).freeS,st.s);
assert.equal(freeSpawn('depot').freeS,DEPOT.gate);
assert.equal(freeSpawn('start').freeS,0);
assert.equal(freeSpawn('end').freeS,LENGTH);
assert.equal(freeSpawn('end').freeHeading,sample(LENGTH).heading+Math.PI);
assert.deepEqual(freeSpawn('unknown'),freeSpawn(STOPS[0].id));
console.log('Free-roam station, depot and corridor-end spawns passed.');
