import { parseTurnRule, antStep } from "../../../studio/visualizations/langton/kernel.js";
test("rule parsing", () => {
  expect(parseTurnRule("RL")).toEqual([1, -1]);
  expect(parseTurnRule("RLX")).toBeNull();
  expect(parseTurnRule("R")).toBeNull();
});
test("classic ant builds a highway after about 10,000 steps", () => {
  const N = 200;
  const grid = new Uint8Array(N * N);
  const ant = { x: 100, y: 100, dir: 0 };
  const turns = parseTurnRule("RL");
  for (let i = 0; i < 10500; i++) antStep(grid, N, N, [ant], turns);
  const at10500 = { ...ant };
  for (let i = 0; i < 1040; i++) antStep(grid, N, N, [ant], turns);
  // The highway repeats every 104 steps, moving 2 cells diagonally each time: 10 periods = 20 cells.
  expect(Math.abs(ant.x - at10500.x)).toBe(20);
  expect(Math.abs(ant.y - at10500.y)).toBe(20);
});
