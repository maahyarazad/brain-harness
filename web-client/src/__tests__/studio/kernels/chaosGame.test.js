import { chaosPoints } from "../../../studio/visualizations/chaosGame/kernel.js";
import { createRng } from "../../../studio/core/rng.js";
function run(seed, extra = {}) {
  const counts = new Uint32Array(100 * 100);
  const gen = chaosPoints({ corners: 3, ratio: 0.5, count: 30000, restriction: "none", rng: createRng(seed), w: 100, h: 100, counts, ...extra });
  for (const _ of gen);
  return counts;
}
test("deterministic for a seed", () => expect([...run(5)]).toEqual([...run(5)]));
test("plots points inside the box", () => {
  const c = run(1);
  expect(c.reduce((a, b) => a + b, 0)).toBeGreaterThan(29000);
});
test("Sierpiński leaves the centre of the triangle empty", () => {
  const c = run(2);
  // Centroid of the big triangle's middle (upside-down) sub-triangle
  expect(c[60 * 100 + 50]).toBe(0);
});
test("restrictions and centre target run", () => {
  expect(run(3, { corners: 4, restriction: "not-same", includeCenter: true }).some((v) => v > 0)).toBe(true);
  expect(run(3, { corners: 5, restriction: "not-neighbor" }).some((v) => v > 0)).toBe(true);
});
