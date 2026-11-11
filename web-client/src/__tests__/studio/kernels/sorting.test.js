import { ALGORITHMS, initialArray } from "../../../studio/visualizations/sorting/kernel.js";
import { createRng } from "../../../studio/core/rng.js";
const ORDERS = ["random", "nearly-sorted", "reversed", "few-unique"];
for (const [name, algo] of Object.entries(ALGORITHMS)) {
  test(`${name} sorts every starting order and size`, () => {
    for (const order of ORDERS) {
      for (const size of [0, 1, 2, 50]) {
        const a = initialArray(size, order, createRng(size + 1));
        const view = a.slice();
        const expected = a.slice().sort((x, y) => x - y);
        for (const op of algo(a)) {
          if (op.op === "swap") [view[op.i], view[op.j]] = [view[op.j], view[op.i]];
          else if (op.op === "set") view[op.i] = op.value;
        }
        expect(a).toEqual(expected);
        expect(view).toEqual(expected);
      }
    }
  });
}
