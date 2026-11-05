import assert from 'node:assert';
import {createGovernor} from '../adaptive-resolution.js';
const run=(g,frameMs,cpuMs,seconds)=>{for(let t=0;t<seconds;t+=frameMs/1000)g.tick(frameMs,cpuMs,frameMs/1000);};
// GPU-bound at 28 ms: ratio falls to the floor, then scenery is shed, never below min.
let g=createGovernor({min:.9,max:1.75,start:1.5});run(g,28,6,40);
assert.equal(g.ratio,.9);assert.equal(g.shed,3);
// CPU-bound: resolution is untouched (it would not help), scenery is shed.
g=createGovernor({min:.9,max:1.75,start:1.5});run(g,28,25,20);
assert.equal(g.ratio,1.5);assert.ok(g.shed>0);
// Comfortable 60 fps climbs back to max.
g=createGovernor({min:.9,max:1.75,start:1});run(g,16.7,5,60);
assert.equal(g.ratio,1.75);assert.equal(g.shed,0);
// A probe that blows the budget is reverted.
g=createGovernor({min:.9,max:1.75,start:1.5});run(g,16.7,5,5);const before=g.ratio;run(g,30,5,1.2);
assert.ok(g.ratio<=before,'probe reverted');
// Shed recovers once frames are fine for a while.
g=createGovernor({min:.9,max:.9,start:.9});run(g,30,5,10);assert.ok(g.shed>0);run(g,16.7,5,120);assert.equal(g.shed,0);
console.log('Adaptive resolution: lowers when GPU-bound, sheds when floored or CPU-bound, climbs back, reverts bad probes.');
