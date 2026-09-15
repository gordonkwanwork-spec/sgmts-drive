// Synthesised vehicle sounds and streamed, user-supplied music share one mixer.
let ctx = null, master = null;
let motorOsc = null, motorGain = null, motorOsc2 = null;
let rollSrc = null, rollFilter = null, rollGain = null;
let ambGain = null;
let indicatorTimer = null;
let muted=false;
const music=[];

function ensure() {
  if (ctx) return true;
  try {
    ctx = new (window.AudioContext || window.webkitAudioContext)();
    master = ctx.createGain(); master.gain.value = 0.55; master.connect(ctx.destination);

    // electric propulsion: two detuned saws through a lowpass
    motorGain = ctx.createGain(); motorGain.gain.value = 0;
    const lp = ctx.createBiquadFilter(); lp.type = 'lowpass'; lp.frequency.value = 900;
    motorOsc = ctx.createOscillator(); motorOsc.type = 'sawtooth'; motorOsc.frequency.value = 60;
    motorOsc2 = ctx.createOscillator(); motorOsc2.type = 'triangle'; motorOsc2.frequency.value = 120;
    motorOsc.connect(lp); motorOsc2.connect(lp); lp.connect(motorGain); motorGain.connect(master);
    motorOsc.start(); motorOsc2.start();

    // tyre / road noise: looped filtered noise
    const len = ctx.sampleRate * 2;
    const buf = ctx.createBuffer(1, len, ctx.sampleRate);
    const d = buf.getChannelData(0);
    for (let i = 0; i < len; i++) d[i] = Math.random() * 2 - 1;
    rollSrc = ctx.createBufferSource(); rollSrc.buffer = buf; rollSrc.loop = true;
    rollFilter = ctx.createBiquadFilter(); rollFilter.type = 'lowpass'; rollFilter.frequency.value = 200;
    rollGain = ctx.createGain(); rollGain.gain.value = 0;
    rollSrc.connect(rollFilter); rollFilter.connect(rollGain); rollGain.connect(master);
    rollSrc.start();

    // ambient city bed: quiet band-passed noise
    const ambSrc = ctx.createBufferSource(); ambSrc.buffer = buf; ambSrc.loop = true; ambSrc.playbackRate.value = 0.3;
    const ambF = ctx.createBiquadFilter(); ambF.type = 'bandpass'; ambF.frequency.value = 320; ambF.Q.value = 0.4;
    ambGain = ctx.createGain(); ambGain.gain.value = 0.025;
    ambSrc.connect(ambF); ambF.connect(ambGain); ambGain.connect(master);
    ambSrc.start();
    for(const name of ['menu','day','night']){const element=new Audio(import.meta.env.BASE_URL+'audio/'+name+'.mp3');element.loop=true;element.preload='metadata';const gain=ctx.createGain();gain.gain.value=0;ctx.createMediaElementSource(element).connect(gain);gain.connect(master);music.push({name,element,gain,target:0});}
    master.gain.value=muted?0:.55;
    return true;
  } catch { return false; }
}

export function initAudio() {ensure();if(ctx?.state==='suspended')ctx.resume().catch(()=>{});for(const t of music)if(t.element.paused)t.element.play().catch(()=>{});}
export function musicLevels({screen,condition,v,crashed,park,mobileBrake,mode}){const driving=screen==='driving'&&mode!=='free'&&!crashed&&!park&&!mobileBrake,level=driving?Math.min(1,Math.max(0,(Math.abs(v)-1)/7))*.65:0;return {menu:screen==='menu'?.65:0,day:condition!=='night'?level:0,night:condition==='night'?level:0};}
export function updateMusic(state){if(!ctx)return;const levels=musicLevels(state);for(const t of music){const target=levels[t.name];if(Math.abs(target-t.target)>.01){t.gain.gain.setTargetAtTime(target,ctx.currentTime,target>t.target?2.5:1.2);t.target=target;}}}
export function musicStatus(){return music.map(t=>({name:t.name,target:t.target,playing:!t.element.paused,time:t.element.currentTime,error:t.element.error?.message}));}


export function setDrive(speedKmh, accelerating) {
  if (!ctx) return;
  const t = ctx.currentTime;
  const sp = Math.min(speedKmh / 60, 1);
  motorOsc.frequency.setTargetAtTime(55 + sp * 260 + (accelerating ? 25 : 0), t, 0.15);
  motorOsc2.frequency.setTargetAtTime(110 + sp * 520, t, 0.15);
  motorGain.gain.setTargetAtTime(sp > 0.01 ? 0.05 + sp * 0.075 + (accelerating ? 0.03 : 0) : 0, t, 0.2);
  rollFilter.frequency.setTargetAtTime(150 + sp * 900, t, 0.2);
  rollGain.gain.setTargetAtTime(sp * 0.11, t, 0.2);
}

function beep(freq, dur = 0.12, type = 'sine', gain = 0.2, when = 0) {
  if (!ctx) return;
  const o = ctx.createOscillator(), g = ctx.createGain();
  o.type = type; o.frequency.value = freq;
  const t = ctx.currentTime + when;
  g.gain.setValueAtTime(0, t);
  g.gain.linearRampToValueAtTime(gain, t + 0.015);
  g.gain.exponentialRampToValueAtTime(0.001, t + dur);
  o.connect(g); g.connect(master);
  o.start(t); o.stop(t + dur + 0.05);
}

export function setIndicator(on) {
  if (!ctx) return;
  if (on && !indicatorTimer) {
    indicatorTimer = setInterval(() => beep(1550, 0.03, 'square', 0.05), 450);
  } else if (!on && indicatorTimer) {
    clearInterval(indicatorTimer); indicatorTimer = null;
  }
}

export function playHorn(down) {
  if (!ctx) return;
  if (down && !playHorn._nodes) {
    const g = ctx.createGain(); g.gain.value = 0.16; g.connect(master);
    const o1 = ctx.createOscillator(); o1.type = 'square'; o1.frequency.value = 420;
    const o2 = ctx.createOscillator(); o2.type = 'square'; o2.frequency.value = 508;
    o1.connect(g); o2.connect(g); o1.start(); o2.start();
    playHorn._nodes = [o1, o2, g];
  } else if (!down && playHorn._nodes) {
    for (const n of playHorn._nodes.slice(0, 2)) n.stop();
    playHorn._nodes[2].disconnect();
    playHorn._nodes = null;
  }
}

export function playDoors(open) {
  beep(open ? 660 : 550, 0.1, 'sine', 0.15);
  beep(open ? 880 : 440, 0.1, 'sine', 0.15, 0.12);
  // pneumatic hiss
  if (!ctx) return;
  const len = ctx.sampleRate * 0.5;
  const buf = ctx.createBuffer(1, len, ctx.sampleRate);
  const d = buf.getChannelData(0);
  for (let i = 0; i < len; i++) d[i] = (Math.random() * 2 - 1) * (1 - i / len);
  const s = ctx.createBufferSource(); s.buffer = buf;
  const f = ctx.createBiquadFilter(); f.type = 'highpass'; f.frequency.value = 1800;
  const g = ctx.createGain(); g.gain.value = 0.06;
  s.connect(f); f.connect(g); g.connect(master); s.start();
}

export function playChime() { // station arrival chime (3-note, MTR-ish placeholder)
  beep(784, 0.22, 'sine', 0.18); beep(659, 0.22, 'sine', 0.18, 0.24); beep(523, 0.34, 'sine', 0.18, 0.48);
}

export function playDeparture() { beep(659, 0.14, 'sine', 0.16); beep(784, 0.25, 'sine', 0.16, 0.16); }

export function playWarning() { beep(880, 0.09, 'square', 0.1); beep(880, 0.09, 'square', 0.1, 0.14); }

export function playCrash() {
  if (!ctx) return;
  const len = ctx.sampleRate * 0.6;
  const buf = ctx.createBuffer(1, len, ctx.sampleRate);
  const d = buf.getChannelData(0);
  for (let i = 0; i < len; i++) d[i] = (Math.random() * 2 - 1) * Math.exp(-i / (len * 0.12));
  const s = ctx.createBufferSource(); s.buffer = buf;
  const g = ctx.createGain(); g.gain.value = 0.5;
  s.connect(g); g.connect(master); s.start();
  beep(90, 0.5, 'sawtooth', 0.3);
}

export function setMuted(value) { muted=value;if(master) master.gain.setTargetAtTime(muted?0:.55,ctx.currentTime,.15); }
