import { collatzPath, coralPaths } from "../../../studio/visualizations/collatz/kernel.js";
test("Collatz path of 6", () => expect(collatzPath(6)).toEqual([6, 3, 10, 5, 16, 8, 4, 2, 1]));
test("path of 1 is [1]", () => expect(collatzPath(1)).toEqual([1]));
test("coral paths start at 1 and end at n", () => {
  const p = coralPaths(20);
  p.forEach((path, i) => {
    expect(path[0]).toBe(1);
    expect(path.at(-1)).toBe(i + 1);
  });
});
