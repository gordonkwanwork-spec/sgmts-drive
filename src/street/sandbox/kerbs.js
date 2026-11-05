import * as T from 'three';
// H1118A K1: 125 × 250 mm, 25 mm setback over the top 100 mm,
// with 15 mm rounded arrises at the two ends of the sloping face.
export function k1Profile(){
 const vertices=[[.125,-.25],[0,-.25],[0,-.1],[.025,0],[.125,0]],out=[];
 for(let i=0;i<vertices.length;i++){
  const p=vertices[i];if(i!==2&&i!==3){out.push(p);continue;}
  const prev=vertices[(i+vertices.length-1)%vertices.length],next=vertices[(i+1)%vertices.length];
  const a=new T.Vector2(prev[0]-p[0],prev[1]-p[1]).normalize(),b=new T.Vector2(next[0]-p[0],next[1]-p[1]).normalize();
  const half=Math.acos(a.dot(b))/2,d=.015/Math.tan(half),c=new T.Vector2(...p).add(a.clone().add(b).normalize().multiplyScalar(.015/Math.sin(half)));
  const start=new T.Vector2(...p).addScaledVector(a,d),end=new T.Vector2(...p).addScaledVector(b,d);
  const angle=Math.atan2(start.y-c.y,start.x-c.x),endAngle=Math.atan2(end.y-c.y,end.x-c.x);let turn=endAngle-angle;
  if(turn>Math.PI)turn-=2*Math.PI;if(turn< -Math.PI)turn+=2*Math.PI;
  for(let j=0;j<=4;j++)out.push([c.x+.015*Math.cos(angle+turn*j/4),c.y+.015*Math.sin(angle+turn*j/4)]);
 }
 return out;
}
export function kerbGeometry(from,to,side,edge,height){
 const profile=k1Profile(),n=profile.length,positions=[],indices=[];
 for(const x of [from,to])for(const [depth,y] of profile)positions.push(x,height(x,side*edge)+y,side*(edge+depth));
 for(let i=0;i<n;i++){const j=(i+1)%n;indices.push(i,j,n+i,j,n+j,n+i);}
 for(let i=1;i<n-1;i++)indices.push(0,i+1,i,n,n+i,n+i+1);
 const geometry=new T.BufferGeometry();geometry.setAttribute('position',new T.Float32BufferAttribute(positions,3));geometry.setIndex(indices);geometry.computeVertexNormals();return geometry;
}
