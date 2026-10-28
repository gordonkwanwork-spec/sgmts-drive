// Current-source exact function check: stop equality and telemetry, with synthetic scene collaborators.
import fs from 'node:fs';
import vm from 'node:vm';
import assert from 'node:assert/strict';
import {approachStep,followingStop} from '../operating.js';
import {energyFlow} from '../simulation.js';
const source=fs.readFileSync(new URL('../experience.js',import.meta.url),'utf8');
function declaration(name){const start=source.indexOf('function '+name+'('),body=source.indexOf('{',start);let level=1,i=body+1;while(level&&i<source.length){if(source[i]==='{')level++;if(source[i]==='}')level--;i++;}return source.slice(start,i);}
const state={s:1540,v:5,mode:'explore',index:0,pax:20,battery:92,energy:0,regen:0,power:0,travel:0,door:0,doorTarget:0,ramp:0,rampTarget:0,cruise:false},signal={centre:1500,stop:20};
const context={state,keys:new Set(['KeyW']),STOPS:[],vehicle:{doors:[]},mobile:false,tractionLocked:()=>false,smooth:(a,b,t)=>a+(b-a)*t,signalObjects:[signal],signalAt:()=> 'stop',followingStop,ai:[],crossers:[],playerYields:()=>false,returnOffset:()=>0,poseTram:()=>{},approachStep,passengerComfort:()=>{},audio:{setDrive(){}},sample:()=>({grade:0}),energyFlow,clamp:(v,a,b)=>Math.max(a,Math.min(b,v))};
vm.createContext(context);vm.runInContext(declaration('recordDriveTelemetry')+'\n'+declaration('updateBranch'),context);
for(let i=0;i<2000;i++)vm.runInContext('updateBranch(1/60)',context);
assert.equal(state.s,1520,'held throttle stays at red stop boundary');assert.equal(state.v,0);assert(state.travel>0);assert(state.energy>0);assert(state.battery<92);assert.equal(state.power,energyFlow(0,0,0,state.pax,1/60).power);
state.s=1600;state.v=2;context.signalAt=()=> 'go';const travel=state.travel,energy=state.energy;vm.runInContext('updateBranch(1)',context);assert(state.s<1600);assert(state.travel>travel);assert(state.energy>energy);
// Depot uses the same real branch function and accounting helper.
state.depotRoute=true;state.depotOutbound=false;state.branchDistance=0;state.branchCurve={getLength:()=>100};state.v=1;context.poseBranch=()=>{};context.project=()=>1600;context.vehicle.sections=[{position:{x:0,z:0}}];const before=state.travel;vm.runInContext('updateBranch(1)',context);assert(state.branchDistance>0);assert(state.travel>before);
// Run the exact initial repeat guard before the pause/menu paths.
const start=source.indexOf("addEventListener('keydown',e=>{")+"addEventListener('keydown',e=>{".length,end=source.indexOf('const sheet=',start),guard=source.slice(start,end);let toggles=0;const handler=vm.runInNewContext('(e)=>{'+guard+'toggle();}',{toggle:()=>toggles++});handler({repeat:false,code:'KeyP'});for(let i=0;i<5;i++)handler({repeat:true,code:'KeyP'});for(let i=0;i<5;i++)handler({repeat:true,code:'Escape'});assert.equal(toggles,1);
console.log('Current-source return flow: 2,000 red-boundary ticks held; green release, return/depot telemetry and early pause-repeat guard passed');
