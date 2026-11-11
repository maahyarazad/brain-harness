import { resampleByArcLength, dft, epicyclePoint } from "../../../studio/visualizations/fourier/kernel.js";
const square = [[-1, -1], [1, -1], [1, 1], [-1, 1]];
test("resampling gives evenly spaced points", () => {
  const pts = resampleByArcLength(square, 16);
  expect(pts).toHaveLength(16);
  for (let i = 1; i < 16; i++) expect(Math.hypot(pts[i][0] - pts[i - 1][0], pts[i][1] - pts[i - 1][1])).toBeCloseTo(0.5, 6);
});
test("all coefficients rebuild the outline", () => {
  const pts = resampleByArcLength(square, 64);
  const c = dft(pts);
  pts.forEach((p, n) => {
    const [x, y] = epicyclePoint(c, c.length, (2 * Math.PI * n) / 64);
    expect(x).toBeCloseTo(p[0], 6);
    expect(y).toBeCloseTo(p[1], 6);
  });
});
test("one circle traces a circle", () => {
  const circle = Array.from({ length: 64 }, (_, i) => [Math.cos((2 * Math.PI * i) / 64) * 0.5 + 0.2, Math.sin((2 * Math.PI * i) / 64) * 0.5]);
  const c = dft(circle);
  const r = new Set();
  for (let t = 0; t < 6; t += 0.5) r.add(Math.hypot(...epicyclePoint(c, 1, t)).toFixed(6));
  expect(r.size).toBe(1);
});
