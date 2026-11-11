/** Corner positions of a regular polygon in the unit box [0,1]², first corner at the top. */
export function polygonCorners(n) {
  const out = [];
  for (let i = 0; i < n; i++) {
    const a = -Math.PI / 2 + (2 * Math.PI * i) / n;
    out.push([0.5 + 0.48 * Math.cos(a), 0.52 + 0.48 * Math.sin(a)]);
  }
  return out;
}

/**
 * Plays the chaos game into a w×h accumulator. Yields progress; returns counts.
 * restriction: "none" | "not-same" | "not-neighbor"
 */
export function* chaosPoints({ corners, ratio, count, restriction, includeCenter, rng, w, h, counts }) {
  const targets = polygonCorners(corners);
  if (includeCenter) targets.push([0.5, 0.52]);
  const n = corners;
  const T = targets.length;
  let x = 0.5, y = 0.5, last = -1;
  const CHUNK = 20000;
  for (let i = 0; i < count; i++) {
    let k;
    for (let tries = 0; tries < 50; tries++) {
      k = Math.floor(rng() * T);
      if (last < 0 || last >= n || k >= n || restriction === "none") break;
      if (restriction === "not-same" && k !== last) break;
      if (restriction === "not-neighbor" && k !== (last + 1) % n && k !== (last + n - 1) % n) break;
    }
    x += (targets[k][0] - x) * ratio;
    y += (targets[k][1] - y) * ratio;
    last = k;
    if (i > 20) {
      const px = Math.floor(x * w), py = Math.floor(y * h);
      if (px >= 0 && px < w && py >= 0 && py < h) counts[py * w + px]++;
    }
    if (i % CHUNK === CHUNK - 1) yield i / count;
  }
  return counts;
}
