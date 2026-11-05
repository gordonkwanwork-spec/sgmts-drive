// Pure metre-based rules: no Three.js, browser, assets or sample-street coordinates.
// Callers choose a context-appropriate profile; this module does not classify roads.
export function streetProfile({roadWidth,throughWidth,furnitureWidth,frontageWidth,roadCrossfall=.025,footwayCrossfall=.025,kerbRise=.15}){
 for(const [key,value] of Object.entries({roadWidth,throughWidth,furnitureWidth,frontageWidth,roadCrossfall,footwayCrossfall,kerbRise})){
  if(!Number.isFinite(value)||value<0)throw new RangeError(`Invalid ${key}`);
 }
 if(roadWidth===0||throughWidth===0)throw new RangeError('Motor street needs carriageway and through space');
 return Object.freeze({roadWidth,throughWidth,furnitureWidth,frontageWidth,roadCrossfall,footwayCrossfall,kerbRise,
  footwayWidth:furnitureWidth+throughWidth+frontageWidth});
}

// Lateral bands measured from the centreline. Game frames use left = +lateral.
export function footwayBands(profile,side){
 if(side!==1&&side!==-1)throw new RangeError('Side must be +1 or -1');
 let edge=profile.roadWidth/2;
 return ['furniture','through','frontage'].map(type=>{
  const width=profile[`${type}Width`],inner=side*edge;edge+=width;
  return {type,inner,outer:side*edge,centre:(inner+side*edge)/2,width};
 });
}

export function roadSurfaceHeight(profile,lateral){return profile.roadCrossfall*(profile.roadWidth/2-Math.abs(lateral));}

// Separate paint and hardware footprints. Width is between stud-row centres;
// the full stud width and a clear end gap are reserved before placing paint.
export function signalCrossingMarkings({at,width,roadWidth,barThickness=.3,barGap=.7,barEndGap=.1,studWidth=.1,studPitch=.7,edgeMargin=.75}){
 for(const [key,value] of Object.entries({at,width,roadWidth,barThickness,barGap,barEndGap,studWidth,studPitch,edgeMargin}))if(!Number.isFinite(value)||(key!=='at'&&value<=0))throw new RangeError(`Invalid ${key}`);
 const barWidth=width-studWidth-2*barEndGap,available=roadWidth-2*edgeMargin;
 if(barWidth<=0||available<barThickness)throw new RangeError('Crossing cannot fit its markings');
 const n=Math.floor((available+barGap)/(barThickness+barGap)),gap=n>1?Math.min(.8,Math.max(barGap,(available-n*barThickness)/(n-1))):barGap,span=n*barThickness+(n-1)*gap;   // spread leftover room into the gaps (TD allows 600–800 mm) so the outer bars sit near the kerb
 const bars=Array.from({length:n},(_,i)=>({x:at,z:-span/2+barThickness/2+i*(barThickness+gap),w:barWidth,d:barThickness}));
 const count=Math.floor(available/studPitch)+1,studSpan=(count-1)*studPitch;
 const studs=[-1,1].flatMap(side=>Array.from({length:count},(_,i)=>({x:at+side*width/2,z:-studSpan/2+i*studPitch,w:studWidth,d:studWidth})));
 return {bars,studs,barEndGap,barWidth};
}

export function hazardWarningDots(width,depth,{tile,pitch,edge}){
 for(const v of [width,depth,tile,pitch,edge])if(!Number.isFinite(v)||v<=0)throw new RangeError('Invalid tactile field');
 const nx=Math.round(width/tile),nz=Math.round(depth/tile),perTile=Math.round(tile/pitch);
 if(Math.abs(width-nx*tile)>1e-8||Math.abs(depth-nz*tile)>1e-8||Math.abs(tile-perTile*pitch)>1e-8||Math.abs(2*edge-pitch)>1e-8)throw new RangeError('Tactile field must contain complete tile grids');
 return Array.from({length:nx*perTile},(_,i)=>Array.from({length:nz*perTile},(_,j)=>({x:-width/2+edge+i*pitch,z:-depth/2+edge+j*pitch}))).flat();
}

// Height above the local kerb datum, at along-road chainage and lateral offset.
// Crossing fields: at, width, wing, rampDepth, lip. Curved mapping belongs to the
// caller's existing road frame, so rendered surfaces and placement share a frame.
export function footwaySurfaceHeight(profile,along,lateral,crossings=[],bays=[],ignorePockets=false){
 const edge=Math.abs(lateral)-profile.roadWidth/2;
 // A bay (passing place, or the widening round a refuge island) is cut into the footway at carriageway (channel) level, plus 80 mm so
 // the swept kerb stands on its edge. Everything beyond it is measured from the kerb as it actually runs there, so the upstand is 150 mm
 // all along and a crossing's dropped kerb and ramp keep their shape on a widened kerb. `ignorePockets` is for the kerb and pavement
 // rows that follow the bay edge: they want the pavement level, not the pocket floor.
 let offset=0;
 for(const b of bays)if(Math.sign(lateral)===b.side&&along>=b.x0&&along<=b.x1){const w=bayWidth(b,along);if(!ignorePockets&&edge<w+.08)return 0;offset=Math.max(offset,w);}
 const depth=edge-offset;
 let lowering=0;
 for(const c of crossings){
  if(c.side&&Math.sign(lateral)!==c.side)continue;   // a staggered crossing meets each kerb at its own chainage
  const flare=Math.max(0,Math.min(1,1-(Math.abs(along-c.at)-c.width/2)/c.wing));
  lowering=Math.max(lowering,(profile.kerbRise-c.lip)*flare*Math.max(0,1-depth/c.rampDepth));
 }
 return profile.kerbRise+depth*profile.footwayCrossfall-lowering;
}
// Street fire hydrants: <=100 m apart along the road, staggered on alternating sides,
// and no building development more than 100 m from one. The control valve sits
// between hydrant and supply main, so the head arrow points roadward.
export const hydrantRule={maxSpacing:100,maxToBuilding:100,valveOffset:.65};
export const hydrantSite=(x,z,yaw,serial)=>({x,z,yaw,serial,valve:{x:x-Math.sin(yaw)*hydrantRule.valveOffset,z:z-Math.cos(yaw)*hydrantRule.valveOffset}});
// Even targets (end gaps <= half spacing so adjoining roads also stay <=100 m), then the nearest clear spot.
export function staggeredHydrants(from,to,blocked,maxSpacing=hydrantRule.maxSpacing){
 const n=Math.ceil((to-from)/maxSpacing);
 return Array.from({length:n},(_,i)=>{
  const side=i%2?1:-1,target=from+(i+.5)*(to-from)/n;
  for(let d=0;d<maxSpacing/4;d+=.05)for(const x of [target-d,target+d])if(x>from&&x<to&&!blocked(x,side))return {x,side};
  throw new Error(`no clear hydrant position near ${target}`);
 });
}

// Passing place (TPDM V2 3.11.9): a pocket that widens the carriageway by `widen` metres on one side over `x0..x1`, with 1:3
// tapers (`taper` = 3 × widen) at both ends. Returns the extra width at chainage x (0 outside the bay).
export function bayWidth(b,x){return x<b.x0||x>b.x1?0:b.widen*Math.min(1,(x-b.x0)/b.taper,(b.x1-x)/b.taper);}
// Kerb path round a bay by arc length t: the two tapers and the straight, with the normal pointing away from the carriageway.
export function bayKerbPath(b,roadEdge){
 const slant=Math.hypot(b.taper,b.widen),full=b.x1-b.x0-2*b.taper,length=2*slant+full;
 const at=t=>{
  if(t<slant)return {x:b.x0+t*b.taper/slant,e:t*b.widen/slant,tx:b.taper/slant,tz:b.widen/slant};
  if(t<=slant+full)return {x:b.x0+b.taper+(t-slant),e:b.widen,tx:1,tz:0};
  const u=t-slant-full;return {x:b.x1-b.taper+u*b.taper/slant,e:b.widen-u*b.widen/slant,tx:b.taper/slant,tz:-b.widen/slant};};
 return {length,point(t){const p=at(Math.min(Math.max(t,0),length)),s=b.side,nx=-p.tz,nz=s*p.tx;return {x:p.x,z:s*(roadEdge+p.e),nx,nz};}};
}

// ---- Zebra crossing (TPDM V3 5.7.2, Road Traffic (Traffic Control) Regs Sch 4) ----
// RM1070 stripe field across the carriageway: the stripe at each kerb is black (road colour), 0.5–1.3 m deep; every other stripe is
// 0.5–0.7 m and as equal as practicable. So the road is b + (2n−1)·s + b: n white stripes, n−1 inner black ones. Picks the n whose
// stripe depth can sit closest to 0.6 m. Returns the white stripes as centre offsets across the road.
export function zebraStripes(roadWidth,{sMin=.5,sMax=.7,bMin=.5,bMax=1.3,ideal=.6}={}){
 let best=null;
 for(let n=1;n<=40;n++){
  const inner=2*n-1,lo=Math.max(sMin,(roadWidth-2*bMax)/inner),hi=Math.min(sMax,(roadWidth-2*bMin)/inner);
  if(lo>hi+1e-12)continue;
  const s=Math.min(hi,Math.max(lo,ideal)),miss=Math.abs(s-ideal);
  if(!best||miss<best.miss-1e-12)best={n,s,miss};
 }
 if(!best)throw new RangeError(`No stripe layout fits a ${roadWidth} m carriageway`);
 const {n,s}=best,b=(roadWidth-(2*n-1)*s)/2;
 return {n,s,b,whites:Array.from({length:n},(_,k)=>({z:-roadWidth/2+b+s/2+2*k*s,d:s}))};
}
// Zebra controlled area on one side of the crossing, measured outward from the stud row: 1.0 m to the give-way line RM1071
// (200 wide), 150 mm gap, N zig-zag marks of length X separated by 150 mm gaps, 150 mm gap, terminal bar RM1074 (200 deep).
// Standard N = 8, X = 2 m (L = 18.75 m). If less room is available, Table 5.7.2.1 gives N, then X = (L − 1400 − 150(N+1)) / 1000N
// (V3 5.7.2.10; here in metres). Under 3.75 m no zig-zags are laid.
const ZEBRA_TABLE=[[3.75,5.5,2],[5.5,7.5,3],[7.5,10,4],[10,12,5],[12,14,6],[14,16.5,7],[16.5,18.6,8]];
export function zebraControl(available){
 const standard=1.55+8*(2+.15);   // 18.75 m
 if(available<3.75)return null;
 const L=Math.min(available,standard),N=available>=18.6?8:ZEBRA_TABLE.find(([a,b])=>available>=a&&available<b)[2];
 const X=(L-1.4-.15*(N+1))/N;
 const marks=Array.from({length:N},(_,i)=>1.35+i*(X+.15));   // start of each mark
 return {N,X,L,giveWay:[1,1.2],marks,terminal:[marks[N-1]+X+.15,marks[N-1]+X+.35]};
}

// ---- Central refuge island of a staggered (two-stage) crossing (TPDM V4 3.2.3.5, 3.3.2) ----
// A raised island (stadium plan: straight sides, round ends) between x0 and x1, `half` either side of the road centre line.
// Each crossing enters it from its own side (side −1 = north edge, +1 = south edge) through a dropped kerb with the usual wings, and
// the ramp runs back across the island (rampDepth ≥ island width / 12 so it is no steeper than 1:12, PED-005).
export function islandContains(island,x,z){
 const r=island.half,cx=(island.x0+island.x1)/2,straight=(island.x1-island.x0)/2-r,dx=Math.max(0,Math.abs(x-cx)-straight);
 return Math.hypot(dx,z)<=r+1e-9;
}
export function islandHeight(island,x,z){
 let lowering=0;
 for(const c of island.crossings){
  const depth=c.side<0?island.half+z:island.half-z,flare=Math.max(0,Math.min(1,1-(Math.abs(x-c.x)-island.crossingWidth/2)/island.wing));
  lowering=Math.max(lowering,(island.kerbRise-island.lip)*flare*Math.max(0,1-depth/island.rampDepth));
 }
 // The island stands kerbRise above the adjacent carriageway, which crowns towards the centre line (island.road gives its level).
 return (island.road?island.road(z):0)+island.kerbRise-lowering;
}
// Kerb path round the island, by arc length: along the north edge, round the east end, back along the south edge, round the
// west end. Normals point INTO the island (K1 stones stand on the island side of their face, like a footway kerb).
export function islandKerbPath(island){
 const r=island.half,cx=(island.x0+island.x1)/2,straight=(island.x1-island.x0)/2-r,len=2*straight,arc=Math.PI*r,length=2*len+2*arc;
 return {length,point(t){
  t=((t%length)+length)%length;
  if(t<len)return {x:cx-straight+t,z:-r,nx:0,nz:1};
  if(t<len+arc){const a=(t-len)/r;return {x:cx+straight+r*Math.sin(a),z:-r*Math.cos(a),nx:-Math.sin(a),nz:Math.cos(a)};}
  if(t<2*len+arc){return {x:cx+straight-(t-len-arc),z:r,nx:0,nz:-1};}
  const a=(t-2*len-arc)/r;return {x:cx-straight-r*Math.sin(a),z:r*Math.cos(a),nx:Math.sin(a),nz:-Math.cos(a)};
 }};
}

// ---- Non-illuminated retro-reflective traffic bollard, NRTB (HyD H2312, general notes H2314; installation H2311) ----
// Metres. The drawings dimension only the plinth (350 × 400 mm, 75 mm proud of the island, on 160 mm pads), the 0.30 m roundel
// (about 700 cm²) and the minima: whole bollard ≥ 0.9 m above the ground line, roundel top ≤ 70 mm below the top of the body, front and
// rear conspicuity panels ≥ 150 000 mm², side panels ≥ 20 000 mm². The rest is sized to meet those.
export const NRTB={
 plinth:{w:.35,d:.4,h:.075},base:{w:.3,d:.3,h:.04},neck:{r:.05,h:.12},
 body:{w:.38,h:.84,depth:.07},roundel:{r:.15,topGap:.03},panelMargin:.02,panelCup:.03,
 side:{h:.5,w:.045},
};
NRTB.bodyBottom=NRTB.plinth.h+NRTB.base.h+NRTB.neck.h;
NRTB.height=NRTB.bodyBottom+NRTB.body.h;
NRTB.roundelCentre=NRTB.body.h-NRTB.roundel.topGap-NRTB.roundel.r;   // above the body bottom
// Area of the front conspicuity panel: round bottom following the body, straight sides, top edge cupping the roundel.
export function nrtbPanelArea(n=NRTB,steps=2000){
 const pr=n.body.w/2-n.panelMargin,rc=n.roundel.r+n.panelCup,cy=n.roundelCentre,by=n.body.w/2;let area=0;
 for(let i=0;i<steps;i++){const x=-pr+(i+.5)*2*pr/steps;area+=((cy-Math.sqrt(rc*rc-x*x))-(by-Math.sqrt(pr*pr-x*x)))*2*pr/steps;}
 return area;
}
