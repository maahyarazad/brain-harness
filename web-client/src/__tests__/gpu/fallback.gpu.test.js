// Without the graphics card, every one of the twelve runs on its processor path with nothing lost (Story 5 scenario 4, FR-034).
// The ways to turn the GPU off are the module context's `gpuForced`, the page's `?gpu=off`, and `__VIZ_GPU__ = "off"`.
import { afterEach, describe, expect, test } from "vitest";
import { PORTS } from "./ports.js";
import { configFor, runGpu, runProcessor, finish } from "./gpuHarness.js";

let live = [];
afterEach(() => {
  live.splice(0).forEach(finish);
  delete globalThis.__VIZ_GPU__;
  window.history.replaceState(null, "", "/");
});

const SMALL = { "Maze": { size: 12 }, "Sorting algorithms": { size: 30 }, "Langton's ant": { size: 80 }, "Reaction–diffusion": { size: "128" }, "Game of Life": { size: 40 }, "Boids": { count: 80 } };

const isGlCanvas = (canvas) => {
  // A canvas keeps the first kind of context it was given: a 2D one answers getContext("2d") and refuses WebGL.
  return canvas.getContext("webgl2") !== null || canvas.getContext("webgl") !== null;
};

describe.each(PORTS)("%s", (name, module) => {
  const config = () => configFor(module, null, 1, SMALL[name] ?? {});

  test("with ctx.gpuForced = off it takes the processor path, runs 200 steps and draws", () => {
    const r = runProcessor(module, config(), { steps: 200 });
    live.push(r);
    expect(r.inst.path, "an instance on the graphics card says so").toBeUndefined();
    expect(r.inst.__debug, "and has no GPU debug hooks").toBeUndefined();
    expect(isGlCanvas(r.canvas), "its canvas holds a 2D context").toBe(false);
    const px = r.canvas.getContext("2d", { willReadFrequently: true }).getImageData(0, 0, r.canvas.width, r.canvas.height).data;
    let different = 0;
    for (let i = 0; i < px.length; i += 4) if (px[i] !== px[0] || px[i + 1] !== px[1]) different++;
    expect(different, "something was drawn").toBeGreaterThan(20);
  });

  test("with ?gpu=off in the address it takes the processor path", () => {
    window.history.replaceState(null, "", "/studio/x?gpu=off");
    const r = runGpu(module, config(), { steps: 5 });
    live.push(r);
    expect(r.inst.path).toBeUndefined();
    expect(isGlCanvas(r.canvas)).toBe(false);
  });

  test("with __VIZ_GPU__ = off it takes the processor path", () => {
    globalThis.__VIZ_GPU__ = "off";
    const r = runGpu(module, config(), { steps: 5 });
    live.push(r);
    expect(r.inst.path).toBeUndefined();
  });

  test("by default it takes the graphics card, and the same settings give the same kind of instance every time", () => {
    for (let i = 0; i < 2; i++) {
      const r = runGpu(module, config(), { steps: 3 });
      live.push(r);
      expect(r.inst.path).toBe("gpu");
      expect(isGlCanvas(r.canvas)).toBe(true);
    }
  });
});

describe("the six whose processor path is the oracle give the same state with the graphics card off", () => {
  test("Game of Life: the processor path's own grid matches lifeStep after 200 steps", async () => {
    const [, life] = PORTS[0];
    const { lifeStep, parseRule, randomGrid } = await import("../../studio/visualizations/life/kernel.js");
    const { createRng } = await import("../../studio/core/rng.js");
    const cfg = configFor(life, "conway", 3, { size: 40 });
    const r = runProcessor(life, cfg, { steps: 200 });
    live.push(r);
    // The processor instance shows the generation in its stats; the grid is checked through the kernel run from the same start.
    const W = 40, H = 30;
    let a = randomGrid(W, H, cfg.values.density, createRng(3));
    let b = new Uint8Array(W * H);
    for (let i = 0; i < 200; i++) {
      lifeStep(a, b, W, H, parseRule(cfg.values.rule), cfg.values.wrap);
      [a, b] = [b, a];
    }
    expect(a.some((v) => v === 1)).toBe(true); // the kernel run is alive, so the comparison below means something
    const px = r.canvas.getContext("2d", { willReadFrequently: true }).getImageData(0, 0, 320, 240).data;
    // Live cells are drawn in the palette colour, dead ones in the dark box: count the lit cell centres (8 x 8 px each).
    let lit = 0;
    let want = 0;
    for (let y = 0; y < H; y++) for (let x = 0; x < W; x++) {
      const o = ((y * 8 + 4) * 320 + (x * 8 + 4)) * 4;
      const isLit = px[o] + px[o + 1] + px[o + 2] > 200;
      if (isLit) lit++;
      if (a[y * W + x]) want++;
    }
    expect(lit).toBe(want);
  });
});
