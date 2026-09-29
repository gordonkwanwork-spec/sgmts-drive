import styles from './loading-screen.css?inline';
const filters="\n<svg aria-hidden=\"true\" width=\"0\" height=\"0\" style=\"position:absolute;pointer-events:none\"><defs><filter id=\"logo-key-light\" color-interpolation-filters=\"sRGB\"><feColorMatrix in=\"SourceGraphic\" type=\"matrix\" values=\"1 0 0 0 0 0 1 0 0 0 0 0 1 0 0 -4 0 0 0 3.85\" result=\"r\"/><feColorMatrix in=\"SourceGraphic\" type=\"matrix\" values=\"1 0 0 0 0 0 1 0 0 0 0 0 1 0 0 0 0 -4 0 3.85\" result=\"b\"/><feComposite in=\"r\" in2=\"b\" operator=\"over\"/><feComposite in2=\"SourceGraphic\" operator=\"in\"/></filter><filter id=\"logo-key-dark\" color-interpolation-filters=\"sRGB\"><feColorMatrix in=\"SourceGraphic\" type=\"matrix\" values=\"1 0 0 0 0 0 1 0 0 0 0 0 1 0 0 4 0 0 0 -1.8\" result=\"r\"/><feColorMatrix in=\"SourceGraphic\" type=\"matrix\" values=\"1 0 0 0 0 0 1 0 0 0 0 0 1 0 0 0 4 0 0 -1.92\" result=\"g\"/><feComposite in=\"r\" in2=\"g\" operator=\"over\"/><feComposite in2=\"SourceGraphic\" operator=\"in\"/></filter></defs></svg>\n";
const layouts=[
  "<section class=\"screen night\" aria-label=\"Route map concept\"><div class=\"watermark\" aria-hidden=\"true\"><img class=\"brand-logo\" src=\"\" alt=\"\"></div><div class=\"headline\"><h1>Preparing your route.</h1></div>\n<svg class=\"route\" viewBox=\"0 -20 1200 390\" aria-label=\"Seven-station route\"><path d=\"M90 240H360Q400 240 430 210L560 80Q590 50 630 50H1110\" fill=\"none\" stroke=\"var(--ui-line)\" stroke-width=\"5\"/><path id=\"lit\" d=\"M90 240H360Q400 240 430 210L560 80Q590 50 630 50H1110\" fill=\"none\" stroke=\"var(--ui-cyan)\" stroke-width=\"4\"/><g id=\"map-stops\"></g><circle id=\"traveller\" class=\"pulse\" r=\"7\"/></svg>\n<div class=\"bottom\"><div><div class=\"eyebrow\">LOADING STATION</div><div class=\"next\"><strong class=\"station-name\"></strong><span class=\"station-zh\"></span></div></div><div class=\"percent\" role=\"progressbar\" aria-label=\"Route loading\" aria-valuemin=\"0\" aria-valuemax=\"100\" aria-valuenow=\"0\"><span class=\"pct\">00</span><small>%</small></div></div></section>",
  "<section class=\"screen window\" aria-label=\"Window seat concept\"><div class=\"watermark\" aria-hidden=\"true\"><img class=\"brand-logo\" src=\"\" alt=\"\"></div><div class=\"headline\"><h1>Your journey is loading.</h1></div><div class=\"scene\" aria-hidden=\"true\"><div class=\"sky\"><div class=\"sun\"></div><div class=\"hills\"></div><div class=\"city\"></div><div class=\"post\"></div><div class=\"sign\"><div class=\"zh station-zh\"></div><div class=\"en station-name\"></div></div><div class=\"platform\"></div><div class=\"reflection\"></div></div></div><div class=\"mini-route\"></div><div class=\"bottom\"><div><div class=\"eyebrow\">LOADING STATION</div><div class=\"next\"><strong class=\"station-name\"></strong><span class=\"station-zh\"></span></div></div><div class=\"percent\" role=\"progressbar\" aria-label=\"Route loading\" aria-valuemin=\"0\" aria-valuemax=\"100\" aria-valuenow=\"0\"><span class=\"pct\">00</span><small>%</small></div></div></section>",
  "<section class=\"screen ticket\" aria-label=\"Departure board concept\"><div class=\"watermark\" aria-hidden=\"true\"><img class=\"brand-logo\" src=\"\" alt=\"\"></div><div class=\"board\"><div><h1>Preparing departure.</h1><div class=\"flaps\" aria-label=\"Station counter\"></div><div class=\"board-sub\">STATION</div></div><div class=\"list\"></div></div><div class=\"bottom\"><div><div class=\"ticket-status\">LOADING STATION</div><div class=\"next\"><strong class=\"station-name\"></strong><span class=\"station-zh\"></span></div></div><div class=\"percent\" role=\"progressbar\" aria-label=\"Route loading\" aria-valuemin=\"0\" aria-valuemax=\"100\" aria-valuenow=\"0\"><span class=\"pct\">00</span><small>%</small></div></div></section>"
];

export function createLoadingScreen(host,stations,logoBase){
 const variant=Math.floor(Math.random()*layouts.length);
 host.setAttribute('aria-busy','true');
 host.dataset.loadingVariant=['route','window','departure'][variant];
 const root=host.attachShadow({mode:'open'});
 root.innerHTML=`<style>${styles}</style>${filters}${layouts[variant]}`;
 const $=s=>root.querySelector(s), $$=s=>[...root.querySelectorAll(s)], screen=$('.screen');
 screen.classList.add('active');
 const path=$('#lit'),length=path?.getTotalLength(),total=stations.length+5;
 const svgNS='http://www.w3.org/2000/svg';
 if(path)stations.forEach((station,i)=>{
  const p=path.getPointAtLength(length*i/(stations.length-1)),g=document.createElementNS(svgNS,'g');g.setAttribute('transform',`translate(${p.x},${p.y})`);
  g.innerHTML='<circle r="8" fill="var(--ui-paper)" stroke="var(--ui-cyan)" stroke-width="3"/>';
  for(const [text,y,kind] of [[station.id,-32,'code'],[station.name,72,'name'],[station.zh,94,'name']]){
   const label=document.createElementNS(svgNS,'text');label.setAttribute('y',y);label.setAttribute('class',kind);label.setAttribute('text-anchor','middle');label.textContent=text;g.append(label);
  }$('#map-stops').append(g);
 });
 for(const station of stations){
  if($('.mini-route')){const stop=document.createElement('div');stop.className='mini-stop';const label=document.createElement('span');label.textContent=station.id;stop.append(label);$('.mini-route').append(stop);}
  if($('.list')){const row=document.createElement('div');row.className='row';for(const [tag,text] of [['b',station.id],['span',station.name],['i','·']]){const el=document.createElement(tag);el.textContent=text;row.append(el);}$('.list').append(row);}
 }
 if($('.flaps'))for(const c of '00/07'){const flap=document.createElement('div');flap.className='flap';flap.textContent=c;$('.flaps').append(flap);}
 const reduced=matchMedia('(prefers-reduced-motion: reduce)');
 let count=0,target=0,position=0,last=null,time=0,frame=0,stopped=false;
 function draw(){
  if(path){path.style.strokeDasharray=length;path.style.strokeDashoffset=length*(1-position);const p=path.getPointAtLength(length*position);$('#traveller').setAttribute('cx',p.x);$('#traveller').setAttribute('cy',p.y);}
  if($('.scene')){const phase=reduced.matches?0:(time%3)/3,travel=phase<.5?0:((phase-.5)*2)**2;
   $('.sign').style.transform=`translateX(${-travel*800}px)`;$('.sign').style.opacity=1-travel;
   $('.post').style.transform=`translateX(${-phase*1100}px)`;$('.city').style.transform=`translateX(${-(time%40)*2.5}px)`;$('.hills').style.transform=`translateX(${-(time%40)}px)`;
  }
 }
 function tick(now){const dt=last===null?0:Math.min((now-last)/1000,.1);last=now;
  if(!document.hidden){time+=dt;position=reduced.matches?target:position+(target-position)*Math.min(1,dt*6);draw();}
  if(!stopped)frame=requestAnimationFrame(tick);
 }
 function update(completed,detail,stationCount=0){
  if(stopped)return;
  const previousCount=count;count=Math.max(count,Math.min(stations.length,stationCount));target=Math.max(0,(count-1)/(stations.length-1));
  const percent=Math.min(99,Math.round(completed/total*100)),station=stations[Math.min(count,stations.length-1)];
  $('.pct').textContent=percent;$('.percent').setAttribute('aria-valuenow',percent);
  const status=$('.bottom .eyebrow,.ticket-status');status.textContent=detail;status.setAttribute('role','status');
  $$('.station-name').forEach(el=>el.textContent=station.name);$$('.station-zh').forEach(el=>el.textContent=station.zh);
  if(completed<3||completed>3+stations.length){$('.bottom .station-name').textContent=completed<3?'Preparing the corridor':'Finishing setup';$('.bottom .station-zh').textContent='';}
  $$('#map-stops circle').forEach((el,i)=>el.setAttribute('fill',i<count?'var(--ui-cyan)':'var(--ui-paper)'));
  $$('.mini-stop').forEach((el,i)=>el.classList.toggle('done',i<count));
  $$('.row').forEach((el,i)=>{el.classList.toggle('current',i===count);el.querySelector('i').textContent=i<count?'✓':i===count?'←':'·';});
  const flap=$$('.flap')[1];if(flap){flap.textContent=count;if(!reduced.matches&&count!==previousCount)flap.animate([{transform:'perspective(300px) rotateX(-60deg)'},{transform:'perspective(300px) rotateX(0deg)'}],{duration:220,easing:'ease-out'});}
  if(reduced.matches){position=target;draw();}
 }
 function stop(){stopped=true;cancelAnimationFrame(frame);}
 function setTheme(theme){host.dataset.theme=theme;$('.brand-logo').src=logoBase+theme+'.png';}
 update(0,'Loading the corridor');setTheme(document.body.dataset.uiTheme||'light');draw();frame=requestAnimationFrame(tick);
 return {setTheme,update,
  finish(){stop();$('.pct').textContent='100';$('.percent').setAttribute('aria-valuenow','100');host.setAttribute('aria-busy','false');},
  fail(message){stop();host.setAttribute('aria-busy','false');screen.classList.add('failed');$('h1').textContent='Unable to load the route.';const status=$('.bottom .eyebrow,.ticket-status');status.textContent='Loading stopped';status.setAttribute('role','alert');$('.bottom .station-name').textContent=message||'Please try again.';$('.bottom .station-zh').textContent='';const retry=document.createElement('button');retry.className='retry';retry.textContent='Try again';retry.onclick=()=>location.reload();$('.bottom').append(retry);}
 };
}
