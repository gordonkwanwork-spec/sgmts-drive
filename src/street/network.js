import {zebraStripes,zebraControl} from './sandbox/street-rules.js';
// Drawn street network: roads and paved/planted areas authored in the street editor (Road and Area tools) and stored in
// public/street/furniture.json under `network`. The game (environment.js) and the editor both build it from here.
//   roads: [{id, preset, footway, name?, pts:[[x,z]…]}]  centrelines (straight legs, rounded corners), left = +lateral
//   areas: [{id, finish, pts:[[x,z]…]}]                   closed polygons
// A road whose end lies on another drawn road's centreline joins it as a T: the other road's footpath opens for the mouth and
// both kerbs turn the corner on a 6 m radius. Nothing may be drawn on the SGMTS corridor reserve (reserveClash).
import * as T from 'three';
import {sweptKerbs} from './kerbs.js';
import {sample,JUNCTIONS,UNDERPASSES} from '../alignment.js';
import {TessellateModifier} from 'three/addons/modifiers/TessellateModifier.js';
import {corridorReserve,pointInPolygon} from '../lots/wand.js';
import {circleIntersects} from '../lots/geometry.js';

// Cross-sections (m). carriageway = kerb to kerb, median inside it; footpath per side.
export const PRESETS={
 local:{label:'Local road · 7.3 m, 3.5 m footpaths',short:'Local road',carriageway:7.3,median:0,footpath:3.5,lines:'centre'},
 distributor:{label:'Distributor · 4 lanes + median, 4.5 m footpaths',short:'Distributor',carriageway:16.6,median:2,footpath:4.5,lines:'lanes'},
 service:{label:'Service road · 6 m, 2.5 m footpaths',short:'Service road',carriageway:6,median:0,footpath:2.5,lines:'none'},
 path:{label:'Footpath only · 3 m',short:'Footpath',carriageway:0,median:0,footpath:1.5,lines:'none'},
};
export const FOOTWAYS=['red','grey','buff'];
export const FINISHES={buff:'Paving · buff',grey:'Paving · grey',red:'Paving · red brick',grass:'Grass / planting'};
export const Y={road:.03,raised:.18,area:.17,grass:.05,line:.04},CORNER=6,STEP=1;
export const presetOf=r=>({...PRESETS[r.preset]||PRESETS.local,...(r.carriageway?{carriageway:r.carriageway,median:0}:{}),...(r.footpath?{footpath:r.footpath}:{})});
export function streetLevel(r,d,lat){const P=presetOf(r),h=P.carriageway/2,depth=Math.abs(lat)-h;
 if(r.standard!=='sandbox')return depth>0?Y.raised:Y.road;
 if(depth<=0){const fade=Math.min(1,...(r.junctionDistances||[]).map(at=>Math.abs(d-at)/20));return Y.road+.025*(h-Math.abs(lat))*fade;}
 let drop=0;for(const c of r.crossings||[]){const flare=Math.max(0,Math.min(1,1-(Math.abs(d-c)-1.5)/1.8));drop=Math.max(drop,.13*flare*Math.max(0,1-depth/1.8));}
 return Y.raised+Math.max(0,depth-.125)*.025*(r.tie?Math.min(1,d/10):1)-drop;
}
export function tieFrame(tie){const j=[...JUNCTIONS,...UNDERPASSES].find(j=>j.c===tie.junction);if(!j)throw Error('Unknown street tie-in '+tie.junction);const r=sample(j.s);return {x:r.x+r.lx*j.extent*tie.side,z:r.z+r.lz*j.extent*tie.side,y:j.underpass?r.groundY:r.y,tx:r.lx*tie.side,tz:r.lz*tie.side,slope:j.underpass?0:-r.grade*tie.side,width:j.halfWidth*2};}
export const halfWidth=r=>{const P=presetOf(r);return P.carriageway/2+P.footpath;};

// Centreline: straight between the clicked points, each corner rounded on a BEND m radius (less where the legs are short).
export const BEND=12;
export function centreline(pts,radius=BEND){if(pts.length<3)return pts.map(p=>[...p]);const out=[[...pts[0]]];
 for(let i=1;i<pts.length-1;i++){const c=pts[i],lu=Math.hypot(pts[i-1][0]-c[0],pts[i-1][1]-c[1]),lv=Math.hypot(pts[i+1][0]-c[0],pts[i+1][1]-c[1]);
  const u=[(pts[i-1][0]-c[0])/lu,(pts[i-1][1]-c[1])/lu],v=[(pts[i+1][0]-c[0])/lv,(pts[i+1][1]-c[1])/lv],th=Math.acos(Math.max(-1,Math.min(1,u[0]*v[0]+u[1]*v[1])));
  if(!(lu>0&&lv>0)||th>Math.PI-.02){out.push([...c]);continue;}
  const t=Math.min(radius/Math.tan(th/2),.45*Math.min(lu,lv)),R=t*Math.tan(th/2),b=[u[0]+v[0],u[1]+v[1]],bl=Math.hypot(...b),k=R/Math.sin(th/2),C=[c[0]+b[0]/bl*k,c[1]+b[1]/bl*k];
  const A=[c[0]+u[0]*t,c[1]+u[1]*t],B=[c[0]+v[0]*t,c[1]+v[1]*t];let a0=Math.atan2(A[1]-C[1],A[0]-C[0]),a1=Math.atan2(B[1]-C[1],B[0]-C[0]);while(a1-a0>Math.PI)a1-=2*Math.PI;while(a1-a0<-Math.PI)a1+=2*Math.PI;
  const n=Math.max(2,Math.ceil(Math.abs(a1-a0)*R/1.5));for(let k2=0;k2<=n;k2++){const a=a0+(a1-a0)*k2/n;out.push([C[0]+R*Math.cos(a),C[1]+R*Math.sin(a)]);}}
 out.push([...pts.at(-1)]);return out;}
// Samples every ~STEP m along the centreline: {d,x,z,y,tx,tz,lx,lz}. y follows the ground averaged over ±15 m, so a road that
// crosses a terrain step ramps instead of jumping.
export function frames(road,ground=()=>0){const P=centreline(road.pts,road.standard==='sandbox'?Math.max(BEND,halfWidth(road)+6):BEND),run=[0];if(P.length<2)return [];
 for(let i=1;i<P.length;i++)run.push(run[i-1]+Math.hypot(P[i][0]-P[i-1][0],P[i][1]-P[i-1][1]));const L=run.at(-1);if(!(L>0))return [];
 const n=Math.max(1,Math.ceil(L/STEP)),F=[];let i=1;
 for(let k=0;k<=n;k++){const d=L*k/n;while(i<P.length-1&&run[i]<d)i++;const a=P[i-1],b=P[i],len=run[i]-run[i-1]||1,u=(d-run[i-1])/len,x=a[0]+(b[0]-a[0])*u,z=a[1]+(b[1]-a[1])*u;
  // tangent: the chord through the neighbouring samples' segment ends, so lateral offsets turn smoothly round the arcs
  const p=P[Math.max(0,u<.5?i-2:i-1)],q=P[Math.min(P.length-1,u<.5?i:i+1)],tx=q[0]-p[0],tz=q[1]-p[1],l=Math.hypot(tx,tz)||1;
  F.push({d,x,z,tx:tx/l,tz:tz/l,lx:tz/l,lz:-tx/l,g:ground(x,z)});}
 // Sliding ground average keeps city-scale road preparation linear.
 let lo=0,hi=0,sum=0;for(const f of F){while(hi<F.length&&F[hi].d<=f.d+15)sum+=F[hi++].g;while(F[lo].d<f.d-15)sum-=F[lo++].g;f.y=sum/(hi-lo);}
 if(road.tie){const a=tieFrame(road.tie),delta=a.y-F[0].y;for(const f of F){const t=Math.min(1,f.d/40),u=t*t*(3-2*t);f.y+=delta*(1-u);f.crossSlope=a.slope*(1-u);}}
 if(road.turningRadius){const y=F.at(-1).y;for(const f of F){const t=Math.min(1,Math.max(0,(L-f.d-road.turningRadius-3)/15));f.y=y*(1-t)+f.y*t;}}
 return F;}
export function frameAt(F,d){const L=F.at(-1).d,u=Math.max(0,Math.min(L,d))/L*(F.length-1),i=Math.min(F.length-2,Math.floor(u)),k=u-i,a=F[i],b=F[i+1],m=(p,q)=>p+(q-p)*k;
 return {d,x:m(a.x,b.x),z:m(a.z,b.z),y:m(a.y,b.y),tx:m(a.tx,b.tx),tz:m(a.tz,b.tz),lx:m(a.lx,b.lx),lz:m(a.lz,b.lz),crossSlope:m(a.crossSlope||0,b.crossSlope||0)};}
// Nearest sample to (x,z): {f, lat, along-distance d}.
export function nearestOn(F,x,z){let best=null,bd=Infinity;for(const f of F){const q=(f.x-x)**2+(f.z-z)**2;if(q<bd){bd=q;best=f;}}
 const along=(x-best.x)*best.tx+(z-best.z)*best.tz,f=frameAt(F,best.d+along);return {f,d:f.d,lat:(x-f.x)*f.lx+(z-f.z)*f.lz,dist:Math.hypot(x-f.x,z-f.z)};}

// T-junctions: an end of road A within JOIN m of road B's centreline (away from B's own ends).
const JOIN=1;
export function junctions(network,ground){const all=(network?.roads||[]).map(r=>({r:{...r,crossings:[],junctionDistances:r.tie?[0]:[]},P:presetOf(r),F:frames(r,ground)})).filter(o=>o.F.length>1),out=[];
 for(const A of all)for(const end of [0,1]){const e=end?A.F.at(-1):A.F[0];
  for(const B of all){if(B===A)continue;const n=nearestOn(B.F,e.x,e.z);if(n.dist>JOIN||n.d<2||n.d>B.F.at(-1).d-2)continue;
   // into A, away from the junction
   const a=end?[-e.tx,-e.tz]:[e.tx,e.tz],s=Math.sign(a[0]*n.f.lx+a[1]*n.f.lz)||1;out.push({A,B,end,at:n.f,side:s,a});break;}}
 // Match the joining road's longitudinal level to the host at the mouth.
 for(const j of out){const end=j.end?j.A.F.at(-1):j.A.F[0],cs=[corner(j,1),corner(j,-1)].filter(Boolean),aReach=Math.max(...cs.map(c=>c.uA)),bReach=Math.max(...cs.map(c=>Math.abs(c.tB)));
  for(const [road,at,reach] of [[j.A,end.d,aReach],[j.B,j.at.d,bReach]])for(const f of road.F){const d=Math.abs(f.d-at),u=Math.min(1,Math.max(0,(d-reach)/20));f.y=j.at.y*(1-u)+f.y*u;
   if(road.r.standard==='sandbox'&&u<1){const axis=road===j.B?[j.at.tx,j.at.tz]:j.end?[-j.a[0],-j.a[1]]:j.a,along=f.d-at;f.x=(j.at.x+axis[0]*along)*(1-u)+f.x*u;f.z=(j.at.z+axis[1]*along)*(1-u)+f.z*u;const tx=axis[0]*(1-u)+f.tx*u,tz=axis[1]*(1-u)+f.tz*u,l=Math.hypot(tx,tz);f.tx=tx/l;f.tz=tz/l;f.lx=f.tz;f.lz=-f.tx;}
  }
 }
 for(const j of out){j.A.r.junctionDistances.push(j.end?j.A.F.at(-1).d:0);j.B.r.junctionDistances.push(j.at.d);
  if(j.A.r.standard!=='sandbox')continue;const cs=[corner(j,1),corner(j,-1)].filter(Boolean),reach=Math.max(...cs.map(c=>c.uA))+6;
  const d=j.end?j.A.F.at(-1).d-reach:reach;
  if(d>8&&d<j.A.F.at(-1).d-8&&!j.A.r.crossings.some(c=>Math.abs(c-d)<12))j.A.r.crossings.push(d);
 }
 return {roads:all,joins:out};}

// 2D helpers
const isect=(p,u,q,v)=>{const det=u[0]*v[1]-u[1]*v[0];if(Math.abs(det)<1e-6)return null;const t=((q[0]-p[0])*v[1]-(q[1]-p[1])*v[0])/det;return [p[0]+u[0]*t,p[1]+u[1]*t];};
const add=(p,v,k=1)=>[p[0]+v[0]*k,p[1]+v[1]*k],dot=(u,v)=>u[0]*v[0]+u[1]*v[1];
// One kerb return: B's kerb line on the mouth side and A's kerb line on corner c (±1, A's own lateral), a CORNER m arc between them.
// Returns the footpath patch outline, the arc, where B's footpath stops (along B) and where A's starts (from the junction, along A).
function corner(j,c){const {A,B,at,side:s,a}=j,hB=B.P.carriageway/2,fB=B.P.footpath,hA=A.P.carriageway/2,fA=A.P.footpath,R=Math.min(CORNER,Math.max(1,hA+fA));
 const J=[at.x,at.z],tB=[at.tx,at.tz],m=[at.lx*s,at.lz*s],q=[a[1]*c,-a[0]*c];// q: A's lateral on corner c (left of the direction into A for c=+1)
 const C=isect(add(J,m,hB+R),tB,add(J,q,hA+R),a);if(!C)return null;
 const T1=add(C,m,-R),T2=add(C,q,-R),O=isect(add(J,m,hB+fB),tB,add(J,q,hA+fA),a)||add(T1,m,fB);
 let a1=Math.atan2(T1[1]-C[1],T1[0]-C[0]),a2=Math.atan2(T2[1]-C[1],T2[0]-C[0]);while(a2-a1>Math.PI)a2-=2*Math.PI;while(a2-a1<-Math.PI)a2+=2*Math.PI;
 const arc=Array.from({length:9},(_,i)=>{const t=a1+(a2-a1)*i/8;return [C[0]+R*Math.cos(t),C[1]+R*Math.sin(t)];});
 return {outline:[add(T1,m,fB),...arc.map(p=>A.r.standard==='sandbox'?add(p,[C[0]-p[0],C[1]-p[1]],.125/R):p),add(T2,q,fA),O],arc,road:[isect(add(J,m,hB),tB,add(J,q,hA),a),...arc],centre:C,radius:R,tB:dot([T1[0]-J[0],T1[1]-J[1]],tB),uA:dot([T2[0]-J[0],T2[1]-J[1]],a)};}

// Geometry buffers per material.
function sink(){const bufs=new Map();
 const buf=(mat,pos)=>{let cells=bufs.get(mat);if(!cells)bufs.set(mat,cells=new Map());const cell=Math.floor(pos[0]/240)+','+Math.floor(pos[2]/240);let b=cells.get(cell);if(!b)cells.set(cell,b={pos:[],idx:[]});return b;};
 return {tri(mat,pts){if(!pts.length)return;const b=buf(mat,pts[0]),n=b.pos.length/3;for(const p of pts)b.pos.push(...p);for(let i=1;i+1<pts.length;i++)b.idx.push(n,n+i+1,n+i);},
 raw(mat,pos,idx){if(!pos.length)return;const b=buf(mat,pos),n=b.pos.length/3;for(const v of pos)b.pos.push(v);for(const i of idx)b.idx.push(i+n);},
 meshes(name){return [...bufs].flatMap(([mat,cells])=>[...cells].map(([cell,{pos,idx}])=>{const g=new T.BufferGeometry();g.setAttribute('position',new T.Float32BufferAttribute(pos,3));g.setAttribute('uv',new T.Float32BufferAttribute(Array.from({length:pos.length/3*2},(_,i)=>pos[(i>>1)*3+(i&1?2:0)]/5),2));g.setIndex(idx);g.computeVertexNormals();const m=new T.Mesh(g,mat);m.name=name;m.userData.cell=cell;m.receiveShadow=true;return m;}));}};
}
// Strip between laterals la..lb along F from d0 to d1, at height y(f)+dy; up=true faces up.
function strip(out,mat,F,d0,d1,la,lb,dy){if(d1-d0<.05)return;if(d1-d0>120.001){for(let a=d0;a<d1;a+=120)strip(out,mat,F,a,Math.min(a+120,d1),la,lb,dy);return;}const ds=[d0,...F.map(f=>f.d).filter(d=>d>d0&&d<d1),...(dy?.breaks||[]).filter(d=>d>d0&&d<d1),d1].sort((a,b)=>a-b),pos=[],idx=[];
 ds.forEach((d,i)=>{const f=frameAt(F,d);for(const l of [la,lb])pos.push(f.x+f.lx*l,f.y+(typeof dy==='function'?dy(d,l):dy)+(f.crossSlope||0)*l,f.z+f.lz*l);if(i){const k=i*2;idx.push(k-2,k-1,k,k-1,k+1,k);}});
 if(la<lb)for(let i=0;i<idx.length;i+=3)[idx[i+1],idx[i+2]]=[idx[i+2],idx[i+1]];out.raw(mat,pos,idx);}// face up
// Vertical face along lateral l from d0 to d1, between heights lo..hi above the road, facing towards side (±1 lateral).
function face(out,mat,F,d0,d1,l,lo,hi,side){if(d1-d0<.05)return;if(d1-d0>120.001){for(let a=d0;a<d1;a+=120)face(out,mat,F,a,Math.min(a+120,d1),l,lo,hi,side);return;}const ds=[d0,...F.map(f=>f.d).filter(d=>d>d0&&d<d1),d1],pos=[],idx=[];
 ds.forEach((d,i)=>{const f=frameAt(F,d);pos.push(f.x+f.lx*l,f.y+lo,f.z+f.lz*l,f.x+f.lx*l,f.y+hi,f.z+f.lz*l);if(i){const k=i*2;idx.push(...(side>0?[k-2,k,k-1,k-1,k,k+1]:[k-2,k-1,k,k-1,k+1,k]));}});out.raw(mat,pos,idx);}
// Interval list minus gaps → pieces.
const minus=(a,b,gaps)=>{let out=[[a,b]];for(const [g0,g1] of gaps)out=out.flatMap(([p,q])=>g1<=p||g0>=q?[[p,q]]:[...(g0>p?[[p,g0]]:[]),...(g1<q?[[g1,q]]:[])]);return out;};
const dashes=(a,b,on=3,off=6)=>{const out=[];for(let d=Math.ceil(a/(on+off))*(on+off);d<b;d+=on+off)out.push([d,Math.min(b,d+on)]);return out;};

// Walking queries use the exact generated surface triangles (including kerb returns and turning heads).
// A small spatial index avoids raycasting the whole city and preserves the rendered terrain interpolation.
let activeSurface=()=>null;
export const streetHeight=(x,z)=>activeSurface(x,z);
export function surfaceSampler(meshes){const B=16,bins=new Map();
 for(const mesh of meshes){const geo=mesh.geometry,p=geo.attributes.position,index=geo.index?.array||Array.from({length:p.count},(_,i)=>i);
  for(let k=0;k<index.length;k+=3){const a=index[k],b=index[k+1],c=index[k+2],t=[p.getX(a),p.getY(a),p.getZ(a),p.getX(b),p.getY(b),p.getZ(b),p.getX(c),p.getY(c),p.getZ(c)],det=(t[5]-t[8])*(t[0]-t[6])+(t[6]-t[3])*(t[2]-t[8]);
   if(Math.abs(det)<1e-8)continue;t.push(det);
   for(let i=Math.floor(Math.min(t[0],t[3],t[6])/B);i<=Math.floor(Math.max(t[0],t[3],t[6])/B);i++)for(let j=Math.floor(Math.min(t[2],t[5],t[8])/B);j<=Math.floor(Math.max(t[2],t[5],t[8])/B);j++){const key=i+','+j;if(!bins.has(key))bins.set(key,[]);bins.get(key).push(t);}
  }
 }
 return (x,z)=>{let height=null;for(const t of bins.get(Math.floor(x/B)+','+Math.floor(z/B))||[]){const u=((t[5]-t[8])*(x-t[6])+(t[6]-t[3])*(z-t[8]))/t[9],v=((t[8]-t[2])*(x-t[6])+(t[0]-t[6])*(z-t[8]))/t[9],w=1-u-v;
  if(u>=-1e-4&&v>=-1e-4&&w>=-1e-4){const y=u*t[1]+v*t[4]+w*t[7];height=height===null?y:Math.max(height,y);}}
  return height;};
}

// mats: {road, walk, walkGrey, walkBuff, grass, white, kerb} (environment.js materials; plain fallbacks otherwise).
export function buildNetwork(network,{mats={},ground=()=>0}={}){const g=new T.Group();g.name='Drawn street network';if(!network){activeSurface=()=>null;return g;}
 const fallback=(c,r=.95)=>new T.MeshStandardMaterial({color:c,roughness:r});
 const M={road:mats.road||fallback(0x4b4f4d,.9),red:mats.walk||fallback(0x97604f),grey:mats.walkGrey||fallback(0x8d918c),buff:mats.walkBuff||fallback(0xb5a98c),grass:mats.grass||fallback(0x55663c,1),white:mats.white||fallback(0xece8d3,.8),kerb:mats.concrete||Object.assign(fallback(0xc6c2ac,.9),{side:T.DoubleSide})};// kerb faces are seen from either side
 const jointMat=mats.kerbJoint||fallback(0x656960,1);
 const out=sink(),edges=[],{roads,joins}=junctions(network,ground),cuts=new Map(),starts=new Map();// cuts: road → side → [[d0,d1]] footpath gaps; starts: road → end → {carriageway, footpath by corner}
 function addKerb(length,point){if(length>120){for(let a=0;a<length;a+=120)addKerb(Math.min(120,length-a),t=>point(a+t));return;}for(const [i,g] of sweptKerbs(length,point).entries()){out.raw(i?jointMat:M.kerb,[...g.attributes.position.array],[...g.index.array]);g.dispose();}}
 for(const j of joins){const cs=[1,-1].map(c=>({c,k:corner(j,c)})).filter(x=>x.k);
  const along=cs.map(x=>j.at.d+x.k.tB);if(along.length===2){const key=j.B;if(!cuts.has(key))cuts.set(key,{1:[],[-1]:[]});cuts.get(key)[j.side].push([Math.min(...along),Math.max(...along)]);}
  const hB=j.B.P.carriageway/2,sin=Math.abs(dot(j.a,[j.at.lx*j.side,j.at.lz*j.side]))||1;
  starts.set(j.A.r.id+':'+j.end,{carriageway:Math.max(0,hB/sin-.25),foot:Object.fromEntries(cs.map(x=>[x.c,x.k.uA]))});
  // kerb-return footpath patch and its kerb face; carriageway wedge between A's end and B's kerb line
  const y=j.at.y;for(const {k} of cs){
   // Fill the road-side sector of the swept kerb return. The two rectangular
   // carriageway strips alone leave grass between their sharp corner and the arc.
   const sector=k.road.filter(Boolean),roadTris=T.ShapeUtils.triangulateShape(sector.map(p=>new T.Vector2(...p)),[]);out.raw(M.road,sector.flatMap(p=>[p[0],y+Y.road,p[1]]),roadTris.flatMap(t=>[t[0],t[2],t[1]]));
   const pts=k.outline,area=pts.reduce((s,p,i)=>{const q=pts[(i+1)%pts.length];return s+p[0]*q[1]-q[0]*p[1];},0),ring=area<0?pts:[...pts].reverse();
   const tris=T.ShapeUtils.triangulateShape(ring.map(p=>new T.Vector2(p[0],p[1])),[]),pos=ring.flatMap(p=>[p[0],y+Y.raised+(j.B.r.standard==='sandbox'?.025*Math.max(0,k.radius-Math.hypot(p[0]-k.centre[0],p[1]-k.centre[1])-.125):0),p[1]]);out.raw(M[j.B.r.footway||'red'],pos,tris.flatMap(t=>[t[0],t[2],t[1]]));
   const fp=[],fi=[];k.arc.forEach((p,i)=>{fp.push(p[0],y+Y.road,p[1],p[0],y+Y.raised,p[1]);if(i){const n=i*2;fi.push(n-2,n-1,n,n-1,n+1,n);}});if(j.B.r.standard!=='sandbox')out.raw(M.kerb,fp,fi);else{const F=k.arc.map((p,i)=>{const a=k.arc[Math.max(0,i-1)],b=k.arc[Math.min(k.arc.length-1,i+1)],len=Math.hypot(b[0]-a[0],b[1]-a[1]);return {x:p[0],z:p[1],nx:-(b[1]-a[1])/len,nz:(b[0]-a[0])/len};});const outside=k.outline[0];if((outside[0]-F[0].x)*F[0].nx+(outside[1]-F[0].z)*F[0].nz<0)F.forEach(f=>{f.nx*=-1;f.nz*=-1;});const run=[0];for(let i=1;i<F.length;i++)run.push(run.at(-1)+Math.hypot(F[i].x-F[i-1].x,F[i].z-F[i-1].z));const point=t=>{let i=1;while(i<F.length-1&&run[i]<t)i++;const u=(t-run[i-1])/(run[i]-run[i-1]),a=F[i-1],b=F[i];return {x:a.x+(b.x-a.x)*u,z:a.z+(b.z-a.z)*u,nx:a.nx+(b.nx-a.nx)*u,nz:a.nz+(b.nz-a.nz)*u,y:y+Y.raised,base:y+Y.road};};addKerb(run.at(-1),point);edges.push({road:j.B.r,kind:'corner',length:run.at(-1),point});}}
  const hA=j.A.P.carriageway/2;if(hA>0){const tB=[j.at.tx,j.at.tz],L1=add([j.at.x,j.at.z],[j.at.lx*j.side,j.at.lz*j.side],hB),u=starts.get(j.A.r.id+':'+j.end).carriageway;
   const q=[j.a[1],-j.a[0]],e1=add(add([j.at.x,j.at.z],j.a,u),q,hA),e2=add(add([j.at.x,j.at.z],j.a,u),q,-hA),p1=isect(e1,j.a,L1,tB),p2=isect(e2,j.a,L1,tB);
   if(p1&&p2){const quad=[e1,e2,p2,p1],a=quad.reduce((s,p,i)=>{const r=quad[(i+1)%4];return s+p[0]*r[1]-r[0]*p[1];},0),ring=a>0?quad:[...quad].reverse();out.tri(M.road,ring.map(p=>[p[0],y+Y.road,p[1]]));}}}
 for(const o of roads){const {r,P,F}=o,L=F.at(-1).d,h=P.carriageway/2,fw=M[r.footway||'red'],gap=cuts.get(o)||{1:[],[-1]:[]},s0=starts.get(r.id+':0'),s1=starts.get(r.id+':1');
  const c0=s0?s0.carriageway:0,c1=L-(s1?s1.carriageway:0);
  if(h>0){if(r.standard==='sandbox'){strip(out,M.road,F,c0,c1,-h,0,(d,l)=>streetLevel(r,d,l));strip(out,M.road,F,c0,c1,0,h,(d,l)=>streetLevel(r,d,l));}else strip(out,M.road,F,c0,c1,-h,h,Y.road);
   if(P.median){strip(out,M.grass,F,c0+3,c1-3,-P.median/2,P.median/2,Y.raised);for(const sd of [-1,1])face(out,M.kerb,F,c0+3,c1-3,sd*P.median/2,Y.road,Y.raised,sd);}
   const lane=(h-P.median/2)/2,marks=P.lines==='centre'?[0]:P.lines==='lanes'?[-(P.median/2+lane),P.median/2+lane]:[];
   for(const l of marks)for(const [a,b] of dashes(c0+2,c1-2))for(const [p,q] of minus(a,b,[...gap[1],...gap[-1],...(r.crossings||[]).map(c=>[c-3,c+3])]))strip(out,M.white,F,p,q,l-.06,l+.06,r.standard==='sandbox'?(d,x)=>streetLevel(r,d,x)+.008:Y.line);}
  for(const sd of [1,-1]){const a=s0?s0.foot[sd*1]??0:0,b=Math.min(L-(s1?s1.foot[-sd]??0:0),r.turningRadius?L-Math.sqrt(Math.max(0,r.turningRadius**2-h**2)):L);// corner c is A's own lateral; at the far end the sides swap
   for(const [p,q] of minus(a,b,gap[sd])){const lo=sd*h,hi=sd*(h+P.footpath),hk=r.standard==='sandbox';
    const level=hk?Object.assign((d,l)=>streetLevel(r,d,l),{breaks:r.crossings.flatMap(c=>[c-3.3,c-1.5,c+1.5,c+3.3])}):Y.raised;
    if(hk&&h){strip(out,fw,F,p,q,lo+sd*.125,lo+sd*1.8,level);strip(out,fw,F,p,q,lo+sd*1.8,hi,level);}else strip(out,fw,F,p,q,lo,hi,level);
    if(h>0&&hk){const point=t=>{const f=frameAt(F,p+t);return {x:f.x+f.lx*lo,z:f.z+f.lz*lo,nx:f.lx*sd,nz:f.lz*sd,y:f.y+streetLevel(r,p+t,lo+sd*.00001)+(f.crossSlope||0)*lo,base:f.y+Y.road+(f.crossSlope||0)*lo};};addKerb(q-p,point);edges.push({road:r,kind:'edge',side:sd,from:p,to:q,length:q-p,point,crossings:r.crossings.filter(c=>c>p&&c<q).map(c=>c-p)});strip(out,mats.channel||M.kerb,F,p,q,lo-sd*.3,lo,Y.road+.001);}
    else if(h>0)face(out,M.kerb,F,p,q,lo,Y.road,Y.raised,-sd);
    face(out,M.kerb,F,p,q,hi,-.3,hk?streetLevel(r,0,hi):Y.raised,sd);}}}
 // White zebra stripes, independent stud rows, and yellow 300 mm tactile tiles.
 const crossings=[];
 for(const {r,P,F} of roads)for(const d of r.crossings||[]){const h=P.carriageway/2,f=frameAt(F,d);crossings.push({road:r.id,d,f,half:h});
  for(const bar of zebraStripes(P.carriageway).whites)strip(out,M.white,F,d-1.5,d+1.5,bar.z-bar.d/2,bar.z+bar.d/2,(a,l)=>streetLevel(r,a,l)+.01);
  for(const side of [-1,1])strip(out,mats.tactile||M.buff,F,d-1.5,d+1.5,side*(h+.3),side*(h+.9),(a,l)=>streetLevel(r,a,l)+.012);
  const mark=(a,l,b,m,width)=>{const A=frameAt(F,a),B=frameAt(F,b),pts=[[A,l-width/2,a],[A,l+width/2,a],[B,m+width/2,b],[B,m-width/2,b]].map(([f,lat,d])=>[f.x+f.lx*lat,f.y+streetLevel(r,d,lat)+(f.crossSlope||0)*lat+.011,f.z+f.lz*lat]);const area=pts.reduce((sum,p,i)=>{const q=pts[(i+1)%pts.length];return sum+p[0]*q[2]-q[0]*p[2];},0);out.tri(M.white,area>0?pts:pts.reverse());};
  for(const end of [-1,1]){const available=Math.min(18.75,end<0?d-1.7:F.at(-1).d-d-1.7,...r.junctionDistances.filter(at=>(at-d)*end>0).map(at=>Math.abs(at-d)-12));const control=zebraControl(available);if(!control)continue;
   for(const side of [-1,1])for(const a of control.marks){const start=d+end*(1.6+a),mid=start+end*control.X/2,finish=start+end*control.X;mark(start,side*(h-.45),mid,side*(h-.85),.1);mark(mid,side*(h-.85),finish,side*(h-.45),.1);}
   const at=d+end*(1.6+1.1),side=-end;strip(out,M.white,F,at-.1,at+.1,side*.2,side*(h-.3),(a,l)=>streetLevel(r,a,l)+.01);
  }
  for(const end of [-1,1])for(let lat=-h+.5;lat<h-.4;lat+=.7)strip(out,M.white,F,d+end*1.65-.05,d+end*1.65+.05,lat-.05,lat+.05,(a,l)=>streetLevel(r,a,l)+.015);

 }
 g.userData.crossings=crossings;
 // OZP turning heads: an illustrative circular carriageway with a separate paved rim.
 // Reserve the complete disc in networkMask as well, so scenery cannot grow through it.
 for(const {r,P,F} of roads){if(!(r.turningRadius>0))continue;const f=F.at(-1),h=r.turningRadius,w=h+P.footpath,N=64;
  const start=Math.atan2(-f.tz,-f.tx)+Math.asin(Math.min(1,P.carriageway/2/h)),length=h*(2*Math.PI-2*Math.asin(Math.min(1,P.carriageway/2/h))),point=t=>{const a=start+t/h;return {x:f.x+h*Math.cos(a),z:f.z+h*Math.sin(a),nx:Math.cos(a),nz:Math.sin(a),y:f.y+Y.raised,base:f.y+Y.road};};
 if(r.standard==='sandbox'){addKerb(length,point);edges.push({road:r,kind:'corner',length,point});}
 for(let i=0;i<N;i++){const a=i*2*Math.PI/N,b=(i+1)*2*Math.PI/N,
   at=(t,rad,dy)=>[f.x+Math.cos(t)*rad,f.y+dy,f.z+Math.sin(t)*rad];
   out.tri(M.road,[[f.x,f.y+Y.road,f.z],at(a,h,Y.road),at(b,h,Y.road)]);
   const mouth=-Math.cos((a+b)/2)*f.tx-Math.sin((a+b)/2)*f.tz;
   if(mouth<Math.sqrt(1-(P.carriageway/2/h)**2))out.tri(M[r.footway||'red'],[at(a,h+(r.standard==='sandbox'?.125:0),Y.raised),at(a,w,Y.raised+(r.standard==='sandbox'?.025*(P.footpath-.125):0)),at(b,w,Y.raised+(r.standard==='sandbox'?.025*(P.footpath-.125):0)),at(b,h+(r.standard==='sandbox'?.125:0),Y.raised)]);
  }
 }
 for(const ar of network.areas||[]){if(ar.pts.length<3)continue;const grass=ar.finish==='grass',dy=grass?Y.grass:Y.area,mat=M[ar.finish]||M.buff;
  const shape=new T.Shape(ar.pts.map(([x,z])=>new T.Vector2(x,-z)));let geo=new T.ShapeGeometry(shape);geo.rotateX(-Math.PI/2);geo=new TessellateModifier(4,6).modify(geo);
  const p=geo.attributes.position;for(let i=0;i<p.count;i++)p.setY(i,ground(p.getX(i),p.getZ(i))+dy);const idx=geo.index?[...geo.index.array]:[...Array(p.count).keys()];out.raw(mat,[...p.array],idx);
  if(!grass){const ring=ar.pts,cw=ring.reduce((s,a,i)=>{const b=ring[(i+1)%ring.length];return s+a[0]*b[1]-b[0]*a[1];},0)>0;// edge faces facing out
   for(let i=0;i<ring.length;i++){const a=ring[i],b=ring[(i+1)%ring.length],n=Math.max(1,Math.ceil(Math.hypot(b[0]-a[0],b[1]-a[1])/4)),pos=[],ix=[];
    for(let k=0;k<=n;k++){const x=a[0]+(b[0]-a[0])*k/n,z=a[1]+(b[1]-a[1])*k/n,y=ground(x,z);pos.push(x,y-.3,z,x,y+dy,z);if(k){const m=k*2;ix.push(...(cw?[m-2,m-1,m,m-1,m+1,m]:[m-2,m,m-1,m-1,m,m+1]));}}out.raw(M.kerb,pos,ix);}}}
 for(const m of out.meshes('Drawn street network'))g.add(m);g.userData.edges=edges;activeSurface=surfaceSampler(g.children);g.userData.surfaceHeight=activeSurface;return g;}

// Point tests for the scenery: on a carriageway, anywhere on a drawn street (kerb to kerb plus footpaths), or on a paved area.
export function networkMask(network,ground=()=>0){const samples=[],B=8,map=new Map();
 for(const r of network?.roads||[]){const P=presetOf(r);for(const f of frames(r,ground))samples.push({x:f.x,z:f.z,h:P.carriageway/2,w:P.carriageway/2+P.footpath});}
 for(const s of samples){const k=Math.floor(s.x/B)*100003+Math.floor(s.z/B);if(!map.has(k))map.set(k,[]);map.get(k).push(s);}
 const heads=(network?.roads||[]).filter(r=>r.turningRadius>0).map(r=>({x:r.pts.at(-1)[0],z:r.pts.at(-1)[1],h:r.turningRadius,w:r.turningRadius+presetOf(r).footpath}));
 const maxWidth=Math.max(0,...samples.map(s=>s.w));
 const near=(x,z,r,key)=>{if(heads.some(s=>Math.hypot(x-s.x,z-s.z)<s[key]+r))return true;const reach=Math.ceil((Math.max(0,r)+maxWidth+.5)/B);for(let i=-reach;i<=reach;i++)for(let j=-reach;j<=reach;j++)for(const s of map.get((Math.floor(x/B)+i)*100003+Math.floor(z/B)+j)||[])if(Math.hypot(x-s.x,z-s.z)<s[key]+r+.5)return true;return false;};
 const paved=(network?.areas||[]).filter(a=>a.finish!=='grass'&&a.pts.length>2).map(a=>({poly:a.pts,x0:Math.min(...a.pts.map(p=>p[0])),x1:Math.max(...a.pts.map(p=>p[0])),z0:Math.min(...a.pts.map(p=>p[1])),z1:Math.max(...a.pts.map(p=>p[1]))}));
 const areas=(network?.areas||[]).filter(a=>a.pts.length>2);
 const onPaving=(x,z,r=0)=>paved.some(a=>x>=a.x0-r&&x<=a.x1+r&&z>=a.z0-r&&z<=a.z1+r&&circleIntersects(x,z,r,a.poly));
 const onArea=(x,z,r=0)=>areas.some(a=>circleIntersects(x,z,r,a.pts));
 return {onRoad:(x,z,r=0)=>near(x,z,r,'h'),onStreet:(x,z,r=0)=>near(x,z,r,'w'),onPaving,blocked:(x,z,r=0)=>near(x,z,r,'w')||onPaving(x,z,r),buildingBlocked:(x,z,r=0)=>near(x,z,r,'w')||onArea(x,z,r)};}

// SGMTS corridor first: does a road (with its footpaths) or an area outline touch the corridor reserve? Returns the first clash point or null.
let discs=null;
export function reserveClash(pts,{width=0,closed=false}={}){discs??=corridorReserve();const line=[...pts,...(closed?[pts[0]]:[])],test=[];
 for(let i=1;i<line.length;i++){const [ax,az]=line[i-1],[bx,bz]=line[i],n=Math.max(1,Math.ceil(Math.hypot(bx-ax,bz-az)/2));for(let k=0;k<=n;k++)test.push([ax+(bx-ax)*k/n,az+(bz-az)*k/n]);}
 if(line.length===1)test.push(line[0]);
 for(const [x,z] of test)for(const d of discs)if(Math.hypot(x-d.x,z-d.z)<d.r+width)return [x,z];return null;}

// Lower the ground beneath graded streets, including the 8 m terrain-grid apron.
// Junction frames use the same flattened levels as the rendered pavement.
export function streetTerrain(network,ground){
 const cells=new Map(),B=16;
 for(const {r,F} of junctions(network,ground).roads)for(const f of F){const w=(r.turningRadius&&f===F.at(-1)?r.turningRadius+presetOf(r).footpath:halfWidth(r))+12;
  for(let x=Math.floor((f.x-w)/B);x<=Math.floor((f.x+w)/B);x++)for(let z=Math.floor((f.z-w)/B);z<=Math.floor((f.z+w)/B);z++){const key=x+','+z;if(!cells.has(key))cells.set(key,[]);cells.get(key).push({f,w});}}
 return (x,z,y)=>{for(const {f,w} of cells.get(Math.floor(x/B)+','+Math.floor(z/B))||[])if((x-f.x)**2+(z-f.z)**2<w*w)y=Math.min(y,f.y-.3);return y;};
}
