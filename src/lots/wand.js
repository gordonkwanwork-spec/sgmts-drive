// Magic-wand lot extraction from the OZP boundary mask (1 = open paper, 0 = zoning line).
// Pure functions: shared by the editor (click a lot) and scripts/seed-lots.mjs.
import {PATH,roadSection,cycleOffset,CYCLE_WIDTH} from '../alignment.js';

// Game corridor reserve (road + footpath + cycle track), metres from the centreline.
export function corridorReserve(){const out=[];for(let i=0;i<PATH.length;i+=2){const p=PATH[i];out.push({x:p.x,z:p.z,r:Math.max(roadSection(p.s).right+3.75,cycleOffset(p.s)+CYCLE_WIDTH/2)+1});}return out;}

// Close the corridor in the mask so lots stop at the reserve edge, even where the OZP draws no line.
export function blockCorridor(mask,cal){
 const {width:w,height:h,metresPerPixel:m,originX,originZ}=cal;
 for(const {x,z,r} of corridorReserve()){const cx=(x-originX)/m,cy=(z-originZ)/m,R=r/m;
  for(let y=Math.max(0,Math.floor(cy-R));y<=Math.min(h-1,Math.ceil(cy+R));y++)for(let x2=Math.max(0,Math.floor(cx-R));x2<=Math.min(w-1,Math.ceil(cx+R));x2++)if((x2-cx)**2+(y-cy)**2<=R*R)mask[y*w+x2]=0;}
 return mask;
}

// 4-connected flood fill → region bitmap, or null if the seed is on a line / leaks past maxPixels.
export function flood(mask,w,h,sx,sy,maxPixels=400000){
 sx|=0;sy|=0;if(sx<0||sy<0||sx>=w||sy>=h||!mask[sy*w+sx])return null;
 const region=new Uint8Array(w*h),stack=[sy*w+sx];region[sy*w+sx]=1;let n=0;
 while(stack.length){const i=stack.pop();if(++n>maxPixels)return null;const x=i%w;
  for(const j of [x>0?i-1:-1,x<w-1?i+1:-1,i-w,i+w])if(j>=0&&j<w*h&&mask[j]&&!region[j]){region[j]=1;stack.push(j);}}
 return {region,count:n};
}

// Outer boundary by Moore-neighbour tracing, in pixel-corner coordinates.
export function trace(region,w,h){
 let start=-1;for(let i=0;i<w*h;i++)if(region[i]){start=i;break;}if(start<0)return [];
 const on=(x,y)=>x>=0&&y>=0&&x<w&&y<h&&region[y*w+x]===1;
 const dirs=[[1,0],[1,1],[0,1],[-1,1],[-1,0],[-1,-1],[0,-1],[1,-1]];
 let x=start%w,y=(start/w)|0,d=6;const sx=x,sy=y,pts=[[x,y]];
 for(let guard=0;guard<4*w*h;guard++){let k=0;for(;k<8;k++){const nd=(d+6+k)%8,[dx,dy]=dirs[nd];if(on(x+dx,y+dy)){x+=dx;y+=dy;d=nd;break;}}if(k===8||(x===sx&&y===sy))break;pts.push([x,y]);}
 return pts.map(([x,y])=>[x+.5,y+.5]);
}

// Douglas–Peucker simplification (closed ring handled as open polyline split at the far point).
export function simplify(pts,eps){
 if(pts.length<4)return pts;
 const dp=(a,b)=>{let far=-1,best=0;const [ax,ay]=pts[a],[bx,by]=pts[b],L=Math.hypot(bx-ax,by-ay)||1;for(let i=a+1;i<b;i++){const d=Math.abs((bx-ax)*(ay-pts[i][1])-(ax-pts[i][0])*(by-ay))/L;if(d>best){best=d;far=i;}}return best>eps?[...dp(a,far).slice(0,-1),...dp(far,b)]:[pts[a],pts[b]];};
 let far=0,best=0;for(let i=1;i<pts.length;i++){const d=Math.hypot(pts[i][0]-pts[0][0],pts[i][1]-pts[0][1]);if(d>best){best=d;far=i;}}
 return [...dp(0,far).slice(0,-1),...dp(far,pts.length-1).slice(0,-1)];
}

export const pixelToWorld=(cal,[px,py])=>[+(cal.originX+px*cal.metresPerPixel).toFixed(2),+(cal.originZ+py*cal.metresPerPixel).toFixed(2)];
export const worldToPixel=(cal,[x,z])=>[(x-cal.originX)/cal.metresPerPixel,(z-cal.originZ)/cal.metresPerPixel];

// Thicken zoning lines by r px (free only if the whole (2r+1)² window is free): closes dashed or broken boundaries.
function thicken(mask,w,h,r){const pass=(src,horiz)=>{const out=new Uint8Array(w*h),n=horiz?w:h,m=horiz?h:w;
  for(let j=0;j<m;j++){let blocked=0;const at=i=>horiz?j*w+i:i*w+j;for(let i=-r;i<n;i++){if(i+r<n&&!src[at(i+r)])blocked++;if(i-r-1>=0&&!src[at(i-r-1)])blocked--;if(i>=0)out[at(i)]=blocked?0:1;}}return out;};
 return pass(pass(mask,true),false);}
// Grow a region back by r px, staying on open paper, so closing gaps does not shrink the lot.
function regrow(region,mask,w,h,r){const pass=(src,horiz)=>{const out=new Uint8Array(w*h),n=horiz?w:h,m=horiz?h:w;
  for(let j=0;j<m;j++){let on=0;const at=i=>horiz?j*w+i:i*w+j;for(let i=-r;i<n;i++){if(i+r<n&&src[at(i+r)])on++;if(i-r-1>=0&&src[at(i-r-1)])on--;if(i>=0)out[at(i)]=on?1:0;}}return out;};
 const g=pass(pass(region,true),false);for(let i=0;i<g.length;i++)g[i]&=mask[i];return g;}
const thickened=new WeakMap();

// Click → world polygon. A flood that leaks through a gap in the plan retries with thicker lines (≈2.5, 5, 7.5 m).
export function wandPolygon(mask,cal,[x,z],eps=1.6,maxPixels=400000){
 const [px,py]=worldToPixel(cal,[x,z]),{width:w,height:h}=cal,sx=Math.round(px),sy=Math.round(py);
 if(!thickened.has(mask))thickened.set(mask,new Map());const cache=thickened.get(mask);
 for(const r of [0,2,4,6]){const m=r?cache.get(r)||cache.set(r,thicken(mask,w,h,r)).get(r):mask,f=flood(m,w,h,sx,sy,maxPixels);if(!f)continue;
  const region=r?regrow(f.region,mask,w,h,r):f.region;return simplify(trace(region,w,h),eps).map(p=>pixelToWorld(cal,p));}
 return null;
}

export function polygonArea(poly){let a=0;for(let i=0;i<poly.length;i++){const [x1,z1]=poly[i],[x2,z2]=poly[(i+1)%poly.length];a+=x1*z2-x2*z1;}return Math.abs(a)/2;}
export function pointInPolygon([x,z],poly){let inside=false;for(let i=0,j=poly.length-1;i<poly.length;j=i++){const [xi,zi]=poly[i],[xj,zj]=poly[j];if((zi>z)!==(zj>z)&&x<(xj-xi)*(z-zi)/(zj-zi)+xi)inside=!inside;}return inside;}
