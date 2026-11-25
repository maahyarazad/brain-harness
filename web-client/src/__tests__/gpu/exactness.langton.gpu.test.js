// SC-016 / FR-035: the GPU Langton's ant keeps exactly the grid and ants antStep() gives, and draws them.
import { afterEach, describe, expect, test } from "vitest";
import langton from "../../studio/visualizations/langton/index.js";
import { withSweep } from "../../studio/core/sweep.js";
import { defaultsOf, applyPreset, validateConfig } from "../../studio/core/knobs.js";
import { createModuleContext } from "../../studio/core/moduleContext.js";
import { createRng } from "../../studio/core/rng.js";
import { parseTurnRule, antStep } from "../../studio/visualizations/langton/kernel.js";

const module = withSweep(langton);
let live = [];
afterEach(() => {
  live.forEach(({ inst, handle }) => {
    inst.destroy();
    handle.dispose();
  });
  live = [];
});

const SEEDS = [1, 2, 3, 4, 5];
const STEPS = 3000;

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

/** What the processor path does at the start, then antStep. */
function oracle(cfg) {
  const N = cfg.values.size;
  const rng = createRng(cfg.seed);
  const grid = new Uint8Array(N * N);
  const turns = parseTurnRule(cfg.values.rule) ?? [1, -1];
  const ants = [{ x: Math.floor(N / 2), y: Math.floor(N / 2), dir: 0 }];
  for (let i = 1; i < cfg.values.ants; i++) {
    ants.push({ x: Math.floor(N * (0.2 + 0.6 * rng())), y: Math.floor(N * (0.2 + 0.6 * rng())), dir: Math.floor(rng() * 4) });
  }
  return { N, grid, ants, turns, step: () => antStep(grid, N, N, ants, turns) };
}

const gridsEqual = (a, b) => a.length === b.length && a.every((v, i) => v === b[i]);
const antsEqual = (a, b) => a.length === b.length && a.every((x, i) => x.x === b[i].x && x.y === b[i].y && x.dir === b[i].dir);
const firstDifference = (a, b, N) => {
  for (let i = 0; i < a.length; i++) if (a[i] !== b[i]) return `cell (${i % N}, ${Math.floor(i / N)}): gpu ${a[i]}, kernel ${b[i]}`;
  return "none";
};

function expectSame(inst, o, label) {
  const got = inst.__debug.readState();
  expect(gridsEqual(got.grid, o.grid), `${label}: ${firstDifference(got.grid, o.grid, o.N)}`).toBe(true);
  expect(antsEqual(got.ants, o.ants), `${label}: ants`).toBe(true);
}

describe("the GPU grid and ants equal the kernel's", () => {
  for (const preset of module.presets.filter((p) => p.id !== "sweep").map((p) => p.id)) {
    test.each(SEEDS)(`preset "${preset}", seed %i: ${STEPS} steps`, (seed) => {
      const cfg = configFor(preset, seed, { size: 96 });
      const { inst } = startGpu(cfg);
      expect(inst.path).toBe("gpu");
      const o = oracle(cfg);
      expectSame(inst, o, "the start");
      for (let n = 1; n <= STEPS; n++) {
        inst.step();
        o.step();
        // Paint a frame now and then, as the loop does, so rows are uploaded in pieces of every size.
        if (n % 50 === 0 || n % 7 === 0 && n < 100) inst.render();
        if (n <= 12 || n % 250 === 0 || n === STEPS) expectSame(inst, o, `step ${n}`);
      }
    }, 120000);
  }
});

describe("rules, sizes and ants", () => {
  test.each([
    ["the longest rule (12 turns)", { rule: "RLRLLRRLLRLR" }],
    ["the shortest rule", { rule: "LR" }],
    ["all turns the same way", { rule: "RRRR" }],
    ["eight ants", { ants: 8, size: 128 }],
    ["the smallest grid (the ant wraps constantly)", { size: 64, ants: 4 }],
    ["the biggest grid", { size: 512, ants: 3 }],
  ])("%s", (_name, extra) => {
    const cfg = configFor("classic", 8, extra);
    const { inst } = startGpu(cfg);
    const o = oracle(cfg);
    for (let n = 1; n <= 2500; n++) {
      inst.step();
      o.step();
      if (n % 100 === 0) inst.render();
    }
    expectSame(inst, o, "after 2,500 steps");
  }, 60000);

  test("ants that stand on the same cell at the same step still match", () => {
    const cfg = configFor("classic", 8, { ants: 8, size: 64 });
    const { inst } = startGpu(cfg);
    const o = oracle(cfg);
    for (let n = 1; n <= 4000; n++) {
      inst.step();
      o.step();
    }
    expectSame(inst, o, "after 4,000 steps");
  });
});

describe("changing a setting", () => {
  test("a new rule starts over; the old picture is gone", () => {
    const cfg = configFor("classic", 4, { size: 80 });
    const { inst } = startGpu(cfg);
    for (let i = 0; i < 500; i++) inst.step();
    const next = { ...cfg, values: { ...cfg.values, rule: "RLLR" } };
    inst.update(next, ["rule"]);
    const state = inst.__debug.readState();
    expect(state.steps).toBe(0);
    expect(state.grid.every((v) => v === 0)).toBe(true);
    const o = oracle(next);
    for (let n = 1; n <= 600; n++) {
      inst.step();
      o.step();
    }
    expectSame(inst, o, "after the change");
  });

  test("a different size gives a grid of that size", () => {
    const cfg = configFor("classic", 4, { size: 80 });
    const { inst } = startGpu(cfg);
    inst.update({ ...cfg, values: { ...cfg.values, size: 128 } }, ["size"]);
    expect(inst.__debug.readState().grid).toHaveLength(128 * 128);
  });

  test("changing only the palette keeps the grid", () => {
    const cfg = configFor("classic", 4, { size: 80 });
    const { inst } = startGpu(cfg);
    for (let i = 0; i < 700; i++) inst.step();
    const before = inst.__debug.readState().grid;
    inst.update({ ...cfg, values: { ...cfg.values, palette: "viridis" } }, ["palette"]);
    expect(gridsEqual(inst.__debug.readState().grid, before)).toBe(true);
  });

  test("isDone turns true after the sweep's run length", () => {
    const cfg = configFor("classic", 4, { size: 64 });
    const { inst } = startGpu(cfg);
    for (let i = 0; i < 11999; i++) inst.step();
    expect(inst.isDone()).toBe(false);
    inst.step();
    expect(inst.isDone()).toBe(true);
  });
});

describe("the same seed, the same ants", () => {
  test("several ants start where the processor path puts them", () => {
    const cfg = configFor("crowd", 21, { size: 100 });
    const got = startGpu(cfg).inst.__debug.readState().ants;
    expect(antsEqual(got, oracle(cfg).ants)).toBe(true);
    const other = startGpu(configFor("crowd", 22, { size: 100 })).inst.__debug.readState().ants;
    expect(antsEqual(got, other)).toBe(false);
  });
});

describe("the picture shows the kernel's grid and ants", () => {
  /** 80 cells on a 240 x 240 box: every cell is a 3 x 3 block, the box starting at x = 40. */
  function pictureMatches(inst, canvas, handle, cfg, o) {
    inst.render();
    const px = inst.__debug.gpu.readback({ w: canvas.width, h: canvas.height, fbo: null }, new Uint8Array(canvas.width * canvas.height * 4));
    const lut = handle.ctx.palette(cfg.values.palette);
    const n = o.turns.length;
    const antAt = new Set(o.ants.map((a) => a.y * o.N + a.x));
    let wrong = 0;
    let first = "";
    for (let y = 0; y < o.N; y++) {
      for (let x = 0; x < o.N; x++) {
        const s = o.grid[y * o.N + x];
        let want;
        if (antAt.has(y * o.N + x)) want = [255, 60, 60];
        else if (s === 0) want = [15, 15, 18];
        else {
          const k = Math.round(60 + (195 * s) / Math.max(1, n - 1)) * 3;
          want = [lut[k], lut[k + 1], lut[k + 2]];
        }
        const sx = 40 + x * 3 + 1;
        const sy = y * 3 + 1;
        const i = ((canvas.height - 1 - sy) * canvas.width + sx) * 4;
        const got = [px[i], px[i + 1], px[i + 2]];
        if (got.some((v, j) => Math.abs(v - want[j]) > 1)) {
          wrong++;
          first ||= `cell (${x}, ${y}) state ${s}: drawn ${got}, expected ${want}`;
        }
      }
    }
    return { wrong, first };
  }

  test.each([["classic", 1, 4000], ["rllr", 2, 3000], ["crowd", 3, 3000]])("%s after %i... steps", (preset, seed, steps) => {
    const cfg = configFor(preset, seed, { size: 80 });
    const { inst, canvas, handle } = startGpu(cfg);
    const o = oracle(cfg);
    for (let n = 0; n < steps; n++) {
      inst.step();
      o.step();
    }
    const { wrong, first } = pictureMatches(inst, canvas, handle, cfg, o);
    expect(wrong, first).toBe(0);
  });
});

describe("leaving and losing the context", () => {
  test("opening and leaving 30 times works every time", () => {
    for (let i = 0; i < 30; i++) {
      const { inst, handle } = startGpu(configFor("classic", 1, { size: 64 }));
      expect(inst.path, `open #${i + 1}`).toBe("gpu");
      inst.step();
      inst.render();
      inst.destroy();
      handle.dispose();
      live.pop();
    }
  });

  test("a lost context that comes back restarts from the opening position with a notice", async () => {
    const notices = [];
    const cfg = configFor("crowd", 6, { size: 80 });
    const { inst, canvas } = startGpu(cfg, { onNotice: (n) => notices.push(n) });
    for (let i = 0; i < 500; i++) inst.step();
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
    expectSame(inst, o, "the opening position");
    for (let n = 1; n <= 300; n++) {
      inst.step();
      o.step();
    }
    expectSame(inst, o, "300 steps after the restart");
  });
});
