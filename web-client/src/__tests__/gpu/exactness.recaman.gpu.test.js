// SC-016 / FR-035: the GPU Recamán instance holds exactly the sequence and the arc layout the kernel and the processor path give,
// and draws the arcs where that layout puts them.
import { afterEach, describe, expect, test } from "vitest";
import recamanModule from "../../studio/visualizations/recaman/index.js";
import { recaman } from "../../studio/visualizations/recaman/kernel.js";
import { configFor, withSweep, runGpu, runProcessor, finish, imageDiff, lose, restore } from "./gpuHarness.js";

const module = withSweep(recamanModule);
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

/** The processor path's layout, written out again from the kernel's sequence. */
function layoutOf(config, shown, w, h) {
  const seq = recaman(config.values.terms);
  const { arcStyle } = config.values;
  let max = 1;
  for (let i = 0; i < shown; i++) if (seq[i] > max) max = seq[i];
  const sx = (w * 0.96) / max;
  const flat = arcStyle === "ellipse" ? 0.5 : 1;
  const out = [];
  for (let n = 1; n < shown; n++) {
    const a = seq[n - 1], b = seq[n];
    const r = (Math.abs(b - a) / 2) * sx;
    out.push({ n, cx: w * 0.02 + ((a + b) / 2) * sx, cy: h / 2, rx: r, ry: r * flat, above: arcStyle === "semicircle" ? true : n % 2 === 1 });
  }
  return out;
}

function pixels(inst, w, h) {
  const data = inst.__debug.gpu.readback({ w, h, fbo: null }, new Uint8Array(w * h * 4));
  const at = (x, y) => {
    const i = ((h - 1 - Math.round(y)) * w + Math.round(x)) * 4;
    return [data[i], data[i + 1], data[i + 2]];
  };
  return { data, at };
}
function ink(data) {
  let lit = 0;
  let brightness = 0;
  for (let i = 0; i < data.length; i += 4) {
    if (data[i] === 15 && data[i + 1] === 15 && data[i + 2] === 18) continue;
    lit++;
    brightness += data[i] + data[i + 1] + data[i + 2];
  }
  return { lit, mean: lit ? brightness / lit : 0 };
}
const canvasData = (canvas) => canvas.getContext("2d", { willReadFrequently: true }).getImageData(0, 0, canvas.width, canvas.height).data;

describe("the sequence and the layout equal the kernel's", () => {
  test.each([2, 3, 10, 80, 600, 2000])("%i terms", (terms) => {
    const config = configFor(module, "classic", 1, { terms });
    const { inst } = gpuRun(config, { steps: terms });
    expect(inst.path).toBe("gpu");
    const s = inst.__debug.readState();
    expect(s.seq).toEqual(recaman(terms));
    expect(s.shown).toBe(terms);
    expect(s.arcs).toEqual(layoutOf(config, terms, 320, 240));
  });

  test.each(PRESETS)("preset %s, stepping one term at a time", (preset) => {
    const config = configFor(module, preset, 1);
    const { inst } = gpuRun(config);
    expect(inst.__debug.readState().shown).toBe(1);
    for (let i = 1; i <= config.values.terms + 5; i++) {
      inst.step();
      const s = inst.__debug.readState();
      expect(s.shown).toBe(Math.min(i + 1, config.values.terms));
    }
    expect(inst.__debug.readState().arcs).toEqual(layoutOf(config, config.values.terms, 320, 240));
  });

  test.each([["alternating"], ["semicircle"], ["ellipse"]])("arc style %s", (arcStyle) => {
    const config = configFor(module, "classic", 1, { arcStyle });
    const { inst } = gpuRun(config, { steps: 80 });
    expect(inst.__debug.readState().arcs).toEqual(layoutOf(config, 80, 320, 240));
  });
});

describe("it draws the arcs where the layout puts them", () => {
  test.each([["alternating"], ["semicircle"], ["ellipse"]])("%s: the top or bottom of arcs nothing else crosses is lit in their palette color", (arcStyle) => {
    const config = configFor(module, "classic", 1, { arcStyle, lineWidth: 3 });
    const r = gpuRun(config, { steps: 80, size: [800, 400] });
    const { at } = pixels(r.inst, 800, 400);
    const lut = r.handle.ctx.palette(config.values.palette);
    const arcs = layoutOf(config, 80, 800, 400);
    // How far a point is from another arc's outline (first-order distance to its ellipse, on its own side of the axis).
    const distance = (p, o) => {
      const dy = p[1] - o.cy;
      if ((o.above ? -dy : dy) < -2) return Infinity;
      const q = Math.hypot((p[0] - o.cx) / o.rx, dy / o.ry);
      return Math.abs(q - 1) * Math.min(o.rx, o.ry);
    };
    let checked = 0;
    let right = 0;
    for (const a of arcs) {
      if (a.rx < 12) continue;
      const apex = [a.cx, a.cy + (a.above ? -a.ry : a.ry)];
      if (arcs.some((o) => o !== a && distance(apex, o) < 6)) continue; // another stroke would show there
      const k = Math.round((a.n / 80) * 255) * 3;
      const want = [lut[k], lut[k + 1], lut[k + 2]];
      checked++;
      let best = BG;
      for (let dy = -1; dy <= 1; dy++) for (let dx = -1; dx <= 1; dx++) {
        const c = at(apex[0] + dx, apex[1] + dy);
        if (c[0] + c[1] + c[2] > best[0] + best[1] + best[2]) best = c;
      }
      if (best.every((v, j) => Math.abs(v - want[j]) <= 6)) right++;
    }
    expect(checked, "arcs clear of every other arc at their apex").toBeGreaterThanOrEqual(2);
    expect(right / checked, `${right} of ${checked} apexes have the arc's own colour`).toBeGreaterThan(0.9);
  });

  test("'All above' leaves the lower half empty; 'Alternating' uses both", () => {
    const above = gpuRun(configFor(module, "classic", 1, { arcStyle: "semicircle" }), { steps: 80, size: [800, 400] });
    const both = gpuRun(configFor(module, "classic", 1, { arcStyle: "alternating" }), { steps: 80, size: [800, 400] });
    const lowerInk = (r) => {
      const { data } = pixels(r.inst, 800, 400);
      let n = 0;
      for (let y = 204; y < 400; y++) for (let x = 0; x < 800; x++) {
        const i = ((400 - 1 - y) * 800 + x) * 4;
        if (!(data[i] === 15 && data[i + 1] === 15 && data[i + 2] === 18)) n++;
      }
      return n;
    };
    expect(lowerInk(above)).toBe(0);
    expect(lowerInk(both)).toBeGreaterThan(200);
  });

  test("the line width setting changes how thick the arcs are: the ink is in proportion", () => {
    const total = (width) => {
      const { data } = pixels(gpuRun(configFor(module, "classic", 1, { lineWidth: width }), { steps: 80, size: [800, 400] }).inst, 800, 400);
      let sum = 0;
      for (let i = 0; i < data.length; i += 4) sum += Math.max(0, data[i] + data[i + 1] + data[i + 2] - (BG[0] + BG[1] + BG[2]));
      return sum;
    };
    const one = total(1);
    expect(total(2) / one).toBeGreaterThan(1.7);
    expect(total(2) / one).toBeLessThan(2.3);
    expect(total(4) / one).toBeGreaterThan(3.2);
    expect(total(4) / one).toBeLessThan(4.6);
    expect(total(0.5) / one, "half a pixel of line carries about half the ink").toBeGreaterThan(0.4);
    expect(total(0.5) / one).toBeLessThan(0.65);
  });

  test.each(PRESETS.flatMap((p) => [["alternating"], ["ellipse"]].map(([style]) => [p, style])))("preset %s, %s: imageDiff at most 12 and the ink matches the processor's", (preset, arcStyle) => {
    const config = configFor(module, preset, 1, { arcStyle });
    const g = gpuRun(config, { steps: config.values.terms, size: [640, 320] });
    const p = processorRun(config, { steps: config.values.terms, size: [640, 320] });
    const diff = imageDiff(g.canvas, p.canvas);
    expect(diff, `imageDiff ${diff.toFixed(2)}`).toBeLessThanOrEqual(12);
    const mine = ink(pixels(g.inst, 640, 320).data);
    const theirs = ink(canvasData(p.canvas));
    expect(mine.lit / theirs.lit, `lit pixels: gpu ${mine.lit}, processor ${theirs.lit}`).toBeGreaterThan(0.85);
    expect(mine.lit / theirs.lit).toBeLessThan(1.18);
    expect(mine.mean / theirs.mean, `brightness: gpu ${mine.mean.toFixed(0)}, processor ${theirs.mean.toFixed(0)}`).toBeGreaterThan(0.85);
    expect(mine.mean / theirs.mean).toBeLessThan(1.15);
  });
});

describe("changing a setting", () => {
  test("a different number of terms recomputes the sequence and keeps what was shown, up to the new length", () => {
    const config = configFor(module, "classic", 1);
    const { inst } = gpuRun(config, { steps: 60 });
    inst.update({ ...config, values: { ...config.values, terms: 200 } });
    let s = inst.__debug.readState();
    expect(s.seq).toEqual(recaman(200));
    expect(s.shown).toBe(61);
    inst.update({ ...config, values: { ...config.values, terms: 30 } });
    s = inst.__debug.readState();
    expect(s.seq).toHaveLength(30);
    expect(s.shown).toBe(30);
  });

  test("reset shows one term again", () => {
    const { inst } = gpuRun(configFor(module, "classic", 1), { steps: 40 });
    inst.reset();
    expect(inst.__debug.readState().shown).toBe(1);
  });
});

describe("leaving and losing the context", () => {
  test("opening and leaving 30 times works every time", () => {
    for (let i = 0; i < 30; i++) {
      const r = runGpu(module, configFor(module, "classic", 1), { steps: 5 });
      expect(r.inst.path, `open #${i + 1}`).toBe("gpu");
      finish(r);
    }
  });

  test("a lost context that comes back draws the same arcs again (the sequence is on the processor)", async () => {
    const r = gpuRun(configFor(module, "dense", 1), { steps: 600, size: [640, 320] });
    const before = ink(pixels(r.inst, 640, 320).data).lit;
    await lose(r.canvas, r.inst.__debug.gpu.gl);
    await new Promise((res) => setTimeout(res, 30));
    expect(() => {
      r.inst.step();
      r.inst.render();
    }).not.toThrow();
    await restore(r.canvas);
    await new Promise((res) => setTimeout(res, 50));
    const after = ink(pixels(r.inst, 640, 320).data).lit;
    expect(after / before, `lit pixels before ${before}, after ${after}`).toBeGreaterThan(0.95);
  });
});
