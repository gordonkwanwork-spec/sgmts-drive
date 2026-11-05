// People are solid: pedestrians shoulder each other apart, step aside for the walking player, stumble when run into, and say so.
// Their routes are absolute positions rewritten every frame, so the push is a smoothed offset added after the route update
// (and removed first if the route did not rewrite the position, e.g. while paused) — routes never fight it or accumulate it.
export const BODY=.34,PLAYER_BODY=.36,MAX_OFFSET=1,RUN_SPEED=4.2;

// bodies: [{x,z,r,fixed}] → per-body push vectors that undo overlaps. Fixed bodies never move; others share by weight.
export function separate(bodies){
 const out=bodies.map(()=>({x:0,z:0})),contacts=[];
 for(let i=0;i<bodies.length;i++)for(let j=i+1;j<bodies.length;j++){
  const a=bodies[i],b=bodies[j];if(a.fixed&&b.fixed)continue;
  let dx=a.x-b.x,dz=a.z-b.z;const reach=a.r+b.r,d2=dx*dx+dz*dz;if(d2>=reach*reach)continue;
  const d=Math.sqrt(d2);if(d<1e-4){dx=1;dz=0;}else{dx/=d;dz/=d;}
  const depth=reach-d,wa=a.fixed?0:b.fixed?1:a.heavy?0:b.heavy?1:.5;
  out[i].x+=dx*depth*wa;out[i].z+=dz*depth*wa;out[j].x-=dx*depth*(1-wa);out[j].z-=dz*depth*(1-wa);
  contacts.push({i,j,depth,nx:dx,nz:dz});
 }
 return {push:out,contacts};
}

export function createCrowd({people,camera,speak}){
 const memo=new Map(),stateOf=g=>{let s=memo.get(g);if(!s){s={ox:0,oz:0,lx:NaN,lz:NaN,cd:0,stumble:0,sx:0,sz:0};memo.set(g,s);}return s;};
 let list=[];
 return {
  // Circles for the walking player's collision (walkStep): everyone near the player, at their current (offset) position.
  circles(x,z,range=6){const out=[];for(const p of people())if(p.group.visible&&Math.hypot(p.group.position.x-x,p.group.position.z-z)<range)out.push({x:p.group.position.x,z:p.group.position.z,radius:p.r??BODY});return out;},
  // player: {x,z,speed} when walking on foot, else null. Call after every route has moved this frame.
  update(dt,player=null){
   const cam=camera.position;
   list=people().filter(p=>p.group.visible&&Math.hypot(p.group.position.x-cam.x,p.group.position.z-cam.z)<70);
   const bodies=list.map(p=>{const g=p.group,s=stateOf(g),moved=g.position.x!==s.lx||g.position.z!==s.lz;
    s.bx=moved?g.position.x:g.position.x-s.ox;s.bz=moved?g.position.z:g.position.z-s.oz;s.cd-=dt;return {x:s.bx,z:s.bz,r:p.r??BODY,fixed:!!p.fixed};});
   if(player)bodies.push({x:player.x,z:player.z,r:PLAYER_BODY,heavy:true});
   const {push,contacts}=separate(bodies),target=new Array(list.length).fill(0).map(()=>({x:0,z:0}));
   for(let i=0;i<list.length;i++){target[i].x=push[i].x;target[i].z=push[i].z;}
   for(const c of contacts){
    const a=list[c.i],b=list[c.j];
    if(!b){// ped ↔ player
     const s=stateOf(a.group);if(s.cd>0||player.speed<.8||c.depth<.05)continue;
     s.cd=3;if(player.speed>RUN_SPEED&&!a.fixed){s.stumble=1.1;s.sx=-c.nx;s.sz=-c.nz;speak(a.group,Math.random()<.5?'watch':'whoa');}
     else if(Math.random()<.6)speak(a.group,['hey','hey','watch','crowded'][Math.floor(Math.random()*4)]);
     continue;}
    if(c.depth<.12)continue;
    for(const p of [a,b]){const s=stateOf(p.group);if(s.cd>0||p.fixed)continue;s.cd=4+Math.random()*3;if(Math.random()<.35)speak(p.group,['sorry','hey','crowded'][Math.floor(Math.random()*3)]);break;}
   }
   const k=Math.min(1,dt*10);
   list.forEach((p,i)=>{const g=p.group,s=stateOf(g);
    if(s.stumble>0){s.stumble=Math.max(0,s.stumble-dt);const u=1-s.stumble/1.1;target[i].x+=s.sx*.9*Math.sin(Math.PI*Math.min(1,u*1.6));target[i].z+=s.sz*.9*Math.sin(Math.PI*Math.min(1,u*1.6));
     const model=g.children[0];if(model)model.rotation.x=Math.sin(Math.PI*u)*.5;if(s.stumble===0&&model)model.rotation.x=0;}
    s.ox+=(target[i].x-s.ox)*k;s.oz+=(target[i].z-s.oz)*k;
    const m=Math.hypot(s.ox,s.oz);if(m>MAX_OFFSET){s.ox*=MAX_OFFSET/m;s.oz*=MAX_OFFSET/m;}
    g.position.x=s.bx+s.ox;g.position.z=s.bz+s.oz;s.lx=g.position.x;s.lz=g.position.z;});
  }};
}
