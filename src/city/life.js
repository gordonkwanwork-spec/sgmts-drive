import {bayDepth} from '../street/bus-layby.js';
// City rebuild 2 (Gordon, 14 Nov 2026): live traffic over the whole city network, after the sandbox's city-life.js (keep left,
// turns at junctions, queues, cars recycled around the player) but on the game's free-form streets.
//   laneGraph(net, crossings)  lanes along every street between junctions, and a connector for every turn at every junction
//   createTraffic(graph, opts) cars that follow it: queue, give way, hold at signals, U-turn at turning heads, leave at the map edge
// Pure (no three.js): the game draws the cars, src/checks/city-life.test.js drives them headless.
import {circulatingLanes,frameAt,roundaboutLaneShift,streetLevel} from '../street/network.js';

const LANE=3.65,CLEAR=7;// lane width at corridor crossings; lanes stop this far short of a junction's kerb line
const SPEED={distributor:13.9,local:11,service:8,ring:7,turn:5.5,cross:11};// m/s (50 km/h on distributors)

// net: junctions(network,ground) → {roads:[{r,P,F}],joins}. crossings: the six corridor crossings
// [{c,lanes,median,extent,stop:{1,-1} (stop-line distance from the centre on each arm),signal:boolean,C:{x,z},u:{x,z},y(x,z)}].
// Returns {pieces,sources,nodes}. A piece is one lane between junctions or one movement through a junction:
// {id,kind:'lane'|'turn'|'cross'|'uturn',pts:[{x,y,z,s}],len,vmax,next:[piece],node,rule,road,exit:boolean}.
export function laneGraph(net,crossings=[]){const pieces=[],sources=[],nodes=[];
 const piece=(o)=>{let s=0;o.pts.forEach((p,i)=>{if(i)s+=Math.hypot(p.x-o.pts[i-1].x,p.z-o.pts[i-1].z);p.s=s;});const q={id:pieces.length,next:[],len:Math.max(.01,s),...o};pieces.push(q);return q;};
 const lanesOf=P=>P.carriageway>12?2:1,offset=(P,k,loop)=>loop?P.carriageway*((k+.5)/circulatingLanes(P)-.5):P.median/2+(P.carriageway/2-P.median/2)/lanesOf(P)*(k+.5);
 const at=(o,d,lat)=>{
  const f=frameAt(o.F,d),l=lat+Math.sign(lat)*roundaboutLaneShift(o,d);
  // The flared lane continues over the flat junction asphalt beyond the usual kerb position.
  const roadLat=Math.sign(l)*Math.min(Math.abs(l),o.P.carriageway/2);
  return {x:f.x+f.lx*l,y:f.y+streetLevel(o.r,d,roadLat)+(f.crossSlope||0)*l+.05,z:f.z+f.lz*l};
 };
 // Bézier turn from the end of lane a into one of the lanes `outs` (same road and direction; control point where the two
 // headings meet). On a multi-lane approach, left turns leave from the kerb lane into the kerb lane and right turns from the
 // lane by the centre line into its opposite number, so two turns never cross or merge; straight on, lane k keeps lane k.
 const turn=(a,outs,extra)=>{const p0=a.pts.at(-1),p1=a.pts.at(-2)||p0,t0=[p0.x-p1.x,p0.z-p1.z],h=b=>{const q0=b.pts[0],q1=b.pts[1]||q0;return [q1.x-q0.x,q1.z-q0.z];};
  const t=h(outs[0]),side=t0[0]*t[1]-t0[1]*t[0],cos=(t0[0]*t[0]+t0[1]*t[1])/(Math.hypot(...t0)*Math.hypot(...t)||1),dir=(a.road===outs[0].road&&a.road.r.loop)||cos>.9?'straight':side<0?'left':'right';// z south: side < 0 turns left
  const nA=lanesOf(a.road.P);if(extra.node.kind!=='ring'&&!extra.force&&dir!=='straight'&&nA>1&&a.k!==(dir==='left'?nA-1:0))return null;
  const b=extra.to!=null?outs[extra.to]:extra.node.kind==='ring'||dir==='straight'||nA===1?outs[Math.min(a.k,outs.length-1)]:dir==='left'?outs.at(-1):outs[0],q0=b.pts[0],t1=h(b),det=t0[0]*t1[1]-t0[1]*t1[0];
  let c=[(p0.x+q0.x)/2,(p0.z+q0.z)/2];if(Math.abs(det)>1e-3*Math.hypot(...t0)*Math.hypot(...t1)){const k=((q0.x-p0.x)*t1[1]-(q0.z-p0.z)*t1[0])/det;if(k>0&&k<60/Math.hypot(...t0))c=[p0.x+t0[0]*k,p0.z+t0[1]*k];}
  const n=Math.max(4,Math.ceil(Math.hypot(q0.x-p0.x,q0.z-p0.z)/2)),pts=[];for(let i=0;i<=n;i++){const u=i/n,w=1-u;pts.push({x:w*w*p0.x+2*w*u*c[0]+u*u*q0.x,y:p0.y+(q0.y-p0.y)*u,z:w*w*p0.z+2*w*u*c[1]+u*u*q0.z});}
  if(a.road===b.road&&a.road.r.loop){
   // A connector spanning a wide mouth follows its circulating lane, including across the ring seam.
   const {ox,oz}=a.road.ring,start=Math.atan2(p0.z-oz,p0.x-ox),end=Math.atan2(q0.z-oz,q0.x-ox);
   const arc=(end-start+2*Math.PI)%(2*Math.PI),r0=Math.hypot(p0.x-ox,p0.z-oz),r1=Math.hypot(q0.x-ox,q0.z-oz);
   pts.forEach((p,i)=>{const u=i/n,rad=r0+(r1-r0)*u;p.x=ox+Math.cos(start+arc*u)*rad;p.z=oz+Math.sin(start+arc*u)*rad;});
  }
  const {force,to,...rest}=extra,q=piece({kind:'turn',pts,from:a,vmax:dir==='straight'?Math.min(a.vmax,b.vmax):SPEED.turn,dir,...rest});q.next=[b];a.next.push(q);return q;};
 // 1. Nodes along each road: its two ends and every junction where another road joins it.
 const info=new Map();for(const o of net.roads){const L=o.F.at(-1).d,r=o.r,hosted=net.joins.filter(j=>j.B===o).sort((a,b)=>a.at.d-b.at.d),cuts=[];
  for(const j of hosted){const last=cuts.at(-1);if(last&&j.at.d-last.d<5)last.arms.push(j);else cuts.push({d:j.at.d,arms:[j]});}
  const own=end=>net.joins.find(j=>j.A===o&&j.end===end),endKind=end=>(end?r.endTie:r.tie)?'tie':own(end)?'join':end&&r.turningRadius?'head':'edge';
  const list=r.loop?cuts.map(c=>({...c,kind:'host'})):[{d:0,kind:endKind(0)},...cuts.map(c=>({...c,kind:'host'})),{d:L,kind:endKind(1)}];
  for(const n of list)n.clear=n.kind==='host'?Math.max(...n.arms.map(j=>j.A.P.carriageway/2))+CLEAR:n.kind==='join'?own(n.d>0?1:0).B.P.carriageway/2+CLEAR:n.kind==='head'?r.turningRadius+1:0;
  // Queue at the painted Give Way line. A seven-metre setback wastes gaps while
  // the first vehicle drives from the head of the queue to the roundabout.
  for(const end of [0,1]){
   const j=own(end);
   if(!j?.B.ring)continue;
   const sin=Math.abs(j.a[0]*j.at.lx+j.a[1]*j.at.lz)||1;
   (end?list.at(-1):list[0]).entryClear=j.B.P.carriageway/(2*sin)-.25;
  }
  info.set(o,{list,L,vmax:r.loop?SPEED.ring:SPEED[r.preset]||SPEED.local});}
 // 2. Lanes between consecutive nodes, both directions (a roundabout: one way, clockwise = its drawn direction).
 const lane=(o,n0,n1,dir,k)=>{const {vmax,L}=info.get(o),loop=o.r.loop,wrap=loop&&n1.d<=n0.d,span=(wrap?n1.d+L:n1.d)-n0.d;
  let a=n0.d+(dir<0?n0.entryClear??n0.clear:n0.clear),b=n0.d+span-(dir>0?n1.entryClear??n1.clear:n1.clear);if(b-a<1){a=b=n0.d+span/2;a-=.5;b+=.5;}
  const lat=dir*offset(o.P,k,loop),m=Math.max(1,Math.ceil((b-a)/3)),pts=[],ds=[];for(let i=0;i<=m;i++){const d=a+(b-a)*i/m;ds.push(d);pts.push(at(o,loop?(d%L+L)%L:d,lat));}if(dir<0){pts.reverse();ds.reverse();}
  const to=dir>0?n1:n0,q=piece({kind:'lane',pts,vmax,road:o,dir,k,from:dir>0?n0:n1,to});
  let stopD=null;
  if(!loop&&to.kind==='host'&&to.arms.some(j=>j.signal)){const host=to.arms.find(j=>j.host)?.host;if(host)stopD=dir>0?host.lo-3.65:host.hi+3.65;}
  else if(to.kind==='join'){const j=net.joins.find(j=>j.A===o&&j.end===(to.d>0?1:0));if(j?.signal&&j.crossingD!=null)stopD=j.crossingD-dir*3.65;}
  const distanceAt=d=>{
   const end=ds.at(-1),sign=Math.sign(end-ds[0]);
   if((d-ds[0])*sign<=0)return 0;
   if((d-end)*sign>=0)return q.len;
   const i=ds.findIndex((v,k)=>k>0&&(v-d)*sign>=0),u=(d-ds[i-1])/(ds[i]-ds[i-1]);
   return q.pts[i-1].s+(q.pts[i].s-q.pts[i-1].s)*u;
  };
  q.stopS=stopD==null?null:distanceAt(stopD);
  q.walkSignals=(o.r.midblocks||[]).filter(d=>d>a&&d<b).map(d=>({offset:Math.round(d),s:distanceAt((o.r.staggers.get(d)?.centre(dir)??d)-dir*3.65)}));
  return q;};
 for(const o of net.roads){const {list}=info.get(o),loop=o.r.loop,n=loop?circulatingLanes(o.P):lanesOf(o.P);
  const spans=loop?list.map((a,i)=>[a,list[(i+1)%list.length]]):list.slice(1).map((b,i)=>[list[i],b]);
  for(const [n0,n1] of spans)for(let k=0;k<n;k++)for(const dir of loop?[1]:[1,-1]){const l=lane(o,n0,n1,dir,k);(l.from.out??=[]).push(l);(l.to.in??=[]).push(l);}}
 // 3. Junction movements. in/out of a host node are along the host; each arm adds its own approach and exit.
 const armLanes=(j,toward)=>{const {list}=info.get(j.A),n=j.end?list.at(-1):list[0];return (toward?n.in:n.out)||[];};
 const pick=(from,to)=>to[Math.min(from.k,to.length-1)]??to[0],add=(node,t)=>{if(t)node.turns.push(t);};// pick: lane k of a corridor crossing
 // one lane opening onto more: a movement into each (they fan out, so every lane of a dual road is fed); otherwise lane k → lane k
 const fan=(node,a,out,extra)=>{const nA=lanesOf(a.road.P);if(node.kind!=='ring'&&nA===1&&out.length>1)out.forEach((b,k)=>add(node,turn(a,out,{...extra,to:k})));else add(node,turn(a,out,extra));};// lane k goes to lane k (or the nearest one that exists)
 for(const o of net.roads)for(const n of info.get(o).list){if(n.kind==='host'){const node={id:nodes.length,kind:o.r.loop?'ring':n.arms.some(j=>j.signal)?'signal':'priority',x:n.arms[0].at.x,z:n.arms[0].at.z,major:[],minor:[],turns:[],signal:!o.r.loop&&n.arms.some(j=>j.signal),arms:n.arms.length};nodes.push(node);
   const hostIn=n.in||[],hostOut=n.out||[];node.major=hostIn;node.minor=n.arms.flatMap(j=>armLanes(j,true));
   for(const a of hostIn){{const on=hostOut.filter(b=>b.dir===a.dir);if(on.length)add(node,turn(a,on,{node,rule:'major',approach:'major'}));}
    for(const j of n.arms){const out=armLanes(j,false);if(out.length)fan(node,a,out,{node,rule:'major',approach:'major'});}}
   for(const [i,j] of n.arms.entries())for(const a of armLanes(j,true)){const approach=node.signal?'arm'+i:'minor';// at signals each side road has its own stage
    for(const dir of o.r.loop?[1]:[1,-1]){const out=hostOut.filter(b=>b.dir===dir);if(out.length)fan(node,a,out,{node,rule:'minor',approach});}
    for(const j2 of n.arms)if(j2!==j){const out=armLanes(j2,false);if(out.length)fan(node,a,out,{node,rule:'minor',approach});}}
   // a side-road lane that the lane rule left with no movement (two lanes ending on a one-lane road) may still turn
   for(const [i,j] of n.arms.entries())for(const a of armLanes(j,true))if(!a.next.length)for(const dir of o.r.loop?[1]:[1,-1]){const out=hostOut.filter(b=>b.dir===dir);if(out.length)fan(node,a,out,({node,rule:'minor',approach:node.signal?'arm'+i:'minor',force:true}));}
   // a right turn off the major road crosses the oncoming lanes: it gives way to them
   for(const t of node.turns)if(!o.r.loop&&t.rule==='major'&&t.dir==='right'){t.rule='oncoming';if(node.signal)t.waitS=Math.min(4,t.len*.15);}}
  else if(n.kind==='head'){
   const f=o.F.at(-1),outer=o.r.turningRadius-2.6;
   for(const a of n.in||[]){
    const b=n.out.find(l=>l.k===a.k)||n.out[0],rho=Math.max(4,outer-(lanesOf(o.P)-1-a.k)*3.6);
    const at=(forward,left)=>({x:f.x+f.tx*forward+f.lx*left,y:f.y+.08,z:f.z+f.tz*forward+f.lz*left});
    // Blend laterally through the widening mouth. Both ends meet their lanes tangentially.
    const approach=(end,side,t)=>{
     const dx=end.x-f.x,dz=end.z-f.z,d=dx*f.tx+dz*f.tz,lat=dx*f.lx+dz*f.lz;
     const blend=t*t*(3-2*t);
     return at(d*(1-t),lat+(side*rho-lat)*blend);
    };
    const pts=Array.from({length:13},(_,i)=>approach(a.pts.at(-1),1,i/12));
    for(let i=1;i<=24;i++){const angle=i*Math.PI/24;pts.push(at(rho*Math.sin(angle),rho*Math.cos(angle)));}
    for(let i=1;i<=12;i++)pts.push(approach(b.pts[0],-1,1-i/12));
    pts[0]={...a.pts.at(-1)};pts[pts.length-1]={...b.pts[0]};
    const u=piece({kind:'uturn',pts,vmax:4});u.next=[b];a.next.push(u);
   }
  }
  else if(n.kind==='edge'){for(const b of n.out||[])sources.push(b);for(const a of n.in||[])a.exit=true;}}
 // 4. Corridor crossings: straight across between the two arm roads, holding at the stop line while the road phase is red.
 for(const X of crossings){const arm=side=>{for(const o of net.roads){const {list}=info.get(o);if(o.r.tie?.junction===X.c&&o.r.tie.side===side)return list[0];if(o.r.endTie?.junction===X.c&&o.r.endTie.side===side)return list.at(-1);}return null;};
  const node={id:nodes.length,kind:'crossing',crossing:X,x:X.C.x,z:X.C.z,turns:[]};nodes.push(node);
  for(const side of [1,-1]){const A=arm(side),B=arm(-side);if(!A||!B)continue;// travelling from arm `side` to arm −side
   for(const a of A.in||[]){const b=pick(a,B.out||[]);if(!b)continue;const lx=-side*X.u.z,lz=side*X.u.x,off=X.median/2+LANE*(Math.min(a.k,X.lanes-1)+.5),pts=[a.pts.at(-1)];// left of travel (−side·u)
    for(let d=side*(X.extent-4);d*side>-(X.extent-4);d-=side*4){const x=X.C.x+X.u.x*d+lx*off,z=X.C.z+X.u.z*d+lz*off;pts.push({x,y:X.y(x,z)+.08,z});}pts.push(b.pts[0]);
    const q=piece({kind:'cross',pts,vmax:SPEED.cross,node,rule:X.signal?'signal':'free',crossing:X});
    let hold=null;
    if(X.signal){const uDist=p=>((p.x-X.C.x)*X.u.x+(p.z-X.C.z)*X.u.z)*side,stopU=X.stop[side];
     if(uDist(q.pts[0])<=stopU)hold=0;
     else{const i=q.pts.findIndex(p=>uDist(p)<=stopU);if(i>0){const a=q.pts[i-1],b=q.pts[i],ua=uDist(a),ub=uDist(b),t=Math.max(0,Math.min(1,(stopU-ua)/((ub-ua)||-1)));hold=a.s+(b.s-a.s)*t;}else hold=0;}}
    q.hold=hold;q.next=[b];a.next.push(q);node.turns.push(q);}}}
 // Record where an entry actually crosses or merges with a circulating movement. Parallel
 // lanes and vehicles taking the preceding exit can then use the same mouth independently.
 for(const node of nodes.filter(n=>n.kind==='ring')){
  const circulating=node.turns.filter(t=>t.rule==='major');
  for(const entry of node.turns){
   const entering=entry.rule==='minor';
   // An inner-lane exit also crosses the outer circulating stream.
   if(!entering&&(entry.from.k!==0||entry.next[0].road.r.loop))continue;
   entry.conflicts=new Map();
   for(const turn of circulating){
    if(!entering&&(turn.from.k<=entry.from.k||!turn.next[0].road.r.loop))continue;
    const points=[];
    for(const a of entry.pts)for(const b of turn.pts){
     if(Math.hypot(a.x-b.x,a.z-b.z)<3.2)points.push([a.s,b.s]);
    }
    if(points.length)entry.conflicts.set(turn,points);
   }
  }
 }
 return {pieces,sources,nodes};}

// Crossroads stage at a clock time: {stage ('major' | 'arm0' | 'arm1' | null for all-red), left (s to the next change), next}.
// The signal heads (environment.js citySignals) show these; amber is a stage's last 3 s, red + amber the last 2 s before it.
// A signalised T runs two stages (major 30 s, the side road 14 s, 50 s cycle); a crossroads three (63 s).
const STAGES={1:[['major',0,30],['arm0',33,47]],2:[['major',0,26],['arm0',29,43],['arm1',46,60]]},CYCLE={1:50,2:63};
export function midblockStage(offset,clock){
 const t=(clock+offset)%54;
 if(t<30)return {stage:'major',left:30-t};
 if(t<33)return {stage:null,next:'walk',left:33-t};
 if(t<50)return {stage:'walk',left:50-t};
 return {stage:null,next:'major',left:54-t};
}
export function stageAt(n,clock){const S=STAGES[n.arms??2]||STAGES[2],C=CYCLE[n.arms??2]||63,t=((clock+n.id*11)%C+C)%C;for(const [stage,a,b] of S)if(t>=a&&t<b)return {stage,left:b-t};
 const k=S.findIndex(([,a])=>a>t);return {stage:null,next:S[k<0?0:k][0],left:(k<0?C:S[k][1])-t};}
// Cars. opts: {count, seed, signal(crossing) → true when the road phase is green, time() for crossroads phases}.
// step(dt, {focus:{x,z}, blockers:[{x,z,r,w?}], view:{x,z,fx,fz} (camera, for respawns out of sight)}).
const STOP_MARGIN=.5,ACCELERATION=1.9;
export function createTraffic(graph,{count=40,seed=7,signal=()=>true,fleet=[{length:4.6,width:1.9}]}={}){
 let rs=seed>>>0;const rnd=()=>{rs=Math.imul(rs^rs>>>15,2246822507)+0x9e3779b9>>>0;return (rs>>>8)/16777216;};
 const lanes=graph.pieces.filter(p=>p.kind==='lane'&&p.len>12),cars=[],stats={respawns:0,redRuns:0,exits:0};let clock=0;
 const pose=(p,s)=>{const P=p.pts;let i=1;while(i<P.length-1&&P[i].s<s)i++;const a=P[i-1],b=P[i],u=Math.max(0,Math.min(1,(s-a.s)/((b.s-a.s)||1))),dx=b.x-a.x,dz=b.z-a.z,l=Math.hypot(dx,dz)||1;return {x:a.x+dx*u,y:a.y+(b.y-a.y)*u,z:a.z+dz*u,tx:dx/l,tz:dz/l};};
 const choose=p=>{if(!p.next.length)return null;const w=p.next.map(q=>q.dir==='straight'||q.kind!=='turn'?3:1);let t=rnd()*w.reduce((a,b)=>a+b,0);for(let i=0;i<w.length;i++)if((t-=w[i])<0)return p.next[i];return p.next.at(-1);};
 const place=(c,p,s)=>{c.piece=p;c.s=s;c.v=0;c.next=choose(p);c.wait=0;Object.assign(c,pose(p,s));};
 const free=(p,s)=>{const q=pose(p,s);return cars.every(o=>!o.piece||Math.hypot(o.x-q.x,o.z-q.z)>45);};// never drop a parked car in front of a moving one
 function spawn(c,env){for(let tries=0;tries<40;tries++){const p=lanes[Math.floor(rnd()*lanes.length)],maxS=p.stopS!=null?Math.min(p.len-4,p.stopS-c.length/2-4):p.len-4;if(maxS<=4)continue;const s=2+rnd()*(maxS-2),q=pose(p,s);
   if(env?.focus){const d=Math.hypot(q.x-env.focus.x,q.z-env.focus.z);if(d<(env.near??150)||d>(env.far??420))continue;
    if(env.view){const dx=q.x-env.view.x,dz=q.z-env.view.z,l=Math.hypot(dx,dz)||1;if(l<260&&(dx*env.view.fx+dz*env.view.fz)/l>.55)continue;}}
   if(free(p,s)){place(c,p,s);return true;}}return false;}
 for(let i=0;i<count;i++){const f=fleet[i%fleet.length],c={id:i,length:f.length,width:f.width,kind:f.kind,piece:null};cars.push(c);}
 // Crossroads run three fixed stages (the major road, then each side road in turn) with 3 s all-red between them.
 const stage=n=>stageAt(n,clock).stage;
 const onNode=n=>cars.filter(o=>o.piece?.node===n&&o.piece.kind==='turn');
 // Can a major-road right turn cross oncoming lanes safely?
 function oncomingClear(c,m){const n=m.node,a=m.from,st=n.signal?stageAt(n,clock):null;
  if(onNode(n).some(o=>o!==c&&(o.piece.approach!=='major'||o.piece.dir!=='right'&&o.piece.from.dir!==a.dir)))return false;
  const opp=n.major.filter(l=>l.dir!==a.dir);
  return !cars.some(o=>{if(o===c||!o.piece)return false;
   if(opp.includes(o.piece)&&o.next?.node===n&&o.next?.dir==='right')return false;// opposite right-turner doesn't cross paths
   const stopCenterO=o.piece.stopS!=null?Math.max(0,o.piece.stopS-o.length/2-STOP_MARGIN):null;
   if(n.signal&&opp.includes(o.piece)&&stopCenterO!=null&&o.s<=stopCenterO+.35&&(st.stage!=='major'||st.left<=3&&(o.held||stopCenterO-o.s>=(o.v*o.v)/(2*2.6))))return false;
   const rest=o.piece.len-o.s,via=o.next?.next.length===1?o.next.next[0]:null;
   if(n.signal&&!opp.includes(o.piece)&&(opp.includes(o.next)||opp.includes(via))){
    const oppLane=opp.includes(o.next)?o.next:via,toStop=rest+(oppLane===via?(o.next?.len??0):0)+(oppLane.stopS??oppLane.len)-o.length/2-STOP_MARGIN;
    if(st.stage!=='major'||st.left<=3&&toStop>=(o.v*o.v)/(2*2.6))return false;}
   const d=opp.includes(o.piece)?rest:opp.includes(o.next)?rest+o.next.len:opp.includes(via)?rest+o.next.len+via.len:1e9;if(d>=1e9)return false;
   const vv=Math.min(o.piece.kind==='uturn'?o.piece.vmax:13.9,Math.sqrt(o.v*o.v+3.8*d));return d<Math.max(34,vv*6.5)&&(o.v>1||d<6&&o.wait<2);});}
 // Time to a conflict point, including the acceleration of a vehicle starting from the Give Way line.
 function travelTime(distance,speed,limit){
  if(distance<=0)return 0;
  const v=Math.min(speed,limit),peak=Math.min(limit,Math.sqrt(v*v+2*ACCELERATION*distance));
  return (peak-v)/ACCELERATION+Math.max(0,distance-(peak*peak-v*v)/(2*ACCELERATION))/limit;
 }
 function ringGapClear(c,entry){
  const approach=c.piece.len-c.s,exit=entry.next[0];
  for(const o of cars){
   if(o===c||!o.piece)continue;
   if(o.piece===exit&&o.v<.5&&o.s-o.length/2<c.length/2+2.5)return false;
   // A circulating car may already be in the mouth, approaching on the ring, or
   // completing the previous turn into a short stretch of circulating lane.
   let turn=o.piece,distance=-o.s;
   if(!entry.conflicts.has(turn)){
    distance+=turn.len;turn=o.next;
    if(turn?.road?.r.loop&&entry.node.major.includes(turn)){
     distance+=turn.len;turn=turn.next.find(t=>t.next[0].road.r.loop);
    }
   }
   const conflicts=entry.conflicts.get(turn);
   if(!conflicts)continue;
   for(const [into,across] of conflicts){
    const otherDistance=distance+across,otherRear=otherDistance+o.length/2+1;
    if(otherRear<=0)continue;
    const otherFront=otherDistance-o.length/2-1;
    const ourFront=travelTime(approach+into-c.length/2-1,c.v,entry.vmax);
    const ourRear=travelTime(approach+into+c.length/2+1,c.v,entry.vmax);
    if(travelTime(otherFront,o.v,turn.vmax)>ourRear+.8)continue;
    if((otherFront<=0&&o.v<.5)||travelTime(otherRear,o.v,turn.vmax)+.8>=ourFront)return false;
   }
  }
  return true;
 }
 // May car c start movement m (its next piece) now?
 function clear(c,m){const n=m.node;if(!n)return true;if(m.rule==='signal')return signal(m.crossing);if(m.rule==='free')return true;
   if(m.rule==='oncoming')return oncomingClear(c,m);
   if(n.signal){if(stage(n)!==m.approach)return false;return true;}
   if(m.conflicts){
    // Once the front has passed the line in an accepted gap, finish the merge.
    return c.piece.len-c.s<c.length/2+STOP_MARGIN-.01||ringGapClear(c,m);
   }
   const busy=onNode(n).some(o=>o!==c&&o.piece!==m&&o.piece.approach!==m.approach);
   // traffic bearing down on the junction: on an approach lane, or up to two pieces before it (blocks are short); it counts
   // when it could arrive within 6.5 s at the speed it can reach by then, or is already within `reach` m
   const coming=(list,reach)=>cars.some(o=>{if(o===c||!o.piece)return false;const rest=o.piece.len-o.s,via=o.next?.next.length===1?o.next.next[0]:null;
    const d=list.includes(o.piece)?rest:list.includes(o.next)?rest+o.next.len:list.includes(via)?rest+o.next.len+via.len:1e9;if(d>=1e9)return false;
    const vv=Math.min(o.piece.kind==='uturn'?o.piece.vmax:13.9,Math.sqrt(o.v*o.v+3.8*d));return d<Math.max(reach,vv*6.5)&&(o.v>1||d<6&&o.wait<2);});
   if(m.rule==='major')return true;
  return !busy&&!coming(n.major,30);}
 const lastGreen=new Map();
 function step(dt,env={}){clock+=dt;const blockers=env.blockers||[],on=new Map();
  for(const o of cars)if(o.piece)(on.get(o.piece)||on.set(o.piece,[]).get(o.piece)).push(o);
  for(const n of graph.nodes)if(n.crossing?.signal&&signal(n.crossing))lastGreen.set(n.crossing,clock);
  for(const c of cars){if(!c.piece){spawn(c,env);continue;}const p=c.piece;let gap=1e9,held=false;// held: waiting for a signal (never 'stuck')
   // the car ahead in lane order: on this piece, or just into any piece this one leads to (they share its first metres)
   for(const o of on.get(p)||[])if(o!==c&&o.s>c.s)gap=Math.min(gap,o.s-c.s-(c.length+o.length)/2-2.5);
   for(const q of p.next)for(const o of on.get(q)||[])if(q===c.next||o.s<10)gap=Math.min(gap,p.len-c.s+o.s-(c.length+o.length)/2-2.5);
   // the end of this piece: a held movement, or the map edge
   const rest=p.len-c.s;
   for(const signal of p.walkSignals||[]){
    const forward=signal.s-c.length/2-STOP_MARGIN-c.s;
    if(forward<-.35)continue;
    const stage=midblockStage(signal.offset,clock);
    if(stage.stage!=='major'||stage.left<=3&&(c.held||forward>=c.v*c.v/5.2)){
     gap=Math.min(gap,Math.max(0,forward));held=true;
    }
   }
   if(p.kind==='cross'&&p.hold!=null){const holdCenter=Math.max(0,p.hold-c.length/2-STOP_MARGIN);if(c.s<=holdCenter+.35&&!signal(p.crossing)){gap=Math.min(gap,Math.max(0,holdCenter-c.s));held=true;}}
   if(p.kind==='turn'&&p.node?.signal&&p.rule==='oncoming'&&p.waitS!=null&&c.s<=p.waitS+.35&&!oncomingClear(c,p)){gap=Math.min(gap,Math.max(0,p.waitS-c.s));held=true;}
   if(c.next?.node&&p.kind==='lane'&&rest<75){
    if(c.next.rule==='signal'){const holdDist=rest+c.next.hold-c.length/2-STOP_MARGIN;if(!signal(c.next.crossing)&&holdDist>=-.35){gap=Math.min(gap,Math.max(0,holdDist));held=true;}}
    else if(c.next.node.signal&&p.stopS!=null){
     const n=c.next.node,m=c.next,st=stageAt(n,clock),isGreen=st.stage===m.approach&&st.left>3,isAmber=st.stage===m.approach&&st.left<=3,isRed=st.stage!==m.approach;
     const stopCenter=Math.max(0,p.stopS-c.length/2-STOP_MARGIN);
     if(c.s<=stopCenter+.35){
      const crossBusy=onNode(n).some(o=>o!==c&&o.piece.approach!==m.approach);
      const aheadInPocket=(on.get(p)||[]).some(o=>o!==c&&o.s>p.stopS-o.length/2-.1&&(o.v<2.5||o.next?.rule==='oncoming'&&!oncomingClear(o,o.next)))
       ||p.next.some(q=>q.rule==='oncoming'&&(on.get(q)||[]).some(o=>o!==c&&o.s<=(q.waitS??4)+3&&(o.v<2.5||!oncomingClear(o,q))));
      const canStop=stopCenter-c.s>=(c.v*c.v)/(2*(m.rule==='oncoming'?3.5:2.6));
      if(isRed||isAmber&&(canStop||c.v<1)||(isGreen||isAmber)&&(crossBusy||aheadInPocket)){gap=Math.min(gap,Math.max(0,stopCenter-c.s));held=true;}
      else if(m.rule==='oncoming'&&!oncomingClear(c,m))gap=Math.min(gap,rest+(m.waitS??4));
     }else if(m.rule==='oncoming'&&!oncomingClear(c,m)){gap=Math.min(gap,rest+(m.waitS??4));held=true;}
    }else if(rest<45&&!clear(c,c.next)){
     // An unsignalised entry can legitimately wait for more than 40 s. Keep the bumper
     // behind the entry while yielding, then allow it through when the major stream clears.
     const holdDist=Math.max(0,rest-c.length/2-STOP_MARGIN);
     gap=Math.min(gap,holdDist);held=true;
    }
   }
   // anything in the way: cars ahead in my lane, cars crossing my path, the player's vehicles and people
   const look=(ox,oz,half,same,parked,wide=half)=>{const dx=ox-c.x,dz=oz-c.z,ahead=dx*c.tx+dz*c.tz,side=Math.abs(dx*c.tz-dz*c.tx);if(ahead<=0)return;// wide: the obstacle's half-width across my path
    if(same){if(side<2&&ahead<45)gap=Math.min(gap,ahead-c.length/2-half-2.5);}else if(side<(parked?c.width/2+.5:2.3)+wide&&ahead<c.length/2+half+5+c.v*1.3)gap=Math.min(gap,ahead-c.length/2-half-(parked?2.5:1.5));};
   // merging: another movement into the same lane — whoever is nearer to it leads, the other follows at a car's distance
   const into=p.kind!=='lane'?p.next[0]:c.next&&c.next.kind!=='lane'?c.next.next[0]:null,mine=p.kind!=='lane'?rest:rest+(c.next?.len??0);
   for(const o of cars){if(o===c||!o.piece||Math.abs(o.x-c.x)>50||Math.abs(o.z-c.z)>50)continue;
    if(into&&o.piece.kind!=='lane'&&o.piece!==p&&o.piece.next[0]===into){const theirs=o.piece.len-o.s;if(theirs<mine||theirs===mine&&o.id<c.id)gap=Math.min(gap,mine-theirs-(c.length+o.length)/2-2.5);continue;}
    // A vehicle behind this mouth's Give Way line is clear of the ring.
    // The tangent look-ahead on a curve can otherwise make both drivers yield to each other.
    if(p.node?.kind==='ring'&&p.rule==='major'&&o.next?.node===p.node&&o.next.rule==='minor'&&
       o.piece.len-o.s>=o.length/2)continue;
    const cos=o.tx*c.tx+o.tz*c.tz;
    if(cos>.5)look(o.x,o.z,o.length/2,true);else if(cos>-.5&&(o.piece.kind!=='lane'||o.id<c.id))look(o.x,o.z,o.length/2,false);}
   for(const b of blockers)look(b.x,b.z,b.r,false,true,b.w??b.r);// {x,z,r along my path,w across it}: a car in the next lane is no obstacle
   // speed: accelerate to the limit, brake to stop in the gap
   const vmax=Math.min(p.vmax,c.next&&c.next.kind!=='lane'&&rest<25?Math.max(c.next.vmax,Math.sqrt(Math.max(0,2*1.8*rest)+c.next.vmax**2)):99),target=gap<=.2?0:Math.min(vmax,Math.sqrt(2*2.6*Math.max(0,gap-.2)));
   c.v=target>c.v?Math.min(target,c.v+ACCELERATION*dt):Math.max(target,c.v-4.5*dt);c.wait=c.v<.3&&!held?c.wait+dt:0;c.held=held;
   let s=c.s+c.v*dt;
   if(held&&c.next?.conflicts){
    // A gap can close as another vehicle chooses its exit. Keep even a long
    // vehicle's front behind the line while it is still yielding.
    const stop=Math.max(c.s,p.len-c.length/2-STOP_MARGIN);
    if(s>stop){s=stop;c.v=0;}
   }
   while(s>=c.piece.len){const q=c.next;if(!q){if(c.piece.exit)stats.exits++;c.piece=null;break;}// left the map (or a dead end): recycle
    s-=c.piece.len;c.piece=q;c.next=choose(q);}
   if(!c.piece){spawn(c,env);continue;}
   if(c.piece.kind==='cross'&&c.piece.hold!=null&&c.s+c.length/2<=c.piece.hold+.1&&s+c.length/2>c.piece.hold+.1&&!signal(c.piece.crossing)&&clock-(lastGreen.get(c.piece.crossing)??-99)>3.5)stats.redRuns++;// 3.5 s of amber grace
   c.s=s;Object.assign(c,pose(c.piece,s));
   // stuck (40 s, not counting red lights) or left far behind the player: start again somewhere out of sight
   const far=env.focus&&Math.hypot(c.x-env.focus.x,c.z-env.focus.z)>(env.far??420)+90;
   if(c.wait>40||far){if(c.wait>40){stats.respawns++;stats.stuck=[...(stats.stuck||[]).slice(-9),`${c.piece.kind}/${c.piece.road?.r.id||c.piece.node?.kind} next ${c.next?.rule||'-'} at ${c.x.toFixed(0)},${c.z.toFixed(0)}`];}const old={...c};if(!spawn(c,env))Object.assign(c,old,{wait:far?0:20});}}}
 return {cars,step,stats,get clock(){return clock;}};}

// Pedestrians. footways(net): every stretch of footway between side-road mouths, both sides of every street, as walking
// lines 55 % of the way across the footway (clear of the kerbside furniture band).
export function footways(net){const out=[];
 for(const o of net.roads){if(o.r.loop||!(o.P.footpath>=2))continue;const L=o.F.at(-1).d,h=o.P.carriageway/2,own=end=>net.joins.find(j=>j.A===o&&j.end===end);
  const a0=own(0)?own(0).B.P.carriageway/2+own(0).B.P.footpath+1:3,a1=L-(own(1)?own(1).B.P.carriageway/2+own(1).B.P.footpath+1:o.r.turningRadius?o.r.turningRadius+2:3);
  for(const side of [1,-1]){const gaps=net.joins.filter(j=>j.B===o&&j.side===side).map(j=>{const w=j.A.P.carriageway/2+j.A.P.footpath+7;return [j.at.d-w,j.at.d+w];}).sort((p,q)=>p[0]-q[0]);
   let from=a0;for(const [g0,g1] of [...gaps,[a1,a1]]){const to=Math.min(g0,a1);if(to-from>18){const lat=side*(h+o.P.footpath*.55),n=Math.ceil((to-from)/3),pts=[];let s=0;
     for(let i=0;i<=n;i++){const d=from+(to-from)*i/n,f=frameAt(o.F,d),walkLat=lat+side*bayDepth(o.r,side,d),p={x:f.x+f.lx*walkLat,y:f.y+streetLevel(o.r,d,lat)+(f.crossSlope||0)*walkLat,z:f.z+f.lz*walkLat};if(i)s+=Math.hypot(p.x-pts[i-1].x,p.z-pts[i-1].z);p.s=s;pts.push(p);}
     out.push({road:o.r.id,side,pts,len:s});}from=Math.max(from,g1);}}}
 return out;}
// People stroll their stretch of footway, pause and turn back at its ends, and are recycled near the focus like the cars.
export function createPeople(paths,{count=28,seed=11}={}){let rs=seed>>>0;const rnd=()=>{rs=Math.imul(rs^rs>>>15,2246822507)+0x9e3779b9>>>0;return (rs>>>8)/16777216;};
 const total=paths.reduce((s,p)=>s+p.len,0),people=Array.from({length:count},(_,id)=>({id,path:null,speed:1.05+rnd()*.5}));
 const pose=(p,s)=>{const P=p.pts;let i=1;while(i<P.length-1&&P[i].s<s)i++;const a=P[i-1],b=P[i],u=Math.max(0,Math.min(1,(s-a.s)/((b.s-a.s)||1))),dx=b.x-a.x,dz=b.z-a.z,l=Math.hypot(dx,dz)||1;return {x:a.x+dx*u,y:a.y+(b.y-a.y)*u,z:a.z+dz*u,tx:dx/l,tz:dz/l};};
 function spawn(h,env){for(let tries=0;tries<30;tries++){let t=rnd()*total,p=paths[0];for(const q of paths){if((t-=q.len)<0){p=q;break;}}const s=1+rnd()*(p.len-2),q=pose(p,s);
   if(env?.focus){const d=Math.hypot(q.x-env.focus.x,q.z-env.focus.z);if(d<(env.near??25)||d>(env.far??140))continue;
    if(env.view&&d<90){const dx=q.x-env.view.x,dz=q.z-env.view.z;if((dx*env.view.fx+dz*env.view.fz)/(d||1)>.6)continue;}}
   if(people.some(o=>o.path&&Math.hypot(o.x-q.x,o.z-q.z)<3))continue;Object.assign(h,{path:p,s,dir:rnd()<.5?1:-1,wait:0,moved:0},q);return true;}return false;}
 function step(dt,env={}){for(const h of people){if(!h.path){spawn(h,env);continue;}h.moved=0;
   if(h.wait>0)h.wait-=dt;else{const d=h.speed*dt;h.s+=h.dir*d;h.moved=d;if(h.s<=.5||h.s>=h.path.len-.5){h.s=Math.max(.5,Math.min(h.path.len-.5,h.s));h.dir=-h.dir;h.wait=1+rnd()*3;}}
   const q=pose(h.path,h.s);h.x=q.x;h.y=q.y;h.z=q.z;h.tx=q.tx*h.dir;h.tz=q.tz*h.dir;
   if(env.focus&&Math.hypot(h.x-env.focus.x,h.z-env.focus.z)>(env.far??140)+40){const old={...h};if(!spawn(h,env))Object.assign(h,old);}}}
 return {people,step};}
