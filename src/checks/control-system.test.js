import assert from 'node:assert/strict';
import {CONTROL_DEFAULTS,configure,createSignal,stepSignal,aspect,tramCommand} from '../control-system.js';
const empty=()=>({trams:[],queue:0,roadWait:0,pedWaiting:0,tramOccupied:false,roadOccupied:false,pedOccupied:false,blockedExit:false});
const settings={...CONTROL_DEFAULTS};
assert.equal(configure(settings,'priority','invalid'),false);
assert.equal(configure(settings,'allRed',-100),true);assert.equal(settings.allRed,3);
assert.equal(configure(settings,'toString',2),false);
const s=createSignal('test');s.stage='tram';s.request='road';
for(let t=0;t<11;t++)stepSignal(s,1,empty());assert.equal(s.stage,'tram','manual requests respect minimum green');
stepSignal(s,1,empty());assert.equal(s.stage,'tramAmber');assert.equal(aspect(s,'road'),'stop');
for(let t=0;t<3;t++)stepSignal(s,1,empty());assert.equal(s.stage,'clear');
for(let t=0;t<20;t++)stepSignal(s,1,{...empty(),tramOccupied:true});assert.equal(s.stage,'clear','occupied junction must never release conflicting traffic');
stepSignal(s,1,empty());assert.equal(s.stage,'road');assert.equal(s.request,null);
// Strong tram priority still yields to the oldest overdue demand; every switch has an intergreen.
const busy=createSignal('busy'),seen=new Set();let lastGreen=null,hadClear=true,longestRoad=0;
for(let t=0;t<6000;t++){
 const input={...empty(),trams:[{eta:1,pax:180,wait:60}],queue:8,roadWait:30,pedWaiting:1};
 stepSignal(busy,.1,input,{...CONTROL_DEFAULTS,priority:5});seen.add(busy.stage);longestRoad=Math.max(longestRoad,busy.wait.road);
 assert(!(aspect(busy)==='go'&&aspect(busy,'road')==='go'));
 assert(!(aspect(busy,'ped')==='go'&&(aspect(busy)==='go'||aspect(busy,'road')==='go')));
 if(busy.stage==='clear')hadClear=true;
 if(['tram','road','ped'].includes(busy.stage)){if(lastGreen&&lastGreen!==busy.stage)assert(hadClear,'all-red between conflicting greens');if(lastGreen!==busy.stage)hadClear=false;lastGreen=busy.stage;}
}
for(const stage of ['tram','road','ped','pedClear','tramAmber','roadAmber','clear'])assert(seen.has(stage),stage+' gets served');
assert(longestRoad<100,'bounded tram priority prevents unbounded road starvation');
const ped=createSignal('ped');ped.stage='ped';ped.next='tram';for(let i=0;i<60;i++)stepSignal(ped,1,{...empty(),pedOccupied:true});assert.equal(ped.stage,'pedClear');
for(let i=0;i<5;i++)stepSignal(ped,1,empty());assert.equal(ped.stage,'tram','clearance ends only after people have left');
const fault=createSignal('fault');fault.fault=true;for(let i=0;i<30;i++)stepSignal(fault,1,empty());assert.equal(fault.stage,'clear');assert.equal(aspect(fault),'stop');fault.fault=false;stepSignal(fault,1,empty());assert.equal(fault.stage,'road');
const blocked=createSignal('exit');blocked.stage='clear';blocked.next='tram';for(let i=0;i<30;i++)stepSignal(blocked,1,{...empty(),blockedExit:true});assert.equal(blocked.stage,'clear');
stepSignal(blocked,1,{...empty(),blockedExit:true,queue:3});assert.equal(blocked.stage,'road','blocked tram exit must not starve road traffic');
const a={active:true,s:0,dir:1,stopIndex:1,control:{speed:30,hold:false,skipped:[]}},stops=[{id:'A1',s:0},{id:'A2',s:500},{id:'A3',s:900}];
tramCommand(a,'speed',200,stops);assert.equal(a.control.speed,50);tramCommand(a,'speed',NaN,stops);assert.equal(a.control.speed,50);
tramCommand(a,'hold',null,stops);assert(a.control.hold);tramCommand(a,'skip',null,stops);assert.equal(a.stopIndex,2);assert.deepEqual(a.control.skipped,['A2']);tramCommand(a,'skip',null,stops);assert.equal(a.stopIndex,2,'cannot skip terminus');
tramCommand(a,'destination','A1',stops);assert.equal(a.control.destination,'A1');assert.equal(a.dir,1,'routing never reverses a tram mid-line');
a.control.terminated=true;tramCommand(a,'destination','through',stops);assert.equal(a.stopIndex,3,'releasing a terminated tram advances beyond its served berth');
console.log('Control centre: bounded priority, fair service, protected phases, occupancy, faults and fleet command checks passed.');
