// Fourier epicycles: resample an outline, take its DFT, rebuild it from rotating circles.

/** Resamples a closed outline of [x, y] points to n points evenly spaced by arc length. */
export function resampleByArcLength(points, n) {
  const pts = [...points, points[0]];
  const cum = [0];
  for (let i = 1; i < pts.length; i++) cum.push(cum[i - 1] + Math.hypot(pts[i][0] - pts[i - 1][0], pts[i][1] - pts[i - 1][1]));
  const total = cum[cum.length - 1] || 1;
  const out = [];
  let j = 0;
  for (let k = 0; k < n; k++) {
    const d = (k / n) * total;
    while (j < cum.length - 2 && cum[j + 1] < d) j++;
    const seg = cum[j + 1] - cum[j] || 1;
    const t = (d - cum[j]) / seg;
    out.push([pts[j][0] + (pts[j + 1][0] - pts[j][0]) * t, pts[j][1] + (pts[j + 1][1] - pts[j][1]) * t]);
  }
  return out;
}

/** Discrete Fourier transform of points as complex numbers. Sorted by amplitude, largest first. */
export function dft(points) {
  const N = points.length;
  const out = [];
  for (let k = 0; k < N; k++) {
    let re = 0, im = 0;
    for (let n = 0; n < N; n++) {
      const phi = (-2 * Math.PI * k * n) / N;
      const [x, y] = points[n];
      re += x * Math.cos(phi) - y * Math.sin(phi);
      im += x * Math.sin(phi) + y * Math.cos(phi);
    }
    re /= N;
    im /= N;
    const freq = k <= N / 2 ? k : k - N;
    out.push({ freq, amp: Math.hypot(re, im), phase: Math.atan2(im, re) });
  }
  return out.sort((a, b) => b.amp - a.amp);
}

/** Position after summing the first k circles at time t (radians, one full turn = 2π). */
export function epicyclePoint(coeffs, k, t) {
  let x = 0, y = 0;
  for (let i = 0; i < Math.min(k, coeffs.length); i++) {
    const c = coeffs[i];
    x += c.amp * Math.cos(c.freq * t + c.phase);
    y += c.amp * Math.sin(c.freq * t + c.phase);
  }
  return [x, y];
}
