// Unsignalised station crossings and their kerbside warning plates.
import * as T from 'three';
import {stationRefugeNose,STATION_REFUGE_WIDTH} from './refuge.js';

const tex=(w,h,draw)=>{const c=document.createElement('canvas');c.width=w;c.height=h;draw(c.getContext('2d'),w,h);const t=new T.CanvasTexture(c);t.colorSpace=T.SRGBColorSpace;t.anisotropy=4;return t;};
let M=null;
function materials(){if(M)return M;
 const lit=(map,o={})=>new T.MeshStandardMaterial({map,emissive:0xffffff,emissiveMap:map,emissiveIntensity:.15,roughness:.6,...o});
 const cn='"PingFang HK","Heiti TC",sans-serif';
 M={
  antiSkid:new T.MeshStandardMaterial({color:0xa4483a,roughness:.97,polygonOffset:true,polygonOffsetFactor:-1}),
  stop:lit(tex(256,340,(x,w,h)=>{x.fillStyle='#f28a1d';x.fillRect(0,0,w,h);x.strokeStyle='#fff';x.lineWidth=8;x.strokeRect(6,6,w-12,h-12);x.fillStyle='#111';x.textAlign='center';
   x.font=`bold 66px ${cn}`;x.fillText('停步',w/2,82);x.font='bold 46px Arial';x.fillText('STOP',w/2,132);
   x.beginPath();x.arc(w/2,160,13,0,7);x.fill();x.fillRect(w/2-15,176,30,52);x.fillRect(w/2-15,228,11,40);x.fillRect(w/2+4,228,11,40);
   x.font=`bold 38px ${cn}`;x.fillText('看清楚',w/2,300);x.font='bold 24px Arial';x.fillText('LOOK AROUND',w/2,326);})),
  watch:lit(tex(256,340,(x,w,h)=>{x.fillStyle='#fff';x.fillRect(0,0,w,h);x.fillStyle='#d22630';x.fillRect(0,224,w,116);x.strokeStyle='#d22630';x.lineWidth=8;x.strokeRect(4,4,w-8,h-8);
   x.fillStyle='#d22630';x.beginPath();x.arc(178,58,15,0,7);x.fill();x.save();x.translate(178,120);x.rotate(.18);x.fillRect(-14,-42,28,60);x.fillRect(-14,18,11,48);x.fillRect(4,18,11,48);x.restore();
   x.fillStyle='#333';x.fillRect(28,70,100,120);x.fillStyle='#fff';x.fillRect(40,84,76,40);x.fillRect(46,150,16,16);x.fillRect(94,150,16,16);
   x.fillStyle='#fff';x.textAlign='center';x.font=`bold 52px ${cn}`;x.fillText('留意車輛',w/2,284);x.font='bold 21px Arial';x.fillText('WATCH OUT FOR VEHICLES',w/2,320);})),
  plateBack:new T.MeshStandardMaterial({color:0x8d9295,metalness:.6,roughness:.45}),
 };return M;}
const plane=new T.PlaneGeometry(1,1);

// One crossing: c = {s}, half = half-width of the crossing along the road; returns railing plates to mount once railings exist.
export function unlitCrossing(g,c,half,{sample,roadSection,ribbon,batch,mats,lookMarking}){
 const m=materials(),s=c.s,r=sample(s),edge=roadSection(s),ch=Math.floor(s/240),island=STATION_REFUGE_WIDTH/2;
 const add=(geo,mat,name)=>{const mesh=new T.Mesh(geo,mat);mesh.name=name;mesh.receiveShadow=true;g.add(mesh);return mesh;};
 // The red surfacing ends at either side of the flush tactile cut-through.
 for(const [left,right] of [[edge.left,-island],[island,edge.right]])add(ribbon(s-half,s+half,left,right,.02),m.antiSkid,'crossing anti-skid surfacing');
 add(ribbon(s-half,s+half,-island,island,.02),mats.tactile,'refuge warning tiles');
 for(const dir of [-1,1])stationRefugeNose(batch,sample,s+dir*half,dir,ch);
 const P=(q,lat)=>{const t=sample(q);return new T.Vector3(t.x+t.lx*lat,t.y,t.z+t.lz*lat);};
 // LOOK markings for pedestrians standing on the island, in each half: read facing away from the island.
 for(const L of [-1,1]){const right=[-L*r.lz,L*r.lx],from=[-L*r.tx,-L*r.tz];g.add(lookMarking(s,L*(island+.95),-L,from[0]*right[0]+from[1]*right[1]>0));}
 // Plates go on the kerbside railing 1.7 m (停步 STOP) and 2.35 m (留意車輛) beyond each end of the crossing, facing the footway.
 const plates=[];for(const k of [-1,1]){const w=k>0?edge.right:-edge.left;for(const d of [-1,1])for(const [o,mat] of [[1.7,m.stop],[2.35,m.watch]]){const q=s+d*(half+o);plates.push({p:P(q,k*(w+.25)),out:new T.Vector3(r.lx*k,0,r.lz*k),mat});}}
 return plates;}

// Mount each plate on the railing panel passing within 0.6 m of its target (fences: {ax,az,bx,bz,y}), at the nearest point
// on that panel; a plate with no railing there is skipped.
export function mountRailingPlates(group,plates,fences){const m=materials();let mounted=0;
 for(const {p,out,mat} of plates){let best=null,bd=.6;
  for(const f of fences){const ex=f.bx-f.ax,ez=f.bz-f.az,L2=ex*ex+ez*ez;if(L2<.36)continue;const t=Math.min(.85,Math.max(.15,((p.x-f.ax)*ex+(p.z-f.az)*ez)/L2)),x=f.ax+ex*t,z=f.az+ez*t,dd=Math.hypot(x-p.x,z-p.z);if(dd<bd){bd=dd;best={x,z,y:f.y};}}
  if(!best)continue;mounted++;const yaw=Math.atan2(out.x,out.z);
  for(const back of [0,1]){const plate=new T.Mesh(plane,back?m.plateBack:mat);plate.scale.set(.44,.58,1);plate.position.set(best.x,best.y+.55,best.z).addScaledVector(out,back?.035:.04);
   plate.rotation.y=yaw+(back?Math.PI:0);plate.name=back?'railing plate back':'railing plate '+(mat===m.stop?'停步 STOP':'留意車輛');group.add(plate);}}
 return mounted;}
