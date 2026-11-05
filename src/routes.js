import * as T from 'three';
import {sample,LOOP,STOPS,DEPOT,laneOffset} from './alignment.js';
import {PLAYER_BAY} from './depot.js';
const point=(s,l=0)=>{const r=sample(s);return new T.Vector3(r.x+r.lx*l,r.y,r.z+r.lz*l);};
const points=[point(35,laneOffset(35,-1)),point(15,-3.8)],r=sample(STOPS[0].s);
for(let i=0;i<=24;i++){const a=-Math.PI/2-i*Math.PI/24;points.push(new T.Vector3(LOOP.center.x+LOOP.radius*(Math.cos(a)*r.tx+Math.sin(a)*r.lx),LOOP.y,LOOP.center.z+LOOP.radius*(Math.cos(a)*r.tz+Math.sin(a)*r.lz)));}
points.push(point(15,3.8),point(35,laneOffset(35)));
export const terminalCurve=new T.CatmullRomCurve3(points,false,'centripetal');
const d=sample(DEPOT.s),outward=new T.Vector3(d.lx,0,d.lz);
const tangent=s=>point(s+.5,laneOffset(s+.5)).sub(point(s-.5,laneOffset(s-.5))).normalize();
export const depotCurve=new T.CurvePath();
const entry=point(DEPOT.s-45,laneOffset(DEPOT.s-45)),apron=point(DEPOT.gate,30),entryT=tangent(DEPOT.s-45);
depotCurve.add(new T.CubicBezierCurve3(entry,entry.clone().addScaledVector(entryT,16),apron.clone().addScaledVector(outward,-18),apron));
// Inside the site (src/depot.js, drawing V1038-DP-2003): down the 40 m vehicle access strip, a 30 m left turn,
// then east into bay E1-1 of the 16-ART stabling shed.
const R=30,bayRow=new T.Vector3(PLAYER_BAY.front.x,apron.y,PLAYER_BAY.front.z),east=new T.Vector3(1,0,0);
const turn=Math.atan2(outward.z,outward.x),straight=(bayRow.z-apron.z-R*(Math.sin(turn-Math.PI/2)+1))/outward.z;
const turnStart=apron.clone().addScaledVector(outward,straight),centre=turnStart.clone().add(new T.Vector3(Math.cos(turn-Math.PI/2)*R,0,Math.sin(turn-Math.PI/2)*R)),turnEnd=centre.clone().add(new T.Vector3(0,0,R));
const k=4/3*Math.tan(turn/4)*R;// cubic Bézier approximation of the circular arc
export const depotInner=new T.CurvePath();
depotInner.add(new T.LineCurve3(apron,turnStart));
depotInner.add(new T.CubicBezierCurve3(turnStart,turnStart.clone().addScaledVector(outward,k),turnEnd.clone().addScaledVector(east,-k),turnEnd));
depotInner.add(new T.LineCurve3(turnEnd,bayRow));
for(const c of depotInner.curves)depotCurve.add(c);
// Leaving: retrace the inner path from wherever the (reversed) vehicle stands, back to the gate, then join either lane.
const innerPoints=depotInner.getSpacedPoints(Math.ceil(depotInner.getLength()/.5));
export function depotExitCurve(start,dir){
 const curve=new T.CurvePath(),join=point(DEPOT.s+dir*28,laneOffset(DEPOT.s+dir*28,dir)),end=point(DEPOT.s+dir*55,laneOffset(DEPOT.s+dir*55,dir));
 const heading=s=>point(s+dir*.5,laneOffset(s+dir*.5,dir)).sub(point(s-dir*.5,laneOffset(s-dir*.5,dir))).normalize(),joinT=heading(DEPOT.s+dir*28),endT=heading(DEPOT.s+dir*55);
 let nearest=0;innerPoints.forEach((p,i)=>{if(p.distanceToSquared(start)<innerPoints[nearest].distanceToSquared(start))nearest=i;});
 const back=[start.clone(),...innerPoints.slice(0,Math.max(1,nearest)).reverse()];if(back.length<3)back.splice(1,0,start.clone().lerp(apron,.5));
 curve.add(new T.CatmullRomCurve3(back,false,'centripetal'));
 curve.add(new T.CubicBezierCurve3(apron,apron.clone().addScaledVector(outward,-17),join.clone().addScaledVector(joinT,-17),join));
 curve.add(new T.CubicBezierCurve3(join,join.clone().addScaledVector(joinT,9),end.clone().addScaledVector(endT,-9),end));
 return curve;
}
