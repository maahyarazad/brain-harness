import { phyllotaxisPoints } from "../../../studio/visualizations/phyllotaxis/kernel.js";
test("point i is at radius spacing·√i", () => {
  const p = phyllotaxisPoints(100, 137.5, 3);
  for (const i of [0, 1, 4, 49]) expect(Math.hypot(p[i * 2], p[i * 2 + 1])).toBeCloseTo(3 * Math.sqrt(i), 4);
});
test("angle of 360° puts everything on one ray", () => {
  const p = phyllotaxisPoints(20, 360, 1);
  for (let i = 1; i < 20; i++) expect(p[i * 2 + 1]).toBeCloseTo(0, 3);
});
