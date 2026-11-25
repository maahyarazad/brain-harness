// SC-016 / FR-035 (the "looks the same" group): the GPU reaction–diffusion tracks the kernel closely and draws the same picture.
// The processor path runs the kernel in a worker, so the oracle here is the kernel itself plus the processor's own painting rule.
import { afterEach, describe, expect, test } from "vitest";
import grayScott from "../../studio/visualizations/grayScott/index.js";
import { seedFields, grayScottSteps } from "../../studio/visualizations/grayScott/kernel.js";
import { fitAspect } from "../../studio/visualizations/_shared/instance.js";
import { createRng } from "../../studio/core/rng.js";
import { configFor, withSweep, runGpu, finish, imageDiff, makeCanvas, lose, restore } from "./gpuHarness.js";

const module = withSweep(grayScott);
const runs = [];
afterEach(() => {
  runs.splice(0).forEach(finish);
});
const start = (config, options) => {
  const r = runGpu(module, config, options);
  runs.push(r);
  return r;
};

const PRESETS = module.presets.filter((p) => p.id !== "sweep").map((p) => p.id);

/** The kernel from the same start: `iterations` Euler steps. */
function kernelAfter(config, iterations) {
  const W = Number(config.values.size);
  const H = Math.round(W * 0.75);
  const { u, v } = seedFields(W, H, createRng(config.seed));
  const { feed, kill, du, dv } = config.values;
  return grayScottSteps({ u, v, w: W, h: H, feed, kill, du, dv, steps: iterations });
}

function compare(gpuState, ref) {
  let sum = 0;
  let max = 0;
  const n = ref.u.length;
  for (let i = 0; i < n; i++) {
    const d = Math.max(Math.abs(gpuState.u[i] - ref.u[i]), Math.abs(gpuState.v[i] - ref.v[i]));
    sum += d;
    if (d > max) max = d;
  }
  return { mean: sum / n, max };
}

/** What the processor path puts on screen for fields u, v: the same palette lookup and the same box. */
function referencePicture(config, v, w, h, canvasW, canvasH) {
  const lut = startLut(config.values.palette);
  const off = makeCanvas(w, h);
  const og = off.getContext("2d");
  const img = og.createImageData(w, h);
  for (let i = 0; i < v.length; i++) {
    const t = Math.min(1, Math.max(0, (v[i] - 0.02) * 3));
    const k = Math.round(t * 255) * 3;
    img.data[i * 4] = lut[k];
    img.data[i * 4 + 1] = lut[k + 1];
    img.data[i * 4 + 2] = lut[k + 2];
    img.data[i * 4 + 3] = 255;
  }
  og.putImageData(img, 0, 0);
  const out = makeCanvas(canvasW, canvasH);
  const g = out.getContext("2d");
  g.fillStyle = "#0f0f12";
  g.fillRect(0, 0, canvasW, canvasH);
  g.imageSmoothingEnabled = false;
  const b = fitAspect(canvasW, canvasH, w / h);
  g.drawImage(off, b.x, b.y, b.w, b.h);
  return out;
}
let lutCache;
function startLut(name) {
  lutCache ??= {};
  return (lutCache[name] ??= runs[0] ? runs[0].handle.ctx.palette(name) : null);
}

describe("the first steps follow the kernel", () => {
  test.each(PRESETS)("preset %s: 5 steps (40 iterations) within 1e-3 mean and 1e-2 max", (preset) => {
    const config = configFor(module, preset, 7);
    const { inst } = start(config);
    expect(inst.path).toBe("gpu");
    for (let s = 0; s < 5; s++) inst.step();
    const got = inst.__debug.readState();
    expect(got.iterations).toBe(40);
    const { mean, max } = compare(got, kernelAfter(config, 40));
    expect(mean, `mean difference ${mean}`).toBeLessThan(1e-3);
    expect(max, `max difference ${max}`).toBeLessThan(1e-2);
  });

  test("the start itself is the kernel's seed fields (same seed, same squares)", () => {
    const config = configFor(module, "coral", 11);
    const { inst } = start(config);
    const got = inst.__debug.readState();
    const ref = kernelAfter(config, 0);
    expect(compare(got, ref).max).toBeLessThan(1e-7);
    const other = start(configFor(module, "coral", 12)).inst.__debug.readState();
    expect(compare(other, ref).max).toBeGreaterThan(0.1);
  });

  test.each([["128 x 96", "128"], ["384 x 288", "384"]])("grid %s", (_n, size) => {
    const config = configFor(module, "mitosis", 3, { size });
    const { inst } = start(config);
    for (let s = 0; s < 3; s++) inst.step();
    const { mean, max } = compare(inst.__debug.readState(), kernelAfter(config, 24));
    expect(mean).toBeLessThan(1e-3);
    expect(max).toBeLessThan(1e-2);
  });
});

describe("after 200 steps it draws the same picture", () => {
  test.each(PRESETS)("preset %s: imageDiff at most 12", (preset) => {
    const config = configFor(module, preset, 5, { size: "128" });
    const { inst, canvas } = start(config);
    for (let s = 0; s < 200; s++) inst.step();
    inst.render();
    const state = inst.__debug.readState();
    // The picture of the kernel's own fields after the same number of iterations.
    const ref = kernelAfter(config, 1600);
    const reference = referencePicture(config, ref.v, 128, 96, canvas.width, canvas.height);
    const diff = imageDiff(canvas, reference);
    expect(diff, `imageDiff ${diff.toFixed(2)} (mean V difference ${compare(state, ref).mean.toFixed(4)})`).toBeLessThanOrEqual(12);
  }, 120000);
});

describe("painting", () => {
  test("dragging sets a disc to v = 0.5, u = 0.25, the same cells as the processor path", () => {
    const config = configFor(module, "coral", 4, { size: "128" });
    const { inst, canvas } = start(config);
    const b = fitAspect(canvas.width, canvas.height, 128 / 96);
    const at = (cx, cy) => ({ x: b.x + ((cx + 0.5) / 128) * b.w, y: b.y + ((cy + 0.5) / 96) * b.h });
    inst.pointer({ type: "down", button: 0, ...at(40, 30) });
    inst.pointer({ type: "up", button: 0, ...at(40, 30) });
    const s = inst.__debug.readState();
    const painted = [];
    for (let i = 0; i < s.v.length; i++) if (s.v[i] === 0.5 && s.u[i] === 0.25) painted.push(i);
    const expected = [];
    for (let y = -3; y <= 3; y++) for (let x = -3; x <= 3; x++) if (x * x + y * y <= 9) expected.push((30 + y) * 128 + (40 + x));
    expect(painted.filter((i) => expected.includes(i)).length).toBe(expected.length);
    expect(expected.length).toBe(29);
  });

  test("a paint near an edge wraps round, as the kernel does", () => {
    const config = configFor(module, "coral", 4, { size: "128" });
    const { inst, canvas } = start(config);
    const b = fitAspect(canvas.width, canvas.height, 128 / 96);
    inst.pointer({ type: "down", button: 0, x: b.x + 0.5, y: b.y + 0.5 }); // cell (0, 0)
    inst.pointer({ type: "up", button: 0, x: b.x + 0.5, y: b.y + 0.5 });
    const s = inst.__debug.readState();
    expect(s.v[0]).toBe(0.5);
    expect(s.v[95 * 128 + 127]).toBe(0.5); // the opposite corner: (-1, -1) wrapped
  });

  test("moving without pressing paints nothing", () => {
    const config = configFor(module, "coral", 4, { size: "128" });
    const { inst } = start(config);
    const before = inst.__debug.readState().v.slice();
    inst.pointer({ type: "move", x: 100, y: 100 });
    expect(inst.__debug.readState().v).toEqual(before);
  });
});

describe("changing a setting", () => {
  test("feed and kill take effect from the next step without restarting", () => {
    const config = configFor(module, "coral", 6, { size: "128" });
    const { inst } = start(config);
    for (let s = 0; s < 3; s++) inst.step();
    const next = { ...config, values: { ...config.values, feed: 0.03, kill: 0.057 } };
    inst.update(next, ["feed", "kill"]);
    expect(inst.__debug.readState().iterations).toBe(24); // not restarted
    inst.step();
    const got = inst.__debug.readState();
    expect(got.iterations).toBe(32);
    // The kernel with the first 24 iterations at the old rates and 8 at the new ones.
    const a = kernelAfter(config, 24);
    const ref = grayScottSteps({ u: a.u, v: a.v, w: 128, h: 96, feed: 0.03, kill: 0.057, du: config.values.du, dv: config.values.dv, steps: 8 });
    expect(compare(got, ref).max).toBeLessThan(1e-2);
  });

  test("a different grid size starts over", () => {
    const config = configFor(module, "coral", 6, { size: "128" });
    const { inst } = start(config);
    for (let s = 0; s < 3; s++) inst.step();
    inst.update({ ...config, values: { ...config.values, size: "256" } }, ["size"]);
    const s = inst.__debug.readState();
    expect([s.w, s.h, s.iterations]).toEqual([256, 192, 0]);
  });
});

describe("leaving and losing the context", () => {
  test("opening and leaving 30 times works every time", () => {
    for (let i = 0; i < 30; i++) {
      const r = runGpu(module, configFor(module, "coral", 1, { size: "128" }), { steps: 1 });
      expect(r.inst.path, `open #${i + 1}`).toBe("gpu");
      finish(r);
    }
  });

  test("a lost context that comes back restarts from the opening fields with a notice", async () => {
    const notices = [];
    const config = configFor(module, "coral", 6, { size: "128" });
    const { inst, canvas } = start(config, { ctxOptions: { onNotice: (n) => notices.push(n) } });
    for (let s = 0; s < 5; s++) inst.step();
    await lose(canvas, inst.__debug.gpu.gl);
    await new Promise((r) => setTimeout(r, 30));
    expect(() => {
      inst.step();
      inst.render();
    }).not.toThrow();
    await restore(canvas);
    await new Promise((r) => setTimeout(r, 50));
    expect(notices.some((n) => /graphics card was reset/i.test(n))).toBe(true);
    expect(compare(inst.__debug.readState(), kernelAfter(config, 0)).max).toBeLessThan(1e-7);
    inst.step();
    expect(compare(inst.__debug.readState(), kernelAfter(config, 8)).max).toBeLessThan(1e-2);
  });
});
