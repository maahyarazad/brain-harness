import { vi } from "vitest";
import {
  withSweep,
  valueAt,
  phaseOf,
  createSweepDriver,
  sweptKeys,
  SWEEP_KNOBS,
} from "../../../studio/core/sweep.js";

const rangeKnob = { key: "a", type: "range", min: 0, max: 10, step: 0.01, default: 5 };

describe("valueAt", () => {
  test("wave eases between min and max and back", () => {
    const t = { key: "a", mode: "wave", min: 2, max: 8 };
    expect(valueAt(t, 0, rangeKnob)).toBeCloseTo(2);
    expect(valueAt(t, 0.25, rangeKnob)).toBeCloseTo(5);
    expect(valueAt(t, 0.5, rangeKnob)).toBeCloseTo(8);
    expect(valueAt(t, 0.75, rangeKnob)).toBeCloseTo(5);
    expect(valueAt(t, 0.999, rangeKnob)).toBeCloseTo(2, 1);
  });

  test("phase offsets shift the wave", () => {
    const t = { key: "a", mode: "wave", min: 0, max: 10, phase: 0.25 };
    expect(valueAt(t, 0, rangeKnob)).toBeCloseTo(5);
    expect(valueAt(t, 0.25, rangeKnob)).toBeCloseTo(10);
  });

  test("wrap goes up linearly and starts over", () => {
    const t = { key: "a", mode: "wrap", min: 0, max: 10 };
    expect(valueAt(t, 0, rangeKnob)).toBe(0);
    expect(valueAt(t, 0.5, rangeKnob)).toBe(5);
    expect(valueAt(t, 0.999, rangeKnob)).toBeCloseTo(9.99);
  });

  test("log interpolates on a log scale", () => {
    const t = { view: "zoom", mode: "log", min: 1, max: 10000 };
    expect(valueAt(t, 0)).toBeCloseTo(1);
    expect(valueAt(t, 0.25)).toBeCloseTo(100);
    expect(valueAt(t, 0.5)).toBeCloseTo(10000);
  });

  test("steps walks through a list", () => {
    const t = { key: "r", mode: "steps", list: ["a", "b", "c", "d"] };
    expect([0, 0.25, 0.5, 0.75, 0.999].map((p) => valueAt(t, p))).toEqual(["a", "b", "c", "d", "d"]);
  });

  test("results are snapped to the knob's step and kept inside its limits", () => {
    const knob = { key: "n", type: "range", min: 2, max: 6, step: 1, default: 2 };
    const t = { key: "n", mode: "wave", min: 0, max: 20 };
    expect(valueAt(t, 0.1, knob)).toBe(2);
    expect(valueAt(t, 0.5, knob)).toBe(6);
    expect(Number.isInteger(valueAt(t, 0.2, knob))).toBe(true);
  });
});

describe("phaseOf inverts valueAt", () => {
  test.each([
    ["wave", { key: "a", mode: "wave", min: 1, max: 9 }],
    ["wave with phase", { key: "a", mode: "wave", min: 1, max: 9, phase: 0.3 }],
    ["wrap", { key: "a", mode: "wrap", min: 1, max: 9 }],
    ["log", { key: "a", mode: "log", min: 1, max: 9 }],
  ])("%s", (_name, target) => {
    for (const p of [0.05, 0.2, 0.4, 0.6, 0.8, 0.95]) {
      const v = valueAt(target, p);
      const rising = target.mode === "wrap" || (p + (target.phase ?? 0)) % 1 < 0.5;
      const back = phaseOf(target, v, rising);
      expect(valueAt(target, back)).toBeCloseTo(v, 6);
    }
  });

  test("the falling half is chosen when not rising", () => {
    const t = { key: "a", mode: "wave", min: 0, max: 10 };
    expect(phaseOf(t, 5, true)).toBeCloseTo(0.25);
    expect(phaseOf(t, 5, false)).toBeCloseTo(0.75);
  });

  test("steps finds the slot, or the nearest number", () => {
    const t = { key: "r", mode: "steps", list: [30, 90, 110] };
    expect(valueAt(t, phaseOf(t, 90))).toBe(90);
    expect(valueAt(t, phaseOf(t, 100))).toBe(90);
  });
});

describe("withSweep", () => {
  const base = {
    id: "m",
    knobs: [rangeKnob],
    presets: [{ id: "p", name: "P", values: {} }],
    sweep: { periodMs: 1000, targets: [{ key: "a", mode: "wave", min: 1, max: 9 }], presetValues: { a: 1 } },
  };

  test("adds the sweep knobs and an Animated sweep preset", () => {
    const m = withSweep(base);
    expect(m.knobs.map((k) => k.key)).toEqual(["a", "sweep", "sweepSpeed"]);
    const speed = m.knobs.find((k) => k.key === "sweepSpeed");
    expect(speed).toMatchObject({ min: 0.1, max: 4, step: 0.1, default: 1 });
    expect(speed.when({ sweep: false })).toBe(false);
    expect(m.presets.at(-1)).toEqual({ id: "sweep", name: "Animated sweep", values: { a: 1, sweep: true } });
    expect(base.knobs).toHaveLength(1); // not mutated
  });

  test("is idempotent", () => {
    const m = withSweep(withSweep(base));
    expect(m.knobs).toHaveLength(3);
    expect(m.presets).toHaveLength(2);
  });

  test("carries a preset view", () => {
    const m = withSweep({ ...base, sweep: { ...base.sweep, presetView: { cx: 1, cy: 2, zoom: 1 } } });
    expect(m.presets.at(-1).view).toEqual({ cx: 1, cy: 2, zoom: 1 });
  });

  test("leaves modules without a sweep alone", () => {
    const plain = { id: "x", knobs: [rangeKnob], presets: [] };
    expect(withSweep(plain)).toBe(plain);
  });

  test("doesn't add a second sweep preset", () => {
    const own = { ...base, presets: [{ id: "sweep", name: "Animated sweep", values: { a: 3 } }] };
    expect(withSweep(own).presets).toHaveLength(1);
  });

  test("SWEEP_KNOBS and sweptKeys", () => {
    expect(SWEEP_KNOBS.map((k) => k.key)).toEqual(["sweep", "sweepSpeed"]);
    expect(sweptKeys({ sweep: { targets: [{ key: "a" }, { view: "zoom" }] } })).toEqual(["a", "view"]);
  });
});

describe("createSweepDriver", () => {
  function setup(sweep, { values = {}, view = null, busy = false, done = false, playback = 1 } = {}) {
    const module = withSweep({ id: "m", knobs: [rangeKnob, { key: "r", type: "choice", default: "x", options: [] }], presets: [], sweep });
    let cfg = { values: { a: 0, r: "x", sweep: true, sweepSpeed: 1, ...values }, view };
    let time = 0;
    const state = { busy, done, playback };
    const apply = vi.fn((vals, keys, viewPatch) => {
      cfg = { ...cfg, values: { ...cfg.values, ...vals }, view: viewPatch ? { ...cfg.view, ...viewPatch } : cfg.view };
    });
    const driver = createSweepDriver({
      module,
      getConfig: () => cfg,
      apply,
      isBusy: () => state.busy,
      isDone: () => state.done,
      getPlaybackSpeed: () => state.playback,
      now: () => time,
    });
    const run = (ms, step = 16) => {
      for (let e = 0; e < ms; e += step) {
        time += step;
        driver.tick();
      }
    };
    return {
      driver, apply, state, run,
      cfg: () => cfg,
      setValue: (k, v) => (cfg = { ...cfg, values: { ...cfg.values, [k]: v } }),
      setView: (v) => (cfg = { ...cfg, view: v }),
    };
  }

  const wave = { periodMs: 1000, targets: [{ key: "a", mode: "wave", min: 0, max: 10 }] };

  test("the phase advances with time × playback speed × sweep speed", () => {
    const s = setup(wave);
    s.run(250);
    expect(s.cfg().values.a).toBeCloseTo(5, 0);
    const fast = setup(wave, { values: { sweepSpeed: 2 } });
    fast.run(250);
    expect(fast.cfg().values.a).toBeCloseTo(10, 0);
    const slowPlay = setup(wave, { playback: 0.5 });
    slowPlay.run(500);
    expect(slowPlay.cfg().values.a).toBeCloseTo(5, 0);
  });

  test("only swept keys are reported as changed", () => {
    const s = setup(wave);
    s.run(100);
    for (const [, keys] of s.apply.mock.calls) expect(keys).toEqual(["a"]);
  });

  test("nothing is applied while the module is busy, and time spent busy is not caught up", () => {
    const s = setup(wave, { busy: true });
    s.run(500);
    expect(s.apply).not.toHaveBeenCalled();
    s.state.busy = false;
    s.run(32);
    expect(s.cfg().values.a).toBeLessThan(1);
  });

  test("minIntervalMs throttles changes", () => {
    const s = setup({ ...wave, periodMs: 10000, minIntervalMs: 200 });
    s.run(1000);
    expect(s.apply.mock.calls.length).toBeLessThanOrEqual(5);
    expect(s.apply.mock.calls.length).toBeGreaterThanOrEqual(4);
  });

  test("a long gap between ticks (paused) doesn't jump the phase", () => {
    const s = setup(wave);
    s.run(16);
    const before = s.cfg().values.a;
    s.run(5000, 5000); // one tick after 5 s
    expect(Math.abs(s.cfg().values.a - before)).toBeLessThan(1.1);
  });

  test("after the user moves a swept knob, the sweep continues from there", () => {
    const s = setup(wave);
    s.run(100);
    s.setValue("a", 9);
    s.run(16);
    expect(Math.abs(s.cfg().values.a - 9)).toBeLessThan(0.5);
  });

  test("run sweeps wait for the run to finish and stay on it for holdMs", () => {
    const s = setup({ kind: "run", holdMs: 1500, targets: [{ key: "r", mode: "steps", list: ["x", "y", "z"] }] });
    s.run(3000);
    expect(s.apply).not.toHaveBeenCalled(); // not done
    s.state.done = true;
    s.run(1000);
    expect(s.apply).not.toHaveBeenCalled(); // holding
    s.run(600);
    expect(s.apply).toHaveBeenCalledTimes(1);
    expect(s.cfg().values.r).toBe("y");
    // A new run starts: the module is no longer done, so nothing changes until it is.
    s.state.done = false;
    s.run(2000);
    expect(s.apply).toHaveBeenCalledTimes(1);
    s.state.done = true;
    s.run(1600);
    expect(s.cfg().values.r).toBe("z");
    s.run(1600);
    expect(s.cfg().values.r).toBe("x"); // wraps around the list
  });

  test("a zoom target writes view.zoom and reports the view as changed", () => {
    const s = setup({ periodMs: 1000, targets: [{ view: "zoom", mode: "log", min: 1, max: 100 }] }, { view: { cx: 0.3, cy: 0, zoom: 1 } });
    s.run(250);
    const [, keys, patch] = s.apply.mock.calls.at(-1);
    expect(keys).toEqual(["view"]);
    expect(patch.zoom).toBeGreaterThan(1);
    expect(s.cfg().view.cx).toBe(0.3); // the pan centre is never touched
  });

  test("after the user zooms, a zoom sweep continues from their zoom", () => {
    const s = setup({ periodMs: 10000, targets: [{ view: "zoom", mode: "log", min: 1, max: 10000 }] }, { view: { cx: 0, cy: 0, zoom: 1 } });
    s.run(500);
    s.setView({ cx: 0.1, cy: 0, zoom: 500 });
    s.run(16);
    expect(s.cfg().view.zoom / 500).toBeGreaterThan(0.9);
    expect(s.cfg().view.zoom / 500).toBeLessThan(1.1);
    expect(s.cfg().view.cx).toBe(0.1);
  });

  test("the sweep starts from the current value, without a jump", () => {
    const s = setup(wave, { values: { a: 7 } });
    s.run(16);
    expect(Math.abs(s.cfg().values.a - 7)).toBeLessThan(0.5);
  });
});
