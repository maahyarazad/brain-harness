// The Web Worker path of the pool, with a fake Worker. Kept in its own file
// because the pool is created once per module instance.
import { vi } from "vitest";

const workers = [];
class FakeWorker {
  constructor() {
    this.terminated = false;
    this.posted = [];
    workers.push(this);
  }
  postMessage(msg) {
    this.posted.push(msg);
  }
  terminate() {
    this.terminated = true;
  }
  // Test helper: finish the job the worker was given.
  reply(id, result = { ok: true }) {
    this.onmessage({ data: { id, result } });
  }
}

let runKernel;
beforeAll(async () => {
  globalThis.Worker = FakeWorker;
  Object.defineProperty(navigator, "hardwareConcurrency", { value: 2, configurable: true }); // pool of 1
  ({ runKernel } = await import("../../../studio/core/workerPool.js"));
});
afterAll(() => {
  delete globalThis.Worker;
});

test("a job cancelled right after it starts keeps its worker and frees it when done", async () => {
  const a = runKernel("k", { n: 1 });
  expect(workers).toHaveLength(1);
  const w = workers[0];
  const idA = w.posted[0].id;
  a.cancel();
  await expect(a.promise).rejects.toMatchObject({ name: "AbortError" });
  expect(w.terminated).toBe(false);

  // The next job waits until the cancelled one's result arrives, then runs on the same worker.
  const b = runKernel("k", { n: 2 });
  expect(w.posted).toHaveLength(1);
  w.reply(idA);
  expect(w.posted).toHaveLength(2);
  w.reply(w.posted[1].id, { n: 2 });
  await expect(b.promise).resolves.toEqual({ n: 2 });
  expect(workers).toHaveLength(1);
});

test("a long-running job is stopped by replacing its worker", async () => {
  const now = vi.spyOn(performance, "now");
  now.mockReturnValue(1000);
  const t = runKernel("k", {});
  const w = workers.at(-1);
  now.mockReturnValue(1500);
  t.cancel();
  await expect(t.promise).rejects.toMatchObject({ name: "AbortError" });
  expect(w.terminated).toBe(true);
  expect(workers.at(-1)).not.toBe(w);
  now.mockRestore();
});
