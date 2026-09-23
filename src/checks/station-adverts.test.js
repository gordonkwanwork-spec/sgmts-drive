import assert from 'node:assert/strict';
import fs from 'node:fs';
import {createHash} from 'node:crypto';
import {STOPS,sample} from '../alignment.js';
import {stationAdvertGeometry} from '../station-adverts.js';

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
console.log('Seven unique campaigns; 364 upright platform adverts with inward faces, stagger and flare passed');
