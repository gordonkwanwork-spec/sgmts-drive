// City rebuild 2 (Gordon, 14 Nov 2026): "a river to the east leading to Tin Shui Wai". The Hung Shui Kiu channel as a walled
// nullah (after the sandbox's city-channels.js section: vertical concrete walls, coping, promenade on the town bank) east of
// Tin Ha Road, flowing north; it passes under Ha Tsuen Road in a culvert (the gap between the two reaches) and leaves the map
// north-east beside Tin Ha Road. riverDepth() joins environment.js channelDepth(), so the terrain is cut, scenery and plots
// keep out and walkers drop into it exactly as for the corridor's own channels.
import * as T from 'three';
export const DEPTH=3.8,BANK=3,PROMENADE=5;
// width = water between the walls; bank = which way the town (promenade) side lies.
const REACHES=[
 {name:'Hung Shui Kiu channel',width:24,bank:[-1,0],pts:[[672,-700],[667,-800],[666,-915],[662,-1100],[645,-1305],[611,-1490],[586,-1608],[577,-1750],[577,-1900],[574,-2040],[569,-2122]]},
 {name:'Hung Shui Kiu channel (north)',width:24,bank:[-.75,-.66],pts:[[556,-2218],[585,-2256],[665,-2350],[735,-2415],[790,-2462]]},
];
const chaikin=(P,n=2)=>{for(;n-->0;){const Q=[P[0]];for(let i=0;i<P.length-1;i++){const a=P[i],b=P[i+1];Q.push([.75*a[0]+.25*b[0],.75*a[1]+.25*b[1]],[.25*a[0]+.75*b[0],.25*a[1]+.75*b[1]]);}Q.push(P.at(-1));P=Q;}return P;};
export const RIVERS=REACHES.map(r=>{const pts=chaikin(r.pts),pad=r.width/2+BANK+PROMENADE+2;
 return {...r,pts,x0:Math.min(...pts.map(p=>p[0]))-pad,x1:Math.max(...pts.map(p=>p[0]))+pad,z0:Math.min(...pts.map(p=>p[1]))-pad,z1:Math.max(...pts.map(p=>p[1]))+pad};});
// Distance from (x,z) to a reach's centreline (Infinity outside its box).
const distance=(r,x,z)=>{if(x<r.x0||x>r.x1||z<r.z0||z>r.z1)return Infinity;let best=Infinity;const P=r.pts;
 for(let i=1;i<P.length;i++){const ax=P[i-1][0],az=P[i-1][1],dx=P[i][0]-ax,dz=P[i][1]-az,t=Math.max(0,Math.min(1,((x-ax)*dx+(z-az)*dz)/(dx*dx+dz*dz||1)));best=Math.min(best,Math.hypot(x-ax-t*dx,z-az-t*dz));}return best;};
// Cut below the natural ground: full depth between the walls, easing out over BANK m (the walls stand at the top of that).
export function riverDepth(x,z){let d=0;for(const r of RIVERS){const q=distance(r,x,z);if(q<r.width/2+BANK)d=Math.max(d,DEPTH*Math.min(1,(r.width/2+BANK-q)/BANK));}return d;}
// The channel with its walls and promenade: nothing else may be built here.
export const riverReserve=(x,z,pad=0)=>RIVERS.some(r=>distance(r,x,z)<r.width/2+BANK+PROMENADE+1+pad);

// Water, walls with coping, end walls at the culvert mouths and a paved promenade on the town bank.
export function riverMeshes(ground,mats={}){const group=new T.Group();group.name='Hung Shui Kiu channel';
 const fallback=(color,roughness=.9)=>new T.MeshStandardMaterial({color,roughness});
 const M={water:new T.MeshStandardMaterial({color:0x4d8896,roughness:.12,metalness:.35,transparent:true,opacity:.9}),concrete:mats.concrete||fallback(0xb8b5a8),paving:mats.paving||fallback(0xb5a98c,.95)};
 const bufs=new Map(),quad=(mat,a,b,c,d)=>{const o=bufs.get(mat)||bufs.set(mat,{pos:[],idx:[]}).get(mat),n=o.pos.length/3;o.pos.push(...a,...b,...c,...d);o.idx.push(n,n+1,n+2,n,n+2,n+3);};
 for(const r of RIVERS){const P=r.pts,F=P.map((p,i)=>{const a=P[Math.max(0,i-1)],b=P[Math.min(P.length-1,i+1)],l=Math.hypot(b[0]-a[0],b[1]-a[1])||1,tx=(b[0]-a[0])/l,tz=(b[1]-a[1])/l;return {x:p[0],z:p[1],tx,tz,nx:tz,nz:-tx,g:ground(p[0],p[1])};});
  F.forEach((f,i)=>{const near=F.slice(Math.max(0,i-3),i+4);f.y=near.reduce((s,q)=>s+q.g,0)/near.length;});// level along the banks
  const town=Math.sign(F[0].nx*r.bank[0]+F[0].nz*r.bank[1])||1,W=r.width/2+BANK,at=(f,lat,dy)=>[f.x+f.nx*lat,f.y+dy,f.z+f.nz*lat];
  for(let i=1;i<F.length;i++){const a=F[i-1],b=F[i];
   quad(M.water,at(a,-W+.2,-2.2),at(a,W-.2,-2.2),at(b,W-.2,-2.2),at(b,-W+.2,-2.2));
   for(const s of [1,-1]){quad(M.concrete,at(a,s*W,-DEPTH-.3),at(a,s*W,.4),at(b,s*W,.4),at(b,s*W,-DEPTH-.3));// wall face
    quad(M.concrete,at(a,s*W,.4),at(a,s*(W+.7),.4),at(b,s*(W+.7),.4),at(b,s*W,.4));quad(M.concrete,at(a,s*(W+.7),.4),at(a,s*(W+.7),-.4),at(b,s*(W+.7),-.4),at(b,s*(W+.7),.4));}// coping and its back
   quad(M.paving,at(a,town*(W+.7),.08),at(a,town*(W+.7+PROMENADE),.08),at(b,town*(W+.7+PROMENADE),.08),at(b,town*(W+.7),.08));}
  for(const f of [F[0],F.at(-1)])quad(M.concrete,at(f,-W-.7,-DEPTH-.3),at(f,-W-.7,.4),at(f,W+.7,.4),at(f,W+.7,-DEPTH-.3));}// headwalls
 for(const [mat,{pos,idx}] of bufs){const g=new T.BufferGeometry();g.setAttribute('position',new T.Float32BufferAttribute(pos,3));g.setAttribute('uv',new T.Float32BufferAttribute(Array.from({length:pos.length/3*2},(_,i)=>pos[(i>>1)*3+(i&1?2:0)]/5),2));g.setIndex(idx);g.computeVertexNormals();
  const m=new T.Mesh(g,mat.clone());m.material.side=T.DoubleSide;m.name=mat===M.water?'Channel water':mat===M.paving?'Channel promenade':'Channel walls';m.receiveShadow=true;group.add(m);}
 return group;}
