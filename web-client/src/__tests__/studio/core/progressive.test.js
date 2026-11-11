import { progressive } from "../../../studio/core/progressive.js";

const immediate = (cb) => setTimeout(cb, 0);

test("runs a generator to completion and reports progress", async () => {
  const seen = [];
  function* work() {
    for (let i = 0; i < 5; i++) yield i / 5;
    return "done";
  }
  const t = progressive(work(), { onProgress: (p) => seen.push(p), schedule: immediate });
  await expect(t.promise).resolves.toBe("done");
  expect(seen.at(-1)).toBe(1);
});

test("splits work across slices and can be cancelled", async () => {
  let count = 0;
  function* forever() {
    for (;;) {
      count++;
      yield;
    }
  }
  const t = progressive(forever(), { budgetMs: 1, schedule: immediate });
  await new Promise((r) => setTimeout(r, 20));
  t.cancel();
  await expect(t.promise).rejects.toMatchObject({ name: "AbortError" });
  const after = count;
  await new Promise((r) => setTimeout(r, 20));
  expect(count).toBe(after);
});
