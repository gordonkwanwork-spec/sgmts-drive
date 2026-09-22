// Junction package checks (node): yellow boxes, L35 crossing fence openings, D3 priority merge and L35 keep-left routes.
// Run: node src/checks/junctions.test.js
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {sample,project,roadSection,JUNCTIONS,UNDERPASSES,CROSSINGS,L35,l35Offset,cycleOffset,sideCrossing} from '../alignment.js';
import {junctionBox,crossingGap,fenceAllowed} from '../environment.js';
import {l35TrafficCurve,l35ReturnCurve,l35BendCurve,L35_LINES,l35Mouth,l35D6} from '../routes.js';

const local=(r,p)=>({x:-((p.x-r.x)*r.lx+(p.z-r.z)*r.lz),z:-((p.x-r.x)*r.tx+(p.z-r.z)*r.tz)});
const bendS=L35_LINES.bendS,d6=JUNCTIONS.find(j=>j.c===2650),d3=UNDERPASSES.find(j=>j.c===3395);

// 1. Yellow boxes cover the carriageway between the crossings and never touch a footpath.
for(const j of JUNCTIONS){const {poly,lattice}=junctionBox(j),w=roadSection(j.s).right,h=j.halfWidth,R=6,r=sample(j.s);
 const toL=(s,lat)=>local(r,{x:sample(s).x+sample(s).lx*lat,z:sample(s).z+sample(s).lz*lat});
 const footpath=(x,z)=>{const ax=Math.abs(x),az=Math.abs(z),e=.05;
  if(j.c===2650&&x>0&&z<0){// L35 arm: its two footpaths, the corridor corner island and the outer kerb return
   const zl=Math.max(-h-8.5,Math.min(-h,z)),kl=toL(j.s-zl,-l35Offset(j.s-zl)+L35.width/2).x,kr=toL(j.s-zl,-l35Offset(j.s-zl)-L35.width/2).x;
   if(z<-h-R-e&&(x>kr+e&&x<kr+3.7||x<kl-e&&x>kl-3.7))return true;
   const f=Math.hypot(x-l35D6.kerb-R,z+h+R);if(x>l35D6.kerb+e&&z<-h-e&&f>R-3.75+e&&f<R-e)return true;
   const c=Math.hypot(ax-w-R,az-h-R);return x<kl-e&&ax>w+e&&az>h+e&&c>R-3.75+e&&c<R-e;}
  if(az>h+e&&az<h+3.7&&ax>w+R+e)return true;if(ax>w+e&&ax<w+3.7&&az>h+R+e)return true;
  const c=Math.hypot(ax-w-R,az-h-R);return ax>w+e&&az>h+e&&c>R-3.75+e&&c<R-e;};
 const pts=[...poly,...lattice.flat(),...lattice.map(([a,b])=>[(a[0]+b[0])/2,(a[1]+b[1])/2])];
 for(const [x,z] of pts)assert(!footpath(x,z),`${j.name}: box point (${x.toFixed(2)},${z.toFixed(2)}) lies on a footpath`);
 assert(lattice.length>20,`${j.name}: criss-cross lattice present`);
 const xs=poly.map(p=>p[0]),zs=poly.map(p=>p[1]);
 assert(Math.abs(Math.max(...zs)-(h+8.5))<1e-6&&Math.abs(Math.max(...xs)-(sideCrossing(j,1)-1.5))<1e-6&&Math.abs(Math.min(...xs)+(sideCrossing(j,-1)-1.5))<1e-6,`${j.name}: box reaches every crossing`);
 for(const [a,b] of lattice){const ang=Math.abs(Math.atan2(b[1]-a[1],b[0]-a[0]));assert(Math.abs(ang-Math.PI/4)<1e-6||Math.abs(ang-3*Math.PI/4)<1e-6,'lattice runs at 45 degrees');}
}
console.log('Yellow box junctions stay on the carriageway and reach every crossing.');

// 2. Fences open at every crossing that meets L35; crossers' walking line passes through the gaps.
const inL35=CROSSINGS.filter(c=>c.s>L35.start&&c.s<bendS);
assert(inL35.length===2,'both A6 crossings meet L35');
for(const c of inL35){
 for(let q=L35.start+30;q<bendS-4;q+=2.2)if(!crossingGap(q,q+2.2))assert(q+2.2<c.s-1.5||q>c.s+1.5,`L35 fence panel ${q.toFixed(1)} blocks the ${c.station} crossing`);
 for(const side of [-1,1])assert(!fenceAllowed(c.s-1,c.s+1,side),'corridor fence open too');
 const from=cycleOffset(c.s)-2.6,to=roadSection(c.s).right+.8,mid=-l35Offset(c.s);
 assert(from<mid-L35.width/2-.25&&to>mid+L35.width/2+.25,`${c.station} crossers walk over both L35 fence lines`);
}
console.log('L35 fences open at both A6 crossings.');

// 3. D3 is unsignalised: makeSignals only targets the at-grade junctions.
const src=readFileSync(new URL('../experience.js',import.meta.url),'utf8'),make=src.slice(src.indexOf('function makeSignals(){'),src.indexOf('function signalAt('));
assert(/for\(const j of junctions\)\{/.test(make)&&!/3395|UNDERPASSES/.test(make),'makeSignals no longer creates D3 signals');
assert(/const junctions=JUNCTIONS;/.test(src)&&JUNCTIONS.every(j=>!j.underpass),'signalised list is the three at-grade junctions');
console.log('D3 signals removed.');

// 4. L35 routes: finite, keep left, give way at the mouth, end in the nearside lane of their direction.
const a=sample(d6.s),b=sample(d3.s);
for(const curve of [l35TrafficCurve,l35ReturnCurve,l35BendCurve]){const L=curve.getLength();for(let i=0;i<=400;i++){const p=curve.getPointAt(i/400);assert([p.x,p.y,p.z].every(Number.isFinite),'finite L35 route');}}
for(const [name,curve] of [['out',l35TrafficCurve],['back',l35ReturnCurve]]){const L=curve.getLength();
 for(let d=0;d<=L;d+=2){const p=curve.getPointAt(d/L),t=curve.getTangentAt(d/L),q3=local(b,p),q6=local(a,p);
  // Keep left on L35: the vehicle sits left of the L35 centreline for its direction of travel.
  const s=project(p.x,p.z),r=sample(s),mid=-l35Offset(s),lat=(p.x-r.x)*r.lx+(p.z-r.z)*r.lz;if(s>L35.start+d6.halfWidth+14&&s<bendS-5&&Math.abs(lat-mid)<L35.width/2){assert((lat-mid)*Math.sign(t.x*r.tx+t.z*r.tz)>1.5,`${name}: keep left on L35 at ${d.toFixed(0)}`);}
  // Keep left on D3 away from the mouth: +lateral traffic uses the along<0 (local z>0) half.
  if(Math.abs(q3.z)<h3()&&Math.abs(q3.x-l35Mouth.x)>40){const dirLat=t.x*b.lx+t.z*b.lz;assert(Math.sign(q3.z)===Math.sign(dirLat)&&Math.abs(Math.abs(q3.z)-6.5)<.3,`${name}: D3 nearside lane at ${d.toFixed(0)}`);}
 }}
function h3(){return d3.halfWidth;}
const end=local(b,l35TrafficCurve.getPointAt(1)),endT=l35TrafficCurve.getTangentAt(1);assert(Math.abs(end.z-6.5)<.05&&endT.x*b.lx+endT.z*b.lz>.99,'out route ends in D3 nearside lane heading +lateral (left turn)');
const back=local(a,l35ReturnCurve.getPointAt(1)),backT=l35ReturnCurve.getTangentAt(1);assert(back.z<-4&&back.z>-d6.halfWidth&&-(backT.x*a.lx+backT.z*a.lz)>.99,'return route ends on D6 nearside half heading away from the corridor (left turn)');
const gw=local(b,l35TrafficCurve.getPointAt(L35_LINES.giveWay/l35TrafficCurve.getLength()));assert(Math.abs(gw.z-(d3.halfWidth+l35Mouth.taper+.6))<.3,'give-way stop point sits at the give-way line');
assert(L35_LINES.d6Out<L35_LINES.giveWay,'D6 stop line precedes the D3 give-way');
// Turning paths clear the R6 kerb returns by at least half a car width.
const M=l35Mouth,dk=M.x-M.half,uk=M.x+M.half;
for(const [curve,cx,cz,frame] of [[l35TrafficCurve,dk-M.R,d3.halfWidth+M.taper+M.R,b],[l35ReturnCurve,uk+M.R,d3.halfWidth+M.R,b],[l35ReturnCurve,l35D6.kerb+l35D6.R,-d6.halfWidth-l35D6.R,a]]){const L=curve.getLength();let min=Infinity;for(let d=0;d<=L;d+=.5){const q=local(frame,curve.getPointAt(d/L));if(Math.abs(q.x-cx)<M.R+3&&Math.abs(q.z-cz)<M.R+3)min=Math.min(min,Math.hypot(q.x-cx,q.z-cz));}assert(min>M.R+.9,`turning path clears kerb return (${min.toFixed(2)})`);}
console.log('L35 routes keep left, give way at D3 and merge into the nearside lane.');
