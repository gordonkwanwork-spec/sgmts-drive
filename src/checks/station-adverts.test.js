import assert from 'node:assert/strict';
import fs from 'node:fs';
import {createHash} from 'node:crypto';
import {STOPS,sample} from '../alignment.js';
import * as T from 'three';
import {stationAdvertGeometry,stationBillboards,ROOFTOP_ADVERTS,setBillboardLighting} from '../station-adverts.js';

const manifest=JSON.parse(fs.readFileSync('public/assets/asset-manifest.json'));
const hashes=new Set();
for(const st of STOPS){
  const image=fs.readFileSync(`public/assets/adverts/${st.id}.png`);
  assert.equal(image.subarray(1,4).toString(),'PNG');
  hashes.add(createHash('sha256').update(image).digest('hex'));
  const platforms=manifest.stations.find(m=>m.id===st.id).platforms;
  const g=stationAdvertGeometry(st,platforms,s=>sample(s).y);
  const p=g.attributes.position,n=g.attributes.normal,uv=g.attributes.uv;
  assert.equal(p.count,52*4,'26 framed adverts per platform');
  assert.equal(g.index.count,52*6);
  assert.equal(new Set(g.groups.map(g=>g.materialIndex)).size,7,'Each station mixes all seven campaigns');
  for(let k=1;k<g.groups.length;k++)assert.notEqual(g.groups[k].materialIndex,g.groups[k-1].materialIndex,'Adjacent posters differ');
  for(let i=0;i<p.count;i+=4){
    assert(n.getX(i)*p.getX(i)<0,'Both platform faces point toward the carriageway');
    assert(p.getY(i+2)>p.getY(i),'Artwork stays upright');
    assert.deepEqual([uv.getX(i),uv.getY(i),uv.getX(i+2),uv.getY(i+2)],[0,0,1,1]);
    for(let k=0;k<4;k++)assert(Number.isFinite(p.getY(i+k)));
    const platform=platforms[i<26*4?0:1],along=-p.getZ(i)+platform.offsetZ;
    const expected=platform.side*(7.05+platform.width-.39+(platform.bent?Math.max(0,-along-25)*.42:0));
    assert(Math.abs(p.getX(i)-expected)<1e-5,'Frames follow station stagger and flare');
  }
  g.dispose();
}
assert.equal(hashes.size,7,'Every station has different artwork');
assert.deepEqual(Object.keys(ROOFTOP_ADVERTS),['A2','A3','A6']);
for(const st of STOPS){
  const platforms=manifest.stations.find(m=>m.id===st.id).platforms;
  const boards=stationBillboards(st,platforms,new T.MeshLambertMaterial(),s=>sample(s).y);
  if(!ROOFTOP_ADVERTS[st.id]){assert.equal(boards.children.length,0);continue;}
  const image=fs.readFileSync(`public/assets/adverts/billboard-${st.id}.png`);
  assert.equal(image.subarray(1,4).toString(),'PNG');
  assert.equal(image.readUInt32BE(16)/image.readUInt32BE(20),3,'Artwork fits boards without stretching');
  const faces=boards.children.filter(n=>n.name.startsWith('Billboard artwork'));
  assert.equal(faces.length,4,'Both platforms have two readable faces');
  for(let i=0;i<faces.length;i++){
    const face=faces[i],p=platforms[Math.floor(i/2)];
    assert.equal(face.position.z,p.offsetZ,'A2 boards follow staggered roofs');
    const normal=new T.Vector3(0,0,1).applyEuler(face.rotation);
    assert(Math.abs(normal.x-(i%2?1:-1))<1e-9,'Opposite front faces prevent mirrored lettering');
    for(let z=-7.5;z<=7.5;z+=.5)assert(face.position.y-2.62>3.6+sample(st.s-p.offsetZ-z).y-sample(st.s).y,'Frame clears graded canopy');
  }
  assert.equal(boards.children.filter(n=>n.name==='Billboard roof support').length,6);
  // No real lights: fixtures only, the floodlit wash is the print's own emissive map at night.
  assert.equal(boards.children.filter(n=>n.isLight).length,0,'Billboards add no realtime lights');
  assert.equal(boards.children.filter(n=>n.name==='Billboard lamp housing').length,8,'Two floodlight fixtures per billboard face');
  for(const night of [true,false,true]){
    setBillboardLighting(boards,night);
    for(const face of faces){assert(face.material.isMeshLambertMaterial);assert.equal(face.material.emissiveMap,face.material.map);assert.equal(face.material.emissiveIntensity,night?.55:0,'Print floodlit only at night');}
  }

}
console.log('Seven unique campaigns; 364 upright platform adverts with inward faces, stagger and flare passed');
console.log('Three rooftop campaigns: six framed boards, twelve readable faces, canopy clearance and stagger passed');
