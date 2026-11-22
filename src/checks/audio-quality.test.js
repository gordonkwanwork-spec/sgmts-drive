import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';

// Track AudioContext construction, graph wiring, noise buffers, param scheduling, and HTMLMediaElement decks.
const ctorOptions=[];
const session={type:'auto'};
const visibility=new EventTarget();
visibility.hidden=false;
globalThis.document=visibility;
const createdBuffers=[];
const bufferSources=[];
const oscillators=[];
const compressors=[];
const media=[];
let paramCalls={setTargetAtTime:0,cancelAndHoldAtTime:0,cancelScheduledValues:0};

const makeParam=(initial=0)=>{
 const p={
  value:initial,
  setTargetAtTime(v,t,tau){paramCalls.setTargetAtTime++;p.value=v;p.lastTarget={v,t,tau};},
  setValueAtTime(v){p.value=v;},
  linearRampToValueAtTime(v){p.value=v;},
  exponentialRampToValueAtTime(v){p.value=v;},
  cancelAndHoldAtTime(){paramCalls.cancelAndHoldAtTime++;},
  cancelScheduledValues(){paramCalls.cancelScheduledValues++;}
 };
 return p;
};

class Media{
 constructor(){this.paused=true;this.loop=false;this.currentTime=0;this.duration=180;this._src='';this.srcAssignments=0;media.push(this);}
 get src(){return this._src;}
 set src(v){this._src=v;this.srcAssignments++;}
 setAttribute(){}
 play(){this.paused=false;return Promise.resolve();}
 pause(){this.paused=true;}
}

class MockAudioContext{
 constructor(opts){
  assert.equal(session.type,'ambient','mixable output selected before opening the device');
  ctorOptions.push(opts);
  this.currentTime=10;
  this.sampleRate=44100;
  this.state='running';
  this.destination={kind:'destination',connectionsFrom:[]};
 }
 createGain(){
  const n={kind:'gain',gain:makeParam(1),connections:[],connect(dst){n.connections.push(dst);dst?.connectionsFrom?.push?.(n);},disconnect(){}};
  return n;
 }
 createDynamicsCompressor(){
  const n={kind:'compressor',threshold:makeParam(-24),knee:makeParam(30),ratio:makeParam(12),attack:makeParam(0.003),release:makeParam(0.25),connections:[],connectionsFrom:[],connect(dst){n.connections.push(dst);dst?.connectionsFrom?.push?.(n);},disconnect(){}};
  compressors.push(n);return n;
 }
 createBiquadFilter(){
  return {kind:'filter',type:'lowpass',frequency:makeParam(350),Q:makeParam(1),connect(){},disconnect(){}};
 }
 createStereoPanner(){
  return {kind:'panner',pan:makeParam(0),connect(){},disconnect(){}};
 }
 createOscillator(){
  const o={kind:'osc',type:'sine',frequency:makeParam(440),connect(){},start(){},stop(){},disconnect(){}};
  oscillators.push(o);return o;
 }
 createBuffer(channels,length,sampleRate){
  const data=Array.from({length:channels},()=>new Float32Array(length));
  const buf={numberOfChannels:channels,length,sampleRate,getChannelData:ch=>data[ch]};
  createdBuffers.push(buf);return buf;
 }
 createBufferSource(){
  const s={kind:'bufferSource',buffer:null,loop:false,playbackRate:makeParam(1),connect(){},start(){},stop(){},disconnect(){}};
  bufferSources.push(s);return s;
 }
 decodeAudioData(){return Promise.resolve({duration:1,getChannelData:()=>Float32Array.of(0,.5,-.5,0)});}
 createMediaElementSource(){return {connect(){}};}
 suspend(){this.state='suspended';return Promise.resolve();}
 resume(){this.state='running';return Promise.resolve();}
}

globalThis.window={AudioContext:MockAudioContext,navigator:{audioSession:session}};
globalThis.Audio=Media;

const audio=await import('../audio.js');

// 1. AudioContext requests interactive latency and wires limiter before destination.
audio.updateMusic({screen:'menu',menuMusic:'l01b'});
audio.setVolume(0);
assert.equal(await audio.initAudio(),false);
assert.equal(ctorOptions.length,0,'zero volume leaves device unopened');
audio.setVolume(1);
assert.equal(await audio.announce('gap'),false,'simulation cannot unlock audio');
assert.equal(ctorOptions.length,0);
assert(await audio.initAudio(),'initAudio succeeds');
assert.equal(ctorOptions[0]?.latencyHint,'interactive','driving cues request interactive latency');
assert.equal(compressors.length,1,'safety dynamics compressor limiter created');
assert(compressors[0].connections.includes(compressors[0].connections[0])&&compressors[0].connections[0].kind==='destination','limiter connects to destination');
assert(compressors[0].connectionsFrom.length>=1,'master gain connects into limiter rather than bypassing it');
assert.equal(compressors[0].threshold.value,-2);
assert.equal(compressors[0].ratio.value,10);

// 2. Looping noise sources (tram roll, crowd, traffic tyres, 2 railway trains) use distinct stereo pink buffers.
const camera={position:{x:0,y:2,z:0},matrixWorld:{elements:[1,0,0,0,0,1,0,0,0,0,1,0,0,0,0,1]}};
const pt=(x,y,z)=>({x,y,z,distanceTo:c=>Math.hypot(x-c.x,y-c.y,z-c.z)});
const trains=[{emitters:[pt(20,8,0)]},{emitters:[pt(-30,8,0)]}];
audio.updateWorldSound({people:[5],cars:[12],trams:[20]},1);
audio.updateRailwaySound(trains,camera,1,1/60);

const loopingSources=bufferSources.filter(s=>s.loop);
assert.equal(loopingSources.length,5,'expected 5 looping noise beds (roll, voices, tyres, 2 trains)');
const bufSet=new Set(loopingSources.map(s=>s.buffer));
assert.equal(bufSet.size,5,'every looping noise bed owns its own independent AudioBuffer');
for(const buf of bufSet){
 assert.equal(buf.numberOfChannels,2,'noise buffer is stereo');
 const ch0=buf.getChannelData(0),ch1=buf.getChannelData(1);
 assert.notEqual(ch0[0],ch1[0],'stereo noise channels are decorrelated');
 for(let i=0;i<buf.length;i++){
  assert(Number.isFinite(ch0[i])&&Math.abs(ch0[i])<=1,`channel 0 sample ${i} valid in [-1,1]`);
  assert(Number.isFinite(ch1[i])&&Math.abs(ch1[i])<=1,`channel 1 sample ${i} valid in [-1,1]`);
 }
 assert(Math.abs(ch0[0]-ch0[buf.length-1])<0.35,'pink noise loop seam avoids harsh full-scale step');
}

// 3. No harsh square-wave oscillators used for continuous traction/world synthesis.
const continuousSquars=oscillators.filter(o=>o.type==='square');
assert.equal(continuousSquars.length,0,'continuous synthesizers avoid harsh aliasing square waves');

// 4. AudioParam automation deduplicates steady inputs and cancels stale automation on changes.
const driveBefore=paramCalls.setTargetAtTime;
audio.setDrive(25,true,true);
const afterFirstDrive=paramCalls.setTargetAtTime;
assert(afterFirstDrive>driveBefore,'first non-zero setDrive schedules parameter targets');
for(let i=0;i<60;i++){
 audio.setDrive(25,true,true);
 audio.updateWorldSound({people:[5],cars:[12],trams:[20]},1);
 audio.updateRailwaySound(trains,camera,1,1/60);
}
assert.equal(paramCalls.setTargetAtTime,afterFirstDrive,'60 steady frames schedule zero redundant setTargetAtTime calls');
const cancelsBefore=paramCalls.cancelAndHoldAtTime+paramCalls.cancelScheduledValues;
audio.setDrive(42,false,true);
assert(paramCalls.cancelAndHoldAtTime+paramCalls.cancelScheduledValues>cancelsBefore,'changing inputs cancels/collapses prior param automation cleanly');

// 5. Railway Doppler spikes are rejected across sudden camera cuts (>25 m jump).
const rateBeforeCut=bufferSources[bufferSources.length-1].playbackRate.value;
const jumpedTrains=[{emitters:[pt(200,8,0)]},{emitters:[pt(250,8,0)]}];
audio.updateRailwaySound(jumpedTrains,camera,1,1/60);
assert(Math.abs(bufferSources[bufferSources.length-1].playbackRate.value-rateBeforeCut)<1e-6,'large camera-cut distance jump resets Doppler velocity instead of spiking playbackRate');

// 6. Music deck retirement disables loop cleanly and reuses preloaded track URLs without re-setting src.
media[0].currentTime=177;
audio.updateMusic({screen:'driving',mode:'service',avatar:'drive',condition:'morning',v:10,park:false});
assert.equal(media[0].loop,false,'outgoing retiring music deck disables looping');
assert.equal(media[1].loop,true,'incoming active music deck enables looping');
const loadsAfterSwitch=media[0].srcAssignments;
audio.updateMusic({screen:'driving',mode:'service',avatar:'drive',condition:'rain',v:10,park:false});
media[0].srcAssignments; // track loads of rain track on deck 0
const rainTrackLoads=media[0].srcAssignments;
assert.equal(rainTrackLoads,loadsAfterSwitch+1,'switching to a new track updates src once');
media[0].currentTime=177;
// Loop back onto deck 1 with morning, then again to deck 0 with rain -> should not force re-assigning src on deck 0 when already loaded with rain.
audio.updateMusic({screen:'driving',mode:'service',avatar:'drive',condition:'morning',v:10,park:false});
const deck0LoadsBeforeReuse=media[0].srcAssignments;
media[1].currentTime=177;
// Force returning to the exact track already loaded on deck 0 (rain).
audio.updateMusic({screen:'driving',mode:'service',avatar:'drive',condition:'rain',v:10,park:false});
assert.equal(media[0].srcAssignments,deck0LoadsBeforeReuse,'re-using already loaded track URL on deck avoids redundant src reassignment');
// When a deck previously errored, switching back to that same track forces a clean src reload to recover.
const deck1LoadsBeforeErr=media[1].srcAssignments;
media[1].error={message:'network error'};
media[0].currentTime=177;
audio.updateMusic({screen:'driving',mode:'service',avatar:'drive',condition:'morning',v:10,park:false});
assert.equal(media[1].srcAssignments,deck1LoadsBeforeErr+1,'errored deck reloads src when reactivated');

// 7. experience.js integration: single per-frame drive call (none in updateFree / update / updateBranch) and no speechSynthesis.
const expSrc=readFileSync(new URL('../experience.js',import.meta.url),'utf8');
const sliceFn=name=>{const s=expSrc.indexOf('function '+name+'('),b=expSrc.indexOf('{',s);let l=1,i=b+1;while(l&&i<expSrc.length){if(expSrc[i]==='{')l++;if(expSrc[i]==='}')l--;i++;}return expSrc.slice(s,i);};
for(const fn of ['updateFree','update','updateBranch']){
 assert(!sliceFn(fn).includes('audio.setDrive('),`${fn} does not overwrite draw()'s authoritative audio.setDrive()`);
}
const audioSrc=readFileSync(new URL('../audio.js',import.meta.url),'utf8');
assert(!audioSrc.includes('speechSynthesis'),'no browser speechSynthesis fallback in audio.js');

audio.setMuted(true);
assert(media.every(deck=>deck.paused));
assert.equal(audio.musicStatus()[0].context,'suspended');
audio.updateMusic({screen:'menu',menuMusic:'l01b'});
assert.equal(await audio.initAudio(),false,'game input cannot override mute');
assert.equal(await audio.announce('gap'),false);
audio.setMuted(false);
await Promise.resolve();
assert.equal(audio.musicStatus()[0].context,'running');
assert.equal(media.filter(deck=>!deck.paused).length,1);
visibility.hidden=true;
visibility.dispatchEvent(new Event('visibilitychange'));
assert(media.every(deck=>deck.paused));
audio.setVolume(0);
visibility.hidden=false;
visibility.dispatchEvent(new Event('visibilitychange'));
assert.equal(audio.musicStatus()[0].context,'suspended','returning to tab respects zero volume');
audio.setVolume(1);
assert.equal(audio.musicStatus()[0].context,'running');
assert.equal(ctorOptions.length,1,'reuse the playback context');

console.log('Audio quality checks passed: output session lifecycle and interactive latency, master limiter, distinct stereo pink noise seams, steady param deduplication, Doppler jump rejection, deck loop/src reuse, and single per-frame drive sync.');
