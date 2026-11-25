import {lifts} from './a2-footbridge.js';
import {worldCoordinates,rail,datum} from './a2-site.js';
import {STOPS,DEPOT,LENGTH,sample,project} from './alignment.js';

const overlook=worldCoordinates(-65,114);
const plazaLift=lifts.find(l=>l.name==='HSWRL plaza');
export const FREE_SPAWNS=[

 ...STOPS.map(st=>({id:st.id,name:st.name,zh:st.zh,s:st.s,lat:st.platformLateral+st.width+3})),
 {id:'a2-square',name:'A2 interchange square',zh:'洪水橋交匯廣場',s:project(overlook.x,overlook.z),position:[overlook.x,datum+37,overlook.z],heading:rail.heading-.12,pitch:-.34},
 {id:'a2-lift-walk',name:'A2 footbridge lifts · on foot',zh:'洪水橋天橋升降機 · 步行',s:project(plazaLift.street.x,plazaLift.street.z),position:[plazaLift.street.x,plazaLift.base,plazaLift.street.z],heading:Math.atan2(plazaLift.street.x-plazaLift.car.x,plazaLift.street.z-plazaLift.car.z),pitch:0,walk:true},
 {id:'a2-riverside-walk',name:'A2 riverside promenade · on foot',zh:'洪水橋河畔長廊 · 步行',s:project(122.64,-1035.73),position:[122.64,-1.49,-1035.73],heading:-1.32,pitch:0,walk:true},
 {id:'hsk-d7-walk',name:'HSK D7 street walk',zh:'洪水橋 D7 街道步行',s:project(-266,-721),position:[-266,2,-721],heading:-1.37,pitch:0,walk:true},
 // City rebuild 2: start at the wheel of a car on a city street (explore mode; Enter gets out to walk).
 {id:'city-drive-d7',name:'City drive · Road D7',zh:'市區駕駛 · D7號路',s:project(-300,-733),position:[-300,2,-733],heading:-1.37,pitch:0,walk:true,car:true},
 {id:'city-drive-station',name:'City drive · Station street',zh:'市區駕駛 · 車站街',s:project(300,-715),position:[300,2,-715],heading:1.1,pitch:0,walk:true,car:true},
 {id:'city-drive-roundabout',name:'City drive · D3/D5 roundabout',zh:'市區駕駛 · D3/D5 迴旋處',s:project(-60,-2456),position:[-60,2,-2456],heading:1.2,pitch:0,walk:true,car:true},
 {id:'hsk-streets',name:'HSK streets overview',zh:'洪水橋街道鳥瞰',s:project(-126,-103),position:[-126,480,-103],heading:.28,pitch:-.73},
 {id:'depot',name:'Depot entrance',zh:'車廠入口',s:DEPOT.gate,lat:30},
 {id:'start',name:'Nai Wai corridor end',zh:'泥圍走廊盡頭',s:0,lat:10},
 {id:'end',name:'Far corridor end',zh:'產業園後走廊盡頭',s:LENGTH,lat:10,reverse:true},
];
export function freeSpawn(id){
 const spawn=FREE_SPAWNS.find(p=>p.id===id)||FREE_SPAWNS[0],p=sample(spawn.s);
 if(spawn.position)return {freeX:spawn.position[0],freeY:spawn.position[1],freeZ:spawn.position[2],freeS:spawn.s,freeHeading:spawn.heading,freePitch:spawn.pitch,freeWalk:spawn.walk?1:0,freeCar:spawn.car?1:0};
 return {freeX:p.x+p.lx*spawn.lat,freeY:p.y+3,freeZ:p.z+p.lz*spawn.lat,freeS:spawn.s,freeHeading:p.heading+(spawn.reverse?Math.PI:0),freePitch:0,freeWalk:0,freeCar:0};
}
