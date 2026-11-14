// Dev tool: dump the city (network roads, OZP lots, corridor reserve, crossings, depot, service road) as JSON for
// scripts/city_overlay.py, which draws it on the OZP underlay. Run: node scripts/city-overlay.mjs out.json [network.json]
import fs from 'node:fs';
import {centreline,frames,halfWidth,presetOf} from '../src/street/network.js';
import {JUNCTIONS,UNDERPASSES,crossingGeometry,PATH,STOPS,sample} from '../src/alignment.js';
import {corridorReserve} from '../src/lots/wand.js';
import {SITE,CV_ROAD,CV_ROAD_WIDTH} from '../src/depot.js';
const net=process.argv[3]?JSON.parse(fs.readFileSync(process.argv[3])):JSON.parse(fs.readFileSync(new URL('../public/street/furniture.json',import.meta.url))).network;
const lots=JSON.parse(fs.readFileSync(new URL('../public/lots/lots.json',import.meta.url))).lots;
fs.writeFileSync(process.argv[2],JSON.stringify({
 roads:net.roads.map(r=>({id:r.id,pts:frames(r).filter((f,i,F)=>i%3===0||i===F.length-1).map(f=>[f.x,f.z]),hw:halfWidth(r),cw:presetOf(r).carriageway/2,head:r.turningRadius||0})),
 lots:lots.map(l=>({id:l.id,zone:l.zone,poly:l.poly})),
 corridor:PATH.filter((_,i)=>i%4===0).map(p=>[p.x,p.z]),reserve:corridorReserve().map(d=>[d.x,d.z,d.r]),
 crossings:[...JUNCTIONS,...UNDERPASSES].map(j=>{const g=crossingGeometry(j);return {c:j.c,name:j.name,under:!!j.underpass,x:g.C.x,z:g.C.z,ux:g.u.x,uz:g.u.z,extent:j.extent,hw:j.halfWidth+j.footway};}),
 stops:STOPS.map(s=>{const p=sample(s.s);return [s.id,p.x,p.z];}),depot:SITE,service:{pts:CV_ROAD.map(p=>[p.x,p.z]),hw:CV_ROAD_WIDTH/2}}));
