// The player's city car (src/city/drive.js): accelerates, brakes, reverses, steers left with +steer (keep-left city),
// stops at the kerb and behind another vehicle, and never leaves the drivable surface.
import assert from 'node:assert/strict';
import {stepCar,CAR} from '../city/drive.js';
const road={drivable:(x,z)=>Math.abs(x)<3.65,blocked:()=>false},open={drivable:()=>true,blocked:()=>false};
const car=()=>({x:0,z:0,yaw:0,v:0,steer:0,length:4.6,width:1.9});
{const c=car();for(let i=0;i<200;i++)stepCar(c,{throttle:1},.05,open);assert.ok(c.v>15&&c.v<=CAR.maxSpeed,'accelerates towards top speed');assert.ok(c.z<-80&&Math.abs(c.x)<1e-6,'yaw 0 drives towards −Z');
 for(let i=0;i<80;i++)stepCar(c,{throttle:-1},.05,open);assert.ok(c.v<0&&c.v>=-CAR.maxReverse,'S brakes, then reverses');
 for(let i=0;i<40;i++)stepCar(c,{brake:true},.05,open);assert.equal(c.v,0,'Space stops the car');}
{const c=car();for(let i=0;i<60;i++)stepCar(c,{throttle:1,steer:1},.05,open);assert.ok(c.yaw>.3,'A (steer +1) turns left: yaw increases');assert.ok(c.x<-1,'left of −Z travel is −X');}
{const c=car();for(let i=0;i<400;i++){stepCar(c,{throttle:1,steer:.5},.05,road);assert.ok(Math.abs(c.x)<3.65-.9,'car stays inside the kerbs');}assert.ok(Math.abs(c.v)<1,'the kerb stops it');}
{const c=car(),other={x:0,z:-40};const w={drivable:()=>true,blocked:(x,z,r)=>Math.hypot(x-other.x,z-other.z)<r+2.3};for(let i=0;i<300;i++)stepCar(c,{throttle:1},.05,w);assert.ok(c.z>-40+2.3+2.3&&c.z<-30,'stops behind a vehicle ahead');}
console.log('city-drive checks passed: throttle, brake, reverse, steering, kerbs and obstacles');
