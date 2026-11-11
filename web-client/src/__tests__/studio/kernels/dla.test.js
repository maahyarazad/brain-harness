import { dlaGrow } from "../../../studio/visualizations/dla/kernel.js";
const W = 120, H = 90;
test("every stuck particle touches an earlier one", () => {
  const r = dlaGrow({ w: W, h: H, particles: 400, stickiness: 1, seedShape: "point", seed: 4 });
  expect(r.stuck).toBe(400);
  for (let i = 0; i < r.order.length; i++) {
    const o = r.order[i];
    if (o <= r.seedCount) continue;
    const x = i % W, y = Math.floor(i / W);
    const earlier = [[1, 0], [-1, 0], [0, 1], [0, -1]].some(([dx, dy]) => {
      const nx = x + dx, ny = y + dy;
      return nx >= 0 && ny >= 0 && nx < W && ny < H && r.order[ny * W + nx] > 0 && r.order[ny * W + nx] < o;
    });
    expect(earlier).toBe(true);
  }
});
test("deterministic for a seed", () => {
  const a = dlaGrow({ w: W, h: H, particles: 200, stickiness: 0.5, seedShape: "line", seed: 7 });
  const b = dlaGrow({ w: W, h: H, particles: 200, stickiness: 0.5, seedShape: "line", seed: 7 });
  expect([...a.order]).toEqual([...b.order]);
});
test("the step budget stops the run", () => {
  const r = dlaGrow({ w: W, h: H, particles: 5000, stickiness: 0.01, seedShape: "point", seed: 1, stepBudget: 20000 });
  expect(r.budgetExhausted).toBe(true);
  expect(r.stuck).toBeLessThan(5000);
});
test("circle seed grows inward", () => {
  const r = dlaGrow({ w: W, h: H, particles: 100, stickiness: 1, seedShape: "circle", seed: 2 });
  expect(r.stuck).toBe(100);
});
