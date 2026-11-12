import { registerKernel, runKernel } from "../../../studio/core/workerPool.js";

test("runs registered kernels in-thread when Worker is unavailable", async () => {
  registerKernel("double", ({ x }, report) => {
    report(0.5);
    return { y: x * 2 };
  });
  const progress = [];
  const t = runKernel("double", { x: 21 }, { onProgress: (p) => progress.push(p) });
  await expect(t.promise).resolves.toEqual({ y: 42 });
  expect(progress).toEqual([0.5]);
});

test("cancelled kernels reject", async () => {
  registerKernel("slow", () => 1);
  const t = runKernel("slow", {});
  t.cancel();
  await expect(t.promise).rejects.toMatchObject({ name: "AbortError" });
});

test("unknown kernels reject", async () => {
  await expect(runKernel("nope", {}).promise).rejects.toThrow(/not registered/);
});
