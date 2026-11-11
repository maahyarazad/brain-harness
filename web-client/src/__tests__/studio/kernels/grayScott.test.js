import { grayScottSteps, seedFields } from "../../../studio/visualizations/grayScott/kernel.js";
import { createRng } from "../../../studio/core/rng.js";
const P = { feed: 0.0545, kill: 0.062, du: 1, dv: 0.5 };
test("uniform u = 1, v = 0 is stable", () => {
  const w = 16, h = 12;
  const r = grayScottSteps({ u: new Float32Array(w * h).fill(1), v: new Float32Array(w * h), w, h, ...P, steps: 20 });
  expect(r.u.every((x) => x === 1)).toBe(true);
  expect(r.v.every((x) => x === 0)).toBe(true);
});
test("values stay in [0, 1]", () => {
  const w = 32, h = 24;
  const { u, v } = seedFields(w, h, createRng(3));
  const r = grayScottSteps({ u, v, w, h, ...P, steps: 50 });
  for (const x of [...r.u, ...r.v]) {
    expect(x).toBeGreaterThanOrEqual(0);
    expect(x).toBeLessThanOrEqual(1);
  }
});
