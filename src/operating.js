// Shared runtime rules: small pure checks that can be verified without WebGL.
export function tractionLocked({park,door,doorTarget,ramp,rampTarget,hold}){return park||door>.001||doorTarget>0||ramp>.001||rampTarget>0||hold>0;}
export function verticalOverlap(a,b){return a.yBottom<b.yTop&&b.yBottom<a.yTop;}
// Explicit gameplay allowances, not certified accessibility limits. Door pivots
// are at road level in the artwork; callers must supply boarding-sill heights.
// The 0.18 m step allowance retains A7 playability until the road/platform
// vertical mismatch is corrected; it must not be described as level access.
export const BOARDING = Object.freeze({sillHeight:.32,maxGap:.35,maxStep:.18,endMargin:1});
export function doorsFit(doors,{length,edge=7.05,floor=.31},side=1){
 return side===1&&Number.isFinite(length)&&length>2*BOARDING.endMargin&&
  Number.isFinite(edge)&&Number.isFinite(floor)&&doors.length>0&&doors.every(d=>
   [d.along,d.lateral,d.floor].every(Number.isFinite)&&
   Math.abs(d.along)+.56<=length/2-BOARDING.endMargin&&
   edge-d.lateral>=0&&edge-d.lateral<=BOARDING.maxGap&&
   Math.abs(d.floor-floor)<=BOARDING.maxStep);
}
export function rampFits({gap,rise}){
 return Number.isFinite(gap)&&Number.isFinite(rise)&&gap>=0&&gap<=.5&&Math.abs(rise)<=.125;
}

// Bicycle kinematics: heading drives displacement; 6.2 m equivalent wheelbase.
export const angleDelta=(a,b)=>Math.atan2(Math.sin(a-b),Math.cos(a-b));
export const TURN_RADIUS=15, WHEELBASE=6.2, MAX_WHEEL_ANGLE=Math.atan(WHEELBASE/TURN_RADIUS);
export function driveStep(x,z,heading,speed,wheelAngle,dt){
 wheelAngle=Math.max(-MAX_WHEEL_ANGLE,Math.min(MAX_WHEEL_ANGLE,wheelAngle));
 const turn=speed*Math.tan(wheelAngle)/WHEELBASE*dt,mid=heading+turn/2;
 return {x:x-Math.sin(mid)*speed*dt,z:z-Math.cos(mid)*speed*dt,heading:heading+turn};
}

export function freeStep(x,y,z,heading,forward,strafe,lift,speed,dt){
 const n=Math.hypot(forward,strafe,lift)||1;
 return {x:x+(-Math.sin(heading)*forward-Math.cos(heading)*strafe)*speed*dt/n,y:y+lift*speed*dt/n,z:z+(-Math.cos(heading)*forward+Math.sin(heading)*strafe)*speed*dt/n};
}

// Bounded acceleration and trapezoidal travel. The speed envelope reserves
// this frame's travel plus the next speed's braking distance. An impossible
// late stop is reported, never hidden by snapping position or speed.
export function approachStep(position,speed,direction,limit,stop,dt,{deceleration=1.6}={}){
 if(![position,speed,direction,limit,stop,dt,deceleration].every(Number.isFinite)||
  speed<0||limit<0||dt<=0||dt>.1||deceleration<=0||Math.abs(direction)!==1)
  throw new RangeError('Invalid actor motion inputs');
 const distance=(stop-position)*direction;
 const minimumSpeed=Math.max(0,speed-deceleration*dt);
 const discriminant=(deceleration*dt/2)**2+2*deceleration*Math.max(0,distance)-deceleration*dt*speed;
 const desired=Math.min(limit,Math.max(0,-deceleration*dt/2+Math.sqrt(Math.max(0,discriminant))));
 const nextSpeed=Math.max(minimumSpeed,Math.min(desired,speed+1.1*dt));
 const stoppingThisFrame=nextSpeed===0&&speed>0;
 const travel=stoppingThisFrame?speed*speed/(2*deceleration):(speed+nextSpeed)*dt/2;
 const nextPosition=position+direction*travel;
 // Remove floating-point residue only after a physically integrated stop.
 return {position:nextSpeed===0&&Math.abs(nextPosition-stop)<1e-9?stop:nextPosition,speed:nextSpeed,
  conflict:distance < speed*speed/(2*deceleration)-1e-6};
}

// Front-section centres are 31.8 m apart at bumper contact; retain an 8 m queue gap.
export function followingStop(s,dir,services,self=null){
 let stop=s+dir*1e6;
 for(const a of services)if(a!==self&&a.active&&a.dir===dir&&(a.s-s)*dir>=0){const line=a.s-dir*40;if((line-stop)*dir<0)stop=line;}
 return stop;
}
