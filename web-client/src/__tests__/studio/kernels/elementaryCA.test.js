import { ruleTable, elementaryStep } from "../../../studio/visualizations/elementaryCA/kernel.js";
import { pascalModRows } from "../../../studio/visualizations/pascalMod/kernel.js";
test("Rule 90 from one cell draws Pascal's triangle mod 2", () => {
  const w = 41, mid = 20;
  let row = new Uint8Array(w);
  row[mid] = 1;
  const t = ruleTable(90);
  const pascal = [...pascalModRows(8, 2)];
  for (let r = 0; r < 8; r++) {
    for (let k = 0; k <= r; k++) expect(row[mid - r + 2 * k]).toBe(pascal[r][k]);
    const next = new Uint8Array(w);
    elementaryStep(row, next, t, false);
    row = next;
  }
});
test("rule table bits", () => {
  expect([...ruleTable(30)]).toEqual([0, 1, 1, 1, 1, 0, 0, 0]);
});
