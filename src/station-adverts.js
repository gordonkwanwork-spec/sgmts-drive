import * as T from 'three';

// Match the poster frames baked into build_assets.py, including A1's flared walls.
export function stationAdvertGeometry(st, platforms, elevation) {
  const positions=[],uv=[],indices=[],groups=[];
  for(const p of platforms)for(let bay=0;bay<17;bay++){
    if(bay%4===3)continue;
    for(const dy of [-1.1,1.1]){
      const first=positions.length/3;
      for(const [u,v] of [[0,0],[1,0],[1,1],[0,1]]){
        const along=-39.8+bay*5+dy-p.side*(u-.5)*.76,z=-along+p.offsetZ;
        const x=p.side*(7.05+p.width-.39+(p.bent?Math.max(0,-along-25)*.42:0));
        positions.push(x,1.41+v*1.1+elevation(st.s-z)-elevation(st.s),z);uv.push(u,v);
      }
      groups.push({start:indices.length,material:(first/4+Number(st.id.slice(1))-1)%7});
      indices.push(first,first+1,first+2,first,first+2,first+3);
    }
  }
  const geometry=new T.BufferGeometry();
  geometry.setAttribute('position',new T.Float32BufferAttribute(positions,3));
  geometry.setAttribute('uv',new T.Float32BufferAttribute(uv,2));
  geometry.setIndex(indices);for(const g of groups)geometry.addGroup(g.start,6,g.material);geometry.computeVertexNormals();
  return geometry;
}

const materials=new Map();
export const ROOFTOP_ADVERTS={A2:'洪水橋大學城',A3:'連接中國',A6:'物流空間出租'};

export function stationBillboards(st,platforms,material,elevation){
  const group=new T.Group();group.name=`Station billboards ${st.id}`;
  if(!ROOFTOP_ADVERTS[st.id])return group;
  const frameMaterial=new T.MeshStandardMaterial({color:0xe3e5e4,metalness:.65,roughness:.35});
  const lampMaterial=new T.MeshStandardMaterial({color:0x30383d,roughness:.55});
  const lensMaterial=new T.MeshStandardMaterial({color:0xfff0d4,emissive:0xffedcf,emissiveIntensity:0});
  const faceGeometry=new T.PlaneGeometry(15,5);
  for(const p of platforms){
    const x=p.side*(7.05+p.width*.5),z=p.offsetZ;
    const grade=offset=>elevation(st.s-offset)-elevation(st.s);
    const bottom=4.15+Math.max(...[-7.7,0,7.7].map(d=>grade(z+d)));
    const frame=new T.Mesh(new T.BoxGeometry(.32,5.24,15.24),frameMaterial);
    frame.name='Billboard frame';frame.position.set(x,bottom+2.5,z);frame.castShadow=true;frame.receiveShadow=true;group.add(frame);
    for(const side of [-1,1]){
      // Separate front faces keep lettering readable from both sides, never mirrored.
      const face=new T.Mesh(faceGeometry,material);face.name=`Billboard artwork ${st.id}`;
      face.rotation.y=side*Math.PI/2;face.position.set(x+side*.165,bottom+2.5,z);group.add(face);
      for(const offset of [-3.75,3.75]){
        const arm=new T.Mesh(new T.BoxGeometry(2.8,.1,.1),lampMaterial);
        arm.name='Billboard lamp arm';arm.position.set(x+side*1.4,bottom+5.35,z+offset);group.add(arm);
        // Floodlight fixtures only: the wash on the print is baked into its emissive map at night. Real spotlights
        // here (24 across the stations in view) made every lit pixel on screen evaluate them: 180 → 55 ms at night.
        const housing=new T.Mesh(new T.BoxGeometry(.85,.4,.25),lampMaterial);
        housing.name='Billboard lamp housing';housing.position.set(x+side*2.8,bottom+5.3,z+offset);housing.lookAt(x+side*.17,bottom+2.4,z+offset);group.add(housing);
        const lens=new T.Mesh(new T.PlaneGeometry(.72,.3),lensMaterial);
        lens.name='Billboard lamp lens';lens.position.z=.13;housing.add(lens);
      }
    }
    for(const offset of [-6,0,6]){
      const foot=3.3+grade(z+offset),height=bottom-foot;
      const post=new T.Mesh(new T.BoxGeometry(.22,height,.22),frameMaterial);
      post.name='Billboard roof support';post.position.set(x,foot+height/2,z+offset);post.castShadow=true;group.add(post);
    }
  }
  return group;
}

export function setBillboardLighting(root,night){
  root.traverse(n=>{
    if(n.name==='Billboard lamp lens')n.material.emissiveIntensity=night?1.4:0;
    if(n.name.startsWith('Billboard artwork')){if(n.material.emissiveMap!==n.material.map){n.material.emissiveMap=n.material.map;n.material.needsUpdate=true;}n.material.emissive.set(0xffedcf);n.material.emissiveIntensity=night?.55:0;}
  });
}

export async function addStationAdverts(root,st,platforms,url,anisotropy,elevation){
  const palette=await Promise.all(Array.from({length:7},(_,i)=>{
    const source=url.replace(/A[1-7]\.png/,'A'+(i+1)+'.png');
    if(!materials.has(source))materials.set(source,new T.TextureLoader().loadAsync(source).then(map=>{map.colorSpace=T.SRGBColorSpace;map.anisotropy=anisotropy;return new T.MeshBasicMaterial({map,toneMapped:false});}));
    return materials.get(source);
  }));
  const posters=new T.Mesh(stationAdvertGeometry(st,platforms,elevation),palette);
  posters.name=`Station adverts ${st.id}`;root.add(posters);
  if(ROOFTOP_ADVERTS[st.id]){
    const map=await new T.TextureLoader().loadAsync(url.replace(/A[1-7]\.png/,`billboard-${st.id}.png`));
    map.colorSpace=T.SRGBColorSpace;map.anisotropy=anisotropy;
    root.add(stationBillboards(st,platforms,new T.MeshLambertMaterial({map}),elevation));
  }
}
