// Furnish the renderer's exact kerb paths, including swept corners. There is no
// second centreline or independently inferred verge; everything stays inside the
// kerbside furniture band, retaining the walking width beyond it.
// Rules from the city-rules sandbox (city-showcase.js dress(), TPDM V2 3.9.2): Type 2 railing round every junction, within 15 m
// of a crossing and by district elsewhere; a lamp every 30 m; one litter bin per crossing; fire hydrants at most 100 m apart,
// alternating kerbs; tree pits between the lamps on the distributors and residential streets; H4109 bus shelters on the
// distributors; a controller cabinet at each signal junction; TS102 Give Way signs (network.js controls).
import * as T from 'three';
import {railingBuilder} from './furniture.js';
import {presetOf,frameAt} from './network.js';
import {hydrant,treePit,busStop,SHELTER_HALF} from './sandbox/amenities.js';
import {project} from '../alignment.js';
const hash=s=>{let h=2166136261;for(const ch of s)h=Math.imul(h^ch.charCodeAt(0),16777619)>>>0;return h/4294967296;};
// Kerbside treatment away from junctions and crossings (sandbox TREAT / WIDE). The sandbox's H5146A kerb planters need a 2 m bed
// plus the through zone; these footways are 3–3.75 m, so their share is open footway here.
const TREAT={com:[['type2',.45],['none',.55]],res:[['none',.75],['type2',.25]],ind:[['none',.6],['type2',.4]]},WIDE=[['type2',.65],['none',.35]];
// districtAt(x, z) → 'res' | 'com' | 'ind' (the OZP use of the plots behind the kerb); plantTree({x,y,z}, u, chunk) plants a street tree.
export function cityDetails(networkGroup,{batch,kitParts,fences,lampPositions,mats,districtAt=()=>'res',plantTree=null}){
 const {railRun,kit}=railingBuilder({batch,kitParts,fences}),ONE=new T.Vector3(1,1,1),chunk=(x,z)=>Math.floor(project(x,z)/240);
 const offset=(edge,t,d=.28)=>{const p=edge.point(t);return new T.Vector3(p.x+p.nx*d,p.y+Math.max(0,d-.125)*.025,p.z+p.nz*d);};
 const place=(name,list,P,yaw)=>list.forEach((q,i)=>batch(name+'-'+i,q.geometry,q.material,P,ONE,new T.Euler(0,yaw,0),chunk(P.x,P.z)));
 const kerbYaw=p=>Math.atan2(p.nx,p.nz);// local +Z into the footway, −Z to the road
 let panels=0,lamps=0,gullies=0,bins=0,hydrants=0,treeCount=0,shelters=0,cabinets=0,shrubs=0;
 const edges=networkGroup.userData.edges||[],straight=edges.filter(e=>e.kind==='edge'),used=new Set(),crossings=networkGroup.userData.crossings||[],controls=networkGroup.userData.controls||[];
 for(const e of straight){e.items=[];e.lamps=[];}
 const district=e=>e.district??=(()=>{const p=e.point(e.length/2);return districtAt(p.x+p.nx*12,p.z+p.nz*12);})();
 const wide=e=>presetOf(e.road).median>0;
 const treatment=e=>e.treatment??=(()=>{const u=hash(e.road.id+'|'+e.side+'|'+Math.round(e.from)),list=wide(e)?(district(e)==='com'?[['type2',1]]:WIDE):TREAT[district(e)]||TREAT.res;
  let acc=0;for(const [k,p] of list){acc+=p;if(u<acc)return k;}return list.at(-1)[0];})();
 const clearOf=(e,t,r)=>!e.items.some(i=>Math.abs(i.t-t)<i.r+r)&&!e.lamps.some(l=>Math.abs(l-t)<r+.4)&&!(e.crossings||[]).some(c=>Math.abs(c-t)<4.5+r);

 // Bus stops on the distributors: one per kerb run of 120 m or more, mid-block between two lamps, 30 m clear of junctions and
 // crossings on a straight kerb, at least 350 m from the next stop. The kerb railing opens along the shelter.
 const stops=[];
 for(const e of straight.filter(e=>wide(e)&&e.length>=120).sort((a,b)=>b.length-a.length)){
  const ok=t=>t>30&&t<e.length-30&&!(e.crossings||[]).some(c=>Math.abs(c-t)<30)&&(()=>{const a=e.point(t-SHELTER_HALF),b=e.point(t+SHELTER_HALF);return a.nx*b.nx+a.nz*b.nz>Math.cos(3*Math.PI/180);})();
  const t=Array.from({length:Math.floor(e.length/30)},(_,k)=>27+30*k).filter(ok).sort((a,b)=>Math.abs(a-e.length/2)-Math.abs(b-e.length/2))[0];if(t==null)continue;
  const p=e.point(t);if(stops.some(s=>Math.hypot(s.x-p.x,s.z-p.z)<350))continue;stops.push(p);
  e.items.push({t,r:SHELTER_HALF+.5,kind:'shelter'});place('city-bus-stop',busStop(-1),new T.Vector3(p.x,p.y,p.z),kerbYaw(p));shelters++;}// traffic in the kerb lane runs along local −X

 // Stitch straight edges and swept returns before laying out bays, so rounded
 // end panels appear only at genuine openings, never at a corner tangent.
 for(const seed of edges){if(used.has(seed))continue;const chain=[{e:seed,reverse:false}];used.add(seed);
  const close=(a,b)=>Math.hypot(a.x-b.x,a.z-b.z)<.08;
  for(const end of [0,1]){for(;;){const tip=end?chain.at(-1):chain[0],p=tip.e.point(end?(tip.reverse?0:tip.e.length):(tip.reverse?tip.e.length:0));let found=null;
    for(const e of edges){if(used.has(e))continue;if(close(p,e.point(0))){found={e,reverse:!end};break;}if(close(p,e.point(e.length))){found={e,reverse:!!end};break;}}
    if(!found)break;used.add(found.e);end?chain.push(found):chain.unshift(found);
  }}
  let length=0;const gaps=[],centres=[];for(const p of chain){p.start=length;for(const c of p.e.crossings||[]){const m=length+(p.reverse?p.e.length-c:c);centres.push(m);gaps.push([m-3.9,m+3.9]);}length+=p.e.length;}
  const local=t=>{const p=chain.find(p=>t<=p.start+p.e.length)||chain.at(-1),d=Math.max(0,Math.min(p.e.length,t-p.start));return {e:p.e,d:p.reverse?p.e.length-d:d};};
  const point=t=>{const {e,d}=local(t);return offset(e,d);};
  // Type 2 railing where it is needed: kerb returns, 15 m either side of a crossing, and kerbs whose treatment calls for it.
  const railed=t=>{const {e,d}=local(t);if(e.kind==='corner'||centres.some(c=>Math.abs(c-t)<3.9+15))return true;if(e.items?.some(i=>i.kind==='shelter'&&Math.abs(i.t-d)<i.r))return false;return treatment(e)==='type2';};
  // Open the complete dropped-kerb and flare footprint. No horizontal panel or
  // rounded end intrudes onto the wheelchair approach.
  for(let a=60;a<length-10;a+=60)if(!gaps.some(([x,y])=>a>x-10&&a<y+10))gaps.push([a-2,a+2]);
  let pieces=[[.6,length-.6]];for(const [lo,hi] of gaps)pieces=pieces.flatMap(([a,b])=>hi<=a||lo>=b?[[a,b]]:[...(lo>a?[[a,lo]]:[]),...(hi<b?[[hi,b]]:[])]);
  const runs=[];for(const [a,b] of pieces){let s=null;const n=Math.max(1,Math.ceil((b-a)/.5));for(let i=0;i<=n;i++){const t=a+(b-a)*i/n,on=i<n&&railed(t);if(on&&s===null)s=t;if(!on&&s!==null){runs.push([s,t]);s=null;}}}
  for(const [a,b] of runs){if(b-a<2)continue;const n=Math.ceil((b-a)/1.5),points=Array.from({length:n+1},(_,i)=>point(a+(b-a)*i/n));railRun(points,()=>chunk(points[0].x,points[0].z));panels+=n;}
 }
 for(const edge of straight){const length=edge.length;
  for(let t=12;t<length-8;t+=30){
   if((edge.crossings||[]).some(c=>Math.abs(c-t)<5)||edge.items.some(i=>Math.abs(i.t-t)<i.r))continue;const p=edge.point(t),P=offset(edge,t,.75),ch=chunk(P.x,P.z),yaw=kerbYaw(p);
   // One lamp row for two lanes; stagger the second row on wider roads.
   if(edge.side===-1&&(edge.road.carriageway||7.3)<12)continue;
   const height=(edge.road.carriageway||7.3)>=12?10:8;
   const put=(name,geo,mat,pos,scale)=>batch(name,geo,mat,pos,scale,new T.Euler(0,yaw,0),ch);
   put('city-light-column',new T.CylinderGeometry(.07,.09,1,8),mats.galvanised,P.clone().add(new T.Vector3(0,height/2,0)),new T.Vector3(1,height,1));
   put('city-light-arm',new T.BoxGeometry(.07,.07,1.4),mats.galvanised,P.clone().add(new T.Vector3(-p.nx*.7,height-.15,-p.nz*.7)),ONE);
   const head=P.clone().add(new T.Vector3(-p.nx*1.4,height-.2,-p.nz*1.4));
   put('city-light-head',new T.BoxGeometry(.38,.1,.8),mats.lamp,head,ONE);lampPositions.push({s:project(P.x,P.z),x:head.x,y:head.y,z:head.z,kind:'city',height});edge.lamps.push(t);lamps++;
  }
  for(let t=8;t<length-5;t+=25){if((edge.crossings||[]).some(c=>Math.abs(c-t)<4))continue;const p=edge.point(t),P=new T.Vector3(p.x,p.base+.005,p.z);
   kit('gully_grating',P,Math.atan2(p.nz,-p.nx),ONE,chunk(P.x,P.z));gullies++;}
 }
 // One litter bin per crossing, just beyond the dropped kerb on the left-hand footway (the other end if that is taken).
 for(const c of crossings){const sides=[1,-1].map(sd=>straight.find(e=>e.road.id===c.road&&e.side===sd&&c.d>e.from&&c.d<e.to)).filter(Boolean);
  find:for(const e of sides)for(const t of [c.d-e.from+5.2,c.d-e.from-5.2]){if(t<2||t>e.length-2||e.items.some(i=>Math.abs(i.t-t)<i.r+.5)||e.lamps.some(l=>Math.abs(l-t)<1.2))continue;
   const p=e.point(t),P=offset(e,t,.7);kit('litter_bin',P,kerbYaw(p)+Math.PI,null,chunk(P.x,P.z));e.items.push({t,r:.4,kind:'bin'});bins++;break find;}}
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
   const p=e.point(t),P=offset(e,t,.33+D/2);place('city-tree-pit',treePit(1.5,D),P,kerbYaw(p));plantTree(P,hash(e.road.id+t+e.side),chunk(P.x,P.z));e.items.push({t,r:1,kind:'tree'});treeCount++;}}
 // Signal controller cabinet at each signal junction: behind the first main-road primary pole, 2.5 m upstream, doors to the footway.
 for(const c of controls.filter(c=>c.kind==='signal'&&c.stage==='major'&&c.ped&&!c.pedOnly)){if(controls.some(o=>o.cabinet&&o.node===c.node))continue;c.cabinet=true;
  const up=[-Math.sin(c.yaw),-Math.cos(c.yaw)],out=[Math.sin(c.ped.yaw),Math.cos(c.ped.yaw)],P=new T.Vector3(c.x+up[0]*2.5+out[0]*.6,c.y,c.z+up[1]*2.5+out[1]*.6);
  kit('cabinet_controller',P,c.ped.yaw+Math.PI,null,chunk(P.x,P.z));cabinets++;}
 // Median planters (network.js): a clipped hedge of low shrubs filling the bed, as lumpy overlapping clumps 0.5–0.8 m high.
 const clump=new T.IcosahedronGeometry(1,1),hedge=[0x4f7a3a,0x5d8a42,0x46703a].map(c=>new T.MeshStandardMaterial({color:c,roughness:.9,flatShading:true}));
 for(const pl of networkGroup.userData.planters||[])for(let d=pl.from+.5;d<pl.to-.4;d+=.9){const f=frameAt(pl.F,d),u=hash(pl.road+d.toFixed(1)),h=.5+.3*u,P=new T.Vector3(f.x,f.y+pl.y(d)+h*.35,f.z);
  batch('city-hedge-'+(Math.floor(u*3)),clump,hedge[Math.floor(u*3)],P,new T.Vector3(pl.width*.5,h*.65,.75),new T.Euler(0,Math.atan2(f.tx,f.tz)+(u-.5)*.3,0),chunk(P.x,P.z));shrubs++;}
 // TS102 Give Way (sandbox road-signs.js): inverted triangle 600 mm high, red border, 讓 / GIVE WAY, lower edge 2.3 m, on its own post.
 const H=.6,W=H/Math.sin(Math.PI/3),tri=new T.Shape([new T.Vector2(-W/2,H/2),new T.Vector2(0,-H/2),new T.Vector2(W/2,H/2)]);
 const face=new T.ShapeGeometry(tri),uv=face.attributes.uv,fp=face.attributes.position;for(let i=0;i<fp.count;i++)uv.setXY(i,fp.getX(i)/W+.5,fp.getY(i)/H+.5);face.rotateY(Math.PI);// front: local −Z
 const back=new T.ShapeGeometry(tri),postGeo=new T.CylinderGeometry(.038,.038,1,8),c=document.createElement('canvas');c.width=256;c.height=222;const x=c.getContext('2d');
 const path=k=>{const cx=128,cy=74,p=[[0,0],[256,0],[128,222]];x.beginPath();p.forEach(([a,b],i)=>x[i?'lineTo':'moveTo'](cx+(a-cx)*k,cy+(b-cy)*k));x.closePath();};
 path(1);x.fillStyle='#c8102e';x.fill();path(.7);x.fillStyle='#fff';x.fill();x.fillStyle='#151515';x.textAlign='center';x.textBaseline='middle';
 x.font='bold 46px "PingFang HK","Microsoft JhengHei",sans-serif';x.fillText('讓',128,52);x.font='bold 20px Arial,Helvetica,sans-serif';x.fillText('GIVE WAY',128,90);
 const map=new T.CanvasTexture(c);map.colorSpace=T.SRGBColorSpace;const signMat=new T.MeshStandardMaterial({map,roughness:.45}),backMat=new T.MeshStandardMaterial({color:0x9aa09c,roughness:.55,metalness:.2});
 let signs=0;for(const s of controls.filter(c=>c.kind==='giveway')){const P=new T.Vector3(s.x,s.y,s.z),ch=chunk(s.x,s.z),rot=new T.Euler(0,s.yaw,0),fwd=new T.Vector3(-Math.sin(s.yaw),0,-Math.cos(s.yaw));
  batch('city-sign-post',postGeo,mats.galvanised,P.clone().add(new T.Vector3(0,1.45,0)),new T.Vector3(1,2.9,1),rot,ch);
  batch('city-sign-giveway',face,signMat,P.clone().add(new T.Vector3(0,2.3+H/2,0)).addScaledVector(fwd,.05),ONE,rot,ch);
  batch('city-sign-back',back,backMat,P.clone().add(new T.Vector3(0,2.3+H/2,0)).addScaledVector(fwd,.045),ONE,rot,ch);signs++;}
 networkGroup.userData.details={panels,lamps,gullies,signs,bins,hydrants,trees:treeCount,shelters,cabinets,shrubs};return networkGroup.userData.details;
}
