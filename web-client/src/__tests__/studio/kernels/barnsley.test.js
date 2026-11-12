import { fernPoints, normalizeWeights } from "../../../studio/visualizations/barnsley/kernel.js";
import { createRng } from "../../../studio/core/rng.js";
test("weights normalize, zeros fall back to equal", () => {
  expect(normalizeWeights([1, 1, 2, 0])).toEqual([0.25, 0.25, 0.5, 0]);
  expect(normalizeWeights([0, 0, 0, 0])).toEqual([0.25, 0.25, 0.25, 0.25]);
});
test("classic fern stays in bounds and is deterministic", () => {
  const run = () => {
    const counts = new Uint32Array(80 * 160);
    for (const _ of fernPoints({ weights: [0.01, 0.85, 0.07, 0.07], count: 20000, rng: createRng(9), w: 80, h: 160, counts }));
    return counts;
  };
  const a = run();
  expect(a.reduce((x, y) => x + y, 0)).toBeGreaterThan(19900);
  expect([...a]).toEqual([...run()]);
});
