import {Vector3} from 'three';
import {STOPS,sample} from './alignment.js';

export const nearestStation=s=>STOPS.reduce((best,st,i)=>Math.abs(st.s-s)<Math.abs(STOPS[best].s-s)?i:best,0);

// Use the station mesh's own frame, including its stagger and bent Nai Wai wing.
export function stationBenchSeats(root,st,platforms){
 root.updateMatrixWorld(true);const seats=[];
 for(const p of platforms)for(const y of [-27,-12,8,25])for(const dy of [-.5,.55]){
  const along=y+dy,z=-along,bend=p.bent?Math.max(0,z-p.bendStartLocalZ)*p.bendSlope:0;
  const world=root.getObjectByName(p.name).localToWorld(new Vector3(p.side*(Math.abs(p.edgeX)+p.width-1.2+bend),p.height+.01,z));
  const local=root.worldToLocal(world.clone()),s=st.s-local.z;world.y+=sample(s).y-sample(st.s).y;
  seats.push({x:world.x,y:world.y,z:world.z,heading:root.rotation.y+p.side*Math.PI/2,seat:.54,s,station:STOPS.indexOf(st),side:p.side});
 }
 return seats;
}

// Moving riders can enter another station's population. First visible identity wins.
export function uniqueStationPeople(actors){
 const seen=new Set();
 for(const {group,person=group,s} of actors){
  if(!group.visible||!person.visible)continue;
  const id=person.userData.characterId;if(id===undefined)continue;
  const key=nearestStation(s)+':'+id;
  if(seen.has(key))group.visible=false;else seen.add(key);
 }
}
