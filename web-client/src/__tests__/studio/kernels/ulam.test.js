import { sieve, squareSpiral, hexSpiral, sacksSpiral } from "../../../studio/visualizations/ulam/kernel.js";
test("primes below 30", () => {
  const s = sieve(30);
  const primes = [...s.keys()].filter((n) => s[n]);
  expect(primes).toEqual([2, 3, 5, 7, 11, 13, 17, 19, 23, 29]);
});
test("first 9 square-spiral cells form a 3×3 block", () => {
  const c = squareSpiral(9);
  const keys = new Set();
  for (let i = 0; i < 9; i++) keys.add(`${c[i * 2]},${c[i * 2 + 1]}`);
  expect(keys.size).toBe(9);
  for (const k of keys) k.split(",").map(Number).forEach((v) => expect(Math.abs(v)).toBeLessThanOrEqual(1));
});
test("square spiral coordinates are unique for 10,000 cells", () => {
  const c = squareSpiral(10000);
  const keys = new Set();
  for (let i = 0; i < 10000; i++) keys.add(c[i * 2] * 100000 + c[i * 2 + 1]);
  expect(keys.size).toBe(10000);
});
test("hex spiral: ring 1 has 6 cells at distance 1", () => {
  const c = hexSpiral(7);
  for (let i = 1; i < 7; i++) expect(Math.hypot(c[i * 2], c[i * 2 + 1])).toBeCloseTo(1, 5);
});
test("Sacks spiral puts perfect squares on one ray", () => {
  const c = sacksSpiral(1, 100);
  for (const n of [4, 9, 16, 25]) {
    const i = n - 1;
    expect(Math.atan2(c[i * 2 + 1], c[i * 2])).toBeCloseTo(0, 4);
  }
});
