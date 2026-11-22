import {D5_MOUTH} from '../depot.js';
import {roadDestination} from '../city/destinations.js';
import {staggerDistance,staggeredCrossing,staggerKerbs} from './staggered-crossing.js';
import {bayDepth,BAY_HALF} from './bus-layby.js';
import {kerbPaint,planKerbZones,planBusStops,mapSightline} from './kerb-restrictions.js';
import {lookMarkingMesh} from './look-marking.js';
import {warningBands} from '../city/refuge.js';
import {signalCrossingMarkings} from './sandbox/street-rules.js';
// Drawn street network: roads and paved/planted areas authored in the street editor (Road and Area tools) and stored in
// public/street/furniture.json under `network`. The game (environment.js) and the editor both build it from here.
//   roads: [{id, preset, footway, name?, pts:[[x,z]…]}]  centrelines (straight legs, rounded corners), left = +lateral
//   areas: [{id, finish, pts:[[x,z]…]}]                   closed polygons
// A road whose end lies on another drawn road's centreline joins it as a T: the other road's footpath opens for the mouth and
// both kerbs turn the corner on a 6 m radius. Nothing may be drawn on the SGMTS corridor reserve (reserveClash).
import * as T from 'three';
import {sweptKerbs} from './kerbs.js';
import {sample,JUNCTIONS,UNDERPASSES,crossingAxes,crossingGeometry} from '../alignment.js';
import {TessellateModifier} from 'three/addons/modifiers/TessellateModifier.js';
import {corridorReserve,pointInPolygon} from '../lots/wand.js';
import {circleIntersects} from '../lots/geometry.js';

// Cross-sections (m). carriageway = kerb to kerb, median inside it; footpath per side.
export const PRESETS={
 local:{label:'Local road · 7.3 m, 3.5 m footpaths',short:'Local road',carriageway:7.3,median:0,footpath:3.5,lines:'centre'},
 distributor:{label:'Distributor · 4 lanes + median, 4.5 m footpaths',short:'Distributor',carriageway:16.6,median:2,footpath:4.5,lines:'lanes'},
 service:{label:'Service road · 6 m, 2.5 m footpaths',short:'Service road',carriageway:6,median:0,footpath:2.5,lines:'none'},
 path:{label:'Footpath only · 3 m',short:'Footpath',carriageway:0,median:0,footpath:1.5,lines:'none'},
};
export const FOOTWAYS=['red','grey','buff'];
export const FINISHES={buff:'Paving · buff',grey:'Paving · grey',red:'Paving · red brick',grass:'Grass / planting'};
export const Y={road:.03,raised:.18,area:.17,grass:.05,line:.04},CORNER=6,STEP=1;
export const presetOf=r=>({...PRESETS[r.preset]||PRESETS.local,...(r.carriageway?{carriageway:r.carriageway,median:r.median||0}:{}),...(r.footpath?{footpath:r.footpath}:{}),...(r.lines?{lines:r.lines}:{})});
// Keep a mountable white disc on narrow access roads. Larger street ends have room for a kerbed island.
function turningIsland(r,P){
 const outer=r.turningRadius;
 const style=outer<9||(outer<12&&P.footpath<=3)?'painted':outer>=12&&P.footpath>=3.5?'planted':'paved';
 const radius=style==='painted'?Math.min(1.15,outer*.12):Math.min(outer*.32,outer-6);
 return {style,radius};
}
const headMouth=(r,P,L)=>L-Math.sqrt(Math.max(0,r.turningRadius**2-(P.carriageway/2)**2));
// Tangent fillet between each straight kerb and the circular turning head.
function headProfile(r,P,F){
 const f=F.at(-1),outer=r.turningRadius,half=P.carriageway/2,fillet=Math.max(CORNER,P.footpath+1);
 const angle=Math.acos(Math.min(1,(half+fillet)/(outer+fillet)));
 const reach=(outer+fillet)*Math.sin(angle),bend=angle*fillet,around=(Math.PI+2*angle)*outer;
 const start=f.d-reach,length=2*bend+around;
 const point=t=>{
  let u,v,nu,nv;
  if(t<bend||t>length-bend){
   const side=t<bend?1:-1,a=Math.min(t,length-t)/fillet;
   u=-reach+fillet*Math.sin(a);v=side*(half+fillet-fillet*Math.cos(a));
   nu=-Math.sin(a);nv=side*Math.cos(a);
  }else{
   const a=Math.PI/2+angle-(t-bend)/outer;
   nu=Math.cos(a);nv=Math.sin(a);u=outer*nu;v=outer*nv;
  }
  return {x:f.x+u*f.tx+v*f.lx,z:f.z+u*f.tz+v*f.lz,nx:nu*f.tx+nv*f.lx,nz:nu*f.tz+nv*f.lz,
   y:f.y+Y.raised,base:f.y+Y.road};
 };
 return {start,length,point,bend};
}
const medianSetback=CORNER+6;
// Shift lane paint and vehicle paths together as the inverted splitter opens towards the ring.
// Blend the first metre on either side of the nose into the straight approach.
export function roundaboutLaneShift(road,d){
 let shift=0;
 for(const {nose,dir,slope,width} of road.flares||[]){
  const u=dir*(d-nose);
  if(u>-1)shift=Math.max(shift,Math.min(width,(u<1?(u+1)**2/4:u)*slope));
 }
 return shift;
}
// A conventional one-way ring can carry two full lanes from 7 m kerb-to-kerb.
export const circulatingLanes=P=>P.carriageway>=7?2:1;
export function streetLevel(r,d,lat){const P=presetOf(r),h=P.carriageway/2,depth=Math.abs(lat)-h;
 if(r.standard!=='sandbox')return depth>0?Y.raised:Y.road;
 if(depth<=0){const fade=Math.min(1,Math.max(0,((r.turningTangent??Infinity)-d)/20),...(r.junctionDistances||[]).map(at=>Math.abs(d-at)/20));return Y.road+.025*(h-Math.abs(lat))*fade;}
 let drop=0;for(const c of r.crossings||[]){const flare=Math.max(0,Math.min(1,1-(Math.abs(d-(r.staggers?.get(c)?.centre(Math.sign(lat))??c))-1.5)/1.8));drop=Math.max(drop,.13*flare*Math.max(0,1-depth/1.8));}
 return Y.raised+Math.max(0,depth-.125)*.025*(r.tie?Math.min(1,d/10):1)-drop;
}
// Arm end of a corridor crossing (side = lateral sign of the arm): the network road continues from here along the skewed road axis.
export function tieFrame(tie){const j=[...JUNCTIONS,...UNDERPASSES].find(j=>j.c===tie.junction);if(!j)throw Error('Unknown street tie-in '+tie.junction);const {r,C,u}=crossingAxes(j),k=Math.sin(j.skew*Math.PI/180);return {x:C.x+u.x*j.extent*tie.side,z:C.z+u.z*j.extent*tie.side,y:j.underpass?C.y:sample(j.s+tie.side*j.extent*k).y,tx:u.x*tie.side,tz:u.z*tie.side,slope:j.underpass?0:r.grade*k*tie.side,width:j.halfWidth*2};}
export const halfWidth=r=>{const P=presetOf(r);return P.carriageway/2+P.footpath;};

// Centreline: straight between the clicked points, each corner rounded on a BEND m radius (less where the legs are short).
export const BEND=12;
export function centreline(pts,radius=BEND){if(pts.length<3)return pts.map(p=>[...p]);const out=[[...pts[0]]];
 for(let i=1;i<pts.length-1;i++){const c=pts[i],lu=Math.hypot(pts[i-1][0]-c[0],pts[i-1][1]-c[1]),lv=Math.hypot(pts[i+1][0]-c[0],pts[i+1][1]-c[1]);
  const u=[(pts[i-1][0]-c[0])/lu,(pts[i-1][1]-c[1])/lu],v=[(pts[i+1][0]-c[0])/lv,(pts[i+1][1]-c[1])/lv],th=Math.acos(Math.max(-1,Math.min(1,u[0]*v[0]+u[1]*v[1])));
  if(!(lu>0&&lv>0)||th>Math.PI-.02){out.push([...c]);continue;}
  const t=Math.min(radius/Math.tan(th/2),.45*Math.min(lu,lv)),R=t*Math.tan(th/2),b=[u[0]+v[0],u[1]+v[1]],bl=Math.hypot(...b),k=R/Math.sin(th/2),C=[c[0]+b[0]/bl*k,c[1]+b[1]/bl*k];
  const A=[c[0]+u[0]*t,c[1]+u[1]*t],B=[c[0]+v[0]*t,c[1]+v[1]*t];let a0=Math.atan2(A[1]-C[1],A[0]-C[0]),a1=Math.atan2(B[1]-C[1],B[0]-C[0]);while(a1-a0>Math.PI)a1-=2*Math.PI;while(a1-a0<-Math.PI)a1+=2*Math.PI;
  const n=Math.max(2,Math.ceil(Math.abs(a1-a0)*R/1.5));for(let k2=0;k2<=n;k2++){const a=a0+(a1-a0)*k2/n;out.push([C[0]+R*Math.cos(a),C[1]+R*Math.sin(a)]);}}
 out.push([...pts.at(-1)]);return out;}
// Samples every ~STEP m along the centreline: {d,x,z,y,tx,tz,lx,lz}. y follows the ground averaged over ±15 m, so a road that
// crosses a terrain step ramps instead of jumping.
export function frames(road,ground=()=>0){const P=centreline(road.pts,road.standard==='sandbox'?Math.max(BEND,halfWidth(road)+6):BEND),run=[0];if(P.length<2)return [];
 for(let i=1;i<P.length;i++)run.push(run[i-1]+Math.hypot(P[i][0]-P[i-1][0],P[i][1]-P[i-1][1]));const L=run.at(-1);if(!(L>0))return [];
 const n=Math.max(1,Math.ceil(L/STEP)),F=[];let i=1;
 for(let k=0;k<=n;k++){const d=L*k/n;while(i<P.length-1&&run[i]<d)i++;const a=P[i-1],b=P[i],len=run[i]-run[i-1]||1,u=(d-run[i-1])/len,x=a[0]+(b[0]-a[0])*u,z=a[1]+(b[1]-a[1])*u;
  // tangent: the chord through the neighbouring samples' segment ends, so lateral offsets turn smoothly round the arcs
  const p=P[Math.max(0,u<.5?i-2:i-1)],q=P[Math.min(P.length-1,u<.5?i:i+1)],tx=q[0]-p[0],tz=q[1]-p[1],l=Math.hypot(tx,tz)||1;
  F.push({d,x,z,tx:tx/l,tz:tz/l,lx:tz/l,lz:-tx/l,g:ground(x,z)});}
 // Sliding ground average keeps city-scale road preparation linear.
 let lo=0,hi=0,sum=0;for(const f of F){while(hi<F.length&&F[hi].d<=f.d+15)sum+=F[hi++].g;while(F[lo].d<f.d-15)sum-=F[lo++].g;f.y=sum/(hi-lo);}
 if(road.tie){const a=tieFrame(road.tie),delta=a.y-F[0].y;for(const f of F){const t=Math.min(1,f.d/40),u=t*t*(3-2*t);f.y+=delta*(1-u);f.crossSlope=a.slope*(1-u);}}
 // A closed ring (roundabout) sits level, so every arm meets it at the same height.
 if(road.loop){
  // A common tangent at the repeated end point closes the asphalt, kerb and paint at every lateral.
  const first=F[0],last=F.at(-1),tx=first.tx+last.tx,tz=first.tz+last.tz,n=Math.hypot(tx,tz)||1;
  for(const f of [first,last])Object.assign(f,{tx:tx/n,tz:tz/n,lx:tz/n,lz:-tx/n});
  const y=F.reduce((s,f)=>s+f.y,0)/F.length;for(const f of F)f.y=y;}
 if(road.turningRadius){const y=F.at(-1).y;for(const f of F){const t=Math.min(1,Math.max(0,(L-f.d-road.turningRadius-3)/15));f.y=y*(1-t)+f.y*t;}}
 return F;}
export function frameAt(F,d){const L=F.at(-1).d,u=Math.max(0,Math.min(L,d))/L*(F.length-1),i=Math.min(F.length-2,Math.floor(u)),k=u-i,a=F[i],b=F[i+1],m=(p,q)=>p+(q-p)*k;
 return {d,x:m(a.x,b.x),z:m(a.z,b.z),y:m(a.y,b.y),tx:m(a.tx,b.tx),tz:m(a.tz,b.tz),lx:m(a.lx,b.lx),lz:m(a.lz,b.lz),crossSlope:m(a.crossSlope||0,b.crossSlope||0)};}
// Nearest sample to (x,z): {f, lat, along-distance d}.
export function nearestOn(F,x,z){let best=null,bd=Infinity;for(const f of F){const q=(f.x-x)**2+(f.z-z)**2;if(q<bd){bd=q;best=f;}}
 const along=(x-best.x)*best.tx+(z-best.z)*best.tz,f=frameAt(F,best.d+along);return {f,d:f.d,lat:(x-f.x)*f.lx+(z-f.z)*f.lz,dist:Math.hypot(x-f.x,z-f.z)};}

// T-junctions: an end of road A within JOIN m of road B's centreline (away from B's own ends).
const JOIN=1,DEFAULT_GROUND={},junctionCache=new WeakMap(),maskCache=new WeakMap();
const networkSig=n=>n?JSON.stringify(n):'';
function computeJunctions(network,ground){const all=(network?.roads||[]).map(r=>({r:{...r,crossings:[],midblocks:[],staggers:new Map(),signalCrossings:[],junctionDistances:r.tie?[0]:[]},P:presetOf(r),F:frames(r,ground)})).filter(o=>o.F.length>1),out=[];
 for(const {r,P,F} of all)if(r.turningRadius){r.turningTangent=headProfile(r,P,F).start;r.junctionDistances.push(headMouth(r,P,F.at(-1).d));}
 for(const A of all)for(const end of [0,1]){const e=end?A.F.at(-1):A.F[0];
  for(const B of all){if(B===A)continue;const n=nearestOn(B.F,e.x,e.z);if(n.dist>JOIN||n.d<2||n.d>B.F.at(-1).d-2)continue;
   // into A, away from the junction
   const a=end?[-e.tx,-e.tz]:[e.tx,e.tz],s=Math.sign(a[0]*n.f.lx+a[1]*n.f.lz)||1;
   // A closed ring (roundabout) host keeps its circle: kerb returns are solved against the circle itself (corner()).
   if(B.r.loop&&!B.ring){const P=B.F.slice(0,-1),ox=P.reduce((t,f)=>t+f.x,0)/P.length,oz=P.reduce((t,f)=>t+f.z,0)/P.length;B.ring={ox,oz,R:P.reduce((t,f)=>t+Math.hypot(f.x-ox,f.z-oz),0)/P.length};}
   out.push({A,B,end,at:n.f,side:s,a});break;}}
 // Match the joining road's longitudinal level to the host at the mouth (the host once per junction, however many arms).
 const levelled=new Set();
 for(const j of out){const key=j.B.r.id+'@'+Math.round(j.at.d/5),again=levelled.has(key);levelled.add(key);const end=j.end?j.A.F.at(-1):j.A.F[0],cs=[corner(j,1),corner(j,-1)].filter(Boolean),aReach=Math.max(...cs.map(c=>c.uA)),bReach=Math.max(...cs.map(c=>Math.abs(c.tB)));
  for(const [road,at,reach] of [[j.A,end.d,aReach],[j.B,j.at.d,bReach]])if(!(again&&road===j.B))for(const f of road.F){const d=Math.abs(f.d-at),u=Math.min(1,Math.max(0,(d-reach)/20)),v=road===j.B||j.B.ring?Math.min(1,Math.max(0,(d-reach)/50)):u;f.y=j.at.y*(1-v)+f.y*v;// the host regains its grade over 50 m
   if(road.r.standard==='sandbox'&&u<1&&!(road===j.B&&j.B.ring)){const axis=road===j.B?[j.at.tx,j.at.tz]:j.end?[-j.a[0],-j.a[1]]:j.a,along=f.d-at;f.x=(j.at.x+axis[0]*along)*(1-u)+f.x*u;f.z=(j.at.z+axis[1]*along)*(1-u)+f.z*u;const tx=axis[0]*(1-u)+f.tx*u,tz=axis[1]*(1-u)+f.tz*u,l=Math.hypot(tx,tz);f.tx=tx/l;f.tz=tz/l;f.lx=f.tz;f.lz=-f.tx;}
  }
 }
 for(const {A,B,at,a,end} of out)if(B.ring&&A.P.median&&A.r.standard==='sandbox'){
  const dir=end?1:-1,joinD=end?A.F.at(-1).d:0;
  const sin=Math.abs(a[0]*at.lx+a[1]*at.lz)||1;
  const line=joinD-dir*(B.P.carriageway/(2*sin)-.25);
  const width=A.P.median/2+.30,nose=line-dir*medianSetback;
  (A.flares??=[]).push({dir,nose,width,slope:width/(medianSetback-.9)});
 }
 // Control (TPDM V3 5.6): signals at every crossroads and at the major T-junctions (Gordon, 16 Nov): a dual carriageway meeting
 // anything, or a street (not a 3 m-footway access road) meeting a dual carriageway. Other joins are priority junctions (give
 // way), or roundabout entries where the host is a ring.
 const major=j=>j.A.P.median>0||j.B.P.median>0&&j.A.P.footpath>3;
 for(const j of out)j.signal=!j.B.r.loop&&(major(j)||out.some(k=>k!==j&&k.B===j.B&&Math.abs(k.at.d-j.at.d)<5));
 for(const j of out)if(!j.B.r.loop&&out.some(k=>k!==j&&k.signal&&k.B===j.B&&Math.abs(k.at.d-j.at.d)<5))j.signal=true;// one control per junction
 for(const j of out){j.A.r.junctionDistances.push(j.end?j.A.F.at(-1).d:0);j.B.r.junctionDistances.push(j.at.d);
  if(j.A.r.standard!=='sandbox')continue;const cs=[corner(j,1),corner(j,-1)].filter(Boolean),reach=Math.max(...cs.map(c=>c.uA))+3.5;
  // Each arm's crossing sits just behind its kerb returns: a signal crossing at crossroads, else a cautionary one (dropped kerb).
  const outward=j.end?-1:1,shift=staggerDistance(j.A.P.median);
  const d=j.end?j.A.F.at(-1).d-reach-shift:reach+shift;
  if(d>8&&d<j.A.F.at(-1).d-8&&!j.A.r.crossings.some(c=>Math.abs(c-d)<12)){j.A.r.crossings.push(d);j.crossingD=d;if(shift)j.A.r.staggers.set(d,staggeredCrossing(d,-outward,outward,j.A.P.median));if(j.signal)j.A.r.signalCrossings.push(d);}
  // The host's own approaches at a crossroads cross it just beyond the kerb returns on both sides.
  if(j.signal&&j.B.r.standard==='sandbox')j.hostX=Math.max(...cs.map(c=>Math.abs(c.tB)))+3.5;
 }
 // Both arms of a crossroads share them (j.host = {lo, hi} chainages on the host): beyond the outermost kerb return on each side.
 for(const j of out)if(j.hostX!=null&&!j.host){const g=out.filter(k=>k.hostX!=null&&k.B===j.B&&Math.abs(k.at.d-j.at.d)<5),host={lo:Math.min(...g.map(k=>k.at.d-k.hostX)),hi:Math.max(...g.map(k=>k.at.d+k.hostX))};
  const shift=staggerDistance(j.B.P.median);host.lo-=shift;host.hi+=shift;
  for(const k of g)k.host=host;for(const dd of [host.lo,host.hi])if(!j.B.r.crossings.some(c=>Math.abs(c-dd)<6)){j.B.r.crossings.push(dd);j.B.r.signalCrossings.push(dd);
   if(shift){const outward=dd===host.lo?-1:1;j.B.r.staggers.set(dd,staggeredCrossing(dd,-outward,outward,j.B.P.median));}}}
 // These three divided-road junctions have open frontage on both sides of the lower-chainage host approach.
 const footbridges=[];
 for(const [arm,host] of [['city-d1-east','city-d3-d1'],['city-tin-ha','city-hatsuen-east'],['city-d8-east','city-tin-ha']]){
  const j=out.find(k=>k.A.r.id===arm&&k.B.r.id===host&&k.host);if(!j)continue;
  const o=j.B,d=j.host.lo,r=o.r;
  footbridges.push({o,d,frame:frameAt(o.F,d)});
  r.crossings=r.crossings.filter(c=>c!==d);r.signalCrossings=r.signalCrossings.filter(c=>c!==d);r.staggers.delete(d);
 }
 // A divided host at a T needs one route across the main road. Keep the other
 // approach's vehicle stop line and primary/secondary heads for the junction.
 for(const j of out)if(j.host&&j.B.P.median&&!out.some(k=>k!==j&&k.host===j.host)){
  const r=j.B.r;
  if(!footbridges.some(b=>b.o===j.B&&b.d===j.host.lo)){
   r.crossings=r.crossings.filter(d=>d!==j.host.lo);
   r.signalCrossings=r.signalCrossings.filter(d=>d!==j.host.lo);
   r.staggers.delete(j.host.lo);
  }
 }
 // City design choice: divide long blocks into walks of about 220 m. Junctions,
 // bridges, existing landings and bus lay-bys are excluded from the new sites.
 for(const o of all){
  const {r,F,P}=o;if(!P.carriageway||r.loop||r.standard!=='sandbox')continue;
  const limits=[0,...r.junctionDistances,...r.crossings,...footbridges.filter(b=>b.o===o).map(b=>b.d),F.at(-1).d].sort((a,b)=>a-b);
  for(let i=1;i<limits.length;i++){
   const gap=limits[i]-limits[i-1];if(gap<320)continue;
   const n=Math.ceil(gap/220);
   for(let k=1;k<n;k++){
    let d=limits[i-1]+k*gap/n;
    if(r.busLayby&&Math.abs(d-r.busLayby.at)<36)d=r.busLayby.at+(d<r.busLayby.at?-36:36);
    const shift=staggerDistance(P.median);
    if(shift)d-=shift/2; // centre the two legs about the selected midblock site
    if(shift)r.staggers.set(d,staggeredCrossing(d,1,-1,P.median));
    r.midblocks.push(d);r.crossings.push(d);r.signalCrossings.push(d);
   }
  }
 }
 return {roads:all,joins:out,footbridges};}
export function junctions(network,ground){
 if(!network||typeof network!=='object')return computeJunctions(network,ground);
 const gk=ground||DEFAULT_GROUND,sig=networkSig(network);
 let byG=junctionCache.get(network);if(!byG)junctionCache.set(network,byG=new WeakMap());
 const hit=byG.get(gk);if(hit&&hit.sig===sig)return hit.res;
 const res=computeJunctions(network,ground);byG.set(gk,{sig,res});return res;
}

// 2D helpers
const isect=(p,u,q,v)=>{const det=u[0]*v[1]-u[1]*v[0];if(Math.abs(det)<1e-6)return null;const t=((q[0]-p[0])*v[1]-(q[1]-p[1])*v[0])/det;return [p[0]+u[0]*t,p[1]+u[1]*t];};
const add=(p,v,k=1)=>[p[0]+v[0]*k,p[1]+v[1]*k],dot=(u,v)=>u[0]*v[0]+u[1]*v[1];
// One kerb return: B's kerb line on the mouth side and A's kerb line on corner c (±1, A's own lateral), a CORNER m arc between them.
// Returns the footpath patch outline, the arc, where B's footpath stops (along B) and where A's starts (from the junction, along A).
function corner(j,c){const {A,B,at,side:s,a}=j,hB=B.P.carriageway/2,fB=B.P.footpath,hA=A.P.carriageway/2,fA=A.P.footpath,R=Math.min(CORNER,Math.max(1,hA+fA));
 const J=[at.x,at.z],tB=[at.tx,at.tz],m=[at.lx*s,at.lz*s],q=[a[1]*c,-a[0]*c];// q: A's lateral on corner c (left of the direction into A for c=+1)
 if(B.ring){const O=[B.ring.ox,B.ring.oz],Ro=B.ring.R+hB,R=Math.min(A.P.median?32:CORNER,B.ring.R),
   hit=(p,rad)=>{const w=[p[0]-O[0],p[1]-O[1]],wa=dot(w,a),disc=wa*wa-(dot(w,w)-rad*rad);return disc<0?null:add(p,a,-wa+Math.sqrt(disc));};// where the line p + a·t leaves the circle
  const C=hit(add(J,q,hA+R),Ro+R);if(!C)return null;const l=Math.hypot(C[0]-O[0],C[1]-O[1]),m1=[(C[0]-O[0])/l,(C[1]-O[1])/l],T1=add(O,m1,Ro),T2=add(C,q,-R);
  let a1=Math.atan2(T1[1]-C[1],T1[0]-C[0]),a2=Math.atan2(T2[1]-C[1],T2[0]-C[0]);while(a2-a1>Math.PI)a2-=2*Math.PI;while(a2-a1<-Math.PI)a2+=2*Math.PI;
  const steps=Math.max(8,Math.ceil(Math.abs(a2-a1)*R/.65));
  const arc=Array.from({length:steps+1},(_,i)=>{const t=a1+(a2-a1)*i/steps;return [C[0]+R*Math.cos(t),C[1]+R*Math.sin(t)];});
  const inset=(p,w)=>add(p,[C[0]-p[0],C[1]-p[1]],w/R);
  const walk=arc.map((p,i)=>inset(p,fB+(fA-fB)*i/steps));
  const jo=[J[0]-O[0],J[1]-O[1]],ang=Math.atan2(jo[0]*m1[1]-jo[1]*m1[0],dot(jo,m1)),turn=Math.sign(jo[0]*tB[1]-jo[1]*tB[0])||1;// arc distance along the ring from the join to T1
  return {outline:[...walk.reverse(),...arc.map(p=>inset(p,.125))],arc,road:[hit(add(J,q,hA),Ro),...arc],centre:C,radius:R,tB:ang*turn*B.ring.R,uA:dot([T2[0]-J[0],T2[1]-J[1]],a)};}
 const C=isect(add(J,m,hB+R),tB,add(J,q,hA+R),a);if(!C)return null;
 const T1=add(C,m,-R),T2=add(C,q,-R),O=isect(add(J,m,hB+fB),tB,add(J,q,hA+fA),a)||add(T1,m,fB);
 let a1=Math.atan2(T1[1]-C[1],T1[0]-C[0]),a2=Math.atan2(T2[1]-C[1],T2[0]-C[0]);while(a2-a1>Math.PI)a2-=2*Math.PI;while(a2-a1<-Math.PI)a2+=2*Math.PI;
 const arc=Array.from({length:9},(_,i)=>{const t=a1+(a2-a1)*i/8;return [C[0]+R*Math.cos(t),C[1]+R*Math.sin(t)];});
 return {outline:[add(T1,m,fB),...arc.map(p=>A.r.standard==='sandbox'?add(p,[C[0]-p[0],C[1]-p[1]],.125/R):p),add(T2,q,fA),O],arc,road:[isect(add(J,m,hB),tB,add(J,q,hA),a),...arc],centre:C,radius:R,tB:dot([T1[0]-J[0],T1[1]-J[1]],tB),uA:dot([T2[0]-J[0],T2[1]-J[1]],a)};}

// Geometry buffers per material.
// flat(mat): materials of horizontal surfaces (road, paving, paint, planting). Their triangles are made to face up as they are
// added: a junction fill polygon wound the other way would otherwise be culled and show the terrain through the road.
function sink(flat=()=>false){const bufs=new Map();
 const upright=(b,from)=>{for(let k=from;k<b.idx.length;k+=3){const [i,j,l]=[b.idx[k],b.idx[k+1],b.idx[k+2]],P=b.pos,ax=P[i*3],az=P[i*3+2],ny=(P[j*3+2]-az)*(P[l*3]-ax)-(P[j*3]-ax)*(P[l*3+2]-az);if(ny<0){b.idx[k+1]=l;b.idx[k+2]=j;}}};
 const buf=(mat,pos)=>{let cells=bufs.get(mat);if(!cells)bufs.set(mat,cells=new Map());const cell=Math.floor(pos[0]/240)+','+Math.floor(pos[2]/240);let b=cells.get(cell);if(!b)cells.set(cell,b={pos:[],idx:[]});return b;};
 return {tri(mat,pts){if(!pts.length)return;const b=buf(mat,pts[0]),n=b.pos.length/3,k0=b.idx.length;for(const p of pts)b.pos.push(...p);for(let i=1;i+1<pts.length;i++)b.idx.push(n,n+i+1,n+i);if(flat(mat))upright(b,k0);},
 raw(mat,pos,idx){if(!pos.length)return;const b=buf(mat,pos),n=b.pos.length/3,k0=b.idx.length;for(const v of pos)b.pos.push(v);for(const i of idx)b.idx.push(i+n);if(flat(mat))upright(b,k0);},
 meshes(name){const result=[...bufs].flatMap(([mat,cells])=>[...cells].map(([cell,{pos,idx}])=>{const g=new T.BufferGeometry();g.setAttribute('position',new T.Float32BufferAttribute(pos,3));g.setAttribute('uv',new T.Float32BufferAttribute(Array.from({length:pos.length/3*2},(_,i)=>pos[(i>>1)*3+(i&1?2:0)]/5),2));g.setIndex(idx);g.computeVertexNormals();const m=new T.Mesh(g,mat);m.name=name;m.userData.cell=cell;m.receiveShadow=true;return m;}));bufs.clear();return result;}};
}
// Strip between laterals la..lb along F from d0 to d1, at height y(f)+dy; up=true faces up.
function strip(out,mat,F,d0,d1,la,lb,dy,shift=null){if(d1-d0<.05)return;if(d1-d0>120.001){for(let a=d0;a<d1;a+=120)strip(out,mat,F,a,Math.min(a+120,d1),la,lb,dy,shift);return;}const ds=[d0,...F.map(f=>f.d).filter(d=>d>d0&&d<d1),...(dy?.breaks||[]).filter(d=>d>d0&&d<d1),d1].sort((a,b)=>a-b),pos=[],idx=[];
 ds.forEach((d,i)=>{const f=frameAt(F,d),extra=shift?shift(d):0;for(const l of [la+extra,lb+extra])pos.push(f.x+f.lx*l,f.y+(typeof dy==='function'?dy(d,l):dy)+(f.crossSlope||0)*l,f.z+f.lz*l);if(i){const k=i*2;idx.push(k-2,k-1,k,k-1,k+1,k);}});
 if(la<lb)for(let i=0;i<idx.length;i+=3)[idx[i+1],idx[i+2]]=[idx[i+2],idx[i+1]];out.raw(mat,pos,idx);}// face up
// Vertical face along lateral l from d0 to d1, between heights lo..hi above the road (numbers, or functions of d), facing towards side (±1 lateral).
function face(out,mat,F,d0,d1,l,lo,hi,side){if(d1-d0<.05)return;if(d1-d0>120.001){for(let a=d0;a<d1;a+=120)face(out,mat,F,a,Math.min(a+120,d1),l,lo,hi,side);return;}const ds=[d0,...F.map(f=>f.d).filter(d=>d>d0&&d<d1),d1],pos=[],idx=[];
 const at=(v,d)=>typeof v==='function'?v(d):v;ds.forEach((d,i)=>{const f=frameAt(F,d);pos.push(f.x+f.lx*l,f.y+at(lo,d),f.z+f.lz*l,f.x+f.lx*l,f.y+at(hi,d),f.z+f.lz*l);if(i){const k=i*2;idx.push(...(side>0?[k-2,k,k-1,k-1,k,k+1]:[k-2,k-1,k,k-1,k+1,k]));}});out.raw(mat,pos,idx);}
// Interval list minus gaps → pieces.
const minus=(a,b,gaps)=>{let out=[[a,b]];for(const [g0,g1] of gaps)out=out.flatMap(([p,q])=>g1<=p||g0>=q?[[p,q]]:[...(g0>p?[[p,g0]]:[]),...(g1<q?[[g1,q]]:[])]);return out;};
const dashes=(a,b,on=3,off=6)=>{const out=[];for(let d=Math.ceil(a/(on+off))*(on+off);d<b;d+=on+off)out.push([d,Math.min(b,d+on)]);return out;};

// Walking queries use the exact generated surface triangles (including kerb returns and turning heads).
// A small spatial index avoids raycasting the whole city and preserves the rendered terrain interpolation.
let activeSurface=()=>null;
export const streetHeight=(x,z)=>activeSurface(x,z);
// Index mesh bounds first. Only neighbourhoods that receive a height query need triangle
// indices, and the vertex coordinates stay in the same buffers used for rendering.
export function surfaceSampler(meshes){
 const coarseSize=128,cellSize=16,coarse=new Map(),wideMeshes=[];
 const key=(x,z)=>x+','+z;
 function indexBounds(map,wide,item,size,minX,minZ,maxX,maxZ){
  const x0=Math.floor(minX/size),z0=Math.floor(minZ/size);
  const x1=Math.floor(maxX/size),z1=Math.floor(maxZ/size);
  // A long triangle can span thousands of empty cells. Test it once per query.
  if((x1-x0+1)*(z1-z0+1)>64){wide.push(item);return;}
  for(let i=x0;i<=x1;i++)for(let j=z0;j<=z1;j++){
   const k=key(i,j);
   if(!map.has(k))map.set(k,[]);
   map.get(k).push(item);
  }
 }
 for(const mesh of meshes){
  const geo=mesh.geometry;
  if(!geo.attributes.position.count)continue;
  if(!geo.boundingBox)geo.computeBoundingBox();
  const {min,max}=geo.boundingBox;
  indexBounds(coarse,wideMeshes,{geo,bins:null,wide:[]},coarseSize,min.x,min.z,max.x,max.z);
 }
 function sampleMesh(entry,x,z,height){
  const {geo,wide}=entry,{min,max}=geo.boundingBox,p=geo.attributes.position,ix=geo.index;
  if(x<min.x||x>max.x||z<min.z||z>max.z)return height;
  if(!entry.bins){
   entry.bins=new Map();
   for(let k=0;k<(ix?.count??p.count);k+=3){
    const a=ix?ix.getX(k):k,b=ix?ix.getX(k+1):k+1,c=ix?ix.getX(k+2):k+2;
    const ax=p.getX(a),bx=p.getX(b),cx=p.getX(c),az=p.getZ(a),bz=p.getZ(b),cz=p.getZ(c);
    if(Math.abs((bz-cz)*(ax-cx)+(cx-bx)*(az-cz))<1e-8)continue;
    indexBounds(entry.bins,wide,k,cellSize,Math.min(ax,bx,cx),Math.min(az,bz,cz),Math.max(ax,bx,cx),Math.max(az,bz,cz));
   }
  }
  function test(offsets){
   if(!offsets)return;
   for(const k of offsets){
    const a=ix?ix.getX(k):k,b=ix?ix.getX(k+1):k+1,c=ix?ix.getX(k+2):k+2;
    const ax=p.getX(a),bx=p.getX(b),cx=p.getX(c),az=p.getZ(a),bz=p.getZ(b),cz=p.getZ(c);
    const det=(bz-cz)*(ax-cx)+(cx-bx)*(az-cz);
    const u=((bz-cz)*(x-cx)+(cx-bx)*(z-cz))/det,v=((cz-az)*(x-cx)+(ax-cx)*(z-cz))/det,w=1-u-v;
    if(u>=-1e-4&&v>=-1e-4&&w>=-1e-4){
     const y=u*p.getY(a)+v*p.getY(b)+w*p.getY(c);
     height=height===null?y:Math.max(height,y);
    }
   }
  }
  test(entry.bins.get(key(Math.floor(x/cellSize),Math.floor(z/cellSize))));
  test(wide);
  return height;
 }
 return (x,z)=>{
  let height=null;
  for(const entry of coarse.get(key(Math.floor(x/coarseSize),Math.floor(z/coarseSize)))||[])height=sampleMesh(entry,x,z,height);
  for(const entry of wideMeshes)height=sampleMesh(entry,x,z,height);
  return height;
 };
}

// mats: {road, walk, walkGrey, walkBuff, grass, white, kerb} (environment.js materials; plain fallbacks otherwise).
export function buildNetwork(network,{mats={},ground=()=>0,continuousKerbs=false}={}){const g=new T.Group();g.name='Drawn street network';if(!network){activeSurface=()=>null;return g;}
 const fallback=(c,r=.95)=>new T.MeshStandardMaterial({color:c,roughness:r});
 const M={yellow:mats.yellow||fallback(0xf2c230,.7),road:mats.road||fallback(0x4b4f4d,.9),red:mats.walk||fallback(0x97604f),grey:mats.walkGrey||fallback(0x8d918c),buff:mats.walkBuff||fallback(0xb5a98c),grass:mats.grass||fallback(0x55663c,1),white:mats.white||fallback(0xece8d3,.8),kerb:mats.concrete||Object.assign(fallback(0xc6c2ac,.9),{side:T.DoubleSide})};// kerb faces are seen from either side
 const jointMat=mats.kerbJoint||fallback(0x656960,1);
 const flatMats=new Set([M.road,M.red,M.grey,M.buff,M.grass,M.white,M.yellow,mats.busBay,mats.tactile,mats.channel].filter(Boolean)),out=sink(m=>flatMats.has(m)),edges=[],islandKerbs=[],{roads,joins}=junctions(network,ground),cuts=new Map(),starts=new Map();// cuts: road → side → [[d0,d1]] footpath gaps; starts: road → end → {carriageway, footpath by corner}
 function addKerb(length,point){if(length>120){for(let a=0;a<length;a+=120)addKerb(Math.min(120,length-a),t=>point(a+t));return;}for(const [i,g] of sweptKerbs(length,point,{continuous:continuousKerbs}).entries()){out.raw(i?jointMat:M.kerb,g.attributes.position.array,g.index.array);g.dispose();}}
 for(const j of joins){const cs=[1,-1].map(c=>({c,k:corner(j,c)})).filter(x=>x.k);
  const along=cs.map(x=>j.at.d+x.k.tB);
  if(along.length===2){
   const host=j.B,L=host.F.at(-1).d,lo=Math.min(...along),hi=Math.max(...along);
   if(!cuts.has(host))cuts.set(host,{1:[],[-1]:[]});
   const gaps=cuts.get(host)[j.side];
   gaps.push([Math.max(0,lo),Math.min(L,hi)]);
   // A wide mouth can straddle the beginning of the ring's closed centreline.
   if(host.ring&&lo<0)gaps.push([L+lo,L]);
   if(host.ring&&hi>L)gaps.push([0,hi-L]);
  }
  const hB=j.B.P.carriageway/2,sin=Math.abs(dot(j.a,[j.at.lx*j.side,j.at.lz*j.side]))||1;
  starts.set(j.A.r.id+':'+j.end,{roundabout:!!j.B.ring,carriageway:Math.max(0,hB/sin-.25),foot:Object.fromEntries(cs.map(x=>[x.c,x.k.uA]))});
  // kerb-return footpath patch and its kerb face; carriageway wedge between A's end and B's kerb line
  const y=j.at.y;for(const {k} of cs){
   // Fill the road-side sector of the swept kerb return. The two rectangular
   // carriageway strips alone leave grass between their sharp corner and the arc.
   const sector=k.road.filter(Boolean),roadTris=T.ShapeUtils.triangulateShape(sector.map(p=>new T.Vector2(...p)),[]);out.raw(M.road,sector.flatMap(p=>[p[0],y+Y.road,p[1]]),roadTris.flatMap(t=>[t[0],t[2],t[1]]));
   const pts=k.outline,area=pts.reduce((s,p,i)=>{const q=pts[(i+1)%pts.length];return s+p[0]*q[1]-q[0]*p[1];},0),ring=area<0?pts:[...pts].reverse();
   const tris=T.ShapeUtils.triangulateShape(ring.map(p=>new T.Vector2(p[0],p[1])),[]),pos=ring.flatMap(p=>[p[0],y+Y.raised+(j.B.r.standard==='sandbox'?.025*Math.max(0,k.radius-Math.hypot(p[0]-k.centre[0],p[1]-k.centre[1])-.125):0),p[1]]);out.raw(M[j.B.r.footway||'red'],pos,tris.flatMap(t=>[t[0],t[2],t[1]]));
   const fp=[],fi=[];k.arc.forEach((p,i)=>{fp.push(p[0],y+Y.road,p[1],p[0],y+Y.raised,p[1]);if(i){const n=i*2;fi.push(n-2,n-1,n,n-1,n+1,n);}});if(j.B.r.standard!=='sandbox')out.raw(M.kerb,fp,fi);else{const F=k.arc.map((p,i)=>{const a=k.arc[Math.max(0,i-1)],b=k.arc[Math.min(k.arc.length-1,i+1)],len=Math.hypot(b[0]-a[0],b[1]-a[1]);return {x:p[0],z:p[1],nx:-(b[1]-a[1])/len,nz:(b[0]-a[0])/len};});const outside=j.B.ring?k.centre:k.outline[0];if((outside[0]-F[0].x)*F[0].nx+(outside[1]-F[0].z)*F[0].nz<0)F.forEach(f=>{f.nx*=-1;f.nz*=-1;});const run=[0];for(let i=1;i<F.length;i++)run.push(run.at(-1)+Math.hypot(F[i].x-F[i-1].x,F[i].z-F[i-1].z));const point=t=>{let i=1;while(i<F.length-1&&run[i]<t)i++;const u=(t-run[i-1])/(run[i]-run[i-1]),a=F[i-1],b=F[i];return {x:a.x+(b.x-a.x)*u,z:a.z+(b.z-a.z)*u,nx:a.nx+(b.nx-a.nx)*u,nz:a.nz+(b.nz-a.nz)*u,y:y+Y.raised,base:y+Y.road};};addKerb(run.at(-1),point);edges.push({road:j.B.r,kind:'corner',length:run.at(-1),point});}}
  const hA=j.A.P.carriageway/2;if(hA>0){const tB=[j.at.tx,j.at.tz],L1=add([j.at.x,j.at.z],[j.at.lx*j.side,j.at.lz*j.side],hB),u=starts.get(j.A.r.id+':'+j.end).carriageway;
   if(j.B.ring){
    // The outer arc falls away from the arm's straight end. Fill that crescent all the way across the mouth.
    const {ox,oz,R}=j.B.ring,q=[j.a[1],-j.a[0]],outer=R+hB;
    const section=l=>{const p=add([j.at.x,j.at.z],q,l),w=[p[0]-ox,p[1]-oz],along=dot(w,j.a);
     const edge=-along+Math.sqrt(Math.max(0,along*along+outer*outer-dot(w,w)));
     return [edge-.22,u+.02].map(t=>{const [x,z]=add(p,j.a,t);return [x,y+Y.road-.001,z];});};
    for(let l=-hA;l<hA;l+=.75){const a=section(l),b=section(Math.min(hA,l+.75));out.tri(M.road,[a[0],a[1],b[1],b[0]]);}
   }
   const q=[j.a[1],-j.a[0]],e1=add(add([j.at.x,j.at.z],j.a,u),q,hA),e2=add(add([j.at.x,j.at.z],j.a,u),q,-hA),p1=isect(e1,j.a,L1,tB),p2=isect(e2,j.a,L1,tB);
   if(p1&&p2){const quad=[e1,e2,p2,p1],a=quad.reduce((s,p,i)=>{const r=quad[(i+1)%4];return s+p[0]*r[1]-r[0]*p[1];},0),ring=a>0?quad:[...quad].reverse();out.tri(M.road,ring.map(p=>[p[0],y+Y.road,p[1]]));}}}
 // ---- City (sandbox-standard) carriageways: crossfall, central median, Hong Kong road markings (sandbox ROAD-MARKINGS-GUIDE.md).
 const up=(mat,pts)=>{const a=pts.reduce((t,p,i)=>{const q=pts[(i+1)%pts.length];return t+p[0]*q[2]-q[0]*p[2];},0);out.tri(mat,a>0?pts:[...pts].reverse());};// a face-up polygon
 const paint=(o,mat,d,l,lift=.01)=>{const f=frameAt(o.F,d);return [f.x+f.lx*l,f.y+streetLevel(o.r,d,l)+(f.crossSlope||0)*l+lift,f.z+f.lz*l];};
 const lanesOf=P=>P.carriageway>12?2:1;
 // Junction control hardware (signal poles, Give Way signs) as data for environment.js: {kind, x, y, z, yaw, …}, front = local −Z.
 const controls=[],spot=(o,d,lat,lift=0)=>{const f=frameAt(o.F,d);return {x:f.x+f.lx*lat,y:f.y+streetLevel(o.r,d,lat)+(f.crossSlope||0)*lat+lift,z:f.z+f.lz*lat};};
 const toward=(x,z)=>Math.atan2(-x,-z),facing=(o,d,dir)=>{const f=frameAt(o.F,d);return toward(-dir*f.tx,-dir*f.tz);};// facing: toward drivers travelling dir
 // Median (central reserve), Gordon 16 Nov: a raised, kerbed island 150 mm above the crowned carriageway edge, brick paved like a
 // footway, with rounded brick noses at least 6 m long (refuge and signal poles stand there) and, between the noses, a raised
 // concrete planter (walls 350 mm above the paving, 250 mm in from the kerb) planted with shrubs by city-details.js.
 const refugeRails=[],refugeBollards=[],planters=[],refugeCrossings=new Set();
 function median(o,p,q,m,open0=false,open1=false,pave=M.red){const {r,F}=o,R=m/2,a=open0?p:p+R,b=open1?q:q-R,K=.15,edge=(d,sd)=>{const f=frameAt(F,d);return f.y+streetLevel(r,d,sd*R)+(f.crossSlope||0)*sd*R;},top=d=>streetLevel(r,d,R)+K;
  for(const sd of [-1,1]){addKerb(b-a,t=>{const d=a+t,f=frameAt(F,d),base=edge(d,sd);return {x:f.x+f.lx*sd*R,z:f.z+f.lz*sd*R,nx:-f.lx*sd,nz:-f.lz*sd,y:base+K,base};});
   strip(out,mats.channel||M.kerb,F,a,b,sd*(R+.3),sd*R,(d,l)=>streetLevel(r,d,l)+.001);}
  const nose=Math.max(6,m),pa=p+nose,pb=q-nose,wo=R-.375,wi=wo-.15,H=.35,planted=pb-pa>4&&wi>.3;
  if(!planted)strip(out,pave,F,a,b,-R+.125,R-.125,top);
  else{strip(out,pave,F,a,pa,-R+.125,R-.125,top);strip(out,pave,F,pb,b,-R+.125,R-.125,top);
   for(const sd of [-1,1])strip(out,pave,F,pa,pb,...(sd<0?[-R+.125,-wo]:[wo,R-.125]),top);
   for(const sd of [-1,1]){face(out,M.kerb,F,pa,pb,sd*wo,top,d=>top(d)+H,sd);strip(out,M.kerb,F,pa,pb,...(sd<0?[-wo,-wi]:[wi,wo]),d=>top(d)+H);face(out,M.kerb,F,pa,pb,sd*wi,d=>top(d)+H-.06,d=>top(d)+H,-sd);}
   strip(out,mats.soil||M.grass,F,pa,pb,-wi,wi,d=>top(d)+H-.06);
   for(const [d,dir] of [[pa,-1],[pb,1]]){const f=frameAt(F,d),y0=f.y+top(d),pt=(l,y)=>[f.x+f.lx*l,y,f.z+f.lz*l],pos=[...pt(-wo,y0),...pt(wo,y0),...pt(-wo,y0+H),...pt(wo,y0+H)],idx=dir>0?[0,1,2,1,3,2]:[0,2,1,1,2,3];out.raw(M.kerb,pos,idx);
    up(M.kerb,[pt(-wo,y0+H),pt(wo,y0+H),[f.x+f.lx*wo+f.tx*dir*-.15,y0+H,f.z+f.lz*wo+f.tz*dir*-.15],[f.x-f.lx*wo+f.tx*dir*-.15,y0+H,f.z-f.lz*wo+f.tz*dir*-.15]]);}
   planters.push({road:r.id,F,from:pa+.15,to:pb-.15,width:2*wi,y:d=>top(d)+H-.06});}
  for(const [c,dir] of [[a,-1],[b,1]]){if(dir<0?open0:open1)continue;const f=frameAt(F,c),base=edge(c,1),at=(phi,rad)=>[f.x+f.tx*dir*rad*Math.cos(phi)+f.lx*rad*Math.sin(phi),f.z+f.tz*dir*rad*Math.cos(phi)+f.lz*rad*Math.sin(phi)];
   addKerb(Math.PI*R,t=>{const phi=-Math.PI/2+t/R,[x,z]=at(phi,R);return {x,z,nx:-dir*f.tx*Math.cos(phi)-f.lx*Math.sin(phi),nz:-dir*f.tz*Math.cos(phi)-f.lz*Math.sin(phi),y:base+K,base};});
   {const ch=mats.channel||M.kerb;for(let i=0;i<12;i++){const p0=-Math.PI/2+i*Math.PI/12,p1=p0+Math.PI/12,pt=(phi,rad)=>{const [x,z]=at(phi,rad);return [x,base+.001,z];};up(ch,[pt(p0,R),pt(p1,R),pt(p1,R+.3),pt(p0,R+.3)]);}}// the 300 mm channel runs on round the nose and joins up
   const rim=Array.from({length:13},(_,i)=>at(-Math.PI/2+i*Math.PI/12,R-.125));for(let i=1;i<rim.length;i++)up(pave,[[f.x,base+K,f.z],[rim[i-1][0],base+K,rim[i-1][1]],[rim[i][0],base+K,rim[i][1]]]);}}
 // A turn-only shaft ends at the bend. The heads point across the lane at a square junction.
 const glyph=({straight,left,right})=>{
  const join=straight?-.55:1.52,top=straight?.8:join+.15;
  const polys=[[[-2,-.15],[top,-.15],[top,.15],[-2,.15]]];
  if(straight)polys.push([[.8,-.6],[2,0],[.8,.6]]);
  for(const side of [left?1:0,right?-1:0].filter(Boolean)){
   const y=straight?join+.70:join;
   polys.push([[join-.15,0],[join+.15,0],[y+.15,.80*side],[y-.15,.80*side]],
    [[y-.48,.78*side],[y,1.48*side],[y+.48,.78*side]]);
  }
  return polys;
 };
 // The broad end of the painted triangle faces the Give Way line. Its apex touches the raised median nose.
 function paintedSplitter(o,base,dir,nose,width){
  const length=dir*(base-nose);
  if(length<=.5)return;
  const stroke=.15,half=t=>(width/2+.30)*(1-t/length);
  const pt=(t,l)=>paint(o,M.white,base-dir*t,dir*l,.024);
  // Split the transverse base at the road crown, as with the diagonal bars.
  for(const side of [-1,1])up(M.white,[pt(0,0),pt(0,side*half(0)),pt(stroke,side*half(stroke)),pt(stroke,0)]);
  for(let t=0;t<length;t+=1){
   const u=Math.min(t+1,length);
   for(const side of [-1,1])up(M.white,[pt(t,side*half(t)),pt(u,side*half(u)),
    pt(u,side*Math.max(0,half(u)-stroke)),pt(t,side*Math.max(0,half(t)-stroke))]);
  }
  // Single diagonals separate opposing flows. Clip each bar to the taper and keep it clear of the physical nose.
  for(let t=2;t<length;t+=2){
   const a=t-half(t)*.65,b=t+half(t)*.65;
   if(b+.30>length-.30||half(b+.30)<=stroke)break;
   // Split the bar at the crown so its centre cannot disappear below the asphalt.
   const c=(a+b)/2;
   up(M.white,[pt(a,half(a)-stroke/2),pt(c,0),pt(c+.30,0),pt(a+.30,half(a+.30)-stroke/2)]);
   up(M.white,[pt(c,0),pt(b,-half(b)+stroke/2),pt(b+.30,-half(b+.30)+stroke/2),pt(c+.30,0)]);
  }
 }
 // Lines on one road. Anchors are the stop / give-way lines on it: {d, dir (travel direction approaching the line), kind}.
 function markings(o,lo,hi,m,medians){const {r,P,F}=o,L=F.at(-1).d,h=P.carriageway/2,W=M.white,anchors=[],cuts=[];
  if(o.ring){
   // Close the dash pattern evenly at the seam. Both lanes circulate clockwise (TPDM V3, RM1101).
   if(circulatingLanes(P)>1){const count=Math.round(L/6);
    for(let i=0;i<count;i++){const d=(i+.5)*L/count;strip(out,W,F,d-.5,d+.5,-.065,.065,(d,l)=>streetLevel(r,d,l)+.012);}}
   // The island kerb carries the continuous double yellow ring.
   return;
  }
  const s0=starts.get(r.id+':0'),s1=starts.get(r.id+':1');
  for(const j of joins.filter(j=>j.A===o)){const dir=j.end?1:-1,line=j.end?L-s1.carriageway:s0.carriageway;
   if(j.signal&&j.crossingD!=null){const d=j.crossingD-dir*(1.65+2),tee=joins.filter(k=>k.B===j.B&&k.signal&&Math.abs(k.at.d-j.at.d)<5).length===1;anchors.push({d,dir,kind:'stop',turns:{straight:!tee,left:true,right:true}});cuts.push(dir>0?[d,hi+1]:[lo-1,d]);}// stop line ≈ 2 m behind the near stud row
   else{// at a priority junction the centre line runs on to the outer row of the give-way line (it meets the line, Gordon 17 Nov)
    const sn=Math.abs(j.a[0]*j.at.lx+j.a[1]*j.at.lz)||1,dg=(j.B.P.carriageway/2+.7)/sn;
    anchors.push({d:j.B.r.loop?line:j.end?L-dg:dg,dir,kind:j.B.r.loop?'ring':'giveway',j});
    // TS102 Give Way sign on the nearside, 0.6 m behind the kerb: 1.5 m before the line (guide §6), or just clear of the kerb return
    const s=j.end?s1:s0,t=s?.foot?.[-1],d=t==null?line-dir*1.5:dir>0?Math.min(line-1.5,L-t-.5):Math.max(line+1.5,t+.5);
    controls.push({kind:'giveway',...spot(o,d,dir*(h+.6)),yaw:facing(o,d,dir)});}}
  if(r.turningRadius){
   const d=headMouth(r,P,L)-1;
   anchors.push({d,dir:1,kind:'head'});
   controls.push({kind:'giveway',...spot(o,d-1.5,h+.6),yaw:facing(o,d-1.5,1)});
  }
  for(const j of joins.filter(j=>j.B===o&&j.host)){const a=j.host.lo-3.65,b=j.host.hi+3.65;if(anchors.some(x=>Math.abs(x.d-a)<1))continue;
   const arms=joins.filter(k=>k.B===o&&k.signal&&Math.abs(k.at.d-j.at.d)<5),turns=dir=>({straight:true,left:arms.some(k=>k.side===dir),right:arms.some(k=>k.side===-dir)});// a side road on the driver's left (lateral sign = travel direction) is a left turn
   anchors.push({d:a,dir:1,kind:'stop',turns:turns(1)},{d:b,dir:-1,kind:'stop',turns:turns(-1)});cuts.push([a,b]);}
  for(const d of r.midblocks){
   const f=frameAt(F,d),midblock=Math.round(d),node={x:f.x,z:f.z};
   for(const dir of [1,-1]){
    const pen=r.staggers.get(d),landing=pen?.centre(dir)??d,stop=landing-dir*3.65;
    const leg=frameAt(F,landing);
    strip(out,W,F,stop-.1,stop+.1,...[dir*(m/2+.06),dir*(h-.1)].sort((a,b)=>a-b),(dd,l)=>streetLevel(r,dd,l)+.012);
    controls.push({kind:'signal',...spot(o,landing+dir*1.9,dir*(h+.85)),yaw:facing(o,landing,dir),stage:'major',node,midblock,
     ped:{stage:'walk',yaw:toward(-dir*leg.lx,-dir*leg.lz)}});
    if(pen)controls.push({kind:'signal',...spot(o,landing-dir*1.85,dir*(m/2-.35),.006),
     yaw:toward(dir*leg.lx,dir*leg.lz),refuge:true,pedOnly:true,ped:{stage:'walk'},node,midblock});
   }
  }
  // Corridor crossings: continue the arm's 4 m warning lines (src/city/crossings.js) at the same phase, out to 7 marks.
  for(const [tie,end] of [[r.tie,0],[r.endTie,1]]){if(!tie)continue;const j=[...JUNCTIONS,...UNDERPASSES].find(c=>c.c===tie.junction);if(j.underpass)continue;
   const D=j.extent-Math.abs(crossingGeometry(j).stopD[tie.side])-.2;anchors.push(end?{d:L+D,dir:1,kind:'corridor'}:{d:-D,dir:-1,kind:'corridor'});}
  const holes=(r.signalCrossings||[]).flatMap(c=>[c,r.staggers.get(c)?.outgoing??c].map(d=>[d-3.3,d+3.3])),n=P.lines==='lanes'?lanesOf(P):0,lane=(h-m/2)/Math.max(1,n);
  // RM1103 centre line (3 m / 5 m) on two-way single carriageways; RM1101 lane lines (1 m / 5 m) between same-direction lanes.
  const lines=P.lines==='centre'?[{l:0,dirs:[1,-1],on:3,off:5}]:n>1?[1,-1].flatMap(sd=>Array.from({length:n-1},(_,k)=>({l:sd*(m/2+lane*(k+1)),dirs:[sd],on:1,off:5}))):[];
  const segs=(a,b,list)=>{let outv=[[a,b]];for(const [p,q] of list)outv=outv.flatMap(([u,v])=>q<=u||p>=v?[[u,v]]:[...(p>u?[[u,p]]:[]),...(q<v?[[q,v]]:[])]);return outv.filter(([u,v])=>v-u>.05);};
  for(const ln of lines){const zones=anchors.filter(a=>ln.dirs.includes(a.dir)).map(a=>({...a,a:a.dir>0?a.d-42:a.d,b:a.dir>0?a.d:a.d+42}));const marks=[];
   // RM1104 warning line: 4 m / 2 m, 7 marks behind the line, the module starting at the line
   for(const z of zones)for(let k=0;k<7;k++)marks.push(z.dir>0?[z.d-6*k-4,z.d-6*k]:[z.d+6*k,z.d+6*k+4]);
   const pitch=ln.on+ln.off;
   for(const [p,q] of segs(lo,hi,zones.map(z=>[z.a,z.b]))){const below=zones.some(z=>z.dir<0&&Math.abs(z.b-p)<.01),above=zones.some(z=>z.dir>0&&Math.abs(z.a-q)<.01);
    if(!below&&above)for(let e=q+2-ln.off;e-ln.on>p-1e-6;e-=pitch)marks.push([e-ln.on,e]);
    else for(let st=below?p-2+ln.off:p+ln.off/2;st+ln.on<q+1e-6;st+=pitch)marks.push([st,st+ln.on]);}
   for(const [a,b] of marks)for(const [p,q] of segs(Math.max(a,lo),Math.min(b,hi),[...cuts,...holes]))strip(out,W,F,p,q,ln.l-.05,ln.l+.05,(d,x)=>streetLevel(r,d,x)+.008,o.flares?d=>Math.sign(ln.l)*roundaboutLaneShift(o,d):null);}
  const halfOf=dir=>[dir*(m?m/2+.15:.05),dir*(h-.15)];// approach (dir) or exit (−dir) half, kerb to centre line / median
  for(const A of anchors){const sg=A.dir,[l0,l1]=halfOf(sg);
   if(A.d<lo-1||A.d>hi+1)continue;
   if(A.kind==='stop'){// RM1011, 200 mm, across the approach lanes; lane arrows at 15 m and 45 m (TPDM V3 Table 5.6.3.1)
    strip(out,W,F,Math.min(A.d,A.d+sg*.2),Math.max(A.d,A.d+sg*.2),Math.min(l0,l1),Math.max(l0,l1),(d,l)=>streetLevel(r,d,l)+.009);
    const nl=P.lines==='lanes'?lanesOf(P):1;for(const back of [17,47]){const dc=A.d-sg*back;if(dc<lo+2||dc>hi-2||holes.some(([p,q])=>dc>p-2&&dc<q+2))continue;
     for(let k=0;k<nl;k++){const lat=sg*(m/2+(h-m/2)/nl*(k+.5)),T=A.turns||{straight:true,left:true,right:true},g=glyph(nl===1?T:k===nl-1?{straight:T.straight||!T.left,left:T.left}:{straight:T.straight||!T.right,right:T.right});// kerb lane: left (+ ahead), offside: right (+ ahead)
      for(const poly of g)up(W,poly.map(([x,y])=>paint(o,W,dc+sg*x,lat+sg*y,.011)));}}}
   if(A.kind==='giveway'||A.kind==='ring'||A.kind==='head'){
    if(A.kind==='head'){
     // One arrow per lane at the throat, behind the Give Way triangles, facing its direction of travel.
     const lanes=lanesOf(P),d=A.d-10;
     if(d>lo+2)for(const dir of [-1,1])for(let k=0;k<lanes;k++){
      const lat=dir*(m/2+(k+.5)*(h-m/2)/lanes);
      for(const poly of glyph({straight:true}))up(W,poly.map(([x,l])=>paint(o,W,d+dir*x,lat+dir*l,.018)));
     }
     if(medians.length)paintedSplitter(o,A.d-.9,1,medians.at(-1)[1],m);
     for(const back of [0,.4])for(let lat=.10;lat<h-.15;lat+=.9){
      const end=Math.min(h-.10,lat+.60);
      up(W,[[0,lat],[0,end],[.2,end],[.2,lat]].map(([d,l])=>paint(o,W,A.d-back-d,l,.018)));
     }
    }
    if(A.kind==='ring'){
     if(medians.length){
      const nose=A.j.end?medians.at(-1)[1]:medians[0][0];
      paintedSplitter(o,A.d-sg*.9,sg,nose,m);
     }
     // Sweep RM1013 from the arm centre to the actual nearside kerb-return tangent.
     const j=A.j,{ox,oz,R}=j.B.ring,entry=corner(j,-1),outer=R+j.B.P.carriageway/2;
     const angle=Math.atan2(j.at.z-oz,j.at.x-ox),end=Math.atan2(entry.arc[0][1]-oz,entry.arc[0][0]-ox);
     const sweep=Math.atan2(Math.sin(end-angle),Math.cos(end-angle));
     const point=(t,radius)=>{const a=angle+Math.sign(sweep)*t/outer,x=ox+radius*Math.cos(a),z=oz+radius*Math.sin(a);
      const n=nearestOn(F,x,z),armY=Math.abs(n.lat)<=h?n.f.y+streetLevel(r,n.d,n.lat):-Infinity;
      return [x,Math.max(j.at.y+Y.road,armY)+.018,z];};
     // Each concentric row ends where it meets the curved kerb, clear of the yellow lines.
     // Start on the entry side of the broad splitter base.
     const start=medians.length?m/2+.30:0,centreDistance=outer+entry.radius;
     for(const dr of [.10,.50]){
      const rad=outer+dr,edge=rad+.20,clear=entry.radius+.45;
      const cos=(centreDistance**2+edge**2-clear**2)/(2*centreDistance*edge);
      const limit=outer*(Math.abs(sweep)-Math.acos(Math.max(-1,Math.min(1,cos))));
      for(let t=start;t<limit-.05;t+=.9){
       const v=Math.min(t+.60,limit);
       up(W,[point(t,rad),point(v,rad),point(v,edge),point(t,edge)]);
      }
     }
    }
    if(A.kind==='giveway'){// Gordon, 17 Nov (Ka Wai Man Road photo): the double broken line lies along the main road's kerb line, parallel to
     // the main road, across the whole opening of the lane coming out — from the kerb-return tangent to the side road's centre line.
     // The half leading into the side road has no line.
     const j=A.j,B=j.B,hB=B.P.carriageway/2,k=corner(j,sg);
     if(k){const sn=Math.abs(j.a[0]*j.at.lx+j.a[1]*j.at.lz)||1,cs=j.a[0]*j.at.tx+j.a[1]*j.at.tz,y=j.at.y+Y.road+.012,sd=j.side;
      // each vertex rides on the higher of the flat mouth and the side road's crowned carriageway (its crown buries a flat line)
      const q=(dd,l)=>{const f=frameAt(B.F,j.at.d+dd),x=f.x+f.lx*l,z=f.z+f.lz*l,n=nearestOn(F,x,z),g=frameAt(F,n.d),ya=Math.abs(n.lat)<=h?g.y+streetLevel(r,n.d,n.lat)+(g.crossSlope||0)*n.lat+.012:-Infinity;return [x,Math.max(y,ya),z];};
      for(const [r0,r1] of [[.1,.3],[.5,.7]]){const cen=(hB+(r0+r1)/2)/sn*cs,s1=Math.sign(k.tB-cen)||1,len=Math.abs(k.tB-cen);/* each row ends where the side road's centre line crosses it */
       for(let t=0;t<len-.05;t+=.9){const x=cen+s1*t,v=cen+s1*Math.min(t+.6,len);/* phased from the centre line, so a dash meets it */up(W,[q(x,sd*(hB+r0)),q(v,sd*(hB+r0)),q(v,sd*(hB+r1)),q(x,sd*(hB+r1))]);}}}
    }
    // RM1115, 3.6 m x 1.2 m. Tessellate both legs along the crown so the whole outline stays above the asphalt.
    const nl=P.lines==='lanes'?lanesOf(P):1;
    for(let k=0;k<nl;k++){
     const lat=sg*(m/2+(h-m/2)/nl*(k+.5)),base=A.d-sg*2;
     const pt=(back,offset)=>{
      const d=base-sg*back,l=lat+offset+sg*roundaboutLaneShift(o,d);
      if(Math.abs(l)<=h)return paint(o,W,d,l,.024);
      const f=frameAt(F,d);return [f.x+f.lx*l,f.y+Y.road+.024,f.z+f.lz*l];
     };
     const outer=t=>.6*(1-t/3.6),inner=t=>Math.max(0,outer(t)-.16);
     up(W,[pt(0,-.6),pt(0,.6),pt(.22,outer(.22)),pt(.22,-outer(.22))]);
     for(const side of [-1,1])for(let t=.22;t<3.6;t+=.36){
      const v=Math.min(t+.36,3.6);
      up(W,[pt(t,side*outer(t)),pt(t,side*inner(t)),pt(v,side*inner(v)),pt(v,side*outer(v))]);
     }
    }
   }
  }
 }
 // One city carriageway: crossfall from the centre (or each median edge) to the kerbs, the median, and its markings.
 function carriageway(o,c0,c1,s0,s1){const {r,P,F}=o,L=F.at(-1).d,h=P.carriageway/2,m=P.median||0,lvl=(d,l)=>streetLevel(r,d,l);
  const head=r.turningRadius?headMouth(r,P,L):c1;
  c1=Math.min(c1,head);// where the carriageway opens into a turning head
  const gapAt=d=>r.staggers.has(d)?2.25:1.75;
  let medians=[];if(m){const gaps=joins.filter(j=>j.B===o).map(j=>{const half=j.A.P.carriageway/2+CORNER+1.5;return j.host?[j.host.lo-gapAt(j.host.lo),j.host.hi+gapAt(j.host.hi)]:[j.at.d-half,j.at.d+half];});
   // Cut unsignalised crossings through both the paving and the planter using the same limits as the landings.
   for(const d of r.crossings)if(!r.signalCrossings.includes(d)||r.midblocks.includes(d)){
    const other=r.staggers.get(d)?.outgoing??d;
    gaps.push([Math.min(d,other)-gapAt(d),Math.max(d,other)+gapAt(d)]);
   }
   // at a signalised arm the median runs up to the crossing, its nose carrying the second primary signal
   const arm=e=>joins.find(j=>j.A===o&&!!j.end===e&&j.signal&&j.crossingD!=null),a0=arm(false),a1=arm(true);
   medians=minus(a0?a0.crossingD+gapAt(a0.crossingD):r.tie?0:c0+(s0?medianSetback:3),Math.min(a1?a1.crossingD-gapAt(a1.crossingD):r.endTie?L:c1-(s1?medianSetback:3),head-6),gaps).filter(([p,q])=>q-p>m+2);}// a corridor arm's median runs on flush into the road's
  const asphaltEnd=r.turningTangent??c1;
  for(const [a,b] of m?[[-h,-m/2],[m/2,h]]:[[-h,0],[0,h]])strip(out,M.road,F,c0,asphaltEnd,a,b,lvl);
  if(m)for(const [p,q] of minus(c0,asphaltEnd,medians.map(([p,q])=>[p+m/2,q-m/2])))for(const [a,b] of [[-m/2,0],[0,m/2]])strip(out,M.road,F,p,q,a,b,lvl);// across median gaps, and under the round noses
  for(const [p,q] of medians){
   let openStart=r.tie&&p<.01,openEnd=r.endTie&&q>L-.01;
   let paving=M.red;
   for(const d of r.crossings){
    const pen=r.staggers.get(d),other=pen?.outgoing??d;
    const atStart=Math.abs(p-Math.max(d,other)-gapAt(d))<.01,atEnd=Math.abs(Math.min(d,other)-q-gapAt(d))<.01;
    // At a roundabout the existing splitter nose forms the junction end of a staggered refuge.
    if(pen&&!r.signalCrossings.includes(d)&&(other>d?atStart:atEnd))paving=mats.channel||M.grey;
    if(!atStart&&!atEnd)continue;
    refugeCrossings.add(r.id+'@'+d);
    if(r.staggers.has(d)){openStart ||= atStart;openEnd ||= atEnd;}
   }
   median(o,p,q,m,openStart,openEnd,paving);
  }
  markings(o,c0,Math.min(c1,head-1),m,medians);}
 for(const o of roads){const {r,P,F}=o,L=F.at(-1).d,h=P.carriageway/2,fw=M[r.footway||'red'],gap=cuts.get(o)||{1:[],[-1]:[]},s0=starts.get(r.id+':0'),s1=starts.get(r.id+':1');
  const c0=s0?s0.carriageway:0,c1=L-(s1?s1.carriageway:0);
  if(h>0&&r.standard==='sandbox')carriageway(o,c0,c1,s0,s1);
  else if(h>0){strip(out,M.road,F,c0,c1,-h,h,Y.road);
   // A central median opens where a side road joins (turning gap), so the mouth stays at carriageway level.
   if(P.median){const gaps=joins.filter(j=>j.B===o).map(j=>{const half=j.A.P.carriageway/2+CORNER+1.5;return [j.at.d-half,j.at.d+half];});
    // where this road itself joins another, its median nose stands back from the mouth (kerb returns and turning room)
    for(const [p,q] of minus(c0+(s0?medianSetback:3),c1-(s1?medianSetback:3),gaps)){if(q-p<1)continue;strip(out,M.grass,F,p,q,-P.median/2,P.median/2,Y.raised);for(const sd of [-1,1])face(out,M.kerb,F,p,q,sd*P.median/2,Y.road,Y.raised,sd);
     for(const [d,sg] of [[p,-1],[q,1]]){const f=frameAt(F,d),pos=[],idx=[0,1,2,1,3,2];for(const l of [-P.median/2,P.median/2])for(const y of [Y.road,Y.raised])pos.push(f.x+f.lx*l,f.y+y,f.z+f.lz*l);if(sg<0)idx.reverse();out.raw(M.kerb,pos,idx);}}}
   const lane=(h-P.median/2)/2,marks=P.lines==='centre'?[0]:P.lines==='lanes'?[-(P.median/2+lane),P.median/2+lane]:[];
   for(const l of marks)for(const [a,b] of dashes(c0+2,c1-2))for(const [p,q] of minus(a,b,[...gap[1],...gap[-1],...(r.crossings||[]).map(c=>[c-3,c+3])]))strip(out,M.white,F,p,q,l-.06,l+.06,r.standard==='sandbox'?(d,x)=>streetLevel(r,d,x)+.008:Y.line);}
  if(o.ring){
   // A raised landscaped island with a kerb and a single continuous grass surface.
   // Omitting the inner footway edge also keeps roadside railings, lamps and bins off the island.
   const {ox,oz,R}=o.ring,rad=R-h,y=F[0].y;
   const point=t=>{const a=t/rad,nx=-Math.cos(a),nz=-Math.sin(a);return {x:ox-rad*nx,z:oz-rad*nz,nx,nz,y:y+Y.raised,base:y+Y.road};};
   addKerb(2*Math.PI*rad,point);
   islandKerbs.push({road:r,kind:'island',length:2*Math.PI*rad,point});
   for(let i=0;i<96;i++){const rim=k=>{const a=k*Math.PI/48;return [ox+(rad-.10)*Math.cos(a),y+Y.raised,oz+(rad-.10)*Math.sin(a)];};
    up(M.grass,[[ox,y+Y.raised,oz],rim(i),rim(i+1)]);}
  }
  for(const sd of o.ring?[1]:[1,-1]){const a=s0?s0.foot[sd*1]??0:0,b=Math.min(L-(s1?s1.foot[-sd]??0:0),r.turningRadius?headProfile(r,P,F).start:L);// corner c is A's own lateral; at the far end the sides swap
   // Shift this side's paving, channel and kerb together, leaving the through lanes on their original alignment.
   const bay=r.busLayby?.side===sd?r.busLayby:null;
   const kerbFrames=bay?F.map(f=>{
    const shift=sd*bayDepth(r,sd,f.d);
    return shift?{...f,x:f.x+f.lx*shift,z:f.z+f.lz*shift,y:f.y+(f.crossSlope||0)*shift}:f;
   }):F;
   if(bay){
    const rim=(f,depth)=>[f.x+f.lx*sd*(h+depth),f.y+Y.road+(f.crossSlope||0)*sd*(h+depth),f.z+f.lz*sd*(h+depth)];
    for(let i=1;i<F.length;i++){
     const f=F[i-1],g=F[i];if(f.d>bay.at+BAY_HALF||g.d<bay.at-BAY_HALF)continue;
     up(mats.busBay||M.road,[rim(f,0),rim(g,0),rim(g,bayDepth(r,sd,g.d)),rim(f,bayDepth(r,sd,f.d))]);
    }
   }
   for(const [p,q] of minus(a,b,gap[sd])){const lo=sd*h,hi=sd*(h+P.footpath),hk=r.standard==='sandbox';
    const landings=r.crossings.map(c=>r.staggers.get(c)?.centre(sd)??c);
    const level=hk?Object.assign((d,l)=>streetLevel(r,d,l),{breaks:landings.flatMap(c=>[c-3.3,c-1.5,c+1.5,c+3.3])}):Y.raised;
    if(hk&&h){strip(out,fw,kerbFrames,p,q,lo+sd*.125,lo+sd*1.8,level);strip(out,fw,kerbFrames,p,q,lo+sd*1.8,hi,level);}else strip(out,fw,kerbFrames,p,q,lo,hi,level);
    if(h>0&&hk){const point=t=>{const f=frameAt(kerbFrames,p+t);return {x:f.x+f.lx*lo,z:f.z+f.lz*lo,nx:f.lx*sd,nz:f.lz*sd,y:f.y+streetLevel(r,p+t,lo+sd*.00001)+(f.crossSlope||0)*lo,base:f.y+Y.road+(f.crossSlope||0)*lo};};addKerb(q-p,point);edges.push({road:r,kind:'edge',side:sd,from:p,to:q,length:q-p,point,ringAtLo:p===a && !!s0?.roundabout,ringAtHi:q===b && !!s1?.roundabout,crossings:landings.filter(c=>c>p&&c<q).map(c=>c-p)});strip(out,mats.channel||M.kerb,kerbFrames,p,q,lo-sd*.3,lo,Y.road+.001);}
    else if(h>0)face(out,M.kerb,kerbFrames,p,q,lo,Y.road,Y.raised,-sd);
    face(out,M.kerb,kerbFrames,p,q,hi,-.3,hk?streetLevel(r,0,hi):Y.raised,sd);}}}
 // Traffic signals at the city crossroads (sandbox LAYOUTS.md, TPDM V4 2.2.3.1). Each approach: a primary on the nearside kerb 1 m
 // beyond its stop line, carrying the pedestrian head for that crossing; a second primary on the median nose of a divided road; a
 // pedestrian pole at the crossing's far kerb; and its secondary back to back on the opposite approach's offside pole (the median
 // nose where the road ahead is divided, else the kerb pole). stage / ped.stage name the src/city/life.js stage that shows green.
 for(const j of joins.filter(j=>j.host)){const node={x:j.at.x,z:j.at.z};if(controls.some(c=>c.node&&Math.hypot(c.node.x-node.x,c.node.z-node.z)<6))continue;
  const arms=joins.filter(k=>k.B===j.B&&k.signal&&Math.abs(k.at.d-j.at.d)<5),ap=[1,-1].map(dir=>({o:j.B,dir,d:dir>0?j.host.lo-2.6:j.host.hi+2.6,landing:dir>0?j.host.lo:j.host.hi,stage:'major',ped:'side'}));
  for(const [i,k] of arms.entries()){const dir=k.end?1:-1;ap.push({o:k.A,dir,d:k.crossingD-dir*2.6,landing:k.crossingD,stage:'arm'+i,ped:'major'});}// arms lie on opposite sides of the host
  // A T has no opposite approach for its side road: that secondary stands behind the far kerb of the host, facing it.
  if(arms.length===1){const k=arms[0],hB=j.B.P.carriageway/2,f=frameAt(j.B.F,k.at.d);controls.push({kind:'signal',...spot(j.B,k.at.d,-k.side*(hB+.8)),yaw:toward(k.side*f.lx,k.side*f.lz),stage:'arm0',node});}
  ap.forEach((a,i)=>{const {o,dir,d}=a,h=o.P.carriageway/2,m=o.P.median||0,f=frameAt(o.F,d),b=ap[i^1]||{stage:null,o:{P:{}}};
   controls.push({kind:'signal',...spot(o,d,dir*(h+.8)),yaw:facing(o,d,dir),stage:a.stage,back:m||!b.stage?null:b.stage,ped:o.r.signalCrossings.includes(a.landing)?{stage:a.ped,yaw:toward(-dir*f.lx,-dir*f.lz)}:null,node});// each pedestrian head faces the far kerb
   const pen=o.r.staggers.get(a.landing);
   const far=pen?pen.outgoing-dir*2.6:d;
   if(o.r.signalCrossings.includes(a.landing))controls.push({kind:'signal',...spot(o,far,-dir*(h+.8)),yaw:toward(dir*f.lx,dir*f.lz),pedOnly:true,ped:{stage:a.ped},node});
   if(pen)for(const side of [-1,1]){
    const at=pen.centre(side),end=at+(at===Math.min(pen.incoming,pen.outgoing)?-1:1)*1.85;
    const pf=frameAt(o.F,end),yaw=toward(side*pf.lx,side*pf.lz);
    controls.push({kind:'signal',...spot(o,end,side*(m/2-.35),.006),yaw,refuge:true,pedOnly:true,ped:{stage:a.ped},node});
   }
   if(m){
    // At a staggered crossing the pole stands on the square end of the brick median.
    const y=pen?f.y+streetLevel(o.r,d,m/2)+.15:spot(o,d,dir*m/2,.15).y;
    controls.push({kind:'signal',x:f.x,y,z:f.z,yaw:facing(o,d,dir),stage:a.stage,back:b.stage||null,node});
   }});}
 const directionSigns=[];
 const approachSign=(o,d,dir,rows)=>{
  if(d<2||d>o.F.at(-1).d-2)return;
  rows=rows.filter(row=>row.destination);
  if(rows.length)directionSigns.push({...spot(o,d,dir*(o.P.carriageway/2+o.P.footpath/2)),yaw:facing(o,d,dir)+Math.PI,
   road:o.r.id,site:{o,d,dir},diagram:rows.length>1 && o.P.carriageway>=12?'junction':null,rows});
 };
 // Use the actual kerb arc to fit the exit flag on the road-facing edge of the footway.
 const flagSite=(j,k,dir,turn,destination,roundabout=false)=>{
  if(!k||!destination)return;
  const p=k.arc[Math.floor(k.arc.length*.53)],nx=(k.centre[0]-p[0])/k.radius,nz=(k.centre[1]-p[1])/k.radius;
  const name=/^(Road (D\d+))\b/.exec(j.A.r.name||'');
  directionSigns.push({x:p[0]+nx*1.6,z:p[1]+nz*1.6,y:j.at.y+Y.raised+.04,corner:k,
   yaw:Math.atan2(-dir*j.at.tx,-dir*j.at.tz),approach:{o:j.B,d:j.at.d,dir},flag:true,roundabout,exitRoad:j.A.r.id,
   street:roundabout&&name?{en:name[1],zh:name[2]+'號路'}:null,rows:[{destination,turn}]});
 };
 const row=(o,dir,turn)=>({destination:roadDestination(o.r,dir),turn});
 const junctionGroups=[];
 for(const j of joins.filter(j=>!j.B.ring)){
  let group=junctionGroups.find(g=>g[0].B===j.B&&Math.abs(g[0].at.d-j.at.d)<5);
  if(!group){group=[];junctionGroups.push(group);}group.push(j);
 }
 for(const arms of junctionGroups){
  const {B,at}=arms[0];
  for(const dir of [1,-1]){
   const rows=[row(B,dir,'ahead'),...arms.map(j=>row(j.A,j.end?-1:1,j.side===dir?'left':'right'))];
   approachSign(B,at.d-dir*35,dir,rows);
  }
  for(const j of arms){
   if(j.signal){
    const corners=[corner(j,1),corner(j,-1)].filter(Boolean).sort((a,b)=>a.tB-b.tB);
    for(const dir of [-1,1])flagSite(j,dir<0?corners[0]:corners.at(-1),dir,j.side===dir?'left':'right',roadDestination(j.A.r,j.end?-1:1));
   }
   const dir=j.end?1:-1,d=(j.end?j.A.F.at(-1).d:0)-dir*35;
   const rows=[row(B,j.side,'left'),row(B,-j.side,'right')];
   for(const other of arms)if(other!==j)rows.unshift(row(other.A,other.end?-1:1,'ahead'));
   approachSign(j.A,d,dir,rows);
  }
 }
 for(const o of roads)for(const [tie,dir] of [[o.r.tie,-1],[o.r.endTie,1]])if(tie){
  const other=roads.find(p=>[p.r.tie,p.r.endTie].some(t=>t?.junction===tie.junction&&t.side===-tie.side));
  if(other)approachSign(o,dir>0?o.F.at(-1).d-22:22,dir,[row(other,other.r.tie?.junction===tie.junction?1:-1,'ahead')]);
 }
 g.userData.roundabouts=roads.filter(o=>o.ring).map(o=>{
  const {ox,oz,R}=o.ring,rad=R-o.P.carriageway/2,arms=joins.filter(j=>j.B===o).sort((a,b)=>a.at.d-b.at.d);
  const entries=arms.map((j,i)=>{
   const dir=j.end?1:-1,at=j.end?j.A.F.at(-1).d:0;
   const d=at-dir*Math.min(78,j.A.F.at(-1).d*.65);
   const advance=spot(j.A,d,dir*(j.A.P.carriageway/2+2.5));
   // The clockwise driver reaches the negative-chainage return before the exit mouth.
   const nearCorner=[corner(j,1),corner(j,-1)].find(k=>k?.tB<0);
   flagSite(j,nearCorner,1,'left',roadDestination(j.A.r,-dir),true);
   return {x:j.at.x-j.a[0]*(R-rad+1.8)-j.a[1]*3,z:j.at.z-j.a[1]*(R-rad+1.8)+j.a[0]*3,
    yaw:Math.atan2(j.a[0],j.a[1]),advance:{...advance,yaw:facing(j.A,d,dir)+Math.PI,road:j.A.r.id,site:{o:j.A,d,dir}},
    exits:arms.slice(i+1).concat(arms.slice(0,i)).map(k=>roadDestination(k.A.r,k.end?-1:1))};
  });
  return {x:ox,z:oz,y:o.F[0].y+Y.raised,radius:rad,entries};
 });
 const d5=roads.find(o=>o.r.id==='city-d5-west');
 if(d5){
  const gate=nearestOn(d5.F,D5_MOUTH.x,D5_MOUTH.z);
  for(const dir of [1,-1])approachSign(d5,gate.d-dir*26,dir,[row(d5,1,Math.sign(gate.lat)===dir?'left':'right')]);
 }
 for(const o of roads)if(o.r.turningRadius){
  approachSign(o,headProfile(o.r,o.P,o.F).start-3,-1,[row(o,-1,'ahead')]);
 }
 g.userData.directionSigns=directionSigns;
 g.userData.controls=controls;g.userData.planters=planters;
 // Crossings: dropped kerb and yellow blister tactile at each end. Signal crossings (crossroads) add the two stud rows and
 // the yellow stripes (RM1075 / RM1076, TPDM V3 Diag 5.7.3.1); roundabout approaches have directional warnings at their landings.
 const crossings=[];
 for(const {r,P,F} of roads)for(const d of r.crossings||[]){const h=P.carriageway/2,f=frameAt(F,d),signal=(r.signalCrossings||[]).includes(d);crossings.push({road:r.id,d,f,half:h,kind:signal?'signal':'cautionary'});
  const pen=r.staggers.get(d);
  for(const side of [-1,1]){
   const landing=pen?.centre(side)??d;
   strip(out,mats.tactile||M.buff,F,landing-1.5,landing+1.5,side*(h+.3),side*(h+.9),(a,l)=>streetLevel(r,a,l)+.012);
  }
  const medianHalf=refugeCrossings.has(r.id+'@'+d)?P.median/2:0;
  if(medianHalf){
   // Follow both slopes of the crowned street through the pedestrian openings.
   const floor=(a,l)=>streetLevel(r,a,l)+.006,tiles=(a,l)=>streetLevel(r,a,l)+.012;
   for(const side of [-1,1])strip(out,mats.channel||M.grey,F,pen?pen.lo-.1:d-1.75,pen?pen.hi+.1:d+1.75,0,side*medianHalf,floor);
   for(const [a,b] of warningBands(P.median))for(const [lo,hi] of [[a,Math.min(0,b)],[Math.max(0,a),b]]){
    const landing=pen?.centre(Math.sign(lo+hi))??d;
    if(hi>lo)strip(out,mats.tactile||M.buff,F,landing-1.65,landing+1.65,lo,hi,tiles);
   }
  }
  if(pen){
   const floor=(a,l)=>{const p=spot({r,F},a,l,.006);return new T.Vector3(p.x,p.y,p.z);};
   // The brick median meets the entire rear face of the refuge. Only the junction-facing end is rounded.
   const dir=Math.sign(pen.outgoing-pen.incoming),join=pen.outgoing+dir*2.25;
   const arc=join+dir*1.8,tip=arc+dir*pen.half;
   if(signal&&!r.midblocks.includes(d))median({r,F},Math.min(join,tip),Math.max(join,tip),P.median,dir>0,dir<0,mats.channel||M.grey);
   // Close the small level change between the road-level waiting area and each raised end.
   for(const d of [join,pen.incoming-dir*2.25]){
    const points=[],f=frameAt(F,d);
    for(const lat of [-pen.half+.125,0,pen.half-.125]){
     const base=floor(d,lat),top=f.y+streetLevel(r,d,pen.half)+(f.crossSlope||0)*lat+.15;
     points.push(base.x,base.y,base.z,base.x,top,base.z);
    }
    out.raw(M.kerb,points,[0,1,2,2,1,3,2,3,4,4,3,5]);
   }
   const nose=frameAt(F,arc),setback=dir*.4*pen.half;
   refugeBollards.push({x:nose.x+nose.tx*setback,z:nose.z+nose.tz*setback,
    y:spot({r,F},r.midblocks.includes(d)?arc+setback:arc,pen.half,.15).y,yaw:Math.atan2(dir*nose.tx,dir*nose.tz)});
   staggerKerbs(pen,floor,addKerb);
   for(const rail of pen.rails)refugeRails.push(rail.map(([a,l])=>floor(a,l)));
  }
  if(!signal)continue;
  const mk=signalCrossingMarkings({at:d,width:3.2,roadWidth:2*h,edgeMargin:.5});
  for(const [marks,mat,lift] of [[mk.bars,M.yellow,.01],[mk.studs,M.white,.014]]){
   for(const b of marks)if(!medianHalf||Math.abs(b.z)-b.d/2>=medianHalf){
    const x=b.x+(pen?pen.centre(Math.sign(b.z))-d:0);
    strip(out,mat,F,x-b.w/2,x+b.w/2,b.z-b.d/2,b.z+b.d/2,(a,l)=>streetLevel(r,a,l)+lift);}
  }
 }
 // Each signed run supplies the exact endpoints for its 100 mm kerb stripes.
 const hidesMap=mapSightline(g.userData.roundabouts);
 const stops=planBusStops(edges,e=>presetOf(e.road).median>0,hidesMap);
 const zones=planKerbZones([...edges,...islandKerbs],stops,controls,hidesMap);
 for(const zone of zones)for(const [lo,hi,near,far] of kerbPaint(zone)){
  const n=Math.ceil(hi-lo),point=(p,o)=>[p.x-p.nx*o,p.base+.012+.025*o,p.z-p.nz*o];
  const paintPoint=zone.paintPoint||zone.edge.point;
  let a=paintPoint(lo);
  for(let i=1;i<=n;i++){
   const b=paintPoint(lo+(hi-lo)*i/n);
   up(M.yellow,[point(a,near),point(b,near),point(b,far),point(a,far)]);
   a=b;
  }
 }
 g.userData.busStops=stops;g.userData.kerbZones=zones;
 g.userData.crossings=crossings;g.userData.refugeRails=refugeRails;g.userData.refugeBollards=refugeBollards;
 // Road-end roundabouts share their site footprint with the former turning heads.
 // Reserve the complete disc in networkMask as well, so scenery cannot grow through it.
 g.userData.turningIslands=[];
 for(const {r,P,F} of roads){if(!(r.turningRadius>0))continue;const f=F.at(-1),h=r.turningRadius,w=h+P.footpath,N=64;
  const {length,point,bend}=headProfile(r,P,F);
  if(r.standard==='sandbox'){addKerb(length,point);edges.push({road:r,kind:'corner',turningHead:true,length,point});}
  const rim=(p,d,y)=>[p.x+p.nx*d,y,p.z+p.nz*d];
  const drawSegment=(a,b)=>{
   const p=point(a),q=point(b),inner=r.standard==='sandbox'?.125:0;
   const road=f.y+Y.road;
   up(M.road,[[f.x,road,f.z],rim(p,0,road),rim(q,0,road)]);
   up(M[r.footway||'red'],[rim(p,inner,p.y),rim(q,inner,q.y),rim(q,P.footpath,q.y+.025*(P.footpath-inner)),rim(p,P.footpath,p.y+.025*(P.footpath-inner))]);
   if(r.standard==='sandbox')up(mats.channel||M.kerb,[rim(p,-.3,road+.002),rim(q,-.3,road+.002),rim(q,0,road+.002),rim(p,0,road+.002)]);
  };
  for(const [a,b] of [[0,bend],[bend,length-bend],[length-bend,length]]){
   const steps=Math.ceil((b-a)/.7);
   for(let i=0;i<steps;i++)drawSegment(a+(b-a)*i/steps,a+(b-a)*(i+1)/steps);
  }
  // Close the fan at the throat, under the crowned approach carriageway.
  up(M.road,[[f.x,f.y+Y.road,f.z],rim(point(0),0,f.y+Y.road),rim(point(length),0,f.y+Y.road)]);
  const {style,radius}=turningIsland(r,P),raised=style!=='painted',y=f.y+(raised?Y.raised:Y.road+.014);
  const polar=(a,rad,level=y)=>[f.x+rad*Math.cos(a),level,f.z+rad*Math.sin(a)];
  const band=(m,a,b,inner,outer,level)=>up(m,[polar(a,inner,level),polar(a,outer,level),polar(b,outer,level),polar(b,inner,level)]);
  for(let i=0;i<N;i++){
   const a=i*2*Math.PI/N,b=(i+1)*2*Math.PI/N;
   const inner=style==='planted'?radius-.52:radius;
   up(raised?(style==='planted'?M.grass:M.buff):M.white,[polar(a,0),polar(a,inner),polar(b,inner)]);
   if(style==='planted')band(M.red,a,b,inner,radius,y);
   if(raised)band(M.white,a,b,radius+.21,radius+.34,f.y+Y.road+.014);
  }
  if(raised)addKerb(2*Math.PI*radius,t=>{
   const a=t/radius,[x,,z]=polar(a,radius);
   return {x,z,nx:-Math.cos(a),nz:-Math.sin(a),y,base:f.y+Y.road};
  });
  {
   // Three clockwise arrows. Keep the mini-roundabout symbol compact and put the larger islands' arrows in the circulating lane.
   const arrowR=raised?(radius+h)/2:radius+1.75,ink=f.y+Y.road+.016,orientation=Math.atan2(-f.tz,-f.tx);
   const sweep=raised?4/arrowR:1.08;
   for(let i=0;i<3;i++){
    const a=orientation+i*2*Math.PI/3;
    for(let j=0;j<12;j++)band(M.white,a+j*sweep/12,a+(j+1)*sweep/12,arrowR-.13,arrowR+.13,ink);
    const tip=a+sweep;
    up(M.white,[polar(tip,arrowR-.48,ink),polar(tip,arrowR+.48,ink),polar(tip+1.05/arrowR,arrowR,ink)]);
   }
  }
  g.userData.turningIslands.push({road:r.id,x:f.x,z:f.z,y,radius,outerRadius:h,style,yaw:Math.atan2(-f.tx,-f.tz)});
 }
 for(const ar of network.areas||[]){if(ar.pts.length<3)continue;const grass=ar.finish==='grass',dy=grass?Y.grass:Y.area,mat=M[ar.finish]||M.buff;
  // The authored island polygon also reserves this land from development. Its terrain-draped
  // grass would poke through the level kerbed surface we have already built for this ring.
  if(grass&&g.userData.roundabouts.some(i=>pointInPolygon([i.x,i.z],ar.pts)&&ar.pts.every(([x,z])=>Math.hypot(x-i.x,z-i.z)<i.radius)))continue;
  const shape=new T.Shape(ar.pts.map(([x,z])=>new T.Vector2(x,-z)));let geo=new T.ShapeGeometry(shape);geo.rotateX(-Math.PI/2);geo=new TessellateModifier(4,6).modify(geo);
  const p=geo.attributes.position;for(let i=0;i<p.count;i++)p.setY(i,ground(p.getX(i),p.getZ(i))+dy);const idx=geo.index?[...geo.index.array]:[...Array(p.count).keys()];out.raw(mat,[...p.array],idx);
  if(!grass){const ring=ar.pts,cw=ring.reduce((s,a,i)=>{const b=ring[(i+1)%ring.length];return s+a[0]*b[1]-b[0]*a[1];},0)>0;// edge faces facing out
   for(let i=0;i<ring.length;i++){const a=ring[i],b=ring[(i+1)%ring.length],n=Math.max(1,Math.ceil(Math.hypot(b[0]-a[0],b[1]-a[1])/4)),pos=[],ix=[];
    for(let k=0;k<=n;k++){const x=a[0]+(b[0]-a[0])*k/n,z=a[1]+(b[1]-a[1])*k/n,y=ground(x,z);pos.push(x,y-.3,z,x,y+dy,z);if(k){const m=k*2;ix.push(...(cw?[m-2,m-1,m,m-1,m+1,m]:[m-2,m,m-1,m-1,m,m+1]));}}out.raw(M.kerb,pos,ix);}}}
 for(const m of out.meshes('Drawn street network'))g.add(m);g.userData.edges=edges;activeSurface=surfaceSampler(g.children);g.userData.surfaceHeight=activeSurface;
 // On a left-driving divided road the near lane approaches from a footpath reader's
 // right. Facing the same lane from the refuge reverses the instruction and the text.
 if(mats.lookRight&&mats.lookLeft)for(const j of joins){
  if(!j.B.ring||j.crossingD==null)continue;
  const o=j.A,{P,r}=o,pen=r.staggers.get(j.crossingD);
  if(!refugeCrossings.has(r.id+'@'+j.crossingD))continue;
  for(const side of [-1,1]){
   const d=pen?.centre(side)??j.crossingD;
   for(const [material,reader,lat] of [[mats.lookRight,side,P.carriageway/2-1.2],[mats.lookLeft,-side,P.median/2+1.05]]){
    g.add(lookMarkingMesh(material,(across,towardKerb)=>
     paint(o,material,d-reader*across,side*lat+reader*towardKerb,.015)));
   }
  }
 }
 return g;}

// Point tests for the scenery: on a carriageway, anywhere on a drawn street (kerb to kerb plus footpaths), or on a paved area.
export function networkMask(network,ground,roads){
 const useCache=network&&typeof network==='object'&&!roads;
 const gk=ground||DEFAULT_GROUND,sig=useCache?networkSig(network):'';
 if(useCache){
  let byG=maskCache.get(network);if(!byG)maskCache.set(network,byG=new WeakMap());
  const hit=byG.get(gk);if(hit&&hit.sig===sig)return hit.res;
 }
 const g=ground||(()=>0),roadList=roads||(network?.roads||[]).map(r=>({r,P:presetOf(r),F:frames(r,g)}));
 const res=computeNetworkMask(network,g,roadList);
 if(useCache)maskCache.get(network).set(gk,{sig,res});
 return res;
}
function computeNetworkMask(network,ground=()=>0,roads){const samples=[],B=8,map=new Map();
 for(const {r,P,F} of roads){
  for(let i=0;i<F.length;i++){
   const f=F[i],prev=F[i-1]??f,next=F[i+1]??f;
   // Discs around the two ends cover each swept street segment, including between the metre-spaced frames.
   const halfStep=Math.max(Math.hypot(f.x-prev.x,f.z-prev.z),Math.hypot(f.x-next.x,f.z-next.z))/2;
   const h=P.carriageway/2,w=h+P.footpath;
   const bay=r.busLayby,extra=bay?bayDepth(r,bay.side,f.d)/2:0,shift=(bay?.side||0)*extra;
   samples.push({x:f.x+f.lx*shift,z:f.z+f.lz*shift,h:h+extra,w:w+extra,road:r.id,streetRadius:Math.hypot(w+extra,halfStep),roadRadius:Math.hypot(h+extra,halfStep)});
  }
 }
 for(const s of samples){const k=Math.floor(s.x/B)*100003+Math.floor(s.z/B);if(!map.has(k))map.set(k,[]);map.get(k).push(s);}
 const heads=roads.filter(o=>o.r.turningRadius>0&&o.F.length).map(({r,P,F})=>({x:F.at(-1).x,z:F.at(-1).z,h:r.turningRadius,w:r.turningRadius+P.footpath,road:r.id,...turningIsland(r,P)}));
 // Include the asphalt and footway swept out beyond the ordinary road strips at a flared mouth.
 const returns=[];
 if(network?.roads?.some(r=>r.loop))for(const j of junctions(network,ground).joins.filter(j=>j.B.ring)){
  for(const side of [-1,1]){
   const k=corner(j,side);if(!k)continue;
   const xs=k.road.map(p=>p[0]),zs=k.road.map(p=>p[1]);
   returns.push({polygon:k.road,arc:k.arc,foot:Math.max(j.A.P.footpath,j.B.P.footpath),
    x0:Math.min(...xs),x1:Math.max(...xs),z0:Math.min(...zs),z1:Math.max(...zs)});
  }
 }
 for(const {r,P,F} of roads)if(r.turningRadius){
  const {length,point,bend}=headProfile(r,P,F);
  for(const side of [1,-1]){
   const arc=Array.from({length:13},(_,i)=>{const t=bend*i/12,p=point(side>0?t:length-t);return [p.x,p.z];});
   const f=F.at(-1),polygon=[...arc,[f.x,f.z]],xs=polygon.map(p=>p[0]),zs=polygon.map(p=>p[1]);
   returns.push({polygon,arc,foot:P.footpath,x0:Math.min(...xs),x1:Math.max(...xs),z0:Math.min(...zs),z1:Math.max(...zs)});
  }
 }
 const nearReturn=(x,z,r,street)=>returns.some(k=>{
  const reach=r+(street?k.foot:0);
  return x>=k.x0-reach&&x<=k.x1+reach&&z>=k.z0-reach&&z<=k.z1+reach&&circleIntersects(x,z,reach,k.polygon);
 });
 const solidIslands=heads.filter(s=>s.style!=='painted');
 const maxWidth=Math.max(0,...samples.map(s=>s.w));
 const near=(x,z,r,key)=>{if(heads.some(s=>Math.hypot(x-s.x,z-s.z)<s[key]+r)||nearReturn(x,z,r,key==='w'))return true;const reach=Math.ceil((Math.max(0,r)+maxWidth+.5)/B);for(let i=-reach;i<=reach;i++)for(let j=-reach;j<=reach;j++)for(const s of map.get((Math.floor(x/B)+i)*100003+Math.floor(z/B)+j)||[])if(Math.hypot(x-s.x,z-s.z)<s[key]+r+.5)return true;return false;};
 // A frontage may meet its own footway. Buildings, rear courts and plinths reserve the whole street.
 const overlapsStreet=(rect,frontageRoad=null)=>{
  const {c:[x,z],u:[ux,uz],hw,hd}=rect;
  const touches=(cx,cz,radius)=>{
   const dx=cx-x,dz=cz-z;
   const a=Math.max(0,Math.abs(dx*ux+dz*uz)-hw),b=Math.max(0,Math.abs(dz*ux-dx*uz)-hd);
   return a*a+b*b<radius*radius;
  };
  const bound=Math.hypot(hw,hd);
  for(const k of returns){
   const pad=k.foot+.35;
   if(x+bound<k.x0-pad||x-bound>k.x1+pad||z+bound<k.z0-pad||z-bound>k.z1+pad)continue;
   if(pointInPolygon([x,z],k.polygon)||k.arc.some(([px,pz])=>touches(px,pz,pad)))return true;
  }
  for(const h of heads)if(touches(h.x,h.z,h.road===frontageRoad?h.h:h.w))return true;
  const rx=Math.abs(ux)*hw+Math.abs(uz)*hd+maxRadius,rz=Math.abs(uz)*hw+Math.abs(ux)*hd+maxRadius;
  for(let i=Math.floor((x-rx)/B);i<=Math.floor((x+rx)/B);i++)for(let j=Math.floor((z-rz)/B);j<=Math.floor((z+rz)/B);j++){
   for(const s of map.get(i*100003+j)||[])if(touches(s.x,s.z,s.road===frontageRoad?s.roadRadius:s.streetRadius))return true;
  }
  return false;
 };
 const maxRadius=samples.reduce((m,s)=>Math.max(m,s.streetRadius),0);
 const paved=(network?.areas||[]).filter(a=>a.finish!=='grass'&&a.pts.length>2).map(a=>({poly:a.pts,x0:Math.min(...a.pts.map(p=>p[0])),x1:Math.max(...a.pts.map(p=>p[0])),z0:Math.min(...a.pts.map(p=>p[1])),z1:Math.max(...a.pts.map(p=>p[1]))}));
 const areas=(network?.areas||[]).filter(a=>a.pts.length>2);
 const onPaving=(x,z,r=0)=>paved.some(a=>x>=a.x0-r&&x<=a.x1+r&&z>=a.z0-r&&z<=a.z1+r&&circleIntersects(x,z,r,a.poly));
 const onArea=(x,z,r=0)=>areas.some(a=>circleIntersects(x,z,r,a.pts));
 const clearIsland=(x,z,r)=>!solidIslands.some(s=>Math.hypot(x-s.x,z-s.z)<s.radius-r);
 return {overlapsStreet,onDriveSurface:(x,z)=>clearIsland(x,z,0)&&(near(x,z,-.25,'w')||onPaving(x,z)),onRoad:(x,z,r=0)=>near(x,z,r,'h')&&clearIsland(x,z,r),onStreet:(x,z,r=0)=>near(x,z,r,'w'),onPaving,blocked:(x,z,r=0)=>near(x,z,r,'w')||onPaving(x,z,r),buildingBlocked:(x,z,r=0)=>near(x,z,r,'w')||onArea(x,z,r)};}

// SGMTS corridor first: does a road (with its footpaths) or an area outline touch the corridor reserve? Returns the first clash point or null.
let discs=null;
export function reserveClash(pts,{width=0,closed=false}={}){discs??=corridorReserve();const line=[...pts,...(closed?[pts[0]]:[])],test=[];
 for(let i=1;i<line.length;i++){const [ax,az]=line[i-1],[bx,bz]=line[i],n=Math.max(1,Math.ceil(Math.hypot(bx-ax,bz-az)/2));for(let k=0;k<=n;k++)test.push([ax+(bx-ax)*k/n,az+(bz-az)*k/n]);}
 if(line.length===1)test.push(line[0]);
 for(const [x,z] of test)for(const d of discs)if(Math.hypot(x-d.x,z-d.z)<d.r+width)return [x,z];return null;}

// Lower the ground beneath graded streets, including the 8 m terrain-grid apron.
// Junction frames use the same flattened levels as the rendered pavement.
export function streetTerrain(network,ground){
 const cells=new Map(),B=16;
 for(const {r,F} of junctions(network,ground).roads)for(const f of F){const w=(r.turningRadius&&f===F.at(-1)?r.turningRadius+presetOf(r).footpath:halfWidth(r))+12;
  for(let x=Math.floor((f.x-w)/B);x<=Math.floor((f.x+w)/B);x++)for(let z=Math.floor((f.z-w)/B);z<=Math.floor((f.z+w)/B);z++){const key=x+','+z;if(!cells.has(key))cells.set(key,[]);cells.get(key).push({f,w});}}
 return (x,z,y)=>{for(const {f,w} of cells.get(Math.floor(x/B)+','+Math.floor(z/B))||[])if((x-f.x)**2+(z-f.z)**2<w*w)y=Math.min(y,f.y-.3);return y;};
}
