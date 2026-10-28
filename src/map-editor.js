// SGMTS Map Editor (dev server: /editor.html; "Edit Lots.command" / "Edit Street.command"). One page, three layers:
//  Streets: draw roads, footpaths and paved/planted areas (SimCity style) and place lamps, bins, signs, signals, railings, paving
//           and your own .glb models by road + chainage + side + offset + rotation → public/street/furniture.json
//  Lots:    OZP lots — wand-trace from the plan, draw, reshape, zoning, plot ratio, 3D model → public/lots/lots.json
//  Hills:   add, move, size and remove the backdrop hills → public/street/furniture.json (`hills`)
// Top view (orthographic) by default; the scene is static (no wind, no traffic) and is drawn only when something changes.
import * as T from 'three';
import {MapControls} from 'three/addons/controls/MapControls.js';
import {GLTFLoader} from 'three/addons/loaders/GLTFLoader.js';
import {STOPS,JUNCTIONS,sample,project as corridorS,DATUM,roadSection} from './alignment.js';
import {buildEnvironment,renderedGround,sceneryClear,setSceneryScale} from './environment.js';
import {PRESETS,FINISHES,FOOTWAYS,CORNER,buildNetwork,frames as netFrames,nearestOn,halfWidth,presetOf,reserveClash,junctions as netJunctions,networkMask} from './street/network.js';
import {corridorReserve,pointInPolygon,blockCorridor,wandPolygon,polygonArea} from './lots/wand.js';
import {buildLot,useOf,plotRatio,ZONES,USE_COLOURS,defaultModel,centroid,occupiedBy,nightMaterials as lotNightMaterials} from './lots/massing.js';
import {HILL,hillMesh,hillOutline} from './street/hills.js';
import {mergeByMaterial} from './batching.js';
import {ROADS,ROAD,pose,poseAt,locate,setNetwork,nearest,record} from './street/roads.js';
import {CATALOGUE,PAVING_PATTERNS,SIGNAL_AXES,isModel,placeFurniture,kitLibrary,instancer,runPoints,loadFurnitureModels,furnitureMaterials,EMPTY} from './street/furniture.js';

const BASE=import.meta.env.BASE_URL,$=id=>document.getElementById(id),esc=s=>String(s??'').replace(/[&<>"]/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;'}[c]));
const loader=new GLTFLoader(),modelCache={},cachedLoader={loadAsync:url=>modelCache[url]??=loader.loadAsync(url)};
const round=(v,step)=>Math.round(v/step)*step,fix=v=>+(+v).toFixed(3);

// ---------- scene: static (no wind, no animation), drawn only when the view or the data changes; no fog, no shadow pass ----------
const renderer=new T.WebGLRenderer({antialias:true});renderer.setPixelRatio(Math.min(1.5,devicePixelRatio));document.body.prepend(renderer.domElement);
const scene=new T.Scene();scene.background=new T.Color(0xcfd9df);
const hemi=new T.HemisphereLight(0xf4f7ff,0x6f7a5a,1.6);scene.add(hemi);
const sun=new T.DirectionalLight(0xffffff,2.2);sun.position.set(600,900,300);scene.add(sun);
// Top view: orthographic, straight down (drag pans, wheel zooms). 3D view: perspective, right button tilts and turns.
const TOP_H=5000,topCam=new T.OrthographicCamera(-1,1,1,-1,1,12000),perspCam=new T.PerspectiveCamera(45,1,.5,20000);
let camera=topCam,controls=null,frames=3;const requestRender=()=>{frames=Math.max(frames,3);};
function makeControls(target){controls?.dispose();controls=new MapControls(camera,renderer.domElement);controls.screenSpacePanning=false;controls.target.copy(target);
 if(camera===topCam){controls.enableRotate=false;controls.minZoom=.03;controls.maxZoom=60;controls.zoomToCursor=true;}else{controls.maxPolarAngle=Math.PI*.49;controls.minDistance=5;controls.maxDistance=9000;}
 controls.addEventListener('change',requestRender);controls.update();}
function resize(){renderer.setSize(innerWidth,innerHeight);const a=innerWidth/innerHeight;perspCam.aspect=a;perspCam.updateProjectionMatrix();Object.assign(topCam,{left:-300*a,right:300*a,top:300,bottom:-300});topCam.updateProjectionMatrix();requestRender();}
addEventListener('resize',resize);resize();
// Metres across the view, as a perspective camera distance (marker sizes, ruler density, scenery reach).
const viewDist=()=>camera===topCam?(topCam.top-topCam.bottom)/topCam.zoom/.83:camera.position.distanceTo(controls.target);
// Centre on (x,y,z), showing about d metres (top view) or seen from d metres (3D).
function lookAtPoint(x,y,z,d){if(camera===topCam){camera.position.set(x,y+TOP_H,z+.01);if(d)camera.zoom=Math.min(60,Math.max(.03,(topCam.top-topCam.bottom)/(d*.83)));camera.updateProjectionMatrix();}
 else{const v=camera.position.clone().sub(controls.target);if(d)v.setLength(d);camera.position.set(x,y,z).add(v);}controls.target.set(x,y,z);controls.update();requestRender();}
function setView(top){const t=controls.target.clone(),d=viewDist();camera=top?topCam:perspCam;
 if(top){camera.position.set(t.x,t.y+TOP_H,t.z+.01);camera.zoom=Math.min(60,Math.max(.03,(topCam.top-topCam.bottom)/(d*.83)));camera.updateProjectionMatrix();}else camera.position.set(t.x,t.y+d*.6,t.z+d*.8);
 makeControls(t);$('view3d').textContent=top?'3D view':'Top view';plan.material.opacity=+$('planOpacity').value*(top?1:.3);requestRender();}
{const f=pose({road:'corridor',ch:1500,side:'L',off:0});camera.position.set(f.x,f.y+TOP_H,f.z+.01);makeControls(new T.Vector3(f.x,f.y,f.z));lookAtPoint(f.x,f.y,f.z,900);}
for(const ev of ['pointermove','pointerdown','pointerup','wheel','keydown'])addEventListener(ev,requestRender,{passive:true});

// ---------- state ----------
let data=structuredClone(EMPTY),selected=new Set(),mode='select',history=[],dirty=false,kit=null,environment=null,models=[],runStart=null,errors=[],layer='streets',lots=[],lotDoc={version:1,lots:[]},dirtyLots=false;
const entries=()=>[...data.items,...data.runs],byId=id=>entries().find(e=>e.id===id),isRun=e=>e&&'from' in e;
const label=type=>isModel(type)?type.slice(4):CATALOGUE[type]?.label||type;
// One undo history for both files: entries are {kind:'street'|'lots', json}.
function snapshot(){history.push({kind:'street',json:JSON.stringify(data)});if(history.length>150)history.shift();dirty=true;status();}
// A message stays up for a few seconds even if the counts refresh meanwhile.
let notice='',noticeUntil=0;
function status(msg){if(msg){notice=msg;noticeUntil=performance.now()+4500;}else if(performance.now()<noticeUntil)msg=notice;$('status').textContent=msg||`${data.network?.roads.length||0} roads · ${data.items.length} items · ${lots.length} lots · ${hillList().length} hills${errors.length?` · ${errors.length} skipped`:''}${dirty||dirtyLots?' · unsaved changes':''}`;}
function uid(type){const base=isModel(type)?'model':type;let n=0;for(const e of entries()){const m=e.id.match(new RegExp('^'+base.replace(/\W/g,'\\$&')+'-(\\d+)$'));if(m)n=Math.max(n,+m[1]);}return `${base}-${String(n+1).padStart(3,'0')}`;}
const ROT={along:()=>0,against:()=>180,road:side=>side==='L'?-90:90,away:side=>side==='L'?90:-90};
const nearestJunction=s=>JUNCTIONS.reduce((a,j)=>Math.abs(j.s-s)<Math.abs(a.s-s)?j:a).c;

// ---------- furniture layer (rebuilt from data after every edit) ----------
const furnLayer=new T.Group(),modelLayer=new T.Group(),overlay=new T.Group(),netLayer=new T.Group();scene.add(furnLayer,modelLayer,overlay,netLayer);
let queued=false,lastBuild=0,modelToken=0;
function rebuild(){queued=false;lastBuild=performance.now();
 furnLayer.traverse(n=>{if(n.isInstancedMesh)n.dispose();});furnLayer.clear();
 // drawn streets first: they join the road registry the furniture is placed on
 setNetwork(data.network,renderedGround);frameCache.clear();netLayer.traverse(n=>n.geometry?.dispose());netLayer.clear();netLayer.add(buildNetwork(data.network,{mats:environment?.materials,ground:renderedGround}));fillRoadSelects();
 if(kit){const inst=instancer(),out=placeFurniture(data,{batch:inst.batch,kitParts:kitLibrary(kit)});inst.finish(furnLayer);out.signals.filter(s=>!s.sharedPole).forEach(s=>furnLayer.add(s.group));errors=out.errors;}
 const token=++modelToken;loadFurnitureModels(data,{loader:cachedLoader,url:src=>BASE+'street/models/'+src}).then(g=>{if(token!==modelToken)return;modelLayer.clear();if(g.children.length)modelLayer.add(...g.children);requestRender();});
 buildHills();drawOverlay();renderList();status();requestRender();}
function queueRebuild(){if(queued)return;queued=true;requestAnimationFrame(rebuild);}

// Arrow markers (front = arrow tip) for every point item; lines for runs; tinted paving strips when relevant.
const arrowShape=new T.Shape();arrowShape.moveTo(0,-1.1);arrowShape.lineTo(.55,-.1);arrowShape.lineTo(.2,-.1);arrowShape.lineTo(.2,.6);arrowShape.lineTo(-.2,.6);arrowShape.lineTo(-.2,-.1);arrowShape.lineTo(-.55,-.1);arrowShape.closePath();
const arrowGeo=new T.ShapeGeometry(arrowShape).rotateX(Math.PI/2),markerMat=new T.MeshBasicMaterial({depthTest:false,transparent:true,opacity:.9,side:T.DoubleSide});
const GROUP_COLOURS={Lighting:0xf2b33d,Furniture:0xe0662c,Paving:0x9b7ad6,Signs:0x2e9f6b,Signals:0xd33c3c,Railings:0x3f8fd1,Models:0xd64fb0};
const colourOf=e=>new T.Color(selected.has(e.id)?0x1d6fd6:GROUP_COLOURS[isModel(e.type)?'Models':CATALOGUE[e.type]?.group]||0x888888);
let markers=null,markerItems=[],markerScale=1;
const runLine=run=>{if(run.type==='paving')return runPoints({...run,ref:'kerb',off:1.875}).map(p=>new T.Vector3(p.x,p.y+.08,p.z));return runPoints(run).map(p=>new T.Vector3(p.x,p.y+1.15,p.z));};
function drawOverlay(){overlay.traverse(n=>n.geometry?.dispose());overlay.clear();
 markerItems=data.items.filter(visible);markers=new T.InstancedMesh(arrowGeo,markerMat,Math.max(1,markerItems.length));markers.count=markerItems.length;markers.renderOrder=1003;markers.frustumCulled=false;markers.visible=!farDetail;
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
function fillRoadSelects(){const o=ROADS.map(r=>`<option value="${r.id}">${esc(r.name)}</option>`).join('');for(const [id,first] of [['lock','Nearest road'],['fRoad','All roads']]){const v=$(id).value;$(id).innerHTML=`<option value="">${first}</option>`+o;if(ROAD[v])$(id).value=v;}}fillRoadSelects();
function visible(e){const f=$('fRoad').value,t=$('fType').value,a=$('fFrom').value,b=$('fTo').value,side=$('fSide').value,lo=isRun(e)?Math.min(e.from,e.to):e.ch,hi=isRun(e)?Math.max(e.from,e.to):e.ch;
 return (!f||e.road===f)&&(!t||e.type===t)&&(a===''||hi>=+a)&&(b===''||lo<=+b)&&(!side||e.side===side);}
const where=e=>`${ROAD[e.road]?.name||e.road} · Ch ${isRun(e)?`${e.from.toFixed(1)}–${e.to.toFixed(1)}`:e.ch.toFixed(1)} ${e.side||''}`;
function renderList(){if(layer!=='streets')return;const shown=entries().filter(visible),net=netAll();$('items').innerHTML=(net.length?`<div class="item"><small>${data.network.roads.length} drawn roads · ${data.network.areas.length} areas</small></div>`+net.map(n=>`<div class="item${selected.has(n.id)?' sel':''}" data-id="${esc(n.id)}"><div>${esc(netLabel(n))}<br><small>${esc(netWhere(n))}</small></div><small>${esc(n.id)}</small></div>`).join(''):'')+`<div class="item"><small>${shown.length} shown</small></div>`+shown.slice(0,400).map(e=>`<div class="item${selected.has(e.id)?' sel':''}" data-id="${esc(e.id)}"><div>${esc(label(e.type))}<br><small>${esc(where(e))}</small></div><small>${esc(e.id)}</small></div>`).join('')+(shown.length>400?'<div class="item"><small>Narrow the filters to list the rest.</small></div>':'');}
$('items').onclick=e=>{const el=e.target.closest('[data-id]');if(!el)return;select(el.dataset.id,e.shiftKey);const n=netById(el.dataset.id);if(n)focusPoint(...centreOf(n));else focus(byId(el.dataset.id));};
for(const id of ['fRoad','fType','fFrom','fTo','fSide'])$(id).addEventListener('input',()=>{drawOverlay();renderList();});
$('selectShown').onclick=()=>{selected=new Set(entries().filter(visible).map(e=>e.id));refreshSelection();};
function focus(e){if(!e)return;const P=isRun(e)?pose(e,(e.from+e.to)/2):pose(e);lookAtPoint(P.x,P.y,P.z,Math.min(viewDist(),120));}

// ---------- selection & inspector ----------
function select(id,add=false){if(!add)selected.clear();if(id){if(add&&selected.has(id))selected.delete(id);else selected.add(id);}refreshSelection();}
function refreshSelection(){vertexSel=null;drawOverlay();renderList();renderInspector();drawPreview();}
function edit(fn){snapshot();fn();queueRebuild();renderInspector();}
const opt=(v,t,cur)=>`<option value="${esc(v)}"${String(v)===String(cur)?' selected':''}>${esc(t)}</option>`;
function renderInspector(){if(layer!=='streets')return;const el=$('inspector'),list=[...selected].map(byId).filter(Boolean),net=[...selected].map(netById).filter(Boolean);if(net.length===1&&!list.length)return netInspector(el,net[0]);
 if(!list.length){el.innerHTML=`<h2>Nothing selected</h2><p class="sub">Click an arrow (item) or a line (railing / paving run).</p>
 <p><b>Road</b> (D): pick a road type, click points; Enter or double-click finishes. Start on a drawn road's end to extend it, end on another's end to join, end on a road's side for a T-junction; the ends of the game's side roads snap too. Shift: 15° steps · Alt: no 1 m snap · Backspace: undo last point · Esc: cancel.<br><b>Area</b> (A): click the corners of a paved or planted area; click the first corner again to close. Corners lock onto footpath edges.<br><b>Bulldoze</b> (B): click a road, area or item to delete it.<br>Nothing can be drawn on the SGMTS corridor reserve (red while drawing). Click a drawn road to edit its type, footpath paving, points, or line it with lamps, bins or signs.</p>
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
 ${e.type==='operator_cabin'?`<div class="row"><span>Length m</span><input id="p-length" type="number" step=".5" min="1.6" value="${e.params?.length??12}"></div><div class="row"><span>Use</span><select id="p-use">${opt('rest','Rest room + WC',e.params?.use)}${opt('wc','Toilet pod',e.params?.use)}</select></div><div class="row"><span>WC sign</span><select id="p-wc">${['male','female','accessible'].map(w=>opt(w,w,e.params?.wc)).join('')}</select></div><div class="row"><span>Apron m</span><input id="p-apron" type="number" step=".1" value="${e.params?.apron??1.2}"></div><p class="sub">3.2 m deep; front (door side) is the arrow. Bays of about 1.5 m.</p>`:''}
 ${e.type==='railing'?`<div class="row"><span>End panels</span><div class="pair"><label class="chk"><input type="checkbox" id="f-e0"${e.ends?.[0]!==false?' checked':''}>start</label><label class="chk"><input type="checkbox" id="f-e1"${e.ends?.[1]!==false?' checked':''}>end</label></div></div>`:''}
 <div class="btns"><button id="b-focus">Zoom to (F)</button><button id="b-dup">Duplicate</button><button id="b-mirror">Mirror copy</button><button id="b-del" class="warn">Delete</button></div>
 ${run?'':`<hr><b>Repeat along the road</b><div class="row"><span>Every m</span><input id="r-step" type="number" step="1" value="30"></div>
 <div class="row"><span>From / to Ch</span><div class="pair"><input id="r-from" type="number" value="${e.ch}"><input id="r-to" type="number" value="${fix(Math.min(road.toCh(road.p1),e.ch+300))}"></div></div>
 <label class="chk"><input type="checkbox" id="r-both">Both sides (mirrored)</label><div class="btns"><button id="b-repeat">Repeat</button></div>`}`;
 const bind=(id,fn)=>{const x=$(id);if(x)x.addEventListener('change',()=>edit(()=>fn(x.type==='checkbox'?x.checked:x.value)));};
 bind('f-type',v=>{e.type=v;e.params={...CATALOGUE[v]?.params,...e.params};});bind('f-road',v=>{e.road=v;const r=ROAD[v];const clamp=c=>fix(Math.min(r.toCh(r.p1),Math.max(r.toCh(r.p0),c)));if(run){e.from=clamp(e.from);e.to=clamp(e.to);}else e.ch=clamp(e.ch);});
 bind('f-ch',v=>e.ch=fix(v));bind('f-from',v=>e.from=fix(v));bind('f-to',v=>e.to=fix(v));bind('f-side',v=>e.side=v);bind('f-ref',v=>e.ref=v);bind('f-off',v=>e.off=fix(v));bind('f-rot',v=>e.rot=+v);bind('f-dy',v=>e.dy=fix(v));
 const param=(id,k,f=Number)=>bind(id,v=>{e.params={...e.params,[k]:v===''?undefined:f(v)};});param('p-height','height');param('p-junction','junction');param('p-axis','axis',String);param('p-pattern','pattern',String);param('p-scale','scale');param('p-light','light');param('p-length','length');param('p-use','use',String);param('p-wc','wc',String);param('p-apron','apron');
 bind('f-e0',v=>e.ends=[v,e.ends?.[1]!==false]);bind('f-e1',v=>e.ends=[e.ends?.[0]!==false,v]);
 el.querySelectorAll('[data-face]').forEach(b=>b.onclick=()=>edit(()=>e.rot=ROT[b.dataset.face](e.side)));
 $('b-focus').onclick=()=>focus(e);$('b-dup').onclick=duplicate;$('b-mirror').onclick=()=>edit(()=>mirror([e]));$('b-del').onclick=deleteSelected;
 if($('b-repeat'))$('b-repeat').onclick=()=>{const step=+$('r-step').value,a=+$('r-from').value,b=+$('r-to').value;if(!(step>=.5)||b<a)return status('Repeat needs a step of at least 0.5 m and from ≤ to.');
  edit(()=>{const made=[];for(let ch=a;ch<=b+1e-6;ch+=step)for(const side of $('r-both').checked?['L','R']:[e.side]){if(side===e.side&&Math.abs(ch-e.ch)<.01)continue;const c={...structuredClone(e),id:'',ch:fix(ch),side,rot:side===e.side?e.rot:-(e.rot??0)};c.id=uid(c.type);data.items.push(c);made.push(c.id);}
   status(`Added ${made.length} copies`);});};}
function duplicate(){const list=[...selected].map(byId).filter(Boolean);if(!list.length)return;edit(()=>{selected.clear();for(const e of list){const c=structuredClone(e);c.id=uid(c.type);if(isRun(c)){const d=Math.abs(c.to-c.from);c.from=fix(c.from+d);c.to=fix(c.to+d);data.runs.push(c);}else{c.ch=fix(c.ch+5);data.items.push(c);}selected.add(c.id);}});}
// Copy to the other side, reflected across the road: offsets keep their size, rotations mirror.
function mirror(list){for(const e of list){const c=structuredClone(e);c.id=uid(c.type);c.side=e.side==='L'?'R':'L';if(!isRun(c)){c.rot=-(e.rot??0);data.items.push(c);}else data.runs.push(c);}}
function deleteSelected(){const net=[...selected].map(netById).filter(Boolean);if(net.length)return removeNet(net);const n=selected.size;if(!n||n>1&&!confirm(`Delete ${n} entries?`))return;edit(()=>{data.items=data.items.filter(e=>!selected.has(e.id));data.runs=data.runs.filter(e=>!selected.has(e.id));selected.clear();});drawOverlay();}

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
renderer.domElement.addEventListener('pointerdown',e=>{if(layer!=='streets')return;downAt=[e.clientX,e.clientY];if(e.button!==0||mode!=='select')return;pointer(e);
 const h=handleHit();if(h){vertexSel=h;vdrag={...h,moved:false};controls.enabled=false;renderer.domElement.setPointerCapture(e.pointerId);drawPreview();return;}
 if(e.shiftKey){box={x:e.clientX,y:e.clientY};controls.enabled=false;renderer.domElement.setPointerCapture(e.pointerId);return;}
 const it=markerHit();if(!it)return;if(!selected.has(it.id))select(it.id);
 const loc=hover(e,it.road);drag={it,loc,start:{ch:it.ch,off:it.off,side:it.side},moved:false,others:[...selected].map(byId).filter(x=>x&&x!==it&&!isRun(x)).map(x=>({x,ch:x.ch}))};controls.enabled=false;renderer.domElement.setPointerCapture(e.pointerId);});
renderer.domElement.addEventListener('pointermove',e=>{if(layer!=='streets')return;
 if(vdrag){const p=groundAt(e);if(!p)return;if(!vdrag.moved){snapshot();vdrag.moved=true;}const s=gridSnap(p,e);vdrag.n.pts[vdrag.i]=[s.x,s.z];frameCache.clear();drawPreview();if(performance.now()-lastBuild>150)queueRebuild();return;}
 if(mode==='road'||mode==='area'){const p=groundAt(e);if(!p)return;cursor=mode==='road'?snapRoad(p,e):snapArea(p,e);showSnap(cursor);drawPreview();$('readout').textContent=`${p.x.toFixed(1)}, ${p.z.toFixed(1)}${cursor.label?' · '+cursor.label:''}`;return;}
 if(box){const b=$('box');Object.assign(b.style,{display:'block',left:Math.min(box.x,e.clientX)+'px',top:Math.min(box.y,e.clientY)+'px',width:Math.abs(e.clientX-box.x)+'px',height:Math.abs(e.clientY-box.y)+'px'});return;}
 if(drag){const loc=hover(e,drag.it.road);if(!loc)return;if(!drag.moved){snapshot();drag.moved=true;}const s=snapped(loc,e.altKey),dch=s.ch-drag.start.ch,it=drag.it;
  if(it.ref==='centre')s.off=fix(e.altKey?Math.abs(loc.lat):round(Math.abs(loc.lat),.05));Object.assign(it,{ch:s.ch,side:s.side,off:s.off});for(const o of drag.others)o.x.ch=fix(o.ch+dch);readout(loc);placeMarkers();
  if(performance.now()-lastBuild>120)queueRebuild();return;}
 readout(hover(e,mode==='run'&&runStart?runStart.road:undefined));});
renderer.domElement.addEventListener('pointerup',e=>{if(layer!=='streets')return;controls.enabled=true;
 if(vdrag){const {n,moved}=vdrag;vdrag=null;if(moved){const c=reserveClash(n.pts,isArea(n)?{closed:true}:{width:halfWidth(n)});if(c){undo();refuse(c);}queueRebuild();renderInspector();}return;}
 if(box){const r=renderer.domElement.getBoundingClientRect(),x0=Math.min(box.x,e.clientX),x1=Math.max(box.x,e.clientX),y0=Math.min(box.y,e.clientY),y1=Math.max(box.y,e.clientY);box=null;$('box').style.display='none';
  const inBox=P=>{const v=new T.Vector3(P.x,P.y,P.z).project(camera),sx=r.left+(v.x+1)/2*r.width,sy=r.top+(1-v.y)/2*r.height;return v.z<1&&sx>=x0&&sx<=x1&&sy>=y0&&sy<=y1;};
  for(const it of data.items)if(visible(it)&&inBox(pose(it)))selected.add(it.id);for(const run of data.runs)if(visible(run)&&runPoints(run).some(inBox))selected.add(run.id);refreshSelection();return;}
 if(drag){const moved=drag.moved;drag=null;if(moved){queueRebuild();renderInspector();}return;}
 if(!downAt||Math.hypot(e.clientX-downAt[0],e.clientY-downAt[1])>5||e.button!==0)return;
 if(mode==='road'||mode==='area'||mode==='bulldoze')return netClick(e);
 if(mode==='select'){pointer(e);const it=markerHit()||runHit(),p=it?null:groundAt(e),n=p&&netHit(p.x,p.z);select(it?.id||n?.id,e.shiftKey);return;}
 const loc=hover(e,mode==='run'&&runStart?runStart.road:undefined);if(!loc)return status('Click nearer a road.');const s=snapped(loc,e.altKey),type=$('type').value,cat=CATALOGUE[type];
 if(mode==='place'){if(cat?.kind==='run')return status('That type is a run: switch to Run (R).');
  const it={id:uid(type),type,...s,rot:ROT[$('facing').value](s.side),dy:0};const params={...cat?.params};if(type==='traffic_signal')params.junction=nearestJunction(locate(loc.f.x+loc.f.lx*loc.lat,loc.f.z+loc.f.lz*loc.lat,'corridor').p);if(Object.keys(params).length)it.params=params;
  snapshot();data.items.push(it);selected=new Set([it.id]);queueRebuild();renderInspector();status(`Placed ${label(type)} at Ch ${s.ch}`);return;}
 if(mode==='run'){if(cat?.kind!=='run')return status('Choose a railing or paving type for runs.');if(type==='paving'&&s.road!=='corridor')return status('Paving runs follow the corridor footpaths.');
  if(!runStart){runStart=s;return status(`Run starts at ${ROAD[s.road].name} Ch ${s.ch} ${s.side}: click its end.`);}
  const run={id:uid(type),type,road:runStart.road,from:Math.min(runStart.ch,s.ch),to:Math.max(runStart.ch,s.ch),side:runStart.side,...(type==='paving'?{params:{...cat.params}}:{ref:'kerb',off:runStart.off,dy:0,ends:[true,true]})};runStart=null;
  if(run.to-run.from<.5)return status('Run too short.');snapshot();data.runs.push(run);selected=new Set([run.id]);queueRebuild();renderInspector();status(`${label(type)} Ch ${run.from}–${run.to}`);}});

// ---------- drawn network: Road / Area / Bulldoze (SimCity style) ----------
// Road: click points (snaps to 1 m; Shift keeps 15° steps; Alt free). Starting on the end of a drawn road extends it; ending on one
// joins them; ending on a road's side makes a T-junction; the ends of the game's side roads are snap points too. Enter or
// double-click finishes. Area: click corners, close on the first corner (or Enter). Nothing may touch the corridor reserve (red).
const netAll=()=>[...(data.network?.roads||[]),...(data.network?.areas||[])],netById=id=>netAll().find(n=>n.id===id),isArea=n=>!!data.network?.areas.includes(n);
const netLabel=n=>isArea(n)?`Area · ${FINISHES[n.finish]||n.finish}`:presetOf(n).short+(n.name?` · ${n.name}`:'');
const frameCache=new Map(),framesOf=r=>{const k=r.id+'|'+r.preset+'|'+r.pts.join(';');let F=frameCache.get(k);if(!F)frameCache.set(k,F=netFrames(r,renderedGround));return F;};
const lengthOf=r=>framesOf(r).at(-1)?.d||0,areaOf=a=>Math.abs(a.pts.reduce((s,p,i)=>{const q=a.pts[(i+1)%a.pts.length];return s+p[0]*q[1]-q[0]*p[1];},0)/2);
const netWhere=n=>isArea(n)?`${Math.round(areaOf(n))} m² · ${n.pts.length} corners`:`${Math.round(lengthOf(n))} m · ${n.pts.length} points`;
const centreOf=n=>{const p=n.pts.reduce((a,q)=>[a[0]+q[0],a[1]+q[1]],[0,0]);return [p[0]/n.pts.length,p[1]/n.pts.length];};
const itemsOn=r=>entries().filter(e=>e.road===r.id);
function focusPoint(x,z,d=Math.min(viewDist(),300)){lookAtPoint(x,renderedGround(x,z),z,d);}
function netUid(prefix){let n=0;for(const e of netAll()){const m=e.id.match(new RegExp('^'+prefix+'-(\\d+)$'));if(m)n=Math.max(n,+m[1]);}return `${prefix}-${String(n+1).padStart(3,'0')}`;}
function groundAt(e){pointer(e);let y=controls.target.y;const p=new T.Vector3();for(let i=0;i<3;i++){if(!ray.ray.intersectPlane(new T.Plane(UP,-y),p))return null;y=renderedGround(p.x,p.z);}p.y=y;return p;}
function netHit(x,z){let best=null;for(const r of data.network.roads){const F=framesOf(r);if(F.length<2)continue;const n=nearestOn(F,x,z);if(n.dist<=halfWidth(r)+.5&&(!best||n.dist<best.d))best={n:r,d:n.dist};}
 if(best)return best.n;for(const a of [...data.network.areas].reverse())if(pointInPolygon([x,z],a.pts))return a;return null;}

// Snapping
let draft=null,cursor=null,vertexSel=null,vdrag=null;
function gridSnap(p,e){let x=p.x,z=p.z;const last=draft?.pts.at(-1);
 if(e.shiftKey&&last){const L=Math.hypot(x-last[0],z-last[1]),a=Math.round(Math.atan2(z-last[1],x-last[0])/(Math.PI/12))*(Math.PI/12);x=last[0]+Math.cos(a)*L;z=last[1]+Math.sin(a)*L;}
 if(!e.altKey){x=Math.round(x);z=Math.round(z);}return {x,z,kind:'free',label:''};}
function snapRoad(p,e){let best=null;const take=c=>{if(!best||c.d<best.d)best=c;};
 for(const r of data.network.roads)for(const end of [0,1]){const q=end?r.pts.at(-1):r.pts[0],d=Math.hypot(q[0]-p.x,q[1]-p.z);if(d<8&&!(draft&&draft.snaps.length===1&&draft.snaps[0].road===r&&draft.snaps[0].end===end))take({x:q[0],z:q[1],kind:'end',road:r,end,d,label:`${draft?'join':'extend'} ${netLabel(r)}`});}
 for(const R of ROADS){if(R.drawn||['corridor','cycleway','loop'].includes(R.id))continue;for(const q of [R.p0,R.p1]){const f=R.frame(q),d=Math.hypot(f.x-p.x,f.z-p.z);if(d<12)take({x:f.x,z:f.z,kind:'game',d,label:`end of ${R.name}`});}}
 if(best)return best;
 for(const r of data.network.roads){const F=framesOf(r);if(F.length<2)continue;const n=nearestOn(F,p.x,p.z),L=F.at(-1).d;if(Math.abs(n.lat)<=halfWidth(r)&&n.d>3&&n.d<L-3)return {x:n.f.x,z:n.f.z,kind:'tee',road:r,label:`junction on ${netLabel(r)}`};}
 return gridSnap(p,e);}
// Area corners close on the first corner, then lock onto other areas' corners and the outer edge of drawn footpaths (no grass gap).
function snapArea(p,e){const first=draft?.pts[0];if(first&&draft.pts.length>2&&Math.hypot(first[0]-p.x,first[1]-p.z)<3)return {x:first[0],z:first[1],kind:'close',label:'close the area'};
 if(!e.altKey){for(const a of data.network.areas)for(const q of a.pts)if(Math.hypot(q[0]-p.x,q[1]-p.z)<2.5)return {x:q[0],z:q[1],kind:'end',label:'corner of '+netLabel(a)};
  for(const r of data.network.roads){const F=framesOf(r);if(F.length<2)continue;const n=nearestOn(F,p.x,p.z),w=halfWidth(r),sd=Math.sign(n.lat)||1;
   if(n.d>.5&&n.d<F.at(-1).d-.5&&Math.abs(Math.abs(n.lat)-w)<2.5)return {x:n.f.x+n.f.lx*sd*w,z:n.f.z+n.f.lz*sd*w,kind:'tee',label:'footpath edge of '+netLabel(r)};}}
 return gridSnap(p,e);}

// Overlays: draft, selected outlines + point handles, snap ring, corridor reserve
const preview=new T.Group();scene.add(preview);
const handleGeo=new T.SphereGeometry(.55,14,10),handleMats=[0xffffff,0xe08a2c].map(c=>new T.MeshBasicMaterial({color:c,depthTest:false}));
const snapRing=new T.Mesh(new T.RingGeometry(.9,1.4,28).rotateX(-Math.PI/2),new T.MeshBasicMaterial({color:0xffffff,depthTest:false,transparent:true,side:T.DoubleSide}));snapRing.renderOrder=1006;snapRing.visible=false;scene.add(snapRing);
const SNAP_COLOURS={end:0x2ecc71,game:0x2ecc71,close:0x2ecc71,tee:0xe08a2c,free:0xffffff};
function polyline(pts,color,closed){const l=new (closed?T.LineLoop:T.Line)(new T.BufferGeometry().setFromPoints(pts.map(([x,z,y])=>new T.Vector3(x,(y??renderedGround(x,z))+.35,z))),new T.LineBasicMaterial({color,depthTest:false,transparent:true}));l.renderOrder=1003;return l;}
const edgesOf=(r,F)=>[-1,1].map(s=>F.map(f=>[f.x+f.lx*s*halfWidth(r),f.z+f.lz*s*halfWidth(r),f.y]));
function drawPreview(){preview.traverse(n=>{if(n.geometry&&n.geometry!==handleGeo)n.geometry.dispose();});preview.clear();
 for(const n of [...selected].map(netById).filter(Boolean)){if(isArea(n))preview.add(polyline(n.pts,0x1d6fd6,true));else for(const e of edgesOf(n,framesOf(n)))preview.add(polyline(e,0x1d6fd6));
  n.pts.forEach((p,i)=>{const h=new T.Mesh(handleGeo,handleMats[vertexSel?.n===n&&vertexSel.i===i?1:0]);h.position.set(p[0],renderedGround(p[0],p[1])+.6,p[1]);h.scale.setScalar(Math.max(1,markerScale*.8));h.renderOrder=1006;h.userData.vertex={n,i};preview.add(h);});}
 if(!draft)return;const pts=cursor?[...draft.pts,[cursor.x,cursor.z]]:draft.pts;
 if(draft.kind==='road'){const r={preset:$('preset').value,pts},F=pts.length>1?netFrames(r,renderedGround):[];if(F.length>1){preview.add(polyline(F.map(f=>[f.x,f.z,f.y]),0xe08a2c));for(const e of edgesOf(r,F))preview.add(polyline(e,0xffffff));}}
 else if(pts.length>1)preview.add(polyline(pts,0xe08a2c,pts.length>2));
 for(const p of draft.pts){const h=new T.Mesh(handleGeo,handleMats[1]);h.position.set(p[0],renderedGround(p[0],p[1])+.6,p[1]);h.scale.setScalar(Math.max(1,markerScale*.6));h.renderOrder=1006;preview.add(h);}}
function showSnap(s){snapRing.visible=!!s;if(!s)return;snapRing.position.set(s.x,renderedGround(s.x,s.z)+.4,s.z);snapRing.material.color.set(SNAP_COLOURS[s.kind]);snapRing.scale.setScalar(Math.max(1,markerScale*.8));}
const reserveMesh=(()=>{const d=corridorReserve(),pos=[],idx=[];d.forEach((c,i)=>{const a=d[Math.max(0,i-1)],b=d[Math.min(d.length-1,i+1)],n=Math.hypot(b.x-a.x,b.z-a.z)||1,lx=(b.z-a.z)/n,lz=-(b.x-a.x)/n,y=renderedGround(c.x,c.z)+.25;
 pos.push(c.x+lx*c.r,y,c.z+lz*c.r,c.x-lx*c.r,y,c.z-lz*c.r);if(i&&Math.hypot(c.x-d[i-1].x,c.z-d[i-1].z)<12){const k=i*2;idx.push(k-2,k-1,k,k-1,k+1,k);}});
 const g=new T.BufferGeometry();g.setAttribute('position',new T.Float32BufferAttribute(pos,3));g.setIndex(idx);const m=new T.Mesh(g,new T.MeshBasicMaterial({color:0xd33c3c,transparent:true,opacity:.3,depthTest:false,side:T.DoubleSide}));m.renderOrder=1000;m.visible=false;m.name='SGMTS corridor reserve';scene.add(m);return m;})();
const handleHit=()=>{const hit=ray.intersectObjects(preview.children.filter(o=>o.userData.vertex))[0];return hit?hit.object.userData.vertex:null;};

// Items and runs on drawn roads stay where they stand in the world when a road is extended, joined or reversed (their chainage
// changes); `moved` maps a removed road's id to the road that absorbed it.
function keepItems(fn){const drawn=new Set(data.network.roads.map(r=>r.id)),held=[];
 for(const e of entries())if(drawn.has(e.road)){try{held.push(isRun(e)?{e,a:pose(e,e.from),b:pose(e,e.to)}:{e,P:pose(e)});}catch{}}
 const moved=fn()||{};setNetwork(data.network,renderedGround);frameCache.clear();
 for(const h of held){const id=moved[h.e.road]||h.e.road;if(!ROAD[id]){h.e._gone=true;continue;}h.e.road=id;
  if(h.P)Object.assign(h.e,record(id,h.P.x,h.P.y,h.P.z,h.P.yaw,{ref:h.e.ref||'kerb'}));
  else{const r=ROAD[id],a=r.toCh(nearest(r,h.a.x,h.a.z).p),b=r.toCh(nearest(r,h.b.x,h.b.z).p);h.e.from=fix(Math.min(a,b));h.e.to=fix(Math.max(a,b));}}
 data.items=data.items.filter(e=>!e._gone);data.runs=data.runs.filter(e=>!e._gone);}
function refuse([x,z]){status(`Refused: that touches the SGMTS corridor reserve (red) near ${x.toFixed(0)}, ${z.toFixed(0)}. Drawn streets stay outside it.`);reserveMesh.visible=true;}
function finishDraft(){if(!draft)return;const pts=draft.pts.filter((p,i,a)=>!i||Math.hypot(p[0]-a[i-1][0],p[1]-a[i-1][1])>.5),kind=$('preset').value;
 if(draft.kind==='area'){if(pts.length<3)return status('An area needs at least three corners.');const clash=reserveClash(pts,{closed:true});if(clash)return refuse(clash);
  const a={id:netUid('area'),finish:kind,pts};edit(()=>data.network.areas.push(a));select(a.id);draft=null;drawPreview();return status(`Added ${netLabel(a)} · ${Math.round(areaOf(a))} m²`);}
 const tmp={preset:kind,pts};if(pts.length<2||(netFrames(tmp).at(-1)?.d||0)<5)return status('A road needs at least two points, 5 m apart.');
 const clash=reserveClash(pts,{width:halfWidth(tmp)});if(clash)return refuse(clash);
 const s0=draft.snaps[0],s1=draft.snaps.at(-1);let road;snapshot();
 keepItems(()=>{const moved={};
  if(s0.kind==='end'&&s0.road.preset===kind){road=s0.road;if(s0.end===1)road.pts.push(...pts.slice(1));else road.pts.unshift(...pts.slice(1).reverse());}
  else{road={id:netUid('road'),preset:kind,footway:'red',pts};data.network.roads.push(road);}
  if(s1.kind==='end'&&s1.road!==road&&s1.road.preset===kind){const o=s1.road,rest=s1.end===0?o.pts.slice(1):o.pts.slice(0,-1).reverse(),atEnd=!(s0.kind==='end'&&s0.road===road&&s0.end===0);
   if(atEnd)road.pts.push(...rest);else road.pts.unshift(...rest.reverse());data.network.roads.splice(data.network.roads.indexOf(o),1);moved[o.id]=road.id;}
  return moved;});
 draft=null;cursor=null;selected=new Set([road.id]);queueRebuild();renderInspector();drawPreview();status(`${netLabel(road)} · ${Math.round(lengthOf(road))} m`);}
function removeNet(list){const ids=new Set(list.map(n=>n.id)),items=entries().filter(e=>ids.has(e.road));if(items.length&&!confirm(`Also delete the ${items.length} item(s) placed on ${list.length>1?'these roads':'this road'}?`))return;
 edit(()=>{data.network.roads=data.network.roads.filter(r=>!ids.has(r.id));data.network.areas=data.network.areas.filter(a=>!ids.has(a.id));data.items=data.items.filter(e=>!ids.has(e.road));data.runs=data.runs.filter(e=>!ids.has(e.road));for(const id of ids)selected.delete(id);});vertexSel=null;drawPreview();}
function netClick(e){const p=groundAt(e);if(!p)return;
 if(mode==='bulldoze'){pointer(e);const it=markerHit()||runHit();if(it){selected=new Set([it.id]);deleteSelected();return;}const n=netHit(p.x,p.z);if(n)removeNet([n]);else status('Nothing to bulldoze there.');return;}
 const s=mode==='road'?snapRoad(p,e):snapArea(p,e);if(!draft)draft={kind:mode,pts:[],snaps:[]};
 if(s.kind==='close')return finishDraft();draft.pts.push([s.x,s.z]);draft.snaps.push(s);
 if(mode==='road'&&draft.pts.length>1&&['end','tee','game'].includes(s.kind))return finishDraft();drawPreview();status(`${draft.pts.length} point(s) · Enter or double-click finishes · Backspace removes the last · Esc cancels`);}
renderer.domElement.addEventListener('dblclick',()=>{if(layer==='streets'&&draft)finishDraft();});
// Line a drawn road with one furniture type; skips junction mouths.
function lineRoad(n,type,step,off,sides){const L=lengthOf(n),{joins}=netJunctions(data.network,renderedGround),keep=[];
 for(const j of joins){if(j.B.r===n)keep.push([j.at.d,j.A.P.carriageway/2+CORNER+3]);if(j.A.r===n)keep.push([j.end?L:0,j.B.P.carriageway/2+j.B.P.footpath+CORNER]);}
 edit(()=>{let made=0;for(const side of sides==='both'?['L','R']:[sides])for(let ch=(side==='R'&&sides==='both'?step:step/2);ch<L-2;ch+=step){if(keep.some(([d,w])=>Math.abs(ch-d)<w))continue;
   const it={id:uid(type),type,road:n.id,ch:fix(ch),side,ref:'kerb',off:fix(off),rot:ROT.road(side),dy:0};if(CATALOGUE[type]?.params)it.params={...CATALOGUE[type].params};data.items.push(it);made++;}status(`Added ${made} × ${label(type)}`);});}
function netInspector(el,n){const area=isArea(n),on=area?[]:itemsOn(n);
 el.innerHTML=area?`<h2>Area</h2><div class="sub">${esc(n.id)} · ${esc(netWhere(n))}</div><div class="row"><span>Finish</span><select id="n-finish">${Object.entries(FINISHES).map(([k,v])=>opt(k,v,n.finish)).join('')}</select></div>
  <p class="sub">Drag the corner handles to reshape (1 m snap; Alt free). Click a handle, then Delete removes that corner.</p><div class="btns"><button id="n-focus">Zoom to</button><button id="n-del" class="warn">Delete area</button></div>`
 :`<h2>${esc(presetOf(n).short)}</h2><div class="sub">${esc(n.id)} · ${esc(netWhere(n))} · ${on.length} item(s)</div>
  <div class="row"><span>Name</span><input id="n-name" value="${esc(n.name||'')}" placeholder="optional"></div>
  <div class="row"><span>Type</span><select id="n-preset">${Object.entries(PRESETS).map(([k,v])=>opt(k,v.label,n.preset)).join('')}</select></div>
  <div class="row"><span>Footpath</span><select id="n-footway">${FOOTWAYS.map(f=>opt(f,f,n.footway||'red')).join('')}</select></div>
  <hr><b>Line the road</b><div class="row"><span>Type</span><select id="n-type">${typeOptions('point').map(([k,c])=>opt(k,c.label,'lamp_road')).join('')}</select></div>
  <div class="row"><span>Every m</span><input id="n-step" type="number" min="2" step="1" value="30"></div><div class="row"><span>Behind kerb m</span><input id="n-off" type="number" step=".1" value="${presetOf(n).carriageway?.6:1.2}"></div>
  <div class="row"><span>Sides</span><select id="n-sides">${opt('both','Both (staggered)')}${opt('L','Left (+)')}${opt('R','Right (−)')}</select></div><div class="btns"><button id="n-line">Add along road</button></div>
  <hr><p class="sub">Drag the point handles to reshape (1 m snap; Alt free); click a handle, then Delete removes that point. Start a new road on this one's end to extend it, end one on its side for a junction.</p>
  <div class="btns"><button id="n-focus">Zoom to</button><button id="n-rev">Reverse</button><button id="n-del" class="warn">Delete road${on.length?' + items':''}</button></div>`;
 const bind=(id,fn)=>{const x=$(id);if(x)x.addEventListener('change',()=>{edit(()=>fn(x.value));drawPreview();});};
 bind('n-finish',v=>n.finish=v);bind('n-name',v=>{if(v)n.name=v;else delete n.name;});bind('n-preset',v=>n.preset=v);bind('n-footway',v=>n.footway=v);
 $('n-focus').onclick=()=>focusPoint(...centreOf(n));$('n-del').onclick=()=>removeNet([n]);
 if($('n-rev'))$('n-rev').onclick=()=>{snapshot();keepItems(()=>{n.pts.reverse();});queueRebuild();renderInspector();};
 if($('n-line'))$('n-line').onclick=()=>{const step=+$('n-step').value;if(!(step>=2))return status('Spacing must be at least 2 m.');lineRoad(n,$('n-type').value,step,+$('n-off').value,$('n-sides').value);};}
function removeVertex(){const {n,i}=vertexSel;if(n.pts.length<=(isArea(n)?3:2))return status(isArea(n)?'An area keeps at least three corners.':'A road keeps at least two points (Bulldoze deletes it).');edit(()=>n.pts.splice(i,1));vertexSel=null;drawPreview();}

$('preset').onchange=()=>{draft=null;drawPreview();};

// ---------- OZP plan: a tracing overlay drawn over the 3D (strong in the top view, faint in 3D) ----------
let cal=null,mask=null,rawMask=null,maskLoading=null;const plan=new T.Mesh(new T.PlaneGeometry(1,1),new T.MeshBasicMaterial({transparent:true,opacity:.45,depthTest:false,depthWrite:false}));plan.rotation.x=-Math.PI/2;plan.renderOrder=999;scene.add(plan);
async function loadPlan(){cal=await fetch(BASE+'lots/ozp-underlay.json').then(r=>r.json());const tex=await new T.TextureLoader().loadAsync(BASE+'lots/ozp-underlay.jpg');tex.colorSpace=T.SRGBColorSpace;tex.anisotropy=8;
 plan.material.map=tex;plan.material.needsUpdate=true;const w=cal.width*cal.metresPerPixel,h=cal.height*cal.metresPerPixel;plan.scale.set(w,h,1);plan.position.set(cal.originX+w/2,60,cal.originZ+h/2);requestRender();if(layer==='lots')loadMasks();}
// The wand reads the plan's line masks: ozp-mask.png (labels removed, scripts/ozp_lines.py) and ozp-mask-raw.png (leak guard). Loaded on first use.
function loadMasks(){if(!cal||maskLoading)return maskLoading;const load=async name=>{const img=await new Promise((ok,err)=>{const i=new Image();i.onload=()=>ok(i);i.onerror=err;i.src=BASE+'lots/'+name;});
  const c=document.createElement('canvas');c.width=cal.width;c.height=cal.height;const g=c.getContext('2d');g.drawImage(img,0,0);const px=g.getImageData(0,0,cal.width,cal.height).data,m=new Uint8Array(cal.width*cal.height);for(let i=0;i<m.length;i++)m[i]=px[i*4]>127?1:0;return blockCorridor(m,cal);};
 return maskLoading=Promise.all([load('ozp-mask.png'),load('ozp-mask-raw.png')]).then(([a,b])=>{mask=a;rawMask=b;});}
$('showPlan').onchange=e=>{plan.visible=e.target.checked;requestRender();};$('planOpacity').oninput=e=>{plan.material.opacity=+e.target.value*(camera===topCam?1:.3);requestRender();};
$('view3d').onclick=()=>setView(camera!==topCam);
// Station names, always on top: the map's landmarks.
for(const st of STOPS){const r=sample(st.s),c=document.createElement('canvas');c.width=160;c.height=64;const g=c.getContext('2d');g.fillStyle='#e08a2c';g.beginPath();g.roundRect(4,8,152,48,24);g.fill();g.fillStyle='#fff';g.font='bold 30px system-ui';g.textAlign='center';g.fillText(st.id,80,43);
 const sp=new T.Sprite(new T.SpriteMaterial({map:new T.CanvasTexture(c),depthTest:false,sizeAttenuation:false}));sp.scale.set(.06,.024,1);sp.position.set(r.x,r.y+30,r.z);sp.renderOrder=1003;scene.add(sp);}

// ---------- Lots layer: wand-trace from the plan, draw, reshape; zoning and the 3D model ----------
let lotSel=null,lotDrawing=[],lotDrag=null,lotDown=null,lotModelFiles=[],maskKey='',maskCtx=null;
const lotOverlay=new T.Group(),lotModels=new T.Group(),lotHandleGroup=new T.Group();lotOverlay.add(lotHandleGroup);scene.add(lotOverlay,lotModels);lotOverlay.visible=false;
const lotViews=new Map(),lotById=id=>lots.find(l=>l.id===id),hex=c=>'#'+c.toString(16).padStart(6,'0');
function lotSnapshot(){history.push({kind:'lots',json:JSON.stringify(lots)});if(history.length>150)history.shift();dirtyLots=true;status();}
// Lot buildings and trees keep off the corridor (sceneryClear) and off drawn streets and paving, as in the game.
function lotCtx(){const k=JSON.stringify(data.network);if(k!==maskKey){maskKey=k;const drawn=networkMask(data.network,renderedGround);
  maskCtx={ground:renderedGround,allowed:(x,z,r)=>sceneryClear(x,z,r)&&!drawn.buildingBlocked(x,z,r),allowedLow:(x,z,r)=>sceneryClear(x,z,r,true)&&!drawn.blocked(x,z,r),modelUrl:src=>BASE+'lots/models/'+src};}return maskCtx;}
const lotY=l=>{const [x,z]=centroid(l.poly);return renderedGround(x,z)+.6;};
function outlineFor(l,colour){const y=lotY(l),line=new T.Line(new T.BufferGeometry().setFromPoints([...l.poly,l.poly[0]].map(([x,z])=>new T.Vector3(x,y,z))),new T.LineBasicMaterial({color:colour,depthTest:false,transparent:true}));line.renderOrder=1001;
 const fill=new T.Mesh(new T.ShapeGeometry(new T.Shape(l.poly.map(([x,z])=>new T.Vector2(x,-z)))).rotateX(-Math.PI/2).translate(0,y,0),new T.MeshBasicMaterial({color:colour,transparent:true,opacity:.28,depthTest:false,depthWrite:false,side:T.DoubleSide}));
 fill.renderOrder=1000;fill.userData.lotId=l.id;fill.visible=$('showFill').checked;return {line,fill};}
const disposeTree=o=>o.traverse(n=>n.geometry?.dispose());
const pendingLots=new Map();
async function refreshLot(l){const old=lotViews.get(l.id);if(old){for(const o of [old.line,old.fill])if(o){lotOverlay.remove(o);disposeTree(o);}if(old.model){lotModels.remove(old.model);disposeTree(old.model);}}
 if(!lotById(l.id)){lotViews.delete(l.id);requestRender();return;}
 const v=outlineFor(l,l.id===lotSel?0x1d6fd6:USE_COLOURS[useOf(l.zone)]);lotOverlay.add(v.line,v.fill);lotViews.set(l.id,v);
 const token={};pendingLots.set(l.id,token);const model=await buildLot(l,lotCtx());if(pendingLots.get(l.id)!==token||lotViews.get(l.id)!==v){disposeTree(model);return;}v.model=model;lotModels.add(model);requestRender();}
const refreshAllLots=()=>Promise.all(lots.map(refreshLot));
const uses=Object.keys(USE_COLOURS);$('useFilter').innerHTML+=uses.map(u=>`<option>${u}</option>`).join('');
$('legend').innerHTML=uses.map(u=>`<div><i style="background:${hex(USE_COLOURS[u])}"></i>${u}</div>`).join('');
const lotModelLabel=l=>l.model?.type==='glb'?'GLB':l.model?.type==='massing'?'massing':'—';
function renderLotList(){if(layer!=='lots')return;const q=$('search').value.toLowerCase(),u=$('useFilter').value;
 $('lots').innerHTML=lots.filter(l=>(!u||useOf(l.zone)===u)&&(!q||`${l.site} ${l.zone} ${l.note} ${l.id}`.toLowerCase().includes(q)))
  .map(l=>`<div class="lot${l.id===lotSel?' sel':''}" data-id="${esc(l.id)}"><i style="background:${hex(USE_COLOURS[useOf(l.zone)])}"></i><div>${esc(l.site||'—')} <b>${esc(l.zone||'unzoned')}</b><br><small>${esc(l.note||l.id)}</small></div><small>${lotModelLabel(l)}</small></div>`).join('');}
$('lots').onclick=e=>{const el=e.target.closest('.lot');if(el){selectLot(el.dataset.id);focusLot(lotById(el.dataset.id));}};$('search').oninput=renderLotList;$('useFilter').onchange=renderLotList;
function focusLot(l){if(!l)return;const [x,z]=centroid(l.poly);lookAtPoint(x,renderedGround(x,z),z,Math.max(250,Math.sqrt(polygonArea(l.poly))*3));}
function selectLot(id){const prev=lotSel;lotSel=id;for(const i of [prev,id]){const l=lotById(i);if(l)refreshLot(l);}renderLotList();renderLotInspector();lotHandles();}
// Corners on the SGMTS carriageway itself: a sign the plan boundary or the calibration needs a hand fix.
const lotOnCorridor=l=>l.poly.filter(([x,z])=>{const s=corridorS(x,z),r=sample(s);return Math.hypot(x-r.x,z-r.z)<roadSection(s).right;}).length;
function renderLotInspector(){if(layer!=='lots')return;const l=lotById(lotSel),el=$('inspector');
 if(!l){el.innerHTML=`<h2>No lot selected</h2><p class="sub">Click a lot on the map or in the list.</p><p><b>Wand</b> (W): click inside an OZP lot to trace it.<br><b>Draw</b> (D): click corners, Enter or double-click to finish.<br><b>Select</b> (S): drag blue handles to reshape; Alt-click a handle to remove it; double-click an edge to add one.</p><p>Drop .glb files anywhere (Lots layer) to add them to the lot model library. Models are in metres, Y up, origin at the ground-floor centre.</p>`;return;}
 const area=polygonArea(l.poly),pr=plotRatio(l.zone),g=renderedGround(...centroid(l.poly)),m=l.model||{type:'none'},near=lotOnCorridor(l);
 el.innerHTML=`<h2>${esc(l.site?'Area '+l.site:'Lot')} · ${esc(l.zone||'unzoned')}</h2><div class="sub">${esc(l.id)} · ${useOf(l.zone)}</div>
 <div class="row"><span>Planning area</span><input id="f-site" value="${esc(l.site)}"></div>
 <div class="row"><span>Zone</span><select id="f-zone">${[...new Set([...ZONES,l.zone])].map(z=>`<option${z===l.zone?' selected':''}>${esc(z)}</option>`).join('')}</select></div>
 <div class="row"><span>Max height mPD</span><input id="f-bh" type="number" value="${l.maxBH??''}" placeholder="none"></div>
 <div class="row"><span>Max storeys</span><input id="f-st" type="number" value="${l.maxStoreys??''}" placeholder="none"></div>
 <div class="row"><span>Note</span><input id="f-note" value="${esc(l.note)}"></div>
 <div class="stats"><div><b>${(area/1e4).toFixed(2)} ha</b><span>site area</span></div><div><b>${pr??'—'}</b><span>max plot ratio (Notes)</span></div>
 <div><b>${pr?Math.round(area*pr).toLocaleString()+' m²':'—'}</b><span>max GFA</span></div><div><b>${l.maxBH!=null?Math.round(l.maxBH-DATUM-g)+' m':'—'}</b><span>height above ground</span></div></div>
 ${near?`<p class="warn">${near} corner${near>1?'s':''} on the SGMTS carriageway. Buildings there are skipped automatically; reshape the lot if the plan boundary is wrong.</p>`:''}
 <hr><div class="row"><span>3D model</span><select id="f-model"><option value="none"${m.type==='none'?' selected':''}>None (game default scenery)</option><option value="massing"${m.type==='massing'?' selected':''}>Placeholder massing</option>${lotModelFiles.map(f=>`<option value="glb:${esc(f)}"${m.type==='glb'&&m.src===f?' selected':''}>${esc(f)}</option>`).join('')}</select></div>
 ${m.type==='glb'?`<div class="row"><span>Rotation °</span><input id="f-rot" type="number" step="5" value="${m.rotation||0}"></div>
 <div class="row"><span>Scale</span><input id="f-scale" type="number" step=".05" value="${m.scale||1}"></div>
 <div class="row"><span>Offset E / S m</span><div class="pair"><input id="f-ox" type="number" step="1" value="${m.offset?.[0]||0}"><input id="f-oz" type="number" step="1" value="${m.offset?.[1]||0}"></div></div>
 <div class="btns"><button id="b-fit">Fit to lot</button><button id="b-align">Align to longest edge</button></div>`:''}
 <div class="btns"><button id="b-retrace" title="Re-trace this lot with the wand from its centre">Re-trace</button><button id="b-focus">Zoom to</button><button id="b-dup">Duplicate</button><button id="b-del" class="warn">Delete</button></div>`;
 const bind=(id,fn)=>{const x=$(id);if(x)x.addEventListener('change',()=>{lotSnapshot();fn(x.value);refreshLot(l);renderLotList();renderLotInspector();});};
 bind('f-site',v=>l.site=v.trim());bind('f-note',v=>l.note=v);bind('f-bh',v=>l.maxBH=v===''?null:+v);bind('f-st',v=>l.maxStoreys=v===''?null:+v);
 bind('f-zone',v=>{const wasDefault=JSON.stringify(l.model)===JSON.stringify(defaultModel(l.zone));l.zone=v;if(wasDefault)l.model=defaultModel(v);});
 bind('f-model',v=>{l.model=v==='none'?{type:'none'}:v==='massing'?{type:'massing'}:{type:'glb',src:v.slice(4),rotation:0,scale:1,offset:[0,0]};});
 bind('f-rot',v=>l.model.rotation=+v);bind('f-scale',v=>l.model.scale=Math.max(.01,+v));bind('f-ox',v=>l.model.offset=[+v,l.model.offset?.[1]||0]);bind('f-oz',v=>l.model.offset=[l.model.offset?.[0]||0,+v]);
 if($('b-fit'))$('b-fit').onclick=()=>fitLotModel(l);
 if($('b-align'))$('b-align').onclick=()=>{lotSnapshot();let best=0;for(let i=0;i<l.poly.length;i++){const [a,b]=[l.poly[i],l.poly[(i+1)%l.poly.length]],len=Math.hypot(b[0]-a[0],b[1]-a[1]);if(len>best){best=len;l.model.rotation=Math.round(Math.atan2(-(b[1]-a[1]),b[0]-a[0])*180/Math.PI);}}refreshLot(l);renderLotInspector();};
 $('b-retrace').onclick=async()=>{await loadMasks();const poly=mask&&wandPolygon(mask,cal,centroid(l.poly),1.6,400000,rawMask);if(!poly)return status('Re-trace failed: the lot centre is on a line or outside the plan.');lotSnapshot();l.poly=poly;refreshLot(l);renderLotInspector();lotHandles();};
 $('b-focus').onclick=()=>focusLot(l);
 $('b-dup').onclick=()=>{lotSnapshot();const c=structuredClone(l);c.id=lotUid(l.site||'lot');c.poly=c.poly.map(([x,z])=>[x+20,z+20]);lots.push(c);refreshLot(c);selectLot(c.id);};
 $('b-del').onclick=deleteLot;}
async function fitLotModel(l){const v=lotViews.get(l.id);if(!v?.model)return;const size=new T.Box3().setFromObject(v.model).getSize(new T.Vector3()),s=l.model.scale||1;
 // Largest square that fits the lot is roughly sqrt(area)·0.8; scale the model's larger plan side to it.
 const target=Math.sqrt(polygonArea(l.poly))*.8,side=Math.max(size.x,size.z)/s;if(!side)return;lotSnapshot();l.model.scale=+(target/side).toFixed(3);await refreshLot(l);renderLotInspector();}
function lotUid(base){let i=1,id;do id=`${base}-${String.fromCharCode(96+i)}${i>26?i:''}`;while(lotById(id)&&++i);return id;}
function deleteLot(){const l=lotById(lotSel);if(!l||!confirm(`Delete lot ${l.site||l.id}?`))return;lotSnapshot();lots=lots.filter(x=>x!==l);refreshLot(l);selectLot(null);}
const lotHandleSize=()=>Math.max(1.2,viewDist()/260);
function lotHandles(){lotHandleGroup.clear();const l=lotById(lotSel);if(!l||mode!=='lot'||layer!=='lots')return;const y=lotY(l),r=lotHandleSize();
 l.poly.forEach(([x,z],i)=>{const h=new T.Mesh(handleGeo,lotHandleMat);h.position.set(x,y,z);h.scale.setScalar(r);h.renderOrder=1004;h.userData.index=i;lotHandleGroup.add(h);});requestRender();}
const lotHandleMat=new T.MeshBasicMaterial({color:0x1d6fd6,depthTest:false});
const groundHit=y=>{const p=new T.Vector3();return ray.ray.intersectPlane(new T.Plane(UP,-y),p)?p:null;};
renderer.domElement.addEventListener('pointerdown',e=>{if(layer!=='lots')return;lotDown=[e.clientX,e.clientY];if(mode!=='lot'||e.button!==0)return;pointer(e);
 const hit=ray.intersectObjects(lotHandleGroup.children)[0];if(!hit)return;const l=lotById(lotSel),i=hit.object.userData.index;
 if(e.altKey){if(l.poly.length>3){lotSnapshot();l.poly.splice(i,1);refreshLot(l);lotHandles();renderLotInspector();}return;}
 lotSnapshot();lotDrag={l,i,y:hit.object.position.y};controls.enabled=false;renderer.domElement.setPointerCapture(e.pointerId);});
renderer.domElement.addEventListener('pointermove',e=>{if(layer!=='lots'||!lotDrag)return;pointer(e);const p=groundHit(lotDrag.y);if(!p)return;lotDrag.l.poly[lotDrag.i]=[+p.x.toFixed(2),+p.z.toFixed(2)];lotHandleGroup.children[lotDrag.i].position.set(p.x,lotDrag.y,p.z);
 const v=lotViews.get(lotDrag.l.id);if(v){lotOverlay.remove(v.line,v.fill);disposeTree(v.line);disposeTree(v.fill);const o=outlineFor(lotDrag.l,0x1d6fd6);v.line=o.line;v.fill=o.fill;lotOverlay.add(v.line,v.fill);}});
renderer.domElement.addEventListener('pointerup',async e=>{if(layer!=='lots')return;if(lotDrag){const l=lotDrag.l;lotDrag=null;controls.enabled=true;await refreshLot(l);lotHandles();renderLotInspector();return;}
 if(!lotDown||Math.hypot(e.clientX-lotDown[0],e.clientY-lotDown[1])>5||e.button!==0)return;pointer(e);
 if(mode==='lot'){const fills=[...lotViews.values()].map(v=>v.fill),hit=ray.intersectObjects(fills.map(f=>(f.visible=true,f)))[0];fills.forEach(f=>f.visible=$('showFill').checked);
  let id=hit?.object.userData.lotId;if(!id){const p=groundAt(e);id=p&&lots.find(l=>pointInPolygon([p.x,p.z],l.poly))?.id;}selectLot(id||null);}
 else if(mode==='wand'){const p=groundAt(e);if(!p)return;status('Wand: tracing…');await loadMasks();const poly=mask&&wandPolygon(mask,cal,[p.x,p.z],1.6,400000,rawMask);
  if(!poly)return status('Wand: no closed lot here (on a line, or the region leaks). Try Draw instead.');if(polygonArea(poly)>600000)return status('Wand: region too large — the boundary has a gap. Try Draw.');addLot(poly);}
 else if(mode==='lotdraw'){const p=groundAt(e);if(p){lotDrawing.push([+p.x.toFixed(2),+p.z.toFixed(2)]);drawLotPreview();}}});
renderer.domElement.addEventListener('dblclick',e=>{if(layer!=='lots')return;pointer(e);if(mode==='lotdraw'){finishLotDraw();return;}
 const l=lotById(lotSel);if(mode!=='lot'||!l)return;const p=groundHit(lotY(l));if(!p)return;let best=Infinity,at=-1;
 l.poly.forEach((a,i)=>{const b=l.poly[(i+1)%l.poly.length],dx=b[0]-a[0],dz=b[1]-a[1],t=Math.max(0,Math.min(1,((p.x-a[0])*dx+(p.z-a[1])*dz)/(dx*dx+dz*dz))),d=Math.hypot(p.x-a[0]-t*dx,p.z-a[1]-t*dz);if(d<best){best=d;at=i;}});
 if(best<lotHandleSize()*4){lotSnapshot();l.poly.splice(at+1,0,[+p.x.toFixed(2),+p.z.toFixed(2)]);refreshLot(l);lotHandles();}});
function addLot(poly){lotSnapshot();const l={id:lotUid('lot'),site:'',zone:'',maxBH:null,maxStoreys:null,note:'',poly,model:{type:'none'}};lots.push(l);refreshLot(l);setMode('lot');selectLot(l.id);status();}
const lotDrawLine=new T.Line(new T.BufferGeometry(),new T.LineBasicMaterial({color:0x1d6fd6,depthTest:false}));lotDrawLine.renderOrder=1005;lotOverlay.add(lotDrawLine);
function drawLotPreview(){lotDrawLine.geometry.dispose();lotDrawLine.geometry=new T.BufferGeometry().setFromPoints(lotDrawing.map(([x,z])=>new T.Vector3(x,renderedGround(x,z)+.8,z)));requestRender();}
function finishLotDraw(){const pts=lotDrawing.filter((p,i)=>!i||Math.hypot(p[0]-lotDrawing[i-1][0],p[1]-lotDrawing[i-1][1])>.5);lotDrawing=[];drawLotPreview();if(pts.length>=3)addLot(pts);}
function lotKeys(e,k){if(k==='s')setMode('lot');else if(k==='w')setMode('wand');else if(k==='d')setMode('lotdraw');
 else if(k==='enter'&&mode==='lotdraw')finishLotDraw();else if(k==='escape'){if(mode==='lotdraw'){lotDrawing=[];drawLotPreview();}else selectLot(null);}
 else if((k==='delete'||k==='backspace')&&lotSel){e.preventDefault();deleteLot();}}
$('showFill').onchange=e=>{lotViews.forEach(v=>v.fill.visible=e.target.checked);requestRender();};
async function dropLotModels(files){let last;for(const f of files){const r=await fetch('/__lots/models/'+encodeURIComponent(f.name),{method:'POST',body:f});if(!r.ok)return status('Upload needs the dev server (npm run dev).');last=(await r.json()).name;}
 await loadModels();const l=lotById(lotSel);if(l&&last){lotSnapshot();l.model={type:'glb',src:last,rotation:0,scale:1,offset:[0,0]};await refreshLot(l);await fitLotModel(l);renderLotList();}renderLotInspector();status(`Added ${files.length} model(s) to public/lots/models`);}

// ---------- Hills layer: the backdrop hills (ellipsoids sunk into the ground) ----------
const hillMat=new T.MeshStandardMaterial({color:0x65765c,roughness:1}),hillGroup=new T.Group(),hillOverlay=new T.Group();hillGroup.name='Backdrop hills';hillOverlay.visible=false;scene.add(hillGroup,hillOverlay);
let hillSel=null,hillDrag=null,hillDown=null;
// Until the first edit the game uses its own default set (environment.js); editing copies it into the data, which Save then keeps.
const hillList=()=>Array.isArray(data.hills)?data.hills:environment?.hills||[],hillById=id=>hillList().find(h=>h.id===id);
const ownHills=()=>Array.isArray(data.hills)?data.hills:(data.hills=structuredClone(environment?.hills||[]));
function hillUid(){let n=0;for(const h of hillList()){const m=h.id.match(/^hill-(\d+)$/);if(m)n=Math.max(n,+m[1]);}return 'hill-'+String(n+1).padStart(3,'0');}
function buildHills(){hillGroup.clear();for(const h of hillList())hillGroup.add(hillMesh(h,hillMat));drawHillOverlay();requestRender();}
function drawHillOverlay(){hillOverlay.traverse(n=>{if(n.geometry&&n.geometry!==handleGeo)n.geometry.dispose();});hillOverlay.clear();if(layer!=='hills')return;
 for(const h of hillList()){const g=renderedGround(h.x,h.z),o=hillOutline(h,g);if(o.length)hillOverlay.add(polyline(o.map(([x,z])=>[x,z,g+3]),h.id===hillSel?0x1d6fd6:0xffffff,true));}
 const h=hillById(hillSel);if(h){const m=new T.Mesh(handleGeo,handleMats[1]);m.position.set(h.x,h.y+h.ry+3,h.z);m.scale.setScalar(Math.max(2,markerScale*2));m.renderOrder=1006;hillOverlay.add(m);}requestRender();}
const hillAt=()=>{const hit=ray.intersectObjects(hillGroup.children)[0];return hit?hillById(hit.object.userData.hillId):null;};
// The part above ground must keep clear of the SGMTS corridor reserve.
const hillClash=h=>{const o=hillOutline(h,renderedGround(h.x,h.z));return o.length?reserveClash(o,{closed:true}):null;};
const peakOf=h=>h.y+h.ry-renderedGround(h.x,h.z);
function selectHill(id){hillSel=id;drawHillOverlay();renderHillList();renderHillInspector();}
function editHill(fn){const h=hillById(hillSel);if(!h)return;snapshot();const own=ownHills().find(q=>q.id===h.id);fn(own);const c=hillClash(own);if(c){undo();return refuse(c);}buildHills();renderHillList();renderHillInspector();}
function renderHillList(){if(layer!=='hills')return;const list=hillList();$('hills').innerHTML=`<div class="item"><small>${list.length} hills${Array.isArray(data.hills)?' (edited)':' (game default set)'}</small></div>`+
 list.map(h=>`<div class="item${h.id===hillSel?' sel':''}" data-id="${esc(h.id)}"><div>Hill<br><small>${Math.round(h.rx*2)} × ${Math.round(h.rz*2)} m · ${Math.round(peakOf(h))} m high</small></div><small>${esc(h.id)}</small></div>`).join('');}
$('hills').onclick=e=>{const el=e.target.closest('[data-id]');if(!el)return;selectHill(el.dataset.id);const h=hillById(el.dataset.id);if(h)lookAtPoint(h.x,renderedGround(h.x,h.z),h.z,Math.max(h.rx,h.rz)*3.5);};
$('hillDefaults').onclick=()=>{if(!Array.isArray(data.hills))return status('Already the game default set.');if(!confirm('Discard all hill edits and use the game default hills?'))return;snapshot();delete data.hills;hillSel=null;buildHills();renderSide();};
function renderHillInspector(){if(layer!=='hills')return;const el=$('inspector'),h=hillById(hillSel);
 if(!h){el.innerHTML=`<h2>No hill selected</h2><p class="sub">Click a hill on the map or in the list.</p><p><b>Add hill</b> (A): click where it should stand, then size it here.<br><b>Remove</b> (B): click a hill to delete it.<br><b>Select</b> (S): click a hill, drag it to move; Delete removes it.</p><p>A hill may not reach onto the SGMTS corridor reserve (red while adding).</p>`;return;}
 el.innerHTML=`<h2>Hill</h2><div class="sub">${esc(h.id)} · ${Math.round(h.rx*2)} × ${Math.round(h.rz*2)} m</div>
 <div class="row"><span>East–west m</span><input id="h-w" type="number" step="10" min="20" value="${Math.round(h.rx*2)}"></div>
 <div class="row"><span>North–south m</span><input id="h-d" type="number" step="10" min="20" value="${Math.round(h.rz*2)}"></div>
 <div class="row"><span>Height m</span><input id="h-h" type="number" step="5" min="5" value="${Math.round(peakOf(h))}"></div>
 <div class="row"><span>Turn °</span><input id="h-t" type="number" step="5" value="${h.turn||0}"></div>
 <p class="sub">Width and depth are measured at the hill's sunk base; the visible footprint is a little smaller.</p>
 <div class="btns"><button id="h-focus">Zoom to</button><button id="h-del" class="warn">Remove hill</button></div>`;
 const bind=(id,fn)=>$(id).addEventListener('change',()=>{const v=+$(id).value;if(!isFinite(v))return;editHill(o=>fn(o,v));});
 bind('h-w',(o,v)=>o.rx=Math.max(10,v/2));bind('h-d',(o,v)=>o.rz=Math.max(10,v/2));bind('h-h',(o,v)=>o.ry=Math.max(5,v)+renderedGround(o.x,o.z)-o.y);bind('h-t',(o,v)=>o.turn=v);
 $('h-focus').onclick=()=>lookAtPoint(h.x,renderedGround(h.x,h.z),h.z,Math.max(h.rx,h.rz)*3.5);$('h-del').onclick=()=>removeHill(h.id);}
function removeHill(id){snapshot();data.hills=ownHills().filter(h=>h.id!==id);if(hillSel===id)hillSel=null;buildHills();renderSide();status();}
renderer.domElement.addEventListener('pointerdown',e=>{if(layer!=='hills'||e.button!==0)return;hillDown=[e.clientX,e.clientY];if(mode!=='hill')return;pointer(e);const h=hillAt();if(!h||h.id!==hillSel)return;
 const p=groundAt(e);if(!p)return;hillDrag={id:h.id,dx:h.x-p.x,dz:h.z-p.z,moved:false};controls.enabled=false;renderer.domElement.setPointerCapture(e.pointerId);});
renderer.domElement.addEventListener('pointermove',e=>{if(layer!=='hills'||!hillDrag)return;const p=groundAt(e);if(!p)return;if(!hillDrag.moved){snapshot();ownHills();hillDrag.moved=true;}
 const h=hillById(hillDrag.id);h.x=Math.round(p.x+hillDrag.dx);h.z=Math.round(p.z+hillDrag.dz);const m=hillGroup.children.find(o=>o.userData.hillId===h.id);if(m)m.position.set(h.x,h.y,h.z);drawHillOverlay();});
renderer.domElement.addEventListener('pointerup',e=>{if(layer!=='hills')return;controls.enabled=true;
 if(hillDrag){const {id,moved}=hillDrag;hillDrag=null;if(moved){const c=hillClash(hillById(id));if(c){undo();refuse(c);}buildHills();renderHillList();renderHillInspector();}return;}
 if(!hillDown||Math.hypot(e.clientX-hillDown[0],e.clientY-hillDown[1])>5||e.button!==0)return;pointer(e);
 if(mode==='hill'){selectHill(hillAt()?.id||null);return;}
 if(mode==='hilldel'){const h=hillAt();if(h)removeHill(h.id);else status('No hill there.');return;}
 if(mode==='hilladd'){const p=groundAt(e);if(!p)return;const g=renderedGround(p.x,p.z),h={id:hillUid(),x:Math.round(p.x),z:Math.round(p.z),y:g-HILL.sink,rx:HILL.rx,ry:HILL.ry+HILL.sink,rz:HILL.rz,turn:0};
  const c=hillClash(h);if(c)return refuse(c);snapshot();ownHills().push(h);buildHills();selectHill(h.id);status(`Added ${h.id} · size it in the inspector`);}});
function hillKeys(e,k){if(k==='s')setMode('hill');else if(k==='a')setMode('hilladd');else if(k==='b')setMode('hilldel');else if(k==='escape')selectHill(null);
 else if((k==='delete'||k==='backspace')&&hillSel){e.preventDefault();removeHill(hillSel);}}

// ---------- chainage ruler ----------
const ruler=new T.Group();scene.add(ruler);const textCache=new Map();let rulerKey='';
function textSprite(text){if(!textCache.has(text)){if(textCache.size>400)textCache.clear();const c=document.createElement('canvas');c.width=128;c.height=40;const g=c.getContext('2d');g.fillStyle='#1f2626cc';g.beginPath();g.roundRect(2,4,124,32,14);g.fill();g.fillStyle='#fff';g.font='bold 20px system-ui';g.textAlign='center';g.fillText(text,64,27);textCache.set(text,new T.SpriteMaterial({map:new T.CanvasTexture(c),depthTest:false}));}
 const s=new T.Sprite(textCache.get(text));s.renderOrder=1004;return s;}
function drawRuler(){const dist=viewDist(),loc=$('ticks').checked&&locate(controls.target.x,controls.target.z,$('lock').value||null);
 const key=loc?`${loc.road.id}|${Math.round(loc.ch/2)}|${Math.round(Math.log(dist)*8)}`:'none';if(key===rulerKey)return;rulerKey=key;ruler.traverse(n=>n.geometry?.dispose());ruler.clear();if(!loc)return;
 const road=loc.road,step=dist<90?1:dist<300?5:10,labelStep=dist<200?10:dist<700?50:100,range=Math.min(1500,Math.max(80,dist*2.2)),c0=Math.max(road.toCh(road.p0),Math.ceil((loc.ch-range)/step)*step),c1=Math.min(road.toCh(road.p1),loc.ch+range),pts=[];
 for(let ch=c0;ch<=c1;ch+=step){const n=Math.round(ch),p=road.toParam(n),f=road.frame(p),kerb=road.kerb(p),half=n%100===0?kerb:n%10===0?Math.min(kerb,2.5):.6,y=road.surface(p,0)+.06;
  pts.push(new T.Vector3(f.x-f.lx*half,y,f.z-f.lz*half),new T.Vector3(f.x+f.lx*half,y,f.z+f.lz*half));
  if(n%labelStep===0){const s=textSprite(`${n}`);s.position.set(f.x,y+Math.max(1.2,dist/60),f.z);s.scale.set(dist/14,dist/14*40/128,1);ruler.add(s);}}
 const lines=new T.LineSegments(new T.BufferGeometry().setFromPoints(pts),new T.LineBasicMaterial({color:0xffffff,depthTest:false,transparent:true,opacity:.85}));lines.renderOrder=1002;ruler.add(lines);}
$('ticks').onchange=()=>{rulerKey='';drawRuler();};$('lock').onchange=()=>{rulerKey='';runStart=null;};

// ---------- modes, keys, toolbar ----------
const HINTS={lot:'Click a lot to edit it · drag handles to reshape · Alt-click removes a corner · double-click an edge adds one',wand:'Click inside a lot on the OZP plan to trace its boundary',lotdraw:'Click to place corners · Enter or double-click to finish · Esc cancels',hill:'Click a hill to edit it · drag a selected hill to move it',hilladd:'Click where the new hill should stand (it is sized in the inspector)',hilldel:'Click a hill to remove it',road:'Click points along the road · ends snap to roads (green: extend / join, orange: junction) · Shift: 15° steps · Enter / double-click finishes',area:'Click the corners of a paved or planted area · click the first corner (or Enter) to close',bulldoze:'Click a drawn road, area or furniture item to delete it',select:'Click a drawn road or area to edit it · drag arrows to move · Shift-click / Shift-drag to select several · Q/E rotate · arrows nudge',place:'Click beside a road to place the chosen type · Alt-click: no snapping',run:'Click the start, then the end of the run (same road) · Esc cancels'};
const LAYER_OF={select:'streets',road:'streets',area:'streets',place:'streets',run:'streets',bulldoze:'streets',lot:'lots',wand:'lots',lotdraw:'lots',hill:'hills',hilladd:'hills',hilldel:'hills'};
function setMode(m){mode=m;runStart=null;draft=null;cursor=null;snapRing.visible=false;lotDrawing=[];drawLotPreview();const drawing=m==='road'||m==='area';reserveMesh.visible=drawing||m==='hilladd'||m==='lotdraw';$('preset').hidden=!drawing;$('type').hidden=$('facing').hidden=$('lock').hidden=layer!=='streets'||drawing||m==='bulldoze';
 if(drawing){const want=m==='road'?Object.entries(PRESETS).map(([k,v])=>[k,v.label]):Object.entries(FINISHES);if($('preset').dataset.for!==m){$('preset').innerHTML=want.map(([k,v])=>`<option value="${k}">${esc(v)}</option>`).join('');$('preset').dataset.for=m;}}
 drawPreview();document.querySelectorAll('#modes button').forEach(b=>b.classList.toggle('on',b.dataset.mode===m));$('hintText').textContent=HINTS[m];
 const kind=CATALOGUE[$('type').value]?.kind||'point';if(m==='run'&&kind!=='run')$('type').value='railing';if(m==='place'&&kind==='run')$('type').value='lamp_road';drawOverlay();lotHandles();drawHillOverlay();requestRender();}
function setLayer(L){layer=L;document.querySelectorAll('#layers button').forEach(b=>b.classList.toggle('on',b.dataset.layer===L));document.querySelectorAll('#modes button').forEach(b=>b.hidden=LAYER_OF[b.dataset.mode]!==L);
 for(const [id,l] of [['streetPanel','streets'],['lotPanel','lots'],['hillPanel','hills']])$(id).hidden=l!==L;
 overlay.visible=preview.visible=ruler.visible=snapRing.visible=L==='streets';lotOverlay.visible=L==='lots';hillOverlay.visible=L==='hills';$('ticks').parentElement.hidden=L!=='streets';$('fillsWrap').hidden=L!=='lots';
 setMode({streets:'select',lots:'lot',hills:'hill'}[L]);renderSide();if(L==='lots')loadMasks();window.history.replaceState(null,'','#'+L);}
function renderSide(){if(layer==='streets'){renderList();renderInspector();}else if(layer==='lots'){renderLotList();renderLotInspector();}else{renderHillList();renderHillInspector();}}
$('layers').onclick=e=>{const b=e.target.closest('button');if(b)setLayer(b.dataset.layer);};
$('modes').onclick=e=>{const b=e.target.closest('button');if(b)setMode(b.dataset.mode);};
$('type').onchange=()=>{const kind=CATALOGUE[$('type').value]?.kind||'point';if(mode!=='select')setMode(kind==='run'?'run':'place');else drawOverlay();};
function undo(){const prev=history.pop();if(!prev)return;
 if(prev.kind==='lots'){const ids=new Set(lots.map(l=>l.id));lots=JSON.parse(prev.json);lots.forEach(l=>ids.add(l.id));[...ids].forEach(id=>refreshLot(lotById(id)||{id}));if(!lotById(lotSel))lotSel=null;lotHandles();}
 else{data=JSON.parse(prev.json);selected=new Set([...selected].filter(id=>byId(id)||netById(id)));vertexSel=null;draft=null;if(!hillById(hillSel))hillSel=null;queueRebuild();drawPreview();}
 dirty=history.some(h=>h.kind==='street');dirtyLots=history.some(h=>h.kind==='lots');renderSide();status();}
$('undo').onclick=undo;
// Saves the street file (streets, furniture, hills) and, when lots changed, the lot file.
async function save(){const jobs=[];if(dirty||!dirtyLots)jobs.push(['/__street/save',data,'public/street/furniture.json','furniture.json']);if(dirtyLots){lotDoc.lots=lots;jobs.push(['/__lots/save',lotDoc,'public/lots/lots.json','lots.json']);}
 const done=[];for(const [url,obj,path,file] of jobs){const body=JSON.stringify(obj);
  try{const r=await fetch(url,{method:'POST',body});if(!r.ok)throw Error(r.status);done.push(path);}
  catch{const a=document.createElement('a');a.href=URL.createObjectURL(new Blob([body],{type:'application/json'}));a.download=file;a.click();done.push(file+' (downloaded: no dev server)');}}
 dirty=dirtyLots=false;status('Saved '+done.join(' and '));setTimeout(status,3000);}
$('save').onclick=save;
const nudge=fn=>{const list=[...selected].map(byId).filter(e=>e&&!isRun(e));if(list.length)edit(()=>list.forEach(fn));};
addEventListener('keydown',e=>{if(e.target.matches?.('input,select,textarea'))return;const k=e.key.toLowerCase(),mod=e.metaKey||e.ctrlKey,big=e.shiftKey;
 if(!mod&&['1','2','3'].includes(k)){setLayer(['streets','lots','hills'][+k-1]);return;}if(!mod&&k==='t'){setView(camera!==topCam);return;}
 if(layer!=='streets'&&!(mod&&(k==='z'||k==='s'))){if(layer==='lots')lotKeys(e,k);else hillKeys(e,k);return;}
 if(mod&&k==='z'){e.preventDefault();undo();}else if(mod&&k==='s'){e.preventDefault();save();}else if(mod&&k==='d'){e.preventDefault();duplicate();}
 else if(mod)return;else if(k==='enter'&&draft)finishDraft();else if(k==='escape'&&draft){draft=null;drawPreview();status();}
 else if((k==='backspace'||k==='delete')&&draft){e.preventDefault();draft.pts.pop();draft.snaps.pop();if(!draft.pts.length)draft=null;drawPreview();}
 else if((k==='backspace'||k==='delete')&&vertexSel){e.preventDefault();removeVertex();}
 else if(k==='s')setMode('select');else if(k==='p')setMode('place');else if(k==='r')setMode('run');else if(k==='d')setMode('road');else if(k==='a')setMode('area');else if(k==='b')setMode('bulldoze');
 else if(k==='q'||k==='e'){const d=(k==='q'?1:-1)*(big?1:15);nudge(it=>it.rot=+(((it.rot||0)+d+540)%360-180).toFixed(2));}
 else if(k==='arrowleft'||k==='arrowright'){e.preventDefault();const d=(k==='arrowright'?1:-1)*(big?5:.5);edit(()=>[...selected].map(byId).forEach(it=>{if(!it)return;if(isRun(it)){it.from=fix(it.from+d);it.to=fix(it.to+d);}else it.ch=fix(it.ch+d);}));}
 else if(k==='arrowup'||k==='arrowdown'){e.preventDefault();const d=(k==='arrowup'?1:-1)*(big?.5:.05);edit(()=>[...selected].map(byId).forEach(it=>{if(it&&it.type!=='paving')it.off=fix((it.off||0)+d);}));}
 else if(k==='f')focus(byId([...selected][0]));else if(k==='escape'){if(runStart){runStart=null;status();}else select(null);}
 else if(k==='delete'||k==='backspace')deleteSelected();});
addEventListener('beforeunload',e=>{if(dirty||dirtyLots)e.preventDefault();});
$('night').onchange=e=>{const on=e.target.checked;environment?.setNight(on);for(const m of [...(environment?.nightMaterials||[]),furnitureMaterials().lamp,...lotNightMaterials()]){m.emissive.copy(m.color);m.emissiveIntensity=on?.8:0;}
 scene.background.set(on?0x0b1320:0xcfd9df);hemi.intensity=on?.25:1.6;sun.intensity=on?.05:2.2;requestRender();};
const sceneryGroup=new T.Group();scene.add(sceneryGroup);$('showScenery').onchange=e=>{sceneryGroup.visible=e.target.checked;requestRender();};

// ---------- model library (drop .glb files) ----------
async function loadModels(){const list=url=>fetch(url).then(r=>r.ok?r.json():[]).catch(()=>[]);[models,lotModelFiles]=await Promise.all([list('/__street/models'),list('/__lots/models')]);fillTypeSelect();}
let dragDepth=0;addEventListener('dragenter',e=>{e.preventDefault();if(++dragDepth)$('drop').style.display='flex';});addEventListener('dragleave',()=>{if(--dragDepth<=0){dragDepth=0;$('drop').style.display='none';}});
addEventListener('dragover',e=>e.preventDefault());
addEventListener('drop',async e=>{e.preventDefault();dragDepth=0;$('drop').style.display='none';const files=[...e.dataTransfer.files].filter(f=>/\.glb$/i.test(f.name));if(!files.length)return status('Only .glb files can be added.');
 if(layer==='lots')return dropLotModels(files);
 let last;for(const f of files){const r=await fetch('/__street/models/'+encodeURIComponent(f.name),{method:'POST',body:f});if(!r.ok)return status('Upload needs the dev server (npm run dev).');last=(await r.json()).name;}
 await loadModels();$('type').value='glb:'+last;setMode('place');status(`Added ${files.length} model(s) to public/street/models · click to place`);});

// ---------- context scenery: the game's environment without its furniture (drawn live above), plus stations ----------
async function loadScenery(){status('Loading game scenery…');const asset=f=>BASE+'assets/'+f;
 kit=(await loader.loadAsync(asset('street-kit.glb'))).scene;queueRebuild();
 try{const before=new Set(scene.children);environment=buildEnvironment(scene,kit,{occupied:occupiedBy(lots),furniture:data,drawFurniture:false});for(const o of [...scene.children])if(!before.has(o))sceneryGroup.add(o);environment.update?.(targetS(),0);buildHills();
  for(const st of STOPS){const root=(await loader.loadAsync(asset(`station-${st.id}.glb`))).scene,r=sample(st.s);root.position.set(r.x,r.y,r.z);root.rotation.y=r.heading;sceneryGroup.add(root);}
  batchScenery();}
 catch(err){console.error(err);status('Game scenery failed to load (see console)');return;}status();requestRender();}
// The scenery never changes here, so its plain meshes are fused into one per material per 500 m cell: thousands of draw calls
// become a few hundred. Vertex-coloured, transparent, hidden and multi-material meshes stay as they are; the baked night light
// pools on the paving are dropped (Night in the editor only lights windows and lamp heads).
let vegetation=[],farDetail=null;
function batchScenery(){sceneryGroup.updateMatrixWorld(true);const shown=n=>{for(let p=n;p&&p!==sceneryGroup;p=p.parent)if(!p.visible)return false;return true;},take=[],cells=new Map(),c=new T.Vector3();
 sceneryGroup.traverse(n=>{if(n.isInstancedMesh&&/^(trunk|foliage|tree-shrub|tree_|vegetation)/.test(n.name))vegetation.push(n);
  if(n.isMesh&&!n.isInstancedMesh&&!n.isSkinnedMesh&&!Array.isArray(n.material)&&!n.material.vertexColors&&!n.material.transparent&&n.name!=='Fixed night illumination'&&shown(n))take.push(n);});
 for(const n of take){for(const o of n.children.filter(o=>o.name==='Fixed night illumination'))n.remove(o);if(n.children.length)continue;
  n.geometry.computeBoundingSphere();c.copy(n.geometry.boundingSphere.center).applyMatrix4(n.matrixWorld);const k=Math.floor(c.x/500)+':'+Math.floor(c.z/500);
  if(!cells.has(k)){const g=new T.Group();g.name='scenery cell '+k;sceneryGroup.add(g);cells.set(k,g);}cells.get(k).attach(n);}
 for(const g of cells.values())mergeByMaterial(g);sceneryGroup.traverse(n=>{n.matrixAutoUpdate=false;n.updateMatrix();});sceneryGroup.updateMatrixWorld(true);}
// Zoomed far out, plants, street furniture and item arrows are below a pixel or two: they are hidden until you zoom back in.
function zoomDetail(dist){const far=dist>1600;if(far===farDetail)return;farDetail=far;furnLayer.visible=modelLayer.visible=!far;if(markers)markers.visible=!far;}
const targetS=()=>corridorS(controls.target.x,controls.target.z);

// Draws only after a change (input, edits, loads), plus one refresh a second. Scenery reach follows the view: everything the
// view spans stays drawn, plants drop to their low-detail beds when zoomed out, and nothing moves (scenery time stays 0).
let lastDraw=0,lastScenery=0,sceneryKey='';renderer.setAnimationLoop(t=>{controls.update();if(frames<=0&&t-lastDraw<1000)return;frames--;lastDraw=t;
 const dist=viewDist(),s=Math.min(14,Math.max(.7,dist/45));if(Math.abs(s-markerScale)/markerScale>.05){markerScale=s;placeMarkers();drawPreview();lotHandles();drawHillOverlay();}drawRuler();
 if(environment&&t-lastScenery>250){lastScenery=t;const at=targetS(),key=Math.round(at/50)+':'+Math.round(dist/50);if(key!==sceneryKey){sceneryKey=key;setSceneryScale(Math.max(1,dist/850));environment.update(at,0);if(dist>1600)vegetation.forEach(m=>m.visible=false);}}
 zoomDetail(dist);
 renderer.render(scene,camera);});

// ---------- boot ----------
(async()=>{const json=(url,fallback)=>fetch(BASE+url,{cache:'no-store'}).then(r=>r.ok?r.json():fallback).catch(()=>fallback);
 [data,lotDoc]=await Promise.all([json('street/furniture.json',structuredClone(EMPTY)),json('lots/lots.json',{version:1,lots:[]})]);lots=lotDoc.lots||[];
 data.items??=[];data.runs??=[];data.network??={roads:[],areas:[]};data.network.roads??=[];data.network.areas??=[];
 setLayer(['lots','hills'].includes(location.hash.slice(1))?location.hash.slice(1):'streets');loadPlan();
 await loadModels();rebuild();status('Building lots…');await refreshAllLots();await loadScenery();rebuild();renderSide();
 window.__map={renderer,netClick,finishDraft,snapRoad,setLayer,setView,lookAtPoint,get layer(){return layer;},get draft(){return draft;},get data(){return data;},get lots(){return lots;},get selected(){return selected;},select,selectLot,selectHill,setMode,save,scene,get camera(){return camera;},get controls(){return controls;},rebuild,byId,pose,get environment(){return environment;}};})();
