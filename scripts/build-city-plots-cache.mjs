import fs from 'node:fs';
import {computeCityPlots,dataDigest} from '../src/city/plots-headless.js';

const furniture=JSON.parse(fs.readFileSync(new URL('../public/street/furniture.json',import.meta.url),'utf8'));
const lots=JSON.parse(fs.readFileSync(new URL('../public/lots/lots.json',import.meta.url),'utf8')).lots;
const t0=performance.now();
const plots=computeCityPlots(furniture.network,lots);
const dt=performance.now()-t0;
const hash=dataDigest(furniture.network,lots);
const out=new URL('../src/city/city-plots-cache.json',import.meta.url);
fs.writeFileSync(out,JSON.stringify({hash,plots:[...plots]}));
console.log(`Built city-plots-cache.json (${plots.length} plots, hash ${hash}) from live compute in ${dt.toFixed(1)} ms`);
