import { randomPoints, lloydStep, manhattanRaster, manhattanLloyd } from "../../../studio/visualizations/voronoi/kernel.js";
import { createRng } from "../../../studio/core/rng.js";
test("each seed's own pixel maps to that seed (Manhattan)", () => {
  const pts = [[0.1, 0.1], [0.9, 0.2], [0.5, 0.8]];
  const w = 50, h = 50;
  const r = manhattanRaster(pts, w, h);
  pts.forEach(([x, y], i) => expect(r[Math.floor(y * h) * w + Math.floor(x * w)]).toBe(i));
});
const spread = (pts) => {
  let d = 0;
  for (const p of pts) {
    let best = Infinity;
    for (const q of pts) if (q !== p) best = Math.min(best, Math.hypot(p[0] - q[0], p[1] - q[1]));
    d += best;
  }
  return d / pts.length;
};
test("Lloyd relaxation keeps points inside and evens them out", () => {
  let pts = randomPoints(60, createRng(3));
  const before = spread(pts);
  for (let i = 0; i < 10; i++) pts = lloydStep(pts);
  pts.forEach(([x, y]) => {
    expect(x).toBeGreaterThanOrEqual(0);
    expect(x).toBeLessThanOrEqual(1);
    expect(y).toBeGreaterThanOrEqual(0);
    expect(y).toBeLessThanOrEqual(1);
  });
  expect(spread(pts)).toBeGreaterThan(before);
});
test("Manhattan Lloyd step keeps points inside", () => {
  const pts = randomPoints(20, createRng(1));
  const r = manhattanRaster(pts, 40, 40);
  manhattanLloyd(pts, r, 40, 40).forEach(([x, y]) => {
    expect(x).toBeGreaterThan(0);
    expect(y).toBeLessThan(1);
  });
});
