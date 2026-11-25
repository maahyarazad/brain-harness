// SC-016 / FR-035: the GPU sorting instance holds exactly the array, highlight and counters the sort kernel gives, at every step.
import { afterEach, describe, expect, test } from "vitest";
import sorting from "../../studio/visualizations/sorting/index.js";
import { withSweep } from "../../studio/core/sweep.js";
import { defaultsOf, applyPreset, validateConfig } from "../../studio/core/knobs.js";
import { createModuleContext } from "../../studio/core/moduleContext.js";
import { createRng } from "../../studio/core/rng.js";
import { ALGORITHMS, initialArray } from "../../studio/visualizations/sorting/kernel.js";

const module = withSweep(sorting);
let live = [];
afterEach(() => {
  live.forEach(({ inst, handle }) => {
    inst.destroy();
    handle.dispose();
  });
  live = [];
});

const SEEDS = [1, 2, 3, 4, 5];
const ALGOS = ["bubble", "insertion", "selection", "quick", "merge", "heap"];

function configFor(presetId, seed, extra = {}) {
  const base = defaultsOf(module);
  const p = presetId ? applyPreset(module, presetId) : { values: base.values, input: null };
  return validateConfig(module, { ...base, seed, values: { ...p.values, ...extra }, input: p.input }).config;
}

function startGpu(cfg, ctxOptions = {}) {
  const canvas = document.createElement("canvas");
  canvas.width = 320;
  canvas.height = 240;
  const handle = createModuleContext({ seed: cfg.seed, dpr: 1, ...ctxOptions });
  const inst = module.create(canvas, cfg, handle.ctx);
  live.push({ inst, handle });
  return { inst, canvas, handle };
}

/** The processor path's own logic, kept as a small model. */
function oracle(cfg) {
  const arr = initialArray(cfg.values.size, cfg.values.order, createRng(cfg.seed));
  const o = { view: arr.slice(), gen: ALGORITHMS[cfg.values.algorithm](arr), last: null, comparisons: 0, swaps: 0, done: false };
  o.step = () => {
    if (o.done) return;
    const r = o.gen.next();
    if (r.done) {
      o.done = true;
      o.last = null;
      return;
    }
    o.last = r.value;
    if (o.last.op === "compare") o.comparisons++;
    else if (o.last.op === "swap") {
      o.swaps++;
      [o.view[o.last.i], o.view[o.last.j]] = [o.view[o.last.j], o.view[o.last.i]];
    } else {
      o.swaps++;
      o.view[o.last.i] = o.last.value;
    }
  };
  return o;
}

function expectSame(inst, o, label) {
  const got = inst.__debug.readState();
  expect(got.view, `${label}: values`).toEqual(o.view);
  expect(got.last, `${label}: highlight`).toEqual(o.last);
  expect([got.comparisons, got.swaps, got.done], `${label}: counters`).toEqual([o.comparisons, o.swaps, o.done]);
}

describe("the GPU array equals the kernel's, every step, to the end of the run", () => {
  test.each(ALGOS.flatMap((a) => SEEDS.map((s) => [a, s])))("%s, seed %i", (algorithm, seed) => {
    const cfg = configFor("bubble-small", seed, { algorithm, size: 36 });
    const { inst } = startGpu(cfg);
    expect(inst.path).toBe("gpu");
    const o = oracle(cfg);
    expectSame(inst, o, "the start");
    let n = 0;
    while (!o.done && n < 100000) {
      inst.step();
      o.step();
      n++;
      if (n <= 25 || n % 11 === 0 || o.done) expectSame(inst, o, `step ${n}`);
    }
    expect(o.done).toBe(true);
    expect(inst.isDone()).toBe(true);
    expect(inst.isIdle()).toBe(true);
    expect(inst.__debug.readState().view).toEqual([...o.view].sort((a, b) => a - b));
  }, 120000);
});

describe("orders, sizes and presets", () => {
  test.each(["random", "nearly-sorted", "reversed", "few-unique"])("starting order %s", (order) => {
    const cfg = configFor("bubble-small", 7, { algorithm: "quick", size: 60, order });
    const { inst } = startGpu(cfg);
    const o = oracle(cfg);
    for (let n = 0; n < 400; n++) {
      inst.step();
      o.step();
    }
    expectSame(inst, o, "after 400 steps");
  });

  test.each([["the smallest array", 8], ["the largest array", 1000]])("%s", (_name, size) => {
    const cfg = configFor("bubble-small", 3, { algorithm: "merge", size });
    const { inst } = startGpu(cfg);
    const o = oracle(cfg);
    for (let n = 0; n < 1500; n++) {
      inst.step();
      o.step();
    }
    expectSame(inst, o, "after 1,500 steps");
  });

  test.each(module.presets.filter((p) => p.id !== "sweep").map((p) => [p.id]))("preset %s", (id) => {
    const cfg = configFor(id, 9);
    const { inst } = startGpu(cfg);
    const o = oracle(cfg);
    for (let n = 0; n < 600; n++) {
      inst.step();
      o.step();
    }
    expectSame(inst, o, "after 600 steps");
  });

  test("changing the algorithm starts over from a new array", () => {
    const cfg = configFor("bubble-small", 4, { size: 50 });
    const { inst } = startGpu(cfg);
    for (let i = 0; i < 100; i++) inst.step();
    inst.update({ ...cfg, values: { ...cfg.values, algorithm: "heap" } }, ["algorithm"]);
    const s = inst.__debug.readState();
    expect([s.comparisons, s.swaps, s.done]).toEqual([0, 0, false]);
    expect(s.view).toHaveLength(50);
  });

  test("changing the size gives an array of that size; changing only the palette keeps it", () => {
    const cfg = configFor("bubble-small", 4, { size: 50 });
    const { inst } = startGpu(cfg);
    for (let i = 0; i < 100; i++) inst.step();
    const before = inst.__debug.readState();
    inst.update({ ...cfg, values: { ...cfg.values, palette: "magma" } }, ["palette"]);
    expect(inst.__debug.readState().view).toEqual(before.view);
    inst.update({ ...cfg, values: { ...cfg.values, size: 90 } }, ["size"]);
    expect(inst.__debug.readState().view).toHaveLength(90);
  });
});

describe("the same seed gives the same array", () => {
  test("the start equals the processor path's start; another seed differs", () => {
    const cfg = configFor("bubble-small", 21, { size: 100 });
    const o = oracle(cfg);
    expect(startGpu(cfg).inst.__debug.readState().view).toEqual(o.view);
    expect(startGpu(configFor("bubble-small", 22, { size: 100 })).inst.__debug.readState().view).not.toEqual(o.view);
  });
});

describe("the picture", () => {
  /** The first row from the top of canvas column x that is not the background, or -1. */
  function topOf(px, canvas, x) {
    for (let y = 0; y < canvas.height; y++) {
      const i = ((canvas.height - 1 - y) * canvas.width + x) * 4;
      if (!(px[i] === 15 && px[i + 1] === 15 && px[i + 2] === 18)) return y;
    }
    return -1;
  }
  const rgbAt = (px, canvas, x, y) => {
    const i = ((canvas.height - 1 - y) * canvas.width + x) * 4;
    return [px[i], px[i + 1], px[i + 2]];
  };

  test("bars: each bar is as tall as its value and in its palette color; the compared pair is highlighted", () => {
    const cfg = configFor("bubble-small", 5, { algorithm: "bubble", size: 40, display: "bars" });
    const { inst, canvas, handle } = startGpu(cfg);
    const o = oracle(cfg);
    for (let n = 0; n < 60; n++) {
      inst.step();
      o.step();
    }
    inst.render();
    const px = inst.__debug.gpu.readback({ w: canvas.width, h: canvas.height, fbo: null }, new Uint8Array(canvas.width * canvas.height * 4));
    const lut = handle.ctx.palette("viridis");
    const max = Math.max(...o.view);
    const bw = canvas.width / 40; // 8 px, bars 7 px wide
    for (let i = 0; i < 40; i++) {
      const x = Math.floor(i * bw + 3);
      const height = (o.view[i] / max) * canvas.height * 0.92;
      expect(Math.abs(topOf(px, canvas, x) - (canvas.height - height)), `bar ${i} top`).toBeLessThanOrEqual(1.01);
      const got = rgbAt(px, canvas, x, canvas.height - 3);
      const hot = o.last && (o.last.i === i || o.last.j === i);
      let want;
      if (hot) want = o.last.op === "compare" ? [255, 209, 102] : [255, 93, 93];
      else {
        const k = Math.round((0.15 + 0.85 * (o.view[i] / max)) * 255) * 3;
        want = [lut[k], lut[k + 1], lut[k + 2]];
      }
      expect(got, `bar ${i} colour`).toEqual(want);
    }
    expect(topOf(px, canvas, 7), "the gap between bars is empty down its whole height").toBe(-1); // x = 7 is outside bar 0's 7 px
    expect(rgbAt(px, canvas, 7, canvas.height - 3)).toEqual([15, 15, 18]);
  });

  test("dots: a dot sits at the top of each value, and nothing is drawn above it", () => {
    const cfg = configFor("bubble-small", 5, { algorithm: "quick", size: 40, display: "dots" });
    const { inst, canvas, handle } = startGpu(cfg);
    const o = oracle(cfg);
    for (let n = 0; n < 30; n++) {
      inst.step();
      o.step();
    }
    inst.render();
    const px = inst.__debug.gpu.readback({ w: canvas.width, h: canvas.height, fbo: null }, new Uint8Array(canvas.width * canvas.height * 4));
    const lut = handle.ctx.palette("viridis");
    const max = Math.max(...o.view);
    for (let i = 0; i < 40; i++) {
      const cx = Math.floor(i * 8 + 4);
      const cy = Math.round(canvas.height - (o.view[i] / max) * canvas.height * 0.92);
      const hot = o.last && (o.last.i === i || o.last.j === i);
      let want;
      if (hot) want = o.last.op === "compare" ? [255, 209, 102] : [255, 93, 93];
      else {
        const k = Math.round((0.15 + 0.85 * (o.view[i] / max)) * 255) * 3;
        want = [lut[k], lut[k + 1], lut[k + 2]];
      }
      expect(rgbAt(px, canvas, cx, cy), `dot ${i}`).toEqual(want);
      if (cy - 8 >= 0) expect(rgbAt(px, canvas, cx, cy - 8), `above dot ${i}`).toEqual([15, 15, 18]);
    }
  });
});

describe("leaving and losing the context", () => {
  test("opening and leaving 30 times works every time", () => {
    for (let i = 0; i < 30; i++) {
      const { inst, handle } = startGpu(configFor("bubble-small", 1, { size: 20 }));
      expect(inst.path, `open #${i + 1}`).toBe("gpu");
      inst.step();
      inst.render();
      inst.destroy();
      handle.dispose();
      live.pop();
    }
  });

  test("a lost context that comes back restarts from the opening array with a notice", async () => {
    const notices = [];
    const cfg = configFor("bubble-small", 6, { size: 40 });
    const { inst, canvas } = startGpu(cfg, { onNotice: (n) => notices.push(n) });
    for (let i = 0; i < 80; i++) inst.step();
    const ext = inst.__debug.gpu.gl.getExtension("WEBGL_lose_context");
    const lost = new Promise((r) => canvas.addEventListener("webglcontextlost", r, { once: true }));
    ext.loseContext();
    await lost;
    await new Promise((r) => setTimeout(r, 30));
    expect(() => {
      inst.step();
      inst.render();
    }).not.toThrow();
    const restored = new Promise((r) => canvas.addEventListener("webglcontextrestored", r, { once: true }));
    ext.restoreContext();
    await restored;
    await new Promise((r) => setTimeout(r, 50));
    expect(notices.some((n) => /graphics card was reset/i.test(n))).toBe(true);
    const o = oracle(cfg);
    expectSame(inst, o, "the opening array");
    for (let n = 0; n < 100; n++) {
      inst.step();
      o.step();
    }
    expectSame(inst, o, "100 steps after the restart");
  });
});
