// Hong Kong Road Users' Code, chapter 5, "Where Not to Stop". The periods below
// are design choices for this city. A zone runs along one uninterrupted kerb.
import {BAY_HALF} from './bus-layby.js';
const SHELTER_HALF=7.2;

const timedStreets = new Set([
 'city-station-street', 'city-station-north', 'city-d7', 'city-d7-north',
 'city-d7-south', 'city-d2-link', 'city-logistics-access', 'city-industry-access'
]);

export function mapSightline(roundabouts) {
 const maps = roundabouts.flatMap(i => i.entries.filter(e => e.exits.length === 3).map(e => e.advance));
 return (p,r) => maps.some(m => {
  const dx=p.x-m.x, dz=p.z-m.z, sin=Math.sin(m.yaw), cos=Math.cos(m.yaw);
  const ahead=dx*sin+dz*cos, right=dx*cos-dz*sin;
  return ahead>=-r && ahead<=32+r && right>=-2.1-r && right<=2.1+r+Math.max(0,ahead)*.19;
 });
}

// Choose the actual shelter sites before painting so both renderers share the gaps.
export function planBusStops(edges,wide,hidesMap) {
 const stops=[];
 // Authored bays have first claim on their berth, including both tapered approaches.
 for(const edge of edges){
  const bay=edge.road.busLayby;
  if(edge.kind!=='edge'||!bay||bay.side!==edge.side)continue;
  const t=bay.at-edge.from;
  if(t>=BAY_HALF && t<=edge.length-BAY_HALF)stops.push({edge,t,p:edge.point(t),kind:'layby',half:BAY_HALF});
 }
 for (const e of edges.filter(e=>e.kind==='edge' && wide(e) && e.length>=120).sort((a,b)=>b.length-a.length)) {
  if(stops.some(s=>s.edge===e))continue;
  const candidates=[];
  for (let t=27;t<e.length-30;t+=30) {
   if (t<=30 || hidesMap(e.point(t),SHELTER_HALF) || e.crossings.some(c=>Math.abs(c-t)<30)) continue;
   const a=e.point(t-SHELTER_HALF), b=e.point(t+SHELTER_HALF);
   if (a.nx*b.nx+a.nz*b.nz>Math.cos(3*Math.PI/180)) candidates.push(t);
  }
  const t=candidates.sort((a,b)=>Math.abs(a-e.length/2)-Math.abs(b-e.length/2))[0];
  if (t===undefined) continue;
  const p=e.point(t);
  if (!stops.some(s=>Math.hypot(s.p.x-p.x,s.p.z-p.z)<350)) stops.push({edge:e,t,p,kind:'kerbside',half:SHELTER_HALF});
 }
 return stops;
}

function kerbSign(edge,t,role,period) {
 const p=edge.point(t);
 return {t,x:p.x+p.nx*.78,y:p.y+.016,z:p.z+p.nz*.78,yaw:Math.atan2(p.nz,-p.nx),role,period};
}

export function planKerbZones(edges,stops,controls,hidesMap) {
 const zones=[];
 for (const e of edges) {
  if (e.road.turningRadius) continue;
  if (e.road.loop) {
   const signs=[];
   if (e.kind==='edge' && e.length>=15) signs.push(kerbSign(e,e.length/2,'repeater','24h'));
   zones.push({edge:e,lo:0,hi:e.length,period:'24h',throughLo:true,throughHi:true,signs});
   continue;
  }
  if (e.kind!=='edge') continue;
  const distributor=e.road.preset==='distributor';
  const timed=timedStreets.has(e.road.id);
  // Protect local junction approaches and crossings around the clock. On quiet
  // residential frontages between them, the ordinary street parking rules apply.
  const near=[...e.road.junctionDistances,...e.road.crossings].map(d=>d-e.from);
  const limits=[3,e.length-3];
  if (!distributor) for (const c of near) limits.push(c-35,c+35);
  const stop=stops.find(s=>s.edge===e);
  const stopGap=(stop?.half||0)+3;
  if (stop) limits.push(stop.t-stopGap,stop.t+stopGap);
  const cuts=limits.filter(t=>t>=3 && t<=e.length-3).sort((a,b)=>a-b);
  const runs=[];
  for (let i=1;i<cuts.length;i++) {
   const lo=cuts[i-1], hi=cuts[i], mid=(lo+hi)/2;
   if (hi<=lo || (stop && Math.abs(mid-stop.t)<stopGap)) continue;
   const allDay=distributor || near.some(c=>Math.abs(c-mid)<=35);
   if (!allDay && !timed) continue;
   const period=allDay?'24h':'7-7';
   const prev=runs.at(-1);
   if (prev?.hi===lo && prev.period===period) prev.hi=hi;
   else runs.push({lo,hi,period});
  }

  // Keep plates out of dropped kerbs, junction furniture and advance-map sightlines.
  const clear=t=>{
   if (e.crossings.some(c=>Math.abs(t-c)<7)) return false;
   const p=e.point(t);
   return !hidesMap(p,1) && !controls.some(c=>Math.hypot(c.x-p.x,c.z-p.z)<3.5);
  };
  const placed=[];
  for (const run of runs) {
   const inset=run.period==='7-7'?13:1;
   let lo=run.lo+inset, hi=run.hi-inset;
   while (lo<hi && !clear(lo)) lo++;
   while (hi>lo && !clear(hi)) hi--;
   if (hi-lo<14) continue;
   const span={edge:e,lo,hi,period:run.period,joinsLo:false,joinsHi:false};
   const prev=placed.at(-1);
   if (prev && prev.rawEnd===run.lo) {
    // Keep a change of period continuous. The incoming period's start plate
    // marks the shared boundary in the direction of travel.
    const boundary=clear(run.lo)?run.lo:(prev.period==='24h'?prev.hi:lo);
    prev.hi=span.lo=boundary;
    prev.joinsHi=span.joinsLo=true;
   }
   span.throughLo=e.ringAtLo && run.lo===limits[0];
   span.throughHi=e.ringAtHi && run.hi===limits[1];
   placed.push({...span,rawEnd:run.hi});
  }
  for (const {lo,hi,period,joinsLo,joinsHi,throughLo,throughHi} of placed) {
   const positions=[lo];
   const intervals=Math.ceil((hi-lo)/95);
   for (let i=1;i<intervals;i++) {
    const target=lo+(hi-lo)*i/intervals;
    for (let d=0;d<=28;d++) {
     const t=[target-d,target+d].find(t=>t>positions.at(-1)+10 && t<hi-10 && clear(t));
     if (t!==undefined) {positions.push(t);break;}
    }
   }
   positions.push(hi);
   if (e.side<0) positions.reverse();
   const continues=e.side>0?joinsHi:joinsLo;
   if (continues) positions.pop();
   const signs=positions.map((t,i)=>{
    let role='repeater';
    if(i===0 && !(e.side>0?throughLo:throughHi)) role='start';
    if(i===positions.length-1 && !continues && !(e.side>0?throughHi:throughLo)) role='end';
    return kerbSign(e,t,role,period);
   });
   zones.push({edge:e,lo:throughLo?0:lo,hi:throughHi?e.length:hi,period,joinsLo,joinsHi,throughLo,throughHi,signs});
  }
 }
 // The rounded returns are solved analytically, while the ring and arms are
 // sampled roads. Use the same end row on both meshes at each tangent.
 const ends=[];
 for (const z of zones) if(z.edge.kind==='edge'){
  if(z.throughLo) ends.push(z.edge.point(z.lo));
  if(z.throughHi) ends.push(z.edge.point(z.hi));
 }
 for (const z of zones) if(z.edge.kind==='corner'){
  const snap=t=>{
   const p=z.edge.point(t);
   return ends.find(q=>Math.hypot(q.x-p.x,q.z-p.z)<.30) || p;
  };
  const start=snap(z.lo),end=snap(z.hi);
  z.paintPoint=t=>t<=z.lo?start:t>=z.hi-1e-8?end:z.edge.point(t);
 }
 return zones;
}

// Painted rectangles in metres along the kerb and inwards from its face.
// The double side owns the shared changeover bar. The centred single stripe
// meets that bar directly. Rectangles share edges to avoid coplanar overlaps.
export function kerbPaint({lo,hi,period,joinsLo=false,joinsHi=false,throughLo=false,throughHi=false}) {
 const double=period==='24h', capLo=!throughLo && (double || !joinsLo), capHi=!throughHi && (double || !joinsHi);
 const start=capLo?lo+.10:lo, end=capHi?hi-.10:hi;
 const bands=double?[[.10,.20],[.30,.40]]:[[.20,.30]];
 const paint=bands.map(([near,far])=>[start,end,near,far]);
 if (capLo) paint.push([lo,start,.10,.40]);
 if (capHi) paint.push([end,hi,.10,.40]);
 return paint;
}
