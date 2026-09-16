// One ordered station list, used by both service directions.
export const journeyTerminus=(stations,direction)=>direction===1?stations.length-1:0;
export const nextStationIndex=(index,direction,count)=>{const next=index+direction;return next>=0&&next<count?next:null;};
export function fleetPlan(headway){return headway===210?{count:17,convoy:2}:{count:6,convoy:1};}
export function parkingScore(error,valid){return valid&&error<=8?Math.max(40,Math.round(100-error*7)):0;}
export function announcementText(st,type='next',terminus=false){
 if(type==='arrived')return [`本班車已到達${st.zh}終點站，請帶齊隨身物品落車。`,`本班车已到达${st.simplified}终点站，请带齐随身物品下车。`,`The vehicle has arrived at ${st.name}. Please take all your belongings with you.`];
 return [`下一站，${st.zh}${terminus?'，本班車終點站':''}。`,`下一站，${st.simplified}${terminus?'，本班车的终点站':''}。`,`The next stop is ${st.name}${terminus?', the terminus of this service':''}.`];
}
