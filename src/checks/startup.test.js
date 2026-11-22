import assert from 'node:assert/strict';
import {setImmediate} from 'node:timers/promises';
import {loadStartupModels} from '../startup-models.js';

const files=Array.from({length:14},(_,i)=>`model-${i}.glb`);
let attempts=0,active=0,peak=0;
const progress=[];
const result=await loadStartupModels([...files,files[0]],async file=>{
 active++;peak=Math.max(peak,active);
 await setImmediate();
 active--;
 if(file===files[0]&&++attempts===1)throw new TypeError('Failed to fetch');
 return file;
},(done,total)=>progress.push([done,total]));
assert.equal(attempts,2);
assert.equal(peak,6);
assert.equal(result.size,files.length);
assert.deepEqual(progress,files.map((_,i)=>[i+1,files.length]));

active=0;peak=0;
await loadStartupModels(files,async file=>{
 active++;peak=Math.max(peak,active);await setImmediate();active--;return file;
},()=>{},2);
assert.equal(peak,2,'phone startup bounds concurrent model decodes');

let missing=0;
await assert.rejects(loadStartupModels(['missing.glb'],async()=>{
 missing++;throw Object.assign(new Error('Not found'),{response:{status:404}});
},()=>assert.fail()),/missing\.glb/);
assert.equal(missing,1);
console.log('Startup model concurrency, retry, deduplication and progress passed.');
