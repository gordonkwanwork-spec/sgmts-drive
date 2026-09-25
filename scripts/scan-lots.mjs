// Dev aid: enumerate every closed OZP region near the corridor → tmp/ozp-regions.json (id, interior point, polygon).
// Usage: node scripts/scan-lots.mjs <mask.bin (1 byte/px, from public/lots/ozp-mask.png)> [out.json]
import fs from 'fs';
import {blockCorridor,flood,trace,simplify,pixelToWorld,corridorReserve} from '../src/lots/wand.js';
const cal=JSON.parse(fs.readFileSync(new URL('../public/lots/ozp-underlay.json',import.meta.url)));
const mask=blockCorridor(new Uint8Array(fs.readFileSync(process.argv[2])),cal),{width:w,height:h}=cal,seen=new Uint8Array(w*h),out=[];
const reserve=corridorReserve(),near=(x,z)=>reserve.some(p=>(p.x-x)**2+(p.z-z)**2<330*330);
for(let y=2;y<h;y+=4)for(let x=2;x<w;x+=4){const i=y*w+x;if(!mask[i]||seen[i])continue;const [wx,wz]=pixelToWorld(cal,[x,y]);if(!near(wx,wz))continue;
 const f=flood(mask,w,h,x,y,1e7);f.region.forEach((v,j)=>{if(v)seen[j]=1;});if(f.count<500||f.count>200000)continue;
 out.push({id:out.length+1,at:[wx,wz],px:[x,y],areaM2:Math.round(f.count*cal.metresPerPixel**2),poly:simplify(trace(f.region,w,h),1.6)});}
fs.writeFileSync(process.argv[3]||'tmp/ozp-regions.json',JSON.stringify(out));console.log(out.length,'regions');
