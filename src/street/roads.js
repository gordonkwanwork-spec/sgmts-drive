// Road registry for street furniture (public/street/furniture.json). Every road has a parameter p (corridor-based
// roads: the corridor distance s; others: metres along the road), a displayed chainage ch, and a frame at p.
// Placement: side 'L' is +lateral (left in the direction of increasing chainage); off is measured outward from the
// kerb (ref 'kerb', default) or from the centreline (ref 'centre'); y = road surface at that point + dy.
import {sample,LENGTH,toChainage,fromChainage,roadSection,footpathHeight,JUNCTIONS,UNDERPASSES,sideCrossing,crossingAxes,crossingGeometry,LOOP,cycleSample,cycleBridgeHeight,project,CYCLE_WIDTH} from '../alignment.js';
import {depotCurve} from '../routes.js';
import {CV_ROAD,CV_ROAD_WIDTH} from '../depot.js';
import {presetOf,frames as networkFrames,frameAt,junctions as networkJunctions,streetLevel,Y as NET_Y} from './network.js';

const FOOTPATH=3.75,RAISED=.18;
const frameOf=(x,y,z,tx,tz,groundY=y)=>{const n=Math.hypot(tx,tz)||1;tx/=n;tz/=n;return {x,y,z,groundY,tx,tz,lx:tz,lz:-tx,heading:Math.atan2(-tx,-tz)};};
const flatSurface=(yAt,half)=>(p,lat)=>yAt(p)+(Math.abs(lat)>half(p)&&Math.abs(lat)<=half(p)+FOOTPATH?RAISED:0);
const same=x=>x;

const corridor={id:'corridor',name:'SGMTS corridor',p0:0,p1:LENGTH,toCh:toChainage,toParam:fromChainage,frame:sample,
 kerb:s=>roadSection(s).right,
 surface(s,lat){const r=sample(s);if(r.elevated||Math.abs(lat)<=roadSection(s).right)return r.y;return r.groundY+(Math.abs(lat)<=roadSection(s).right+FOOTPATH?footpathHeight(s):0);}};
const cycleway={id:'cycleway',name:'Cycle track',p0:0,p1:LENGTH,toCh:toChainage,toParam:fromChainage,frame:s=>{const c=cycleSample(s);return {...c,y:c.groundY+cycleBridgeHeight(s)};},
 kerb:()=>CYCLE_WIDTH/2,surface:s=>cycleSample(s).groundY+cycleBridgeHeight(s)};
// Crossing roads run straight through each junction/underpass centre along the corridor's lateral axis.
const crossings=[...JUNCTIONS,...UNDERPASSES].map(j=>{const {r,C,u}=crossingAxes(j),y0=C.y,k=Math.sin(j.skew*Math.PI/180),rise=j.underpass?0:r.grade*k;
 return {id:(j.underpass?'U':'J')+j.c,name:`${j.name} ${j.underpass?'underpass':'junction'} (Ch ${j.c})`,p0:-j.extent,p1:j.extent,toCh:p=>p+j.extent,toParam:ch=>ch-j.extent,
  frame:d=>frameOf(C.x+u.x*d,y0+rise*d,C.z+u.z*d,u.x,u.z),kerb:()=>j.halfWidth,
  surface:(d,lat)=>y0+rise*d+(j.underpass?0:-r.grade*Math.cos(j.skew*Math.PI/180)*lat)+(Math.abs(lat)>j.halfWidth&&Math.abs(lat)<=j.halfWidth+FOOTPATH||Math.abs(lat)<j.median/2?RAISED:.03)};});
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
export const ROADS=[corridor,cycleway,...crossings,curveRoad('depot','Depot approach',depotCurve,3.5),polylineRoad('service','Depot service road',CV_FRAME,CV_ROAD_WIDTH/2),loop];
export const ROAD=Object.fromEntries(ROADS.map(r=>[r.id,r]));
const clampP=(road,p)=>Math.min(road.p1,Math.max(road.p0,p));

// Lateral offset from the centreline for a side/ref/off triple.
export function lateralOf(road,p,side,ref,off){const s=side==='R'?-1:1;return s*(ref==='centre'?off:road.kerb(p)+off);}
// World pose of an item (or a run point at chainage ch): position, yaw (radians) and the road frame.
export function pose(item,ch=item.ch){const road=ROAD[item.road];if(!road)throw Error('Unknown road '+item.road);return poseAt(item,road.toParam(ch));}
export function poseAt(item,param){const road=ROAD[item.road],p=clampP(road,param),f=road.frame(p),lat=lateralOf(road,p,item.side,item.ref,item.off||0);
 return {x:f.x+f.lx*lat,y:road.surface(p,lat)+(item.dy||0),z:f.z+f.lz*lat,yaw:f.heading+(item.rot||0)*Math.PI/180,f,p,lat,road,s:road.id==='corridor'||road.id==='cycleway'?p:project(f.x+f.lx*lat,f.z+f.lz*lat)};}

// Nearest parameter on one road to (x,z): coarse table then Newton steps along the tangent.
const tables=new Map();
function table(road){if(!tables.has(road.id)){const n=Math.max(8,Math.ceil((road.p1-road.p0)/2)),t=[];for(let i=0;i<=n;i++){const p=road.p0+(road.p1-road.p0)*i/n,f=road.frame(p);t.push({p,x:f.x,z:f.z});}tables.set(road.id,t);}return tables.get(road.id);}
export function nearest(road,x,z,guess){let p=guess;if(p==null){let best=Infinity;for(const q of table(road)){const d=(q.x-x)**2+(q.z-z)**2;if(d<best){best=d;p=q.p;}}}
 // Converges by the ratio lateral/radius per step: points deep inside a tight curve (the A1 island) need more than a few.
 for(let i=0;i<40;i++){const f=road.frame(p),step=(x-f.x)*f.tx+(z-f.z)*f.tz;p=clampP(road,p+step);if(Math.abs(step)<1e-5)break;}
 const f=road.frame(p),lat=(x-f.x)*f.lx+(z-f.z)*f.lz,along=(x-f.x)*f.tx+(z-f.z)*f.tz;return {road,p,f,lat,dist:Math.hypot(lat,along)};}
// Drawn roads (street/network.js) join the registry so furniture places on them like any game road: chainage = metres from the
// first point, kerb = carriageway edge (centreline for a footpath-only route). Call again after every edit.
const netIds=new Set();
export function setNetwork(network,ground){
 for(const id of netIds){delete ROAD[id];const i=ROADS.findIndex(r=>r.id===id);if(i>=0)ROADS.splice(i,1);tables.delete(id);}netIds.clear();
 for(const {r,P,F} of networkJunctions(network,ground).roads){if(F.length<2)continue;const h=P.carriageway/2,at=d=>frameAt(F,d);
  const entry={id:r.id,name:r.name||`${P.short} ${r.id}`,drawn:true,p0:0,p1:F.at(-1).d,toCh:same,toParam:same,frame:d=>{const f=at(d);return frameOf(f.x,f.y,f.z,f.tx,f.tz);},kerb:()=>h,
   surface:(d,lat)=>{const a=Math.abs(lat);const f=at(d);return f.y+(f.crossSlope||0)*lat+(a<=h&&P.median&&a<=P.median/2?NET_Y.raised:a<=h+P.footpath?streetLevel(r,d,lat):0);}};
  ROADS.push(entry);ROAD[r.id]=entry;netIds.add(r.id);}}
// Road, chainage and lateral offset nearest to a world point; roadId locks the search to one road.
export function locate(x,z,roadId){let best=null;for(const road of roadId?[ROAD[roadId]]:ROADS){const n=nearest(road,x,z);if(Math.abs(n.lat)>60&&!roadId)continue;if(!best||n.dist<best.dist)best=n;}return best&&{...best,ch:best.road.toCh(best.p)};}

// Record for a world placement on a given road: used by the seed and by editor drags.
const round=(v,k=1000)=>Math.round(v*k)/k;
export function record(roadId,x,y,z,yaw,{ref='kerb',guess}={}){const road=ROAD[roadId],n=nearest(road,x,z,guess),side=n.lat>=0?'L':'R',abs=Math.abs(n.lat);
 const off=ref==='centre'?abs:abs-road.kerb(n.p);let rot=((yaw-n.f.heading)*180/Math.PI)%360;if(rot>180)rot-=360;if(rot<=-180)rot+=360;
 return {road:roadId,ch:round(road.toCh(n.p)),side,ref,off:round(off),rot:round(rot,100),dy:round(y-road.surface(n.p,n.lat))};}

// HK junction signals (after the TD layout diagram), per approach, with left-hand traffic: primary just past the stop line on the
// driver's nearside kerb, an offside primary on a central median, and a secondary beyond the junction on the nearside, all facing
// the approaching traffic. Pedestrian heads stand at both ends of every crossing on its junction side, facing across it; a
// secondary carries the pedestrian head of the crossing beside it. World positions follow the solved (skewed) junction geometry.
export function junctionSignalItems(){const items=[],yawOf=w=>Math.atan2(-w.x,-w.z),norm=a=>((a*180/Math.PI+540)%360)-180;
 for(const j of JUNCTIONS){const g=crossingGeometry(j),{C,u,n}=g,h=j.halfWidth,k=Math.sin(j.skew*Math.PI/180);
  const add=(id,p,y,face,toRoad,axis,{ped,crossing}={})=>{const yaw=yawOf(face),X={x:Math.cos(yaw),z:-Math.sin(yaw)},hand=axis!=='pedestrian'&&X.x*toRoad.x+X.z*toRoad.z<0?-1:1;
   const params={junction:j.c,axis,...(hand<0?{hand}:{}),...(ped?{pedYaw:norm(yawOf(ped)-yaw)}:{}),...(crossing?{crossing}:{})};
   items.push({id:`signal-${j.c}-${id}`,type:'traffic_signal',...record('corridor',p.x,y,p.z,yaw,{guess:project(p.x,p.z,j.s)}),params});};
  const kerbPole=(q,lat)=>{const r=sample(q),o=lat*(roadSection(q).right+.95);return [{x:r.x+r.lx*o,z:r.z+r.lz*o},r.y+footpathHeight(q),{x:-lat*r.lx,z:-lat*r.lz},{x:r.lx*lat,z:r.lz*lat}];};
  const armPole=(d,e)=>[{x:C.x+u.x*d+n.x*e,z:C.z+u.z*d+n.z*e},sample(j.s+d*k).y+.18];
  for(const τ of [1,-1]){// ART approach travelling τ along s, in the lateral-τ lane
   const t={x:sample(j.s).tx*τ,z:sample(j.s).tz*τ},face={x:-t.x,z:-t.z};
   let [p,y,toRoad,across]=kerbPole(g.crossS[-τ]-τ*2.8,τ);add(`corridor-${τ}-primary`,p,y,face,toRoad,'corridor');
   [p,y,toRoad,across]=kerbPole(g.crossS[τ]-τ*2.1,τ);add(`corridor-${τ}-secondary`,p,y,face,toRoad,'corridor',{ped:{x:-across.x,z:-across.z}});
   [p,y,toRoad,across]=kerbPole(g.crossS[-τ]+τ*2.1,τ);add(`corridor-${τ}-pedestrian`,p,y,{x:-across.x,z:-across.z},toRoad,'pedestrian');}
  for(const σ of [1,-1]){// side approach from arm σ travelling −σ·u, keeping left on the σ side of the road
   const face={x:u.x*σ,z:u.z*σ},near=Math.abs(g.crossD[σ]),far=Math.abs(g.staggers[-σ]?.outgoing??g.crossD[-σ]),kerbToRoad={x:-n.x*σ,z:-n.z*σ};
   let [p,y]=armPole(σ*(near+2.3),σ*(h+.95));add(`side-${σ}-primary`,p,y,face,kerbToRoad,'side');
   if(j.median>=2){[p,y]=armPole(σ*(near+2.3),0);add(`side-${σ}-median`,p,y,face,{x:n.x*σ,z:n.z*σ},'side');}
   [p,y]=armPole(-σ*(far-2.1),σ*(h+.95));add(`side-${σ}-secondary`,p,y,face,kerbToRoad,'side',{ped:{x:-n.x*σ,z:-n.z*σ},crossing:'side'});
   [p,y]=armPole(σ*(near-2.1),σ*(h+.95));add(`side-${σ}-pedestrian`,p,y,{x:-n.x*σ,z:-n.z*σ},kerbToRoad,'pedestrian',{crossing:'side'});
   const pen=g.staggers[σ];if(pen)for(const side of [-1,1]){
    const at=pen.centre(side),away=at===Math.min(pen.incoming,pen.outgoing)?-1:1;
    const e=side*(pen.half-.35),d=at+away*1.85;
    const [p,y]=armPole(d,e),facing={x:n.x*side,z:n.z*side};
    add(`side-${σ}-refuge-${side}`,p,y-.144,facing,facing,'pedestrian',{crossing:'side'});
   }
  }
 }
 return items;
}
