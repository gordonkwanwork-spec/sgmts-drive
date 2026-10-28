import * as T from 'three';
import {corridorReserve} from './lots/wand.js';
import {edges,segmentsCross,segmentDistance} from './lots/geometry.js';

export function cityDiagnostics(lots,furniture){
 const warnings=[];
 if(!furniture.network)warnings.push('Authored parcel streets are missing. Existing engineering roads are retained; parcel access is unverified.');
 const ids=new Set();
 for(const lot of lots){
  if(ids.has(lot.id))warnings.push(`Duplicate parcel ${lot.id}`);ids.add(lot.id);
  const e=edges(lot.poly);
  if(e.some(([a,b],i)=>e.some(([c,d],j)=>j>i+1&&!(i===0&&j===e.length-1)&&(segmentsCross(a,b,c,d)||Math.min(segmentDistance(a,c,d),segmentDistance(b,c,d),segmentDistance(c,a,b),segmentDistance(d,a,b))<1e-7))))warnings.push(`Parcel ${lot.id} has a self-crossing or self-touching boundary; needs source-map review.`);
 }
 return warnings;
}

// Inspection uses the exact generated reservations. It never generates a second city.
export function cityOverlay(lots,records,ground){
 const group=new T.Group();group.name='City plan diagnostics';group.visible=false;
 const buffers=new Map();
 const ring=(poly,color,raise=1.1)=>{if(!poly.length)return;const list=buffers.get(color)||[];buffers.set(color,list);
  for(const [a,b] of edges(poly))list.push(a[0],ground(...a)+raise,a[1],b[0],ground(...b)+raise,b[1]);};
 const circle=(x,z,r)=>Array.from({length:16},(_,i)=>[x+Math.cos(i*Math.PI/8)*r,z+Math.sin(i*Math.PI/8)*r]);
 for(const l of lots){ring(l.poly,0x52dcff);const xs=l.poly.map(p=>p[0]),zs=l.poly.map(p=>p[1]),x=(Math.min(...xs)+Math.max(...xs))/2,z=(Math.min(...zs)+Math.max(...zs))/2;
  const canvas=document.createElement('canvas');canvas.width=384;canvas.height=64;const c=canvas.getContext('2d');c.fillStyle='rgba(5,18,25,.85)';c.fillRect(0,0,384,64);c.fillStyle='#a9efff';c.font='22px sans-serif';c.fillText(`${l.id} · ${l.zone}`,8,39);
  const sprite=new T.Sprite(new T.SpriteMaterial({map:new T.CanvasTexture(canvas),depthTest:false,transparent:true}));sprite.position.set(x,ground(x,z)+7,z);sprite.scale.set(18,3,1);group.add(sprite);
 }
 for(const r of records){for(const p of r.surfaces)ring(p,0xf2d48a);for(const p of r.footprints)ring(p,0xff719b,1.5);for(const t of r.trees)ring(circle(t.x,t.z,2.6*t.s+.5),0x84e68b);}
 for(const d of corridorReserve().filter((_,i)=>i%8===0))ring(circle(d.x,d.z,d.r),0xf29648,.8);
 for(const [color,list] of buffers){const geometry=new T.BufferGeometry();geometry.setAttribute('position',new T.Float32BufferAttribute(list,3));const line=new T.LineSegments(geometry,new T.LineBasicMaterial({color,depthTest:false,transparent:true,opacity:.75}));line.renderOrder=10;group.add(line);}
 return group;
}
