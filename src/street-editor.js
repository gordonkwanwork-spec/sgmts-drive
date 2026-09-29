// Street furniture editor (dev server: /street.html, or "Edit Street.command"). Places lamps, bins, signs, traffic
// signals, railings, paving and your own .glb models by road + chainage + side + offset + rotation.
// Data: public/street/furniture.json (read by the game) · Models: public/street/models/*.glb (Y up, metres, front −Z).
import * as T from 'three';
import {MapControls} from 'three/addons/controls/MapControls.js';
import {GLTFLoader} from 'three/addons/loaders/GLTFLoader.js';
import {STOPS,JUNCTIONS,sample} from './alignment.js';
import {buildEnvironment} from './environment.js';
import {ROADS,ROAD,pose,poseAt,locate} from './street/roads.js';
import {CATALOGUE,PAVING_PATTERNS,SIGNAL_AXES,isModel,placeFurniture,kitLibrary,instancer,runPoints,loadFurnitureModels,furnitureMaterials,EMPTY} from './street/furniture.js';

const BASE=import.meta.env.BASE_URL,$=id=>document.getElementById(id),esc=s=>String(s??'').replace(/[&<>"]/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;'}[c]));
const loader=new GLTFLoader(),modelCache={},cachedLoader={loadAsync:url=>modelCache[url]??=loader.loadAsync(url)};
const round=(v,step)=>Math.round(v/step)*step,fix=v=>+(+v).toFixed(3);

// ---------- scene ----------
const renderer=new T.WebGLRenderer({antialias:true});renderer.setPixelRatio(Math.min(2,devicePixelRatio));renderer.shadowMap.enabled=true;document.body.prepend(renderer.domElement);
const scene=new T.Scene();scene.background=new T.Color(0xcfd9df);scene.fog=new T.Fog(0xcfd9df,900,4000);
const camera=new T.PerspectiveCamera(45,1,.3,9000);
const hemi=new T.HemisphereLight(0xf4f7ff,0x6f7a5a,1.6);scene.add(hemi);
const sun=new T.DirectionalLight(0xffffff,2.2);sun.position.set(600,900,300);scene.add(sun);
const controls=new MapControls(camera,renderer.domElement);controls.maxPolarAngle=Math.PI*.49;controls.screenSpacePanning=false;
function resize(){renderer.setSize(innerWidth,innerHeight);camera.aspect=innerWidth/innerHeight;camera.updateProjectionMatrix();}addEventListener('resize',resize);resize();
{const f=pose({road:'corridor',ch:1500,side:'L',off:0});controls.target.set(f.x,f.y,f.z);camera.position.set(f.x+40,f.y+55,f.z+40);controls.update();}

// ---------- state ----------
let data=structuredClone(EMPTY),selected=new Set(),mode='select',history=[],dirty=false,kit=null,environment=null,models=[],runStart=null,errors=[];
const entries=()=>[...data.items,...data.runs],byId=id=>entries().find(e=>e.id===id),isRun=e=>e&&'from' in e;
const label=type=>isModel(type)?type.slice(4):CATALOGUE[type]?.label||type;
function snapshot(){history.push(JSON.stringify(data));if(history.length>100)history.shift();dirty=true;status();}
function status(msg){$('status').textContent=msg||`${data.items.length} items · ${data.runs.length} runs${errors.length?` · ${errors.length} skipped`:''}${dirty?' · unsaved changes':''}`;}
function uid(type){const base=isModel(type)?'model':type;let n=0;for(const e of entries()){const m=e.id.match(new RegExp('^'+base.replace(/\W/g,'\\$&')+'-(\\d+)$'));if(m)n=Math.max(n,+m[1]);}return `${base}-${String(n+1).padStart(3,'0')}`;}
const ROT={along:()=>0,against:()=>180,road:side=>side==='L'?-90:90,away:side=>side==='L'?90:-90};
const nearestJunction=s=>JUNCTIONS.reduce((a,j)=>Math.abs(j.s-s)<Math.abs(a.s-s)?j:a).c;

// ---------- furniture layer (rebuilt from data after every edit) ----------
const layer=new T.Group(),modelLayer=new T.Group(),overlay=new T.Group();scene.add(layer,modelLayer,overlay);
let queued=false,lastBuild=0,modelToken=0;
function rebuild(){queued=false;lastBuild=performance.now();
 layer.traverse(n=>{if(n.isInstancedMesh)n.dispose();});layer.clear();
 if(kit){const inst=instancer(),out=placeFurniture(data,{batch:inst.batch,kitParts:kitLibrary(kit)});inst.finish(layer);out.signals.filter(s=>!s.sharedPole).forEach(s=>layer.add(s.group));errors=out.errors;}
 const token=++modelToken;loadFurnitureModels(data,{loader:cachedLoader,url:src=>BASE+'street/models/'+src}).then(g=>{if(token!==modelToken)return;modelLayer.clear();if(g.children.length)modelLayer.add(...g.children);});
 drawOverlay();renderList();status();}
function queueRebuild(){if(queued)return;queued=true;requestAnimationFrame(rebuild);}

// Arrow markers (front = arrow tip) for every point item; lines for runs; tinted paving strips when relevant.
const arrowShape=new T.Shape();arrowShape.moveTo(0,-1.1);arrowShape.lineTo(.55,-.1);arrowShape.lineTo(.2,-.1);arrowShape.lineTo(.2,.6);arrowShape.lineTo(-.2,.6);arrowShape.lineTo(-.2,-.1);arrowShape.lineTo(-.55,-.1);arrowShape.closePath();
const arrowGeo=new T.ShapeGeometry(arrowShape).rotateX(Math.PI/2),markerMat=new T.MeshBasicMaterial({depthTest:false,transparent:true,opacity:.9,side:T.DoubleSide});
const GROUP_COLOURS={Lighting:0xf2b33d,Furniture:0xe0662c,Paving:0x9b7ad6,Signs:0x2e9f6b,Signals:0xd33c3c,Railings:0x3f8fd1,Models:0xd64fb0};
const colourOf=e=>new T.Color(selected.has(e.id)?0x1d6fd6:GROUP_COLOURS[isModel(e.type)?'Models':CATALOGUE[e.type]?.group]||0x888888);
let markers=null,markerItems=[],markerScale=1;
const runLine=run=>{if(run.type==='paving')return runPoints({...run,ref:'kerb',off:1.875}).map(p=>new T.Vector3(p.x,p.y+.08,p.z));return runPoints(run).map(p=>new T.Vector3(p.x,p.y+1.15,p.z));};
function drawOverlay(){overlay.traverse(n=>n.geometry?.dispose());overlay.clear();
 markerItems=data.items.filter(visible);markers=new T.InstancedMesh(arrowGeo,markerMat,Math.max(1,markerItems.length));markers.count=markerItems.length;markers.renderOrder=1003;markers.frustumCulled=false;
 markerItems.forEach((it,i)=>markers.setColorAt(i,colourOf(it)));placeMarkers();overlay.add(markers);
 const showPaving=$('type').value==='paving'||[...selected].some(id=>byId(id)?.type==='paving');
 for(const run of data.runs){if(!visible(run))continue;if(run.type==='paving'){if(!showPaving)continue;overlay.add(pavingStrip(run));}
  const line=new T.Line(new T.BufferGeometry().setFromPoints(runLine(run)),new T.LineBasicMaterial({color:colourOf(run),depthTest:false}));line.renderOrder=1002;line.userData.runId=run.id;overlay.add(line);}}
const PAVING_COLOURS={red:0xc0583f,grey:0x8d918c,buff:0xd9bf86};
function pavingStrip(run){const inner=runPoints({...run,ref:'kerb',off:0}),outer=runPoints({...run,ref:'kerb',off:3.75}),pos=[],idx=[];inner.forEach((p,i)=>{pos.push(p.x,p.y+.06,p.z,outer[i].x,outer[i].y+.06,outer[i].z);if(i)idx.push(i*2-2,i*2-1,i*2,i*2-1,i*2+1,i*2);});
 const g=new T.BufferGeometry();g.setAttribute('position',new T.Float32BufferAttribute(pos,3));g.setIndex(idx);const m=new T.Mesh(g,new T.MeshBasicMaterial({color:PAVING_COLOURS[run.params?.pattern]||0xffffff,transparent:true,opacity:selected.has(run.id)?.65:.4,depthTest:false,side:T.DoubleSide}));m.renderOrder=1001;return m;}
const M4=new T.Matrix4(),Q=new T.Quaternion(),UP=new T.Vector3(0,1,0);
function placeMarkers(){if(!markers)return;markerItems.forEach((it,i)=>{try{const P=pose(it);Q.setFromAxisAngle(UP,P.yaw);M4.compose(new T.Vector3(P.x,P.y+.2,P.z),Q,new T.Vector3(markerScale,1,markerScale));markers.setMatrixAt(i,M4);}catch{}});markers.instanceMatrix.needsUpdate=true;if(markers.instanceColor)markers.instanceColor.needsUpdate=true;}

// ---------- filters, list ----------
const typeOptions=kind=>Object.entries(CATALOGUE).filter(([,c])=>!kind||c.kind===kind);
function fillTypeSelect(){const groups={};for(const [k,c] of typeOptions())(groups[c.group]??=[]).push(`<option value="${k}">${esc(c.label)}${c.kind==='run'?' (run)':''}</option>`);
 if(models.length)groups['Your models']=models.map(f=>`<option value="glb:${esc(f)}">${esc(f)}</option>`);const v=$('type').value;
 $('type').innerHTML=Object.entries(groups).map(([g,o])=>`<optgroup label="${esc(g)}">${o.join('')}</optgroup>`).join('');if(v&&[...$('type').options].some(o=>o.value===v))$('type').value=v;
 $('fType').innerHTML='<option value="">All types</option>'+Object.entries(CATALOGUE).map(([k,c])=>`<option value="${k}">${esc(c.label)}</option>`).join('')+models.map(f=>`<option value="glb:${esc(f)}">${esc(f)}</option>`).join('');}
const roadOptions=ROADS.map(r=>`<option value="${r.id}">${esc(r.name)}</option>`).join('');$('lock').innerHTML+=roadOptions;$('fRoad').innerHTML+=roadOptions;
function visible(e){const f=$('fRoad').value,t=$('fType').value,a=$('fFrom').value,b=$('fTo').value,side=$('fSide').value,lo=isRun(e)?Math.min(e.from,e.to):e.ch,hi=isRun(e)?Math.max(e.from,e.to):e.ch;
 return (!f||e.road===f)&&(!t||e.type===t)&&(a===''||hi>=+a)&&(b===''||lo<=+b)&&(!side||e.side===side);}
const where=e=>`${ROAD[e.road]?.name||e.road} · Ch ${isRun(e)?`${e.from.toFixed(1)}–${e.to.toFixed(1)}`:e.ch.toFixed(1)} ${e.side||''}`;
function renderList(){const shown=entries().filter(visible);$('items').innerHTML=`<div class="item"><small>${shown.length} shown</small></div>`+shown.slice(0,400).map(e=>`<div class="item${selected.has(e.id)?' sel':''}" data-id="${esc(e.id)}"><div>${esc(label(e.type))}<br><small>${esc(where(e))}</small></div><small>${esc(e.id)}</small></div>`).join('')+(shown.length>400?'<div class="item"><small>Narrow the filters to list the rest.</small></div>':'');}
$('items').onclick=e=>{const el=e.target.closest('[data-id]');if(!el)return;select(el.dataset.id,e.shiftKey);focus(byId(el.dataset.id));};
for(const id of ['fRoad','fType','fFrom','fTo','fSide'])$(id).addEventListener('input',()=>{drawOverlay();renderList();});
$('selectShown').onclick=()=>{selected=new Set(entries().filter(visible).map(e=>e.id));refreshSelection();};
function focus(e){if(!e)return;const P=isRun(e)?pose(e,(e.from+e.to)/2):pose(e),d=camera.position.clone().sub(controls.target);d.setLength(Math.min(d.length(),70));controls.target.set(P.x,P.y,P.z);camera.position.copy(controls.target).add(d);controls.update();}

// ---------- selection & inspector ----------
function select(id,add=false){if(!add)selected.clear();if(id){if(add&&selected.has(id))selected.delete(id);else selected.add(id);}refreshSelection();}
function refreshSelection(){drawOverlay();renderList();renderInspector();}
function edit(fn){snapshot();fn();queueRebuild();renderInspector();}
const opt=(v,t,cur)=>`<option value="${esc(v)}"${String(v)===String(cur)?' selected':''}>${esc(t)}</option>`;
function renderInspector(){const el=$('inspector'),list=[...selected].map(byId).filter(Boolean);
 if(!list.length){el.innerHTML=`<h2>Nothing selected</h2><p class="sub">Click an arrow (item) or a line (railing / paving run).</p>
 <p><b>Place</b> (P): choose a type, then click beside a road. It snaps to 0.5 m chainage and 0.05 m offset; Alt-click places without snapping.<br><b>Run</b> (R): click the start and the end of a railing or paving run.<br><b>Select</b> (S): drag arrows to move them along their road; Shift-click adds to the selection; Shift-drag draws a selection box.</p>
 <p>Keys: Q/E rotate 15° (Shift 1°) · ←/→ chainage ±0.5 m (Shift 5 m) · ↑/↓ offset ±0.05 m (Shift 0.5 m) · Cmd-D duplicate · Delete · F zoom to.</p>
 <p>Arrows point to each item's front: lamp arms, sign faces, signal lenses, bin apertures. Drop .glb models anywhere to add them (metres, Y up, origin at the base, front facing −Z).</p>
 <p class="sub">The baked night light pools on the pavement are recalculated when the game (or this page) reloads.</p>${errors.length?`<p class="warn">${errors.length} entries could not be built:<br>${errors.slice(0,8).map(esc).join('<br>')}</p>`:''}`;return;}
 if(list.length>1){el.innerHTML=`<h2>${list.length} selected</h2><div class="sub">${[...new Set(list.map(e=>label(e.type)))].slice(0,4).map(esc).join(', ')}</div>
  <div class="row"><span>Move chainage</span><div class="pair"><input id="m-ch" type="number" step=".5" value="0"><button id="b-mch">Apply</button></div></div>
  <div class="row"><span>Move offset</span><div class="pair"><input id="m-off" type="number" step=".05" value="0"><button id="b-moff">Apply</button></div></div>
  <div class="row"><span>Set rotation °</span><div class="pair"><input id="m-rot" type="number" step="15"><button id="b-mrot">Apply</button></div></div>
  <div class="row"><span>Set type</span><div class="pair"><select id="m-type">${typeOptions('point').map(([k,c])=>opt(k,c.label)).join('')}${models.map(f=>opt('glb:'+f,f)).join('')}</select><button id="b-mtype">Apply</button></div></div>
  <div class="btns"><button id="b-mirror" title="Copy to the other side of the road">Mirror copy</button><button id="b-del" class="warn">Delete ${list.length}</button></div>`;
  $('b-mch').onclick=()=>edit(()=>list.forEach(e=>{const d=+$('m-ch').value;if(isRun(e)){e.from=fix(e.from+d);e.to=fix(e.to+d);}else e.ch=fix(e.ch+d);}));
  $('b-moff').onclick=()=>edit(()=>list.forEach(e=>{if('off' in e||!isRun(e))e.off=fix((e.off||0)+ +$('m-off').value);}));
  $('b-mrot').onclick=()=>{if($('m-rot').value!=='')edit(()=>list.filter(e=>!isRun(e)).forEach(e=>e.rot=+$('m-rot').value));};
  $('b-mtype').onclick=()=>edit(()=>list.filter(e=>!isRun(e)).forEach(e=>{e.type=$('m-type').value;e.params={...CATALOGUE[e.type]?.params,...e.params};}));
  $('b-mirror').onclick=()=>edit(()=>mirror(list));$('b-del').onclick=deleteSelected;return;}
 const e=list[0],run=isRun(e),road=ROAD[e.road],points=typeOptions(run?'run':'point');
 el.innerHTML=`<h2>${esc(label(e.type))}</h2><div class="sub">${esc(e.id)} · ${esc(where(e))}</div>
 <div class="row"><span>Type</span><select id="f-type">${points.map(([k,c])=>opt(k,c.label,e.type)).join('')}${run?'':models.map(f=>opt('glb:'+f,f,e.type)).join('')}</select></div>
 <div class="row"><span>Road</span><select id="f-road">${ROADS.filter(r=>!(e.type==='paving'&&r.id!=='corridor')).map(r=>opt(r.id,r.name,e.road)).join('')}</select></div>
 ${run?`<div class="row"><span>Chainage from</span><input id="f-from" type="number" step=".5" value="${e.from}"></div><div class="row"><span>Chainage to</span><input id="f-to" type="number" step=".5" value="${e.to}"></div>`
  :`<div class="row"><span>Chainage</span><input id="f-ch" type="number" step=".5" value="${e.ch}"></div>`}
 <div class="row"><span>Side</span><select id="f-side">${opt('L','Left (+)',e.side)}${opt('R','Right (−)',e.side)}</select></div>
 ${e.type==='paving'?'':`<div class="row"><span>Offset from</span><select id="f-ref">${opt('kerb','Kerb (outward +)',e.ref||'kerb')}${opt('centre','Centreline',e.ref)}</select></div>
 <div class="row"><span>Offset m</span><input id="f-off" type="number" step=".05" value="${e.off??0}"></div>
 ${run?'':`<div class="row"><span>Rotation °</span><input id="f-rot" type="number" step="15" value="${e.rot??0}"></div><div class="btns">${Object.keys(ROT).map(k=>`<button data-face="${k}">${{along:'Along',against:'Against',road:'Face road',away:'Away'}[k]}</button>`).join('')}</div>`}
 <div class="row"><span>Raise m</span><input id="f-dy" type="number" step=".05" value="${e.dy??0}"></div>`}
 ${e.type.startsWith('lamp_')?`<div class="row"><span>Pole height m</span><input id="p-height" type="number" step=".5" value="${e.params?.height??CATALOGUE[e.type].params.height}"></div>`:''}
 ${e.type==='traffic_signal'?`<div class="row"><span>Junction</span><select id="p-junction">${JUNCTIONS.map(j=>opt(j.c,`${j.name} (Ch ${j.c})`,e.params?.junction)).join('')}</select></div><div class="row"><span>Phase</span><select id="p-axis">${SIGNAL_AXES.map(a=>opt(a,{corridor:'Corridor (ART)',side:'Side road',pedestrian:'Pedestrian'}[a],e.params?.axis)).join('')}</select></div>`:''}
 ${e.type==='paving'?`<div class="row"><span>Pattern</span><select id="p-pattern">${PAVING_PATTERNS.map(p=>opt(p,p,e.params?.pattern)).join('')}</select></div><p class="sub">Paving applies to the corridor footpath on this side and shows in 3D after reload (tinted strip here).</p>`:''}
 ${isModel(e.type)?`<div class="row"><span>Scale</span><input id="p-scale" type="number" step=".05" value="${e.params?.scale??1}"></div><div class="row"><span>Light at m</span><input id="p-light" type="number" step=".5" value="${e.params?.light??''}" placeholder="no light"></div>`:''}
 ${e.type==='railing'?`<div class="row"><span>End panels</span><div class="pair"><label class="chk"><input type="checkbox" id="f-e0"${e.ends?.[0]!==false?' checked':''}>start</label><label class="chk"><input type="checkbox" id="f-e1"${e.ends?.[1]!==false?' checked':''}>end</label></div></div>`:''}
 <div class="btns"><button id="b-focus">Zoom to (F)</button><button id="b-dup">Duplicate</button><button id="b-mirror">Mirror copy</button><button id="b-del" class="warn">Delete</button></div>
 ${run?'':`<hr><b>Repeat along the road</b><div class="row"><span>Every m</span><input id="r-step" type="number" step="1" value="30"></div>
 <div class="row"><span>From / to Ch</span><div class="pair"><input id="r-from" type="number" value="${e.ch}"><input id="r-to" type="number" value="${fix(Math.min(road.toCh(road.p1),e.ch+300))}"></div></div>
 <label class="chk"><input type="checkbox" id="r-both">Both sides (mirrored)</label><div class="btns"><button id="b-repeat">Repeat</button></div>`}`;
 const bind=(id,fn)=>{const x=$(id);if(x)x.addEventListener('change',()=>edit(()=>fn(x.type==='checkbox'?x.checked:x.value)));};
 bind('f-type',v=>{e.type=v;e.params={...CATALOGUE[v]?.params,...e.params};});bind('f-road',v=>{e.road=v;const r=ROAD[v];const clamp=c=>fix(Math.min(r.toCh(r.p1),Math.max(r.toCh(r.p0),c)));if(run){e.from=clamp(e.from);e.to=clamp(e.to);}else e.ch=clamp(e.ch);});
 bind('f-ch',v=>e.ch=fix(v));bind('f-from',v=>e.from=fix(v));bind('f-to',v=>e.to=fix(v));bind('f-side',v=>e.side=v);bind('f-ref',v=>e.ref=v);bind('f-off',v=>e.off=fix(v));bind('f-rot',v=>e.rot=+v);bind('f-dy',v=>e.dy=fix(v));
 const param=(id,k,f=Number)=>bind(id,v=>{e.params={...e.params,[k]:v===''?undefined:f(v)};});param('p-height','height');param('p-junction','junction');param('p-axis','axis',String);param('p-pattern','pattern',String);param('p-scale','scale');param('p-light','light');
 bind('f-e0',v=>e.ends=[v,e.ends?.[1]!==false]);bind('f-e1',v=>e.ends=[e.ends?.[0]!==false,v]);
 el.querySelectorAll('[data-face]').forEach(b=>b.onclick=()=>edit(()=>e.rot=ROT[b.dataset.face](e.side)));
 $('b-focus').onclick=()=>focus(e);$('b-dup').onclick=duplicate;$('b-mirror').onclick=()=>edit(()=>mirror([e]));$('b-del').onclick=deleteSelected;
 if($('b-repeat'))$('b-repeat').onclick=()=>{const step=+$('r-step').value,a=+$('r-from').value,b=+$('r-to').value;if(!(step>=.5)||b<a)return status('Repeat needs a step of at least 0.5 m and from ≤ to.');
  edit(()=>{const made=[];for(let ch=a;ch<=b+1e-6;ch+=step)for(const side of $('r-both').checked?['L','R']:[e.side]){if(side===e.side&&Math.abs(ch-e.ch)<.01)continue;const c={...structuredClone(e),id:'',ch:fix(ch),side,rot:side===e.side?e.rot:-(e.rot??0)};c.id=uid(c.type);data.items.push(c);made.push(c.id);}
   status(`Added ${made.length} copies`);});};}
function duplicate(){const list=[...selected].map(byId).filter(Boolean);if(!list.length)return;edit(()=>{selected.clear();for(const e of list){const c=structuredClone(e);c.id=uid(c.type);if(isRun(c)){const d=Math.abs(c.to-c.from);c.from=fix(c.from+d);c.to=fix(c.to+d);data.runs.push(c);}else{c.ch=fix(c.ch+5);data.items.push(c);}selected.add(c.id);}});}
// Copy to the other side, reflected across the road: offsets keep their size, rotations mirror.
function mirror(list){for(const e of list){const c=structuredClone(e);c.id=uid(c.type);c.side=e.side==='L'?'R':'L';if(!isRun(c)){c.rot=-(e.rot??0);data.items.push(c);}else data.runs.push(c);}}
function deleteSelected(){const n=selected.size;if(!n||n>1&&!confirm(`Delete ${n} entries?`))return;edit(()=>{data.items=data.items.filter(e=>!selected.has(e.id));data.runs=data.runs.filter(e=>!selected.has(e.id));selected.clear();});drawOverlay();}

// ---------- pointer: hover readout, place, runs, drag, box select ----------
const ray=new T.Raycaster(),ndc=new T.Vector2();
function pointer(e){const r=renderer.domElement.getBoundingClientRect();ndc.set((e.clientX-r.left)/r.width*2-1,-(e.clientY-r.top)/r.height*2+1);ray.setFromCamera(ndc,camera);}
// Road point under the cursor: intersect a level plane, re-level to the road surface found, twice.
function hover(e,lock=$('lock').value||null){pointer(e);let y=controls.target.y,loc=null;const p=new T.Vector3();for(let i=0;i<3;i++){if(!ray.ray.intersectPlane(new T.Plane(UP,-y),p))return null;loc=locate(p.x,p.z,lock);if(!loc)return null;y=loc.road.surface(loc.p,loc.lat);}return loc;}
function snapped(loc,free){const kerb=loc.road.kerb(loc.p),ch=free?fix(loc.ch):round(loc.ch,.5),side=loc.lat>=0?'L':'R';return {road:loc.road.id,ch:fix(ch),side,ref:'kerb',off:fix(free?Math.abs(loc.lat)-kerb:round(Math.abs(loc.lat)-kerb,.05))};}
function readout(loc){if(!loc)return $('readout').textContent='—';const kerb=loc.road.kerb(loc.p),a=Math.abs(loc.lat);
 $('readout').textContent=`${loc.road.name} · Ch ${loc.ch.toFixed(2)} · ${loc.lat>=0?'L':'R'} ${(a-kerb).toFixed(2)} m ${a>=kerb?'behind':'inside'} kerb (${a.toFixed(2)} m from centre)`;}
let drag=null,downAt=null,box=null;
function markerHit(){if(!markers)return null;const hit=ray.intersectObject(markers)[0];return hit?markerItems[hit.instanceId]:null;}
function runHit(){const lines=overlay.children.filter(o=>o.userData.runId);ray.params.Line.threshold=Math.max(.3,markerScale*.6);const hit=ray.intersectObjects(lines)[0];return hit?byId(hit.object.userData.runId):null;}
renderer.domElement.addEventListener('pointerdown',e=>{downAt=[e.clientX,e.clientY];if(e.button!==0||mode!=='select')return;pointer(e);
 if(e.shiftKey){box={x:e.clientX,y:e.clientY};controls.enabled=false;renderer.domElement.setPointerCapture(e.pointerId);return;}
 const it=markerHit();if(!it)return;if(!selected.has(it.id))select(it.id);
 const loc=hover(e,it.road);drag={it,loc,start:{ch:it.ch,off:it.off,side:it.side},moved:false,others:[...selected].map(byId).filter(x=>x&&x!==it&&!isRun(x)).map(x=>({x,ch:x.ch}))};controls.enabled=false;renderer.domElement.setPointerCapture(e.pointerId);});
renderer.domElement.addEventListener('pointermove',e=>{
 if(box){const b=$('box');Object.assign(b.style,{display:'block',left:Math.min(box.x,e.clientX)+'px',top:Math.min(box.y,e.clientY)+'px',width:Math.abs(e.clientX-box.x)+'px',height:Math.abs(e.clientY-box.y)+'px'});return;}
 if(drag){const loc=hover(e,drag.it.road);if(!loc)return;if(!drag.moved){snapshot();drag.moved=true;}const s=snapped(loc,e.altKey),dch=s.ch-drag.start.ch,it=drag.it;
  if(it.ref==='centre')s.off=fix(e.altKey?Math.abs(loc.lat):round(Math.abs(loc.lat),.05));Object.assign(it,{ch:s.ch,side:s.side,off:s.off});for(const o of drag.others)o.x.ch=fix(o.ch+dch);readout(loc);placeMarkers();
  if(performance.now()-lastBuild>120)queueRebuild();return;}
 readout(hover(e,mode==='run'&&runStart?runStart.road:undefined));});
renderer.domElement.addEventListener('pointerup',e=>{controls.enabled=true;
 if(box){const r=renderer.domElement.getBoundingClientRect(),x0=Math.min(box.x,e.clientX),x1=Math.max(box.x,e.clientX),y0=Math.min(box.y,e.clientY),y1=Math.max(box.y,e.clientY);box=null;$('box').style.display='none';
  const inBox=P=>{const v=new T.Vector3(P.x,P.y,P.z).project(camera),sx=r.left+(v.x+1)/2*r.width,sy=r.top+(1-v.y)/2*r.height;return v.z<1&&sx>=x0&&sx<=x1&&sy>=y0&&sy<=y1;};
  for(const it of data.items)if(visible(it)&&inBox(pose(it)))selected.add(it.id);for(const run of data.runs)if(visible(run)&&runPoints(run).some(inBox))selected.add(run.id);refreshSelection();return;}
 if(drag){const moved=drag.moved;drag=null;if(moved){queueRebuild();renderInspector();}return;}
 if(!downAt||Math.hypot(e.clientX-downAt[0],e.clientY-downAt[1])>5||e.button!==0)return;
 if(mode==='select'){pointer(e);const it=markerHit()||runHit();select(it?.id,e.shiftKey);return;}
 const loc=hover(e,mode==='run'&&runStart?runStart.road:undefined);if(!loc)return status('Click nearer a road.');const s=snapped(loc,e.altKey),type=$('type').value,cat=CATALOGUE[type];
 if(mode==='place'){if(cat?.kind==='run')return status('That type is a run: switch to Run (R).');
  const it={id:uid(type),type,...s,rot:ROT[$('facing').value](s.side),dy:0};const params={...cat?.params};if(type==='traffic_signal')params.junction=nearestJunction(locate(loc.f.x+loc.f.lx*loc.lat,loc.f.z+loc.f.lz*loc.lat,'corridor').p);if(Object.keys(params).length)it.params=params;
  snapshot();data.items.push(it);selected=new Set([it.id]);queueRebuild();renderInspector();status(`Placed ${label(type)} at Ch ${s.ch}`);return;}
 if(mode==='run'){if(cat?.kind!=='run')return status('Choose a railing or paving type for runs.');if(type==='paving'&&s.road!=='corridor')return status('Paving runs follow the corridor footpaths.');
  if(!runStart){runStart=s;return status(`Run starts at ${ROAD[s.road].name} Ch ${s.ch} ${s.side}: click its end.`);}
  const run={id:uid(type),type,road:runStart.road,from:Math.min(runStart.ch,s.ch),to:Math.max(runStart.ch,s.ch),side:runStart.side,...(type==='paving'?{params:{...cat.params}}:{ref:'kerb',off:runStart.off,dy:0,ends:[true,true]})};runStart=null;
  if(run.to-run.from<.5)return status('Run too short.');snapshot();data.runs.push(run);selected=new Set([run.id]);queueRebuild();renderInspector();status(`${label(type)} Ch ${run.from}–${run.to}`);}});

// ---------- chainage ruler ----------
const ruler=new T.Group();scene.add(ruler);const textCache=new Map();let rulerKey='';
function textSprite(text){if(!textCache.has(text)){if(textCache.size>400)textCache.clear();const c=document.createElement('canvas');c.width=128;c.height=40;const g=c.getContext('2d');g.fillStyle='#1f2626cc';g.beginPath();g.roundRect(2,4,124,32,14);g.fill();g.fillStyle='#fff';g.font='bold 20px system-ui';g.textAlign='center';g.fillText(text,64,27);textCache.set(text,new T.SpriteMaterial({map:new T.CanvasTexture(c),depthTest:false}));}
 const s=new T.Sprite(textCache.get(text));s.renderOrder=1004;return s;}
function drawRuler(){const dist=camera.position.distanceTo(controls.target),loc=$('ticks').checked&&locate(controls.target.x,controls.target.z,$('lock').value||null);
 const key=loc?`${loc.road.id}|${Math.round(loc.ch/2)}|${Math.round(Math.log(dist)*8)}`:'none';if(key===rulerKey)return;rulerKey=key;ruler.traverse(n=>n.geometry?.dispose());ruler.clear();if(!loc)return;
 const road=loc.road,step=dist<90?1:dist<300?5:10,labelStep=dist<200?10:dist<700?50:100,range=Math.min(1500,Math.max(80,dist*2.2)),c0=Math.max(road.toCh(road.p0),Math.ceil((loc.ch-range)/step)*step),c1=Math.min(road.toCh(road.p1),loc.ch+range),pts=[];
 for(let ch=c0;ch<=c1;ch+=step){const n=Math.round(ch),p=road.toParam(n),f=road.frame(p),kerb=road.kerb(p),half=n%100===0?kerb:n%10===0?Math.min(kerb,2.5):.6,y=road.surface(p,0)+.06;
  pts.push(new T.Vector3(f.x-f.lx*half,y,f.z-f.lz*half),new T.Vector3(f.x+f.lx*half,y,f.z+f.lz*half));
  if(n%labelStep===0){const s=textSprite(`${n}`);s.position.set(f.x,y+Math.max(1.2,dist/60),f.z);s.scale.set(dist/14,dist/14*40/128,1);ruler.add(s);}}
 const lines=new T.LineSegments(new T.BufferGeometry().setFromPoints(pts),new T.LineBasicMaterial({color:0xffffff,depthTest:false,transparent:true,opacity:.85}));lines.renderOrder=1002;ruler.add(lines);}
$('ticks').onchange=()=>{rulerKey='';drawRuler();};$('lock').onchange=()=>{rulerKey='';runStart=null;};

// ---------- modes, keys, toolbar ----------
const HINTS={select:'Drag arrows to move · Shift-click / Shift-drag to select several · Q/E rotate · arrows nudge',place:'Click beside a road to place the chosen type · Alt-click: no snapping',run:'Click the start, then the end of the run (same road) · Esc cancels'};
function setMode(m){mode=m;runStart=null;document.querySelectorAll('#modes button').forEach(b=>b.classList.toggle('on',b.dataset.mode===m));$('hintText').textContent=HINTS[m];
 const kind=CATALOGUE[$('type').value]?.kind||'point';if(m==='run'&&kind!=='run')$('type').value='railing';if(m==='place'&&kind==='run')$('type').value='lamp_road';drawOverlay();}
$('modes').onclick=e=>{const b=e.target.closest('button');if(b)setMode(b.dataset.mode);};
$('type').onchange=()=>{const kind=CATALOGUE[$('type').value]?.kind||'point';if(mode!=='select')setMode(kind==='run'?'run':'place');else drawOverlay();};
function undo(){const prev=history.pop();if(!prev)return;data=JSON.parse(prev);selected=new Set([...selected].filter(byId));dirty=history.length>0;queueRebuild();renderInspector();}
$('undo').onclick=undo;
async function save(){const body=JSON.stringify(data);
 try{const r=await fetch('/__street/save',{method:'POST',body});if(!r.ok)throw Error(r.status);dirty=false;status('Saved to public/street/furniture.json');setTimeout(status,2500);}
 catch{const a=document.createElement('a');a.href=URL.createObjectURL(new Blob([body],{type:'application/json'}));a.download='furniture.json';a.click();dirty=false;status('No dev server: downloaded furniture.json — copy it to public/street/');}}
$('save').onclick=save;
const nudge=fn=>{const list=[...selected].map(byId).filter(e=>e&&!isRun(e));if(list.length)edit(()=>list.forEach(fn));};
addEventListener('keydown',e=>{if(e.target.matches?.('input,select,textarea'))return;const k=e.key.toLowerCase(),mod=e.metaKey||e.ctrlKey,big=e.shiftKey;
 if(mod&&k==='z'){e.preventDefault();undo();}else if(mod&&k==='s'){e.preventDefault();save();}else if(mod&&k==='d'){e.preventDefault();duplicate();}
 else if(mod)return;else if(k==='s')setMode('select');else if(k==='p')setMode('place');else if(k==='r')setMode('run');
 else if(k==='q'||k==='e'){const d=(k==='q'?1:-1)*(big?1:15);nudge(it=>it.rot=+(((it.rot||0)+d+540)%360-180).toFixed(2));}
 else if(k==='arrowleft'||k==='arrowright'){e.preventDefault();const d=(k==='arrowright'?1:-1)*(big?5:.5);edit(()=>[...selected].map(byId).forEach(it=>{if(!it)return;if(isRun(it)){it.from=fix(it.from+d);it.to=fix(it.to+d);}else it.ch=fix(it.ch+d);}));}
 else if(k==='arrowup'||k==='arrowdown'){e.preventDefault();const d=(k==='arrowup'?1:-1)*(big?.5:.05);edit(()=>[...selected].map(byId).forEach(it=>{if(it&&it.type!=='paving')it.off=fix((it.off||0)+d);}));}
 else if(k==='f')focus(byId([...selected][0]));else if(k==='escape'){if(runStart){runStart=null;status();}else select(null);}
 else if(k==='delete'||k==='backspace')deleteSelected();});
addEventListener('beforeunload',e=>{if(dirty)e.preventDefault();});
$('night').onchange=e=>{const on=e.target.checked;environment?.setNight(on);for(const m of [...(environment?.nightMaterials||[]),furnitureMaterials().lamp]){m.emissive.copy(m.color);m.emissiveIntensity=on?.8:0;}
 scene.background.set(on?0x0b1320:0xcfd9df);scene.fog.color.copy(scene.background);hemi.intensity=on?.25:1.6;sun.intensity=on?.05:2.2;};
const sceneryGroup=new T.Group();scene.add(sceneryGroup);$('showScenery').onchange=e=>sceneryGroup.visible=e.target.checked;

// ---------- model library (drop .glb files) ----------
async function loadModels(){try{models=await fetch('/__street/models').then(r=>r.ok?r.json():[]);}catch{models=[];}fillTypeSelect();}
let dragDepth=0;addEventListener('dragenter',e=>{e.preventDefault();if(++dragDepth)$('drop').style.display='flex';});addEventListener('dragleave',()=>{if(--dragDepth<=0){dragDepth=0;$('drop').style.display='none';}});
addEventListener('dragover',e=>e.preventDefault());
addEventListener('drop',async e=>{e.preventDefault();dragDepth=0;$('drop').style.display='none';const files=[...e.dataTransfer.files].filter(f=>/\.glb$/i.test(f.name));if(!files.length)return status('Only .glb files can be added.');
 let last;for(const f of files){const r=await fetch('/__street/models/'+encodeURIComponent(f.name),{method:'POST',body:f});if(!r.ok)return status('Upload needs the dev server (npm run dev).');last=(await r.json()).name;}
 await loadModels();$('type').value='glb:'+last;setMode('place');status(`Added ${files.length} model(s) to public/street/models · click to place`);});

// ---------- context scenery: the game's environment without its furniture (drawn live above), plus stations ----------
async function loadScenery(){status('Loading game scenery…');const asset=f=>BASE+'assets/'+f;
 kit=(await loader.loadAsync(asset('street-kit.glb'))).scene;queueRebuild();
 try{const before=new Set(scene.children);environment=buildEnvironment(scene,kit,{furniture:data,drawFurniture:false});for(const o of [...scene.children])if(!before.has(o))sceneryGroup.add(o);environment.update?.(project(),0);
  for(const st of STOPS){const root=(await loader.loadAsync(asset(`station-${st.id}.glb`))).scene,r=sample(st.s);root.position.set(r.x,r.y,r.z);root.rotation.y=r.heading;sceneryGroup.add(root);}}
 catch(err){console.error(err);status('Game scenery failed to load (see console)');return;}status();}
const project=()=>{const l=locate(controls.target.x,controls.target.z,'corridor');return l?l.p:0;};

let frame=0;renderer.setAnimationLoop(()=>{controls.update();const dist=camera.position.distanceTo(controls.target),s=Math.min(14,Math.max(.7,dist/45));
 if(Math.abs(s-markerScale)/markerScale>.05){markerScale=s;placeMarkers();}if(++frame%10===0)drawRuler();if(environment&&frame%30===0)environment.update?.(project(),performance.now()/1000);renderer.render(scene,camera);});

// ---------- boot ----------
(async()=>{setMode('select');renderInspector();
 data=await fetch(BASE+'street/furniture.json',{cache:'no-store'}).then(r=>r.ok?r.json():structuredClone(EMPTY)).catch(()=>structuredClone(EMPTY));data.items??=[];data.runs??=[];
 await loadModels();rebuild();await loadScenery();
 window.__street={get data(){return data;},get selected(){return selected;},select,setMode,save,scene,camera,controls,rebuild,byId,pose};})();
