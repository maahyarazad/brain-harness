import { pascalModRows } from "../../../studio/visualizations/pascalMod/kernel.js";
const rows = (n, mod) => [...pascalModRows(n, mod)].map((r) => [...r]);
test("mod 2, row 4", () => expect(rows(5, 2)[4]).toEqual([1, 0, 0, 0, 1]));
test("mod 3, row 3", () => expect(rows(4, 3)[3]).toEqual([1, 0, 0, 1]));
test("mod 10 matches real binomials", () => expect(rows(7, 10)[6]).toEqual([1, 6, 5, 0, 5, 6, 1]));
