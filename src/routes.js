import * as T from 'three';
import {sample,LOOP,STOPS,DEPOT,laneOffset} from './alignment.js';
const point=(s,l=0)=>{const r=sample(s);return new T.Vector3(r.x+r.lx*l,r.y,r.z+r.lz*l);};
const points=[point(35,laneOffset(35,-1)),point(15,-3.8)],r=sample(STOPS[0].s);
for(let i=0;i<=24;i++){const a=-Math.PI/2-i*Math.PI/24;points.push(new T.Vector3(LOOP.center.x+LOOP.radius*(Math.cos(a)*r.tx+Math.sin(a)*r.lx),LOOP.y,LOOP.center.z+LOOP.radius*(Math.cos(a)*r.tz+Math.sin(a)*r.lz)));}
points.push(point(15,3.8),point(35,laneOffset(35)));
export const terminalCurve=new T.CatmullRomCurve3(points,false,'centripetal');
const d=sample(DEPOT.s),outward=new T.Vector3(d.lx,0,d.lz);
const tangent=s=>point(s+.5,laneOffset(s+.5)).sub(point(s-.5,laneOffset(s-.5))).normalize();
export const depotCurve=new T.CurvePath();
const entry=point(DEPOT.s-45,laneOffset(DEPOT.s-45)),bend=point(DEPOT.s-26,1.9),apron=point(DEPOT.s,30),entryT=tangent(DEPOT.s-45),bendT=tangent(DEPOT.s-26);
depotCurve.add(new T.CubicBezierCurve3(entry,entry.clone().addScaledVector(entryT,7),bend.clone().addScaledVector(bendT,-7),bend));
depotCurve.add(new T.CubicBezierCurve3(bend,bend.clone().addScaledVector(bendT,15),apron.clone().addScaledVector(outward,-15),apron));
depotCurve.add(new T.LineCurve3(apron,point(DEPOT.s,135)));
export function depotExitCurve(start,dir){
 const curve=new T.CurvePath(),join=point(DEPOT.s+dir*28,laneOffset(DEPOT.s+dir*28,dir)),end=point(DEPOT.s+dir*55,laneOffset(DEPOT.s+dir*55,dir));
 const heading=s=>point(s+dir*.5,laneOffset(s+dir*.5,dir)).sub(point(s-dir*.5,laneOffset(s-dir*.5,dir))).normalize(),joinT=heading(DEPOT.s+dir*28),endT=heading(DEPOT.s+dir*55);
 curve.add(new T.LineCurve3(start.clone(),apron));
 curve.add(new T.CubicBezierCurve3(apron,apron.clone().addScaledVector(outward,-17),join.clone().addScaledVector(joinT,-17),join));
 curve.add(new T.CubicBezierCurve3(join,join.clone().addScaledVector(joinT,9),end.clone().addScaledVector(endT,-9),end));
 return curve;
}



import {L35,l35Offset,JUNCTIONS,UNDERPASSES,fromChainage,l35Ground,sideCrossing} from './alignment.js';
export {L35,l35Offset,sideCrossing} from './alignment.js';
const d6=JUNCTIONS.find(j=>j.c===2650),d3=UNDERPASSES.find(j=>j.c===3395),a=sample(d6.s),b=sample(d3.s);
// Junction-local frames match the rendered junction groups: x=-lateral, z=-along.
const frame=(r,y,grade=0)=>(x,z)=>new T.Vector3(r.x-r.lx*x-r.tx*z,y-grade*z,r.z-r.lz*x-r.tz*z),at6=frame(a,a.y,a.grade),at3=frame(b,b.groundY);
const local=(r,p)=>({x:-((p.x-r.x)*r.lx+(p.z-r.z)*r.lz),z:-((p.x-r.x)*r.tx+(p.z-r.z)*r.tz)});
const l35Point=(s,l)=>{const p=point(s,l);p.y=l35Ground(s);return p;};
const bendS=fromChainage(3310),mouthX=l35Offset(d3.s),h3=d3.halfWidth,h6=d6.halfWidth,x6=l35Offset(d6.s);
// ponytail: the corridor is straight beneath VB2, so L35 runs on and meets D3 at a left-in/left-out priority T with R6 kerb returns.
// Downstream of the mouth a 25 m taper (3.5 m wide at the corner) lets merging traffic join D3's nearside lane; the give-way line spans the mouth at the taper edge.
// The L35 outer kerb meets D6 with an R6 return; its centre is shared by the rendered kerb and the turning path (radius 8, concentric).
export const l35D6={kerb:local(a,point(d6.s+h6+6,-l35Offset(d6.s+h6+6)-L35.width/2)).x,left:local(a,point(d6.s+h6+8.5,-l35Offset(d6.s+h6+8.5)+L35.width/2)).x,R:6};
export const l35Mouth={x:mouthX,edge:h3,R:6,taper:3.5,taperLength:25,half:L35.width/2};
const bendPoints=[];for(let s=bendS;s<d3.s-h3-14;s+=6)bendPoints.push(l35Point(s,-l35Offset(s)));for(const z of [h3+12,h3+6,h3])bendPoints.push(at3(mouthX,z).setY(l35Ground(d3.s-z)));
export const l35BendCurve=new T.CatmullRomCurve3(bendPoints,false,'centripetal');
const bendLength=l35BendCurve.getLength(),bendLane=(off,from,to,skip=0)=>Array.from({length:Math.ceil(Math.abs(to-from)/4)+1-skip},(_,i)=>{i+=skip;const u=(from+(to-from)*i/Math.ceil(Math.abs(to-from)/4))/bendLength,p=l35BendCurve.getPointAt(u),t=l35BendCurve.getTangentAt(u);return new T.Vector3(p.x+t.z*off,p.y,p.z-t.x*off);});
const arc=(at,f,skip=0)=>Array.from({length:13-skip},(_,i)=>at(...f((i+skip)*Math.PI/24)));
// Out: D6 east arm, left into L35, give way, left into the taper and D3's nearside lane (HK keep-left: along -6.5 carries +lateral traffic).
const zTurn=h3+l35Mouth.taper+l35Mouth.R+.25,cx=mouthX-1.8-8,out=[];for(let x=-100;x<x6-1.8-(h6-1.9)-2;x+=12)out.push(at6(x,-1.9));out.push(...arc(at6,p=>[x6-1.8-(h6-1.9)+(h6-1.9)*Math.sin(p),-h6+(h6-1.9)*Math.cos(p)]));
for(let s=d6.s+h6+3;s<bendS-3;s+=8)out.push(l35Point(s,-l35Offset(s)+1.8));out.push(...bendLane(1.8,0,bendLength-(zTurn-h3)),...arc(at3,p=>[cx+8*Math.cos(p),zTurn-8*Math.sin(p)],1));for(let i=1;i<=7;i++){const u=i/7;out.push(at3(cx-(cx+25)*u,h3+1.75-(h3+1.75-6.5)*u*u*(3-2*u)));}for(let x=-37;x>=-140;x-=12)out.push(at3(x,6.5));
// Return: D3 nearside lane from the far side, left into L35, then left out into the D6 west arm nearside lane.
const back=[];for(let x=140;x>mouthX+13.3;x-=12)back.push(at3(x,6.5));back.push(...arc(at3,p=>[mouthX+11.3-9.5*Math.sin(p),16-9.5*Math.cos(p)]),...bendLane(-1.8,bendLength-7,0));
for(let s=bendS-8;s>d6.s+h6+14;s-=8)back.push(l35Point(s,-l35Offset(s)-1.8));back.push(...arc(at6,p=>[l35D6.kerb+l35D6.R-8*Math.cos(p),-h6-l35D6.R+8*Math.sin(p)]));for(let x=l35D6.kerb+l35D6.R+6;x<=100;x+=12)back.push(at6(x,-h6-l35D6.R+8));
export const l35TrafficCurve=new T.CatmullRomCurve3(out,false,'centripetal'),l35ReturnCurve=new T.CatmullRomCurve3(back,false,'centripetal');l35TrafficCurve.arcLengthDivisions=l35ReturnCurve.arcLengthDivisions=3000;
const find=(curve,test)=>{const L=curve.getLength(),n=Math.ceil(L*4);for(let i=0;i<=n;i++)if(test(curve.getPointAt(i/n)))return L*i/n;return L;};
// Route distances of the front-bumper stop points: D6 stop lines (side phase out, L35 arm back) and the D3 give-way line; mergeLat is D3 lateral where merging traffic joins.
export const L35_LINES={bendS,mergeLat:-cx,d6Out:find(l35TrafficCurve,p=>local(a,p).x>=-(sideCrossing(d6,-1)+3)),giveWay:find(l35TrafficCurve,p=>{const q=local(b,p);return q.z<=h3+l35Mouth.taper+.6&&Math.abs(q.x-mouthX)<8;}),d6Return:find(l35ReturnCurve,p=>{const q=local(a,p);return q.z>=-(h6+13.5)&&Math.abs(q.x-x6)<6;})};
