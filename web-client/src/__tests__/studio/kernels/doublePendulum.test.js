import { pendulumRK4, energy } from "../../../studio/visualizations/doublePendulum/kernel.js";
const P = { m1: 1, m2: 1, l1: 1, l2: 1, g: 9.81 };
test("energy drift under 1% over 10 seconds", () => {
  let s = [2, 0, -0.3, 0];
  const e0 = energy(s, P);
  for (let i = 0; i < 2400; i++) s = pendulumRK4(s, P, 1 / 240);
  expect(Math.abs((energy(s, P) - e0) / e0)).toBeLessThan(0.01);
});
test("hanging straight down stays at rest", () => {
  let s = [0, 0, 0, 0];
  for (let i = 0; i < 240; i++) s = pendulumRK4(s, P, 1 / 240);
  s.forEach((v) => expect(Math.abs(v)).toBeLessThan(1e-12));
});
