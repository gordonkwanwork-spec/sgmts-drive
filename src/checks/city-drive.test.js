// The player's city car (src/city/drive.js): accelerates, brakes, reverses, steers left with +steer (keep-left city),
// crosses ordinary kerbs, stops at solid obstacles and stays on drivable surfaces.
import assert from 'node:assert/strict';
import {stepCar,CAR,updateRide,recoveryLane} from '../city/drive.js';
const road={drivable:(x,z)=>Math.abs(x)<3.65,blocked:()=>false},open={drivable:()=>true,blocked:()=>false};
const car=()=>({x:0,z:0,yaw:0,v:0,steer:0,length:4.6,width:1.9});
{const c=car();for(let i=0;i<200;i++)stepCar(c,{throttle:1},.05,open);assert.ok(c.v===CAR.maxSpeed,'accelerates towards top speed');assert.ok(c.z<-80&&Math.abs(c.x)<1e-6,'yaw 0 drives towards −Z');
 for(let i=0;i<100;i++)stepCar(c,{throttle:-1},.05,open);assert.ok(c.v<0&&c.v>=-CAR.maxReverse,'S brakes, then reverses');
 for(let i=0;i<40;i++)stepCar(c,{brake:true},.05,open);assert.equal(c.v,0,'Space stops the car');}
{const c=car();for(let i=0;i<60;i++)stepCar(c,{throttle:1,steer:1},.05,open);assert.ok(c.yaw>.3,'A (steer +1) turns left: yaw increases');assert.ok(c.x<-1,'left of −Z travel is −X');}
{const c=car();for(let i=0;i<400;i++){stepCar(c,{throttle:1,steer:.5},.05,road);assert.ok(Math.abs(c.x)<3.65-.9,'car stays inside the kerbs');}assert.ok(Math.abs(c.v)<1,'the kerb stops it');}
{const c=car(),other={x:0,z:-40};const w={drivable:()=>true,blocked:(x,z,r)=>Math.hypot(x-other.x,z-other.z)<r+2.3};for(let i=0;i<300;i++)stepCar(c,{throttle:1},.05,w);assert.ok(c.z>-40+2.3+2.1&&c.z<-30,'stops behind a vehicle ahead');}


const kerb={...open,height:(x,z)=>z < -6?.15:0};
for(const sign of [-1,1]){
 const c={...car(),v:3,steer:sign*CAR.maxSteer};
 const turn=Math.PI/2*CAR.wheelbase/Math.tan(CAR.maxSteer);
 for(let i=0;i<120;i++){c.v=3;stepCar(c,{steer:sign},turn/(3*120),open);}
 assert(Math.abs(c.yaw-sign*Math.PI/2)<.015&&Math.abs(c.x)<6,'tight quarter turn in both directions');
}
for(const [height,passes] of [[.15,true],[.4,false]]){
 const c=car(),world={...kerb,height:(x,z)=>z < -6?height:0};
 for(let i=0;i<180;i++){stepCar(c,{throttle:1},1/60,world);updateRide(c,world.height,1/60);}
 assert.equal(c.z < -10,passes,'footpath kerb vs tall step');
 if(passes)assert(Math.abs(c.y-.15)<.005);
}
{const c=car();for(let i=0;i<480;i++)stepCar(c,{throttle:1,boost:true},1/60,open);
 assert.equal(c.v,CAR.maxSpeed*1.8);stepCar(c,{},1/60,open);assert(c.v>CAR.maxSpeed);}
{const pieces=[{kind:'lane',pts:[{x:10,y:1,z:15},{x:10,y:2,z:-15}]},{kind:'lane',pts:[{x:13,y:2,z:-15},{x:13,y:1,z:15}]}];
 const q=recoveryLane(pieces,{...car(),x:9,z:3},()=>true);assert.equal(q.x,10);assert.equal(q.z,3);assert.equal(Math.abs(q.yaw),0);
 assert.equal(recoveryLane(pieces,car(),q=>q.x!==10).x,13,'skip occupied lane');}
console.log('City driving passed: tight turns, kerb suspension, obstacles, boost and lane recovery.');
