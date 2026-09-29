// Game controller: explicit stages and detector-driven pressure, not a certified interlocking.
export const CONTROL_DEFAULTS = Object.freeze({minGreen:12,maxGreen:35,extension:10,priority:2,maxWait:65,amber:3,allRed:3,pedWalk:7});
export const CONTROL_LIMITS = {minGreen:[8,25],maxGreen:[25,60],extension:[0,20],priority:[0,5],maxWait:[40,120],amber:[3,6],allRed:[3,10],pedWalk:[7,15]};
export function configure(settings,key,value){
 if(!Object.hasOwn(CONTROL_LIMITS,key)||!Number.isFinite(Number(value)))return false;
 const [lo,hi]=CONTROL_LIMITS[key],n=Math.max(lo,Math.min(hi,Number(value)));
 if(key==='minGreen'&&n>settings.maxGreen||key==='maxGreen'&&n<settings.minGreen)return false;
 settings[key]=n;return true;
}
export function createSignal(id){return {id,stage:'clear',age:0,next:'road',request:null,isolated:false,fault:false,reason:'Minimum green protects the current movement.',wait:{tram:0,road:0,ped:0},scores:{tram:0,road:0,ped:0},input:{trams:[],queue:0,roadWait:0,pedWaiting:0},changes:0};}
export function aspect(s,axis='tram'){
 if(s.stage===axis)return 'go';
 if(s.stage===axis+'Amber')return 'amber';
 return 'stop';
}
export function stepSignal(s,dt,input,settings=CONTROL_DEFAULTS){
 if(!Number.isFinite(dt)||dt<=0)return;
 s.input=input;s.age+=dt;
 const demand={tram:input.trams.length>0,road:input.queue>0,ped:input.pedWaiting>0};
 for(const key of Object.keys(s.wait))s.wait[key]=demand[key]&&s.stage!==key?s.wait[key]+dt:0;
 // One extra tram request is weighted by occupancy and time spent delayed; no request can bypass clearance or starvation protection.
 s.scores={tram:input.trams.reduce((v,t)=>v+settings.priority*(1+(t.pax||0)/60+Math.min(t.wait||0,90)/30)/(1+(t.eta||0)/25),0)+s.wait.tram/12,
  road:input.queue+Math.max(input.roadWait||0,s.wait.road)/12,ped:input.pedWaiting*1.5+s.wait.ped/10};
 const occupied=input.tramOccupied||input.roadOccupied||input.pedOccupied;
 const enter=(stage,reason)=>{s.stage=stage;s.age=0;s.reason=reason;s.changes++;};
 if(s.stage.endsWith('Amber')){if(s.age>=settings.amber)enter('clear','All-red intergreen: waiting for the conflict area to clear.');return;}
 if(s.stage==='pedClear'){if(s.age>=settings.allRed&&!occupied)enter('clear','Pedestrians clear; all-red before releasing traffic.');return;}
 if(s.stage==='clear'){
  if(s.isolated||s.fault){s.reason=s.fault?'Detector fault: all-red until the operator restores the detector.':'Junction isolated: all movements held at red.';return;}
  if(occupied){s.reason='Occupied conflict area: opposing movements remain red.';return;}
  if(s.age>=settings.allRed){if(s.next==='tram'&&input.blockedExit){s.reason='Tram exit blocked: holding trams at red.';if(demand.road||demand.ped)s.next=demand.ped&&s.wait.ped>s.wait.road?'ped':'road';else return;}enter(s.next,'Clearance complete. Serving '+s.next+'.');if(s.request===s.next)s.request=null;}
  return;
 }
 if(s.stage==='ped'){if(s.age>=settings.pedWalk){s.next=['tram','road'].sort((a,b)=>s.wait[b]-s.wait[a]||s.scores[b]-s.scores[a])[0];enter('pedClear','Walk invitation ended; pedestrians already crossing retain clearance.');}return;}
 const current=s.stage,other=current==='tram'?'road':'tram';
 const overdue=Object.keys(s.wait).filter(k=>k!==current&&demand[k]&&s.wait[k]>=settings.maxWait).sort((a,b)=>s.wait[b]-s.wait[a])[0];
 const candidate=overdue||(s.request&&s.request!==current?s.request:Object.keys(s.scores).filter(k=>k!==current&&demand[k]).sort((a,b)=>s.scores[b]-s.scores[a])[0])||other;
 if(s.isolated||s.fault){s.next=other;enter(current+'Amber',s.fault?'Detector fault: clearing to all-red.':'Isolation requested: clearing to all-red.');return;}
 if(s.age<settings.minGreen){s.reason=`Minimum green: ${Math.ceil(settings.minGreen-s.age)} s protected.`;return;}
 const extension=current==='tram'&&demand.tram&&!overdue?settings.extension:0;
 const limit=settings.maxGreen+extension;
 const shouldChange=overdue||s.request&&s.request!==current||s.age>=limit||s.scores[candidate]>s.scores[current]+.5||!demand[current]&&demand[candidate]||current==='tram'&&input.blockedExit;
 if(shouldChange){s.next=candidate;enter(current+'Amber',overdue?'Maximum-wait protection: serving '+candidate+'.':s.request?'Operator stage request accepted after minimum green.':input.blockedExit?'Tram exit blocked: releasing other movements.':s.age>=limit?'Maximum green reached.':'Higher waiting demand: serving '+candidate+'.');}
 else s.reason=s.age>=settings.maxGreen?'Bounded tram green extension; waiting road users still have maximum-wait protection.':'Current demand has higher pressure; retain green.';
}

export function tramCommand(tram,command,value,stops){
 if(!tram?.active)return 'Select an active tram.';
 if(command==='speed'){
  if(!Number.isFinite(Number(value)))return 'Invalid speed.';
  tram.control.speed=Math.max(0,Math.min(50,Number(value)));return `Speed ceiling set to ${tram.control.speed} km/h; signals and braking still apply.`;
 }
 if(command==='hold'){tram.control.hold=!tram.control.hold;return tram.control.hold?'Hold requested; braking to a stop. A tram already in a junction clears it first.':'Hold released; normal movement authority applies.';}
 if(command==='destination'){
  if(!['through','A1','A7'].includes(value))return 'Invalid destination.';
  if(tram.control.terminated)tram.stopIndex+=tram.dir;tram.control.destination=value;tram.control.terminated=false;return value==='through'?'Through service restored.':`Terminate at ${value}; direction changes only at the existing terminal facilities.`;
 }
 if(command==='skip'){
  const st=stops[tram.stopIndex];if(!st||tram.dwell>0||Math.abs(st.s-tram.s)<160||tram.stopIndex===0||tram.stopIndex===stops.length-1)return 'Cannot skip: select an intermediate stop at least 160 m ahead before its approach.';
  tram.control.skipped.push(st.id);tram.stopIndex+=tram.dir;return `Express through ${st.id}; using the through lane.`;
 }
 return 'Unknown command.';
}
