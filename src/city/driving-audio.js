// Driving sound. X5: engine and tyres are synthesised live (public/engine-worklet.js: 4.4 twin-turbo V8, cross-plane burble);
// road, weather, ambience and the brake onset are independently generated ElevenLabs layers, blended locally. Other vehicles: ElevenLabs engine loops (VEHICLE_ENGINES). No API calls while playing.
export const LOOP_IDS=['road-dry','road-wet','wind','rain','ambient-day','ambient-night'];
export const EFFECT_IDS=['brake','thunder'];
const clamp=(n,a=0,b=1)=>Math.max(a,Math.min(b,Number.isFinite(n)?n:0)),TAU=Math.PI*2;
export function drivingMix({active=false,vehicle='x5',speed=0,throttle=0,handbrake=false,weather='clear',night=false}={}){
 const kmh=Math.abs(speed)*3.6,moving=clamp(kmh/65),wet=weather==='rain'||weather==='storm';
 const levels={
  'road-dry':active&&!wet?moving*.22:0,'road-wet':active&&wet?moving*.28:0,
  wind:({clear:.025,cloudy:.11,rain:.07,storm:.24,fog:.045}[weather]??.025)+(active?moving*.05:0),
  rain:weather==='storm'?.27:weather==='rain'?.19:0,
  'ambient-day':!night?({clear:.09,cloudy:.055,fog:.025,rain:.008,storm:0}[weather]??.09):0,
  'ambient-night':night?({clear:.06,cloudy:.035,fog:.018,rain:.006,storm:0}[weather]??.06):0,
 };
 return {levels,kmh,braking:active&&Math.abs(speed)>.4&&(handbrake||throttle*Math.sign(speed)<0),
  rates:{'road-dry':.8+moving*.35,'road-wet':.8+moving*.35}};
}

// The X5's drivetrain as the sound hears it, inferred from the arcade car's speed and keys: ZF 8-speed automatic with a torque
// converter, behind a 4.4 V8 (idle 680, redline 6,400). W is a 60 % pedal; W + Shift (boost) is flat out in Sport: later
// upshifts, open exhaust flaps, a bark on each upshift. Stateful and pure, so tests drive it directly.
// Gear 0 is reverse. step() returns the engine parameters plus one-shot events for that frame.
const RATIOS=[5,3.2,2.14,1.72,1.31,1,.82,.64],REVERSE=3.7,IDLE=680,REDLINE=6400,WHEELBASE=3.1;
const RPM_PER=60/TAU*3.15/.37;   // engine rpm per (m/s × gear ratio): final drive 3.15, tyre radius 0.37 m
export function createDrivetrain(){
 let run='off',t=0,rpm=0,gear=1,pedal=0,want=0,boost=0,flap=0,crackle=0,shift=0,shiftKind='',fastIdle=0,accel=0,lastV=0,bumps=null,braking=false,brakeFrom=0;
 return {step(dt,s={}){
  dt=clamp(dt,0,.25);const ev=[],v=Number.isFinite(s.speed)?s.speed:0,kmh=Math.abs(v)*3.6,sport=!!s.boost,on=!!s.active&&(s.vehicle??'x5')==='x5';
  // Ignition: crank, catch with a flare, fast idle that settles over a few seconds. Leaving the car winds the engine down.
  if(on&&(run==='off'||run==='stopping')){run='crank';t=0;}
  if(!on&&run!=='off'&&run!=='stopping'){run='stopping';t=0;}
  t+=dt;
  if(dt>0)accel+=((Math.abs(v)-Math.abs(lastV))/dt-accel)*clamp(dt*6);
  const reversing=v<-.1||(v<.3&&s.throttle<0);
  const lastWant=want;want=run!=='on'?0:s.throttle>0&&v>-.1?(sport?1:.6):s.throttle<0&&v<.1?.45:0;
  pedal+=(want-pedal)*clamp(dt*(want>pedal?5:8));
  // Gearbox: shift points move with the pedal (relaxed at part throttle, late when flat out).
  const wheel=g=>Math.abs(v)*(g?RATIOS[g-1]:REVERSE)*RPM_PER;
  if(reversing)gear=0;else{if(!gear)gear=1;
   const up=1650+pedal*2600+(sport?1500:0),down=1000+pedal*1500+(sport?900:0);
   if(run==='on'&&shift<=0&&gear<8&&wheel(gear)>up&&wheel(gear+1)>down+150){gear++;shift=.3;shiftKind='up';ev.push({type:sport&&pedal>.8?'bark':'upshift'});}
   else if(run==='on'&&shift<=0&&gear>1&&wheel(gear)<down&&wheel(gear-1)<up-200){gear--;shift=.22;shiftKind='down';ev.push({type:'downshift'});}
  }
  shift-=dt;fastIdle*=Math.exp(-dt/3.5);
  // Torque converter: from a standstill the revs flare toward the stall speed, then the wheels catch up (locked from 2nd).
  // A soft maximum (4-norm) keeps the climb smooth and adds a touch of slip where the two meet.
  const w=wheel(gear),stall=IDLE+fastIdle+(gear<=1?pedal*(1900+(sport?700:0)):0),target=Math.sqrt(Math.hypot(w*w,stall*stall));
  let load=0;
  if(run==='crank'){rpm=210+40*Math.sin(t*TAU*4.5);load=.05;if(t>.65){run='catch';t=0;ev.push({type:'bang',a:.9});}}
  else if(run==='catch'){rpm+=(1450-rpm)*clamp(dt*14);load=.55;if(t>.3){run='on';fastIdle=380;}}
  else if(run==='stopping'){rpm-=rpm*clamp(dt*5);if(rpm<70){rpm=0;run='off';ev.push({type:'thud',a:.45,f:32});}}
  else if(run==='on'){
   rpm+=(target-rpm)*clamp(dt*(target>rpm?(pedal>.1?9:6):shift>0?9:3.2));
   if(rpm>REDLINE)rpm=REDLINE-180;   // limiter
   load=pedal>.05?pedal*(accel>.3?1:.55):rpm>IDLE+250&&kmh>3?-clamp((rpm-900)/2500):.12;
   // Upshift: torque cut while the clutches swap. Downshift off the throttle: the box blips to match revs.
   if(shift>.18&&shiftKind==='up')load*=.15;
   if(shift>.1&&shiftKind==='down'&&pedal<.1)load=.4;
  }else rpm=0;
  // Twin-scroll turbo: spools with load and revs, lags behind the pedal.
  const bt=Math.max(0,load)*clamp((rpm-1300)/1700);boost+=(bt-boost)*clamp(dt*(bt>boost?2.2:4));
  // Lift-off: blow-off flutter at once, then crackle on the overrun (more in Sport).
  if(lastWant>.45&&want===0&&rpm>2300&&run==='on'){ev.push({type:'lift',a:clamp(boost*1.4)});crackle=sport?1:.65;}
  crackle*=Math.exp(-dt/1.4);
  const overrun=load<0&&rpm>1800?.16*-load:0;
  flap+=((pedal>.5||rpm>3200||sport?1:.12)-flap)*clamp(dt*3);
  // Tyres: lateral grip runs out on tight, fast turns; handbrake slides; flat-out launches chirp.
  const steer=Math.abs(s.steer||0),lat=v*v*Math.tan(steer)/WHEELBASE;
  let slip=clamp((lat-9)/16)*clamp(kmh/18);
  if(s.handbrake&&kmh>12)slip=Math.max(slip,clamp(kmh/40)*(.6+.4*clamp(steer/.6)));
  if(sport&&pedal>.7&&gear===1&&kmh<12&&run==='on')slip=Math.max(slip,.4*(1-kmh/12));
  // Brakes: pad rumble with speed; the nose settling when a firm stop ends.
  const nowBraking=run!=='off'&&Math.abs(v)>.4&&(!!s.handbrake||s.throttle*Math.sign(v)<0);
  brakeFrom=nowBraking?Math.max(brakeFrom,kmh):braking?brakeFrom:0;
  if(braking&&!nowBraking&&kmh<2&&brakeFrom>10)ev.push({type:'thud',a:clamp(brakeFrom/120,.15,.4),f:40});
  braking=nowBraking;
  // Hitting something: a thud scaled by the speed just before.
  if(bumps!==null&&(s.bumps||0)>bumps&&Math.abs(lastV)*3.6>4)ev.push({type:'thud',a:clamp(Math.abs(lastV)*3.6/25,.3,1.2),f:55});
  bumps=s.bumps||0;lastV=v;
  return {run,rpm,gear,pedal,load,boost,flap,crackle:on?Math.max(want===0?crackle:crackle*.1,overrun):0,starter:run==='crank'?1:0,
   whine:gear===0&&run==='on'?clamp(Math.abs(v)/3):0,slip:on?slip:0,brake:braking?clamp(kmh/50)*(s.handbrake?1:.7):0,speed:Math.abs(v),events:ev};
 }};
}
const PARAMS=['rpm','load','boost','flap','crackle','starter','whine','slip','brake','speed'];

// Every other drivable vehicle: two ElevenLabs loops (public/audio/vehicles/<id>-idle|drive.mp3, prompts in
// research/vehicle-audio-generation.json), crossfaded and pitched by a stepped-gear rev model. gears/span: gears and km/h per gear
// (1 = CVT-like sweep), lo/hi: playback rate at the bottom/top of a gear, ev: hybrid creeps on the electric hum, air: air-brake hiss.
// ponytail: loop crossfade, not a drivetrain sim like the X5's; give a vehicle createDrivetrain-style state if it needs shifts/events.
export const VEHICLE_ENGINES={
 truck:{gears:5,span:16,lo:.82,hi:1.32,gain:.6},
 taxi:{gears:4,span:22,lo:.85,hi:1.35,gain:.55},
 'modern-taxi':{gears:1,span:70,lo:.9,hi:1.3,gain:.5,ev:true},
 bus:{gears:6,span:11,lo:.82,hi:1.22,gain:.65,air:true},
 'single-bus':{gears:6,span:12,lo:.82,hi:1.24,gain:.6,air:true},
 minibus:{gears:5,span:17,lo:.85,hi:1.3,gain:.6},
 car:{gears:1,span:80,lo:.85,hi:1.4,gain:.5},
 hatchback:{gears:5,span:20,lo:.85,hi:1.4,gain:.5},
 suv:{gears:1,span:80,lo:.85,hi:1.35,gain:.55},
 van:{gears:5,span:18,lo:.82,hi:1.32,gain:.6},
 'motor-scooter':{gears:1,span:60,lo:.75,hi:1.3,gain:.5},
 motorbike:{gears:6,span:20,lo:.8,hi:1.45,gain:.55},
};
export const VEHICLE_EFFECT_IDS=['air-brake'];
export function engineLoopMix(vehicle,speed=0,throttle=0){
 const e=VEHICLE_ENGINES[vehicle];if(!e)return null;
 const kmh=Math.abs(Number.isFinite(speed)?speed:0)*3.6,thr=Number.isFinite(throttle)?throttle:0,pressed=thr!==0;
 const gear=Math.min(e.gears,Math.floor(kmh/e.span)+1),inGear=clamp((kmh-(gear-1)*e.span)/e.span);
 // Revs: climb through each gear (drop at every change); pressing the pedal at a standstill blips them.
 let rev=kmh<1?(pressed?.25:0):.12+.88*inGear;
 let drive=clamp(kmh/10)*(pressed?1:.45)+(kmh<1&&pressed?.35:0);
 if(e.ev&&kmh<20&&Math.abs(thr)<1){drive*=clamp((kmh-12)/8);rev=kmh/20*.5;}   // electric below ~20 km/h: the hum rises, engine off
 drive=clamp(drive);
 return {idle:e.gain*(1-.75*drive),drive:e.gain*drive*(.75+.25*Math.abs(thr)),idleRate:1+(e.ev?rev*.6:rev*.15),driveRate:e.lo+(e.hi-e.lo)*rev,gear,air:!!e.air};
}

export function createDrivingAudio(ctx,out){
 const loops=new Map(),buffers=new Map(),failures=new Map(),events=[],base=import.meta.env?.BASE_URL||'./',drivetrain=createDrivetrain();
 const mixBus=ctx.createGain();mixBus.gain.value=.72;mixBus.connect(out);
 const carBus=ctx.createGain(),weatherBus=ctx.createGain();carBus.connect(mixBus);weatherBus.connect(mixBus);
 let previous=null,frame=null,engine=null,lastTime=null,lastBrake=-10,lastThunder=-10,thunderAt=null,lastLightning=0;
 const log=e=>{events.push({...e,time:ctx.currentTime});if(events.length>24)events.shift();};
 // Engine voicing after the synth: weight in the lows, a little chest at 150 Hz, top kept dark, glued by a soft compressor.
 function engineChain(){
  const node=new AudioWorkletNode(ctx,'x5-engine',{numberOfInputs:0,numberOfOutputs:2,outputChannelCount:[2,2]});
  const eq=(type,f,g,q=.8)=>{const b=ctx.createBiquadFilter();b.type=type;b.frequency.value=f;b.gain.value=g;b.Q.value=q;return b;};
  const comp=ctx.createDynamicsCompressor();comp.threshold.value=-15;comp.knee.value=10;comp.ratio.value=2.5;comp.attack.value=.006;comp.release.value=.25;
  const level=ctx.createGain(),chassis=ctx.createGain();level.gain.value=.9;chassis.gain.value=.5;
  node.connect(eq('lowshelf',95,7),0).connect(eq('peaking',150,3,.9)).connect(eq('highshelf',3200,-6)).connect(comp).connect(level).connect(carBus);
  node.connect(chassis,1).connect(carBus);
  return node;
 }
 const ready=Promise.all([
  ...[...LOOP_IDS,...EFFECT_IDS].map(async id=>{
   try{const response=await fetch(`${base}audio/driving/${id}.mp3`);if(!response.ok)throw Error(`HTTP ${response.status}`);
    buffers.set(id,await ctx.decodeAudioData(await response.arrayBuffer()));
   }catch(error){failures.set(id,error.message);}
  }),
  Promise.resolve().then(()=>ctx.audioWorklet.addModule(`${base}engine-worklet.js`)).then(()=>{engine=engineChain();}).catch(error=>failures.set('engine',error.message)),
 ]);
 // Vehicle engine loops load on first use of that vehicle.
 const vBuffers=new Map(),vLoading=new Map();let vLoops=null,vBraking=0;
 const vLoad=id=>vLoading.get(id)??vLoading.set(id,Promise.all(['idle','drive'].map(async k=>{
  try{const r=await fetch(`${base}audio/vehicles/${id}-${k}.mp3`);if(!r.ok)throw Error(`HTTP ${r.status}`);vBuffers.set(`${id}-${k}`,await ctx.decodeAudioData(await r.arrayBuffer()));}catch(error){failures.set(`${id}-${k}`,error.message);}
 }))).get(id);
 VEHICLE_EFFECT_IDS.forEach(id=>fetch(`${base}audio/vehicles/${id}.mp3`).then(r=>r.ok?r.arrayBuffer():Promise.reject(Error(`HTTP ${r.status}`))).then(b=>ctx.decodeAudioData(b)).then(b=>buffers.set(id,b)).catch(error=>failures.set(id,error.message)));
 function vehicleEngine(state,now){
  const id=state.active?state.vehicle:null,mix=id&&engineLoopMix(id,state.speed,state.throttle);
  if(vLoops&&vLoops.id!==(mix?id:null)){const old=vLoops;old.parts.forEach(p=>{p.gain.gain.setTargetAtTime(0,now,.25);p.source.stop(now+1.5);});vLoops=null;}
  if(!mix)return;vLoad(id);
  if(!vLoops&&vBuffers.has(id+'-idle')&&vBuffers.has(id+'-drive'))vLoops={id,parts:['idle','drive'].map(k=>{
   const source=ctx.createBufferSource(),gain=ctx.createGain();source.buffer=vBuffers.get(`${id}-${k}`);source.loop=true;gain.gain.value=0;
   source.connect(gain).connect(carBus);source.start(now,Math.random()*source.buffer.duration);source.onended=()=>{source.disconnect();gain.disconnect();};return {k,source,gain};})};
  if(vLoops)for(const p of vLoops.parts){p.gain.gain.setTargetAtTime(mix[p.k],now,.12);p.source.playbackRate.setTargetAtTime(mix[p.k+'Rate'],now,.1);}
  // Buses: an air-brake hiss once they come to rest after a real stop.
  const kmh=Math.abs(state.speed||0)*3.6,braking=state.throttle*Math.sign(state.speed||0)<0||state.handbrake;
  if(mix.air){if(braking&&kmh>10)vBraking=1;if(vBraking&&kmh<1.5){vBraking=0;effect('air-brake',.3);}}
 }
 // Ambient traffic: the nearest few visible cars each get a spatialised pair of their own engine loops (same clips as when
 // driven), panned and attenuated from the camera. Buses hiss their air brakes when they pull up.
 // ponytail: nearest-N voices, throttle guessed from speed; add per-car acceleration if the revs need to read better.
 const TRAFFIC_VOICES=6,TRAFFIC_RANGE=70,voices=[];
 const trafficBus=ctx.createGain();trafficBus.gain.value=.8;trafficBus.connect(mixBus);
 const setXYZ=(n,k,x,y,z,now)=>{if(n[k+'X']){n[k+'X'].setTargetAtTime(x,now,.03);n[k+'Y'].setTargetAtTime(y,now,.03);n[k+'Z'].setTargetAtTime(z,now,.03);}};
 function traffic(state,now){
  const L=state.listener,list=L?state.traffic||[]:[];
  if(L){const l=ctx.listener;if(l.positionX){setXYZ(l,'position',L.x,L.y,L.z,now);setXYZ(l,'forward',L.fx,L.fy,L.fz,now);setXYZ(l,'up',0,1,0,now);}else{l.setPosition(L.x,L.y,L.z);l.setOrientation(L.fx,L.fy,L.fz,0,1,0);}}
  const near=list.filter(c=>VEHICLE_ENGINES[c.kind]).map(c=>({c,d:Math.hypot(c.x-L.x,c.z-L.z)})).filter(o=>o.d<TRAFFIC_RANGE).sort((a,b)=>a.d-b.d).slice(0,TRAFFIC_VOICES);
  for(let i=voices.length-1;i>=0;i--){const v=voices[i];if(near.some(o=>o.c.ref===v.ref))continue;
   v.parts.forEach(p=>{p.gain.gain.setTargetAtTime(0,now,.3);p.source.stop(now+1.5);});setTimeout(()=>v.panner.disconnect(),1800);voices.splice(i,1);}
  for(const {c} of near){
   let v=voices.find(v=>v.ref===c.ref);
   if(!v){vLoad(c.kind);if(!vBuffers.has(c.kind+'-idle')||!vBuffers.has(c.kind+'-drive'))continue;
    const panner=ctx.createPanner();Object.assign(panner,{panningModel:'equalpower',distanceModel:'inverse',refDistance:6,rolloffFactor:1.1,maxDistance:TRAFFIC_RANGE});panner.connect(trafficBus);
    v={ref:c.ref,kind:c.kind,panner,lastV:c.v,parts:['idle','drive'].map(k=>{const source=ctx.createBufferSource(),gain=ctx.createGain();source.buffer=vBuffers.get(`${c.kind}-${k}`);source.loop=true;gain.gain.value=0;
     source.connect(gain).connect(panner);source.start(now,Math.random()*source.buffer.duration);source.onended=()=>{source.disconnect();gain.disconnect();};return {k,source,gain};})};voices.push(v);}
   setXYZ(v.panner,'position',c.x,c.y??.8,c.z,now);
   const m=engineLoopMix(c.kind,c.v,c.v>.5?.6:0);
   for(const p of v.parts){p.gain.gain.setTargetAtTime(m[p.k],now,.15);p.source.playbackRate.setTargetAtTime(m[p.k+'Rate'],now,.12);}
   if(m.air&&v.lastV>2&&c.v<.2&&buffers.has('air-brake')&&!document.hidden){const source=ctx.createBufferSource(),gain=ctx.createGain();source.buffer=buffers.get('air-brake');gain.gain.value=.35;source.connect(gain).connect(v.panner);source.onended=()=>{source.disconnect();gain.disconnect();};source.start();log({id:'traffic-air-brake'});}
   if(c.v<.2||c.v>v.lastV)v.lastV=c.v;
  }
 }
 function effect(id,level){
  if(!buffers.has(id)||document.hidden)return;
  const source=ctx.createBufferSource(),gain=ctx.createGain();source.buffer=buffers.get(id);gain.gain.value=level;source.connect(gain).connect(id==='thunder'?weatherBus:carBus);
  source.onended=()=>{source.disconnect();gain.disconnect();};source.start();log({id});
 }
 function update(state={}){
  const now=ctx.currentTime,mix=drivingMix(state),active=!!state.active&&state.vehicle==='x5',visible=!document.hidden;
  mixBus.gain.setTargetAtTime(visible&&state.active?.72:0,now,.08);
  const distance=state.distance??8;carBus.gain.setTargetAtTime(1/Math.max(1,distance/12),now,.15);
  frame=drivetrain.step(lastTime===null?0:now-lastTime,{...state,active});lastTime=now;
  if(engine){for(const p of PARAMS)engine.parameters.get(p).setTargetAtTime(frame[p],now,.012);
   for(const e of frame.events){engine.port.postMessage(e);log({id:e.type});}}
  vehicleEngine(state,now);traffic(state,now);
  if(state.active&&mix.braking&&!previous?.braking&&mix.kmh>8&&now-lastBrake>1.5){effect('brake',.08);lastBrake=now;}
  // Thunder follows the actual flash by a short distance delay; changing weather cancels it.
  if(state.weather==='storm'){
   if(state.lightning>1&&lastLightning<=1&&now-lastThunder>2){thunderAt=now+.8+Math.random()*1.4;lastThunder=now;}
   if(thunderAt!==null&&now>=thunderAt){effect('thunder',.26);thunderAt=null;}
  }else thunderAt=null;
  lastLightning=state.lightning||0;
  for(const id of LOOP_IDS){
   let loop=loops.get(id);const target=state.active?mix.levels[id]:0;
   if(!loop&&target>0&&buffers.has(id)){
    const source=ctx.createBufferSource(),gain=ctx.createGain();source.buffer=buffers.get(id);source.loop=true;gain.gain.value=0;
    source.connect(gain).connect(id.startsWith('road-')?carBus:weatherBus);source.start();loop={source,gain,target:0};loops.set(id,loop);
   }
   if(!loop)continue;
   loop.target=target;loop.gain.gain.setTargetAtTime(target,now,id.startsWith('road-')?.25:1.1);
   loop.source.playbackRate.setTargetAtTime(mix.rates[id]||1,now,.13);
   // Release silent layers after their fade, keeping the active graph small.
   if(target===0&&loop.gain.gain.value<.0001){loop.source.stop();loop.source.disconnect();loop.gain.disconnect();loops.delete(id);}
  }
  previous={...mix,active};
 }
 return {ready,update,snapshot:()=>({loaded:buffers.size+(engine?1:0),total:LOOP_IDS.length+EFFECT_IDS.length+1,failures:Object.fromEntries(failures),
  engine:frame&&{run:frame.run,gear:frame.gear===0?'R':frame.gear,rpm:Math.round(frame.rpm),load:+frame.load.toFixed(2),boost:+frame.boost.toFixed(2),slip:+frame.slip.toFixed(2)},
  braking:previous?.braking||false,traffic:voices.map(v=>({kind:v.kind,gains:v.parts.map(p=>+p.gain.gain.value.toFixed(3))})),vehicle:vLoops&&{id:vLoops.id,gains:vLoops.parts.map(p=>+p.gain.gain.value.toFixed(3)),rates:vLoops.parts.map(p=>+p.source.playbackRate.value.toFixed(3))},loops:[...loops].map(([id,l])=>({id,target:l.target,gain:l.gain.gain.value,rate:l.source.playbackRate.value})),events:[...events]})};
}
