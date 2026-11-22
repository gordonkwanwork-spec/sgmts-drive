// Rebuilt corridor crossings (city rebuild, 5 Nov 2026): the three signalised at-grade junctions and the three roads under the
// viaducts, drawn in world space from crossingGeometry() so skewed OZP roads meet the curving corridor kerb exactly.
// Markings after the sandbox rulebook / TPDM V3: RM1011 200 mm stop lines 2.9 m before each crossing centre on the incoming half,
// signal crossings (300 mm bars, 100 mm stud rows), 4 m warning lane lines within 42 m, double white centre lines, 4 m ahead-only
// arrows 15 m before the stop line, RM1038 yellow box over the ART lanes. Network roads continue from each arm end (extent).
import * as T from 'three';
import {sample,roadSection,project,projectFrame,footpathHeight,JUNCTIONS,UNDERPASSES,LEVEL_TRACK_GAPS,cycleSample,cycleBridgeHeight,junctionPavement,crossingGeometry} from '../alignment.js';
import {staggerKerbs} from '../street/staggered-crossing.js';
import {sweptKerbs} from '../street/kerbs.js';
import {signalCrossingMarkings} from '../street/sandbox/street-rules.js';
import {keepLeftBollard,warningBands} from './refuge.js';
import {signPost} from './signs.js';

const LANE=3.65,ARROW=[[-2,-.15],[.8,-.15],[.8,-.6],[2,0],[.8,.6],[.8,.15],[-2,.15]];
const clamp=(v,a,b)=>Math.max(a,Math.min(b,v));
export const RAISED=.18,ROAD=.03,PAINT=.008;

// Height datum of a crossing at (x,z): at grade the corridor profile (so the side road carries the corridor grade and crossfall),
// under a viaduct the level ground at the crossing centre.
// The arm then levels across towards its end, so it meets the network road (tieFrame: the corridor profile at the arm axis) flush.
export function crossingY(j,x,z){const g=crossingGeometry(j);if(j.underpass)return g.C.y;const d=(x-g.C.x)*g.u.x+(z-g.C.z)*g.u.z,near=sample(projectFrame(x,z,j.s)).y,
 axis=sample(j.s+d*Math.sin(j.skew*Math.PI/180)).y,t=clamp((Math.abs(d)-25)/(j.extent-25),0,1);return near+(axis-near)*t;}

// Fill the wedge between a square cycle-track end and the curved back of the footway.
export const cycleAprons=LEVEL_TRACK_GAPS.flatMap(({road,start,end})=>[start,end].map(terminal=>{
 const sign=terminal===start?1:-1,positions=[],indices=[],uv=[];
 for(let i=0;i<=16;i++){
  const lateral=-2+i*.25;
  function point(s){const r=cycleSample(s);return {x:r.x+r.lx*lateral,z:r.z+r.lz*lateral};}
  let lo=0,hi=Math.abs(end-start)/2;
  for(let n=0;n<12;n++){
   const mid=(lo+hi)/2,p=point(terminal+sign*mid);
   if(junctionPavement(road,p.x,p.z)===null)lo=mid;else hi=mid;
  }
  const a=point(terminal),b=point(terminal+sign*(hi+.06));
  const y=sample(terminal).groundY+cycleBridgeHeight(terminal);
  positions.push(a.x,y,a.z,b.x,crossingY(road,b.x,b.z)+(junctionPavement(road,b.x,b.z)??RAISED)+.004,b.z);
  uv.push(a.x/5,a.z/5,b.x/5,b.z/5);
  if(i){const k=2*i;indices.push(...(sign===1?[k-2,k-1,k,k,k-1,k+1]:[k-2,k,k-1,k,k+1,k-1]));}
 }
 const geometry=new T.BufferGeometry();
 geometry.setAttribute('position',new T.Float32BufferAttribute(positions,3));
 geometry.setAttribute('uv',new T.Float32BufferAttribute(uv,2));
 geometry.setIndex(indices);geometry.computeVertexNormals();return geometry;
}));

function sink(){const bufs=new Map();
 const get=mat=>{let b=bufs.get(mat);if(!b)bufs.set(mat,b={pos:[],idx:[]});return b;};
 return {
  // Triangle with its normal forced upwards.
  tri(mat,a,b,c){const B=get(mat),k=B.pos.length/3,up=(b[2]-a[2])*(c[0]-a[0])-(b[0]-a[0])*(c[2]-a[2])>0;B.pos.push(...a,...(up?b:c),...(up?c:b));B.idx.push(k,k+1,k+2);},
  raw(mat,g){const B=get(mat),k=B.pos.length/3;B.pos.push(...g.attributes.position.array);for(const i of g.index.array)B.idx.push(i+k);g.dispose();},
  meshes(name){return [...bufs].map(([mat,{pos,idx}])=>{const g=new T.BufferGeometry();g.setAttribute('position',new T.Float32BufferAttribute(pos,3));
   g.setAttribute('uv',new T.Float32BufferAttribute(Array.from({length:pos.length/3*2},(_,i)=>pos[(i>>1)*3+(i&1?2:0)]/5),2));g.setIndex(idx);g.computeVertexNormals();
   const m=new T.Mesh(g,mat);m.name=name;m.receiveShadow=true;return m;});}};}

const poleGeo=new T.BoxGeometry(1,1,1),ONE=new T.Vector3(1,1,1);
export function buildCrossings(scene,{mats,junctionBox,batch,lampPositions,refugeRails=[]}){
 const lamps=[],records=[];
 for(const j of [...JUNCTIONS,...UNDERPASSES]){
  const g=crossingGeometry(j),{C,u,n}=g,h=j.halfWidth,fw=j.footway,m=j.median/2,ext=j.extent,out=sink(),group=new T.Group();
  group.name=(j.underpass?'underpass-':'junction-')+j.c;scene.add(group);
  const A=(d,e)=>({x:C.x+u.x*d+n.x*e,z:C.z+u.z*d+n.z*e}),Y=p=>crossingY(j,p.x,p.z),v=(p,dy)=>[p.x,Y(p)+dy,p.z];
  // Filled polygon (points in order) at height dy above the datum.
  // dy may be a function of road-local (d,e), as for the band below.
  const du=p=>(p.x-C.x)*u.x+(p.z-C.z)*u.z,dn=p=>(p.x-C.x)*n.x+(p.z-C.z)*n.z,lift=(p,dy)=>v(p,typeof dy==='function'?dy(du(p),dn(p)):dy);
  const fill=(mat,pts,dy)=>{const tris=T.ShapeUtils.triangulateShape(pts.map(p=>new T.Vector2(p.x,p.z)),[]);for(const [a,b,c] of tris)out.tri(mat,lift(pts[a],dy),lift(pts[b],dy),lift(pts[c],dy));};
  // Quad strip over road-local d (along u) × e (across), height dy(d,e), with extra d stations for dropped kerbs and smooth vertex lighting across wide carriageways.
  const band=(mat,d0,d1,e0,e1,dy,breaks=[])=>{if(d1<d0)[d0,d1]=[d1,d0];if(e1<e0)[e0,e1]=[e1,e0];if(d1-d0<.02||e1-e0<.02)return;const ds=[...new Set([d0,...Array.from({length:Math.ceil(d1-d0)},(_,i)=>d0+i),...breaks.filter(q=>q>d0&&q<d1),d1])].sort((a,b)=>a-b),es=Array.from({length:Math.max(1,Math.ceil((e1-e0)/3.5))+1},(_,i)=>e0+(e1-e0)*i/Math.max(1,Math.ceil((e1-e0)/3.5)));
   for(let i=1;i<ds.length;i++)for(let k=1;k<es.length;k++){const [a,b]=[ds[i-1],ds[i]],[c,d]=[es[k-1],es[k]],p=[[a,c],[a,d],[b,d],[b,c]].map(([x,y])=>v(A(x,y),typeof dy==='function'?dy(x,y):dy));out.tri(mat,p[0],p[1],p[2]);out.tri(mat,p[0],p[2],p[3]);}};
  const rect=(mat,d,e,len,wid,dy=ROAD+PAINT)=>fill(mat,[A(d-len/2,e-wid/2),A(d+len/2,e-wid/2),A(d+len/2,e+wid/2),A(d-len/2,e+wid/2)],dy);
  // Corridor-frame rectangle: s span × lateral span (markings on the ART lanes and corridor footways).
  const at=(s,lat)=>{const r=sample(s);return {x:r.x+r.lx*lat,z:r.z+r.lz*lat};};
  const corr=(mat,s0,s1,l0,l1,dy)=>{const N=Math.max(1,Math.ceil(Math.abs(s1-s0)));for(let i=0;i<N;i++){const a=s0+(s1-s0)*i/N,b=s0+(s1-s0)*(i+1)/N,p=[[a,l0],[a,l1],[b,l1],[b,l0]].map(([s,l])=>{const q=at(s,l);return [q.x,sample(s).y+(typeof dy==='function'?dy(s):dy),q.z];});out.tri(mat,p[0],p[1],p[2]);out.tri(mat,p[0],p[2],p[3]);}};
  const kerb=(length,point)=>sweptKerbs(length,point,{step:.5}).forEach((geo,i)=>out.raw(i?mats.kerbJoint:mats.concrete,geo));
  // Straight kerb along e = τh (normal into the footway) from d0 to d1, dropping to a 25 mm lip across the crossing at dc.
  // Dropped kerb: 130 mm down over ±1.5 m of the crossing, ramping back up over 1.8 m. The ramp starts inside the corner return
  // (crossD is only 2.1 m beyond the tangent point), so the corner ring and its kerb take the same drop and the ramp has no seam.
  const drop=(d,dc)=>dc===null?0:.13*clamp(1-(Math.abs(d-dc)-1.5)/1.8,0,1);
  const armKerb=(τ,d0,d1,dc=null)=>{const s=Math.sign(d1-d0)||1,L=Math.abs(d1-d0);kerb(L,t=>{const d=d0+s*t,p=A(d,τ*h);return {x:p.x,z:p.z,nx:n.x*τ,nz:n.z*τ,y:Y(p)+RAISED-drop(d,dc),base:Y(p)+ROAD};});};
  const footDy=dc=>(d,e)=>RAISED-drop(d,dc)*clamp(1-(Math.abs(e)-h)/fw,0,1);
  // Central median island (raised, brick paved) from d0 to d1 with K1 kerbs; a rounded nose at `nose` (one of d0/d1).
  const median=(d0,d1,nose,pave=mats.walk)=>{if(!m||Math.abs(d1-d0)<.5)return;band(pave,d0,d1,-m+.125,m-.125,RAISED);/* brick paved like the city medians (Gordon, 16-17 Nov); the city road's median continues it flush at the arm end */
   for(const τ of [-1,1])kerb(Math.abs(d1-d0),t=>{const d=Math.min(d0,d1)+t,p=A(d,τ*m);return {x:p.x,z:p.z,nx:-n.x*τ,nz:-n.z*τ,y:Y(p)+RAISED,base:Y(p)+ROAD};});
   const cap=d=>kerb(2*m,t=>{const p=A(d,-m+t);return {x:p.x,z:p.z,nx:-u.x*Math.sign(d-(d0+d1)/2),nz:-u.z*Math.sign(d-(d0+d1)/2),y:Y(p)+RAISED,base:Y(p)+ROAD};});
   for(const d of [d0,d1])if(d!==nose&&Math.abs(d)<ext-.01)cap(d);
   if(nose!==undefined){const dir=Math.sign(nose-(d0+d1)/2),pts=Array.from({length:13},(_,i)=>{const a=-Math.PI/2+i*Math.PI/12;return A(nose+dir*Math.cos(a)*(m-.125),Math.sin(a)*(m-.125));});fill(pave,pts,RAISED);
    kerb(Math.PI*m,t=>{const a=-Math.PI/2+t/m,p=A(nose+dir*Math.cos(a)*m,Math.sin(a)*m);return {x:p.x,z:p.z,nx:-(u.x*dir*Math.cos(a)+n.x*Math.sin(a)),nz:-(u.z*dir*Math.cos(a)+n.z*Math.sin(a)),y:Y(p)+RAISED,base:Y(p)+ROAD};});}};
  // Lane lines between same-direction lanes: 4 m warning marks (6 m module) on the half approaching signals, else 1 m / 6 m.
  const laneLines=(σ,d0,d1,signals)=>{if(j.lanes<2)return;for(const τ of [-1,1]){const e=τ*(m+LANE),dash=signals&&τ===σ?4:1,module=6,s=Math.sign(d1-d0);
    for(let d=0;d<Math.abs(d1-d0)-.5;d+=module){const a=d0+s*d,b=d0+s*Math.min(d+dash,Math.abs(d1-d0));rect(mats.white,(a+b)/2,e,Math.abs(b-a),.1);}}};
  const arrows=(σ,d)=>{for(let k=0;k<j.lanes;k++){const e=σ*(m+LANE*(k+.5));fill(mats.white,ARROW.map(([x,y])=>A(d-σ*x,e-σ*y)),ROAD+PAINT);}};

  if(!j.underpass){
   const right=s=>roadSection(s).right,cs=g.corners;
   for(const σ of [-1,1]){const c1=cs[σ][-1],c2=cs[σ][1],arc=(k,from,to,r=k.R,N=16)=>Array.from({length:N+1},(_,i)=>{const a=from+(to-from)*i/N;return {x:k.O.x+r*Math.cos(a),z:k.O.z+r*Math.sin(a)};});
    // Arm carriageway: throat from the curving corridor kerb to reachMax, then subdivided arm strip out to ext for smooth surface lighting.
    const kerbLine=[],reachMax=Math.max(Math.abs(c1.d),Math.abs(c2.d));for(let q=c2.s-1;q>c1.s+.5;q-=1)kerbLine.push(at(q,σ*right(q)));
    fill(mats.road,[...arc(c1,c1.a1,c1.a2),...(Math.abs(c1.d)<reachMax-.05?[A(σ*reachMax,-h)]:[]),...(Math.abs(c2.d)<reachMax-.05?[A(σ*reachMax,h)]:[]),...arc(c2,c2.a2,c2.a1),...kerbLine],ROAD);
    band(mats.road,σ*reachMax,σ*ext,-h,h,ROAD);
    const incoming=g.crossD[σ],pen=g.staggers[σ],reach=k=>Math.abs(k.d);
    for(const τ of [-1,1]){const k=cs[σ][τ],dc=pen?.centre(τ)??incoming;
     // Corner footway ring and its K1 kerb return (normal towards the footway = towards the circle centre).
     const pts=[...arc(k,k.a1,k.a2,k.R,32),...arc(k,k.a2,k.a1,k.R-fw,32)];fill(mats.walk,pts,footDy(dc));
     const len=Math.abs(k.a2-k.a1)*k.R;kerb(len,t=>{const a=k.a1+(k.a2-k.a1)*t/len,p={x:k.O.x+k.R*Math.cos(a),z:k.O.z+k.R*Math.sin(a)};return {x:p.x,z:p.z,nx:-Math.cos(a),nz:-Math.sin(a),y:Y(p)+RAISED-drop(du(p),dc),base:Y(p)+ROAD};});
     // Arm footway with the dropped kerb and tactile at the side crossing.
     band(mats.walk,σ*reach(k),σ*ext,τ*h+τ*.12,τ*(h+fw),footDy(dc),[dc-3.3,dc-1.5,dc+1.5,dc+3.3]);armKerb(τ,σ*reach(k),σ*ext,dc);
     band(mats.tactile,dc-1.5,dc+1.5,τ*(h+.3),τ*(h+1.2),(d,e)=>footDy(dc)(d,e)+.012);}
    // Median: refuge nose just junction-side of the crossing, cut through at road level for the crossing, then on to the arm end.
    if(m){
     const dc=pen?.outgoing??incoming,gap=pen?2.25:1.9,noseD=dc-σ*(gap+1.8);
     median(noseD,dc-σ*gap,noseD,mats.channel);
     median(incoming+σ*gap,σ*ext);
     const nose=A(noseD-σ*m*.4,0);
     keepLeftBollard(batch,nose.x,Y(nose)+RAISED,nose.z,Math.atan2(-u.x*σ,-u.z*σ),Math.floor(j.s/240));
     band(mats.channel,Math.min(dc,incoming)-gap,Math.max(dc,incoming)+gap,-m,m,ROAD+.006);
     for(const [a,b] of warningBands(2*m)){
      const landing=pen?.centre(Math.sign(a+b))??dc;
      band(mats.tactile,landing-1.65,landing+1.65,a,b,ROAD+.012);
     }
     if(pen){
      const floor=(d,e)=>{const p=A(d,e);return new T.Vector3(p.x,Y(p)+ROAD+.006,p.z);};
      staggerKerbs(pen,floor,kerb);
      for(const rail of pen.rails)refugeRails.push(rail.map(([d,e])=>floor(d,e)));
     }
    }
    // Split the road paint at the refuge so studs and yellow bars end on the carriageway.
    const mk=signalCrossingMarkings({at:incoming,width:3.2,roadWidth:2*h,edgeMargin:.5});
    for(const [marks,mat,dy] of [[mk.bars,mats.yellow,ROAD+PAINT],[mk.studs,mats.white,ROAD+PAINT+.004]]){
     for(const b of marks)if(!m||Math.abs(b.z)-b.d/2>=m)rect(mat,(pen?.centre(Math.sign(b.z))??incoming)+(b.x-incoming),b.z,b.w,b.d,dy);
    }
    const stop=g.stopD[σ];rect(mats.white,stop+σ*.1,σ*(m+h)/2+(m?0:σ*.06),.2,h-m-(m?.3:.18));
    laneLines(σ,stop+σ*.2,σ*ext,true);
    if(!m)for(const e of [-.125,.125])rect(mats.white,(stop+σ*ext)/2,e,Math.abs(σ*ext-stop),.1);
    arrows(σ,stop+σ*(15+2));
   }
   // Corridor side: tactile at both corridor crossings, ART crossing markings, ART stop lines, yellow box on the ART lanes.
   for(const τ of [-1,1]){const s0=g.crossS[τ],w=right(s0),mk=signalCrossingMarkings({at:s0,width:3.2,roadWidth:2*w,edgeMargin:.5});
    for(const b of mk.bars)corr(mats.yellow,b.x-b.w/2,b.x+b.w/2,b.z-b.d/2,b.z+b.d/2,PAINT+.004);
    for(const b of mk.studs)corr(mats.white,b.x-b.w/2,b.x+b.w/2,b.z-b.d/2,b.z+b.d/2,PAINT+.006);
    for(const σ of [-1,1])corr(mats.tactile,s0-1.5,s0+1.5,σ*(w+.3),σ*(w+1.2),q=>footpathHeight(q)+.012);
    const stop=j.s-τ*j.stop;corr(mats.white,stop-.1,stop+.1,τ>0?.15:-right(stop)+.15,τ>0?right(stop)-.15:-.15,PAINT+.004);}
   const box=junctionBox(j),local=([x,z])=>({s:j.s-z,lat:-x}),seg=(a,b,w)=>{a=local(a);b=local(b);const N=Math.max(1,Math.ceil(Math.hypot(a.s-b.s,a.lat-b.lat)/2));
    for(let i=0;i<N;i++){const p=[0,1].map(k=>{const t=(i+k)/N,s=a.s+(b.s-a.s)*t,l=a.lat+(b.lat-a.lat)*t;return {s,l};}),dx=p[1].s-p[0].s,dl=p[1].l-p[0].l,L=Math.hypot(dx,dl)||1,ns=-dl/L*w/2,nl=dx/L*w/2;
     const q=[[p[0].s+ns,p[0].l+nl],[p[1].s+ns,p[1].l+nl],[p[1].s-ns,p[1].l-nl],[p[0].s-ns,p[0].l-nl]].map(([s,l])=>{const w2=at(s,l);return [w2.x,sample(s).y+PAINT+.002,w2.z];});out.tri(mats.yellow,q[0],q[1],q[2]);out.tri(mats.yellow,q[0],q[2],q[3]);}};
   box.poly.forEach((p,i)=>seg(p,box.poly[(i+1)%box.poly.length],.3));for(const [a,b] of box.lattice)seg(a,b,.15);
   // Regulatory signs: ahead only on each side approach (no turns into the ART corridor); no entry except SGMTS at each corridor mouth.
   for(const σ of [-1,1]){const p=A(g.stopD[σ]+σ*1.2,σ*(h+fw-.5));records.push({sign:'ahead-only',x:p.x,z:p.z,y:Y(p)+RAISED,face:{x:u.x*σ,z:u.z*σ},junction:j});}
   for(const τ of [-1,1])for(const σ of [-1,1]){const s0=g.crossS[τ]+τ*2.4,p=at(s0,σ*(right(s0)+.6)),r=sample(s0);records.push({sign:'no-entry-sgmts',x:p.x,z:p.z,y:r.y+footpathHeight(s0),face:{x:-r.tx*τ,z:-r.tz*τ},junction:j});}
  }else{
   // Road under the viaduct: straight dual carriageway, central median, footways, lane and edge markings; no conflict with the ART.
   band(mats.road,-ext,ext,-h,h,ROAD);median(-ext,ext);
   for(const τ of [-1,1]){band(mats.walk,-ext,ext,τ*h+τ*.12,τ*(h+fw),RAISED);armKerb(τ,-ext,ext);}
   for(const σ of [-1,1])laneLines(σ,0,σ*ext,false);
  }
  // Close the 31-36 m dark gap between corridor-side connecting lamps and city road lamps on wide outer arms.
  if(j.halfWidth>5&&j.c!==3400){
   for(const σ of [-1,1])for(const τ of [-1,1]){
    // On the skew Road D1 arm, the outer kerb lamp sits beyond the pedestrian deck.
    const setback=j.c===4398&&σ===-1&&τ===-1?1:5;
    const d=σ*(ext-setback),pPole=A(d,τ*(h+.55)),pHead=A(d,τ*(h-.85)),y0=Y(pPole)+RAISED,ch=Math.floor(project(pPole.x,pPole.z)/240),yaw=Math.atan2(n.x*τ,n.z*τ),rot=new T.Euler(0,yaw,0);
    if(batch){
     batch('furn-conn-pole',poleGeo,mats.galvanised,new T.Vector3(pPole.x,y0+5,pPole.z),new T.Vector3(.15,10,.15),rot,ch);
     const pArm=A(d,τ*(h-.15));batch('furn-conn-arm',poleGeo,mats.galvanised,new T.Vector3(pArm.x,y0+9.88,pArm.z),new T.Vector3(.09,.09,1.6),rot,ch);
     batch('furn-conn-lamp',poleGeo,mats.lamp,new T.Vector3(pHead.x,y0+9.95,pHead.z),new T.Vector3(1,.13,.55),rot,ch);
    }
    const lamp={s:project(pHead.x,pHead.z),x:pHead.x,y:y0+9.85,z:pHead.z,kind:'lamp_connecting',road:(j.underpass?'U':'J')+j.c,height:10,axis:{tx:u.x*σ,tz:u.z*σ,lx:-n.x*τ,lz:-n.z*τ}};
    lamps.push(lamp);if(lampPositions)lampPositions.push(lamp);
   }
  }
  for(const mm of out.meshes(group.name))group.add(mm);
 }
 // Signs, lit a little at night (retroreflective plates).
 const signs=new T.Group();signs.name='Junction regulatory signs';scene.add(signs);
 for(const r of records)signPost(signs,r);
 return {lamps,records};
}
