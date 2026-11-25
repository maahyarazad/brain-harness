// Counting how often an interface part really redraws (specs/005 contracts/render-audit.md, FR-031).
//
// React's <Profiler> cannot do this: it reports a commit whenever its parent re-renders, even when a
// memoized child inside it bails out. What matters is how often the component's own function RUNS,
// after React.memo has had its say. So instrument() wraps the function a memoized component was made
// from, and counts calls. A component that is not memoized cannot be instrumented, which makes the
// test fail loudly instead of passing for the wrong reason.
//
//   const knobs = instrument(RangeKnob, { keyOf: (props) => props.knob.key });
//   ... render, interact ...
//   expect(knobs.count("curl")).toBe(1);
//   expect(knobs.count("pressure")).toBe(0);
//   knobs.restore();
const MEMO = Symbol.for("react.memo");

/**
 * Starts counting calls of a memoized component's function.
 * keyOf(props) groups the count (for example by knob key); the default is one group, "all".
 */
export function instrument(Component, { keyOf = () => "all" } = {}) {
  if (!Component || Component.$$typeof !== MEMO) {
    throw new Error("instrument() needs a component made with React.memo: this one is not memoized, so it redraws whenever its parent does.");
  }
  const inner = Component.type;
  const counts = new Map();
  Component.type = function Counted(props, ref) {
    const key = keyOf(props);
    counts.set(key, (counts.get(key) ?? 0) + 1);
    return inner(props, ref);
  };
  Object.defineProperty(Component.type, "name", { value: inner.name || "Component" });
  return {
    /** Calls for one group, or all groups together when no key is given. */
    count(key) {
      if (key === undefined) return [...counts.values()].reduce((a, b) => a + b, 0);
      return counts.get(key) ?? 0;
    },
    keys: () => [...counts.keys()],
    /** Forgets what was counted so far (call after the first render, before the interaction under test). */
    reset: () => counts.clear(),
    /** Puts the original function back. */
    restore() {
      Component.type = inner;
    },
  };
}

/** Instruments several components at once; restore() puts them all back. */
export function instrumentAll(components) {
  const probes = Object.fromEntries(Object.entries(components).map(([name, C]) => [name, instrument(C)]));
  return Object.assign(probes, {
    resetAll: () => Object.values(probes).forEach((p) => p.reset?.()),
    restoreAll: () => Object.values(probes).forEach((p) => p.restore?.()),
  });
}
