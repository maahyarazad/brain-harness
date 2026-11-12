import { createFlock, flockStep } from "../../../studio/visualizations/boids/kernel.js";
import { createRng } from "../../../studio/core/rng.js";
const base = { separation: 1, alignment: 1, cohesion: 1, radius: 0.1, maxSpeed: 0.004, attractor: null };
test("speed never exceeds the maximum", () => {
  const f = createFlock(200, 4 / 3, createRng(1));
  for (let s = 0; s < 30; s++) flockStep(f, base);
  for (let i = 0; i < f.count; i++) expect(Math.hypot(f.vel[i * 2], f.vel[i * 2 + 1])).toBeLessThanOrEqual(0.004 + 1e-9);
});
test("alignment alone lines the flock up", () => {
  const f = createFlock(150, 1, createRng(2));
  const spread = () => {
    let sx = 0, sy = 0;
    for (let i = 0; i < f.count; i++) {
      const s = Math.hypot(f.vel[i * 2], f.vel[i * 2 + 1]);
      sx += f.vel[i * 2] / s;
      sy += f.vel[i * 2 + 1] / s;
    }
    return 1 - Math.hypot(sx, sy) / f.count;
  };
  const before = spread();
  for (let s = 0; s < 200; s++) flockStep(f, { ...base, separation: 0, cohesion: 0, alignment: 3, radius: 0.3 });
  expect(spread()).toBeLessThan(before);
});
