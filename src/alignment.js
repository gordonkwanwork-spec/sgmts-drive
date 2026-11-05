import stationNames from './station-data.json' with {type:'json'};
// Hand-traced ST-1100 key-plan centreline. See docs/rebuild-recon/route-calibration.md.
// x=east, z=south, +s=A1→A7. Dimensions metres; c is approximate profile chainage.
export const DATUM = 8;
// HK1980 Grid ↔ world, from the S/HSK/2A 5 km grid ticks (836500N/831500N, 814500E/819500E) and the OZP↔corridor fit. ±~5 m.
export const HK1980={E:816684.4,N:831649.2};
export const fromHK=(E,N)=>({x:E-HK1980.E,z:HK1980.N-N});
export const METRES_PER_PIXEL = 500 / (112 * 2400 / 1888);
const K = 2400 / 1888;
export const TRACE_PIXELS = [
 [855,1151],[845,1144],[830,1134],[816,1126],[829,1095],[841,1065],[851,1039],
 [849,1028],[844,1012],[846,1000],[854,981],[865,956],[872,941],[869,934],[855,928],
 [844,922],[840,916],[847,898],[861,863],[873,832],[881,809],[881,792],[878,772],
 [878,755],[883,747],[898,741],[907,732],[912,716],[922,686],[933,650],[943,617],
 [944,602],[939,589],[927,572],[915,557],[907,545],[895,539],[880,538],[850,539],
 [816,540],[798,540],[791,535],[788,523],[786,502],[784,482],[783,459],[783,448],
 [786,432],[797,418],[815,405],[835,391],[850,382],[870,375]
].map(([x,y])=>[x*K,y*K]);
const raw = TRACE_PIXELS.map(([x,z])=>({x:(x-TRACE_PIXELS[0][0])*METRES_PER_PIXEL,z:(z-TRACE_PIXELS[0][1])*METRES_PER_PIXEL}));
// ponytail: broad quadratic fillets remove key-plan kinks; surveyed setting-out curves remain the upgrade path.
export const PATH = [raw[0]];
for(let i=1;i<raw.length-1;i++) {
 const a=raw[i-1],b=raw[i],c=raw[i+1];
 const ab=Math.hypot(b.x-a.x,b.z-a.z),bc=Math.hypot(c.x-b.x,c.z-b.z),r=Math.min(65,ab*.48,bc*.48);
 const p={x:b.x+(a.x-b.x)*r/ab,z:b.z+(a.z-b.z)*r/ab};
 const q={x:b.x+(c.x-b.x)*r/bc,z:b.z+(c.z-b.z)*r/bc};
 PATH.push(p);
 for(let j=1;j<=12;j++){const t=j/12,u=1-t;PATH.push({x:u*u*p.x+2*u*t*b.x+t*t*q.x,z:u*u*p.z+2*u*t*b.z+t*t*q.z});}
}
PATH.push(raw.at(-1));
PATH[0].s=0;
for(let i=1;i<PATH.length;i++) PATH[i].s=PATH[i-1].s+Math.hypot(PATH[i].x-PATH[i-1].x,PATH[i].z-PATH[i-1].z);
export let LENGTH=PATH.at(-1).s;
const clamp=(v,a,b)=>Math.max(a,Math.min(b,v));
export function project(x,z,sGuess) {
 let best=0,distance=Infinity;
 for(let i=1;i<PATH.length;i++) {
  const a=PATH[i-1],b=PATH[i];
  if(Number.isFinite(sGuess)&&(b.s<sGuess-100||a.s>sGuess+100)) continue;
  const dx=b.x-a.x,dz=b.z-a.z,t=clamp(((x-a.x)*dx+(z-a.z)*dz)/(dx*dx+dz*dz),0,1);
  const d=(x-a.x-t*dx)**2+(z-a.z-t*dz)**2;
  if(d<distance){distance=d;best=a.s+t*(b.s-a.s);}
 }
 return best;
}
// Polyline projection snaps to a vertex on the outside of a bend, losing sub-centimetre steps; refine in sample()'s frame (the one point() uses).
export function projectFrame(x,z,sGuess){let s=project(x,z,sGuess);for(let i=0;i<3;i++){const r=sample(s);s=clamp(s+(x-r.x)*r.tx+(z-r.z)*r.tz,0,LENGTH);}return s;}
const anchors=[[40,847,1145],[820,854,981],[1470,861,863],[1870,878,772],[2310,922,686],[2890,927,572],[3840,784,482]];
// Densify long trace segments before applying the station straight sections.
const dense=[];for(let i=1;i<PATH.length;i++){const a=PATH[i-1],b=PATH[i],n=Math.ceil((b.s-a.s)/2);for(let j=0;j<n;j++){const t=j/n;dense.push({x:a.x+(b.x-a.x)*t,z:a.z+(b.z-a.z)*t,s:a.s+(b.s-a.s)*t});}}dense.push({...PATH.at(-1)});PATH.splice(0,PATH.length,...dense);
// Remove short-radius kinks inherited from the coarse key-plan trace. The GA
// curves span tens of metres; preserve endpoints and reapply straight platforms below.
const unsmoothed=PATH.map(p=>({...p}));
for(const p of PATH){if(p.s<80||p.s>LENGTH-80)continue;let x=0,z=0,w=0;for(const q of unsmoothed){const d=q.s-p.s;if(Math.abs(d)>65)continue;const weight=Math.exp(-d*d/(2*22*22));x+=q.x*weight;z+=q.z*weight;w+=weight;}const blend=Math.min(1,(p.s-80)/50,(LENGTH-80-p.s)/50);p.x+=(x/w-p.x)*blend;p.z+=(z/w-p.z)*blend;}
// Station GAs show straight platforms. Remove key-plan trace kinks within each
// station footprint, blending back outside it; geographic station anchors stay put.
for(const [,x,z] of anchors){const wx=(x*K-TRACE_PIXELS[0][0])*METRES_PER_PIXEL,wz=(z*K-TRACE_PIXELS[0][1])*METRES_PER_PIXEL,s=project(wx,wz);let i=1;while(PATH[i].s<s)i++;const a=PATH[i-1],b=PATH[i],t=(s-a.s)/(b.s-a.s),cx=a.x+(b.x-a.x)*t,cz=a.z+(b.z-a.z)*t,dx=b.x-a.x,dz=b.z-a.z,n=Math.hypot(dx,dz),lx=dz/n,lz=-dx/n;
 for(const q of PATH){const d=Math.abs(q.s-s),u=clamp((165-d)/110,0,1),w=u*u*u*(10-15*u+6*u*u),cross=(q.x-cx)*lx+(q.z-cz)*lz;q.x-=cross*lx*w;q.z-=cross*lz*w;}
}
for(let i=1;i<PATH.length;i++)PATH[i].s=PATH[i-1].s+Math.hypot(PATH[i].x-PATH[i-1].x,PATH[i].z-PATH[i-1].z);
LENGTH=PATH.at(-1).s;
const mapping=[[0,0],...anchors.map(([c,x,z])=>[c,project((x*K-TRACE_PIXELS[0][0])*METRES_PER_PIXEL,(z*K-TRACE_PIXELS[0][1])*METRES_PER_PIXEL)]),[4526,LENGTH]];
function interp(table,value,a=0,b=1){const v=clamp(value,table[0][a],table.at(-1)[a]);let i=1;while(i<table.length-1&&table[i][a]<v)i++;const p=table[i-1],q=table[i];return p[b]+(q[b]-p[b])*(v-p[a])/(q[a]-p[a]);}
export const fromChainage=c=>interp(mapping,c);
export const toChainage=s=>interp(mapping,s,1,0);
// FRL values read from ACABAS pp.45–51; intermediate at-grade anchors retain the reference profile.
export const PROFILE = [[0,9],[100,9],[140,9.62],[160,9.9],[180,10.48],[200,9.85],[201.8,9.86],[220,10.38],[240,11.35],[260,12.7],[280,14.1],[300,15.5],[308.9,16.17],[320,16.74],[340,17.59],[360,17.93],[371.1,17.94],[390,17.65],[410,16.91],[430,15.65],[450,14.32],[467.9,13.07],[480,12.22],[500,11.07],[520,10.36],[540.3,10.09],[560,10.12],[580,10.45],[600,10.88],[620,11.53],[650,11],[700,12],[780,10],[900,11],[1000,10.5],[1200,13.5],[1350,12.5],[1470,12],[1550,13],[1650,11.5],[1750,12],[1800,11.5],[1870,15],[1950,18],[2050,17.5],[2150,14],[2250,10],[2310,9],[2500,7],[2600,6.5],[2700,7.5],[2800,7],[2890,7.5],[2970,7.4],[3001.2,7.6],[3050,9.02],[3100,11.16],[3150,13.30],[3200,15.45],[3263.87,18.19],[3300,19.74],[3350,21.87],[3370,22.44],[3390,22.66],[3410,22.54],[3423.83,22.25],[3463.83,20.49],[3500,18.65],[3550,17.91],[3600,17.65],[3650,16.77],[3710.9,15.74],[3750,14],[3840,14],[3950,18],[4050,18],[4200,13.55],[4210,13.37],[4230,13.25],[4250,13.49],[4300,15.14],[4338.68,16.63],[4368.68,17.64],[4400,17.99],[4428.68,17.77],[4474.93,17.41],[4526,17.15]];
// Separate the retained U-trough approaches from the open bridge decks.
export const BRIDGES=[
 {id:'VB1',start:201.8,deckStart:308.9,deckEnd:467.9,end:540.3,piers:[341.1,371.1,401.1,431.1],depth:1.8,ground:[[201.8,9.86],[308.9,9.8],[371.1,9],[467.9,9.5],[540.3,10.09]]},
 {id:'VB2',start:3001.2,deckStart:3263.87,deckEnd:3458.4,end:3524.2,piers:[3315.06,3366.24,3423.83],depth:2.5,ground:[[3001.2,7.6],[3263.87,8],[3366.24,8],[3423.83,11],[3458.4,13],[3524.2,18.2]]},
 {id:'VB3',start:4206.84,deckStart:4335.52,deckEnd:4526,end:4526,piers:[4368.68,4428.68,4474.93,4521.18],depth:2.5,ground:[[4210,13.37],[4260,10],[4338.68,8],[4428.68,7.5],[4526,7.5]]}
];
export const ELEVATED_SPANS=BRIDGES.map(b=>[b.start,b.end]);
// Shape-preserving cubic grades avoid instantaneous pitch changes at profile samples.
const slopes=PROFILE.map((p,i)=>{if(!i||i===PROFILE.length-1){const a=PROFILE[Math.max(0,i-1)],b=PROFILE[Math.min(PROFILE.length-1,i+1)];return (b[1]-a[1])/(b[0]-a[0]);}const a=PROFILE[i-1],b=PROFILE[i+1],h=p[0]-a[0],k=b[0]-p[0],d=(p[1]-a[1])/h,e=(b[1]-p[1])/k;return d*e<=0?0:3*(h+k)/((2*k+h)/d+(k+2*h)/e);});
export function profileHeight(c){c=clamp(c,0,4526);let i=1;while(i<PROFILE.length-1&&PROFILE[i][0]<c)i++;const a=PROFILE[i-1],b=PROFILE[i],h=b[0]-a[0],t=(c-a[0])/h;return (2*t**3-3*t*t+1)*a[1]+(t**3-2*t*t+t)*h*slopes[i-1]+(-2*t**3+3*t*t)*b[1]+(t**3-t*t)*h*slopes[i];}
function geometry(s){s=clamp(s,0,LENGTH);let lo=0,hi=PATH.length-1;while(hi-lo>1){const m=(hi+lo)>>1;if(PATH[m].s>s)hi=m;else lo=m;}const a=PATH[lo],b=PATH[hi],t=(s-a.s)/(b.s-a.s),dx=b.x-a.x,dz=b.z-a.z,n=Math.hypot(dx,dz);return {x:a.x+dx*t,z:a.z+dz*t,tx:dx/n,tz:dz/n};}
export function sample(s) {
 s=clamp(s,0,LENGTH);const c=toChainage(s),p=geometry(s),y=profileHeight(c)-DATUM;
 const before=geometry(Math.max(0,s-3)),after=geometry(Math.min(LENGTH,s+3)),norm=Math.hypot(after.x-before.x,after.z-before.z);p.tx=(after.x-before.x)/norm;p.tz=(after.z-before.z)/norm;
 const lo=Math.max(0,s-1),hi=Math.min(LENGTH,s+1),grade=(profileHeight(toChainage(hi))-profileHeight(toChainage(lo)))/(hi-lo);
 const bridge=BRIDGES.find(b=>c>=b.start&&c<=b.end);
 // Independent ground baseline underneath bridges; at grade terrain follows road mPD.
 const groundY=bridge?interp(bridge.ground,c)-DATUM:y;
 return {...p,y,lx:p.tz,lz:-p.tx,heading:Math.atan2(-p.tx,-p.tz),grade,c,elevated:!!bridge,bridge:bridge?.id,structure:bridge?(c>=bridge.deckStart&&c<=bridge.deckEnd?'deck':'ramp'):null,groundY};
}
export const STOPS=anchors.map(([c,x,z],i)=>({...stationNames[i],nameEn:stationNames[i].name,nameZh:stationNames[i].zh,c,s:fromChainage(c),pixel:[x*K,z*K],platformLength:i===0?69.5:i===1?89.6:67.6,footprintLength:i===0?89.6:89.6,width:i===1?6:i===0?5:4,stagger:i===1?18.5:0,length:89.6,platformLateral:7.05,dockLateral:5.4,platformEdge:7.05,runningLane:1.9,boardingLane:5.4,platforms:[{side:1,centerOffset:i===1?-9.25:0},{side:-1,centerOffset:i===1?9.25:0}],source:`V1038-08-ST-110${i+1}`}));
// A1 annular turning area dimensions from ST-1101; centre location inferred from terminal footprint.
const terminal=sample(STOPS[0].s);
// ST-1101 / GA-1101: the island is beyond the 20 m platform flare, along the station axis.
const terminalSetback=STOPS[0].footprintLength/2+16.75;
export const LOOP={innerRadius:13.5,outerRadius:20,radius:16.75,center:{x:terminal.x-terminal.tx*terminalSetback,z:terminal.z-terminal.tz*terminalSetback},y:terminal.y,source:'V1038-08-ST-1101',length:Math.PI*2*16.75};
LOOP.sample=function(s){const a=s/this.radius,ux=terminal.tx,uz=terminal.tz,vx=terminal.lx,vz=terminal.lz;return{x:this.center.x+this.radius*(Math.cos(a)*ux+Math.sin(a)*vx),y:this.y,z:this.center.z+this.radius*(Math.cos(a)*uz+Math.sin(a)*vz),tx:-Math.sin(a)*ux+Math.cos(a)*vx,tz:-Math.sin(a)*uz+Math.cos(a)*vz};};
export function selfCheck(){for(let s=0;s<=LENGTH;s+=2){const p=sample(s);if(!Object.values(p).every(v=>typeof v!=='number'||Number.isFinite(v)))throw Error('Invalid sample');if(Math.abs(fromChainage(toChainage(s))-s)>1e-7)throw Error('Chainage roundtrip');if(Math.abs(project(p.x,p.z,s)-s)>1e-6)throw Error('Projection');}if(STOPS.some((p,i)=>i&&p.s<=STOPS[i-1].s))throw Error('Station order');return {length:LENGTH,stations:STOPS.map(({id,c,s})=>({id,c,s}))};}

// User-locked cross-section: a 40 m (1:12.3) taper into symmetric docking lanes.
export const TAPER=40;
// ST-5301 Section C: 300 mm platform, restored to drawing height on 7 October 2026.
export const PLATFORM_RISE=0;
export function roadSection(s){const c=toChainage(s);let right=3.8;
 // Dimensioned widened bends from GA-1101/1103/1107/1113/1115 and BW-1106.
 for(const [a,b,width] of [[95,200,9.5],[540,660,9.5],[1550,1700,8.5],[3500,3620,12],[4000,4200,9.5]])right=Math.max(right,3.8+(width/2-3.8)*clamp(Math.min((c-a+25)/25,(b+25-c)/25),0,1));
 for(const b of BRIDGES)right=Math.max(right,3.8+.75*clamp(Math.min((c-b.start+20)/20,(b.end+20-c)/20),0,1));
for(const st of STOPS){const d=Math.min(...st.platforms.map(p=>Math.abs(s-st.s-p.centerOffset)-st.footprintLength/2));right=Math.max(right,3.8+3.25*clamp(1-d/TAPER,0,1));}right=Math.max(right,s<STOPS[0].s-25?7.05+Math.min(19.8,STOPS[0].s-s-25)*.42:0);return {left:-right,right};}

export const END_STOP=LENGTH-14;

export const CROSSINGS=STOPS.flatMap(st=>[-1,1].map(side=>({s:clamp(st.s+side*(st.footprintLength/2+st.stagger/2+TAPER+6),0,LENGTH),station:st.id}))).filter(c=>c.s>8&&!sample(c.s).elevated);
// Ordinary sandbox K1 kerbs are 150 mm; the station approach footway rises
// to 300 mm over a 12 m ramp. Station platforms follow the drawing at approximately 300 mm.
export function footpathHeight(s){
 const distance=Math.min(...STOPS.map(st=>Math.abs(s-st.s)-st.footprintLength/2-st.stagger/2-10));
 const nearStation=clamp(1-Math.max(0,distance)/12,0,1);
 const nearJunction=clamp(1-Math.min(...JUNCTIONS.map(j=>{const g=crossingGeometry(j),a=Math.min(g.gaps[1][0],g.gaps[-1][0]),b=Math.max(g.gaps[1][1],g.gaps[-1][1]);return Math.max(0,a-s,s-b);}))/8,0,1);
 const normal=sample(s).elevated?.3:Math.max(.15+.15*nearStation,.15+.03*nearJunction);
 const crossing=Math.min(...CROSSINGS.map(c=>Math.abs(c.s-s))),junction=Math.min(...JUNCTIONS.flatMap(j=>[-1,1].map(d=>Math.abs(s-crossingGeometry(j).crossS[d]))));
 return .02+(normal-.02)*clamp(Math.min((crossing-1.5)/3,(junction-1.5)/2.5),0,1);
}
// Raised pavement of an at-grade junction at world (x,z), above the junction's road datum, or null: kerb-return rings and arm
// footways, dropped to a 25 mm lip across each side-road crossing.
export function junctionPavement(j,x,z){const g=crossingGeometry(j),h=j.halfWidth,fw=j.footway,dx=x-g.C.x,dz=z-g.C.z,d=dx*g.u.x+dz*g.u.z,e=dx*g.n.x+dz*g.n.z;
 for(const σ of [-1,1])for(const τ of [-1,1]){const k=g.corners[σ][τ],r=Math.hypot(x-k.O.x,z-k.O.z);if(r<=k.R&&r>=k.R-fw){let a=Math.atan2(z-k.O.z,x-k.O.x);while(a-k.a1>Math.PI)a-=2*Math.PI;while(a-k.a1<-Math.PI)a+=2*Math.PI;if((a-k.a1)*(k.a2-a)>=0)return .18;}}
 const σ=Math.sign(d)||1;if(Math.abs(d)>Math.abs(g.corners[σ][Math.sign(e)||1].d)&&Math.abs(d)<=j.extent&&Math.abs(e)>=h&&Math.abs(e)<=h+fw){const flare=clamp(1-(Math.abs(d-g.crossD[σ])-1.5)/1.8,0,1);return .18-.13*flare*(1-(Math.abs(e)-h)/fw);}
 if(j.median&&Math.abs(e)<j.median/2&&Math.abs(d)>Math.abs(g.stopD[σ])-1&&Math.abs(d)<=j.extent)return .18;
 return null;}
// Corridor kerb removed on lateral side `side` at s (the road and its kerb returns occupy it).
export function junctionGap(s,side){return JUNCTIONS.some(j=>{const [a,b]=crossingGeometry(j).gaps[side];return s>a&&s<b;});}

export const CYCLE_WIDTH=4;
function baseCycleOffset(s){let offset=roadSection(s).right+3.75+CYCLE_WIDTH/2;for(const st of STOPS){const d=Math.abs(s-st.s)-st.footprintLength/2-st.stagger/2,u=clamp(1-Math.max(0,d)/45,0,1),w=u*u*(3-2*u),flare=st.id==='A1'?Math.max(0,st.s-s-25)*.42:0;offset=Math.max(offset,offset+(7.05+st.width+flare+CYCLE_WIDTH/2-offset)*w);}const u=clamp(Math.min((s-OUTBOARD.start+45)/45,(OUTBOARD.end+50-s)/50),0,1),blend=u*u*(3-2*u);const normal=offset+(Math.max(offset,outboardKerb(s)+3.75+CYCLE_WIDTH/2)-offset)*blend;const d=Math.abs(toChainage(s)-3395),u3=clamp((200-d)/100,0,1);return -Math.max(normal+.6,normal+(52-normal)*u3*u3*(3-2*u3));}

// Volume 1 GA-1103/1105/1110/1113/1115. Unsigned chainages remain scaled game placements.
export const CHANNELS=[{name:'A2 approach culvert',c:660,width:18,extent:160},{name:'Tin Sam Channel',c:1195,width:24,extent:190}].map(c=>({...c,s:fromChainage(c.c)}));
// Corridor crossings where the OZP S/HSK/2A road reserves meet the corridor (city rebuild, 5 Nov 2026). halfWidth = kerb to
// centreline; lanes per direction (3.65 m) either side of a central median; skew (degrees) turns the road axis u from the
// corridor lateral: u = cos·l + sin·t. R = kerb-return radius. Network roads continue from each arm end (extent along u).
export const JUNCTIONS=[{c:1680,name:'Crossing road',zh:'連接路',halfWidth:3.65,lanes:1,median:0,skew:0,R:8},{c:2547,name:'Ha Tsuen Road',zh:'廈村路',halfWidth:8.3,lanes:2,median:2,skew:12.7,R:10},{c:3990,name:'Road D1',zh:'D1號路',halfWidth:9,lanes:2,median:3.4,skew:-28,R:10}].map((j,i)=>({footway:3.75,extent:45,...j,s:fromChainage(j.c),offset:i*7}));
// Roads under VB1/VB2/VB3: no interaction with the ART; D8 is squared up between the VB1 piers, D3 runs on past the cycle bridge swing.
export const UNDERPASSES=[{c:356,name:'Road D8',zh:'D8號路',halfWidth:9,lanes:2,median:3.4,skew:-8,footway:3},{c:3400,name:'Road D3',zh:'D3號路',halfWidth:10,lanes:2,median:5.4,skew:0,extent:70},{c:4393,name:'Road D1',zh:'D1號路',halfWidth:10,lanes:2,median:5.4,skew:33}].map(j=>({footway:3.75,extent:40,...j,s:fromChainage(j.c),offset:0,stop:14,underpass:true}));
// Crossing frame at the corridor centre: u along the road (towards +lateral), n across it (towards +s).
export function crossingAxes(j){const r=sample(j.s),f=j.skew*Math.PI/180,c=Math.cos(f),k=Math.sin(f);return {r,C:{x:r.x,y:j.underpass?r.groundY:r.y,z:r.z},u:{x:c*r.lx+k*r.tx,z:c*r.lz+k*r.tz},n:{x:-k*r.lx+c*r.tx,z:-k*r.lz+c*r.tz},cos:c,tan:k/c};}
const memo=new Map();
// At-grade geometry, solved against the real (curving) corridor kerb. corners[σ][τ]: σ = corridor side (lateral sign, also the arm),
// τ = side of the road (sign along n). Each kerb return of radius R has centre O at lateral σ(right+R) and road offset τ(h+R).
// gaps[σ]: corridor kerb removed between the two tangent points on that side. crossS[τ]: corridor crossings (s) clear of both corners;
// crossD[σ]/stopD[σ]: side-road crossing centre and stop line (distance along u, signed by arm). stop: ART stop line from j.s.
export function crossingGeometry(j){if(memo.has(j))return memo.get(j);const A=crossingAxes(j),{C,u,n}=A,h=j.halfWidth,R=j.R||8,g={...A,corners:{1:{},[-1]:{}},gaps:{},crossS:{},crossD:{},stopD:{}};
 const at=(q,lat)=>{const r=sample(q);return {x:r.x+r.lx*lat,z:r.z+r.lz*lat,r};},dn=p=>(p.x-C.x)*n.x+(p.z-C.z)*n.z,du=p=>(p.x-C.x)*u.x+(p.z-C.z)*u.z;
 if(!j.underpass){for(const σ of [-1,1])for(const τ of [-1,1]){let lo=j.s-120,hi=j.s+120;const f=q=>dn(at(q,σ*(roadSection(q).right+R)))-τ*(h+R);
   for(let i=0;i<60;i++){const m=(lo+hi)/2;if(f(m)>0)hi=m;else lo=m;}const q=(lo+hi)/2,O=at(q,σ*(roadSection(q).right+R)),T1=at(q,σ*roadSection(q).right),T2={x:O.x-τ*R*n.x,z:O.z-τ*R*n.z};
   let a1=Math.atan2(T1.z-O.z,T1.x-O.x),a2=Math.atan2(T2.z-O.z,T2.x-O.x);while(a2-a1>Math.PI)a2-=2*Math.PI;while(a2-a1<-Math.PI)a2+=2*Math.PI;
   g.corners[σ][τ]={s:q,O:{x:O.x,z:O.z},T1:{x:T1.x,z:T1.z},T2,a1,a2,R,d:du(T2)};}
  for(const σ of [-1,1]){const a=g.corners[σ][-1].s,b=g.corners[σ][1].s;g.gaps[σ]=[Math.min(a,b),Math.max(a,b)];
   const reach=Math.max(...[-1,1].map(τ=>Math.abs(g.corners[σ][τ].d)));g.crossD[σ]=σ*(reach+2.1);g.stopD[σ]=σ*(reach+2.1+1.6+1.3);}
  g.crossS[1]=Math.max(g.corners[1][1].s,g.corners[-1][1].s)+2.1;g.crossS[-1]=Math.min(g.corners[1][-1].s,g.corners[-1][-1].s)-2.1;
  j.stop=Math.max(j.s-g.crossS[-1],g.crossS[1]-j.s)+4;}
 // Where the road crosses the cycle track (lateral L) and how much chainage its kerbs and footways span there.
 const L=baseCycleOffset(j.s)-(j.halfWidth>7?12:0);g.cycleS=j.s+L*A.tan;g.cycleHalf=(h+j.footway)/A.cos-j.footway;
 memo.set(j,g);return g;}
// The cycle track keeps its outboard line from Ch 2650 to 3395 (the former side-road strip is now planted verge).
const OUTBOARD={start:fromChainage(2650),end:fromChainage(3395)};
function outboardKerb(s){const d=Math.abs(s-STOPS[5].s),u=clamp((150-d)/65,0,1);return 16.45+6*u*u*(3-2*u);}
// Distance along the road axis from the corridor centre to the signalised crossing on arm `side` (its lateral sign).
export function sideCrossing(j,side){return Math.abs(crossingGeometry(j).crossD[side]);}
export function cycleCrossing(s){return JUNCTIONS.filter(j=>j.halfWidth<=7).some(j=>{const g=crossingGeometry(j);return Math.abs(s-g.cycleS)<g.cycleHalf+.7;});}
export function cycleHeight(s){return .02+.28*clamp(Math.min(...[...JUNCTIONS,...UNDERPASSES].map(j=>{const g=crossingGeometry(j);return (Math.abs(s-g.cycleS)-g.cycleHalf-1)/6;})),0,1);}
export const DEPOT={s:fromChainage(3565),opening:30,lateral:95,width:140,length:160};
// The 30 m entrance sits 20 m before DEPOT.s so the lead-in runs down the drawing's 40 m vehicle access strip (V1038-DP-2003).
DEPOT.gate=DEPOT.s-20;
export const RAILWAY={start:fromChainage(80),end:fromChainage(1100),station:fromChainage(820)};
// Heavy-rail viaduct: an R200 approach curve joins the station tangent. One long straight passes Ch.450 at 28 m
// and carries the 230 m Hung Shui Kiu station box; the R200 curve takes the viaduct across the corridor near Ch.135.
// ponytail: circular curves without clothoid transitions; add Euler spirals if cant is ever modelled.
const railPoint=(c,o)=>{const r=sample(fromChainage(c));return {x:r.x+r.lx*o,z:r.z+r.lz*o};},hsk=railPoint(820,-95),aim=railPoint(450,-28),railAxis=Math.hypot(hsk.x-aim.x,hsk.z-aim.z),onAxis=d=>({x:hsk.x+(hsk.x-aim.x)/railAxis*d,z:hsk.z+(hsk.z-aim.z)/railAxis*d});
const RAIL=[];{const pi=[[railPoint(80,50)],[onAxis(-660),200],[onAxis(480)]],unit=(a,b)=>{const n=Math.hypot(b.x-a.x,b.z-a.z);return {x:(b.x-a.x)/n,z:(b.z-a.z)/n,n};};let p=pi[0][0],u=0;const line=b=>{const d=unit(p,b);RAIL.push({u,length:d.n,a:p,tx:d.x,tz:d.z});u+=d.n;};
 for(let i=1;i<pi.length-1;i++){const [b,R]=pi[i],d1=unit(pi[i-1][0],b),d2=unit(b,pi[i+1][0]),turn=Math.atan2(d1.x*d2.z-d1.z*d2.x,d1.x*d2.x+d1.z*d2.z),T=R*Math.tan(Math.abs(turn)/2),side=Math.sign(turn),tc={x:b.x-d1.x*T,z:b.z-d1.z*T},centre={x:tc.x-d1.z*side*R,z:tc.z+d1.x*side*R};line(tc);RAIL.push({u,length:Math.abs(turn)*R,R,side,centre,start:Math.atan2(tc.z-centre.z,tc.x-centre.x)});u+=Math.abs(turn)*R;p={x:b.x+d2.x*T,z:b.z+d2.z*T};}
 line(pi.at(-1)[0]);RAILWAY.length=u;RAILWAY.stationU=RAIL[2].u+(hsk.x-RAIL[2].a.x)*RAIL[2].tx+(hsk.z-RAIL[2].a.z)*RAIL[2].tz;}
// Rail position by distance u along the viaduct; railSample(s) keeps the corridor-s API and pins the station centre.
RAILWAY.at=function(u){u=clamp(u,0,this.length);const e=RAIL.find(e=>u<=e.u+e.length)||RAIL.at(-1),t=u-e.u,a=e.R?e.start+e.side*t/e.R:0,tx=e.R?-Math.sin(a)*e.side:e.tx,tz=e.R?Math.cos(a)*e.side:e.tz;return {x:e.R?e.centre.x+Math.cos(a)*e.R:e.a.x+tx*t,y:13.3,z:e.R?e.centre.z+Math.sin(a)*e.R:e.a.z+tz*t,tx,tz,lx:tz,lz:-tx,heading:Math.atan2(-tx,-tz),u};};
const railU=[[RAILWAY.start,0],[RAILWAY.station,RAILWAY.stationU],[RAILWAY.end,RAILWAY.length]],railLine=Array.from({length:Math.ceil(RAILWAY.length/4)+1},(_,i)=>RAILWAY.at(i*4));
export function railSample(s){return RAILWAY.at(interp(railU,s));}
// True plan distance to the rail centreline, for scenery clearance.
RAILWAY.distance=(x,z)=>{let d=Infinity;for(let i=1;i<railLine.length;i++){const a=railLine[i-1],b=railLine[i],dx=b.x-a.x,dz=b.z-a.z,t=clamp(((x-a.x)*dx+(z-a.z)*dz)/(dx*dx+dz*dz||1),0,1);d=Math.min(d,Math.hypot(x-a.x-t*dx,z-a.z-t*dz));}return d;};


// Bay alignment is spatial: stationary vehicles never drift sideways.
export function laneOffset(s,dir=1,skip=[]){let lane=1.9;for(const st of STOPS){if(skip.includes(st.id))continue;const platform=st.platforms.find(p=>p.side===dir),d=Math.abs(s-st.s-platform.centerOffset),u=clamp((st.footprintLength/2+40-d)/50,0,1);lane=Math.max(lane,1.9+3.5*u*u*u*(10-15*u+6*u*u));}return dir*Math.min(lane,roadSection(s).right-1.6);}
export function curveRadius(s){const a=sample(s-4),b=sample(s+4),turn=Math.abs(Math.atan2(Math.sin(b.heading-a.heading),Math.cos(b.heading-a.heading)));return turn>1e-6?8/turn:Infinity;}

// The opposite cab starts in the same lane; the crossover is travelled, never teleported.
export const CROSSOVER_START=END_STOP-25.2;
export function returnOffset(s){const u=clamp((CROSSOVER_START-s)/70,0,1);return s>CROSSOVER_START-70?1.9-3.8*u*u*u*(10-15*u+6*u*u):laneOffset(s,-1);}

export const CYCLE_BRIDGES=[...UNDERPASSES,...JUNCTIONS.filter(j=>j.halfWidth>7)];
export const CYCLE_RAMP=140;
const cyc=j=>crossingGeometry(j);
export function cycleCanopyAt(s){return CYCLE_BRIDGES.find(j=>Math.abs(s-cyc(j).cycleS)<=cyc(j).cycleHalf+8.5);}
export function cycleBridgeAt(s){return CYCLE_BRIDGES.find(j=>Math.abs(s-cyc(j).cycleS)<cyc(j).cycleHalf+8+CYCLE_RAMP);}
export function cycleOffset(s){const j=cycleBridgeAt(s);if(!j)return baseCycleOffset(s);const u=clamp((cyc(j).cycleHalf+8+CYCLE_RAMP-Math.abs(s-cyc(j).cycleS))/CYCLE_RAMP,0,1);return baseCycleOffset(s)-12*u*u*(3-2*u);}
// The route, paint and riders share the same straight bridge deck and eased approaches.
function cyclePlan(s){
 const r=sample(s),offset=cycleOffset(s);let x=r.x+r.lx*offset,z=r.z+r.lz*offset;
 const j=cycleBridgeAt(s);
 if(j){const d=s-cyc(j).cycleS,u=clamp((cyc(j).cycleHalf+8+55-Math.abs(d))/55,0,1),w=u*u*(3-2*u),c=sample(cyc(j).cycleS),lat=cycleOffset(cyc(j).cycleS);x+=(c.x+c.lx*lat+c.tx*d-x)*w;z+=(c.z+c.lz*lat+c.tz*d-z)*w;}
 return {...r,x,z};
}
export function cycleSample(s){const r=cyclePlan(s),a=cyclePlan(Math.max(0,s-.3)),b=cyclePlan(Math.min(LENGTH,s+.3)),n=Math.hypot(b.x-a.x,b.z-a.z),tx=(b.x-a.x)/n,tz=(b.z-a.z)/n;return {...r,tx,tz,lx:tz,lz:-tx,heading:Math.atan2(-tx,-tz)};}
export function cycleBridgeHeight(s){const j=cycleBridgeAt(s);if(!j)return cycleHeight(s);const d=Math.abs(s-cyc(j).cycleS),u=clamp((cyc(j).cycleHalf+8+CYCLE_RAMP-d)/CYCLE_RAMP,0,1),w=u*u*(3-2*u),ground=sample(s).groundY;return cycleHeight(s)+(sample(cyc(j).cycleS).groundY+6.4-ground-cycleHeight(s))*w;}
// Solve crossing geometry eagerly: junction stop lines feed the signal objects at load.
for(const j of [...JUNCTIONS,...UNDERPASSES])crossingGeometry(j);
