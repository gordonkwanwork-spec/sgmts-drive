// City rebuild (Gordon, 5 Nov 2026): OZP lots are built from the sandbox's modern Hong Kong kit (src/city/kit, copied from
// city-rules-sandbox hk-modern*.js), typed by zone. Logistics, G/IC, open space, green belt, depot and utility lots keep the
// game's own massing (src/lots/massing.js). Each lot is packed row by row with kit sites aligned to its longest edge; a site is
// kept only when its whole rectangle (plus a 5 m setback) lies inside the lot and clear of streets and the corridor.
import {TYPES} from './kit/hk-modern-plan.js';
import {pointInPolygon} from '../lots/wand.js';

const MIX=[
 [/^R\(A\)/,['prh-harmony','private-glass','prh-trident','private-cross','private-glass','prh-slab']],
 [/^C\(/,['office-grade-a','mall','office-classic','office-grade-a','ginza']],
 [/Mixed Use/,['podium-estate','office-grade-a','private-glass']],
 [/Enterprise and Technology Park/,['industrial-office','office-grade-a','industrial-office','office-classic']],
 [/Industry Park/,['factory-estate','industrial-office','flatted-factory']],
 [/^I$/,['flatted-factory','godown','factory-estate','flatted-factory']],
 [/^V/,['village-houses']],
];
export const kitTypes=zone=>MIX.find(([re])=>re.test(zone))?.[1]??null;
const hash=s=>{let h=2166136261;for(const c of String(s))h=Math.imul(h^c.charCodeAt(0),16777619);return h>>>0;};

// allowed(x,z,r): the game's scenery/street clearance for a circle.
// ground(x,z): terrain height; each site stands on the lowest of its corners (no floating plinths).
export function kitPlots(lot,allowed=()=>true,ground=()=>0){const types=kitTypes(lot.zone);if(!types)return [];const P=lot.poly;
 let best=0,ax=1,az=0;for(let i=0;i<P.length;i++){const a=P[i],b=P[(i+1)%P.length],L=Math.hypot(b[0]-a[0],b[1]-a[1]);if(L>best){best=L;ax=(b[0]-a[0])/L;az=(b[1]-a[1])/L;}}
 const bx=-az,bz=ax,us=P.map(p=>p[0]*ax+p[1]*az),vs=P.map(p=>p[0]*bx+p[1]*bz),[u0,u1,v0,v1]=[Math.min(...us),Math.max(...us),Math.min(...vs),Math.max(...vs)];
 const world=(u,v)=>[u*ax+v*bx,u*az+v*bz],gap=types[0]==='village-houses'?6:14,plots=[];let k=0,v=v0+5;
 const fits=(u,v,w,d)=>{for(let i=0;i<=4;i++)for(let j=0;j<=4;j++){const p=world(u-5+(w+10)*i/4,v-5+(d+10)*j/4);if(!pointInPolygon(p,P))return false;}const c=world(u+w/2,v+d/2);return allowed(c[0],c[1],Math.hypot(w,d)/2);};
 while(v<v1-10){let u=u0+5,rowDepth=0;
  while(u<u1-10){const type=types[hash(lot.id+':'+k)%types.length],[w,d]=TYPES[type].span;
   if(fits(u,v,w,d)){const poly=[world(u,v),world(u+w,v),world(u+w,v+d),world(u,v+d)];plots.push({id:`${lot.id}:${k}`,poly:poly.map(([x,z])=>({x,z})),y:Math.min(...poly.map(([x,z])=>ground(x,z)))-.15,modern:type,seed:hash(lot.id)+k});rowDepth=Math.max(rowDepth,d);u+=w+gap;}else u+=8;k++;}
  v+=rowDepth?rowDepth+gap:8;}
 return plots;}
