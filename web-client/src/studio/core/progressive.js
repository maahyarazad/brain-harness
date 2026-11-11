// Runs a generator in slices of a few milliseconds per animation frame,
// so long drawing work never freezes the page. The generator may yield
// a progress fraction in [0, 1].

const defaultSchedule = (cb) =>
  typeof globalThis.requestAnimationFrame === "function"
    ? globalThis.requestAnimationFrame(cb)
    : setTimeout(cb, 0);

export class AbortError extends Error {
  constructor() {
    super("Cancelled");
    this.name = "AbortError";
  }
}

export function progressive(generator, { budgetMs = 8, onProgress = () => {}, schedule = defaultSchedule } = {}) {
  let cancelled = false;
  let rejectFn;
  const promise = new Promise((resolve, reject) => {
    rejectFn = reject;
    function slice() {
      if (cancelled) return;
      const start = performance.now();
      try {
        while (performance.now() - start < budgetMs) {
          const r = generator.next();
          if (r.done) {
            onProgress(1);
            resolve(r.value);
            return;
          }
          if (typeof r.value === "number") onProgress(r.value);
        }
      } catch (err) {
        reject(err);
        return;
      }
      schedule(slice);
    }
    slice();
  });
  promise.catch(() => {});
  return {
    promise,
    cancel() {
      if (cancelled) return;
      cancelled = true;
      rejectFn(new AbortError());
    },
  };
}
