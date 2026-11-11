export function lorenzDeriv([x, y, z], { sigma, rho, beta }) {
  return [sigma * (y - x), x * (rho - z) - y, x * y - beta * z];
}

/** One RK4 step of the Lorenz system. */
export function lorenzRK4(s, p, dt) {
  const k1 = lorenzDeriv(s, p);
  const k2 = lorenzDeriv(s.map((v, i) => v + (dt / 2) * k1[i]), p);
  const k3 = lorenzDeriv(s.map((v, i) => v + (dt / 2) * k2[i]), p);
  const k4 = lorenzDeriv(s.map((v, i) => v + dt * k3[i]), p);
  return s.map((v, i) => v + (dt / 6) * (k1[i] + 2 * k2[i] + 2 * k3[i] + k4[i]));
}

/** Rotate (yaw around z, then pitch around x) and project orthographically. */
export function project([x, y, z], yaw, pitch) {
  const zc = z - 25;
  const x1 = x * Math.cos(yaw) - y * Math.sin(yaw);
  const y1 = x * Math.sin(yaw) + y * Math.cos(yaw);
  const y2 = y1 * Math.cos(pitch) - zc * Math.sin(pitch);
  const z2 = y1 * Math.sin(pitch) + zc * Math.cos(pitch);
  return [x1, -z2, y2];
}
