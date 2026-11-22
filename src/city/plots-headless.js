// The city's plots from data alone (no scene): shared by the game, the overlay tool and the tests, so all three see the same city.
import {junctions,networkMask} from '../street/network.js';
import {renderedGround,sceneryClear} from '../environment.js';
import {project,sample} from '../alignment.js';
import {frontagePlots} from './blocks.js';
import cachedPlots from './city-plots-cache.json' with {type:'json'};

export function dataDigest(network,lots){
 const str=JSON.stringify({network:network||null,lots:lots||[]});
 let h1=0x811c9dc5,h2=0x9e3779b9;
 for(let i=0;i<str.length;i++){
  const c=str.charCodeAt(i);
  h1=Math.imul(h1^c,0x01000193)>>>0;
  h2=Math.imul(h2^(c+(i&255)),0x85ebca6b)>>>0;
 }
 return h1.toString(16).padStart(8,'0')+h2.toString(16).padStart(8,'0')+':'+str.length;
}

export function computeCityPlots(network,lots){
 const roads=junctions(network,renderedGround).roads,mask=networkMask(network,renderedGround,roads);
 // within the terrain: the ground eases down to the backdrop beyond 600 m from the corridor
 const reach=(x,z)=>{const c=sample(project(x,z));return Math.hypot(x-c.x,z-c.z)<590;};
 return Object.assign(frontagePlots(roads,lots,{clear:(x,z,r)=>sceneryClear(x,z,r),onStreet:mask.onStreet,overlapsStreet:mask.overlapsStreet,reach}),{roads});
}

export function cityPlots(network,lots){
 if(cachedPlots?.hash&&dataDigest(network,lots)===cachedPlots.hash){
  const roads=junctions(network,renderedGround).roads;
  return Object.assign(cachedPlots.plots.map(p=>({...p,c:[...p.c],u:[...p.u],v:[...p.v],poly:p.poly.map(q=>[...q]),roles:[...p.roles]})),{roads});
 }
 return computeCityPlots(network,lots);
}
