import * as T from 'three';

export const TRAM_CAMPAIGNS=[
  {id:'football',color:0xf3d914},
  {id:'finance',color:0xef761d},
  {id:'travel',color:0xf04425},
  {id:'rewards',color:0x2150cc},
];

export const tramCampaign=index=>index%3===2?TRAM_CAMPAIGNS[Math.floor(index/3)%TRAM_CAMPAIGNS.length]:null;

export async function loadTramAdverts(asset,anisotropy){
  return Promise.all(TRAM_CAMPAIGNS.map(async c=>{
    const map=await new T.TextureLoader().loadAsync(asset(`tram-adverts/${c.id}.png`));
    map.colorSpace=T.SRGBColorSpace;map.wrapS=map.wrapT=T.ClampToEdgeWrapping;map.anisotropy=anisotropy;
    return {...c,map};
  }));
}

export function applyTramAdvert(tram,campaign){
  if(!campaign)return;
  tram.advert=campaign.id;
  for(const section of tram.sections){
    section.updateWorldMatrix(true,true);
    const inverse=section.matrixWorld.clone().invert();
    section.traverse(mesh=>{
      // Only exterior painted meshes and lower door panels; never glazing, cabins, lights or running gear.
      if(!mesh.isMesh||!(mesh.parent===section||/_door_(left|right)_[01]$/.test(mesh.parent.name)))return;
      // Window frames and glazing carry the print too, like a perforated bus wrap; glass keeps its transparency.
      if(!/^(body_white|body_orange|body_black|glass$|livery_)/.test(mesh.material?.name))return;
      const glass=mesh.material.name==='glass';
      const material=mesh.material.clone(),transform=inverse.clone().multiply(mesh.matrixWorld);
      mesh.material=material;mesh.userData.tramAdvert=campaign.id;
      material.onBeforeCompile=shader=>{
        shader.uniforms.tramPrint={value:campaign.map};
        shader.uniforms.tramColor={value:new T.Color(campaign.color)};
        // Rest-pose coordinates attach printing to sliding doors and articulated sections.
        shader.uniforms.tramTransform={value:transform};
        shader.vertexShader='uniform mat4 tramTransform; varying vec3 vTramPosition; varying vec3 vTramNormal;\n'+shader.vertexShader;
        shader.vertexShader=shader.vertexShader.replace('#include <begin_vertex>',`#include <begin_vertex>
          vTramPosition=(tramTransform*vec4(transformed,1.0)).xyz;
          vTramNormal=mat3(tramTransform)*normal;`);
        shader.fragmentShader='uniform sampler2D tramPrint; uniform vec3 tramColor; varying vec3 vTramPosition; varying vec3 vTramNormal;\n'+shader.fragmentShader;
        shader.fragmentShader=shader.fragmentShader.replace('#include <map_fragment>',`#include <map_fragment>
          // One print per car side at the artwork's own 3:1 aspect: 2.9 m tall (sill to roof line) × 8.7 m, centred.
          bool side=abs(normalize(vTramNormal).x)>.5 && abs(vTramPosition.x)>1.05;
          bool tramBody=vTramPosition.y>=0.16 && (side ? vTramPosition.y<=3.1 : vTramPosition.y<=1.15 && abs(vTramPosition.z)>4.85);
          bool tramRoof=vTramPosition.y>=3.13 && vTramPosition.y<=3.51;
          if((tramBody || tramRoof) && !GLASS)diffuseColor.rgb=tramColor;
          if(tramBody && side){
            vec2 printUV=vec2(-sign(vTramPosition.x)*vTramPosition.z/8.7+.5,(vTramPosition.y-.2)/2.9);
            if(printUV.x>=0.0 && printUV.x<=1.0 && printUV.y>=0.0 && printUV.y<=1.0){
              vec3 print=texture2D(tramPrint,printUV).rgb;
              diffuseColor.rgb=GLASS ? mix(diffuseColor.rgb,print,.55) : print;
              if(GLASS)diffuseColor.a=max(diffuseColor.a,.62);
            }
          }`).replace(/GLASS/g,glass?'true':'false');
        shader.fragmentShader=shader.fragmentShader.replace('#include <emissivemap_fragment>',`#include <emissivemap_fragment>
          if(tramBody || tramRoof)totalEmissiveRadiance=vec3(0.0);`);
        shader.fragmentShader=shader.fragmentShader.replace('#include <metalnessmap_fragment>',`#include <metalnessmap_fragment>
          if(tramBody || tramRoof)metalnessFactor=0.0;`);
      };
      material.customProgramCacheKey=()=> 'tram-body-wrap-v2'+(glass?'-glass':'');
    });
  }
}
