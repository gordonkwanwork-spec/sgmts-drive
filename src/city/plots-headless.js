// The city's plots from data alone (no scene): shared by the game, the overlay tool and the tests, so all three see the same city.
import {junctions,networkMask} from '../street/network.js';
import {renderedGround,sceneryClear} from '../environment.js';
import {project,sample} from '../alignment.js';
import {frontagePlots} from './blocks.js';
export function cityPlots(network,lots){const roads=junctions(network,renderedGround).roads,mask=networkMask(network,renderedGround);
 // within the terrain: the ground eases down to the backdrop beyond 600 m from the corridor
 const reach=(x,z)=>{const c=sample(project(x,z));return Math.hypot(x-c.x,z-c.z)<590;};
 return Object.assign(frontagePlots(roads,lots,{clear:(x,z,r)=>sceneryClear(x,z,r),onStreet:mask.onStreet,reach}),{roads});}
