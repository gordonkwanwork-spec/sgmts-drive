import * as T from 'three';

// North-up world metres, traced on the game OZP.
const trace=[[-196,-1007],[-131,-1009],[-96,-1011],[-61,-1018],[-22,-1023],[0,-1023],[39,-1015],[58,-1017],[102,-1040],[129,-1048],[160,-1048],[201,-1047],[229,-1046],[254,-1051],[279,-1064],[299,-1103],[319,-1155],[336,-1196],[352,-1240],[368,-1272]];
const curve=new T.CatmullRomCurve3(trace.map(([x,z])=>new T.Vector3(x,0,z)));
export const length=curve.getLength(),count=Math.ceil(length/2);
export const riverFrames=curve.getSpacedPoints(count).map((p,i)=>{
 const t=curve.getTangentAt(i/count);
 return {x:p.x,z:p.z,nx:-t.z,nz:t.x,d:length*i/count};
});
export const waterHalf=8.5,walkEdge=13.6,rampEdge=17.2,bankEdge=21.5,outerEdge=25;
export const waterY=d=>-2.25-.0009*d;
export const clamp=t=>Math.min(1,Math.max(0,t));
const key=(x,z)=>Math.floor(x/48)+','+Math.floor(z/48);
const grid=new Map();
for(let i=0;i<count;i++){
 const a=riverFrames[i],b=riverFrames[i+1];
 for(let x=Math.floor((Math.min(a.x,b.x)-60)/48);x<=Math.floor((Math.max(a.x,b.x)+60)/48);x++)
 for(let z=Math.floor((Math.min(a.z,b.z)-60)/48);z<=Math.floor((Math.max(a.z,b.z)+60)/48);z++){
  const k=x+','+z;if(!grid.has(k))grid.set(k,[]);grid.get(k).push(i);
 }
}
export function riverAt(x,z){
 if(x< -257||x>429||z< -1334||z> -945)return null;
 let best=null,min=60**2;
 for(const i of grid.get(key(x,z))||[]){
  const a=riverFrames[i],b=riverFrames[i+1],dx=b.x-a.x,dz=b.z-a.z;
  const raw=((x-a.x)*dx+(z-a.z)*dz)/(dx*dx+dz*dz),t=clamp(raw);
  const ox=x-a.x-t*dx,oz=z-a.z-t*dz,dist=ox*ox+oz*oz;
  if(dist>=min)continue;
  min=dist;best={d:a.d+t*(b.d-a.d),offset:Math.sign(dx*oz-dz*ox)*Math.sqrt(dist),
   past:i===0&&raw<0?-raw*Math.hypot(dx,dz):i===count-1&&raw>1?(raw-1)*Math.hypot(dx,dz):0};
 }
 return best;
}
function bankWidth(r){return (r.offset>0&&bankTerrace(r.d)?.outer)||outerEdge;}
export function riverReserve(x,z,margin=0){
 const r=riverAt(x,z);return !!r&&r.past<1+margin&&Math.abs(r.offset)<bankWidth(r)+margin;
}
export function riverExcavation(x,z,y){
 const r=riverAt(x,z);if(!r)return y;
 // The terrain is on an 8 m grid. Excavate beneath the whole bank then span the
 // coarse triangle edges with the detailed bank mesh and its buried outer skirt.
 const skirt=Math.abs(r.d-landing)<135?Math.max(39,bankWidth(r)+12):35;
 const fade=clamp((skirt-Math.abs(r.offset))/9)*clamp((11-r.past)/8);
 return T.MathUtils.lerp(y,Math.min(y,waterY(r.d)-1.25),fade);
}
export const landing=riverAt(167,-1048).d;

// Include the skew of the road: both deck edges must reach solid ground beyond the upper paths.
export function d6Span(road,F,half){
 if(road.id!=='city-d6')return null;
 const rows=F.filter(f=>[-half,0,half].some(o=>riverReserve(f.x+f.lx*o,f.z+f.lz*o,5)));
 return rows.length>1?[rows[0].d,rows.at(-1).d]:null;
}

// The station square faces the south bank between the cycleway and the railway.
export const terraceFrames=riverFrames.filter(f=>f.x>=35&&f.x<=210);
const terraceStart=terraceFrames[0].d,terraceEnd=terraceFrames.at(-1).d;
export function bankTerrace(d){
 if(d<terraceStart||d>terraceEnd)return null;
 const blend=clamp(Math.min(d-terraceStart,terraceEnd-d)/12);
 return {blend,inner:walkEdge+9.6*blend,lane:rampEdge+(9.6+.4)*blend,
  crest:bankEdge+10*blend,outer:outerEdge+9.5*blend,
 };
}

const bankLowering=d=>Math.max(0,4.05-.045*Math.max(0,Math.abs(d-landing)-32));
// A plane in world metres keeps the ramp grade through the tight river bends.
export const terraceRamp=(x,walk)=>Math.max(walk,3.15-.042*Math.max(0,x-72));
export function upperBankY(d,x,natural,terrace){
 const upper=natural-bankLowering(d);
 return terrace?Math.max(upper,T.MathUtils.lerp(upper,terraceRamp(x,waterY(d)+1.05),terrace.blend)):upper;
}
