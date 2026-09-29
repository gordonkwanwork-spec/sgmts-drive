import {STOPS,DEPOT,LENGTH,sample} from './alignment.js';

export const FREE_SPAWNS=[
 ...STOPS.map(st=>({id:st.id,name:st.name,zh:st.zh,s:st.s,lat:st.platformLateral+st.width+3})),
 {id:'depot',name:'Depot entrance',zh:'車廠入口',s:DEPOT.gate,lat:30},
 {id:'start',name:'Nai Wai corridor end',zh:'泥圍走廊盡頭',s:0,lat:10},
 {id:'end',name:'Far corridor end',zh:'產業園後走廊盡頭',s:LENGTH,lat:10,reverse:true},
];
export function freeSpawn(id){
 const spawn=FREE_SPAWNS.find(p=>p.id===id)||FREE_SPAWNS[0],p=sample(spawn.s);
 return {freeX:p.x+p.lx*spawn.lat,freeY:p.y+3,freeZ:p.z+p.lz*spawn.lat,freeS:spawn.s,freeHeading:p.heading+(spawn.reverse?Math.PI:0)};
}
