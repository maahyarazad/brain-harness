import { recaman } from "../../../studio/visualizations/recaman/kernel.js";
test("first 10 terms", () => expect(recaman(10)).toEqual([0, 1, 3, 6, 2, 7, 13, 20, 12, 21]));
