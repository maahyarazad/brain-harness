import { escapeBand } from "../../../studio/visualizations/mandelbrot/kernel.js";
const one = (x, y, extra = {}) =>
  escapeBand({ x0: x, y0: y, dx: 1, width: 1, rowStart: 0, rowEnd: 1, maxIter: 200, smooth: false, ...extra }).counts[0];
test("c = 0 never escapes", () => expect(one(0, 0)).toBe(-1));
test("c = 1 escapes quickly", () => {
  const v = one(1, 0);
  expect(v).toBeGreaterThanOrEqual(0);
  expect(v).toBeLessThan(5);
});
test("Julia mode uses the fixed c", () => expect(one(0, 0, { juliaC: [0, 0] })).toBe(-1));
test("same inputs give the same output", () => {
  const args = { x0: -2, y0: 1, dx: 0.05, width: 60, rowStart: 0, rowEnd: 40, maxIter: 100, smooth: true };
  expect([...escapeBand(args).counts]).toEqual([...escapeBand(args).counts]);
});
