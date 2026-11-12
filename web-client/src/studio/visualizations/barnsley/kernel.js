// The four classic Barnsley fern maps: [a, b, c, d, e, f] for x' = ax + by + e, y' = cx + dy + f.
export const MAPS = [
  [0, 0, 0, 0.16, 0, 0],
  [0.85, 0.04, -0.04, 0.85, 0, 1.6],
  [0.2, -0.26, 0.23, 0.22, 0, 1.6],
  [-0.15, 0.28, 0.26, 0.24, 0, 0.44],
];

export const BOUNDS = { minX: -2.182, maxX: 2.6558, minY: 0, maxY: 9.9983 };

export function normalizeWeights(weights) {
  const sum = weights.reduce((a, b) => a + b, 0);
  return sum > 0 ? weights.map((w) => w / sum) : weights.map(() => 1 / weights.length);
}

/** Plays the fern into a w×h accumulator. Yields progress. */
export function* fernPoints({ weights, count, rng, w, h, counts }) {
  const p = normalizeWeights(weights);
  const cum = [p[0], p[0] + p[1], p[0] + p[1] + p[2], 1];
  const sx = (w - 1) / (BOUNDS.maxX - BOUNDS.minX);
  const sy = (h - 1) / (BOUNDS.maxY - BOUNDS.minY);
  let x = 0, y = 0;
  for (let i = 0; i < count; i++) {
    const r = rng();
    const k = r < cum[0] ? 0 : r < cum[1] ? 1 : r < cum[2] ? 2 : 3;
    const [a, b, c, d, e, f] = MAPS[k];
    const nx = a * x + b * y + e;
    y = c * x + d * y + f;
    x = nx;
    const px = Math.floor((x - BOUNDS.minX) * sx);
    const py = Math.floor(h - 1 - (y - BOUNDS.minY) * sy);
    if (px >= 0 && px < w && py >= 0 && py < h) counts[py * w + px]++;
    if (i % 20000 === 19999) yield i / count;
  }
}
