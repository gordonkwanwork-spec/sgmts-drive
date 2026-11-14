// City rebuild 2 (Gordon, 14 Nov 2026): the player's own car in the city, after the sandbox's driving.js (bicycle model,
// footprint corners tested against the drivable surface). Pure: the game supplies the world and draws the car.
// car: {x,z,yaw (model faces −Z: forward = (−sin yaw, −cos yaw)),v (m/s, negative in reverse),steer (rad),length,width}
// input: {throttle −1…1 (W/S), steer −1…1 (A = +1 = left), brake (Space)}
// world: {drivable(x,z) → on a carriageway or junction, blocked(x,z,r) → another vehicle or a person within r}
export const CAR={wheelbase:2.7,maxSpeed:22,maxReverse:5,accel:3.4,brake:8,drag:.35,maxSteer:.6,steerRate:1.8};
export function stepCar(car,input,dt,world){const {throttle=0,steer=0,brake=false}=input;
 // speed: W accelerates (or brakes when rolling backwards), S brakes then reverses, Space brakes hard
 if(brake)car.v-=Math.sign(car.v)*Math.min(Math.abs(car.v),CAR.brake*1.4*dt);
 else if(throttle>0)car.v+=(car.v<0?CAR.brake:CAR.accel*(1-Math.max(0,car.v)/CAR.maxSpeed))*throttle*dt;
 else if(throttle<0)car.v+=(car.v>0?CAR.brake:CAR.accel*.6)*throttle*dt;
 else car.v-=Math.sign(car.v)*Math.min(Math.abs(car.v),(CAR.drag+.02*Math.abs(car.v))*dt);
 car.v=Math.max(-CAR.maxReverse,Math.min(CAR.maxSpeed,car.v));
 // steering eases towards the input; less lock at speed
 const lock=CAR.maxSteer/(1+Math.abs(car.v)/7),want=steer*lock;car.steer+=Math.max(-CAR.steerRate*dt,Math.min(CAR.steerRate*dt,want-car.steer));
 const yaw=car.yaw+car.v/CAR.wheelbase*Math.tan(car.steer)*dt,fx=-Math.sin(yaw),fz=-Math.cos(yaw),x=car.x+fx*car.v*dt,z=car.z+fz*car.v*dt;
 // the four corners (and the nose or tail centre) must stay on the road and clear of others
 const hl=car.length/2,hw=car.width/2,pts=[[hl,hw],[hl,-hw],[-hl,hw],[-hl,-hw],[Math.sign(car.v||1)*hl,0]].map(([a,b])=>[x+fx*a+fz*b,z+fz*a-fx*b]);
 const lead=[x+fx*Math.sign(car.v||1)*(hl+.4),z+fz*Math.sign(car.v||1)*(hl+.4)];
 if(pts.every(([px,pz])=>world.drivable(px,pz))&&!world.blocked(lead[0],lead[1],1.1)){car.x=x;car.z=z;car.yaw=yaw;car.hit=false;}
 else{car.hit=Math.abs(car.v)>2;car.v*=-.15;if(Math.abs(car.v)<.4)car.v=0;}// kerb or obstacle: stop with a small rebound, keep the heading
 return car;}
