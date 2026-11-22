// A2 plaza fountain: raised granite basin, a 16-jet ring arcing onto a central plinth with a tall plume.
// Water is GPU-animated: every jet droplet, the plume and the splashes are one instanced draw of velocity-aligned
// streaks (ballistic in the vertex shader); the pool is a PBR surface with shader waves, landing ripples, foam and
// Fresnel alpha over a tiled floor with moving caustics. Textures are DataTextures so the build also runs under node.
import * as T from 'three';

const PAVING=.34,G=9.81,WATER=.5,RIM_IN=10.35,RIM_OUT=11,JETS=16,JET_R=8.1,LAND_R=1.95,PLINTH_R=1.45,PLINTH_TOP=.82;
const rand=(s=>()=>(s=(s*16807)%2147483647)/2147483647)(73);

function dataTexture(size,pixel,repeat){const d=new Uint8Array(size*size*4);for(let y=0;y<size;y++)for(let x=0;x<size;x++){const c=pixel(x,y),i=(y*size+x)*4;d[i]=c[0];d[i+1]=c[1];d[i+2]=c[2];d[i+3]=255;}
 const t=new T.DataTexture(d,size,size);t.wrapS=t.wrapT=T.RepeatWrapping;t.repeat.set(...repeat);t.colorSpace=T.SRGBColorSpace;t.magFilter=T.LinearFilter;t.minFilter=T.LinearMipmapLinearFilter;t.generateMipmaps=true;t.anisotropy=8;t.needsUpdate=true;return t;}
// Speckled grey granite (feldspar, quartz and biotite flecks over a mid-grey ground).
const granite=()=>dataTexture(256,()=>{const r=rand(),base=118+rand()*22;const v=r<.06?40+rand()*30:r<.12?190+rand()*40:base;return [v,v*.99,v*.97];},[1,1]);
// 50 mm slate-blue glass mosaic with pale grout.
const mosaic=()=>dataTexture(256,(x,y)=>{const cell=32,gx=x%cell,gy=y%cell;if(gx<2||gy<2)return [150,160,158];const k=((Math.floor(x/cell)*7+Math.floor(y/cell)*13)%5)/5,j=rand()*6;return [34+k*14+j,70+k*16+j,84+k*18+j];},[1,1]);

const GLSL_HASH='float fHash(vec2 p){return fract(sin(dot(p,vec2(127.1,311.7)))*43758.5453);}';

function basin(){const g=new T.Group();
 const stone=new T.MeshStandardMaterial({map:granite(),roughness:.62,metalness:0,color:0xd8d6d0});stone.map.repeat.set(36,2);
 const coping=new T.MeshStandardMaterial({map:stone.map.clone(),roughness:.38,color:0xcfcdc7});coping.map.repeat.set(48,1);
 // Wall: plinth course, battered face and a bull-nosed coping that overhangs both faces.
 const wall=[[RIM_OUT-.02,0],[RIM_OUT,.06],[RIM_OUT-.06,.12],[RIM_OUT-.08,.48],[RIM_IN+.08,.48],[RIM_IN+.08,.12],[RIM_IN,.1]].map(([r,y])=>new T.Vector2(r,y));
 const wm=new T.Mesh(new T.LatheGeometry(wall,160),stone);g.add(wm);
 const cap=[];const cx=(RIM_OUT+RIM_IN)/2,hw=(RIM_OUT-RIM_IN)/2+.07;for(let i=0;i<=14;i++){const a=Math.PI*i/14;cap.push(new T.Vector2(cx+Math.cos(a)*hw,.6+Math.min(.04,Math.sin(a)*.06)-(i===0||i===14?.08:0)));}
 cap.unshift(new T.Vector2(cx+hw,.48));cap.push(new T.Vector2(cx-hw,.48));
 const cm=new T.Mesh(new T.LatheGeometry(cap,200),coping);g.add(cm);
 // Floor and inner wall in mosaic; water sits 0.4 m deep over it.
 const tiles=new T.MeshStandardMaterial({map:mosaic(),roughness:.35,color:0xffffff});tiles.map.repeat.set(10,10);
 const floor=new T.Mesh(new T.CircleGeometry(RIM_IN+.02,96).rotateX(-Math.PI/2),tiles);floor.position.y=.1;g.add(floor);
 // Central plinth: drum of granite with a bronze nozzle crown.
 const plinth=new T.Mesh(new T.LatheGeometry([[0,.1],[PLINTH_R+.1,.1],[PLINTH_R,.2],[PLINTH_R-.05,PLINTH_TOP-.08],[PLINTH_R+.06,PLINTH_TOP-.04],[PLINTH_R+.04,PLINTH_TOP],[.4,PLINTH_TOP+.04],[0,PLINTH_TOP+.04]].map(([r,y])=>new T.Vector2(r,y)),96),coping);g.add(plinth);
 const bronze=new T.MeshStandardMaterial({color:0x7a5a34,metalness:.9,roughness:.32}),steel=new T.MeshStandardMaterial({color:0xb8bcc0,metalness:1,roughness:.22});
 const crown=new T.Mesh(new T.LatheGeometry([[0,PLINTH_TOP],[.42,PLINTH_TOP],[.36,PLINTH_TOP+.1],[.16,PLINTH_TOP+.16],[.09,PLINTH_TOP+.32],[.06,PLINTH_TOP+.34],[0,PLINTH_TOP+.34]].map(([r,y])=>new T.Vector2(r,y)),48),bronze);g.add(crown);
 // Ring nozzles: stainless risers from the floor, just breaking the surface; one instanced draw.
 const risers=new T.InstancedMesh(new T.CylinderGeometry(.045,.08,WATER-.02,16),steel,JETS),m=new T.Matrix4();
 for(let i=0;i<JETS;i++){const a=i*Math.PI*2/JETS;risers.setMatrixAt(i,m.makeTranslation(Math.cos(a)*JET_R,.1+(WATER-.02)/2,Math.sin(a)*JET_R));}
 g.add(risers);
 floor.receiveShadow=plinth.receiveShadow=true;for(const n of [wm,cm,plinth,crown,risers])n.castShadow=n.receiveShadow=true;
 return {g,floor,tiles,stone:[stone,coping]};}

// Moving caustics on the floor (tileable caustic iteration), strongest in daylight, plus underwater uplights at night.
function causticFloor(tiles,uniforms){tiles.onBeforeCompile=s=>{Object.assign(s.uniforms,uniforms);
 s.vertexShader=s.vertexShader.replace('#include <common>','#include <common>\nvarying vec3 vFPos;').replace('#include <begin_vertex>','#include <begin_vertex>\nvFPos=position;');
 s.fragmentShader=s.fragmentShader.replace('#include <common>',`#include <common>
uniform float uTime,uNight;varying vec3 vFPos;
float caustic(vec2 uv,float t){vec2 p=mod(uv*6.28318,6.28318)-250.;vec2 i=p;float c=1.;for(int n=0;n<4;n++){float tt=t*(1.-3.5/float(n+1));i=p+vec2(cos(tt-i.x)+sin(tt+i.y),sin(tt-i.y)+cos(tt+i.x));c+=1./length(vec2(p.x/(sin(i.x+tt)/.005),p.y/(cos(i.y+tt)/.005)));}c/=4.;c=1.17-pow(c,1.4);return pow(abs(c),8.);}`)
 .replace('#include <emissivemap_fragment>',`#include <emissivemap_fragment>
{vec2 q=vFPos.xz;float c=caustic(q*.21,uTime*.55)*.7+caustic(q*.13+3.1,uTime*.4)*.5;totalEmissiveRadiance+=vec3(.55,.8,.85)*c*(1.-uNight)*.55;
 float a=atan(q.y,q.x)*${(JETS/(2*Math.PI)).toFixed(5)},r=length(q),la=abs(fract(a)-.5)*${(2*Math.PI*JET_R/JETS).toFixed(4)};
 float spot=exp(-(pow(r-${(JET_R-.6).toFixed(2)},2.)+la*la)*1.4)+exp(-pow(r-${(PLINTH_R+.5).toFixed(2)},2.)*2.);totalEmissiveRadiance+=vec3(1.,.9,.7)*spot*uNight*(2.+c*1.2);}`);};
 tiles.customProgramCacheKey=()=>'fountain-floor';}

function waterSurface(uniforms){
 const mat=new T.MeshPhysicalMaterial({color:0x1d5a5e,roughness:.04,metalness:0,ior:1.33,transparent:true,depthWrite:false,clearcoat:.0,envMapIntensity:1.25,specularIntensity:1});
 mat.onBeforeCompile=s=>{Object.assign(s.uniforms,uniforms);
  s.vertexShader=s.vertexShader.replace('#include <common>','#include <common>\nvarying vec3 vWPos;').replace('#include <begin_vertex>','#include <begin_vertex>\nvWPos=position;');
  s.fragmentShader=s.fragmentShader.replace('#include <common>',`#include <common>
uniform float uTime,uNight;varying vec3 vWPos;${GLSL_HASH}
// Height field gradient: wind chop, plus decaying rings around each landing point and the plume.
vec2 ring(vec2 d,float k,float w,float amp,float fall,float ph){float r=max(length(d),.001);float a=amp*exp(-r*fall);return d/r*a*k*cos(r*k-uTime*w+ph);}
vec3 waterField(vec2 p){vec2 g=vec2(0.);float foam=0.;
 g+=vec2(.9,.4)*.035*cos(dot(p,vec2(.9,.4))*2.3+uTime*1.7)+vec2(-.3,1.)*.03*cos(dot(p,vec2(-.3,1.))*3.1+uTime*2.1)+vec2(.6,-.8)*.02*cos(dot(p,vec2(.6,-.8))*5.7+uTime*2.9);
 for(int i=0;i<${JETS};i++){float a=float(i)*${(2*Math.PI/JETS).toFixed(6)};vec2 c=vec2(cos(a),sin(a))*${LAND_R.toFixed(3)};vec2 d=p-c;float r=length(d);
  g+=ring(d,9.,7.,.018,1.4,float(i)*1.7);foam+=exp(-r*r*7.);}
 vec2 d0=p;float r0=length(d0);g+=ring(d0,7.,6.,.03,.55,0.);g+=ring(d0,13.,9.,.012,.9,1.3);
 // Outgoing rings from each nozzle where the stream leaves the water.
 for(int i=0;i<${JETS};i++){float a=float(i)*${(2*Math.PI/JETS).toFixed(6)};vec2 d=p-vec2(cos(a),sin(a))*${JET_R.toFixed(3)};g+=ring(d,14.,8.,.008,2.2,float(i));}
 foam+=exp(-pow(max(r0-${PLINTH_R.toFixed(2)},0.)-.55,2.)*3.)*.9;
 float n=fHash(floor(p*14.)+floor(uTime*12.));return vec3(g,foam*(.65+.35*n));}`)
  .replace('#include <normal_fragment_maps>',`#include <normal_fragment_maps>
vec3 wf=waterField(vWPos.xz);normal=normalize(normal+(viewMatrix*vec4(-wf.x,0.,-wf.y,0.)).xyz*.75);float vFoam=clamp(wf.z,0.,1.);`)
  .replace('#include <opaque_fragment>',`float fres=pow(1.-clamp(dot(normal,normalize(vViewPosition)),0.,1.),5.);
outgoingLight=mix(outgoingLight,vec3(.92,.96,.97)*(1.-uNight*.75)+vec3(1.,.93,.8)*uNight*.6,vFoam*.7);
diffuseColor.a=clamp(.34+fres*.5+vFoam*.4,0.,1.);
#include <opaque_fragment>`);};
 mat.customProgramCacheKey=()=>'fountain-water';
 const m=new T.Mesh(new T.CircleGeometry(RIM_IN+.03,128).rotateX(-Math.PI/2),mat);m.position.y=WATER;m.renderOrder=1;m.receiveShadow=true;return m;}

// One instanced quad per droplet streak; origin, launch velocity, divergence and seed per instance.
function jets(uniforms){
 const O=[],V=[],J=[],S=[];
 const add=(o,v,j,life,size,kind,count)=>{for(let k=0;k<count;k++){O.push(...o);V.push(...v(k));J.push(...j(k));S.push(rand(),life,size*(.7+rand()*.6),kind);}};
 const jitter=s=>()=>[(rand()-.5)*s,(rand()-.5)*s*.6,(rand()-.5)*s];
 // Ring jets: rise 5.2 m and land on the water just outside the plinth.
 const vy=Math.sqrt(2*G*5.2),up=vy/G,down=Math.sqrt(2*(5.2+.04)/G),flight=up+down,vh=(JET_R-LAND_R)/flight;
 for(let i=0;i<JETS;i++){const a=i*Math.PI*2/JETS,c=Math.cos(a),s=Math.sin(a),o=[c*JET_R,WATER+.04,s*JET_R];
  add(o,()=>[-c*vh,vy,-s*vh],jitter(.9),flight,.05,0,260);
  // Splash crowns where each arc lands: short hops up and outwards.
  const land=[c*LAND_R,WATER,s*LAND_R];add(land,()=>{const b=rand()*Math.PI*2,h=.6+rand()*1.6;return [Math.cos(b)*h-c*.8,1.2+rand()*2.2,Math.sin(b)*h-s*.8];},()=>[0,0,0],.55,.035,1,70);}
 // Central plume: 7 m column that thickens and opens as it rises, falling back around the plinth.
 const pv=Math.sqrt(2*G*7.2),pflight=(pv+Math.sqrt(pv*pv+2*G*(PLINTH_TOP+.34-WATER)))/G;
 add([0,PLINTH_TOP+.34,0],()=>{const b=rand()*Math.PI*2,h=Math.pow(rand(),1.5)*.75;return [Math.cos(b)*h,pv*(.86+rand()*.14),Math.sin(b)*h];},jitter(.5),pflight,.07,2,1400);
 // Plume fall-back splashes on the plinth crown and the water around it.
 add([0,WATER,0],()=>{const b=rand()*Math.PI*2,r=PLINTH_R+.2+rand()*.9,h=.4+rand();return [Math.cos(b)*(r+h),1.4+rand()*2.4,Math.sin(b)*(r+h)];},()=>[0,0,0],.45,.04,3,500);
 const geo=new T.InstancedBufferGeometry();geo.setAttribute('position',new T.Float32BufferAttribute([-.5,-.5,0,.5,-.5,0,.5,.5,0,-.5,.5,0],3));geo.setIndex([0,1,2,0,2,3]);
 for(const [n,a] of [['aOrigin',O],['aVel',V],['aJit',J]])geo.setAttribute(n,new T.InstancedBufferAttribute(new Float32Array(a),3));
 geo.setAttribute('aSeed',new T.InstancedBufferAttribute(new Float32Array(S),4));geo.instanceCount=S.length/4;geo.boundingSphere=new T.Sphere(new T.Vector3(0,4,0),13);
 const mat=new T.ShaderMaterial({uniforms:T.UniformsUtils.merge([T.UniformsLib.fog,{uLight:{value:1}}]),fog:true,transparent:true,depthWrite:false,blending:T.NormalBlending,
  vertexShader:`#include <common>
#include <fog_pars_vertex>
uniform float uTime;attribute vec3 aOrigin,aVel,aJit;attribute vec4 aSeed;varying vec2 vUv;varying float vA,vKind,vGlint,vH;
void main(){float life=aSeed.y,t=mod(uTime+aSeed.x*life*7.31,life),u=t/life;
 vec3 v=aVel+aJit*u*2.;vec3 p=aOrigin+aVel*t+aJit*t*t+vec3(0.,-.5*${G}*t*t,0.);vec3 vel=v+vec3(0.,-${G}*t,0.);
 vec4 mv=modelViewMatrix*vec4(p,1.);vec3 vv=(modelViewMatrix*vec4(vel,0.)).xyz;vec2 dir=vv.xy;float L=length(dir);dir=L>1e-4?dir/L:vec2(0.,1.);
 float size=aSeed.z*(aSeed.w==2.?1.+u*2.2:1.+u*.8);float len=size+L*(aSeed.w==0.||aSeed.w==2.?.045:.03);
 mv.xy+=dir*position.y*len*2.+vec2(dir.y,-dir.x)*position.x*size*2.;vec4 mvPosition=mv;gl_Position=projectionMatrix*mv;
 vUv=position.xy*2.;vKind=aSeed.w;vH=p.y;
 float fade=smoothstep(0.,.04,u)*(1.-smoothstep(.82,1.,u));vA=(p.y<${WATER.toFixed(2)}-.02?0.:1.)*fade*(aSeed.w==2.?.55-u*.25:aSeed.w==0.?.5:.4);
 vGlint=step(.965,fract(aSeed.x*91.7+floor(uTime*9.+aSeed.x*40.)*.618));
#include <fog_vertex>
}`,
  fragmentShader:`#include <common>
#include <fog_pars_fragment>
uniform float uLight,uNight;varying vec2 vUv;varying float vA,vKind,vGlint,vH;
void main(){float r=length(vUv);if(r>1.)discard;float core=1.-smoothstep(.0,1.,r);float rim=smoothstep(.35,.9,r)*(1.-smoothstep(.9,1.,r));
 vec3 day=mix(vec3(.62,.74,.8),vec3(.97,.99,1.),core)*uLight;vec3 night=vec3(1.,.92,.78)*(.35+core*.9)*smoothstep(9.,.5,vH)*1.2+vec3(.08,.1,.13);
 vec3 col=mix(day,night,uNight)+vGlint*core*vec3(2.2,2.3,2.4)*(1.-uNight*.4);float a=vA*(core*.8+rim*.35)*(1.+vGlint);
 gl_FragColor=vec4(col,clamp(a,0.,1.));
#include <tonemapping_fragment>
#include <colorspace_fragment>
#include <fog_fragment>
}`});
 mat.uniforms.uTime=uniforms.uTime;mat.uniforms.uNight=uniforms.uNight;
 const mesh=new T.Mesh(geo,mat);mesh.renderOrder=2;mesh.name='Fountain water jets';return mesh;}

export function buildFountain(time={value:0}){
 const uniforms={uTime:time,uNight:{value:0}},root=new T.Group(),group=new T.Group();root.name='HSWRL plaza fountain';
 group.position.y=PAVING;root.add(group);// sits on the plaza paving, not the ground under it
 const {g,tiles,stone}=basin();causticFloor(tiles,uniforms);group.add(g);
 const water=waterSurface(uniforms);water.name='Fountain pool water';group.add(water);
 const spray=jets(uniforms);group.add(spray);
 const fullCount=spray.geometry.instanceCount,here=new T.Vector3();
 spray.onBeforeRender=(_r,_s,cam)=>{
  if(!cam.isPerspectiveCamera||cam.userData?.isFeed)return;
  const d=cam.position.distanceTo(root.getWorldPosition(here));
  spray.geometry.instanceCount=d>180?0:d>90?(fullCount>>1):fullCount;
 };
 // Night: uplit water, and a little lamp fill on the granite so the basin does not go black.
 root.userData.setNight=on=>{uniforms.uNight.value=on?1:0;spray.material.uniforms.uLight.value=on?.35:1;for(const m of stone){m.emissive.setHex(0x6a6258);m.emissiveMap=m.map;m.emissiveIntensity=on?.9:0;m.needsUpdate=true;}};
 return root;}
