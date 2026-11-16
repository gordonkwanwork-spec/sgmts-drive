// City rebuild: the new road network traced from the OZP S/HSK/2A road reserves (public/lots/ozp-underlay.jpg, world metres:
// x east, z south) and written to public/street/furniture.json `network`, which the game, editor and masks already read.
// Roads continue from the rebuilt corridor crossings (tie = arm end), meet each other as T-junctions (an end snapped onto
// the host centreline), and loop round the D3/D5 roundabout. Checks: no road touches a logistics lot or the corridor reserve;
// other lot overlaps are reported. Run: node scripts/build-city-network.mjs [--overlay out.png]
import fs from 'node:fs';
import {frames,frameAt,nearestOn,centreline,halfWidth,reserveClash,tieFrame,presetOf} from '../src/street/network.js';
import {JUNCTIONS,UNDERPASSES,RAILWAY,railSample} from '../src/alignment.js';
import {pointInPolygon} from '../src/lots/wand.js';
const ctx2d=new Proxy({},{get:(_,k)=>k==='measureText'?()=>({width:0}):k==='createLinearGradient'?()=>({addColorStop(){}}):()=>{},set:()=>true});
globalThis.document??={createElement:()=>({getContext:()=>ctx2d,width:0,height:0})};
const {massingParts}=await import('../src/lots/massing.js'),{sceneryClear}=await import('../src/environment.js');

const file=new URL('../public/street/furniture.json',import.meta.url),data=JSON.parse(fs.readFileSync(file));
const lots=JSON.parse(fs.readFileSync(new URL('../public/lots/lots.json',import.meta.url))).lots;
const LOGISTICS=new Set(['40C-16','42A-22','43A-24','43B-30','43B-south']);
const tie=(c,side)=>({junction:[...JUNCTIONS,...UNDERPASSES].find(j=>Math.abs(j.c-c)<1).c,side});
// Cross-sections: district distributors carry the corridor-arm widths (dual two-lane with a central median).
const D=(cw,median)=>({preset:'distributor',carriageway:cw,median,footpath:3.75}),LOCAL={preset:'local',footpath:3.5},ACCESS={preset:'local',footpath:3};
const RING={x:-128,z:-2478,r:32};
// The ring's seam sits south-east, clear of all four arms (network.js ignores joins within 2 m of a host's ends).
const ring=Array.from({length:49},(_,i)=>{const a=Math.PI/4+i/48*Math.PI*2;return [RING.x+Math.cos(a)*RING.r,RING.z+Math.sin(a)*RING.r];});
// City rebuild 2 (14 Nov 2026): the network is a graph. Every road end is a corridor crossing (tie / end), a junction on
// another road (join / joinEnd, optionally at a shared point = crossroads), a turning head (turningRadius) or the map edge.
// Joining ends are squared to their host below, so no road meets another at a shallow angle.
const ROADS=[
 // West spine: Road D8 under VB1 (Ch 356), west, then north along the Kong Sham Western Highway reserve to the D3/D5 roundabout.
 {id:'d8-west',name:'Road D8',zh:'D8號路',...D(18,3.4),tie:tie(356,1),joinEnd:'roundabout',pts:[[-200,-318],[-290,-334],[-345,-356],[-385,-395],[-402,-450],[-405,-560],[-398,-700],[-385,-800],[-360,-880],[-330,-958],[-273,-1100],[-230,-1257],[-195,-1420],[-170,-1560],[-140,-1700],[-120,-1850],[-128,-1976],[-172,-2104],[-176,-2217],[-165,-2358]]},
 {id:'d8-south-access',name:'Road D8 access',...ACCESS,turningRadius:11,join:'d8-west',pts:[[-205,-322],[-190,-250],[-215,-200],[-265,-186]]},
 {id:'san-wai-street',name:'Street north of site 31A',...LOCAL,turningRadius:11,join:'d8-west',pts:[[-405,-500],[-345,-545],[-300,-562],[-173,-573],[-108,-584]]},
 // Road D7 west of A2: the commercial street, its northern loop and the southern stub, each ending in a turning head.
 {id:'d7',name:'Road D7',zh:'D7號路',...LOCAL,carriageway:7.3,turningRadius:12,join:'d8-west',pts:[[-392,-765],[-330,-731],[-250,-722],[-168,-728]]},
 {id:'d7-north',name:'Road D7',zh:'D7號路',...ACCESS,turningRadius:11,join:'d7',pts:[[-228,-724],[-224,-790],[-210,-860],[-175,-900],[-110,-912],[-68,-906]]},
 {id:'d7-south',name:'Road D7',zh:'D7號路',...ACCESS,turningRadius:11,join:'d7',pts:[[-301,-737],[-305,-660],[-307,-600]]},
 {id:'ra2-access',name:'R(A)2 access',...ACCESS,turningRadius:11,join:'d8-west',pts:[[-250,-1190],[-180,-1186],[-110,-1183]]},
 // Road D8 east of the corridor, north-east past Yick Yuen to Tin Ha Road.
 {id:'d8-east',name:'Road D8',zh:'D8號路',...D(18,3.4),tie:tie(356,-1),joinEnd:'tin-ha',pts:[[40,-302],[120,-305],[175,-335],[225,-385],[262,-440],[300,-510],[360,-595],[420,-680],[470,-750],[520,-795],[560,-812]]},
 {id:'yick-yuen',name:'Yick Yuen access',...ACCESS,turningRadius:11,join:'d8-east',pts:[[277,-470],[230,-520],[190,-556]]},
 {id:'station-street',name:'Station street',...LOCAL,turningRadius:12,join:'d8-east',pts:[[398,-650],[300,-715],[195,-770]]},
 // East spine: Tin Ha Road from Castle Peak Road north to Ha Tsuen Road and on towards Tin Shui Wai.
 {id:'tin-ha',name:'Tin Ha Road',zh:'田廈路',...D(16.6,2),joinEnd:'hatsuen-east',atEnd:[492,-2210],pts:[[612,-690],[606,-790],[604,-915],[600,-1100],[582,-1300],[548,-1480],[524,-1600],[515,-1750],[515,-1900],[512,-2050]]},
 {id:'tin-ha-north',name:'Tin Ha Road',zh:'田廈路',...D(16.6,2),join:'hatsuen-east',at:[492,-2210],pts:[[497,-2203],[540,-2290],[620,-2390],[690,-2455],[740,-2500]]},
 // Crossing road (Ch 1680): west to the spine, east past Road D6 to Tin Ha Road.
 {id:'crossing-west',name:'Crossing road',...LOCAL,carriageway:7.3,tie:tie(1680,1),joinEnd:'d8-west',pts:[[-60,-1546],[-120,-1563]]},
 {id:'crossing-east',name:'Crossing road',...LOCAL,carriageway:7.3,tie:tie(1680,-1),joinEnd:'tin-ha',pts:[[200,-1468],[270,-1452],[320,-1456],[365,-1490],[433,-1551]]},
 {id:'gic-access',name:'G/IC access',...ACCESS,turningRadius:11,join:'crossing-west',pts:[[-45,-1542],[-55,-1450],[-60,-1362]]},
 // Road D6 beside the railway: from the crossing road south to the station, then east to Tin Ha Road.
 // Road D6 runs 24 m west of the railway viaduct to a turning head north of the station (it never passes under the deck).
 {id:'d6',name:'Road D6',zh:'D6號路',...D(16.6,2),loose:4,turningRadius:14,join:'crossing-east',pts:[[285,-1452],[257,-1300],[236,-1240],[215,-1175],[190,-1100],[180,-1070]]},
 {id:'ra1-access',name:'R(A)1 access',...ACCESS,turningRadius:11,join:'d6',pts:[[205,-1140],[150,-1157],[106,-1172]]},
 // Station north road: the OZP cul-de-sac east of the railway, from Tin Ha Road.
 {id:'station-north',name:'Station north road',...LOCAL,turningRadius:12,join:'tin-ha',pts:[[604,-916],[560,-918],[450,-922],[288,-927]]},
 // Ha Tsuen Road (Road D5) crosses at Ch 2547, between logistics lots 42A and 43A to the D3/D5 roundabout.
 {id:'hatsuen-west',name:'Ha Tsuen Road',zh:'廈村路',...D(16.6,2),tie:tie(2547,1),joinEnd:'roundabout',pts:[[250,-2343],[175,-2366],[100,-2396],[20,-2426]]},
 {id:'hatsuen-east',name:'Ha Tsuen Road',zh:'廈村路',...D(16.6,2),tie:tie(2547,-1),pts:[[450,-2232],[540,-2185],[620,-2142],[700,-2100]]},
 {id:'logistics-access',name:'Logistics access',...ACCESS,turningRadius:12,join:'hatsuen-west',pts:[[86,-2400],[82,-2300],[78,-2100],[76,-1965],[110,-1912],[195,-1895]]},
 // Road D3: under VB2 (Ch 3400) south to the roundabout, north to the D1/D4 crossroads and on under VB3 as Road D1.
 {id:'d3-south',name:'Road D3',zh:'D3號路',...D(20,5.4),tie:tie(3400,1),joinEnd:'roundabout',pts:[[-108,-2600]]},
 {id:'d3-d1',name:'Road D3',zh:'D3號路',...D(20,5.4),tie:tie(3400,-1),pts:[[-100,-2860],[-96,-3000],[-90,-3120],[-78,-3215],[-62,-3300]],end:tie(4398,-1)},
 {id:'roundabout',name:'D3/D5 roundabout',preset:'local',carriageway:8,footpath:3.5,lines:'none',loop:true,pts:ring},
 {id:'d5-west',name:'Road D5',zh:'D5號路',...D(16.6,2),join:'roundabout',pts:[[-160,-2488],[-240,-2512],[-300,-2527],[-400,-2556],[-480,-2578],[-560,-2600],[-630,-2618]]},
 // Road D1: crosses at Ch 3971 (squared to 20° within the 46 m reserve), west to Ha Tsuen, east to the D1/D3/D4 crossroads.
 {id:'d1-west',name:'Road D1',zh:'D1號路',...D(18,3.4),tie:tie(3971,1),pts:[[-405,-3066],[-480,-3016],[-560,-2966],[-640,-2920]]},
 {id:'d1-east',name:'Road D1',zh:'D1號路',...D(18,3.4),tie:tie(3971,-1),joinEnd:'d3-d1',atEnd:[-78,-3214],pts:[[-230,-3160],[-160,-3184]]},
 {id:'d4',name:'Road D4',zh:'D4號路',...D(16.6,2),join:'d3-d1',at:[-78,-3214],pts:[[-56,-3217],[40,-3222],[120,-3238],[201,-3256],[270,-3288],[320,-3320],[385,-3378],[440,-3431],[503,-3494]]},
 {id:'d4-north',name:'Road D4 access',...ACCESS,turningRadius:11,join:'d4',pts:[[114,-3245],[110,-3330],[125,-3365],[156,-3379]]},
 {id:'industry-access',name:'Industry Park access',...ACCESS,turningRadius:11,join:'d1-west',pts:[[-520,-2997],[-478,-2900],[-440,-2800]]},
 {id:'d1-north',name:'Road D1',zh:'D1號路',...D(20,5.4),tie:tie(4398,1),pts:[[0,-3540],[40,-3600],[90,-3680],[140,-3760]]},
 {id:'d2-link',name:'Road D2',zh:'D2號路',...LOCAL,join:'d1-north',at:[40,-3600],pts:[[46,-3608],[130,-3640],[217,-3672],[300,-3745]]},
 {id:'fung-kong-access',name:'Fung Kong access',...ACCESS,turningRadius:11,join:'d1-north',at:[40,-3600],pts:[[30,-3598],[-60,-3600],[-150,-3617]]},
];

// Centre each road in its OZP reserve: resample every ~18 m, then nudge each free point along its normal to midway between the
// nearest lot edges either side (or to a clearance of half-width + 1.5 m where only one side is zoned), then smooth.
// Logistics lots get 2.5 m. ponytail: ray-casts every lot edge per point (O(points × edges)); fine for a one-off build script.
const edges=lots.flatMap(l=>l.poly.map((p,i)=>[p,l.poly[(i+1)%l.poly.length],LOGISTICS.has(l.id)]));
// The railway viaduct (9 m either side of its centreline) counts as a lot edge, so a road beside it centres clear of the piers.
const RAIL=[];for(let s=RAILWAY.start;s<=RAILWAY.end;s+=2){const p=railSample(s);RAIL.push([p.x,p.z]);}
for(const side of [-9,9])for(let i=1;i<RAIL.length;i++){const [ax,az]=RAIL[i-1],[bx,bz]=RAIL[i],L=Math.hypot(bx-ax,bz-az);if(L<.1)continue;const nx=-(bz-az)/L*side,nz=(bx-ax)/L*side;edges.push([[ax+nx,az+nz],[bx+nx,bz+nz],true]);}
const ray=(px,pz,nx,nz,max)=>{let best=max,logi=false;for(const [a,b,lg] of edges){const ex=b[0]-a[0],ez=b[1]-a[1],den=nx*ez-nz*ex;if(Math.abs(den)<1e-9)continue;
 const t=((a[0]-px)*ez-(a[1]-pz)*ex)/den,u=((a[0]-px)*nz-(a[1]-pz)*nx)/den;if(t>0&&t<best&&u>=0&&u<=1){best=t;logi=lg;}}return {d:best,logi};};
function resample(P,step=18){const out=[P[0]];for(let i=1;i<P.length;i++){const [ax,az]=P[i-1],[bx,bz]=P[i],n=Math.max(1,Math.round(Math.hypot(bx-ax,bz-az)/step));for(let k=1;k<=n;k++)out.push([ax+(bx-ax)*k/n,az+(bz-az)*k/n]);}return out;}
function centre(P,hw,fixed){for(let it=0;it<5;it++){const next=P.map(p=>[...p]);
  for(let i=0;i<P.length;i++){if(fixed(i,P.length))continue;const a=P[Math.max(0,i-1)],b=P[Math.min(P.length-1,i+1)],L=Math.hypot(b[0]-a[0],b[1]-a[1])||1,nx=-(b[1]-a[1])/L,nz=(b[0]-a[0])/L;
   const pp=ray(P[i][0],P[i][1],nx,nz,45),pm=ray(P[i][0],P[i][1],-nx,-nz,45),need=lg=>hw+(lg?2.5:1.5);let shift=0;
   if(pp.d<45&&pm.d<45)shift=(pp.d-pm.d)/2;else if(pp.d<need(pp.logi))shift=-(need(pp.logi)-pp.d);else if(pm.d<need(pm.logi))shift=need(pm.logi)-pm.d;
   shift=Math.max(-6,Math.min(6,shift));next[i]=[P[i][0]+nx*shift,P[i][1]+nz*shift];}
  for(let i=0;i<P.length;i++)if(!fixed(i,P.length)){const a=next[Math.max(0,i-1)],b=next[Math.min(P.length-1,i+1)];P[i]=[(a[0]+2*next[i][0]+b[0])/4,(a[1]+2*next[i][1]+b[1])/4];}}
 return P;}
const byId=new Map();const out=[];
for(const R of ROADS){let pts=R.pts.map(p=>[...p]);
 if(R.tie){const f=tieFrame(R.tie);pts=[[f.x,f.z],[f.x+f.tx*28,f.z+f.tz*28],...pts.filter(p=>(p[0]-f.x)*f.tx+(p[1]-f.z)*f.tz>40)];}
 if(R.end){const f=tieFrame(R.end);pts=[...pts.filter(p=>(p[0]-f.x)*f.tx+(p[1]-f.z)*f.tz>40),[f.x+f.tx*28,f.z+f.tz*28],[f.x,f.z]];}
 const road={id:'city-'+R.id,name:R.name+(R.zh?' '+R.zh:''),preset:R.preset,footway:'red',standard:'sandbox',source:'OZP S/HSK/2A road reserve, city rebuild 2026-11-14',pts,
  ...(R.carriageway?{carriageway:R.carriageway}:{}),...(R.median?{median:R.median}:{}),...(R.footpath?{footpath:R.footpath}:{}),...(R.turningRadius?{turningRadius:R.turningRadius}:{}),
  ...(R.lines?{lines:R.lines}:{}),...(R.loop?{loop:true}:{}),...(R.tie?{tie:R.tie}:{}),...(R.end?{endTie:R.end}:{})};
 if(!R.loop){const keepStart=R.tie?2:R.join?1:0,keepEnd=R.end?2:R.joinEnd?1:0;road.pts=centre(resample(pts),halfWidth(road),(i,n)=>i<keepStart||i>=n-keepEnd);}
 byId.set(R.id,{R,road});out.push(road);}
// Junctions: the joining end is snapped exactly onto the host centreline (network.js joins ends within 1 m) and leaves it
// square: straight along the host's normal (the radius, on the roundabout) to NECK m past the host's footway, aimed at a
// control point LEAD m out, before the road's own line resumes. R.at / R.atEnd: a shared point, so two roads meeting a
// host there from opposite sides form a crossroads. Each road is finally smoothed (Chaikin corner cutting, which keeps the
// end tangents), so approaches and reserve-centring leave sweeping curves, not kinks.
const ZONE=26,LEAD=34,NECK=10,SKEW=20*Math.PI/180,done=new Map();// TPDM: junction angle 70–110°
// Douglas–Peucker: drop control points that sit within tol m of the line through their neighbours (reserve-centring jitter).
const simplify=(P,tol)=>{if(P.length<3)return P;const [a,b]=[P[0],P.at(-1)],L=Math.hypot(b[0]-a[0],b[1]-a[1])||1;let worst=0,k=0;
 for(let i=1;i<P.length-1;i++){const d=Math.abs((P[i][0]-a[0])*(b[1]-a[1])-(P[i][1]-a[1])*(b[0]-a[0]))/L;if(d>worst){worst=d;k=i;}}
 return worst<=tol?[a,b]:[...simplify(P.slice(0,k+1),tol).slice(0,-1),...simplify(P.slice(k),tol)];};
const chaikin=(P,n=3)=>{for(;n-->0&&P.length>2;){const Q=[P[0]];for(let i=0;i<P.length-1;i++){const a=P[i],b=P[i+1];Q.push([.75*a[0]+.25*b[0],.75*a[1]+.25*b[1]],[.25*a[0]+.75*b[0],.25*a[1]+.75*b[1]]);}Q.push(P.at(-1));P=Q;}return P;};
// Gordon (16 Nov): no kinks, roads must be smooth. The control line (reserve-centred, simplified) is filleted: every corner
// becomes a circular arc of the road's minimum radius tangent to both legs, with straight runs between. Corners too close to
// fit their arcs are merged into one corner where they turn the same way (the intersection of the outer legs); an S-bend that
// cannot fit shares the room with smaller radii (reported). s0 / s1: metres at each end that stay straight (junction necks,
// corridor stubs).
const RMIN=r=>presetOf(r).median>0?60:45;
const unit=(a,b)=>{const l=Math.hypot(b[0]-a[0],b[1]-a[1])||1;return [(b[0]-a[0])/l,(b[1]-a[1])/l,l];};
const meet=(a,b,c,d)=>{const r=[b[0]-a[0],b[1]-a[1]],q=[d[0]-c[0],d[1]-c[1]],den=r[0]*q[1]-r[1]*q[0];if(Math.abs(den)<1e-9)return null;const t=((c[0]-a[0])*q[1]-(c[1]-a[1])*q[0])/den;return [a[0]+r[0]*t,a[1]+r[1]*t];};
function fillet(V,rmin,s0,s1,report,straight=[]){V=V.map(p=>[...p]).filter((p,i,a)=>!i||Math.hypot(p[0]-a[i-1][0],p[1]-a[i-1][1])>.5);
 const defl=i=>{const [ax,az]=unit(V[i-1],V[i]),[bx,bz]=unit(V[i],V[i+1]);return Math.atan2(ax*bz-az*bx,ax*bx+az*bz);};
 const R=V.map(()=>rmin),T=i=>i<=0||i>=V.length-1?0:R[i]*Math.tan(Math.abs(defl(i))/2);
 // Room on segment i: fs for vertex i's arc (from the segment start), fe for vertex i+1's arc (from its end); straight ends cap them.
 const room=i=>{const len=unit(V[i],V[i+1])[2];return {len,fs:Math.max(0,len-(i===V.length-2?s1:0)),fe:Math.max(0,len-(i===0?s0:0))};};
 const shrink=k=>(cap)=>{R[k]=Math.max(5,cap/Math.max(1e-6,Math.tan(Math.abs(defl(k))/2)));report(R[k]);};
 for(let pass=0;pass<600;pass++){let fixed=true;
  for(let i=0;i<V.length-1&&fixed;i++){const {len,fs,fe}=room(i),a=T(i),b=T(i+1);if(a<=fs+1e-6&&b<=fe+1e-6&&a+b<=len+1e-6)continue;fixed=false;
   if(i===0&&b>fe+1e-6&&V.length>3){// the first corner hard against the straight start: slide it out along the start line
    const [ux,uz]=unit(V[0],V[1]),need=len+(b-fe)+.5;if(unit(V[0],V[2])[2]>need+T(2)+1){V[1]=[V[0][0]+ux*need,V[0][1]+uz*need];break;}
    const X=V.length>3?meet(V[0],V[1],V[3],V[2]):null;if(X&&(X[0]-V[0][0])*ux+(X[1]-V[0][1])*uz>need){V.splice(1,2,X);R.splice(1,2,rmin);break;}}
   if(i===V.length-2&&a>fs+1e-6&&V.length>3){const e=V.length-1,[ux,uz]=unit(V[e],V[e-1]),need=len+(a-fs)+.5;if(unit(V[e],V[e-2])[2]>need+T(e-2)+1){V[e-1]=[V[e][0]+ux*need,V[e][1]+uz*need];break;}
    const X=meet(V[e],V[e-1],V[e-3],V[e-2]);if(X&&(X[0]-V[e][0])*ux+(X[1]-V[e][1])*uz>need){V.splice(e-2,2,X);R.splice(e-2,2,rmin);break;}}
   if(a+b>len+1e-6&&a<=fs+1e-6&&b<=fe+1e-6&&i>0&&i<V.length-2){const da=defl(i),db=defl(i+1);
    if(Math.sign(da)===Math.sign(db)&&Math.abs(da+db)<Math.PI*.9){const X=meet(V[i-1],V[i],V[i+2],V[i+1]);if(X){V.splice(i,2,X);R.splice(i,2,rmin);break;}}
    const f=len/(a+b);R[i]*=f;R[i+1]*=f;report(Math.min(R[i],R[i+1]));break;}
   if(a>fs+1e-6)shrink(i)(fs);if(b>fe+1e-6)shrink(i+1)(fe);if(T(i)+T(i+1)>len+1e-6){const f=len/(T(i)+T(i+1));R[i]*=f;R[i+1]*=f;report(Math.min(R[i],R[i+1]));}break;}
  if(fixed)break;}
 const out=[V[0]];let run=0;const line=(p,q)=>{const L=Math.hypot(q[0]-p[0],q[1]-p[1]),n=Math.max(1,Math.ceil(L/2));straight.push([run,run+L]);run+=L;for(let k=1;k<=n;k++)out.push([p[0]+(q[0]-p[0])*k/n,p[1]+(q[1]-p[1])*k/n]);};
 for(let i=1;i<V.length-1;i++){const t=T(i),[ax,az]=unit(V[i-1],V[i]),p=[V[i][0]-ax*t,V[i][1]-az*t],th=defl(i);line(out.at(-1),p);if(Math.abs(th)<1e-4)continue;
  const sg=Math.sign(th),c=[p[0]-az*R[i]*sg,p[1]+ax*R[i]*sg],a0=Math.atan2(p[1]-c[1],p[0]-c[0]),n=Math.max(1,Math.ceil(R[i]*Math.abs(th)/2));
  for(let k=1;k<=n;k++){const ang=a0+th*k/n;out.push([c[0]+Math.cos(ang)*R[i],c[1]+Math.sin(ang)*R[i]]);}run+=R[i]*Math.abs(th);}
 line(out.at(-1),V.at(-1));return out;}
function finish(id){if(done.has(id))return done.get(id);const {R,road}=byId.get(id);done.set(id,road);if(R.loop)return road;
 let mid=road.pts.map(p=>[...p]),head=[],tail=[],s0=0,s1=0;
 // corridor ties: the 28 m stub stays on the arm axis; a control point 50 m out keeps the curve tangent to it
 if(R.tie){const f=tieFrame(R.tie);head=[mid[0],mid[1],[f.x+f.tx*50,f.z+f.tz*50]];mid=mid.slice(2).filter(p=>(p[0]-f.x)*f.tx+(p[1]-f.z)*f.tz>70);}
 if(R.end){const f=tieFrame(R.end);tail=[[f.x+f.tx*50,f.z+f.tz*50],mid.at(-2),mid.at(-1)];mid=mid.slice(0,-2).filter(p=>(p[0]-f.x)*f.tx+(p[1]-f.z)*f.tz>70);}
 mid=simplify(mid,R.loose??10);// drop the reserve-centring wiggles: the road's own line as a few long legs
 for(const [hostId,atEnd,at] of [[R.join,false,R.at],[R.joinEnd,true,R.atEnd]]){if(!hostId)continue;const host=finish(hostId);// hosts first: their final line is what we meet
  const line=atEnd?[...head,...mid].reverse():[...mid,...tail],Q0=atEnd?[...mid].reverse():[...mid],HF=frames(host),d0=nearestOn(HF,...(at||line[0]||(atEnd?road.pts.at(-1):road.pts[0]))).d;
  // The host is straight through the mouth (network.js straightens it there for the kerb returns; on a curve that is a kink):
  // slide the junction along the host to the nearest straight run with ZONE m clear either side.
  const runs=STRAIGHT.get(hostId)||[[0,HF.at(-1).d]],fits=runs.filter(([a,b])=>b-a>=2*ZONE).map(([a,b])=>Math.max(a+ZONE,Math.min(b-ZONE,d0))).sort((x,y)=>Math.abs(x-d0)-Math.abs(y-d0));
  const dj=host.loop?d0:fits.length?fits[0]:d0;/* a roundabout keeps its arms where they are */if(!host.loop&&!fits.length)notes0.push(`${road.id} joins ${hostId} on a bend (no straight ${2*ZONE} m run)`);else if(Math.abs(dj-d0)>1)notes0.push(`${road.id} junction moved ${(dj-d0).toFixed(0)} m along ${hostId} onto a straight`);
  const f=frameAt(HF,dj),J=[f.x,f.z],ref=line.find(q=>Math.hypot(q[0]-J[0],q[1]-J[1])>30)||line.at(-1);
  // Leave along the host's normal, turned up to SKEW towards the road's own line (a 70–110° junction, TPDM).
  const s=Math.sign((ref[0]-J[0])*f.lx+(ref[1]-J[1])*f.lz)||1,n=[f.lx*s,f.lz*s],rl=Math.hypot(ref[0]-J[0],ref[1]-J[1])||1,d=[(ref[0]-J[0])/rl,(ref[1]-J[1])/rl];
  const turn=Math.max(-SKEW,Math.min(SKEW,Math.atan2(n[0]*d[1]-n[1]*d[0],n[0]*d[0]+n[1]*d[1]))),c=Math.cos(turn),k=Math.sin(turn),dir=[n[0]*c-n[1]*k,n[0]*k+n[1]*c];
  const neck=halfWidth(host)/c+NECK,out=t=>[J[0]+dir[0]*t,J[1]+dir[1]*t],proj=q=>(q[0]-J[0])*dir[0]+(q[1]-J[1])*dir[1];
  // The neck runs straight to `neck` m; the road turns onto its own line at the corner where the neck's line meets the road's
  // first leg beyond it (20 m past the neck when they do not meet ahead). Points behind the corner are dropped.
  let Q=Q0.filter(q=>proj(q)>neck+10);const X=Q.length>1?meet(J,out(1),Q[0],Q[1]):null,corner=X&&proj(X)>neck&&proj(X)<neck+150?X:out(neck+20);
  Q=Q.filter(q=>proj(q)>proj(corner)+5);
  if(atEnd){mid=[...Q.reverse(),corner];tail=[J];s1=neck;}else{mid=[corner,...Q];head=[J];s0=neck;}}
 let least=Infinity;const st=[];road.pts=fillet([...head,...mid,...tail],R.rmin??RMIN(road),s0,s1,r=>least=Math.min(least,r),st);STRAIGHT.set(R.id,st.filter(([a,b])=>b-a>1));
 if(least<(R.rmin??RMIN(road)))notes0.push(`${road.id}: a ${least.toFixed(0)} m bend (minimum ${R.rmin??RMIN(road)} m)`);return road;}
const notes0=[],STRAIGHT=new Map();// road id → straight runs [from, to] along it (m)
for(const R of ROADS)finish(R.id);
// Round to centimetres, except the exact corridor tie points (the arm seams must meet to the micron) and junction ends.
const exact=(r,R,i,n)=>(R.tie||R.join)&&i===0||(R.end||R.joinEnd)&&i===n-1;
for(const {R,road:r} of byId.values())r.pts=r.pts.map(([x,z],i,a)=>exact(r,R,i,a.length)?[x,z]:[+x.toFixed(2),+z.toFixed(2)]);

// Checks.
const fails=[],notes=[];
const sampleRoad=(r,extra=0)=>{const P=centreline(r.pts),hw=halfWidth(r)+extra,pts=[];for(let i=1;i<P.length;i++){const [ax,az]=P[i-1],[bx,bz]=P[i],L=Math.hypot(bx-ax,bz-az),n=Math.max(1,Math.ceil(L/3));for(let k=0;k<=n;k++){const t=k/n,x=ax+(bx-ax)*t,z=az+(bz-az)*t,dx=(bx-ax)/L,dz=(bz-az)/L;for(const e of [-hw,0,hw])pts.push([x-dz*e,z+dx*e]);}}return pts;};
// Gordon (5 Nov): keep the logistics buildings; roads go around them. Hard check = their footprints as the game places them
// (allowedKept in experience.js: scenery clearance only) + 2 m.
const keepBuildings=lots.filter(l=>LOGISTICS.has(l.id)).flatMap(l=>massingParts(l,{ground:()=>0,allowed:(x,z,r)=>sceneryClear(x,z,r)}).footprints.map(poly=>({lot:l.id,poly})));
for(const r of out){
 for(const p of sampleRoad(r,2))for(const b of keepBuildings)if(pointInPolygon(p,b.poly)){fails.push(`${r.id} reaches a ${b.lot} logistics building at ${p.map(v=>v.toFixed(0))}`);break;}
 if(!r.tie){const clash=reserveClash(centreline(r.pts),{width:halfWidth(r)});if(clash)fails.push(`${r.id} enters the corridor reserve at ${clash.map(v=>v.toFixed(0))}`);}
 else{const clash=reserveClash(centreline(r.pts).slice(2),{width:halfWidth(r)});if(clash)fails.push(`${r.id} enters the corridor reserve at ${clash.map(v=>v.toFixed(0))}`);}
 const pts=sampleRoad(r);
 // Only the Road D8 underpass passes the railway (beside VB1, between the piers); everything else stays 6 m off the deck line.
 if(!/d8-(west|east)$/.test(r.id)){const hit=pts.filter((_,i)=>i%3===1).find(p=>RAIL.some(q=>Math.hypot(p[0]-q[0],p[1]-q[1])<halfWidth(r)+6));/* centreline within half width + 6 m, as city-network.test.js */if(hit)fails.push(`${r.id} runs under the railway viaduct at ${hit.map(v=>v.toFixed(0))}`);}
 for(const lot of lots){const hits=pts.filter(p=>pointInPolygon(p,lot.poly));if(!hits.length)continue;
  notes.push((LOGISTICS.has(lot.id)?'LOGISTICS LOT EDGE · ':'')+`${r.id} overlaps ${lot.id} (${lot.zone}) at ${hits.length} sample points, e.g. ${hits[0].map(v=>v.toFixed(0))}`);}
}
console.log(notes0.join('\n')||'Every bend meets its minimum radius.');console.log(`Checked against ${keepBuildings.length} logistics building footprints.`);console.log(notes.join('\n')||'No lot overlaps.');
if(fails.length){console.error('FAIL\n'+fails.join('\n'));if(!process.argv.includes('--force'))process.exit(1);}
data.network={source:'OZP S/HSK/2A road reserves traced on the project underlay; city rebuild 2026-11-14',scope:'SGMTS corridor plus the OZP road network around it; logistics lots untouched',roads:out,
 areas:[{id:'roundabout-island',finish:'grass',pts:Array.from({length:24},(_,i)=>{const a=i/24*Math.PI*2,r=RING.r-presetOf({preset:'local',carriageway:8}).carriageway/2-.6;return [+(RING.x+Math.cos(a)*r).toFixed(2),+(RING.z+Math.sin(a)*r).toFixed(2)];})}]};
const d=x=>JSON.stringify(x);
fs.writeFileSync(file,'{'+Object.entries(data).map(([k,v])=>d(k)+':'+(Array.isArray(v)?'[\n'+v.map(d).join(',\n')+'\n]':d(v))).join(',')+'}\n');
console.log(`${out.length} city roads written; ${fails.length} blocking issues.`);
// Depot service road run-in: where the road from the depot's west side (its second point) meets Road D5's north kerb, at
// footway level. depot.js reads it, so the mouth follows Road D5 whenever the network is rebuilt.
{const {junctions}=await import('../src/street/network.js'),{renderedGround}=await import('../src/environment.js'),{CV_ROAD}=await import('../src/depot.js');
 const d5=junctions(data.network,renderedGround).roads.find(o=>o.r.id==='city-d5-west'),n=nearestOn(d5.F,CV_ROAD[1].x,CV_ROAD[1].z),f=n.f,h=Math.sign(n.lat)*d5.P.carriageway/2;
 fs.writeFileSync(new URL('../src/city/depot-mouth.json',import.meta.url),JSON.stringify({x:+(f.x+f.lx*h).toFixed(2),z:+(f.z+f.lz*h).toFixed(2),y:+(f.y+.18).toFixed(2)})+'\n');}
if(process.argv.includes('--overlay'))fs.writeFileSync(process.argv[process.argv.indexOf('--overlay')+1],JSON.stringify(out.map(r=>({id:r.id,pts:centreline(r.pts),hw:halfWidth(r),cw:presetOf(r).carriageway/2}))));
