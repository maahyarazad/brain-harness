// SC-016 / FR-035 (the "looks the same" group): the GPU Fourier epicycles keep the kernel's circles and trace exactly
// (the transform is the same code) and draw them as the processor path does.
import { afterEach, describe, expect, test } from "vitest";
import fourier from "../../studio/visualizations/fourier/index.js";
import { resampleByArcLength, dft, epicyclePoint } from "../../studio/visualizations/fourier/kernel.js";
import { SHAPES } from "../../studio/visualizations/fourier/shapes.js";
import { configFor, withSweep, runGpu, runProcessor, finish, imageDiff, lose, restore } from "./gpuHarness.js";

const module = withSweep(fourier);
const SAMPLES = 512;
const runs = [];
afterEach(() => runs.splice(0).forEach(finish));
const gpuRun = (config, options) => {
  const r = runGpu(module, config, options);
  runs.push(r);
  return r;
};
const processorRun = (config, options) => {
  const r = runProcessor(module, config, options);
  runs.push(r);
  return r;
};

const PRESETS = module.presets.filter((p) => p.id !== "sweep").map((p) => p.id);
const BG = [15, 15, 18];

/** The kernel's own run: coefficients, and the trace after `steps` steps. */
function oracle(config, steps) {
  const outline = resampleByArcLength(SHAPES[config.values.shape](), SAMPLES);
  const coeffs = dft(outline);
  const path = [];
  let step = 0;
  for (let i = 0; i < steps; i++) {
    path.push(epicyclePoint(coeffs, config.values.circles, (2 * Math.PI * step) / SAMPLES));
    step++;
    if (step > SAMPLES) {
      step = 0;
      path.length = 0;
    }
  }
  return { outline, coeffs, path, step };
}

function ink(canvasOrPixels, w, h, gpuInst) {
  let data;
  if (gpuInst) data = gpuInst.__debug.gpu.readback({ w, h, fbo: null }, new Uint8Array(w * h * 4));
  else data = canvasOrPixels.getContext("2d", { willReadFrequently: true }).getImageData(0, 0, w, h).data;
  let lit = 0;
  let brightness = 0;
  for (let i = 0; i < data.length; i += 4) {
    if (data[i] === 15 && data[i + 1] === 15 && data[i + 2] === 18) continue;
    lit++;
    brightness += data[i] + data[i + 1] + data[i + 2];
  }
  return { lit, mean: lit ? brightness / lit : 0, data };
}

describe("the circles and the trace equal the kernel's", () => {
  test.each(PRESETS)("preset %s: 300 steps", (preset) => {
    const config = configFor(module, preset, 1);
    const { inst } = gpuRun(config, { steps: 300 });
    expect(inst.path).toBe("gpu");
    const got = inst.__debug.readState();
    const want = oracle(config, 300);
    expect(got.coeffs).toBe(want.coeffs.length);
    expect(got.path).toEqual(want.path);
    expect(got.step).toBe(want.step);
  });

  test("the chain of circles is the partial sums of the coefficients at the current time", () => {
    const config = configFor(module, "sharp", 1);
    const { inst } = gpuRun(config, { steps: 77 });
    const want = oracle(config, 77);
    const chain = inst.__debug.readState().chain;
    expect(chain).toHaveLength(Math.min(config.values.circles, want.coeffs.length));
    const t = (2 * Math.PI * 77) / SAMPLES;
    let x = 0, y = 0;
    chain.forEach((c, i) => {
      expect(c.x).toBeCloseTo(x, 12);
      expect(c.y).toBeCloseTo(y, 12);
      expect(c.r).toBeCloseTo(want.coeffs[i].amp, 12);
      x += want.coeffs[i].amp * Math.cos(want.coeffs[i].freq * t + want.coeffs[i].phase);
      y += want.coeffs[i].amp * Math.sin(want.coeffs[i].freq * t + want.coeffs[i].phase);
    });
    // And the last point of the chain is the newest trace point.
    expect(inst.__debug.readState().path.at(-1)[0]).toBeCloseTo(want.path.at(-1)[0], 12);
  });

  test("the trace restarts after a full turn", () => {
    const config = configFor(module, "rough", 1);
    const { inst } = gpuRun(config, { steps: SAMPLES + 1 });
    expect(inst.__debug.readState().step).toBe(0);
    expect(inst.__debug.readState().path).toHaveLength(0);
  });
});

describe("it draws what the processor path draws", () => {
  test.each(PRESETS)("preset %s: imageDiff at most 12 after 200 steps", (preset) => {
    const config = configFor(module, preset, 1);
    const g = gpuRun(config, { steps: 200 });
    const p = processorRun(config, { steps: 200 });
    const diff = imageDiff(g.canvas, p.canvas);
    expect(diff, `imageDiff ${diff.toFixed(2)}`).toBeLessThanOrEqual(12);
  });

  test.each([["rough", true], ["sharp", true], ["square", false]])("preset %s, circles shown: %s: the amount and brightness of the ink match", (preset, showCircles) => {
    const config = configFor(module, preset, 1, { showCircles });
    const g = gpuRun(config, { steps: 150, size: [640, 480] });
    const p = processorRun(config, { steps: 150, size: [640, 480] });
    const mine = ink(null, 640, 480, g.inst);
    const theirs = ink(p.canvas, 640, 480, null);
    expect(mine.lit / theirs.lit, `lit pixels: gpu ${mine.lit}, processor ${theirs.lit}`).toBeGreaterThan(0.85);
    expect(mine.lit / theirs.lit).toBeLessThan(1.18);
    expect(mine.mean / theirs.mean, `mean brightness: gpu ${mine.mean.toFixed(0)}, processor ${theirs.mean.toFixed(0)}`).toBeGreaterThan(0.85);
    expect(mine.mean / theirs.mean).toBeLessThan(1.18);
  });

  test("turning the circles off removes their rings and nothing else", () => {
    const on = gpuRun(configFor(module, "sharp", 1, { showCircles: true }), { steps: 100, size: [640, 480] });
    const off = gpuRun(configFor(module, "sharp", 1, { showCircles: false }), { steps: 100, size: [640, 480] });
    expect(ink(null, 640, 480, off.inst).lit).toBeLessThan(ink(null, 640, 480, on.inst).lit);
    expect(off.inst.__debug.readState().path).toEqual(on.inst.__debug.readState().path);
  });

  test("the trace is in the palette color at full strength", () => {
    const config = configFor(module, "rough", 1, { showCircles: false });
    const r = gpuRun(config, { steps: 250, size: [640, 480] });
    const { path } = r.inst.__debug.readState();
    const lut = r.handle.ctx.palette(config.values.palette);
    const k = Math.round(0.85 * 255) * 3;
    const want = [lut[k], lut[k + 1], lut[k + 2]];
    const s = Math.min(640, 480) * 0.42;
    const px = r.inst.__debug.gpu.readback({ w: 640, h: 480, fbo: null }, new Uint8Array(640 * 480 * 4));
    let strong = 0;
    let n = 0;
    for (let i = 10; i < path.length - 10; i += 9) {
      const x = Math.round(320 + path[i][0] * s);
      const y = Math.round(240 + path[i][1] * s);
      let best = [0, 0, 0];
      for (let dy = -1; dy <= 1; dy++) for (let dx = -1; dx <= 1; dx++) {
        const o = ((480 - 1 - (y + dy)) * 640 + (x + dx)) * 4;
        const c = [px[o], px[o + 1], px[o + 2]];
        if (c[0] + c[1] + c[2] > best[0] + best[1] + best[2]) best = c;
      }
      n++;
      if (best.every((v, j) => Math.abs(v - want[j]) <= 3)) strong++;
    }
    expect(strong / n, `${strong} of ${n} trace points have the full palette color`).toBeGreaterThan(0.85);
  });
});

describe("the statistics", () => {
  test("it reports how many circles are in use: the setting, or fewer if the outline has fewer", () => {
    const seen = [];
    const config = configFor(module, "rough", 1);
    const { inst } = gpuRun(config, { steps: 3, ctxOptions: { onStats: (st) => seen.push(st) } });
    expect(seen.at(-1)).toMatchObject({ circles: 5 });
    inst.update({ ...config, values: { ...config.values, circles: 40 } }, ["circles"]);
    expect(seen.at(-1)).toMatchObject({ circles: 40 });
    inst.update({ ...config, values: { ...config.values, circles: 512 } }, ["circles"]);
    expect(seen.at(-1).circles).toBe(inst.__debug.readState().coeffs); // never more than the outline has (a square has 512 samples; a heart too)
    const square = gpuRun(configFor(module, "square", 1, { circles: 40 }), { ctxOptions: { onStats: (st) => seen.push(st) } });
    expect(seen.at(-1)).toMatchObject({ circles: 40 });
    expect(square.inst.__debug.readState().chain).toHaveLength(40);
  });
});

describe("your own outline", () => {
  const custom = (extra = {}) => configFor(module, null, 1, { shape: "custom", ...extra });

  test("with no drawing yet, the hint text is shown, as on the processor path", () => {
    const g = gpuRun(custom(), { size: [640, 480] });
    const p = processorRun(custom(), { size: [640, 480] });
    const mine = ink(null, 640, 480, g.inst);
    const theirs = ink(p.canvas, 640, 480, null);
    expect(theirs.lit).toBeGreaterThan(50);
    expect(mine.lit / theirs.lit, `lit pixels: gpu ${mine.lit}, processor ${theirs.lit}`).toBeGreaterThan(0.8);
    expect(mine.lit / theirs.lit).toBeLessThan(1.25);
    expect(imageDiff(g.canvas, p.canvas)).toBeLessThanOrEqual(12);
  });

  test("drawing records, then makes the outline, reports it and starts the trace", () => {
    const inputs = [];
    const r = gpuRun(custom(), { size: [640, 480], ctxOptions: { onInput: (i) => inputs.push(i) } });
    const { inst } = r;
    const pts = Array.from({ length: 60 }, (_, i) => [320 + 120 * Math.cos((i / 60) * 2 * Math.PI), 240 + 120 * Math.sin((i / 60) * 2 * Math.PI)]);
    inst.pointer({ type: "down", button: 0, x: pts[0][0], y: pts[0][1] });
    for (const [x, y] of pts.slice(1)) inst.pointer({ type: "move", x, y });
    expect(inst.__debug.readState().recording).toBe(60);
    expect(ink(null, 640, 480, inst).lit).toBeGreaterThan(300); // the stroke is drawn while recording
    inst.pointer({ type: "up", x: pts.at(-1)[0], y: pts.at(-1)[1] });
    expect(inputs.at(-1).outline.length).toBeGreaterThanOrEqual(10);
    const s = inst.__debug.readState();
    expect(s.recording).toBe(0);
    expect(s.coeffs).toBeGreaterThan(0);
    for (let i = 0; i < 20; i++) inst.step();
    expect(inst.__debug.readState().path).toHaveLength(20);
  });

  test("a stroke that is too short is refused with a notice", () => {
    const notices = [];
    const { inst } = gpuRun(custom(), { ctxOptions: { onNotice: (n) => notices.push(n) } });
    inst.pointer({ type: "down", button: 0, x: 100, y: 100 });
    inst.pointer({ type: "move", x: 105, y: 100 });
    inst.pointer({ type: "up", x: 105, y: 100 });
    expect(notices.some((n) => /longer outline/i.test(n))).toBe(true);
    expect(inst.__debug.readState().coeffs).toBe(0);
  });

  test("drawing does nothing on a built-in outline", () => {
    const { inst } = gpuRun(configFor(module, "rough", 1));
    inst.pointer({ type: "down", button: 0, x: 100, y: 100 });
    expect(inst.__debug.readState().recording).toBe(0);
  });
});

describe("changing a setting", () => {
  test("a different outline restarts; a different number of circles clears the trace; the palette keeps it", () => {
    const config = configFor(module, "rough", 1);
    const { inst } = gpuRun(config, { steps: 50 });
    inst.update({ ...config, values: { ...config.values, palette: "magma" } }, ["palette"]);
    expect(inst.__debug.readState().path).toHaveLength(50);
    inst.update({ ...config, values: { ...config.values, circles: 12 } }, ["circles"]);
    expect(inst.__debug.readState().path).toHaveLength(0);
    inst.step();
    inst.update({ ...config, values: { ...config.values, shape: "star" } }, ["shape"]);
    const s = inst.__debug.readState();
    expect(s.path).toHaveLength(0);
    expect(s.outline[0]).toEqual(resampleByArcLength(SHAPES.star(), SAMPLES)[0]);
  });
});

describe("leaving and losing the context", () => {
  test("opening and leaving 30 times works every time", () => {
    for (let i = 0; i < 30; i++) {
      const r = runGpu(module, configFor(module, "rough", 1), { steps: 2 });
      expect(r.inst.path, `open #${i + 1}`).toBe("gpu");
      finish(r);
    }
  });

  test("a lost context that comes back draws the same picture again (the geometry is kept on the processor)", async () => {
    const config = configFor(module, "sharp", 1);
    const r = gpuRun(config, { steps: 120, size: [640, 480] });
    const before = ink(null, 640, 480, r.inst).lit;
    await lose(r.canvas, r.inst.__debug.gpu.gl);
    await new Promise((res) => setTimeout(res, 30));
    expect(() => {
      r.inst.step();
      r.inst.render();
    }).not.toThrow();
    await restore(r.canvas);
    await new Promise((res) => setTimeout(res, 50));
    const after = ink(null, 640, 480, r.inst).lit;
    expect(after / before, `lit pixels before ${before}, after ${after}`).toBeGreaterThan(0.9);
  });
});
