import { parseRule, lifeStep, aliveCells } from "../../../studio/visualizations/life/kernel.js";
const conway = parseRule("B3/S23");
function grid(w, h, cells) {
  const g = new Uint8Array(w * h);
  cells.forEach(([x, y]) => (g[y * w + x] = 1));
  return g;
}
function run(g, w, h, n, wrap = false) {
  let a = g, b = new Uint8Array(w * h);
  for (let i = 0; i < n; i++) {
    lifeStep(a, b, w, h, conway, wrap);
    [a, b] = [b, a];
  }
  return a;
}
test("parses rules", () => {
  expect(parseRule("B36/S23").birth).toEqual(new Set([3, 6]));
  expect(parseRule("B2/S").survive.size).toBe(0);
  expect(parseRule("nope")).toBeNull();
});
test("blinker has period 2", () => {
  const g = grid(5, 5, [[1, 2], [2, 2], [3, 2]]);
  expect(aliveCells(run(g, 5, 5, 1), 5)).toEqual([[2, 1], [2, 2], [2, 3]]);
  expect([...run(g, 5, 5, 2)]).toEqual([...g]);
});
test("block is stable", () => {
  const g = grid(4, 4, [[1, 1], [2, 1], [1, 2], [2, 2]]);
  expect([...run(g, 4, 4, 5)]).toEqual([...g]);
});
test("glider moves by (1, 1) every 4 generations", () => {
  const cells = [[1, 0], [2, 1], [0, 2], [1, 2], [2, 2]];
  const after = aliveCells(run(grid(10, 10, cells), 10, 10, 4), 10);
  expect(after).toEqual(cells.map(([x, y]) => [x + 1, y + 1]).sort((a, b) => a[1] - b[1] || a[0] - b[0]));
});
