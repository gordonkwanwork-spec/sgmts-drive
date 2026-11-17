// Graphics panel (after the city-rules sandbox's Graphics menu): preset, render scale, sun shadows, draw distance, bloom and the
// cinematic pass, plus a performance overlay whose metrics are switched on and off one by one. Settings persist ('sgmts-gfx').
// "Auto" leaves the adaptive-resolution governor in charge of that setting; a fixed value overrides it.
import {readSetting,writeSetting} from './settings.js';

export const METRICS=[['fps','FPS'],['frame','Frame time'],['cpu','CPU time per frame'],['calls','Draw calls'],['tris','Triangles'],['res','Render resolution'],['mem','Geometries / textures'],['gov','Auto quality (governor)']];
const SHADOWS=[['auto','Auto'],['0','Off'],['1024','Low'],['2048','Medium'],['4096','High']];
export const DEFAULTS={scale:'auto',shadow:'auto',far:'auto',bloom:true,post:true,overlay:false,metrics:Object.fromEntries(METRICS.map(([k],i)=>[k,i<4]))};

export function loadGraphics(){try{const s=JSON.parse(readSetting('sgmts-gfx','{}'));return {...DEFAULTS,...s,metrics:{...DEFAULTS.metrics,...s.metrics}};}catch{return {...DEFAULTS,metrics:{...DEFAULTS.metrics}};}}

// host: {getPreset() → 'smooth'|'cinematic', setPreset(p), apply(settings)} — apply pushes every setting into the renderer.
export function createGraphicsPanel(host){
 const g=loadGraphics(),save=()=>{writeSetting('sgmts-gfx',JSON.stringify(g));host.apply(g);};
 const panel=document.createElement('section');panel.id='gfx-panel';panel.hidden=true;panel.setAttribute('aria-label','Graphics');
 const range=(key,label,min,max,step,fmt)=>`<div class="gfx-row"><span>${label}</span><output data-out="${key}"></output><label><input type="checkbox" data-auto="${key}"> Auto</label><input type="range" data-key="${key}" min="${min}" max="${max}" step="${step}"></div>`;
 panel.innerHTML=`<h3>Graphics / 畫質</h3>
  <h4>Preset</h4><div class="gfx-chips" data-group="preset"><button data-preset="smooth">Smooth / 流暢</button><button data-preset="cinematic">Cinematic / 電影</button></div>
  <h4>Rendering</h4>${range('scale','Render scale',.5,2,.05)}${range('far','Draw distance',300,3500,50)}
  <div class="gfx-row"><span>Sun shadows</span><div class="gfx-chips" data-group="shadow">${SHADOWS.map(([v,l])=>`<button data-shadow="${v}">${l}</button>`).join('')}</div></div>
  <label class="gfx-check"><input type="checkbox" data-flag="bloom"> Bloom (glow) · Cinematic only</label>
  <label class="gfx-check"><input type="checkbox" data-flag="post"> Sun shafts, ambient occlusion and colour grade · Cinematic only</label>
  <h4>Performance overlay</h4><label class="gfx-check"><input type="checkbox" data-flag="overlay"> Show performance stats</label>
  <div class="gfx-metrics">${METRICS.map(([k,l])=>`<label class="gfx-check"><input type="checkbox" data-metric="${k}"> ${l}</label>`).join('')}</div>`;
 const stats=document.createElement('div');stats.id='perf-stats';stats.hidden=true;
 document.body.append(panel,stats);
 const $=s=>panel.querySelector(s),$$=s=>[...panel.querySelectorAll(s)];
 function sync(){
  for(const b of $$('[data-preset]'))b.classList.toggle('active',b.dataset.preset===host.getPreset());
  for(const b of $$('[data-shadow]'))b.classList.toggle('active',b.dataset.shadow===String(g.shadow));
  for(const key of ['scale','far']){const auto=g[key]==='auto',r=$(`[data-key=${key}]`);$(`[data-auto=${key}]`).checked=auto;r.disabled=auto;if(!auto)r.value=g[key];
   $(`[data-out=${key}]`).textContent=auto?'auto':key==='scale'?(+g[key]).toFixed(2)+'×':g[key]+' m';}
  for(const c of $$('[data-flag]'))c.checked=!!g[c.dataset.flag];
  for(const c of $$('[data-metric]')){c.checked=!!g.metrics[c.dataset.metric];c.disabled=!g.overlay;}
  stats.hidden=!g.overlay;}
 panel.addEventListener('click',e=>{const b=e.target.closest('button');if(!b)return;
  if(b.dataset.preset){host.setPreset(b.dataset.preset);save();}
  if(b.dataset.shadow){g.shadow=b.dataset.shadow==='auto'?'auto':+b.dataset.shadow;save();}
  sync();});
 panel.addEventListener('input',e=>{const t=e.target;
  if(t.dataset.key)g[t.dataset.key]=+t.value;
  if(t.dataset.auto)g[t.dataset.auto]=t.checked?'auto':+$(`[data-key=${t.dataset.auto}]`).value;
  if(t.dataset.flag)g[t.dataset.flag]=t.checked;
  if(t.dataset.metric)g.metrics[t.dataset.metric]=t.checked;
  save();sync();});
 // Performance overlay: frame intervals and CPU time averaged over half a second; renderer counters from the last frame.
 let acc=0,cpu=0,n=0,worst=0,since=0;
 function frame(frameMs,cpuMs,info){if(!g.overlay)return;acc+=frameMs;cpu+=cpuMs;n++;worst=Math.max(worst,frameMs);since+=frameMs;if(since<500)return;
  const m=g.metrics,lines=[],avg=acc/n;
  if(m.fps)lines.push(`FPS ${(1000/avg).toFixed(0)}`);
  if(m.frame)lines.push(`Frame ${avg.toFixed(1)} ms · worst ${worst.toFixed(1)}`);
  if(m.cpu)lines.push(`CPU ${(cpu/n).toFixed(1)} ms`);
  if(m.calls)lines.push(`Draw calls ${info.calls.toLocaleString()}`);
  if(m.tris)lines.push(`Triangles ${(info.triangles/1e6).toFixed(2)} M`);
  if(m.res)lines.push(`Resolution ${info.width}×${info.height} @ ${info.ratio.toFixed(2)}×`);
  if(m.mem)lines.push(`Geometries ${info.geometries} · textures ${info.textures}`);
  if(m.gov)lines.push(`Auto quality: scale ${info.govRatio.toFixed(2)}× · shed ${info.shed}/3`);
  stats.textContent=lines.join('\n')||'Choose metrics in Graphics';acc=cpu=n=worst=since=0;}
 sync();host.apply(g);
 return {settings:g,frame,toggle(){panel.hidden=!panel.hidden;if(!panel.hidden)sync();return !panel.hidden;},get open(){return !panel.hidden;}};
}
