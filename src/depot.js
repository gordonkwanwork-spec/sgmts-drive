// SGMTS depot on OZP lot 41B (cluster Zone D), set out from Mannings/Egis drawing V1038-DP-2003 "Depot Layout Plan"
// (1:500, HK1980 grid). Coordinates below are read off that drawing; fromHK converts them to game metres.
// Rubber-tyred ART: stabling and maintenance bays are painted, never railed.
import {fromHK,project,sample,roadSection,DEPOT} from './alignment.js';
import {pointInPolygon} from './lots/wand.js';

// Drawing pixel (60 dpi render) → HK1980: E816300 at x=208, N834400 at y=327, 4.72 px/m.
const px=(x,y)=>fromHK(816300+(x-208)/4.72,834400-(y-327)/4.73);
const ring=pts=>pts.map(([x,y])=>{const p=px(x,y);return [p.x,p.z];});

// Green site boundary, clockwise from the north-west corner at the roundabout.
export const SITE=ring([[125,352],[165,357],[215,332],[738,322],[800,378],[860,425],[970,462],[1500,437],[1370,1138],[1040,1078],[1013,1233],
 [900,1185],[780,1160],[640,1152],[500,1163],[380,1192],[283,1235],[240,990],[207,968],[188,925],[205,795],[197,715],[230,680]]);

const d=sample(DEPOT.s);
// Unpaved parts of the site: sewage reserve (north), drainage reserve (west), landscaped slopes (south arc, east edge).
export const RESERVES=[
 ring([[125,352],[215,332],[738,322],[790,372],[560,392],[245,392]]),
 ring([[125,352],[245,392],[292,650],[322,1000],[392,1195],[350,1210],[283,1235],[240,990],[207,968],[188,925],[205,795],[197,715],[230,680]]),
 ring([[283,1235],[380,1192],[500,1163],[640,1152],[780,1160],[900,1185],[1013,1233],[1017,1205],[900,1158],[780,1133],[640,1125],[500,1136],[380,1165],[300,1205]]),
 ring([[1500,437],[1370,1138],[1040,1078],[1043,1060],[1345,1110],[1468,452]])];
// Depot pavement stops at the SGMTS footpath edge except in the 30 m entrance throat at DEPOT.gate.
export function corridorClear(x,z){const s=project(x,z),r=sample(s),dx=x-r.x,dz=z-r.z;
 const along=(x-d.x)*d.tx+(z-d.z)*d.tz+(DEPOT.s-DEPOT.gate),lat=(x-d.x)*d.lx+(z-d.z)*d.lz,edge=Math.hypot(dx,dz)-roadSection(s).right;
 return edge>4.5||Math.abs(along)<DEPOT.opening/2&&lat>0&&edge>.2;}
export const inSite=(x,z)=>pointInPolygon([x,z],SITE)&&corridorClear(x,z);
export const paved=(x,z)=>inSite(x,z)&&!RESERVES.some(r=>pointInPolygon([x,z],r));
export const DEPOT_Y=d.y;

// Every coloured block of the annotated plan is a depot building. [x0,y0,x1,y1] in drawing pixels; heights in metres.
// doors: z (north–south) positions of vehicle openings on the west (face 'w') or east ('e') wall; open: that face is open.
const rect=([x0,y0,x1,y1])=>{const a=px(x0,y0),b=px(x1,y1);return {x0:Math.min(a.x,b.x),x1:Math.max(a.x,b.x),z0:Math.min(a.z,b.z),z1:Math.max(a.z,b.z)};};
const rowZ=y=>px(0,y).z;
export const BUILDINGS=[
 {name:'OCC & Office',...rect([938,508,1353,622]),h:13.5,kind:'office'},
 {name:'Vehicle Washing',...rect([938,622,1127,663]),h:8,kind:'hall',doors:[rowZ(642)],face:'w'},
 {name:'Bi-weekly / Quarterly Maintenance',...rect([938,663,1127,758]),h:11,kind:'hall',doors:[rowZ(690),rowZ(730)],face:'w'},
 {name:'Maintenance Office & Workshop',...rect([1127,622,1353,758]),h:12,kind:'workshop'},
 {name:'Heavy Maintenance & Test Track',...rect([938,758,1316,833]),h:12,kind:'hall',doors:[rowZ(779),rowZ(812)],face:'w'},
 {name:'Stabling shed · 16 ART',...rect([938,833,1316,1025]),h:8,kind:'shed',open:'w'},
 {name:'Stabling shed · 20 ART',...rect([361,826,740,1060]),h:8,kind:'shed',open:'e'},
 {name:'Storage',...rect([361,1060,740,1088]),h:5,kind:'store'}];

// Stabling bays inside the sheds: 30.5 m × 3.2 m painted boxes. front = bay end a vehicle drives towards; dir = unit heading.
const bay=(x0,x1,y,dir)=>{const a=px(dir>0?x1:x0,y),b=px(dir>0?x0:x1,y);return {front:{x:a.x,z:a.z},back:{x:b.x,z:b.z},dir:{x:Math.sign(a.x-b.x),z:0},length:Math.abs(a.x-b.x)};};
const WEST_ROWS=[843,864,885,906,927,959,980,1002,1023,1045],EAST_ROWS=[849,870,891,912,945,966,987,1008];
export const BAYS=[
 ...WEST_ROWS.flatMap((y,r)=>[{id:`W1-${r+1}`,...bay(389,534,y,-1)},{id:`W2-${r+1}`,...bay(568,713,y,-1)}]),
 ...EAST_ROWS.flatMap((y,r)=>[{id:`E1-${r+1}`,...bay(967,1111,y,1)},{id:`E2-${r+1}`,...bay(1145,1289,y,1)}])];
export const PLAYER_BAY=BAYS.find(b=>b.id==='E1-1');
export const PARKED_BAYS=['E1-3','E1-5','E2-2','W2-4','W1-7'].map(id=>BAYS.find(b=>b.id===id));

// Commercial vehicle park (min 1.1 ha, open-air asphalt): 72 goods-vehicle stalls, 3.5 m wide, in four rows off two
// east–west aisles joined by a west aisle. It is fenced from the depot and reached only by the public service road.
export const CV_STALLS=[];for(const [y0,y1] of [[400,471],[532,603],[603,674],[735,795]])for(let x=365;x+16.5<=665;x+=16.5){const a=px(x,y0),b=px(x+16.5,y1);CV_STALLS.push({x:(a.x+b.x)/2,z:(a.z+b.z)/2,w:Math.abs(b.x-a.x),d:Math.abs(b.z-a.z)});}
// 2.4 m chain-link fence enclosing the park from the depot buildings, access strip and SGMTS corridor; the only
// opening is the 9 m gate where the public service road enters from the west.
export const CV_FENCE=[[[294,478],[292,392],[740,392]],[[740,392],[740,800]],[[740,800],[300,800],[296,524]]].map(ring);
// Public service road (7.3 m, two-way): from the southern end of Road D3 along the Road D5 alignment south of the
// depot, north along the site's west side, then east over the drainage reserve into the vehicle park's north aisle.
// Never touches the SGMTS corridor. y rises from D3's level (1.5) to the depot platform.
const roadPts=ring([[1578,1135],[1520,1255],[1300,1320],[1000,1345],[700,1320],[420,1335],[180,1300],[70,1150],[55,900],[60,600],[95,505],[200,501],[335,501]]);
export const CV_ROAD=(()=>{let run=0;const out=roadPts.map((p,i)=>{if(i)run+=Math.hypot(p[0]-roadPts[i-1][0],p[1]-roadPts[i-1][1]);return {x:p[0],z:p[1],run};});
 const L=run,flatFrom=L-110;// level for the last 110 m (west road and park spur)
 return out.map(p=>({...p,y:1.5+(d.y-1.5)*Math.min(1,p.run/flatFrom)}));})();
export const CV_ROAD_WIDTH=7.3;
// Bounding box of the site and service road: a cheap first test for the per-point checks the environment runs everywhere.
export const DEPOT_BOUNDS=(()=>{const xs=[...SITE.map(p=>p[0]),...CV_ROAD.map(p=>p.x)],zs=[...SITE.map(p=>p[1]),...CV_ROAD.map(p=>p.z)];return {x0:Math.min(...xs),x1:Math.max(...xs),z0:Math.min(...zs),z1:Math.max(...zs)};})();
export const nearDepotBounds=(x,z,margin=0)=>x>DEPOT_BOUNDS.x0-margin&&x<DEPOT_BOUNDS.x1+margin&&z>DEPOT_BOUNDS.z0-margin&&z<DEPOT_BOUNDS.z1+margin;
export function nearServiceRoad(x,z,margin){if(!nearDepotBounds(x,z,margin))return null;for(let i=1;i<CV_ROAD.length;i++){const a=CV_ROAD[i-1],b=CV_ROAD[i],dx=b.x-a.x,dz=b.z-a.z,t=Math.max(0,Math.min(1,((x-a.x)*dx+(z-a.z)*dz)/(dx*dx+dz*dz)));if(Math.hypot(x-a.x-t*dx,z-a.z-t*dz)<margin)return a.y+(b.y-a.y)*t;}return null;}

// Floodlight masts (drawing pixels), 14 m, four heads each, at key points; src/environment.js adds a 36 m grid fill.
export const MASTS=[[840,430],[840,640],[840,1000],[330,500],[520,500],[520,705],[330,705],[330,1110],[760,1110],[1330,835],[1330,1030],[1180,1050]].map(([x,y])=>px(x,y)).filter(p=>inSite(p.x,p.z));
export const MAST_HEIGHT=14;
