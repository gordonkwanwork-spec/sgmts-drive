// Width beyond the ordinary kerb. The full footway follows the bay around both tapers.
export const BAY_DEPTH = 3.2;
export const BERTH_HALF = 10;
export const BAY_HALF = 24;

export function bayDepth(road, side, distance) {
 const bay = road.busLayby;
 if (!bay || bay.side !== side) return 0;
 const u = Math.max(0, Math.min(1, (BAY_HALF - Math.abs(distance - bay.at)) / (BAY_HALF - BERTH_HALF)));
 return BAY_DEPTH * u * u * (3 - 2 * u);
}
