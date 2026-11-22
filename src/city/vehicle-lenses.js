// Measured in the sandbox vehicle frame (+Z forward), metres.
const TAXI_TAIL=[[.655,.566],[.84,.566],[.80,.86],[.70,.86]];
export const FLEET_LAMPS={taxi:{head:[{box:{x:[.415,.705],y:[.565,.755],z:[2,2.5]},face:'front',key:'light'}],
 tail:[{box:{y:[.566,.688],z:[-2.5,-2]},face:'rear',poly:TAXI_TAIL},{box:{y:[.818,.86],z:[-2.5,-2]},face:'rear',poly:TAXI_TAIL}],
 reverse:[{box:{y:[.69,.754],z:[-2.5,-2]},face:'rear',poly:TAXI_TAIL,key:'light'}],gain:{tail:2.5}},   /* dark-red lens on bright red paint */
 // Red modern taxi: vertical rear clusters, red lens over a white (reverse) lens; tail cut by box on red paint.
 'modern-taxi':{head:[{box:{x:[.49,.85],y:[.69,.9],z:[1.8,2.3]},face:'front',key:'light'}],tail:[{box:{x:[.63,.81],y:[.945,1.07],z:[-2.3,-1.8]},face:'rear'}],
  reverse:[{box:{x:[.63,.81],y:[.775,.945],z:[-2.3,-1.8]},face:'rear',key:'light'}],gain:{tail:2.5}},
 // Double-decker (orange): lamps sit in dark pods; rear pod = amber (skipped), red, white reverse, small red; front pod = three white lamps.
 bus:{head:[{box:{z:[5.5,6.1]},face:'front',key:'light',poly:[[1.093,1.147],[.807,.953],[.72,.833],[.693,.707],[.88,.7],[1.033,.8],[1.107,.96],[1.113,1.14]]}],
  tail:[{box:{x:[.84,1.2],y:[1.26,1.4],z:[-6.1,-5.5]},face:'rear',key:'red'},{box:{x:[.84,1.2],y:[.9,1],z:[-6.1,-5.5]},face:'rear',key:'red'}],
  reverse:[{box:{x:[.84,1.2],y:[1.03,1.16],z:[-6.1,-5.5]},face:'rear',key:'light'}]},
 // Single-decker (red band at the back): tail = the small red lamp on the blue band + the roof brake lamp; front pods with three white lamps.
 'single-bus':{head:[{box:{y:[.6,.95],z:[5,5.6]},face:'front',key:'light',poly:[[1.093,.95],[.607,.737],[.613,.55],[1.173,.637],[1.16,.943]]}],
  tail:[{box:{x:[1,1.2],y:[.68,.78],z:[-5.6,-5]},face:'rear',key:'red'},{box:{x:[0,.35],y:[2.9,3.2],z:[-5.6,-5]},key:'red'}],reverse:[{box:{x:[1,1.17],y:[.88,.99],z:[-5.6,-5]},face:'rear',key:'light'}],gain:{tail:2}},
 // White sedan / SUV: dark headlamp lenses on pale paint (dark key, brightened); red tail lamps; no white reverse lens in either texture.
 car:{head:[{box:{x:[.45,.77],y:[.63,.84],z:[1.8,2.4]},face:'front',key:'dark'}],tail:[{box:{x:[.3,.76],y:[.82,.97],z:[-2.4,-1.8]},key:'red'}],gain:{head:5}},
 suv:{head:[{box:{x:[.48,.83],y:[.72,.96],z:[1.9,2.45]},face:'front',key:'dark'}],tail:[{box:{x:[.5,.85],y:[.92,1.1],z:[-2.45,-1.9]},key:'red'}],gain:{head:5}},
 // Blue hatchback: clear headlamps; tail lamps run up the D-pillars; small white reverse lens in each cluster.
 hatchback:{head:[{box:{x:[.3,.78],y:[.63,.8],z:[1.5,2.1]},face:'front',key:'light'}],tail:[{box:{x:[.45,.75],y:[.6,1.3],z:[-2.1,-1.5]},key:'red'}],
  reverse:[{box:{x:[.55,.75],y:[.7,.85],z:[-2.1,-1.5]},face:'rear',key:'light'}]},
 // White van: rectangular clear headlamps (box, amber corner left out); rear columns red over white reverse; high third brake lamp.
 van:{head:[{box:{x:[.5,.78],y:[.77,.95],z:[2.2,2.7]},face:'front'}],tail:[{box:{x:[.72,.86],y:[.95,1.25],z:[-2.7,-2.2]},key:'red'},{box:{x:[0,.3],y:[1.95,2.3],z:[-2.7,-2.2]},key:'red'}],
  reverse:[{box:{x:[.72,.86],y:[.74,.94],z:[-2.7,-2.2]},face:'rear',key:'light'}]},
 // Bikes: scooter has clear lenses front and back (rear lens lit red); motorbike a grey headlamp and a red tail lamp.
 'motor-scooter':{head:[{box:{x:[0,.19],y:[.72,.86],z:[.6,1.1]},face:'front',key:'light'}],tail:[{box:{x:[.08,.18],y:[.76,.84],z:[-1.1,-.5]},key:'light'}],gain:{tail:2}},
 motorbike:{head:[{box:{x:[0,.09],y:[.86,.99],z:[.6,1.15]},face:'front',key:'grey'}],tail:[{box:{x:[0,.1],y:[.85,.95],z:[-1.15,-.5]},key:'red'}]}};
