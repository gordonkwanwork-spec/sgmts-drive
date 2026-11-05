// Modern Hong Kong building kit: site planning. Pure JS (no Three.js), so node tests import it.
// planSite(kit, site, typeId, seed, sink) turns any lot outline into placements of Blender modules
// (public/hk-modern/kit.glb, built by scripts/build-hk-modern-kit.py) plus "shell" prisms (far LOD, roofs, shadows).
// Every number comes from HK-BUILDING-RESEARCH.md. Module frame: x along the facade 0..w, y up 0..h, +z outward.

// Facade families: prefix → [width m, height m, variants]. scripts/build-hk-modern-kit.py builds the same names.
export const FAMILIES={
 // residential
 HB:[3,2.75,6],HK:[3,2.75,3],HE:[3.2,2.75,3],HC:[3,2.75,2],HL:[3,4.5,3],TB:[3.3,2.75,6],
 SG:[3.2,2.9,4],SF:[3.2,2.9,4],SE:[3,2.9,2],PB:[2.8,2.8,6],PW:[3,2.8,3],LS:[2,2.8,3],
 GB:[3.1,3.1,6],GU:[2,3.1,2],RF:[3,3.1,2],RT:[3,1.2,3],RG:[4,4.5,3],CF:[3,3,2],
 VF:[4.05,2.74,4],VS:[4.05,2.74,3],VG:[4.05,2.74,3],VT:[4.05,1.1,2],
 // offices and commercial
 CW:[3,4.2,6],CL:[3,6,3],CP:[6,5,4],MB:[3,4.8,2],CT:[3,6,3],OC:[3,3.6,6],OP:[4.5,4.5,4],GZ:[3,3.9,6],OT:[3,1.2,2],
 // industrial and logistics
 FS:[3.3,3.9,6],FG:[4,5,4],FA:[4,5,2],FC:[3,3.9,2],EG:[4,4,4],IT:[3,1.3,2],
 LB:[6,6.5,4],LD:[6,6.5,2],LK:[6,6.5,3],GD:[5.5,5,3],CS:[6,6,2],LT:[6,1.5,2],
 // malls, podiums, decks
 MP:[6,5.5,4],MA:[6,5.5,2],MS:[6,5.5,3],MK:[6,3.2,3],MG:[6,6,5],PS:[4.5,5,4],DW:[6,5,4],DP:[8,9,1],PE:[3,1.3,2],MT:[6,2,2],
 BL:[3,3,1],
};
// Free-standing props (origin at their base centre, x/z on the ground, front +z).
export const PROPS=['TANK','LIFT','CROWNP','CROWNA','CROWNS','NAME0','NAME1','NAME2','NAME3','NAME4','NAME5','VNAME0','VNAME1','VNAME2','VNAME3',
 'BMU','LOGO0','LOGO1','LOGO2','LOGO3','LOGO4','LOGO5','BILL0','BILL1','SIGNF0','SIGNF1','SIGNF2','CHIM','HELIX','RAMP','MAST','TRUCK','CAR','CONT',
 'TREE0','TREE1','TREE2','PALM','SHRUB','LAWN','POOL','PAV','FB','STAIR','COND','AN0','BLADE0','BLADE1','BLADE2','BLADE3','SCREEN','CANOPY','GATE'];

// ---------------------------------------------------------------- random, colour
export const hash=s=>{let h=2166136261;for(const c of String(s))h=Math.imul(h^c.charCodeAt(0),16777619);return h>>>0;};
export function random(seed){let s=seed||1;const r=()=>{s=Math.imul(s^s>>>15,2246822507);s=Math.imul(s^s>>>13,3266489909);s^=s>>>16;return (s>>>0)/4294967296;};
 r.pick=a=>a[Math.floor(r()*a.length)];r.range=([a,b])=>a+r()*(b-a);r.int=([a,b])=>a+Math.floor(r()*(b-a+1));r.chance=p=>r()<p;return r;}
const rgb=h=>{h=h.replace('#','');return [0,2,4].map(i=>parseInt(h.slice(i,i+2),16)/255);};
function toHsl([r,g,b]){const mx=Math.max(r,g,b),mn=Math.min(r,g,b),l=(mx+mn)/2;if(mx===mn)return [0,0,l];const d=mx-mn,s=l>.5?d/(2-mx-mn):d/(mx+mn);
 const h=mx===r?(g-b)/d+(g<b?6:0):mx===g?(b-r)/d+2:(r-g)/d+4;return [h/6,s,l];}
function fromHsl([h,s,l]){if(!s)return [l,l,l];const q=l<.5?l*(1+s):l+s-l*s,p=2*l-q,f=t=>{t=(t+1)%1;return t<1/6?p+(q-p)*6*t:t<.5?q:t<2/3?p+(q-p)*(2/3-t)*6:p;};return [f(h+1/3),f(h),f(h-1/3)];}
// Colour as [r,g,b] 0..1 with a small seeded jitter, like hk-kit.js does for its walls.
export function tone(hex,r,amount=1){const [h,s,l]=toHsl(rgb(hex));return fromHsl([h,Math.min(1,s*(1+(r()-.5)*.3*amount)),Math.min(.97,Math.max(.03,l*(1+(r()-.5)*.12*amount)))]);}
export const solid=hex=>rgb(hex);
const WHITE=[1,1,1];

// ---------------------------------------------------------------- polygons (x/z plane, {x,z} points)
export const area=P=>{let a=0;for(let i=0;i<P.length;i++){const p=P[i],q=P[(i+1)%P.length];a+=p.x*q.z-q.x*p.z;}return a/2;};
// Clockwise (area < 0) so that (−dz, dx) is outward on every edge; tags[i] belongs to the edge P[i] → P[i+1].
export function orient(P,tags){if(area(P)<0)return {P,tags};const n=P.length;return {P:[...P].reverse(),tags:tags&&P.map((_,j)=>tags[((n-2-j)%n+n)%n])};}
export const inside=(P,x,z)=>{let c=false;for(let i=0,j=P.length-1;i<P.length;j=i++){const a=P[i],b=P[j];if((a.z>z)!==(b.z>z)&&x<(b.x-a.x)*(z-a.z)/(b.z-a.z)+a.x)c=!c;}return c;};
const cross2=(a,b,c)=>(b.x-a.x)*(c.z-a.z)-(b.z-a.z)*(c.x-a.x);
const crosses=(a,b,c,d)=>{const d1=cross2(c,d,a),d2=cross2(c,d,b),d3=cross2(a,b,c),d4=cross2(a,b,d);return ((d1>1e-9&&d2<-1e-9)||(d1<-1e-9&&d2>1e-9))&&((d3>1e-9&&d4<-1e-9)||(d3<-1e-9&&d4>1e-9));};
export function polyInside(A,B){if(!A.every(p=>inside(B,p.x,p.z)))return false;for(let i=0;i<A.length;i++)for(let j=0;j<B.length;j++)if(crosses(A[i],A[(i+1)%A.length],B[j],B[(j+1)%B.length]))return false;return true;}
export const centroid=P=>{let x=0,z=0;for(const p of P){x+=p.x;z+=p.z;}return {x:x/P.length,z:z/P.length};};
// Offset every edge inward by d[i] (number or per-edge array); clockwise polygons only. Edges that collapse are dropped.
export function inset(P,d,tags){let pts=P,tg=tags??P.map(()=>null),dd=P.map((_,i)=>Array.isArray(d)?d[i]:d);
 for(let pass=0;pass<8;pass++){const n=pts.length;if(n<3)return null;const L=pts.map((a,i)=>{const b=pts[(i+1)%n],dx=b.x-a.x,dz=b.z-a.z,l=Math.hypot(dx,dz)||1e-9,ix=dz/l,iz=-dx/l;return {a:{x:a.x+ix*dd[i],z:a.z+iz*dd[i]},dx:dx/l,dz:dz/l};});
  const out=L.map((e,i)=>{const p=L[(i+n-1)%n],den=p.dx*e.dz-p.dz*e.dx;if(Math.abs(den)<1e-6)return e.a;const t=((e.a.x-p.a.x)*e.dz-(e.a.z-p.a.z)*e.dx)/den;return {x:p.a.x+p.dx*t,z:p.a.z+p.dz*t};});
  const bad=out.findIndex((a,i)=>{const b=out[(i+1)%n];return (b.x-a.x)*L[i].dx+(b.z-a.z)*L[i].dz<.05;});
  if(bad<0)return area(out)<-1?{P:out,tags:tg}:null;
  pts=pts.filter((_,i)=>i!==(bad+1)%n);tg=tg.filter((_,i)=>i!==bad);dd=dd.filter((_,i)=>i!==bad);
  // dropping vertex bad+1 removes edge `bad`; the edge before it now runs to the old next vertex
 }return null;}
// Keep the part of P with nx·x + nz·z ≤ c. New edges along the cut get tag 'cut'.
export function clip(P,tags,nx,nz,c){const out=[],tg=[],n=P.length,f=p=>nx*p.x+nz*p.z-c;
 for(let i=0;i<n;i++){const a=P[i],b=P[(i+1)%n],fa=f(a),fb=f(b),t=tags?.[i]??null;
  if(fa<=0){out.push(a);tg.push(t);}
  if((fa<=0)!==(fb<=0)){const s=fa/(fa-fb);out.push({x:a.x+(b.x-a.x)*s,z:a.z+(b.z-a.z)*s});tg.push(fa<=0?'cut':t);}}
 return out.length>=3?{P:out,tags:tg}:null;}

// ---------------------------------------------------------------- tower plan shapes (metres, centred, front = +z)
// Each returns {pts, tags}: f = flat bays, e = wing end, c = core face, s = light slot, u = utility, g = gallery.
const P2=a=>a.map(([x,z])=>({x,z}));
function crossPlan(rx,rz,hw,ch=0,slot=0){const pts=[],tags=[];
 // Build one quadrant at a time, clockwise (x right, z toward the front).
 const q=[[hw,rz,'e'],[-hw,rz,'f'],[-hw,hw+ch,ch?'c':'f'],[-hw-ch,hw,'f'],[-rx,hw,'e'],[-rx,-hw,'f'],[-hw-ch,-hw,ch?'c':'f'],[-hw,-hw-ch,'f'],[-hw,-rz,'e'],[hw,-rz,'f'],[hw,-hw-ch,ch?'c':'f'],[hw+ch,-hw,'f'],[rx,-hw,'e'],[rx,hw,'f'],[hw+ch,hw,ch?'c':'f'],[hw,hw+ch,'f']];
 for(const [x,z,t] of q){pts.push({x,z});tags.push(t);}
 // the list above is counter-clockwise in x/z math terms; orient() flips it
 if(slot){// a light slot cut into each wing tip
  const out=[],tg=[];pts.forEach((p,i)=>{out.push(p);tg.push(tags[i]);if(tags[i]==='e'){const q2=pts[(i+1)%pts.length],mx=(p.x+q2.x)/2,mz=(p.z+q2.z)/2,dx=Math.sign(q2.x-p.x),dz=Math.sign(q2.z-p.z),ix=-Math.sign(mx)*(Math.abs(mx)>Math.abs(mz)?1:0),iz=-Math.sign(mz)*(Math.abs(mz)>=Math.abs(mx)?1:0);
   const a={x:mx-dx*slot/2,z:mz-dz*slot/2},b={x:a.x+ix*slot*2.4,z:a.z+iz*slot*2.4},c={x:b.x+dx*slot,z:b.z+dz*slot},d={x:mx+dx*slot/2,z:mz+dz*slot/2};
   tg[tg.length-1]='e';out.push(a,b,c,d);tg.push('s','s','s','e');}});return {pts:out,tags:tg};}
 return {pts,tags};}
function tridentPlan(R,hw){const pts=[],tags=[],k=hw/Math.sin(Math.PI/3);
 for(let i=0;i<3;i++){const a=Math.PI/2+i*2*Math.PI/3,u={x:Math.cos(a),z:Math.sin(a)},p={x:-u.z,z:u.x},m=a+Math.PI/3;
  pts.push({x:R*u.x-hw*p.x,z:R*u.z-hw*p.z},{x:R*u.x+hw*p.x,z:R*u.z+hw*p.z},{x:k*Math.cos(m),z:k*Math.sin(m)});tags.push('e','f','f');}
 return {pts,tags};}
const rectPlan=(w,d,ch=0,tags=['f','f','f','f'])=>ch?{pts:P2([[w/2-ch,d/2],[-w/2+ch,d/2],[-w/2,d/2-ch],[-w/2,-d/2+ch],[-w/2+ch,-d/2],[w/2-ch,-d/2],[w/2,-d/2+ch],[w/2,d/2-ch]]),tags:['f','f','f','f','f','f','f','f']}
 :{pts:P2([[w/2,d/2],[-w/2,d/2],[-w/2,-d/2],[w/2,-d/2]]),tags};
function notchedPlan(w,n){const h=w/2;return {pts:P2([[h-n,h],[-h+n,h],[-h+n,h-n],[-h,h-n],[-h,-h+n],[-h+n,-h+n],[-h+n,-h],[h-n,-h],[h-n,-h+n],[h,-h+n],[h,h-n],[h-n,h-n]]),tags:['f','u','u','f','u','u','f','u','u','f','u','u']};}
function iPlan(L,d,wing,ww){const a=L/2,b=d/2,c=wing/2;return {pts:P2([[a,c],[a-ww,c],[a-ww,b],[-a+ww,b],[-a+ww,c],[-a,c],[-a,-c],[-a+ww,-c],[-a+ww,-b],[a-ww,-b],[a-ww,-c],[a,-c]]),tags:['e','f','f','f','f','e','f','f','f','f','f','f']};}
export const PLANS={
 harmony:()=>crossPlan(26,24,8,4),concord:()=>crossPlan(19,15,6.5,3.5),trident:()=>tridentPlan(26,5.75),
 cross:()=>crossPlan(16,16,6.5),crossSlot:()=>crossPlan(16.5,16.5,6.5,0,1.8),newCross:()=>crossPlan(22.5,17.5,6.5,2.5),
 notched:()=>notchedPlan(30,3.5),squareGlass:()=>rectPlan(28,28,3),slabGlass:()=>rectPlan(46,20,0,['f','u','f','u']),
};

// ---------------------------------------------------------------- output sink (typed arrays; one per city render)
export class Sink{
 constructor(){this.n=0;this.cap=4096;this.mod=new Uint16Array(this.cap);this.m=new Float32Array(this.cap*12);this.sty=new Uint32Array(this.cap);this.lit=new Float32Array(this.cap);this.rec=new Uint32Array(this.cap);
  this.mods=[];this.modIndex=new Map();this.styles=[];this.records=[];this.shells=[];this.missing=new Set();}
 grow(){const c=this.cap*2,g=(A,k=1)=>{const B=new A.constructor(c*k);B.set(A);return B;};this.mod=g(this.mod);this.m=g(this.m,12);this.sty=g(this.sty);this.lit=g(this.lit);this.rec=g(this.rec);this.cap=c;}
 style(s){this.styles.push({wall:WHITE,trim:WHITE,frame:WHITE,glass:[.3,.38,.42],glow:WHITE,finish:0,glowLevel:1,...s});return this.styles.length-1;}
 add(name,M,sty,lit,rec){if(this.n===this.cap)this.grow();let k=this.modIndex.get(name);if(k===undefined){k=this.mods.length;this.mods.push(name);this.modIndex.set(name,k);}
  const i=this.n++;this.mod[i]=k;this.m.set(M,i*12);this.sty[i]=sty;this.lit[i]=lit;this.rec[i]=rec;return i;}
}

// ---------------------------------------------------------------- facades
const SPLIT=Math.cos(35*Math.PI/180);
// Clockwise outline + per-edge roles → chains of one role, split at sharp corners (so a bay never wraps a corner).
export function chains(P,roles){const n=P.length;const E=P.map((a,i)=>{const b=P[(i+1)%n],dx=b.x-a.x,dz=b.z-a.z,L=Math.hypot(dx,dz)||1e-9;return {a,b,L,dx:dx/L,dz:dz/L,role:roles[i]};});
 let start=E.findIndex((e,i)=>{const p=E[(i+n-1)%n];return p.role!==e.role||p.dx*e.dx+p.dz*e.dz<SPLIT;});if(start<0)start=0;
 const out=[];for(let k=0;k<n;k++){const e=E[(start+k)%n],last=out.at(-1),prev=last?.edges.at(-1);
  if(last&&prev.role===e.role&&prev.dx*e.dx+prev.dz*e.dz>=SPLIT)last.edges.push(e);else out.push({role:e.role,edges:[e]});}
 for(const c of out){c.pts=[c.edges[0].a,...c.edges.map(e=>e.b)];c.L=c.edges.reduce((s,e)=>s+e.L,0);}
 return out.filter(c=>c.L>.4);}
const along=(pts,s)=>{for(let i=1;i<pts.length;i++){const a=pts[i-1],b=pts[i],L=Math.hypot(b.x-a.x,b.z-a.z);if(s<=L+1e-9||i===pts.length-1){const t=L?Math.min(1,s/L):0;return {x:a.x+(b.x-a.x)*t,z:a.z+(b.z-a.z)*t};}s-=L;}return pts[0];};
export const bays=(c,w)=>{const n=Math.max(1,Math.round(c.L/w));return Array.from({length:n},(_,i)=>[along(c.pts,c.L*i/n),along(c.pts,c.L*(i+1)/n)]);};
// Facade pose: module x stretched to the chord A→B, y scaled to the row height, z outward.
export function pose(A,B,y,w,sy){const dx=B.x-A.x,dz=B.z-A.z,L=Math.hypot(dx,dz)||1e-9,ux=dx/L,uz=dz/L,sx=L/w;return [ux*sx,0,uz*sx, 0,sy,0, -uz,0,ux, A.x,y,A.z];}
export function propPose(x,y,z,yaw=0,sx=1,sy=1,sz=1){const c=Math.cos(yaw),s=Math.sin(yaw);return [c*sx,0,-s*sx, 0,sy,0, s*sz,0,c*sz, x,y,z];}

// Facade systems (curtain wall, ribbons, louvres, parapets, crowns): one variant per building. Other families are
// owner add-ons (A/C, laundry, grilles, boarded panes) and vary by column and floor.
const UNIFORM=new Set(['CW','OC','LB','MK','CT','MB','CL','LT','OT','RT','IT','PE','MT','CF','VT','DW','GZ']);
// ---------------------------------------------------------------- planning context
const famMods=(kit,f)=>kit.families?.[f]??[];
function makeContext(kit,site,typeId,seed,sink){
 const r=random(hash(site.id)^hash(typeId)^Math.imul(seed||0,2654435761));
 // Site frame: yaw turns local +z (front) to the street. Frontage lots: the longest front edge.
 const O=orient(site.poly.map(p=>({x:p.x,z:p.z})),site.edges?.map(e=>e.role));let yaw=site.yaw??0;
 if(site.edges){let best=0;O.P.forEach((a,i)=>{if(O.tags[i]!=='front')return;const b=O.P[(i+1)%O.P.length],L=Math.hypot(b.x-a.x,b.z-a.z);if(L>best){best=L;yaw=Math.atan2(-(b.z-a.z),b.x-a.x);}});}   // outward of a clockwise edge is (−dz, dx); yaw = atan2(ox, oz)
 const fx=Math.sin(yaw),fz=Math.cos(yaw),c=centroid(O.P);
 // Edge roles for the base: frontage lots keep theirs; free sites: front / side / rear by facing.
 const roles=O.P.map((a,i)=>{const t=O.tags?.[i];if(t)return t==='front'?'f':t==='party'?'p':'r';const b=O.P[(i+1)%O.P.length],dx=b.x-a.x,dz=b.z-a.z,L=Math.hypot(dx,dz)||1,ox=-dz/L,oz=dx/L,d=ox*fx+oz*fz;return d>.5?'f':d<-.5?'r':'x';});
 const toLocal=p=>{const dx=p.x-c.x,dz=p.z-c.z;return {u:dx*Math.cos(yaw)-dz*Math.sin(yaw),v:dx*Math.sin(yaw)+dz*Math.cos(yaw)};};
 const toWorld=(u,v)=>({x:c.x+u*Math.cos(yaw)+v*Math.sin(yaw),z:c.z-u*Math.sin(yaw)+v*Math.cos(yaw)});
 const loc=O.P.map(toLocal),U=[Math.min(...loc.map(p=>p.u)),Math.max(...loc.map(p=>p.u))],V=[Math.min(...loc.map(p=>p.v)),Math.max(...loc.map(p=>p.v))];
 let rec=0,colCache=new Map();const typ=new Map();
 const ctx={vol:0,r,kit,site,sink,yaw,poly:O.P,roles,c,U,V,toLocal,toWorld,width:U[1]-U[0],depth:V[1]-V[0],
  style:s=>sink.style(s),
  record(P,y0,y1){const cc=centroid(P);let rad=0;for(const p of P)rad=Math.max(rad,Math.hypot(p.x-cc.x,p.z-cc.z));rec=sink.records.length;sink.records.push({x:cc.x,z:cc.z,y:(y0+y1)/2,r:Math.hypot(rad,(y1-y0)/2),top:y1,site:site.id});colCache=new Map();return rec;},
  mod(f,k){const m=famMods(kit,f);if(!m.length){sink.missing.add(f);return null;}return m[((k%m.length)+m.length)%m.length];},
  pick(f){const m=famMods(kit,f);if(!m.length){sink.missing.add(f);return null;}return r.pick(m);},
  size(name){return kit.modules?.[name]??{w:FAMILIES[name.replace(/\d+$/,'')]?.[0]??3,h:FAMILIES[name.replace(/\d+$/,'')]?.[1]??3};},
  add(name,M,sty,lit=0){if(name)sink.add(name,M,sty,lit,rec);},
  prop(name,x,y,z,yaw2=0,sx=1,sy=1,sz=1,sty=0,lit=0){if(!name)return;if(!kit.modules?.[name]&&kit.modules){sink.missing.add(name);return;}sink.add(name,propPose(x,y,z,yaw2,sx,sy,sz),sty,lit,rec);},
 };
 // One facade row band on an outline. spec: role → family prefix | [pattern of prefixes] | null.
 ctx.facade=(P,roleOf,y,h,spec,sty,light,opts={})=>{
  for(const [ci,ch] of chains(P,roleOf).entries()){let f=spec[ch.role];if(f===undefined)f=spec.any;if(!f)continue;const pattern=Array.isArray(f)?f:[f],w=FAMILIES[pattern[0]]?.[0]??3;
   const key=ctx.vol+'|'+ci+'|'+pattern.join(','),bb=bays(ch,opts.bay??w);let cols=colCache.get(key);
   if(!cols){const typical=r();cols=bb.map((_,i)=>{const fam=pattern[i%pattern.length],m=famMods(kit,fam),tk=site.id+'|'+fam;if(UNIFORM.has(fam)&&!typ.has(tk))typ.set(tk,Math.floor(r()*m.length));
    return {fam,k:UNIFORM.has(fam)?typ.get(tk):r.chance(.7)?Math.floor(typical*m.length):Math.floor(r()*m.length)};});colCache.set(key,cols);}
   bb.forEach(([A,B],i)=>{const col=cols[i]??cols[0],k=UNIFORM.has(col.fam)||r.chance(opts.stick??.78)?col.k:Math.floor(r()*99),name=ctx.mod(col.fam,k);if(!name)return;
    const s=ctx.size(name);ctx.add(name,pose(A,B,y,s.w,h/s.h),sty,light(i,bb.length));});}};
 return ctx;}

// Lighting per glass placement: 0 = dark, (0,1] warm, (1,2] cool.
const lights={
 random:(r,p,cool=.45)=>()=>r.chance(p)?(r.chance(cool)?1+r.range([.55,1]):r.range([.55,1])):0,
 floor:(r,p)=>{const on=r.chance(p);return ()=>on?1+r.range([.75,.95]):0;},
 cluster:(r,p)=>{let left=0,on=false;return ()=>{if(left<=0){left=r.int([2,6]);on=r.chance(p);}left--;return on?1+r.range([.6,.85]):0;};},
 shop:r=>()=>r.range([.75,1]),none:()=>()=>0,
};

// A volume: rows of facade bands on an outline, a top band, a shell prism and its LOD record.
// rows: [{h, spec, light:'random'|'floor'|'cluster'|'shop'|'none', p (lit ratio)}]
function volume(ctx,{P,roles,y0=0,rows,top,sty,shell,inset:ins=.5,record=true}){const {r,sink}=ctx;let y=y0;ctx.vol++;
 const yTop=y0+rows.reduce((s,row)=>s+row.h,0);if(record)ctx.record(P,y0,yTop+(top?.h??0));
 for(const row of rows){const L=lights[row.light??'random'](r,row.p??.45,row.cool);ctx.facade(P,roles,y,row.h,row.spec,row.sty??sty,()=>L(),row.opts);y+=row.h;}
 if(top)ctx.facade(P,roles,y,top.h,top.spec,top.sty??sty,()=>0);
 if(shell!==false){const S=inset(P,ins);if(S){const st=sink.styles[sty];sink.shells.push({P:S.P,y0,y1:y,wall:shell?.wall??st.wall,roof:shell?.roof??[.6,.59,.55],glass:shell?.glass??st.glass,
  bay:shell?.bay??3,floor:shell?.floor??rows.at(-1)?.h??3,win:shell?.win??[.6,.55],lit:shell?.lit??.4,kind:shell?.kind??0,gy:shell?.gy??y0,seed:r(),rec:sink.records.length-1});}}
 return y;}
// Repeat a row spec n times (typical floors).
const floors=(n,h,spec,light='random',p=.45,extra={})=>Array.from({length:n},()=>({h,spec,light,p,...extra}));

// Place a plan shape: scale s, local offset (u, v), extra rotation rot → world outline + tags.
function placePlan(ctx,plan,s,u,v,rot){const c=Math.cos(rot),sn=Math.sin(rot);const pts=plan.pts.map(p=>{const x=p.x*s,z=p.z*s,lu=x*c+z*sn+u,lv=-x*sn+z*c+v;return ctx.toWorld(lu,lv);});const O=orient(pts,plan.tags);return O;}
// Pack towers of a plan onto a base outline: grid (or staggered rows), separation sep, setback from the base edge.
// Scales the plan down (to minScale) before giving up; returns [{P, tags, s, u, v}].
function packTowers(ctx,base,plans,{sep=15,setback=3,max=12,minScale=.6,rot=0,layout='grid',lastResort=.3,most=false}={}){
 setback=Math.min(setback,.07*Math.min(ctx.width,ctx.depth));const inner=inset(base,setback);if(!inner)return [];const loc=inner.P.map(ctx.toLocal),u0=Math.min(...loc.map(p=>p.u)),u1=Math.max(...loc.map(p=>p.u)),v0=Math.min(...loc.map(p=>p.v)),v1=Math.max(...loc.map(p=>p.v));
 const tryFit=(plan,s)=>{const c=Math.cos(rot),sn=Math.sin(rot),q=plan.pts.map(p=>({u:(p.x*c+p.z*sn)*s,v:(-p.x*sn+p.z*c)*s})),w=Math.max(...q.map(p=>p.u))-Math.min(...q.map(p=>p.u)),d=Math.max(...q.map(p=>p.v))-Math.min(...q.map(p=>p.v));
  const pu=w+sep,pv=d+sep,nu=Math.max(1,Math.floor((u1-u0+sep)/pu)),nv=Math.max(1,Math.floor((v1-v0+sep)/pv)),out=[];
  for(let j=0;j<nv;j++)for(let i=0;i<nu+(layout==='stagger'&&j%2?-1:0);i++){const u=(u0+u1)/2+(i-(nu-1-(layout==='stagger'&&j%2?1:0))/2)*pu,v=(v0+v1)/2+(j-(nv-1)/2)*pv;
   if(layout==='ring'&&nu>=3&&nv>=3&&i>0&&j>0&&i<nu-1&&j<nv-1)continue;const T=placePlan(ctx,plan,s,u,v,rot);if(polyInside(T.P,inner.P))out.push({P:T.P,tags:T.tags,s,u,v});}
  return out;};
 // most: estates take the scale that fits the most towers (ties keep the bigger towers); otherwise the biggest that fits
 let bestFit=null;for(const plan of plans)for(const s of [1,.92,.84,.76,.68,.6].filter(s=>s>=minScale-1e-9)){const got=tryFit(plan,s);if(!got.length)continue;if(!most)return thin(got,max);if(!bestFit||Math.min(got.length,max)>Math.min(bestFit.length,max))bestFit=got;}
 if(bestFit)return thin(bestFit,max);
 const plan=plans.at(-1);for(let s=minScale;s>=lastResort;s-=.05){const got=tryFit(plan,s);if(got.length)return thin(got,max);}return [];}
const thin=(list,max)=>list.length<=max?list:list.filter((_,i)=>i%Math.ceil(list.length/max)===0).slice(0,max);

// Scatter props on a podium roof, away from towers.
function landscape(ctx,P,y,towers,{trees=.012,pool=true,sty}={}){const {r}=ctx,area0=Math.abs(area(P)),inner=inset(P,2.2)?.P;if(!inner)return;
 const clear=(x,z,m)=>inside(inner,x,z)&&towers.every(t=>!inside(t.P,x,z)&&t.P.every((p,i)=>{const q=t.P[(i+1)%t.P.length],dx=q.x-p.x,dz=q.z-p.z,L2=dx*dx+dz*dz||1,s=Math.max(0,Math.min(1,((x-p.x)*dx+(z-p.z)*dz)/L2));return Math.hypot(x-p.x-s*dx,z-p.z-s*dz)>m;}));
 const spot=(m,tries=40)=>{const loc=inner.map(ctx.toLocal),u=[Math.min(...loc.map(p=>p.u)),Math.max(...loc.map(p=>p.u))],v=[Math.min(...loc.map(p=>p.v)),Math.max(...loc.map(p=>p.v))];
  for(let k=0;k<tries;k++){const p=ctx.toWorld(r.range(u),r.range(v));if(clear(p.x,p.z,m))return p;}return null;};
 if(pool&&area0>900){const p=spot(9);if(p)ctx.prop('POOL',p.x,y,p.z,ctx.yaw+(r.chance(.5)?0:Math.PI/2),r.range([12,20]),1,r.range([6,9]),sty);}
 for(let k=Math.min(6,Math.floor(area0/500));k>0;k--){const p=spot(5);if(p)ctx.prop('LAWN',p.x,y,p.z,ctx.yaw,r.range([6,12]),1,r.range([5,9]),sty);}
 if(area0>1400&&r.chance(.7)){const p=spot(6);if(p)ctx.prop('PAV',p.x,y,p.z,ctx.yaw+Math.floor(r()*4)*Math.PI/2,1,1,1,sty);}
 for(let k=Math.min(90,Math.floor(area0*trees));k>0;k--){const p=spot(1.8,12);if(p){const s=r.range([.75,1.3]);ctx.prop(r.pick(['TREE0','TREE1','TREE2','TREE1','PALM','SHRUB']),p.x,y,p.z,r()*6.28,s,s,s,sty);}}}

// Roof clutter on clear points of a roof outline.
function roofClutter(ctx,P,y,sty,{tanks=[1,3],lift=true,antennas=[0,3],extra=[]}={}){const {r}=ctx,inner=inset(P,1.6)?.P;if(!inner)return;
 const spot=rad=>{const xs=inner.map(p=>p.x),zs=inner.map(p=>p.z);for(let k=0;k<30;k++){const x=r.range([Math.min(...xs),Math.max(...xs)]),z=r.range([Math.min(...zs),Math.max(...zs)]);if([[1,0],[-1,0],[0,1],[0,-1],[0,0]].every(([a,b])=>inside(inner,x+a*rad,z+b*rad)))return {x,z};}return null;};
 const put=(m,rad,s=1)=>{const p=spot(rad);if(p)ctx.prop(m,p.x,y,p.z,ctx.yaw+Math.floor(r()*4)*Math.PI/2,s,s,s,sty);};
 if(lift)put('LIFT',3);for(let k=r.int(tanks);k>0;k--)put('TANK',1.4);for(let k=r.int(antennas);k>0;k--)put('AN0',.6);for(const [m,rad] of extra)put(m,rad);}

// ---------------------------------------------------------------- shared tower builders
// Residential tower from a placed plan. kind: 'harmony' | 'trident' | 'cross' | 'glass'.
function residentialTower(ctx,T,y0,o){const {r}=ctx,roles=T.tags.map(t=>t??'f');
 const n=o.storeys,F=o.floor,rows=[];const groundSpec=o.ground??{any:'HL'};rows.push({h:o.groundH??4.5,spec:groundSpec,light:'shop',sty:o.groundSty});
 const refuge=n>40?r.int([20,25]):0;
 for(let i=0;i<n;i++)rows.push(refuge&&i>0&&i%refuge===0?{h:F,spec:{any:'RF'},light:'none'}:{h:F,spec:o.spec,light:'random',p:o.lit??.5,cool:o.cool});
 const f0=Array.isArray(o.spec.f)?o.spec.f[0]:o.spec.f;const top=volume(ctx,{P:T.P,roles,y0,rows,top:{h:o.parapetH??1.2,spec:{any:o.parapet??'RT'}},sty:o.sty,shell:{bay:FAMILIES[f0]?.[0]??3,floor:F,win:o.win??[.55,.5],lit:o.lit??.5,gy:y0+(o.groundH??4.5)}});
 // core crown: a small volume on the plan's centre
 const cc=centroid(T.P),cw=o.crownW??7*(T.s??1),cd=o.crownD??6*(T.s??1),crown=o.crown;
 if(crown){const yawC=ctx.yaw+(T.rot??0);const sx=cw/7,sz=cd/6,h=r.range(crown.h??[6,9]);ctx.prop(r.pick(crown.mods),cc.x,top,cc.z,yawC,sx,h/7,sz,o.crownSty??o.sty);
  if(crown.names){const nm=r.pick(crown.names);const f={x:Math.sin(yawC),z:Math.cos(yawC)};ctx.prop(nm,cc.x+f.x*(cd/2+.05),top+h*.45,cc.z+f.z*(cd/2+.05),yawC,cw/8,cw/8,1,o.nameSty??o.sty);}}
 roofClutter(ctx,T.P,top+.02,o.sty,{tanks:[1,2],lift:!crown,antennas:[0,2]});
 return top;}

// ---------------------------------------------------------------- types
const pal=(r,list,amt=1)=>tone(r.pick(list),r,amt);
const PRH_NAMES=['NAME0','NAME1','NAME2','NAME3','NAME4','NAME5'];
export const TYPES={};
const T_=(id,o)=>{TYPES[id]={id,...o};};

T_('prh-harmony',{name:'Harmony public housing',group:'Modern · residential',era:'1990s–2000s',span:[52,48],
 note:'Housing Authority Harmony 1 cross (Concord on tighter sites), 38–41 storeys at 2.75 m, estate colour stripes, painted name on the core crown.',
 plan(ctx){const {r}=ctx,accent=pal(r,['#C8453B','#2F6FAE','#3E8E5A','#D9A441','#7B5BA6','#E07B39']),wall=pal(r,['#EDE6D3','#EFE9DA','#E8E2D2','#F2EEE4'],.5);
  const sty=ctx.style({wall,trim:accent,frame:solid('#EDEDE6'),glass:pal(r,['#3B4C52','#44555A','#2F3E44']),finish:r.chance(.6)?2:1});
  const towers=packTowers(ctx,ctx.poly,[PLANS.harmony(),PLANS.concord()],{sep:15,setback:3,max:6,rot:r.chance(.5)?0:Math.PI/2,minScale:.7,layout:r.chance(.3)?'stagger':'grid'});
  for(const T of towers)residentialTower(ctx,T,0,{storeys:r.int([36,41]),floor:2.75,sty,spec:{f:['HB','HB','HK'],e:'HE',c:'HC',any:'HB'},ground:{any:'HL'},
   crown:{mods:['CROWNS'],h:[6,9],names:PRH_NAMES},crownW:9*T.s,crownD:9*T.s,lit:.55,cool:.6});}});

T_('prh-trident',{name:'Trident public housing',group:'Modern · residential',era:'1984–92',span:[48,48],
 note:'Three identical wings at 120° around a lift lobby, 34–35 storeys, stepped re-entrant bays, block name painted down the wing ends.',
 plan(ctx){const {r}=ctx,accent=pal(r,['#E7A9A9','#F2B98A','#9BD3B5','#8EC3E6','#F2DD7A']),wall=pal(r,['#E9E7E0','#DCDAD3','#EEEAE0'],.5);
  const sty=ctx.style({wall,trim:accent,frame:solid('#E6E6DE'),glass:pal(r,['#3B4C52','#44555A']),finish:1});
  const towers=packTowers(ctx,ctx.poly,[PLANS.trident()],{sep:14,setback:3,max:5,rot:r.chance(.5)?0:Math.PI,minScale:.7});
  for(const T of towers){const top=residentialTower(ctx,T,0,{storeys:r.int([33,35]),floor:2.75,sty,spec:{f:'TB',e:'HE',any:'TB'},crown:{mods:['CROWNS'],h:[6,8]},crownW:8*T.s,crownD:8*T.s,lit:.55,cool:.55});
   // vertical block name down one wing end
   const ends=[];T.P.forEach((a,i)=>{if(T.tags[i]==='e')ends.push([a,T.P[(i+1)%T.P.length]]);});const [a,b]=r.pick(ends);const mx=(a.x+b.x)/2,mz=(a.z+b.z)/2,dx=b.x-a.x,dz=b.z-a.z,L=Math.hypot(dx,dz);
   ctx.prop(r.pick(['VNAME0','VNAME1','VNAME2','VNAME3']),mx+(-dz/L)*.08,top-18,mz+(dx/L)*.08,Math.atan2(-dz/L,dx/L),1.6,1.6,1,sty);}}});

T_('prh-slab',{name:'Slab block (public housing)',group:'Modern · residential',era:'1957–1990s',span:[70,24],
 note:'Old Slab / Linear block: long corridor slab with open access galleries that light up as strips at night; the odd one in Choi Hung rainbow colours.',
 plan(ctx){const {r}=ctx,rainbow=r.chance(.14),cols=['#E5463C','#F39A2D','#F5D23C','#5CB85C','#3B8BD0','#7B5BA6'];
  const wall=pal(r,['#E8E4D8','#EFE6CC','#E2DED2']),trim=pal(r,['#C9C2B0','#9DB3C4','#B9CDB4']);
  const sty=ctx.style({wall,trim,frame:solid('#D8D8CE'),glass:solid('#3E4A4C'),finish:0});
  const len=Math.min(90,Math.max(16,ctx.width-6)),dep=Math.min(11.5,Math.max(8,ctx.depth-6)),slab={pts:P2([[len/2,dep/2],[-len/2,dep/2],[-len/2,-dep/2],[len/2,-dep/2]]),tags:['g','e','f','e']};
  const towers=packTowers(ctx,ctx.poly,[slab],{sep:16,setback:2.5,max:4,minScale:.6});const n=r.int([8,20]);
  for(const T of towers){const roles=T.tags;const styles=rainbow?cols.map(c=>ctx.style({wall:tone(c,r,.3),trim:WHITE,frame:solid('#D8D8CE'),glass:solid('#3E4A4C')})):null;
   const rows=[{h:3.2,spec:{any:'SE',g:'SG',f:'SF'},light:'shop'},...floors(n,2.9,{g:'SG',f:'SF',e:'SE'},'random',.5)];
   const y=volume(ctx,{P:T.P,roles,rows,top:{h:1.2,spec:{any:'RT'}},sty:styles?styles[0]:sty,shell:{bay:3.2,floor:2.9,win:[.5,.5],lit:.5,kind:2,gy:3.2}});
   if(styles){// repaint bays along the length in bands of colour
    const s=ctx.sink,first=s.records.at(-1);for(let i=0;i<s.n;i++)if(s.rec[i]===s.records.length-1){const x=s.m[i*12+9],z=s.m[i*12+11],u=ctx.toLocal({x,z}).u;s.sty[i]=styles[Math.max(0,Math.min(5,Math.floor((u-T.u+len/2)/(len/6))))];}}
   roofClutter(ctx,T.P,y,sty,{tanks:[2,4],lift:true});}}});

T_('private-cross',{name:'Private cruciform tower',group:'Modern · residential',era:'1980s–90s',span:[36,36],
 note:'Taikoo Shing / Kornhill style cross of 8 flats, 25–35 storeys, bay windows over A/C hoods, laundry in the light slots, named crown.',
 plan(ctx){const {r}=ctx,s=privateCrossStyle(ctx);const podium=ctx.width>40&&r.chance(.5)?r.int([1,2]):0;let y0=0;
  if(podium)y0=volume(ctx,{P:ctx.poly,roles:ctx.roles,rows:floors(podium,5,{f:'PS',x:'PS',r:'DW',p:'BL'},'shop'),top:{h:1.3,spec:{any:'PE'}},sty:s.podSty,shell:{bay:4.5,floor:5,win:[.8,.6],lit:.7,roof:[.42,.52,.36]}});
  const towers=packTowers(ctx,ctx.poly,[r.chance(.4)?PLANS.crossSlot():PLANS.cross(),PLANS.cross()],{sep:15,setback:podium?4:2,max:6,rot:r.chance(.25)?Math.PI/4:0,minScale:.65});
  for(const T of towers)crossTower(ctx,T,y0,s,r.int([25,35]));
  if(podium)landscape(ctx,ctx.poly,y0+.02,towers,{sty:s.landSty});}});
function privateCrossStyle(ctx){const {r}=ctx;return {sty:ctx.style({wall:pal(r,['#D9C7A6','#B89A74','#F0EDE6','#E6D8BE','#CDBBA0','#DCE6E0','#CFE0EA']),trim:pal(r,['#C9826B','#8A6A50','#F2EEE6','#A0522D','#6E7F8A']),frame:solid(r.pick(['#F0F0EA','#C9CCCF','#8C8670'])),glass:pal(r,['#3E4E54','#4A5A5E','#55646A']),finish:r.chance(.7)?1:2}),
 podSty:ctx.style({wall:pal(r,['#D8D0C0','#C9BFAE','#E6E0D4','#A7A39B']),trim:pal(r,['#8C6239','#4A4E52','#B5654A']),frame:solid('#B0B3B5'),glass:solid('#3A4A50'),finish:5}),
 landSty:ctx.style({wall:solid('#6E8F55'),trim:solid('#4F7A3E'),frame:solid('#9A8E78'),glass:solid('#3F8FB0'),finish:0})};}
function crossTower(ctx,T,y0,s,n){const {r}=ctx;return residentialTower(ctx,T,y0,{storeys:n,floor:2.8,sty:s.sty,spec:{f:'PB',e:'PW',s:'LS',c:'LS',any:'PB'},ground:{any:'RG'},
 crown:{mods:['CROWNP','CROWNA','CROWNS'],h:[6,8]},crownW:9*T.s,crownD:8*T.s,lit:.5,cool:.35});}

T_('private-glass',{name:'Private glass tower',group:'Modern · residential',era:'2000s–20s',span:[40,40],
 note:'40–60 storeys at 3.1 m, floor-to-ceiling glass, glass balconies and utility platforms, sky-garden refuge floors, LED crown; podium clubhouse on bigger sites.',
 plan(ctx){const {r}=ctx,s=glassStyle(ctx);const podium=ctx.width>34?r.int([2,5]):0;let y0=0;
  if(podium)y0=volume(ctx,{P:ctx.poly,roles:ctx.roles,rows:[{h:5.5,spec:{f:'MG',x:'PS',r:'MK',p:'BL'},light:'shop'},...floors(podium-1,3.2,{f:'MK',x:'MK',r:'MK',p:'BL'},'none')],top:{h:1.3,spec:{any:'PE'}},sty:s.podSty,shell:{bay:6,floor:3.2,win:[.85,.5],lit:.2}});
  const towers=packTowers(ctx,ctx.poly,ctx.width>ctx.depth*1.6?[PLANS.slabGlass(),PLANS.notched()]:[r.chance(.5)?PLANS.notched():PLANS.squareGlass(),PLANS.slabGlass()],{sep:16,setback:podium?4:2,max:4,minScale:.62});
  const base=r.int([40,58]);towers.forEach((T,i)=>glassTower(ctx,T,y0,s,Math.round(base*(1+(r()-.5)*.12))));
  if(podium)landscape(ctx,ctx.poly,y0+.02,towers,{sty:s.landSty});}});
function glassStyle(ctx){const {r}=ctx;return {sty:ctx.style({wall:pal(r,['#F2F2EE','#E8E6E0','#D8D8D4','#CFC2A4','#E3E0D8']),trim:pal(r,['#8C9196','#5A5E62','#B9BEC2']),frame:solid(r.pick(['#B9BEC2','#CFC2A4','#5A5E62'])),glass:pal(r,['#5E7F86','#6F7A80','#4E6E78','#7D8E95','#3F5560']),glow:solid(r.pick(['#FFFFFF','#FFD27A','#7AB8FF','#FFFFFF'])),finish:r.chance(.5)?5:0}),
 podSty:ctx.style({wall:pal(r,['#B9B2A6','#8C8F94','#D9CDB4','#A7A39B']),trim:pal(r,['#4A4E52','#8C6239']),frame:solid('#B0B3B5'),glass:solid('#3A4A52'),finish:5}),
 landSty:ctx.style({wall:solid('#6E8F55'),trim:solid('#4F7A3E'),frame:solid('#9A8E78'),glass:solid('#3F8FB0')})};}
function glassTower(ctx,T,y0,s,n){const {r}=ctx;const top=residentialTower(ctx,T,y0,{storeys:n,floor:3.1,sty:s.sty,spec:{f:'GB',u:'GU',any:'GB'},ground:{any:'RG'},parapet:'CF',parapetH:3,win:[.8,.75],lit:.45,cool:.3});
 ctx.prop('BMU',centroid(T.P).x,top+3.05,centroid(T.P).z,ctx.yaw,1,1,1,s.sty);return top;}

T_('village-houses',{name:'Village houses',group:'Modern · residential',era:'1970s–now',span:[22,22],
 note:'New Territories small houses: 8.1 m square, three storeys, 8.23 m to the roof, balconies, stairhood and tank, packed 1–3 m apart.',
 plan(ctx){const {r}=ctx,house={pts:P2([[4.05,4.05],[-4.05,4.05],[-4.05,-4.05],[4.05,-4.05]]),tags:['f','x','r','x']};
  const spots=packTowers(ctx,ctx.poly,[house],{sep:r.range([1.2,3]),setback:1,max:24,minScale:1,lastResort:1,layout:r.chance(.4)?'stagger':'grid'});
  for(const T of spots){const sty=ctx.style({wall:pal(r,['#F2F0EA','#E9C9C1','#EFE2B0','#CFE3D2','#A9C4D9']),trim:pal(r,['#B23A2E','#3F7F4E','#F2F0EA','#C9CCCF']),frame:solid('#C9CCCF'),glass:pal(r,['#6FA39A','#5A7F78','#7A8A6A']),finish:r.chance(.5)?2:0});
   const j=()=>r.range([-.4,.4]);const P=T.P.map(p=>({x:p.x+j()*.2,z:p.z+j()*.2}));
   const y=volume(ctx,{P,roles:T.tags,rows:[{h:2.74,spec:{f:'VG',any:'VS'},light:'random',p:.5},...floors(2,2.74,{f:'VF',any:'VS'},'random',.5)],top:{h:1.1,spec:{any:'VT'}},sty,shell:{bay:4.05,floor:2.74,win:[.45,.5],lit:.5}});
   const c=centroid(P);ctx.prop('STAIR',c.x+r.range([-1.5,1.5]),y,c.z+r.range([-1.5,1.5]),ctx.yaw+Math.floor(r()*4)*Math.PI/2,1,1,1,sty);if(r.chance(.7))ctx.prop('TANK',c.x+r.range([-2,2]),y,c.z+r.range([-2,2]),0,.7,.7,.7,sty);}}});

// offices and commercial
T_('office-grade-a',{name:'Grade A office tower',group:'Modern · offices & commercial',era:'1990s–now',span:[44,44],
 note:'Curtain wall on 4.2 m floors, 8–15 m glass lobby, 1–4 storey podium, louvred refuge bands every 20–25 floors, crown screen with logo.',
 plan(ctx){const {r}=ctx,sty=ctx.style({wall:pal(r,['#2F3A44','#8A8580','#2B2A29','#C9C4BC','#5A6168']),trim:pal(r,['#B8BCC0','#4A4E52','#8C9196']),frame:solid(r.pick(['#B8BCC0','#4A4E52','#8C9196'])),glass:pal(r,['#5F7F99','#9FB1BD','#4F6A66','#1F262C','#6E8796','#7A9AA8']),glow:solid('#FFFFFF'),finish:5});
  const big=Math.min(ctx.width,ctx.depth)>34,podN=big?r.int([1,4]):0,podSty=ctx.style({wall:pal(r,['#8A8580','#2B2A29','#C9C4BC','#B9B2A6']),trim:pal(r,['#4A4E52','#B8BCC0']),frame:solid('#9A9EA2'),glass:solid('#3A4A52'),finish:5});
  let y0=0;if(podN)y0=volume(ctx,{P:ctx.poly,roles:ctx.roles,rows:[{h:6,spec:{f:'CP',x:'CP',r:'MK',p:'BL'},light:'shop'},...floors(podN-1,5,{f:'CP',x:'MK',r:'MK',p:'BL'},'shop')],top:{h:1.3,spec:{any:'PE'}},sty:podSty,shell:{bay:6,floor:5,win:[.8,.6],lit:.6}});
  // tower: inset lot (follows curved fronts) on small lots; a chamfered block on big sites
  let P,roles;if(!big){const I=inset(ctx.poly,ctx.roles.map(x=>x==='p'?0:x==='f'?r.range([0,2.5]):1.2),ctx.roles);P=I?.P??ctx.poly;roles=I?.tags??ctx.roles;}
  else{const w=Math.min(ctx.width*.62,r.range([36,55])),d=Math.min(ctx.depth*.62,r.range([30,45])),T=placePlan(ctx,rectPlan(w,d,r.range([0,4])),1,r.range([-.1,.1])*ctx.width*.2,-ctx.depth*.08,0);P=T.P;roles=T.tags;}
  const n=r.int(big?[24,48]:[18,36]),lobby=r.range([8,13]),band=r.int([20,25]);const spec={any:'CW'},rows=[{h:lobby,spec:{f:'CL',any:big?'CW':'CL',p:'BL'},light:'shop'}];
  for(let i=1;i<n;i++)rows.push(i%band===0?{h:4.8,spec:{any:'MB',p:'BL'},light:'none'}:{h:4.2,spec:{...spec,p:'BL'},light:'floor',p:.65});
  const top=volume(ctx,{P,roles,y0,rows,top:{h:r.range([6,12]),spec:{any:'CT',p:'CT'},sty},sty,shell:{bay:3,floor:4.2,win:[.92,.72],lit:.6,kind:1,gy:y0+lobby}});
  const c=centroid(P);ctx.prop('BMU',c.x,top+1,c.z,ctx.yaw,1,1,1,sty);
  if(r.chance(.7)){const q=faceSpot(ctx,P,.5);ctx.prop(ctx.pick('LOGO')??'LOGO0',q.x+q.ox*.3,top+2.5,q.z+q.oz*.3,q.yaw,Math.min(1.4,q.L/9),Math.min(1.4,q.L/9),1,sty);}}});
// A point along the outline edge that best faces the street (dir = front, or −front for the back), with its outward yaw.
function faceSpot(ctx,P,t=ctx.r.range([.25,.75]),dir=1){const fx=Math.sin(ctx.yaw)*dir,fz=Math.cos(ctx.yaw)*dir;let best=null;
 P.forEach((a,i)=>{const b=P[(i+1)%P.length],dx=b.x-a.x,dz=b.z-a.z,L=Math.hypot(dx,dz);if(L<1)return;const ox=-dz/L,oz=dx/L,score=(ox*fx+oz*fz)*Math.min(L,30);if(!best||score>best.score)best={a,b,L,ox,oz,score};});
 const {a,b,L,ox,oz}=best;return {x:a.x+(b.x-a.x)*t,z:a.z+(b.z-a.z)*t,ox,oz,yaw:Math.atan2(ox,oz),L,ux:(b.x-a.x)/L,uz:(b.z-a.z)/L};}

T_('office-classic',{name:'1980s office block',group:'Modern · offices & commercial',era:'1970s–90s',span:[30,26],
 note:'Ribbon or punched windows with spandrel bands on 3.6 m floors, shop podium with canopy, tinted glass, rooftop billboard.',
 plan(ctx){const {r}=ctx,sty=ctx.style({wall:pal(r,['#D8CDB5','#8C6A4E','#E8E4DA','#B0B3B5','#C2B8A3']),trim:pal(r,['#9A9590','#E8E4DA','#6B5A45']),frame:solid(r.pick(['#B0B3B5','#6B5A45','#3A3A36'])),glass:pal(r,['#6B5A45','#4E6E5D','#3E6A8A','#3A4A50']),finish:r.pick([1,2,5])});
  const pod=r.int([2,4]),n=r.int([15,32]),fam=r.chance(.5)?'OC':'OC';
  const rows=[...floors(pod,4.5,{f:'OP',x:'OP',r:'FS',p:'BL'},'shop'),...floors(n,3.6,{f:fam,x:fam,r:'FS',p:'BL'},'floor',.55)];
  const top=volume(ctx,{P:ctx.poly,roles:ctx.roles,rows,top:{h:1.2,spec:{any:'OT'}},sty,shell:{bay:3,floor:3.6,win:[.9,.45],lit:.5,kind:1,gy:pod*4.5}});
  roofClutter(ctx,ctx.poly,top,sty,{tanks:[1,3],extra:r.chance(.6)?[[r.pick(['BILL0','BILL1']),6]]:[]});}});

T_('ginza',{name:'Commercial building (stacked signs)',group:'Modern · offices & commercial',era:'1980s–now',span:[22,22],
 note:'Narrow Causeway Bay / Mong Kok tower: glazed street face carrying a signboard on every floor, vertical sign blades, rooftop screen; brightest at night.',
 plan(ctx){const {r}=ctx,sty=ctx.style({wall:pal(r,['#E9E6DF','#BDBAB3','#C4C7CA']),trim:pal(r,['#C4C7CA','#8C9196']),frame:solid('#C4C7CA'),glass:pal(r,['#2A3138','#3A4550']),glow:WHITE,finish:5});
  const n=r.int([15,30]),rows=[{h:5.5,spec:{f:'OP',x:'OP',r:'FS',p:'BL'},light:'shop'},...floors(n,3.9,{f:'GZ',x:'OC',r:'FS',p:'BL'},'shop')];
  const top=volume(ctx,{P:ctx.poly,roles:ctx.roles,rows,top:{h:1.2,spec:{any:'OT'}},sty,shell:{bay:3,floor:3.9,win:[.9,.6],lit:.85,kind:1,gy:5.5}});
  const c=centroid(ctx.poly);
  for(let k=r.int([1,3]);k>0;k--){const q=faceSpot(ctx,ctx.poly,r.range([.1,.9])),h=3.9*r.int([5,Math.min(18,n)]);ctx.prop(r.pick(['BLADE0','BLADE1','BLADE2','BLADE3']),q.x+q.ox*.2,5.6+r.range([0,8]),q.z+q.oz*.2,q.yaw,1,h/10,1,sty);}
  if(r.chance(.6))ctx.prop('SCREEN',c.x,top,c.z,ctx.yaw,Math.min(1.4,ctx.width/14),1,1,sty);else roofClutter(ctx,ctx.poly,top,sty,{tanks:[1,2]});}});

// industrial and logistics
T_('flatted-factory',{name:'Flatted factory',group:'Modern · industrial & logistics',era:'1960s–90s',span:[30,30],
 note:'Kwun Tong / Kwai Chung industrial building: strip windows over spandrel bands on 3.9 m floors, roller-shutter loading bays, goods-lift core above the roof, company sign frame.',
 plan(ctx){const {r}=ctx,sty=ctx.style({wall:pal(r,['#8F8D86','#B8B6AE','#E3D8BC','#EEEDE7','#A7C4B0','#9DB6C6','#D4A493','#C9A86A']),trim:pal(r,['#B5B7B4','#9C9A92','#E8E6DC','#7A776E']),frame:solid(r.pick(['#B5B7B4','#5A5C58','#7A4E35'])),glass:pal(r,['#3E4A4F','#55626A','#2F3B40']),finish:r.pick([0,0,1,4])});
  const arcade=r.chance(.45),arch=r.pick(['extrude','extrude','staggered','podium']),n=r.int([8,24]),F=r.range([3.6,4.2]),G=r.range([4.6,6]);
  const ground={h:G,spec:{f:arcade?'FA':'FG',x:'FG',r:'FG',p:'BL'},light:'cluster',p:.6};
  if(arch==='staggered'){const k=Math.min(n-2,r.int([6,9]));const y1=volume(ctx,{P:ctx.poly,roles:ctx.roles,rows:[ground,...floors(k,F,{f:'FS',x:'FS',r:'FS',p:'BL'},'cluster',.5)],top:{h:1.3,spec:{any:'IT'}},sty,inset:arcade?3.2:.3,shell:{bay:3.3,floor:F,win:[.9,.5],lit:.5,gy:G}});
   const I=inset(ctx.poly,ctx.roles.map(x=>x==='f'?4:x==='p'?0:.5),ctx.roles);if(I){const top=volume(ctx,{P:I.P,roles:I.tags,y0:y1,rows:floors(n-k,F,{f:'FS',x:'FS',r:'FS',p:'BL'},'cluster',.5),top:{h:1.3,spec:{any:'IT'}},sty,shell:{bay:3.3,floor:F,win:[.9,.5],lit:.5}});factoryRoof(ctx,I.P,top,sty);}return;}
  let P=ctx.poly,roles=ctx.roles,y0=0;
  if(arch==='podium'){y0=volume(ctx,{P,roles,rows:[ground,...floors(r.int([1,3]),5,{f:'FG',x:'MK',r:'MK',p:'BL'},'none')],top:{h:1.3,spec:{any:'IT'}},sty,inset:arcade?3.2:.3,shell:{bay:4,floor:5,win:[.8,.5],lit:.3}});const I=inset(P,roles.map(x=>x==='p'?.5:3),roles);if(I){P=I.P;roles=I.tags;}}
  const rows=arch==='podium'?floors(n,F,{f:'FS',x:'FS',r:'FS',p:'BL'},'cluster',.5):[ground,...floors(n,F,{f:'FS',x:'FS',r:'FS',p:'BL'},'cluster',.5)];
  const top=volume(ctx,{P,roles,y0,rows,top:{h:1.3,spec:{any:'IT'}},sty,inset:arcade&&arch!=='podium'?3.2:.3,shell:{bay:3.3,floor:F,win:[.9,.5],lit:.5,gy:arch==='podium'?y0:G}});factoryRoof(ctx,P,top,sty);}});
function factoryRoof(ctx,P,top,sty){const {r}=ctx;// goods-lift core rising above the roof at the rear, then sign frame, tanks, chimney
 const I=inset(P,2)?.P??P,c=centroid(I),back=faceSpot(ctx,I,.5,-1),cx=(c.x+back.x)/2,cz=(c.z+back.z)/2;
 const core=P2([[3.5,3],[-3.5,3],[-3.5,-3],[3.5,-3]]).map(p=>({x:cx+p.x*Math.cos(ctx.yaw)+p.z*Math.sin(ctx.yaw),z:cz-p.x*Math.sin(ctx.yaw)+p.z*Math.cos(ctx.yaw)}));
 const O=orient(core,null);if(polyInside(O.P,P))volume(ctx,{P:O.P,roles:O.P.map(()=>'f'),y0:top,rows:[{h:r.range([3.5,5]),spec:{any:'FC'},light:'none'}],top:{h:1.3,spec:{any:'IT'}},sty,record:false,shell:{bay:3,floor:4,win:[.2,.4],lit:0}});
 roofClutter(ctx,P,top,sty,{tanks:[1,3],lift:false,extra:[[r.pick(['SIGNF0','SIGNF1','SIGNF2']),5],...(r.chance(.12)?[['CHIM',1.5]]:[])]});}

T_('factory-estate',{name:'Factory estate (Housing Authority)',group:'Modern · industrial & logistics',era:'1957–84',span:[70,26],
 note:'Government flatted factory: Gen A 5–7 storey gallery slab, or Gen B I-shaped block of 10–26 storeys with 4 m unit bays and corridor light strips.',
 plan(ctx){const {r}=ctx,sty=ctx.style({wall:pal(r,['#E6DCC3','#EDEAE2','#DED6C2']),trim:pal(r,['#B9CDB4','#AFC3CF','#C9B9A0']),frame:solid(r.pick(['#6B2E2A','#3F5E47','#4A5A6A'])),glass:solid('#3E4A4C'),finish:0});
  const genB=ctx.width>=50&&r.chance(.5),len=Math.min(genB?140:100,Math.max(20,ctx.width-6)),dep=Math.min(genB?18:12,Math.max(9,ctx.depth-6));
  const plan=genB&&len>=50?iPlan(len,dep,Math.min(ctx.depth-6,dep+6),Math.min(24,len*.18)):{pts:P2([[len/2,dep/2],[-len/2,dep/2],[-len/2,-dep/2],[len/2,-dep/2]]),tags:['g','e','g','e']};
  for(const T of packTowers(ctx,ctx.poly,[plan],{sep:16,setback:2.5,max:3,minScale:.6})){const n=genB?r.int([10,26]):r.int([5,7]),F=genB?4.2:3.6;
   const top=volume(ctx,{P:T.P,roles:T.tags,rows:[{h:4.8,spec:{any:'FG',e:'SE'},light:'cluster',p:.6},...floors(n,F,genB?{f:'FS',g:'FS',e:'FC'}:{g:'EG',f:'EG',e:'SE'},'cluster',.55)],top:{h:1.3,spec:{any:'IT'}},sty,shell:{bay:4,floor:F,win:[.8,.45],lit:.5,kind:genB?0:2,gy:4.8}});
   roofClutter(ctx,T.P,top,sty,{tanks:[2,4],lift:true});}}});

T_('industrial-office',{name:'Industrial-office (I/O) building',group:'Modern · industrial & logistics',era:'2000s–now',span:[34,34],
 note:'Kowloon East I/O tower or conversion: curtain wall on the street faces (old render with strip windows behind on conversions), 3–6 storey car-park podium.',
 plan(ctx){const {r}=ctx,conv=r.chance(.5),sty=ctx.style({wall:pal(r,['#B9B4A6','#A9A69C','#C8C1AE']),trim:pal(r,['#C3C6C8','#3B3E42']),frame:solid(r.pick(['#C3C6C8','#3B3E42'])),glass:pal(r,['#4F7C7D','#3D5E7C','#7F8C93']),glow:WHITE,finish:conv?0:5});
  const podN=r.int([3,6]),y0=volume(ctx,{P:ctx.poly,roles:ctx.roles,rows:[{h:5.5,spec:{f:'CP',x:'FG',r:'FG',p:'BL'},light:'shop'},...floors(podN-1,3.6,{f:'MK',x:'MK',r:'MK',p:'BL'},'none')],top:{h:1.3,spec:{any:'PE'}},sty,shell:{bay:6,floor:3.6,win:[.85,.5],lit:.25}});
  const I=inset(ctx.poly,ctx.roles.map(x=>x==='p'?.4:x==='f'?r.range([1.5,4]):2),ctx.roles);if(!I)return;const n=r.int([16,30]),F=conv?r.range([3.6,4.2]):r.range([4,4.5]);
  const spec=conv?{f:'CW',x:'FS',r:'FS',p:'BL'}:{any:'CW',p:'BL'};
  const top=volume(ctx,{P:I.P,roles:I.tags,y0,rows:floors(n,F,spec,'floor',.6),top:{h:r.range([4,8]),spec:{f:'CT',any:conv?'IT':'CT',p:'IT'}},sty,shell:{bay:3,floor:F,win:[.9,.7],lit:.6,kind:1}});
  if(r.chance(.5)){const q=faceSpot(ctx,I.P,.5);ctx.prop(ctx.pick('LOGO')??'LOGO0',q.x+q.ox*.3,top+2,q.z+q.oz*.3,q.yaw,Math.min(1.2,q.L/9),Math.min(1.2,q.L/9),1,sty);}
  roofClutter(ctx,I.P,top,sty,{tanks:[0,1],lift:false});}});

T_('logistics-centre',{name:'Logistics centre (ramp-up)',group:'Modern · industrial & logistics',era:'1980s–now',span:[90,70],
 note:'ATL / Goodman style warehouse: container trucks drive up a helix drum or straight ramp to every 5.5–7.5 m floor; louvre bands, glazed office strip, rooftop parking, brand band.',
 plan(ctx){const {r}=ctx,brand=solid(r.pick(['#D2232A','#F28C00','#00539B','#5B8F29'])),sty=ctx.style({wall:pal(r,['#A3A19A','#E8E9E6','#C7CACC','#8E9398']),trim:brand,frame:solid('#4A4F55'),glass:solid('#3A4A52'),glow:WHITE,finish:r.chance(.5)?3:4});
  const n=r.int(ctx.width>60?[6,14]:[4,8]),F=r.range([5.5,7.5]),cu=Math.cos(ctx.yaw),su=Math.sin(ctx.yaw),side=r.chance(.5)?1:-1;
  // helix in a corner zone when the site allows (radius 14–30 m); otherwise a straight ramp along one side
  const R=Math.min(30,Math.max(0,Math.min(ctx.width*.22,ctx.depth*.5-2))),helix=R>=14;let P=ctx.poly,roles=ctx.roles,rampW=helix?2*R+3:13;
  // world normal of local +u is (cos, −sin)
  const nx=side*cu,nz=-side*su,cut=(side>0?ctx.U[1]:-ctx.U[0])-rampW,cc=nx*ctx.c.x+nz*ctx.c.z;const K=clip(P,roles,nx,nz,cc+cut);
  if(K&&Math.abs(area(K.P))>400){P=K.P;roles=K.tags.map(t=>t==='cut'?'x':t);}
  const rows=[{h:F,spec:{f:'LK',x:'LK',r:'LK',p:'BL'},light:'shop'},...Array.from({length:n-1},()=>({h:F,spec:{any:r.chance(.25)?'LD':'LB',p:'BL'},light:'cluster',p:.5}))];
  const top=volume(ctx,{P,roles,rows,top:{h:1.5,spec:{any:'LT'}},sty,shell:{bay:6,floor:F,win:[.95,.25],lit:.55,kind:2}});
  const uMid=side>0?ctx.U[1]-rampW/2:ctx.U[0]+rampW/2,vMid=r.chance(.5)?ctx.V[1]-R-1:ctx.V[0]+R+1;
  // the drum goes where a circle of radius R fits inside the ramp strip, nearest the chosen corner
  const Z=clip(ctx.poly,null,-nx,-nz,-(cc+cut)),ZI=helix&&Z?inset(Z.P,R+.5):null,want=ctx.toWorld(uMid,vMid);
  const hc=ZI?(inside(ZI.P,want.x,want.z)?want:ZI.P.reduce((b,q)=>Math.hypot(q.x-want.x,q.z-want.z)<Math.hypot(b.x-want.x,b.z-want.z)?q:b)):null;
  if(hc){const p=hc;ctx.record([{x:p.x-R,z:p.z-R},{x:p.x+R,z:p.z-R},{x:p.x+R,z:p.z+R},{x:p.x-R,z:p.z+R}],0,n*F);for(let i=0;i<n;i++)ctx.prop('HELIX',p.x,i*F,p.z,ctx.yaw,R,F,R,sty,1);
   // glazed office block beside the drum, at the other end of the ramp strip
   const free=ctx.depth-2*R-6,ov=vMid>0?ctx.V[0]+free/2+1:ctx.V[1]-free/2-1,ow=rampW-3;
   if(free>=8){const k=Math.min(r.int([4,8]),Math.floor(top/3.8)),Q=orient(P2([[ow/2,free/2],[-ow/2,free/2],[-ow/2,-free/2],[ow/2,-free/2]]).map(p=>ctx.toWorld(uMid+p.x,ov+p.z)),null);
    if(k>=2&&polyInside(Q.P,ctx.poly))volume(ctx,{P:Q.P,roles:Q.P.map(()=>'f'),rows:[{h:5,spec:{any:'CL'},light:'shop'},...floors(k-1,3.8,{any:'OC'},'floor',.6)],top:{h:1.2,spec:{any:'OT'}},sty,shell:{bay:3,floor:3.8,win:[.9,.45],lit:.6,kind:1,gy:5}});}}
  else{// switchback: lanes 6 m wide either side of uMid, one storey per run, alternating direction
   const L=Math.min(ctx.depth-4,90),a=ctx.toWorld(uMid,0);ctx.record([{x:a.x-6,z:a.z-L/2},{x:a.x+6,z:a.z-L/2},{x:a.x+6,z:a.z+L/2},{x:a.x-6,z:a.z+L/2}],0,n*F);
   const e0=ctx.toWorld(uMid,-L/2),e1=ctx.toWorld(uMid,L/2);if(inside(ctx.poly,e0.x,e0.z)&&inside(ctx.poly,e1.x,e1.z))for(let i=0;i<n;i++){const flip=i%2,o=flip?e1:e0;ctx.prop('RAMP',o.x,i*F,o.z,ctx.yaw+(flip?Math.PI/2:-Math.PI/2),L,F,6,sty,1);}}
  ctx.record(P,0,top);
  const inner=inset(P,4)?.P;if(inner){for(let k=Math.min(40,Math.floor(Math.abs(area(P))/180));k>0;k--){const q=ctx.toWorld(r.range(ctx.U),r.range(ctx.V));if(inside(inner,q.x,q.z))ctx.prop(r.chance(.7)?'TRUCK':'CAR',q.x,top,q.z,ctx.yaw+(r.chance(.5)?0:Math.PI),1,1,1,sty);}
   for(let k=Math.min(6,Math.floor(Math.abs(area(P))/900));k>0;k--){const q=ctx.toWorld(r.range(ctx.U),r.range(ctx.V));if(inside(inner,q.x,q.z))ctx.prop('MAST',q.x,top,q.z,0,1,1,1,sty,1);}}
  const q=faceSpot(ctx,P,.5);ctx.prop(ctx.pick('LOGO')??'LOGO0',q.x+q.ox*.3,top-4,q.z+q.oz*.3,q.yaw,Math.min(2.2,q.L/9),Math.min(2.2,q.L/9),1,sty);}});

T_('godown',{name:'Godown / cold store',group:'Modern · industrial & logistics',era:'1960s–now',span:[30,26],
 note:'Waterfront godown with a loading balcony and hoist beam on every floor and 3–4 m roller shutters; or a windowless white-panel cold store with condensers on the roof.',
 plan(ctx){const {r}=ctx,cold=r.chance(.35),sty=ctx.style({wall:cold?pal(r,['#ECEBE6','#E3E5E3','#DADDDC']):pal(r,['#B8B2A2','#A3A19A','#C9C0AA','#8F8D86','#C2B9A0']),trim:pal(r,cold?['#2F6FAE','#3E8E5A','#8E9398']:['#7A4E35','#5A5C58','#9C9A92']),frame:solid('#5A5C58'),glass:solid('#3A4448'),finish:cold?3:4});
  const n=cold?r.int([4,10]):r.int([2,7]),F=cold?r.range([5.5,7]):r.range([4.5,5.6]);
  const rows=[{h:5,spec:{f:cold?'LK':'FG',x:cold?'CS':'FG',r:cold?'CS':'FG',p:'BL'},light:'shop'},...floors(n-1,F,cold?{any:'CS',p:'BL'}:{f:'GD',x:'FS',r:'FS',p:'BL'},'cluster',cold?.1:.4)];
  const top=volume(ctx,{P:ctx.poly,roles:ctx.roles,rows,top:{h:1.3,spec:{any:'IT'}},sty,shell:{bay:cold?6:5.5,floor:F,win:cold?[.0,.0]:[.6,.55],lit:.3}});
  roofClutter(ctx,ctx.poly,top,sty,{tanks:[0,2],lift:false,extra:cold?[['COND',3],['COND',3],['COND',3]]:[[r.pick(['SIGNF0','SIGNF1']),5]]});}});

// malls and developments
function mallPodium(ctx,P,roles,{levels,F=5.5,park=2,sty,ground='MG'}){const {r}=ctx;
 // atrium and screen columns: pick front bays by index; the facade() column cache keeps them vertical
 const rows=[{h:6,spec:{f:ground,x:ground,r:'MG',p:'BL'},light:'shop'}];const parkAt=r.chance(.5)?'top':'mid';
 for(let i=1;i<levels;i++){if(parkAt==='mid'&&i===1)for(let k=0;k<park;k++)rows.push({h:3.2,spec:{f:'MK',x:'MK',r:'MK',p:'BL'},light:'none'});rows.push({h:F,spec:{f:['MP','MP','MA','MP','MP','MS','MP'],x:'MP',r:'MP',p:'BL'},light:'shop',opts:{stick:1}});}
 if(parkAt==='top')for(let k=0;k<park;k++)rows.push({h:3.2,spec:{f:'MK',x:'MK',r:'MK',p:'BL'},light:'none'});
 return volume(ctx,{P,roles,rows,top:{h:2,spec:{any:'MT'}},sty,shell:{bay:6,floor:F,win:[.3,.6],lit:.6,kind:1}});}
function mallStyle(ctx){const {r}=ctx,red=r.chance(.15);return ctx.style({wall:red?pal(r,['#B5121B','#8E0E15','#D43A2F']):pal(r,['#E6E2DA','#B9B2A6','#CDBA96','#D9CDB4','#C9A86A','#8C8F94','#E8E4DE']),trim:pal(r,['#8C6239','#4A4E52','#E6E2DA','#2F3A44']),frame:solid('#9A9EA2'),glass:pal(r,['#5E9C9A','#7FA3B5','#6E8C9A']),glow:WHITE,finish:5});}

T_('mall',{name:'Large shopping mall',group:'Modern · malls & developments',era:'1980s–now',span:[90,80],
 note:'Big box of 4–9 retail levels at 5–6 m, car-park band with louvres, blank cladding with glass atriums, LED screens and logos, bus terminus underneath, footbridge stubs.',
 plan(ctx){const {r}=ctx,sty=mallStyle(ctx),small=Math.min(ctx.width,ctx.depth)<40,levels=small?r.int([8,14]):r.int([4,8]);
  const top=mallPodium(ctx,ctx.poly,ctx.roles,{levels,sty,park:r.int([1,3])});
  for(let k=r.int([1,3]);k>0;k--){const q=faceSpot(ctx,ctx.poly),s=Math.min(r.range([1.5,2.6]),q.L/9);ctx.prop(ctx.pick('LOGO')??'LOGO0',q.x+q.ox*.4,top-3,q.z+q.oz*.4,q.yaw,s,s,1,sty);}
  if(r.chance(.6)){const q=faceSpot(ctx,ctx.poly);ctx.prop('FB',q.x,6.5,q.z,q.yaw,1,1,1,sty);}
  roofClutter(ctx,ctx.poly,top,sty,{tanks:[0,1],lift:false,extra:[['COND',3],['COND',3],['LIFT',3]]});
  if(!small&&r.chance(.35)){const w=Math.min(ctx.width*.45,40),d=Math.min(ctx.depth*.45,32),T=placePlan(ctx,rectPlan(w,d,2),1,0,-ctx.depth*.15,0);const osty=ctx.style({wall:solid('#2F3A44'),trim:solid('#B8BCC0'),frame:solid('#B8BCC0'),glass:pal(r,['#5F7F99','#9FB1BD','#4F6A66']),glow:WHITE,finish:5});
   volume(ctx,{P:T.P,roles:T.tags,y0:top,rows:floors(r.int([12,20]),4.2,{any:'CW'},'floor',.6),top:{h:6,spec:{any:'CT'}},sty:osty,shell:{bay:3,floor:4.2,win:[.92,.72],lit:.6,kind:1}});}}});

T_('podium-estate',{name:'Podium estate (towers on a mall)',group:'Modern · malls & developments',era:'1980s–2000s',span:[84,84],
 note:'Taikoo Shing / Whampoa Garden / Amoy Gardens pattern: 12–25 m shopping and car-park podium with a landscaped roof, towers 15–25 m apart in rows or a ring.',
 plan(ctx){const {r}=ctx,podSty=mallStyle(ctx),levels=r.int([2,4]),park=r.int([1,2]);
  const y0=volume(ctx,{P:ctx.poly,roles:ctx.roles,rows:[{h:6,spec:{f:'MG',x:'PS',r:'MG',p:'BL'},light:'shop'},...floors(levels-1,5,{f:'PS',x:'PS',r:'DW',p:'BL'},'shop'),...floors(park,3.2,{any:'MK',p:'BL'},'none')],top:{h:1.3,spec:{any:'PE'}},sty:podSty,shell:{bay:4.5,floor:5,win:[.8,.55],lit:.6,roof:[.42,.52,.36]}});
  const glass=r.chance(.35),s=glass?glassStyle(ctx):privateCrossStyle(ctx),rot=r.chance(.35)?Math.PI/4:0;
  const towers=packTowers(ctx,ctx.poly,glass?[PLANS.notched(),PLANS.squareGlass()]:[PLANS.cross(),PLANS.crossSlot()],{sep:r.range([15,22]),setback:4,max:12,rot,layout:r.pick(['grid','grid','ring','stagger']),minScale:.65,most:true});
  const base=glass?r.int([38,52]):r.int([25,35]);
  towers.forEach(T=>{const n=Math.round(base*(1+(r()-.5)*.1));if(glass)glassTower(ctx,T,y0,s,n);else crossTower(ctx,T,y0,s,n);});
  landscape(ctx,ctx.poly,y0+.02,towers,{sty:s.landSty});
  if(r.chance(.6)){const q=faceSpot(ctx,ctx.poly);ctx.prop('FB',q.x,6.5,q.z,q.yaw,1,1,1,podSty);}}});

T_('topside',{name:'Topside development (MTR deck)',group:'Modern · malls & developments',era:'1980s–now',span:[84,84],
 note:'Union Square / LOHAS Park / Festival City pattern: 15–30 m station or depot deck with louvres, blank walls and a planted edge, mall front on one side, 35–76 storey towers stepping up in height.',
 plan(ctx){const {r}=ctx,depot=r.chance(.5),dsty=ctx.style({wall:pal(r,['#A7A39B','#BDB8AE','#8F8C86','#C9C4BA']),trim:solid('#555B60'),frame:solid('#555B60'),glass:solid('#3A4A52'),glow:WHITE,finish:4});
  const mallSide=r.pick(['f','x','r']),spec=k=>({f:k,x:k,r:k,p:'BL',[mallSide]:k==='DW'?'PS':k});
  const rows=depot?[{h:9,spec:{...spec('DW'),f:'DP'},light:'none'},...floors(r.int([1,2]),5,spec('DW'),'none'),...floors(r.int([1,3]),3.2,{any:'MK',p:'BL'},'none')]
   :[{h:6,spec:{...spec('DW'),f:'MG',[mallSide]:'MG'},light:'shop'},...floors(r.int([2,3]),5,spec('DW'),'shop'),...floors(r.int([0,2]),3.2,{any:'MK',p:'BL'},'none')];
  const y0=volume(ctx,{P:ctx.poly,roles:ctx.roles,rows,top:{h:1.3,spec:{any:'PE'}},sty:dsty,shell:{bay:6,floor:5,win:[.4,.4],lit:.3,roof:[.42,.52,.36]}});
  const s=glassStyle(ctx),old=r.chance(.25);const so=old?privateCrossStyle(ctx):s;
  const towers=packTowers(ctx,ctx.poly,old?[PLANS.cross(),PLANS.newCross()]:[PLANS.notched(),PLANS.squareGlass(),PLANS.slabGlass()],{sep:r.range([15,20]),setback:5,max:10,layout:r.pick(['grid','stagger','ring']),minScale:.65,most:true});
  const base=old?r.int([22,30]):r.int([38,60]),step=r.chance(.5)?r.range([.03,.08]):0;
  towers.sort((a,b)=>a.u-b.u).forEach((T,i)=>{const n=Math.min(76,Math.round(base*(1+step*i)*(1+(r()-.5)*.08)));if(old)crossTower(ctx,T,y0,so,n);else glassTower(ctx,T,y0,s,n);});
  landscape(ctx,ctx.poly,y0+.02,towers,{sty:s.landSty,trees:.016});}});

export const MODERN_TYPES=Object.values(TYPES).map(({plan,...t})=>t);

// ---------------------------------------------------------------- entry
// site: {id, poly:[{x,z}], edges?:[{role}], yaw?}. Returns the sink (shared when passed in).
export function planSite(kit,site,typeId,seed=0,sink=new Sink()){const T=TYPES[typeId];if(!T||!site?.poly?.length)return sink;
 const ctx=makeContext(kit,site,typeId,seed,sink);const n0=sink.records.length;T.plan(ctx);
 if(sink.records.length===n0){// nothing fitted: leave an empty lot rather than an error
 }return sink;}
// Stand-in kit (module sizes only) for tests and for the viewer before kit.glb exists.
export function standInKit(){const modules={},families={};for(const [f,[w,h,n]] of Object.entries(FAMILIES)){families[f]=[];for(let k=0;k<n;k++){modules[f+k]={w,h};families[f].push(f+k);}}
 for(const p of PROPS)modules[p]={w:1,h:1};families.NAME=PROPS.filter(p=>/^NAME\d/.test(p));families.LOGO=PROPS.filter(p=>/^LOGO\d/.test(p));return {modules,families};}
