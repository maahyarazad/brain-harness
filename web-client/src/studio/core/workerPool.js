// Runs pure kernels in a small pool of Web Workers. Where Worker isn't
// available (tests), the kernel registered with registerKernel runs in-thread.
import { AbortError } from "./progressive.js";
import { collectTransfer } from "./transfer.js";

const registry = new Map();
export function registerKernel(name, fn) {
  registry.set(name, fn);
}

const hasWorker = () => typeof globalThis.Worker === "function" && !globalThis.__STUDIO_NO_WORKERS__;

let pool = null;
let nextId = 1;
const jobs = new Map(); // id → job
const queue = [];

function newWorker() {
  const w = new Worker(new URL("../workers/kernel.worker.js", import.meta.url), { type: "module" });
  const slot = { worker: w, job: null };
  w.onmessage = (e) => {
    const job = jobs.get(e.data.id);
    if (!job) return;
    if ("progress" in e.data) {
      job.onProgress?.(e.data.progress);
      return;
    }
    jobs.delete(job.id);
    slot.job = null;
    if (e.data.error) job.reject(new Error(e.data.error));
    else job.resolve(e.data.result);
    pump();
  };
  w.onerror = (e) => {
    const job = slot.job;
    slot.job = null;
    if (job) {
      jobs.delete(job.id);
      job.reject(new Error(e.message || "Worker error"));
    }
    pump();
  };
  return slot;
}

function getPool() {
  if (!pool) {
    const n = Math.max(1, Math.min(4, (globalThis.navigator?.hardwareConcurrency ?? 2) - 1));
    pool = Array.from({ length: n }, newWorker);
  }
  return pool;
}

function pump() {
  for (const slot of getPool()) {
    if (slot.job || !queue.length) continue;
    const job = queue.shift();
    slot.job = job;
    job.slot = slot;
    slot.worker.postMessage({ id: job.id, name: job.name, args: job.args }, job.transfer ?? collectTransfer(job.args));
  }
}

export function runKernel(name, args, { onProgress, transfer } = {}) {
  if (!hasWorker()) {
    const fn = registry.get(name);
    let cancelled = false;
    const promise = Promise.resolve().then(() => {
      if (cancelled) throw new AbortError();
      if (!fn) throw new Error(`Kernel ${name} is not registered`);
      const result = fn(args, (p) => onProgress?.(p));
      if (cancelled) throw new AbortError();
      return result;
    });
    promise.catch(() => {});
    return { promise, cancel: () => (cancelled = true) };
  }

  const id = nextId++;
  let job;
  const promise = new Promise((resolve, reject) => {
    job = { id, name, args, transfer, onProgress, resolve, reject, slot: null };
  });
  promise.catch(() => {});
  jobs.set(id, job);
  queue.push(job);
  pump();
  return {
    promise,
    cancel() {
      if (!jobs.has(id)) return;
      jobs.delete(id);
      const qi = queue.indexOf(job);
      if (qi >= 0) queue.splice(qi, 1);
      if (job.slot) {
        // Stop the running computation by replacing the worker.
        const i = pool.indexOf(job.slot);
        job.slot.worker.terminate();
        pool[i] = newWorker();
      }
      job.reject(new AbortError());
      pump();
    },
  };
}
