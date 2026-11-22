import * as T from 'three';

export function lookMarkingMaterial(right){
 const canvas=document.createElement('canvas');canvas.width=1024;canvas.height=512;
 const x=canvas.getContext('2d');
 x.fillStyle='#fff';x.textAlign='center';x.textBaseline='middle';
 x.font='bold 150px Arial, sans-serif';x.fillText(right?'LOOK RIGHT':'LOOK LEFT',right?440:584,140,830);
 x.font='bold 210px "PingFang HK","Heiti TC",sans-serif';x.fillText(right?'望右':'望左',512,370);
 x.translate(right?950:74,140);x.scale(right?1:-1,1);x.beginPath();
 for(const [u,v] of [[-70,-18],[10,-18],[10,-52],[70,0],[10,52],[10,18],[-70,18]])x.lineTo(u,v);
 x.closePath();x.fill();
 const map=new T.CanvasTexture(canvas);map.colorSpace=T.SRGBColorSpace;map.anisotropy=8;
 const material=new T.MeshStandardMaterial({map,transparent:true,alphaTest:.4,roughness:.8,polygonOffset:true,polygonOffsetFactor:-2});
 material.name=right?'LOOK RIGHT marking':'LOOK LEFT marking';
 return material;
}

// Each corner is measured in metres to the reader's right and back toward their feet.
export function lookMarkingMesh(material,corner){
 const vertices=[[-1.3,-.65],[1.3,-.65],[-1.3,.65],[1.3,.65]].flatMap(([u,v])=>corner(u,v));
 const geo=new T.BufferGeometry();
 geo.setAttribute('position',new T.Float32BufferAttribute(vertices,3));
 geo.setAttribute('uv',new T.Float32BufferAttribute([0,1,1,1,0,0,1,0],2));
 geo.setIndex([0,2,1,1,2,3]);geo.computeVertexNormals();
 const mesh=new T.Mesh(geo,material);mesh.name=material.name;mesh.receiveShadow=true;
 return mesh;
}
