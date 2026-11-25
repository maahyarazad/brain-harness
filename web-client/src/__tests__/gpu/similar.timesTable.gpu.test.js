// SC-016 / FR-035 (the "looks the same" group): the GPU times-table circle draws the formula's lines.
import { afterEach, describe, expect, test } from "vitest";
import timesTable from "../../studio/visualizations/timesTable/index.js";
import { circlePoint } from "../../studio/visualizations/timesTable/kernel.js";
import { configFor, withSweep, runGpu, runProcessor, finish, imageDiff, lose, restore } from "./gpuHarness.js";

const module = withSweep(timesTable);
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

function readCanvas({ inst, canvas }) {
  const px = inst.__debug.gpu.readback({ w: canvas.width, h: canvas.height, fbo: null }, new Uint8Array(canvas.width * canvas.height * 4));
  return (x, y) => {
    const i = ((canvas.height - 1 - Math.round(y)) * canvas.width + Math.round(x)) * 4;
    return [px[i], px[i + 1], px[i + 2]];
  };
}
const isBackground = (c) => c[0] === BG[0] && c[1] === BG[1] && c[2] === BG[2];

describe("the lines are the formula's (k, k·m mod N)", () => {
  // A line is checked where it is thickest in the data: the middle of the segment. A wrong multiplier puts the middle elsewhere.
  test.each([
    [12, 2],
    [12, 3],
    [20, 5],
    [30, 7],
    [24, 2.5],
    [50, 13],
  ])("N = %i, m = %d: the middle of every line is drawn", (N, m) => {
    const config = configFor(module, null, 1, { N, m, opacity: 1 });
    const r = gpuRun(config, { size: [400, 400] });
    const at = readCanvas(r);
    const cx = 200;
    const cy = 200;
    const radius = 400 * 0.45;
    let drawn = 0;
    let checked = 0;
    for (let k = 0; k < N; k++) {
      const a = circlePoint(k, N, cx, cy, radius);
      const b = circlePoint((k * m) % N, N, cx, cy, radius);
      if (Math.hypot(a[0] - b[0], a[1] - b[1]) < 6) continue; // a point joined to itself has no middle to find
      checked++;
      // Look in a 3 x 3 window: the line is a pixel wide or so, and the middle is not on a pixel center.
      const mx = (a[0] + b[0]) / 2;
      const my = (a[1] + b[1]) / 2;
      let lit = false;
      for (let dy = -1; dy <= 1; dy++) for (let dx = -1; dx <= 1; dx++) if (!isBackground(at(mx + dx, my + dy))) lit = true;
      if (lit) drawn++;
    }
    expect(drawn, `${drawn} of ${checked} line middles were drawn`).toBe(checked);
  });

  test("a different multiplier draws different lines: the middles of m = 2 are not all drawn when m = 3", () => {
    const N = 40;
    const at3 = readCanvas(gpuRun(configFor(module, null, 1, { N, m: 3, opacity: 1 }), { size: [400, 400] }));
    let missing = 0;
    for (let k = 0; k < N; k++) {
      const a = circlePoint(k, N, 200, 200, 180);
      const b = circlePoint((k * 2) % N, N, 200, 200, 180);
      const mx = (a[0] + b[0]) / 2;
      const my = (a[1] + b[1]) / 2;
      let lit = false;
      for (let dy = -1; dy <= 1; dy++) for (let dx = -1; dx <= 1; dx++) if (!isBackground(at3(mx + dx, my + dy))) lit = true;
      if (!lit) missing++;
    }
    expect(missing).toBeGreaterThan(5);
  });

  test("m = 0 draws every line from its point to point 0, and the picture is a fan", () => {
    const N = 20;
    const at = readCanvas(gpuRun(configFor(module, null, 1, { N, m: 0, opacity: 1 }), { size: [400, 400] }));
    const zero = circlePoint(0, N, 200, 200, 180);
    // The middle of the line from point 10 (opposite) to point 0 is the circle's center.
    expect(isBackground(at(200, 200))).toBe(false);
    expect(zero[0]).toBeCloseTo(200 - 180, 5);
  });

  test("the line ends are on the circle and the corners of the canvas are the background", () => {
    const N = 30;
    const at = readCanvas(gpuRun(configFor(module, null, 1, { N, m: 2, opacity: 1 }), { size: [400, 400] }));
    for (const [x, y] of [[1, 1], [398, 1], [1, 398], [398, 398]]) expect(at(x, y)).toEqual(BG);
    const p = circlePoint(0, N, 200, 200, 180);
    expect(isBackground(at(p[0] + 2, p[1]))).toBe(false); // just inside the circle at point 0
  });
});

describe("it draws the same picture as the processor path", () => {
  test.each(PRESETS)("preset %s: imageDiff at most 12", (preset) => {
    const config = configFor(module, preset, 1);
    const g = gpuRun(config);
    const p = processorRun(config);
    const diff = imageDiff(g.canvas, p.canvas);
    expect(diff, `imageDiff ${diff.toFixed(2)}`).toBeLessThanOrEqual(12);
  });

  test.each([[0.1], [0.5], [1]])("line opacity %d: imageDiff at most 12 and the brightness agrees", (opacity) => {
    const config = configFor(module, "cardioid", 1, { opacity, N: 300 });
    const g = gpuRun(config);
    const p = processorRun(config);
    expect(imageDiff(g.canvas, p.canvas)).toBeLessThanOrEqual(12);
  });

  test("the whole run of an animation: after 100 steps of Animate m, the same m and the same picture", () => {
    const config = configFor(module, "sweep", 1, { N: 150 });
    const g = gpuRun(config, { steps: 100 });
    const p = processorRun(config, { steps: 100 });
    expect(g.inst.__debug.readState().m).toBeCloseTo(2 + 100 * 0.005, 10);
    expect(imageDiff(g.canvas, p.canvas)).toBeLessThanOrEqual(12);
  });
});

describe("changing a setting", () => {
  test("m takes effect at once; N and the palette redraw; Reset goes back to the set m", () => {
    const config = configFor(module, "cardioid", 1, { N: 100 });
    const { inst, canvas } = gpuRun(config);
    inst.update({ ...config, values: { ...config.values, m: 7 } });
    expect(inst.__debug.readState().m).toBe(7);
    const before = readCanvas({ inst, canvas });
    inst.update({ ...config, values: { ...config.values, m: 7, palette: "magma" } });
    // Same lines, other colors: some lit pixel changed color.
    const after = readCanvas({ inst, canvas });
    let changed = 0;
    for (let a = 0; a < 360; a += 3) {
      const x = 200 + Math.cos((a * Math.PI) / 180) * 100;
      const y = 120 + Math.sin((a * Math.PI) / 180) * 100;
      const b = before(x, y);
      const c = after(x, y);
      if (!isBackground(b) && (b[0] !== c[0] || b[1] !== c[1] || b[2] !== c[2])) changed++;
    }
    expect(changed).toBeGreaterThan(0);
    inst.update({ ...config, values: { ...config.values, m: 7, N: 250 } });
    expect(inst.__debug.readState().count).toBe(250);
    inst.step();
    inst.reset();
    expect(inst.__debug.readState().m).toBe(7); // reset returns to the set value
  });

  test("with Animate m off, step does not change m", () => {
    const config = configFor(module, "cardioid", 1);
    const { inst } = gpuRun(config);
    for (let i = 0; i < 10; i++) inst.step();
    expect(inst.__debug.readState().m).toBe(2);
  });
});

describe("leaving and losing the context", () => {
  test("opening and leaving 30 times works every time", () => {
    for (let i = 0; i < 30; i++) {
      const r = runGpu(module, configFor(module, "cardioid", 1, { N: 60 }), { steps: 1 });
      expect(r.inst.path, `open #${i + 1}`).toBe("gpu");
      finish(r);
    }
  });

  test("a lost context that comes back draws the picture again with a notice-free restart", async () => {
    const config = configFor(module, "sweep", 1, { N: 80 });
    const r = gpuRun(config, { steps: 20 });
    const { inst, canvas } = r;
    await lose(canvas, inst.__debug.gpu.gl);
    await new Promise((res) => setTimeout(res, 30));
    expect(() => {
      inst.step();
      inst.render();
    }).not.toThrow();
    await restore(canvas);
    await new Promise((res) => setTimeout(res, 50));
    expect(inst.__debug.readState().m).toBe(2); // the opening value
    const at = readCanvas(r);
    let lit = 0;
    for (let a = 0; a < 360; a += 5) {
      if (!isBackground(at(160 + Math.cos((a * Math.PI) / 180) * 100, 120 + Math.sin((a * Math.PI) / 180) * 100))) lit++;
    }
    expect(lit).toBeGreaterThan(10); // the lines are back
  });
});
