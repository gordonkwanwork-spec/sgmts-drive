import {loadTramAdverts,tramCampaign,applyTramAdvert} from './tram-adverts.js';
import {addStationAdverts,setBillboardLighting} from './station-adverts.js';
import {createRailway} from './railway.js';
import {poseCyclist,posePedestrian,PEDESTRIAN_COUNT} from './street-models.js';
import {journeyTerminus,nextStationIndex,fleetPlan,parkingScore,stationStopTarget,NOSE} from './service.js';
import {terminalCurve,depotCurve,depotExitCurve,l35TrafficCurve,l35ReturnCurve,L35_LINES,L35,l35Offset,sideCrossing} from './routes.js';
import * as T from 'three';
import {GLTFLoader} from 'three/addons/loaders/GLTFLoader.js';
import {createAtmosphere,ATMOS} from './atmosphere.js';
import {Sky} from 'three/addons/objects/Sky.js';
import {LENGTH,STOPS,sample,fromChainage,toChainage,LOOP,roadSection,project,projectFrame,END_STOP,CROSSINGS,cycleOffset,cycleHeight,DEPOT,laneOffset,curveRadius,returnOffset,CROSSOVER_START,cycleBridgeHeight,CYCLE_BRIDGES,cycleSample} from './alignment.js';
import {buildEnvironment,JUNCTIONS,UNDERPASSES,lampFade} from './environment.js';
import {energyFlow,boxesOverlap,SCENARIOS} from './simulation.js';
import * as audio from './audio.js';
import './experience.css';
import {groundAt,walkStep,passengerLine,JUMP_SPEED,GRAVITY} from './onfoot.js';
import {collectSolids,wallSlide,clearView,resetView} from './collision.js';
const asset=f=>import.meta.env.BASE_URL+'assets/'+f+(['art.glb','street-kit.glb'].includes(f)?'?v=art-body-20260924':f.startsWith('station-')?'?v=stations-20260923b':'');
import {tractionLocked,verticalOverlap,doorsFit,driveStep,angleDelta,freeStep,MAX_WHEEL_ANGLE,approachStep,followingStop,crosserInPath} from './operating.js';
const $=s=>document.querySelector(s),clamp=(x,a,b)=>Math.max(a,Math.min(b,x)),smooth=(a,b,t)=>a+(b-a)*clamp(t,0,1);
const point=(s,lat=0)=>{let p=sample(s);return new T.Vector3(p.x+p.lx*lat,p.y,p.z+p.lz*lat);};
const state={screen:'loading',mode:'service',avatar:'drive',condition:'morning',headway:300,s:stationStopTarget(STOPS[0]),v:0,lat:5.4,steer:0,yaw:0,park:true,door:0,doorTarget:0,doorSide:1,ramp:0,rampTarget:0,index:0,phase:'approach',dwell:0,pax:0,score:0,energy:0,regen:0,battery:92,time:0,cruise:false,guide:true,cam:0,muted:false,indicator:0,accel:0,travel:0,served:[],skipped:[],missed:[],incidents:0,penalties:0,crashed:false,hold:0,priority:false,loopS:0,loopDone:false,requestAck:false,requestRequired:false,freeX:0,freeY:0,freeZ:0,freeS:0,freeSpeed:0,freeHeading:0,frameTimes:[],frames:0};
const mobile=matchMedia('(pointer:coarse)').matches;document.documentElement.classList.toggle('mobile',mobile);
const keys=new Set(), errors=[];let ready=false,vehicle,ai=[],depotVehicles=[],stations=[],signalObjects=[],traffic=[],walkerObjects=[],plazaPeople=[],crossers=[],cyclists=[],last=performance.now(),hudTick=0,elapsed=0,toastTime=0,cruiseTarget=0;
const CAMERAS=['Third person / 跟隨','Cockpit / 駕駛室','Bird’s-eye / 鳥瞰','Platform / 月台'];
document.body.innerHTML=`<div id="viewport"></div><div id="load"><span class="overline">SGMTS / PHASE ONE</span><h1>Preparing your route.</h1><p id="load-detail">Loading Blender vehicle and stations…</p><div class="load-track"><i></i></div></div>
<div id="identity"><span class="brand-dot"></span><strong>SGMTS <span>DRIVE</span></strong><small>洪水橋 · 廈村</small></div>
<button id="clean-view" aria-label="Hide interface" title="Hide interface" aria-pressed="false">H</button><div id="top-actions"><label class="operation-control">Headway <select id="headway" aria-label="SGMTS departure headway"><option value="300" selected>5 min · 6 running</option><option value="210">3.5 min · 17 running · pairs</option></select></label><button id="night">Night</button><button id="sound">Sound on</button><button id="camera">C · Camera</button><button id="pause">Ⅱ Pause</button></div>
<section id="menu" class="sheet hidden"><div class="overline">HUNG SHUI KIU / HA TSUEN</div><h1>A new perspective.<br><em>Every journey.</em></h1><p class="subhead">智慧綠色集體運輸系統 · 第一期</p><p class="intro">Drive the articulated electric service through seven stations,<br>or roam freely across the whole map.</p><div class="facts"><span><b>07</b> stations</span><span><b>4.5</b> km profile</span><span><b>04</b> conditions</span></div><div class="choices"><label>Operating conditions<select id="condition"><option value="morning">Morning local · 早晨班次</option><option value="sunset">Golden hour · 黃昏班次</option><option value="rain">Rainy rush hour · 雨天繁忙時段</option><option value="night">Night service · 夜間班次</option></select></label><label>Your drive<select id="mode"><option value="service">Full service · 七站服務</option><option value="access">Accessible service · 無障礙服務</option><option value="priority">Request & priority · 預約停站挑戰</option><option value="turnback">Nai Wai turnback · 總站精準駕駛</option><option value="explore">Explore the whole line · 全線探索</option><option value="free">Free roam · 自由探索</option></select></label></div><button id="menu-music" type="button">♫ Play menu music</button><button id="begin" class="primary">Begin journey <span>開始駕駛 ↗</span></button><p class="note">Drive: W/R/S + A/D · <b>Stop, then Enter to get out</b>: walk, take a parked bike or ride any ART · Free roam: WASD + Shift + Space/Ctrl</p><details><summary>Controls & route information</summary><p><b>Get out and explore.</b> Stop your ART anywhere and press Enter to step out. On foot: WASD walk · Shift run · Space jump (clears fences) · click the scene, then move the mouse to look · wheel to zoom. Three bikes are parked on the cycle track at every station: walk up and press Enter to ride (W pedal · S brake, press again to turn round · A/D change side · Enter to park). Walk up to any stopped ART and press Enter to ride as a passenger; Enter again alights. Enter beside your own vehicle returns you to the cab. E chats with people nearby.</p><p>Free roam uses WASD, Shift to move faster, Space/Ctrl for altitude, and mouse movement to look. Driving: W forward · R reverse · S brake · G guidance · C camera · click scene to enable mouse-look · Esc releases pointer · F go · T stop · O options · I map · U hide UI · J depot · K cab · L skip · wheel / + / − zoom · 0 reset view · B ramp · Q priority/acknowledge · X door side · Z indicator · H horn · P pause · . fast-forward (with cruise). Pause / report: Enter continue · Backspace return to menu · E explore beyond Industry Park. Phones: joystick walks, cycles and flies; ⏏ gets out or in, 💬 talks, ▲/▼ jump or change altitude.</p></details></section>
<div id="hud" class="hidden"><div id="next-panel"><small id="service-label">LINE 01 · NORTHBOUND</small><div id="stop-banner" hidden></div><h2 id="next">泥圍 · Nai Wai</h2><div id="next-distance"></div><div id="signal-status"></div><div id="board" hidden><div class="clock"><b id="clock-now">08:15:00</b><span id="clock-due"></span></div><div class="cells"><div class="cell" id="time-cell"><small id="time-label">尚餘 TIME LEFT</small><b id="time-left">—</b></div><div class="cell" id="mark-cell"><small id="mark-label">停車位置 STOP MARK</small><b id="stop-mark">—</b></div></div><div id="precision" hidden><div class="track"><i></i></div><span id="precision-label"></span></div><div class="load"><span>乘客 On board <b id="onboard">0</b></span><span id="profit" hidden></span></div></div></div><div id="score-panel"><small>SERVICE SCORE</small><b id="score">0000</b><span id="pax"></span><span id="schedule"></span></div><div id="instruction" role="status"></div><div id="dwell"><i></i><span></span></div><div id="cluster"><div class="speed"><b id="speed">0</b><span>km/h</span><div id="limit">40</div></div><div class="switches"><span id="brake-status"></span><span id="door-status"></span><span id="guide-status"></span><span id="camera-status"></span></div></div><div id="telemetry"></div><div id="route-strip">${STOPS.map(st=>`<div data-stop="${st.id}"><i></i><span>${st.zh}</span></div>`).join('')}</div><div id="mobile-buttons"><button data-action="go">Go / 行駛</button><button data-action="stop">Stop / 停車</button><button data-action="doors">Doors / 車門</button><button data-action="camera">Camera / 視角</button></div><div id="route-choices"><button data-action="recover">Recover vehicle</button><button data-action="express">Skip station</button><button data-action="cruise">Cruise on / off</button><button data-action="depot">Depot</button><button data-action="cab">Change cab</button><button data-action="depot-left">Exit left · Industry Park</button><button data-action="depot-right">Exit right · Nai Wai</button></div><canvas id="minimap" width="190" height="430" aria-label="Live route: gold triangle is you, blue rectangles are other ART vehicles, cream circles are stations. Traffic light symbols show each road and its current phase."></canvas><div id="buttons"><button data-action="park">Parking brake <kbd>Space</kbd></button><button data-action="doors">Doors <kbd>E</kbd></button><button data-action="cruise">Cruise control <kbd>V</kbd></button><button data-action="guide">Lane guidance <kbd>G</kbd></button><button data-action="ramp">Boarding ramp <kbd>B</kbd></button><button data-action="priority">Acknowledge request <kbd>Q</kbd></button></div></div>
<div id="toast" role="status"></div><div id="pause-sheet" class="modal hidden"><small>TAKE A BREATH</small><h1>Journey paused.</h1><button id="resume" class="primary">Continue / 繼續 ↗</button><button class="menu-return">Return to menu</button></div><div id="report" class="modal hidden"><small>OPERATIONAL PERFORMANCE</small><h1>Journey complete.</h1><div id="report-grade"></div><div id="report-data"></div><button class="menu-return primary">Another journey / 再次出發 ↗</button><button id="explore-tail">Explore beyond Industry Park</button></div><div id="footnote">DRAWING-LED INTERPRETATION · 圖則參考模擬</div>`;
// Keep infrequent controls in one native dialog; driving controls stay on the edges.
const options=document.createElement('dialog');options.id='drive-options';options.innerHTML='<button id="close-options" aria-label="Close options">×</button><h2>Journey options</h2>';document.body.append(options);
{const heading=text=>Object.assign(document.createElement('h3'),{textContent:text});options.append(heading('Controls'),$('#buttons'),heading('Service'),$('#score-panel'),$('#telemetry'),heading('Display'),$('#top-actions'));$('#telemetry').after($('#top-actions .operation-control'));}
const edge=document.createElement('div');edge.id='edge-tools';edge.innerHTML='<button id="options-button" aria-label="Journey options" title="Journey options">☰</button>';$('#hud').append(edge);edge.prepend($('#pause'),$('#camera'));
$('#options-button').onclick=()=>{if(options.open){options.close();return;}document.exitPointerLock?.();keys.clear();options.showModal();};$('#close-options').onclick=()=>options.close();
const controls=$('#mobile-buttons');for(const [name,icon,label] of [['go','▶','Go'],['stop','■','Stop'],['doors','▥','Doors'],['camera','◉','Camera']]){const b=controls.querySelector('[data-action='+name+']');b.innerHTML='<b>'+icon+'</b><small>'+label+'</small>';b.setAttribute('aria-label',label);b.title=label;}
controls.querySelector('[data-action=camera]').remove();
$('#pause').innerHTML='<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M7 5h3v14H7zm7 0h3v14h-3z" fill="currentColor"/></svg>';$('#pause').setAttribute('aria-label','Pause');$('#camera').innerHTML='<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M3 7h4l2-3h6l2 3h4v13H3z" fill="none" stroke="currentColor" stroke-width="2"/><circle cx="12" cy="13" r="4" fill="none" stroke="currentColor" stroke-width="2"/></svg>';$('#camera').setAttribute('aria-label','Change camera');
const mapButton=document.createElement('button');mapButton.id='map-button';mapButton.setAttribute('aria-label','Expand route map');$('#minimap').replaceWith(mapButton);mapButton.append(document.createElement('canvas'));mapButton.firstChild.id='minimap';mapButton.firstChild.width=190;mapButton.firstChild.height=190;
mapButton.onclick=()=>{document.body.classList.toggle('map-expanded');mapButton.setAttribute('aria-label',document.body.classList.contains('map-expanded')?'Close route map':'Expand route map');};
const speedDial=document.createElement('label');speedDial.id='speed-dial';speedDial.innerHTML='<span>SET SPEED</span><output id="target-speed">0</output><small>km/h</small><input id="speed-control" type="range" min="0" max="50" step="1" value="0" aria-label="Target speed in kilometres per hour">';$('#hud').append(speedDial);
$('#speed-control').oninput=e=>{state.speedSetting=Number(e.target.value);$('#target-speed').value=state.speedSetting;if(state.speedSetting===0){action('stop');return;}action('go');};
// Fast-forward (edge column) and the event stack under the service board: NEXT STEP chip, then the toast banner.
const ffButton=document.createElement('button');ffButton.id='ff-button';ffButton.dataset.action='ff';ffButton.setAttribute('aria-label','Fast-forward');ffButton.innerHTML='<b aria-hidden="true">⏩</b><small>1×</small>';$('#edge-tools').append(ffButton);
// Touch pad: the joystick and buttons press the same keys as the desktop, so touch and keyboard share one code path.
const pad=document.createElement('div');pad.id='touch-pad';pad.innerHTML='<div id="joystick" role="application" aria-label="Movement joystick"><i></i></div><button id="pad-enter" data-key="Enter"><b>⏏</b><small>Walk</small></button><button id="pad-talk" data-key="KeyE"><b>💬</b><small>Talk</small></button><button id="pad-up" data-key="Space"><b>▲</b><small>Jump</small></button><button id="pad-down" data-key="ControlLeft"><b>▼</b><small>Down</small></button>';$('#hud').append(pad);
const capture=(el,e)=>{try{el.setPointerCapture(e.pointerId);}catch{}},press=(code,down)=>dispatchEvent(new KeyboardEvent(down?'keydown':'keyup',{code,key:code}));
for(const b of pad.querySelectorAll('button')){b.onpointerdown=e=>{e.preventDefault();press(b.dataset.key,true);capture(b,e);};b.onpointerup=b.onpointercancel=()=>press(b.dataset.key,false);}
const joystick=$('#joystick'),STICK_KEYS=['KeyW','KeyS','KeyA','KeyD','ShiftLeft'];let stick=null;
function releaseStick(){stick=null;joystick.firstChild.style.transform='';STICK_KEYS.forEach(k=>keys.delete(k));}
function moveStick(e){const r=joystick.getBoundingClientRect(),R=r.width/2;let x=(e.clientX-r.left-R)/R,y=(e.clientY-r.top-R)/R;const m=Math.hypot(x,y);if(m>1){x/=m;y/=m;}joystick.firstChild.style.transform=`translate(${x*R*.6}px,${y*R*.6}px)`;
 // ponytail: eight-way digital stick (full push = Shift/run); analog speed if players ask for it.
 const on={KeyW:y<-.35,KeyS:y>.35,KeyA:x<-.35,KeyD:x>.35,ShiftLeft:m>.95};for(const k of STICK_KEYS)on[k]?keys.add(k):keys.delete(k);}
joystick.onpointerdown=e=>{e.preventDefault();stick=e.pointerId;moveStick(e);capture(joystick,e);};joystick.onpointermove=e=>{if(e.pointerId===stick)moveStick(e);};joystick.onpointerup=joystick.onpointercancel=releaseStick;
// Keyboard wording in prompts becomes touch wording on phones.
const touchText=t=>mobile?t.replace(/WASD walk · Shift run( · Space jump)? · (mouse look|click the scene, then move the mouse to look)/,'joystick to walk (push fully to run) · ▲ jump · drag to look').replace('W pedal · S brake','joystick up to pedal · down to brake').replace(/A\/D change side/,'left/right to change side').replace(/\bE (to chat|talk|· talk)/,'💬 $1').replace(/(press )?\bEnter\b/g,'⏏').replace(/move (the )?mouse to look(, scroll to zoom)?/,'drag to look').replace('WASD move · Shift boost · Space/Ctrl altitude','joystick to fly (push fully to boost) · ▲/▼ altitude · drag to look'):t;
const stack=document.createElement('div');stack.id='hud-stack';stack.append($('#instruction'),$('#toast'));$('#hud').append(stack);
let lastPrompt='',promptUntil=0;
// Action prompts stay up until done; informational ones fade after 5.5 s (keyed so a changing distance does not restart the timer).
function contextualPrompt(text,persistent=false,key=text){if(key!==lastPrompt){lastPrompt=key;promptUntil=performance.now()+5500;}$('#instruction').textContent=touchText(text);$('#instruction').classList.toggle('action',!!persistent);$('#instruction').classList.toggle('prompt-visible',!!text&&(!!persistent||performance.now()<promptUntil));}
if(mobile)for(const option of [...$('#mode').options])if(['access','priority'].includes(option.value))option.remove();
const renderer=new T.WebGLRenderer({antialias:true,powerPreference:'high-performance'});renderer.setSize(innerWidth,innerHeight);renderer.setPixelRatio(Math.min(devicePixelRatio,1));renderer.outputColorSpace=T.SRGBColorSpace;renderer.toneMapping=T.ACESFilmicToneMapping;renderer.toneMappingExposure=1.05;renderer.shadowMap.enabled=true;renderer.shadowMap.type=T.PCFSoftShadowMap;$('#viewport').appendChild(renderer.domElement);
const scene=new T.Scene(),camera=new T.PerspectiveCamera(48,innerWidth/innerHeight,.15,1600);scene.fog=new T.FogExp2(0xb8cdd6,.0012);
const windSeeds=Float32Array.from({length:180*3},()=>Math.random()),windPositions=new Float32Array(windSeeds.length),windGeometry=new T.BufferGeometry();windGeometry.setAttribute('position',new T.BufferAttribute(windPositions,3));const windParticles=new T.Points(windGeometry,new T.PointsMaterial({color:0xe8eee4,size:.13,transparent:true,opacity:.42,depthWrite:false}));windParticles.name='Wind particles';scene.add(windParticles);
function updateWind(subject){for(let i=0;i<windSeeds.length;i+=3){windPositions[i]=((windSeeds[i]*90+elapsed*7)%90)-45;windPositions[i+1]=windSeeds[i+1]*16+1;windPositions[i+2]=((windSeeds[i+2]*70+elapsed*1.8)%70)-35;}windGeometry.attributes.position.needsUpdate=true;windParticles.position.copy(subject);}
const sky=new Sky();sky.scale.setScalar(45000);sky.material.uniforms.turbidity.value=3;sky.material.uniforms.rayleigh.value=1.25;sky.material.uniforms.mieCoefficient.value=.005;sky.material.uniforms.mieDirectionalG.value=.83;sky.material.uniforms.sunPosition.value.set(-.5,.4,-.3);scene.add(sky);
const ambient=new T.HemisphereLight(0xd1e2e7,0x697461,.7);scene.add(ambient);const sun=new T.DirectionalLight(0xffe5bd,3.0);sun.castShadow=true;sun.shadow.mapSize.setScalar(mobile?2048:4096);Object.assign(sun.shadow.camera,{left:-95,right:95,top:95,bottom:-95,near:1,far:480});sun.shadow.bias=-.00025;sun.shadow.normalBias=.035;scene.add(sun,sun.target);
// Sky-lit reflections, height fog, clouds/night sky and (desktop) AO, sun shafts, bloom and grade.
const atmosphere=createAtmosphere({renderer,scene,camera,sky,sun,ambient,quality:mobile?'low':'high'});atmosphere.onLightning=delay=>audio.thunder(delay);
const loader=new GLTFLoader();let manifest,environment,streetKit,railway;
function streetModel(name){const model=streetKit.getObjectByName(name);if(!model)throw Error("Missing Blender model "+name);const group=model.clone(true);group.traverse(n=>{if(n.isMesh){n.castShadow=true;n.receiveShadow=true;}});return group;}
window.addEventListener('error',e=>errors.push(e.message));window.addEventListener('unhandledrejection',e=>errors.push(String(e.reason)));
function toast(text,seconds=4){text=touchText(text);$('#toast').textContent=text;$('#toast').classList.add('visible');toastTime=seconds;}
function meshBox(w,h,d,color){return new T.Mesh(new T.BoxGeometry(w,h,d),new T.MeshStandardMaterial({color,roughness:.65}));}
const spillCanvas=document.createElement('canvas');spillCanvas.width=spillCanvas.height=64;const spillContext=spillCanvas.getContext('2d'),spillGradient=spillContext.createRadialGradient(32,32,0,32,32,32);spillGradient.addColorStop(0,'rgba(255,244,215,.55)');spillGradient.addColorStop(1,'rgba(255,244,215,0)');spillContext.fillStyle=spillGradient;spillContext.fillRect(0,0,64,64);const spillMaterial=new T.MeshBasicMaterial({map:new T.CanvasTexture(spillCanvas),transparent:true,depthWrite:false,blending:T.AdditiveBlending,opacity:.55});
function setupTram(gltf,isAI=false){
 const root=gltf.scene.clone(true),sections=[];scene.add(root);
 for(const name of ['section_front','section_mid','section_rear']){let g=root.getObjectByName(name);if(!g)throw Error('Missing Blender node '+name);root.updateMatrixWorld(true);scene.attach(g);sections.push(g);}
 // ponytail: emissive AI cabins bound the light count; pool nearby lights if AI cabin shadows are needed.
 for(const section of sections){if(!isAI){const light=new T.PointLight(0xffe9cb,0,5,2);light.name='Passenger ceiling light';light.position.set(0,2.65,0);section.add(light);}for(const side of [-1,1]){const spill=new T.Mesh(new T.PlaneGeometry(3.5,9),spillMaterial);spill.name='Interior light spill';spill.rotation.x=-Math.PI/2;spill.position.set(side*2,.055,0);spill.visible=false;section.add(spill);const strip=new T.Mesh(new T.BoxGeometry(.08,.04,8.2),new T.MeshBasicMaterial({color:0xfff0da}));strip.name='Interior ceiling LED';strip.position.set(side*.6,3.02,0);strip.visible=false;section.add(strip);}section.traverse(n=>{if(n.isMesh&&n.material){n.material=n.material.clone();n.userData.vehicleMaterial=true;}});}
 scene.remove(root);const doors=[],wheels=[],lights=[],cabDisplays=[],steering=[],glazing=[],wipers=[];
 sections.forEach((g,si)=>g.traverse(n=>{if(n.isMesh){n.castShadow=true;n.receiveShadow=true;if(n.material){n.material.envMapIntensity=.8;}}
 if(/_door_(left|right)_[01]$/.test(n.name))doors.push({node:n,base:n.position.clone(),side:n.name.includes('_left_')?1:-1,si});
 if(n.name.startsWith('Route_destination'))n.material.side=T.FrontSide;
 if(n.name.startsWith('driver_eye'))g.userData.driverEye=n;
 if(n.name.startsWith('cab_display'))cabDisplays.push(n);
 if(n.isMesh&&n.material?.name==='glass')glazing.push(n);
 if(n.name.startsWith('steering_wheel')&&!n.isMesh)steering.push({node:n,base:n.quaternion.clone()});
 if(n.name.startsWith('wiper_pivot')&&!n.isMesh)wipers.push({node:n,base:n.quaternion.clone(),section:g});
 if(n.name.includes('_wheel_')&&!n.name.startsWith('steering')){n.scale.multiplyScalar(.8);n.position.x*=.91;wheels.push(n);}
 if(n.name.includes('light'))lights.push(n);
 }));
 return {sections,doors,wheels,lights,cabDisplays,steering,glazing,wipers,yaws:[0,0,0],isAI,s:1000,lat:-1.9,v:7,door:0};
}
function poseTram(t,s,lat,reverse=false,door=0,loop=false){
 const spacing=10.6;let prev=null;
 if(!t.isAI){const front=loop?LOOP.sample(s):point(s,lat),pos=new T.Vector3(front.x,loop?front.y:front.y,front.z);
  if(!t.posed||!t.trail||pos.distanceTo(t.trail.at(-1))>8){t.trail=[];for(let d=35;d>=0;d-=.5){const q=loop?LOOP.sample(s-d):point(Math.max(0,s-d),lat);t.trail.push(new T.Vector3(q.x,q.y,q.z));}}
  else if(state.v<0){
   // Reversing retraces the travelled path: drop points the nose has backed over instead of folding the trail.
   while(t.trail.length>2){const a=t.trail.at(-2),b=t.trail.at(-1),ab=b.clone().sub(a);if(pos.clone().sub(a).dot(ab)<ab.lengthSq())t.trail.pop();else break;}
   // ponytail: once backed past the recorded path, extend its tail straight; enough for the 21 m of trailing sections.
   let covered=pos.distanceTo(t.trail.at(-1));for(let j=1;j<t.trail.length;j++)covered+=t.trail[j].distanceTo(t.trail[j-1]);
   const [a,b]=t.trail,dir=a.clone().sub(b).setY(0).normalize();
   for(;covered<30;covered+=.5)t.trail.unshift(t.trail[0].clone().addScaledVector(dir,.5));
  }
  else if(pos.distanceTo(t.trail.at(-1))>.15)t.trail.push(pos);
  if(t.trail.length>260)t.trail.splice(0,t.trail.length-260);
 }

 t.sections.forEach((g,i)=>{
  let p;
  if(loop){const r=LOOP.sample(s-i*spacing);p={...r,lx:r.tz,lz:-r.tx,heading:Math.atan2(-r.tx,-r.tz),grade:0};}
  else p=sample(clamp(s+(reverse?i:-i)*spacing,0,LENGTH));
  const sectionS=clamp(s+(reverse?i:-i)*spacing,0,LENGTH),sectionLat=t.isAI&&!loop?(reverse?returnOffset(sectionS):laneOffset(sectionS)):lat;
  let pos=new T.Vector3(p.x+p.lx*sectionLat,p.y+.025,p.z+p.lz*sectionLat);
  let heading=p.heading+(reverse?Math.PI:0)+(t.flipped?Math.PI:0)+(t.isAI?0:t.yaws[i]),pitch=Math.atan(p.grade)*(reverse?-1:1)*(t.flipped?-1:1);
  if(t.isAI&&!loop){const a=point(sectionS-1,(reverse?returnOffset(sectionS-1):laneOffset(sectionS-1))),b=point(sectionS+1,(reverse?returnOffset(sectionS+1):laneOffset(sectionS+1)));heading=Math.atan2(a.x-b.x,a.z-b.z)+(reverse?Math.PI:0)+(t.flipped?Math.PI:0);}
  if(!t.isAI&&!state.guide&&prev&&t.posed&&Math.abs(state.v)>.001){const hitch=prev.localToWorld(new T.Vector3(0,0,5.3)),axle=g.localToWorld(new T.Vector3(0,0,3.1));heading=Math.atan2(-(hitch.x-axle.x),-(hitch.z-axle.z));}
  if(!t.isAI&&i&&t.trail){let remaining=i*spacing,last=loop?new T.Vector3(LOOP.sample(s).x,LOOP.y,LOOP.sample(s).z):point(s,lat);for(let j=t.trail.length-1;j>=0;j--){const q=t.trail[j],length=last.distanceTo(q);if(length>0&&remaining<=length){pos=last.clone().lerp(q,remaining/length);pos.y+=.025;heading=Math.atan2(q.x-last.x,q.z-last.z)+(t.flipped?Math.PI:0);break;}remaining-=length;last=q;}}
  g.position.copy(pos);g.rotation.set(pitch,heading,0,'YXZ');
  // Each section follows the measured path; hitch pose is continuous rather than a canned animation.
  if(prev){let prior=prev.localToWorld(new T.Vector3(0,.9,t.flipped?-5.3:5.3)),front=g.localToWorld(new T.Vector3(0,.9,t.flipped?5.3:-5.3));g.position.add(prior.sub(front));}
  prev=g;
 });
 t.posed=true;
 for(const d of t.doors){d.node.position.copy(d.base);const open=t.isAI?(d.side===(t.flipped?-1:1)?door:0):(d.side===state.doorSide?door:0);d.node.position.z+=open*.75*(d.node.name.endsWith('_0')?1:-1);}
 for(const w of t.wheels){w.rotation.x=elapsed*(t.isAI?t.v:state.v)/.46;if(!t.isAI&&w.name.startsWith('section_front'))w.rotation.y=state.steer*MAX_WHEEL_ANGLE;}
 // Leading-cab wiper sweeps up the raked windscreen in rain and parks below the glazing otherwise.
 for(const w of t.wipers){w.node.quaternion.copy(w.base);if(state.condition==='rain'&&w.section===t.sections[0])w.node.rotateY(1.5*(.5-.5*Math.cos(elapsed*2.6)));}
}
const junctions=JUNCTIONS;
function makeSignals(){
 for(const j of junctions){const r=sample(j.s);if(j.underpass)r.y=r.groundY;else if(r.elevated)continue;const sig={...j,s:j.s-j.stop,centre:j.s,passed:false,heads:[]};signalObjects.push(sig);
  for(const [side,axis] of [...[-1,1].flatMap(side=>['corridor','side','pedestrian'].map(axis=>[side,axis])),...(j.c===2650?[[2,'side']]:[])]){const local=new T.Vector3(side===2?L35.offset+L35.width/2+.8:axis!=='side'?-side*(roadSection(j.s).right+1):side*(sideCrossing(j,side)+3.5),0,side===2?-(j.halfWidth+13.5):axis!=='side'?side*j.stop:side*(j.halfWidth+1)),rise=-local.z*r.grade,group=new T.Group();local.applyAxisAngle(new T.Vector3(0,1,0),r.heading);group.position.set(r.x+local.x,r.y+rise,r.z+local.z);group.rotation.y=r.heading+(axis!=='side'?(side===1?0:Math.PI):side*Math.PI/2);
   const pole=meshBox(.14,4.9,.14,0x53615c);pole.position.y=2.45;group.add(pole);const housing=meshBox(.5,1.55,.32,0x142522);housing.position.set(0,4.3,0);group.add(housing);const bulbs=[];
   [0xff4237,0xffc84c,0x50ff96].forEach((col,k)=>{const bulb=new T.Mesh(new T.CircleGeometry(.14,14),new T.MeshBasicMaterial({color:col}));if(axis==='pedestrian'){const c=document.createElement('canvas');c.width=c.height=64;const x=c.getContext('2d');x.strokeStyle='white';x.fillStyle='white';x.lineWidth=7;x.lineCap='round';x.beginPath();x.arc(32,12,6,0,Math.PI*2);x.fill();x.beginPath();x.moveTo(32,23);x.lineTo(32,39);x.moveTo(20,31);x.lineTo(32,25);x.lineTo(44,31);x.moveTo(21,54);x.lineTo(32,39);x.lineTo(43,54);x.stroke();bulb.material.map=new T.CanvasTexture(c);bulb.material.transparent=true;bulb.visible=k!==1;bulb.scale.set(1.5,1.5,1);}bulb.position.set(0,4.78-k*.47,.17);group.add(bulb);bulbs.push(bulb);});if(axis==='pedestrian'){group.scale.setScalar(.65);group.position.addScaledVector(new T.Vector3(r.tx,0,r.tz),side*3);group.name='Pedestrian signal';}scene.add(group);sig.heads.push({group,bulbs,axis});
  }
 }
}
function signalAt(sig,side=false){const t=((state.time+sig.offset)%42+42)%42;return side?(t>=30&&t<39?'go':t>=39&&t<40?'amber':'stop'):(t<25?'go':t<28?'amber':'stop');}
function nextSignal(){return signalObjects.find(s=>!s.underpass&&s.s+1>state.s);}
// ponytail: finite straight crossing routes recycle off-scene; use a road network if turning traffic is required.
function makeTraffic(){
 const routes=[...junctions.flatMap(junction=>[-1,1].flatMap(dir=>Array.from({length:3},(_,n)=>({junction,dir,along:-dir*1.9,start:-dir*(25+n*18)})))),...UNDERPASSES.flatMap(junction=>[-1,1].flatMap(dir=>Array.from({length:6},(_,n)=>({junction,dir,along:-dir*(n%2?6.5:2.2),start:-dir*(100-n*32)}))))];
 const types=[['car',1.8,4.2,1.6,0xb7bfc0],['taxi',1.8,4.7,1.65,0xbb3431],['van',2,5.5,2.5,0xe4dfd0],['truck',2.4,8.5,3.2,0x567976],['bus',2.5,11,3.5,0xd9b15d]];
 for(let i=0;i<routes.length;i++){const route=routes[i],[kind,w,length,height]=types[i%types.length],group=streetModel(kind);
  group.name='traffic-'+kind;group.traverse(n=>{if(n.isMesh)n.castShadow=true;});scene.add(group);traffic.push({group,...route,kind,width:w,length,height,lat:route.start,start:route.start,v:0,cross:true});
 }
 for(let i=0;i<4;i++){const source=traffic[i],group=source.group.clone(true),curve=i%2?l35ReturnCurve:l35TrafficCurve;group.name='L35 turning '+source.kind;scene.add(group);traffic.push({...source,junction:null,group,curve,routeDistance:(.2+.45*(i>>1))*curve.getLength(),routeDir:1});}
 STOPS.forEach((st,i)=>{for(let j=0;j<26;j++){const g=streetModel('pedestrian_'+((Math.floor(j/2)+(j%2)*3+i)%PEDESTRIAN_COUNT));
  const side=j%2?1:-1,phase=Math.floor(j/2),origin=point(stopCentre(st,side)+(phase-6)*4,side*(8.35+(phase%2)*.45));origin.y+=.32;g.position.copy(origin);g.rotation.y=sample(st.s).heading;scene.add(g);walkerObjects.push({group:g,station:i,side,origin,phase,progress:0,alight:phase<3,roaming:phase>=9});
 }});
}
function makeStreetLife(){
 for(const [i,c] of [...CROSSINGS,...JUNCTIONS.map(j=>({s:j.s+j.halfWidth+10,station:j.name,signal:j.c}))].entries()){const group=streetModel('pedestrian_'+i%PEDESTRIAN_COUNT);group.name='crossing-pedestrian';scene.add(group);crossers.push({...c,group,dir:i%2?1:-1,wait:5+i%7,active:false});}
 for(let i=0;i<20;i++){const group=streetModel('cyclist'),wheels=['bike_wheel_front','bike_wheel_rear'].map(n=>group.getObjectByName(n)),c={group,wheels,s:LENGTH*(i+.5)/20,dir:i%2?1:-1,v:0,phase:i};poseCyclist(c,0);scene.add(group);cyclists.push(c);}
 const st=STOPS[1];for(let i=0;i<18;i++){const group=streetModel('pedestrian_'+(i+3)%PEDESTRIAN_COUNT);group.name='plaza-pedestrian';scene.add(group);plazaPeople.push({group,s:st.s-85+(i%6)*32,lat:-30-Math.floor(i/6)*18,phase:i*1.7,dancing:i%3===0});}
}
const birds=[];
function makeBirds(){for(const [i,st] of STOPS.entries())for(let j=0;j<3;j++){const group=new T.Group(),body=new T.Mesh(new T.SphereGeometry(.12,6,4),new T.MeshStandardMaterial({color:j%2?0x839099:0xb7b9af}));body.scale.set(.8,.8,2);group.add(body);const wings=[];for(const side of [-1,1]){const wing=new T.Mesh(new T.ConeGeometry(.13,.55,3),body.material);wing.rotation.z=side*Math.PI/2;wing.position.x=side*.25;group.add(wing);wings.push({wing,side});}group.name='station-bird';scene.add(group);birds.push({group,wings,station:st,phase:i*4+j*7,offset:j*8});}}
function updateBirds(dt,s){for(const b of birds){const t=(state.time+b.phase)%48,st=b.station,perch=point(st.s+b.offset-8,8.7);perch.y+=3.7;b.group.visible=Math.abs(st.s-s)<500;if(!b.group.visible)continue;const fly=t<32,u=fly?t/32:0,height=fly?Math.sin(Math.PI*u)*9:0,angle=u*Math.PI*2;b.group.position.copy(perch);if(fly){b.group.position.x+=Math.sin(angle)*20;b.group.position.z+=(Math.cos(angle)-1)*12;b.group.position.y+=height;}b.group.rotation.y=fly?-angle:sample(st.s).heading;for(const {wing,side} of b.wings)wing.rotation.z=side*(fly?Math.PI/2+Math.sin(state.time*13+b.phase)*.55:.15);}}
const nextDispatch={1:300,'-1':300};
function startService(a,s){a.s=s;a.v=0;a.lat=a.dir*1.9;a.dwell=0;a.door=0;a.served=[];a.posed=false;a.active=true;a.terminal=null;a.stopIndex=a.dir===1?STOPS.findIndex(st=>stopTarget(st,1)>s+20):STOPS.findLastIndex(st=>stopTarget(st,-1)<s-20);if(a.dir===1&&a.stopIndex<0)a.stopIndex=7;}
function resetStreetLife(){
 state.lastWarnings={};state.wasBraking=false;
 for(const a of ai){if(a.flipped){a.sections.reverse();a.flipped=false;}a.dir=a.homeDir||a.dir;a.terminal=null;}
 const plan=fleetPlan(state.headway);
 for(const dir of [1,-1]){const pool=ai.filter(a=>a.dir===dir),count=dir===1?Math.ceil(plan.count/2):Math.floor(plan.count/2),groups=Math.ceil(count/plan.convoy);pool.forEach((a,i)=>{a.active=i<count;if(a.active){const convoy=Math.floor(i/plan.convoy),distance=150+(convoy+.5)*(LENGTH-350)/groups-(i%plan.convoy)*44;startService(a,dir===1?distance:LENGTH-distance);a.convoy=convoy;a.pax=25+i*3;}a.sections.forEach(g=>g.visible=a.active);});nextDispatch[dir]=state.headway;}

 crossers.forEach((c,i)=>{const e=roadSection(c.s);c.dir=i%2?1:-1;c.lat=c.dir===1?cycleOffset(c.s)-2.6:e.right+.8;c.active=false;c.wait=5+i%7;});
 cyclists.forEach((c,i)=>{c.s=LENGTH*(i+.5)/20;c.dir=i%2?1:-1;c.v=0;c.liftHeight=cycleBridgeHeight(c.s);});
}
function updateStreetLife(dt,subjectS){
 for(const c of crossers){const edge=roadSection(c.s),finish=c.dir===1?edge.right+.8:cycleOffset(c.s)-2.6;
  if(!c.active){c.wait-=dt;const clearTime=(edge.right-edge.left+1.6)/1.3+3;
   const player=state.mode!=='free'&&state.mode!=='turnback'&&state.s>c.s-35&&state.s<c.s+28||state.mode!=='free'&&state.mode!=='turnback'&&state.v>.1&&c.s>state.s&&c.s-state.s<state.v*clearTime+12;
   const incoming=ai.some(a=>a.active&&(Math.abs(a.s-c.s)<38||(c.s-a.s)*a.dir>0&&(c.s-a.s)*a.dir<a.v*clearTime+12));
   const sig=c.signal&&signalObjects.find(s=>s.c===c.signal),phase=sig?((state.time+sig.offset)%42):0;if(c.wait<=0&&!player&&!incoming&&(!sig||phase>=28&&phase<30))c.active=true;
  }
  if(c.active){c.lat+=c.dir*1.3*dt;if((finish-c.lat)*c.dir<=0){c.lat=finish;c.active=false;c.dir*=-1;c.wait=18;}}
  c.group.position.copy(point(c.s,c.lat));c.group.position.y+=.035;c.group.rotation.y=sample(c.s).heading+c.dir*Math.PI/2;c.group.visible=Math.abs(c.s-subjectS)<350;
  if(c.group.visible)posePedestrian(c.group,c.active?1.3*dt:0,dt);
  if(c.active&&c.group.visible)contact(c.group,.5,.5,1.8,'Pedestrian');
 }
 for(const c of cyclists){let stop=c.s+c.dir*1e6;
  for(const j of [...JUNCTIONS,...UNDERPASSES].filter(j=>!CYCLE_BRIDGES.includes(j))){const dist=(j.s-c.s)*c.dir,line=j.s-c.dir*(j.halfWidth+2);if(dist>0&&(line-c.s)*c.dir>=0&&traffic.some(t=>t.junction===j&&Math.abs(t.lat-cycleOffset(j.s))<(t.v>.2?25:t.length/2+1)))stop=c.dir===1?Math.min(stop,line):Math.max(stop,line);}
  const move=approachStep(c.s,c.v,c.dir,4.2,stop,dt);c.s=move.position;c.v=move.speed;c.liftHeight=cycleBridgeHeight(c.s);if(c.s>LENGTH-4||c.s<4){c.dir*=-1;c.v=0;}
  poseCyclist(c,dt);
  const r=cycleSample(c.s);c.group.position.set(r.x+r.lx*c.dir*.85,0,r.z+r.lz*c.dir*.85);c.group.position.y=r.groundY+(c.liftHeight??cycleBridgeHeight(c.s))+.035;c.group.rotation.y=r.heading+(c.dir===1?0:Math.PI);c.group.visible=Math.abs(c.s-subjectS)<400;
 }
 // Plaza strollers pace at up to 1.3 m/s; stride matches their real movement.
 for(const p of plazaPeople){const t=state.time*.65+p.phase,stroll=state.time*.18+p.phase,r=sample(p.s),walk=p.dancing?0:Math.sin(stroll)*7,lat=p.lat+(p.dancing?Math.cos(t*1.7)*1.2:0);p.group.position.copy(point(p.s+walk,lat));p.group.position.y=r.groundY+.32+(p.dancing?Math.max(0,Math.sin(t*3))*.18:0);p.group.rotation.y=p.dancing?t*.7:r.heading+(Math.cos(stroll)<0?Math.PI:0);p.group.visible=Math.abs(STOPS[1].s-subjectS)<520;if(p.group.visible)posePedestrian(p.group,(p.dancing?1.1:Math.abs(Math.cos(stroll))*7*.18)*dt,dt);}
}

const travelDirection=()=>state.returning?-1:1;
const stopCentre=(st,dir=travelDirection())=>st.s+(st.platforms?.find(p=>p.side===dir)?.centerOffset||0);
const stopTarget=(st,dir=travelDirection())=>stationStopTarget(st,dir);
function dockError(st){
 const dir=travelDirection(),centre=point(stopCentre(st)),frame=sample(st.s),doors=[],side=vehicle.flipped?-1:1;
 for(const d of vehicle.doors.filter(d=>d.side===side)){const pos=d.node.parent.localToWorld(d.base.clone()),delta=pos.clone().sub(centre),along=delta.x*frame.tx+delta.z*frame.tz,lateral=(delta.x*frame.lx+delta.z*frame.lz)*dir;doors.push({along,lateral,floor:pos.y-sample(stopCentre(st)+along).y});}
 const error=Math.abs(state.s-stopTarget(st)),maxGap=Math.max(...doors.map(d=>Math.abs(7.05-d.lateral)));
 return {valid:state.doorSide===side&&doorsFit(doors,{length:st.length||89.6},1)&&error<=8,maxGap,error,doors};
}
// ---- Driving HUD: timetable, service board, coaching, fast-forward and stop markers. ----
const round5=t=>Math.round(t/5)*5,setHTML=(el,html)=>{if(el.__html!==html){el.__html=html;el.innerHTML=html;}};
function clockText(t){const [h,m]=(SCENARIOS[state.condition]?.time||'22:30').split(':').map(Number),x=((Math.floor(h*3600+m*60+t)%86400)+86400)%86400;return [x/3600|0,(x/60|0)%60,x%60].map(n=>String(n).padStart(2,'0')).join(':');}
// Timetable calibration (2026-09-22): 11 headless clean-cruise autopilot runs (desktop cruise 39/30 km/h north, 32 km/h branch drive south; doors opened on stopping,
// closed when boarding completes, departure as soon as they lock) over signal phase offsets 0-35 s, 2 s crew reaction, rain and signals disabled.
// RUN = slowest measured stop-to-stop run (s) arriving at each stop; the up-to-40 s spread is red phases at Crossing road/D6 and trams queued ahead.
// Segment = RUN x 1.12 and dwell = required dwell + 8 s door handling (+ ramp/request), each rounded to 5 s, so a clean cruise arrives a little early at every stop.
// The first departure allows 15 s extra to settle in. Each departure re-tightens the next due time to min(planned, departure + segment), so lateness carries forward but early running is not banked.
const RUN={1:[0,93,74,83,74,104,122],'-1':[110,89,73,71,100,142,0]};
const dwellFor=(k,dir)=>(k===journeyTerminus(STOPS,dir)?18:(state.condition==='rain'?10:6)+k*.3)+8+(state.mode==='access'&&k%2===0?6:0)+(state.mode==='priority'&&k%2===1?5:0);
function makeSchedule(){state.schedule=[];state.nextDue=null;if(!['service','access','priority'].includes(state.mode)||!STOPS[state.index])return;const dir=travelDirection(),end=journeyTerminus(STOPS,dir),here=Math.abs(stopTarget(STOPS[state.index])-state.s)<30,origin=here?state.index:state.index-dir;let t=state.time,pos=state.s;
 for(let k=origin;STOPS[k];k+=dir){const st=STOPS[k];if(k===origin)state.schedule.push({id:st.id,index:k,arrive:t,depart:t+=here?round5(dwellFor(k,dir))+15:10,origin:true});else{const target=stopTarget(st),run=RUN[dir][k]*Math.min(1,Math.abs(target-pos)/Math.abs(target-stopTarget(STOPS[k-dir])));const segment=round5(run*1.12),dwell=round5(dwellFor(k,dir));state.schedule.push({id:st.id,index:k,segment,dwell,planned:t+segment,arrive:t+=segment,depart:t+=dwell});pos=target;}if(k===end)break;}}
// Coaching state machine: exactly one next action in plain words, naming keyboard keys or touch buttons ('mobile').
function coach(st,d,loop,explore){const m=(k,t)=>mobile?t:k,stopped=Math.abs(state.v)<.1,doorsOpen=state.door>.01||state.doorTarget>0,dir=travelDirection();
 if(state.crashed)return [m('Collision · press Y (Recover vehicle) to return to the road','Collision · tap Recover vehicle to return to the road'),1];
 if(loop)return state.loopDone?['Loop complete',0]:state.park?[m('Release the brake (Space), then drive (W) or cruise (V)','Tap Go to start the loop'),1]:['Follow the Nai Wai loop and stop at the completion marker',0];
 if(state.depotRoute)return stopped&&state.park?[m(state.depotOutbound?'Choose the exit ([ left · ] right), then release the brake (Space)':'In the depot · press K to change cab, then choose an exit','In the depot · tap Change cab, then choose an exit'),1]:['Depot route · follow the guidance',0,'depot'];
 if(st&&!explore){
  const terminus=state.index===journeyTerminus(STOPS,dir),ack=state.mode==='priority'&&state.index%2===1&&!state.requestAck;
  if(state.phase==='terminus')return [m('Terminus · press K to change cab for the return trip','Terminus · tap Change cab for the return trip'),1];
  if(state.phase==='boarding'&&!doorsOpen)return [m(`Boarding interrupted · ${dockError(st).valid?'press E to reopen the doors':'return to the stop mark, then press E'}`,`Boarding interrupted · ${dockError(st).valid?'tap Doors to reopen them':'return to the stop mark, then tap Doors'}`),1];
  if(state.phase==='boarding')return state.mode==='access'&&state.index%2===0&&state.ramp<.98?['Deploy the boarding ramp (B)',1]:[`Passengers ${terminus?'alighting':'boarding'} · ${Math.min(99,Math.floor(state.dwell/(state.requiredDwell||1)*100))}% · keep the doors open`,1,'boarding'];
  if(state.phase==='departure')return state.ramp>.01?['Retract the ramp (B), then close the doors',1]:state.hold>0?[`Hold for departure clearance · ${Math.ceil(state.hold)} s`,1,'hold']:[m('Boarding complete · press E to close the doors','Boarding complete · tap Doors to close them'),1];
  const e=dockError(st),near=d<60&&d>-45,off=`${Math.abs(d).toFixed(1)} m ${d>0?'short of':'past'} the stop mark`,wrongSide=state.doorSide!==(vehicle.flipped?-1:1);
  if(doorsOpen){
   if(e.valid)return ack?['Acknowledge the passenger request (Q)',1]:['Doors opening · passenger exchange starts',0];
   if(!near)return [m('Doors are open away from a platform · press E to close them','Doors are open away from a platform · tap Doors to close them'),1];
   if(wrongSide)return ['Doors are open on the wrong side · press E to close them, then X to switch sides',1];
   if(e.error<=8)return [m('Doors are open but the vehicle is not against the platform · close them (E), then steer closer (A/D) or turn on guidance (G)','Doors are open but the vehicle is not against the platform · tap Doors to close them'),1];
   return [`Doors are open but you are ${off} · ${m(`close the doors (E) and ${d>0?'move forward (W)':'reverse (R)'}`,`tap Doors to close them, then ${d>0?'tap Go to move up':'tap Go to continue'}`)}`,1,'doors-off'];
  }
  if(stopped&&near){
   const where=Math.abs(d)<=.5?'On the stop mark':`Within the stop zone (${off})`;if(e.valid)return ack?[`${where} · acknowledge the request (Q), then open the doors (E)`,1]:[`${where} · ${m('press E to open the doors','tap Doors to open them')}`,1,'on-mark'];
   if(state.cruise&&!state.park)return [`Cruise is holding for ${holdReason()} · it moves up to the mark when clear`,0,'hold'];
   if(wrongSide)return ['Door side is set to the wrong platform · press X to switch',1];
   if(e.error<=8)return [m('Not against the platform · steer closer (A/D) or turn on guidance (G)','Not against the platform · tap Go to realign'),1];
   return [`Stopped ${off} · ${d>0?m(`${state.park?'release the brake (Space) and ':''}creep forward (W)`,'tap Go to move up to the mark'):m(`${state.park?'release the brake (Space) and ':''}reverse (R)`,'tap Go to continue · this stop will be missed')}`,1,'off-mark'];
  }
  if(!stopped&&d<=300&&d>-8)return state.cruise?[`Cruise stops at the STOP board · ${Math.max(0,d).toFixed(0)} m · then open the doors`,0,'approach-cruise']:[m(`Brake (S) to stop at the STOP board · ${Math.max(0,d).toFixed(0)} m`,`Stop at the STOP board · ${Math.max(0,d).toFixed(0)} m`),1,'approach'];
 }
 if(doorsOpen)return [m('Close the doors (E) before driving','Tap Doors to close them before driving'),1];
 if(stopped&&state.cruise&&!state.park)return [`Cruise is holding for ${holdReason()}`,0,'hold'];
 if(stopped)return [m(state.park?'Release the parking brake (Space), then drive (W) or cruise (V) · F does both':'Drive forward (W) or engage cruise (V)','Tap Go or raise the speed dial to depart'),1,'depart'];
 return state.cruise?[st&&!explore?`Cruise is driving · ${st.name} in ${Math.max(0,d).toFixed(0)} m`:'Cruise is driving',0,'cruise']:[m('W accelerate · S brake · A/D steer · V cruise','Tap Go to drive'),0,'manual'];
}
const playerYields=c=>c.active&&crosserInPath(c.lat,c.dir,state.lat);
function holdReason(){const dir=travelDirection();if(signalObjects.some(g=>!g.underpass&&signalAt(g)!=='go'&&(g.centre-state.s)*dir>0&&(g.centre-state.s)*dir<80))return 'the red signal';if(crossers.some(c=>playerYields(c)&&(c.s-state.s)*dir>0&&(c.s-state.s)*dir<60))return 'crossing pedestrians';return 'the vehicle ahead';}
// Service board (Densha de Go style): stopping/passing banner, stop-mark distance and precision bar, clock, timetable and load.
function serviceBoard(st,d,loop,explore){const service=!loop&&!explore&&!state.depotRoute&&state.mode!=='free'&&!!st,dir=travelDirection(),due=state.nextDue,banner=$('#stop-banner'),ahead=x=>(stopTarget(x,dir)-state.s)*dir,skip=service&&STOPS.find(x=>state.skipped.includes(x.id)&&ahead(x)>-10&&ahead(x)<300),stopping=service&&state.phase==='approach'&&d<=300&&d>-8;
 $('#board').hidden=!service;$('#next-distance').hidden=service;banner.hidden=!(skip||stopping);$('#next').hidden=!banner.hidden;banner.classList.toggle('pass',!!skip);
 if(skip)setHTML(banner,`<b>${skip.zh}站 通過</b><small>Passing ${skip.name} · skipped</small>`);else if(stopping)setHTML(banner,`<b>${st.zh}站 停車</b><small>Stopping at ${st.name}${state.index===journeyTerminus(STOPS,dir)?' · terminus':''}</small>`);
 if(!service)return;
 // Grade the stop only once the vehicle has settled (or run past the mark); while still rolling in, the bar shows where the nose is without crying 'TOO SHORT'.
 const late=!!due&&due.left<0,off=-d,precise=Math.abs(d)<=30,settled=Math.abs(state.v)<1.5||off>=0,grade=!settled?'near':Math.abs(off)<=.5?'perfect':Math.abs(off)<=2?'good':Math.abs(off)<=8?'ok':'off';
 $('#clock-now').textContent=clockText(state.time);$('#clock-due').textContent=due?`${due.kind==='depart'?'DEP':'ARR'} ${clockText(due.due)}`:'';
 const narrow=innerWidth<480;$('#time-cell').classList.toggle('late',late);$('#time-label').textContent=late?'遲 LATE':due?.kind==='depart'?(narrow?'發車 DEPART':'發車 DEPART IN'):(narrow?'尚餘 TIME':'尚餘 TIME LEFT');$('#mark-label').textContent=narrow?'停車位置 STOP':'停車位置 STOP MARK';$('#time-left').textContent=due?`${late?'−':''}${Math.abs(Math.round(due.left))} s`:'—';
 $('#precision').hidden=!precise;$('#mark-cell').dataset.grade=precise?grade:'';$('#stop-mark').textContent=precise&&settled?`${off>=.05?'+':off<=-.05?'−':'±'}${Math.abs(off).toFixed(1)} m`:d<0?`${Math.round(-d)} m past`:d>=1000?`${(d/1000).toFixed(2)} km`:`${Math.round(d)} m`;
 if(precise){$('#precision i').style.left=`${50+clamp(off,-10,10)*5}%`;$('#precision-label').dataset.grade=grade;$('#precision-label').textContent=grade==='near'?'STOP AHEAD':grade==='perfect'?'PERFECT':grade==='good'?'GOOD':grade==='ok'?(off<0?'SHORT':'OVER'):off<0?'TOO SHORT':'TOO FAR';}
 $('#onboard').textContent=state.pax;
}
// The stack follows the service board; an expanded map pushes it aside (wide screens) or below the map (narrow ones).
function placeStack(){const a=$('#next-panel').getBoundingClientRect(),b=$('#map-button').getBoundingClientRect(),open=document.body.classList.contains('map-expanded'),beside=open&&innerWidth-b.right>=380;stack.style.marginLeft='';stack.style.marginLeft=beside?Math.max(0,b.right+8-stack.getBoundingClientRect().left)+'px':'';stack.style.top=Math.round(open?(beside?a.top:b.bottom+8):Math.max(a.bottom,b.bottom)+8)+'px';}
let ffRate=1;
// Fast-forward multiplies simulation substeps only; it holds 1× near stops and non-green signals, and whenever the driver must act.
function ffBlock(){if(state.screen!=='driving')return 'paused';if(['free','turnback'].includes(state.mode)||state.depotRoute)return 'not available here';if(state.crashed)return 'recover the vehicle first';if(!state.cruise)return mobile?'tap Go to drive first':'needs cruise control (V or F)';if(state.park||state.door>.01||state.doorTarget)return 'close the doors and release the brake first';
 const dir=travelDirection(),st=STOPS[state.index],explore=state.mode==='explore'||!st,target=explore?(dir===1?END_STOP:35):stopTarget(st);if((target-state.s)*dir<250)return explore?'approaching the end of the line':`approaching ${st.name}`;
 if(signalObjects.some(g=>{if(g.underpass||signalAt(g)==='go')return false;const x=((dir===1?g.s:g.centre+g.stop)-state.s)*dir;return x>-2&&x<250;}))return 'signal ahead';return '';}
// Layout self-check (debug hook): visible HUD panels/controls whose boxes intersect each other or leave the viewport.
function hudOverlaps(){const els=[...document.querySelectorAll('#map-button,#next-panel,#instruction,#toast,#edge-tools>button,#clean-view,#route-choices>button,#speed-dial,#mobile-buttons>button,#cluster,#dwell,#joystick,#touch-pad>button')].filter(el=>el.checkVisibility({checkOpacity:true,checkVisibilityCSS:true})&&el.getBoundingClientRect().width>0),name=el=>el.id||el.dataset.action,out=[];
 for(const [i,el] of els.entries()){const a=el.getBoundingClientRect();if(a.left<0||a.top<0||a.right>innerWidth||a.bottom>innerHeight)out.push([name(el),'viewport']);for(const other of els.slice(i+1)){const b=other.getBoundingClientRect();if(a.left<b.right-.5&&b.left<a.right-.5&&a.top<b.bottom-.5&&b.top<a.bottom-.5)out.push([name(el),name(other)]);}}return out;}
// 停車位置 boards and painted stop marks at every station and direction, on the nose line of a correctly docked vehicle.
function markTexture(draw,w,h){const c=document.createElement('canvas');c.width=w;c.height=h;draw(c.getContext('2d'));const t=new T.CanvasTexture(c);t.colorSpace=T.SRGBColorSpace;t.anisotropy=8;return t;}
function makeStopMarkers(){const cjk='"PingFang HK","Noto Sans CJK TC","Microsoft JhengHei",sans-serif';
 const sign=markTexture(x=>{x.fillStyle='#161616';x.fillRect(0,0,256,320);x.fillStyle='#ffd21a';x.fillRect(14,14,228,292);x.fillStyle='#161616';x.textAlign='center';x.font='bold 176px '+cjk;x.fillText('停',128,198);x.font='bold 66px Arial,sans-serif';x.fillText('STOP',128,286);},256,320);
 const paint=markTexture(x=>{x.fillStyle='#f4f4ee';x.fillRect(0,26,256,40);x.strokeStyle=x.fillStyle='#ffcf1f';x.lineWidth=14;x.strokeRect(34,86,188,284);x.beginPath();x.moveTo(128,104);x.lineTo(188,180);x.lineTo(68,180);x.closePath();x.fill();x.textAlign='center';x.font='bold 120px '+cjk;x.fillText('停',128,330);},256,384);
 const face=new T.MeshStandardMaterial({map:sign,emissive:0xffffff,emissiveMap:sign,emissiveIntensity:.25,roughness:.55}),back=new T.MeshStandardMaterial({color:0x68716d,roughness:.7}),steel=new T.MeshStandardMaterial({color:0x4b5551,roughness:.45,metalness:.5}),road=new T.MeshStandardMaterial({map:paint,emissive:0xffffff,emissiveMap:paint,emissiveIntensity:.12,transparent:true,roughness:.85,depthWrite:false,polygonOffset:true,polygonOffsetFactor:-4,polygonOffsetUnits:-4});
 const board=new T.BoxGeometry(1.2,1.5,.05),post=new T.CylinderGeometry(.05,.055,2.8,12),mark=new T.PlaneGeometry(3,4.5);
 STOPS.forEach((st,i)=>{for(const dir of [1,-1]){const s=stopTarget(st,dir)+dir*NOSE,r=sample(s),g=new T.Group();g.name=`Stop mark ${st.id} ${dir===1?'northbound':'southbound'}`;g.position.set(r.x,r.y,r.z);g.rotation.set(Math.atan(r.grade)*dir,r.heading+(dir===1?0:Math.PI),0,'YXZ');
  // Local frame: −z is the travel direction and −x the platform side; the board toes in towards the approaching cab.
  const pole=new T.Mesh(post,steel),panel=new T.Mesh(board,[back,back,back,back,face,back]),line=new T.Mesh(mark,road);pole.position.set(-7.75,1.71,0);panel.position.set(-7.75,2.45,.06);panel.rotation.y=.3;line.rotation.x=-Math.PI/2;line.position.set(-Math.abs(laneOffset(s,dir)),.018,1.734);line.renderOrder=2;
  for(const n of [pole,panel])n.castShadow=true;line.receiveShadow=true;g.add(pole,panel,line);stations[i].root.attach(g);}});
}

const headlights=[-1,1].map(side=>{const light=new T.SpotLight(0xe5efff,0,65,.4,.6,1.5);light.userData.side=side;scene.add(light,light.target);return light;});
function weather(){const rain=state.condition==='rain',night=state.condition==='night';atmosphere.setCondition(state.condition);sun.castShadow=!night;// moonlight (0.12) shadows are barely visible but re-render the whole scene into a 4096² map every frame
 environment.weather(rain);environment.setNight(night);railway?.setNight(night);environment.markingMaterial.emissive.set(0xece8d3);environment.markingMaterial.emissiveIntensity=night?.22:0;for(const m of environment.nightMaterials){m.emissive.copy(m.color);m.emissiveIntensity=night?.8:0;}setInteriorLighting(night);for(const station of stations)setBillboardLighting(station.root,night);for(const actor of [...traffic,...cyclists])actor.group.traverse(n=>{if(n.isMesh&&['light','red'].includes(n.material?.name)){n.material.emissive.copy(n.material.color);n.material.emissiveIntensity=night?4:.35;}});$('#night').textContent=night?'Day':'Night';}
function setInteriorLighting(night){for(const tram of [vehicle,...ai,...depotVehicles].filter(Boolean)){const level=tram.isDepot?.18:1.35;for(const section of tram.sections)section.traverse(n=>{if(n.name==='Passenger ceiling light')n.intensity=night?16*level:0;if(n.name==='Interior ceiling LED'){n.visible=night;n.material.color.setHex(tram.isDepot?0x625f58:0xfff0da);}if(n.name==='Interior light spill')n.visible=night&&!tram.isDepot;if(!n.isMesh||!n.material?.emissive)return;const m=n.material;if(m.name==='glass'){m.transparent=true;m.opacity=night?.32:.92;m.depthWrite=false;m.emissive.set(night?0x8b9b8d:0);m.emissiveIntensity=night?.15*level:0;}else if(m.name==='cabin_led'){m.emissive.set(0xffeed5);m.emissiveIntensity=night?3*level:0;}else if(!['light','red','led_orange'].includes(m.name)){m.emissive.copy(m.color);m.emissiveIntensity=night?(n.parent?.name.startsWith('passenger_interior')?.48:m.name==='blue'||m.name==='yellow'?.5:.11)*level:0;}});}
 for(const station of stations)station.root.traverse(n=>{if(n.name==='Station canopy LED')n.visible=night;if(n.isMesh&&n.material?.emissive&&n.material.name!=='light'){n.material.emissive.copy(n.material.color);n.material.emissiveIntensity=night?(n.material.name.startsWith('sign_text')?1.8:.12):(n.material.name.startsWith('sign_text')?.25:0);}});
}
// ponytail: two nearby headlight sources bound mobile GPU cost; distant actors retain emissive lamps.
const roadHeadlights=Array.from({length:2},()=>{const l=new T.SpotLight(0xe8f1ff,0,45,.48,.65,1.3);l.name='Other vehicle headlight';scene.add(l,l.target);return l;});
function lightRoadUsers(night){
 const candidates=[...traffic.map(c=>({root:c.group,length:c.length})),...cyclists.map(c=>({root:c.group,length:1.2,bike:true})),...ai.filter(a=>a.active).map(a=>({root:a.sections[0],length:11})),...(railway?.trains||[]).map(t=>({root:t.cars[0].root,length:24}))].filter(c=>c.root.visible).sort((a,b)=>a.root.position.distanceToSquared(camera.position)-b.root.position.distanceToSquared(camera.position));
 roadHeadlights.forEach((light,i)=>{const c=candidates[i];light.intensity=night&&c?(c.bike?24:180):0;if(!night||!c)return;c.root.updateWorldMatrix(true,false);light.position.copy(c.root.localToWorld(new T.Vector3(0,c.bike?1.05:.9,-c.length/2-.08)));light.target.position.copy(c.root.localToWorld(new T.Vector3(0,.03,-c.length/2-22)));});
}
// ponytail: six nearby unshadowed lamps bound GPU cost; pavement glow remains for distant lamps.
const streetLights=Array.from({length:6},()=>{const light=new T.PointLight(0xffe4bb,0,30,2);light.name='Local street illumination';scene.add(light);return light;});
function lightStreetObjects(night){
 if(mobile||!night){streetLights.forEach(light=>light.intensity=0);return;}
 const lamps=environment.lampPositions.map(p=>({p,d:camera.position.distanceTo(p)})).filter(q=>q.d<140),fade=lampFade(lamps.map(q=>q.d),streetLights.length);
 const lit=lamps.map((q,i)=>({...q,k:fade[i]})).filter(q=>q.k>0).sort((a,b)=>a.d-b.d);
 streetLights.forEach((light,i)=>{const q=lit[i];if(!q){light.intensity=0;return;}const p=q.p,h=Math.max(1,p.y-sample(project(p.x,p.z)).groundY);light.position.set(p.x,p.y-.15,p.z);light.distance=Math.min(36,Math.max(12,h*2.8));light.intensity=Math.min(160,8*h)*q.k;});}
// Keep the nighttime shader light count stable; moving lamps change intensity, not visibility.
function lightScene(){const night=state.condition==='night';if(night){lightRoadUsers(true);lightStreetObjects(true);}for(const l of headlights){l.intensity=night&&state.mode!=='free'?120:0;if(vehicle){l.position.copy(vehicle.sections[0].localToWorld(new T.Vector3(l.userData.side*.85,1,-5.4)));l.target.position.copy(vehicle.sections[0].localToWorld(new T.Vector3(l.userData.side*1.5,.1,-45)));}}scene.traverse(n=>{if(n.isLight&&n!==sun&&n!==ambient){if(!night)n.intensity=0;n.visible=night&&n.name!=='Tuen Ma headlight beam';}});}
$('#night').onclick=()=>{state.condition=state.condition==='night'?'morning':'night';$('#condition').value=state.condition;weather();};
$('#headway').onchange=()=>{state.headway=Number($('#headway').value)===210?210:300;resetStreetLife();const p=fleetPlan(state.headway);toast(`${p.count} running services${p.convoy===2?' · two-vehicle convoys':''}`);};

function reset(mode=$('#mode').value){resetAvatar();audio.cancelAnnouncement();if(vehicle.flipped){vehicle.sections.reverse();vehicle.flipped=false;}vehicle.isAI=false;state.returning=false;state.depotRoute=false;state.depotSelected=false;state.depotOutbound=false;state.depotExitDir=1;state.branchCurve=depotCurve;vehicle.terminal=null;Object.assign(state,{screen:'driving',trip:0,parkingAwarded:[],announced:[],contextSpoken:[],speedSetting:0,mode,condition:$('#condition').value,s:stopTarget(STOPS[0]),v:0,lat:5.4,steer:0,yaw:0,park:true,door:0,doorTarget:0,doorSide:1,ramp:0,rampTarget:0,index:0,phase:'approach',dwell:0,pax:0,score:0,energy:0,regen:0,battery:92,time:0,cruise:false,guide:true,mobileBrake:false,cam:0,indicator:0,accel:0,travel:0,served:[],skipped:[],missed:[],incidents:0,penalties:0,crashed:false,eventLog:[],priority:false,loopS:0,loopDone:false,requestAck:false,hold:0,lastKerb:-10,lastCrash:-10,lastHarsh:-10,speedingT:0,freeSpeed:0,walkTip:false,frameTimes:[],frames:0});$('#speed-control').value=0;$('#target-speed').value=0;keys.clear();vehicle.yaws.fill(0);vehicle.posed=false;resetOrbit();firstCamera=true;walkerObjects.forEach(p=>p.progress=0);resetStreetLife();traffic.forEach((c,i)=>{c.lat=c.start;c.v=0;});signalObjects.forEach(s=>s.passed=false);if(mode==='turnback'){state.loopS=0;state.lat=0;state.s=0;state.park=true;}if(mode==='explore'){state.s=35;state.lat=1.9;}if(mode==='free'){const p=point(35,10);state.s=35;state.lat=1.9;state.freeX=p.x;state.freeY=p.y+3;state.freeZ=p.z;state.freeS=35;state.freeHeading=sample(35).heading;}ffRate=1;state.arrivals=[];makeSchedule();document.body.dataset.mode=mode;weather();show('driving');poseTram(vehicle,state.s,state.lat,false,0,mode==='turnback');audio.initAudio();toast(mode==='turnback'?'Nai Wai loop · release brake and complete a smooth circuit':mode==='explore'?'Explore the line · move mouse to look, scroll to zoom':mode==='free'?'Free roam · WASD move · Shift boost · Space/Ctrl altitude':'Welcome aboard · E to open the left doors at Nai Wai');}
function show(screen){if(screen==='menu')resetAvatar();if(screen!=='driving')document.exitPointerLock?.();state.screen=screen;$('#menu').classList.toggle('hidden',screen!=='menu');$('#hud').classList.toggle('hidden',!['driving','paused'].includes(screen));$('#pause-sheet').classList.toggle('hidden',screen!=='paused');$('#report').classList.toggle('hidden',screen!=='complete');document.body.dataset.screen=screen;for(const el of document.querySelectorAll('#camera,#score-panel,#cluster,#route-strip,#buttons,#dwell'))el.classList.toggle('hidden',state.mode==='free');}
function penalty(message,points=20){state.score=Math.max(0,state.score-points);state.penalties++;(state.eventLog ||= []).push({time:state.time,message,points});toast(message+' −'+points);audio.playWarning();}
// Trilingual like every other announcement: braking/curves use the recorded handrail message.
function announceWarning(key,cooldown=18){state.lastWarnings??={};if(state.time-(state.lastWarnings[key]??-Infinity)<cooldown)return;state.lastWarnings[key]=state.time;audio.announce('handrail');}
function action(name){if(name==='camera'&&state.mode!=='free'){state.cam=(state.cam+1)%CAMERAS.length;resetOrbit();firstCamera=true;toast(CAMERAS[state.cam]);return;}if(name==='sound'){state.muted=!state.muted;audio.setMuted(state.muted);$('#sound').textContent=state.muted?'Sound off':'Sound on';return;}if(name==='pause'){ffRate=1;if(state.screen==='driving')show('paused');else if(state.screen==='paused')show('driving');audio.setDrive(0,false);return;}if(state.screen!=='driving'||state.mode==='free')return;
 switch(name){case'go':if(mobile&&!state.speedSetting){state.speedSetting=30;$('#speed-control').value=30;$('#target-speed').value=30;}if(state.crashed){action('recover');return;}if(tractionLocked({...state,park:false})){toast('Close doors before departure / 請先關門');return;}state.guide=true;state.park=false;state.mobileBrake=false;state.cruise=true;break;
 case'depot':if(state.returning)return;state.depotSelected=!state.depotSelected;toast(state.depotSelected?'Depot route selected · follow the guidance into the apron':'Main line selected');break;
 case'depot-left':case'depot-right':if(Math.abs(state.v)>.05||state.door>.01){toast('Stop and close doors before selecting an exit');return;}if(!state.depotRoute){toast('Choose an exit after driving inside the depot');return;}state.depotExitDir=name==='depot-left'?1:-1;if(state.depotOutbound&&state.park){state.branchCurve=depotExitCurve(vehicle.sections[0].position,state.depotExitDir);state.branchDistance=0;toast('Depot exit selected');return;}action('cab');break;
 case'cab':if(Math.abs(state.v)>.05||state.door>.01){toast('Stop and close doors before changing cab');return;}if(state.depotRoute){if(state.depotOutbound)return;vehicle.sections.reverse();vehicle.flipped=!vehicle.flipped;state.depotOutbound=true;state.branchCurve=depotExitCurve(vehicle.sections[0].position,state.depotExitDir||1);state.branchDistance=0;state.park=true;toast('Opposite cab active · choose exit left to Industry Park or right to Nai Wai');return;}const end=journeyTerminus(STOPS,travelDirection()),st=STOPS[end];if(Math.abs(state.s-stopTarget(st))>75&&!(end===6&&state.s>=END_STOP-35)){toast('Change cab at a terminus or inside the depot');return;}audio.cancelAnnouncement();const oldDir=travelDirection();vehicle.sections.reverse();vehicle.flipped=!vehicle.flipped;state.s-=oldDir*21.2;state.returning=oldDir===1;state.direction=travelDirection();state.index=end+state.direction;state.mode='service';document.body.dataset.mode='service';state.phase='approach';state.trip=(state.trip||0)+1;state.served=[];state.skipped=[];state.missed=[];state.doorSide=vehicle.flipped?-1:1;state.lat=state.returning?returnOffset(state.s):laneOffset(state.s);state.park=true;state.cruise=false;vehicle.isAI=state.returning;vehicle.posed=false;vehicle.trail=null;poseTram(vehicle,state.s,state.lat,state.returning);makeSchedule();toast('Cab changed · next stop '+STOPS[state.index].name);break;
 case'express':{const st=STOPS[state.index];if(!st||st.terminus)return;if((st.s-state.s)*travelDirection()<90){toast('Choose express before the station fork');return;}state.skipped.push(st.id);state.index+=travelDirection();state.phase='approach';toast(st.name+' bypass selected / 不停站');break;}
 case'stop':if(mobile){state.speedSetting=0;$('#speed-control').value=0;$('#target-speed').value=0;}state.cruise=false;state.mobileBrake=true;break;
 case'park':if(!state.park&&Math.abs(state.v)>.3)penalty('Emergency brake applied',5);state.park=!state.park;break;
 case'doors':if(Math.abs(state.v)>.05){toast('Stop before opening doors / 請先停車');return;}if(state.ramp>.01){toast('Retract ramp before closing doors / 請收回斜板');return;}state.park=true;state.doorTarget=1-state.doorTarget;if(!state.doorTarget)audio.announce('doors');audio.playDoors(!!state.doorTarget);
  {const st=STOPS[state.index];if(state.doorTarget&&st&&state.phase==='approach'&&!['explore','turnback'].includes(state.mode)){const e=dockError(st),d=(stopTarget(st)-state.s)*travelDirection();if(!e.valid)toast(Math.abs(d)>=60?'Doors opened away from a platform · close them before driving':e.error>8?`Doors opened ${Math.abs(d).toFixed(1)} m ${d>0?'short of':'past'} the stop mark · close them and move ${d>0?'forward':'back'}`:'Doors opened but not against the platform · close them and realign');}}break;
 case'cruise':state.cruise=!state.cruise;if(state.cruise)state.guide=true;toast(state.cruise?'Cruise on · release the brake; operate doors at each stop':'Cruise off');break;
 case'guide':state.guide=!state.guide;toast(state.guide?'Lane guidance on':'Manual steering / 手動轉向');break;
 case'side':if(state.door>.01)return;state.doorSide*=-1;toast(state.doorSide===1?'Doors: left platform':'Doors: right platform');break;
 case'ramp':if(state.door<.98||Math.abs(state.v)>.05||!state.park){toast('Ramp needs open doors and parking brake');return;}state.rampTarget=1-state.rampTarget;break;
 case'priority':if(state.mode!=='priority'){toast('Priority requests are available in the request challenge');return;}state.requestAck=true;state.priority=true;toast('Request acknowledged · signal clearance still required');break;
 case'recover':if(!state.crashed)return;{const edge=roadSection(state.s);Object.assign(state,{v:0,accel:0,lat:state.mode==='turnback'?0:clamp(1.9,edge.left+1.35,edge.right-1.35),yaw:0,steer:0,park:true,door:0,doorTarget:0,ramp:0,rampTarget:0,cruise:false,crashed:false});vehicle.yaws.fill(0);vehicle.posed=false;rampMesh.visible=false;poseTram(vehicle,state.mode==='turnback'?state.loopS:state.s,state.lat,false,0,state.mode==='turnback');firstCamera=true;toast('Vehicle recovered to the road / 車輛已返回道路');}break;
 case'indicator':state.indicator=(state.indicator+1)%3;audio.setIndicator(state.indicator!==0);break;
 case'ff':{const why=ffBlock();if(why&&ffRate===1){toast('Fast-forward: '+why);return;}ffRate=why?1:ffRate===1?2:ffRate===2?4:1;toast(ffRate>1?`Fast-forward ${ffRate}× · returns to 1× near stops and signals`:'Fast-forward off · 1×');break;}
 }
}
const keyActions={Period:'ff',Space:'park',KeyE:'doors',KeyV:'cruise',KeyG:'guide',KeyC:'camera',KeyP:'pause',KeyY:'recover',KeyF:'go',KeyT:'stop',KeyK:'cab',KeyJ:'depot',KeyL:'express',BracketLeft:'depot-left',BracketRight:'depot-right',KeyM:'sound',KeyB:'ramp',KeyQ:'priority',KeyX:'side',KeyZ:'indicator'};
addEventListener('keydown',e=>{if(['SELECT','INPUT','TEXTAREA'].includes(e.target.tagName)||e.target.isContentEditable)return;if(e.code==='Escape'){document.exitPointerLock?.();keys.clear();return;}if(e.target.tagName==='BUTTON'&&['Space','Enter'].includes(e.code))return;if(e.repeat)return;const shortcuts={KeyO:'#options-button',KeyI:'#map-button',KeyU:'#clean-view',KeyN:'#night'};if(state.screen==='menu'&&e.code==='KeyM'){$('#menu-music').click();return;}if(state.screen==='driving'&&shortcuts[e.code]){e.preventDefault();$(shortcuts[e.code]).click();return;}if(['paused','complete'].includes(state.screen)&&e.code==='Backspace'){e.preventDefault();$((state.screen==='paused'?'#pause-sheet':'#report')+' .menu-return').click();return;}if(state.screen==='complete'&&e.code==='KeyE'&&!$('#explore-tail').classList.contains('hidden')){$('#explore-tail').click();return;}if(options.open)return;if(e.code==='Space'||e.code.startsWith('Arrow'))e.preventDefault();keys.add(e.code);if(e.repeat)return;if(e.code==='Enter'){if(state.screen==='menu'||state.screen==='complete')reset();else if(state.screen==='paused')action('pause');else if(state.screen==='driving')toggleAvatar();}if(e.code==='KeyE'&&state.screen==='driving'&&state.avatar!=='drive'){talk();return;}if(keyActions[e.code]&&(state.mode!=='free'&&state.avatar==='drive'||['pause','sound'].includes(keyActions[e.code])))action(keyActions[e.code]);if(e.code==='KeyH'&&state.mode!=='free'&&state.avatar==='drive')audio.playHorn(true);});
addEventListener('keyup',e=>{keys.delete(e.code);if(e.code==='KeyH')audio.playHorn(false);});addEventListener('blur',()=>{keys.clear();audio.playHorn(false);if(state.screen==='driving'&&!window.__sgmts?.proof)action('pause');});
$('#clean-view').onclick=()=>{const clean=document.body.classList.toggle('clean-view');$('#clean-view').setAttribute('aria-pressed',String(clean));$('#clean-view').setAttribute('aria-label',clean?'Show interface':'Hide interface');$('#clean-view').title=clean?'Show interface':'Hide interface';};
// Touch activation is granted on click/touchend, not the initial pointerdown.
addEventListener('click',()=>audio.initAudio());addEventListener('keydown',()=>audio.initAudio());
$('#menu-music').onclick=async()=>{state.muted=false;audio.setMuted(false);const playing=await audio.initAudio();audio.updateMusic(state);$('#menu-music').textContent=playing?'♫ Menu music on':'♫ Tap to retry music';};
const buttonKeys={'ff':'.','recover':'Y','go':'F','stop':'T','doors':'E','park':'Space','cruise':'V','guide':'G','ramp':'B','priority':'Q','express':'L','depot':'J','cab':'K','depot-left':'[','depot-right':']'};
for(const b of document.querySelectorAll('[data-action]'))if(buttonKeys[b.dataset.action]){const key=buttonKeys[b.dataset.action];b.title=(b.getAttribute('aria-label')||b.firstChild.textContent).trim()+' · '+key;b.setAttribute('aria-keyshortcuts',key);}
for(const b of document.querySelectorAll('#route-choices [data-action]'))b.insertAdjacentHTML('beforeend',` <kbd>${buttonKeys[b.dataset.action]}</kbd>`);
for(const [sel,key] of [['#resume','Enter'],['#pause-sheet .menu-return','⌫'],['#report .menu-return','Enter / ⌫'],['#explore-tail','E'],['#begin','Enter']])$(sel).insertAdjacentHTML('beforeend',` <kbd>${key}</kbd>`);
for(const [id,key] of Object.entries({'camera':'C','pause':'P','options-button':'O','map-button':'I','clean-view':'U','night':'N','sound':'M','menu-music':'M'})){$('#'+id).title=($('#'+id).getAttribute('aria-label')||$('#'+id).textContent.trim())+' · '+key;$('#'+id).setAttribute('aria-keyshortcuts',key);}
$('#begin').onclick=()=>reset();$('#resume').onclick=()=>action('pause');$('#pause').onclick=()=>action('pause');$('#camera').onclick=()=>action('camera');$('#sound').onclick=()=>action('sound');document.querySelectorAll('[data-action]').forEach(el=>el.onclick=()=>{action(el.dataset.action);if(el.closest('dialog'))options.close();});document.querySelectorAll('.menu-return').forEach(el=>el.onclick=()=>{keys.clear();state.v=0;audio.setDrive(0,false);audio.cancelAnnouncement();state.s=stopTarget(STOPS[1]);state.lat=5.4;show('menu');});$('#explore-tail').onclick=()=>{state.mode='explore';state.park=true;show('driving');toast('Explore the elevated section beyond Industry Park');};$('#condition').onchange=()=>{state.condition=$('#condition').value;weather();};
function finish(){$('#report h1').textContent='Journey complete.';$('#explore-tail').classList.remove('hidden');state.v=0;state.park=true;let count=state.served.length,grade=state.mode==='turnback'?(state.loopDone?'A':'—'):count===7&&state.penalties<3?'A':count>=5?'B':'C';$('#report-grade').textContent=grade;let best=0;try{best=Math.max(Number(localStorage.getItem('sgmts-drawing-best')||0),state.score);localStorage.setItem('sgmts-drawing-best',String(best));}catch{}
 $('#report-data').innerHTML=[['Stations served',`${count} / 7`],['Journey time',`${Math.floor(state.time/60)}m ${Math.floor(state.time%60)}s`],['Energy used',state.energy.toFixed(2)+' kWh'],['Regeneration',state.regen.toFixed(2)+' kWh'],['Passenger load',state.pax],['Service score',state.score],['Personal best',best],['Penalties',state.penalties]].map(([a,b])=>`<div><span>${a}</span><b>${b}</b></div>`).join('');show('complete');audio.setDrive(0,false);}
function service(dt){if(['explore','turnback'].includes(state.mode))return;const st=STOPS[state.index];if(!st)return;
 const dir=travelDirection(),target=stopTarget(st),distance=(target-state.s)*dir,error=dockError(st),aligned=error.valid,terminus=state.index===journeyTerminus(STOPS,dir);
 const key=`${state.trip||0}:${state.index}`;state.parkingAwarded??=[];state.announced??=[];
 const entry=state.schedule?.find(e=>e.index===state.index),atStop=state.phase!=='approach'||entry?.origin&&Math.abs(distance)<8,due=atStop?entry?.depart:entry?.arrive;state.nextDue=entry&&state.phase!=='terminus'?{id:st.id,kind:atStop?'depart':'arrive',due,left:due-state.time}:null;
 if(state.phase==='approach'&&distance>12&&distance<Math.max(160,Math.abs(state.v)*22)&&!state.announced.includes(key)){state.announced.push(key);audio.announce(`next-${st.id}${terminus?'-terminus':''}`).then(played=>{if(!played)state.announced=state.announced.filter(k=>k!==key);});}

 if(state.park&&Math.abs(state.v)<.08&&aligned&&!state.parkingAwarded.includes(key)){const points=parkingScore(error.error,true);state.score+=points;state.parkingAwarded.push(key);toast(`Good stop · +${points} · ${st.name}`);}
 if(distance < -45&&state.phase==='approach'){state.missed.push(st.id);penalty('Missed '+st.name,100);if(terminus){state.phase='terminus';state.v=0;state.park=true;}else state.index+=dir;state.dwell=0;return;}
 if(state.phase==='approach'&&Math.abs(state.v)<.08&&state.park&&aligned&&state.door>.98){
  if(state.mode==='priority'&&state.index%2===1&&!state.requestAck){toast('Q · acknowledge the passenger request');return;}
  if(!entry?.origin)(state.arrivals??=[]).push({id:st.id,trip:state.trip||0,due:entry?.arrive,actual:state.time,late:entry?state.time-entry.arrive:0});
  state.phase='boarding';state.dwell=0;state.requiredDwell=terminus?18:(state.condition==='rain'?10:6)+state.index*.3;audio.playChime();if(terminus)audio.announce('arrived-'+st.id);else if(state.mode==='access')audio.announce('gap');else if(state.pax>80)audio.announce('alight');
 }
 if(state.phase==='boarding'){
  const rampNeeded=state.mode==='access'&&state.index%2===0;
  if(aligned&&state.park&&state.door>.98&&Math.abs(state.v)<.08&&(!rampNeeded||state.ramp>.98))state.dwell+=dt;
  if(state.dwell>=state.requiredDwell){state.phase='departure';state.pax=terminus?0:Math.min(180,Math.round(state.pax*.7)+12+state.index*3);state.hold=state.mode==='priority'?3:0;if(state.pax>120&&!state.contextSpoken.includes('lean')){state.contextSpoken.push('lean');audio.announce('lean');}audio.playDeparture();}
 }
 if(state.phase==='departure'){
  state.hold=Math.max(0,state.hold-dt);
  if(state.door<.01&&state.ramp<.01&&state.hold===0){state.served.push(st.id);state.requestAck=false;state.priority=false;state.score+=20;if(terminus){state.phase='terminus';state.park=true;state.cruise=false;toast(st.name+' terminus · Change cab for the return service');}else{state.index=nextStationIndex(state.index,dir,STOPS.length);state.phase='approach';const next=state.schedule?.find(e=>e.index===state.index);if(next?.segment){next.arrive=Math.min(next.arrive,state.time+next.segment);next.depart=Math.min(next.depart,next.arrive+next.dwell);}toast(st.name+' served · depart when ready');}}
 }
}

const viewS=()=>state.avatar!=='drive'?player.s:state.mode==='free'?state.freeS:state.s;
function updateFree(dt){
 const forward=(keys.has('KeyW')||keys.has('ArrowUp')?1:0)-(keys.has('KeyS')||keys.has('ArrowDown')?1:0),strafe=(keys.has('KeyA')||keys.has('ArrowLeft')?1:0)-(keys.has('KeyD')||keys.has('ArrowRight')?1:0),lift=(keys.has('Space')?1:0)-(keys.has('ControlLeft')||keys.has('ControlRight')?1:0),speed=keys.has('ShiftLeft')||keys.has('ShiftRight')?65:18;
 const moving=forward||strafe||lift,motion=freeStep(state.freeX,state.freeY,state.freeZ,state.freeHeading+orbit.yaw,forward,strafe,lift,speed,dt);state.freeX=motion.x;state.freeY=motion.y;state.freeZ=motion.z;state.freeS=clamp(project(motion.x,motion.z,state.freeS),0,LENGTH);state.freeY=Math.max(state.freeY,sample(state.freeS).groundY+1.2);state.freeSpeed=moving?speed:0;audio.setDrive(0,false);
}
function update(dt){state.time+=dt;let onLoop=state.mode==='turnback',p=sample(state.s),v0=state.v,lat0=state.lat;
 if(state.mode==='free'){updateFree(dt);return;}
 if(state.returning||state.depotRoute){updateBranch(dt);if(!state.depotRoute)service(dt);return;}
 if(state.depotSelected&&state.s>=DEPOT.s-45&&state.s<DEPOT.s){state.depotRoute=true;state.branchCurve=depotCurve;state.depotOutbound=false;state.branchDistance=0;state.mode='explore';updateBranch(dt);return;}
 let accel=keys.has('KeyW')||keys.has('ArrowUp'),brake=state.mobileBrake||keys.has('KeyS')||keys.has('ArrowDown'),reverse=keys.has('KeyR');
 if(reverse)accel=false;if(accel||brake||reverse)state.cruise=false;
 const next=STOPS[state.index],target=next?stopTarget(next):LENGTH,limit=(next&&Math.abs(target-state.s)<130)?30:40;
 if(state.cruise){let desired=(mobile?Math.min(state.speedSetting??0,onLoop?12:50):onLoop?12:limit-1)/3.6,decel=state.condition==='rain'?.72:.95;
  if(next&&!['explore','turnback'].includes(state.mode)&&target-state.s>-8)desired=Math.min(desired,Math.sqrt(2*decel*Math.max(0,target-state.s-.15)));
  if(state.depotSelected)desired=Math.min(desired,Math.sqrt(16+2*decel*Math.max(0,DEPOT.s-45-state.s)));
  const sig=nextSignal();if(sig&&(signalAt(sig)!=='go'||((state.time+sig.offset)%42+42)%42+Math.max(3,state.v/decel)>25))desired=Math.min(desired,Math.sqrt(2*decel*Math.max(0,sig.s-state.s-8)));
  const pedestrian=crossers.filter(c=>playerYields(c)&&c.s-state.s>0).sort((a,b)=>a.s-b.s)[0];if(pedestrian&&!onLoop)desired=Math.min(desired,Math.sqrt(2*decel*Math.max(0,pedestrian.s-state.s-9)));
  if(!onLoop)desired=Math.min(desired,Math.sqrt(2*decel*Math.max(0,followingStop(state.s,1,ai)-state.s)));
  if(onLoop)desired=Math.min(desired,Math.sqrt(2*.8*Math.max(0,LOOP.length-state.loopS-1)));
  if(state.mode==='explore')desired=Math.min(desired,Math.sqrt(2*.8*Math.max(0,END_STOP-state.s)));
  cruiseTarget=desired;accel=state.v<desired-.15;brake=state.v>desired+.1;
  if(desired<.1&&Math.abs(state.v)<.22)state.v=0;
 }
 state.door=smooth(state.door,state.doorTarget,dt*2.8);if(Math.abs(state.door-state.doorTarget)<.003)state.door=state.doorTarget;
 state.ramp=smooth(state.ramp,state.rampTarget,dt*1.5);if(Math.abs(state.ramp-state.rampTarget)<.003)state.ramp=state.rampTarget;
 const interlock=tractionLocked(state);
 if(!onLoop&&state.v>0&&END_STOP-state.s<state.v*state.v/4+4){accel=false;brake=true;}
 let force=(accel?1.25/(1+state.pax/700):0)-(state.v>0? .11+.00065*state.v**2:state.v<0?-.11:0)-9.81*Math.sin(Math.atan(p.grade));
 if(brake){if(Math.abs(state.v)>.05)force-=Math.sign(state.v)*(state.cruise?1.6:state.condition==='rain'?1.65:2.5);else {force=0;state.v=0;}}
 if(reverse&&!brake)force-=state.v>.05?2.5:.75;
 const brakingNow=brake&&state.v>4.2;if(brakingNow&&!state.wasBraking)announceWarning('brake',12);state.wasBraking=brakingNow;
 if(interlock){state.v=Math.sign(state.v)*Math.max(0,Math.abs(state.v)-2.5*dt);force=0;}else state.v=clamp(state.v+force*dt,-2.5,16);
 if(v0>0&&state.v<0&&!keys.has('KeyR')&&!accel)state.v=0;
 if(v0<0&&state.v>0&&!accel)state.v=0;
 if(state.mobileBrake&&Math.abs(state.v)<.1){state.v=0;state.park=true;state.mobileBrake=false;}
 state.accel=(state.v-v0)/dt;
 if(mobile)state.guide=true;
 const steer=(keys.has('KeyA')||keys.has('ArrowLeft')?1:0)-(keys.has('KeyD')||keys.has('ArrowRight')?1:0);
 state.steer=smooth(state.steer,steer,dt*5);if(!steer&&Math.abs(state.steer)<.002)state.steer=0;
 if(onLoop){const base=LOOP.sample(state.loopS),heading=Math.atan2(-base.tx,-base.tz)+state.yaw;let wheel=state.steer*MAX_WHEEL_ANGLE;
  if(state.guide&&!steer)wheel=clamp(Math.atan(6.2/LOOP.radius)-state.yaw*.8-state.lat*.12,-.65,.65);
  const motion=driveStep(base.x+base.tz*state.lat,base.z-base.tx*state.lat,heading,state.v,wheel,dt),origin=LOOP.sample(0),ux=(origin.x-LOOP.center.x)/LOOP.radius,uz=(origin.z-LOOP.center.z)/LOOP.radius,dx=motion.x-LOOP.center.x,dz=motion.z-LOOP.center.z,angle=Math.atan2(dx*origin.tx+dz*origin.tz,dx*ux+dz*uz);
  state.loopS=Math.max(0,state.loopS+angleDelta(angle,state.loopS/LOOP.radius)*LOOP.radius);state.lat=LOOP.radius-Math.hypot(dx,dz);const next=LOOP.sample(state.loopS);state.yaw=angleDelta(motion.heading,Math.atan2(-next.tx,-next.tz));
  if(Math.abs(state.lat)>1.8){state.lat=clamp(state.lat,-1.8,1.8);state.v=0;state.park=true;}
  if(state.loopS>LOOP.length-1.5&&Math.abs(state.v)<.2){state.loopDone=true;state.score=Math.max(100,800-Math.round(state.time));finish();}
 }else{
  let wheel=state.steer*MAX_WHEEL_ANGLE,heading=p.heading+state.yaw;
  // Reversing pursues a lane point behind the cab; aiming ahead while backing would swing the cab round.
  if(state.guide&&!steer){const back=state.v<0?-1:1,ahead=clamp(5+Math.abs(state.v)*.25,5,8),dest=state.s+back*ahead,desired=laneOffset(dest,1,state.skipped||[]),aim=point(dest,desired),here=point(state.s,state.lat),alpha=angleDelta(Math.atan2(-(aim.x-here.x),-(aim.z-here.z)),heading+(back<0?Math.PI:0));wheel=clamp(back*Math.atan2(2*6.2*Math.sin(alpha),ahead),-.65,.65);}
  const here=point(state.s,state.lat),motion=driveStep(here.x,here.z,heading,state.v/Math.sqrt(1+p.grade*p.grade),wheel,dt);
  state.s=clamp(projectFrame(motion.x,motion.z,state.s),0,END_STOP);const r=sample(state.s);state.lat=(motion.x-r.x)*r.lx+(motion.z-r.z)*r.lz;state.yaw=angleDelta(motion.heading,r.heading);
  const edge=roadSection(state.s);if(state.lat<edge.left+1.35||state.lat>edge.right-1.35){state.lat=clamp(state.lat,edge.left+1.35,edge.right-1.35);state.v=0;state.park=true;state.crashed=true;if(state.time-(state.lastKerb||-10)>4){penalty('Kerb contact · use Recover if stuck',15);state.lastKerb=state.time;}}
  if(state.s>=END_STOP-.1||(state.mode==='explore'&&END_STOP-state.s<5&&Math.abs(state.v)<.15)){state.v=0;state.park=true;if(state.mode==='explore')toast('End of line · Change cab to return to Nai Wai');}
 }
 state.travel+=Math.abs(state.v)*dt;vehicle.yaws[0]=state.yaw;
 poseTram(vehicle,onLoop?state.loopS:state.s,state.lat,false,state.door,onLoop);
 rampMesh.visible=state.ramp>.001;const front=vehicle.sections[0];rampMesh.position.copy(front.localToWorld(new T.Vector3(-1.35-state.ramp*.5,.32,1.6)));rampMesh.rotation.y=front.rotation.y;rampMesh.scale.x=Math.max(.01,state.ramp);
 for(const sig of signalObjects.filter(s=>!s.underpass)){if(state.s+5.6>sig.s&&!sig.passed){sig.passed=true;if(signalAt(sig)==='stop'&&state.v>.5)penalty('Red signal passed',120);}}
 const f=energyFlow(state.v,state.accel,p.grade,state.pax,dt);state.energy+=f.consumed;state.regen+=f.recovered;state.battery=clamp(state.battery-f.net/360*100,0,100);state.power=f.power;
 if(Math.abs(state.accel)>2.8&&Math.abs(state.v)>2&&state.time-(state.lastHarsh||-10)>5){penalty('Harsh braking · passenger comfort',8);state.lastHarsh=state.time;if(state.pax>0&&!state.contextSpoken.includes('handrail')){state.contextSpoken.push('handrail');audio.announce('handrail');}}
 if(curveRadius(state.s+Math.max(12,state.v*2))<55&&state.v*3.6>22)announceWarning('curve',20);
 if(state.v*3.6>limit+4){state.speedingT=(state.speedingT||0)+dt;if(state.speedingT>5){penalty('Speed limit exceeded',30);state.speedingT=0;}}else state.speedingT=0;
 service(dt);audio.setDrive(Math.abs(state.v)*3.6,accel);
}
const rampMesh=meshBox(1.4,.06,1.15,0xd6bb54);rampMesh.visible=false;scene.add(rampMesh);
function contact(group,width,length,height,label){
 if(state.mode==='free'||state.mode==='turnback'||state.screen!=='driving'||state.crashed)return;
 const b={x:group.position.x,z:group.position.z,heading:group.rotation.y,hw:width/2,hl:length/2};
 if(vehicle.sections.some(g=>verticalOverlap({yBottom:g.position.y,yTop:g.position.y+3.5},{yBottom:group.position.y,yTop:group.position.y+height})&&boxesOverlap({cx:g.position.x,cz:g.position.z,heading:g.rotation.y,hw:1.27,hl:5.3},b))){state.v=0;state.park=true;state.crashed=true;penalty(label+' contact · use Recover to return to the road',150);state.eventLog.at(-1).contact={label,s:state.s,lat:state.lat,other:group.name,x:group.position.x,z:group.position.z};state.incidents++;}
}
const terminalLength=terminalCurve.getLength();
function terminalStep(a,dt){
 if(a.terminal==='reverse'){a.turnTime+=dt;if(a.turnTime<8||ai.some(o=>o!==a&&o.active&&o.dir===-1&&Math.abs(o.s-(a.s-21.2))<45))return;a.sections.reverse();a.flipped=!a.flipped;a.s-=21.2;a.dir=-1;a.stopIndex=6;a.served=[];a.terminal=null;a.dwell=0;a.v=0;return;}
 const blocked=a!==vehicle&&state.mode!=='free'&&state.s<85||ai.some(o=>o!==a&&o.active&&o.dir===1&&o.s<85);if(blocked){a.v=0;return;}
 if(a!==vehicle&&state.mode!=='free'){const p=terminalCurve.getPointAt(clamp(a.loopDistance/terminalLength,0,1)),t=terminalCurve.getTangentAt(clamp(a.loopDistance/terminalLength,0,1));if(vehicle.sections.some(g=>{const d=g.position.clone().sub(p);return d.length()<24&&d.dot(t)>-2;})){a.v=0;return;}}
 a.v=Math.min(4,a.v+dt);a.loopDistance=Math.min(terminalLength,a.loopDistance+a.v*dt);
 a.sections.forEach((g,i)=>{const distance=a.loopDistance-i*10.6;let p,t;if(distance<0){const r=sample(35-distance);p=point(35-distance,laneOffset(35-distance,-1));t=new T.Vector3(-r.tx,0,-r.tz);}else{const u=Math.min(1,distance/terminalLength);p=terminalCurve.getPointAt(u);t=terminalCurve.getTangentAt(u);}g.position.copy(p);g.position.y+=.025;g.rotation.set(0,Math.atan2(-t.x,-t.z)+(a.flipped?Math.PI:0),0);if(i){const prior=a.sections[i-1].localToWorld(new T.Vector3(0,.9,a.flipped?-5.3:5.3)),front=g.localToWorld(new T.Vector3(0,.9,a.flipped?5.3:-5.3));g.position.add(prior.sub(front));}});
 if(a.loopDistance>=terminalLength){nextDispatch[1]=state.time+state.headway;a.dir=1;a.s=35;a.lat=1.9;a.stopIndex=0;a.served=[];a.terminal=null;a.posed=false;}
}
function actors(dt){const subjectS=viewS();

 const obstacles=state.mode!=='free'&&state.mode!=='turnback'?vehicle.sections.map(g=>{const s=project(g.position.x,g.position.z,state.s),p=sample(s);return {s,lat:(g.position.x-p.x)*p.lx+(g.position.z-p.z)*p.lz,y:g.position.y};}):[];
 const participants=ai.filter(a=>a.active);if(state.mode!=='free'&&state.mode!=='turnback'&&!state.depotRoute)participants.push({s:state.s,dir:state.returning?-1:1,active:true});
 for(const a of ai){
  if(!a.active){a.sections.forEach(g=>g.visible=false);continue;}
  if(a.terminal){terminalStep(a,dt);for(const g of a.sections)g.visible=Math.abs(a.s-subjectS)<700;continue;}
  const st=STOPS[a.stopIndex],target=st?stopTarget(st,a.dir):a.dir===1?END_STOP-4:35;
  let stop=target;const limit=line=>{if((line-a.s)*a.dir>=-.01&&(line-stop)*a.dir<0)stop=line;};
  for(const sig of signalObjects.filter(s=>!s.underpass))if(signalAt(sig)!=='go')limit(sig.centre-a.dir*(sig.stop+6));
  for(const c of crossers)if(c.active&&crosserInPath(c.lat,c.dir,a.lat))limit(c.s-a.dir*9);
  const following=followingStop(a.s,a.dir,participants,a);if((following-stop)*a.dir<0)stop=following;
  for(const o of obstacles)if(Math.abs(o.lat-a.lat)<2.8&&Math.abs(o.y-sample(a.s).y)<3.5&&(o.s-a.s)*a.dir>=-6){const line=o.s-a.dir*16;if((line-stop)*a.dir<0)stop=line;}
  if(a.dir===1&&ai.some(o=>o!==a&&o.terminal==='reverse'))limit(END_STOP-100);
  if(a.dir===-1&&(ai.some(o=>o!==a&&o.terminal==='loop')||vehicle.terminal==='loop'))limit(85);
  if(a.dwell>0){a.dwell=Math.max(0,a.dwell-dt);a.v=0;a.door=Math.min(1,a.dwell,10-a.dwell);if(!a.dwell){a.pax=STOPS[a.stopIndex]?.terminus?0:Math.min(180,Math.round((a.pax||20)*.7)+12+a.stopIndex*3);a.stopIndex+=a.dir;}}
  else{const move=approachStep(a.s,a.v,a.dir,8.3,stop,dt);a.s=move.position;a.v=move.speed;a.door=0;if(st&&Math.abs(a.s-target)<.03){a.dwell=10;a.served.push(st.id);}if(!st&&(a.s-target)*a.dir>-.03){a.terminal=a.dir===1?'reverse':'loop';a.turnTime=0;a.loopDistance=0;a.v=0;}}
  a.lat=a.dir===-1?returnOffset(a.s):laneOffset(a.s);
  poseTram(a,a.s,a.lat,a.dir===-1,a.door);for(const g of a.sections){g.visible=a.active&&Math.abs(a.s-subjectS)<700;if(g.visible)contact(g,2.54,10.6,3.5,'ART');}
 }
 for(const c of traffic){if(c.curve){const length=c.curve.getLength(),u=clamp(c.routeDistance/length,0,1),p=c.curve.getPointAt(u),t=c.curve.getTangentAt(u),out=c.curve===l35TrafficCurve,front=c.routeDistance+c.length/2;let stop=c.routeDistance+1e6;const hold=line=>{if(front<=line+.3&&line-front<45)stop=Math.min(stop,Math.max(c.routeDistance,line-c.length/2));};
  // L35 turning routes (lanes baked into the curves): queue behind anything in the lane, D6 side phase, D3 give-way, L35 zebras.
  for(const o of traffic){if(o===c)continue;const d=o.group.position.clone().sub(p),ahead=d.x*t.x+d.z*t.z;if(ahead>0&&ahead<30&&Math.abs(d.x*t.z-d.z*t.x)<2.2&&Math.abs(d.y)<3)stop=Math.min(stop,Math.max(c.routeDistance,c.routeDistance+ahead-(o.length+c.length)/2-3));}
  const d6=signalObjects.find(s=>s.c===2650);if(d6&&signalAt(d6,true)!=='go')hold(out?L35_LINES.d6Out:L35_LINES.d6Return);
  if(out&&traffic.some(o=>!o.curve&&o.junction?.c===3395&&o.dir===1&&o.along<-4&&o.lat>L35_LINES.mergeLat-45&&o.lat<L35_LINES.mergeLat+10))hold(L35_LINES.giveWay);
  for(const x of crossers){if(x.s<L35.start||x.s>L35_LINES.bendS)continue;const mid=-l35Offset(x.s),e=L35.width/2;if(!(x.active&&(x.dir===1?x.lat>mid-e-3&&x.lat<mid+e+.5:x.lat<mid+e+3&&x.lat>mid-e-.5)))continue;const d=point(x.s,mid).sub(p),ahead=d.x*t.x+d.z*t.z;if(Math.abs(d.x*t.z-d.z*t.x)<e+1&&ahead-c.length/2>1.5&&ahead<40)stop=Math.min(stop,c.routeDistance+ahead-3-c.length/2);}
  if(state.mode!=='free')for(const body of vehicle.sections){const delta=body.position.clone().sub(p),ahead=delta.x*t.x+delta.z*t.z,cross=Math.abs(delta.x*t.z-delta.z*t.x);if(ahead>0&&cross<4&&Math.abs(delta.y)<4)stop=Math.min(stop,c.routeDistance+Math.max(0,ahead-c.length/2-7));}
  const move=approachStep(c.routeDistance,c.v,1,out&&c.routeDistance>L35_LINES.giveWay+8?11:7,stop,dt);c.routeDistance=move.position;c.v=move.speed;if(c.routeDistance>length)c.routeDistance=0;const v=clamp(c.routeDistance/length,0,1),q=c.curve.getPointAt(v),h=c.curve.getTangentAt(v);c.group.position.copy(q);c.group.position.y+=.08;c.group.rotation.y=Math.atan2(-h.x,-h.z);c.group.visible=Math.abs(project(q.x,q.z)-subjectS)<500;if(c.group.visible)contact(c.group,c.width,c.length,c.height,'Turning traffic');continue;}const j=c.junction,r=sample(j.s),sig=signalObjects.find(sig=>sig.c===j.c),go=j.underpass&&!sig||signalAt(sig,true)==='go';
  const line=-c.dir*((j.underpass?j.stop:sideCrossing(j,c.dir)+3)+c.length/2),distance=(line-c.lat)*c.dir;let stop=c.lat+c.dir*1e6;
  if(!go&&distance>=-.01)stop=line;
  for(const other of traffic)if(other!==c&&other.junction===j&&other.dir===c.dir&&other.along===c.along&&(other.lat-c.lat)*c.dir>0){const limit=other.lat-c.dir*((other.length+c.length)/2+3);if((limit-c.lat)*c.dir<(stop-c.lat)*c.dir)stop=limit;}
  for(const o of traffic)if(o.curve){const dx=o.group.position.x-r.x,dz=o.group.position.z-r.z,oLat=dx*r.lx+dz*r.lz,ahead=(oLat-c.lat)*c.dir;if(Math.abs(dx*r.tx+dz*r.tz-c.along)<1.6&&Math.abs(o.group.position.y-(r.elevated?r.groundY:r.y))<3.5&&ahead>0&&ahead<40){const limit=oLat-c.dir*((o.length+c.length)/2+3);if((limit-c.lat)*c.dir<(stop-c.lat)*c.dir)stop=limit;}}
  if(state.mode!=='free'&&state.mode!=='turnback')for(const g of vehicle.sections){const dx=g.position.x-r.x,dz=g.position.z-r.z,along=dx*r.tx+dz*r.tz,lat=dx*r.lx+dz*r.lz;if(Math.abs(along-c.along)<7&&Math.abs(g.position.y-(r.elevated?r.groundY:r.y))<3.5&&(lat-c.lat)*c.dir> -c.length/2){const blocked=lat-c.dir*(c.length/2+7);if((blocked-stop)*c.dir<0)stop=blocked;}}
  const move=approachStep(c.lat,c.v,c.dir,j.underpass?11:7,stop,dt);c.lat=move.position;c.v=move.speed;
  if(c.lat*c.dir>j.extent+c.length){const entry=-c.dir*(j.extent+c.length);if(!traffic.some(o=>o!==c&&o.junction===j&&o.along===c.along&&Math.abs(o.lat-entry)<(o.length+c.length)/2+4))c.lat=entry;}
  c.group.position.set(r.x+r.lx*c.lat+r.tx*c.along,(r.elevated?r.groundY:r.y)+c.along*(r.elevated?0:r.grade)+.08,r.z+r.lz*c.lat+r.tz*c.along);c.group.rotation.y=r.heading+c.dir*Math.PI/2;c.group.visible=Math.abs(j.s-subjectS)<450;
  if(c.group.visible)contact(c.group,c.width,c.length,c.height,'Traffic');
 }
 updateStreetLife(dt,subjectS);updateBirds(dt,subjectS);
 for(const p of walkerObjects){
  const previousX=p.group.position.x,previousY=p.group.position.y,previousZ=p.group.position.z;
  const playerHere=state.mode!=='free'&&state.index===p.station&&travelDirection()===p.side&&['boarding','departure'].includes(state.phase)&&state.door>.2;
  const npc=ai.find(a=>a.active&&a.stopIndex===p.station&&a.dir===p.side&&a.dwell>0&&a.door>.2);
  const tram=playerHere?vehicle:npc,boarding=!!tram&&!p.roaming;
  if(boarding){const clock=playerHere?state.dwell:10-npc.dwell;p.progress=clamp((clock-p.phase*.28)/(p.alight?2.4:4),0,1);const doors=tram.doors.filter(d=>d.side===(tram.flipped?-1:1)),d=doors[p.phase%doors.length],door=d.node.parent.localToWorld(d.base.clone());door.y=sample(stopCentre(STOPS[p.station],p.side)).y+.32;const inside=door.clone().lerp(tram.sections[tram.flipped?tram.sections.length-1-d.si:d.si].position,.28);inside.y=door.y;p.group.position.lerpVectors(p.alight?inside:p.origin,p.alight?p.origin:inside,p.progress);const heading=(p.alight?p.origin:inside).clone().sub(p.alight?inside:p.origin);p.group.rotation.y=Math.atan2(-heading.x,-heading.z);p.group.visible=Math.abs(STOPS[p.station].s-subjectS)<450&&(p.alight||p.progress<1);}
  else{const st=STOPS[p.station],walk=Math.sin(state.time*(p.roaming?.11:.06)+p.phase)*(p.roaming?35:3),q=stopCentre(st,p.side)+(p.phase-6)*4+walk;p.group.position.copy(point(q,p.side*(8.35+(p.phase%2)*.45)));p.group.position.y+=.32;p.group.rotation.y=sample(q).heading+(Math.cos(state.time*(p.roaming?.11:.06)+p.phase)<0?Math.PI:0);p.group.visible=Math.abs(st.s-subjectS)<450;}
  if(p.group.visible)posePedestrian(p.group,Math.hypot(p.group.position.x-previousX,p.group.position.z-previousZ),dt);
 }

 for(const sig of signalObjects)for(const head of sig.heads){const phase=head.axis==='pedestrian'?(signalAt(sig)==='stop'?'go':'stop'):signalAt(sig,head.axis==='side'),lit=phase==='go'?2:phase==='amber'?1:0;head.bulbs.forEach((b,i)=>b.material.color.setHex(i===lit?[0xff4633,0xffd65b,0x55ff95][i]:0x293731));}

}
const cabDisplay=document.createElement('canvas');cabDisplay.width=512;cabDisplay.height=320;const cabTexture=new T.CanvasTexture(cabDisplay);cabTexture.colorSpace=T.SRGBColorSpace;cabTexture.flipY=false;
function updateCockpit(){if(!vehicle)return;const inside=state.screen==='driving'&&state.cam===1&&state.mode!=='free';for(const glass of vehicle.glazing)glass.material.opacity=inside?.035:state.condition==='night'?.32:.7;for(const display of vehicle.cabDisplays){if(display.material.map!==cabTexture){display.material.map=cabTexture;display.material.color.set(0xffffff);display.material.emissive.set(0xffffff);display.material.emissiveMap=cabTexture;display.material.emissiveIntensity=.65;display.material.needsUpdate=true;}}const x=cabDisplay.getContext('2d');x.fillStyle='#0e2028';x.fillRect(0,0,512,320);x.strokeStyle='#6bb9c6';x.lineWidth=8;x.beginPath();x.arc(160,166,114,Math.PI*.75,Math.PI*2.25);x.stroke();x.fillStyle='#d7f3e7';x.font='84px sans-serif';x.textAlign='center';x.fillText(Math.round(Math.abs(state.v)*3.6),160,192);x.font='26px sans-serif';x.fillText('km/h',160,240);x.textAlign='left';x.fillText('SGMTS',314,64);x.fillText(state.door>.1?'DOORS OPEN':'DOORS LOCK',296,130);x.fillText('BAT '+state.battery.toFixed(0)+'%',296,188);x.fillText(state.park?'BRAKE ON':'READY',296,244);cabTexture.needsUpdate=true;for(const wheel of vehicle.steering){wheel.node.quaternion.copy(wheel.base);wheel.node.rotateZ(-state.steer*.5);}}
const camPos=new T.Vector3(),look=new T.Vector3();let firstCamera=true;
const orbit={yaw:0,pitch:0,zoom:1};let drag=null;
function resetOrbit(){orbit.yaw=0;orbit.pitch=0;orbit.zoom=1;}
const canvas=renderer.domElement;canvas.style.touchAction='none';
canvas.addEventListener('click',()=>{if(!mobile&&state.screen==='driving')canvas.requestPointerLock?.()?.catch?.(()=>toast('Click the scene again to enable mouse look'));});
canvas.addEventListener('pointerdown',e=>{if(state.screen!=='driving'||!mobile)return;drag={x:e.clientX,y:e.clientY};canvas.setPointerCapture(e.pointerId);});
const mouseLook=(dx,dy)=>{orbit.yaw-=dx*.003;orbit.pitch=clamp(orbit.pitch-dy*.003,-1.1,1.1);};
canvas.addEventListener('pointermove',e=>{if(state.screen!=='driving'||document.pointerLockElement)return;if(!mobile)return;if(!drag)return;mouseLook(e.clientX-drag.x,e.clientY-drag.y);drag={x:e.clientX,y:e.clientY};});
document.addEventListener('mousemove',e=>{if(document.pointerLockElement===canvas&&state.screen==='driving')mouseLook(e.movementX,e.movementY);});
document.addEventListener('pointerlockchange',()=>{if(document.pointerLockElement)toast('Mouse look · Esc releases the pointer');});
canvas.addEventListener('pointerup',()=>drag=null);canvas.addEventListener('pointercancel',()=>drag=null);
canvas.addEventListener('wheel',e=>{e.preventDefault();orbit.zoom=clamp(orbit.zoom*Math.exp(e.deltaY*.001),.25,3);},{passive:false});
addEventListener('keydown',e=>{if(['INPUT','SELECT'].includes(e.target.tagName))return;if(e.code==='Digit0')resetOrbit();if(['Equal','Minus'].includes(e.code))orbit.zoom=clamp(orbit.zoom*(e.code==='Equal'?.85:1.18),.25,3);});

// ---- On foot: the driver walks (third person), rides any ART as a passenger, cycles the track and chats. ----
// Phones reach all of this through the touch pad (joystick + ⏏ / 💬 / ▲), which presses the same keys.
const player={x:0,y:0,z:0,s:0,heading:0,v:0,jumpY:0,vy:0,group:null,tram:null,bike:null,talks:new Map(),rideTalks:0},bikes=[];let colliders=[];
const RIDER_PARTS=['seated_rider','thigh_1','thigh_-1','shin_1','shin_-1'];
function makeAvatar(){player.group=streetModel('pedestrian_0');player.group.name='player-driver';player.group.visible=false;scene.add(player.group);
 // Walls come from real geometry (collision.js); trunks stay as simple posts.
 colliders=environment.trees.map(t=>({x:t.x,z:t.z,radius:.4}));
 // Three unused bikes parked along the cycle track at every station.
 for(const st of STOPS)for(let n=0;n<3;n++){const group=streetModel('cyclist'),b={group,wheels:['bike_wheel_front','bike_wheel_rear'].map(k=>group.getObjectByName(k)),s:clamp(st.s-16-n*2.2,4,LENGTH-4),lat:1.6,dir:1,v:0,phase:n};group.name='parked-bike';poseCyclist(b,0);scene.add(group);bikes.push(b);parkBike(b,true);}
}
function parkBike(b,parked){for(const n of RIDER_PARTS)b.group.getObjectByName(n).visible=!parked;placeBike(b);}
function placeBike(b){const r=cycleSample(b.s);b.group.position.set(r.x+r.lx*b.lat,r.groundY+cycleBridgeHeight(b.s)+.035,r.z+r.lz*b.lat);b.group.rotation.y=r.heading+(b.dir===1?0:Math.PI);}
function resetAvatar(){if(player.bike){player.bike.v=0;parkBike(player.bike,true);}Object.assign(player,{tram:null,bike:null});state.avatar='drive';if(player.group)player.group.visible=false;}
const near2d=(p,max)=>Math.hypot(p.x-player.x,p.z-player.z)<max;
function nearestTram(){let best=null,bd=6;for(const t of [vehicle,...ai.filter(a=>a.active)])for(const g of t.sections){const d=Math.hypot(g.position.x-player.x,g.position.z-player.z);if(d<bd&&Math.abs(g.position.y-player.y)<3){bd=d;best=t;}}return best;}
const nearestBike=()=>bikes.filter(b=>b!==player.bike&&near2d(b.group.position,2.5)).sort((a,b)=>a.group.position.distanceTo(player.group.position)-b.group.position.distanceTo(player.group.position))[0];
function nearestPerson(){const people=[...walkerObjects,...crossers,...plazaPeople].map(p=>p.group);let best=null,bd=3;people.forEach((g,id)=>{const d=Math.hypot(g.position.x-player.x,g.position.z-player.z);if(g.visible&&d<bd){bd=d;best={g,id};}});return best;}
// Step out beside a section on its outer side (platform side at a stop), never into the carriageway centre.
function leave(g,hint){const right=new T.Vector3(1,0,0).applyQuaternion(g.quaternion).setY(0).normalize(),spot=[1,-1].map(k=>{const p=g.position.clone().addScaledVector(right,k*2.4);return {p,k,g:groundAt(p.x,p.z,hint)};}).sort((a,b)=>Math.abs(b.g.lat)-Math.abs(a.g.lat))[0];
 Object.assign(player,{jumpY:0,vy:0,x:spot.p.x,z:spot.p.z,y:spot.g.y,s:spot.g.s,v:0,tram:null});player.heading=Math.atan2(-right.x*spot.k,-right.z*spot.k);state.avatar='foot';player.group.visible=true;firstCamera=true;}
function toggleAvatar(){if(state.mode==='free'||!player.group)return;
 if(state.avatar==='drive'){if(Math.abs(state.v)>.2){toast('Stop the vehicle before getting out / 請先停車');return;}state.cruise=false;state.park=true;audio.setDrive(0,false);orbit.pitch=0;orbit.zoom=1;leave(vehicle.sections[0],state.s);orbit.yaw=player.heading+Math.PI/2;toast('On foot · WASD walk · Shift run · Space jump · mouse look · Enter at a parked bike or stopped ART · E talk',7);return;}
 if(state.avatar==='ride'){leave(player.tram.sections[1],player.tram.s);toast('Alighted / 已下車');return;}
 if(state.avatar==='bike'){const b=player.bike;b.v=0;parkBike(b,true);player.bike=null;const r=cycleSample(b.s),q=b.group.position.clone().addScaledVector(new T.Vector3(r.lx,0,r.lz),-b.dir*1.1),g=groundAt(q.x,q.z,b.s);Object.assign(player,{x:q.x,z:q.z,y:g.y,s:g.s,v:0});state.avatar='foot';player.group.visible=true;return;}
 const bike=nearestBike(),tram=bike?null:nearestTram();
 if(bike){const r=cycleSample(bike.s);bike.dir=-Math.sin(orbit.yaw)*r.tx-Math.cos(orbit.yaw)*r.tz>=0?1:-1;bike.lat=bike.dir*.85;bike.v=0;player.bike=bike;parkBike(bike,false);orbit.yaw=bike.group.rotation.y;state.avatar='bike';player.group.visible=false;toast('Cycling · W pedal · S brake (again to turn round) · A/D change side');return;}
 if(tram===vehicle){state.avatar='drive';player.group.visible=false;resetOrbit();firstCamera=true;toast('Back in the cab / 返回駕駛室');return;}
 if(tram){if(Math.abs(tram.v)>.5){toast('Wait for it to stop / 請等車停定');return;}player.tram=tram;state.avatar='ride';player.group.visible=false;player.rideTalks=0;orbit.zoom=1;toast('Riding as a passenger · Enter to alight anywhere');return;}
 toast('Walk up to an ART vehicle or a parked bike, then press Enter');}
function talk(){if(state.avatar==='ride'){toast('Passenger: “'+passengerLine(99,player.rideTalks++,{condition:state.condition,riding:true})+'”');return;}
 const p=nearestPerson();if(!p){toast('Nobody close enough to talk to');return;}const n=player.talks.get(p.g)||0;player.talks.set(p.g,n+1);
 if(state.avatar==='foot')player.heading=Math.atan2(player.x-p.g.position.x,player.z-p.g.position.z);toast('Passenger: “'+passengerLine(p.id,n,{condition:state.condition})+'”');}
function padLabel(){if(state.avatar==='drive'&&state.mode!=='free'&&stick!==null)releaseStick();
 const key=state.avatar==='foot'?avatarPrompt()[2]:state.avatar,label={drive:'Walk',ride:'Alight',bike:'Park','bike-near':'Ride','tram-near':nearestTram()===vehicle?'Drive':'Board'}[key]||'Enter';
 $('#pad-enter small').textContent=label;$('#pad-up small').textContent=state.mode==='free'?'Up':'Jump';}
function avatarPrompt(){if(state.avatar==='ride')return ['Riding as a passenger · Enter to alight · E to chat',1,'ride'];
 if(state.avatar==='bike')return ['Cycling · W pedal · S brake, again to turn round · Enter to park the bike',1,'bike'];
 if(nearestBike())return ['Enter · take the bike',1,'bike-near'];const tram=nearestTram();
 if(tram)return [tram===vehicle?'Enter · take the driver’s seat':'Enter · board as a passenger',1,'tram-near'];
 if(nearestPerson())return ['E · talk to this person',1,'talk'];
 const bike=bikes.map(b=>Math.hypot(b.group.position.x-player.x,b.group.position.z-player.z)).sort((a,b)=>a-b)[0];
 return [`On foot · WASD walk · Shift run · mouse look · Enter near a bike or stopped ART${bike<400?` · nearest parked bike ${Math.round(bike)} m (cycle track)`:''}`,0,'foot'];}
function updateAvatar(dt){const has=(...c)=>c.some(k=>keys.has(k)),f=(has('KeyW','ArrowUp')?1:0)-(has('KeyS','ArrowDown')?1:0),side=(has('KeyD','ArrowRight')?1:0)-(has('KeyA','ArrowLeft')?1:0),run=has('ShiftLeft','ShiftRight'),yaw=orbit.yaw,fx=-Math.sin(yaw),fz=-Math.cos(yaw);
 if(state.avatar==='ride'){const g=player.tram.sections[1];Object.assign(player,{x:g.position.x,y:g.position.y,z:g.position.z,s:player.tram.s});if(!player.tram.active&&!player.tram.terminal)leave(g,player.s);return;}
 if(state.avatar==='bike'){const b=player.bike;
  // S brakes; pressed again at a standstill it turns the bike around.
  if(f<0&&b.v===0&&!b.turning){b.dir*=-1;b.lat=-b.lat;}b.turning=f<0;
  b.v=f>0?Math.min(run?9:6.5,b.v+2.2*dt):Math.max(0,b.v-(f<0?5:.8)*dt);
  b.s=clamp(b.s+b.dir*b.v*dt,4,LENGTH-4);b.lat=clamp(b.lat-side*b.dir*1.4*dt,-1.7,1.7);placeBike(b);poseCyclist(b,dt);if(b.v>.5)orbit.yaw+=Math.atan2(Math.sin(b.group.rotation.y-orbit.yaw),Math.cos(b.group.rotation.y-orbit.yaw))*Math.min(1,dt*2.5);Object.assign(player,{x:b.group.position.x,y:b.group.position.y,z:b.group.position.z,s:b.s,heading:b.group.rotation.y});return;}
 const moving=f||side,target=moving?(run?5:1.7):0;player.v=moving?Math.min(target,player.v+8*dt):Math.max(0,player.v-10*dt);
 if(moving){const mx=fx*f+Math.cos(yaw)*side,mz=fz*f-Math.sin(yaw)*side,want=Math.atan2(-mx,-mz);player.heading+=Math.atan2(Math.sin(want-player.heading),Math.cos(want-player.heading))*Math.min(1,dt*12);}
 // Moving trams are obstacles too: three posts per articulated section.
 const trams=[vehicle,...ai.filter(a=>a.active)].flatMap(t=>t.sections).filter(g=>near2d(g.position,20)).flatMap(g=>[-3.6,0,3.6].map(z=>{const q=g.localToWorld(new T.Vector3(0,0,z));return {x:q.x,z:q.z,radius:1.3};}));
 // Space jumps: enough to clear the 1.2 m pedestrian panels.
 if(has('Space')&&player.jumpY===0&&player.vy===0)player.vy=JUMP_SPEED;if(player.vy||player.jumpY){player.vy-=GRAVITY*dt;player.jumpY=Math.max(0,player.jumpY+player.vy*dt);if(player.jumpY===0)player.vy=0;}
 const before=player.group.position.clone(),move=wallSlide({...player,y:player.y+player.jumpY},-Math.sin(player.heading)*player.v*dt,-Math.cos(player.heading)*player.v*dt),step=walkStep(player,move.x,move.z,[...colliders.filter(c=>near2d(c,60)),...trams],environment.fences.filter(f=>Math.abs(f.ax-player.x)<8&&Math.abs(f.az-player.z)<8));
 if(step.blocked)player.v=0;else{const rise=step.y-player.y;Object.assign(player,step);if(rise>0&&player.jumpY>0)player.jumpY=Math.max(0,player.jumpY-rise);}player.group.position.set(player.x,player.y+player.jumpY+.02,player.z);player.group.rotation.y=player.heading;posePedestrian(player.group,Math.hypot(player.group.position.x-before.x,player.group.position.z-before.z),dt);}
// Orbit rig behind the character; aim() pulls it in before any wall gets between camera and subject.
function avatarCamera(){const ride=state.avatar==='ride',bike=state.avatar==='bike',dist=(ride?17:bike?5.5:4.2)*orbit.zoom,e=clamp(.28-orbit.pitch,-.25,1.3),focus=new T.Vector3(player.x,player.y+(ride?2.6:bike?1.5:1.55),player.z),back=new T.Vector3(Math.sin(orbit.yaw)*Math.cos(e),Math.sin(e),Math.cos(orbit.yaw)*Math.cos(e));
 const target=focus.clone().addScaledVector(back,dist);target.y=Math.max(target.y,groundAt(target.x,target.z,player.s).y+.35);camera.fov=55;camera.near=.1;camera.updateProjectionMatrix();return {target,focus};}

function aim(dt){const g=vehicle.sections[0],p=g.position,dir=new T.Vector3(0,0,vehicle.flipped?1:-1).applyQuaternion(g.quaternion),left=new T.Vector3(-1,0,0).applyQuaternion(g.quaternion);let target,focus;
 if(state.screen==='menu'){target=p.clone().addScaledVector(dir,23).addScaledVector(left,-3.5);target.y+=3.6;focus=p.clone().addScaledVector(dir,-14).addScaledVector(left,7);focus.y+=1.3;}
 else if(state.avatar!=='drive'){({target,focus}=avatarCamera());}
 else if(state.mode==='free'){const heading=state.freeHeading+orbit.yaw,cp=Math.cos(orbit.pitch),forward=new T.Vector3(-Math.sin(heading)*cp,Math.sin(orbit.pitch),-Math.cos(heading)*cp);target=new T.Vector3(state.freeX,state.freeY,state.freeZ);focus=target.clone().addScaledVector(forward,60);camera.fov=60;camera.updateProjectionMatrix();}
 // The eye is anchored inside the Blender cab; only the view direction changes.
 else if(state.cam===1){target=g.userData.driverEye.getWorldPosition(new T.Vector3());focus=target.clone().addScaledVector(dir,60);focus.y-=14;}
 else if(state.cam===2){target=p.clone().addScaledVector(dir,-35).addScaledVector(left,-20);target.y+=72;focus=p.clone().addScaledVector(dir,12);}
 else if(state.cam===3){target=point(state.s+travelDirection()*18,travelDirection()*5.6);target.y+=3.4;focus=point(state.s-travelDirection()*12,travelDirection()*9.5);focus.y+=1.5;}
 else {target=p.clone().addScaledVector(dir,-39).addScaledVector(left,-12);target.y+=11;focus=p.clone().addScaledVector(dir,-5);focus.y+=1.6;}
 if(state.screen!=='menu'&&state.mode!=='free'&&state.avatar==='drive'){
  const offset=target.clone().sub(focus),sph=new T.Spherical().setFromVector3(offset);sph.theta+=orbit.yaw;sph.phi=clamp(sph.phi+orbit.pitch,.08,Math.PI-.12);sph.radius*=orbit.zoom;
  if(state.cam===1){const dir=focus.clone().sub(target).normalize().applyAxisAngle(new T.Vector3(0,1,0),orbit.yaw);dir.y+=orbit.pitch;focus=target.clone().addScaledVector(dir,60);camera.fov=clamp(72*orbit.zoom,40,95);camera.near=.04;}else {target.copy(focus).add(new T.Vector3().setFromSpherical(sph));target.y=Math.max(target.y,sample(state.s).y+.7);camera.fov=48;camera.near=.15;}camera.updateProjectionMatrix();
 }
 const k=firstCamera||state.mode==='free'||state.avatar!=='drive'||state.cam===1?1:1-Math.exp(-dt*(state.cam===1?18:4));if(firstCamera)resetView();camPos.lerp(target,k);look.lerp(focus,k);
 // Chase views never sit behind a wall; the vehicle being followed or ridden is see-through to this test.
 if(state.screen==='driving'&&(state.avatar!=='drive'||state.mode!=='free'&&state.cam===0))camPos.copy(clearView(look,camPos,state.avatar==='drive'?vehicle.sections:state.avatar==='ride'?player.tram.sections:[],dt));
 camera.position.copy(camPos);camera.lookAt(look);firstCamera=false;
 const subject=state.mode==='free'?target:state.avatar!=='drive'?focus:p;updateWind(subject);placeSun(subject);}
// Shadow frustum follows the subject along the sun direction, snapped to whole shadow texels so edges do not crawl.
const lightRotation=new T.Quaternion(),lightInverse=new T.Quaternion(),lightPoint=new T.Vector3();
function placeSun(subject){const d=ATMOS.uSunDir.value,texel=(sun.shadow.camera.right-sun.shadow.camera.left)/sun.shadow.mapSize.x;lightRotation.setFromRotationMatrix(new T.Matrix4().lookAt(d,new T.Vector3(),new T.Vector3(0,1,0)));lightInverse.copy(lightRotation).invert();
 lightPoint.copy(subject).applyQuaternion(lightInverse);lightPoint.x=Math.round(lightPoint.x/texel)*texel;lightPoint.y=Math.round(lightPoint.y/texel)*texel;lightPoint.applyQuaternion(lightRotation);
 sun.target.position.copy(lightPoint);sun.position.copy(lightPoint).addScaledVector(d,220);}
function hud(){document.body.dataset.depot=String(!!state.depotRoute);document.body.dataset.avatar=state.avatar;if(mobile)padLabel();drawMinimap();updateCockpit();let st=STOPS[state.index],target=st?stopTarget(st):LENGTH,d=(target-state.s)*travelDirection(),loop=state.mode==='turnback',explore=state.mode==='explore';
 $('#service-label').textContent=state.mode==='free'?'FREE CAMERA · VEHICLE INDEPENDENT':state.returning?'LINE 01 · SOUTHBOUND':'LINE 01 · NORTHBOUND';
 serviceBoard(st,d,loop,explore);placeStack();ffButton.lastChild.textContent=ffRate+'×';ffButton.classList.toggle('active',ffRate>1);ffButton.classList.toggle('blocked',ffRate===1&&!!ffBlock());// dimmed, never aria-disabled: pressing it while blocked is how the driver learns why.
 if(state.mode==='free'){$('#next').textContent='Free roam / 自由探索';$('#next-distance').textContent=`Ch. ${toChainage(state.freeS).toFixed(0)} m · altitude ${state.freeY.toFixed(0)} m`;$('#signal-status').textContent='Vehicle-independent camera';$('#telemetry').innerHTML=`<span>MOVE SPEED <b>${state.freeSpeed.toFixed(0)} m/s</b></span><span>ALTITUDE <b>${state.freeY.toFixed(1)} m</b></span><span>CHAINAGE <b>${toChainage(state.freeS).toFixed(0)} m</b></span><span>BOOST <b>${keys.has('ShiftLeft')||keys.has('ShiftRight')?'ON':'OFF'}</b></span>`;contextualPrompt('WASD move · Shift boost · Space/Ctrl altitude');return;}
 $('#speed').textContent=Math.round(Math.abs(state.v)*3.6);$('#limit').textContent=loop?'15':Math.abs(d)<130?'30':'40';$('#next').textContent=loop?'泥圍 · Terminal loop':explore?'Explore / 全線探索':st?`${st.zh} · ${st.name}`:'產業園 · 終點';$('#next-distance').textContent=loop?`${Math.max(0,LOOP.length-state.loopS).toFixed(0)} m to complete circuit`:explore?`${Math.max(0,END_STOP-state.s).toFixed(0)} m to end of line · Ch. ${toChainage(state.s).toFixed(0)} m`:`${Math.abs(d).toFixed(0)} m ${d<0?'behind':'ahead'} · Ch. ${toChainage(state.s).toFixed(0)} m`;
 if(state.depotRoute){$('#next').textContent='Depot / 車廠';$('#next-distance').textContent=Math.max(0,(state.branchCurve||depotCurve).getLength()-state.branchDistance).toFixed(0)+(state.depotOutbound?' m to main line':' m into depot');}
 let sig=nextSignal();$('#signal-status').textContent=sig?`${signalAt(sig)==='go'?'● Proceed':'● Prepare to stop'} · ${(sig.s-state.s).toFixed(0)} m`:'● Clear corridor';$('#signal-status').style.color=sig&&signalAt(sig)!=='go'?'#e8b471':'#91c8ad';const crossing=crossers.find(c=>playerYields(c)&&c.s>state.s&&c.s-state.s<150);if(crossing){$('#signal-status').textContent=`Yield to pedestrians · ${(crossing.s-state.s).toFixed(0)} m / 禮讓行人`;$('#signal-status').style.color='#e8b471';}$('#score').textContent=String(state.score).padStart(4,'0');$('#pax').textContent=state.pax+' passengers / 乘客';$('#schedule').textContent=`${clockText(state.time)} · ${state.nextDue?(state.nextDue.left<0?`${Math.round(-state.nextDue.left)} s late`:'On schedule'):'No timetable'}`;
 $('#brake-status').textContent=state.park?'● Parking brake applied':'○ Parking brake released';$('#door-status').textContent=state.door>.01?`● ${state.doorSide===1?'Left':'Right'} doors open`:'○ Doors secured';$('#guide-status').textContent=`${state.guide?'●':'○'} Guidance ${state.guide?'on':'off'} · ${state.cruise?'Cruise on':'Manual power'}`;$('#camera-status').textContent=CAMERAS[state.cam]+' · Mouse look · Scroll ± · 0 reset';$('#telemetry').innerHTML=`<span>Battery <b>${state.battery.toFixed(1)}%</b></span><span>${state.power<0?'Regenerative braking':'Traction power'} <b>${Math.abs(state.power||0).toFixed(0)} kW</b></span><span>Gradient <b>${(sample(state.s).grade*100).toFixed(1)}%</b></span><span>Energy recovered <b>${state.regen.toFixed(2)} kWh</b></span>`;
 const [instruction,act,promptKey]=state.avatar!=='drive'?avatarPrompt():coach(st,d,loop,explore);contextualPrompt(instruction,act,promptKey);$('#dwell').classList.toggle('active',state.phase==='boarding');$('#dwell i').style.width=`${Math.min(100,state.dwell/(state.requiredDwell||1)*100)}%`;$('#dwell span').textContent='PASSENGER EXCHANGE';
 document.querySelectorAll('[data-stop]').forEach(el=>{el.classList.toggle('done',state.served.includes(el.dataset.stop));el.classList.toggle('here',st?.id===el.dataset.stop);el.classList.toggle('missed',state.missed.includes(el.dataset.stop));});$('#route-choices [data-action="cruise"]').textContent=state.cruise?'Cruise off':'Cruise on';document.querySelector('[data-action="ramp"]').style.display=state.mode==='access'?'':'none';document.querySelector('[data-action="priority"]').style.display=state.mode==='priority'?'':'none';document.querySelector('[data-action="recover"]').style.display=state.crashed?'':'none';}
const rainPositions=new Float32Array(1200*6);
for(let i=0;i<1200;i++){let x=(Math.random()-.5)*90,y=Math.random()*40,z=(Math.random()-.5)*90;rainPositions.set([x,y,z,x-.18,y-1.2,z-.08],i*6);}
const rainGeometry=new T.BufferGeometry();rainGeometry.setAttribute('position',new T.BufferAttribute(rainPositions,3));const rainEffect=new T.LineSegments(rainGeometry,new T.LineBasicMaterial({color:0xc6e4e9,transparent:true,opacity:.22,depthWrite:false}));rainEffect.frustumCulled=false;scene.add(rainEffect);
async function boot(){try{let loaded=0;streetKit=(await loader.loadAsync(asset('street-kit.glb'))).scene;environment=buildEnvironment(scene,streetKit);railway=createRailway(scene,(await loader.loadAsync(asset('tuen-ma-train.glb'))).scene);const model=await loader.loadAsync(asset('art.glb'));vehicle=setupTram(model);manifest=await fetch(asset('asset-manifest.json')).then(r=>{if(!r.ok)throw Error('Asset manifest unavailable');return r.json();});
 for(const st of STOPS){const g=await loader.loadAsync(asset(`station-${st.id}.glb`));const root=g.scene;root.updateMatrixWorld(true);root.traverse(n=>{if(!n.isMesh)return;const transform=n.matrixWorld.clone(),inverse=transform.clone().invert(),positions=n.geometry.attributes.position,v=new T.Vector3();for(let i=0;i<positions.count;i++){v.fromBufferAttribute(positions,i).applyMatrix4(transform);v.y+=sample(st.s-v.z).y-sample(st.s).y;v.applyMatrix4(inverse);positions.setXYZ(i,v.x,v.y,v.z);}positions.needsUpdate=true;n.geometry.computeVertexNormals();n.geometry.computeBoundingSphere();});root.position.copy(point(st.s));root.rotation.y=sample(st.s).heading;root.traverse(n=>{if(n.isMesh){n.castShadow=true;n.receiveShadow=true;if(/_tile$/.test(n.name)){n.material=n.material.clone();n.material.color.set(0xffffff);n.material.map=[environment.materials.walkGrey.map,environment.materials.walkBuff.map,environment.materials.walk.map][Number(st.id.slice(1))%3];n.material.roughness=.97;const p=n.geometry.attributes.position,uv=[];n.updateWorldMatrix(true,false);for(let i=0;i<p.count;i++){const v=new T.Vector3().fromBufferAttribute(p,i).applyMatrix4(n.matrixWorld);uv.push(v.x/3.2,v.z/3.2);}n.geometry.setAttribute('uv',new T.Float32BufferAttribute(uv,2));}if(/_platform_.*_light$/.test(n.name))n.visible=false;}});for(const platform of st.platforms){
  // Hangs clear of the roof underside (as low as 3.11 m on the pitched A3–A7 roofs) and follows the same gradient as the roof, so it never pokes through.
  const geo=new T.BoxGeometry(.18,.05,72,1,1,36).translate(-platform.side*(7.05+st.width*.5),3.0,-platform.centerOffset),p=geo.attributes.position;
  for(let i=0;i<p.count;i++)p.setY(i,p.getY(i)+sample(st.s-p.getZ(i)).y-sample(st.s).y);
  const strip=new T.Mesh(geo,new T.MeshBasicMaterial({color:0xfff1dd}));strip.name='Station canopy LED';strip.visible=false;root.add(strip);}await addStationAdverts(root,st,manifest.stations.find(m=>m.id===st.id).platforms,asset(`adverts/${st.id}.png`),Math.min(8,renderer.capabilities.getMaxAnisotropy()),s=>sample(s).y);scene.add(root);stations.push({root,s:st.s});$('#load-detail').textContent=`Loading ${st.name} · ${++loaded}/7 stations`;
 }
 const tramAdverts=await loadTramAdverts(asset,Math.min(8,renderer.capabilities.getMaxAnisotropy()));
 for(let i=0;i<17;i++){const dir=i%2?-1:1,tram=setupTram(model,true),campaign=tramCampaign(i);applyTramAdvert(tram,tramAdverts.find(c=>c.id===campaign?.id));ai.push({...tram,dir,homeDir:dir,active:false});}
 const dr=sample(DEPOT.s);for(let n=0;n<5;n++){const parked=setupTram(model,true);parked.isDepot=true;parked.sections.forEach((g,i)=>{const lat=50+i*10.6,along=[-55,-35,35,55,75][n];g.position.set(dr.x+dr.lx*lat+dr.tx*along,dr.y+.08,dr.z+dr.lz*lat+dr.tz*along);g.rotation.y=Math.atan2(dr.lx,dr.lz);g.name='depot-vehicle-'+(n+1)+'-section-'+i;});depotVehicles.push(parked);}
 makeSignals();makeTraffic();makeStreetLife();makeBirds();makeStopMarkers();makeAvatar();collectSolids(scene,[sky,windParticles,rainEffect,player.group,...[...walkerObjects,...crossers,...plazaPeople,...cyclists,...bikes,...birds].map(a=>a.group)]);resetStreetLife();state.s=stopTarget(STOPS[1]);state.lat=5.4;poseTram(vehicle,state.s,state.lat);environment.update(state.s);weather();ready=true;$('#load').classList.add('hidden');show('menu');audio.initAudio();audio.updateMusic(state);requestAnimationFrame(frame);
 }catch(e){errors.push(String(e));$('#load-detail').textContent='Could not load the game: '+e.message;$('#load').classList.add('failed');console.error(e);}}
function frame(now){requestAnimationFrame(frame);const rawFrame=(now-last);const dt=clamp(rawFrame/1000,.001,.05);last=now;elapsed+=dt;
 if(state.screen==='driving'){if(ffRate>1){const why=ffBlock();if(why){ffRate=1;toast('Fast-forward off · '+why);}}let rest=dt*(window.__sgmts?.simulationRate||1)*ffRate;while(rest>0){let d=Math.min(rest,1/60);if(state.avatar==='drive')update(d);else{const held=[...keys];keys.clear();update(d);held.forEach(k=>keys.add(k));}actors(d);if(state.avatar!=='drive')updateAvatar(d);rest-=d;}state.frameTimes.push(rawFrame);if(state.frameTimes.length>90000)state.frameTimes.shift();state.frames++;}
 if(state.screen==='menu'){state.time+=dt;actors(dt);poseTram(vehicle,state.s,state.lat);}
 const subjectS=state.mode==='turnback'?0:viewS();environment.update(subjectS,elapsed);for(const st of stations)st.root.visible=Math.abs(st.s-subjectS)<600;for(const b of bikes)b.group.visible=Math.abs(b.s-subjectS)<400;aim(dt);railway.update(state.time,camera);audio.updateRailwaySound(railway.trains,camera,state.screen==='driving'||state.screen==='menu',dt);lightScene();audio.updateMusic(state);for(const a of depotVehicles)for(const g of a.sections)g.visible=Math.abs(subjectS-DEPOT.s)<700;if(hudTick++%5===0)hud();
 // One reminder per journey, the first time the driver is stationary, that the cab can be left.
 if(state.screen==='driving'&&state.mode!=='free'&&state.avatar==='drive'&&!state.walkTip&&state.time>8&&Math.abs(state.v)<.05&&state.phase!=='boarding'){state.walkTip=true;toast('Tip · press Enter to get out: walk around, ride a parked bike or board any ART · 按 Enter 落車',7);}if(toastTime>0){toastTime-=dt;if(toastTime<=0)$('#toast').classList.remove('visible');}rainEffect.visible=state.condition==='rain';if(rainEffect.visible){rainEffect.position.copy(state.mode==='free'||state.avatar!=='drive'?camera.position:vehicle.sections[0].position);rainEffect.position.y-=elapsed*16%30;}atmosphere.update(dt,elapsed,look.y);atmosphere.render();}
addEventListener('resize',()=>{renderer.setSize(innerWidth,innerHeight);atmosphere.setSize(innerWidth,innerHeight);camera.aspect=innerWidth/innerHeight;camera.updateProjectionMatrix();});
window.__sgmts={state,atmosphere,STOPS,LENGTH,END_STOP,sample,LOOP,renderer,scene,camera,errors,reset,action,stopTarget,dockError,get ready(){return ready;},get vehicle(){return vehicle;},get manifest(){return manifest;},get signals(){return signalObjects;},get environment(){return environment;},get railway(){return railway;},railwaySoundStatus:audio.railwaySoundStatus,get traffic(){return traffic;},get ai(){return ai;},get crossers(){return crossers;},get cyclists(){return cyclists;},actors,update,terminalStep,terminalLength,weather,lightScene,nextDispatch,get depotVehicles(){return depotVehicles;},get walkers(){return walkerObjects;},player,bikes,toggleAvatar,talk,updateAvatar,orbit,keys,aim,get birds(){return birds;},get stations(){return stations;},CAMERAS,signalAt,JUNCTIONS,setCamera:n=>{state.cam=n;resetOrbit();firstCamera=true;},pose:()=>poseTram(vehicle,state.s,state.lat),musicStatus:audio.musicStatus,announcementStatus:audio.announcementStatus,announce:audio.announce,proof:false,simulationRate:1,get ff(){return ffRate;},ffBlock,hudOverlaps,coach:()=>{const st=STOPS[state.index];return coach(st,st?(stopTarget(st)-state.s)*travelDirection():0,state.mode==='turnback',state.mode==='explore');},makeSchedule,clockText,NOSE};
boot();

function drawMinimap(){
 const c=$('#minimap'),x=c.getContext('2d'),expanded=document.body.classList.contains('map-expanded'),pts=Array.from({length:240},(_,i)=>sample(LENGTH*i/239));
 if(c.height!==(expanded?430:190))c.height=expanded?430:190;
 if(!expanded){drawNearbyMap(x);return;}
 const minX=Math.min(...pts.map(p=>p.x)),maxX=Math.max(...pts.map(p=>p.x)),minZ=Math.min(...pts.map(p=>p.z)),maxZ=Math.max(...pts.map(p=>p.z));
 const scale=Math.min(78/(maxX-minX),278/(maxZ-minZ)),map=p=>[64+(p.x-(minX+maxX)/2)*scale,35+(p.z-minZ)*scale];
 x.clearRect(0,0,190,430);x.fillStyle='#12372ff2';x.fillRect(0,0,190,430);
 x.font='bold 14px sans-serif';x.fillStyle='#eaf3ed';x.fillText('LIVE ROUTE    ×',12,20);
 x.strokeStyle='#c4d8ce';x.lineWidth=3;x.beginPath();pts.forEach((p,i)=>x[i?'lineTo':'moveTo'](...map(p)));x.stroke();
 const station=(a,b)=>{x.fillStyle='#12372f';x.strokeStyle='#fff4ce';x.lineWidth=2;x.beginPath();x.arc(a,b,4,0,Math.PI*2);x.fill();x.stroke();};
 const tram=(a,b)=>{x.fillStyle='#51d7ff';x.strokeStyle='#12372f';x.lineWidth=1;x.fillRect(a-3,b-5,6,10);x.strokeRect(a-3,b-5,6,10);};
 const player=(a,b)=>{x.fillStyle='#ffbf57';x.strokeStyle='#102d26';x.lineWidth=1.5;x.beginPath();x.moveTo(a,b-7);x.lineTo(a+6,b+5);x.lineTo(a-6,b+5);x.closePath();x.fill();x.stroke();};
 x.font='bold 14px sans-serif';for(const st of STOPS){const [a,b]=map(sample(st.s));station(a,b);x.fillStyle='#fff4ce';x.fillText(st.zh,a-40,b+5);}
 let lastSignalY=0;for(const sig of signalObjects.filter(s=>!s.underpass).sort((a,b)=>map(sample(a.centre))[1]-map(sample(b.centre))[1])){const [a,roadY]=map(sample(sig.centre)),b=Math.max(roadY,lastSignalY+42),phase=signalAt(sig),color=phase==='go'?'#62f59b':phase==='amber'?'#ffd05a':'#ff7770';
  x.strokeStyle='#8aa99b';x.lineWidth=1;x.setLineDash([2,3]);x.beginPath();x.moveTo(a,roadY);x.lineTo(123,b);x.stroke();x.setLineDash([]);lastSignalY=b;
  x.strokeStyle='#e3ede7';x.beginPath();x.moveTo(a-6,roadY-3);x.lineTo(a+6,roadY+3);x.stroke();
  x.fillStyle='#071b17';x.fillRect(124,b-13,12,28);for(let i=0;i<3;i++){x.fillStyle=(phase==='go'?2:phase==='amber'?1:0)===i?color:'#3c5048';x.beginPath();x.arc(130,b-8+i*9,3,0,Math.PI*2);x.fill();}
  x.font='bold 12px sans-serif';x.fillStyle='#eef5f0';x.fillText(sig.name.replace('Road ','').replace('Crossing road','J1'),141,b-3);x.font='11px sans-serif';x.fillStyle=color;x.fillText(phase==='go'?'GO':phase==='amber'?'WAIT':'STOP',141,b+10);
  if(sig.underpass){x.fillStyle='#bfcec5';x.fillText('below',141,b+23);}
 }
 const dp=map(depotCurve.getPointAt(1)),junction=map(sample(DEPOT.s));x.strokeStyle='#bac9bc';x.beginPath();x.moveTo(...junction);x.lineTo(junction[0]+28,junction[1]-12);x.stroke();x.fillStyle='#e2d3f8';x.fillRect(junction[0]+25,junction[1]-15,7,7);x.font='11px sans-serif';x.fillText('Depot',junction[0]+34,junction[1]-9);
 for(const a of ai)if(a.active){const [u,v]=map(a.sections[0].position);directionMarker(x,u,v,a.dir===1?0:Math.PI,'#51d7ff',6);}
 if(vehicle){const [a,b]=map(vehicle.sections[0].position);x.save();x.translate(a,b);x.rotate(state.returning?Math.PI:0);player(0,0);x.restore();}
 x.strokeStyle='#607e70';x.beginPath();x.moveTo(12,329);x.lineTo(178,329);x.stroke();
 x.font='14px sans-serif';player(20,349);x.fillStyle='#edf4ef';x.fillText('You',34,354);directionMarker(x,101,349,0,'#51d7ff',4);x.fillText('Other ART',112,354);
 station(20,377);x.fillStyle='#edf4ef';x.fillText('Station',34,382);
 x.font='12px sans-serif';x.fillStyle='#c6d8cd';x.fillText('Traffic lights → road + phase',12,405);x.fillText('J1 = crossing road',12,421);
}

function directionMarker(x,a,b,angle,color,size=6){x.save();x.translate(a,b);x.rotate(angle);x.fillStyle=color;x.strokeStyle='#102d26';x.lineWidth=1;x.beginPath();x.moveTo(0,-size);x.lineTo(size*.7,size);x.lineTo(0,size*.5);x.lineTo(-size*.7,size);x.closePath();x.fill();x.stroke();x.restore();}
function drawNearbyMap(x){const g=state.avatar!=='drive'?player:state.mode==='free'?sample(state.freeS):vehicle?.sections[0].position||sample(state.s),scale=.14,map=p=>[95+(p.x-g.x)*scale,92+(p.z-g.z)*scale];x.clearRect(0,0,190,190);x.fillStyle='#12372fed';x.fillRect(0,0,190,190);x.strokeStyle='#bbd0c5';x.lineWidth=4;x.beginPath();for(let s=0;s<=LENGTH;s+=10){const p=map(sample(s));s?x.lineTo(...p):x.moveTo(...p);}x.stroke();x.beginPath();for(let i=0;i<=30;i++){const p=map(depotCurve.getPointAt(i/30));i?x.lineTo(...p):x.moveTo(...p);}x.stroke();const dp=map(depotCurve.getPointAt(1));x.fillStyle='#decaf7';x.fillRect(dp[0]-5,dp[1]-5,10,10);x.font='bold 14px sans-serif';x.fillText('Depot',dp[0]+9,dp[1]+5);
 for(const st of STOPS){const [a,b]=map(sample(st.s));x.fillStyle='#fff3cc';x.beginPath();x.arc(a,b,4,0,7);x.fill();x.fillText(st.zh,a+9,b+5);}for(const sig of signalObjects.filter(s=>!s.underpass)){const [a,b]=map(sample(sig.centre)),phase=signalAt(sig);x.fillStyle=phase==='go'?'#5cf397':phase==='amber'?'#ffd05a':'#ff7770';x.fillRect(a-5,b-5,10,10);}
 for(const a of ai)if(a.active){const p=a.sections[0].position,r=sample(a.s);directionMarker(x,...map(p),Math.atan2(r.tx,-r.tz)+(a.dir===1?0:Math.PI),'#51d7ff',5);}const r=sample(state.s);directionMarker(x,...(state.avatar==='drive'?[95,92]:map(vehicle.sections[0].position)),Math.atan2(r.tx,-r.tz)+(state.returning?Math.PI:0),'#ffbf57',8);if(state.avatar!=='drive'){x.fillStyle='#fff';x.strokeStyle='#102d26';x.lineWidth=2;x.beginPath();x.arc(95,92,5,0,7);x.fill();x.stroke();}x.fillStyle='#f0f4ec';x.font='12px sans-serif';x.fillText('N ↑',85,20);x.fillText('ROUTE  ⤢',67,177);
}

function poseBranch(curve,distance){const length=curve.getLength();vehicle.sections.forEach((g,i)=>{const u=clamp((distance-i*10.6)/length,0,1),p=curve.getPointAt(u),t=curve.getTangentAt(u);if(distance-i*10.6<0)p.addScaledVector(t,distance-i*10.6);g.position.copy(p);g.position.y+=.025;g.rotation.set(0,Math.atan2(-t.x,-t.z)+(vehicle.flipped?Math.PI:0),0);if(i){const prior=vehicle.sections[i-1].localToWorld(new T.Vector3(0,.9,vehicle.flipped?-5.3:5.3)),front=g.localToWorld(new T.Vector3(0,.9,vehicle.flipped?5.3:-5.3));g.position.add(prior.sub(front));}});}
function updateBranch(dt){const braking=state.mobileBrake||keys.has('KeyS'),go=state.cruise||keys.has('KeyW'),locked=tractionLocked(state);state.door=smooth(state.door,state.doorTarget,dt*2.8);if(Math.abs(state.door-state.doorTarget)<.003)state.door=state.doorTarget;state.v=Math.max(0,Math.min(state.depotRoute?4:mobile?(state.speedSetting||0)/3.6:9,state.v+(locked||braking?-2.5:go?1.1:-.15)*dt));if(braking&&state.v<.1){state.v=0;state.park=true;state.mobileBrake=false;}
 if(state.depotRoute){const curve=state.branchCurve||depotCurve;const movement=approachStep(state.branchDistance,state.v,1,state.v,curve.getLength(),dt);state.branchDistance=movement.position;state.v=movement.speed;poseBranch(curve,state.branchDistance);state.s=project(vehicle.sections[0].position.x,vehicle.sections[0].position.z);if(state.branchDistance>=curve.getLength()){if(state.depotOutbound){state.s=DEPOT.s+state.depotExitDir*55;state.lat=laneOffset(state.s,state.depotExitDir);state.returning=state.depotExitDir===-1;vehicle.isAI=state.returning;vehicle.posed=false;state.depotRoute=false;state.yaw=0;}else{state.v=0;state.park=true;}}}else if(vehicle.terminal==='loop'){vehicle.v=state.v;if(!locked&&!braking)terminalStep(vehicle,dt);state.v=vehicle.v;if(!vehicle.terminal){state.returning=false;vehicle.isAI=false;state.s=35;state.lat=laneOffset(35);state.yaw=0;state.index=0;vehicle.posed=false;}}else{let stop=35;const next=STOPS[state.index];if(next&&state.mode!=='explore')stop=stopTarget(next);for(const sig of signalObjects.filter(s=>!s.underpass)){const line=sig.centre+sig.stop;if(line<state.s&&signalAt(sig)!=='go')stop=Math.max(stop,line);}stop=Math.max(stop,followingStop(state.s,-1,ai));for(const c of crossers)if(playerYields(c)&&c.s<state.s)stop=Math.max(stop,c.s+9);const move=approachStep(state.s,state.v,-1,state.v,stop,dt);state.s=move.position;state.v=move.speed;state.lat=returnOffset(state.s);poseTram(vehicle,state.s,state.lat,true,state.door);for(const d of vehicle.doors){d.node.position.copy(d.base);if(d.side===state.doorSide)d.node.position.z+=state.door*.75*(d.node.name.endsWith('_0')?1:-1);}if(state.s<=35.03&&state.mode==='explore'){vehicle.terminal='loop';vehicle.loopDistance=0;vehicle.dir=-1;vehicle.s=35;vehicle.active=true;nextDispatch[1]=0;}}
 audio.setDrive(state.v*3.6,go);}
