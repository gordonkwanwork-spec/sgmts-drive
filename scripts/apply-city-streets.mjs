// Explicit game-layout streets, outside the dedicated corridor. These are
// illustrative city connections, not an engineering trace of the OZP.
import fs from 'node:fs';
import {JUNCTIONS,UNDERPASSES} from '../src/alignment.js';
import {frames,nearestOn,centreline,halfWidth,reserveClash,tieFrame} from '../src/street/network.js';
const file='public/street/furniture.json',data=JSON.parse(fs.readFileSync(file));
const roads=data.network.roads.filter(r=>!r.id.startsWith('city-'));
for(const r of roads)r.standard='sandbox';
const source='Sandbox street standard, 2026-10-07; illustrative city connections to the existing engineering junctions';
const road=(id,name,pts,extra={})=>({id:'city-'+id,name,preset:'local',standard:'sandbox',footway:'red',source,pts,...extra});
const west=road('west','Western city street',[
 [-520,-150],[-510,-500],[-510,-1000],[-260,-1320],[-120,-1547],[-140,-1750],[40,-2050],[150,-2300],[145,-2470],[-92,-2500],[-485,-2630],[-551,-3131],[-350,-3485],[-168,-3613],[-100,-3700]
],{carriageway:7.6,footpath:3.75});
const east=road('east','Eastern city street',[
 [180,-80],[200,-670],[260,-1150],[315,-1399],[400,-1780],[616,-2338],[560,-2670],[280,-3010],[-70,-3040],[-90,-3100],[-20,-3260],[80,-3210],[180,-3230]
],{carriageway:7.6,footpath:3.75});
roads.push(west,east);
for(const j of [...JUNCTIONS,...UNDERPASSES])for(const side of [1,-1]){
 const tie={junction:j.c,side},f=tieFrame(tie),B=side===1?west:east,F=frames(B);
 const lead=[f.x+f.tx*32,f.z+f.tz*32],target=nearestOn(F,f.x+f.tx*130,f.z+f.tz*130).f;
 roads.push(road(`${Math.round(j.c)}-${side>0?'west':'east'}`,`${j.name} · city connection ${side>0?'west':'east'}`,[[f.x,f.z],lead,[target.x,target.z]],{carriageway:j.halfWidth*2,footpath:3.75,tie}));
}
// Connect the retained OZP neighbourhood at the western ends, preserving the traced roads.
for(const [i,r] of roads.filter(r=>['ozp-d7-west','ozp-d8-west'].includes(r.id)).entries()){
 if(r.cityExtended)r.pts=r.pts.slice(2);
 const p=r.pts[0],F=frames(west),q=nearestOn(F,...p).f;
 // Existing road extends from this point; use an exact endpoint continuation.
 const dir=[p[0]-r.pts[1][0],p[1]-r.pts[1][1]],len=Math.hypot(...dir),b=[p[0]+dir[0]/len*18,p[1]+dir[1]/len*18];
 // Make this an extension of the existing road, so no end-on kerb closes the mouth.
 r.pts=[[q.x,q.z],b,...r.pts];r.cityExtended=true;
}
for(const r of roads){const clash=reserveClash(centreline(r.pts),{width:halfWidth(r)});if(clash)throw Error(`${r.id} intersects corridor at ${clash}`);}
data.network={...data.network,roads,scope:'Authored OZP neighbourhood plus illustrative surrounding city streets, joined at all existing crossing-road ends. No new dedicated-corridor crossings.'};
fs.writeFileSync(file,'{'+Object.entries(data).map(([k,v])=>JSON.stringify(k)+':'+(Array.isArray(v)?'[\n'+v.map(x=>JSON.stringify(x)).join(',\n')+'\n]':JSON.stringify(v))).join(',')+'}\n');console.log(`${roads.length} authored streets; existing furniture and lot records retained.`);
