import assert from 'node:assert/strict';
import {existsSync} from 'node:fs';
import {MUSIC_TRACKS,musicChoice} from '../music-catalog.js';
const drive={screen:'driving',mode:'service',avatar:'drive',condition:'morning',v:10,park:false};
for(const [condition,id] of Object.entries({morning:'g01b',sunset:'g02a',rain:'g03b',night:'g04b'}))assert.equal(musicChoice({...drive,condition}).id,id);
for(const [loadingVariant,id] of Object.entries({route:'l04a',window:'l01b',departure:'l02b'}))for(const screen of ['loading','menu'])assert.equal(musicChoice({screen,loadingVariant}).id,id);
for(const extra of [{mode:'free'},{avatar:'foot'},{avatar:'bike'},{avatar:'passenger'}])assert.equal(musicChoice({...drive,...extra}).id,'g05a');
assert.equal(musicChoice({...drive,mode:'control',v:0}).id,'g04b');
assert.equal(musicChoice({...drive,screen:'complete'}).id,'l03b');
assert(musicChoice({...drive,v:0,park:true}).level>0,'Station dwell keeps a quiet music bed');
assert(musicChoice({...drive,v:0,park:true}).level<musicChoice(drive).level);
for(const extra of [{crashed:true},{screen:'paused'},{gameMusic:'off'}])assert.equal(musicChoice({...drive,...extra}).id,null);
assert.equal(musicChoice({screen:'menu',menuMusic:'off'}).id,null);
assert.equal(musicChoice({screen:'menu',menuMusic:'l05a'}).id,'l05a');
assert.equal(musicChoice({...drive,gameMusic:'l02a'}).id,'l02a');
assert.equal(musicChoice({...drive,gameMusic:'invalid'}).id,'g01b');
assert.equal(new Set(MUSIC_TRACKS.map(t=>t.id)).size,23);
for(const track of MUSIC_TRACKS){assert(existsSync(new URL('../../public/audio/'+track.file,import.meta.url)),track.file);assert(track.gain>0&&track.gain<=1);}
// Exercise the real two-deck mixer with a minimal browser audio stand-in.
const media=[];
class Media {constructor(){this.paused=true;this.currentTime=0;this.duration=180;media.push(this);}setAttribute(){}play(){this.paused=false;return Promise.resolve();}pause(){this.paused=true;}}
const param=()=>({value:0,setTargetAtTime(value,time,tau){this.value=value;this.tau=tau;},setValueAtTime(v){this.value=v;},cancelScheduledValues(){}});
const node=()=>({gain:param(),frequency:param(),Q:param(),connect(){},start(){},stop(){}});
let context;
class Context{constructor(){context=this;this.currentTime=0;this.sampleRate=8;this.state='running';this.destination={};}createGain(){return node();}createBiquadFilter(){return node();}createOscillator(){return node();}createBuffer(c,n){return {getChannelData:()=>new Float32Array(n)}}createBufferSource(){return node();}decodeAudioData(){return Promise.resolve({duration:1});}createMediaElementSource(){return node();}resume(){return Promise.resolve();}}
globalThis.window={AudioContext:Context};globalThis.Audio=Media;
const audio=await import('../audio.js');
audio.updateMusic({screen:'menu',menuMusic:'l05a'});assert(await audio.initAudio());
assert.equal(media.length,2,'Only two streaming decks, not 23 eager downloads');
assert.equal(audio.musicStatus().find(t=>t.target>0).name,'l05a');
audio.updateMusic({...drive,condition:'rain'});assert.equal(audio.musicStatus().find(t=>t.target>0).name,'g03b');
context.currentTime=5;audio.updateMusic({...drive,condition:'rain'});assert.equal(media.filter(m=>!m.paused).length,1,'Outgoing track retires');
const first=media.find(m=>!m.paused);first.currentTime=177;audio.updateMusic({...drive,condition:'rain'});assert.equal(media.filter(m=>!m.paused).length,2,'Loop starts on other deck before the tail ends');
context.currentTime=10;audio.updateMusic({...drive,condition:'rain'});assert.equal(media.filter(m=>!m.paused).length,1);
audio.updateMusic({...drive,gameMusic:'off'});context.currentTime=13;audio.updateMusic({...drive,gameMusic:'off'});assert(media.every(m=>m.paused));
for(const gameMusic of ['g01a','g02b','g05b','g04a'])audio.updateMusic({...drive,gameMusic});
context.currentTime=18;audio.updateMusic({...drive,gameMusic:'g04a'});assert.equal(media.filter(m=>!m.paused).length,1);assert.equal(audio.musicStatus().find(t=>t.target>0).name,'g04a');
globalThis.fetch=async()=>({ok:true,arrayBuffer:async()=>new ArrayBuffer(1)});
const before=audio.musicStatus().find(t=>t.target>0).target;
await audio.announce('gap');audio.updateMusic({...drive,gameMusic:'g04a'});
assert(Math.abs(audio.musicStatus().find(t=>t.target>0).target-before*.22)<1e-8,'Announcements duck music by 13 dB');
audio.cancelAnnouncement();audio.updateMusic({...drive,gameMusic:'g04a'});
assert.equal(audio.musicStatus().find(t=>t.target>0).target,before,'Music restores after speech');
console.log('23 soundtrack files, scene routing, overrides, stopping, looping and two-deck lifecycle passed.');
