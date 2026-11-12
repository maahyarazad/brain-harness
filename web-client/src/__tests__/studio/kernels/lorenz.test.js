import { lorenzRK4 } from "../../../studio/visualizations/lorenz/kernel.js";
const P = { sigma: 10, rho: 28, beta: 8 / 3 };
test("the origin is a fixed point", () => {
  expect(lorenzRK4([0, 0, 0], P, 0.005)).toEqual([0, 0, 0]);
});
test("two starts 1e-5 apart drift more than 1 apart", () => {
  let a = [1, 1, 1], b = [1 + 1e-5, 1, 1];
  let maxD = 0;
  for (let i = 0; i < 6000; i++) {
    a = lorenzRK4(a, P, 0.005);
    b = lorenzRK4(b, P, 0.005);
    maxD = Math.max(maxD, Math.hypot(a[0] - b[0], a[1] - b[1], a[2] - b[2]));
  }
  expect(maxD).toBeGreaterThan(1);
});
