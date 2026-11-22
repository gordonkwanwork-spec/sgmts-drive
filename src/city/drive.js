// City vehicle frame: forward is local -Z, left steering increases yaw.
export const CAR={wheelbase:2.7,maxSpeed:50/3.6,maxReverse:4,accel:3.2,brake:8,drag:.35,maxSteer:.6,kerb:.22};
const clamp=(v,a,b)=>Math.max(a,Math.min(b,v));
function localPoint(car,x,z){
 const s=Math.sin(car.yaw),c=Math.cos(car.yaw);
 return [car.x+c*x+s*z,car.z-s*x+c*z];
}

export function carFits(car,world,from){
 const halfWidth=car.width/2-.08,halfLength=car.length/2-.08;
 if(world.obstructed?.(car))return false;
 for(const lateral of [-halfWidth,0,halfWidth])for(const along of [-halfLength,0,halfLength]){
  const [x,z]=localPoint(car,lateral,along);
  if(!world.drivable(x,z)||world.blocked?.(x,z,.22))return false;
  if(from&&world.height){
   const [px,pz]=localPoint(from,lateral,along);
   if(world.height(x,z)-world.height(px,pz)>CAR.kerb)return false;
  }
 }
 return true;
}

export function stepCar(car,input,dt,world){
 const {throttle=0,steer=0,brake=false,boost=false}=input;
 const accel=(car.accel??CAR.accel)*(boost?1.8:1),decel=car.brake??CAR.brake;
 const previous=car.v;
 if(brake)car.v-=Math.sign(car.v)*Math.min(Math.abs(car.v),decel*1.2*dt);
 else if(throttle>0)car.v+=(car.v<-.1?decel:accel)*throttle*dt;
 else if(throttle<0)car.v+=(car.v>.1?decel:accel)*throttle*dt;
 else car.v-=Math.sign(car.v)*Math.min(Math.abs(car.v),(CAR.drag+.02*car.v*car.v)*dt);
 car.v=clamp(car.v,-CAR.maxReverse,Math.max(CAR.maxSpeed*(boost?1.8:1),previous-3*dt));
 car.steer+=clamp(steer*(car.maxSteer??CAR.maxSteer)-car.steer,-2.5*dt,2.5*dt);
 car.hit=false;
 if(!car.v)return car;
 // Integrate the rear axle's circular arc. The nose swings out and the rear wheels track inside it.
 const wheelbase=car.wheelbase??CAR.wheelbase,ds=car.v*dt,angle=ds*Math.tan(car.steer)/wheelbase;
 const mid=car.yaw+angle/2,yaw=car.yaw+angle,chord=Math.abs(angle)<1e-6?ds:ds*2*Math.sin(angle/2)/angle;
 const x=car.x-chord*Math.sin(mid)+wheelbase/2*(Math.sin(car.yaw)-Math.sin(yaw));
 const z=car.z-chord*Math.cos(mid)+wheelbase/2*(Math.cos(car.yaw)-Math.cos(yaw));
 if(carFits({...car,x,z,yaw},world,car)){Object.assign(car,{x,z,yaw});}
 else{car.hit=Math.abs(car.v)>1;car.v=Math.abs(car.v)<.4?0:-car.v*.15;}
 return car;
}

// Four tyre contact heights drive the same damped springs as the street sandbox.
export function updateRide(car,height,dt){
 const w=car.width*.37,l=(car.wheelbase??CAR.wheelbase)/2;
 const heights=[[-w,-l],[w,-l],[-w,l],[w,l]].map(([x,z])=>height(...localPoint(car,x,z)));
 const [fl,fr,rl,rr]=heights,target={y:(fl+fr+rl+rr)/4,p:Math.atan((fl+fr-rl-rr)/(4*l)),r:Math.atan((fr+rr-fl-rl)/(4*w))};
 if(!dt||!car.ride){car.ride={...target,vy:0,vp:0,vr:0};}
 else{
  const ride=car.ride,n=Math.ceil(dt/.005),h=dt/n;
  heights.forEach((v,i)=>{const step=v-car.wheelHeights[i];if(Math.abs(step)>.05){
   const kick=step*Math.min(Math.abs(car.v),8);
   ride.vy+=clamp(.5*kick,-.9,.9);ride.vp+=(i<2?1:-1)*clamp(.27*kick,-.5,.5);
  }});
  for(let i=0;i<n;i++)for(const k of ['y','p','r']){
   const speed='v'+k;ride[speed]+=(110*(target[k]-ride[k])-9.5*ride[speed])*h;ride[k]+=ride[speed]*h;
  }
 }
 car.wheelHeights=heights;car.y=car.ride.y;
}

// Project onto lane segments, trying the closest clear positions in the current direction first.
export function recoveryLane(pieces,car,fits,max=Infinity){
 const candidates=[];
 for(const lane of pieces){if(lane.kind!=='lane')continue;
  for(let i=1;i<lane.pts.length;i++){
   const a=lane.pts[i-1],b=lane.pts[i],dx=b.x-a.x,dz=b.z-a.z,len=Math.hypot(dx,dz);
   if(!len)continue;
   const tx=dx/len,tz=dz/len,t=clamp(((car.x-a.x)*tx+(car.z-a.z)*tz)/len,0,1);
   const x=a.x+t*dx,z=a.z+t*dz,d=Math.hypot(car.x-x,car.z-z);
   if(d>max)continue;
   const yaw=Math.atan2(-tx,-tz),alignment=Math.cos(yaw-car.yaw);
   candidates.push({x,z,y:a.y+t*(b.y-a.y),yaw,tx,tz,score:d+(1-alignment)*car.width});
  }
 }
 candidates.sort((a,b)=>a.score-b.score);
 return candidates.find(q=>fits({...car,...q}))??null;
}
