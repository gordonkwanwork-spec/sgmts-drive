// Build public/lots/lots.json from scripts/ozp-lot-labels.json (one interior point + OZP attributes per lot).
// Lots already in lots.json are kept (matched by id) so editor work is never overwritten; pass --force to rebuild all.
// Usage: node scripts/seed-lots.mjs <mask.bin: 1 byte/px of public/lots/ozp-mask.png> [raw.bin: same for ozp-mask-raw.png] [--force]
import fs from 'fs';
import {blockCorridor,wandPolygon} from '../src/lots/wand.js';
import {defaultModel} from '../src/lots/massing.js';
const file=p=>new URL('../'+p,import.meta.url),cal=JSON.parse(fs.readFileSync(file('public/lots/ozp-underlay.json')));
const bins=process.argv.slice(2).filter(a=>!a.startsWith('--')),mask=blockCorridor(new Uint8Array(fs.readFileSync(bins[0])),cal),raw=bins[1]&&blockCorridor(new Uint8Array(fs.readFileSync(bins[1])),cal),labels=JSON.parse(fs.readFileSync(file('scripts/ozp-lot-labels.json')));
const old=!process.argv.includes('--force')&&fs.existsSync(file('public/lots/lots.json'))?JSON.parse(fs.readFileSync(file('public/lots/lots.json'))).lots:[];
const lots=[...old],used=new Set(old.map(l=>l.id));
for(const [i,l] of labels.entries()){let id=`${l.site||l.zone.replace(/[^A-Z]/g,'')}-${i+1}`;if(used.has(id))continue;used.add(id);
 const poly=l.poly||wandPolygon(mask,cal,l.at,1.6,400000,raw);// a supplied poly covers lots whose plan boundary is open
 if(!poly){console.warn('No region at',l);continue;}
 lots.push({id,site:l.site,zone:l.zone,maxBH:l.maxBH,maxStoreys:l.maxStoreys,note:l.note,poly,model:defaultModel(l.zone)});}
fs.writeFileSync(file('public/lots/lots.json'),JSON.stringify({version:1,source:'S/HSK/2A OZP (Annex II) + Notes (Annex III)',lots},null,0).replace(/\{"id"/g,'\n{"id"'));
console.log(lots.length,'lots');
