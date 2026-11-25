// SC-016 / FR-035: the GPU Game of Life matches the existing kernel (lifeStep) exactly, step for step.
// The oracle is the processor code itself: the same settings and seed run through it and through the shader.
import { afterEach, describe, expect, test } from "vitest";
import life from "../../studio/visualizations/life/index.js";
import { withSweep } from "../../studio/core/sweep.js";
import { defaultsOf, applyPreset, validateConfig } from "../../studio/core/knobs.js";
import { createModuleContext } from "../../studio/core/moduleContext.js";
import { createRng } from "../../studio/core/rng.js";
import { parseRule, lifeStep, randomGrid, aliveCells } from "../../studio/visualizations/life/kernel.js";

const module = withSweep(life);
let live = [];
afterEach(() => {
  live.forEach(({ inst, handle }) => {
    inst.destroy();
    handle.dispose();
  });
  live = [];
});

const STEPS = 1000;
const SEEDS = [1, 2, 3, 4, 5];

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

/** The grid the kernel starts from, built the way the processor path builds it. */
function oracleStart(cfg) {
  const W = cfg.values.size;
  const H = Math.round(W * 0.75);
  if (cfg.input?.cells) {
    const g = new Uint8Array(W * H);
    for (const [x, y] of cfg.input.cells) if (x >= 0 && y >= 0 && x < W && y < H) g[y * W + x] = 1;
    return { grid: g, W, H };
  }
  return { grid: randomGrid(W, H, cfg.values.density, createRng(cfg.seed)), W, H };
}

const same = (a, b) => {
  if (a.length !== b.length) return false;
  for (let i = 0; i < a.length; i++) if (a[i] !== b[i]) return false;
  return true;
};
const firstDifference = (a, b, W) => {
  for (let i = 0; i < a.length; i++) if (a[i] !== b[i]) return `cell (${i % W}, ${Math.floor(i / W)}): gpu ${a[i]}, kernel ${b[i]}`;
  return "none";
};

describe("the GPU grid equals the kernel's, every step", () => {
  for (const preset of module.presets.filter((p) => p.id !== "sweep").map((p) => p.id)) {
    test.each(SEEDS)(`preset "${preset}", seed %i: ${STEPS} steps`, (seed) => {
      const cfg = configFor(preset, seed);
      const { inst } = startGpu(cfg);
      expect(inst.path).toBe("gpu");
      let { grid, W, H } = oracleStart(cfg);
      let next = new Uint8Array(W * H);
      const rule = parseRule(cfg.values.rule);
      expect(same(inst.__debug.readState(), grid), "the starting grid").toBe(true);
      for (let step = 1; step <= STEPS; step++) {
        inst.step();
        lifeStep(grid, next, W, H, rule, cfg.values.wrap);
        [grid, next] = [next, grid];
        // Every step for the first 40, then every 20th: once a cell is wrong it never comes back right.
        if (step <= 40 || step % 20 === 0 || step === STEPS) {
          const got = inst.__debug.readState();
          expect(same(got, grid), `step ${step}: ${firstDifference(got, grid, W)}`).toBe(true);
        }
      }
    }, 120000);
  }
});

describe("the settings that change the rule or the shape of the grid", () => {
  test.each([
    ["wrap on", { wrap: true }],
    ["wrap off (the edge is dead)", { wrap: false }],
    ["a tiny grid", { size: 32 }],
    ["the widest grid", { size: 512 }],
    ["an empty start", { density: 0 }],
    ["a full start", { density: 1 }],
    ["a custom rule B2/S", { rule: "B2/S" }],
    ["a rule with every count (B012345678/S012345678)", { rule: "B012345678/S012345678" }],
  ])("%s", (_name, extra) => {
    const cfg = configFor("conway", 7, extra);
    const { inst } = startGpu(cfg);
    let { grid, W, H } = oracleStart(cfg);
    let next = new Uint8Array(W * H);
    const rule = parseRule(cfg.values.rule);
    for (let step = 1; step <= 60; step++) {
      inst.step();
      lifeStep(grid, next, W, H, rule, cfg.values.wrap);
      [grid, next] = [next, grid];
      expect(same(inst.__debug.readState(), grid), `step ${step}`).toBe(true);
    }
  }, 60000);

  test("changing the rule while running applies from the next step and keeps the grid", () => {
    const cfg = configFor("conway", 3);
    const { inst } = startGpu(cfg);
    let { grid, W, H } = oracleStart(cfg);
    let next = new Uint8Array(W * H);
    let rule = parseRule("B3/S23");
    for (let i = 0; i < 20; i++) {
      inst.step();
      lifeStep(grid, next, W, H, rule, true);
      [grid, next] = [next, grid];
    }
    inst.update({ ...cfg, values: { ...cfg.values, rule: "B36/S23" } }, ["rule"]);
    rule = parseRule("B36/S23");
    expect(same(inst.__debug.readState(), grid), "unchanged by the change itself").toBe(true);
    for (let i = 0; i < 30; i++) {
      inst.step();
      lifeStep(grid, next, W, H, rule, true);
      [grid, next] = [next, grid];
    }
    expect(same(inst.__debug.readState(), grid)).toBe(true);
  });

  test("a grid of another size starts a new run and still matches", () => {
    const cfg = configFor("conway", 4);
    const { inst } = startGpu(cfg);
    const bigger = { ...cfg, values: { ...cfg.values, size: 90 } };
    inst.update(bigger, ["size"]);
    // The processor path draws a new random grid from the running ctx.rng after a restart, so the oracle
    // for this case is the grid the instance itself starts from.
    let grid = inst.__debug.readState();
    const W = 90;
    const H = Math.round(W * 0.75);
    expect(grid.length).toBe(W * H);
    let next = new Uint8Array(W * H);
    for (let step = 1; step <= 40; step++) {
      inst.step();
      lifeStep(grid, next, W, H, parseRule("B3/S23"), true);
      [grid, next] = [next, grid];
    }
    expect(same(inst.__debug.readState(), grid)).toBe(true);
  });
});

describe("the same seed always gives the same start, and Restart returns to a start", () => {
  test("two opens with the same seed start identically; another seed starts differently", () => {
    const a = startGpu(configFor("conway", 11)).inst.__debug.readState();
    const b = startGpu(configFor("conway", 11)).inst.__debug.readState();
    const c = startGpu(configFor("conway", 12)).inst.__debug.readState();
    expect(same(a, b)).toBe(true);
    expect(same(a, c)).toBe(false);
  });

  test("the start equals the processor path's start for the same seed", () => {
    const cfg = configFor("conway", 21);
    expect(same(startGpu(cfg).inst.__debug.readState(), oracleStart(cfg).grid)).toBe(true);
  });
});

describe("drawing on the grid", () => {
  /** A pointer event at the centre of a cell, in canvas pixels, for a 320 x 240 canvas showing a W x H grid. */
  const at = (cfg, x, y) => {
    const W = cfg.values.size;
    const H = Math.round(W * 0.75);
    return { x: ((x + 0.5) / W) * 320, y: ((y + 0.5) / H) * 240 };
  };

  test("painting cells and lifting the pointer reports exactly those live cells (the saved drawing)", () => {
    const cfg = configFor("conway", 5, { density: 0, size: 32 });
    let reported = null;
    const { inst } = startGpu(cfg, { onInput: (i) => (reported = i) });
    const press = (type, x, y) => inst.pointer({ type, button: 0, ...at(cfg, x, y) });
    press("down", 3, 4);
    press("move", 4, 4);
    press("move", 5, 4);
    press("move", 5, 5);
    press("up", 5, 5);
    const grid = inst.__debug.readState();
    expect(aliveCells(grid, 32)).toEqual([[3, 4], [4, 4], [5, 4], [5, 5]].sort((a, b) => a[1] * 32 + a[0] - (b[1] * 32 + b[0])));
    expect(reported.cells).toEqual(aliveCells(grid, 32));
  });

  test("pressing on a live cell erases, and dragging keeps erasing", () => {
    const cfg = configFor("conway", 5, { density: 0, size: 32 });
    const { inst } = startGpu(cfg);
    const press = (type, x, y) => inst.pointer({ type, button: 0, ...at(cfg, x, y) });
    for (const x of [2, 3, 4]) {
      press("down", x, 2);
      press("up", x, 2);
    }
    expect(aliveCells(inst.__debug.readState(), 32)).toHaveLength(3);
    press("down", 2, 2);
    press("move", 3, 2);
    press("up", 3, 2);
    expect(aliveCells(inst.__debug.readState(), 32)).toEqual([[4, 2]]);
  });

  test("the key C clears the grid and reports the empty drawing", () => {
    const cfg = configFor("conway", 5, { size: 32 });
    let reported = null;
    const { inst } = startGpu(cfg, { onInput: (i) => (reported = i) });
    expect(aliveCells(inst.__debug.readState(), 32).length).toBeGreaterThan(0);
    expect(inst.pointer({ type: "key", key: "c" })).toBe(true);
    expect(aliveCells(inst.__debug.readState(), 32)).toEqual([]);
    expect(reported.cells).toEqual([]);
  });

  test("a click outside the grid does nothing", () => {
    const cfg = configFor("conway", 5, { density: 0, size: 32 });
    const { inst } = startGpu(cfg);
    inst.pointer({ type: "down", button: 0, x: -50, y: -50 });
    inst.pointer({ type: "up", button: 0, x: -50, y: -50 });
    expect(aliveCells(inst.__debug.readState(), 32)).toEqual([]);
  });
});

describe("what is drawn", () => {
  test("live and dead cells are drawn in the processor path's colors, inside a letterboxed box", () => {
    const cfg = configFor("conway", 9, { size: 40 });
    const { inst, canvas } = startGpu(cfg);
    inst.render();
    const px = inst.__debug.gpu.readback({ w: canvas.width, h: canvas.height, fbo: null }, new Uint8Array(canvas.width * canvas.height * 4));
    const at = (x, y) => [...px.slice((y * canvas.width + x) * 4, (y * canvas.width + x) * 4 + 3)];
    // Canvas row 0 is the TOP of the picture; the read is bottom-up, so flip.
    const topLeft = (x, y) => at(x, canvas.height - 1 - y);
    // The canvas is 4:3 like the grid, so the box fills it: every pixel is a live or a dead cell.
    const seen = new Set();
    for (let y = 0; y < canvas.height; y += 3) for (let x = 0; x < canvas.width; x += 3) seen.add(topLeft(x, y).join(","));
    expect(seen.size).toBeLessThanOrEqual(3); // background-ish dead color, and the live color
    expect(seen.has("23,23,28")).toBe(true); // a dead cell: the background plus (8, 8, 10)
  });
});

describe("leaving and losing the context", () => {
  test("opening and leaving 30 times works every time", () => {
    for (let i = 0; i < 30; i++) {
      const { inst, handle } = startGpu(configFor("conway", 1, { size: 32 }));
      expect(inst.path, `open #${i + 1}`).toBe("gpu");
      inst.step();
      inst.render();
      inst.destroy();
      handle.dispose();
      live.pop();
    }
  });

  test("a lost context that comes back restarts from the opening grid with a notice", async () => {
    const notices = [];
    const cfg = configFor("conway", 6, { size: 32 });
    const { inst, canvas } = startGpu(cfg, { onNotice: (n) => notices.push(n) });
    for (let i = 0; i < 10; i++) inst.step();
    const ext = inst.__debug.gpu.gl.getExtension("WEBGL_lose_context");
    const lost = new Promise((r) => canvas.addEventListener("webglcontextlost", r, { once: true }));
    ext.loseContext();
    await lost;
    await new Promise((r) => setTimeout(r, 30));
    const restored = new Promise((r) => canvas.addEventListener("webglcontextrestored", r, { once: true }));
    ext.restoreContext();
    await restored;
    await new Promise((r) => setTimeout(r, 50));
    expect(notices.some((n) => /graphics card was reset/i.test(n))).toBe(true);
    expect(same(inst.__debug.readState(), oracleStart(cfg).grid)).toBe(true);
  });
});
