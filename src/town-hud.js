// "Drive around town" interface, after the city-rules sandbox's visit mode: a top bar (back to the menu, walk, drive) and a
// GTA-style round radar of the city bottom-left that turns with the view (up is the way you look), you as an arrow in the middle,
// N on the rim, zooming out as you speed up. The streets are painted once onto a canvas; each frame copies a turned window of it.
const PX=.8,PAD=80,COL={ground:'#1f2b24',foot:'#56635a',road:'#a4adb0',corridor:'#6f8a86',ring:'#2f5a35'};

// roads: [{pts:[[x,z]…], cw (carriageway m), fp (footway m)}]; corridor: [[x,z,halfWidth]…] along the SGMTS road.
export function createTownHud({mount,roads,corridor,onMenu,onWalk,onDrive}){
 const bar=document.createElement('div');bar.id='town-bar';
 bar.innerHTML='<button data-act="menu">← Menu</button><button data-act="walk">Walk / 步行</button><button data-act="drive">Drive / 駕駛</button>';
 const box=document.createElement('div');box.id='town-radar';box.innerHTML='<canvas width="380" height="380"></canvas><b>N</b><i></i>';
 mount.append(bar,box);
 bar.addEventListener('click',e=>{const a=e.target.closest('button')?.dataset.act;e.target.blur?.();if(a==='menu')onMenu();if(a==='walk')onWalk();if(a==='drive')onDrive();});
 // base map
 const all=[...roads.flatMap(r=>r.pts),...corridor.map(p=>[p[0],p[1]])],x0=Math.min(...all.map(p=>p[0]))-PAD,z0=Math.min(...all.map(p=>p[1]))-PAD,
  x1=Math.max(...all.map(p=>p[0]))+PAD,z1=Math.max(...all.map(p=>p[1]))+PAD,base=document.createElement('canvas');
 base.width=Math.ceil((x1-x0)*PX);base.height=Math.ceil((z1-z0)*PX);const g=base.getContext('2d'),px=([x,z])=>[(x-x0)*PX,(z-z0)*PX];
 g.fillStyle=COL.ground;g.fillRect(0,0,base.width,base.height);g.lineCap='round';g.lineJoin='round';
 const line=(pts,w,col)=>{g.strokeStyle=col;g.lineWidth=Math.max(1,w*PX);g.beginPath();pts.forEach((p,i)=>g[i?'lineTo':'moveTo'](...px(p)));g.stroke();};
 for(const r of roads)line(r.pts,r.cw+2*r.fp,COL.foot);
 const cw=corridor.length?Math.max(...corridor.map(p=>p[2]))*2:0;line(corridor,cw+6,COL.foot);line(corridor,cw,COL.corridor);
 for(const r of roads)line(r.pts,r.cw,COL.road);
 const view=box.querySelector('canvas'),v=view.getContext('2d'),north=box.querySelector('b');let zoom=1;
 return {
  // pose: {x, z (world m), fx, fz (camera forward on the ground), speed (m/s), avatar}
  update({x,z,fx,fz,speed,avatar}){
   const ang=Math.atan2(fx,-fz),want=1/(1+Math.min(1.6,speed/14));zoom+=(want-zoom)*.08;// metres shown grow with speed
   const S=view.width,scale=S/(2*140)*zoom/PX;v.setTransform(1,0,0,1,0,0);v.fillStyle=COL.ground;v.fillRect(0,0,S,S);
   v.setTransform(scale,0,0,scale,S/2,S/2);v.rotate(-ang);const [bx,by]=px([x,z]);v.drawImage(base,-bx,-by);
   const r=S/2-14;north.style.left=(50+50*(r/(S/2))*Math.sin(-ang))+'%';north.style.top=(50-50*(r/(S/2))*Math.cos(-ang))+'%';
   for(const b of bar.querySelectorAll('button'))b.classList.toggle('active',b.dataset.act===(avatar==='car'?'drive':avatar==='foot'?'walk':''));}};
}
