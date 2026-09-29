import * as T from 'three';

export const TRAM_CAMPAIGNS=[
  {id:'football',color:0xf3d914},
  {id:'finance',color:0xef761d},
  {id:'travel',color:0xf04425},
  {id:'rewards',color:0x2150cc},
];

export const tramCampaign=index=>index%2===1?TRAM_CAMPAIGNS[Math.floor(index/2)%TRAM_CAMPAIGNS.length]:null;

// Cab ends begin beyond ±2.15 m in the front/rear sections.
export const tramWindowRange=name=>[name==='section_front'?-2.15:-2.85,name==='section_rear'?2.15:2.85];

export async function loadTramAdverts(asset,anisotropy){
  return Promise.all(TRAM_CAMPAIGNS.map(async c=>{
    const map=await new T.TextureLoader().loadAsync(asset(`tram-adverts/${c.id}.webp`));
    map.colorSpace=T.SRGBColorSpace;map.wrapS=map.wrapT=T.ClampToEdgeWrapping;map.anisotropy=anisotropy;
    return {...c,map};
  }));
}

export function applyTramAdvert(tram,campaign){
  if(!campaign)return;
  tram.advert=campaign.id;
  for(const [index,section] of tram.sections.entries()){
    const role=['section_front','section_mid','section_rear'][index],windowRange=tramWindowRange(role);
    section.updateWorldMatrix(true,true);
    const inverse=section.matrixWorld.clone().invert();
    section.traverse(mesh=>{
      // Exterior panels and selected passenger windows only; cabins, lamps and wheels retain their materials.
      if(!mesh.isMesh||!(mesh.parent===section||/_door_(left|right)_[01](_leaf_[ab])?$/.test(mesh.parent.name)))return;
      // The lower half of selected passenger windows carries film; upper panes and cab glazing stay clear.
      if(!/^(body_white|body_orange|body_black|glass$|livery_)/.test(mesh.material?.name))return;
      const glass=mesh.material.name==='glass';
      const material=mesh.material.clone(),transform=inverse.clone().multiply(mesh.matrixWorld);
      mesh.material=material;mesh.userData.tramAdvert=campaign.id;
      material.onBeforeCompile=shader=>{
        shader.uniforms.tramPrint={value:campaign.map};
        shader.uniforms.tramColor={value:new T.Color(campaign.color)};
        shader.uniforms.tramWindowRange={value:new T.Vector2(...windowRange)};
        shader.uniforms.tramHero={value:role==='section_mid'?1:0};
        // Rest-pose coordinates attach printing to sliding doors and articulated sections.
        shader.uniforms.tramTransform={value:transform};
        shader.vertexShader='uniform mat4 tramTransform; varying vec3 vTramPosition; varying vec3 vTramNormal;\n'+shader.vertexShader;
        shader.vertexShader=shader.vertexShader.replace('#include <begin_vertex>',`#include <begin_vertex>
          vTramPosition=(tramTransform*vec4(transformed,1.0)).xyz;
          vTramNormal=mat3(tramTransform)*normal;`);
        shader.fragmentShader='uniform sampler2D tramPrint; uniform vec3 tramColor; uniform vec2 tramWindowRange; uniform float tramHero; varying vec3 vTramPosition; varying vec3 vTramNormal;\n'+shader.fragmentShader;
        shader.fragmentShader=shader.fragmentShader.replace('#include <map_fragment>',`#include <map_fragment>
          // One hero per vehicle side. Solid campaign colour continues around the other sections.
          bool side=abs(normalize(vTramNormal).x)>.5 && abs(vTramPosition.x)>1.05;
          bool windowFilm=side && vTramPosition.y>=1.02 && vTramPosition.y<=2.10 && vTramPosition.z>=tramWindowRange.x && vTramPosition.z<=tramWindowRange.y;
          bool tramBody=vTramPosition.y>=0.16 && (side ? vTramPosition.y<=2.10 : vTramPosition.y<=1.15 && abs(vTramPosition.z)>4.85);
          bool tramRoof=vTramPosition.y>=3.13 && vTramPosition.y<=3.51;
          bool wrap=GLASS ? windowFilm : tramBody || tramRoof;
          if(wrap){
            vec3 ink=tramColor;
            vec2 printUV=vec2(-sign(vTramPosition.x)*vTramPosition.z/5.7+.5,(vTramPosition.y-.2)/1.9);
            if(tramHero>.5 && side && printUV.x>=0.0 && printUV.x<=1.0 && printUV.y>=0.0 && printUV.y<=1.0)ink=texture2D(tramPrint,printUV).rgb;
            diffuseColor.rgb=GLASS ? mix(diffuseColor.rgb,ink,.85) : ink;
            if(GLASS)diffuseColor.a=max(diffuseColor.a,.85);
          }`).replace(/GLASS/g,glass?'true':'false');
        shader.fragmentShader=shader.fragmentShader.replace('#include <emissivemap_fragment>',`#include <emissivemap_fragment>
          if(wrap)totalEmissiveRadiance=vec3(0.0);`);
        shader.fragmentShader=shader.fragmentShader.replace('#include <metalnessmap_fragment>',`#include <metalnessmap_fragment>
          if(wrap)metalnessFactor=0.0;`);
      };
      material.customProgramCacheKey=()=> 'tram-body-wrap-v3'+(glass?'-glass':'');
    });
  }
}
