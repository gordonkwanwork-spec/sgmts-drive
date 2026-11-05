// Speech bubbles over people's heads: bilingual (Cantonese + English) lines on billboard sprites.
// Pop in with a spring, rise a little, fade out; size grows with distance so they stay legible. A small pool, one canvas texture per distinct line.
import * as T from 'three';

// key → [中文, English]
export const LINES={
 hey:['喂！','Hey!'],watch:['睇路啦！','Watch it!'],crowded:['好迫呀！','It’s crowded!'],whoa:['嘩！','Whoa!'],sorry:['唔好意思！','Sorry!'],
 eaten:['食咗飯未呀？','Eaten yet?'],hot:['好熱呀～','So hot~'],really:['真係咩？','For real?'],wait:['等我一陣','Wait for me'],go:['行啦行啦','Let’s go'],
 rain:['落雨喇！','It’s raining!'],late:['要遲到喇！','I’m going to be late!'],tram:['架車嚟喇！','The tram’s coming!'],honk:['嘟乜嘢嘟！','Stop honking!'],
 night:['夜喇，早啲返屋企','Getting late, let’s head home'],nice:['今日天氣幾好','Lovely day'],
};
// Context-aware pick: weather and time shape what people say; a tram at the platform draws a remark.
export function pickLine({condition='morning',tramNear=false,standing=false},rnd=Math.random){
 const pick=a=>a[Math.floor(rnd()*a.length)];
 if(tramNear&&rnd()<.5)return 'tram';
 if(condition==='rain')return rnd()<.6?'rain':pick(['go','wait']);
 if(condition==='night')return rnd()<.5?'night':pick(['really','go','wait']);
 if(condition==='sunset')return rnd()<.4?'hot':pick(['eaten','really','nice']);
 return rnd()<.3?'late':pick(['eaten','really','go','wait',...(standing?[]:['hot'])]);
}

const POOL=8,DEFAULT_LIFE=2.6,MAX_DISTANCE=45;
const FONT="'PingFang HK','Noto Sans TC','Microsoft JhengHei',system-ui,sans-serif";

// Wrap on spaces (or between CJK characters) so a long reply stays a readable bubble.
function wrap(x,text,max){
 const out=[];let line='';
 for(const token of text.match(/[\u3000-\u9fff\uff00-\uffef]|[^\s\u3000-\u9fff\uff00-\uffef]+\s*|\s+/g)||[]){
  if(line&&x.measureText(line+token).width>max){out.push(line.trimEnd());line=token.trimStart();}else line+=token;}
 if(line)out.push(line.trimEnd());return out;
}
function drawBubble([zh,en]){
 const s=2,padX=22*s,padY=14*s,zhPx=(zh?30:24)*s,enPx=17*s,tail=14*s,max=330*s,c=document.createElement('canvas'),x=c.getContext('2d');
 const main=zh||en,sub=zh?en:'';
 x.font=`800 ${zhPx}px ${FONT}`;const mainLines=wrap(x,main,max);x.font=`600 ${enPx}px ${FONT}`;const subLines=sub?wrap(x,sub,max):[];
 const measure=(lines,font)=>{x.font=font;return Math.max(0,...lines.map(l=>x.measureText(l).width));};
 const w=Math.ceil(Math.max(measure(mainLines,`800 ${zhPx}px ${FONT}`),measure(subLines,`600 ${enPx}px ${FONT}`))+padX*2),
  mainH=mainLines.length*zhPx*1.12,subH=subLines.length*enPx*1.25,h=Math.ceil(padY*2+mainH+subH);c.width=w;c.height=h+tail;
 x.fillStyle='#fffdf6';x.strokeStyle='#14181c';x.lineWidth=2.5*s;x.beginPath();x.roundRect(x.lineWidth,x.lineWidth,w-2*x.lineWidth,h-2*x.lineWidth,16*s);
 x.moveTo(w/2-9*s,h-x.lineWidth);x.lineTo(w/2,h+tail-2);x.lineTo(w/2+9*s,h-x.lineWidth);x.fill();x.stroke();
 x.fillStyle='#fffdf6';x.fillRect(w/2-8*s,h-x.lineWidth*1.4,16*s,x.lineWidth*2.2);// hide the seam where the tail joins the body
 x.textAlign='center';x.textBaseline='alphabetic';x.fillStyle='#14181c';x.font=`800 ${zhPx}px ${FONT}`;
 mainLines.forEach((l,i)=>x.fillText(l,w/2,padY+zhPx*(.9+i*1.12)));
 x.fillStyle='#5b6670';x.font=`600 ${enPx}px ${FONT}`;subLines.forEach((l,i)=>x.fillText(l,w/2,padY+mainH+enPx*(.95+i*1.25)));
 const map=new T.CanvasTexture(c);map.colorSpace=T.SRGBColorSpace;map.anisotropy=4;return {map,aspect:c.width/c.height};
}

export function createBubbles(scene,camera){
 const cache=new Map(),slots=[],texture=line=>{const k=line.join('|');if(!cache.has(k))cache.set(k,drawBubble(line));return cache.get(k);};
 for(let i=0;i<POOL;i++){const sprite=new T.Sprite(new T.SpriteMaterial({transparent:true,depthWrite:false,fog:false,toneMapped:false}));sprite.center.set(.5,0);sprite.visible=false;sprite.renderOrder=20;sprite.name='speech bubble';scene.add(sprite);slots.push({sprite,group:null,t:0,life:0,height:1.75,line:null});}
 const head=g=>(g.userData.height??1.75)*(g.userData.action?.sit!==undefined?.72:1)+.22;
 return {
  get slots(){return slots;},
  get live(){return slots.filter(s=>s.life>0).length;},
  // line: a LINES key or a custom [中文, English] pair. Returns false when the speaker is too far to bother.
  say(group,line,life=DEFAULT_LIFE){
   const text=Array.isArray(line)?line:LINES[line];if(!text)return false;
   if(group.position.distanceTo?.(camera.position)>MAX_DISTANCE)return false;
   let slot=slots.find(s=>s.group===group&&s.life>0)||slots.find(s=>s.life<=0)||slots.reduce((a,b)=>b.t>a.t?b:a);
   const {map,aspect}=texture(text);slot.sprite.material.map=map;slot.sprite.material.needsUpdate=true;
   Object.assign(slot,{group,t:0,life,aspect,height:group.userData.height??1.75});return true;},
  update(dt){
   for(const s of slots){
    if(s.life<=0){s.sprite.visible=false;continue;}
    s.t+=dt;if(s.t>=s.life||!s.group.visible){s.life=0;s.group=null;s.sprite.visible=false;continue;}
    const p=s.group.position,d=p.distanceTo(camera.position),pop=s.t<.18?.6+.4*(1+2.70158*((s.t/.18)-1)**3+1.70158*((s.t/.18)-1)**2):1,fade=Math.min(1,(s.life-s.t)/.35),h=Math.max(.62,d*.048)*pop;
    s.sprite.position.set(p.x,p.y+head(s.group)+Math.min(.15,s.t*.12),p.z);s.sprite.scale.set(h*s.aspect,h,1);
    s.sprite.material.opacity=fade;s.sprite.visible=d<MAX_DISTANCE;}
  }};
}
