// City rebuild: the new road network traced from the OZP S/HSK/2A road reserves (public/lots/ozp-underlay.jpg, world metres:
// x east, z south) and written to public/street/furniture.json `network`, which the game, editor and masks already read.
// Roads continue from the rebuilt corridor crossings (tie = arm end), meet each other as T-junctions (an end snapped onto
// the host centreline), and loop round the D3/D5 roundabout. Checks: no road touches a logistics lot or the corridor reserve;
// other lot overlaps are reported. Run: node scripts/build-city-network.mjs [--overlay out.png]
import fs from 'node:fs';
import {frames,nearestOn,centreline,halfWidth,reserveClash,tieFrame,presetOf} from '../src/street/network.js';
import {JUNCTIONS,UNDERPASSES} from '../src/alignment.js';
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
const RING={x:-128,z:-2478,r:24};
// The ring's seam sits south-east, clear of all four arms (network.js ignores joins within 2 m of a host's ends).
const ring=Array.from({length:33},(_,i)=>{const a=Math.PI/4+i/32*Math.PI*2;return [RING.x+Math.cos(a)*RING.r,RING.z+Math.sin(a)*RING.r];});
const ROADS=[
 // Road D8: under VB1 (Ch 356) west to the Kong Sham Western Highway reserve, east then north-east past Yick Yuen.
 {id:'d8-west',name:'Road D8',zh:'D8號路',...D(18,3.4),tie:tie(356,1),pts:[[-200,-318],[-290,-334],[-350,-358],[-392,-405],[-410,-440]]},
 {id:'d8-east',name:'Road D8',zh:'D8號路',...D(18,3.4),tie:tie(356,-1),pts:[[40,-302],[120,-305],[175,-335],[225,-385],[262,-440],[300,-510],[360,-595],[420,-680],[480,-765]]},
 {id:'yick-yuen',name:'Yick Yuen access',...ACCESS,turningRadius:11,join:'d8-east',pts:[[277,-470],[230,-520],[190,-556]]},
 // Crossing road (Ch 1680): west to the highway junction reserve, east to Road D6 beside the railway.
 {id:'crossing-west',name:'Crossing road',...LOCAL,carriageway:7.3,tie:tie(1680,1),pts:[[-60,-1546],[-120,-1563],[-170,-1586]]},
 {id:'crossing-east',name:'Crossing road',...LOCAL,carriageway:7.3,tie:tie(1680,-1),join:'d6',pts:[[200,-1468],[270,-1450]]},
 {id:'gic-access',name:'G/IC access',...ACCESS,turningRadius:11,join:'crossing-west',pts:[[-45,-1542],[-55,-1450],[-60,-1362]]},
 {id:'d6',name:'Road D6',zh:'D6號路',...D(16.6,2),turningRadius:14,pts:[[292,-1452],[262,-1300],[235,-1150],[205,-1000],[180,-905]]},
 {id:'ra1-access',name:'R(A)1 access',...ACCESS,turningRadius:11,join:'d6',pts:[[222,-1138],[150,-1157],[106,-1172]]},
 // Ha Tsuen Road (Road D5) crosses at Ch 2547, between logistics lots 42A and 43A to the D3/D5 roundabout.
 {id:'hatsuen-west',name:'Ha Tsuen Road',zh:'廈村路',...D(16.6,2),tie:tie(2547,1),join:'roundabout',pts:[[250,-2343],[175,-2366],[100,-2396],[20,-2426],[-60,-2456],[-105,-2470]]},
 {id:'hatsuen-east',name:'Ha Tsuen Road',zh:'廈村路',...D(16.6,2),tie:tie(2547,-1),pts:[[450,-2232],[540,-2185],[620,-2142],[700,-2100]]},
 {id:'logistics-access',name:'Logistics access',...ACCESS,turningRadius:12,join:'hatsuen-west',pts:[[86,-2400],[82,-2300],[78,-2100],[76,-1965],[110,-1912],[195,-1895]]},
 // Road D3: under VB2 (Ch 3400) south to the roundabout, north to the D1/D4 crossroads and on under VB3 as Road D1.
 {id:'d3-south',name:'Road D3',zh:'D3號路',...D(20,5.4),tie:tie(3400,1),join:'roundabout',pts:[[-108,-2600],[-118,-2540],[-125,-2502]]},
 {id:'d3-d1',name:'Road D3',zh:'D3號路',...D(20,5.4),tie:tie(3400,-1),pts:[[-100,-2860],[-96,-3000],[-90,-3120],[-78,-3215],[-62,-3300]],end:tie(4398,-1)},
 {id:'roundabout',name:'D3/D5 roundabout',preset:'local',carriageway:8,footpath:3.5,lines:'none',loop:true,pts:ring},
 {id:'d5-west',name:'Road D5',zh:'D5號路',...D(16.6,2),join:'roundabout',pts:[[-152,-2486],[-210,-2505],[-300,-2527],[-400,-2556],[-480,-2578]]},
 {id:'logistics-south',name:'Logistics access south',...LOCAL,turningRadius:12,join:'roundabout',pts:[[-138,-2455],[-165,-2390],[-180,-2300],[-178,-2150],[-160,-2030],[-118,-1962]]},
 // Road D1: crosses at Ch 3971 (squared to 20° within the 46 m reserve), west to Ha Tsuen, east to the D1/D3/D4 crossroads.
 {id:'d1-west',name:'Road D1',zh:'D1號路',...D(18,3.4),tie:tie(3971,1),pts:[[-405,-3066],[-480,-3016],[-560,-2966],[-640,-2920]]},
 {id:'d1-east',name:'Road D1',zh:'D1號路',...D(18,3.4),tie:tie(3971,-1),join:'d3-d1',pts:[[-230,-3160],[-160,-3184],[-100,-3205]]},
 {id:'d4',name:'Road D4',zh:'D4號路',...D(16.6,2),join:'d3-d1',pts:[[-56,-3217],[40,-3238],[150,-3268],[260,-3320],[360,-3385],[440,-3440],[520,-3500]]},
 {id:'d1-north',name:'Road D1',zh:'D1號路',...D(20,5.4),tie:tie(4398,1),pts:[[0,-3540],[40,-3600],[90,-3680],[140,-3760]]},
 // Road D7 west of A2: the commercial street and its northern loop, both ending in turning heads.
 {id:'d7',name:'Road D7',zh:'D7號路',...LOCAL,carriageway:7.3,turningRadius:12,pts:[[-395,-770],[-330,-731],[-250,-722],[-168,-728]]},
 {id:'d7-north',name:'Road D7',zh:'D7號路',...ACCESS,turningRadius:11,join:'d7',pts:[[-228,-724],[-224,-790],[-210,-860],[-175,-900],[-110,-912],[-68,-906]]},
];

// Centre each road in its OZP reserve: resample every ~18 m, then nudge each free point along its normal to midway between the
// nearest lot edges either side (or to a clearance of half-width + 1.5 m where only one side is zoned), then smooth.
// Logistics lots get 2.5 m. ponytail: ray-casts every lot edge per point (O(points × edges)); fine for a one-off build script.
const edges=lots.flatMap(l=>l.poly.map((p,i)=>[p,l.poly[(i+1)%l.poly.length],LOGISTICS.has(l.id)]));
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
 const road={id:'city-'+R.id,name:R.name+(R.zh?' '+R.zh:''),preset:R.preset,footway:'red',standard:'sandbox',source:'OZP S/HSK/2A road reserve, city rebuild 2026-11-05',pts,
  ...(R.carriageway?{carriageway:R.carriageway}:{}),...(R.median?{median:R.median}:{}),...(R.footpath?{footpath:R.footpath}:{}),...(R.turningRadius?{turningRadius:R.turningRadius}:{}),
  ...(R.lines?{lines:R.lines}:{}),...(R.loop?{loop:true}:{}),...(R.tie?{tie:R.tie}:{})};
 if(!R.loop){const keepStart=R.tie?2:R.join?1:0,keepEnd=R.end?2:R.join&&R.tie?1:0;road.pts=centre(resample(pts),halfWidth(road),(i,n)=>i<keepStart||i>=n-keepEnd);}
 byId.set(R.id,{R,road});out.push(road);}
// T-junctions: snap the joining end exactly onto the host centreline (network.js joins ends within 1 m). A road with a corridor
// tie joins at its far end; any other road is listed from its junction outwards.
for(const {R,road} of byId.values()){if(!R.join)continue;const host=byId.get(R.join).road,F=frames(host),k=R.tie?road.pts.length-1:0,p=road.pts[k],q=nearestOn(F,...p).f;road.pts[k]=[+q.x.toFixed(3),+q.z.toFixed(3)];}
for(const r of out)r.pts=r.pts.map(([x,z])=>[+x.toFixed(2),+z.toFixed(2)]);

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
 for(const lot of lots){const hits=pts.filter(p=>pointInPolygon(p,lot.poly));if(!hits.length)continue;
  notes.push((LOGISTICS.has(lot.id)?'LOGISTICS LOT EDGE · ':'')+`${r.id} overlaps ${lot.id} (${lot.zone}) at ${hits.length} sample points, e.g. ${hits[0].map(v=>v.toFixed(0))}`);}
}
console.log(`Checked against ${keepBuildings.length} logistics building footprints.`);console.log(notes.join('\n')||'No lot overlaps.');
if(fails.length){console.error('FAIL\n'+fails.join('\n'));if(!process.argv.includes('--force'))process.exit(1);}
data.network={source:'OZP S/HSK/2A road reserves traced on the project underlay; city rebuild 2026-11-05',scope:'SGMTS corridor plus the OZP road network around it; logistics lots untouched',roads:out,
 areas:[{id:'roundabout-island',finish:'grass',pts:Array.from({length:24},(_,i)=>{const a=i/24*Math.PI*2,r=RING.r-presetOf({preset:'local',carriageway:8}).carriageway/2-.6;return [+(RING.x+Math.cos(a)*r).toFixed(2),+(RING.z+Math.sin(a)*r).toFixed(2)];})}]};
const d=x=>JSON.stringify(x);
fs.writeFileSync(file,'{'+Object.entries(data).map(([k,v])=>d(k)+':'+(Array.isArray(v)?'[\n'+v.map(d).join(',\n')+'\n]':d(v))).join(',')+'}\n');
console.log(`${out.length} city roads written; ${fails.length} blocking issues.`);
if(process.argv.includes('--overlay'))fs.writeFileSync(process.argv[process.argv.indexOf('--overlay')+1],JSON.stringify(out.map(r=>({id:r.id,pts:centreline(r.pts),hw:halfWidth(r),cw:presetOf(r).carriageway/2}))));
