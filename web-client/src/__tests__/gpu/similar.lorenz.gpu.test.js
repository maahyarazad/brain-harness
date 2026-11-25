// SC-016 / FR-035 (the "looks the same" group): the GPU Lorenz attractor keeps the kernel's trails exactly (the integration
// is the same code) and draws them rotated and projected as the processor path does.
import { afterEach, describe, expect, test } from "vitest";
import lorenz from "../../studio/visualizations/lorenz/index.js";
import { lorenzRK4, project } from "../../studio/visualizations/lorenz/kernel.js";
import { configFor, withSweep, runGpu, runProcessor, finish, imageDiff, lose, restore } from "./gpuHarness.js";

const module = withSweep(lorenz);
const DT = 0.005;
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
const isBackground = (c) => c[0] === BG[0] && c[1] === BG[1] && c[2] === BG[2];

/** The kernel's own run: both points and the last `trail` points of each, oldest first. */
function oracle(config, steps) {
  const v = config.values;
  let a = [v.x0, v.y0, v.z0];
  let b = [v.x0 + v.separation, v.y0, v.z0];
  const ta = [];
  const tb = [];
  for (let i = 0; i < steps; i++) {
    a = lorenzRK4(a, v, DT);
    b = lorenzRK4(b, v, DT);
    ta.push(Float32Array.from(a));
    tb.push(Float32Array.from(b));
    if (ta.length > v.trail) {
      ta.shift();
      tb.shift();
    }
  }
  const flat = (t) => Float32Array.from(t.flatMap((p) => [...p]));
  return { a, b, trailA: flat(ta), trailB: flat(tb), len: ta.length };
}

function readCanvas({ inst, canvas }) {
  const px = inst.__debug.gpu.readback({ w: canvas.width, h: canvas.height, fbo: null }, new Uint8Array(canvas.width * canvas.height * 4));
  const at = (x, y) => {
    const i = ((canvas.height - 1 - Math.round(y)) * canvas.width + Math.round(x)) * 4;
    return [px[i], px[i + 1], px[i + 2]];
  };
  let lit = 0;
  for (let i = 0; i < px.length; i += 4) if (!(px[i] === 15 && px[i + 1] === 15 && px[i + 2] === 18)) lit++;
  return { at, lit };
}

/** Where a point of the trail lands on a w x h canvas for the given view, as the processor path computes it. */
const place = (p, view, w, h) => {
  const s = Math.min(w, h) / 64;
  const [px, py] = project([p[0], p[1], p[2]], view.yaw, view.pitch);
  return [w / 2 + px * s, h / 2 + py * s];
};

describe("the trails equal the kernel's", () => {
  test.each(PRESETS)("preset %s: 800 steps", (preset) => {
    const config = configFor(module, preset, 1);
    const { inst } = gpuRun(config, { steps: 800 });
    expect(inst.path).toBe("gpu");
    const got = inst.__debug.readState();
    const want = oracle(config, 800);
    expect(got.a).toEqual(want.a);
    expect(got.b).toEqual(want.b);
    expect(got.len).toBe(want.len);
    expect([...got.trailA]).toEqual([...want.trailA]);
    expect([...got.trailB]).toEqual([...want.trailB]);
    expect(got.steps).toBe(800);
  });

  test("the ring: a short trail kept while more steps run holds the newest points, oldest first", () => {
    const config = configFor(module, "classic", 1, { trail: 100 });
    const { inst } = gpuRun(config, { steps: 460 });
    const got = inst.__debug.readState();
    const want = oracle(config, 460);
    expect(got.len).toBe(100);
    expect([...got.trailA]).toEqual([...want.trailA]);
    expect([...got.trailB]).toEqual([...want.trailB]);
  });

  test("the second start offset keeps the two points apart as the kernel does", () => {
    const config = configFor(module, "classic", 1, { separation: 0.01 });
    const { inst } = gpuRun(config, { steps: 50 });
    const want = oracle(config, 50);
    expect(inst.__debug.readState().b).toEqual(want.b);
  });
});

describe("it draws the trail where the kernel's projection puts it", () => {
  test("points of both trails are lit at their projected places, in the palette colors at 85% over the background", () => {
    const config = configFor(module, "classic", 1);
    const r = gpuRun(config, { steps: 1200, size: [640, 480] });
    const { at } = readCanvas(r);
    const s = r.inst.__debug.readState();
    const lut = r.handle.ctx.palette(config.values.palette);
    const premix = (t) => {
      const k = Math.round(t * 255) * 3;
      return [0, 1, 2].map((c) => Math.round(0.85 * lut[k + c] + 0.15 * BG[c]));
    };
    const strongest = (x, y) => {
      let best = BG;
      for (let dy = -1; dy <= 1; dy++) for (let dx = -1; dx <= 1; dx++) {
        const c = at(x + dx, y + dy);
        if (c[0] + c[1] + c[2] > best[0] + best[1] + best[2]) best = c;
      }
      return best;
    };
    let hitsA = 0;
    let hitsB = 0;
    let n = 0;
    for (let i = 0; i < s.len; i += 40) {
      const [xa, ya] = place(s.trailA.subarray(i * 3, i * 3 + 3), s.view, 640, 480);
      const [xb, yb] = place(s.trailB.subarray(i * 3, i * 3 + 3), s.view, 640, 480);
      n++;
      if (!isBackground(strongest(xa, ya))) hitsA++;
      if (!isBackground(strongest(xb, yb))) hitsB++;
    }
    expect(hitsA / n, "trail A points lit").toBeGreaterThan(0.95);
    expect(hitsB / n, "trail B points lit (it may sit under A)").toBeGreaterThan(0.95);
    // The colour of a lit point is one of the two palette colors (the later trail is drawn over the earlier).
    const [xa, ya] = place(s.trailA.subarray(0, 3), s.view, 640, 480);
    const c = strongest(xa, ya);
    const near = (p, q) => p.every((v, j) => Math.abs(v - q[j]) < 20);
    expect(near(c, premix(0.25)) || near(c, premix(0.7)), `colour ${c} against ${premix(0.25)} and ${premix(0.7)}`).toBe(true);
  });

  test("each trail has its own color, at full strength: the amounts of bluish and reddish ink and their brightness match the processor's", () => {
    // The earlier trail is the palette at 0.25 (bluish for the default palette), the later one at 0.7 (reddish), drawn over it.
    // Starting the points a whole unit apart keeps the two trails from lying on top of each other for long.
    const config = configFor(module, "classic", 1, { separation: 1 });
    const g = gpuRun(config, { steps: 700, size: [640, 480] });
    const p = processorRun(config, { steps: 700, size: [640, 480] });
    const classify = (data) => {
      let blue = 0, red = 0, brightness = 0, lit = 0;
      for (let i = 0; i < data.length; i += 4) {
        if (data[i] === 15 && data[i + 1] === 15 && data[i + 2] === 18) continue;
        lit++;
        brightness += data[i] + data[i + 1] + data[i + 2];
        if (data[i + 2] > data[i]) blue++;
        else red++;
      }
      return { blue, red, mean: brightness / lit };
    };
    const gpuPx = g.inst.__debug.gpu.readback({ w: 640, h: 480, fbo: null }, new Uint8Array(640 * 480 * 4));
    const mine = classify(gpuPx);
    const theirs = classify(p.canvas.getContext("2d", { willReadFrequently: true }).getImageData(0, 0, 640, 480).data);
    expect(theirs.blue, "the processor draws a bluish trail").toBeGreaterThan(100);
    expect(theirs.red, "and a reddish one").toBeGreaterThan(100);
    expect(mine.blue / theirs.blue, `bluish pixels: gpu ${mine.blue}, processor ${theirs.blue}`).toBeGreaterThan(0.7);
    expect(mine.blue / theirs.blue).toBeLessThan(1.4);
    expect(mine.red / theirs.red, `reddish pixels: gpu ${mine.red}, processor ${theirs.red}`).toBeGreaterThan(0.7);
    expect(mine.red / theirs.red).toBeLessThan(1.4);
    expect(mine.mean / theirs.mean, `mean brightness of the ink: gpu ${mine.mean.toFixed(0)}, processor ${theirs.mean.toFixed(0)}`).toBeGreaterThan(0.95);
    expect(mine.mean / theirs.mean).toBeLessThan(1.05);
  });

  test.each(PRESETS)("preset %s: imageDiff at most 12 against the processor path after 600 steps", (preset) => {
    const config = configFor(module, preset, 1);
    const g = gpuRun(config, { steps: 600 });
    const p = processorRun(config, { steps: 600 });
    const diff = imageDiff(g.canvas, p.canvas);
    expect(diff, `imageDiff ${diff.toFixed(2)}`).toBeLessThanOrEqual(12);
  });

  test("the amount of ink is about the processor's, with the ring wrapped (no stray line joins newest to oldest)", () => {
    const config = configFor(module, "classic", 1, { trail: 100 });
    const g = gpuRun(config, { steps: 460, size: [640, 480] });
    const p = processorRun(config, { steps: 460, size: [640, 480] });
    const gl = readCanvas(g).lit;
    const ctx2 = p.canvas.getContext("2d", { willReadFrequently: true });
    const d = ctx2.getImageData(0, 0, 640, 480).data;
    let pl = 0;
    for (let i = 0; i < d.length; i += 4) if (!(d[i] === 15 && d[i + 1] === 15 && d[i + 2] === 18)) pl++;
    expect(gl / pl, `lit pixels: gpu ${gl}, processor ${pl}`).toBeGreaterThan(0.6);
    expect(gl / pl).toBeLessThan(1.5);
  });
});

describe("rotating the view", () => {
  test("dragging rotates, clamps the pitch, and reports the view on release", () => {
    const views = [];
    const config = configFor(module, "classic", 1);
    const r = gpuRun(config, { steps: 400, ctxOptions: { onView: (v) => views.push(v) } });
    const { inst } = r;
    const before = readCanvas(r).lit;
    inst.pointer({ type: "down", x: 100, y: 100 });
    inst.pointer({ type: "move", x: 150, y: 9000 });
    const v = inst.__debug.readState().view;
    expect(v.yaw).toBeCloseTo(0.6 + 50 * 0.01, 9);
    expect(v.pitch).toBe(1.5); // clamped
    inst.pointer({ type: "up", x: 150, y: 9000 });
    expect(views.at(-1)).toMatchObject({ yaw: v.yaw, pitch: 1.5 });
    expect(readCanvas(r).lit).not.toBe(before); // the picture turned
  });

  test("the arrow keys turn the view and are handled", () => {
    const config = configFor(module, "classic", 1);
    const { inst } = gpuRun(config, { steps: 50 });
    expect(inst.pointer({ type: "key", key: "ArrowLeft" })).toBe(true);
    expect(inst.__debug.readState().view.yaw).toBeCloseTo(0.5, 9);
    expect(inst.pointer({ type: "key", key: "ArrowUp" })).toBe(true);
    expect(inst.__debug.readState().view.pitch).toBeCloseTo(0.2, 9);
    expect(inst.pointer({ type: "key", key: "a" })).toBeUndefined();
  });

  test("a view passed in by a link is used", () => {
    const config = { ...configFor(module, "classic", 1), view: { yaw: 1.2, pitch: -0.4 } };
    const { inst } = gpuRun(config, { steps: 10 });
    expect(inst.__debug.readState().view).toEqual({ yaw: 1.2, pitch: -0.4 });
  });

  test("the rotated picture puts points where the kernel's projection says for the new view", () => {
    const config = { ...configFor(module, "classic", 1), view: { yaw: 1.7, pitch: -0.5 } };
    const r = gpuRun(config, { steps: 900, size: [640, 480] });
    const { at } = readCanvas(r);
    const s = r.inst.__debug.readState();
    let hits = 0;
    let n = 0;
    for (let i = 0; i < s.len; i += 30) {
      const [x, y] = place(s.trailA.subarray(i * 3, i * 3 + 3), s.view, 640, 480);
      n++;
      let lit = false;
      for (let dy = -1; dy <= 1; dy++) for (let dx = -1; dx <= 1; dx++) if (!isBackground(at(x + dx, y + dy))) lit = true;
      if (lit) hits++;
    }
    expect(hits / n).toBeGreaterThan(0.95);
  });
});

describe("changing a setting", () => {
  test("a new start, offset or trail length restarts; the parameters and palette keep the trail", () => {
    const config = configFor(module, "classic", 1);
    const { inst } = gpuRun(config, { steps: 300 });
    inst.update({ ...config, values: { ...config.values, rho: 40, palette: "magma" } }, ["rho", "palette"]);
    expect(inst.__debug.readState().len).toBe(300);
    inst.update({ ...config, values: { ...config.values, x0: 5 } }, ["x0"]);
    expect(inst.__debug.readState().len).toBe(0);
    inst.step();
    inst.update({ ...config, values: { ...config.values, trail: 500 } }, ["trail"]);
    expect(inst.__debug.readState().len).toBe(0);
  });

  test("a changed rho takes effect from the next step", () => {
    const config = configFor(module, "classic", 1);
    const { inst } = gpuRun(config, { steps: 100 });
    const next = { ...config, values: { ...config.values, rho: 14 } };
    inst.update(next, ["rho"]);
    for (let i = 0; i < 100; i++) inst.step();
    // The kernel with 100 steps at rho 28, then 100 at rho 14.
    const v = config.values;
    let a = [v.x0, v.y0, v.z0];
    for (let i = 0; i < 100; i++) a = lorenzRK4(a, v, DT);
    for (let i = 0; i < 100; i++) a = lorenzRK4(a, next.values, DT);
    expect(inst.__debug.readState().a).toEqual(a);
  });
});

describe("leaving and losing the context", () => {
  test("opening and leaving 30 times works every time", () => {
    for (let i = 0; i < 30; i++) {
      const r = runGpu(module, configFor(module, "classic", 1), { steps: 3 });
      expect(r.inst.path, `open #${i + 1}`).toBe("gpu");
      finish(r);
    }
  });

  test("a lost context that comes back draws the same trail again (the points are kept on the processor)", async () => {
    const config = configFor(module, "classic", 1);
    const r = gpuRun(config, { steps: 500, size: [640, 480] });
    const before = readCanvas(r).lit;
    await lose(r.canvas, r.inst.__debug.gpu.gl);
    await new Promise((res) => setTimeout(res, 30));
    expect(() => {
      r.inst.step();
      r.inst.render();
    }).not.toThrow();
    await restore(r.canvas);
    await new Promise((res) => setTimeout(res, 50));
    expect(r.inst.__debug.readState().len).toBe(501);
    const after = readCanvas(r).lit;
    expect(after / before, `lit pixels before ${before}, after ${after}`).toBeGreaterThan(0.9);
  });
});
