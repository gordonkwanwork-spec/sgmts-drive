import * as T from 'three';
const NO_MAPS={roughnessMap:null,metalnessMap:null};
const FINISH={paint:{metalness:.4,roughness:.34,clearcoat:1,clearcoatRoughness:.05},glass:{metalness:.1,roughness:.03,clearcoat:1,clearcoatRoughness:.02},
 trim:{metalness:.5,roughness:.28,clearcoat:.6},rubber:{metalness:0,roughness:.95,...NO_MAPS},rim:{metalness:.85,roughness:.25,...NO_MAPS},tyre:{metalness:0,roughness:.95,...NO_MAPS}};
const PLATE={w:.60,h:.20,front:'#f7f7f2',rear:'#f4c51c',ink:'#111'};
function plateCanvas(text,background){
 const c=document.createElement('canvas');c.width=1040;c.height=222;const x=c.getContext('2d');
 x.fillStyle=background;x.beginPath();x.roundRect(0,0,1040,222,18);x.fill();x.strokeStyle='#222';x.lineWidth=6;x.beginPath();x.roundRect(8,8,1024,206,14);x.stroke();
 x.fillStyle=PLATE.ink;x.font='bold 158px "Arial Narrow","Helvetica Neue Condensed Bold","Roboto Condensed",Arial,sans-serif';x.textAlign='center';x.textBaseline='middle';
 x.fillText(text,520,118,980);return c;
}
function plates(v){
 const out=[];for(const side of ['front','rear']){const tex=new T.CanvasTexture(plateCanvas(v.plate,PLATE[side]));tex.colorSpace=T.SRGBColorSpace;tex.anisotropy=8;
  const m=new T.Mesh(new T.PlaneGeometry(PLATE.w,PLATE.h),new T.MeshPhysicalMaterial({map:tex,roughness:.4,clearcoat:.6,clearcoatRoughness:.15}));
  m.name=`Hong Kong number plate (${side})`;m.position.fromArray(v.plates[side]);m.position.z+=side==='front'?.006:-.006;if(side==='rear')m.rotation.y=Math.PI;m.receiveShadow=true;out.push(m);}
 return out;
}
// Soft contact shadow so the car sits on the road even when the graphics preset has no sun shadows: the vehicle's
// rectangular footprint with blurred edges. Drawn as the canvas shadow of a rectangle placed off-canvas (shadowBlur works everywhere).
function contactShadow(width,length){
 const pad=.35,W=width+2*pad,L=length+2*pad,px=64/W,c=document.createElement('canvas');c.width=64;c.height=Math.round(L*px);const x=c.getContext('2d');
 Object.assign(x,{shadowColor:'rgba(0,0,0,.7)',shadowBlur:.22*px*2,shadowOffsetX:1000});x.fillStyle='#000';
 x.beginPath();x.roundRect(pad*px-1000,pad*px,width*px,length*px,.25*px);x.fill();
 const m=new T.Mesh(new T.PlaneGeometry(W,L).rotateX(-Math.PI/2),new T.MeshBasicMaterial({map:new T.CanvasTexture(c),transparent:true,depthWrite:false,polygonOffset:true,polygonOffsetFactor:-2}));
 m.name='Car contact shadow';m.position.y=.02;m.renderOrder=1;return m;
}
// Tyre/rim split for one wheel mesh: triangles whose corners all lie beyond `rim` × radius from the axle (local X) are rubber.
// Reorders the index into two groups — 0 rim, 1 tyre — so one mesh takes [rimMaterial, tyreMaterial].
function splitWheel(geometry,rim=.7){
 geometry.computeBoundingBox();const b=geometry.boundingBox,cy=(b.min.y+b.max.y)/2,cz=(b.min.z+b.max.z)/2,R=Math.max(b.max.y-b.min.y,b.max.z-b.min.z)/2;
 const pos=geometry.attributes.position,index=geometry.index?.array??Array.from({length:pos.count},(_,i)=>i),rims=[],tyres=[];
 for(let t=0;t<index.length;t+=3){const tri=[index[t],index[t+1],index[t+2]];(tri.every(i=>Math.hypot(pos.getY(i)-cy,pos.getZ(i)-cz)>rim*R)?tyres:rims).push(...tri);}
 geometry.setIndex([...rims,...tyres]);geometry.clearGroups();geometry.addGroup(0,rims.length,0);geometry.addGroup(rims.length,tyres.length,1);
 return {rimTriangles:rims.length/3,tyreTriangles:tyres.length/3};
}
const HEAVY_PART=150000;   // triangles: a part this dense (the X5 body, ~1M) would be drawn twice a frame, colour and sun shadow, so it gets a shadow stand-in
export function buildVehicle(gltf,v){
 const g=new T.Group();g.name=`Drivable car · ${v.name}`;
 // Bake turn × scale and each node's transform into the geometry, then centre on the footprint with the tyres on y=0.
 const fix=new T.Matrix4().makeScale(v.scale,v.scale,v.scale);if(v.turn)fix.multiply(new T.Matrix4().set(...v.turn));
 gltf.scene.updateMatrixWorld(true);const parts=[];gltf.scene.traverse(o=>{if(o.isMesh)parts.push(o);});
 for(const m of parts){m.geometry.applyMatrix4(new T.Matrix4().multiplyMatrices(fix,m.matrixWorld));m.removeFromParent();m.position.set(0,0,0);m.rotation.set(0,0,0);m.scale.set(1,1,1);m.updateMatrix();g.add(m);}
 const box=new T.Box3().setFromObject(g);for(const m of parts)m.geometry.translate(-(box.min.x+box.max.x)/2,-box.min.y,-(box.min.z+box.max.z)/2);
 const kind=i=>Object.keys(v.parts).find(k=>v.parts[k].includes(i))??'trim',finish=k=>({...FINISH[k],...v.finish?.[k]});
 const physical=(old,k)=>new T.MeshPhysicalMaterial({map:old.map,normalMap:old.normalMap,normalScale:old.normalScale,roughnessMap:old.roughnessMap,metalnessMap:old.metalnessMap,roughness:old.roughness,metalness:old.metalness,side:old.side,...finish(k)});
 let wheels=[];
 for(const mesh of parts){const i=+mesh.name.match(/(\d+)$/)?.[1],k=kind(i),old=mesh.material;mesh.receiveShadow=true;mesh.castShadow=(mesh.geometry.index?.count??mesh.geometry.attributes.position.count)/3<HEAVY_PART;
  if(k!=='wheels'){mesh.material=physical(old,k);continue;}
  splitWheel(mesh.geometry);mesh.material=[physical(old,'rim'),physical(old,'tyre')];
  // Pivot on the axle: geometry recentred on the wheel's middle, pivot placed there; spins about X, steers about Y.
  const bb=mesh.geometry.boundingBox,c=bb.getCenter(new T.Vector3()),r=(bb.max.y-bb.min.y)/2;
  mesh.geometry.translate(-c.x,-c.y,-c.z);const pivot=new T.Group();pivot.position.copy(c);g.add(pivot);pivot.add(mesh);
  wheels.push({pivot,w:mesh,r,front:c.z>0});
 }
 for(const mesh of parts)if(!mesh.castShadow){mesh.geometry.computeBoundingBox();const bb=mesh.geometry.boundingBox,sz=bb.getSize(new T.Vector3()),c=bb.getCenter(new T.Vector3());   // sun-shadow stand-in for a part too dense to draw twice: a box over its footprint, 85 % of its height, invisible in the colour pass
  const proxy=new T.Mesh(new T.BoxGeometry(sz.x,sz.y*.85,sz.z),new T.MeshBasicMaterial({colorWrite:false,depthWrite:false}));proxy.position.set(c.x,bb.min.y+sz.y*.425,c.z);proxy.castShadow=true;proxy.name='Car shadow proxy';g.add(proxy);}
 const plateMeshes=v.plates?plates(v):[];g.add(...plateMeshes,contactShadow(v.width,v.length));
 g.userData.wheels=wheels;return g;
}
