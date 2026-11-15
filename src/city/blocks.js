// City rebuild 2 (Gordon, 14 Nov 2026): land and buildings come from the streets, as in the sandbox city (city-tile-buildings.js
// cityLots): every plot is cut from a street's frontage, stands on a paved plinth flush with that street's footway and faces it.
// Nothing is placed by filling an OZP lot outline, so no building rises out of grass. The OZP only decides what a plot becomes
// (zone under it → building types from the sandbox modern kit). A second row is allowed behind a frontage plot of the same OZP
// lot, across a paved court. Logistics lots, the depot, open space and green belt take no plots (src/lots/massing.js keeps them).
import {TYPES} from './kit/hk-modern-plan.js';
import {frameAt,streetLevel,nearestOn} from '../street/network.js';
import {pointInPolygon} from '../lots/wand.js';

// zone → [group, building types, gap between neighbours (m), setback from the back of the footway (m), second row allowed].
// As in the sandbox city (city-tile-buildings.js: lots start 0.5 m behind the footway and share party walls), urban frontage
// is a continuous street wall; only civic and utility sites and village houses stand apart.
const MIX=[
 [/^R\(/,'residential',['prh-harmony','private-glass','prh-trident','private-cross','prh-slab','private-glass'],0,.5,true],
 [/^C\(/,'commercial',['office-grade-a','mall','office-classic','office-grade-a','ginza'],0,.5,true],
 [/Mixed Use/,'mixed',['podium-estate','office-grade-a','private-glass','office-classic','ginza'],0,.5,true],
 [/Enterprise and Technology Park/,'enterprise',['industrial-office','office-grade-a','industrial-office','office-classic'],0,.5,true],
 [/Industry Park/,'industry',['factory-estate','industrial-office','flatted-factory'],0,.5,true],
 [/^I$/,'industry',['flatted-factory','godown','factory-estate','flatted-factory'],0,.5,false],
 [/^G\/IC/,'civic',['office-classic','industrial-office'],4,1.5,false],
 [/Sewage|Cooling|Port Back-up|Refuse/,'utility',['godown'],6,3,false],
 [/^V/,'village',['village-houses'],3,1.5,false],
];
// Frontage outside every OZP lot (the existing villages beyond the plan): village houses.
const BEYOND=MIX.at(-1);
export const zoneRule=zone=>zone==null?BEYOND:MIX.find(([re])=>re.test(zone))??null;
const hash=s=>{let h=2166136261;for(const c of String(s))h=Math.imul(h^c.charCodeAt(0),16777619);return h>>>0;};
const COURT=16,SIDE=3;

// Separating-axis test for two oriented rectangles {c:[x,z],u:[x,z],hw,hd} grown by pad.
function overlap(a,b,pad){const d=[b.c[0]-a.c[0],b.c[1]-a.c[1]],va=[-a.u[1],a.u[0]],vb=[-b.u[1],b.u[0]];
 for(const ax of [a.u,va,b.u,vb]){const ra=(a.hw+pad)*Math.abs(ax[0]*a.u[0]+ax[1]*a.u[1])+(a.hd+pad)*Math.abs(ax[0]*va[0]+ax[1]*va[1]),rb=b.hw*Math.abs(ax[0]*b.u[0]+ax[1]*b.u[1])+b.hd*Math.abs(ax[0]*vb[0]+ax[1]*vb[1]);
  if(Math.abs(d[0]*ax[0]+d[1]*ax[1])>ra+rb)return false;}return true;}

// roads: junctions(network,ground).roads — {r,P,F}. lots: OZP lots [{id,zone,poly}]. clear(x,z,r): scenery clearance (corridor,
// depot, railway, junction boxes). onStreet(x,z,r): any street surface within r. kept: polygons no plot may touch.
// Returns plots [{id,type,group,zone,lot,row,road,side,c:[x,z],u:[x,z] (along the street),v:[x,z] (away from it),w,d,y (plinth
// level),yaw,poly,pave:{…}}], local streets first so buildings face the quieter street where two compete.
export function frontagePlots(roads,lots,{clear=()=>true,onStreet=()=>false,kept=[],reach=()=>true}={}){
 const boxes=lots.map(l=>({l,x0:Math.min(...l.poly.map(p=>p[0])),x1:Math.max(...l.poly.map(p=>p[0])),z0:Math.min(...l.poly.map(p=>p[1])),z1:Math.max(...l.poly.map(p=>p[1]))}));
 const lotAt=(x,z)=>boxes.find(b=>x>=b.x0&&x<=b.x1&&z>=b.z0&&z<=b.z1&&pointInPolygon([x,z],b.l.poly))?.l??null;
 const keptBoxes=kept.map(poly=>({poly,x0:Math.min(...poly.map(p=>p[0])),x1:Math.max(...poly.map(p=>p[0])),z0:Math.min(...poly.map(p=>p[1])),z1:Math.max(...poly.map(p=>p[1]))}));
 const inKept=(x,z)=>keptBoxes.some(b=>x>=b.x0-3&&x<=b.x1+3&&z>=b.z0-3&&z<=b.z1+3&&(pointInPolygon([x,z],b.poly)||b.poly.some(p=>Math.hypot(p[0]-x,p[1]-z)<3)));
 const plots=[],cells=new Map(),B=64,key=(x,z)=>Math.floor(x/B)+','+Math.floor(z/B);
 const near=c=>{const out=new Set();for(let i=-2;i<=2;i++)for(let j=-2;j<=2;j++)for(const p of cells.get(key(c[0]+i*B,c[1]+j*B))||[])out.add(p);return out;};
 // A rectangle fits when every sample (5 × 5 over it) is clear ground of the wanted lot/group, at least 0.45 m behind any
 // footway, and no plot is nearer than gap.
 const fits=(R,gap,want)=>{for(let i=0;i<=4;i++)for(let j=0;j<=4;j++){const a=(i/2-1)*R.hw,b=(j/2-1)*R.hd,x=R.c[0]+R.u[0]*a-R.u[1]*b,z=R.c[1]+R.u[1]*a+R.u[0]*b;
   if(onStreet(x,z,-.05)||!clear(x,z,1.5)||!reach(x,z)||inKept(x,z))return false;const l=lotAt(x,z);if(want(l)===false)return false;}
  for(const p of near(R.c))if(overlap(R,p.rect,Math.max(gap,p.gap)-.05))return false;return true;};// gap 0: party walls may touch
 const place=(o,side,row,type,rule,c,u,v,y,front)=>{const [w,d]=TYPES[type].span,rect={c,u,hw:w/2,hd:d/2},gap=rule[3],lot=lotAt(...c),id=`${o.r.id.replace('city-','')}:${side>0?'L':'R'}${row}:${plots.length}`;
  const corner=(a,b)=>[c[0]+u[0]*a+v[0]*b,c[1]+u[1]*a+v[1]*b],poly=[corner(-w/2,-d/2),corner(w/2,-d/2),corner(w/2,d/2),corner(-w/2,d/2)];
  const p={id,type,group:rule[1],zone:lot?.zone??null,lot:lot?.id??null,row,road:o.r.id,side,c,u,v,w,d,y,gap,rect,front,yaw:Math.atan2(-v[0],-v[1]),poly,seed:hash(id)};
  plots.push(p);(cells.get(key(...c))||cells.set(key(...c),[]).get(key(...c))).push(p);return p;};
 const order=[...roads].filter(o=>!o.r.loop).sort((a,b)=>a.P.carriageway-b.P.carriageway||a.r.id.localeCompare(b.r.id));
 for(const o of order){const {r,P,F}=o,L=F.at(-1).d,h=P.carriageway/2+P.footpath;
  for(const side of [1,-1]){let d=4,k=0;
   while(d<L-10){const probe=frameAt(F,d+12),lot=lotAt(probe.x+probe.lx*side*(h+16),probe.z+probe.lz*side*(h+16)),rule=zoneRule(lot?.zone);
    // Unzoned land inside the plan (road and highway reserves between lots) stays verge; village houses only line streets
    // that have left the plan altogether (no OZP lot within 90 m).
    if(!rule||!lot&&[45,90].some(q=>[0,1,2,3,4,5,6,7].some(a=>lotAt(probe.x+probe.lx*side*(h+16)+Math.cos(a*Math.PI/4)*q,probe.z+probe.lz*side*(h+16)+Math.sin(a*Math.PI/4)*q)))){d+=10;continue;}
    const [,group,types,gap,setback]=rule,n=types.length,k0=hash(r.id+side+':'+k++);let placed=null;
    for(let t=0;t<n&&!placed;t++){const type=types[(k0+t)%n],[w,dp]=TYPES[type].span;if(d+w>L-4)continue;
     const f=frameAt(F,d+w/2),u=[f.tx,f.tz],v=[f.lx*side,f.lz*side],c=[f.x+v[0]*(h+setback+dp/2),f.z+v[1]*(h+setback+dp/2)];
     // On a bend a straight front comes closer to the street at its corners (inside of the bend) or its middle (outside):
     // push the plot out until the nearest point of its front is exactly `setback` behind the footway.
     let near=Infinity;for(const a of [-.5,-.25,0,.25,.5]){const x=c[0]+u[0]*a*w-v[0]*dp/2,z=c[1]+u[1]*a*w-v[1]*dp/2;near=Math.min(near,nearestOn(F,x,z).dist);}
     const push=Math.max(0,h+setback-near);c[0]+=v[0]*push;c[1]+=v[1]*push;
     // same zone group across the whole plot (a plot never spills into a park, a kept lot or another use; unzoned road reserve is fine)
     if(fits({c,u,hw:w/2,hd:dp/2},gap,l=>!l||zoneRule(l.zone)?.[1]===group))placed=place(o,side,1,type,rule,c,u,v,f.y+streetLevel(r,d+w/2,side*h),null);}
    if(placed){placed.along=[d-gap/2,d+placed.w+gap/2];d+=placed.w+gap;}else d+=.5;}}}// close up: a street wall, not gaps
 // Second row: behind a frontage plot, inside the same OZP lot, across a paved court.
 for(const p of [...plots]){const rule=zoneRule(p.zone);if(!rule?.[5]||!p.lot)continue;const types=rule[2],k0=hash(p.id+':2');
  for(let t=0;t<types.length;t++){const type=types[(k0+t)%types.length],[w,dp]=TYPES[type].span,off=p.d/2+COURT+dp/2,c=[p.c[0]+p.v[0]*off,p.c[1]+p.v[1]*off];
   // its court (paved, as wide as the frontage plot) must not touch any other plot either
   const court={c:[p.c[0]+p.v[0]*(p.d/2+COURT/2),p.c[1]+p.v[1]*(p.d/2+COURT/2)],u:p.u,hw:Math.min(w,p.w)/2,hd:COURT/2};
   if(lotAt(...c)?.id!==p.lot||!fits({c,u:p.u,hw:w/2,hd:dp/2},rule[3],l=>!l||l.id===p.lot)||plots.some(q=>q!==p&&overlap(court,q.rect,-.05)))continue;const o=roads.find(o=>o.r.id===p.road);place(o,p.side,2,type,rule,c,p.u,p.v,p.y,p.id);break;}}
 // Edge roles for the building kit (as the sandbox's lots): the street side is the front; a side touching a neighbour is a
 // party wall (blank, no inset); a side facing another street (corner plot) is a second front; anything else is rear.
 const inRect=(q,x,z)=>{const dx=x-q.c[0],dz=z-q.c[1];return Math.abs(dx*q.u[0]+dz*q.u[1])<q.w/2&&Math.abs(dx*q.v[0]+dz*q.v[1])<q.d/2;};
 for(const p of plots){const side=(a,b,ox,oz)=>{const x=p.c[0]+p.u[0]*a+p.v[0]*b,z=p.c[1]+p.u[1]*a+p.v[1]*b;return [x+ox,z+oz];};
  p.roles=['front',...[[1,0],[0,1],[-1,0]].map(([su,sv])=>{const probes=[-.35,0,.35].map(k=>side(su*p.w/2+sv*k*p.w,sv*p.d/2+su*k*p.d,(su*p.u[0]+sv*p.v[0])*.8,(su*p.u[1]+sv*p.v[1])*.8));
   if(probes.some(([x,z])=>plots.some(q=>q!==p&&inRect(q,x,z))))return 'party';const [x,z]=probes[1];const [sx,sz]=side(su*p.w/2,sv*p.d/2,(su*p.u[0]+sv*p.v[0])*4,(su*p.u[1]+sv*p.v[1])*4);return onStreet(sx,sz,0)?'front':'rear';})];
  if(p.row===2)p.roles[0]='front';}// a second-row building fronts its court
 return plots;}

// Paving for the plots, as flat {pos,idx} buffers (y up): each plinth (plot grown SIDE m at the rear, half the gap at the sides)
// at its own level with skirts into the ground, and a forecourt strip from the street's actual back-of-footway line (it follows
// the curve and the fall of the street) to the plinth front. Second-row plinths reach forward across the court.
export function plotPaving(plots,roads){const pos=[],idx=[],byRoad=new Map(roads.map(o=>[o.r.id,o]));
 const quad=(a,b,c,d)=>{const n=pos.length/3;pos.push(...a,...b,...c,...d);idx.push(n,n+1,n+2,n,n+2,n+3);};
 for(const p of plots){const {c,u,v,w,d,y}=p,g=p.gap/2,f=p.row===2?COURT-SIDE+.5:0,P=(a,b,dy=0)=>[c[0]+u[0]*a+v[0]*b,y+dy,c[1]+u[1]*a+v[1]*b];
  const x0=-w/2-g,x1=w/2+g,z0=-d/2,z1=d/2+(p.gap?SIDE:0);// party-walled plots: no rear apron (it would swing into the neighbour on a bend)
  quad(P(x0,z0),P(x0,z1),P(x1,z1),P(x1,z0));// top (counter-clockwise seen from above with u × v pointing down → faces up)
  // second row: the court, paved forward to its frontage plot's rear, no wider than that plot (so it never reaches a neighbour)
  if(f){const fr=plots.find(q=>q.id===p.front),hw=Math.min(w,fr?.w??w)/2,back=fr?Math.max(0,(p.c[0]-fr.c[0])*v[0]+(p.c[1]-fr.c[1])*v[1]-d/2-fr.d/2-(fr.gap?SIDE:0)):f;
   if(back>.05)quad(P(-hw,z0-back),P(-hw,z0),P(hw,z0),P(hw,z0-back));}
  quad(P(x0,z1),P(x0,z1,-2),P(x1,z1,-2),P(x1,z1));quad(P(x0,z0),P(x0,z0,-2),P(x0,z1,-2),P(x0,z1));quad(P(x1,z1),P(x1,z1,-2),P(x1,z0,-2),P(x1,z0));
  if(p.row!==1)continue;const o=byRoad.get(p.road),h=o.P.carriageway/2+o.P.footpath,[a0,a1]=p.along,n=Math.max(2,Math.ceil((a1-a0)/4));let prev=null;
  for(let i=0;i<=n;i++){const a=Math.max(0,Math.min(o.F.at(-1).d,a0+(a1-a0)*i/n)),fr=frameAt(o.F,a),bx=fr.x+fr.lx*p.side*(h-.3),bz=fr.z+fr.lz*p.side*(h-.3),by=fr.y+streetLevel(o.r,a,p.side*h)-.02;
   const t=Math.max(x0,Math.min(x1,(bx-c[0])*u[0]+(bz-c[1])*u[1])),vb=Math.min(z0-.05,(bx-c[0])*v[0]+(bz-c[1])*v[1]),f0=P(t,vb),q=P(t,z0),cur=[[f0[0],by,f0[2]],q];// never folds back over the plinth on a tight bend
   if(prev)p.side*(u[0]*v[1]-u[1]*v[0])>0?quad(prev[0],prev[1],cur[1],cur[0]):quad(prev[0],cur[0],cur[1],prev[1]);prev=cur;}}
 // every top face must face up whatever the handedness of (u, v): flip triangles whose normal points down
 for(let i=0;i<idx.length;i+=3){const [a,b,c]=[idx[i],idx[i+1],idx[i+2]].map(k=>[pos[k*3],pos[k*3+1],pos[k*3+2]]),ny=(b[2]-a[2])*(c[0]-a[0])-(b[0]-a[0])*(c[2]-a[2]);
  const flat=Math.abs(a[1]-b[1])<1.5&&Math.abs(a[1]-c[1])<1.5;if(flat&&ny<0)[idx[i+1],idx[i+2]]=[idx[i+2],idx[i+1]];}
 return {pos,idx};}

// Walking height on the plot paving (set by the game once the paving mesh exists; null off the paving).
let sampler=()=>null;
export const lotHeight=(x,z)=>sampler(x,z);
export const setLotSampler=fn=>{sampler=fn||(()=>null);};
