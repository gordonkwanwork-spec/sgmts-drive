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
 for(const side of [-1,1]){const {hip,knee,foot}=cyclingPose(c.phase,side);
  for(const [name,a,b] of [['thigh',hip,knee],['shin',knee,foot],['crank',new T.Vector3(side*.14,.38,0),foot]]){const part=c.group.getObjectByName(name+'_'+side),direction=b.clone().sub(a);part.position.copy(a);part.scale.set(1,direction.length(),1);part.quaternion.setFromUnitVectors(up,direction.normalize());}
  c.group.getObjectByName('pedal_'+side).position.copy(foot);
 }
 for(const wheel of c.wheels)wheel.rotation.x-=c.v*dt/.34;
}

export const PEDESTRIAN_COUNT=10;
// Gait cycle for the jointed Blender pedestrians. One phase cycle is two steps; stride grows with speed so the
// feet do not skate. Hip flexion, two-peak knee flexion, heel-strike/toe-off ankle roll, pelvis bob/sway/yaw,
// chest counter-rotation and opposed, elbow-bent arm swing; running adds lean, flight bounce and tucked arms.
function joints(group){
 if(group.userData.joints)return group.userData.joints;
 const find=suffix=>{let hit=null;group.traverse(n=>{if(!hit&&n.name.endsWith(suffix))hit=n;});return hit;},j={body:find('_body'),chest:find('_chest')};
 for(const side of [-1,1])for(const part of ['arm','elbow','leg','knee','ankle'])j[part+side]=find(`_${part}_${side}`);
 j.rest=Object.fromEntries(Object.entries(j).filter(([,n])=>n).map(([k,n])=>[k,{p:n.position.clone(),r:n.rotation.clone()}]));
 return group.userData.joints=j;
}
export function gaitAngles(phase,speed,age='adult'){
 const run=Math.min(1,Math.max(0,(speed-2.4)/1.6)),older=age==='older'?.7:1,swing=(.42+.35*run)*older;
 const leg=offset=>{const p=phase+offset,c=Math.cos(p),sn=Math.sin(p);
  // Thigh leads at sin=1 (heel strike); swing is while cos>0, mid-swing knee peak ~60° walking, ~95° running.
  const hip=swing*sn+.05*run,knee=-(.07+(1+.7*run)*older*Math.max(0,c)**1.6+.16*Math.max(0,sn)**6),ankle=.24*Math.max(0,sn)**4-.34*Math.max(0,-sn)**3*Math.max(0,c+.4)+(-hip-knee)*.55*Math.max(0,-c);
  return {hip,knee,ankle};};
 const arm=offset=>{const sn=Math.sin(phase+offset);return {shoulder:-(.28+.45*run)*older*sn,elbow:.22+.9*run+.18*Math.max(0,-sn)};};
 return {legs:{'1':leg(0),'-1':leg(Math.PI)},arms:{'1':arm(0),'-1':arm(Math.PI)},
  bob:(.022+.05*run)*Math.cos(2*phase)-.012*run,sway:.018*Math.sin(phase)*(1-run),yaw:.07*Math.sin(phase),twist:-.1*Math.sin(phase),lean:-(.035+.2*run)};
}
export function posePedestrian(group,distance,dt=1/60){
 const wheelchair=group.userData.wheelchair,j=joints(group),scale=group.scale.y||1,speed=distance/Math.max(dt,1e-4)/scale;
 // Stride length ~0.78 m per step walking, rising to ~1.3 m running.
 group.userData.walkPhase=(group.userData.walkPhase||0)+distance/scale/(1.56+Math.max(0,speed-1.4)*.35)*Math.PI*2;
 const target=distance>1e-4?1:0;group.userData.gait=(group.userData.gait??0)+(target-(group.userData.gait??0))*Math.min(1,dt*8);
 const k=group.userData.gait,phase=group.userData.walkPhase;
 for(const part of group.children)if(part.name.startsWith('chair_wheel')||part.name.startsWith('chair_caster'))part.rotation.x-=distance/(part.name.startsWith('chair_caster')?.09:.31);
 if(wheelchair){
  // Push strokes: both arms reach forward then drive back along the rims.
  const push=Math.sin(phase*1.4);for(const side of [-1,1]){const a=j['arm'+side],e=j['elbow'+side];if(a)a.rotation.x=j.rest['arm'+side].r.x-.25+k*.45*push;if(e)e.rotation.x=j.rest['elbow'+side].r.x+.5+k*.35*(1-push);}
  return;
 }
 if(!j.body)return;
 const g=gaitAngles(phase,speed,group.userData.age),breath=Math.sin(performance.now()/1000*1.6)*.006*(1-k);
 j.body.position.y=j.rest.body.p.y+g.bob*k;j.body.position.x=j.rest.body.p.x+g.sway*k;j.body.rotation.y=g.yaw*k;
 j.chest.rotation.set(j.rest.chest.r.x+g.lean*k+breath,j.rest.chest.r.y+g.twist*k,j.rest.chest.r.z);
 for(const side of [-1,1]){const L=g.legs[side],A=g.arms[side];
  j['leg'+side].rotation.x=L.hip*k;j['knee'+side].rotation.x=L.knee*k;if(j['ankle'+side])j['ankle'+side].rotation.x=L.ankle*k;
  j['arm'+side].rotation.x=A.shoulder*k;j['elbow'+side].rotation.x=.12+(A.elbow-.12)*k;}
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
