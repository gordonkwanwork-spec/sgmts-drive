import * as T from 'three';
import {clone as cloneSkinned} from 'three/addons/utils/SkeletonUtils.js';

// Two rigid leg segments keep knees bent and feet attached to the pedals.
export function cyclingPose(phase,side){
 const a=phase+(side===1?0:Math.PI),hip=new T.Vector3(side*.14,1.075,.20),foot=new T.Vector3(side*.14,.38+Math.cos(a)*.17,-Math.sin(a)*.17);
 const delta=foot.clone().sub(hip),distance=delta.length(),along=(.45**2-.46**2+distance**2)/(2*distance),bend=Math.sqrt(Math.max(0,.45**2-along**2));
 const knee=hip.clone().addScaledVector(delta,along/distance).add(new T.Vector3(0,-delta.z,delta.y).multiplyScalar(bend/distance));
 return {hip,knee,foot};
}
const up=new T.Vector3(0,1,0);
const _cPedal=new T.Vector3(),_cTarget=new T.Vector3(),_cHint=new T.Vector3(),_cOrigin=new T.Vector3(),_cDir=new T.Vector3(),_cZero=new T.Vector3();
const _cHip=new T.Vector3(),_cFoot=new T.Vector3(),_cKnee=new T.Vector3(),_cDelta=new T.Vector3(),_cPerp=new T.Vector3();
const _fO=new T.Vector3(),_fJ=new T.Vector3(),_fT=new T.Vector3(),_fDelta=new T.Vector3(),_fAxis=new T.Vector3(),_fBend=new T.Vector3(),_fKnee=new T.Vector3();
const _fS=new T.Vector3(),_fFrom=new T.Vector3(),_fDir=new T.Vector3(),_fQ=new T.Quaternion(),_fP=new T.Quaternion(),_fPar=new T.Quaternion(),_fEndQ=new T.Quaternion();

function ensureCyclistParts(c){
 if(c._rider&&c._rider.parent!==c.group){c._rider=undefined;c._cranks=undefined;c._pedals=undefined;}
 if(c._cranks)return;
 c._rider=c.group.getObjectByName('seated_rider')||null;
 c._cranks={[-1]:c.group.getObjectByName('crank_-1'),1:c.group.getObjectByName('crank_1')};
 c._pedals={[-1]:c.group.getObjectByName('pedal_-1'),1:c.group.getObjectByName('pedal_1')};
}

export function poseCyclist(c,dt){
 c.phase=(c.phase||0)+c.v*dt/.34*.45;
 ensureCyclistParts(c);
 const rider=c._rider,r=rider&&rig(rider);
 if(r){
  resetPose(_pCyc);_pCyc.spine[0]=-.25;_pCyc.chest[0]=-.4;_pCyc.neck[0]=.3;_pCyc.head[0]=.15;apply(r,_pCyc);c.group.updateMatrixWorld(true);
  c.group.localToWorld(_cZero.set(0,0,0));
  for(const side of [-1,1]){
   const n=side===1?'R':'L',a=c.phase+(side===1?0:Math.PI);
   _cPedal.set(side*.14,.38+Math.cos(a)*.17,-Math.sin(a)*.17);
   c.group.localToWorld(_cTarget.set(_cPedal.x,_cPedal.y+.085,_cPedal.z+.04));
   c.group.localToWorld(_cHint.set(0,0,-1)).sub(_cZero);
   fitLimb(r,'thigh_'+n,'shin_'+n,'foot_'+n,_cTarget,_cHint);
   c.group.localToWorld(_cTarget.set(side*.25,1.105,-.44));
   c.group.localToWorld(_cHint.set(side,-1,.2)).sub(_cZero);
   fitLimb(r,'upperarm_'+n,'forearm_'+n,'hand_'+n,_cTarget,_cHint);
   const crank=c._cranks[side];
   _cOrigin.set(side*.14,.38,0);
   _cDir.subVectors(_cPedal,_cOrigin);
   crank.position.copy(_cOrigin);crank.scale.set(1,_cDir.length(),1);crank.quaternion.setFromUnitVectors(up,_cDir.normalize());
   c._pedals[side].position.copy(_cPedal);
  }
  for(const wheel of c.wheels)wheel.rotation.x-=c.v*dt/.34;
  return;
 }
 for(const side of [-1,1]){
  const a=c.phase+(side===1?0:Math.PI);
  _cHip.set(side*.14,1.075,.20);
  _cFoot.set(side*.14,.38+Math.cos(a)*.17,-Math.sin(a)*.17);
  _cDelta.subVectors(_cFoot,_cHip);
  const distance=_cDelta.length(),along=(.45**2-.46**2+distance**2)/(2*distance),bend=Math.sqrt(Math.max(0,.45**2-along**2));
  _cKnee.copy(_cHip).addScaledVector(_cDelta,along/distance).addScaledVector(_cPerp.set(0,-_cDelta.z,_cDelta.y),bend/distance);
  for(const [name,pa,pb] of [['thigh',_cHip,_cKnee],['shin',_cKnee,_cFoot],['crank',_cOrigin.set(side*.14,.38,0),_cFoot]]){
   const part=c.group.getObjectByName(name+'_'+side);
   _cDir.subVectors(pb,pa);part.position.copy(pa);part.scale.set(1,_cDir.length(),1);part.quaternion.setFromUnitVectors(up,_cDir.normalize());
  }
  c._pedals[side].position.copy(_cFoot);
 }
 for(const wheel of c.wheels)wheel.rotation.x-=c.v*dt/.34;
}

function aimLimbBone(bone,child,to){
 bone.getWorldPosition(_fS);
 child.getWorldPosition(_fFrom).sub(_fS).normalize();
 _fDir.subVectors(to,_fS).normalize();
 _fQ.setFromUnitVectors(_fFrom,_fDir).multiply(bone.getWorldQuaternion(_fP));
 bone.quaternion.copy(bone.parent.getWorldQuaternion(_fPar).invert().multiply(_fQ));
 bone.updateWorldMatrix(false,true);
}

// Two-bone IK keeps the continuous rider mesh attached to grips and rotating pedals.
function fitLimb(r,upper,lower,end,target,bendHint){
 const a=r.bones[upper].bone,b=r.bones[lower].bone,e=r.bones[end].bone;
 a.getWorldPosition(_fO);b.getWorldPosition(_fJ);e.getWorldPosition(_fT);e.getWorldQuaternion(_fEndQ);
 const l1=_fO.distanceTo(_fJ),l2=_fJ.distanceTo(_fT);
 _fDelta.subVectors(target,_fO);
 const distance=Math.max(.001,Math.min(l1+l2-.0001,_fDelta.length()));
 _fAxis.copy(_fDelta).normalize();
 const along=(l1*l1-l2*l2+distance*distance)/(2*distance);
 _fBend.copy(bendHint).addScaledVector(_fAxis,-bendHint.dot(_fAxis)).normalize();
 _fKnee.copy(_fO).addScaledVector(_fAxis,along).addScaledVector(_fBend,Math.sqrt(Math.max(0,l1*l1-along*along)));
 aimLimbBone(a,b,_fKnee);aimLimbBone(b,e,target);
 e.quaternion.copy(e.parent.getWorldQuaternion(_fPar).invert().multiply(_fEndQ));
 e.updateWorldMatrix(false,true);
}

export const PEDESTRIAN_COUNT=12;
// The sun's shadow is faint under the sky fill (and absent at night), so every person also gets a soft contact disc that keeps them planted.
let discMaterial;const discGeometry=new T.PlaneGeometry(1,1).rotateX(-Math.PI/2);
export function contactShadow(group,radius){
 if(!discMaterial){const N=64,data=new Uint8Array(N*N*4);
  for(let y=0;y<N;y++)for(let x=0;x<N;x++){const a=Math.min(1,Math.max(0,(1-Math.hypot(x+.5-N/2,y+.5-N/2)/(N/2))/.6));data.set([0,0,0,255*a*a*(3-2*a)],(y*N+x)*4);}
  const map=new T.DataTexture(data,N,N);map.magFilter=map.minFilter=T.LinearFilter;map.generateMipmaps=false;map.needsUpdate=true;
  discMaterial=new T.MeshBasicMaterial({map,transparent:true,opacity:.55,depthWrite:false,polygonOffset:true,polygonOffsetFactor:-2,polygonOffsetUnits:-2});}
 const disc=new T.Mesh(discGeometry,discMaterial);disc.name='contact shadow';disc.position.y=.02;disc.scale.setScalar(2*radius);group.add(disc);return group;
}
// Use the shaded base colour, including the face atlas and vertex colours, for lamp fill.
export function characterLighting(group){
 const glow={value:0};
 group.traverse(n=>{if(!n.isMesh||n.name==='contact shadow')return;
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
 group.name='Imported NPC · Quaternius Casual Character';group.add(model);contactShadow(group,.7);
 group.userData.importedNPC={mixer,actions,current:actions.Idle_Neutral};return group;
}
// Tripo Mixamo rigs use the shared distance-locked poses by default. Complete authored motion sets can opt into baked playback.
// The model is normalised to 1.75 m and the group is scaled to `height`, so stride length follows body size.
export function tripoPlayer(gltf,height=1.75,name='Tripo character',baked=false){
 const group=new T.Group(),model=cloneSkinned(gltf.scene);
 model.updateMatrixWorld(true);
 const box=new T.Box3().setFromObject(model),scale=1.75/(box.max.y-box.min.y),bone=n=>model.getObjectByName('mixamorig'+n)||model.getObjectByName('mixamorig:'+n);
 if(!bone('Hips'))throw Error('Tripo character needs its Mixamo humanoid rig');
 // Exports differ in which way the rig faces (the schoolboy's is 90° off): turn the left-hip vector to −X, i.e. face −Z like the other actors.
 const left=bone('LeftUpLeg').getWorldPosition(new T.Vector3()).sub(bone('RightUpLeg').getWorldPosition(new T.Vector3()));
 model.scale.multiplyScalar(scale);model.position.y-=box.min.y*scale;model.rotation.y=Math.round(Math.atan2(-left.z,-left.x)/(Math.PI/2))*Math.PI/2;
 model.traverse(n=>{if(n.isMesh){n.castShadow=true;n.receiveShadow=true;}});
 group.add(model);group.name=name;group.scale.setScalar(height/1.75);group.userData.height=height;contactShadow(group,.7);
 if(baked){
  const r=rig(group),mixer=new T.AnimationMixer(model),actions={};
  for(const source of gltf.animations){const clip=source.clone(),name=clip.name.split('.')[0];if(name==='turn')continue;
   // The game owns position/heading. Tripo's run has a half-metre root offset even in its in-place export.
   for(const track of clip.tracks)if(track.name.endsWith('Hips.position'))for(let i=0;i<track.values.length;i+=3){track.values[i]=bone('Hips').position.x;track.values[i+2]=bone('Hips').position.z;}
   actions[name]=mixer.clipAction(clip);
  }
  for(const name of (baked==='locomotion'?['walk','run']:['idle','walk','run','sit']))if(!actions[name])throw Error('Tripo animation missing '+name);
  group.userData.tripoAnimation={mixer,actions,current:null,hip:r.bones.hips};
 }
 return group;
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
const MIXAMO={Hips:'hips',Spine:'spine',Spine1:'chest',Neck:'neck',Head:'head',Shoulder:'clavicle',Arm:'upperarm',ForeArm:'forearm',Hand:'hand',UpLeg:'thigh',Leg:'shin',Foot:'foot',ToeBase:'toe'};
function jointName(name){const m=/^mixamorig:?(Left|Right)?([A-Za-z]+\d?)$/.exec(name);if(!m)return name.replace(/^P\d+_/,'');const joint=MIXAMO[m[2]];return joint&&(m[1]?joint+'_'+m[1][0]:joint);}
export function rig(group){
 if(group.userData.rig!==undefined)return group.userData.rig;
 let mesh=null;group.traverse(n=>{if(!mesh&&n.isSkinnedMesh)mesh=n;});if(!mesh)return group.userData.rig=null;
 group.updateMatrixWorld(true);const inv=group.getWorldQuaternion(new T.Quaternion()).invert(),bones={};
 for(const bone of mesh.skeleton.bones){const name=jointName(bone.name);if(!JOINTS.includes(name))continue;
  // Parent rest frame relative to the character root, then the character axes in that frame.
  const parent=inv.clone().multiply(bone.parent.getWorldQuaternion(new T.Quaternion())).invert();
  bones[name]={bone,rest:bone.quaternion.clone(),pos:bone.position.clone(),x:X.clone().applyQuaternion(parent),y:Y.clone().applyQuaternion(parent),z:Z.clone().applyQuaternion(parent),
   scale:bone.parent.getWorldScale(new T.Vector3()).y/group.getWorldScale(new T.Vector3()).y};}
 // A-posed Mixamo rigs hold their arms out: rest them hanging at the sides (poses are offsets from rest).
 for(const [side,k] of [['L',-1],['R',1]]){const up=bones['upperarm_'+side],fore=bones['forearm_'+side];
  if(!up||!fore||!/^mixamorig/.test(up.bone.name))continue;
  const a=group.worldToLocal(up.bone.getWorldPosition(new T.Vector3())),b=group.worldToLocal(fore.bone.getWorldPosition(new T.Vector3()));
  up.rest.premultiply(_q.setFromAxisAngle(up.z,Math.atan2(-1,k*.12)-Math.atan2(b.y-a.y,b.x-a.x)));}
 // Hip height above the feet, in the hips' parent units, for sitting and crouching.
 const hipY=new T.Vector3().setFromMatrixPosition(bones.hips.bone.matrixWorld).applyMatrix4(group.matrixWorld.clone().invert()).y;
 return group.userData.rig={mesh,bones,hipY};
}
const zero=()=>{const o={drop:0,fwd:0,side:0};for(const j of JOINTS)o[j]=[0,0,0];return o;};
function resetPose(p){p.drop=0;p.fwd=0;p.side=0;for(const j of JOINTS){const a=p[j];a[0]=a[1]=a[2]=0;}return p;}
const _pCyc=zero(),_pIdle=zero(),_pWalk=zero(),_pSit=zero(),_pJump=zero(),_pPose=zero();
const _gaitBuf={legs:{'1':{hip:0,knee:0,ankle:0,toe:0},'-1':{hip:0,knee:0,ankle:0,toe:0}},arms:{'1':{shoulder:0,elbow:0},'-1':{shoulder:0,elbow:0}},bob:0,sway:0,yaw:0,twist:0,lean:0};
function fillGait(phase,speed,age='adult',out){
 const run=Math.min(1,Math.max(0,(speed-2.2)/1.3)),older=age==='older'?.7:1,swing=(.42+.35*run)*older;
 for(const [key,off] of [['1',0],['-1',Math.PI]]){
  const p=phase+off,c=Math.cos(p),sn=Math.sin(p);
  const hip=swing*sn+.05*run,knee=-(.07+(1+.7*run)*older*Math.max(0,c)**1.6+.16*Math.max(0,sn)**6),ankle=.24*Math.max(0,sn)**4-.34*Math.max(0,-sn)**3*Math.max(0,c+.4)+(-hip-knee)*.55*Math.max(0,-c);
  const leg=out.legs[key];leg.hip=hip;leg.knee=knee;leg.ankle=ankle;leg.toe=.5*Math.max(0,-sn)**2*Math.max(0,c+.3);
  const arm=out.arms[key];arm.shoulder=-(.28+.45*run)*older*sn;arm.elbow=.22+1.1*run+.18*Math.max(0,-sn);
 }
 out.bob=(.022+.05*run)*Math.cos(2*phase)-.012*run;out.sway=.018*Math.sin(phase)*(1-run);out.yaw=.07*Math.sin(phase);out.twist=-.1*Math.sin(phase);out.lean=-(.035+.2*run);
 return out;
}
function blend(a,b,k,out=zero()){if(k<=0)return a;out.drop=(a.drop||0)+((b.drop||0)-(a.drop||0))*k;out.fwd=(a.fwd||0)+((b.fwd||0)-(a.fwd||0))*k;out.side=(a.side||0)+((b.side||0)-(a.side||0))*k;for(const j of JOINTS){const p=a[j],q=b[j],o=out[j];o[0]=p[0]+(q[0]-p[0])*k;o[1]=p[1]+(q[1]-p[1])*k;o[2]=p[2]+(q[2]-p[2])*k;}return out;}
const sideOf=j=>j.endsWith('_R')?1:-1;
// Standing idle: breathing, a slow weight shift onto one hip, relaxed elbows and an occasional look around.
export function idlePose(t,seed=0,age='adult',out=null){
 const p=out?resetPose(out):zero(),shift=Math.sin(t*.35+seed)*.5+Math.sin(t*.13+seed*2)*.5,breath=Math.sin(t*1.7+seed)*.018,look=Math.sin(t*.21+seed*3)*Math.max(0,Math.sin(t*.07+seed))*.7;
 p.side=shift*.025;p.hips[2]=-shift*.035;p.spine[2]=shift*.03;p.chest[0]=breath-(age==='older'?.12:0);p.neck[0]=age==='older'?.14:0;p.head[1]=look;p.neck[1]=look*.3;
 for(const s of ['L','R']){const k=s==='R'?1:-1,loaded=k*shift>0;
  p['thigh_'+s][0]=loaded?0:.06;p['thigh_'+s][2]=k*.03;p['shin_'+s][0]=loaded?-.02:-.13;p['foot_'+s][0]=loaded?.02:.07;
  p['upperarm_'+s][0]=.04+breath;p['upperarm_'+s][2]=k*.06;p['forearm_'+s][0]=.2+(age==='older'?.2:0);p['hand_'+s][0]=.1;}
 return p;
}
export function walkPose(phase,speed,age='adult',out=null){
 const g=out?fillGait(phase,speed,age,_gaitBuf):gaitAngles(phase,speed,age),p=out?resetPose(out):zero(),run=Math.min(1,Math.max(0,(speed-2.2)/1.3));
 p.drop=-g.bob;p.side=g.sway;
 p.hips[0]=g.lean*.35;p.hips[1]=g.yaw;
 p.spine[0]=g.lean*.35;p.spine[1]=g.twist*.5;
 p.chest[0]=g.lean*.3-(age==='older'?.1:0);p.chest[1]=g.twist*.5;
 p.neck[0]=-g.lean*.5;p.neck[1]=-g.yaw*.5;
 p.head[0]=-g.lean*.3;p.head[1]=-g.twist*.4;
 for(const s of ['L','R']){const k=s==='R'?'1':'-1',L=g.legs[k],A=g.arms[k],side=+k;
  p['thigh_'+s][0]=L.hip;p['thigh_'+s][2]=side*.02;p['shin_'+s][0]=L.knee;p['foot_'+s][0]=L.ankle;p['toe_'+s][0]=-L.toe;
  p['upperarm_'+s][0]=A.shoulder;p['upperarm_'+s][2]=side*(.07+.12*run);p['forearm_'+s][0]=A.elbow;p['hand_'+s][0]=.1+.2*run;p['clavicle_'+s][0]=A.shoulder*.1;}
 return p;
}
// Seated on a bench: thighs level, shins down, hands on thighs. `drop` lowers the pelvis onto the seat.
export function sitPose(hipY,seat=.45,t=0,seed=0,out=null){
 const p=out?resetPose(out):zero(),breath=Math.sin(t*1.5+seed)*.015;p.drop=Math.max(0,hipY-seat-.1);p.fwd=-.06;
 p.hips[0]=-.06;p.spine[0]=.08+breath;p.chest[0]=.08;p.head[0]=Math.sin(t*.2+seed)*.08;p.head[1]=Math.sin(t*.15+seed*2)*.5;
 for(const s of ['L','R']){const k=s==='R'?1:-1;p['thigh_'+s][0]=1.5;p['thigh_'+s][2]=k*.08;p['shin_'+s][0]=-1.52;p['foot_'+s][0]=.05;p['upperarm_'+s][0]=.12;p['upperarm_'+s][2]=k*.1;p['forearm_'+s][0]=1.2;p['hand_'+s][0]=.35;}
 return p;
}
// Sitting on the ground: legs out in front, hands planted behind.
export function groundSitPose(hipY,t=0,seed=0,out=null){
 const p=out?resetPose(out):zero();p.drop=Math.max(0,hipY-.18);p.fwd=-.02;p.hips[0]=-.15;p.spine[0]=.08;p.chest[0]=.1+Math.sin(t*1.5+seed)*.015;p.head[0]=.05;p.head[1]=Math.sin(t*.2+seed)*.4;
 // Thighs rise ~15° above level (knees up), shins slope back down so the heels rest on the ground.
 for(const s of ['L','R']){const k=s==='R'?1:-1;p['thigh_'+s][0]=1.98;p['thigh_'+s][2]=k*.12;p['shin_'+s][0]=-.62;p['foot_'+s][0]=.1;p['upperarm_'+s][0]=-.8;p['upperarm_'+s][2]=k*.22;p['forearm_'+s][0]=.05;p['hand_'+s][0]=-.6;}
 return p;
}
// Airborne tuck (knees up, arms raised for balance) and a landing crouch.
export function jumpPose(air,land,out=null){
 const p=out?resetPose(out):zero();p.drop=.18*land;p.chest[0]=.25*land-.08*air;p.hips[0]=.1*land;p.head[0]=-.15*land;
 for(const s of ['L','R']){const k=s==='R'?1:-1;p['thigh_'+s][0]=.75*air+.55*land;p['thigh_'+s][2]=k*.06;p['shin_'+s][0]=-1.15*air-1*land;p['foot_'+s][0]=-.25*air+.45*land;
  p['upperarm_'+s][0]=.9*air+.25*land;p['upperarm_'+s][2]=k*(.35*air+.1*land);p['forearm_'+s][0]=.6*air+.5*land;}
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
 // The frame loop can send microsecond remainder steps; distance/dt is meaningless there (it read as 'stopped' and restarted the walk clip every frame). Pool them.
 const pool=group.userData.pool??={d:0,t:0};pool.d+=distance;pool.t+=dt;if(pool.t<1/240)return;distance=pool.d;dt=pool.t;pool.d=pool.t=0;
 const baked=group.userData.tripoAnimation;
 if(baked){
  const a=group.userData.action||{},speed=distance/dt/group.scale.y;
  if(!a.air&&!a.ground){
   const name=a.sit!==undefined?'sit':speed>2.2?'run':speed>.08?'walk':'idle',next=baked.actions[name];
   if(next){
    if(next!==baked.current){baked.current?.fadeOut(.2);next.reset().setEffectiveWeight(1).fadeIn(.2).play();baked.current=next;}
    next.setEffectiveTimeScale(name==='walk'?Math.max(.2,speed/1.4):name==='run'?Math.max(.2,speed/3.5):1);
    baked.mixer.update(dt);
    if(name==='sit'){const h=baked.hip;h.bone.position.y=(a.sit/group.scale.y+.1-rig(group).hipY)/h.scale+h.pos.y;}
    return;
   }
  }
  if(baked.current){baked.mixer.stopAllAction();baked.current=null;}
 }
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
 let pose=blend(idlePose(t,seed,u.age,_pIdle),walkPose(u.walkPhase,u.speed,u.age,_pWalk),u.gait,_pPose);
 if(u.sitW>.001){const seat=(u.wheelchair?.5:a.sit??.45)/scale;const sit=a.ground?groundSitPose(r.hipY,t,seed,_pSit):sitPose(r.hipY,seat,t,seed,_pSit);
  if(u.wheelchair){const push=Math.sin(u.walkPhase*1.4)*u.gait;for(const s of ['L','R']){sit['upperarm_'+s][0]=.1-.35*push;sit['forearm_'+s][0]=.6+.35*(1+push)*.5;sit['upperarm_'+s][2]=(s==='R'?1:-1)*.18;}sit.fwd=0;}
  pose=blend(pose,sit,u.sitW,_pPose);}
 if(u.air>.001)pose=blend(pose,jumpPose(1,0,_pJump),u.air*(1-u.sitW),_pPose);
 if(u.land>.001)pose=blend(pose,jumpPose(0,1,_pJump),Math.sin(Math.min(1,u.land)*Math.PI)*.8*(1-u.air),_pPose);
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
  if(shader.fragmentShader)shader.fragmentShader='uniform float plantNight;\nvarying float vNightGlow;\n'+shader.fragmentShader.replace('#include <emissivemap_fragment>','#include <emissivemap_fragment>\n totalEmissiveRadiance += diffuseColor.rgb * (vec3(1.0, .9, .74) * vNightGlow * .85 + vec3(.56, .68, .88) * .12 * (1. - vNightGlow * .5)) * plantNight;');
 };
 material.customProgramCacheKey=()=> 'verge-wind-v3';
 return material;
}

// One-time posed rider bake: no skeletons or AnimationMixers in traffic instances.
export function staticMotorRider(gltf,scooter=false){
 const actor=tripoPlayer(gltf,1.70,'Motorcycle rider'),r=rig(actor),pose=sitPose(r.hipY,scooter?.76:.79);
 actor.getObjectByName('contact shadow')?.removeFromParent();pose.spine[0]=scooter?-.04:-.17;pose.chest[0]=scooter?-.05:-.20;apply(r,pose);actor.updateMatrixWorld(true);
 const hip=r.bones.hips.bone.getWorldPosition(new T.Vector3());actor.position.z+=.08-hip.z;actor.updateMatrixWorld(true);
 for(const side of [-1,1]){const n=side===1?'R':'L';fitLimb(r,'upperarm_'+n,'forearm_'+n,'hand_'+n,new T.Vector3(side*.30,scooter?1.02:1.02,-.27),new T.Vector3(side,-1,0));fitLimb(r,'thigh_'+n,'shin_'+n,'foot_'+n,new T.Vector3(side*.22,.25,scooter?-.30:.08),new T.Vector3(side,0,-1));}
 actor.updateMatrixWorld(true);actor.traverse(n=>{if(n.isSkinnedMesh)n.skeleton.update();});
 const root=new T.Group();root.name='Baked Tripo rider';root.userData.motorRider=true;const v=new T.Vector3();
 actor.traverse(n=>{if(!n.isMesh)return;const geometry=n.geometry.clone(),p=geometry.attributes.position;for(let i=0;i<p.count;i++){n.getVertexPosition(i,v);v.applyMatrix4(n.matrixWorld);p.setXYZ(i,v.x,v.y,v.z);}geometry.deleteAttribute('skinIndex');geometry.deleteAttribute('skinWeight');geometry.computeVertexNormals();geometry.computeBoundingBox();geometry.computeBoundingSphere();const mesh=new T.Mesh(geometry,n.material);mesh.castShadow=true;root.add(mesh);});
 const head=r.bones.head.bone.getWorldPosition(new T.Vector3()),helmet=new T.Mesh(new T.SphereGeometry(1,12,8),new T.MeshStandardMaterial({color:0x252b32,roughness:.5}));helmet.name='Rider helmet';helmet.position.copy(head).add(new T.Vector3(0,.12,0));helmet.scale.set(.15,.18,.17);root.add(helmet);return root;
}
