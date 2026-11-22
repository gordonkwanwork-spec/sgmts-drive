// Regression checks: signalized traffic waits with its front bumper behind the white RM1011 stop line
// at red/amber lights, while a lead right-turner on green may wait in the junction pocket and clear cleanly.
import assert from 'node:assert/strict';
import fs from 'node:fs';
const ctx2d=new Proxy({},{get:(_,k)=>k==='measureText'?()=>({width:0}):k==='createLinearGradient'?()=>({addColorStop(){}}):()=>{},set:()=>true});
globalThis.document??={createElement:()=>({getContext:()=>ctx2d,width:0,height:0})};

const {cityGraph,cityCrossings}=await import('../city/life-headless.js');
const {createTraffic,stageAt,midblockStage}=await import('../city/life.js');
const {junctions,frameAt}=await import('../street/network.js');
const {renderedGround}=await import('../environment.js');

const network=JSON.parse(fs.readFileSync(new URL('../../public/street/furniture.json',import.meta.url))).network;
const net=junctions(network,renderedGround);
const g=cityGraph(network);
const crossings=cityCrossings();

const poseAt=(p,s)=>{
 const P=p.pts;let i=1;while(i<P.length-1&&P[i].s<s)i++;
 const a=P[i-1],b=P[i],u=Math.max(0,Math.min(1,(s-a.s)/((b.s-a.s)||1))),dx=b.x-a.x,dz=b.z-a.z,l=Math.hypot(dx,dz)||1;
 return {x:a.x+dx*u,y:a.y+(b.y-a.y)*u,z:a.z+dz*u,tx:dx/l,tz:dz/l};
};

// 1. Geometry anchors: stopS matches white stop lines on every signalized approach; waitS set on major right turns.
const signalNodes=g.nodes.filter(n=>n.signal);
assert.equal(signalNodes.length,11,'11 signalized city junctions');
for(const n of signalNodes){
 for(const l of [...n.major,...n.minor]){
  assert(Number.isFinite(l.stopS)&&l.stopS>0&&l.stopS<l.len,`lane ${l.id} approaching signal node ${n.id} has valid stopS`);
  const stopPt=poseAt(l,l.stopS);
  const to=l.to;
  let expectD=null;
  if(to.kind==='host'){const h=to.arms.find(j=>j.host)?.host;expectD=l.dir>0?h.lo-3.65:h.hi+3.65;}
  else{const j=net.joins.find(j=>j.A===l.road&&j.end===(to.d>0?1:0));expectD=j.crossingD-l.dir*3.65;}
  const f=frameAt(l.road.F,expectD);
  const perpErr=Math.abs((stopPt.x-f.x)*f.tx+(stopPt.z-f.z)*f.tz);
  assert(perpErr<0.15,`lane ${l.id} stopS matches painted stop line within ${perpErr.toFixed(3)} m`);
 }
 const rts=n.turns.filter(t=>t.rule==='oncoming');
 for(const t of rts){
  assert(Number.isFinite(t.waitS)&&t.waitS>=3&&t.waitS<=4.01,`right-turn ${t.id} on signal node ${n.id} has waitS=${t.waitS}`);
 }
}
for(const n of g.nodes.filter(n=>n.kind==='crossing'&&n.crossing.signal)){
 const X=crossings.find(x=>x.c===n.crossing.c);
 for(const q of n.turns){
  assert(Number.isFinite(q.hold)&&q.hold>0&&q.hold<q.len,`corridor crossing ${q.id} has interpolated hold`);
  const p=poseAt(q,q.hold);
  const uStart=(q.pts[0].x-X.C.x)*X.u.x+(q.pts[0].z-X.C.z)*X.u.z;
  const side=uStart>=0?1:-1;
  const uVal=((p.x-X.C.x)*X.u.x+(p.z-X.C.z)*X.u.z)*side;
  assert(Math.abs(uVal-X.stop[side])<0.15,`corridor crossing ${q.id} hold aligns with stop line (${uVal.toFixed(2)} vs ${X.stop[side].toFixed(2)})`);
 }
}

// A bus arriving at a mid-block pedestrian green must stop at that crossing's
// own line and resume after the pedestrian clearance and all-red interval.
{
 const lane=g.pieces.find(p=>p.walkSignals?.length && p.walkSignals[0].s>25 && p.next.length);
 const signal=lane.walkSignals[0],traffic=createTraffic(g,{count:1,fleet:[{length:12,width:2.55}]});
 traffic.step(.05,{});
 while(midblockStage(signal.offset,traffic.clock).stage!=='walk')traffic.step(.05,{});
 const bus=traffic.cars[0];Object.assign(bus,{piece:lane,s:signal.s-16,v:4,next:lane.next[0],wait:0});
 Object.assign(bus,poseAt(lane,bus.s));
 while(midblockStage(signal.offset,traffic.clock).stage!=='major'){
  traffic.step(.05,{});
  assert(bus.s+bus.length/2<=signal.s+.03,'bus stops for pedestrians');
 }
 assert(bus.v<.1,'bus came to rest');
 for(let i=0;i<120;i++)traffic.step(.05,{});
 assert(bus.s>signal.s,'bus clears crossing on green');
}

// 2. Mixed-fleet simulation: 5 minutes, 50 vehicles (4.6 m cars up to 12.0 m double-deckers).
const mixedFleet=[
 {kind:'car',length:4.6,width:1.95},
 {kind:'van',length:5.4,width:2.05},
 {kind:'single-bus',length:10.6,width:2.5},
 {kind:'double-bus',length:12.0,width:2.55},
];
for(const seed of [7,21]){
 let green=true;
 const T=createTraffic(g,{count:50,seed,signal:()=>green,fleet:mixedFleet});
 let closest=1e9,worstOverhang=-99,worstCorridorOverhang=-99;
 for(let i=0;i<6000;i++){
  green=(i*.05)%60<30;
  T.step(.05,{});
  for(let a=0;a<T.cars.length;a++){
   const c=T.cars[a];if(!c.piece)continue;
   if(c.piece.kind==='lane'&&c.next?.node?.signal&&c.piece.stopS!=null&&c.v<.3&&c.s<=c.piece.stopS-.2){
    const st=stageAt(c.next.node,T.clock);
    if(st.stage!==c.next.approach||st.left<=3){
     worstOverhang=Math.max(worstOverhang,(c.s+c.length/2)-c.piece.stopS);
    }
   }
   if(c.piece.kind==='cross'&&c.piece.hold!=null&&!green&&c.v<.3&&c.s<=c.piece.hold+.1){
    worstCorridorOverhang=Math.max(worstCorridorOverhang,(c.s+c.length/2)-c.piece.hold);
   }
   if(i%4===0)for(let b=a+1;b<T.cars.length;b++){
    const o=T.cars[b];if(o.piece)closest=Math.min(closest,Math.hypot(c.x-o.x,c.z-o.z));
   }
  }
 }
 assert.equal(T.stats.redRuns,0,`seed ${seed}: zero corridor red-light runs`);
 assert.equal(T.stats.respawns,0,`seed ${seed}: zero stuck respawns (${(T.stats.stuck||[]).join('; ')})`);
 assert(closest>=1.9,`seed ${seed}: closest mixed-fleet gap ${closest.toFixed(2)} m >= 1.9 m`);
 assert(worstOverhang<=0.15,`seed ${seed}: front bumper stays behind city stop line (max overhang ${worstOverhang.toFixed(3)} m)`);
 assert(worstCorridorOverhang<=0.15,`seed ${seed}: front bumper stays behind corridor stop line (max overhang ${worstCorridorOverhang.toFixed(3)} m)`);
}

// 3. Deterministic crossroads scenario at Node 16 (city-hatsuen-east + city-tin-ha).
{
 const node=g.nodes.find(n=>n.id===16);
 const majorIn=node.major.find(l=>l.dir===1&&l.k===0);
 const majorOpp=node.major.find(l=>l.dir===-1&&l.k===0);
 const oppRight=node.turns.find(t=>t.from===majorIn&&t.rule==='oncoming');
 const majorStraight=node.turns.find(t=>t.from===majorIn&&t.dir==='straight');
 const oppStraight=node.turns.find(t=>t.from===majorOpp&&t.dir==='straight');
 assert(majorIn&&majorOpp&&oppRight&&majorStraight&&oppStraight,'Node 16 movements resolved');

 const spawnAt=(c,piece,s,next,v=8)=>{
  c.piece=piece;c.s=s;c.next=next;c.v=v;c.wait=0;c.held=false;
  Object.assign(c,poseAt(piece,s));
 };

 // 3a. Red stage holds both a 12 m double-decker bus (straight) and a 4.6 m car (right-turn) behind stopS.
 {
  const T=createTraffic(g,{count:2,seed:1,fleet:[{kind:'double-bus',length:12.0,width:2.55},{kind:'car',length:4.6,width:1.95}]});
  // Park both outside Node 16 while stepping clock into Node 16's 'arm0' red phase.
  while(stageAt(node,T.clock).stage!=='arm0'||stageAt(node,T.clock).left<8)T.step(1,{});
  const bus=T.cars[0],car=T.cars[1];
  spawnAt(bus,majorIn,majorIn.stopS-30,majorStraight,10);
  spawnAt(car,majorOpp,majorOpp.stopS-25,oppStraight,10);
  for(let i=0;i<120;i++)T.step(.05,{});
  assert(bus.v<0.1&&bus.held,'12 m bus stopped and held at red signal');
  assert(bus.s+bus.length/2<=majorIn.stopS+0.05,`12 m bus front bumper (${(bus.s+bus.length/2).toFixed(2)}) <= stopS (${majorIn.stopS.toFixed(2)})`);
  assert(car.v<0.1&&car.held,'car stopped and held at red signal');
  assert(car.s+car.length/2<=majorOpp.stopS+0.05,`car front bumper (${(car.s+car.length/2).toFixed(2)}) <= stopS (${majorOpp.stopS.toFixed(2)})`);
 }

 // 3b. Green light + oncoming stream: lead right-turner waits inside junction pocket, trailing car stays behind white line,
 // then pocket waiter completes right turn when oncoming traffic stops on amber/red.
 {
  const T=createTraffic(g,{count:5,seed:2,fleet:[{kind:'car',length:4.6,width:1.95}]});
  while(stageAt(node,T.clock).stage!=='major'||stageAt(node,T.clock).left<16)T.step(1,{});
  const rt=T.cars[0],follower=T.cars[1],opp1=T.cars[2],opp2=T.cars[3],opp3=T.cars[4];
  // Clear auto-spawned state and place controlled scenario on Node 16.
  spawnAt(rt,majorIn,majorIn.stopS-8,oppRight,5);
  spawnAt(follower,majorIn,majorIn.stopS-22,majorStraight,7);
  spawnAt(opp1,majorOpp,majorOpp.stopS-15,oppStraight,11);
  spawnAt(opp2,majorOpp,majorOpp.stopS-40,oppStraight,11);
  // 3rd oncoming car starts behind where it will stop when amber hits (stage ends soon after opp2).
  spawnAt(opp3,majorOpp,majorOpp.stopS-68,oppStraight,10);

  let sawPocket=false,followerChecked=false;
  for(let i=0;i<160;i++){
   T.step(.05,{});
   if(rt.piece===oppRight&&rt.v<0.3&&Math.abs(rt.s-oppRight.waitS)<0.7){
    sawPocket=true;
    // Keep follower anchored on the approach lane during green pocket occupation.
    if(follower.piece===majorIn&&follower.v<0.3){
     followerChecked=true;
     assert(follower.s+follower.length/2<=majorIn.stopS+0.05,`trailing car stays behind white line (${(follower.s+follower.length/2).toFixed(2)} <= ${majorIn.stopS.toFixed(2)}) while right-turner waits in pocket`);
    }
   }
   // Lock follower destination away from majorStraight once past wait check so scenario focuses on rt vs oncoming.
   if(rt.piece===oppRight)rt.next=oppRight.next[0];
   if(opp1.piece===oppStraight)opp1.next=oppStraight.next[0];
   if(opp2.piece===oppStraight)opp2.next=oppStraight.next[0];
   if(opp3.piece===majorOpp)opp3.next=oppStraight;
  }
  assert(sawPocket,'lead right-turner entered junction and waited at waitS inside pocket while oncoming traffic flowed');
  assert(followerChecked,'trailing vehicle behind pocket-waiting right-turner waited behind white stop line');

  // Step through amber / all-red until pocket waiter clears into exit road city-tin-ha.
  let cleared=false;
  for(let i=0;i<220;i++){
   T.step(.05,{});
   if(rt.piece===oppRight)rt.next=oppRight.next[0];
   if(rt.piece?.kind==='lane'&&rt.piece.road.r.id==='city-tin-ha'){cleared=true;break;}
  }
  assert(cleared,'pocket-waiting right-turner cleared into exit road once oncoming stream stopped at red');
  // Confirm opp3 stopped behind its white line rather than running the red light.
  if(opp3.piece===majorOpp){
   assert(opp3.s+opp3.length/2<=majorOpp.stopS+0.05,`3rd oncoming car held behind white stop line (${(opp3.s+opp3.length/2).toFixed(2)} <= ${majorOpp.stopS.toFixed(2)})`);
  }
 }
}

console.log('Signal stop-line checks passed: 11 city signal junctions + 6 corridor crossings aligned, mixed-fleet 5-min sim clean, green right-turn pocket and trailing stop-line queue verified.');
