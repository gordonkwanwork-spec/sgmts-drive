// Authoring input is a pixel trace on the checked project OZP underlay. Keep furniture and edited roads.
import fs from 'node:fs';
const trace=JSON.parse(fs.readFileSync(process.argv[2]||'scripts/ozp-street-trace.json'));
const meta=JSON.parse(fs.readFileSync('public/lots/ozp-underlay.json'));
const file='public/street/furniture.json',raw=fs.readFileSync(file,'utf8'),data=JSON.parse(raw);
const roads=trace.roads.map(r=>({...r,pts:r.pts.map(([x,y])=>[+(meta.originX+x*meta.metresPerPixel).toFixed(3),+(meta.originZ+y*meta.metresPerPixel).toFixed(3)]),source:trace.source}));
const previous=data.network||{roads:[],areas:[]},ids=new Set(roads.map(r=>r.id));
data.network={...previous,source:trace.source,scope:trace.scope,roads:[...previous.roads.filter(r=>!ids.has(r.id)),...roads],areas:previous.areas||[]};
const marker=raw.lastIndexOf(',\n"network":');
const prefix=marker>=0?raw.slice(0,marker):!previous.roads.length?raw.trimEnd().slice(0,-1):null;
fs.writeFileSync(file,prefix!==null?prefix+',\n"network":'+JSON.stringify(data.network)+'\n}\n':JSON.stringify(data,null,1)+'\n');
console.log(`Authored ${roads.length} planned roads; preserved ${data.items.length} furniture items and ${(data.runs||[]).length} runs.`);
