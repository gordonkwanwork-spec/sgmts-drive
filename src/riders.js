import {RIDE_SEATS,FLOOR_Y} from './passenger.js';
import {DOOR_Z} from './tram-interior.js';

// On-board passengers for the one vehicle being ridden (or the nearest one): a fixed pool parented to the
// sections, so they move, brake and articulate with the body. At each stop some walk out through the
// platform-side doorway and newcomers walk in to a free seat, or stand by a door when the seats are full.
// ponytail: one furnished vehicle at a time; other vehicles keep their seats empty.
const NAMES=['section_front','section_mid','section_rear'],SIT=.5,WALK=1.1;
// Standing places: by the doorway poles and along the aisle, facing across or along the car.
const STANDING=[0,1,2].flatMap(si=>DOOR_Z.flatMap(z=>[{si,x:.32,z:z+.42,yaw:Math.PI/2},{si,x:-.3,z:z-.4,yaw:-Math.PI/2},{si,x:.2,z:z+1.1,yaw:0}]));

export function createRiders({make,pose,count=12}){
 const pool=Array.from({length:count},(_,i)=>({group:make(i),state:'off'}));
 let tram=null,dwelling=false,clock=0,seed=1;
 const rand=()=>(seed=(seed*16807)%2147483647)/2147483647;
 const section=si=>tram.sections.find(g=>g.name===NAMES[si]);
 const busy=()=>new Set(pool.filter(r=>r.state!=='off'&&r.seat!=null).map(r=>r.seat));
 const show=r=>{const g=section(r.si);if(r.group.parent!==g)g.add(r.group);r.group.position.set(r.x,r.y,r.z);r.group.rotation.y=r.yaw;r.group.visible=true;};
 const off=r=>{r.state='off';r.seat=null;r.path=null;r.group.removeFromParent();};
 function sit(r,i){const q=RIDE_SEATS[i];Object.assign(r,{state:'seated',seat:i,si:q.section,x:q.x*.97-q.face[0]*.1,z:q.z-q.face[1]*.1,y:q.y-SIT,yaw:Math.atan2(-q.face[0],-q.face[1]),path:null});r.group.userData.action={sit:SIT};show(r);}
 function stand(r,spot){Object.assign(r,{state:'standing',seat:null,si:spot.si,x:spot.x,z:spot.z,y:FLOOR_Y,yaw:spot.yaw,path:null});r.group.userData.action={};show(r);}
 const freeSeat=avoid=>{const used=busy();if(avoid!=null)used.add(avoid);const free=RIDE_SEATS.map((_,i)=>i).filter(i=>!used.has(i));return free.length?free[Math.floor(rand()*free.length)]:null;};
 const freeSpot=()=>{const free=STANDING.filter(p=>!pool.some(r=>(r.state==='standing'||r.spot===p)&&r.si===p.si&&r.z===p.z));return free[Math.floor(rand()*free.length)];};
 const door=z=>DOOR_Z.reduce((a,b)=>Math.abs(b-z)<Math.abs(a-z)?b:a);

 // Switch vehicle: clear the old one and seat a new load (stable per vehicle).
 function focus(t,avoid){if(t===tram)return;pool.forEach(off);tram=t;dwelling=false;if(!t)return;seed=(t.homeDir===1?7:13)+Math.round(t.s)%97;
  const load=4+Math.floor(rand()*5);for(let k=0;k<load;k++){const i=freeSeat(avoid);if(i!==null)sit(pool[k],i);}
  // A few always stand, even with seats free.
  const standers=2+Math.floor(rand()*3);for(let k=0;k<standers;k++){const spot=freeSpot();if(spot)stand(pool[load+k],spot);}}

 function walk(r,dt){let step=WALK*dt;r.moved=0;while(step>0&&r.path.length){const p=r.path[0],dx=p.x-r.x,dz=p.z-r.z,d=Math.hypot(dx,dz);
   if(d<=step){r.x=p.x;r.z=p.z;r.path.shift();step-=d;r.moved+=d;}else{r.x+=dx/d*step;r.z+=dz/d*step;r.moved+=step;step=0;}if(d>.01)r.yaw=Math.atan2(-dx,-dz);}
  r.group.position.set(r.x,r.y,r.z);r.group.rotation.y=r.yaw;if(!r.path.length)r.done(r);}

 // side: x sign of the platform-side doorways. avoid: the player's seat.
 function update(dt,{side,avoid}){if(!tram)return busy();
  const open=tram.dwell>0&&tram.door>.5;
  if(open&&!dwelling){dwelling=true;clock=0;
   // Alighting: one to three seated riders head for the nearest platform-side doorway in their section.
   const seated=pool.filter(r=>r.state==='seated').sort(()=>rand()-.5).slice(0,1+Math.floor(rand()*3));
   for(const r of seated){const z=door(r.z);r.group.userData.action={};Object.assign(r,{state:'alighting',seat:null,y:FLOOR_Y,path:[{x:0,z:r.z},{x:0,z},{x:side*1.35,z},{x:side*3.2,z:z+(rand()-.5)}],done:off});r.x*=.5;}
   const standing=pool.find(r=>r.state==='standing');if(standing&&rand()<.5){const z=door(standing.z);Object.assign(standing,{state:'alighting',path:[{x:0,z},{x:side*1.35,z},{x:side*3.2,z}],done:off});}
  }
  if(open){clock+=dt;
   // Boarding starts once the doorway has cleared, at most one newcomer per second.
   if(clock>2.2&&clock<7&&!pool.some(r=>r.state==='alighting')&&!pool.some(r=>r.state==='boarding'&&r.clock>clock-1)&&rand()<dt*2){const r=pool.find(p=>p.state==='off');
    if(r){const i=rand()<.3?null:freeSeat(avoid),spot=i===null?freeSpot():null;if(i!==null||spot){const q=i===null?spot:RIDE_SEATS[i],si=i===null?spot.si:q.section,z=door(q.z);
     Object.assign(r,{state:'boarding',clock,seat:i,si,x:side*3.2,z:z+(rand()-.5)*.8,y:FLOOR_Y,yaw:0,path:[{x:side*1.35,z},{x:0,z},{x:0,z:q.z},{x:(i===null?q.x:q.x*.6),z:q.z}],done:p=>i===null?stand(p,spot):sit(p,i)});r.group.userData.action={};show(r);}}}
  }
  if(!open&&dwelling){dwelling=false;// doors closing: anyone still in the doorway finishes their move at once
   for(const r of pool)if(r.state==='alighting'||r.state==='boarding')r.done(r);}
  for(const r of pool){if(r.state==='off')continue;if(r.path)walk(r,dt);pose(r.group,r.path?r.moved||0:0,dt);}
  return busy();}

 return {focus,update,get tram(){return tram;},pool};
}
