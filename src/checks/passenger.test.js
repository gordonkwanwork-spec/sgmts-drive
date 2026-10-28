import assert from 'node:assert/strict';
import {STOPS} from '../alignment.js';
import {stationStopTarget} from '../service.js';
import {RIDE_SEATS,nearestSeat,seatZ,aisleStep,rideCues,eta,arrivalRows,Z_MAX,AISLE} from '../passenger.js';

// Seats: every seat is beside the aisle, never in it; reach finds the closest free one.
assert.equal(RIDE_SEATS.length,21,"16 podium seats + 5 low-floor singles");
for(const s of RIDE_SEATS)assert(Math.abs(s.x)>AISLE+.3,'seat clear of the aisle');
const i=nearestSeat(seatZ(RIDE_SEATS[0]),0);assert.equal(seatZ(RIDE_SEATS[i]),seatZ(RIDE_SEATS[0]));
assert.notEqual(nearestSeat(seatZ(RIDE_SEATS[0]),-.3,new Set([i])),i,'taken seat skipped');
assert.equal(nearestSeat(-30,0),null,'out of reach');
assert.deepEqual(aisleStep(Z_MAX-.1,0,5,2),{Z:Z_MAX,x:AISLE},'aisle clamps at the rear cab and seats');

// Announcements: next stop once on approach, chime/doors on arrival, terminus wording only at the far end.
const memo={},A3=STOPS[2],A7=STOPS[6],A1=STOPS[0];
assert.deepEqual(rideCues(memo,{stop:A3,dir:1,distance:400,dwell:0}),[]);
assert.deepEqual(rideCues(memo,{stop:A3,dir:1,distance:150,dwell:0}),['next-A3']);
assert.deepEqual(rideCues(memo,{stop:A3,dir:1,distance:100,dwell:0}),[],'announced once');
assert.deepEqual(rideCues(memo,{stop:A3,dir:1,distance:0,dwell:10}),['chime','doors-open']);
assert.deepEqual(rideCues(memo,{stop:A3,dir:1,distance:0,dwell:5}),['doors']);
assert.deepEqual(rideCues(memo,{stop:A3,dir:1,distance:0,dwell:.5}),['doors-close']);
assert.deepEqual(rideCues(memo,{stop:A7,dir:1,distance:120,dwell:0}),['next-A7-terminus']);
assert.deepEqual(rideCues(memo,{stop:A7,dir:1,distance:0,dwell:9}),['chime','doors-open','arrived-A7']);
assert.deepEqual(rideCues(memo,{stop:A1,dir:1,distance:80,dwell:0}),[],'no next-stop call for the origin');
assert.deepEqual(rideCues({},{stop:A1,dir:-1,distance:80,dwell:0}),['next-A1-terminus']);

// Arrival boards: departing at the platform, ahead in minutes, opposite-direction vehicles after turning.
const at=stationStopTarget(A3,1);
assert.equal(eta(A3,1,{s:at,dir:1,dwell:4}),0);
assert.equal(eta(A3,1,{s:at+50,dir:1,dwell:0}),null,'already passed');
const near=eta(A3,1,{s:at-700,dir:1,dwell:0});assert(near>=100&&near<=130,'700 m at cruise plus one intermediate stop at most');
const far=eta(A3,1,{s:stationStopTarget(STOPS[4],-1),dir:-1,dwell:0});assert(far>near,'southbound vehicle must turn at Nai Wai first');
const rows=arrivalRows(A3,1,[{s:at,dir:1,dwell:3},{s:at-700,dir:1,dwell:0},{s:stationStopTarget(STOPS[4],-1),dir:-1,dwell:0},{s:at+30,dir:1,dwell:0}]);
assert.deepEqual(rows.map(r=>r.when.replace(/\d+/,'n')),['Departing','n min','n min']);
assert.equal(rows[0].dest,'Industry Park');assert.equal(rows[0].platform,1);
assert.equal(arrivalRows(A3,-1,[{s:at,dir:1,dwell:0}])[0].dest,'Nai Wai');
console.log('passenger: seats, aisle, on-board cues and arrival ETAs ok');
