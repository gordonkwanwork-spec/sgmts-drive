import * as T from 'three';
import {mergeByMaterial} from './batching.js';
import {riversideSquareFloor} from './a2-square-extension.js';
import {datum,frontage,pavingY,portalX,portalZ,halfWidth,halfRun,zMin,zMax,worldCoordinates,galleryEdge} from './a2-site.js';

const stone=new T.MeshStandardMaterial({color:0xd2c7ae,roughness:.88});
const wood=new T.MeshStandardMaterial({color:0x936c49,roughness:.83});
const turf=new T.MeshStandardMaterial({color:0x70854c,roughness:1});
let arcadeMats=null;

export function setA2GardensNight(on){
 stone.emissive.setHex(on?0xffe0b2:0);stone.emissiveIntensity=on?.18:0;
 wood.emissive.setHex(on?0xffcf94:0);wood.emissiveIntensity=on?.22:0;
 turf.emissive.setHex(on?0x8ea67c:0);turf.emissiveIntensity=on?.09:0;
 if(!arcadeMats)return;
 arcadeMats.glazing.emissive.setHex(on?0xffffff:0);arcadeMats.glazing.emissiveIntensity=on?1.15:0;
 arcadeMats.pale.emissive.setHex(on?0xffdfba:0);arcadeMats.pale.emissiveIntensity=on?.18:0;
 arcadeMats.trim.emissive.setHex(on?0x9db0c6:0);arcadeMats.trim.emissiveIntensity=on?.16:0;
 arcadeMats.sage.emissive.setHex(on?0x94aa82:0);arcadeMats.sage.emissiveIntensity=on?.09:0;
 arcadeMats.forecourt.emissive.setHex(on?0xffe1b8:0);arcadeMats.forecourt.emissiveIntensity=on?.12:0;
}
function pavingTexture(){
 const c=document.createElement('canvas');c.width=c.height=512;const ctx=c.getContext('2d');
 ctx.fillStyle='#aaa297';ctx.fillRect(0,0,512,512);
 const hues=['#d6cec0','#d2c9bc','#d9d1c5','#d4ccbf','#cfc8bc','#ded6c8'];
 for(let row=0;row<8;row++)for(let col=-1;col<5;col++){
  ctx.fillStyle=hues[(row*3+col*col+row*col+12)%hues.length];
  ctx.fillRect(col*128+(row%2)*64+1,row*64+1,127,63);
 }
 const t=new T.CanvasTexture(c);t.wrapS=t.wrapT=T.RepeatWrapping;t.colorSpace=T.SRGBColorSpace;t.anisotropy=8;return t;
}
export function buildSquarePaving(group){
 const vertices=[],colors=[],uv=[],indices=[];
 const zs=new Set([zMin,zMax,...portalZ.flatMap(z=>[z-halfRun,z+halfRun])]);
 for(let z=zMin;z<=zMax;z+=2)zs.add(z);
 const rows=[...zs].sort((a,b)=>a-b);
 const xs=[-70,-63,-58,portalX-halfWidth,portalX+halfWidth,-36,-29,-24,-21,-18];
 // One surface from the cycleway to the concourse, with actual stairwell openings.
 // Tint the pedestrian approaches and transverse strips within the same mesh.
 for(let i=0;i<rows.length-1;i++){
  const a=rows[i], b=rows[i+1],mid=(a+b)/2;
  for(let j=0;j<xs.length;j++){
   const right=xs[j],left=z=>j?Math.max(frontage(z).x,xs[j-1]):frontage(z).x;
   if(right<=left(mid) || (right===portalX+halfWidth&&portalZ.some(z=>Math.abs(mid-z)<halfRun)))continue;
   const band=(mid-zMin)%18<2,walk=right===-21||right===-63;
   const tint=new T.Color(band?0xcac6bb:walk?0xe2d1bc:0xffffff);
   const start=vertices.length/3;
   for(const [x,z] of [[left(a),a],[right,a],[left(b),b],[right,b]]){
    vertices.push(x,pavingY(x,z)-datum,z);colors.push(tint.r,tint.g,tint.b);uv.push(x/6,z/6);
   }
   indices.push(start,start+2,start+1,start+1,start+2,start+3);
  }
 }
 const geom=new T.BufferGeometry();geom.setAttribute('position',new T.Float32BufferAttribute(vertices,3));
 geom.setAttribute('uv',new T.Float32BufferAttribute(uv,2));geom.setAttribute('color',new T.Float32BufferAttribute(colors,3));
 geom.setIndex(indices);geom.computeVertexNormals();
 const m=new T.Mesh(geom,new T.MeshStandardMaterial({map:pavingTexture(),vertexColors:true,roughness:.94}));
 m.name='Hung Shui Kiu regional plaza';m.receiveShadow=true;group.add(m);
}

// Swept planting islands have a gently bent spine, flared shoulders and rounded ends.
// Each course follows the grade, so timber seat edges meet the paving along the whole bed.
 export function buildGardens(parent,{tree,kit,shrub,chunk}){
  const garden=new T.Group();garden.name='Terraced station gardens';parent.add(garden);
  function island(cx,cz,rx,rz,bend,levels,level=pavingY,hasTrees=true){
   const top=.45*levels;
   function point(theta,inset){
    const s=Math.sin(theta),c=Math.cos(theta);
    return [cx+bend*(s*s-.38)+c*(rx-inset),cz+s*(rz-inset)];
   }
   function course(inset,h0,h1,material){
    const p=[],idx=[],n=64;
    for(let i=0;i<n;i++){
     const [x,z]=point(Math.PI*2*i/n,inset),ground=level(x,z)-datum;
     p.push(x,ground+h0,z,x,ground+h1,z);
    }
    p.push(cx,level(cx,cz)-datum+h1,cz);
    for(let i=0;i<n;i++){const a=i*2,b=(i+1)%n*2;idx.push(a,a+1,b,b,a+1,b+1,a+1,n*2,b+1);}
    const g=new T.BufferGeometry();g.setAttribute('position',new T.Float32BufferAttribute(p,3));g.setIndex(idx);g.computeVertexNormals();
    const m=new T.Mesh(g,material);m.castShadow=m.receiveShadow=true;garden.add(m);
   }
   for(let i=0;i<levels;i++){course(i*.78,-.04+i*.45,.39+i*.45,stone);course(i*.78-.04,.39+i*.45,.45+i*.45,i===0?wood:stone);}
   course((levels-1)*.78+.34,top,top+.055,turf);
   if(hasTrees){
    const count=rz>14?4:rz>11?3:2;
    for(let i=0;i<count;i++){
     const t=count===2?(i-.5)*.85:(i/(count-1)-.5)*1.24;
     const x=cx+bend*(t*t-.38)+(i%2?.72:-.72),z=cz+t*rz;
     const w=worldCoordinates(x,z),seed=Math.abs(Math.sin(cx*8+z*.372));
     tree(new T.Vector3(w.x,level(x,z)+top,w.z),seed,chunk);
    }
   }
   for(let i=0;i<Math.floor(rz*1.45);i++){
    const t=Math.sin(i*57.39)*.78,u=Math.cos(i*3.83)*.65;
    const x=cx+bend*(t*t-.38)+u*(rx-levels*.78)*Math.sqrt(1-t*t),z=cz+t*(rz-levels*.78);
    const w=worldCoordinates(x,z),p=new T.Vector3(w.x,level(x,z)+top+.03,w.z);
    shrub(p,.5+.5*Math.sin(i*7.39+cx),chunk);
    if(i%3===0)kit('vegetation_flowering',p,i*2.399,new T.Vector3(1.4,1.4,1.4),chunk);
   }
  }
  // The two main cross-plaza passages remain open opposite the concourse entrances.
  for(const [x,z,rx,rz,bend,n] of [
   [-32,86,5.4,19,3,2],[-65,91,6.3,16,-3,2],[-31,56,4.4,7,-1,1],
   [-47,20,9.4,17,6.8,3],[-65,7,4,13,-1.8,2],[-29,1,4.8,17,-2.8,2],

   [-49,101,4.5,6.5,1,1]
  ])island(x,z,rx,rz,bend,n);
  // Landscaped terraced gardens and planters across the newly added A2 riverside
  // square, keeping station entrance axes, turning-head approaches and river edges open.
  for(const [x,z,rx,rz,bend,levels,hasTrees] of [
   // North riverside plaza
   [90,-330,5.8,11,-1.6,2,true],[58,-304,6.2,12,1.8,2,true],[88,-296,5.2,11,1.2,1,true],
   [64,-264,6.5,14,1.8,2,true],[76,-222,6.0,14,-1.6,2,true],[44,-230,5.2,12,1.2,1,true],
   [-56,-240,3.8,10,.6,1,true],
   // North-central east forecourt
   [56,-186,6.5,14,-2.0,2,true],[28,-172,4.6,12,1.2,1,true],
   [32,-132,5.2,12,-1.4,1,true],[58,-122,5.5,11,1.2,2,true],
   // Main east station plaza
   [42,-52,5.8,12,-1.4,1,true],[76,-32,7.0,15,2.0,2,true],[42,-18,5.5,11,1.5,2,true],
   [98,-6,6.2,14,-1.6,2,true],[62,12,7.8,16,2.4,2,true],[36,16,5.0,11,-1.2,1,true],
   [98,24,5.8,12,1.4,1,true],[104,54,6.2,15,-1.8,2,true],[68,56,7.0,14,1.8,2,true],
   [38,68,5.5,13,1.2,1,true],[76,88,6.8,14,-2.0,2,true],[42,98,5.2,11,-1.0,1,true],
   [106,92,5.5,12,1.4,1,true],
   // South-west and south-east newly added square
   [-42,134,6.8,14,-1.8,2,true],[-22,154,5.2,13,1.4,1,true],[-38,174,5.5,12,-1.2,1,true],
   [36,130,5.8,12,1.5,2,true],[60,124,5.2,10,-1.2,1,true],[34,162,6.5,14,-1.8,2,true],
   [64,166,6.0,13,1.6,2,true],[92,170,5.2,10,-1.2,1,true],[22,188,4.5,9,1.0,1,true],
   // Low shrub and flowering planters beneath the Tuen Ma Line viaduct (between piers)
   [0,145,3.6,9.5,0,1,false],[0,177,3.6,9.5,0,1,false],[0,209,3.4,8.5,0,1,false],
   [.8,-143,3.6,9.5,0,1,false],[3.6,-175,3.6,9.5,0,1,false]
  ]){
   const w=worldCoordinates(x,z),baseY=riversideSquareFloor(w.x,w.z);
   if(baseY===null)continue;
   const forecourtLevel=(px,pz)=>{const pw=worldCoordinates(px,pz);return riversideSquareFloor(pw.x,pw.z)??baseY;};
   island(x,z,rx,rz,bend,levels,forecourtLevel,hasTrees);
  }
  mergeByMaterial(garden);
 }

export {canopyMaterial} from './street/canopy-trees.js';

// The commercial frontage opposite A2 gives the SGMTS stop a street edge. Its
// stepped podium and planted roof terraces are an interpretation of the reference.
export function buildArcade(parent,plant,chunk){
 const g=new T.Group();g.name='A2 commercial frontage';parent.add(g);
 const pale=new T.MeshStandardMaterial({color:0xc4bda9,roughness:.8});
 const trim=new T.MeshStandardMaterial({color:0x5a574d,metalness:.35,roughness:.55});
 const sage=new T.MeshStandardMaterial({color:0x78834c,roughness:1});
 const c=document.createElement('canvas');c.width=512;c.height=128;const ctx=c.getContext('2d');
 for(let i=0;i<8;i++){
  const grad=ctx.createLinearGradient(0,0,26,128);
  grad.addColorStop(0,['#526368','#697778','#526569'][i%3]);grad.addColorStop(.63,'#394b4b');grad.addColorStop(1,'#847c69');
  ctx.fillStyle=grad;ctx.fillRect(i*64,0,64,128);
  ctx.fillStyle='#aaa99b';ctx.fillRect(i*64,0,2,128);ctx.fillRect(i*64,88,64,1.4);ctx.fillRect(i*64,124,64,4);
  ctx.fillStyle='rgba(223,211,185,.3)';if(i%3!==1)ctx.fillRect(i*64+2,2,60,11+(i*7)%22);
 }
 const map=new T.CanvasTexture(c);map.wrapS=map.wrapT=T.RepeatWrapping;map.colorSpace=T.SRGBColorSpace;map.anisotropy=8;
 const nc=document.createElement('canvas');nc.width=512;nc.height=128;const nctx=nc.getContext('2d');
 nctx.fillStyle='#000';nctx.fillRect(0,0,512,128);
 for(let i=0;i<8;i++){
  if(i===2||i===6)continue;
  nctx.fillStyle=['#ffd496','#ffe7bf','#ffc882','#ffe0aa'][i%4];nctx.fillRect(i*64+2,2,62,85);
  nctx.fillStyle='rgba(255,222,168,.55)';nctx.fillRect(i*64+2,90,62,32);
 }
 const emap=new T.CanvasTexture(nc);emap.wrapS=emap.wrapT=T.RepeatWrapping;emap.colorSpace=T.SRGBColorSpace;emap.anisotropy=8;
 const glazing=new T.MeshStandardMaterial({map,emissiveMap:emap,roughness:.47,metalness:.18});
 function block(x,z,w,d,r,bottom,top,mat){
  const pts=[];for(const [sx,sz,start] of [[1,1,0],[-1,1,90],[-1,-1,180],[1,-1,270]])
   for(let i=0;i<=7;i++){const a=(start+i*90/7)*Math.PI/180;pts.push([x+sx*(w/2-r)+Math.cos(a)*r,z+sz*(d/2-r)+Math.sin(a)*r]);}
  const p=[],uv=[],idx=[];let along=0;
  for(let i=0;i<pts.length;i++){const a=pts[i],b=pts[(i+1)%pts.length],end=along+Math.hypot(b[0]-a[0],b[1]-a[1]),k=p.length/3;
   p.push(a[0],bottom,a[1],a[0],top,a[1],b[0],bottom,b[1],b[0],top,b[1]);
   uv.push(along/15,0,along/15,(top-bottom)/3.8,end/15,0,end/15,(top-bottom)/3.8);idx.push(k,k+1,k+2,k+1,k+3,k+2);
   along=end;
  }
  const cap=p.length/3;p.push(x,top,z);uv.push(0,0);for(let i=0;i<pts.length;i++)idx.push(i*4+1,cap,((i+1)%pts.length)*4+1);
  const geom=new T.BufferGeometry();geom.setAttribute('position',new T.Float32BufferAttribute(p,3));geom.setAttribute('uv',new T.Float32BufferAttribute(uv,2));geom.setIndex(idx);geom.computeVertexNormals();
  const m=new T.Mesh(geom,mat);m.castShadow=m.receiveShadow=true;g.add(m);
 }
 // Stitch the gallery forecourt to the outer SGMTS footway, following its curve and grade.
 const approach=[],tri=[];
 for(const edge of galleryEdge){
  const k=approach.length/3;
  approach.push(edge.x,edge.y-datum,edge.z,-114,.49,edge.z);
  if(k)tri.push(k-2,k-1,k,k,k-1,k+1);
 }
 const apron=new T.BufferGeometry();apron.setAttribute('position',new T.Float32BufferAttribute(approach,3));apron.setIndex(tri);apron.computeVertexNormals();
 const forecourt=new T.Mesh(apron,new T.MeshStandardMaterial({color:0xc8bdab,side:T.DoubleSide,roughness:.9}));forecourt.name='A2 commercial forecourt';forecourt.receiveShadow=true;g.add(forecourt);
 block(-130,5,36,147,6,-1,.5,pale);
 block(-131,7,28,138,5,.5,5.2,glazing);
 block(-130,7,35,142,6,5.2,5.75,pale);
 block(-130,7,34,141,6,5.75,13.2,glazing);
 block(-130,7,34.6,141.6,6,13.2,13.8,pale);
 for(let z=-57;z<=72;z+=4.1){
  const fin=new T.Mesh(new T.BoxGeometry(.45,7.45,.16),pale);fin.position.set(-112.9,9.48,z);fin.castShadow=true;g.add(fin);
  if((Math.round((z+57)/4.1)%2)===0){const col=new T.Mesh(new T.CylinderGeometry(.28,.34,4.8,10),trim);col.position.set(-114.2,2.86,z);g.add(col);}
 }
 for(const [z,d] of [[-40,31],[48,38]]){
  block(-132,z,23,d,5,13.8,21.5,glazing);block(-132,z,23.7,d+.6,5,21.5,21.95,pale);
  block(-132,z,20,d-4,4,21.95,22.1,sage);
 }
 block(-132,-33,16,22,2.8,21.9,42,glazing);block(-132,-33,16.6,22.6,2.8,42,42.45,trim);
 for(const z of [-65,-15,0,15,68]){
  block(-120,z,6.8,7.5,2,13.8,14.2,pale);block(-120,z,6.2,7,1.8,14.2,14.27,sage);
  const w=worldCoordinates(-120,z);plant(new T.Vector3(w.x,datum+14.27,w.z),Math.abs(Math.sin(z+2)),chunk,false);
 }
 arcadeMats={pale,trim,sage,glazing,forecourt:forecourt.material};
 mergeByMaterial(g,{skip:m=>m.name==='A2 commercial forecourt'});
}
