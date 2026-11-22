// City rebuild: refresh corridor furniture for the rebuilt (OZP-positioned) junctions in public/street/furniture.json.
// - replaces every traffic_signal item with the layout from junctionSignalItems()
// - removes corridor items now standing in a side road's carriageway or kerb returns
// - fills road-lamp gaps left where the old junctions were (same kerb offset, height and facing as their neighbours)
// Run: node scripts/city-junction-furniture.mjs
import fs from 'node:fs';
import {clearOfBridgeStructure} from '../src/pedestrian-footbridges.js';
import {JUNCTIONS,UNDERPASSES,crossingGeometry,sample,cycleCrossing,fromChainage,toChainage} from '../src/alignment.js';
import {junctionSignalItems,pose,record} from '../src/street/roads.js';

const file=new URL('../public/street/furniture.json',import.meta.url),data=JSON.parse(fs.readFileSync(file));
const inRoad=P=>JUNCTIONS.some(j=>{const g=crossingGeometry(j),dx=P.x-g.C.x,dz=P.z-g.C.z,d=dx*g.u.x+dz*g.u.z,e=dx*g.n.x+dz*g.n.z;
 if(Math.abs(e)<j.halfWidth+.6&&Math.abs(d)<j.extent)return true;
 return [-1,1].some(σ=>[-1,1].some(τ=>{const k=g.corners[σ][τ];return Math.hypot(P.x-k.O.x,P.z-k.O.z)>k.R-.4&&Math.hypot(P.x-k.O.x,P.z-k.O.z)<k.R+4&&(P.x-k.T1.x)*(k.T2.x-k.T1.x)+(P.z-k.T1.z)*(k.T2.z-k.T1.z)>0&&e*τ>0&&Math.abs(d)<Math.abs(k.d)+.5;}));});
const before=data.items.length,removed=[];
data.items=data.items.filter(it=>{if(it.type==='traffic_signal'||/^litter_bin-\d+-[LR]$/.test(it.id)||/^lamp_cycle-city-/.test(it.id)||/^lamp_connecting-city-/.test(it.id))return false;if(it.road!=='corridor')return true;const keep=!inRoad(pose(it));if(!keep)removed.push(it.id);return keep;});
// Lamp gaps left at the three old junction chainages (1660, 2650, 3970): evenly spaced infill at the typical spacing,
// unless a new junction mouth sits in the gap (those are lit by the junction's own lamps).
const lamps=side=>data.items.filter(it=>it.type==='lamp_road'&&it.road==='corridor'&&it.side===side).sort((a,b)=>a.ch-b.ch);
let added=0;
for(const side of ['L','R']){const list=lamps(side),gaps=list.slice(1).map((it,i)=>it.ch-list[i].ch),typical=gaps.slice().sort((a,b)=>a-b)[gaps.length>>1];
 for(let i=1;i<list.length;i++){const a=list[i-1],b=list[i],gap=b.ch-a.ch;if(gap<1.7*typical||![1660,2650,3970].some(c=>c>a.ch&&c<b.ch))continue;
  const mouth=JUNCTIONS.some(j=>{const g=crossingGeometry(j),lat=side==='L'?1:-1;return sample(g.gaps[lat][1]).c>a.ch&&sample(g.gaps[lat][0]).c<b.ch;});if(mouth)continue;
  const n=Math.round(gap/typical);for(let k=1;k<n;k++)data.items.push({...a,id:`lamp_road-city-${side}-${Math.round(a.ch+gap*k/n)}`,ch:+(a.ch+gap*k/n).toFixed(3)});added+=n-1;}}
// Keep cycle lamps outside pedestrian forecourts when refilling historical gaps.
const inPedestrianGap=data.items.filter(it=>it.type==='lamp_cycle'&&it.road==='cycleway'&&cycleCrossing(pose(it).s));
data.items=data.items.filter(it=>!inPedestrianGap.includes(it));let cycleAdded=0;
{const list=data.items.filter(it=>it.type==='lamp_cycle'&&it.road==='cycleway').sort((a,b)=>a.ch-b.ch),gaps=list.slice(1).map((it,i)=>it.ch-list[i].ch),typical=gaps.slice().sort((a,b)=>a-b)[gaps.length>>1];
 for(let i=1;i<list.length;i++){const a=list[i-1],b=list[i],gap=b.ch-a.ch;if(gap<1.7*typical||![2650,3970].some(c=>c>a.ch-30&&c<b.ch+30))continue;const m=Math.round(gap/typical);
  for(let k=1;k<m;k++){const ch=+(a.ch+gap*k/m).toFixed(3);if(cycleCrossing(fromChainage(ch)))continue;data.items.push({...a,id:`lamp_cycle-city-${Math.round(ch)}`,ch,side:k%2?a.side:b.side});cycleAdded++;}}}
// Street lamps on every junction arm and under-viaduct road (registry roads J<c>/U<c>, param = distance along the road axis):
// just beyond the kerb returns and near each arm end at grade; either side of the viaduct deck underneath. Arms reach over the road.
let armLamps=0;for(const j of [...JUNCTIONS,...UNDERPASSES]){const g=crossingGeometry(j),reach=j.underpass?16:Math.max(...[-1,1].flatMap(σ=>[-1,1].map(τ=>Math.abs(g.corners[σ][τ].d))))+3;
 for(const d of [reach,(reach+j.extent)/2,j.extent-4].filter((d,i,a)=>i===0||d-a[i-1]>12))for(const σ of [-1,1])for(const side of ['L','R']){
  const item={id:`lamp_connecting-city-${j.c}-${σ>0?'a':'b'}${Math.round(d)}${side}`,type:'lamp_connecting',road:(j.underpass?'U':'J')+j.c,ch:+(σ*d+j.extent).toFixed(3),side,ref:'kerb',off:1,rot:side==='L'?-90:90,dy:0,params:{height:j.halfWidth>7?12:10}};
  // Slide the pole along its own kerb until its shaft and projecting head clear the bridge.
  const original=item.ch;
  const fits=ch=>{const p=pose(item,ch);return [0,1.4].every(arm=>clearOfBridgeStructure(p.x-arm*Math.sin(p.yaw),p.z-arm*Math.cos(p.yaw),.65));};
  if(!fits(original)){
   const options=Array.from({length:16},(_,i)=>i+1).flatMap(step=>[original+σ*step,original-σ*step]);
   const ch=options.find(v=>v>=1&&v<=2*j.extent-1&&fits(v));
   if(ch==null)throw Error('No clear kerb position for '+item.id);
   item.ch=+ch.toFixed(3);
  }
  data.items.push(item);armLamps++;}}
const signals=junctionSignalItems();data.items.push(...signals);
// Two litter bins per junction on diagonally opposite corners, in the footway 1.2 m behind the kerb return, facing the road.
for(const j of JUNCTIONS){const g=crossingGeometry(j);for(const [σ,τ] of [[1,1],[-1,-1]]){const k=g.corners[σ][τ],a=(k.a1+k.a2)/2,w={x:Math.cos(a),z:Math.sin(a)},x=k.O.x+w.x*(k.R-1.2),z=k.O.z+w.z*(k.R-1.2);
 data.items.push({id:`litter_bin-${j.c}-${σ>0?'L':'R'}`,type:'litter_bin',...record('corridor',x,sample(j.s).y+.18,z,Math.atan2(-w.x,-w.z),{guess:j.s})});}}
const d=x=>JSON.stringify(x);
fs.writeFileSync(file,'{'+Object.entries(data).map(([k,v])=>d(k)+':'+(Array.isArray(v)?'[\n'+v.map(d).join(',\n')+'\n]':d(v))).join(',')+'}\n');
console.log(`${armLamps} junction-arm lamps; cycle lamps: ${inPedestrianGap.length} removed from pedestrian approaches, ${cycleAdded} refilled; items ${before} → ${data.items.length}: removed ${removed.length} in junction roads (${removed.join(' ')}), +${added} infill lamps, ${signals.length} signal heads, ${JUNCTIONS.length*2} corner bins`);
