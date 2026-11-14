// The city's lane graph from data alone: shared by the game and the tests.
import {junctions} from '../street/network.js';
import {renderedGround} from '../environment.js';
import {JUNCTIONS,UNDERPASSES,crossingGeometry} from '../alignment.js';
import {crossingY} from './crossings.js';
import {laneGraph} from './life.js';
export const cityCrossings=()=>[...JUNCTIONS,...UNDERPASSES].map(j=>{const g=crossingGeometry(j);
 return {c:j.c,name:j.name,lanes:j.lanes,median:j.median,extent:j.extent,signal:!j.underpass,C:{x:g.C.x,z:g.C.z},u:{x:g.u.x,z:g.u.z},stop:j.underpass?{1:0,[-1]:0}:{1:Math.abs(g.stopD[1]),[-1]:Math.abs(g.stopD[-1])},y:(x,z)=>crossingY(j,x,z)+.03,junction:j};});
export const cityGraph=network=>laneGraph(junctions(network,renderedGround),cityCrossings());
