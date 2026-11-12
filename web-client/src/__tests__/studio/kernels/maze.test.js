import { createGrid, GENERATORS, passages, solver, runToEnd, toggleWall, S, E } from "../../../studio/visualizations/maze/kernel.js";
import { createRng } from "../../../studio/core/rng.js";
function build(kind, cols = 15, rows = 11, seed = 3) {
  const g = createGrid(cols, rows);
  runToEnd(GENERATORS[kind](g, createRng(seed)));
  return g;
}
function countPassages(g) {
  let n = 0;
  for (let i = 0; i < g.walls.length; i++) n += passages(g, i).length;
  return n / 2;
}
function reachable(g) {
  const seen = new Set([0]);
  const q = [0];
  while (q.length) for (const j of passages(g, q.shift())) if (!seen.has(j)) (seen.add(j), q.push(j));
  return seen.size;
}
for (const kind of Object.keys(GENERATORS)) {
  test(`${kind} makes a perfect maze`, () => {
    const g = build(kind);
    expect(reachable(g)).toBe(g.walls.length);
    expect(countPassages(g)).toBe(g.walls.length - 1);
  });
}
test("A*, Dijkstra and BFS find equally short paths", () => {
  const g = build("prim", 20, 15, 9);
  const end = g.walls.length - 1;
  const lengths = ["astar", "dijkstra", "bfs"].map((k) => runToEnd(solver(k, g, 0, end, "manhattan")).path.length);
  lengths.push(runToEnd(solver("astar", g, 0, end, "euclidean")).path.length);
  expect(new Set(lengths).size).toBe(1);
});
test("walling off the goal gives no path", () => {
  const g = build("dfs", 6, 5, 2);
  const end = g.walls.length - 1;
  const cols = 6;
  // Close every open wall around the goal cell (left and top neighbours)
  for (const j of passages(g, end)) {
    const bit = j === end - 1 ? 8 : 1;
    toggleWall(g, end, bit);
  }
  expect(runToEnd(solver("astar", g, 0, end, "manhattan")).noPath).toBe(true);
  expect(runToEnd(solver("bfs", g, 0, end)).noPath).toBe(true);
  void cols, S, E;
});
