// SC-016 / FR-035 (the "looks the same" group): the GPU double pendulum keeps the integrator's state and trail
// exactly (it is the same code), and draws the trail, rods and bobs where the processor path does.
import { afterEach, describe, expect, test } from "vitest";
import pendulum from "../../studio/visualizations/doublePendulum/index.js";
import { pendulumRK4 } from "../../studio/visualizations/doublePendulum/kernel.js";
import { configFor, withSweep, runGpu, runProcessor, finish, imageDiff, lose, restore } from "./gpuHarness.js";

const module = withSweep(pendulum);
const DT = 1 / 240;
const DEG = Math.PI / 180;
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

const paramsOf = (v) => ({ m1: v.m1, m2: v.m2, l1: v.l1, l2: v.l2, g: v.gravity });

/** The kernel's own run: the state and the bob positions the processor path would have after `steps` steps on a w x h canvas. */
function oracle(config, steps, w = 320, h = 240) {
  const v = config.values;
  let state = [v.theta1 * DEG, 0, v.theta2 * DEG, 0];
  const s = (Math.min(w, h) * 0.46) / (v.l1 + v.l2);
  const geom = (st) => {
    const ox = w / 2, oy = h / 2;
    const x1 = ox + Math.sin(st[0]) * v.l1 * s, y1 = oy + Math.cos(st[0]) * v.l1 * s;
    return { x1, y1, x2: x1 + Math.sin(st[2]) * v.l2 * s, y2: y1 + Math.cos(st[2]) * v.l2 * s };
  };
  let trail = [];
  for (let i = 0; i < steps; i++) {
    state = pendulumRK4(state, paramsOf(v), DT);
    const g = geom(state);
    trail.push([g.x2, g.y2]);
    if (trail.length > v.trail) trail.splice(0, trail.length - v.trail);
  }
  return { state, trail, geom: geom(state) };
}

function readCanvas({ inst, canvas }) {
  const px = inst.__debug.gpu.readback({ w: canvas.width, h: canvas.height, fbo: null }, new Uint8Array(canvas.width * canvas.height * 4));
  return (x, y) => {
    const i = ((canvas.height - 1 - Math.round(y)) * canvas.width + Math.round(x)) * 4;
    return [px[i], px[i + 1], px[i + 2]];
  };
}
const isBackground = (c) => c[0] === BG[0] && c[1] === BG[1] && c[2] === BG[2];

describe("the state, the trail and the bobs equal the kernel's", () => {
  test.each(PRESETS)("preset %s: 600 steps", (preset) => {
    const config = configFor(module, preset, 1);
    const { inst } = gpuRun(config, { steps: 600 });
    expect(inst.path).toBe("gpu");
    const got = inst.__debug.readState();
    const want = oracle(config, 600);
    expect(got.state).toEqual(want.state);
    expect(got.trail).toEqual(want.trail);
    expect(got.geometry.x2).toBe(want.geom.x2);
    expect(got.geometry.y2).toBe(want.geom.y2);
    expect(got.time).toBeCloseTo(600 * DT, 9);
  });

  test("the trail never grows past its length setting", () => {
    const config = configFor(module, "chaos", 1, { trail: 50 });
    const { inst } = gpuRun(config, { steps: 300 });
    expect(inst.__debug.readState().trail).toHaveLength(50);
    expect(inst.__debug.readState().trail).toEqual(oracle(config, 300).trail);
  });

  test("no trail at all", () => {
    const config = configFor(module, "chaos", 1, { trail: 0 });
    const { inst, canvas } = gpuRun(config, { steps: 100 });
    expect(inst.__debug.readState().trail).toHaveLength(0);
    expect(isBackground(readCanvas({ inst, canvas })(5, 5))).toBe(true);
  });
});

describe("it draws what the processor path draws", () => {
  test.each(PRESETS)("preset %s: imageDiff at most 12 after 400 steps", (preset) => {
    const config = configFor(module, preset, 1);
    const g = gpuRun(config, { steps: 400 });
    const p = processorRun(config, { steps: 400 });
    const diff = imageDiff(g.canvas, p.canvas);
    expect(diff, `imageDiff ${diff.toFixed(2)}`).toBeLessThanOrEqual(12);
  });

  test("the bobs and the rods are where the geometry says, in their colors", () => {
    const config = configFor(module, "gentle", 1, { trail: 0 });
    const r = gpuRun(config, { steps: 120 });
    const at = readCanvas(r);
    const { geometry } = r.inst.__debug.readState();
    const lut = r.handle.ctx.palette(config.values.palette);
    const k = Math.round(0.85 * 255) * 3;
    expect(at(geometry.x1, geometry.y1)).toEqual([255, 255, 255]); // bob 1 is white
    expect(at(geometry.x2, geometry.y2)).toEqual([lut[k], lut[k + 1], lut[k + 2]]); // bob 2 takes the palette color
    // The middle of the first rod, a little off the bob, is the rod's gray #d8d8d8.
    const mx = (geometry.ox + geometry.x1) / 2;
    const my = (geometry.oy + geometry.y1) / 2;
    expect(at(mx, my)).toEqual([0xd8, 0xd8, 0xd8]);
    // The pivot's far side is empty: nothing is drawn above the pivot.
    expect(isBackground(at(geometry.ox, geometry.oy - 40))).toBe(true);
  });

  test("the trail is drawn along the path the bob took, fading in toward the bob", () => {
    const config = configFor(module, "gentle", 1, { trail: 400 });
    const r = gpuRun(config, { steps: 400 });
    const at = readCanvas(r);
    const { trail } = r.inst.__debug.readState();
    const bright = (c) => c[0] + c[1] + c[2];
    // Away from the bobs and rods, the older part of the trail is fainter than the newer part.
    const sample = (i) => {
      const [x, y] = trail[i];
      let best = 0;
      for (let dy = -1; dy <= 1; dy++) for (let dx = -1; dx <= 1; dx++) best = Math.max(best, bright(at(x + dx, y + dy)));
      return best;
    };
    expect(sample(390)).toBeGreaterThan(sample(20));
  });
});

describe("the trail's brightness along its length matches the processor path's", () => {
  test("old parts are as faint, new parts as strong, as the processor draws them", () => {
    const config = configFor(module, "chaos", 1, { trail: 500 });
    const g = gpuRun(config, { steps: 500 });
    const p = processorRun(config, { steps: 500 });
    const gpuAt = readCanvas(g);
    const g2 = p.canvas.getContext("2d", { willReadFrequently: true });
    const procAt = (x, y) => {
      const d = g2.getImageData(Math.round(x), Math.round(y), 1, 1).data;
      return [d[0], d[1], d[2]];
    };
    const strongest = (at, x, y) => {
      let best = 0;
      for (let dy = -1; dy <= 1; dy++) for (let dx = -1; dx <= 1; dx++) best = Math.max(best, at(x + dx, y + dy).reduce((a, b) => a + b, 0));
      return best;
    };
    const { trail, geometry } = g.inst.__debug.readState();
    const far = (x, y) => [[geometry.ox, geometry.oy], [geometry.x1, geometry.y1], [geometry.x2, geometry.y2]].every(([bx, by]) => Math.hypot(x - bx, y - by) > 24);
    // Skip points near the rods or bobs, which cover the trail, and points the trail crosses itself.
    let compared = 0;
    let worst = 0;
    let total = 0;
    for (let i = 0; i < trail.length - 40; i += 7) {
      const [x, y] = trail[i];
      if (x < 3 || y < 3 || x > 316 || y > 236 || !far(x, y)) continue;
      const a = strongest(gpuAt, x, y);
      const b = strongest(procAt, x, y);
      worst = Math.max(worst, Math.abs(a - b));
      total += Math.abs(a - b);
      compared++;
    }
    expect(compared, "enough trail points away from the rods").toBeGreaterThan(15);
    expect(total / compared, `mean brightness difference (worst ${worst})`).toBeLessThan(45);
  });
});

describe("dragging a bob, as on the processor path", () => {
  test("pressing near bob 2 and moving sets its angle and clears the trail; letting go reports the angles", () => {
    const values = [];
    const config = configFor(module, "gentle", 1);
    const r = gpuRun(config, { steps: 50, ctxOptions: { onValues: (v) => values.push(v) } });
    const { inst } = r;
    const { geometry } = inst.__debug.readState();
    inst.pointer({ type: "down", x: geometry.x2 + 3, y: geometry.y2 + 2 });
    inst.pointer({ type: "move", x: geometry.x1 + 40, y: geometry.y1 }); // directly to the right of bob 1
    const s = inst.__debug.readState();
    expect(s.state[2]).toBeCloseTo(Math.atan2(40, 0), 9); // 90 degrees: atan2(dx, dy)
    expect(s.trail).toHaveLength(0);
    expect(s.time).toBe(0);
    inst.pointer({ type: "up", x: 0, y: 0 });
    expect(values.at(-1)).toMatchObject({ theta2: 90 });
  });

  test("pressing far from both bobs drags nothing", () => {
    const config = configFor(module, "gentle", 1);
    const { inst } = gpuRun(config, { steps: 50 });
    const before = inst.__debug.readState().state;
    inst.pointer({ type: "down", x: 2, y: 2 });
    inst.pointer({ type: "move", x: 100, y: 100 });
    expect(inst.__debug.readState().state).toEqual(before);
  });
});

describe("changing a setting", () => {
  test("start angles restart; arm lengths clear the trail only; mass and gravity keep going", () => {
    const config = configFor(module, "chaos", 1);
    const { inst } = gpuRun(config, { steps: 200 });
    inst.update({ ...config, values: { ...config.values, l1: 1.4 } }, ["l1"]);
    let s = inst.__debug.readState();
    expect(s.trail).toHaveLength(0);
    expect(s.time).toBeGreaterThan(0);
    inst.step();
    inst.update({ ...config, values: { ...config.values, l1: 1.4, gravity: 12, m1: 3 } }, ["gravity", "m1"]);
    expect(inst.__debug.readState().trail).toHaveLength(1);
    inst.update({ ...config, values: { ...config.values, theta1: 30 } }, ["theta1"]);
    s = inst.__debug.readState();
    expect(s.time).toBe(0);
    expect(s.state[0]).toBeCloseTo(30 * DEG, 12);
  });

  test("a resize clears the trail", () => {
    const config = configFor(module, "chaos", 1);
    const { inst } = gpuRun(config, { steps: 100 });
    inst.resize();
    expect(inst.__debug.readState().trail).toHaveLength(0);
  });
});

describe("leaving and losing the context", () => {
  test("opening and leaving 30 times works every time", () => {
    for (let i = 0; i < 30; i++) {
      const r = runGpu(module, configFor(module, "chaos", 1), { steps: 2 });
      expect(r.inst.path, `open #${i + 1}`).toBe("gpu");
      finish(r);
    }
  });

  test("a lost context that comes back restarts from the set angles and draws again", async () => {
    const config = configFor(module, "chaos", 1);
    const r = gpuRun(config, { steps: 100 });
    const { inst, canvas } = r;
    await lose(canvas, inst.__debug.gpu.gl);
    await new Promise((res) => setTimeout(res, 30));
    expect(() => {
      inst.step();
      inst.render();
    }).not.toThrow();
    await restore(canvas);
    await new Promise((res) => setTimeout(res, 50));
    const s = inst.__debug.readState();
    expect(s.time).toBe(0);
    expect(s.state).toEqual([120 * DEG, 0, -20 * DEG, 0]);
    const at = readCanvas(r);
    expect(at(s.geometry.x1, s.geometry.y1)).toEqual([255, 255, 255]); // bob 1 is back
  });
});
