// Fit wayfinding after loading the street, furniture and building models. The
// same poses and sizes drive both the clearance test and the rendered meshes.
import * as T from 'three';
import {MeshBVH} from 'three-mesh-bvh';
import {circleIntersects} from '../lots/geometry.js';
import {cityPedestrianBridges} from '../pedestrian-footbridges.js';
import {frameAt,nearestOn} from '../street/network.js';
import {LOOP,project} from '../alignment.js';
import {destinationSign,signPosts} from './signs.js';

const CELL=16;
const cellKey=(i,j)=>i*100003+j;
function sceneIndex(scene,requests,mats,buildings){
 const cells=new Map(),trees=new WeakMap();
 for(const s of requests){
  const i=Math.floor(s.x/CELL),j=Math.floor(s.z/CELL);
  for(let a=i-3;a<=i+3;a++)for(let b=j-3;b<=j+3;b++){
   const key=cellKey(a,b);if(!cells.has(key))cells.set(key,{a,b,items:[],low:Infinity,high:-Infinity});
   const cell=cells.get(key);cell.low=Math.min(cell.low,s.y-5);cell.high=Math.max(cell.high,s.y+9);
  }
 }
 function visit(bounds,fn){
  const i=Math.floor(bounds.min.x/CELL),j=Math.floor(bounds.min.z/CELL);
  const u=Math.floor(bounds.max.x/CELL),v=Math.floor(bounds.max.z/CELL);
  if((u-i+1)*(v-j+1)>cells.size){
   for(const cell of cells.values())if(cell.a>=i&&cell.a<=u&&cell.b>=j&&cell.b<=v)fn(cell);
  }else for(let a=i;a<=u;a++)for(let b=j;b<=v;b++){const cell=cells.get(cellKey(a,b));if(cell)fn(cell);}
 }
 const pavingMaps=new Set([mats.walk,mats.walkGrey,mats.walkBuff].map(m=>m?.map).filter(Boolean));
 const world=new T.Matrix4(),bounds=new T.Box3(),instance=new T.Matrix4();
 function add(mesh,matrix,kind){
  const g=mesh.geometry;bounds.copy(g.boundingBox).applyMatrix4(matrix);
  if(bounds.isEmpty())return;
  let item;
  visit(bounds,cell=>{
   if(bounds.min.y>cell.high||bounds.max.y<cell.low)return;
   if(!item)item={g,world:matrix.clone(),bounds:bounds.clone(),kind};
   cell.items.push(item);
  });
 }
 for(const {poly,minY,maxY} of buildings){
  const box=new T.Box3();
  for(const [x,z] of poly)box.expandByPoint(new T.Vector3(x,0,z));
  box.min.y=minY;box.max.y=maxY;
  const volume={poly,bounds:box,kind:'solid'};
  visit(box,cell=>cell.items.push(volume));
 }
 scene.updateMatrixWorld(true);
 scene.traverse(mesh=>{
  if(!mesh.isMesh||mesh.isSkinnedMesh||mesh.material?.transparent&&mesh.material.opacity<.15)return;
  const g=mesh.geometry;if(!g.attributes.position)return;
  if(!g.boundingBox)g.computeBoundingBox();
  // Near facades are instanced down to individual window panes. Their
  // continuous solid shells cover windows; projecting modules are kept.
  if(/^hk-modern-detail (WIN|WND|GLASS)/i.test(mesh.name))return;
  const m=mesh.material;
  const road=m===mats.tactile||m===mats.road||m===mats.busBay||m.map&&m.map===mats.road.map||/continuous-green-cycleway|Elevated cycle connection/.test(mesh.name);
  const floor=mesh.userData.cityTerrain||pavingMaps.has(m.map)||[mats.grass,mats.walk,mats.walkBuff,mats.walkGrey,mats.channel].includes(m)||mesh.name==='Plot paving';
  const publicPaving=[mats.walk,mats.walkGrey,mats.walkBuff].includes(m) && mesh.name!=='Plot paving';
  const kind=road?'road':publicPaving?'paving':floor?'ground':'solid';
  if(mesh.isInstancedMesh){
   for(let i=0;i<mesh.count;i++){mesh.getMatrixAt(i,instance);world.multiplyMatrices(mesh.matrixWorld,instance);add(mesh,world,kind);}
  }else add(mesh,mesh.matrixWorld,kind);
 });
 const localWorld=new T.Matrix4(),inv=new T.Matrix4(),bb=new T.Box3(),ray=new T.Ray(),down=new T.Vector3(0,-1,0);
 function tree(g){let t=g.boundsTree||trees.get(g);if(!t){t=new MeshBVH(g,{indirect:true});trees.set(g,t);}return t;}
 function touches(box,matrix,low,high,roadOnly=false){
  const test=box.clone();test.min.y=low;test.max.y=high;bb.copy(test).applyMatrix4(matrix);
  let hit=false;const seen=new Set();
  visit(bb,c=>{if(hit)return;for(const o of c.items){
   if(seen.has(o)||(o.kind==='ground'||o.kind==='paving')||roadOnly!==(o.kind==='road')||!bb.intersectsBox(o.bounds))continue;
   seen.add(o);
   if(o.poly){
    const cx=(bb.min.x+bb.max.x)/2,cz=(bb.min.z+bb.max.z)/2;
    if(circleIntersects(cx,cz,Math.hypot(bb.max.x-cx,bb.max.z-cz),o.poly)){hit=true;break;}
    continue;
   }
   localWorld.multiplyMatrices(inv.copy(o.world).invert(),matrix);
   if(tree(o.g).intersectsBox(test,localWorld)){hit=true;break;}
  }});return hit;
 }
 function floorAt(x,z,expected){
  let y=-Infinity;const c=cells.get(cellKey(Math.floor(x/CELL),Math.floor(z/CELL)));
  for(const o of c?.items||[]){
   if(o.kind!=='paving'||o.bounds.max.y<expected-2||o.bounds.min.y>expected+1.8||x<o.bounds.min.x||x>o.bounds.max.x||z<o.bounds.min.z||z>o.bounds.max.z)continue;
   ray.origin.set(x,expected+1.8,z);ray.direction.copy(down);ray.applyMatrix4(inv.copy(o.world).invert());
   const hit=tree(o.g).raycastFirst(ray,T.DoubleSide);if(hit)y=Math.max(y,hit.point.applyMatrix4(o.world).y);
  }
  return y;
 }
 return {touches,floorAt};
}
function options(s){
 if(s.diagram==='ring')return [[6.3,3.55,1.45],[4.5,2.55,0],[3.2,1.92,0],[2.65,1.88,0]];
 if(s.diagram==='junction')return [[5.35,3.02,1.25],[4.05,2.3,0],[3.2,1.95,0],[2.65,1.75,0]];
 const rows=s.rows.length+(s.flag&&s.street?1:0);
 return s.flag?[[3.55,rows*1.20,0],[2.75,rows*.99,0],[2.3,rows*.93,0]]:[[3.1,rows*1.04,0],[2.35,rows*.95,0]];
}
function approachEye({o,dir},p){
 const length=o.F.at(-1).d;
 let d=(p.placementD??nearestOn(o.F,p.x,p.z).d)-dir*22;
 if(o.ring)d=(d+length)%length;
 const f=frameAt(o.F,d),lat=dir*(o.P.carriageway/2-1.8);
 return new T.Vector3(f.x+f.lx*lat,f.y+1.65,f.z+f.lz*lat);
}
function* positions(s,width){
 if(s.site){
  const {o,d,dir}=s.site;
  for(const delta of [0,4,-4,8,-8,12,-12,17,-17,23]){
   const at=d-dir*delta;if(at<3||at>o.F.at(-1).d-3)continue;
   if(o.r.junctionDistances.some(j=>(j-at)*(j-d)<=0||Math.abs(j-at)<7)||o.r.crossings.some(c=>Math.abs(c-at)<4))continue;
   const f=frameAt(o.F,at),half=o.P.carriageway/2,walk=o.P.footpath;
   // Keep a continuous pedestrian passage between or beside the uprights.
   const offsets=[width/2+.32,walk/2,walk-width/2-.18];
   if(!s.flag && o.P.median>=width+.6)offsets.push(-half);
   for(const offset of offsets){
    if(offset>0){
     if(offset-width/2<.16||offset+width/2>walk-.12)continue;
     const [near,far]=signPosts(width).map(x=>offset+x);
     if(Math.max(near-.18,far-near-.12,walk-far-.06)<1.5)continue;
    }
    const lat=dir*(half+offset);
    yield {placementD:at,x:f.x+f.lx*lat,z:f.z+f.lz*lat,y:f.y,yaw:Math.atan2(-dir*f.tx,-dir*f.tz)};
   }
  }
 }else if(s.corner){
  const {arc,centre,radius}=s.corner;
  const fractions=s.roundabout?[.2,.1,.3,.4,0,.5,.6,.7]:[.5,.4,.6,.3,.7,.2,.8,.1,.9];
  for(const fraction of fractions){
   const [x,z]=arc[Math.round(fraction*(arc.length-1))],nx=(centre[0]-x)/radius,nz=(centre[1]-z)/radius;
   if(s.roundabout){
    const eye=approachEye(s.approach,{x,z}),yaw=Math.atan2(eye.x-x,eye.z-z);
    // Keep the roadward end of the angled board just behind the curved kerb.
    const halfAcross=width/2*Math.abs(nx*Math.cos(yaw)-nz*Math.sin(yaw));
    for(const margin of [.55,.8,1.05]){
     const inset=halfAcross+margin;
     yield {x:x+nx*inset,z:z+nz*inset,y:s.y,yaw};
    }
    continue;
   }
   // Both feet follow the kerb tangent, with the face directed towards traffic.
   const yaw=Math.atan2(-nx,-nz);
   if(Math.cos(yaw-s.yaw)<.25)continue;
   for(const inset of [.65,.85,1.05]){
    yield {x:x+nx*inset,z:z+nz*inset,y:s.y,yaw};
   }
  }
 }else if(s.terminal){
  const sn=Math.sin(s.yaw),cs=Math.cos(s.yaw);
  for(const along of [0,2,-2,4,-4,7,-7])for(const side of [0,-1.2,1.2,-2.8,-4.4])yield {...s,x:s.x+sn*along+cs*side,z:s.z+cs*along-sn*side};
 }else yield s;
}
// At the three junction footbridges the existing deck can carry the approach
// directions above the incoming carriageway. Brackets attach to its outer face.
function bridgeFit(s,index,placed){
 if(s.diagram!=='junction'||!s.site)return null;
 const {o,d,dir}=s.site;
 const b=cityPedestrianBridges.find(b=>b.road.id===s.road&&(b.streetDistance-d)*dir>0&&(b.streetDistance-d)*dir<29);
 if(!b)return null;
 const f=frameAt(o.F,b.streetDistance),lat=dir*((o.P.median||0)+o.P.carriageway)/4;
 const width=3.65,height=s.rows.length*.86,y=b.ends[0].lift.deck-.35;
 const x=f.x+f.lx*lat-dir*f.tx*2.68,z=f.z+f.lz*lat-dir*f.tz*2.68,yaw=Math.atan2(-dir*f.tx,-dir*f.tz);
 const matrix=new T.Matrix4().makeRotationY(yaw).setPosition(x,y,z);
 const slab=new T.Box3(new T.Vector3(-width/2-.15,0,-.10),new T.Vector3(width/2+.15,0,.19));
 if(index.touches(slab,matrix,-5.5,height+.08,true)||index.touches(slab,matrix,-.04,height+.08))return null;
 slab.min.y=0;slab.max.y=height;
 const p={x,y,z,yaw,placementD:b.streetDistance},sight=readable(s,p,y+height/2,width,index,placed,slab.applyMatrix4(matrix));
 return sight?{...s,...p,...sight,width,height,brace:0,diagram:null,mounted:true}:null;
}
// Trace the approach from the outer traffic lane, including the bend on the
// circulating carriageway. The exit flag for a right turn is across the road.
function readable(s,p,centreY,width,index,placed,body){
 const approach=s.site||s.approach;
 let eye;
 if(approach){
  eye=approachEye(approach,p);
 }else if(s.terminal){
  const f=LOOP.sample(LOOP.radius*1.4);eye=new T.Vector3(f.x,f.y+1.65,f.z);
 }else{
  eye=new T.Vector3(p.x+Math.sin(p.yaw)*18+Math.cos(p.yaw)*4,p.y+1.65,p.z+Math.cos(p.yaw)*18-Math.sin(p.yaw)*4);
 }
 const front=new T.Vector3(p.x,centreY,p.z),dx=eye.x-p.x,dz=eye.z-p.z;
 const rotation=Math.atan2(dx,dz),distance=Math.hypot(dx,dz),views=[];
 const nearby=placed.filter(q=>Math.hypot(q.x-p.x,q.z-p.z)<55);
 if(nearby.some(q=>q.views?.some(v=>v.intersectsBox(body))))return null;
 for(let i=0;i<5;i++){
  const a=.025+i*.195,b=a+.195,centre=front.clone().lerp(eye,(a+b)/2);
  const half=Math.max(.2,Math.min(width*.36,1.3)*(1-a)),h=.24+Math.abs(eye.y-centreY)*(b-a)/2;
  const box=new T.Box3(new T.Vector3(-half,-h,-distance*(b-a)/2),new T.Vector3(half,h,distance*(b-a)/2));
  const matrix=new T.Matrix4().makeRotationY(rotation).setPosition(centre);
  if(index.touches(box,matrix,-h,h))return null;
  const view=box.applyMatrix4(matrix);if(nearby.some(q=>q.body?.intersectsBox(view)))return null;
  views.push(view);
 }
 return {eye,body,views};
}
function fit(s,index,placed){
 for(const [width,height,brace] of options(s)){
  for(const p of positions(s,width)){
   const sin=Math.sin(p.yaw),cos=Math.cos(p.yaw);
   const floor=(side,depth)=>index.floorAt(p.x+side*cos+depth*sin,p.z-side*sin+depth*cos,p.y);
   const y=floor(0,0);if(!Number.isFinite(y)||Math.abs(y-p.y)>1.65)continue;
   const feet=signPosts(width);
   const foundations=feet.map(x=>({post:floor(x,-.11)-y,brace:brace?floor(x,-brace)-y:0}));
   if(foundations.some(f=>Math.abs(f.post)>.27||Math.abs(f.brace)>.27))continue;
   if(placed.some(q=>Math.hypot(q.x-p.x,q.z-p.z)<(q.width+width)/2+2))continue;
   const matrix=new T.Matrix4().makeRotationY(p.yaw).setPosition(p.x,y,p.z);
   const envelope=new T.Box3(new T.Vector3(-width/2-.28,0,-Math.max(.30,brace+.15)),new T.Vector3(width/2+.28,0,.34));
   if(index.touches(envelope,matrix,-2.5,2.3+height+.16,true)||index.touches(envelope,matrix,.34,2.3+height+.16))continue;
   envelope.min.y=.34;envelope.max.y=2.3+height;
   const sight=readable(s,p,y+2.3+height/2,width,index,placed,envelope.applyMatrix4(matrix));
   if(!sight)continue;
   // Check the panel edges as well as the individual post and brace feet.
   // Plot plinths and unbuilt parcels must stay available for development.
   const slices=Math.ceil(width/.3);
   let paved=true;
   for(let i=0;i<=slices&&paved;i++)for(const depth of [.08,-.18,-Math.max(.18,brace)]){
    if(Math.abs(floor((i/slices-.5)*(width+.10),depth)-y)>.30){paved=false;break;}
   }
   if(paved)return {...s,...p,...sight,y,width,height,brace,foundations};

  }
 }
 return null;
}

export function installDirectionSigns(scene,env,modern,lotGroup){
 const streets=scene.getObjectByName('Drawn street network');if(!streets)return;
 const g=streets.userData,requests=[];
 for(const ring of g.roundabouts)for(const e of ring.entries){
  if(e.exits.length===3)requests.push({...e.advance,diagram:'ring',rows:e.exits.map((destination,i)=>({destination,turn:['left','ahead','right'][i]}))});
 }
 requests.push(...g.directionSigns.filter(s=>s.flag),...g.directionSigns.filter(s=>!s.flag));
 if(g.terminalDirection)requests.push(g.terminalDirection);
 const buildings=modern.userData.sink.shells.map(s=>({poly:s.P.map(p=>[p.x,p.z]),minY:s.y0,maxY:s.y1}));
 for(const lot of lotGroup.userData.cityPlan)for(const poly of lot.footprints)buildings.push({poly,minY:-Infinity,maxY:Infinity});
 const index=sceneIndex(scene,requests,env.materials,buildings),placed=[],batches=new Map();
 function batch(key,geo,mat,p,scale,rot,ch){
  const id=key+'@'+ch;if(!batches.has(id))batches.set(id,{key,geo,mat,ch,list:[]});
  batches.get(id).list.push(new T.Matrix4().compose(p,new T.Quaternion().setFromEuler(rot),scale));
 }
 for(const request of requests){
  const sign=bridgeFit(request,index,placed)||fit(request,index,placed);if(!sign)continue;
  placed.push(sign);const ch=Math.floor(project(sign.x,sign.z)/240);destinationSign(batch,sign,ch);
  if(sign.mounted)continue;
  for(const side of signPosts(sign.width)){
   const x=sign.x+Math.cos(sign.yaw)*side,z=sign.z-Math.sin(sign.yaw)*side;
   const depth=sign.brace||.12,sin=Math.sin(sign.yaw),cos=Math.cos(sign.yaw);
   env.fences.push({ax:x-.11*sin,az:z-.11*cos,bx:x-depth*sin,bz:z-depth*cos,y:sign.y,top:2.3+sign.height});
  }
 }
 for(const {key,geo,mat,ch,list} of batches.values()){
  const mesh=new T.InstancedMesh(geo,mat,list.length);list.forEach((m,i)=>mesh.setMatrixAt(i,m));mesh.name=key;mesh.receiveShadow=true;
  env.groups[ch].add(mesh);
 }
 g.directionSigns=placed;g.directionSignSites=requests.length;
}
