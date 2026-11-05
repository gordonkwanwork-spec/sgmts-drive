// Footway paving bonds, pure geometry (no Three.js / DOM). Sources: HyD H5114C (200×100 blocks, 300×300 slabs; stack, basket weave,
// stretcher, herringbone at 90° and 45°; grey / brown / red) and H5134B (herringbone preferred under heavy loading); red 45° herringbone
// with a lighter grey guide band is what Gordon's site photos (2026-10-06) show. Metres, local frame x→right, y→down.
// Each pattern: one `unit` (list of [x,y,w,h] blocks) repeated on the lattice a,b, then rotated by `theta`.
// periodX/periodZ = shortest world-axis translations of the rotated lattice, so a texture of whole periods tiles seamlessly.
const R=Math.SQRT1_2;
const HERRING=[[0,0,.2,.1],[.2,-.1,.1,.2]];                       // one step of the stair; (.1,.1) shift continues the chain
export const PATTERNS={
 herringbone45:{label:'Herringbone 45° · red',theta:-Math.PI/4,unit:HERRING,a:[.4,0],b:[.1,.1],periodX:.2*R,periodZ:.4*R,base:[146,70,56],band:[150,145,128],joint:.005},
 herringbone90:{label:'Herringbone 90° · red',theta:0,unit:HERRING,a:[.4,0],b:[.1,.1],periodX:.4,periodZ:.4,base:[146,70,56],band:[150,145,128],joint:.005},
 stretcher:{label:'Stretcher bond · grey',theta:0,unit:[[0,0,.2,.1]],a:[.2,0],b:[.1,.1],periodX:.2,periodZ:.2,base:[170,169,160],joint:.005},
 basket:{label:'Basket weave · brown',theta:0,unit:[[0,0,.2,.1],[0,.1,.2,.1],[.2,0,.1,.2],[.3,0,.1,.2]],a:[.4,0],b:[.2,.2],periodX:.4,periodZ:.4,base:[128,86,70],joint:.005},
 slab:{label:'Slabs 300×300 · grey',theta:0,unit:[[0,0,.3,.3]],a:[.3,0],b:[0,.3],periodX:.3,periodZ:.3,base:[168,167,158],joint:.006},
};
// Footway texture size in metres, shared by every pattern so geometry UVs never depend on the pattern chosen.
export const PX=12,PZ=6.5;
export const BAND={amplitude:.3,halfWidth:.45,wavelength:PX};     // guide band: bandCentre(x)=PZ/2+amplitude·sin(2πx/wavelength)
export const bandCentre=x=>PZ/2+BAND.amplitude*Math.sin(2*Math.PI*x/BAND.wavelength);
// Tiny non-uniform scale so the texture holds a whole number of lattice periods (≤1.5 %, invisible on 100 mm blocks).
export const fit=(p,w=PX,h=PZ)=>({sx:w/(Math.round(w/p.periodX)*p.periodX),sz:h/(Math.round(h/p.periodZ)*p.periodZ)});
// Every block overlapping the w×h window: {x,z,hw,hh,rot} = world centre, half sizes, rotation. Scaled lattice, window origin at (0,0).
export function* blocks(p,w=PX,h=PZ){
 const {sx,sz}=fit(p,w,h),c=Math.cos(p.theta),s=Math.sin(p.theta),[ax,ay]=p.a,[bx,by]=p.b,det=ax*by-ay*bx,m=.35;
 const toLocal=(x,z)=>{const X=x/sx,Z=z/sz;return [c*X+s*Z,-s*X+c*Z];};
 let i0=1e9,i1=-1e9,j0=1e9,j1=-1e9;
 for(const [x,z] of [[-m,-m],[w+m,-m],[-m,h+m],[w+m,h+m]]){const [lx,ly]=toLocal(x,z),i=(lx*by-ly*bx)/det,j=(ax*ly-ay*lx)/det;i0=Math.min(i0,i);i1=Math.max(i1,i);j0=Math.min(j0,j);j1=Math.max(j1,j);}
 for(let i=Math.floor(i0)-1;i<=Math.ceil(i1)+1;i++)for(let j=Math.floor(j0)-1;j<=Math.ceil(j1)+1;j++)for(const [x,y,bw,bh] of p.unit){
  const lx=i*ax+j*bx+x+bw/2,ly=i*ay+j*by+y+bh/2,wx=sx*(c*lx-s*ly),wz=sz*(s*lx+c*ly);
  if(wx>-m&&wx<w+m&&wz>-m&&wz<h+m)yield {x:wx,z:wz,hw:bw/2,hh:bh/2,rot:p.theta};
 }
}
