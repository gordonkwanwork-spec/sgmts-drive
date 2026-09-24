import * as T from 'three';
import {EffectComposer} from 'three/addons/postprocessing/EffectComposer.js';
import {RenderPass} from 'three/addons/postprocessing/RenderPass.js';
import {UnrealBloomPass} from 'three/addons/postprocessing/UnrealBloomPass.js';
import {Pass,FullScreenQuad} from 'three/addons/postprocessing/Pass.js';

// Atmosphere, sky layers, sky-lit reflections and the cinematic post stack.
// Reference: valley.mengto.here.now — height fog with sun in-scatter, clouds, AO, sun shafts, bloom and a film grade.

// ---- Height fog with aerial perspective, patched into every built-in material ----
export const ATMOS={uSunDir:{value:new T.Vector3(0,1,0)},uSunFog:{value:new T.Color()},uFogFalloff:{value:.03},uFogBase:{value:0}};
T.ShaderChunk.fog_pars_vertex='#ifdef USE_FOG\n varying float vFogDepth;\n varying vec3 vFogWorld;\n#endif';
// World-space ray from the camera: rotate the view-space position back with the transposed view matrix.
T.ShaderChunk.fog_vertex='#ifdef USE_FOG\n vFogDepth = - mvPosition.z;\n vFogWorld = (vec4(mvPosition.xyz, 0.0) * viewMatrix).xyz;\n#endif';
T.ShaderChunk.fog_pars_fragment=`#ifdef USE_FOG
 uniform vec3 fogColor; varying float vFogDepth; varying vec3 vFogWorld;
 uniform vec3 uSunDir; uniform vec3 uSunFog; uniform float uFogFalloff; uniform float uFogBase;
 #ifdef FOG_EXP2
  uniform float fogDensity;
 #else
  uniform float fogNear; uniform float fogFar;
 #endif
#endif`;
T.ShaderChunk.fog_fragment=`#ifdef USE_FOG
 #ifdef FOG_EXP2
  float fogDist = length(vFogWorld); vec3 fogRay = vFogWorld / max(fogDist, 1e-4);
  // Density decays with height above the local ground; integrate along the view ray analytically.
  float fogK = uFogFalloff * fogRay.y * fogDist;
  float fogOptical = fogDensity * fogDist * exp(-uFogFalloff * max(cameraPosition.y - uFogBase, -40.0)) * (abs(fogK) > 1e-4 ? (1.0 - exp(-fogK)) / fogK : 1.0);
  float fogFactor = 1.0 - exp(-fogOptical);
  vec3 fogTint = mix(fogColor, uSunFog, pow(max(dot(fogRay, uSunDir), 0.0), 6.0));
 #else
  float fogFactor = smoothstep(fogNear, fogFar, vFogDepth); vec3 fogTint = fogColor;
 #endif
 gl_FragColor.rgb = mix(gl_FragColor.rgb, fogTint, fogFactor);
#endif`;
// Shared uniform objects: every material sees the same live values. Materials with their own hook call this first.
T.Material.prototype.onBeforeCompile=function atmosphereUniforms(shader){Object.assign(shader.uniforms,ATMOS);};

// ---- Conditions: sun/moon direction, colours and grade ----
const dir=(elevation,azimuth)=>new T.Vector3(Math.cos(elevation)*Math.sin(azimuth),Math.sin(elevation),Math.cos(elevation)*Math.cos(azimuth));
const DEG=Math.PI/180;
export const LOOKS={
 morning:{sun:dir(27*DEG,-122*DEG),sunColor:0xffe6c4,sunI:3.1,hemi:[0xcfe0ea,0x6d7560,.42],env:.85,exposure:.95,fog:0xbfd0d8,sunFog:0xffe2bd,density:.0012,
  cloud:{cover:.42,lit:0xffffff,shade:0x9aa9b8,opacity:.85},bloom:[.16,.55,1.35],shafts:.45,grade:{shadow:[.96,1,1.06],high:[1.04,1,.95],sat:1.06,contrast:1.05},sky:{turbidity:2.6,rayleigh:1.2,mie:.004,g:.82}},
 sunset:{sun:dir(5.5*DEG,-98*DEG),sunColor:0xffb26e,sunI:2.6,hemi:[0xe8c9a7,0x5e5448,.36],env:.75,exposure:1.0,fog:0xd7c1a6,sunFog:0xffb77a,density:.0014,
  cloud:{cover:.5,lit:0xffb27a,shade:0x6d5f70,opacity:.9},bloom:[.24,.6,1.2],shafts:.9,grade:{shadow:[.93,.97,1.08],high:[1.08,1,.9],sat:1.12,contrast:1.08},sky:{turbidity:4.5,rayleigh:2.2,mie:.006,g:.86}},
 rain:{sun:dir(38*DEG,-140*DEG),sunColor:0xc9d3dc,sunI:.9,hemi:[0xaab8bf,0x55605a,.75],env:.65,exposure:1.0,fog:0x8f9ea3,sunFog:0xa4b1b6,density:.0034,
  cloud:{cover:.95,lit:0x9ea8ae,shade:0x4f575d,opacity:1},bloom:[.12,.5,1.3],shafts:0,grade:{shadow:[.97,1,1.04],high:[.98,1,1.02],sat:.82,contrast:1.02},sky:{turbidity:10,rayleigh:.6,mie:.02,g:.7}},
 night:{sun:dir(42*DEG,60*DEG),sunColor:0xa9c3ee,sunI:.12,hemi:[0x3a4c70,0x14171c,.12],env:.22,exposure:1.12,fog:0x0e1826,sunFog:0x1b2638,density:.0016,
  cloud:{cover:.35,lit:0x3d4a63,shade:0x151b27,opacity:.7},bloom:[.62,.55,.72],shafts:0,grade:{shadow:[.94,.98,1.1],high:[1.06,1,.92],sat:1.04,contrast:1.06},sky:{turbidity:2,rayleigh:.4,mie:.004,g:.8}},
};

// ---- Sky layers: drifting cloud deck and a night dome with stars, moon and city glow ----
const domeVertex=`varying vec3 vRay; void main(){ vRay = (modelMatrix * vec4(position,1.0)).xyz - cameraPosition; vec4 p = projectionMatrix * viewMatrix * modelMatrix * vec4(position,1.0); gl_Position = p.xyww; }`;
const NOISE=`float h21(vec2 p){p=fract(p*vec2(233.34,851.73));p+=dot(p,p+23.45);return fract(p.x*p.y);}
 float n2(vec2 p){vec2 i=floor(p),f=fract(p);f=f*f*(3.0-2.0*f);return mix(mix(h21(i),h21(i+vec2(1,0)),f.x),mix(h21(i+vec2(0,1)),h21(i+vec2(1,1)),f.x),f.y);}
 float fbm(vec2 p){float v=0.0,a=.5;for(int i=0;i<5;i++){v+=a*n2(p);p=p*2.03+vec2(1.7,9.2);a*=.5;}return v;}`;
function cloudDome(){
 const m=new T.ShaderMaterial({uniforms:{uTime:{value:0},uCover:{value:.4},uLit:{value:new T.Color()},uShade:{value:new T.Color()},uOpacity:{value:1},uSunDir:ATMOS.uSunDir,uSunCol:{value:new T.Color()},uHorizon:{value:new T.Color()}},
  vertexShader:domeVertex,transparent:true,depthWrite:false,depthTest:true,side:T.BackSide,fog:false,
  fragmentShader:`uniform float uTime,uCover,uOpacity; uniform vec3 uLit,uShade,uSunDir,uSunCol,uHorizon; varying vec3 vRay; ${NOISE}
  void main(){ vec3 rd=normalize(vRay); if(rd.y<0.005) discard;
   // Project onto a deck ~1.2 km up; drift with the wind.
   vec2 p=rd.xz/rd.y*1.2+vec2(uTime*.012,uTime*.004);
   float n=fbm(p*.9), d=smoothstep(1.0-uCover-.12,1.0-uCover+.28,n);
   float thick=fbm(p*.9+vec2(.13,.07)); float light=clamp(.55+(n-thick)*3.0,0.0,1.0);
   float sun=pow(max(dot(rd,uSunDir),0.0),10.0);
   vec3 col=mix(uShade,uLit,light)+uSunCol*sun*(1.0-d*.6)*.8;
   float fade=smoothstep(.005,.14,rd.y); col=mix(uHorizon,col,smoothstep(.0,.3,rd.y));
   gl_FragColor=vec4(col,d*fade*uOpacity); }`});
 const mesh=new T.Mesh(new T.SphereGeometry(1400,48,24),m);mesh.name='Cloud deck';mesh.frustumCulled=false;mesh.renderOrder=-9;return mesh;
}
function nightDome(){
 const m=new T.ShaderMaterial({uniforms:{uMoonDir:ATMOS.uSunDir,uTime:{value:0}},vertexShader:domeVertex,side:T.BackSide,depthWrite:false,fog:false,
  fragmentShader:`uniform vec3 uMoonDir; uniform float uTime; varying vec3 vRay; ${NOISE}
  void main(){ vec3 rd=normalize(vRay); float h=max(rd.y,0.0);
   vec3 col=mix(vec3(.05,.075,.11),vec3(.008,.014,.032),pow(h,.45));
   col+=vec3(.22,.13,.07)*exp(-h*9.0)*.55;                        // sodium/LED city glow on the horizon
   vec2 c=vec2(atan(rd.z,rd.x)*180.0,h*260.0); vec2 id=floor(c); float s=h21(id);
   float star=step(.9965,s)*smoothstep(.5,.0,length(fract(c)-.5))*(.6+.4*sin(uTime*2.0+s*90.0));
   col+=vec3(.9,.93,1.0)*star*smoothstep(.02,.25,h)*1.6;
   float m=dot(rd,uMoonDir); col+=vec3(1.0,.97,.9)*smoothstep(.9994,.9996,m)*2.4+vec3(.35,.42,.6)*pow(max(m,0.0),60.0)*.25;
   gl_FragColor=vec4(col,1.0); }`});
 const mesh=new T.Mesh(new T.SphereGeometry(1500,32,16),m);mesh.name='Night sky';mesh.frustumCulled=false;mesh.renderOrder=-10;return mesh;
}

// ---- Final pass: depth AO, sun shafts, chromatic fringe, ACES + sRGB, split-tone grade, vignette, grain ----
class CinematicPass extends Pass{
 constructor(camera){
  super();this.camera=camera;
  this.material=new T.ShaderMaterial({
   uniforms:{tColor:{value:null},tDepth:{value:null},uRes:{value:new T.Vector2(1,1)},uProj:{value:new T.Matrix4()},uInvProj:{value:new T.Matrix4()},uNear:{value:.1},uFar:{value:1000},
    uSunUV:{value:new T.Vector2()},uSunOn:{value:0},uSunCol:{value:new T.Color()},uShafts:{value:.4},uAO:{value:1},uFrame:{value:0},
    uShadowTint:{value:new T.Vector3(1,1,1)},uHighTint:{value:new T.Vector3(1,1,1)},uSat:{value:1},uContrast:{value:1},uFlash:{value:0}},
   vertexShader:'varying vec2 vUv; void main(){ vUv=uv; gl_Position=vec4(position.xy,0.0,1.0); }',
   fragmentShader:`#include <common>
    // ShaderMaterial already prepends the tone-mapping and colour-space functions.
    uniform sampler2D tColor,tDepth; uniform vec2 uRes,uSunUV; uniform mat4 uProj,uInvProj; uniform float uNear,uFar,uSunOn,uShafts,uAO,uFrame,uSat,uContrast,uFlash; uniform vec3 uSunCol,uShadowTint,uHighTint; varying vec2 vUv;
    vec3 viewPos(vec2 uv){ float d=texture2D(tDepth,uv).x; vec4 p=uInvProj*vec4(uv*2.0-1.0,d*2.0-1.0,1.0); return p.xyz/p.w; }
    float hash(vec2 p){ return fract(sin(dot(p,vec2(12.9898,78.233)))*43758.5453); }
    void main(){
     vec2 fromCentre=vUv-.5; float edge=dot(fromCentre,fromCentre);
     // Subtle lateral chromatic fringe toward the frame edge.
     vec2 ca=fromCentre*edge*.006;
     vec3 col=vec3(texture2D(tColor,vUv+ca).r,texture2D(tColor,vUv).g,texture2D(tColor,vUv-ca).b);
     float depth=texture2D(tDepth,vUv).x;
     // Screen-space ambient occlusion from depth: 12 hemisphere taps, radius 0.55 m, faded out with distance.
     if(uAO>0.0&&depth<1.0){
      vec3 P=viewPos(vUv); vec3 N=normalize(cross(dFdx(P),dFdy(P)));
      float occ=0.0,ang=hash(gl_FragCoord.xy+uFrame)*6.2831;
      for(int i=0;i<12;i++){
       float t=(float(i)+.5)/12.0; float a=ang+float(i)*2.3999; vec3 dir=vec3(cos(a)*sqrt(1.0-t*t*.7),sin(a)*sqrt(1.0-t*t*.7),t*.8+.2);
       vec3 up=abs(N.z)<.9?vec3(0,0,1):vec3(1,0,0); vec3 tx=normalize(cross(up,N)),ty=cross(N,tx);
       vec3 S=P+(tx*dir.x+ty*dir.y+N*dir.z)*.55*mix(.25,1.0,t);
       vec4 q=uProj*vec4(S,1.0); vec2 suv=q.xy/q.w*.5+.5;
       float sceneZ=viewPos(suv).z; float range=smoothstep(0.0,1.0,.55/abs(P.z-sceneZ));
       occ+=step(S.z+.03,sceneZ)*range;
      }
      float ao=1.0-occ/12.0; col*=mix(1.0,ao*ao,uAO*(1.0-smoothstep(40.0,110.0,-P.z)));
     }
     // Sun shafts: march toward the sun through open-sky pixels.
     if(uSunOn>0.0){
      vec2 stepUV=(uSunUV-vUv)/40.0; vec2 uv=vUv+stepUV*hash(gl_FragCoord.xy+uFrame); float light=0.0,w=1.0;
      for(int i=0;i<40;i++){ light+=step(.99999,texture2D(tDepth,uv).x)*w; w*=.965; uv+=stepUV; }
      float fall=1.0-smoothstep(0.0,.75,length((vUv-uSunUV)*vec2(uRes.x/uRes.y,1.0)));
      col+=uSunCol*light/40.0*fall*uShafts*uSunOn;
     }
     col+=uFlash*vec3(.75,.8,1.0);
     gl_FragColor=vec4(col,1.0);
     #include <tonemapping_fragment>
     #include <colorspace_fragment>
     vec3 m=gl_FragColor.rgb; float l=dot(m,vec3(.2126,.7152,.0722));
     m*=mix(uShadowTint,uHighTint,smoothstep(.15,.85,l));
     m=mix(vec3(l),m,uSat); m=clamp((m-.5)*uContrast+.5,0.0,1.0);
     m*=mix(.72,1.0,1.0-smoothstep(.25,.95,length(fromCentre*vec2(1.05,1.3))*1.1));
     m+=(hash(gl_FragCoord.xy+fract(uFrame*.618)*311.0)-.5)*.022*(1.0-l*.6);
     gl_FragColor=vec4(m,1.0);
    }`});
  this.quad=new FullScreenQuad(this.material);
 }
 render(renderer,writeBuffer,readBuffer){
  const u=this.material.uniforms;u.tColor.value=readBuffer.texture;u.tDepth.value=readBuffer.depthTexture;u.uRes.value.set(readBuffer.width,readBuffer.height);
  u.uProj.value.copy(this.camera.projectionMatrix);u.uInvProj.value.copy(this.camera.projectionMatrixInverse);u.uFrame.value++;
  renderer.setRenderTarget(this.renderToScreen?null:writeBuffer);this.quad.render(renderer);
 }
}

export function createAtmosphere({renderer,scene,camera,sky,sun,ambient,quality}){
 const clouds=cloudDome(),night=nightDome();scene.add(clouds,night);
 const cu=clouds.material.uniforms;
 // Reflections and ambient light come from the actual sky, re-baked when the condition changes.
 const pmrem=new T.PMREMGenerator(renderer),envScene=new T.Scene(),ground=new T.Mesh(new T.CircleGeometry(900,32),new T.MeshBasicMaterial({color:0x4a5446,side:T.DoubleSide}));
 ground.rotation.x=-Math.PI/2;ground.position.y=-2;envScene.add(ground);let envTarget=null;
 let composer=null,bloom=null,cinematic=null;
 const size=new T.Vector2();
 function buildPost(){
  renderer.getSize(size);const target=new T.WebGLRenderTarget(size.x,size.y,{type:T.HalfFloatType,samples:4});target.depthTexture=new T.DepthTexture(size.x,size.y);target.depthTexture.type=T.UnsignedIntType;
  composer=new EffectComposer(renderer,target);composer.addPass(new RenderPass(scene,camera));
  bloom=new UnrealBloomPass(new T.Vector2(size.x/2,size.y/2),.2,.55,1.3);composer.addPass(bloom);
  cinematic=new CinematicPass(camera);composer.addPass(cinematic);
 }
 let look=LOOKS.morning,condition='morning',flash=0,nextFlash=12,cinematicOn=quality==='high';
 if(cinematicOn)buildPost();
 const sunScreen=new T.Vector3();
 const api={clouds,night,
  get cinematic(){return cinematicOn;},
  setCinematic(on){cinematicOn=on;if(on&&!composer)buildPost();},
  setCondition(name){
   condition=name;look=LOOKS[name]||LOOKS.morning;const isNight=name==='night';
   ATMOS.uSunDir.value.copy(look.sun);ATMOS.uSunFog.value.set(look.sunFog);
   sky.visible=!isNight;night.visible=isNight;
   const su=sky.material.uniforms;su.sunPosition.value.copy(look.sun);su.turbidity.value=look.sky.turbidity;su.rayleigh.value=look.sky.rayleigh;su.mieCoefficient.value=look.sky.mie;su.mieDirectionalG.value=look.sky.g;
   sun.color.set(look.sunColor);sun.intensity=look.sunI;ambient.color.set(look.hemi[0]);ambient.groundColor.set(look.hemi[1]);ambient.intensity=look.hemi[2];
   scene.fog.color.set(look.fog);scene.fog.density=look.density;scene.background=new T.Color(look.fog);
   renderer.toneMappingExposure=look.exposure;scene.environmentIntensity=look.env;
   cu.uCover.value=look.cloud.cover;cu.uLit.value.set(look.cloud.lit);cu.uShade.value.set(look.cloud.shade);cu.uOpacity.value=look.cloud.opacity;cu.uSunCol.value.set(look.sunColor).multiplyScalar(isNight?.1:.6);cu.uHorizon.value.set(look.fog);
   // Bake the sky (and cloud deck) into the reflection/ambient environment.
   const layers=[isNight?night:sky,clouds],parents=layers.map(o=>o.parent),skyScale=sky.scale.x;sky.scale.setScalar(400);
   ground.material.color.set(isNight?0x07090c:name==='rain'?0x3b4240:0x4f5a48);layers.forEach(o=>{envScene.add(o);o.position.set(0,0,0);});
   envTarget?.dispose();envTarget=pmrem.fromScene(envScene,0,.1,2000);scene.environment=envTarget.texture;
   layers.forEach((o,i)=>parents[i].add(o));sky.scale.setScalar(skyScale);
   if(bloom){[bloom.strength,bloom.radius,bloom.threshold]=look.bloom;}
  },
  update(dt,time,subjectY){
   ATMOS.uFogBase.value=subjectY;clouds.position.copy(camera.position);night.position.copy(camera.position);cu.uTime.value=time;night.material.uniforms.uTime.value=time;
   // Thunderstorm: double-flicker lightning every 15–40 s in the rain, thunder after the light.
   flash=Math.max(0,flash-dt*5);
   if(condition==='rain'){nextFlash-=dt;if(nextFlash<=0){flash=1;nextFlash=15+Math.random()*25;api.onLightning?.(1+Math.random()*2.5);setTimeout(()=>{flash=Math.max(flash,.7);},140);}}
   ambient.intensity=look.hemi[2]+flash*2.5;
   if(!cinematicOn||!composer)return;
   const u=cinematic.material.uniforms,g=look.grade;u.uShadowTint.value.fromArray(g.shadow);u.uHighTint.value.fromArray(g.high);u.uSat.value=g.sat;u.uContrast.value=g.contrast;u.uFlash.value=flash*.35;
   sunScreen.copy(camera.position).addScaledVector(look.sun,500).project(camera);
   const facing=camera.getWorldDirection(new T.Vector3()).dot(look.sun);
   u.uSunUV.value.set(sunScreen.x*.5+.5,sunScreen.y*.5+.5);u.uSunOn.value=look.shafts>0&&sunScreen.z<1?T.MathUtils.smoothstep(facing,.1,.6):0;u.uShafts.value=look.shafts;u.uSunCol.value.set(look.sunColor);
  },
  render(){if(cinematicOn&&composer)composer.render();else renderer.render(scene,camera);},
  setSize(w,h){composer?.setSize(w,h);},
 };
 return api;
}
