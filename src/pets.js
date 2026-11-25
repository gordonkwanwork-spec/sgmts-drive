import * as T from 'three';
import {clone as cloneSkinned} from 'three/addons/utils/SkeletonUtils.js';
import {contactShadow,rig as personRig} from './street-models.js';
import {makeFocusSampler,poseOn} from './city/life.js';

const BONE_NAMES=['pet_root','pet_body','pet_head','pet_tail','pet_leg_FL','pet_leg_FR','pet_leg_BL','pet_leg_BR'];
const LEASH_SEGS=10,LEASH_HALF=.0075;
const _v=new T.Vector3(),_n=new T.Vector3(),_t=new T.Vector3(),_s=new T.Vector3(),_u=new T.Vector3();
const _hand=new T.Vector3(),_collar=new T.Vector3();
let leashMaterial;

const clamp=(x,a,b)=>Math.max(a,Math.min(b,x));
const smoothstep=(e0,e1,x)=>{const t=clamp((x-e0)/(e1-e0),0,1);return t*t*(3-2*t);};

/** Compute normalized quadruped skin weights for a vertex in normalized pet bounds: x∈[-W/2,W/2], y∈[0,H], z∈[-L/2,L/2] (-Z forward). */
function skinWeights(x,y,z,spec){
 const nx=x/Math.max(.01,spec.width*.5),ny=y/Math.max(.01,spec.height),nz=z/Math.max(.01,spec.length*.5);
 const front=smoothstep(.10,-.14,nz),left=smoothstep(.08,-.08,nx);
 const leg=smoothstep(spec.kind==='rat'?(.54+.04*front):.54,.32,ny);
 const wFL=leg*front*left,wFR=leg*front*(1-left),wBL=leg*(1-front)*left,wBR=leg*(1-front)*(1-left);
 const wHead=(1-leg)*smoothstep(-.28,-.54,nz)*smoothstep(.34,.56,ny);
 const wTail=(1-leg)*smoothstep(.44,.70,nz)*smoothstep(.40,.60,ny);
 const wBody=Math.max(0,1-(wFL+wFR+wBL+wBR+wHead+wTail));
 // Bone order: 0 root, 1 body, 2 head, 3 tail, 4 FL, 5 FR, 6 BL, 7 BR
 const raw=[[1,wBody],[2,wHead],[3,wTail],[4,wFL],[5,wFR],[6,wBL],[7,wBR]].sort((a,b)=>b[1]-a[1]).slice(0,4);
 const sum=raw.reduce((s,e)=>s+e[1],0)||1;
 return {idx:raw.map(e=>e[0]),w:raw.map(e=>e[1]/sum)};
}

function buildSkeleton(spec){
 const W=spec.width,H=spec.height,L=spec.length;
 const root=new T.Bone();root.name='pet_root';
 const body=new T.Bone();body.name='pet_body';body.position.set(0,H*.56,0);root.add(body);
 const head=new T.Bone();head.name='pet_head';head.position.set(0,H*.14,-L*.24);body.add(head);
 const tail=new T.Bone();tail.name='pet_tail';tail.position.set(0,H*.08,L*.28);body.add(tail);
 const legFL=new T.Bone();legFL.name='pet_leg_FL';legFL.position.set(-W*.26,-H*.12,-L*.22);body.add(legFL);
 const legFR=new T.Bone();legFR.name='pet_leg_FR';legFR.position.set(W*.26,-H*.12,-L*.22);body.add(legFR);
 const legBL=new T.Bone();legBL.name='pet_leg_BL';legBL.position.set(-W*.26,-H*.12,L*.22);body.add(legBL);
 const legBR=new T.Bone();legBR.name='pet_leg_BR';legBR.position.set(W*.26,-H*.12,L*.22);body.add(legBR);
 const collar=new T.Object3D();collar.name='pet_collar';collar.position.set(0,H*.12,-L*.20);body.add(collar);
 return {root,bones:[root,body,head,tail,legFL,legFR,legBL,legBR]};
}

/** Normalize a Tripo quadruped GLTF into a grounded (-Z forward) skinned model ready for walking and tail animation. */
export function petModel(gltf,spec){
 const src=cloneSkinned(gltf.scene);
 src.rotation.y+=spec.yawOffset??Math.PI;src.updateMatrixWorld(true);
 const head=src.getObjectByName('tripoHead_1'),rootBone=src.getObjectByName('tripoRoot');
 if(head&&rootBone&&spec.yawOffset==null){
  const forward=head.getWorldPosition(new T.Vector3()).sub(rootBone.getWorldPosition(new T.Vector3()));
  src.rotation.y+=Math.atan2(-forward.x,-forward.z);src.updateMatrixWorld(true);
 }
 let bounds=new T.Box3().setFromObject(src),size=bounds.getSize(new T.Vector3());
 if(!head&&spec.yawOffset==null&&size.x>size.z*1.15){src.rotation.y+=Math.PI/2;src.updateMatrixWorld(true);bounds=new T.Box3().setFromObject(src);size=bounds.getSize(new T.Vector3());}
 const centre=bounds.getCenter(new T.Vector3()),fit=new T.Group();
 src.position.sub(new T.Vector3(centre.x,bounds.min.y,centre.z));
 fit.add(src);fit.scale.set(spec.width/(size.x||1),spec.height/(size.y||1),spec.length/(size.z||1));
 fit.updateMatrixWorld(true);

 const group=new T.Group();group.name=spec.name||spec.id;
 group.userData={pet:spec.kind,petId:spec.id,height:spec.height,spec};
 // Preserve Tripo skinning and its authored clip instead of rebuilding skin weights.
 if(gltf.animations?.length){
  group.add(fit);
  src.traverse(n=>{if(n.isMesh){n.castShadow=true;n.receiveShadow=true;}});
  const clips=gltf.animations.map(c=>c.clone());
  const rootBone=src.getObjectByName('tripoRoot')||src.getObjectByName('tripo::Root')||src.getObjectByName('mixamorigHips');
  for(const clip of clips)for(const track of clip.tracks)if(rootBone&&track.name===rootBone.name+'.position'){
   for(let i=0;i<track.values.length;i+=3){track.values[i]=rootBone.position.x;track.values[i+2]=rootBone.position.z;}
  }
  group.userData.petClips=clips;
  const collar=new T.Object3D();collar.name='pet_collar';collar.position.set(0,spec.height*.68,-spec.length*.25);group.add(collar);
  contactShadow(group,spec.kind==='dog'?.28:.20);return group;
 }
 const {root,bones}=buildSkeleton(spec),skeleton=new T.Skeleton(bones);
 group.add(root);group.updateMatrixWorld(true);

 fit.traverse(n=>{
  if(!n.isMesh)return;
  const geo=n.geometry.clone(),pos=geo.attributes.position,norm=geo.attributes.normal;
  const m=n.matrixWorld,nMat=new T.Matrix3().getNormalMatrix(m);
  const si=new Uint16Array(pos.count*4),sw=new Float32Array(pos.count*4);
  for(let i=0;i<pos.count;i++){
   _v.fromBufferAttribute(pos,i).applyMatrix4(m);pos.setXYZ(i,_v.x,_v.y,_v.z);
   if(norm){_n.fromBufferAttribute(norm,i).applyMatrix3(nMat).normalize();norm.setXYZ(i,_n.x,_n.y,_n.z);}
   const {idx,w}=skinWeights(_v.x,_v.y,_v.z,spec);
   si[i*4]=idx[0];si[i*4+1]=idx[1];si[i*4+2]=idx[2];si[i*4+3]=idx[3];
   sw[i*4]=w[0];sw[i*4+1]=w[1];sw[i*4+2]=w[2];sw[i*4+3]=w[3];
  }
  geo.setAttribute('skinIndex',new T.Uint16BufferAttribute(si,4));
  geo.setAttribute('skinWeight',new T.Float32BufferAttribute(sw,4));
  geo.computeBoundingBox();geo.computeBoundingSphere();
  const skinned=new T.SkinnedMesh(geo,n.material);skinned.castShadow=true;skinned.receiveShadow=true;
  group.add(skinned);skinned.bind(skeleton);
 });
 contactShadow(group,spec.kind==='dog'?.28:spec.kind==='rat'?.18:.20);
 return group;
}

export function clonePet(template){
 const g=cloneSkinned(template);
 g.userData={...template.userData};
 return g;
}

export async function loadTripoPets(loader,url,specs){
 const sources=await Promise.all(specs.map(s=>loader.loadAsync(url(s.file))));
 return new Map(specs.map((s,i)=>[s.id,petModel(sources[i],s)]));
}

export function petRig(group){
 if(group.userData.petRig!==undefined)return group.userData.petRig;
 const get=n=>group.getObjectByName(n);
 const body=get('pet_body');if(!body)return group.userData.petRig=null;
 return group.userData.petRig={
  body,bodyBaseY:body.position.y,head:get('pet_head'),tail:get('pet_tail'),collar:get('pet_collar'),
  legFL:get('pet_leg_FL'),legFR:get('pet_leg_FR'),legBL:get('pet_leg_BL'),legBR:get('pet_leg_BR'),
 };
}

/** Animate diagonal quadruped walk, body bob, head curiosity and tail wag/sway. */
export function posePet(group,distance,dt=1/60,minStep=1/240){
 const pool=group.userData.pool??={d:0,t:0};pool.d+=distance;pool.t+=dt;if(pool.t<minStep)return;
 distance=pool.d;dt=pool.t;pool.d=pool.t=0;
 if(group.userData.petClips){
  const u=group.userData;
  if(!u.petAnimation){const mixer=new T.AnimationMixer(group),actions=Object.fromEntries(u.petClips.map(c=>[c.name.split(':').at(-1).toLowerCase(),mixer.clipAction(c)]));u.petAnimation={mixer,actions,action:null};}
  const speed=distance/Math.max(dt,1e-4),baseSpeed=u.spec.kind==='dog'?1.05:.80;
  const anim=u.petAnimation,next=speed>1.8&&anim.actions.run?anim.actions.run:anim.actions.walk;
  if(next!==anim.action){anim.action?.fadeOut(.15);next.reset().fadeIn(.15).play();anim.action=next;}
  anim.action.setEffectiveTimeScale(speed<.02?0:Math.max(.15,Math.min(3,speed/(next===anim.actions.run?2.5:baseSpeed))));
  u.petAnimation.mixer.update(dt);return;
 }
 const r=petRig(group);if(!r)return;
 const u=group.userData,spec=u.spec||{height:.45,length:.6},stride=Math.max(.25,spec.length*.9);
 u.walkPhase=(u.walkPhase||0)+distance/stride*Math.PI*2;
 const speed=distance/Math.max(dt,1e-4),wantGait=distance>1e-4?clamp(speed/(u.pet==='dog'?1.05:.80),.6,1.45):0;
 u.gait=(u.gait??0)+(wantGait-(u.gait??0))*Math.min(1,dt*10);
 const t=performance.now()/1000,seed=(u.seed??=Math.random()*20);
 const swing=(u.pet==='cat'?.42:u.pet==='rat'?.55:.48)*u.gait,sA=Math.sin(u.walkPhase)*swing,sB=Math.sin(u.walkPhase+Math.PI)*swing;
 if(r.legFL)r.legFL.rotation.x=sA;if(r.legBR)r.legBR.rotation.x=sA*.9;
 if(r.legFR)r.legFR.rotation.x=sB;if(r.legBL)r.legBL.rotation.x=sB*.9;
 r.body.position.y=r.bodyBaseY+Math.abs(Math.cos(u.walkPhase))*(u.pet==='rat'?.016:.025)*spec.height*u.gait+Math.sin(t*2.2+seed)*.005;
 r.body.rotation.x=Math.sin(u.walkPhase*2)*.04*u.gait;
 if(r.tail){
  if(u.pet==='dog'){r.tail.rotation.y=Math.sin(t*(u.gait>.2?9+2*u.gait:4.5)+seed)*(u.gait>.2?.45:.25);r.tail.rotation.x=.08*u.gait;}
  else if(u.pet==='rat'){r.tail.rotation.y=Math.sin(t*(u.gait>.2?10+2*u.gait:3.5)+seed)*.28;r.tail.rotation.x=-.08;}
  else{r.tail.rotation.y=Math.sin(t*2.2+seed)*.22;r.tail.rotation.z=Math.cos(t*1.7+seed)*.14;}
 }
 if(r.head){r.head.rotation.y=Math.sin(t*.9+seed*2)*(.14+.16*(1-u.gait));r.head.rotation.x=Math.sin(t*1.4+seed)*.05;}
}

/** 3D crossed-ribbon catenary leash so it stays visible from every camera angle. */
export function createLeash(){
 leashMaterial??=new T.MeshStandardMaterial({color:0x2b1d16,roughness:.72,side:T.DoubleSide});
 const pos=new Float32Array((LEASH_SEGS+1)*4*3),idx=[];
 for(let i=0;i<LEASH_SEGS;i++){const a=i*4,b=(i+1)*4;idx.push(a,a+1,b+1,a,b+1,b,a+2,a+3,b+3,a+2,b+3,b+2);}
 const geo=new T.BufferGeometry();geo.setAttribute('position',new T.BufferAttribute(pos,3));geo.setIndex(idx);
 const mesh=new T.Mesh(geo,leashMaterial);mesh.name='dog-leash';mesh.frustumCulled=false;
 mesh.userData.points=Array.from({length:LEASH_SEGS+1},()=>new T.Vector3());
 return mesh;
}

function updateLeashMesh(leash,start,end){
 const span=start.distanceTo(end),sag=Math.max(.03,(1.35-Math.min(1.3,span))*.16),pts=leash.userData.points;
 for(let i=0;i<=LEASH_SEGS;i++){const u=i/LEASH_SEGS;pts[i].lerpVectors(start,end,u);pts[i].y-=sag*4*u*(1-u);}
 const pos=leash.geometry.attributes.position;
 for(let i=0;i<=LEASH_SEGS;i++){
  const p=pts[i],a=pts[Math.max(0,i-1)],b=pts[Math.min(LEASH_SEGS,i+1)];
  _t.subVectors(b,a);if(_t.lengthSq()<1e-8)_t.set(0,-1,0);else _t.normalize();
  _s.set(_t.z,0,-_t.x);if(_s.lengthSq()<1e-6)_s.set(1,0,0);_s.normalize().multiplyScalar(LEASH_HALF);
  _u.crossVectors(_s,_t).normalize().multiplyScalar(LEASH_HALF);
  pos.setXYZ(i*4,p.x-_s.x,p.y-_s.y,p.z-_s.z);pos.setXYZ(i*4+1,p.x+_s.x,p.y+_s.y,p.z+_s.z);
  pos.setXYZ(i*4+2,p.x-_u.x,p.y-_u.y,p.z-_u.z);pos.setXYZ(i*4+3,p.x+_u.x,p.y+_u.y,p.z+_u.z);
 }
 pos.needsUpdate=true;leash.geometry.computeBoundingSphere();
}

/** Keep a leashed dog walking alongside/behind its master and update the 3D leash between hand and collar. */
export function updateDogFollower(dog,masterGroup,dt,groundY=null,minStep=1/240){
 if(!masterGroup?.visible){dog.group.visible=false;dog.leash.visible=false;dog.init=false;return;}
 const myaw=masterGroup.rotation.y,fx=-Math.sin(myaw),fz=-Math.cos(myaw),rx=Math.cos(myaw),rz=-Math.sin(myaw);
 const mx=masterGroup.position.x,mz=masterGroup.position.z,side=dog.side??1;
 const t=performance.now()/1000,sniff=Math.sin(t*1.6+(dog.seed||0))*.07;
 // Follow slightly behind and beside the master's walking line on the kerb/inner footway.
 const tx=mx-fx*.72+rx*(side*.34+sniff),tz=mz-fz*.72+rz*(side*.34+sniff);
 const px=dog.x??tx,pz=dog.z??tz,snap=!dog.init||Math.hypot(mx-px,mz-pz)>6;
 if(snap){dog.x=tx;dog.z=tz;dog.yaw=myaw;dog.init=true;}
 else{
  const k=Math.min(1,dt*5.5);dog.x=px+(tx-px)*k;dog.z=pz+(tz-pz)*k;
  const dx=dog.x-mx,dz=dog.z-mz,d=Math.hypot(dx,dz)||1;
  if(d>1.25){dog.x=mx+dx/d*1.25;dog.z=mz+dz/d*1.25;}else if(d<.42){dog.x=mx+dx/d*.42;dog.z=mz+dz/d*.42;}
 }
 const moved=snap?0:Math.hypot(dog.x-px,dog.z-pz);
 const wantYaw=moved>.002?Math.atan2(-(dog.x-px),-(dog.z-pz)):myaw;
 const dy=Math.atan2(Math.sin(wantYaw-dog.yaw),Math.cos(wantYaw-dog.yaw));
 dog.yaw+=dy*Math.min(1,dt*8);
 let y;
 if(groundY){
  if(snap||dog._gy===undefined||Math.hypot(dog.x-dog._gx,dog.z-dog._gz)>.35){dog._gy=groundY(dog.x,dog.z);dog._gx=dog.x;dog._gz=dog.z;}
  y=dog._gy;
 }else y=masterGroup.position.y;
 dog.group.position.set(dog.x,y+.01,dog.z);dog.group.rotation.y=dog.yaw;dog.group.visible=true;
 posePet(dog.group,moved,dt,minStep);
 const handBone=personRig(masterGroup)?.bones[side<0?'hand_L':'hand_R']?.bone;
 if(handBone){handBone.updateWorldMatrix(true,false);handBone.getWorldPosition(_hand);}
 else _hand.set(mx+rx*side*.26-fx*.05,masterGroup.position.y+.88,mz+rz*side*.26-fz*.05);
 if(dog._collar===undefined)dog._collar=dog.group.getObjectByName('pet_collar')||null;
 if(dog._collar){dog._collar.updateWorldMatrix(true,false);dog._collar.getWorldPosition(_collar);}
 else _collar.set(dog.x,y+(dog.group.userData.height||.45)*.68,dog.z);
 updateLeashMesh(dog.leash,_hand,_collar);dog.leash.visible=true;
}

/** Independent cats strolling city footways, pausing to look around and recycling near the camera. */
export function createCats(paths,{count=15,seed=29}={}){
 let rs=seed>>>0;const rnd=()=>{rs=Math.imul(rs^rs>>>15,2246822507)+0x9e3779b9>>>0;return (rs>>>8)/16777216;};
 const nearPaths=makeFocusSampler(paths,135),cats=Array.from({length:count},(_,id)=>({id,path:null,speed:.65+rnd()*.65,pauseIn:3+rnd()*6}));
 const pose=(p,s)=>poseOn(p.pts,s);
 function spawn(c,env){const {pool,total}=nearPaths(env);if(!total)return false;for(let tries=0;tries<30;tries++){let t=rnd()*total,p=pool[0];for(const q of pool){if((t-=q.len)<0){p=q;break;}}const s=1+rnd()*(p.len-2),q=pose(p,s);
   if(env?.focus){const d=Math.hypot(q.x-env.focus.x,q.z-env.focus.z);if(d<(env.near??20)||d>(env.far??135))continue;
    if(env.view&&d<85){const dx=q.x-env.view.x,dz=q.z-env.view.z;if((dx*env.view.fx+dz*env.view.fz)/(d||1)>.6)continue;}}
   if(cats.some(o=>o.path&&Math.hypot(o.x-q.x,o.z-q.z)<2.5))continue;Object.assign(c,{path:p,s,dir:rnd()<.5?1:-1,wait:0,moved:0},q);return true;}return false;}
 function step(dt,env={}){for(const c of cats){if(!c.path){spawn(c,env);continue;}c.moved=0;
   if(c.wait>0)c.wait-=dt;else{const d=c.speed*dt;c.s+=c.dir*d;c.moved=d;c.pauseIn-=dt;
    if(c.s<=.5||c.s>=c.path.len-.5){c.s=Math.max(.5,Math.min(c.path.len-.5,c.s));c.dir=-c.dir;c.wait=1.5+rnd()*3;c.speed=rnd()<.35?1.05+rnd()*.30:.65+rnd()*.45;}
    else if(c.pauseIn<=0){c.pauseIn=6+rnd()*10;c.wait=1.5+rnd()*2.5;c.speed=rnd()<.35?1.05+rnd()*.30:.65+rnd()*.45;}}
   const q=pose(c.path,c.s);c.x=q.x;c.y=q.y;c.z=q.z;c.tx=q.tx*c.dir;c.tz=q.tz*c.dir;
   if(env.focus&&Math.hypot(c.x-env.focus.x,c.z-env.focus.z)>(env.far??135)+40){const old={...c};if(!spawn(c,env))Object.assign(c,old);}}}
 return {cats,step};
}
