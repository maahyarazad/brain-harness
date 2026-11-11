// Manually driven animation frames, reduced-motion media query, and tab visibility.
let frameCallbacks = new Map();
let nextId = 1;

export function createFrameDriver() {
  frameCallbacks = new Map();
  return {
    raf: (cb) => {
      const id = nextId++;
      frameCallbacks.set(id, cb);
      return id;
    },
    caf: (id) => frameCallbacks.delete(id),
    advanceFrames(n = 1) {
      for (let i = 0; i < n; i++) {
        const pending = [...frameCallbacks.values()];
        frameCallbacks.clear();
        pending.forEach((cb) => cb(performance.now()));
      }
    },
    pending: () => frameCallbacks.size,
  };
}

export function stubReducedMotion(reduce) {
  window.matchMedia = (query) => ({
    matches: query.includes("prefers-reduced-motion") ? reduce : false,
    media: query,
    addEventListener() {},
    removeEventListener() {},
    addListener() {},
    removeListener() {},
  });
}

export function setVisibility(state) {
  Object.defineProperty(document, "visibilityState", { value: state, configurable: true });
  document.dispatchEvent(new Event("visibilitychange"));
}
