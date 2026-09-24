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
    map.colorSpace=T.SRGBColorSpace;map.wrapS=T.RepeatWrapping;map.anisotropy=anisotropy;
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
      if(mesh.name!=='Wheel fairing'&&!['pearl','orange','teal','blue','yellow','sand'].includes(mesh.material?.name))return;
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
          bool tramBody=vTramPosition.y>=0.16 && vTramPosition.y<=1.15 && (abs(vTramPosition.x)>1.17 || abs(vTramPosition.z)>4.85);
          bool tramRoof=vTramPosition.y>=3.13 && vTramPosition.y<=3.51;
          if(tramBody || tramRoof)diffuseColor.rgb=tramColor;
          if(tramBody && abs(normalize(vTramNormal).x)>.5){
            vec2 printUV=vec2(-sign(vTramPosition.x)*vTramPosition.z/5.3+.5,(vTramPosition.y-.22)/.93);
            diffuseColor.rgb=texture2D(tramPrint,printUV).rgb;
          }`);
        shader.fragmentShader=shader.fragmentShader.replace('#include <emissivemap_fragment>',`#include <emissivemap_fragment>
          if(tramBody || tramRoof)totalEmissiveRadiance=vec3(0.0);`);
        shader.fragmentShader=shader.fragmentShader.replace('#include <metalnessmap_fragment>',`#include <metalnessmap_fragment>
          if(tramBody || tramRoof)metalnessFactor=0.0;`);
      };
      material.customProgramCacheKey=()=> 'tram-body-wrap-v1';
    });
  }
}
