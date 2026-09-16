import * as T from 'three';
import {sample,LOOP,STOPS,DEPOT,laneOffset} from './alignment.js';
const point=(s,l=0)=>{const r=sample(s);return new T.Vector3(r.x+r.lx*l,r.y,r.z+r.lz*l);};
const points=[point(35,laneOffset(35,-1)),point(15,-3.8)],r=sample(STOPS[0].s);
for(let i=0;i<=24;i++){const a=-Math.PI/2-i*Math.PI/24;points.push(new T.Vector3(LOOP.center.x+LOOP.radius*(Math.cos(a)*r.tx+Math.sin(a)*r.lx),LOOP.y,LOOP.center.z+LOOP.radius*(Math.cos(a)*r.tz+Math.sin(a)*r.lz)));}
points.push(point(15,3.8),point(35,laneOffset(35)));
export const terminalCurve=new T.CatmullRomCurve3(points,false,'centripetal');
const d=sample(DEPOT.s);
export const depotCurve=new T.CurvePath();
depotCurve.add(new T.LineCurve3(point(DEPOT.s-45,1.9),point(DEPOT.s-25,1.9)));
depotCurve.add(new T.CubicBezierCurve3(point(DEPOT.s-25,1.9),point(DEPOT.s-8,1.9),point(DEPOT.s,8),point(DEPOT.s,28)));
depotCurve.add(new T.LineCurve3(point(DEPOT.s,28),point(DEPOT.s,135)));
export function depotExitCurve(start,dir){const curve=new T.CurvePath();curve.add(new T.LineCurve3(start.clone(),point(DEPOT.s,28)));curve.add(new T.CubicBezierCurve3(point(DEPOT.s,28),point(DEPOT.s,8),point(DEPOT.s+dir*8,dir*1.9),point(DEPOT.s+dir*25,dir*1.9)));curve.add(new T.LineCurve3(point(DEPOT.s+dir*25,dir*1.9),point(DEPOT.s+dir*55,dir*1.9)));return curve;}


import {L35,l35Offset,JUNCTIONS,UNDERPASSES,fromChainage} from './alignment.js';
const groundPoint=(s,l)=>{const p=point(s,l);p.y=sample(s).groundY;return p;};
const d6=JUNCTIONS.find(j=>j.c===2650),d3=UNDERPASSES.find(j=>j.c===3395),a=sample(d6.s),b=sample(d3.s);
const bendS=fromChainage(3310),bendFrame=sample(bendS),bendPoint=groundPoint(bendS,-l35Offset(bendS));
export const l35BendCurve=new T.CubicBezierCurve3(bendPoint,bendPoint.clone().add(new T.Vector3(bendFrame.tx*45,0,bendFrame.tz*45)),groundPoint(d3.s,-35),groundPoint(d3.s));
const roadPoints=[groundPoint(d6.s,-100).add(new T.Vector3(a.tx*-1.9,0,a.tz*-1.9)),groundPoint(d6.s,-30).add(new T.Vector3(a.tx*-1.9,0,a.tz*-1.9)),groundPoint(d6.s+20,-l35Offset(d6.s+20))];
for(let s=d6.s+45;s<fromChainage(3310);s+=20)roadPoints.push(groundPoint(s,-l35Offset(s)));
for(let i=0;i<=24;i++)roadPoints.push(l35BendCurve.getPoint(i/24));
roadPoints.push(groundPoint(d3.s,100));
export const l35TrafficCurve=new T.CatmullRomCurve3(roadPoints,false,'centripetal');
