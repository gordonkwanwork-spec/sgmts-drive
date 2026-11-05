import {LENGTH,STOPS,sample} from './alignment.js';

// Full-screen route map (pause menu → 地圖 MAP, or the I key / round map button).
// Layers: the OZP plan (inverted for the dark UI), zoned lots, the SGMTS route, stations, signals, depot, other vehicles and you.
// Keys (handled by the sheet): ↑↓←→ pan · Enter zoom in / back to overview · Esc back. Mouse: drag to pan, wheel to zoom.
const BASE=import.meta.env?.BASE_URL||'/';
const ZONE=z=>/^R/.test(z)?'#f2c14e':/^C/.test(z)?'#ef6f6c':/^I|^OU\((Industry|Logistics|Enterprise|Port|Mixed)/.test(z)?'#a78bfa':/^G\/IC/.test(z)?'#5aa9ff':/^O|^GB/.test(z)?'#4cc38a':/^V/.test(z)?'#d99a6c':'#9aa7b0';
const PHASE={go:'#62f59b',amber:'#ffd05a',stop:'#ff7770'};
const ROUTE=Array.from({length:Math.ceil(LENGTH/20)+1},(_,i)=>sample(Math.min(LENGTH,i*20)));
const BOX=(()=>{const xs=ROUTE.map(p=>p.x),zs=ROUTE.map(p=>p.z);return {x0:Math.min(...xs),x1:Math.max(...xs),z0:Math.min(...zs),z1:Math.max(...zs)};})();
const LEGEND=[['#f2c14e','住宅 Residential'],['#ef6f6c','商業 Commercial'],['#a78bfa','工業 · 物流 Industry'],['#5aa9ff','政府 · 社區 G/IC'],['#4cc38a','休憩 · 綠化 Open space'],['#d99a6c','鄉村 Village']];

export function createFullMap({live,depot}){
 const root=document.createElement('section');root.className='panel-sheet map-sheet';
 root.innerHTML=`<canvas aria-label="Route map"></canvas><div class="map-legend"><div class="map-key"><i class="you"></i>你 You<i class="art"></i>其他車輛 Other ART<i class="stn"></i>車站 Station</div><div class="map-key"><i class="sig" style="--c:${PHASE.go}"></i>行 Go<i class="sig" style="--c:${PHASE.amber}"></i>等 Wait<i class="sig" style="--c:${PHASE.stop}"></i>停 Stop</div>${LEGEND.map(([c,t])=>`<div class="map-key"><i class="zone" style="--c:${c}"></i>${t}</div>`).join('')}</div><div class="map-hint"><kbd>↑↓←→</kbd>移動 Pan<kbd>Enter</kbd><span id="map-zoom-hint">放大 Zoom in</span><kbd>Esc</kbd>返回 Back</div>`;
 const cv=root.querySelector('canvas'),ctx=cv.getContext('2d'),view={cx:0,cz:0,k:.2,near:false};
 let lots=[],plan=null,cal=null,loaded=false;
 const dpr=()=>Math.min(2,devicePixelRatio||1);
 const fit=()=>{const w=cv.clientWidth||600,h=cv.clientHeight||400;Object.assign(view,{cx:(BOX.x0+BOX.x1)/2,cz:(BOX.z0+BOX.z1)/2,k:Math.min(h/(BOX.z1-BOX.z0+260),w/(BOX.x1-BOX.x0+260)),near:false});};
 const kMin=()=>Math.min((cv.clientHeight||400)/(BOX.z1-BOX.z0+260),.1)*.7;
 async function load(){
  if(loaded)return;loaded=true;
  try{
   const [l,c]=await Promise.all([fetch(BASE+'lots/lots.json').then(r=>r.json()),fetch(BASE+'lots/ozp-underlay.json').then(r=>r.json())]);lots=l.lots;cal=c;
   const img=new Image();img.src=BASE+'lots/ozp-underlay.jpg';await img.decode();
   plan=document.createElement('canvas');plan.width=img.width;plan.height=img.height;const p=plan.getContext('2d');p.drawImage(img,0,0);p.globalCompositeOperation='difference';p.fillStyle='#fff';p.fillRect(0,0,plan.width,plan.height);
  }catch(error){console.warn('Map layers unavailable',error);}
  draw();
 }
 const label=(text,x,z,font,color='#f4f1ea',align='left')=>{ctx.font=font;ctx.textAlign=align;ctx.lineWidth=4*dpr();ctx.strokeStyle='#05070bcc';ctx.lineJoin='round';ctx.strokeText(text,x,z);ctx.fillStyle=color;ctx.fillText(text,x,z);};
 const arrow=(x,y,angle,color,size)=>{ctx.save();ctx.translate(x,y);ctx.rotate(angle);ctx.fillStyle=color;ctx.strokeStyle='#05070b';ctx.lineWidth=1.5*dpr();ctx.beginPath();ctx.moveTo(0,-size);ctx.lineTo(size*.75,size);ctx.lineTo(0,size*.45);ctx.lineTo(-size*.75,size);ctx.closePath();ctx.fill();ctx.stroke();ctx.restore();};
 function draw(){
  const d=dpr(),W=Math.round(cv.clientWidth*d),H=Math.round(cv.clientHeight*d);if(!W||!H)return;
  if(cv.width!==W||cv.height!==H){cv.width=W;cv.height=H;}
  const k=view.k*d,P=(x,z)=>[W/2+(x-view.cx)*k,H/2+(z-view.cz)*k],px=n=>n*d;
  ctx.setTransform(1,0,0,1,0,0);ctx.fillStyle='#0f1d30';ctx.fillRect(0,0,W,H);
  if(plan&&cal){ctx.save();const [x,z]=P(cal.originX,cal.originZ);ctx.translate(x,z);ctx.scale(cal.metresPerPixel*k,cal.metresPerPixel*k);ctx.globalAlpha=.5;ctx.imageSmoothingQuality='high';ctx.drawImage(plan,0,0);ctx.restore();}
  for(const lot of lots){const c=ZONE(lot.zone);ctx.beginPath();lot.poly.forEach(([x,z],i)=>ctx[i?'lineTo':'moveTo'](...P(x,z)));ctx.closePath();ctx.fillStyle=c+'38';ctx.fill();ctx.strokeStyle=c+'bb';ctx.lineWidth=px(1);ctx.stroke();}
  if(k>.28)for(const lot of lots){const xs=lot.poly.map(p=>p[0]),zs=lot.poly.map(p=>p[1]),w=(Math.max(...xs)-Math.min(...xs))*k;if(w<px(46))continue;const [x,z]=P((Math.min(...xs)+Math.max(...xs))/2,(Math.min(...zs)+Math.max(...zs))/2);label(k>.55?lot.zone:lot.zone.replace(/^OU\(.*\)$/,'OU'),x,z,`700 ${px(11)}px system-ui,sans-serif`,ZONE(lot.zone),'center');if(k>.55&&lot.note&&lot.note.length<=26)label(lot.note,x,z+px(13),`${px(11)}px system-ui,'PingFang HK',sans-serif`,'#e8e4d8','center');}
  const trace=(pts,at)=>{ctx.beginPath();pts.forEach((p,i)=>ctx[i?'lineTo':'moveTo'](...P(p.x,p.z)));};
  ctx.lineCap=ctx.lineJoin='round';
  if(depot?.length){trace(depot);ctx.strokeStyle='#05070b';ctx.lineWidth=px(7);ctx.stroke();trace(depot);ctx.strokeStyle='#d9c3f7';ctx.lineWidth=px(3.5);ctx.stroke();const e=depot.at(-1),[x,z]=P(e.x,e.z);label('車廠 Depot',x+px(10),z+px(4),`700 ${px(12)}px system-ui,'PingFang HK',sans-serif`,'#e2d3f8');}
  trace(ROUTE);ctx.strokeStyle='#05070b';ctx.lineWidth=px(9);ctx.stroke();trace(ROUTE);ctx.strokeStyle='#f5731d';ctx.lineWidth=px(5);ctx.stroke();
  const L=live();
  for(const g of L.signals){const [x,z]=P(g.x,g.z);ctx.fillStyle=PHASE[g.phase]||'#999';ctx.strokeStyle='#05070b';ctx.lineWidth=px(2);ctx.beginPath();ctx.arc(x,z,px(5),0,Math.PI*2);ctx.fill();ctx.stroke();if(k>.45)label(g.name,x+px(9),z+px(4),`${px(11)}px system-ui,sans-serif`,'#d7e5da');}
  for(const st of STOPS){const p=sample(st.s),[x,z]=P(p.x,p.z);ctx.fillStyle='#f4f1ea';ctx.strokeStyle='#f5731d';ctx.lineWidth=px(3);ctx.beginPath();ctx.arc(x,z,px(8),0,Math.PI*2);ctx.fill();ctx.stroke();label(st.zh,x+px(16),z-px(1),`800 ${px(17)}px system-ui,'PingFang HK',sans-serif`);label(st.name,x+px(16),z+px(14),`${px(12)}px system-ui,sans-serif`,'#cfd8d2');}
  for(const o of L.others){const [x,z]=P(o.x,o.z);arrow(x,z,o.angle,'#51d7ff',px(8));}
  {const [x,z]=P(L.you.x,L.you.z);arrow(x,z,L.you.angle,'#ffbf57',px(11));label('你 You',x+px(14),z+px(4),`800 ${px(13)}px system-ui,'PingFang HK',sans-serif`,'#ffd58a');}
  // Scale bar and north.
  const nice=[50,100,200,500,1000].find(m=>m*k>=px(70))||1000,bx=W-px(24)-nice*k,by=H-px(26);
  ctx.strokeStyle='#f4f1ea';ctx.lineWidth=px(2);ctx.beginPath();ctx.moveTo(bx,by-px(5));ctx.lineTo(bx,by);ctx.lineTo(bx+nice*k,by);ctx.lineTo(bx+nice*k,by-px(5));ctx.stroke();label(nice+' m',bx+nice*k/2,by-px(9),`700 ${px(12)}px system-ui,sans-serif`,'#f4f1ea','center');
  label('N ↑',W-px(24),px(26),`800 ${px(14)}px system-ui,sans-serif`,'#f4f1ea','right');
 }
 const zoom=(factor,ax=cv.clientWidth/2,az=cv.clientHeight/2)=>{const k0=view.k,k1=Math.max(kMin(),Math.min(3,k0*factor));view.cx+=(ax-cv.clientWidth/2)*(1/k0-1/k1);view.cz+=(az-cv.clientHeight/2)*(1/k0-1/k1);view.k=k1;view.near=k1>kMin()*1.6;hint();draw();};
 const hint=()=>{root.querySelector('#map-zoom-hint').textContent=view.near?'全覽 Overview':'放大 Zoom in';};
 function toggle(){const you=live().you;if(view.near){fit();}else{Object.assign(view,{cx:you.x,cz:you.z,k:.8,near:true});}hint();draw();}
 let drag=null;
 cv.addEventListener('pointerdown',e=>{drag={x:e.clientX,y:e.clientY};cv.setPointerCapture(e.pointerId);});
 cv.addEventListener('pointermove',e=>{if(!drag)return;view.cx-=(e.clientX-drag.x)/view.k;view.cz-=(e.clientY-drag.y)/view.k;drag={x:e.clientX,y:e.clientY};draw();});
 cv.addEventListener('pointerup',()=>drag=null);cv.addEventListener('pointercancel',()=>drag=null);
 cv.addEventListener('wheel',e=>{e.preventDefault();const r=cv.getBoundingClientRect();zoom(Math.exp(-e.deltaY*.0015),e.clientX-r.left,e.clientY-r.top);},{passive:false});
 new ResizeObserver(()=>{if(cv.clientWidth)draw();}).observe(root);
 return {
  root,
  // Called when the map is shown: overview first, centred on the whole route.
  open(){fit();hint();load();draw();},
  // Sheet keys: arrows pan (a screen-sixth per press), Enter toggles zoom, +/- zoom. Returns true when handled.
  key(e){
   const step=cv.clientHeight/6/view.k,pan={ArrowUp:[0,-1],ArrowDown:[0,1],ArrowLeft:[-1,0],ArrowRight:[1,0]}[e.code];
   if(pan){e.preventDefault();view.cx+=pan[0]*step;view.cz+=pan[1]*step;draw();return true;}
   if(e.code==='Enter'||e.code==='Space'){e.preventDefault();toggle();return true;}
   if(e.code==='Equal'||e.code==='Minus'){e.preventDefault();zoom(e.code==='Equal'?1.4:1/1.4);return true;}
   return false;
  }
 };
}
