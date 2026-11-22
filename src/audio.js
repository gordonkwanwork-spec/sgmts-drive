import {createDrivingAudio} from './city/driving-audio.js';
let roadDrive;
export function setRoadDrive(input){
 if(input.active&&ctx&&master&&!roadDrive)roadDrive=createDrivingAudio(ctx,master);
 roadDrive?.update(input);
}
import {MUSIC_TRACKS,musicChoice,stationById,tuneRadio} from './music-catalog.js';
export {MUSIC_TRACKS,musicChoice} from './music-catalog.js';
import announcementManifest from '../public/audio/announcements/manifest.json' with {type:'json'};
// Synthesised vehicle sounds and streamed, user-supplied music share one mixer.
let ctx = null, master = null;
let motorOsc = null, motorGain = null, motorOsc2 = null, humGain = null, whineOsc = null, whineFilter = null, whineGain = null, world = null;
let rollSrc = null, rollFilter = null, rollGain = null;
let indicatorTimer = null;
let muted=false,volume=1;
let announcementSource=null,announcementActive=false,announcementGeneration=0,announcementDeadline=0;
const announcementQueue=[];
const announcementBuffers=new Map(),announcementLog=[];
const music=[];
let musicState={screen:'loading'},activeMusic=null;
const paramTargets=new WeakMap();

function smoothParam(param,target,tau,eps=1e-4){
 if(!ctx||!param||!Number.isFinite(target))return;
 const prev=paramTargets.get(param);
 if(prev!==undefined&&Math.abs(target-prev)<=eps)return;
 const t=ctx.currentTime+0.005;
 try{
  if(typeof param.cancelAndHoldAtTime==='function')param.cancelAndHoldAtTime(t);
  else if(typeof param.cancelScheduledValues==='function')param.cancelScheduledValues(t);
 }catch{try{param.cancelScheduledValues?.(t);}catch{}}
 param.setTargetAtTime(target,t,tau);
 paramTargets.set(param,target);
}

function makeNoiseBuffer(seconds=4.3,pink=true){
 const sr=ctx.sampleRate||44100,len=Math.max(16,Math.round(sr*seconds));
 const fade=Math.max(1,Math.min(Math.floor(len/4),Math.round(sr*0.15)));
 const buf=ctx.createBuffer(2,len,sr),chans=buf.numberOfChannels||2;
 const raw=new Float32Array(len+fade);
 for(let ch=0;ch<chans;ch++){
  let b0=0,b1=0,b2=0,b3=0,b4=0,b5=0,b6=0;
  for(let i=0;i<len+fade;i++){
   const w=Math.random()*2-1;
   if(pink){
    b0=0.99886*b0+w*0.0555179;b1=0.99332*b1+w*0.0750759;b2=0.96900*b2+w*0.1538520;
    b3=0.86650*b3+w*0.3104856;b4=0.55000*b4+w*0.5329522;b5=-0.7616*b5-w*0.0168980;
    const s=(b0+b1+b2+b3+b4+b5+b6+w*0.5362)*0.11;b6=w*0.115926;
    raw[i]=Math.max(-0.85,Math.min(0.85,s));
   }else{
    raw[i]=w*0.85;
   }
  }
  const d=buf.getChannelData(ch);
  d.set(raw.subarray(0,len));
  for(let i=0;i<fade;i++){
   const a=(i/fade)*(Math.PI*0.5);
   d[i]=raw[len+i]*Math.cos(a)+raw[i]*Math.sin(a);
  }
 }
 return buf;
}

const outputWanted = () => !muted && volume > 0 && !globalThis.document?.hidden;
let outputSuspended = false;

function syncOutput() {
  if (!ctx) return;
  if (!outputWanted()) {
    if (outputSuspended) return;
    outputSuspended = true;
    cancelAnnouncement();
    playHorn(false);
    for (const deck of music) deck.element.pause();
    ctx.suspend().catch(() => {});
  } else if (outputSuspended || ctx.state !== 'running') {
    void initAudio();
  }
}

globalThis.document?.addEventListener('visibilitychange', syncOutput);

function ensure() {
  if (ctx) return true;
  try {
    const AC = window.AudioContext || window.webkitAudioContext;
    // The game only plays sound. Ambient mixes with other apps on supporting browsers.
    try {
      const session = window.navigator?.audioSession;
      if (session) session.type = 'ambient';
    } catch { /* Some browsers expose a read-only or unavailable session. */ }
    try { ctx = new AC({ latencyHint: 'interactive' }); } catch { ctx = new AC(); }
    master = ctx.createGain(); master.gain.value = 0.55;
    let output = ctx.destination;
    if (typeof ctx.createDynamicsCompressor === 'function') {
      const limiter = ctx.createDynamicsCompressor();
      limiter.threshold.value = -2; limiter.knee.value = 6; limiter.ratio.value = 10;
      limiter.attack.value = 0.003; limiter.release.value = 0.15;
      limiter.connect(ctx.destination);
      output = limiter;
    }
    master.connect(output);

    // Electric traction: deep sine fundamental + octave (motor), transformer hum, and a smooth inverter tone that
    // climbs with speed. No combustion-style sawtooth or raw square growl.
    motorGain = ctx.createGain(); motorGain.gain.value = 0;
    const lp = ctx.createBiquadFilter(); lp.type = 'lowpass'; lp.frequency.value = 420;
    motorOsc = ctx.createOscillator(); motorOsc.type = 'sine'; motorOsc.frequency.value = 38;
    motorOsc2 = ctx.createOscillator(); motorOsc2.type = 'sine'; motorOsc2.frequency.value = 76;
    motorOsc.connect(lp); motorOsc2.connect(lp); lp.connect(motorGain); motorGain.connect(master);
    motorOsc.start(); motorOsc2.start();
    humGain = ctx.createGain(); humGain.gain.value = 0; humGain.connect(master);
    for (const [f, g] of [[100, 1], [200, .45], [300, .2]]) { const o = ctx.createOscillator(), k = ctx.createGain(); o.frequency.value = f; k.gain.value = g; o.connect(k); k.connect(humGain); o.start(); }
    whineOsc = ctx.createOscillator(); whineOsc.type = 'triangle'; whineOsc.frequency.value = 300;
    const bp = ctx.createBiquadFilter(); bp.type = 'bandpass'; bp.Q.value = 6; bp.frequency.value = 900; whineFilter = bp;
    whineGain = ctx.createGain(); whineGain.gain.value = 0; whineOsc.connect(bp); bp.connect(whineGain); whineGain.connect(master); whineOsc.start();
    // tyre / road noise: looped seamless pink noise
    rollSrc = ctx.createBufferSource(); rollSrc.buffer = makeNoiseBuffer(4.3, true); rollSrc.loop = true;
    rollFilter = ctx.createBiquadFilter(); rollFilter.type = 'lowpass'; rollFilter.frequency.value = 200;
    rollGain = ctx.createGain(); rollGain.gain.value = 0;
    rollSrc.connect(rollFilter); rollFilter.connect(rollGain); rollGain.connect(master);
    rollSrc.start();

    for(let i=0;i<2;i++){
      const element=new Audio();element.loop=true;element.preload='auto';element.setAttribute('playsinline','');
      const gain=ctx.createGain();gain.gain.value=0;ctx.createMediaElementSource(element).connect(gain);gain.connect(master);
      music.push({element,gain,track:null,target:0,playingRequest:false,retireAt:0,loadedSrc:null});
    }
    master.gain.value=muted?0:.55*volume;
    return true;
  } catch { return false; }
}

function playMusic(deck){
 if(deck.playingRequest)return deck.playingRequest;
 if(!deck.element.paused)return Promise.resolve();
 const request=Promise.resolve(deck.element.play()).catch(()=>{}).finally(()=>{if(deck.playingRequest===request)deck.playingRequest=null;});
 deck.playingRequest=request;return request;
}
export async function initAudio() {
 if(!outputWanted() || !ensure())return false;
 if(!outputSuspended&&ctx.state==='running'&&activeMusic&&!activeMusic.element.paused)return true;
 // Resume and media play both begin within the input gesture, including on mobile.
 const resume=outputSuspended||ctx.state!=='running'?ctx.resume():Promise.resolve();
 outputSuspended=false;
 updateMusic(musicState);
 const play=activeMusic?playMusic(activeMusic):Promise.resolve();
 await Promise.all([resume.catch(()=>{}),play]);
 return ctx.state==='running'&&!!activeMusic&&!activeMusic.element.paused;
}
export function updateMusic(state){
 musicState=state;
 if(!ctx || !outputWanted())return;
 let {id,level}=musicChoice(state);
 const now=ctx.currentTime;
 const radio=state.screen==='driving'&&stationById.has(state.gameMusic);
 const ending=activeMusic&&(activeMusic.element.ended||(Number.isFinite(activeMusic.element.duration)&&activeMusic.element.duration>8&&activeMusic.element.currentTime>=activeMusic.element.duration-4));
 if(radio&&id&&id===activeMusic?.track.id&&ending){
  state.radioTrack=tuneRadio(state,'song',1).radioTrack;
  id=state.radioTrack;
 }
 if(id&&(activeMusic?.track?.id!==id||ending)){
  const previous=activeMusic,deck=music.find(t=>t!==previous);
  deck.element.pause();deck.playingRequest=null;deck.track=MUSIC_TRACKS.find(t=>t.id===id);
  deck.gain.gain.cancelScheduledValues?.(now);deck.gain.gain.setValueAtTime(0,now);paramTargets.set(deck.gain.gain,0);deck.target=0;deck.retireAt=0;
  const url=(import.meta.env?.BASE_URL||'/')+'audio/'+deck.track.file;
  if(deck.loadedSrc!==url||deck.element.error){deck.element.src=url;deck.loadedSrc=url;}
  try{deck.element.currentTime=0;}catch{}
  deck.element.loop=!radio;
  activeMusic=deck;playMusic(deck);
  if(previous){previous.element.loop=false;previous.retireAt=now+4;}
 }
 if(id&&activeMusic&&activeMusic.element.loop===radio)activeMusic.element.loop=!radio;
 if(!id&&activeMusic){activeMusic.element.loop=false;activeMusic.retireAt=now+2;activeMusic=null;}
 for(const deck of music){
  const target=deck===activeMusic?level*deck.track.gain*(announcementActive?.22:1):0;
  if(Math.abs(target-deck.target)>.0001){
   const duck=announcementActive&&target<deck.target;
   smoothParam(deck.gain.gain,target,duck?.045:target>deck.target?1:.55,1e-5);deck.target=target;
  }
  if(deck!==activeMusic&&deck.retireAt&&now>=deck.retireAt){deck.element.pause();deck.retireAt=0;}
 }
}
export function musicStatus(){return music.map(t=>({name:t.track?.id||null,title:t.track?.title||'',context:ctx?.state,gain:t.gain.gain.value,target:t.target,playing:!t.element.paused,time:t.element.currentTime,error:t.element.error?.message}));}


export function setDrive(speedKmh, accelerating, powered = speedKmh > .5) {
  if (!ctx) return;
  const sp = Math.min(speedKmh / 50, 1), pull = accelerating ? 1 : 0;
  smoothParam(motorOsc.frequency, 38 + sp * 34, 0.2, 0.25);
  smoothParam(motorOsc2.frequency, 76 + sp * 68, 0.2, 0.25);
  smoothParam(motorGain.gain, powered ? 0.11 + sp * 0.1 + pull * 0.05 : 0, 0.25, 0.001);
  smoothParam(humGain.gain, powered ? 0.012 + pull * 0.008 : 0, 0.3, 0.001);
  smoothParam(whineOsc.frequency, 180 + sp * 1150, 0.15, 0.5);
  smoothParam(whineFilter.frequency, 360 + sp * 2300, 0.15, 1);
  smoothParam(whineGain.gain, powered && sp > 0.01 ? (0.008 + pull * 0.014) * (0.4 + sp) : 0, 0.2, 0.001);
  smoothParam(rollFilter.frequency, 150 + sp * 700, 0.2, 1);
  smoothParam(rollGain.gain, sp * 0.09, 0.2, 0.001);
}

// World layers from nearby actors (distances in metres): people (murmur + footsteps), road vehicles (engine + tyres),
// other ARTs (electric whine + hum). Each layer's level falls off with the nearest few sources.
function buildWorld() {
  const bed = (seconds, type, f, q) => { const src = ctx.createBufferSource(); src.buffer = makeNoiseBuffer(seconds, true); src.loop = true; src.playbackRate.value = .65 + Math.random() * .2; const flt = ctx.createBiquadFilter(); flt.type = type; flt.frequency.value = f; flt.Q.value = q; const g = ctx.createGain(); g.gain.value = 0; src.connect(flt); flt.connect(g); g.connect(master); src.start(); return g; };
  const voices = bed(5.1, 'bandpass', 650, 1.1);
  const tyres = bed(3.7, 'lowpass', 420, .7), engine = ctx.createGain(); engine.gain.value = 0; engine.connect(master);
  const eo = ctx.createOscillator(); eo.type = 'triangle'; eo.frequency.value = 52; const ef = ctx.createBiquadFilter(); ef.type = 'lowpass'; ef.frequency.value = 130; eo.connect(ef); ef.connect(engine); eo.start();
  const artHum = ctx.createGain(); artHum.gain.value = 0; artHum.connect(master);
  const ao = ctx.createOscillator(); ao.frequency.value = 52; ao.connect(artHum); ao.start();
  const aw = ctx.createOscillator(); aw.type = 'triangle'; aw.frequency.value = 680; const awf = ctx.createBiquadFilter(); awf.type = 'bandpass'; awf.Q.value = 7; awf.frequency.value = 1360; const awg = ctx.createGain(); awg.gain.value = .05; aw.connect(awf); awf.connect(awg); awg.connect(artHum); aw.start();
  return { voiceBed: voices, tyres, engine, artHum };
}
const nearness = (ds, range) => { let v = 0; for (const d of ds) if (d < range) v += (1 - d / range) ** 2; return Math.min(1, v); };
export function updateWorldSound({ people = [], cars = [], trams = [] }, running = true) {
  if (!ctx) return; world ||= buildWorld(); const on = typeof running === 'number' ? running : (running ? 1 : 0);
  const crowd = nearness(people, 35), road = nearness(cars, 70), art = nearness(trams, 90);
  smoothParam(world.voiceBed.gain, on * crowd * .006, .4, .0005);
  smoothParam(world.tyres.gain, on * road * .065, .3, .001);
  smoothParam(world.engine.gain, on * road * .028, .3, .001);
  smoothParam(world.artHum.gain, on * art * .035, .3, .001);
}

function beep(freq, dur = 0.12, type = 'sine', gain = 0.2, when = 0) {
  if (!ctx || !outputWanted()) return;
  const o = ctx.createOscillator(), g = ctx.createGain();
  o.type = type; o.frequency.value = freq;
  const t = ctx.currentTime + when;
  g.gain.setValueAtTime(0, t);
  if (typeof g.gain.linearRampToValueAtTime === 'function') g.gain.linearRampToValueAtTime(gain, t + 0.015);
  if (typeof g.gain.exponentialRampToValueAtTime === 'function') g.gain.exponentialRampToValueAtTime(0.001, t + dur);
  if (typeof g.gain.linearRampToValueAtTime === 'function') g.gain.linearRampToValueAtTime(0, t + dur + 0.02);
  o.connect(g); g.connect(master);
  o.onended = () => { try { o.disconnect(); g.disconnect(); } catch {} };
  o.start(t); o.stop(t + dur + 0.03);
}

export function setIndicator(on) {
  if (!ctx) return;
  if (on && !indicatorTimer) {
    indicatorTimer = setInterval(() => beep(1200, 0.025, 'triangle', 0.035), 450);
  } else if (!on && indicatorTimer) {
    clearInterval(indicatorTimer); indicatorTimer = null;
  }
}

export function playHorn(down) {
  if (!ctx) return;
  if (down && !outputWanted()) return;
  if (down && !playHorn._nodes) {
    const t = ctx.currentTime;
    const g = ctx.createGain(); g.gain.setValueAtTime(0, t);
    if (typeof g.gain.linearRampToValueAtTime === 'function') g.gain.linearRampToValueAtTime(0.14, t + 0.015);
    const flt = ctx.createBiquadFilter(); flt.type = 'lowpass'; flt.frequency.value = 1200; flt.Q.value = 1.2;
    g.connect(flt); flt.connect(master);
    const o1 = ctx.createOscillator(); o1.type = 'sawtooth'; o1.frequency.value = 420;
    const o2 = ctx.createOscillator(); o2.type = 'sawtooth'; o2.frequency.value = 508;
    o1.connect(g); o2.connect(g); o1.start(t); o2.start(t);
    playHorn._nodes = [o1, o2, g, flt];
  } else if (!down && playHorn._nodes) {
    const [o1, o2, g, flt] = playHorn._nodes;
    playHorn._nodes = null;
    const t = ctx.currentTime;
    g.gain.cancelScheduledValues?.(t);
    g.gain.setValueAtTime(g.gain.value || 0.14, t);
    if (typeof g.gain.linearRampToValueAtTime === 'function') g.gain.linearRampToValueAtTime(0, t + 0.045);
    o1.onended = () => { try { o1.disconnect(); o2.disconnect(); g.disconnect(); flt.disconnect(); } catch {} };
    o1.stop(t + 0.055); o2.stop(t + 0.055);
  }
}

export function playDoors(open) {
  beep(open ? 660 : 550, 0.1, 'sine', 0.15);
  beep(open ? 880 : 440, 0.1, 'sine', 0.15, 0.12);
  // pneumatic hiss
  if (!ctx || !outputWanted()) return;
  const len = Math.max(16, Math.round((ctx.sampleRate || 44100) * 0.5));
  const fade = Math.max(1, Math.round((ctx.sampleRate || 44100) * 0.01));
  const buf = ctx.createBuffer(1, len, ctx.sampleRate || 44100);
  const d = buf.getChannelData(0);
  for (let i = 0; i < len; i++) {
    const attack = i < fade ? i / fade : 1;
    d[i] = (Math.random() * 2 - 1) * (1 - i / len) * attack;
  }
  const s = ctx.createBufferSource(); s.buffer = buf;
  const f = ctx.createBiquadFilter(); f.type = 'highpass'; f.frequency.value = 1800;
  const g = ctx.createGain(); g.gain.value = 0.05;
  s.connect(f); f.connect(g); g.connect(master);
  s.onended = () => { try { s.disconnect(); f.disconnect(); g.disconnect(); } catch {} };
  s.start();
}

export function playChime() { // station arrival chime (3-note, MTR-ish placeholder)
  beep(784, 0.22, 'sine', 0.18); beep(659, 0.22, 'sine', 0.18, 0.24); beep(523, 0.34, 'sine', 0.18, 0.48);
}

export function playDeparture() { beep(659, 0.14, 'sine', 0.16); beep(784, 0.25, 'sine', 0.16, 0.16); }

export function playWarning() { beep(880, 0.09, 'triangle', 0.1); beep(880, 0.09, 'triangle', 0.1, 0.14); }

export function playCrash() {
  if (!ctx || !outputWanted()) return;
  const len = Math.max(16, Math.round((ctx.sampleRate || 44100) * 0.6));
  const buf = ctx.createBuffer(1, len, ctx.sampleRate || 44100);
  const d = buf.getChannelData(0);
  for (let i = 0; i < len; i++) d[i] = (Math.random() * 2 - 1) * Math.exp(-i / (len * 0.12));
  const s = ctx.createBufferSource(); s.buffer = buf;
  const f = ctx.createBiquadFilter(); f.type = 'lowpass'; f.frequency.value = 600;
  const g = ctx.createGain(); g.gain.value = 0.45;
  s.connect(f); f.connect(g); g.connect(master);
  s.onended = () => { try { s.disconnect(); f.disconnect(); g.disconnect(); } catch {} };
  s.start();
  beep(90, 0.5, 'sawtooth', 0.25);
}

// Thunder: low-passed noise with a crack then a long roll, arriving `delay` seconds after the flash.
export function thunder(delay=2) {
  if (!ctx || !outputWanted()) return;
  const sr = ctx.sampleRate || 44100, len = Math.max(16, Math.round(sr * 5));
  const buf = ctx.createBuffer(1, len, sr), d = buf.getChannelData(0);
  for (let i = 0, b = 0; i < len; i++) { b = b * .96 + (Math.random() * 2 - 1) * .04; const t = i / sr; d[i] = Math.tanh(b * 4 * (Math.exp(-t * 1.1) + .6 * Math.exp(-((t - .9) ** 2) * 3))); }
  const s = ctx.createBufferSource(), f = ctx.createBiquadFilter(), g = ctx.createGain();
  s.buffer = buf; f.type = 'lowpass'; f.frequency.value = 260; g.gain.value = .8;
  s.connect(f); f.connect(g); g.connect(master);
  s.onended = () => { try { s.disconnect(); f.disconnect(); g.disconnect(); } catch {} };
  s.start(ctx.currentTime + delay);
}

export function setMuted(value) {
  muted = value;
  smoothParam(master?.gain, muted ? 0 : .55 * volume, .15);
  syncOutput();
}
// Master volume 0‒1 (the settings slider); mute still wins.
export function setVolume(value) {
  volume = Math.max(0, Math.min(1, value));
  if (!muted) smoothParam(master?.gain, .55 * volume, .1);
  syncOutput();
}

// The three voices were recorded at very different levels (English is ~8 dB quieter): bring each clip to the same loudness, peaks permitting.
export function announcementGain(buffer){const d=buffer.getChannelData(0);let sum=0,peak=0;for(let i=0;i<d.length;i++){const v=Math.abs(d[i]);sum+=v*v;if(v>peak)peak=v;}const rms=Math.sqrt(sum/Math.max(1,d.length));return rms&&peak?Math.min(4,.14/rms,.9/peak):1;}
export function cancelAnnouncement(){announcementQueue.length=0;announcementGeneration++;announcementSource?.stop();announcementSource=null;const wasActive=announcementActive;announcementActive=false;if(wasActive)updateMusic(musicState);}
export function announcementStatus(){return {active:announcementActive,queued:[...announcementQueue],log:announcementLog.slice(-30)};}
function finishAnnouncement(generation){if(generation!==announcementGeneration||!announcementActive)return;announcementSource=null;announcementActive=false;const next=announcementQueue.shift();if(next)announce(next);else updateMusic(musicState);}
export async function announce(key){
 if(!ctx||!outputWanted()||!announcementManifest[key])return false;
 // Watchdog: a clip that never reported its end (device change, throttled tab) must not silence every later announcement.
 if(announcementActive&&performance.now()>announcementDeadline){announcementGeneration++;announcementSource?.stop();announcementSource=null;announcementActive=false;}
 if(announcementActive){if(!announcementQueue.includes(key))announcementQueue.push(key);return true;}
 announcementActive=true;announcementDeadline=performance.now()+8000;const generation=announcementGeneration;
 try{
  // Decode and schedule all three clips on the same clock: no autoplay gap between languages.
  const clips=await Promise.all(announcementManifest[key].map(async clip=>{if(!announcementBuffers.has(clip.file))announcementBuffers.set(clip.file,fetch((import.meta.env?.BASE_URL||'/')+'audio/announcements/'+clip.file+'?v=audible-2').then(r=>{if(!r.ok)throw Error('Announcement unavailable');return r.arrayBuffer();}).then(b=>ctx.decodeAudioData(b)));return {clip,buffer:await announcementBuffers.get(clip.file)};}));
  if(generation!==announcementGeneration)return false;if(ctx.state!=='running')await ctx.resume().catch(()=>{});if(generation!==announcementGeneration)return false;if(ctx.state!=='running'){announcementActive=false;return false;}
  let time=ctx.currentTime+.06;const sources=[];
  for(const {clip,buffer} of clips){const source=ctx.createBufferSource(),gain=ctx.createGain();gain.gain.value=announcementGain(buffer);source.buffer=buffer;source.connect(gain);gain.connect(master);source.start(time);sources.push(source);announcementLog.push({key,language:clip.language,start:time,duration:buffer.duration});time+=buffer.duration+.22;}
  announcementDeadline=performance.now()+(time-ctx.currentTime)*1000+1500;
  announcementSource={stop(){for(const source of sources)try{source.stop();}catch{}}};
  sources.at(-1).onended=()=>finishAnnouncement(generation);return true;
 }catch(error){for(const clip of announcementManifest[key])announcementBuffers.delete(clip.file);console.warn('Announcement playback failed',key,error);if(generation===announcementGeneration)announcementActive=false;return false;}
}

// Dedicated heavy-rail mixer: continuous rolling roar and electric traction.
// Synthesised sound design, not a recording of an actual Tuen Ma Line train.
const railVoices=[];
export function railwaySoundMix(distance,side,radialSpeed=0){return {gain:distance>=280?0:.30/(1+(distance/34)**2),pan:Math.max(-1,Math.min(1,side)),doppler:343/(343+Math.max(-40,Math.min(40,radialSpeed)))};}
export function updateRailwaySound(trains,camera,running,dt){
 if(!ctx)return;
 const scale=typeof running==='number'?running:(running?1:0);
 while(railVoices.length<trains.length){
  const i=railVoices.length,gain=ctx.createGain(),pan=ctx.createStereoPanner(),rumble=ctx.createBiquadFilter(),tone=ctx.createOscillator(),toneGain=ctx.createGain(),noise=ctx.createBufferSource();
  gain.gain.value=0;gain.connect(pan);pan.connect(master);rumble.type='lowpass';rumble.frequency.value=620;rumble.Q.value=.7;noise.buffer=makeNoiseBuffer(4.7+i*1.1,true);noise.loop=true;noise.playbackRate.value=.75;noise.connect(rumble);rumble.connect(gain);tone.type='sine';tone.frequency.value=186;toneGain.gain.value=.05;tone.connect(toneGain);toneGain.connect(gain);noise.start();tone.start();railVoices.push({gain,pan,rumble,tone,noise,distance:null,target:0,radial:0});
 }
 const right={x:camera.matrixWorld.elements[0],z:camera.matrixWorld.elements[2]};
 for(let i=0;i<railVoices.length;i++){
  const v=railVoices[i],emitters=trains[i]?.emitters||[];let nearest=null,distance=Infinity;
  for(const p of emitters){const d=p.distanceTo(camera.position);if(d<distance){distance=d;nearest=p;}}
  const side=nearest?((nearest.x-camera.position.x)*right.x+(nearest.z-camera.position.z)*right.z)/Math.max(1,distance):0;
  if(!scale||!Number.isFinite(distance)||!Number.isFinite(v.distance)||dt<=0||Math.abs(distance-v.distance)>25)v.radial=0;
  else{const rawRadial=Math.max(-40,Math.min(40,(distance-v.distance)/dt));v.radial+=(rawRadial-v.radial)*Math.min(1,dt*6);}
  const mix=railwaySoundMix(distance,side,v.radial);
  // Continuous electric rolling sound; no synthetic wheel/chuff pulses.
  v.target=scale*mix.gain;
  smoothParam(v.gain.gain,v.target,.12,.001);
  smoothParam(v.pan.pan,mix.pan,.12,.01);
  smoothParam(v.noise.playbackRate,.75*mix.doppler,.18,.003);
  smoothParam(v.tone.frequency,(186+i*11)*mix.doppler,.18,.3);
  v.distance=Number.isFinite(distance)?distance:null;
 }
}
export function railwaySoundStatus(){return railVoices.map(v=>({target:v.target,gain:v.gain.gain.value,pan:v.pan.pan.value,distance:v.distance,muted,context:ctx?.state}));}
