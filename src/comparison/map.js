import {analyse} from './analysis.js';

const $=id=>document.getElementById(id),canvas=$('map'),ctx=canvas.getContext('2d');
const base=import.meta.env.BASE_URL,ha=n=>n.toLocaleString('en-HK',{minimumFractionDigits:1,maximumFractionDigits:1})+' ha';
const pct=n=>n<.001?'0%':n<.01?'<1%':Math.round(n*100)+'%';
let model,selection=null,mode='overlay',split=.5,cx=0,cy=0,zoom=1,W=0,H=0,scheduled=false,refreshJob=null;
const clamp=(v,a,b)=>Math.max(a,Math.min(b,v)),pointers=new Map();
const ax=x=>(x-cx)*zoom+W/2,ay=y=>(y-cy)*zoom+H/2;
const world=(x,y)=>[cx+(x-W/2)/zoom,cy+(y-H/2)/zoom];
function invalidate(){if(!scheduled){scheduled=true;requestAnimationFrame(()=>{scheduled=false;draw();});}}
function constrain(){
 if(!model)return;
 zoom=clamp(zoom,Math.min(W/model.cal.width,H/model.cal.height)*.82,15);
 cx=clamp(cx,0,model.cal.width);cy=clamp(cy,0,model.cal.height);
}
function frame(box,limit=Infinity,padding=.79){
 cx=(box[0]+box[2])/2;cy=(box[1]+box[3])/2;
 zoom=Math.min(limit,W*padding/Math.max(10,box[2]-box[0]),H*padding/Math.max(10,box[3]-box[1]));
 constrain();invalidate();
}
function resize(){
 const dpr=Math.min(devicePixelRatio,2);W=canvas.clientWidth;H=canvas.clientHeight;
 canvas.width=Math.round(W*dpr);canvas.height=Math.round(H*dpr);constrain();invalidate();
}
new ResizeObserver(resize).observe(canvas);
function atZoom(factor,x=W/2,y=H/2){
 if(!model)return;const p=world(x,y);zoom*=factor;constrain();
 cx=p[0]-(x-W/2)/zoom;cy=p[1]-(y-H/2)/zoom;constrain();invalidate();
}
function draw(){
 if(!model||!W||!H)return;
 const d=canvas.width/W,{cal}=model,w=cal.width,h=cal.height;
 ctx.setTransform(d,0,0,d,0,0);ctx.fillStyle='#e1e7de';ctx.fillRect(0,0,W,H);
 ctx.save();ctx.translate(ax(0),ay(0));ctx.scale(zoom,zoom);
 ctx.fillStyle='#fbfbf4';ctx.fillRect(0,0,w,h);
 const sheet=()=>{if($('showOzp').checked){ctx.globalAlpha=Number($('opacity').value)/100;ctx.drawImage(model.plan,0,0);ctx.globalAlpha=1;}};
 const game=()=>{if(mode==='open')ctx.drawImage(model.open,0,0);if($('showUsed').checked)ctx.drawImage(model.used,0,0);if($('showBuilt').checked)ctx.drawImage(model.built,0,0);};
 if(mode==='swipe'){
  const boundary=world(W*split,0)[0];
  ctx.save();ctx.beginPath();ctx.rect(0,0,boundary,h);ctx.clip();sheet();ctx.restore();
  ctx.save();ctx.beginPath();ctx.rect(boundary,0,w-boundary,h);ctx.clip();game();ctx.restore();
 }else{sheet();game();}
 if($('showLots').checked){
  ctx.strokeStyle='#706d477a';ctx.lineWidth=.85/zoom;for(const lot of model.lots)ctx.stroke(lot.path);
 }
 ctx.beginPath();model.route.forEach(([x,y],i)=>i?ctx.lineTo(x,y):ctx.moveTo(x,y));ctx.strokeStyle='#693c6f';ctx.lineWidth=2/zoom;ctx.stroke();
 if(selection?.path){
  ctx.lineWidth=4/zoom;ctx.strokeStyle='#fff';ctx.stroke(selection.path);ctx.strokeStyle='#9d5117';ctx.lineWidth=2.2/zoom;ctx.stroke(selection.path);
  if(mode==='open'&&selection.review&&selection.square){
   const [x,y,s]=selection.square;ctx.save();ctx.setLineDash([6/zoom,4/zoom]);ctx.lineWidth=1.7/zoom;ctx.strokeStyle='#703a0d';ctx.strokeRect(x,y,s,s);ctx.restore();
  }
 }
 ctx.restore();
 for(const stop of model.stops){const x=ax(stop.point[0]),y=ay(stop.point[1]);if(x<0||x>W||y<0||y>H)continue;
  ctx.beginPath();ctx.arc(x,y,3.5,0,Math.PI*2);ctx.fillStyle='white';ctx.fill();ctx.strokeStyle='#693c6f';ctx.lineWidth=2;ctx.stroke();
  ctx.font='600 11px system-ui';ctx.lineJoin='round';ctx.lineWidth=3;ctx.strokeStyle='#fffff4';ctx.fillStyle='#4b3152';
  const label=zoom>.42?stop.id+'  '+stop.name:stop.id;ctx.strokeText(label,x+7,y+3);ctx.fillText(label,x+7,y+3);
 }
 const lengths=[1,2,5,10,20,50,100,200,500,1000];const metres=lengths.filter(n=>n/cal.metresPerPixel*zoom<92).at(-1)||1;
 $('scale').style.width=metres/cal.metresPerPixel*zoom+'px';$('scaleText').textContent=metres+' m';
}
function changeMode(m){
 mode=m;const url=new URL(location.href);if(m==='overlay')url.searchParams.delete('view');else url.searchParams.set('view',m);history.replaceState(null,'',url);
 document.querySelectorAll('[data-mode]').forEach(b=>b.setAttribute('aria-pressed',String(b.dataset.mode===m)));
 $('swipeLine').hidden=$('sideLabels').hidden=m!=='swipe';document.querySelector('.openKey').hidden=m!=='open';invalidate();
}
document.querySelectorAll('[data-mode]').forEach(b=>b.onclick=()=>changeMode(b.dataset.mode));
function slider(value){split=clamp(value,.02,.98);$('swipeLine').style.left=100*split+'%';$('swipeControl').setAttribute('aria-valuenow',Math.round(100*split));invalidate();}
slider(.5);
const divider=$('swipeControl');divider.onpointerdown=e=>{divider.setPointerCapture(e.pointerId);e.preventDefault();};
divider.onpointermove=e=>{if(divider.hasPointerCapture(e.pointerId))slider((e.clientX-canvas.getBoundingClientRect().left)/W);};
divider.onkeydown=e=>{if(e.key==='ArrowLeft'||e.key==='ArrowRight'){e.preventDefault();slider(split+(e.key==='ArrowLeft'?-.02:.02));}};
$('layersButton').onclick=()=>{const panel=$('layers');panel.hidden=!panel.hidden;$('layersButton').setAttribute('aria-expanded',String(!panel.hidden));};
for(const id of ['showOzp','showBuilt','showUsed','showLots','opacity'])$(id).oninput=invalidate;
$('plus').onclick=()=>atZoom(1.4);$('minus').onclick=()=>atZoom(1/1.4);
$('fit').onclick=()=>{if(model)frame([0,0,model.cal.width,model.cal.height],Infinity,.93);};
function local(e){const r=canvas.getBoundingClientRect();return [e.clientX-r.left,e.clientY-r.top];}
let moved=false,down;
canvas.onpointerdown=e=>{canvas.setPointerCapture(e.pointerId);const p=local(e);pointers.set(e.pointerId,p);if(pointers.size===1){down=p;moved=false;}else moved=true;canvas.classList.add('drag');};
canvas.onpointermove=e=>{
 if(!pointers.has(e.pointerId)||!model)return;
 const p=local(e),prev=pointers.get(e.pointerId);pointers.set(e.pointerId,p);
 if(pointers.size===2){const other=[...pointers].find(([id])=>id!==e.pointerId)[1],dist=a=>Math.hypot(a[0]-other[0],a[1]-other[1]);
  const anchor=world((prev[0]+other[0])/2,(prev[1]+other[1])/2);zoom*=dist(p)/Math.max(1,dist(prev));constrain();
  cx=anchor[0]-((p[0]+other[0])/2-W/2)/zoom;cy=anchor[1]-((p[1]+other[1])/2-H/2)/zoom;
 }else{cx-=(p[0]-prev[0])/zoom;cy-=(p[1]-prev[1])/zoom;if(Math.hypot(p[0]-down[0],p[1]-down[1])>4)moved=true;}
 constrain();invalidate();
};
canvas.onpointerup=e=>{if(!pointers.has(e.pointerId))return;pointers.delete(e.pointerId);if(!pointers.size){canvas.classList.remove('drag');if(!moved&&model)pick(...local(e));}};
canvas.onpointercancel=e=>{pointers.delete(e.pointerId);moved=true;if(!pointers.size)canvas.classList.remove('drag');};
canvas.onwheel=e=>{e.preventDefault();atZoom(Math.exp(-clamp(e.deltaY,-220,220)*.003),...local(e));};
canvas.ondblclick=e=>atZoom(1.75,...local(e));
canvas.onkeydown=e=>{if(!model)return;const step=70/zoom;
 if(e.key==='+'||e.key==='=')atZoom(1.4);else if(e.key==='-')atZoom(1/1.4);else if(e.key==='ArrowLeft')cx-=step;else if(e.key==='ArrowRight')cx+=step;else if(e.key==='ArrowUp')cy-=step;else if(e.key==='ArrowDown')cy+=step;else return;e.preventDefault();constrain();invalidate();
};
function elem(tag,txt,cls){const el=document.createElement(tag);el.textContent=txt;if(cls)el.className=cls;return el;}
function renderList(){
 if(!model)return;const q=$('query').value.trim().toLowerCase(),use=$('use').value;
 const lots=model.lots.filter(l=>(use==='all'||(use==='review'?l.review:l.use===use))&&[l.id,l.zone,l.note,l.use].join(' ').toLowerCase().includes(q));
 const byId=(a,b)=>a.id.localeCompare(b.id,'en',{numeric:true});
 lots.sort((a,b)=>($('order').value==='wide'?b.span-a.span:$('order').value==='low'?a.coverage-b.coverage:$('order').value==='open'?b.open-a.open:0)||byId(a,b));
 $('resultCount').textContent=lots.length+' / '+model.lots.length;$('list').replaceChildren();
 for(const lot of lots){
  const b=elem('button','','row'+(lot===selection?' active':''));b.setAttribute('aria-pressed',String(lot===selection));
  b.append(elem('strong',lot.id),elem('span',ha(lot.open),'area'),elem('small',lot.use+' · '+lot.zone),elem('small','open','end'));
  b.onclick=()=>select(lot,true);$('list').append(b);
 }
 if(!lots.length)$('list').append(elem('p','No matching parcels.','intro'));
}
for(const id of ['query','use','order'])$(id).oninput=renderList;
function select(lot,focus){
 selection=lot;$('detail').hidden=false;$('detailUse').textContent=lot.zone+' · '+lot.use;
 $('detailTitle').textContent='Parcel '+lot.id;const body=$('detailBody');body.replaceChildren();
 if(lot.note)body.append(elem('p',lot.note));if(!lot.review)body.append(elem('p','Outside the infill review.'));
 const bar=elem('div','','swatchbar');for(const [key,colour] of [['built','#006b62'],['used','#899895']]){const part=elem('span','');part.style.cssText='width:'+100*lot[key]/(lot.total||1)+'%;background:'+colour;bar.append(part);}body.append(bar);
 const stats=elem('dl','');for(const [label,val] of [['Mapped parcel',ha(lot.total)],['Building coverage',ha(lot.built)+' · '+pct(lot.coverage)],['Infrastructure, paving & water',ha(lot.used)],['Open ground',ha(lot.open)],['Largest clear square',Math.floor(lot.span)+' × '+Math.floor(lot.span)+' m']])stats.append(elem('dt',label),elem('dd',val));body.append(stats);
 if(lot.street)body.append(elem('p','Clear-square centre · '+Math.round(lot.street.distance)+' m to '+lot.street.name));
 if(lot.clipped)body.append(elem('p','Parcel reaches the edge of the OZP sheet.'));
 const site=elem('a','Inspect site in game ↗','inspect');const [x,y,s]=lot.square||[lot.box[0],lot.box[1],0];
 const target=lot.square?[x+s/2,y+s/2]:[(lot.box[0]+lot.box[2])/2,(lot.box[1]+lot.box[3])/2];
 const wx=model.cal.originX+target[0]*model.cal.metresPerPixel,wz=model.cal.originZ+target[1]*model.cal.metresPerPixel;
 site.href='./?inspectSite='+[Math.round(wx),Math.round(wz),Math.max(45,Math.min(155,Math.round(lot.span*.7)))].join(',');site.target='_blank';site.rel='noopener';body.append(site);
 if(focus)frame(lot.box,3.2,.66);renderList();invalidate();
 const u=new URL(location.href);u.searchParams.set('parcel',lot.id);history.replaceState(null,'',u);
}
function clearSelection(){selection=null;$('detail').hidden=true;const u=new URL(location.href);u.searchParams.delete('parcel');history.replaceState(null,'',u);renderList();invalidate();}
$('close').onclick=clearSelection;
function pick(sx,sy){
 const [x,y]=world(sx,sy);ctx.save();ctx.setTransform(1,0,0,1,0,0);const matches=model.lots.filter(l=>ctx.isPointInPath(l.path,x,y));ctx.restore();
 if(matches.length)select(matches.sort((a,b)=>a.total-b.total)[0],false);
 else{clearSelection();$('detail').hidden=false;$('detailUse').textContent='Map inspection';$('detailTitle').textContent='Outside traced parcels';$('detailBody').textContent='Parcel coverage is available inside the mapped boundaries.';}
}
async function install(data){
 const next=await analyse(data,base+'lots/ozp-underlay.jpg');const first=!model;model=next;
 const filter=$('use').value;$('use').length=2;for(const label of [...new Set(model.lots.map(l=>l.use))].sort())$('use').add(new Option(label,label));$('use').value=filter;
 $('sourceText').textContent='Project OZP sheet '+data.cal.source+' · '+data.cal.metresPerPixel+' m per pixel. Game layers share its east–south coordinate frame.';
 $('freshness').textContent='Game capture · '+new Date(data.captured).toLocaleString('en-HK',{dateStyle:'medium',timeStyle:'short'});
 resize();
 const view=new URL(location.href).searchParams.get('view');if(first&&['swipe','open'].includes(view))changeMode(view);
 const id=new URL(location.href).searchParams.get('parcel'),lot=model.lots.find(l=>l.id===id);
 if(lot)select(lot,first);else if(first){const s=model.stops.find(s=>s.id==='A5')||model.stops[0];frame([s.point[0]-430,s.point[1]-310,s.point[0]+430,s.point[1]+310],1.45,.95);}
 renderList();invalidate();$('status').textContent='';
}
function finishRefresh(message=''){
 if(!refreshJob)return;clearTimeout(refreshJob.timer);refreshJob.frame.remove();refreshJob=null;$('refresh').disabled=false;$('status').textContent=message;
}
$('refresh').onclick=()=>{
 if(refreshJob)return;$('refresh').disabled=true;$('status').textContent='Loading the game to recapture its buildings…';
 const f=document.createElement('iframe');f.className='capture-frame';f.tabIndex=-1;f.setAttribute('aria-hidden','true');f.title='Game map capture';f.allow='autoplay';f.src=new URL('./?ozpCapture=1',location.href).href;
 refreshJob={frame:f,timer:setTimeout(()=>finishRefresh('Game capture timed out. You can retry.'),180000)};document.body.append(f);
};
window.addEventListener('message',async e=>{
 if(e.origin!==location.origin||!refreshJob||e.source!==refreshJob.frame.contentWindow||e.data?.type!=='sgmts-ozp-capture')return;
 try{if(e.data.error)throw Error(e.data.error);await install(e.data.data);try{sessionStorage.setItem('sgmts.comparison',JSON.stringify(e.data.data));}catch{}finishRefresh('Game layers updated.');}
 catch(err){finishRefresh('Refresh failed. '+err.message);}
});
fetch(base+'lots/game-comparison.json',{cache:'no-cache'}).then(r=>{if(!r.ok)throw Error('Capture missing.');return r.json();}).then(data=>{try{const cache=JSON.parse(sessionStorage.getItem('sgmts.comparison'));if(cache?.version===data.version&&cache.captured>data.captured)data=cache;}catch{}return install(data);}).catch(err=>{$('status').textContent=err.message+' Use Refresh from running game to retry.';});
