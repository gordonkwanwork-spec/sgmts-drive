// Lot-by-lot editor for the development around the SGMTS corridor (dev: http://localhost:5199/editor.html).
// Data: public/lots/lots.json · Models: public/lots/models/*.glb · Plan: public/lots/ozp-underlay.*
import * as T from 'three';
import {MapControls} from 'three/addons/controls/MapControls.js';
import {GLTFLoader} from 'three/addons/loaders/GLTFLoader.js';
import {STOPS,sample,project,PATH,DATUM,roadSection} from './alignment.js';
import {buildEnvironment,sceneryClear,terrainLevel,renderedGround} from './environment.js';
import {buildLot,useOf,plotRatio,ZONES,USE_COLOURS,defaultModel,centroid,occupiedBy,nightMaterials as lotNightMaterials} from './lots/massing.js';
import {blockCorridor,wandPolygon,polygonArea,pointInPolygon,corridorReserve} from './lots/wand.js';

const BASE=import.meta.env.BASE_URL,$=id=>document.getElementById(id),esc=s=>String(s??'').replace(/[&<>"]/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;'}[c]));
const ground=renderedGround;
const ctx={ground,allowed:(x,z,r)=>sceneryClear(x,z,r),allowedLow:(x,z,r)=>sceneryClear(x,z,r,true),modelUrl:src=>BASE+'lots/models/'+src};

// ---------- scene ----------
const renderer=new T.WebGLRenderer({antialias:true});renderer.setPixelRatio(Math.min(2,devicePixelRatio));renderer.shadowMap.enabled=true;
document.body.prepend(renderer.domElement);
const scene=new T.Scene();scene.background=new T.Color(0xcfd9df);scene.fog=new T.Fog(0xcfd9df,2500,6000);
const camera=new T.PerspectiveCamera(40,1,1,12000);
scene.add(new T.HemisphereLight(0xf4f7ff,0x6f7a5a,1.6));
const sun=new T.DirectionalLight(0xffffff,2.2);sun.position.set(600,900,300);scene.add(sun);
const controls=new MapControls(camera,renderer.domElement);controls.maxPolarAngle=Math.PI*.48;controls.screenSpacePanning=false;
function resize(){renderer.setSize(innerWidth,innerHeight);camera.aspect=innerWidth/innerHeight;camera.updateProjectionMatrix();}addEventListener('resize',resize);resize();
const mid=sample(1500);controls.target.set(mid.x,0,mid.z);camera.position.set(mid.x,2600,mid.z+1);controls.update();

// Corridor centreline + stations (always visible reference; stations themselves are never edited here).
const corridor=new T.Line(new T.BufferGeometry().setFromPoints(PATH.filter((_,i)=>i%3===0).map(p=>new T.Vector3(p.x,sample(p.s).y+1.2,p.z))),new T.LineBasicMaterial({color:0xe08a2c,depthTest:false}));
corridor.renderOrder=1002;scene.add(corridor);
const reserveOutline=(()=>{const g=new T.Group(),pts=corridorReserve();for(const side of [-1,1]){const line=pts.map((p,i)=>{const q=pts[Math.min(i+1,pts.length-1)],o=pts[Math.max(i-1,0)],tx=q.x-o.x,tz=q.z-o.z,n=Math.hypot(tx,tz)||1;return new T.Vector3(p.x-tz/n*p.r*side,sample(project(p.x,p.z)).y+1,p.z+tx/n*p.r*side);});
 const l=new T.Line(new T.BufferGeometry().setFromPoints(line),new T.LineDashedMaterial({color:0xe08a2c,dashSize:4,gapSize:4,depthTest:false,transparent:true,opacity:.7}));l.computeLineDistances();l.renderOrder=1002;g.add(l);}return g;})();scene.add(reserveOutline);
for(const st of STOPS){const r=sample(st.s),c=document.createElement('canvas');c.width=160;c.height=64;const g=c.getContext('2d');g.fillStyle='#e08a2c';g.beginPath();g.roundRect(4,8,152,48,24);g.fill();g.fillStyle='#fff';g.font='bold 30px system-ui';g.textAlign='center';g.fillText(st.id,80,43);
 const s=new T.Sprite(new T.SpriteMaterial({map:new T.CanvasTexture(c),depthTest:false}));s.scale.set(40,16,1);s.position.set(r.x,r.y+30,r.z);s.renderOrder=1003;scene.add(s);}

// ---------- OZP underlay: drawn as a tracing overlay on top of the 3D so lot boundaries stay readable ----------
let cal,mask;const plan=new T.Mesh(new T.PlaneGeometry(1,1),new T.MeshBasicMaterial({transparent:true,opacity:.55,depthTest:false,depthWrite:false}));plan.rotation.x=-Math.PI/2;plan.renderOrder=999;scene.add(plan);
async function loadPlan(){cal=await fetch(BASE+'lots/ozp-underlay.json').then(r=>r.json());
 const tex=await new T.TextureLoader().loadAsync(BASE+'lots/ozp-underlay.jpg');tex.colorSpace=T.SRGBColorSpace;tex.anisotropy=8;plan.material.map=tex;plan.material.needsUpdate=true;
 const w=cal.width*cal.metresPerPixel,h=cal.height*cal.metresPerPixel;plan.scale.set(w,h,1);plan.position.set(cal.originX+w/2,40,cal.originZ+h/2);
 const img=await new Promise((ok,err)=>{const i=new Image();i.onload=()=>ok(i);i.onerror=err;i.src=BASE+'lots/ozp-mask.png';});
 const c=document.createElement('canvas');c.width=cal.width;c.height=cal.height;const g=c.getContext('2d');g.drawImage(img,0,0);const px=g.getImageData(0,0,cal.width,cal.height).data;
 mask=new Uint8Array(cal.width*cal.height);for(let i=0;i<mask.length;i++)mask[i]=px[i*4]>127?1:0;blockCorridor(mask,cal);}

// ---------- state ----------
let doc,lots=[],selected=null,mode='select',models=[],history=[],dirty=false,drawing=[];
const lotViews=new Map();// id → {outline, fill, model}
const byId=id=>lots.find(l=>l.id===id);
function snapshot(){history.push(JSON.stringify(lots));if(history.length>80)history.shift();dirty=true;status();}
function status(msg){$('status').textContent=msg||`${lots.length} lots${dirty?' · unsaved changes':''}`;}
const lotY=l=>{const [x,z]=centroid(l.poly);return ground(x,z)+.6;};

function outlineFor(l,colour){const y=lotY(l),pts=[...l.poly,l.poly[0]].map(([x,z])=>new T.Vector3(x,y,z));
 const line=new T.Line(new T.BufferGeometry().setFromPoints(pts),new T.LineBasicMaterial({color:colour,depthTest:false,transparent:true}));line.renderOrder=1001;
 const shape=new T.Shape(l.poly.map(([x,z])=>new T.Vector2(x,-z))),fill=new T.Mesh(new T.ShapeGeometry(shape).rotateX(-Math.PI/2).translate(0,y,0),new T.MeshBasicMaterial({color:colour,transparent:true,opacity:.28,depthTest:false,depthWrite:false,side:T.DoubleSide}));
 fill.renderOrder=1000;fill.userData.lotId=l.id;fill.visible=$('showFill').checked;return {line,fill};}
function disposeTree(o){o.traverse(n=>{if(n.geometry)n.geometry.dispose();});}
const pending=new Map();
async function refreshLot(l){const old=lotViews.get(l.id);if(old){for(const o of [old.line,old.fill,old.model])if(o){scene.remove(o);disposeTree(o);}}
 if(!byId(l.id)){lotViews.delete(l.id);return;}
 const colour=l.id===selected?0x1d6fd6:USE_COLOURS[useOf(l.zone)],v=outlineFor(l,colour);scene.add(v.line,v.fill);lotViews.set(l.id,v);
 const token={};pending.set(l.id,token);const model=await buildLot(l,ctx);if(pending.get(l.id)!==token||lotViews.get(l.id)!==v){disposeTree(model);return;}v.model=model;scene.add(model);}
const refreshAll=()=>Promise.all(lots.map(refreshLot));

// ---------- list ----------
const uses=[...new Set(Object.keys(USE_COLOURS))];
$('useFilter').innerHTML+=uses.map(u=>`<option>${u}</option>`).join('');
$('legend').innerHTML=uses.map(u=>`<div><i style="background:#${USE_COLOURS[u].toString(16).padStart(6,'0')}"></i>${u}</div>`).join('');
function renderList(){const q=$('search').value.toLowerCase(),u=$('useFilter').value;
 $('lots').innerHTML=lots.filter(l=>(!u||useOf(l.zone)===u)&&(!q||`${l.site} ${l.zone} ${l.note} ${l.id}`.toLowerCase().includes(q)))
  .map(l=>`<div class="lot${l.id===selected?' sel':''}" data-id="${esc(l.id)}"><i style="background:#${USE_COLOURS[useOf(l.zone)].toString(16).padStart(6,'0')}"></i><div>${esc(l.site||'—')} <b>${esc(l.zone||'unzoned')}</b><br><small>${esc(l.note||l.id)}</small></div><small>${modelLabel(l)}</small></div>`).join('');}
const modelLabel=l=>l.model?.type==='glb'?'GLB':l.model?.type==='massing'?'massing':'—';
$('lots').onclick=e=>{const el=e.target.closest('.lot');if(el){select(el.dataset.id);focusLot(byId(el.dataset.id));}};
$('search').oninput=renderList;$('useFilter').onchange=renderList;
function focusLot(l){if(!l)return;const [x,z]=centroid(l.poly),d=camera.position.clone().sub(controls.target);controls.target.set(x,ground(x,z),z);const r=Math.sqrt(polygonArea(l.poly));d.setLength(Math.max(350,r*4.5));camera.position.copy(controls.target).add(d);controls.update();}

// ---------- inspector ----------
function select(id){const prev=selected;selected=id;status();for(const i of [prev,id]){const l=byId(i);if(l)refreshLot(l);}renderList();renderInspector();handles();}
function renderInspector(){const l=byId(selected),el=$('inspector');
 if(!l){el.innerHTML=`<h2>No lot selected</h2><p class="sub">Click a lot on the map or in the list.</p><p><b>Wand</b> (W): click inside an OZP lot to trace it.<br><b>Draw</b> (D): click corners, Enter or double-click to finish.<br><b>Select</b> (S): drag blue handles to reshape; Alt-click a handle to remove it; double-click an edge to add one.</p><p>Drop .glb files anywhere to add them to the model library. Models are in metres, Y up, origin at the ground-floor centre.</p>`;return;}
 const area=polygonArea(l.poly),pr=plotRatio(l.zone),g=ground(...centroid(l.poly)),m=l.model||{type:'none'},near=nearCorridor(l);
 el.innerHTML=`<h2>${esc(l.site?'Area '+l.site:'Lot')} · ${esc(l.zone||'unzoned')}</h2><div class="sub">${esc(l.id)} · ${useOf(l.zone)}</div>
 <div class="row"><span>Planning area</span><input id="f-site" value="${esc(l.site)}"></div>
 <div class="row"><span>Zone</span><select id="f-zone">${[...new Set([...ZONES,l.zone])].map(z=>`<option${z===l.zone?' selected':''}>${esc(z)}</option>`).join('')}</select></div>
 <div class="row"><span>Max height mPD</span><input id="f-bh" type="number" value="${l.maxBH??''}" placeholder="none"></div>
 <div class="row"><span>Max storeys</span><input id="f-st" type="number" value="${l.maxStoreys??''}" placeholder="none"></div>
 <div class="row"><span>Note</span><input id="f-note" value="${esc(l.note)}"></div>
 <div class="stats"><div><b>${(area/1e4).toFixed(2)} ha</b><span>site area</span></div><div><b>${pr??'—'}</b><span>max plot ratio (Notes)</span></div>
 <div><b>${pr?Math.round(area*pr).toLocaleString()+' m²':'—'}</b><span>max GFA</span></div><div><b>${l.maxBH!=null?Math.round(l.maxBH-DATUM-g)+' m':'—'}</b><span>height above ground</span></div></div>
 ${near?`<p class="warn">${near} corner${near>1?'s':''} on the SGMTS carriageway. Buildings there are skipped automatically; reshape the lot if the plan boundary is wrong.</p>`:''}
 <hr><div class="row"><span>3D model</span><select id="f-model"><option value="none"${m.type==='none'?' selected':''}>None (game default scenery)</option><option value="massing"${m.type==='massing'?' selected':''}>Placeholder massing</option>${models.map(f=>`<option value="glb:${esc(f)}"${m.type==='glb'&&m.src===f?' selected':''}>${esc(f)}</option>`).join('')}</select></div>
 ${m.type==='glb'?`<div class="row"><span>Rotation °</span><input id="f-rot" type="number" step="5" value="${m.rotation||0}"></div>
 <div class="row"><span>Scale</span><input id="f-scale" type="number" step=".05" value="${m.scale||1}"></div>
 <div class="row"><span>Offset E / S m</span><div style="display:flex;gap:4px"><input id="f-ox" type="number" step="1" value="${m.offset?.[0]||0}"><input id="f-oz" type="number" step="1" value="${m.offset?.[1]||0}"></div></div>
 <div class="btns"><button id="b-fit">Fit to lot</button><button id="b-align">Align to longest edge</button></div>`:''}
 <div class="btns"><button id="b-retrace" title="Re-trace this lot with the wand from its centre">Re-trace</button><button id="b-focus">Zoom to</button><button id="b-dup">Duplicate</button><button id="b-del" class="warn">Delete</button></div>`;
 const bind=(id,fn,ev='change')=>{const e=$(id);if(e)e.addEventListener(ev,()=>{snapshot();fn(e.value);refreshLot(l);renderList();renderInspector();});};
 bind('f-site',v=>l.site=v.trim());bind('f-note',v=>l.note=v);bind('f-bh',v=>l.maxBH=v===''?null:+v);bind('f-st',v=>l.maxStoreys=v===''?null:+v);
 bind('f-zone',v=>{const wasDefault=JSON.stringify(l.model)===JSON.stringify(defaultModel(l.zone));l.zone=v;if(wasDefault)l.model=defaultModel(v);});
 bind('f-model',v=>{l.model=v==='none'?{type:'none'}:v==='massing'?{type:'massing'}:{type:'glb',src:v.slice(4),rotation:0,scale:1,offset:[0,0]};});
 bind('f-rot',v=>l.model.rotation=+v);bind('f-scale',v=>l.model.scale=Math.max(.01,+v));bind('f-ox',v=>l.model.offset=[+v,l.model.offset?.[1]||0]);bind('f-oz',v=>l.model.offset=[l.model.offset?.[0]||0,+v]);
 $('b-fit')&&($('b-fit').onclick=()=>fitModel(l));
 $('b-align')&&($('b-align').onclick=()=>{snapshot();let best=0;for(let i=0;i<l.poly.length;i++){const [a,b]=[l.poly[i],l.poly[(i+1)%l.poly.length]],len=Math.hypot(b[0]-a[0],b[1]-a[1]);if(len>best){best=len;l.model.rotation=Math.round(Math.atan2(-(b[1]-a[1]),b[0]-a[0])*180/Math.PI);}}refreshLot(l);renderInspector();});
 $('b-retrace').onclick=()=>{const poly=mask&&wandPolygon(mask,cal,centroid(l.poly));if(!poly)return status('Re-trace failed: the lot centre is on a line or outside the plan.');snapshot();l.poly=poly;refreshLot(l);renderInspector();handles();};
 $('b-focus').onclick=()=>focusLot(l);
 $('b-dup').onclick=()=>{snapshot();const c=structuredClone(l);c.id=uniqueId(l.site||'lot');c.poly=c.poly.map(([x,z])=>[x+20,z+20]);lots.push(c);refreshLot(c);select(c.id);};
 $('b-del').onclick=deleteSelected;
}
// Corners on the SGMTS carriageway itself: a sign the plan boundary or the calibration needs a hand fix.
function nearCorridor(l){return l.poly.filter(([x,z])=>{const s=project(x,z),r=sample(s);return Math.hypot(x-r.x,z-r.z)<roadSection(s).right;}).length;}
async function fitModel(l){const v=lotViews.get(l.id);if(!v?.model)return;const box=new T.Box3().setFromObject(v.model),size=box.getSize(new T.Vector3()),s=l.model.scale||1;
 // Largest square that fits the lot is roughly sqrt(area)·0.8; scale the model's larger plan side to it.
 const target=Math.sqrt(polygonArea(l.poly))*.8,plan=Math.max(size.x,size.z)/s;if(!plan)return;snapshot();l.model.scale=+(target/plan).toFixed(3);await refreshLot(l);renderInspector();}
function uniqueId(base){let i=1,id;do id=`${base}-${String.fromCharCode(96+i)}${i>26?i:''}`;while(byId(id)&&++i);return id;}
function deleteSelected(){const l=byId(selected);if(!l||!confirm(`Delete lot ${l.site||l.id}?`))return;snapshot();lots=lots.filter(x=>x!==l);refreshLot(l);select(null);}

// ---------- vertex handles ----------
const handleGroup=new T.Group();scene.add(handleGroup);const handleGeo=new T.SphereGeometry(1,12,8),handleMat=new T.MeshBasicMaterial({color:0x1d6fd6,depthTest:false});
function handles(){handleGroup.clear();const l=byId(selected);if(!l||mode!=='select')return;const y=lotY(l),r=handleSize();
 l.poly.forEach(([x,z],i)=>{const h=new T.Mesh(handleGeo,handleMat);h.position.set(x,y,z);h.scale.setScalar(r);h.renderOrder=1004;h.userData.index=i;handleGroup.add(h);});}
const handleSize=()=>Math.max(1.2,camera.position.distanceTo(controls.target)/260);

// ---------- pointer ----------
const ray=new T.Raycaster(),ndc=new T.Vector2();
function pointer(e){const r=renderer.domElement.getBoundingClientRect();ndc.set((e.clientX-r.left)/r.width*2-1,-(e.clientY-r.top)/r.height*2+1);ray.setFromCamera(ndc,camera);}
function groundHit(y=0){const p=new T.Vector3();return ray.ray.intersectPlane(new T.Plane(new T.Vector3(0,1,0),-y),p)?p:null;}
let drag=null,downAt=null;
renderer.domElement.addEventListener('pointerdown',e=>{downAt=[e.clientX,e.clientY];if(mode!=='select'||e.button!==0)return;pointer(e);
 const hit=ray.intersectObjects(handleGroup.children)[0];if(!hit)return;const l=byId(selected),i=hit.object.userData.index;
 if(e.altKey){if(l.poly.length>3){snapshot();l.poly.splice(i,1);refreshLot(l);handles();renderInspector();}return;}
 snapshot();drag={l,i,y:hit.object.position.y};controls.enabled=false;renderer.domElement.setPointerCapture(e.pointerId);});
renderer.domElement.addEventListener('pointermove',e=>{if(!drag)return;pointer(e);const p=groundHit(drag.y);if(!p)return;drag.l.poly[drag.i]=[+p.x.toFixed(2),+p.z.toFixed(2)];handleGroup.children[drag.i].position.set(p.x,drag.y,p.z);
 const v=lotViews.get(drag.l.id);if(v){scene.remove(v.line,v.fill);const o=outlineFor(drag.l,0x1d6fd6);v.line=o.line;v.fill=o.fill;scene.add(v.line,v.fill);}});
renderer.domElement.addEventListener('pointerup',async e=>{if(drag){const l=drag.l;drag=null;controls.enabled=true;await refreshLot(l);handles();renderInspector();return;}
 if(!downAt||Math.hypot(e.clientX-downAt[0],e.clientY-downAt[1])>5||e.button!==0)return;pointer(e);
 if(mode==='select'){const fills=[...lotViews.values()].map(v=>v.fill),hit=ray.intersectObjects(fills.map(f=>(f.visible=true,f)))[0];fills.forEach(f=>f.visible=$('showFill').checked);
  let id=hit?.object.userData.lotId;if(!id){const p=groundHit(0);id=p&&lots.find(l=>pointInPolygon([p.x,p.z],l.poly))?.id;}select(id||null);}
 else if(mode==='wand'){const p=groundHit(0);if(!p||!mask)return;const poly=wandPolygon(mask,cal,[p.x,p.z]);
  if(!poly)return status('Wand: no closed lot here (on a line, or the region leaks). Try Draw instead.');if(polygonArea(poly)>600000)return status('Wand: region too large — the boundary has a gap. Try Draw.');
  addLot(poly);}
 else if(mode==='draw'){const p=groundHit(0);if(p){drawing.push([+p.x.toFixed(2),+p.z.toFixed(2)]);drawPreview();}}});
renderer.domElement.addEventListener('dblclick',e=>{pointer(e);if(mode==='draw'){finishDraw();return;}
 const l=byId(selected);if(mode!=='select'||!l)return;const p=groundHit(lotY(l));if(!p)return;let best=Infinity,at=-1;
 l.poly.forEach((a,i)=>{const b=l.poly[(i+1)%l.poly.length],dx=b[0]-a[0],dz=b[1]-a[1],t=Math.max(0,Math.min(1,((p.x-a[0])*dx+(p.z-a[1])*dz)/(dx*dx+dz*dz))),d=Math.hypot(p.x-a[0]-t*dx,p.z-a[1]-t*dz);if(d<best){best=d;at=i;}});
 if(best<handleSize()*4){snapshot();l.poly.splice(at+1,0,[+p.x.toFixed(2),+p.z.toFixed(2)]);refreshLot(l);handles();}});
function addLot(poly){snapshot();const l={id:uniqueId('lot'),site:'',zone:'',maxBH:null,maxStoreys:null,note:'',poly,model:{type:'none'}};lots.push(l);refreshLot(l);setMode('select');select(l.id);}
const drawLine=new T.Line(new T.BufferGeometry(),new T.LineBasicMaterial({color:0x1d6fd6,depthTest:false}));drawLine.renderOrder=1005;scene.add(drawLine);
function drawPreview(){drawLine.geometry.dispose();drawLine.geometry=new T.BufferGeometry().setFromPoints(drawing.map(([x,z])=>new T.Vector3(x,ground(x,z)+.8,z)));}
function finishDraw(){const pts=drawing.filter((p,i)=>!i||Math.hypot(p[0]-drawing[i-1][0],p[1]-drawing[i-1][1])>.5);drawing=[];drawPreview();if(pts.length>=3)addLot(pts);}

// ---------- modes & toolbar ----------
const HINTS={select:'Click a lot to edit it · drag handles to reshape · Alt-click removes a corner · double-click an edge adds one',wand:'Click inside a lot on the OZP plan to trace its boundary',draw:'Click to place corners · Enter or double-click to finish · Esc cancels'};
function setMode(m){mode=m;drawing=[];drawPreview();document.querySelectorAll('#modes button').forEach(b=>b.classList.toggle('on',b.dataset.mode===m));$('hintText').textContent=HINTS[m];handles();}
$('modes').onclick=e=>{const b=e.target.closest('button');if(b)setMode(b.dataset.mode);};
let topDown=true;$('view3d').onclick=()=>{topDown=!topDown;const t=controls.target,d=camera.position.distanceTo(t);camera.position.copy(t).add(topDown?new T.Vector3(0,d,1):new T.Vector3(0,d*.55,d*.8));controls.update();$('view3d').textContent=topDown?'3D view':'Top view';
 // The plan is an overlay: strong for tracing from above, faint in 3D so it doesn't paint over buildings.
 $('planOpacity').value=plan.material.opacity=topDown?.55:.12;};
$('showPlan').onchange=e=>plan.visible=e.target.checked;$('planOpacity').oninput=e=>plan.material.opacity=+e.target.value;
$('showFill').onchange=e=>lotViews.forEach(v=>v.fill.visible=e.target.checked);
let environment=null,sceneryGroup=new T.Group();scene.add(sceneryGroup);
// Night mirrors the game's switch: fixed baked illumination, lamp heads and lit windows.
const hemi=scene.children.find(o=>o.isHemisphereLight);
$('night').onchange=e=>{const on=e.target.checked;environment?.setNight(on);for(const m of [...(environment?.nightMaterials||[]),...lotNightMaterials()]){m.emissive.copy(m.color);m.emissiveIntensity=on?.8:0;}
 scene.background.set(on?0x0b1320:0xcfd9df);scene.fog.color.copy(scene.background);hemi.intensity=on?.25:1.6;sun.intensity=on?.05:2.2;};
$('showScenery').onchange=e=>{sceneryGroup.visible=e.target.checked;if(e.target.checked&&!environment)loadScenery();};
function undo(){const prev=history.pop();if(!prev)return;const ids=new Set([...lots.map(l=>l.id)]);lots=JSON.parse(prev);lots.forEach(l=>ids.add(l.id));[...ids].forEach(id=>refreshLot(byId(id)||{id}));if(!byId(selected))selected=null;status();renderList();renderInspector();handles();}
$('undo').onclick=undo;
async function save(){doc.lots=lots;const body=JSON.stringify(doc);
 try{const r=await fetch('/__lots/save',{method:'POST',body});if(!r.ok)throw Error(r.status);dirty=false;status('Saved to public/lots/lots.json');setTimeout(status,2500);}
 catch{const a=document.createElement('a');a.href=URL.createObjectURL(new Blob([body],{type:'application/json'}));a.download='lots.json';a.click();dirty=false;status('No dev server: downloaded lots.json — copy it to public/lots/');}}
$('save').onclick=save;
addEventListener('keydown',e=>{if(e.target.matches('input,select,textarea'))return;const k=e.key.toLowerCase(),mod=e.metaKey||e.ctrlKey;
 if(mod&&k==='z'){e.preventDefault();undo();}else if(mod&&k==='s'){e.preventDefault();save();}
 else if(k==='s')setMode('select');else if(k==='w')setMode('wand');else if(k==='d')setMode('draw');else if(k==='t')$('view3d').click();
 else if(k==='enter'&&mode==='draw')finishDraw();else if(k==='escape'){if(mode==='draw'){drawing=[];drawPreview();}else select(null);}
 else if((k==='delete'||k==='backspace')&&selected)deleteSelected();});
addEventListener('beforeunload',e=>{if(dirty)e.preventDefault();});

// ---------- model library (drop .glb files) ----------
async function loadModels(){try{models=await fetch('/__lots/models').then(r=>r.ok?r.json():[]);}catch{models=[];}}
let dragDepth=0;addEventListener('dragenter',e=>{e.preventDefault();if(++dragDepth)$('drop').style.display='flex';});addEventListener('dragleave',()=>{if(--dragDepth<=0){dragDepth=0;$('drop').style.display='none';}});
addEventListener('dragover',e=>e.preventDefault());
addEventListener('drop',async e=>{e.preventDefault();dragDepth=0;$('drop').style.display='none';const files=[...e.dataTransfer.files].filter(f=>/\.glb$/i.test(f.name));if(!files.length)return status('Only .glb files can be added.');
 let last;for(const f of files){const r=await fetch('/__lots/models/'+encodeURIComponent(f.name),{method:'POST',body:f});if(!r.ok)return status('Upload needs the dev server (npm run dev).');last=(await r.json()).name;}
 await loadModels();const l=byId(selected);if(l&&last){snapshot();l.model={type:'glb',src:last,rotation:0,scale:1,offset:[0,0]};await refreshLot(l);await fitModel(l);renderList();}renderInspector();status(`Added ${files.length} model(s) to public/lots/models`);});

// ---------- game scenery (context only; stations are loaded as-is and never modified) ----------
async function loadScenery(){status('Loading game scenery…');const loader=new GLTFLoader(),asset=f=>BASE+'assets/'+f;
 try{const kit=(await loader.loadAsync(asset('street-kit.glb'))).scene,before=new Set(scene.children);environment=buildEnvironment(scene,kit,{occupied:occupiedBy(lots)});// ponytail: occupancy is fixed at load, as in the game; reload after reassigning models to refresh filler buildings.
  for(const o of [...scene.children])if(!before.has(o))sceneryGroup.add(o);environment.update?.(1500,0);
  for(const st of STOPS){const root=(await loader.loadAsync(asset(`station-${st.id}.glb`))).scene,r=sample(st.s);root.position.set(r.x,r.y,r.z);root.rotation.y=r.heading;sceneryGroup.add(root);}}
 catch(err){console.error(err);status('Game scenery failed to load (see console)');return;}status();}

// Scenery LOD for the plants follows the camera target along the corridor.
let frame=0;renderer.setAnimationLoop(()=>{controls.update();if(environment&&++frame%30===0)environment.update?.(project(controls.target.x,controls.target.z),performance.now()/1000);
 const r=handleSize();handleGroup.children.forEach(h=>h.scale.setScalar(r));renderer.render(scene,camera);});

// ---------- boot ----------
(async()=>{setMode('select');renderInspector();
 doc=await fetch(BASE+'lots/lots.json',{cache:'no-store'}).then(r=>r.json());lots=doc.lots;
 await Promise.all([loadPlan(),loadModels()]);renderList();status('Building lots…');await refreshAll();status();
 if($('showScenery').checked)loadScenery();
 window.__editor={get lots(){return lots;},select,setMode,save,scene,camera,controls,refreshAll,byId};})();
