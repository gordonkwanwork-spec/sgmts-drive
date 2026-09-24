// Shared runtime rules: small pure checks that can be verified without WebGL.
export function tractionLocked({park,door,doorTarget,ramp,rampTarget,hold}){return park||door>.001||doorTarget>0||ramp>.001||rampTarget>0||hold>0;}
export function verticalOverlap(a,b){return a.yBottom<b.yTop&&b.yBottom<a.yTop;}
export function doorsFit(doors,{length,edge=7.05,floor=.31},side=1){return side===1&&doors.length>0&&doors.every(d=>Math.abs(d.along)<length/2-4&&Math.abs(edge-d.lateral)<.95&&Math.abs(d.floor-floor)<.55);}

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

// Advance toward a stop without overshooting, for either travel direction.
export function approachStep(position,speed,direction,limit,stop,dt){
 const distance=(stop-position)*direction;
 const desired=Math.min(limit,Math.sqrt(2*1.6*Math.max(0,distance)));
 speed=Math.max(0,Math.min(desired,speed+1.1*dt));
 const travel=Math.min(speed*dt,Math.max(0,distance));
 return {position:position+direction*travel,speed:travel>=distance?0:speed};
}

// Front-section centres are 31.8 m apart at bumper contact; retain an 8 m queue gap.
export function followingStop(s,dir,services,self=null){
 let stop=s+dir*1e6;
 for(const a of services)if(a!==self&&a.active&&a.dir===dir&&(a.s-s)*dir>=0){const line=a.s-dir*40;if((line-stop)*dir<0)stop=line;}
 return stop;
}

// A tram yields only while a crossing pedestrian is inside, or within one stride of, its own swept lane
// (1.35 m half-width + 1 m margin); once they have passed the lane it may proceed.
export function crosserInPath(lat,walkDir,lane,half=2.35,stride=2.2){
 const lo=lane-half,hi=lane+half;if(lat>=lo&&lat<=hi)return true;
 const ahead=walkDir===1?lo-lat:lat-hi;return ahead>=0&&ahead<=stride;
}
