// SC-016 / FR-035: the GPU elementary cellular automaton makes exactly the rows elementaryStep() makes.
import { afterEach, describe, expect, test } from "vitest";
import elementary from "../../studio/visualizations/elementaryCA/index.js";
import { withSweep } from "../../studio/core/sweep.js";
import { defaultsOf, applyPreset, validateConfig } from "../../studio/core/knobs.js";
import { createModuleContext } from "../../studio/core/moduleContext.js";
import { createRng } from "../../studio/core/rng.js";
import { ruleTable, elementaryStep } from "../../studio/visualizations/elementaryCA/kernel.js";

const module = withSweep(elementary);
let live = [];
afterEach(() => {
  live.forEach(({ inst, handle }) => {
    inst.destroy();
    handle.dispose();
  });
  live = [];
});

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

/** What the processor path does, kept as a small model: the rows on screen, oldest first. */
function oracle(cfg) {
  const W = cfg.values.width;
  const H = Math.round(W * 0.75);
  const table = ruleTable(cfg.values.rule);
  const rng = createRng(cfg.seed);
  const first = new Uint8Array(W);
  if (cfg.values.start === "single") first[Math.floor(W / 2)] = 1;
  else for (let i = 0; i < W; i++) first[i] = rng() < cfg.values.density ? 1 : 0;
  const rows = [first];
  return {
    W,
    H,
    rows,
    step() {
      const next = new Uint8Array(W);
      elementaryStep(rows[rows.length - 1], next, table, true);
      rows.push(next);
      if (rows.length > H) rows.shift();
    },
  };
}

const rowsEqual = (a, b) => a.length === b.length && a.every((r, i) => r.every((v, x) => v === b[i][x]));
const firstDifference = (a, b) => {
  if (a.length !== b.length) return `${a.length} rows, kernel ${b.length}`;
  for (let i = 0; i < a.length; i++) for (let x = 0; x < a[i].length; x++) if (a[i][x] !== b[i][x]) return `row ${i}, cell ${x}: gpu ${a[i][x]}, kernel ${b[i][x]}`;
  return "none";
};

describe("the GPU rows equal the kernel's, past the point where the screen is full", () => {
  for (const preset of module.presets.filter((p) => p.id !== "sweep").map((p) => p.id)) {
    test.each(SEEDS)(`preset "${preset}", seed %i, to the end of the run and 150 rows beyond`, (seed) => {
      const cfg = configFor(preset, seed, { width: 96 }); // 72 rows on screen, so the ring wraps twice
      const { inst } = startGpu(cfg);
      expect(inst.path).toBe("gpu");
      const o = oracle(cfg);
      expect(rowsEqual(inst.__debug.readState(), o.rows), "the first row").toBe(true);
      const total = o.H + 150;
      for (let n = 1; n <= total; n++) {
        inst.step();
        o.step();
        if (n <= 12 || n % 17 === 0 || n === o.H - 1 || n === o.H || n === o.H + 1 || n === total) {
          const got = inst.__debug.readState();
          expect(rowsEqual(got, o.rows), `row ${n}: ${firstDifference(got, o.rows)}`).toBe(true);
        }
        // After n steps there are n + 1 rows: the screen is full once there are H of them.
        if (n === o.H - 2) expect(inst.isDone(), "not done a row early").toBe(false);
        if (n === o.H - 1) expect(inst.isDone(), "done when the screen is full").toBe(true);
      }
    }, 120000);
  }
});

describe("rules and sizes", () => {
  // Wrap-around is covered by these: a random row has live cells at both edges.
  const RULES = [0, 1, 18, 22, 30, 45, 54, 73, 90, 105, 110, 126, 150, 184, 204, 255, ...Array.from({ length: 16 }, (_, i) => 7 + i * 16)];
  test.each(RULES)("rule %i matches the kernel for 90 rows", (rule) => {
    const cfg = configFor("r30", 3, { rule, width: 64, start: "random", density: 0.5 });
    const { inst } = startGpu(cfg);
    const o = oracle(cfg);
    for (let n = 1; n <= 90; n++) {
      inst.step();
      o.step();
    }
    expect(rowsEqual(inst.__debug.readState(), o.rows)).toBe(true);
  });

  test.each([
    ["the narrowest width", { width: 64 }],
    ["the widest width", { width: 1024 }],
    ["a width that is not a multiple of anything", { width: 97 }],
    ["an empty random start", { start: "random", density: 0 }],
    ["a full random start", { start: "random", density: 1 }],
  ])("%s", (_name, extra) => {
    const cfg = configFor("r110", 9, extra);
    const { inst } = startGpu(cfg);
    const o = oracle(cfg);
    const total = Math.min(o.H + 20, 200);
    for (let n = 1; n <= total; n++) {
      inst.step();
      o.step();
    }
    expect(rowsEqual(inst.__debug.readState(), o.rows)).toBe(true);
  }, 60000);
});

describe("changing a setting", () => {
  test("changing the rule starts over from the first row with the new rule", () => {
    const cfg = configFor("r30", 4, { width: 80 });
    const { inst } = startGpu(cfg);
    for (let i = 0; i < 20; i++) inst.step();
    const next = { ...cfg, values: { ...cfg.values, rule: 90 } };
    inst.update(next, ["rule"]);
    expect(inst.__debug.readState()).toHaveLength(1);
    const o = oracle(next);
    // The processor path draws from the running rng after a restart; a single-cell start draws nothing, so these agree.
    for (let n = 1; n <= 40; n++) {
      inst.step();
      o.step();
    }
    expect(rowsEqual(inst.__debug.readState(), o.rows)).toBe(true);
  });

  test("changing the width gives a grid of the new width", () => {
    const cfg = configFor("r30", 4, { width: 80 });
    const { inst } = startGpu(cfg);
    inst.update({ ...cfg, values: { ...cfg.values, width: 120 } }, ["width"]);
    const rows = inst.__debug.readState();
    expect(rows).toHaveLength(1);
    expect(rows[0]).toHaveLength(120);
    expect(rows[0][60]).toBe(1);
  });

  test("changing only the palette keeps every row", () => {
    const cfg = configFor("r30", 4, { width: 80 });
    const { inst } = startGpu(cfg);
    for (let i = 0; i < 30; i++) inst.step();
    const before = inst.__debug.readState();
    inst.update({ ...cfg, values: { ...cfg.values, palette: "viridis" } }, ["palette"]);
    expect(rowsEqual(inst.__debug.readState(), before)).toBe(true);
  });
});

describe("the same seed, the same first row", () => {
  test("a random start is the same for the same seed and differs for another", () => {
    const make = (seed) => startGpu(configFor("r110", seed, { width: 200 })).inst.__debug.readState()[0];
    expect([...make(11)]).toEqual([...make(11)]);
    expect([...make(11)]).not.toEqual([...make(12)]);
  });

  test("it equals the processor path's first row", () => {
    const cfg = configFor("r110", 21, { width: 200 });
    expect([...startGpu(cfg).inst.__debug.readState()[0]]).toEqual([...oracle(cfg).rows[0]]);
  });
});

describe("what is drawn", () => {
  test("live cells use the palette color of their screen row, dead cells the background", () => {
    const cfg = configFor("r30", 2, { width: 64 }); // 48 rows; the canvas is 4:3 so the grid fills it
    const { inst, canvas } = startGpu(cfg);
    for (let i = 0; i < 47; i++) inst.step(); // the screen is full
    inst.render();
    const px = inst.__debug.gpu.readback({ w: canvas.width, h: canvas.height, fbo: null }, new Uint8Array(canvas.width * canvas.height * 4));
    const at = (x, y) => [...px.slice(((canvas.height - 1 - y) * canvas.width + x) * 4, ((canvas.height - 1 - y) * canvas.width + x) * 4 + 3)];
    const colors = new Set();
    for (let y = 0; y < canvas.height; y += 2) for (let x = 0; x < canvas.width; x += 2) colors.add(at(x, y).join(","));
    expect(colors.has("15,15,18")).toBe(true); // the background: the studio's BG_RGB
    expect(colors.size).toBeGreaterThan(5); // and many palette colors down the screen
  });
});

describe("the picture shows exactly the kernel's rows, in order", () => {
  /** Every cell on a 320 x 240 canvas showing a 64 x 48 grid is a 5 x 5 block: live where it is not the background. */
  function pictureMatches(inst, canvas, o) {
    inst.render();
    const px = inst.__debug.gpu.readback({ w: canvas.width, h: canvas.height, fbo: null }, new Uint8Array(canvas.width * canvas.height * 4));
    const cell = canvas.width / o.W;
    let wrong = 0;
    let first = "";
    for (let y = 0; y < o.H; y++) {
      for (let x = 0; x < o.W; x++) {
        const cx = Math.floor(x * cell + cell / 2);
        const cy = Math.floor(y * cell + cell / 2);
        const i = ((canvas.height - 1 - cy) * canvas.width + cx) * 4;
        const lit = !(px[i] === 15 && px[i + 1] === 15 && px[i + 2] === 18);
        const want = Boolean(o.rows[y]?.[x]);
        if (lit !== want) {
          wrong++;
          first ||= `screen row ${y}, cell ${x}: drawn ${lit ? "live" : "dead"}, kernel ${want ? "live" : "dead"}`;
        }
      }
    }
    return { wrong, first };
  }

  test.each([[10], [47], [48], [49], [100], [200]])("after %i steps (rows scroll once the screen is full)", (steps) => {
    const cfg = configFor("r110", 5, { width: 64 });
    const { inst, canvas } = startGpu(cfg);
    const o = oracle(cfg);
    for (let n = 0; n < steps; n++) {
      inst.step();
      o.step();
    }
    const { wrong, first } = pictureMatches(inst, canvas, o);
    expect(wrong, first).toBe(0);
  });
});

describe("leaving and losing the context", () => {
  test("opening and leaving 30 times works every time", () => {
    for (let i = 0; i < 30; i++) {
      const { inst, handle } = startGpu(configFor("r90", 1, { width: 64 }));
      expect(inst.path, `open #${i + 1}`).toBe("gpu");
      inst.step();
      inst.render();
      inst.destroy();
      handle.dispose();
      live.pop();
    }
  });

  test("a lost context that comes back restarts from the opening row with a notice", async () => {
    const notices = [];
    const cfg = configFor("r110", 6, { width: 64 });
    const { inst, canvas } = startGpu(cfg, { onNotice: (n) => notices.push(n) });
    for (let i = 0; i < 10; i++) inst.step();
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
    expect(rowsEqual(inst.__debug.readState(), oracle(cfg).rows)).toBe(true);
    const o = oracle(cfg);
    for (let n = 1; n <= 12; n++) {
      inst.step();
      o.step();
    }
    expect(rowsEqual(inst.__debug.readState(), o.rows)).toBe(true);
  });
});
