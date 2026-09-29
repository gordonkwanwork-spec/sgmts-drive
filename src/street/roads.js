// Road registry for street furniture (public/street/furniture.json). Every road has a parameter p (corridor-based
// roads: the corridor distance s; others: metres along the road), a displayed chainage ch, and a frame at p.
// Placement: side 'L' is +lateral (left in the direction of increasing chainage); off is measured outward from the
// kerb (ref 'kerb', default) or from the centreline (ref 'centre'); y = road surface at that point + dy.
import {sample,LENGTH,toChainage,fromChainage,roadSection,footpathHeight,JUNCTIONS,UNDERPASSES,sideCrossing,L35,l35Offset,l35Ground,D1ROAD,LOOP,cycleSample,cycleBridgeHeight,project,CYCLE_WIDTH} from '../alignment.js';
import {l35BendCurve,depotCurve} from '../routes.js';
import {CV_ROAD,CV_ROAD_WIDTH} from '../depot.js';

const FOOTPATH=3.75,RAISED=.3;
const frameOf=(x,y,z,tx,tz,groundY=y)=>{const n=Math.hypot(tx,tz)||1;tx/=n;tz/=n;return {x,y,z,groundY,tx,tz,lx:tz,lz:-tx,heading:Math.atan2(-tx,-tz)};};
const flatSurface=(yAt,half)=>(p,lat)=>yAt(p)+(Math.abs(lat)>half(p)&&Math.abs(lat)<=half(p)+FOOTPATH?RAISED:0);
const same=x=>x;

const corridor={id:'corridor',name:'SGMTS corridor',p0:0,p1:LENGTH,toCh:toChainage,toParam:fromChainage,frame:sample,
 kerb:s=>roadSection(s).right,
 surface(s,lat){const r=sample(s);if(r.elevated||Math.abs(lat)<=roadSection(s).right)return r.y;return r.groundY+(Math.abs(lat)<=roadSection(s).right+FOOTPATH?footpathHeight(s):0);}};
const cycleway={id:'cycleway',name:'Cycle track',p0:0,p1:LENGTH,toCh:toChainage,toParam:fromChainage,frame:s=>{const c=cycleSample(s);return {...c,y:c.groundY+cycleBridgeHeight(s)};},
 kerb:()=>CYCLE_WIDTH/2,surface:s=>cycleSample(s).groundY+cycleBridgeHeight(s)};
// L35 runs beside the corridor (same chainage) up to its bend towards D3; its frame keeps the corridor's axes.
const L35_BEND=fromChainage(3310);
const l35={id:'L35',name:'Road L35',p0:L35.start,p1:L35_BEND,toCh:toChainage,toParam:fromChainage,
 frame(s){const r=sample(s),o=-l35Offset(s),y=l35Ground(s);return {...r,x:r.x+r.lx*o,z:r.z+r.lz*o,y,groundY:y};},
 kerb:()=>L35.width/2,surface:flatSurface(l35Ground,()=>L35.width/2)};
// Crossing roads run straight through each junction/underpass centre along the corridor's lateral axis.
const crossings=[...JUNCTIONS,...UNDERPASSES].map(j=>{const r=sample(j.s),y0=j.underpass?r.groundY:r.y;
 return {id:(j.underpass?'U':'J')+j.c,name:`${j.name} ${j.underpass?'underpass':'junction'} (Ch ${j.c})`,p0:-j.extent,p1:j.extent,toCh:p=>p+j.extent,toParam:ch=>ch-j.extent,
  frame:d=>frameOf(r.x+r.lx*d,y0,r.z+r.lz*d,r.lx,r.lz),kerb:()=>j.halfWidth,
  surface:(d,lat)=>y0+(j.underpass?0:r.grade*lat)+(Math.abs(lat)>j.halfWidth&&Math.abs(lat)<=j.halfWidth+FOOTPATH?RAISED:0)};});
// Tangents blend between vertices so every nearby point has a unique perpendicular foot (no gaps at the corners).
function polylineRoad(id,name,pts,half){const run=[0];for(let i=1;i<pts.length;i++)run.push(run[i-1]+Math.hypot(pts[i].x-pts[i-1].x,pts[i].z-pts[i-1].z));
 const tan=pts.map((_,i)=>{const a=pts[Math.max(0,i-1)],b=pts[Math.min(pts.length-1,i+1)],n=Math.hypot(b.x-a.x,b.z-a.z)||1;return {x:(b.x-a.x)/n,z:(b.z-a.z)/n};});
 const at=d=>{let i=1;while(i<pts.length-1&&run[i]<d)i++;const a=pts[i-1],b=pts[i],u=(d-run[i-1])/(run[i]-run[i-1]||1);return frameOf(a.x+(b.x-a.x)*u,a.y+(b.y-a.y)*u,a.z+(b.z-a.z)*u,tan[i-1].x+(tan[i].x-tan[i-1].x)*u,tan[i-1].z+(tan[i].z-tan[i-1].z)*u);};
 return {id,name,p0:0,p1:run.at(-1),toCh:same,toParam:same,frame:at,kerb:()=>half,surface:flatSurface(d=>at(d).y,()=>half)};}
function curveRoad(id,name,curve,half){const len=curve.getLength(),at=d=>{const u=Math.min(1,Math.max(0,d/len)),p=curve.getPointAt(u),t=curve.getTangentAt(u);return frameOf(p.x,p.y,p.z,t.x,t.z);};
 return {id,name,p0:0,p1:len,toCh:same,toParam:same,frame:at,kerb:()=>half,surface:flatSurface(d=>at(d).y,()=>half)};}
const loop={id:'loop',name:'A1 terminal loop',p0:0,p1:LOOP.length,toCh:same,toParam:same,frame:d=>{const p=LOOP.sample(d);return frameOf(p.x,p.y,p.z,p.tx,p.tz);},
 kerb:()=>(LOOP.outerRadius-LOOP.innerRadius)/2,surface:()=>LOOP.y};

// Depot service road centreline at 2 m stations, smoothed (shared with its surface in environment.js).
export const CV_FRAME=(()=>{const pts=[];for(let i=1;i<CV_ROAD.length;i++){const a=CV_ROAD[i-1],b=CV_ROAD[i],n=Math.max(1,Math.ceil(Math.hypot(b.x-a.x,b.z-a.z)/2));for(let j=i>1?1:0;j<=n;j++){const t=j/n;pts.push({x:a.x+(b.x-a.x)*t,z:a.z+(b.z-a.z)*t,y:a.y+(b.y-a.y)*t});}}
 const smooth=pts.map((p,i)=>{if(!i||i===pts.length-1)return p;let x=0,z=0,w=0;for(let k=Math.max(0,i-4);k<=Math.min(pts.length-1,i+4);k++){x+=pts[k].x;z+=pts[k].z;w++;}return {...p,x:x/w,z:z/w};});
 return smooth.map((p,i)=>{const a=smooth[Math.max(0,i-1)],b=smooth[Math.min(smooth.length-1,i+1)],dx=b.x-a.x,dz=b.z-a.z,n=Math.hypot(dx,dz)||1;return {...p,tx:dx/n,tz:dz/n,lx:dz/n,lz:-dx/n};});})();
export const ROADS=[corridor,cycleway,l35,...crossings,polylineRoad('D1','Road D1',D1ROAD,9),curveRoad('L35-bend','Road L35 bend',l35BendCurve,L35.width/2),curveRoad('depot','Depot approach',depotCurve,3.5),polylineRoad('service','Depot service road',CV_FRAME,CV_ROAD_WIDTH/2),loop];
export const ROAD=Object.fromEntries(ROADS.map(r=>[r.id,r]));
const clampP=(road,p)=>Math.min(road.p1,Math.max(road.p0,p));

// Lateral offset from the centreline for a side/ref/off triple.
export function lateralOf(road,p,side,ref,off){const s=side==='R'?-1:1;return s*(ref==='centre'?off:road.kerb(p)+off);}
// World pose of an item (or a run point at chainage ch): position, yaw (radians) and the road frame.
export function pose(item,ch=item.ch){const road=ROAD[item.road];if(!road)throw Error('Unknown road '+item.road);return poseAt(item,road.toParam(ch));}
export function poseAt(item,param){const road=ROAD[item.road],p=clampP(road,param),f=road.frame(p),lat=lateralOf(road,p,item.side,item.ref,item.off||0);
 return {x:f.x+f.lx*lat,y:road.surface(p,lat)+(item.dy||0),z:f.z+f.lz*lat,yaw:f.heading+(item.rot||0)*Math.PI/180,f,p,lat,road,s:road.id==='corridor'||road.id==='cycleway'||road.id==='L35'?p:project(f.x+f.lx*lat,f.z+f.lz*lat)};}

// Nearest parameter on one road to (x,z): coarse table then Newton steps along the tangent.
const tables=new Map();
function table(road){if(!tables.has(road.id)){const n=Math.max(8,Math.ceil((road.p1-road.p0)/2)),t=[];for(let i=0;i<=n;i++){const p=road.p0+(road.p1-road.p0)*i/n,f=road.frame(p);t.push({p,x:f.x,z:f.z});}tables.set(road.id,t);}return tables.get(road.id);}
export function nearest(road,x,z,guess){let p=guess;if(p==null){let best=Infinity;for(const q of table(road)){const d=(q.x-x)**2+(q.z-z)**2;if(d<best){best=d;p=q.p;}}}
 for(let i=0;i<6;i++){const f=road.frame(p),step=(x-f.x)*f.tx+(z-f.z)*f.tz;p=clampP(road,p+step);if(Math.abs(step)<1e-5)break;}
 const f=road.frame(p),lat=(x-f.x)*f.lx+(z-f.z)*f.lz,along=(x-f.x)*f.tx+(z-f.z)*f.tz;return {road,p,f,lat,dist:Math.hypot(lat,along)};}
// Road, chainage and lateral offset nearest to a world point; roadId locks the search to one road.
export function locate(x,z,roadId){let best=null;for(const road of roadId?[ROAD[roadId]]:ROADS){const n=nearest(road,x,z);if(Math.abs(n.lat)>60&&!roadId)continue;if(!best||n.dist<best.dist)best=n;}return best&&{...best,ch:best.road.toCh(best.p)};}

// Record for a world placement on a given road: used by the seed and by editor drags.
const round=(v,k=1000)=>Math.round(v*k)/k;
export function record(roadId,x,y,z,yaw,{ref='kerb',guess}={}){const road=ROAD[roadId],n=nearest(road,x,z,guess),side=n.lat>=0?'L':'R',abs=Math.abs(n.lat);
 const off=ref==='centre'?abs:abs-road.kerb(n.p);let rot=((yaw-n.f.heading)*180/Math.PI)%360;if(rot>180)rot-=360;if(rot<=-180)rot+=360;
 return {road:roadId,ch:round(road.toCh(n.p)),side,ref,off:round(off),rot:round(rot,100),dy:round(y-road.surface(n.p,n.lat))};}

// HK junction signals (after the TD layout diagram), per approach, with left-hand traffic:
// primary at the stop line on the driver's left kerb and secondary on the left beyond the junction, both facing the approaching
// traffic; pedestrian heads at both ends of every crossing on its junction side, facing across it. A secondary shares its pole
// with the pedestrian head at that crossing end (as in the site photo); the other crossing ends get a pedestrian-only pole.
// Frame: lat is left of the corridor direction, ds = s − junction s. params.hand −1 mirrors the vehicle head so it hangs over the road.
export function junctionSignalItems(){const items=[];
 for(const j of JUNCTIONS){const r=sample(j.s),w=roadSection(j.s).right,h=j.halfWidth,C=A=>sideCrossing(j,A),k=w+.95,q=h+.95;
  const F={t:0,'-t':Math.PI,l:Math.PI/2,'-l':-Math.PI/2},RIGHT={t:'-l','-t':'l',l:'t','-l':'-t'};
  const add=(id,lat,ds,axis,face,{ped,crossing,road}={})=>{const x=-lat,z=-ds,yaw=F[face],wx=r.x-r.lx*x-r.tx*z,wz=r.z-r.lz*x-r.tz*z,y=r.y-r.grade*z+(Math.abs(lat)===k?footpathHeight(j.s+ds):.3);
   // The head hangs at the pole's local +X, the right of its facing; mirror it (hand −1) so it hangs over the carriageway.
   const hand=road&&RIGHT[face]!==(road==='corridor'?(lat>0?'-l':'l'):(ds>0?'-t':'t'))?-1:1;
   const params={junction:j.c,axis,...(axis!=='pedestrian'&&hand<0?{hand}:{}),...(ped?{pedYaw:((F[ped]-yaw)*180/Math.PI+540)%360-180}:{}),...(crossing?{crossing}:{})};
   items.push({id:`signal-${j.c}-${id}`,type:'traffic_signal',...record('corridor',wx,y,wz,r.heading+yaw,{guess:j.s+ds}),params});};
  for(const d of [1,-1]){const L=d*k;// corridor approach travelling d·t in the lat·d lane
   add(`corridor-${d}-primary`,L,-d*(h+12.8),'corridor',d>0?'-t':'t',{road:'corridor'});
   add(`corridor-${d}-secondary`,L,d*(h+7.9),'corridor',d>0?'-t':'t',{road:'corridor',ped:d>0?'-l':'l'});
   add(`corridor-${d}-pedestrian`,L,-d*(h+7.9),'pedestrian',d>0?'-l':'l');}
  for(const A of [1,-1]){// side approach from the arm at lat sign A, travelling −A·l in the ds·A lane
   add(`side-${A}-primary`,A*(C(A)+2.6),A*q,'side',A>0?'l':'-l',{road:'side'});
   add(`side-${A}-secondary`,-A*(C(-A)-2.1),A*q,'side',A>0?'l':'-l',{road:'side',ped:A>0?'-t':'t',crossing:'side'});
   add(`side-${A}-pedestrian`,A*(C(A)-2.1),A*q,'pedestrian',A>0?'-t':'t',{crossing:'side'});}
  if(j.c===2650){const x=L35.offset+L35.width/2+.8,z=-(h+13.5),wx=r.x-r.lx*x-r.tx*z,wz=r.z-r.lz*x-r.tz*z;
   items.push({id:'signal-2650-L35',type:'traffic_signal',...record('corridor',wx,r.y-r.grade*z+.3,wz,r.heading,{guess:j.s-z}),params:{junction:j.c,axis:'side'}});}
 }
 return items;
}
