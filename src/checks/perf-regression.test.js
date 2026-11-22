import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import * as T from 'three';
import {loadModernKit,renderModernBuildings} from '../city/kit/hk-modern.js';
import {loadSplat,createSplatMesh,setSplatsVisibleForFeed} from '../splat-lite.js';
import {cityPlots,dataDigest} from '../city/plots-headless.js';
import {junctions} from '../street/network.js';
import {fieldLevel,renderedGround} from '../environment.js';
import {LENGTH,sample} from '../alignment.js';

// 1. hk-modern: spatial 320 m shell chunking, shadow/feed/cube camera guards, and per-frame dedup.
{
 await loadModernKit({url:'missing-kit.glb'});
 const poly=(x,z)=>[{x:x-22,z:z-22},{x:x+22,z:z-22},{x:x+22,z:z+22},{x:x-22,z:z+22}];
 const sites=[
  {id:'s0',poly:poly(100,100),yaw:0,modern:'private-cross',seed:1},
  {id:'s1',poly:poly(500,100),yaw:0,modern:'private-cross',seed:2},
  {id:'s2',poly:poly(100,500),yaw:0,modern:'private-cross',seed:3},
  {id:'s3',poly:poly(500,500),yaw:0,modern:'private-cross',seed:4},
 ];
 const root=renderModernBuildings(sites,{near:120});
 await root.userData.ready;
 root.updateMatrixWorld(true);
 const shells=root.children.filter(c=>c.name==='Modern shells');
 assert.equal(shells.length,4,'expected 4 spatial 320 m shell chunks');

 const scene=new T.Scene();
 const cam=new T.PerspectiveCamera(48,16/9,0.5,1600);
 cam.position.set(100,5,130);
 cam.lookAt(100,5,100);
 cam.updateMatrixWorld(true);
 cam.matrixWorldInverse.copy(cam.matrixWorld).invert();
 const info={render:{frame:1}};
 shells[0].onBeforeRender({info},scene,cam);
 const nearAtOrigin=root.userData.recs.map(r=>r.near);
 assert.ok(nearAtOrigin[0],'site at (100,100) should be near');
 assert.ok(!nearAtOrigin.at(-1),'site at (500,500) should start far');

 // Shadow, feed, and cube cameras must not recompute LOD when placed elsewhere.
 const farCam=new T.PerspectiveCamera(48,16/9,0.5,1600);
 farCam.position.set(500,5,530);
 farCam.lookAt(500,5,500);
 farCam.updateMatrixWorld(true);
 farCam.matrixWorldInverse.copy(farCam.matrixWorld).invert();

 const shadowCam=new T.OrthographicCamera(-50,50,50,-50,1,200);
 shadowCam.position.copy(farCam.position);
 shadowCam.updateMatrixWorld(true);
 shadowCam.matrixWorldInverse.copy(shadowCam.matrixWorld).invert();
 shells[0].onBeforeRender({info:{render:{frame:2}}},scene,shadowCam);
 assert.deepEqual(root.userData.recs.map(r=>r.near),nearAtOrigin);

 const feedCam=farCam.clone();
 feedCam.userData.isFeed=true;
 shells[0].onBeforeRender({info:{render:{frame:3}}},scene,feedCam);
 assert.deepEqual(root.userData.recs.map(r=>r.near),nearAtOrigin);

 const cubeWrap=new T.CubeCamera(1,100,new T.WebGLCubeRenderTarget(8));
 const cubeCam=farCam.clone();
 cubeWrap.add(cubeCam);
 shells[0].onBeforeRender({info:{render:{frame:4}}},scene,cubeCam);
 assert.deepEqual(root.userData.recs.map(r=>r.near),nearAtOrigin);

 // Second shell on same frame=1 is deduplicated (does not recompute LOD for moved camera).
 shells[1].onBeforeRender({info},scene,farCam);
 assert.deepEqual(root.userData.recs.map(r=>r.near),nearAtOrigin);

 // Next frame=5 allows update so (400,400) flips near.
 shells[1].onBeforeRender({info:{render:{frame:5}}},scene,farCam);
 assert.ok(root.userData.recs.some((r,i)=>r.near!==nearAtOrigin[i]),'expected LOD update on new frame');
}

// 2. splat-lite: compact textures, ArrayBuffer GC safety, sync sort & feed camera hiding.
{
 const origFetch=globalThis.fetch;
 let data;
 try{
  const bytes=await readFile(new URL('../../public/assets/a1-lion.gsplat',import.meta.url));
  globalThis.fetch=async()=>({arrayBuffer:async()=>bytes.buffer.slice(bytes.byteOffset,bytes.byteOffset+bytes.byteLength)});
  data=await loadSplat('a1-lion.gsplat');
 }finally{
  globalThis.fetch=origFetch;
 }
 assert.equal(data.ordered,true);
 assert.equal(data.n,50000);
 assert.equal(data.pos.buffer.byteLength,data.n*12,'pos must not retain entire fetched ArrayBuffer');
 assert.ok(data.textures[0] instanceof Float32Array);
 assert.ok(data.textures[1] instanceof Uint16Array);
 assert.ok(data.textures[2] instanceof Uint16Array);
 assert.ok(data.textures[3] instanceof Uint8Array);

 const mesh=createSplatMesh(data,{center:new T.Vector3(0,0.9,0),radius:1.4});
 assert.equal(mesh.material.uniforms.tA.value.type,T.FloatType);
 assert.equal(mesh.material.uniforms.tB.value.type,T.HalfFloatType);
 assert.equal(mesh.material.uniforms.tC.value.type,T.HalfFloatType);
 assert.equal(mesh.material.uniforms.tD.value.type,T.UnsignedByteType);

 const scene=new T.Scene();
 scene.add(mesh);
 mesh.updateMatrixWorld(true);
 const fakeRenderer={getDrawingBufferSize:v=>v.set(1280,720)};
 const orderAttr=mesh.geometry.attributes.order;

 const ortho=new T.OrthographicCamera(-10,10,10,-10,0.1,100);
 ortho.updateMatrixWorld(true);
 mesh.onBeforeRender(fakeRenderer,scene,ortho);
 assert.equal(orderAttr.updateRanges.length,0);

 const feed=new T.PerspectiveCamera(60,16/9,0.2,140);
 feed.userData.isFeed=true;
 feed.updateMatrixWorld(true);
 mesh.onBeforeRender(fakeRenderer,scene,feed);
 assert.equal(orderAttr.updateRanges.length,0);

 const persp=new T.PerspectiveCamera(48,16/9,0.2,500);
 persp.position.set(0,1.5,5);
 persp.lookAt(0,0.9,0);
 persp.updateMatrixWorld(true);
 mesh.onBeforeRender(fakeRenderer,scene,persp);
 assert.equal(orderAttr.updateRanges.length,1);
 const m=mesh.geometry.instanceCount;
 assert.equal(m,data.n);
 assert.equal(orderAttr.updateRanges[0].count,m);

 setSplatsVisibleForFeed(true);
 assert.equal(mesh.visible,false);
 setSplatsVisibleForFeed(false);
 assert.equal(mesh.visible,true);
}

// 3 & 4. cityPlots cache + invalidation, junctions memoization + mutation invalidation.
{
 const lots=JSON.parse(await readFile(new URL('../../public/lots/lots.json',import.meta.url),'utf8')).lots;
 const furniture=JSON.parse(await readFile(new URL('../../public/street/furniture.json',import.meta.url),'utf8'));
 const cache=JSON.parse(await readFile(new URL('../city/city-plots-cache.json',import.meta.url),'utf8'));
 assert.equal(dataDigest(furniture.network,lots),cache.hash);

 const t0=performance.now();
 const plots=cityPlots(furniture.network,lots);
 const dtCold=performance.now()-t0;
 assert.ok(dtCold<400,`cold cached cityPlots took ${dtCold.toFixed(1)} ms (limit 400 ms)`);
 const t1=performance.now();
 cityPlots(furniture.network,lots);
 const dtWarm=performance.now()-t1;
 assert.ok(dtWarm<30,`warm cached cityPlots took ${dtWarm.toFixed(1)} ms (limit 30 ms)`);
 assert.equal(plots.length,cache.plots.length);
 assert.ok(Array.isArray(plots.roads)&&plots.roads.length>0);

 // Digest mismatch falls back cleanly to live computation.
 const smallNet={roads:furniture.network.roads.slice(0,2),areas:[]};
 assert.notEqual(dataDigest(smallNet,[]),cache.hash);
 const fallbackPlots=cityPlots(smallNet,[]);
 assert.ok(Array.isArray(fallbackPlots)&&Array.isArray(fallbackPlots.roads));

 // junctions memoization & in-place mutation invalidation (map editor safety).
 const netClone=structuredClone(furniture.network);
 const j1=junctions(netClone,renderedGround);
 const j2=junctions(netClone,renderedGround);
 assert.equal(j1,j2);
 netClone.roads[0].pts[0][0]+=1.5;
 const j3=junctions(netClone,renderedGround);
 assert.notEqual(j3,j1);
}

// 5. fieldLevel grid error < 0.02 m across 200 samples vs exact inverse-distance blend.
{
 const exactPts=Array.from({length:Math.ceil(LENGTH/40)+1},(_,i)=>{
  const r=sample(Math.min(LENGTH,i*40));
  return [r.x,r.z,r.groundY];
 });
 const exact=(x,z)=>{
  let w=0,y=0;
  for(const [px,pz,py] of exactPts){const k=1/((x-px)**2+(z-pz)**2+6400)**2;w+=k;y+=k*py;}
  return y/w;
 };
 let maxErr=0;
 for(let i=0;i<200;i++){
  const s=(i+0.5)/200*LENGTH,r=sample(s),ang=i*2.399963229728653,rad=40+(i%11)*45;
  const x=r.x+Math.cos(ang)*rad,z=r.z+Math.sin(ang)*rad;
  const err=Math.abs(fieldLevel(x,z)-exact(x,z));
  if(err>maxErr)maxErr=err;
 }
 assert.ok(maxErr<0.02,`fieldLevel max error ${maxErr.toFixed(4)} m exceeds 0.02 m`);
}

console.log('Perf regression checks passed: hk-modern chunks/guards/dedup, splat textures/sync sort/feed toggle, cityPlots cache (<100 ms), junctions memoization, fieldLevel grid (<0.02 m).');
