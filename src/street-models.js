import * as T from 'three';

// Two rigid leg segments keep knees bent and feet attached to the pedals.
export function cyclingPose(phase,side){
 const a=phase+(side===1?0:Math.PI),hip=new T.Vector3(side*.14,1.075,.20),foot=new T.Vector3(side*.14,.38+Math.cos(a)*.17,-Math.sin(a)*.17);
 const delta=foot.clone().sub(hip),distance=delta.length(),along=(.45**2-.46**2+distance**2)/(2*distance),bend=Math.sqrt(Math.max(0,.45**2-along**2));
 const knee=hip.clone().addScaledVector(delta,along/distance).add(new T.Vector3(0,-delta.z,delta.y).multiplyScalar(bend/distance));
 return {hip,knee,foot};
}
const up=new T.Vector3(0,1,0);
export function poseCyclist(c,dt){
 c.phase=(c.phase||0)+c.v*dt/.34*.45;
 const rider=c.group.getObjectByName('seated_rider'),r=rider&&rig(rider);
 if(r){
  const pose=zero();pose.spine[0]=-.25;pose.chest[0]=-.4;pose.neck[0]=.3;pose.head[0]=.15;apply(r,pose);c.group.updateMatrixWorld(true);
  const world=p=>c.group.localToWorld(p.clone());
  for(const side of [-1,1]){
   const n=side===1?'R':'L',a=c.phase+(side===1?0:Math.PI),pedal=new T.Vector3(side*.14,.38+Math.cos(a)*.17,-Math.sin(a)*.17);
   fitLimb(r,'thigh_'+n,'shin_'+n,'foot_'+n,world(pedal.clone().add(new T.Vector3(0,.085,.04))),world(new T.Vector3(0,0,-1)).sub(world(new T.Vector3())));
   fitLimb(r,'upperarm_'+n,'forearm_'+n,'hand_'+n,world(new T.Vector3(side*.25,1.105,-.44)),world(new T.Vector3(side,-1,.2)).sub(world(new T.Vector3())));
   const crank=c.group.getObjectByName('crank_'+side),origin=new T.Vector3(side*.14,.38,0),direction=pedal.clone().sub(origin);crank.position.copy(origin);crank.scale.set(1,direction.length(),1);crank.quaternion.setFromUnitVectors(up,direction.normalize());
   c.group.getObjectByName('pedal_'+side).position.copy(pedal);
  }
  for(const wheel of c.wheels)wheel.rotation.x-=c.v*dt/.34;
  return;
 }
 for(const side of [-1,1]){const {hip,knee,foot}=cyclingPose(c.phase,side);
  for(const [name,a,b] of [['thigh',hip,knee],['shin',knee,foot],['crank',new T.Vector3(side*.14,.38,0),foot]]){const part=c.group.getObjectByName(name+'_'+side),direction=b.clone().sub(a);part.position.copy(a);part.scale.set(1,direction.length(),1);part.quaternion.setFromUnitVectors(up,direction.normalize());}
  c.group.getObjectByName('pedal_'+side).position.copy(foot);
 }
 for(const wheel of c.wheels)wheel.rotation.x-=c.v*dt/.34;
}

// Two-bone IK keeps the continuous rider mesh attached to grips and rotating pedals.
function fitLimb(r,upper,lower,end,target,bendHint){
 const a=r.bones[upper].bone,b=r.bones[lower].bone,e=r.bones[end].bone;
 const origin=a.getWorldPosition(new T.Vector3()),joint=b.getWorldPosition(new T.Vector3()),tip=e.getWorldPosition(new T.Vector3()),endRotation=e.getWorldQuaternion(new T.Quaternion());
 const l1=origin.distanceTo(joint),l2=joint.distanceTo(tip),delta=target.clone().sub(origin),distance=Math.max(.001,Math.min(l1+l2-.0001,delta.length())),axis=delta.normalize();
 const along=(l1*l1-l2*l2+distance*distance)/(2*distance),bend=bendHint.clone().addScaledVector(axis,-bendHint.dot(axis)).normalize();
 const knee=origin.clone().addScaledVector(axis,along).addScaledVector(bend,Math.sqrt(Math.max(0,l1*l1-along*along)));
 const aim=(bone,child,to)=>{const start=bone.getWorldPosition(new T.Vector3()),from=child.getWorldPosition(new T.Vector3()).sub(start).normalize(),direction=to.clone().sub(start).normalize(),q=new T.Quaternion().setFromUnitVectors(from,direction).multiply(bone.getWorldQuaternion(new T.Quaternion()));bone.quaternion.copy(bone.parent.getWorldQuaternion(new T.Quaternion()).invert().multiply(q));bone.updateWorldMatrix(false,true);};
 aim(a,b,knee);aim(b,e,target);e.quaternion.copy(e.parent.getWorldQuaternion(new T.Quaternion()).invert().multiply(endRotation));e.updateWorldMatrix(false,true);
}

export const PEDESTRIAN_COUNT=12;
// Use the shaded base colour, including the face atlas and vertex colours, for lamp fill.
export function characterLighting(group){
 const glow={value:0};
 group.traverse(n=>{if(!n.isMesh)return;
  const prepare=source=>{const material=source.clone();if(!material.emissive)return material;
   material.emissive.set(0);
   material.onBeforeCompile=shader=>{
    T.Material.prototype.onBeforeCompile.call(material,shader);
    shader.uniforms.characterGlow=glow;
    shader.fragmentShader='uniform float characterGlow;\n'+shader.fragmentShader.replace('#include <emissivemap_fragment>','#include <emissivemap_fragment>\n totalEmissiveRadiance += diffuseColor.rgb * vec3(1.0, .9, .78) * characterGlow;');
   };
   material.customProgramCacheKey=()=> 'character-lamp-fill-v1';return material;};
  n.material=Array.isArray(n.material)?n.material.map(prepare):prepare(n.material);
 });
 group.userData.characterGlow=glow;return group;
}
// One downloaded pedestrian proof: keep the artist's skeleton and baked clips intact.
export function importedPedestrian(gltf){
 const group=new T.Group(),model=gltf.scene,mixer=new T.AnimationMixer(model),actions={};
 for(const name of ['Idle_Neutral','Walk','Run']){
  const clip=gltf.animations.find(c=>c.name.endsWith('|'+name));
  if(!clip)throw Error('Imported pedestrian is missing '+name);
  actions[name]=mixer.clipAction(clip);
 }
 actions.Idle_Neutral.play();mixer.update(0);model.updateMatrixWorld(true);
 const box=new T.Box3().setFromObject(model),scale=1.75/(box.max.y-box.min.y);
 model.scale.multiplyScalar(scale);model.position.y-=box.min.y*scale;model.rotation.y=Math.PI;
 model.traverse(n=>{if(n.isMesh){n.castShadow=true;n.receiveShadow=true;n.material=n.material.clone();}});
 group.name='Imported NPC · Quaternius Casual Character';group.add(model);
 group.userData.importedNPC={mixer,actions,current:actions.Idle_Neutral};return group;
}
export function gaitAngles(phase,speed,age='adult'){
 const run=Math.min(1,Math.max(0,(speed-2.2)/1.3)),older=age==='older'?.7:1,swing=(.42+.35*run)*older;
 const leg=offset=>{const p=phase+offset,c=Math.cos(p),sn=Math.sin(p);
  // Thigh leads at sin=1 (heel strike); swing is while cos>0, mid-swing knee peak ~60° walking, ~95° running.
  const hip=swing*sn+.05*run,knee=-(.07+(1+.7*run)*older*Math.max(0,c)**1.6+.16*Math.max(0,sn)**6),ankle=.24*Math.max(0,sn)**4-.34*Math.max(0,-sn)**3*Math.max(0,c+.4)+(-hip-knee)*.55*Math.max(0,-c);
  return {hip,knee,ankle,toe:.5*Math.max(0,-sn)**2*Math.max(0,c+.3)};};
 const arm=offset=>{const sn=Math.sin(phase+offset);return {shoulder:-(.28+.45*run)*older*sn,elbow:.22+1.1*run+.18*Math.max(0,-sn)};};
 return {legs:{'1':leg(0),'-1':leg(Math.PI)},arms:{'1':arm(0),'-1':arm(Math.PI)},
  bob:(.022+.05*run)*Math.cos(2*phase)-.012*run,sway:.018*Math.sin(phase)*(1-run),yaw:.07*Math.sin(phase),twist:-.1*Math.sin(phase),lean:-(.035+.2*run)};
}

// Skinned Blender pedestrians (build_people.py): bones P<n>_hips … P<n>_toe_R, rest pose = relaxed standing.
// Every joint turns about a character-frame axis (X right, Y up, Z back) expressed in its parent's rest frame,
// so the gait maths above drive real bones: +X flexes a hip/shoulder/elbow forward, −X flexes a knee.
const X=new T.Vector3(1,0,0),Y=new T.Vector3(0,1,0),Z=new T.Vector3(0,0,1),_q=new T.Quaternion(),_r=new T.Quaternion();
const JOINTS=['hips','spine','chest','neck','head','clavicle_L','clavicle_R','upperarm_L','upperarm_R','forearm_L','forearm_R','hand_L','hand_R','thigh_L','thigh_R','shin_L','shin_R','foot_L','foot_R','toe_L','toe_R'];
export function rig(group){
 if(group.userData.rig!==undefined)return group.userData.rig;
 let mesh=null;group.traverse(n=>{if(!mesh&&n.isSkinnedMesh)mesh=n;});if(!mesh)return group.userData.rig=null;
 group.updateMatrixWorld(true);const inv=group.getWorldQuaternion(new T.Quaternion()).invert(),bones={};
 for(const bone of mesh.skeleton.bones){const name=bone.name.replace(/^P\d+_/,'');if(!JOINTS.includes(name))continue;
  // Parent rest frame relative to the character root, then the character axes in that frame.
  const parent=inv.clone().multiply(bone.parent.getWorldQuaternion(new T.Quaternion())).invert();
  bones[name]={bone,rest:bone.quaternion.clone(),pos:bone.position.clone(),x:X.clone().applyQuaternion(parent),y:Y.clone().applyQuaternion(parent),z:Z.clone().applyQuaternion(parent),
   scale:bone.parent.getWorldScale(new T.Vector3()).y/group.getWorldScale(new T.Vector3()).y};}
 // Hip height above the feet, in the hips' parent units, for sitting and crouching.
 const hipY=new T.Vector3().setFromMatrixPosition(bones.hips.bone.matrixWorld).applyMatrix4(group.matrixWorld.clone().invert()).y;
 return group.userData.rig={mesh,bones,hipY};
}
const zero=()=>Object.fromEntries(JOINTS.map(j=>[j,[0,0,0]]));
function blend(a,b,k){if(k<=0)return a;const out={drop:(a.drop||0)+((b.drop||0)-(a.drop||0))*k,fwd:(a.fwd||0)+((b.fwd||0)-(a.fwd||0))*k,side:(a.side||0)+((b.side||0)-(a.side||0))*k};for(const j of JOINTS){const p=a[j],q=b[j];out[j]=[p[0]+(q[0]-p[0])*k,p[1]+(q[1]-p[1])*k,p[2]+(q[2]-p[2])*k];}return out;}
const sideOf=j=>j.endsWith('_R')?1:-1;
// Standing idle: breathing, a slow weight shift onto one hip, relaxed elbows and an occasional look around.
export function idlePose(t,seed=0,age='adult'){
 const p=zero(),shift=Math.sin(t*.35+seed)*.5+Math.sin(t*.13+seed*2)*.5,breath=Math.sin(t*1.7+seed)*.018,look=Math.sin(t*.21+seed*3)*Math.max(0,Math.sin(t*.07+seed))*.7;
 p.side=shift*.025;p.hips[2]=-shift*.035;p.spine[2]=shift*.03;p.chest[0]=breath-(age==='older'?.12:0);p.neck[0]=age==='older'?.14:0;p.head[1]=look;p.neck[1]=look*.3;
 for(const s of ['L','R']){const k=s==='R'?1:-1,loaded=k*shift>0;p['thigh_'+s]=[loaded?0:.06,0,k*.03];p['shin_'+s][0]=loaded?-.02:-.13;p['foot_'+s][0]=loaded?.02:.07;
  p['upperarm_'+s]=[.04+breath,0,k*.06];p['forearm_'+s][0]=.2+(age==='older'?.2:0);p['hand_'+s][0]=.1;}
 return p;
}
export function walkPose(phase,speed,age='adult'){
 const g=gaitAngles(phase,speed,age),p=zero(),run=Math.min(1,Math.max(0,(speed-2.2)/1.3));
 p.drop=-g.bob;p.side=g.sway;p.hips=[g.lean*.35,g.yaw,0];p.spine=[g.lean*.35,g.twist*.5,0];p.chest=[g.lean*.3-(age==='older'?.1:0),g.twist*.5,0];p.neck=[-g.lean*.5,-g.yaw*.5,0];p.head=[-g.lean*.3,-g.twist*.4,0];
 for(const s of ['L','R']){const k=s==='R'?'1':'-1',L=g.legs[k],A=g.arms[k],side=+k;
  p['thigh_'+s]=[L.hip,0,side*.02];p['shin_'+s][0]=L.knee;p['foot_'+s][0]=L.ankle;p['toe_'+s][0]=-L.toe;
  p['upperarm_'+s]=[A.shoulder,0,side*(.07+.12*run)];p['forearm_'+s][0]=A.elbow;p['hand_'+s][0]=.1+.2*run;p['clavicle_'+s][0]=A.shoulder*.1;}
 return p;
}
// Seated on a bench: thighs level, shins down, hands on thighs. `drop` lowers the pelvis onto the seat.
export function sitPose(hipY,seat=.45,t=0,seed=0){
 const p=zero(),breath=Math.sin(t*1.5+seed)*.015;p.drop=Math.max(0,hipY-seat-.1);p.fwd=-.06;
 p.hips=[-.06,0,0];p.spine=[.08+breath,0,0];p.chest=[.08,0,0];p.head=[Math.sin(t*.2+seed)*.08,Math.sin(t*.15+seed*2)*.5,0];
 for(const s of ['L','R']){const k=s==='R'?1:-1;p['thigh_'+s]=[1.5,0,k*.08];p['shin_'+s][0]=-1.52;p['foot_'+s][0]=.05;p['upperarm_'+s]=[.12,0,k*.1];p['forearm_'+s][0]=1.2;p['hand_'+s][0]=.35;}
 return p;
}
// Sitting on the ground: legs out in front, hands planted behind.
export function groundSitPose(hipY,t=0,seed=0){
 const p=zero();p.drop=Math.max(0,hipY-.12);p.fwd=-.02;p.hips=[-.15,0,0];p.spine=[.08,0,0];p.chest=[.1+Math.sin(t*1.5+seed)*.015,0,0];p.head=[.05,Math.sin(t*.2+seed)*.4,0];
 // Thighs rise ~15° above level (knees up), shins slope back down so the heels rest on the ground.
 for(const s of ['L','R']){const k=s==='R'?1:-1;p['thigh_'+s]=[1.98,0,k*.12];p['shin_'+s][0]=-.62;p['foot_'+s][0]=.1;p['upperarm_'+s]=[-.8,0,k*.22];p['forearm_'+s][0]=.05;p['hand_'+s][0]=-.6;}
 return p;
}
// Airborne tuck (knees up, arms raised for balance) and a landing crouch.
export function jumpPose(air,land){
 const p=zero();p.drop=.18*land;p.chest=[.25*land-.08*air,0,0];p.hips=[.1*land,0,0];p.head=[-.15*land,0,0];
 for(const s of ['L','R']){const k=s==='R'?1:-1;p['thigh_'+s]=[.75*air+.55*land,0,k*.06];p['shin_'+s][0]=-1.15*air-1*land;p['foot_'+s][0]=-.25*air+.45*land;
  p['upperarm_'+s]=[.9*air+.25*land,0,k*(.35*air+.1*land)];p['forearm_'+s][0]=.6*air+.5*land;}
 return p;
}
function apply(r,pose){
 for(const j of JOINTS){const b=r.bones[j];if(!b)continue;const [x,y,z]=pose[j];
  b.bone.quaternion.copy(b.rest);if(x||y||z){_q.setFromAxisAngle(b.x,x);_r.setFromAxisAngle(b.z,z);_q.premultiply(_r);_r.setFromAxisAngle(b.y,y);_q.premultiply(_r);b.bone.quaternion.premultiply(_q);}}
 const h=r.bones.hips;h.bone.position.copy(h.pos).addScaledVector(h.y,-(pose.drop||0)/h.scale).addScaledVector(h.z,-(pose.fwd||0)/h.scale).addScaledVector(h.x,(pose.side||0)/h.scale);
}
/** Pose one pedestrian. `distance` is ground travel this frame; group.userData.action picks sit/jump/wheelchair:
 *  {sit:seatHeight} seats them (blending down over ~0.6 s), {air:true} while airborne, landing crouch after. */
export function posePedestrian(group,distance,dt=1/60){
 const imported=group.userData.importedNPC;
 if(imported){
  const speed=distance/Math.max(dt,1e-4),name=speed<.08?'Idle_Neutral':speed>2.2?'Run':'Walk',next=imported.actions[name];
  if(next!==imported.current){imported.current.fadeOut(.2);next.reset().setEffectiveWeight(1).fadeIn(.2).play();imported.current=next;}
  next.setEffectiveTimeScale(name==='Idle_Neutral'?1:Math.max(.15,Math.min(2,speed/(name==='Run'?3.5:1.4))));
  imported.mixer.update(dt);return;
 }
 const u=group.userData,scale=group.scale.y||1,speed=distance/Math.max(dt,1e-4)/scale,t=performance.now()/1000;
 u.walkPhase=(u.walkPhase||0)+distance/scale/(1.56+Math.max(0,speed-1.4)*.35)*Math.PI*2;
 const target=distance>1e-4?1:0;u.gait=(u.gait??0)+(target-(u.gait??0))*Math.min(1,dt*8);
 u.speed=(u.speed??speed)+(speed-(u.speed??speed))*Math.min(1,dt*6);
 for(const part of group.children)if(part.name.startsWith('chair_wheel')||part.name.startsWith('chair_caster'))part.rotation.x-=distance/(part.name.startsWith('chair_caster')?.09:.31);
 const r=rig(group);if(!r)return;
 const a=u.action||{},seed=(u.seed??=Math.random()*20);
 const sitTarget=u.wheelchair||a.sit!==undefined?1:0;u.sitW=(u.sitW??sitTarget)+(sitTarget-(u.sitW??sitTarget))*Math.min(1,dt*3.5);
 u.air=(u.air??0)+((a.air?1:0)-(u.air??0))*Math.min(1,dt*10);
 if(u.wasAir&&!a.air)u.land=1;u.wasAir=!!a.air;u.land=Math.max(0,(u.land||0)-dt*3.5);
 let pose=blend(idlePose(t,seed,u.age),walkPose(u.walkPhase,u.speed,u.age),u.gait);
 if(u.sitW>.001){const seat=(u.wheelchair?.5:a.sit??.45)/scale;let sit=a.ground?groundSitPose(r.hipY,t,seed):sitPose(r.hipY,seat,t,seed);
  if(u.wheelchair){const push=Math.sin(u.walkPhase*1.4)*u.gait;for(const s of ['L','R']){sit['upperarm_'+s][0]=.1-.35*push;sit['forearm_'+s][0]=.6+.35*(1+push)*.5;sit['upperarm_'+s][2]=(s==='R'?1:-1)*.18;}sit.fwd=0;}
  pose=blend(pose,sit,u.sitW);}
 if(u.air>.001||u.land>.001)pose=blend(pose,jumpPose(1,0),u.air*(1-u.sitW)),pose=blend(pose,jumpPose(0,1),Math.sin(Math.min(1,u.land)*Math.PI)*.8*(1-u.air));
 apply(r,pose);
}

// Baked lamp light per instance (`nightGlow`, 0–1 from pavementLight) switched on at night; non-instanced use reads 0.
export const PLANT_NIGHT={value:0};
export function windMaterial(source,time){
 const material=source.clone();material.side=T.DoubleSide;
 material.onBeforeCompile=shader=>{
  T.Material.prototype.onBeforeCompile.call(material,shader);// shared atmosphere/fog uniforms
  shader.uniforms.windTime=time;shader.uniforms.plantNight=PLANT_NIGHT;
  shader.vertexShader='uniform float windTime;\nattribute float nightGlow;\nvarying float vNightGlow;\n'+shader.vertexShader;
  shader.vertexShader=shader.vertexShader.replace('#include <begin_vertex>',`#include <begin_vertex>
   vNightGlow = nightGlow;
   vec3 root = vec3(0.0);
   #ifdef USE_INSTANCING
    root = instanceMatrix[3].xyz;
   #endif
   float bend = pow(max(position.y, 0.0), 1.4);
   transformed.x += sin(windTime * 1.9 + root.x * .13 + root.z * .09) * bend * .22;
   transformed.z += sin(windTime * 1.25 + root.z * .17) * bend * .13;
  `);
  if(shader.fragmentShader)shader.fragmentShader='uniform float plantNight;\nvarying float vNightGlow;\n'+shader.fragmentShader.replace('#include <emissivemap_fragment>','#include <emissivemap_fragment>\n totalEmissiveRadiance += diffuseColor.rgb * vec3(1.0, .9, .74) * vNightGlow * plantNight * .85;');
 };
 material.customProgramCacheKey=()=> 'verge-wind-v3';
 return material;
}
