import { createRng, rngInt, isValidSeed, MAX_SEED } from "../../../studio/core/rng.js";

test("same seed gives the same sequence", () => {
  const a = createRng(42), b = createRng(42);
  for (let i = 0; i < 1000; i++) expect(a()).toBe(b());
});

test("different seeds give different sequences", () => {
  const a = createRng(1), b = createRng(2);
  const sa = Array.from({ length: 10 }, a), sb = Array.from({ length: 10 }, b);
  expect(sa).not.toEqual(sb);
});

test("values are in [0, 1) and integers stay in range", () => {
  const r = createRng(7);
  for (let i = 0; i < 5000; i++) {
    const v = r();
    expect(v).toBeGreaterThanOrEqual(0);
    expect(v).toBeLessThan(1);
    const n = rngInt(r, 3, 5);
    expect(n).toBeGreaterThanOrEqual(3);
    expect(n).toBeLessThanOrEqual(5);
  }
});

test("seed validation", () => {
  expect(isValidSeed(0)).toBe(true);
  expect(isValidSeed(MAX_SEED)).toBe(true);
  expect(isValidSeed(MAX_SEED + 1)).toBe(false);
  expect(isValidSeed(1.5)).toBe(false);
  expect(isValidSeed("3")).toBe(false);
});
