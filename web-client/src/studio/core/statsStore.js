// A tiny external store for the live counters a visualization reports every frame
// (ctx.reportStats). Keeping them out of the Viewer's React state means a running animation
// redraws only the component that shows them, not the viewer and every knob
// (specs/005-.../research.md R8). Works with React's useSyncExternalStore.

const same = (a, b) => {
  if (a === b) return true;
  if (!a || !b) return false;
  const ka = Object.keys(a);
  if (ka.length !== Object.keys(b).length) return false;
  return ka.every((k) => Object.is(a[k], b[k]));
};

export function createStatsStore() {
  let value = null;
  const subs = new Set();

  function set(next) {
    // Modules report a fresh object every frame; only a real change should redraw anything.
    if (same(value, next)) return;
    value = next;
    // Copy first: a subscriber may unsubscribe while we are notifying.
    [...subs].forEach((fn) => fn());
  }

  return {
    set,
    get: () => value,
    subscribe(fn) {
      subs.add(fn);
      return () => subs.delete(fn);
    },
    clear: () => set(null),
  };
}
