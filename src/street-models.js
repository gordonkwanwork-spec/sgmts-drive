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
export function posePedestrian(group,distance){
 const wheelchair=group.userData.wheelchair,phase=(group.userData.walkPhase||0)+Math.min(distance,1)*5;
 group.userData.walkPhase=phase;
 const swing=distance>.0001?Math.sin(phase)*.35:0;
 for(const part of group.children){
  const match=part.name.match(/_(arm|leg)_(-?1)$/);
  if(match)part.rotation.x=wheelchair?(match[1]==='arm'?-.25+swing*.4:0):swing*Number(match[2])*(match[1]==='leg'?-1:1);
  if(part.name.startsWith('chair_wheel')||part.name.startsWith('chair_caster'))part.rotation.x-=distance/(part.name.startsWith('chair_caster')?.09:.31);
 }
}

export function windMaterial(source,time){
 const material=source.clone();material.side=T.DoubleSide;
 material.onBeforeCompile=shader=>{
  shader.uniforms.windTime=time;
  shader.vertexShader='uniform float windTime;\n'+shader.vertexShader;
  shader.vertexShader=shader.vertexShader.replace('#include <begin_vertex>',`#include <begin_vertex>
   vec3 root = vec3(0.0);
   #ifdef USE_INSTANCING
    root = instanceMatrix[3].xyz;
   #endif
   float bend = pow(max(position.y, 0.0), 1.4);
   transformed.x += sin(windTime * 1.7 + root.x * .13 + root.z * .09) * bend * .13;
   transformed.z += sin(windTime * 1.1 + root.z * .17) * bend * .07;
  `);
 };
 material.customProgramCacheKey=()=> 'verge-wind-v1';
 return material;
}
