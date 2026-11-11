/** Lines [k, (k·m) mod N] for k = 0..N-1. m may be fractional. */
export function timesTableLines(N, m) {
  const out = [];
  for (let k = 0; k < N; k++) out.push([k, (k * m) % N]);
  return out;
}

/** Position of (possibly fractional) point index p on a circle of N points. */
export function circlePoint(p, N, cx, cy, r) {
  const a = Math.PI + (2 * Math.PI * p) / N;
  return [cx + r * Math.cos(a), cy + r * Math.sin(a)];
}
