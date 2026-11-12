import { timesTableLines, circlePoint } from "../../../studio/visualizations/timesTable/kernel.js";
test("lines connect k to k·m mod N", () => {
  expect(timesTableLines(10, 2)).toContainEqual([7, 4]);
  expect(timesTableLines(10, 2.5)[3]).toEqual([3, 7.5]);
});
test("points lie on the circle", () => {
  for (let k = 0; k < 10; k++) {
    const [x, y] = circlePoint(k, 10, 0, 0, 5);
    expect(Math.hypot(x, y)).toBeCloseTo(5);
  }
});
