// SC-016 / FR-035 (the "looks the same" group): the GPU flock applies the processor's rules to the same neighbors.
import { afterEach, describe, expect, test } from "vitest";
import boids from "../../studio/visualizations/boids/index.js";
import { createFlock, flockStep } from "../../studio/visualizations/boids/kernel.js";
import { fitAspect } from "../../studio/visualizations/_shared/instance.js";
import { createRng } from "../../studio/core/rng.js";
import { configFor, withSweep, runGpu, runProcessor, finish, imageDiff, lose, restore } from "./gpuHarness.js";

const module = withSweep(boids);
const ASPECT = 4 / 3;
const runs = [];
afterEach(() => {
  runs.splice(0).forEach(finish);
});
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

/** The kernel's parameters for a config, as the processor path builds them. */
const paramsOf = (v, attractor = null) => ({
  separation: v.separation,
  alignment: v.alignment,
  cohesion: v.cohesion,
  radius: v.radius / 600,
  maxSpeed: v.maxSpeed * 0.0015,
  attractor,
});

const flockOf = (config) => createFlock(config.values.count, ASPECT, createRng(config.seed));

/** The largest difference in velocity, and in position (the shortest way round the wrapping box). */
function difference(state, flock) {
  let vel = 0;
  let pos = 0;
  for (let i = 0; i < flock.count; i++) {
    vel = Math.max(vel, Math.abs(state.vel[i * 2] - flock.vel[i * 2]), Math.abs(state.vel[i * 2 + 1] - flock.vel[i * 2 + 1]));
    let dx = Math.abs(state.pos[i * 2] - flock.pos[i * 2]);
    let dy = Math.abs(state.pos[i * 2 + 1] - flock.pos[i * 2 + 1]);
    dx = Math.min(dx, ASPECT - dx);
    dy = Math.min(dy, 1 - dy);
    pos = Math.max(pos, dx, dy);
  }
  return { vel, pos };
}

/** How aligned the flock is: the length of the average heading, 0 (scattered) to 1 (all one way). */
function order(vel, count) {
  let x = 0;
  let y = 0;
  for (let i = 0; i < count; i++) {
    const s = Math.hypot(vel[i * 2], vel[i * 2 + 1]) || 1;
    x += vel[i * 2] / s;
    y += vel[i * 2 + 1] / s;
  }
  return Math.hypot(x, y) / count;
}

describe("the first step follows flockStep", () => {
  test.each(PRESETS)("preset %s: velocities within 1e-4 and positions within 1e-4 after one step", (preset) => {
    const config = configFor(module, preset, 7, { count: 400 });
    const { inst } = gpuRun(config);
    expect(inst.path).toBe("gpu");
    const flock = flockOf(config);
    inst.step();
    flockStep(flock, paramsOf(config.values));
    const d = difference(inst.__debug.readState(), flock);
    expect(d.vel, `velocity difference ${d.vel}`).toBeLessThan(1e-4);
    expect(d.pos, `position difference ${d.pos}`).toBeLessThan(1e-4);
  });

  test.each([[10], [64], [65], [300], [2000]])("%i boids", (count) => {
    const config = configFor(module, "flock", 3, { count });
    const { inst } = gpuRun(config);
    const flock = flockOf(config);
    inst.step();
    flockStep(flock, paramsOf(config.values));
    const d = difference(inst.__debug.readState(), flock);
    expect(d.vel, `velocity difference ${d.vel}`).toBeLessThan(1e-4);
    expect(d.pos).toBeLessThan(1e-4);
  }, 120000);

  test.each([1, 2, 3, 4, 5])("seed %i, the first five steps stay within 1e-3", (seed) => {
    const config = configFor(module, "school", seed, { count: 300 });
    const { inst } = gpuRun(config);
    const flock = flockOf(config);
    for (let s = 0; s < 5; s++) {
      inst.step();
      flockStep(flock, paramsOf(config.values));
    }
    const d = difference(inst.__debug.readState(), flock);
    expect(d.vel, `velocity difference ${d.vel}`).toBeLessThan(1e-3);
    expect(d.pos, `position difference ${d.pos}`).toBeLessThan(1e-3);
  });

  test("the start is the kernel's flock for the same seed", () => {
    const config = configFor(module, "flock", 21, { count: 200 });
    const d = difference(gpuRun(config).inst.__debug.readState(), flockOf(config));
    expect(d.vel).toBeLessThan(1e-9);
    expect(d.pos).toBeLessThan(1e-7);
  });

  test("the extremes of the rules: a huge view radius, no view at all, and the highest speed", () => {
    for (const extra of [{ radius: 150 }, { radius: 10 }, { maxSpeed: 8 }, { separation: 3, alignment: 3, cohesion: 3 }, { separation: 0, alignment: 0, cohesion: 0 }]) {
      const config = configFor(module, "flock", 9, { count: 250, ...extra });
      const { inst } = gpuRun(config);
      const flock = flockOf(config);
      inst.step();
      flockStep(flock, paramsOf(config.values));
      const d = difference(inst.__debug.readState(), flock);
      expect(d.vel, `${JSON.stringify(extra)}: velocity difference ${d.vel}`).toBeLessThan(1e-4);
    }
  });
});

describe("the pointer", () => {
  const at = (canvas, x, y) => {
    const b = fitAspect(canvas.width, canvas.height, ASPECT);
    return { x: b.x + x * b.h, y: b.y + y * b.h };
  };

  test.each([
    ["attracts", { pointerMode: "attract" }, false, 1],
    ["repels", { pointerMode: "repel" }, false, -3],
    ["repels while Shift is held", { pointerMode: "attract" }, true, -3],
  ])("it %s", (_name, extra, shift, strength) => {
    const config = configFor(module, "flock", 5, { count: 300, ...extra });
    const { inst, canvas } = gpuRun(config);
    const flock = flockOf(config);
    inst.pointer({ type: "move", shiftKey: shift, ...at(canvas, 0.7, 0.4) });
    inst.step();
    flockStep(flock, paramsOf(config.values, { x: 0.7, y: 0.4, strength }));
    const d = difference(inst.__debug.readState(), flock);
    expect(d.vel, `velocity difference ${d.vel}`).toBeLessThan(1e-4);
  });

  test("leaving the canvas, and the mode Off, remove the pull", () => {
    const config = configFor(module, "flock", 5, { count: 300 });
    const { inst, canvas } = gpuRun(config);
    const flock = flockOf(config);
    inst.pointer({ type: "move", ...at(canvas, 0.7, 0.4) });
    inst.pointer({ type: "leave" });
    inst.step();
    flockStep(flock, paramsOf(config.values));
    expect(difference(inst.__debug.readState(), flock).vel).toBeLessThan(1e-4);

    const off = configFor(module, "flock", 5, { count: 300, pointerMode: "off" });
    const b = gpuRun(off);
    const f2 = flockOf(off);
    b.inst.pointer({ type: "move", ...at(b.canvas, 0.7, 0.4) });
    b.inst.step();
    flockStep(f2, paramsOf(off.values));
    expect(difference(b.inst.__debug.readState(), f2).vel).toBeLessThan(1e-4);
  });
});

describe("after 200 steps it is the same kind of picture", () => {
  test.each(PRESETS)("preset %s: imageDiff at most 12, and the flock as aligned as the processor's within 0.1", (preset) => {
    const config = configFor(module, preset, 4, { count: 300 });
    const g = gpuRun(config, { steps: 200 });
    const p = processorRun(config, { steps: 200 });
    const diff = imageDiff(g.canvas, p.canvas);
    const og = order(g.inst.__debug.readState().vel, 300);
    // The processor instance does not expose its flock; its order is measured on the kernel run from the same start.
    const flock = flockOf(config);
    for (let s = 0; s < 200; s++) flockStep(flock, paramsOf(config.values));
    const op = order(flock.vel, 300);
    expect(diff, `imageDiff ${diff.toFixed(2)}`).toBeLessThanOrEqual(12);
    expect(Math.abs(og - op), `order parameter: gpu ${og.toFixed(3)}, kernel ${op.toFixed(3)}`).toBeLessThanOrEqual(0.1);
  }, 120000);
});

describe("the flock is drawn", () => {
  test("each boid is a triangle at its place, in the colour of its heading", () => {
    const config = configFor(module, "flock", 2, { count: 40 });
    const { inst, canvas, handle } = gpuRun(config, { steps: 3 });
    inst.render();
    const px = inst.__debug.gpu.readback({ w: canvas.width, h: canvas.height, fbo: null }, new Uint8Array(canvas.width * canvas.height * 4));
    const state = inst.__debug.readState();
    const b = fitAspect(canvas.width, canvas.height, ASPECT);
    const lut = handle.ctx.palette("viridis");
    const size = Math.max(3, b.h * 0.008);
    let found = 0;
    for (let i = 0; i < 40; i++) {
      const a = Math.atan2(state.vel[i * 2 + 1], state.vel[i * 2]);
      // The centre of the triangle: a third of the way from the back edge to the tip, roughly its middle.
      const cx = b.x + state.pos[i * 2] * b.h + Math.cos(a) * size * 0.4;
      const cy = b.y + state.pos[i * 2 + 1] * b.h + Math.sin(a) * size * 0.4;
      const x = Math.round(cx);
      const y = Math.round(cy);
      if (x < 0 || y < 0 || x >= canvas.width || y >= canvas.height) continue;
      const o = ((canvas.height - 1 - y) * canvas.width + x) * 4;
      const got = [px[o], px[o + 1], px[o + 2]];
      const k = Math.round(((a + Math.PI) / (2 * Math.PI)) * 255) * 3;
      const want = [lut[k], lut[k + 1], lut[k + 2]];
      // Boids can overlap, so only count the ones whose centre shows their own colour.
      if (got.every((c, j) => Math.abs(c - want[j]) <= 1)) found++;
    }
    expect(found, "boids whose own colour is at their centre").toBeGreaterThanOrEqual(30);
    // And nothing is drawn far from every boid: the corner of the canvas is the background.
    expect([px[0], px[1], px[2]]).toEqual([15, 15, 18]);
  });
});

describe("the triangle's shape", () => {
  test("it points along the velocity: filled ahead and inside, empty well behind", () => {
    const config = configFor(module, "flock", 2, { count: 12 });
    const { inst, canvas, handle } = gpuRun(config, { steps: 3, size: [800, 600] });
    inst.render();
    const px = inst.__debug.gpu.readback({ w: 800, h: 600, fbo: null }, new Uint8Array(800 * 600 * 4));
    const state = inst.__debug.readState();
    const b = fitAspect(canvas.width, canvas.height, ASPECT);
    const size = Math.max(3, b.h * 0.008); // 4.8 px: the tip is 7.7 px ahead of the centre, the back edge 3.8 px behind
    const lut = handle.ctx.palette("viridis");
    const at = (x, y) => {
      const o = ((600 - 1 - Math.round(y)) * 800 + Math.round(x)) * 4;
      return [px[o], px[o + 1], px[o + 2]];
    };
    let checked = 0;
    const areas = [];
    for (let i = 0; i < 12; i++) {
      const a = Math.atan2(state.vel[i * 2 + 1], state.vel[i * 2]);
      const k = Math.round(((a + Math.PI) / (2 * Math.PI)) * 255) * 3;
      const own = [lut[k], lut[k + 1], lut[k + 2]];
      const cx = b.x + state.pos[i * 2] * b.h;
      const cy = b.y + state.pos[i * 2 + 1] * b.h;
      const along = (d) => at(cx + Math.cos(a) * size * d, cy + Math.sin(a) * size * d);
      // Skip a boid whose neighbourhood is crowded by another one.
      const crowded = [...Array(12).keys()].some((j) => j !== i && Math.hypot((state.pos[j * 2] - state.pos[i * 2]) * b.h, (state.pos[j * 2 + 1] - state.pos[i * 2 + 1]) * b.h) < 25);
      const nearEdge = cx < 24 || cx > 800 - 24 || cy < 24 || cy > 600 - 24; // a probe or the area window would leave the canvas
      if (crowded || nearEdge) continue;
      checked++;
      // The triangle is 2.4 sizes long (tip 1.6 ahead of the position, back edge 0.8 behind) and 1.2 wide at the back.
      expect(along(0.5), `boid ${i}: ahead of the position, where the triangle is still wide enough to hit`).toEqual(own);
      expect(along(-0.4), `boid ${i}: behind the position, inside the back edge`).toEqual(own);
      expect(along(-1.6), `boid ${i}: well behind the back edge`).toEqual([15, 15, 18]);
      expect(along(2.2), `boid ${i}: beyond the tip`).toEqual([15, 15, 18]);
      // Its area: 0.5 * 1.2 * 2.4 = 1.44 size^2 = 33 pixels at this size.
      let area = 0;
      for (let y = Math.round(cy) - 12; y <= Math.round(cy) + 12; y++) {
        for (let x = Math.round(cx) - 12; x <= Math.round(cx) + 12; x++) {
          const o = ((600 - 1 - y) * 800 + x) * 4;
          if (px[o] === own[0] && px[o + 1] === own[1] && px[o + 2] === own[2]) area++;
        }
      }
      areas.push(area); // one triangle varies by a few pixels with where it falls on the pixel grid, so the mean is checked below
    }
    expect(checked, "enough boids were clear of each other to check").toBeGreaterThanOrEqual(6);
    const mean = areas.reduce((x, y) => x + y, 0) / areas.length;
    expect(mean, `mean filled pixels per boid: ${areas.join(", ")}`).toBeGreaterThanOrEqual(30);
    expect(mean).toBeLessThanOrEqual(36);
  });
});

describe("changing a setting", () => {
  test("a different count starts a new flock of that size; a palette change keeps the flock", () => {
    const config = configFor(module, "flock", 6, { count: 100 });
    const { inst } = gpuRun(config, { steps: 5 });
    const before = inst.__debug.readState();
    inst.update({ ...config, values: { ...config.values, palette: "magma" } }, ["palette"]);
    expect([...inst.__debug.readState().pos]).toEqual([...before.pos]);
    inst.update({ ...config, values: { ...config.values, count: 250 } }, ["count"]);
    expect(inst.__debug.readState().count).toBe(250);
  });

  test("the rules take effect on the next step without restarting", () => {
    const config = configFor(module, "flock", 6, { count: 200 });
    const { inst } = gpuRun(config);
    const flock = flockOf(config);
    for (let s = 0; s < 4; s++) {
      inst.step();
      flockStep(flock, paramsOf(config.values));
    }
    const next = { ...config, values: { ...config.values, alignment: 2.5, cohesion: 0.2 } };
    inst.update(next, ["alignment", "cohesion"]);
    inst.step();
    flockStep(flock, paramsOf(next.values));
    expect(difference(inst.__debug.readState(), flock).vel).toBeLessThan(1e-3);
  });
});

describe("leaving and losing the context", () => {
  test("opening and leaving 30 times works every time", () => {
    for (let i = 0; i < 30; i++) {
      const r = runGpu(module, configFor(module, "flock", 1, { count: 50 }), { steps: 1 });
      expect(r.inst.path, `open #${i + 1}`).toBe("gpu");
      finish(r);
    }
  });

  test("a lost context that comes back restarts from the opening flock with a notice", async () => {
    const notices = [];
    const config = configFor(module, "flock", 6, { count: 120 });
    const { inst, canvas } = gpuRun(config, { ctxOptions: { onNotice: (n) => notices.push(n) } });
    for (let s = 0; s < 10; s++) inst.step();
    await lose(canvas, inst.__debug.gpu.gl);
    await new Promise((r) => setTimeout(r, 30));
    expect(() => {
      inst.step();
      inst.render();
    }).not.toThrow();
    await restore(canvas);
    await new Promise((r) => setTimeout(r, 50));
    expect(notices.some((n) => /graphics card was reset/i.test(n))).toBe(true);
    const flock = flockOf(config);
    expect(difference(inst.__debug.readState(), flock).vel).toBeLessThan(1e-9);
    inst.step();
    flockStep(flock, paramsOf(config.values));
    expect(difference(inst.__debug.readState(), flock).vel).toBeLessThan(1e-4);
  });
});
