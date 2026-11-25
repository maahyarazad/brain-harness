// A configurable stub visualization for testing the Viewer's contract with modules
// (specs/005-.../contracts/module-additions.md). It records every call the shell makes.
import { withQuality } from "../../../studio/core/quality.js";
import { withSweep } from "../../../studio/core/sweep.js";

/**
 * makeStub({ module: {…extra module fields…}, actions: true, setQuality: true, unsupported: false, onCreate })
 * → { entry, module, calls, state }
 *  - state.idle: what isIdle() answers
 *  - calls.created[i] = { canvas, config, ctx }
 */
export function makeStub(options = {}) {
  const calls = { created: [], pointer: [], actions: [], qualities: [], updates: [], resizes: [], destroyed: 0, steps: 0, renders: 0, resets: 0 };
  const state = { idle: false };

  const base = {
    id: "stub",
    name: "Stub",
    howItWorks: "A stub visualization used by the Viewer contract tests.",
    animated: true,
    random: false,
    interactive: true,
    stepsPerFrame: 1,
    knobs: [{ key: "n", label: "N", type: "range", min: 1, max: 10, step: 1, default: 5 }],
    presets: [{ id: "p1", name: "Preset one", values: { n: 7 } }],
    create(canvas, config, ctx) {
      const record = { canvas, config, ctx };
      calls.created.push(record);
      const inst = {
        update: (c, keys, meta) => calls.updates.push([c, keys, meta]),
        step: () => calls.steps++,
        render: () => calls.renders++,
        reset: () => calls.resets++,
        resize: (w, h) => calls.resizes.push([w, h]),
        destroy: () => calls.destroyed++,
        pointer: (ev) => {
          calls.pointer.push(ev);
        },
        isIdle: () => state.idle,
      };
      if (options.actions) inst.action = (id) => calls.actions.push(id);
      if (options.setQuality) inst.setQuality = (level, opts) => calls.qualities.push([level, opts]);
      if (options.unsupported) inst.unsupported = true;
      if (options.path) inst.path = options.path; // "gpu": this instance holds a WebGL context on its canvas
      options.onCreate?.(record, inst, ctx);
      return inst;
    },
  };

  // Wrapped as the catalog wraps every module: the sweep knobs and preset, then the Quality knob.
  const module = withQuality(withSweep({ ...base, ...options.module }));
  const entry = {
    id: module.id,
    name: module.name,
    category: "simulation",
    glyph: "S",
    summary: "A stub.",
    load: () => Promise.resolve({ default: module }),
  };
  return { entry, module, calls, state };
}

/** A hand-driven requestAnimationFrame with controllable timestamps (the real one cannot be made slow on demand). */
export function makeFrames() {
  let nextId = 1;
  let now = 0;
  const queue = new Map();
  return {
    raf: (cb) => {
      const id = nextId++;
      queue.set(id, cb);
      return id;
    },
    caf: (id) => queue.delete(id),
    /** Runs n animation frames, dt milliseconds apart. */
    advance(n = 1, dt = 16.7) {
      for (let i = 0; i < n; i++) {
        const pending = [...queue.values()];
        queue.clear();
        now += dt;
        pending.forEach((cb) => cb(now));
      }
    },
    /** Jumps the clock without running frames (a hidden tab). */
    skip(ms) {
      now += ms;
    },
    pending: () => queue.size,
  };
}
