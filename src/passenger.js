import {STOPS} from './alignment.js';
import {stationStopTarget} from './service.js';

const clamp=(x,a,b)=>Math.max(a,Math.min(b,x));

// Saloon layout measured from public/assets/art.glb, section-local metres (front of the vehicle is -z).
// Train frame Z = section index × PITCH + local z, so the aisle runs continuously through both gangways.
export const PITCH=10.6,FLOOR_Y=.63,STAND_EYE=1.62,SIT_EYE=.72,AISLE=.42,Z_MIN=-1.9,Z_MAX=2*PITCH+1.9;
// Back-to-back podium pairs over each bogie (cushion 1.45 m), single seats on the low floor (1.11 m).
// face: the local direction the sitter looks. The mid section's left low-floor bay is the wheelchair space.
const pair=(section,z,toward)=>[-.88,.88].flatMap(x=>[{section,x,y:1.45,z:z-toward*.38,face:[0,-toward]},{section,x,y:1.45,z:z+toward*.38,face:[0,toward]}]);
const single=(section,x)=>({section,x,y:1.11,z:0,face:[-Math.sign(x),0]});
export const RIDE_SEATS=[...pair(0,3,1),single(0,-.88),single(0,.88),...pair(1,-3,-1),...pair(1,3,1),single(1,.88),...pair(2,-3,-1),single(2,-.88),single(2,.88)];
export const seatZ=seat=>seat.section*PITCH+seat.z;
export const sectionOf=Z=>clamp(Math.round(Z/PITCH),0,2);

// Free seat closest to a standing passenger, within reach.
export function nearestSeat(Z,x,taken=new Set(),reach=1.8){
 let best=-1,bd=reach;RIDE_SEATS.forEach((s,i)=>{const d=Math.hypot(seatZ(s)-Z,s.x-x);if(!taken.has(i)&&d<bd){bd=d;best=i;}});return best<0?null:best;}

// Standing passengers walk the aisle only (seats and podiums either side).
export const aisleStep=(Z,x,dZ,dx)=>({Z:clamp(Z+dZ,Z_MIN,Z_MAX),x:clamp(x+dx,-AISLE,AISLE)});

// On-board cues for the vehicle being ridden. memo persists between calls; returns what to play this tick.
// Origin stops (A1 northbound, A7 southbound) get no "next stop"; the last stop gets the terminus wording.
export function rideCues(memo,{stop,dir,distance,dwell}){
 const out=[];if(!stop)return out;const key=stop.id+':'+dir;if(memo.key!==key)Object.assign(memo,{key,next:false,arrived:false,closing:false,shut:false});
 const origin=dir===1?stop===STOPS[0]:stop===STOPS.at(-1),last=dir===1?stop===STOPS.at(-1):stop===STOPS[0];
 if(dwell>0){if(!memo.arrived){memo.arrived=memo.next=true;out.push('chime','doors-open');if(last)out.push('arrived-'+stop.id);}
  if(dwell<6&&!memo.closing){memo.closing=true;out.push('doors');}if(dwell<1&&!memo.shut){memo.shut=true;out.push('doors-close');}}
 else if(!memo.next&&!origin&&distance>12&&distance<160){memo.next=true;out.push(`next-${stop.id}${last?'-terminus':''}`);}
 return out;}

// Arrival boards: seconds until each vehicle calls at a platform. A vehicle already past (or heading the other way)
// runs to the terminus, turns and comes back. ponytail: fixed cruise/dwell/turn times, no signal or queue delays.
export const CRUISE=7,DWELL=10,TURN=60;
function run(from,to,dir){let t=Math.abs(to-from)/CRUISE;for(const st of STOPS){const at=stationStopTarget(st,dir);if((at-from)*dir>1&&(to-at)*dir>1)t+=DWELL;}return t;}
export function eta(st,dir,tram){
 const target=stationStopTarget(st,dir),term=dir===1?STOPS[0]:STOPS.at(-1),left=tram.dwell||0;
 if(tram.dir===dir){const d=(target-tram.s)*dir;if(Math.abs(d)<1&&left>0)return 0;if(d>0)return left+run(tram.s,target,dir);return null;}
 const turnAt=stationStopTarget(term,-dir),start=stationStopTarget(term,dir);
 return (turnAt-tram.s)*tram.dir<-1?null:left+run(tram.s,turnAt,tram.dir)+TURN+run(start,target,dir);}
export function arrivalRows(st,dir,trams,max=4){
 const dest=dir===1?STOPS.at(-1):STOPS[0];
 return trams.map(t=>eta(st,dir,t)).filter(t=>t!==null&&t<1800).sort((a,b)=>a-b).slice(0,max)
  .map(t=>({dest:dest.name,destZh:dest.zh,platform:dir===1?1:2,when:t===0?'Departing':t<60?'Arriving':`${Math.round(t/60)} min`}));}
