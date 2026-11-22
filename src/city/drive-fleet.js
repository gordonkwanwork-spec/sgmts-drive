import {TRIPO_VEHICLES} from '../tripo-assets.js';

const SPECIALS=[
 {id:'x5',name:'BMW X5',url:'bmw-x5.glb',scale:4.92,height:1.75,length:4.92,width:2,wheelbase:3.1,plate:'THIS IS FUN',
  parts:{paint:[0,3,7,13,14],glass:[4,5,9,10],wheels:[1,2,11,12]},
  // Lamps glow on the baked texture itself (car-lamps.js): tail = the red lamp graphic (it wraps onto the flanks); reverse = the
  // lower half of the tailgate section (no white lens is baked, so it lights white over the red); headlamps = the swept lens,
  // traced from orthographic front and side renders (outline (|x|,y) on the nose, (z,y) where it wraps round the wing).
  // The lens centres locate the projected beams.
  lampMask:{tail:[{box:{y:[.95,1.32],z:[-2.6,-1.8]},key:'red'}],reverse:[{box:{x:[.33,.74],y:[.98,1.14],z:[-2.6,-2.1]},face:'rear',key:'red',feather:.035}],
   head:[{box:{x:[.46,1.03],y:[.82,1.07],z:[1.9,2.6]},face:'front',poly:[[.902,1.061],[.876,1.059],[.844,1.044],[.796,1.033],[.776,1.021],[.639,.993],[.636,.987],[.618,.984],[.615,.979],[.515,.959],[.509,.953],[.481,.947],[.479,.941],[.518,.876],[.528,.873],[.549,.853],[.561,.85],[.576,.839],[.888,.833],[.913,.833],[.976,.85],[.973,.859],[.982,.864],[1.013,.947],[1.014,1.027],[.981,1.041],[.955,1.061]]},
    {box:{x:[.8,1.12],y:[.82,1.07],z:[1.86,2.4]},face:'side',poly:[[1.947,1.063],[2.012,1.06],[2.102,1.04],[2.238,.997],[2.362,.947],[2.365,.94],[2.352,.877],[2.331,.84],[2.321,.837],[2.151,.837],[2.142,.843],[2.106,.85],[2.103,.86],[2.088,.863],[1.996,.933],[1.962,.947],[1.953,.957],[1.882,.993],[1.879,1.043],[1.885,1.053],[1.881,1.057],[1.898,1.063]]}]},
  lamps:{front:{x:.76,y:.94,z:2.42,yaw:.31,w:.26},rear:{x:.7,y:1.12,z:-2.30,yaw:.33}},plates:{front:[0,.507,2.46],rear:[0,.972,-2.359]},cam:{height:1,distance:8}},
 // Box truck: modelled lying on its side (length along +Y from the cab, ground at +X); 0 cargo box, 3 cab, 18/19 mud flaps,
 // 21/22 front wheels, 16/17 rear twin wheels. Ships its own roughness/normal maps, kept on the trim. Heavier handling.
 {id:'truck',name:'Box truck',url:'box-truck.glb',scale:7.2,height:3.15,turn:[0,0,1,0, -1,0,0,0, 0,-1,0,0, 0,0,0,1],length:7.16,width:2.25,wheelbase:4.49,plate:'OMG',
  parts:{paint:[0,3],rubber:[18,19],wheels:[16,17,21,22]},finish:{paint:{metalness:.15,roughness:.4,clearcoat:.7,clearcoatRoughness:.1,roughnessMap:null,metalnessMap:null},trim:{clearcoat:.2}},
  plates:{front:[0,.475,3.578],rear:[0,.735,-3.583]},cam:{height:1.8,distance:13},accel:1.8,brake:6,maxSteer:.5,
  // Painted lamps: all red at the back (chassis lamps + round body lamps), the cab's teardrop headlamps by outline. No reverse lamp is modelled.
  lampMask:{tail:[{box:{y:[.4,1.5],z:[-3.7,-2.8]},face:'rear',key:'red'}],head:[{box:{x:[.54,.9],y:[.77,.91],z:[2.8,3.7]},face:'front',poly:[[.885,.895],[.56,.868],[.552,.785],[.785,.79],[.86,.84]]}]}},
];
const names={taxi:'HK taxi','modern-taxi':'Modern taxi',bus:'Double-decker','single-bus':'Single-decker',minibus:'Green minibus',car:'Sedan',hatchback:'Hatchback',suv:'SUV',van:'Delivery van','motor-scooter':'Motor scooter',motorbike:'Motorbike'};
export const DRIVE_FLEET=[...TRIPO_VEHICLES.map(v=>({...v,name:names[v.id],wheelbase:v.length*.6})),...SPECIALS];
export const vehicleOptions=DRIVE_FLEET.map(v=>`<option value="${v.id}">${v.name}</option>`).join('');
