// Every visualization's "Animated sweep" (specs/004-studio-home-sweep/contracts/sweep.md).
import { CATALOG } from "../../studio/catalog.js";
import { applyPreset, defaultsOf, validateConfig, validateValue } from "../../studio/core/knobs.js";
import { createSweepDriver, sweptKeys, SWEEP_PRESET_ID } from "../../studio/core/sweep.js";
import { createModuleContext } from "../../studio/core/moduleContext.js";
import { installCanvasStub } from "./canvasStub.js";
import { makeCanvas } from "./harness.js";

installCanvasStub();

// Same idea as modules.contract.test.js: kernels run on the main thread here.
const LIGHT_VALUES = {
  dla: { particles: 600 },
  "collatz-coral": { count: 300 },
  "game-of-life": { size: 64 },
  barnsley: { points: 20000 },
  "chaos-game": { points: 20000 },
};

const W = 160;
const H = 120;

function sweepConfig(module) {
  const p = applyPreset(module, SWEEP_PRESET_ID);
  const base = defaultsOf(module);
  return {
    ...base,
    values: { ...p.values, ...LIGHT_VALUES[module.id] },
    input: p.input,
    presetId: SWEEP_PRESET_ID,
    view: p.view ?? base.view,
  };
}

/**
 * Splits a canvas's drawing log into "frames": what the browser could show between
 * two tasks. Marks are pushed before every timer / animation-frame callback.
 */
function withFrameMarks(log, fn) {
  const origTimeout = globalThis.setTimeout;
  const origRaf = globalThis.requestAnimationFrame;
  globalThis.setTimeout = (cb, ms, ...a) => origTimeout(() => (log.push({ op: "|frame|" }), cb(...a)), ms);
  if (origRaf) globalThis.requestAnimationFrame = (cb) => origRaf((t) => (log.push({ op: "|frame|" }), cb(t)));
  return Promise.resolve(fn()).finally(() => {
    globalThis.setTimeout = origTimeout;
    if (origRaf) globalThis.requestAnimationFrame = origRaf;
  });
}

/** Waits until the module has finished all drawing it started (kernels, timers, frames). */
async function settle(handle, inst) {
  for (let i = 0; i < 100; i++) {
    await handle.ctx.idle();
    await new Promise((r) => setTimeout(r, 0));
    if (!(inst.isBusy?.() ?? false)) return;
  }
}

const isClear = (e, w, h) =>
  (e.op === "fillRect" || e.op === "clearRect") && e.args[0] === 0 && e.args[1] === 0 && e.args[2] >= w && e.args[3] >= h;
const isPicture = (e) => e.op === "drawImage" || e.op === "putImageData";

describe.each(CATALOG.map((e) => [e.id, e]))("%s", (id, entry) => {
  let module;
  beforeAll(async () => {
    module = (await entry.load()).default;
  });

  test('offers an "Animated sweep" preset', () => {
    const p = module.presets.find((x) => x.id === SWEEP_PRESET_ID);
    expect(p?.name).toBe("Animated sweep");
  });

  test("the sweep declaration names real knobs with valid ranges", () => {
    if (!module.sweep) {
      // Only Times-table ships its own sweep (its animate/rate knobs).
      expect(id).toBe("times-table");
      return;
    }
    const s = module.sweep;
    expect(["continuous", "run", undefined]).toContain(s.kind);
    if (s.kind !== "run") expect(s.periodMs).toBeGreaterThan(0);
    expect(s.targets.length).toBeGreaterThanOrEqual(1);
    for (const t of s.targets) {
      if (t.view) {
        expect(t.view).toBe("zoom");
        expect(module.defaultView).toBeTruthy();
        expect(t.min).toBeGreaterThan(0);
        continue;
      }
      const knob = module.knobs.find((k) => k.key === t.key);
      expect(knob, `knob ${t.key}`).toBeTruthy();
      expect(["range", "choice", "text"]).toContain(knob.type);
      if (knob.type !== "range") expect(t.mode).toBe("steps");
      if (t.mode === "steps") {
        expect(t.list.length).toBeGreaterThanOrEqual(2);
        for (const v of t.list) expect(validateValue(knob, v)).toMatchObject({ value: v, replaced: false });
      } else {
        expect(t.min).toBeLessThan(t.max);
        for (const v of [t.min, t.max]) expect(validateValue(knob, v).replaced).toBe(false);
        if (t.mode === "log") expect(t.min).toBeGreaterThan(0);
      }
    }
    expect(validateConfig(module, sweepConfig(module)).replaced).toEqual([]);
  });

  test("sweeping runs, changes only swept settings, and writes valid values", async () => {
    if (!module.sweep) return;
    let cfg = sweepConfig(module);
    const canvas = makeCanvas(W, H);
    const handle = createModuleContext({ seed: cfg.seed, dpr: 1, onView: (view) => (cfg = { ...cfg, view }) });
    const inst = module.create(canvas, cfg, handle.ctx);
    await handle.ctx.idle();
    if (module.sweep.kind === "run") expect(typeof inst.isDone()).toBe("boolean");

    const swept = new Set(sweptKeys(module));
    const knobs = Object.fromEntries(module.knobs.map((k) => [k.key, k]));
    let time = 0;
    let applied = 0;
    const driver = createSweepDriver({
      module,
      getConfig: () => cfg,
      isBusy: () => inst.isBusy?.() ?? false,
      isDone: () => inst.isDone?.() ?? false,
      now: () => time,
      apply: (vals, keys, viewPatch) => {
        applied++;
        for (const k of keys) expect(swept.has(k)).toBe(true);
        for (const [k, v] of Object.entries(vals)) expect(validateValue(knobs[k], v).replaced).toBe(false);
        cfg = { ...cfg, values: { ...cfg.values, ...vals }, view: viewPatch ? { ...cfg.view, ...viewPatch } : cfg.view };
        inst.update(cfg, keys, { sweep: true });
      },
    });
    for (let i = 0; i < 200; i++) {
      time += 50;
      if (module.animated) inst.step();
      driver.tick();
      if (i % 10 === 9) await handle.ctx.idle();
    }
    await settle(handle, inst);
    if (module.sweep.kind !== "run") expect(applied).toBeGreaterThan(0);
    expect(inst.isBusy?.() ?? false).toBe(false);
    inst.destroy();
    handle.dispose();
  });

  test("a sweep step never shows a blank or half-drawn picture", async () => {
    // Animated modules redraw every frame anyway; this is about still pictures.
    if (!module.sweep || module.animated || module.sweep.kind === "run") return;
    let cfg = sweepConfig(module);
    const canvas = makeCanvas(W, H);
    const handle = createModuleContext({ seed: cfg.seed, dpr: 1 });
    const inst = module.create(canvas, cfg, handle.ctx);
    await settle(handle, inst);
    const log = canvas.getContext("2d").log;

    let time = 0;
    let applied = 0;
    const driver = createSweepDriver({
      module,
      getConfig: () => cfg,
      isBusy: () => inst.isBusy?.() ?? false,
      now: () => time,
      apply: (vals, keys, viewPatch) => {
        applied++;
        cfg = { ...cfg, values: { ...cfg.values, ...vals }, view: viewPatch ? { ...cfg.view, ...viewPatch } : cfg.view };
        inst.update(cfg, keys, { sweep: true });
        log.push({ op: "|frame|" }); // what update() drew synchronously is one frame
      },
    });
    driver.tick();
    log.length = 0;
    await withFrameMarks(log, async () => {
      // Tick (100 ms at most per tick) until the sweep applies one change.
      for (let i = 0; i < 2000 && !applied; i++) {
        time += 100;
        driver.tick();
      }
      await settle(handle, inst);
    });
    expect(applied).toBe(1);

    const frames = [[]];
    for (const e of log) {
      if (e.op === "|frame|") frames.push([]);
      else frames.at(-1).push(e);
    }
    const drawn = frames.filter((f) => f.some((e) => isPicture(e) || isClear(e, W, H)));
    // At most: the old picture mapped onto the new view, then the new picture.
    expect(drawn.length).toBeLessThanOrEqual(2);
    for (const f of drawn) {
      const lastClear = f.findLastIndex((e) => isClear(e, W, H));
      const lastPicture = f.findLastIndex(isPicture);
      expect(lastPicture, "a frame ends on a cleared canvas").toBeGreaterThan(lastClear);
    }
    inst.destroy();
    handle.dispose();
  });
});
