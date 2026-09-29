// Run: node src/checks/tips.test.js
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import vm from 'node:vm';
const source=readFileSync(new URL('../experience.js',import.meta.url),'utf8');
const state={v:0,door:0,doorTarget:0,index:0,phase:'approach',mode:'service',park:true};
const context=vm.createContext({state,mobile:false,vehicle:{flipped:false},STOPS:[{}],travelDirection:()=>1,journeyTerminus:()=>6,dockError:()=>({valid:true,error:0}),holdReason:()=> 'the red signal'});
vm.runInContext(source.slice(source.indexOf('function coach('),source.indexOf('const playerYields=')),context);
const target=(d=0)=>context.coach({},d,false,false)[3];
assert.equal(target(),'doors','Start at the platform: open doors');
state.phase='boarding';state.door=1;
assert.equal(target(),undefined,'Do not invite clicks during boarding');
state.phase='departure';state.doorTarget=1;
assert.equal(target(),'doors','Close doors after boarding');
state.doorTarget=0;
assert.equal(target(),undefined,'Wait while doors close');
state.doorTarget=1;state.hold=3;
assert.equal(target(),undefined,'Wait during departure hold');
state.hold=0;state.phase='approach';state.door=0;state.doorTarget=0;
assert.equal(target(400),'go','Depart using Go');
state.v=8;
assert.equal(target(100),'stop','Manual approach highlights Stop');
state.cruise=true;
assert.equal(target(100),undefined,'Automatic approach needs no button');
state.crashed=true;
assert.equal(target(),'recover');

// Exercise the actual prompt/toggle code with a minimal DOM.
const nodes=[];
function node(action,visible=true){const classes=new Set();const el={dataset:{action},visible,textContent:'',classList:{add:x=>classes.add(x),remove:x=>classes.delete(x),toggle:(x,on)=>on?classes.add(x):classes.delete(x),contains:x=>classes.has(x)},setAttribute(k,v){this[k]=v;},removeAttribute(k){delete this[k];},checkVisibility(){return this.visible;}};nodes.push(el);return el;}
const door=node('doors'),instruction=node(),optionsButton=node(),edge={append(){}};
const storage=new Map();
const dom=vm.createContext({state:{screen:'driving'},performance:{now:()=>1000},touchText:t=>t,options:{contains:el=>el.inOptions},localStorage:{getItem:k=>storage.get(k),setItem:(k,v)=>storage.set(k,v)},$:s=>({'#edge-tools':edge,'#instruction':instruction,'#options-button':optionsButton}[s]),document:{createElement:()=>node(),body:node(),querySelectorAll:s=>s==='.tip-target'?nodes.filter(n=>n.classList.contains('tip-target')):nodes.filter(n=>n.dataset.action===s.match(/data-action="([^"]+)"/)?.[1])}});
vm.runInContext(source.slice(source.indexOf('let tipsEnabled='),source.indexOf('if(mobile)for(const option')),dom);
vm.runInContext("contextualPrompt('Open doors',true,'doors','doors')",dom);
assert(door.classList.contains('tip-target'));
vm.runInContext('tipsButton.onclick()',dom);
assert(!door.classList.contains('tip-target'));
assert(!instruction.classList.contains('prompt-visible'));
assert.equal(storage.get('sgmts-tips'),'off');
vm.runInContext('tipsButton.onclick()',dom);
assert(door.classList.contains('tip-target'));
assert(instruction.classList.contains('prompt-visible'));
door.visible=false;door.inOptions=true;
vm.runInContext("contextualPrompt('Open options',true,'doors','doors')",dom);
assert(optionsButton.classList.contains('tip-target'),'Hidden control points to options');
assert(!door.classList.contains('tip-target'));
console.log('Tips: service sequence, waits, recovery, toggle, saved preference and options fallback passed.');
