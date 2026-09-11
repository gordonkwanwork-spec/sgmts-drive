// Game tuning, not engineering predictions or a certified vehicle model.
export const SCENARIOS = {
  morning: { name: 'Morning local', zh: '早晨班次', time: '08:15', wet: false, demand: 1, dwell: 8, sky: 0xc7d9dd, sun: 0xffebc9, light: 2.8 },
  rain: { name: 'Rainy rush hour', zh: '雨天繁忙時段', time: '17:40', wet: true, demand: 2, dwell: 13, sky: 0x849ba5, sun: 0xd8e7f6, light: 1.3 },
  sunset: { name: 'Golden hour eco run', zh: '黃昏節能班次', time: '18:10', wet: false, demand: 0.7, dwell: 9, sky: 0xe3c9b0, sun: 0xffbd7c, light: 2.4 },
};

export function safeSpeed(distance, deceleration = 1.3) {
  return Math.sqrt(2 * deceleration * Math.max(0, distance));
}

export function energyFlow(speed, acceleration, grade, passengers, dt) {
  const mass = 32000 + passengers * 70;
  const force = mass * ((acceleration + grade * 9.81) * Math.sign(speed) + 0.009 * 9.81) + 3.8 * speed * speed;
  const mechanical = force * Math.abs(speed) / 1000;
  const regen = Math.min(180, Math.max(0, -mechanical) * 0.65);
  const power = 9 + Math.max(0, mechanical) / 0.9 - regen;
  return { power, consumed: Math.max(power, 0) * dt / 3600, recovered: regen * dt / 3600, net: power * dt / 3600 };
}

export function boxesOverlap(a, b) {
  const ax = [{ x: Math.cos(a.heading), z: -Math.sin(a.heading) }, { x: Math.sin(a.heading), z: Math.cos(a.heading) }];
  const bx = [{ x: Math.cos(b.heading), z: -Math.sin(b.heading) }, { x: Math.sin(b.heading), z: Math.cos(b.heading) }];
  const dot = (p, q) => p.x * q.x + p.z * q.z;
  const delta = { x: b.x - a.cx, z: b.z - a.cz };
  return [...ax, ...bx].every(axis => Math.abs(dot(delta, axis)) <
    a.hw * Math.abs(dot(ax[0], axis)) + a.hl * Math.abs(dot(ax[1], axis)) +
    b.hw * Math.abs(dot(bx[0], axis)) + b.hl * Math.abs(dot(bx[1], axis)));
}
