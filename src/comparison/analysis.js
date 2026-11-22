export function landUse(zone){
 if(/^R\(/.test(zone))return 'Residential';
 if(/^C\(/.test(zone))return 'Commercial';
 if(/^G\/IC/.test(zone))return 'Community';
 if(/^V/.test(zone))return 'Village';
 if(/Logistics/.test(zone))return 'Logistics';
 if(/Enterprise/.test(zone))return 'Enterprise';
 if(/Mixed Use/.test(zone))return 'Mixed use';
 if(zone==='I'||/Industry Park/.test(zone))return 'Industrial';
 if(zone==='GB')return 'Green belt';
 if(/^O($|\()/.test(zone))return 'Open space';
 if(/depot/i.test(zone))return 'Depot';
 return 'Other designated use';
}
const reviewUses=new Set(['Residential','Commercial','Mixed use','Village','Industrial','Enterprise','Logistics','Community']);
export function loadImage(src){
 return new Promise((resolve,reject)=>{const i=new Image();i.onload=()=>resolve(i);i.onerror=()=>reject(Error('A comparison layer could not be loaded.'));i.src=src;});
}
function surface(w,h){
 const canvas=document.createElement('canvas');canvas.width=w;canvas.height=h;return canvas.getContext('2d',{willReadFrequently:true});
}
function nearestStreet(x,z,streets){
 let best=null;
 for(const street of streets){const p=street.points;for(let i=1;i<p.length;i++){
  const [ax,az]=p[i-1],[bx,bz]=p[i],dx=bx-ax,dz=bz-az;
  const t=Math.max(0,Math.min(1,((x-ax)*dx+(z-az)*dz)/(dx*dx+dz*dz||1)));
  const distance=Math.max(0,Math.hypot(x-ax-t*dx,z-az-t*dz)-street.width/2);
  if(!best||distance<best.distance)best={name:street.name,distance};
 }}
 return best;
}
export async function analyse(data,sheet){
 const {cal}=data,{width:w,height:h,metresPerPixel:m}=cal;
 const [built,used,plan]=await Promise.all([loadImage(data.built),loadImage(data.used),loadImage(sheet)]);
 if([built,used,plan].some(img=>img.width!==w||img.height!==h))throw Error('Layer dimensions do not match the georeferenced sheet.');
 const pixels=p=>[(p[0]-cal.originX)/m,(p[1]-cal.originZ)/m];
 const read=img=>{const ctx=surface(w,h);ctx.drawImage(img,0,0);return ctx.getImageData(0,0,w,h).data;};
 const buildings=read(built),infra=read(used),openCtx=surface(w,h),openMap=openCtx.createImageData(w,h);
 const lots=data.lots.map(lot=>{
  const points=lot.poly.map(pixels),xs=points.map(p=>p[0]),ys=points.map(p=>p[1]);
  const x0=Math.max(0,Math.floor(Math.min(...xs))),x1=Math.min(w,Math.ceil(Math.max(...xs)));
  const y0=Math.max(0,Math.floor(Math.min(...ys))),y1=Math.min(h,Math.ceil(Math.max(...ys)));
  const box=[x0,y0,x1,y1],path=new Path2D();
  points.forEach(([x,y],i)=>i?path.lineTo(x,y):path.moveTo(x,y));path.closePath();
  const use=landUse(lot.zone),review=reviewUses.has(use);
  let total=0,b=0,u=0,side=0,square=null;
  if(x1>x0&&y1>y0){
   const c=surface(x1-x0,y1-y0);c.translate(-x0,-y0);c.fill(path);
   const inside=c.getImageData(0,0,x1-x0,y1-y0).data;
   // Largest axis-aligned square of adjacent open cells, bounded by the traced parcel.
   const above=new Uint16Array(x1-x0+1);
   for(let y=y0;y<y1;y++){let diagonal=0;for(let x=x0;x<x1;x++){
    const col=x-x0+1,previous=above[col];above[col]=0;
    const offset=4*(y*w+x),a=inside[4*((y-y0)*(x1-x0)+x-x0)+3];if(a<128){diagonal=previous;continue;}
    total++;
    if(buildings[offset+3]>=128)b++;else if(infra[offset+3]>=128)u++;
    else{
     const size=1+Math.min(above[col-1],previous,diagonal);above[col]=size;
     if(size>side){side=size;square=[x-size+1,y-size+1,size];}
     if(review){openMap.data[offset]=237;openMap.data[offset+1]=160;openMap.data[offset+2]=62;openMap.data[offset+3]=172;}
    }
    diagonal=previous;
   }}
  }
  const ha=m*m/10000;
  const street=square&&nearestStreet(cal.originX+(square[0]+side/2)*m,cal.originZ+(square[1]+side/2)*m,data.streets||[]);
  const clipped=x0<=1||y0<=1||x1>=w-1||y1>=h-1;
  return {...lot,use,review,path,box,square,street,clipped,span:side*m,total:total*ha,built:b*ha,used:u*ha,open:(total-b-u)*ha,coverage:total?b/total:0};
 });
 openCtx.putImageData(openMap,0,0);
 return {data,cal,lots,built,used,plan,open:openCtx.canvas,stops:data.stops.map(s=>({...s,point:pixels(s.point)})),route:data.route.map(pixels)};
}
