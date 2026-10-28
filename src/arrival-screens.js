import * as T from 'three';

// Ceiling-hung next-vehicle displays, three per canopy, readable from both ends of the platform.
// One canvas per platform feeds its three screens (both faces); redrawn only when its text changes.
// Bottom edge 2.74 m (platform deck 0.32 m): ≥0.5 m above a 1.9 m person. Roof underside is 3.48 m; the station-name sign line hangs at 7.05+1.43 m, so screens sit 0.35 m behind the platform centre.
const W=640,H=360,SCREEN=[1.07,.6],CENTRE_Y=3.04,ROOF_Y=3.46,COUNT=3,INSET=.35;
const housing=new T.MeshStandardMaterial({color:0x1b1f22,roughness:.55,metalness:.4}),rod=new T.MeshStandardMaterial({color:0x8d969b,roughness:.4,metalness:.8});
const WEATHER={morning:{icon:'sun',temp:31},rain:{icon:'rain',temp:26},night:{icon:'moon',temp:28}};

export function addArrivalScreens(root,st,heightAt){
 const boards=[];
 for(const platform of st.platforms){
  const canvas=document.createElement('canvas');canvas.width=W;canvas.height=H;
  const map=new T.CanvasTexture(canvas);map.colorSpace=T.SRGBColorSpace;map.anisotropy=4;
  const face=new T.MeshBasicMaterial({map,toneMapped:false});
  // Canopy LED strip length, screens at its quarter points.
  const x=-platform.side*(7.05+st.width*.5+INSET);
  for(let k=1;k<=COUNT;k++){const z=-platform.centerOffset-36+72*k/(COUNT+1),g=new T.Group();g.name='Arrival screen';
   g.position.set(x,CENTRE_Y+heightAt(st.s-z)-heightAt(st.s),z);
   g.add(new T.Mesh(new T.BoxGeometry(SCREEN[0]+.08,SCREEN[1]+.08,.07),housing));
   for(const side of [1,-1]){const s=new T.Mesh(new T.PlaneGeometry(...SCREEN),face);s.position.z=side*.036;if(side<0)s.rotation.y=Math.PI;s.name='Arrival screen display';g.add(s);
    const hanger=new T.Mesh(new T.CylinderGeometry(.015,.015,ROOF_Y-CENTRE_Y-SCREEN[1]/2),rod);hanger.position.set(side*SCREEN[0]*.35,(ROOF_Y-CENTRE_Y+SCREEN[1]/2)/2,0);g.add(hanger);}
   root.add(g);}
  boards.push({st,dir:platform.side,canvas,map,text:''});}
 return boards;}

function icon(x,kind,cx,cy){
 x.save();x.lineWidth=4;
 if(kind==='moon'){x.fillStyle='#f3e6a8';x.beginPath();x.arc(cx,cy,16,0,Math.PI*2);x.fill();x.fillStyle='#22385c';x.beginPath();x.arc(cx+8,cy-6,14,0,Math.PI*2);x.fill();}
 else{x.strokeStyle=x.fillStyle='#f2c230';x.beginPath();x.arc(cx-6,cy-6,10,0,Math.PI*2);x.fill();for(let i=0;i<8;i++){const a=i*Math.PI/4;x.beginPath();x.moveTo(cx-6+Math.cos(a)*14,cy-6+Math.sin(a)*14);x.lineTo(cx-6+Math.cos(a)*19,cy-6+Math.sin(a)*19);x.stroke();}
  x.fillStyle='#e9eef2';x.beginPath();x.arc(cx+2,cy+8,10,0,Math.PI*2);x.arc(cx+14,cy+4,12,0,Math.PI*2);x.arc(cx+24,cy+10,8,0,Math.PI*2);x.fill();
  if(kind==='rain'){x.strokeStyle='#8cc8f0';for(const d of [4,14,24]){x.beginPath();x.moveTo(cx+d,cy+22);x.lineTo(cx+d-4,cy+32);x.stroke();}}}
 x.restore();}

// Layout after the MTR platform display: navy bar with weather and clock, alternating white/aqua rows,
// destination left, orange platform roundel, time right-aligned.
export function drawArrivalBoard(board,{rows,clock,condition}){
 const w=WEATHER[condition]||WEATHER.morning,text=JSON.stringify([rows,clock,condition]);if(text===board.text)return false;board.text=text;
 const x=board.canvas.getContext('2d'),head=58,rh=(H-head)/4;
 x.fillStyle='#22385c';x.fillRect(0,0,W,head);icon(x,w.icon,34,30);
 x.fillStyle='#fff';x.font='500 30px "Segoe UI",Helvetica,Arial,sans-serif';x.textBaseline='middle';x.textAlign='left';x.fillText(`${w.temp}°C`,86,31);x.textAlign='right';x.fillText(clock,W-22,31);
 for(let i=0;i<4;i++){const y=head+i*rh,r=rows[i];x.fillStyle=i%2?'#a9dde0':'#eef1f2';x.fillRect(0,y,W,rh);if(!r)continue;
  x.fillStyle='#2b2b2b';x.textAlign='left';x.font='500 34px "Segoe UI",Helvetica,Arial,sans-serif';x.fillText(r.dest,24,y+rh/2-2);const dw=x.measureText(r.dest).width;
  x.font='26px "PingFang HK","Microsoft JhengHei",sans-serif';x.fillStyle='#555';x.fillText(r.destZh,24+dw+12,y+rh/2);
  x.fillStyle='#e8762c';x.beginPath();x.arc(W*.6,y+rh/2,22,0,Math.PI*2);x.fill();x.fillStyle='#fff';x.textAlign='center';x.font='600 30px "Segoe UI",Helvetica,Arial,sans-serif';x.fillText(r.platform,W*.6,y+rh/2+1);
  x.fillStyle='#1f1f1f';x.textAlign='right';x.font='500 34px "Segoe UI",Helvetica,Arial,sans-serif';x.fillText(r.when,W-24,y+rh/2);}
 if(!rows.length){x.fillStyle='#2b2b2b';x.textAlign='center';x.font='28px "Segoe UI",Helvetica,Arial,sans-serif';x.fillText('No service · 暫停服務',W/2,head+rh*1.5);}
 board.map.needsUpdate=true;return true;}
