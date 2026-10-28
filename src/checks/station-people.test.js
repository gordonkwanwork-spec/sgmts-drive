import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {GLTFLoader} from 'three/addons/loaders/GLTFLoader.js';
import {Vector3,Raycaster,Group} from 'three';
import {STOPS,sample} from '../alignment.js';
import {stationBenchSeats,uniqueStationPeople} from '../station-people.js';
const manifest=JSON.parse(readFileSync('public/assets/asset-manifest.json'));
const loader=new GLTFLoader(),ray=new Raycaster();let checked=0;
for(const st of STOPS){
 const b=readFileSync(`public/assets/station-${st.id}.glb`),{scene:root}=await loader.parseAsync(b.buffer.slice(b.byteOffset,b.byteOffset+b.byteLength),'');
 root.updateMatrixWorld(true);
 root.traverse(n=>{if(!n.isMesh)return;const m=n.matrixWorld.clone(),inv=m.clone().invert(),p=n.geometry.attributes.position,v=new Vector3();for(let i=0;i<p.count;i++){v.fromBufferAttribute(p,i).applyMatrix4(m);v.y+=sample(st.s-v.z).y-sample(st.s).y;v.applyMatrix4(inv);p.setXYZ(i,v.x,v.y,v.z);}n.geometry.computeBoundingSphere();n.geometry.computeBoundingBox();});
 const r=sample(st.s);root.position.set(r.x,r.y,r.z);root.rotation.y=r.heading;root.updateMatrixWorld(true);
 for(const seat of stationBenchSeats(root,st,manifest.stations.find(m=>m.id===st.id).platforms)){
  ray.set(new Vector3(seat.x,seat.y+seat.seat+.15,seat.z),new Vector3(0,-1,0));
  const hit=ray.intersectObject(root,true)[0];assert(hit&&Math.abs(hit.point.y-seat.y-seat.seat)<.02,`${st.id} seat lacks bench support at ${seat.x},${seat.z}`);checked++;
 }
}
const actor=(id,s)=>{const group=new Group();group.userData.characterId=id;return {group,s};};
const a=actor('same',STOPS[0].s),b=actor('same',STOPS[0].s+10),c=actor('same',STOPS[1].s),d=actor('different',STOPS[0].s);
uniqueStationPeople([a,b,c,d]);assert(a.group.visible&&!b.group.visible&&c.group.visible&&d.group.visible);
b.group.visible=true;b.s=STOPS[1].s;uniqueStationPeople([a,c,b]);assert(!b.group.visible,'moving actor cannot duplicate identity at destination');
console.log(`${checked} seats supported by real station geometry; per-station identity uniqueness passed.`);
