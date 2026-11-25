import {mapSightline} from './kerb-restrictions.js';
import {restrictionSign} from '../city/signs.js';
// Furnish the renderer's exact kerb paths, including swept corners. There is no
// second centreline or independently inferred verge; everything stays inside the
// kerbside furniture band, retaining the walking width beyond it.
// Type 2 guides pedestrians at crossings and distributor junctions. A lamp every 30 m, bins at crossings and hydrants on
// alternating kerbs; tree pits between the lamps on the distributors and residential streets; Hong Kong bus shelters on the
// distributors; a controller cabinet at each signal junction; TS102 Give Way signs (network.js controls).
import * as T from 'three';
import {railingBuilder} from './furniture.js';
import {presetOf,frameAt} from './network.js';
import {hydrant,treePit,busStop,busStopMarks} from './sandbox/amenities.js';
import {mergeGeometries} from 'three/addons/utils/BufferGeometryUtils.js';
import {project} from '../alignment.js';
import {nearServiceRoad,CV_ROAD_WIDTH} from '../depot.js';
const onServiceRoad=(x,z,pad=1.5)=>nearServiceRoad(x,z,CV_ROAD_WIDTH/2+pad)!=null;
const hash=s=>{let h=2166136261;for(const ch of s)h=Math.imul(h^ch.charCodeAt(0),16777619)>>>0;return h/4294967296;};
// districtAt(x, z) → 'res' | 'com' | 'ind' (the OZP use of the plots behind the kerb); plantTree({x,y,z}, u, chunk) plants a street tree.
export function cityDetails(networkGroup,{batch,kitParts,fences,lampPositions,mats,districtAt=()=>'res',plantTree=null,treeAllowed=()=>true}){
 const {railRun,kit}=railingBuilder({batch,kitParts,fences}),ONE=new T.Vector3(1,1,1),chunk=(x,z)=>Math.floor(project(x,z)/240);
 const offset=(edge,t,d=.28)=>{const p=edge.point(t);return new T.Vector3(p.x+p.nx*d,p.y+Math.max(0,d-.125)*.025,p.z+p.nz*d);};
 const place=(name,list,P,yaw)=>list.forEach((q,i)=>batch(name+'-'+i,q.geometry,q.material,P,ONE,new T.Euler(0,yaw,0),chunk(P.x,P.z)));
 const kerbYaw=p=>Math.atan2(p.nx,p.nz);// local +Z into the footway, −Z to the road
 let panels=0,lamps=0,gullies=0,bins=0,hydrants=0,treeCount=0,shelters=0,cabinets=0,shrubs=0;
 const edges=networkGroup.userData.edges||[],straight=edges.filter(e=>e.kind==='edge'),used=new Set(),crossings=networkGroup.userData.crossings||[],controls=networkGroup.userData.controls||[];
 for(const e of straight){e.items=[];e.lamps=[];}
 const district=e=>e.district??=(()=>{const p=e.point(e.length/2);return districtAt(p.x+p.nx*12,p.z+p.nz*12);})();
 const wide=e=>presetOf(e.road).median>0;
 // Reserve the view from the approaching kerb lane to each advance map. A tree pit
 // can clear both signposts while its crown hides the destinations at eye level.
 const wayfinding=networkGroup.userData.directionSigns||[];
 const approachSightline=mapSightline(networkGroup.userData.roundabouts||[]);
 const hidesMap=(p,r)=>approachSightline(p,r)||wayfinding.some(s=>{
  const x=p.x-s.x,z=p.z-s.z,sin=Math.sin(s.yaw),cos=Math.cos(s.yaw);
  const forward=x*sin+z*cos,right=x*cos-z*sin;
  return forward>=-r&&forward<=16+r&&Math.abs(right)<=1.8+r;
 });
 for(const zone of networkGroup.userData.kerbZones||[])for(const sign of zone.signs){
  restrictionSign(batch,sign,chunk(sign.x,sign.z));
  zone.edge.items.push({t:sign.t,r:.65,kind:'restriction'});
 }
 const clearOf=(e,t,r)=>{const p=e.point(t);return !onServiceRoad(p.x,p.z,r+1.2)&&!e.items.some(i=>Math.abs(i.t-t)<i.r+r)&&!e.lamps.some(l=>Math.abs(l-t)<r+.4)&&!(e.crossings||[]).some(c=>Math.abs(c-t)<4.5+r);};

 // Bus stops on the distributors: one per kerb run of 120 m or more, mid-block between two lamps, 30 m clear of junctions and
 // crossings on a straight kerb, at least 350 m from the next stop. The kerb railing opens along the shelter.
 const surface=networkGroup.userData.surfaceHeight,draped=new Map();
 // Road markings laid over the drawn road: every vertex dropped onto the carriageway surface (it climbs and crowns), 12 mm above it.
 const drape=(group,P,yaw)=>{group.position.copy(P);group.rotation.y=yaw;group.updateMatrixWorld(true);group.traverse(m=>{if(!m.isMesh)return;const g=m.geometry.clone().applyMatrix4(m.matrixWorld),pos=g.attributes.position;
  for(let i=0;i<pos.count;i++){const y=surface?.(pos.getX(i),pos.getZ(i));pos.setY(i,(y??P.y-.15)+.012);}if(!draped.has(m.material))draped.set(m.material,[]);draped.get(m.material).push(g);});};
 for(const {edge:e,t,p,kind,half} of networkGroup.userData.busStops||[]){
  e.items.push({t,r:half+.5,kind:'shelter'});place('city-bus-stop-'+kind,busStop(kind),new T.Vector3(p.x,p.y,p.z),kerbYaw(p));drape(busStopMarks(-1,kind),new T.Vector3(p.x,p.y,p.z),kerbYaw(p));
  lampPositions.push({s:project(p.x,p.z),x:p.x+p.nx*1.0,y:p.y+2.42,z:p.z+p.nz*1.0,kind:'shelter',height:2.42,axis:{tx:-p.nz,tz:p.nx,lx:p.nx,lz:p.nz}});shelters++;}
 for(const [material,list] of draped){const m=new T.Mesh(mergeGeometries(list),material);m.name='city-bus-stop-marking';m.receiveShadow=true;networkGroup.add(m);}// traffic in the kerb lane runs along local −X

 // Stitch straight edges and swept returns before laying out bays, so rounded
 // end panels appear only at genuine openings, never at a corner tangent.
 for(const seed of edges){if(used.has(seed))continue;const chain=[{e:seed,reverse:false}];used.add(seed);
  const close=(a,b)=>Math.hypot(a.x-b.x,a.z-b.z)<.08;
  for(const end of [0,1]){for(;;){const tip=end?chain.at(-1):chain[0],p=tip.e.point(end?(tip.reverse?0:tip.e.length):(tip.reverse?tip.e.length:0));let found=null;
    for(const e of edges){if(used.has(e))continue;if(close(p,e.point(0))){found={e,reverse:!end};break;}if(close(p,e.point(e.length))){found={e,reverse:!!end};break;}}
    if(!found)break;used.add(found.e);end?chain.push(found):chain.unshift(found);
  }}
  let length=0;const gaps=[],centres=[];for(const p of chain){p.start=length;if(p.e.turningHead)gaps.push([length-10,length+p.e.length+10]);for(const c of p.e.crossings||[]){const m=length+(p.reverse?p.e.length-c:c);centres.push(m);gaps.push([m-3.9,m+3.9]);}length+=p.e.length;}
  const local=t=>{const p=chain.find(p=>t<=p.start+p.e.length)||chain.at(-1),d=Math.max(0,Math.min(p.e.length,t-p.start));return {e:p.e,d:p.reverse?p.e.length-d:d};};
  const point=t=>{const {e,d}=local(t);return offset(e,d);};
  // Short runs guide pedestrians to the crossing opening. Keep ordinary frontages and street-end roundabouts open.
  const railed=t=>{
   const {e,d}=local(t),p=e.point(d);
   if(onServiceRoad(p.x,p.z,1.8))return false;
   if(e.items?.some(i=>i.kind==='shelter'&&Math.abs(i.t-d)<i.r))return false;
   return (e.kind==='corner'&&wide(e))||centres.some(c=>Math.abs(c-t)<3.9+9);
  };
  // Open the complete dropped-kerb and flare footprint. No horizontal panel or
  // rounded end intrudes onto the wheelchair approach.
  for(let a=60;a<length-10;a+=60)if(!gaps.some(([x,y])=>a>x-10&&a<y+10))gaps.push([a-2,a+2]);
  let pieces=[[.6,length-.6]];for(const [lo,hi] of gaps)pieces=pieces.flatMap(([a,b])=>hi<=a||lo>=b?[[a,b]]:[...(lo>a?[[a,lo]]:[]),...(hi<b?[[hi,b]]:[])]);
  const runs=[];for(const [a,b] of pieces){let s=null;const n=Math.max(1,Math.ceil((b-a)/.5));for(let i=0;i<=n;i++){const t=a+(b-a)*i/n,on=i<n&&railed(t);if(on&&s===null)s=t;if(!on&&s!==null){runs.push([s,t]);s=null;}}}
  for(const [a,b] of runs){if(b-a<2)continue;const n=Math.ceil((b-a)/1.5),points=Array.from({length:n+1},(_,i)=>point(a+(b-a)*i/n));railRun(points,()=>chunk(points[0].x,points[0].z));panels+=n;}
 }
 const lampColumn=new T.CylinderGeometry(.07,.09,1,8);
 const lampArm=new T.BoxGeometry(.07,.07,1.4),lampHead=new T.BoxGeometry(.38,.1,.8);
 function streetLamp(P,p,height){
  const rotation=new T.Euler(0,kerbYaw(p),0),ch=chunk(P.x,P.z);
  const put=(name,geo,mat,pos,scale)=>batch(name,geo,mat,pos,scale,rotation,ch);
  put('city-light-column',lampColumn,mats.galvanised,P.clone().add(new T.Vector3(0,height/2,0)),new T.Vector3(1,height,1));
  put('city-light-arm',lampArm,mats.galvanised,P.clone().add(new T.Vector3(-p.nx*.7,height-.15,-p.nz*.7)),ONE);
  const head=P.clone().add(new T.Vector3(-p.nx*1.4,height-.2,-p.nz*1.4));
  put('city-light-head',lampHead,mats.lamp,head,ONE);
  lampPositions.push({s:project(P.x,P.z),x:P.x-p.nx*2.5,y:head.y,z:P.z-p.nz*2.5,kind:'city',height,axis:{tx:-p.nz,tz:p.nx,lx:p.nx,lz:p.nz}});
  lamps++;
 }
 // Illuminate the ring from its island rim, and each turning bulb from the footway.
 for(const island of networkGroup.userData.roundabouts||[]){
  const n=Math.ceil(2*Math.PI*island.radius/22);
  for(let i=0;i<n;i++){
   const a=(i+.5)*2*Math.PI/n,x=Math.cos(a),z=Math.sin(a),r=island.radius-1;
   streetLamp(new T.Vector3(island.x+r*x,island.y,island.z+r*z),{nx:-x,nz:-z},9);
  }
 }
 for(const head of networkGroup.userData.turningIslands||[]){
  for(const offset of [-1.45,0,1.45]){
   const a=head.yaw+Math.PI+offset,nx=Math.sin(a),nz=Math.cos(a);
   streetLamp(new T.Vector3(head.x+(head.outerRadius+.8)*nx,head.y+(head.style==='painted'?.14:0),head.z+(head.outerRadius+.8)*nz),{nx,nz},8);
  }
 }
 for(const edge of straight){const length=edge.length;
  for(let t=12;t<length-8;t+=30){
   if((edge.crossings||[]).some(c=>Math.abs(c-t)<5)||edge.items.some(i=>Math.abs(i.t-t)<i.r))continue;const p=edge.point(t),P=offset(edge,t,.75);
   if(onServiceRoad(P.x,P.z,1.5))continue;
   // One lamp row for two lanes; stagger the second row on wider roads.
   if((edge.side===-1&&(edge.road.carriageway||7.3)<12)||hidesMap(P,.12))continue;
   const height=(edge.road.carriageway||7.3)>=12?10:8;
   streetLamp(P,p,height);edge.lamps.push(t);
  }
  for(let t=8;t<length-5;t+=25){if(edge.items.some(i=>i.kind==='shelter'&&Math.abs(i.t-t)<i.r)||(edge.crossings||[]).some(c=>Math.abs(c-t)<4))continue;const p=edge.point(t),P=new T.Vector3(p.x,p.base+.005,p.z);
   kit('gully_grating',P,Math.atan2(p.nz,-p.nx),ONE,chunk(P.x,P.z));gullies++;}
 }
 // One litter bin per crossing, just beyond the dropped kerb on the left-hand footway (the other end if that is taken).
 for(const c of crossings){const sides=[1,-1].map(sd=>straight.find(e=>e.road.id===c.road&&e.side===sd&&c.d>e.from&&c.d<e.to)).filter(Boolean);
  find:for(const e of sides)for(const t of [5.2,-5.2].map(off=>(e.road.staggers.get(c.d)?.centre(e.side)??c.d)-e.from+off)){if(t<2||t>e.length-2||e.items.some(i=>Math.abs(i.t-t)<i.r+.5)||e.lamps.some(l=>Math.abs(l-t)<1.2))continue;
   const p=e.point(t),P=offset(e,t,.7);if(onServiceRoad(P.x,P.z,1.5))continue;kit('litter_bin',P,kerbYaw(p)+Math.PI,null,chunk(P.x,P.z));e.items.push({t,r:.4,kind:'bin'});bins++;break find;}}
 // Fire hydrants (sandbox staggeredHydrants): along each street at most 100 m apart, alternating kerbs, each nudged up to 25 m
 // to clear crossings, lamps and other items; local −Z (the 100 mm cap) to the road.
 for(const road of new Set(straight.map(e=>e.road))){const runs=straight.filter(e=>e.road===road);if(!runs.length)continue;const a=Math.min(...runs.map(e=>e.from)),b=Math.max(...runs.map(e=>e.to)),n=Math.ceil((b-a)/100);
  for(let i=0;i<n;i++){const target=a+(i+.5)*(b-a)/n;let done=false;
   for(let d=0;d<25&&!done;d+=.5)for(const x of [target-d,target+d])for(const sd of i%2?[1,-1]:[-1,1]){if(done)break;const e=runs.find(e=>e.side===sd&&x>e.from+6&&x<e.to-6),t=e&&x-e.from;if(!e||!clearOf(e,t,.6))continue;
    const p=e.point(t),P=offset(e,t,.7);place('city-hydrant',hydrant(),P,kerbYaw(p));e.items.push({t,r:.4,kind:'hydrant'});hydrants++;done=true;}}}
 // Street trees in H5144A pits between the lamps: distributors outside the industrial area, and residential streets whose
 // footway leaves 2.2 m of through zone beside a pit of at least 1.2 m.
 if(plantTree)for(const e of straight){const fp=presetOf(e.road).footpath,D=Math.min(1.5,fp-2.2),d=district(e);if(D<1.2||!(wide(e)?d!=='ind':d==='res'))continue;
  for(let t=27;t<e.length-10;t+=30){if(t<10||!clearOf(e,t,1.5)||(e.crossings||[]).some(c=>Math.abs(c-t)<9))continue;
   const p=e.point(t),P=offset(e,t,.33+D/2);if(!treeAllowed(P.x,P.z)||hidesMap(P,3.5))continue;place('city-tree-pit',treePit(1.5,D),P,kerbYaw(p));plantTree(P,hash(e.road.id+t+e.side),chunk(P.x,P.z));e.items.push({t,r:1,kind:'tree'});treeCount++;}}
 // Signal controller cabinet at each signal junction: behind the first main-road primary pole, 2.5 m upstream, doors to the footway.
 for(const c of controls.filter(c=>c.kind==='signal'&&c.stage==='major'&&c.ped&&!c.pedOnly)){if(controls.some(o=>o.cabinet&&o.node===c.node))continue;c.cabinet=true;
  const up=[-Math.sin(c.yaw),-Math.cos(c.yaw)],out=[Math.sin(c.ped.yaw),Math.cos(c.ped.yaw)],P=new T.Vector3(c.x+up[0]*2.5+out[0]*.6,c.y,c.z+up[1]*2.5+out[1]*.6);
  kit('cabinet_controller',P,c.ped.yaw+Math.PI,null,chunk(P.x,P.z));cabinets++;}
 // Median planters (network.js): a clipped hedge of low shrubs filling the bed, as lumpy overlapping clumps 0.5–0.8 m high.
 const clump=new T.IcosahedronGeometry(1,0),hedge=[0x4f7a3a,0x5d8a42,0x46703a].map(c=>new T.MeshStandardMaterial({color:c,emissive:c,emissiveIntensity:.14,roughness:.9,flatShading:true}));
 for(const pl of networkGroup.userData.planters||[])for(let d=pl.from+.5;d<pl.to-.4;d+=.9){const f=frameAt(pl.F,d),u=hash(pl.road+d.toFixed(1)),h=.5+.3*u,P=new T.Vector3(f.x,f.y+pl.y(d)+h*.35,f.z);
  batch('city-hedge-'+(Math.floor(u*3)),clump,hedge[Math.floor(u*3)],P,new T.Vector3(pl.width*.5,h*.65,.75),new T.Euler(0,Math.atan2(f.tx,f.tz)+(u-.5)*.3,0),chunk(P.x,P.z));shrubs++;}
 // TS102 Give Way (sandbox road-signs.js): inverted triangle 600 mm high, red border, 讓 / GIVE WAY, lower edge 2.3 m, on its own post.
 const H=.6,W=H/Math.sin(Math.PI/3),tri=new T.Shape([new T.Vector2(-W/2,H/2),new T.Vector2(0,-H/2),new T.Vector2(W/2,H/2)]);
 const face=new T.ShapeGeometry(tri),uv=face.attributes.uv,fp=face.attributes.position;for(let i=0;i<fp.count;i++)uv.setXY(i,fp.getX(i)/W+.5,fp.getY(i)/H+.5);face.rotateY(Math.PI);// front: local −Z
 const back=new T.ShapeGeometry(tri),postGeo=new T.CylinderGeometry(.038,.038,1,8),c=document.createElement('canvas');c.width=256;c.height=222;const x=c.getContext('2d');
 const path=k=>{const cx=128,cy=74,p=[[0,0],[256,0],[128,222]];x.beginPath();p.forEach(([a,b],i)=>x[i?'lineTo':'moveTo'](cx+(a-cx)*k,cy+(b-cy)*k));x.closePath();};
 path(1);x.fillStyle='#c8102e';x.fill();path(.7);x.fillStyle='#fff';x.fill();x.fillStyle='#151515';x.textAlign='center';x.textBaseline='middle';
 x.font='bold 46px "PingFang HK","Microsoft JhengHei",sans-serif';x.fillText('讓',128,52);x.font='bold 20px Arial,Helvetica,sans-serif';x.fillText('GIVE WAY',128,90);
 const map=new T.CanvasTexture(c);map.colorSpace=T.SRGBColorSpace;const signMat=new T.MeshStandardMaterial({map,emissive:0xffffff,emissiveMap:map,emissiveIntensity:.18,roughness:.45}),backMat=new T.MeshStandardMaterial({color:0x9aa09c,roughness:.55,metalness:.2});
 let signs=0;for(const s of controls.filter(c=>c.kind==='giveway')){const P=new T.Vector3(s.x,s.y,s.z),ch=chunk(s.x,s.z),rot=new T.Euler(0,s.yaw,0),fwd=new T.Vector3(-Math.sin(s.yaw),0,-Math.cos(s.yaw));
  batch('city-sign-post',postGeo,mats.galvanised,P.clone().add(new T.Vector3(0,1.45,0)),new T.Vector3(1,2.9,1),rot,ch);
  batch('city-sign-giveway',face,signMat,P.clone().add(new T.Vector3(0,2.3+H/2,0)).addScaledVector(fwd,.05),ONE,rot,ch);
  batch('city-sign-back',back,backMat,P.clone().add(new T.Vector3(0,2.3+H/2,0)).addScaledVector(fwd,.045),ONE,rot,ch);signs++;}
 networkGroup.userData.details={panels,lamps,gullies,signs,bins,hydrants,trees:treeCount,shelters,cabinets,shrubs};return networkGroup.userData.details;
}
