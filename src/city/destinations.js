// Destinations at the two ends of each authored road, in centreline order.
// District legends use blue. Nearby streets, villages and facilities use white.
const places={
 hsk:['Hung Shui Kiu','洪水橋'],ha:['Ha Tsuen','廈村'],tin:['Tin Shui Wai','天水圍'],
 nai:['Nai Wai','泥圍'],san:['San Wai','新圍'],yick:['Yick Yuen Tsuen','亦園村'],fung:['Fung Kong Tsuen','鳳降村'],
 station:['Hung Shui Kiu Station','洪水橋站'],shops:['Shopping Centre','商場'],estate:['Residential Area','住宅區'],
 civic:['Community Facilities','社區設施'],log:['Logistics Cluster','物流圈'],park:['Industry Park','產業園'],
 vehiclePark:['Commercial Vehicle Park','商用車輛停車場'],tinHa:['Tin Ha Road','田廈路'],haRoad:['Ha Tsuen Road','廈村路'],
 d8:['Road D8','D8號路'],d7:['Road D7','D7號路'],d6:['Road D6','D6號路'],d4:['Road D4','D4號路'],d1:['Road D1','D1號路'],
 north:['Hung Shui Kiu North','洪水橋北'],castle:['Castle Peak Road','青山公路']
};
const ends={
 'd8-west':['hsk','ha'],'d8-east':['nai','tinHa'],'d8-south-access':['d8','nai'],'san-wai-street':['d8','san'],
 d7:['d8','shops'],'d7-north':['d7','estate'],'d7-south':['d7','estate'],'ra2-access':['d8','estate'],
 'yick-yuen':['d8','yick'],'station-street':['d8','station'],'tin-ha':['castle','haRoad'],'tin-ha-north':['haRoad','tin'],
 'crossing-west':['tinHa','d8'],'crossing-east':['d8','tinHa'],'gic-access':['d8','civic'],d6:['tinHa','north'],
 'ra1-access':['d6','estate'],'station-north':['tinHa','station'],'hatsuen-west':['ha','vehiclePark'],'hatsuen-east':['vehiclePark','ha'],
 'logistics-access':['haRoad','log'],'d3-south':['park','vehiclePark'],'d3-d1':['vehiclePark','park'],'d5-west':['haRoad','vehiclePark'],
 'd1-west':['d4','ha'],'d1-east':['ha','d4'],d4:['d1','park'],'d4-north':['d4','park'],'industry-access':['d1','park'],
 'd1-north':['d4','park'],'d2-link':['d1','park'],'fung-kong-access':['d1','fung']
};
export function roadDestination(road,direction){
 const id=ends[road.id.replace(/^city-/,'')]?.[direction>0?1:0];
 if(!id)return null;
 const [en,zh]=places[id];
 return {en,zh,local:!['hsk','ha','tin'].includes(id)};
}
