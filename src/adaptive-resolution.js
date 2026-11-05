// Dynamic resolution: render as sharp as the device can hold 60 fps, never blurrier than `min`.
// Slow + GPU-bound → lower the pixel ratio; at the floor, or CPU-bound → shed scenery instead (shed 0‒3).
// Fast and steady → probe the ratio back up, keeping it only if frames stay inside budget.
// ponytail: no GPU timer queries (absent on iOS Safari); frame interval + JS time stand in. A 30 fps OS cap reads as "slow" and settles at `min`.
export function createGovernor({min,max,start=max,target=1000/60}){
 let ratio=Math.min(max,Math.max(min,start)),shed=0,avg=target,over=0,calm=0,cooldown=0,wait=4,backoff=4,suspend=2,probe=null;
 return {
  get ratio(){return ratio;},get shed(){return shed;},
  // Call after a resize, mode switch or other known hitch.
  suspend(seconds=2){suspend=Math.max(suspend,seconds);over=0;probe=null;},
  // frameMs: interval since last frame; cpuMs: JS time this frame. Returns true when ratio or shed changed.
  tick(frameMs,cpuMs,dt){
   if(suspend>0){suspend-=dt;avg=target;return false;}
   frameMs=Math.min(50,frameMs);avg+=(frameMs-avg)*.08;
   const cpuBound=cpuMs>target*.8,l=avg/target;
   if(cooldown>0){cooldown-=dt;return false;}
   if(probe){probe.t+=dt;probe.acc+=frameMs;probe.n++;
    if(probe.t<1.5)return false;
    const mean=probe.acc/probe.n,from=probe.from;probe=null;cooldown=1;
    if(mean>target*1.1&&!cpuBound){ratio=from;backoff=Math.min(40,backoff*2);wait=backoff;return true;}
    backoff=Math.max(4,backoff*.75);wait=2.5;return false;}
   if(l>1.12){calm=0;over+=dt;
    if(over<.6)return false;
    over=0;cooldown=1.2;wait=Math.max(wait,3);
    if(!cpuBound&&ratio>min+.001){ratio=Math.max(min,Math.min(ratio-.05,ratio*Math.min(.95,Math.max(.7,Math.sqrt(1/l)*.97))));return true;}
    if(shed<3){shed++;return true;}
    return false;}
   over=Math.max(0,over-dt);
   if(l>=1.05){calm=0;return false;}
   calm+=dt;
   if(shed>0&&calm>20){shed--;calm=0;return true;}
   if(ratio<max-.001&&(wait-=dt)<=0){probe={from:ratio,t:0,acc:0,n:0};ratio=Math.min(max,ratio+.1);return true;}
   return false;}};
}
