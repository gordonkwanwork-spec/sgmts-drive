import * as T from 'three';
import {GLTFLoader} from 'three/addons/loaders/GLTFLoader.js';
import {RoomEnvironment} from 'three/addons/environments/RoomEnvironment.js';
import {Sky} from 'three/addons/objects/Sky.js';
import {LENGTH,STOPS,sample,fromChainage,toChainage,LOOP,roadSection,project,END_STOP,CROSSINGS,cycleOffset,cycleHeight,DEPOT} from './alignment.js';
import {buildEnvironment,JUNCTIONS,UNDERPASSES} from './environment.js';
import {energyFlow,boxesOverlap,SCENARIOS} from './simulation.js';
import * as audio from './audio.js';
import './experience.css';
const asset=f=>import.meta.env.BASE_URL+'assets/'+f;
import {tractionLocked,verticalOverlap,doorsFit,driveStep,angleDelta,freeStep,MAX_WHEEL_ANGLE,approachStep,followingStop} from './operating.js';
const $=s=>document.querySelector(s),clamp=(x,a,b)=>Math.max(a,Math.min(b,x)),smooth=(a,b,t)=>a+(b-a)*clamp(t,0,1);
const point=(s,lat=0)=>{let p=sample(s);return new T.Vector3(p.x+p.lx*lat,p.y,p.z+p.lz*lat);};
const state={screen:'loading',mode:'service',condition:'morning',headway:300,s:STOPS[0].s+10.6,v:0,lat:5.4,steer:0,yaw:0,park:true,door:0,doorTarget:0,doorSide:1,ramp:0,rampTarget:0,index:0,phase:'approach',dwell:0,pax:0,score:0,energy:0,regen:0,battery:92,time:0,cruise:false,guide:true,cam:0,muted:false,indicator:0,accel:0,travel:0,served:[],missed:[],incidents:0,penalties:0,crashed:false,hold:0,priority:false,loopS:0,loopDone:false,requestAck:false,requestRequired:false,freeX:0,freeY:0,freeZ:0,freeS:0,freeSpeed:0,freeHeading:0,frameTimes:[],frames:0};
const keys=new Set(), errors=[];let ready=false,vehicle,ai=[],depotVehicles=[],stations=[],signalObjects=[],traffic=[],walkerObjects=[],crossers=[],cyclists=[],last=performance.now(),hudTick=0,elapsed=0,toastTime=0,cruiseTarget=0;
const CAMERAS=['Chase / 跟隨','Driver / 駕駛室','Trackside / 路旁','Overview / 鳥瞰','Front / 車頭','Boarding / 上落客'];
document.body.innerHTML=`<div id="viewport"></div><div id="load"><span class="overline">SGMTS / PHASE ONE</span><h1>Preparing your route.</h1><p id="load-detail">Loading Blender vehicle and stations…</p><div class="load-track"><i></i></div></div>
<div id="identity"><span class="brand-dot"></span><strong>SGMTS <span>DRIVE</span></strong><small>洪水橋 · 廈村</small></div>
<div id="top-actions"><label class="operation-control">Headway <select id="headway" aria-label="SGMTS departure headway"><option value="120">2 min</option><option value="180">3 min</option><option value="240">4 min</option><option value="300" selected>5 min</option></select></label><button id="night">Night</button><button id="sound">Sound on</button><button id="camera">C · Camera</button><button id="pause">Ⅱ Pause</button></div>
<section id="menu" class="sheet hidden"><div class="overline">HUNG SHUI KIU / HA TSUEN</div><h1>A new perspective.<br><em>Every journey.</em></h1><p class="subhead">智慧綠色集體運輸系統 · 第一期</p><p class="intro">Drive the articulated electric service through seven stations,<br>or roam freely across the whole map.</p><div class="facts"><span><b>07</b> stations</span><span><b>4.5</b> km profile</span><span><b>04</b> conditions</span></div><div class="choices"><label>Operating conditions<select id="condition"><option value="morning">Morning local · 早晨班次</option><option value="sunset">Golden hour · 黃昏班次</option><option value="rain">Rainy rush hour · 雨天繁忙時段</option><option value="night">Night service · 夜間班次</option></select></label><label>Your drive<select id="mode"><option value="service">Full service · 七站服務</option><option value="access">Accessible service · 無障礙服務</option><option value="priority">Request & priority · 預約停站挑戰</option><option value="turnback">A1 turnback · 總站精準駕駛</option><option value="explore">Explore the whole line · 全線探索</option><option value="free">Free roam · 自由探索</option></select></label></div><button id="begin" class="primary">Begin journey <span>開始駕駛 ↗</span></button><p class="note">Drive: W/R/S + A/D · Free roam: WASD + Shift + Space/Ctrl</p><details><summary>Controls & route information</summary><p>Free roam uses WASD, Shift to move faster, Space/Ctrl for altitude, and drag to look. Driving: W forward · R reverse · S brake · G guidance · C camera · drag to rotate · wheel / + / − zoom · 0 reset view · B ramp · Q priority/acknowledge · X door side · Z indicator · H horn · P pause.</p></details></section>
<div id="hud" class="hidden"><div id="next-panel"><small id="service-label">LINE 01 · NORTHBOUND</small><h2 id="next">A1</h2><div id="next-distance"></div><div id="signal-status"></div></div><div id="score-panel"><small>SERVICE SCORE</small><b id="score">0000</b><span id="pax"></span><span id="schedule"></span></div><div id="instruction" role="status"></div><div id="dwell"><i></i><span></span></div><div id="cluster"><div class="speed"><b id="speed">0</b><span>km/h</span><div id="limit">40</div></div><div class="switches"><span id="brake-status"></span><span id="door-status"></span><span id="guide-status"></span><span id="camera-status"></span></div></div><div id="telemetry"></div><div id="route-strip">${STOPS.map(st=>`<div data-stop="${st.id}"><i></i><span>${st.id}</span></div>`).join('')}</div><div id="buttons"><button data-action="park">Space · Brake</button><button data-action="doors">E · Doors</button><button data-action="cruise">V · Cruise</button><button data-action="guide">G · Guidance</button><button data-action="ramp">B · Ramp</button><button data-action="priority">Q · Request</button><button data-action="recover">Recover vehicle</button></div></div>
<div id="toast" role="status"></div><div id="pause-sheet" class="modal hidden"><small>TAKE A BREATH</small><h1>Journey paused.</h1><button id="resume" class="primary">Continue / 繼續 ↗</button><button class="menu-return">Return to menu</button></div><div id="report" class="modal hidden"><small>OPERATIONAL PERFORMANCE</small><h1>Journey complete.</h1><div id="report-grade"></div><div id="report-data"></div><button class="menu-return primary">Another journey / 再次出發 ↗</button><button id="explore-tail">Explore beyond A7</button></div><div id="footnote">DRAWING-LED INTERPRETATION · 圖則參考模擬</div>`;
const renderer=new T.WebGLRenderer({antialias:true,powerPreference:'high-performance'});renderer.setSize(innerWidth,innerHeight);renderer.setPixelRatio(Math.min(devicePixelRatio,1.5));renderer.outputColorSpace=T.SRGBColorSpace;renderer.toneMapping=T.ACESFilmicToneMapping;renderer.toneMappingExposure=1.05;renderer.shadowMap.enabled=true;renderer.shadowMap.type=T.PCFSoftShadowMap;$('#viewport').appendChild(renderer.domElement);
const scene=new T.Scene(),camera=new T.PerspectiveCamera(48,innerWidth/innerHeight,.15,1600);scene.fog=new T.FogExp2(0xb8cdd6,.0012);
const sky=new Sky();sky.scale.setScalar(45000);sky.material.uniforms.turbidity.value=3;sky.material.uniforms.rayleigh.value=1.25;sky.material.uniforms.mieCoefficient.value=.005;sky.material.uniforms.mieDirectionalG.value=.83;sky.material.uniforms.sunPosition.value.set(-.5,.4,-.3);scene.add(sky);
const pmrem=new T.PMREMGenerator(renderer),room=new RoomEnvironment();scene.environment=pmrem.fromScene(room,.04).texture;room.dispose();pmrem.dispose();scene.environmentIntensity=.7;
const ambient=new T.HemisphereLight(0xd1e2e7,0x697461,.7);scene.add(ambient);const sun=new T.DirectionalLight(0xffe5bd,3.0);sun.castShadow=true;sun.shadow.mapSize.set(2048,2048);Object.assign(sun.shadow.camera,{left:-95,right:95,top:95,bottom:-95,near:1,far:480});sun.shadow.bias=-.00025;sun.shadow.normalBias=.035;scene.add(sun,sun.target);
const environment=buildEnvironment(scene),loader=new GLTFLoader();let manifest;
window.addEventListener('error',e=>errors.push(e.message));window.addEventListener('unhandledrejection',e=>errors.push(String(e.reason)));
function toast(text){$('#toast').textContent=text;$('#toast').classList.add('visible');toastTime=4;}
function meshBox(w,h,d,color){return new T.Mesh(new T.BoxGeometry(w,h,d),new T.MeshStandardMaterial({color,roughness:.65}));}
function setupTram(gltf,isAI=false){
 const root=gltf.scene.clone(true),sections=[];scene.add(root);
 for(const name of ['section_front','section_mid','section_rear']){let g=root.getObjectByName(name);if(!g)throw Error('Missing Blender node '+name);root.updateMatrixWorld(true);scene.attach(g);sections.push(g);}
 scene.remove(root);const doors=[],wheels=[],lights=[];
 sections.forEach((g,si)=>g.traverse(n=>{if(n.isMesh){n.castShadow=true;n.receiveShadow=true;if(n.material){n.material.envMapIntensity=.8;}}
 if(/_door_(left|right)_[01]$/.test(n.name))doors.push({node:n,base:n.position.clone(),side:n.name.includes('_left_')?1:-1,si});
 if(n.name.includes('_wheel_'))wheels.push(n);
 if(n.name.includes('light'))lights.push(n);
 }));
 return {sections,doors,wheels,lights,yaws:[0,0,0],isAI,s:1000,lat:-1.9,v:7,door:0};
}
function poseTram(t,s,lat,reverse=false,door=0,loop=false){
 const spacing=10.6;let prev=null;
 t.sections.forEach((g,i)=>{
  let p;
  if(loop){const r=LOOP.sample(s-i*spacing);p={...r,lx:r.tz,lz:-r.tx,heading:Math.atan2(-r.tx,-r.tz),grade:0};}
  else p=sample(clamp(s+(reverse?i:-i)*spacing,0,LENGTH));
  let pos=new T.Vector3(p.x+p.lx*lat,p.y+.025,p.z+p.lz*lat);
  let heading=p.heading+(reverse?Math.PI:0)+(t.flipped?Math.PI:0)+(t.isAI?0:t.yaws[i]),pitch=Math.atan(p.grade)*(reverse?-1:1)*(t.flipped?-1:1);
  if(!t.isAI&&!state.guide&&prev&&t.posed&&Math.abs(state.v)>.001){const hitch=prev.localToWorld(new T.Vector3(0,0,5.3)),axle=g.localToWorld(new T.Vector3(0,0,3.1));heading=Math.atan2(-(hitch.x-axle.x),-(hitch.z-axle.z));}
  g.position.copy(pos);g.rotation.set(pitch,heading,0,'YXZ');
  // Each section follows the measured path; hitch pose is continuous rather than a canned animation.
  if(prev){let prior=prev.localToWorld(new T.Vector3(0,.9,t.flipped?-5.3:5.3)),front=g.localToWorld(new T.Vector3(0,.9,t.flipped?5.3:-5.3));g.position.add(prior.sub(front));}
  prev=g;
 });
 t.posed=true;
 for(const d of t.doors){d.node.position.copy(d.base);const open=t.isAI?(d.side===(t.flipped?-1:1)?door:0):(d.side===state.doorSide?door:0);d.node.position.z+=open*.75*(d.node.name.endsWith('_0')?1:-1);}
 for(const w of t.wheels){w.rotation.x=elapsed*(t.isAI?t.v:state.v)/.46;if(!t.isAI&&w.name.startsWith('section_front'))w.rotation.y=state.steer*MAX_WHEEL_ANGLE;}
}
const junctions=JUNCTIONS;
function makeSignals(){
 for(const j of junctions){const r=sample(j.s);if(r.elevated)continue;const sig={...j,s:j.s-j.stop,centre:j.s,passed:false,heads:[]};signalObjects.push(sig);
  for(const side of [-1,1])for(const axis of ['corridor','side']){const local=new T.Vector3(axis==='corridor'?-side*(roadSection(j.s).right+1):side*(roadSection(j.s).right+14),0,axis==='corridor'?side*j.stop:side*(j.halfWidth+1)),group=new T.Group();local.applyAxisAngle(new T.Vector3(0,1,0),r.heading);group.position.set(r.x+local.x,r.y,r.z+local.z);group.rotation.y=r.heading+(axis==='corridor'?(side===1?0:Math.PI):side*Math.PI/2);
   const pole=meshBox(.14,4.9,.14,0x53615c);pole.position.y=2.45;group.add(pole);const housing=meshBox(.5,1.55,.32,0x142522);housing.position.set(0,4.3,0);group.add(housing);const bulbs=[];
   [0xff4237,0xffc84c,0x50ff96].forEach((col,k)=>{const bulb=new T.Mesh(new T.CircleGeometry(.14,14),new T.MeshBasicMaterial({color:col}));bulb.position.set(0,4.78-k*.47,.17);group.add(bulb);bulbs.push(bulb);});scene.add(group);sig.heads.push({group,bulbs,axis});
  }
 }
}
function signalAt(sig,side=false){const t=((state.time+sig.offset)%42+42)%42;return side?(t>=30&&t<39?'go':t>=39&&t<40?'amber':'stop'):(t<25?'go':t<28?'amber':'stop');}
function nextSignal(){return signalObjects.find(s=>s.s+1>state.s);}
// ponytail: finite straight crossing routes recycle off-scene; use a road network if turning traffic is required.
function makeTraffic(){
 const routes=[...junctions.flatMap(junction=>[-1,1].flatMap(dir=>Array.from({length:3},(_,n)=>({junction,dir,along:-dir*1.9,start:-dir*(25+n*18)})))),...UNDERPASSES.flatMap(junction=>[-1,1].flatMap(dir=>Array.from({length:6},(_,n)=>({junction,dir,along:-dir*(n%2?6.5:2.2),start:-dir*(100-n*32)}))))];
 const types=[['car',1.8,4.2,1.6,0xb7bfc0],['taxi',1.8,4.7,1.65,0xbb3431],['van',2,5.5,2.5,0xe4dfd0],['truck',2.4,8.5,3.2,0x567976],['bus',2.5,11,3.5,0xd9b15d]];
 for(let i=0;i<routes.length;i++){const route=routes[i],[kind,w,length,height,color]=types[i%types.length],group=new T.Group(),body=meshBox(w,height-.55,length,color);body.position.y=(height+.55)/2;group.add(body);
  const glass=meshBox(w+.015,kind==='bus'?1.35:.65,kind==='truck'?1.7:length*.65,0x344e51);glass.position.set(0,height-.45,kind==='truck'?-length/2+1.1:0);group.add(glass);
  if(kind==='taxi'){const roof=meshBox(1.6,.12,2.6,0xe3e2dc);roof.position.y=height+.04;group.add(roof);const sign=meshBox(.6,.2,.25,0xf7e4b2);sign.position.y=height+.2;group.add(sign);}
  for(const x of [-w/2,w/2])for(const z of [-length*.32,length*.32]){const wheel=new T.Mesh(new T.CylinderGeometry(.36,.36,.17,12),new T.MeshStandardMaterial({color:0x252925}));wheel.rotation.z=Math.PI/2;wheel.position.set(x,.39,z);group.add(wheel);}
  for(const rear of [-1,1])for(const side of [-1,1]){const lamp=meshBox(.25,.18,.04,rear===-1?0xfff4ce:0xce3327);lamp.position.set(side*w*.34,.9,rear*(length/2+.025));group.add(lamp);}
  group.name='traffic-'+kind;group.traverse(n=>{if(n.isMesh)n.castShadow=true;});scene.add(group);traffic.push({group,...route,kind,width:w,length,height,lat:route.start,start:route.start,v:0,cross:true});
 }
 const clothes=[0x577d77,0xbb815f,0x6d747d,0xdbc5a1],skin=[0xcaa17d,0xb88865,0xe0b995];
 STOPS.forEach((st,i)=>{for(let j=0;j<9;j++){const g=new T.Group(),limbs=[];
  const part=(geo,color,x,y,z,parent=g)=>{const m=new T.Mesh(geo,new T.MeshStandardMaterial({color,roughness:.8}));m.position.set(x,y,z);m.castShadow=true;parent.add(m);return m;};
  part(new T.CapsuleGeometry(.22,.45,4,10),clothes[j%4],0,1.06,0);part(new T.SphereGeometry(.16,12,10),skin[j%3],0,1.65,0);const hair=part(new T.SphereGeometry(.163,12,8,0,Math.PI*2,0,Math.PI*.58),0x302c29,0,1.69,0);
  for(const side of [-1,1]){const arm=new T.Group();arm.position.set(side*.27,1.33,0);g.add(arm);part(new T.CapsuleGeometry(.075,.38,3,8),clothes[j%4],0,-.25,0,arm);part(new T.SphereGeometry(.075,8,6),skin[j%3],0,-.53,0,arm);const leg=new T.Group();leg.position.set(side*.12,.79,0);g.add(leg);part(new T.CapsuleGeometry(.09,.47,3,8),0x39474d,0,-.29,0,leg);part(new T.BoxGeometry(.19,.12,.3),0x252c2c,0,-.67,-.06,leg);limbs.push({arm,leg,side});}
  part(new T.BoxGeometry(.32,.39,.13),j%2?0x725c47:0x394c5a,0,1.12,.23);
  const origin=point(stopCentre(st)+(j-4)*3.1,8.35+(j%2)*.45);origin.y+=.32;g.position.copy(origin);g.rotation.y=sample(st.s).heading;scene.add(g);walkerObjects.push({group:g,station:i,origin,phase:j,limbs,progress:0,alight:j<3});
 }});
}
function makeStreetLife(){
 for(const [i,c] of CROSSINGS.entries()){const group=walkerObjects[i%walkerObjects.length].group.clone(true);group.name='crossing-pedestrian';scene.add(group);crossers.push({...c,group,dir:i%2?1:-1,wait:5+i%7,active:false});}
 for(let i=0;i<20;i++){const group=new T.Group(),rider=walkerObjects[i%walkerObjects.length].group.clone(true);rider.scale.setScalar(.8);rider.position.y=.35;group.add(rider);
  const wheels=[];for(const z of [-.6,.6]){const wheel=new T.Mesh(new T.TorusGeometry(.34,.045,6,16),new T.MeshStandardMaterial({color:0x242d2b}));wheel.rotation.y=Math.PI/2;wheel.position.set(0,.36,z);group.add(wheel);wheels.push(wheel);}
  for(const [y,z,d,angle] of [[.55,0,1.2,0],[.65,-.25,.7,-.6],[.65,.25,.7,.6]]){const bar=meshBox(.06,.06,d,0xdba751);bar.position.set(0,y,z);bar.rotation.x=angle;group.add(bar);}const handle=meshBox(.55,.055,.055,0x384842);handle.position.set(0,1.06,-.55);group.add(handle);group.name='cyclist';scene.add(group);cyclists.push({group,wheels,s:LENGTH*(i+.5)/20,dir:i%2?1:-1,v:0});
 }
}
const nextDispatch={1:300,'-1':300};
function startService(a,s){a.s=s;a.v=0;a.lat=a.dir*1.9;a.dwell=0;a.door=0;a.served=[];a.posed=false;a.active=true;a.terminal=null;a.stopIndex=a.dir===1?STOPS.findIndex(st=>stopTarget(st)>s+20):STOPS.findLastIndex(st=>st.s-10.6<s-20);if(a.dir===1&&a.stopIndex<0)a.stopIndex=7;}
function resetStreetLife(){
 for(const a of ai){if(a.flipped){a.sections.reverse();a.flipped=false;}a.dir=a.homeDir||a.dir;a.terminal=null;}
 for(const dir of [-1,1]){const pool=ai.filter(a=>a.dir===dir);pool.forEach((a,i)=>{const distance=(i+1)*state.headway*6.5;a.active=distance<LENGTH-100;if(a.active)startService(a,dir===1?35+distance:LENGTH-35-distance);a.sections.forEach(g=>g.visible=a.active);});nextDispatch[dir]=state.headway;}
 crossers.forEach((c,i)=>{const e=roadSection(c.s);c.dir=i%2?1:-1;c.lat=c.dir===1?e.left-.8:e.right+.8;c.active=false;c.wait=5+i%7;});
 cyclists.forEach((c,i)=>{c.s=LENGTH*(i+.5)/20;c.dir=i%2?1:-1;c.v=0;});
}
function updateStreetLife(dt,subjectS){
 for(const c of crossers){const edge=roadSection(c.s),finish=c.dir===1?edge.right+.8:edge.left-.8;
  if(!c.active){c.wait-=dt;const clearTime=(edge.right-edge.left+1.6)/1.3+3;
   const player=state.mode!=='free'&&state.mode!=='turnback'&&state.s>c.s-35&&state.s<c.s+28||state.mode!=='free'&&state.mode!=='turnback'&&state.v>.1&&c.s>state.s&&c.s-state.s<state.v*clearTime+12;
   const incoming=ai.some(a=>a.active&&(Math.abs(a.s-c.s)<38||(c.s-a.s)*a.dir>0&&(c.s-a.s)*a.dir<a.v*clearTime+12));
   if(c.wait<=0&&!player&&!incoming)c.active=true;
  }
  if(c.active){c.lat+=c.dir*1.3*dt;if((finish-c.lat)*c.dir<=0){c.lat=finish;c.active=false;c.dir*=-1;c.wait=18;}}
  c.group.position.copy(point(c.s,c.lat));c.group.position.y+=.035;c.group.rotation.y=sample(c.s).heading+c.dir*Math.PI/2;c.group.visible=Math.abs(c.s-subjectS)<350;
  for(const limb of c.group.children.filter(n=>n.isGroup))limb.rotation.x=c.active?Math.sin(state.time*7)*.35*Math.sign(limb.position.x):0;
  if(c.active&&c.group.visible)contact(c.group,.5,.5,1.8,'Pedestrian');
 }
 for(const c of cyclists){let stop=c.s+c.dir*1e6;
  for(const j of [...JUNCTIONS,...UNDERPASSES]){const dist=(j.s-c.s)*c.dir,line=j.s-c.dir*(j.halfWidth+2);if(dist>0&&(line-c.s)*c.dir>=0&&traffic.some(t=>t.junction===j&&Math.abs(t.lat-cycleOffset(j.s))<(t.v>.2?25:t.length/2+1)))stop=c.dir===1?Math.min(stop,line):Math.max(stop,line);}
  const move=approachStep(c.s,c.v,c.dir,4.2,stop,dt);c.s=move.position;c.v=move.speed;if(c.s>LENGTH-4||c.s<4){c.dir*=-1;c.v=0;}
  const r=sample(c.s);c.group.position.copy(point(c.s,cycleOffset(c.s)+c.dir*.85));c.group.position.y=r.groundY+cycleHeight(c.s)+.035;c.group.rotation.y=r.heading+(c.dir===1?0:Math.PI);c.group.visible=Math.abs(c.s-subjectS)<400;
 }
}

const stopCentre=st=>st.s+(st.platforms?.find(p=>p.side===1)?.centerOffset||0);
const stopTarget=st=>stopCentre(st)+10.6;
function dockError(st){
 const centre=point(stopCentre(st)),frame=sample(st.s),doors=[];
 for(const d of vehicle.doors.filter(d=>d.side===1)){const pos=d.node.parent.localToWorld(d.base.clone()),delta=pos.clone().sub(centre),along=delta.x*frame.tx+delta.z*frame.tz,lateral=delta.x*frame.lx+delta.z*frame.lz;doors.push({along,lateral,floor:pos.y-centre.y-along*frame.grade});}
 const error=Math.abs(state.s-stopTarget(st)),maxGap=Math.max(...doors.map(d=>Math.abs(7.05-d.lateral)));
 return {valid:doorsFit(doors,{length:st.length||89.6},state.doorSide)&&error<4.5,maxGap,error,doors};
}
const nightLights=Array.from({length:8},()=>{const light=new T.PointLight(0xffdfad,0,30,2);scene.add(light);return light;});
const headlights=[-1,1].map(side=>{const light=new T.SpotLight(0xe5efff,0,65,.4,.6,1.5);light.userData.side=side;scene.add(light,light.target);return light;});
function weather(){const rain=state.condition==='rain',sunset=state.condition==='sunset',night=state.condition==='night';scene.background=new T.Color(night?0x071221:0xb8cdd6);sky.visible=!night;scene.fog.color.set(night?0x071221:rain?0x9aadb1:sunset?0xcfc5b2:0xb8cdd6);scene.fog.density=rain?.0028:night?.0018:.0012;sun.color.set(night?0xaac7ed:sunset?0xffc48f:0xffe5bd);sun.intensity=night?.18:rain?1.2:sunset?2.7:3;ambient.intensity=night?.2:.7;scene.environmentIntensity=night?.12:.7;renderer.toneMappingExposure=night?1.15:.9;sky.material.uniforms.sunPosition.value.set(-.5,sunset?.13:rain?.25:.4,-.3);sky.material.uniforms.turbidity.value=rain?10:3;environment.weather(rain);for(const m of environment.nightMaterials){m.emissive.copy(m.color);m.emissiveIntensity=night?.8:0;}$('#night').textContent=night?'Day':'Night';}
function lightScene(){const night=state.condition==='night';const near=night?environment.lampPositions.map(p=>({p,d:(p.x-camera.position.x)**2+(p.z-camera.position.z)**2})).sort((a,b)=>a.d-b.d):[];nightLights.forEach((l,i)=>{const p=near[i]?.p;l.intensity=p?220:0;if(p)l.position.set(p.x,p.y-.25,p.z);});for(const l of headlights){l.intensity=night&&state.mode!=='free'?120:0;if(vehicle){l.position.copy(vehicle.sections[0].localToWorld(new T.Vector3(l.userData.side*.85,1,-5.4)));l.target.position.copy(vehicle.sections[0].localToWorld(new T.Vector3(l.userData.side*1.5,.1,-45)));}}}
$('#night').onclick=()=>{state.condition=state.condition==='night'?'morning':'night';$('#condition').value=state.condition;weather();};
$('#headway').onchange=()=>{state.headway=clamp(Number($('#headway').value)||300,120,300);for(const dir of [-1,1])nextDispatch[dir]=Math.min(nextDispatch[dir],state.time+state.headway);toast(`Departures every ${state.headway/60} minutes · existing services continue`);};

function reset(mode=$('#mode').value){Object.assign(state,{screen:'driving',mode,condition:$('#condition').value,s:stopTarget(STOPS[0]),v:0,lat:5.4,steer:0,yaw:0,park:true,door:0,doorTarget:0,doorSide:1,ramp:0,rampTarget:0,index:0,phase:'approach',dwell:0,pax:0,score:0,energy:0,regen:0,battery:92,time:0,cruise:false,guide:true,cam:0,indicator:0,accel:0,travel:0,served:[],missed:[],incidents:0,penalties:0,crashed:false,eventLog:[],priority:false,loopS:0,loopDone:false,requestAck:false,hold:0,lastKerb:-10,lastCrash:-10,lastHarsh:-10,speedingT:0,freeSpeed:0,frameTimes:[],frames:0});keys.clear();vehicle.yaws.fill(0);vehicle.posed=false;resetOrbit();firstCamera=true;walkerObjects.forEach(p=>p.progress=0);resetStreetLife();traffic.forEach((c,i)=>{c.lat=c.start;c.v=0;});signalObjects.forEach(s=>s.passed=false);if(mode==='turnback'){state.loopS=0;state.lat=0;state.s=0;state.park=true;}if(mode==='explore'){state.s=35;state.lat=1.9;}if(mode==='free'){const p=point(35,10);state.s=35;state.lat=1.9;state.freeX=p.x;state.freeY=p.y+3;state.freeZ=p.z;state.freeS=35;state.freeHeading=sample(35).heading;}document.body.dataset.mode=mode;weather();show('driving');poseTram(vehicle,state.s,state.lat,false,0,mode==='turnback');audio.initAudio();toast(mode==='turnback'?'A1 loop · release brake and complete a smooth circuit':mode==='explore'?'Explore the line · drag to rotate, scroll to zoom':mode==='free'?'Free roam · WASD move · Shift boost · Space/Ctrl altitude':'Welcome aboard · E to open the left doors at A1');}
function show(screen){state.screen=screen;$('#menu').classList.toggle('hidden',screen!=='menu');$('#hud').classList.toggle('hidden',!['driving','paused'].includes(screen));$('#pause-sheet').classList.toggle('hidden',screen!=='paused');$('#report').classList.toggle('hidden',screen!=='complete');document.body.dataset.screen=screen;for(const el of document.querySelectorAll('#camera,#score-panel,#cluster,#route-strip,#buttons,#dwell'))el.classList.toggle('hidden',state.mode==='free');}
function penalty(message,points=20){state.score=Math.max(0,state.score-points);state.penalties++;(state.eventLog ||= []).push({time:state.time,message,points});toast(message+' −'+points);audio.playWarning();}
function action(name){if(name==='camera'&&state.mode!=='free'){state.cam=(state.cam+1)%CAMERAS.length;resetOrbit();firstCamera=true;return;}if(name==='sound'){state.muted=!state.muted;audio.setMuted(state.muted);$('#sound').textContent=state.muted?'Sound off':'Sound on';return;}if(name==='pause'){if(state.screen==='driving')show('paused');else if(state.screen==='paused')show('driving');audio.setDrive(0,false);return;}if(state.screen!=='driving'||state.mode==='free')return;
 switch(name){case'park':if(!state.park&&Math.abs(state.v)>.3)penalty('Emergency brake applied',5);state.park=!state.park;break;
 case'doors':if(Math.abs(state.v)>.05){toast('Stop before opening doors / 請先停車');return;}if(state.ramp>.01){toast('Retract ramp before closing doors / 請收回斜板');return;}state.park=true;state.doorTarget=1-state.doorTarget;audio.playDoors(!!state.doorTarget);break;
 case'cruise':state.cruise=!state.cruise;toast(state.cruise?'Cruise on · release the brake; operate doors at each stop':'Cruise off');break;
 case'guide':state.guide=!state.guide;toast(state.guide?'Lane guidance on':'Manual steering / 手動轉向');break;
 case'side':if(state.door>.01)return;state.doorSide*=-1;toast(state.doorSide===1?'Doors: left platform':'Doors: right platform');break;
 case'ramp':if(state.door<.98||Math.abs(state.v)>.05||!state.park){toast('Ramp needs open doors and parking brake');return;}state.rampTarget=1-state.rampTarget;break;
 case'priority':if(state.mode!=='priority'){toast('Priority requests are available in the request challenge');return;}state.requestAck=true;state.priority=true;toast('Request acknowledged · signal clearance still required');break;
 case'recover':if(!state.crashed)return;{const edge=roadSection(state.s);Object.assign(state,{v:0,accel:0,lat:state.mode==='turnback'?0:clamp(1.9,edge.left+1.35,edge.right-1.35),yaw:0,steer:0,park:true,door:0,doorTarget:0,ramp:0,rampTarget:0,cruise:false,crashed:false});vehicle.yaws.fill(0);vehicle.posed=false;rampMesh.visible=false;poseTram(vehicle,state.mode==='turnback'?state.loopS:state.s,state.lat,false,0,state.mode==='turnback');firstCamera=true;toast('Vehicle recovered to the road / 車輛已返回道路');}break;
 case'indicator':state.indicator=(state.indicator+1)%3;audio.setIndicator(state.indicator!==0);break;
 }
}
const keyActions={Space:'park',KeyE:'doors',KeyV:'cruise',KeyG:'guide',KeyC:'camera',KeyP:'pause',Escape:'pause',KeyM:'sound',KeyB:'ramp',KeyQ:'priority',KeyX:'side',KeyZ:'indicator'};
addEventListener('keydown',e=>{if(['SELECT','INPUT','BUTTON'].includes(e.target.tagName))return;if(e.code==='Space'||e.code.startsWith('Arrow'))e.preventDefault();keys.add(e.code);if(e.repeat)return;if(e.code==='Enter'){if(state.screen==='menu'||state.screen==='complete')reset();else if(state.screen==='paused')action('pause');}if(keyActions[e.code]&&(state.mode!=='free'||['pause','sound'].includes(keyActions[e.code])))action(keyActions[e.code]);if(e.code==='KeyH'&&state.mode!=='free')audio.playHorn(true);});
addEventListener('keyup',e=>{keys.delete(e.code);if(e.code==='KeyH')audio.playHorn(false);});addEventListener('blur',()=>{keys.clear();audio.playHorn(false);if(state.screen==='driving'&&!window.__sgmts?.proof)action('pause');});
$('#begin').onclick=()=>reset();$('#resume').onclick=()=>action('pause');$('#pause').onclick=()=>action('pause');$('#camera').onclick=()=>action('camera');$('#sound').onclick=()=>action('sound');document.querySelectorAll('[data-action]').forEach(el=>el.onclick=()=>action(el.dataset.action));document.querySelectorAll('.menu-return').forEach(el=>el.onclick=()=>{keys.clear();state.v=0;audio.setDrive(0,false);state.s=stopTarget(STOPS[1]);state.lat=5.4;show('menu');});$('#explore-tail').onclick=()=>{state.mode='explore';state.park=true;show('driving');toast('Explore the elevated section beyond A7');};$('#condition').onchange=()=>{state.condition=$('#condition').value;weather();};
function finish(){$('#report h1').textContent='Journey complete.';$('#explore-tail').classList.remove('hidden');state.v=0;state.park=true;let count=state.served.length,grade=state.mode==='turnback'?(state.loopDone?'A':'—'):count===7&&state.penalties<3?'A':count>=5?'B':'C';$('#report-grade').textContent=grade;let best=0;try{best=Math.max(Number(localStorage.getItem('sgmts-drawing-best')||0),state.score);localStorage.setItem('sgmts-drawing-best',String(best));}catch{}
 $('#report-data').innerHTML=[['Stations served',`${count} / 7`],['Journey time',`${Math.floor(state.time/60)}m ${Math.floor(state.time%60)}s`],['Energy used',state.energy.toFixed(2)+' kWh'],['Regeneration',state.regen.toFixed(2)+' kWh'],['Passenger load',state.pax],['Service score',state.score],['Personal best',best],['Penalties',state.penalties]].map(([a,b])=>`<div><span>${a}</span><b>${b}</b></div>`).join('');show('complete');audio.setDrive(0,false);}
function service(dt){if(['explore','turnback'].includes(state.mode))return;const st=STOPS[state.index];if(!st)return;
 const target=stopTarget(st),distance=target-state.s,error=dockError(st),aligned=error.valid;
 if(distance < -45){state.missed.push(st.id);state.index++;state.phase='approach';state.dwell=0;penalty('Missed '+st.id,100);if(state.index===7)finish();return;}
 if(state.phase==='approach'&&Math.abs(state.v)<.08&&state.park&&aligned&&state.door>.98){
  if(state.mode==='priority'&&state.index%2===1&&!state.requestAck){toast('Q · acknowledge the passenger request');return;}
  state.phase='boarding';toast('C · Boarding view / 上落客視角');state.dwell=0;state.requiredDwell=(state.condition==='rain'?10:6)+state.index*.3;audio.playChime();
 }
 if(state.phase==='boarding'){
  const rampNeeded=state.mode==='access'&&state.index%2===0;
  if(aligned&&state.park&&state.door>.98&&Math.abs(state.v)<.08&&(!rampNeeded||state.ramp>.98))state.dwell+=dt;
  if(state.dwell>=state.requiredDwell){state.phase='departure';state.pax=Math.min(180,Math.round(state.pax*.7)+12+state.index*3);state.score+=Math.max(50,Math.round(120-error.error*12-error.maxGap*10));state.hold=state.mode==='priority'?3:0;audio.playDeparture();}
 }
 if(state.phase==='departure'){
  state.hold=Math.max(0,state.hold-dt);
  if(state.door<.01&&state.ramp<.01&&state.hold===0){state.served.push(st.id);state.index++;state.phase='approach';state.requestAck=false;state.priority=false;state.score+=20;toast(st.id+' served · depart when ready');if(state.index===7)finish();}
 }
}
const viewS=()=>state.mode==='free'?state.freeS:state.s;
function updateFree(dt){
 const forward=(keys.has('KeyW')||keys.has('ArrowUp')?1:0)-(keys.has('KeyS')||keys.has('ArrowDown')?1:0),strafe=(keys.has('KeyA')||keys.has('ArrowLeft')?1:0)-(keys.has('KeyD')||keys.has('ArrowRight')?1:0),lift=(keys.has('Space')?1:0)-(keys.has('ControlLeft')||keys.has('ControlRight')?1:0),speed=keys.has('ShiftLeft')||keys.has('ShiftRight')?65:18;
 const moving=forward||strafe||lift,motion=freeStep(state.freeX,state.freeY,state.freeZ,state.freeHeading+orbit.yaw,forward,strafe,lift,speed,dt);state.freeX=motion.x;state.freeY=motion.y;state.freeZ=motion.z;state.freeS=clamp(project(motion.x,motion.z,state.freeS),0,LENGTH);state.freeY=Math.max(state.freeY,sample(state.freeS).groundY+1.2);state.freeSpeed=moving?speed:0;audio.setDrive(0,false);
}
function update(dt){state.time+=dt;let onLoop=state.mode==='turnback',p=sample(state.s),v0=state.v,lat0=state.lat;
 if(state.mode==='free'){updateFree(dt);return;}
 let accel=keys.has('KeyW')||keys.has('ArrowUp'),brake=keys.has('KeyS')||keys.has('ArrowDown'),reverse=keys.has('KeyR');
 if(reverse)accel=false;if(accel||brake||reverse)state.cruise=false;
 const next=STOPS[state.index],target=next?stopTarget(next):LENGTH,limit=(next&&Math.abs(target-state.s)<130)?30:40;
 if(state.cruise){let desired=(onLoop?12:limit-1)/3.6,decel=state.condition==='rain'?.72:.95;
  if(next&&!['explore','turnback'].includes(state.mode))desired=Math.min(desired,Math.sqrt(2*decel*Math.max(0,target-state.s-.15)));
  const sig=nextSignal();if(sig&&signalAt(sig)!=='go')desired=Math.min(desired,Math.sqrt(2*decel*Math.max(0,sig.s-state.s-8)));
  const pedestrian=crossers.find(c=>c.active&&c.s-state.s>0);if(pedestrian&&!onLoop)desired=Math.min(desired,Math.sqrt(2*decel*Math.max(0,pedestrian.s-state.s-9)));
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
 if(interlock){state.v=Math.sign(state.v)*Math.max(0,Math.abs(state.v)-2.5*dt);force=0;}else state.v=clamp(state.v+force*dt,-2.5,16);
 if(v0>0&&state.v<0&&!keys.has('KeyR')&&!accel)state.v=0;
 if(v0<0&&state.v>0&&!accel)state.v=0;
 state.accel=(state.v-v0)/dt;
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
  if(state.guide&&!steer){const near=STOPS.find(st=>Math.abs(stopTarget(st)-state.s)<110&&!state.served.includes(st.id)),ahead=clamp(5+Math.abs(state.v)*.25,5,8),dest=state.s+ahead,desired=Math.min(near?5.4:1.9,roadSection(dest).right-1.65),aim=point(dest,desired),here=point(state.s,state.lat),alpha=angleDelta(Math.atan2(-(aim.x-here.x),-(aim.z-here.z)),heading);wheel=clamp(Math.atan2(2*6.2*Math.sin(alpha),ahead),-.65,.65);}
  const here=point(state.s,state.lat),motion=driveStep(here.x,here.z,heading,state.v/Math.sqrt(1+p.grade*p.grade),wheel,dt);
  state.s=clamp(project(motion.x,motion.z,state.s),0,END_STOP);const r=sample(state.s);state.lat=(motion.x-r.x)*r.lx+(motion.z-r.z)*r.lz;state.yaw=angleDelta(motion.heading,r.heading);
  const edge=roadSection(state.s);if(state.lat<edge.left+1.35||state.lat>edge.right-1.35){state.lat=clamp(state.lat,edge.left+1.35,edge.right-1.35);state.v=0;state.park=true;state.crashed=true;if(state.time-(state.lastKerb||-10)>4){penalty('Kerb contact · use Recover if stuck',15);state.lastKerb=state.time;}}
  if(state.s>=END_STOP-.1||(state.mode==='explore'&&END_STOP-state.s<5&&Math.abs(state.v)<.15)){state.v=0;state.park=true;if(state.mode==='explore'){finish();$('#report h1').textContent='End of the line / 路線終點';$('#explore-tail').classList.add('hidden');}}
 }
 state.travel+=Math.abs(state.v)*dt;vehicle.yaws[0]=state.yaw;
 poseTram(vehicle,onLoop?state.loopS:state.s,state.lat,false,state.door,onLoop);
 rampMesh.visible=state.ramp>.001;const front=vehicle.sections[0];rampMesh.position.copy(front.localToWorld(new T.Vector3(-1.35-state.ramp*.5,.32,1.6)));rampMesh.rotation.y=front.rotation.y;rampMesh.scale.x=Math.max(.01,state.ramp);
 for(const sig of signalObjects){if(state.s+5.6>sig.s&&!sig.passed){sig.passed=true;if(signalAt(sig)==='stop'&&state.v>.5)penalty('Red signal passed',120);}}
 const f=energyFlow(state.v,state.accel,p.grade,state.pax,dt);state.energy+=f.consumed;state.regen+=f.recovered;state.battery=clamp(state.battery-f.net/360*100,0,100);state.power=f.power;
 if(Math.abs(state.accel)>2.8&&Math.abs(state.v)>2&&state.time-(state.lastHarsh||-10)>5){penalty('Harsh braking · passenger comfort',8);state.lastHarsh=state.time;}
 if(state.v*3.6>limit+4){state.speedingT=(state.speedingT||0)+dt;if(state.speedingT>5){penalty('Speed limit exceeded',30);state.speedingT=0;}}else state.speedingT=0;
 service(dt);audio.setDrive(Math.abs(state.v)*3.6,accel);
}
const rampMesh=meshBox(1.4,.06,1.15,0xd6bb54);rampMesh.visible=false;scene.add(rampMesh);
function contact(group,width,length,height,label){
 if(state.mode==='free'||state.mode==='turnback'||state.screen!=='driving'||state.crashed)return;
 const b={x:group.position.x,z:group.position.z,heading:group.rotation.y,hw:width/2,hl:length/2};
 if(vehicle.sections.some(g=>verticalOverlap({yBottom:g.position.y,yTop:g.position.y+3.5},{yBottom:group.position.y,yTop:group.position.y+height})&&boxesOverlap({cx:g.position.x,cz:g.position.z,heading:g.rotation.y,hw:1.27,hl:5.3},b))){state.v=0;state.park=true;state.crashed=true;penalty(label+' contact · use Recover to return to the road',150);state.eventLog.at(-1).contact={label,s:state.s,lat:state.lat,other:group.name,x:group.position.x,z:group.position.z};state.incidents++;}
}
const loopPoints=[point(35,-1.9),point(15,-3.8)];
const tr=sample(STOPS[0].s);for(let i=0;i<=24;i++){const angle=-Math.PI/2-i*Math.PI/24;loopPoints.push(new T.Vector3(LOOP.center.x+LOOP.radius*(Math.cos(angle)*tr.tx+Math.sin(angle)*tr.lx),LOOP.y,LOOP.center.z+LOOP.radius*(Math.cos(angle)*tr.tz+Math.sin(angle)*tr.lz)));}loopPoints.push(point(15,3.8),point(35,1.9));
const terminalCurve=new T.CatmullRomCurve3(loopPoints,false,'centripetal'),terminalLength=terminalCurve.getLength();
function terminalStep(a,dt){
 if(a.terminal==='reverse'){a.turnTime+=dt;if(a.turnTime<8||state.time<nextDispatch[-1])return;nextDispatch[-1]=state.time+state.headway;a.sections.reverse();a.flipped=!a.flipped;a.s-=21.2;a.dir=-1;a.stopIndex=6;a.served=[];a.terminal=null;a.dwell=0;a.v=0;return;}
 const blocked=state.mode!=='free'&&state.s<85||ai.some(o=>o!==a&&o.active&&o.dir===1&&o.s<85);if(blocked){a.v=0;return;}
 a.v=Math.min(4,a.v+dt);a.loopDistance=Math.min(terminalLength,a.loopDistance+a.v*dt);
 a.sections.forEach((g,i)=>{const distance=a.loopDistance-i*10.6;let p,t;if(distance<0){const r=sample(35-distance);p=point(35-distance,-1.9);t=new T.Vector3(-r.tx,0,-r.tz);}else{const u=Math.min(1,distance/terminalLength);p=terminalCurve.getPointAt(u);t=terminalCurve.getTangentAt(u);}g.position.copy(p);g.position.y+=.025;g.rotation.set(0,Math.atan2(-t.x,-t.z)+(a.flipped?Math.PI:0),0);if(i){const prior=a.sections[i-1].localToWorld(new T.Vector3(0,.9,a.flipped?-5.3:5.3)),front=g.localToWorld(new T.Vector3(0,.9,a.flipped?5.3:-5.3));g.position.add(prior.sub(front));}});
 if(a.loopDistance>=terminalLength&&state.time>=nextDispatch[1]){nextDispatch[1]=state.time+state.headway;a.dir=1;a.s=35;a.lat=1.9;a.stopIndex=0;a.served=[];a.terminal=null;a.posed=false;}
}
function actors(dt){const subjectS=viewS();
 for(const dir of [-1,1])if(state.time>=nextDispatch[dir]){const entry=dir===1?35:LENGTH-35,a=ai.find(a=>a.dir===dir&&!a.active),occupied=ai.some(o=>o.active&&(o.dir===dir&&Math.abs(o.s-entry)<44||o.terminal===(dir===1?'loop':'reverse')))||(dir===1&&state.mode!=='free'&&state.mode!=='turnback'&&Math.abs(state.s-entry)<44);if(a&&!occupied){startService(a,entry);nextDispatch[dir]=state.time+state.headway;}}
 const obstacles=state.mode!=='free'&&state.mode!=='turnback'?vehicle.sections.map(g=>{const s=project(g.position.x,g.position.z,state.s),p=sample(s);return {s,lat:(g.position.x-p.x)*p.lx+(g.position.z-p.z)*p.lz,y:g.position.y};}):[];
 const participants=ai.filter(a=>a.active);if(state.mode!=='free'&&state.mode!=='turnback')participants.push({s:state.s,dir:1,active:true});
 for(const a of ai){
  if(!a.active){a.sections.forEach(g=>g.visible=false);continue;}
  if(a.terminal){terminalStep(a,dt);for(const g of a.sections)g.visible=Math.abs(a.s-subjectS)<700;continue;}
  const st=STOPS[a.stopIndex],target=st?st.s+(st.platforms.find(p=>p.side===a.dir)?.centerOffset||0)+a.dir*10.6:a.dir===1?END_STOP-4:35;
  let stop=target;const limit=line=>{if((line-a.s)*a.dir>=-.01&&(line-stop)*a.dir<0)stop=line;};
  for(const sig of signalObjects)if(signalAt(sig)!=='go')limit(sig.centre-a.dir*(sig.stop+6));
  for(const c of crossers)if(c.active)limit(c.s-a.dir*9);
  const following=followingStop(a.s,a.dir,participants,a);if((following-stop)*a.dir<0)stop=following;
  for(const o of obstacles)if(Math.abs(o.lat-a.lat)<2.8&&Math.abs(o.y-sample(a.s).y)<3.5&&(o.s-a.s)*a.dir>=-6){const line=o.s-a.dir*16;if((line-stop)*a.dir<0)stop=line;}
  if(a.dir===1&&ai.some(o=>o!==a&&o.terminal==='reverse'))limit(END_STOP-100);
  if(a.dir===-1&&ai.some(o=>o!==a&&o.terminal==='loop'))limit(85);
  if(a.dwell>0){a.dwell=Math.max(0,a.dwell-dt);a.v=0;a.door=Math.min(1,a.dwell,10-a.dwell);if(!a.dwell)a.stopIndex+=a.dir;}
  else{const move=approachStep(a.s,a.v,a.dir,8.3,stop,dt);a.s=move.position;a.v=move.speed;a.door=0;if(st&&Math.abs(a.s-target)<.03){a.dwell=10;a.served.push(st.id);}if(!st&&Math.abs(a.s-target)<.03){a.terminal=a.dir===1?'reverse':'loop';a.turnTime=0;a.loopDistance=0;a.v=0;}}
  const dock=(st&&Math.abs(a.s-target)<100?5.4:1.9)*a.dir,edge=roadSection(a.s);a.lat=clamp(smooth(a.lat,dock,dt*.35),edge.left+1.35,edge.right-1.35);
  poseTram(a,a.s,a.lat,a.dir===-1,a.door);for(const g of a.sections){g.visible=a.active&&Math.abs(a.s-subjectS)<700;if(g.visible)contact(g,2.54,10.6,3.5,'ART');}
 }
 for(const c of traffic){const j=c.junction,r=sample(j.s),sig=signalObjects.find(sig=>sig.c===j.c),go=j.underpass||signalAt(sig,true)==='go';
  const line=-c.dir*(j.stop+c.length/2),distance=(line-c.lat)*c.dir;let stop=c.lat+c.dir*1e6;
  if(!go&&distance>=-.01)stop=line;
  for(const other of traffic)if(other!==c&&other.junction===j&&other.dir===c.dir&&other.along===c.along&&(other.lat-c.lat)*c.dir>0){const limit=other.lat-c.dir*((other.length+c.length)/2+3);if((limit-c.lat)*c.dir<(stop-c.lat)*c.dir)stop=limit;}
  if(state.mode!=='free'&&state.mode!=='turnback')for(const g of vehicle.sections){const dx=g.position.x-r.x,dz=g.position.z-r.z,along=dx*r.tx+dz*r.tz,lat=dx*r.lx+dz*r.lz;if(Math.abs(along-c.along)<7&&Math.abs(g.position.y-(r.elevated?r.groundY:r.y))<3.5&&(lat-c.lat)*c.dir> -c.length/2){const blocked=lat-c.dir*(c.length/2+7);if((blocked-stop)*c.dir<0)stop=blocked;}}
  const move=approachStep(c.lat,c.v,c.dir,j.underpass?11:7,stop,dt);c.lat=move.position;c.v=move.speed;
  if(c.lat*c.dir>j.extent+c.length){const entry=-c.dir*(j.extent+c.length);if(!traffic.some(o=>o!==c&&o.junction===j&&o.along===c.along&&Math.abs(o.lat-entry)<(o.length+c.length)/2+4))c.lat=entry;}
  c.group.position.set(r.x+r.lx*c.lat+r.tx*c.along,(r.elevated?r.groundY:r.y)+c.along*(r.elevated?0:r.grade)+.08,r.z+r.lz*c.lat+r.tz*c.along);c.group.rotation.y=r.heading+c.dir*Math.PI/2;c.group.visible=Math.abs(j.s-subjectS)<450;
  if(c.group.visible)contact(c.group,c.width,c.length,c.height,'Traffic');
 }
 updateStreetLife(dt,subjectS);
 for(const p of walkerObjects){const active=state.index===p.station&&state.door>.98&&state.phase==='boarding',served=state.served.includes(STOPS[p.station].id);if(active)p.progress=clamp((state.dwell-p.phase*.2)/(p.alight?2.1:4),0,1);
  const d=vehicle.doors.filter(d=>d.side===1)[p.phase%6],door=d.node.parent.localToWorld(d.base.clone());door.y=vehicle.sections[d.si].position.y+.56;const inside=door.clone().addScaledVector(new T.Vector3(1,0,0).applyQuaternion(vehicle.sections[d.si].quaternion),.5);
  p.group.position.copy(p.origin);const travel=active||state.index===p.station&&state.phase==='departure';if(travel){p.group.position.lerpVectors(p.alight?inside:p.origin,p.alight?p.origin:inside,p.progress);const dir=(p.alight?p.origin:inside).clone().sub(p.alight?inside:p.origin);p.group.rotation.y=Math.atan2(-dir.x,-dir.z);}else p.group.rotation.y=sample(STOPS[p.station].s).heading;
  p.group.visible=Math.abs(STOPS[p.station].s-subjectS)<500&&!(served&&!p.alight)&&!(travel&&!p.alight&&p.progress>=1)&&!(p.alight&&!travel&&!served);
  const swing=active&&p.progress>0&&p.progress<1?Math.sin(p.progress*22)*.42:0;p.limbs.forEach(l=>{l.arm.rotation.x=swing*l.side;l.leg.rotation.x=-swing*l.side;});
 }
 for(const sig of signalObjects)for(const head of sig.heads){const phase=signalAt(sig,head.axis==='side'),lit=phase==='go'?2:phase==='amber'?1:0;head.bulbs.forEach((b,i)=>b.material.color.setHex(i===lit?[0xff4633,0xffd65b,0x55ff95][i]:0x293731));}

}
const camPos=new T.Vector3(),look=new T.Vector3();let firstCamera=true;
const orbit={yaw:0,pitch:0,zoom:1};let drag=null;
function resetOrbit(){orbit.yaw=0;orbit.pitch=0;orbit.zoom=1;}
const canvas=renderer.domElement;canvas.style.touchAction='none';
canvas.addEventListener('pointerdown',e=>{if(!['driving','paused'].includes(state.screen))return;drag={x:e.clientX,y:e.clientY};canvas.setPointerCapture(e.pointerId);});
canvas.addEventListener('pointermove',e=>{if(!drag)return;orbit.yaw-=(e.clientX-drag.x)*.006;orbit.pitch=clamp(orbit.pitch+(e.clientY-drag.y)*.006,-1.1,1.1);drag={x:e.clientX,y:e.clientY};});
canvas.addEventListener('pointerup',()=>drag=null);canvas.addEventListener('pointercancel',()=>drag=null);
canvas.addEventListener('wheel',e=>{e.preventDefault();orbit.zoom=clamp(orbit.zoom*Math.exp(e.deltaY*.001),.25,3);},{passive:false});
addEventListener('keydown',e=>{if(['INPUT','SELECT'].includes(e.target.tagName))return;if(e.code==='Digit0')resetOrbit();if(['Equal','Minus'].includes(e.code))orbit.zoom=clamp(orbit.zoom*(e.code==='Equal'?.85:1.18),.25,3);});

function aim(dt){const g=vehicle.sections[0],p=g.position,dir=new T.Vector3(0,0,-1).applyQuaternion(g.quaternion),left=new T.Vector3(-1,0,0).applyQuaternion(g.quaternion);let target,focus;
 if(state.screen==='menu'){target=p.clone().addScaledVector(dir,23).addScaledVector(left,-3.5);target.y+=3.6;focus=p.clone().addScaledVector(dir,-14).addScaledVector(left,7);focus.y+=1.3;}
 else if(state.mode==='free'){const heading=state.freeHeading+orbit.yaw,cp=Math.cos(orbit.pitch),forward=new T.Vector3(-Math.sin(heading)*cp,Math.sin(orbit.pitch),-Math.cos(heading)*cp);target=new T.Vector3(state.freeX,state.freeY,state.freeZ);focus=target.clone().addScaledVector(forward,60);camera.fov=60;camera.updateProjectionMatrix();}
 // Cab eye is ahead of the solid nose; no interior modelled.
 else if(state.cam===1){target=p.clone().addScaledVector(dir,5.9).addScaledVector(left,.4);target.y+=2.25;focus=target.clone().addScaledVector(dir,60);}
 else if(state.cam===2){target=p.clone().addScaledVector(dir,12).addScaledVector(left,-22);target.y+=3.9;focus=p.clone().addScaledVector(dir,-9);focus.y+=1.5;}
 else if(state.cam===3){target=p.clone().addScaledVector(dir,-35).addScaledVector(left,-20);target.y+=72;focus=p.clone().addScaledVector(dir,12);}
 else if(state.cam===5){target=p.clone().addScaledVector(dir,14).addScaledVector(left,5.7);target.y+=2.05;focus=p.clone().addScaledVector(dir,-10).addScaledVector(left,2.8);focus.y+=1.2;}
 else if(state.cam===4){target=p.clone().addScaledVector(dir,5.8);target.y+=1.15;focus=target.clone().addScaledVector(dir,60);}
 else {target=p.clone().addScaledVector(dir,-39).addScaledVector(left,-12);target.y+=11;focus=p.clone().addScaledVector(dir,-5);focus.y+=1.6;}
 if(state.screen!=='menu'&&state.mode!=='free'){
  const offset=target.clone().sub(focus),sph=new T.Spherical().setFromVector3(offset);sph.theta+=orbit.yaw;sph.phi=clamp(sph.phi+orbit.pitch,.08,Math.PI-.12);sph.radius*=orbit.zoom;
  if(state.cam===1||state.cam===4){const dir=focus.clone().sub(target).normalize().applyAxisAngle(new T.Vector3(0,1,0),orbit.yaw);dir.y+=orbit.pitch;focus=target.clone().addScaledVector(dir,60);camera.fov=clamp(48*orbit.zoom,20,90);}else {target.copy(focus).add(new T.Vector3().setFromSpherical(sph));target.y=Math.max(target.y,sample(state.s).y+.7);camera.fov=48;}camera.updateProjectionMatrix();
 }
 const k=firstCamera||state.mode==='free'?1:1-Math.exp(-dt*(state.cam===1?18:4));camPos.lerp(target,k);look.lerp(focus,k);camera.position.copy(camPos);camera.lookAt(look);firstCamera=false;
 const subject=state.mode==='free'?target:p;sun.position.set(subject.x-75,subject.y+140,subject.z-65);sun.target.position.set(subject.x,subject.y,subject.z);}
function hud(){let st=STOPS[state.index],target=st?stopTarget(st):LENGTH,d=target-state.s,loop=state.mode==='turnback',explore=state.mode==='explore';
 $('#service-label').textContent=state.mode==='free'?'FREE CAMERA · VEHICLE INDEPENDENT':'LINE 01 · NORTHBOUND';
 if(state.mode==='free'){$('#next').textContent='Free roam / 自由探索';$('#next-distance').textContent=`Ch. ${toChainage(state.freeS).toFixed(0)} m · altitude ${state.freeY.toFixed(0)} m`;$('#signal-status').textContent='Vehicle-independent camera';$('#telemetry').innerHTML=`<span>MOVE SPEED <b>${state.freeSpeed.toFixed(0)} m/s</b></span><span>ALTITUDE <b>${state.freeY.toFixed(1)} m</b></span><span>CHAINAGE <b>${toChainage(state.freeS).toFixed(0)} m</b></span><span>BOOST <b>${keys.has('ShiftLeft')||keys.has('ShiftRight')?'ON':'OFF'}</b></span>`;$('#instruction').textContent='WASD move · Shift boost · Space up · Ctrl down · Drag to look · P pause';return;}
 $('#speed').textContent=Math.round(Math.abs(state.v)*3.6);$('#limit').textContent=loop?'15':Math.abs(d)<130?'30':'40';$('#next').textContent=loop?'A1 · Terminal loop':explore?'Explore / 全線探索':st?`${st.id} · ${st.id}站`:'A7 · 終點';$('#next-distance').textContent=loop?`${Math.max(0,LOOP.length-state.loopS).toFixed(0)} m to complete circuit`:explore?`${Math.max(0,END_STOP-state.s).toFixed(0)} m to end of line · Ch. ${toChainage(state.s).toFixed(0)} m`:`${Math.abs(d).toFixed(0)} m ${d<0?'behind':'ahead'} · Ch. ${toChainage(state.s).toFixed(0)} m`;
 let sig=nextSignal();$('#signal-status').textContent=sig?`${signalAt(sig)==='go'?'● Proceed':'● Prepare to stop'} · ${(sig.s-state.s).toFixed(0)} m`:'● Clear corridor';$('#signal-status').style.color=sig&&signalAt(sig)!=='go'?'#e8b471':'#91c8ad';const crossing=crossers.find(c=>c.active&&c.s>state.s&&c.s-state.s<150);if(crossing){$('#signal-status').textContent=`Yield to pedestrians · ${(crossing.s-state.s).toFixed(0)} m / 禮讓行人`;$('#signal-status').style.color='#e8b471';}$('#score').textContent=String(state.score).padStart(4,'0');$('#pax').textContent=state.pax+' passengers / 乘客';$('#schedule').textContent=`${Math.floor(state.time/60)}:${String(Math.floor(state.time%60)).padStart(2,'0')} · ${state.time-(state.s-STOPS[0].s)/7-state.served.length*12>80?'Behind schedule':'On schedule'}`;
 $('#brake-status').textContent=state.park?'● Parking brake applied':'○ Parking brake released';$('#door-status').textContent=state.door>.01?`● ${state.doorSide===1?'Left':'Right'} doors open`:'○ Doors secured';$('#guide-status').textContent=`${state.guide?'●':'○'} Guidance ${state.guide?'on':'off'} · ${state.cruise?'Cruise on':'Manual power'}`;$('#camera-status').textContent=CAMERAS[state.cam]+' · Drag ↔ · Scroll ± · 0 reset';$('#telemetry').innerHTML=`<span>BATTERY <b>${state.battery.toFixed(1)}%</b></span><span>${state.power<0?'REGEN':'POWER'} <b>${Math.abs(state.power||0).toFixed(0)} kW</b></span><span>GRADE <b>${(sample(state.s).grade*100).toFixed(1)}%</b></span><span>RECOVERED <b>${state.regen.toFixed(2)} kWh</b></span>`;
 let instruction=state.park?'Space · Release the parking brake / 解除停車制動':state.cruise?'Cruise is driving · operate doors and brake at each stop':'W forward · R reverse · S brake · A/D steer';
 if(st&&!loop&&!explore){if(state.phase==='boarding')instruction=state.mode==='access'&&state.index%2===0&&state.ramp<.98?'B · Deploy the accessibility ramp / 放下斜板':'Boarding · hold position / 上落客中';else if(state.phase==='departure')instruction=state.ramp>.01?'B · Retract ramp / 收回斜板':state.hold>0?'Departure hold · wait for clearance':'E · Close the doors to complete this stop';else if(Math.abs(d)<5&&Math.abs(state.v)<.1){const e=dockError(st);instruction=e.valid?(state.mode==='priority'&&state.index%2===1&&!state.requestAck?'Q · Acknowledge the stop request':'Space brake, E doors · 停車及開門'):'Align all doors with the LEFT platform · A/D adjust, G guidance';}else if(d<150&&d>0)instruction=`Approaching ${st.id} · brake smoothly and draw alongside the platform`;}
 if(loop)instruction=state.loopDone?'Loop complete':state.park?'Space release brake · W drive or V cruise':'Follow the A1 loop and stop at the completion marker';if(state.crashed)instruction='Collision detected · select Recover vehicle / 發生碰撞';$('#instruction').textContent=instruction;$('#dwell').classList.toggle('active',state.phase==='boarding');$('#dwell i').style.width=`${Math.min(100,state.dwell/(state.requiredDwell||1)*100)}%`;$('#dwell span').textContent='PASSENGER EXCHANGE';
 document.querySelectorAll('[data-stop]').forEach(el=>{el.classList.toggle('done',state.served.includes(el.dataset.stop));el.classList.toggle('here',st?.id===el.dataset.stop);el.classList.toggle('missed',state.missed.includes(el.dataset.stop));});document.querySelector('[data-action="ramp"]').style.display=state.mode==='access'?'':'none';document.querySelector('[data-action="priority"]').style.display=state.mode==='priority'?'':'none';document.querySelector('[data-action="recover"]').style.display=state.crashed?'':'none';}
const rainPositions=new Float32Array(1200*6);
for(let i=0;i<1200;i++){let x=(Math.random()-.5)*90,y=Math.random()*40,z=(Math.random()-.5)*90;rainPositions.set([x,y,z,x-.18,y-1.2,z-.08],i*6);}
const rainGeometry=new T.BufferGeometry();rainGeometry.setAttribute('position',new T.BufferAttribute(rainPositions,3));const rainEffect=new T.LineSegments(rainGeometry,new T.LineBasicMaterial({color:0xc6e4e9,transparent:true,opacity:.22,depthWrite:false}));rainEffect.frustumCulled=false;scene.add(rainEffect);
async function boot(){try{let loaded=0;const model=await loader.loadAsync(asset('art.glb'));vehicle=setupTram(model);manifest=await fetch(asset('asset-manifest.json')).then(r=>{if(!r.ok)throw Error('Asset manifest unavailable');return r.json();});
 for(const st of STOPS){const g=await loader.loadAsync(asset(`station-${st.id}.glb`));const root=g.scene;root.position.copy(point(st.s));root.rotation.set(Math.atan(sample(st.s).grade),sample(st.s).heading,0,'YXZ');root.traverse(n=>{if(n.isMesh){n.castShadow=true;n.receiveShadow=true;}});scene.add(root);stations.push({root,s:st.s});$('#load-detail').textContent=`Loading ${st.id} · ${++loaded}/7 stations`;
 }
 for(const dir of [-1,1])for(let i=0;i<6;i++)ai.push({...setupTram(model,true),dir,homeDir:dir,active:false});
 const dr=sample(DEPOT.s);for(let n=0;n<5;n++){const parked=setupTram(model,true);parked.sections.forEach((g,i)=>{const lat=46+i*10.6,along=(n-2)*20;g.position.set(dr.x+dr.lx*lat+dr.tx*along,dr.y+.08,dr.z+dr.lz*lat+dr.tz*along);g.rotation.y=Math.atan2(dr.lx,dr.lz);g.name='depot-vehicle-'+(n+1)+'-section-'+i;});depotVehicles.push(parked);}
 makeSignals();makeTraffic();makeStreetLife();resetStreetLife();state.s=stopTarget(STOPS[1]);state.lat=5.4;poseTram(vehicle,state.s,state.lat);environment.update(state.s);weather();ready=true;$('#load').classList.add('hidden');show('menu');requestAnimationFrame(frame);
 }catch(e){errors.push(String(e));$('#load-detail').textContent='Could not load the game: '+e.message;$('#load').classList.add('failed');console.error(e);}}
function frame(now){requestAnimationFrame(frame);const rawFrame=(now-last);const dt=clamp(rawFrame/1000,.001,.05);last=now;elapsed+=dt;
 if(state.screen==='driving'){let rest=dt*(window.__sgmts?.simulationRate||1);while(rest>0){let d=Math.min(rest,1/60);update(d);actors(d);rest-=d;}state.frameTimes.push(rawFrame);if(state.frameTimes.length>90000)state.frameTimes.shift();state.frames++;}
 if(state.screen==='menu'){state.time+=dt;actors(dt);poseTram(vehicle,state.s,state.lat);}
 const subjectS=state.mode==='turnback'?0:viewS();environment.update(subjectS);for(const st of stations)st.root.visible=Math.abs(st.s-subjectS)<600;aim(dt);lightScene();for(const a of depotVehicles)for(const g of a.sections)g.visible=Math.abs(subjectS-DEPOT.s)<700;if(hudTick++%5===0)hud();if(toastTime>0){toastTime-=dt;if(toastTime<=0)$('#toast').classList.remove('visible');}rainEffect.visible=state.condition==='rain';if(rainEffect.visible){rainEffect.position.copy(state.mode==='free'?camera.position:vehicle.sections[0].position);rainEffect.position.y-=elapsed*16%30;}renderer.render(scene,camera);}
addEventListener('resize',()=>{renderer.setSize(innerWidth,innerHeight);camera.aspect=innerWidth/innerHeight;camera.updateProjectionMatrix();});
window.__sgmts={state,STOPS,LENGTH,END_STOP,sample,LOOP,renderer,scene,camera,errors,reset,action,stopTarget,dockError,get ready(){return ready;},get vehicle(){return vehicle;},get manifest(){return manifest;},get signals(){return signalObjects;},get traffic(){return traffic;},get ai(){return ai;},get crossers(){return crossers;},get cyclists(){return cyclists;},actors,terminalStep,terminalLength,weather,lightScene,nextDispatch,get depotVehicles(){return depotVehicles;},get walkers(){return walkerObjects;},get stations(){return stations;},CAMERAS,signalAt,JUNCTIONS,setCamera:n=>{state.cam=n;resetOrbit();firstCamera=true;},pose:()=>poseTram(vehicle,state.s,state.lat),proof:false,simulationRate:1};
boot();
