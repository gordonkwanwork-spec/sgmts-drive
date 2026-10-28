import assert from 'node:assert';
import {separate,createCrowd,BODY} from '../crowd.js';
// Two overlapping walkers are pushed apart equally; a fixed (seated) one never moves; a heavy (player) one is not pushed by a ped.
let r=separate([{x:0,z:0,r:BODY},{x:.4,z:0,r:BODY}]);
assert.ok(r.push[0].x<0&&r.push[1].x>0&&Math.abs(r.push[0].x+r.push[1].x)<1e-9,'equal and opposite');
assert.ok(Math.abs(r.push[1].x-r.push[0].x-(2*BODY-.4))<1e-9,'undoes the overlap');
r=separate([{x:0,z:0,r:BODY,fixed:true},{x:.4,z:0,r:BODY}]);assert.deepEqual(r.push[0],{x:0,z:0});assert.ok(r.push[1].x>0);
r=separate([{x:0,z:0,r:BODY},{x:.3,z:0,r:.36,heavy:true}]);assert.ok(r.push[0].x<0&&r.push[1].x===0,'player is not shoved');
assert.equal(separate([{x:0,z:0,r:BODY},{x:2,z:0,r:BODY}]).contacts.length,0);
// Crowd: offsets ease in and are never accumulated when the route rewrites the position.
const mk=(x,z)=>({visible:true,position:{x,y:0,z},children:[],userData:{}}),a=mk(0,0),b=mk(.3,0),said=[];
const crowd=createCrowd({people:()=>[{group:a},{group:b}],camera:{position:{x:0,z:0}},speak:(g,k)=>said.push(k)});
for(let i=0;i<60;i++){a.position.x=0;a.position.z=0;b.position.x=.3;b.position.z=0;crowd.update(1/60);}
const gap=b.position.x-a.position.x;assert.ok(gap>2*BODY-.02&&gap<2*BODY+.1,'settled apart, gap '+gap);
for(let i=0;i<60;i++)crowd.update(1/60);// no route rewrite (paused): must not drift
assert.ok(Math.abs(b.position.x-a.position.x-gap)<1e-3,'no drift while paused');
// A run-in knocks a pedestrian over and they complain.
const c=mk(5,5);const crowd2=createCrowd({people:()=>[{group:c}],camera:{position:{x:5,z:5}},speak:(g,k)=>said.push(k)});
crowd2.update(1/60,{x:5.2,z:5,speed:6});assert.ok(said.includes('watch')||said.includes('whoa'));
console.log('Crowd: pedestrians shoulder apart, fixed sitters hold, the player is not shoved, offsets never accumulate, a run-in stumbles.');
