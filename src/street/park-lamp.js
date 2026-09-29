import * as T from 'three';
const round=new T.CylinderGeometry(1,1,1,24);
const diffuser=new T.CylinderGeometry(.44,.12,.3,24);
const pale=new T.MeshStandardMaterial({color:0xd1d4ce,roughness:.7});
const dark=new T.MeshStandardMaterial({color:0x30343b,roughness:.65});
// Photo reference: straight pale shaft, charcoal drum and a recessed tapered lens with radial ribs.
export function parkLamp(batch,base,height,lens,chunk=0){
 const put=(name,geometry,material,x,y,z,scale,rotation=new T.Euler())=>batch('park-lamp-'+name,geometry,material,base.clone().add(new T.Vector3(x,y,z)),scale,rotation,chunk);
 put('pole',round,pale,0,(height-.42)/2,0,new T.Vector3(.085,height-.42,.085));
 put('drum',round,dark,0,height-.14,0,new T.Vector3(.5,.28,.5));
 put('diffuser',diffuser,lens,0,height-.4,0,new T.Vector3(1,1,1));
 put('collar',round,dark,0,height-.55,0,new T.Vector3(.12,.09,.12));
 for(let i=0;i<4;i++){const a=i*Math.PI/2,start=new T.Vector3(.1*Math.cos(a),height-.55,.1*Math.sin(a)),end=new T.Vector3(.46*Math.cos(a),height-.28,.46*Math.sin(a)),d=end.clone().sub(start),mid=start.add(end).multiplyScalar(.5);
  put('rib',round,dark,mid.x,mid.y,mid.z,new T.Vector3(.018,d.length(),.018),new T.Euler().setFromQuaternion(new T.Quaternion().setFromUnitVectors(new T.Vector3(0,1,0),d.normalize())));}
 return base.clone().add(new T.Vector3(0,height-.4,0));
}
