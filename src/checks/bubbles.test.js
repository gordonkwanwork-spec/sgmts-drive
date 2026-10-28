import assert from 'node:assert';
import {LINES,pickLine} from '../bubbles.js';
for(const [k,v] of Object.entries(LINES))assert.ok(v.length===2&&v[0]&&v[1],'bilingual line '+k);
const seq=a=>{let i=0;return()=>a[i++%a.length];};
assert.equal(pickLine({condition:'rain'},seq([.1])),'rain');
assert.equal(pickLine({condition:'night'},seq([.1])),'night');
assert.equal(pickLine({tramNear:true},seq([.1])),'tram');
for(let i=0;i<200;i++)assert.ok(LINES[pickLine({condition:['morning','sunset','rain','night'][i%4],standing:i%2===0})],'every pick is a real line');
console.log('Bubbles: every line is bilingual; weather, night and tram context pick the matching remark.');
