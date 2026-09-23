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
export async function addStationAdverts(root,st,platforms,url,anisotropy,elevation){
  const palette=await Promise.all(Array.from({length:7},(_,i)=>{
    const source=url.replace(/A[1-7]\.png/,'A'+(i+1)+'.png');
    if(!materials.has(source))materials.set(source,new T.TextureLoader().loadAsync(source).then(map=>{map.colorSpace=T.SRGBColorSpace;map.anisotropy=anisotropy;return new T.MeshBasicMaterial({map,toneMapped:false});}));
    return materials.get(source);
  }));
  const posters=new T.Mesh(stationAdvertGeometry(st,platforms,elevation),palette);
  posters.name=`Station adverts ${st.id}`;root.add(posters);
}
